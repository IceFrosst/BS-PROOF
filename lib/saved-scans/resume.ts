"use client";

/*
 * THE RELOAD CHECKPOINT: what a browser tab keeps so that reloading /scan puts the
 * saved scan the person was looking at back on the screen.
 *
 * It is an OPAQUE POINTER, never content. In `sessionStorage` (this tab only, gone
 * when the tab closes, never sent anywhere) it holds exactly three things:
 *
 *     { v: 2, owner: <the signed-in user's id>, scan: <the saved scan's id> }
 *
 * and NOTHING else: no token, no email, no photo, no label text, no analysis.
 * Everything shown after a reload is read again from the server with the person's
 * own bearer token (GET /api/scan/history/<scan>), so this record cannot grant
 * access to anything: another owner, a lost or edited value, or a scan that is gone
 * all get the server's same uniform 404 and the checkpoint is thrown away.
 *
 * Merely opening a scan from History writes no checkpoint. Version 1 (2026-10)
 * also carried a live-research "intent"; live research was removed (2026-11), and a
 * v1 value is not ours any more, so it is deleted on read.
 *
 * Every storage access is guarded: private mode, a disabled or full storage and a
 * hostile value all end as "no checkpoint" (the normal landing screen), never as an
 * error and never as a request.
 */

export const RESUME_STORAGE_KEY = "bsproof.scan.resume";
export interface ResumeCheckpoint {
  owner: string;
  scan: string;
}

/** The record is three short fields; anything much longer is not ours. */
const MAX_BYTES = 256;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : (window.sessionStorage ?? null);
  } catch {
    return null;
  }
}

/** The checkpoint, or null. A malformed, foreign or oversized value is deleted, not interpreted. */
export function readResumeCheckpoint(): ResumeCheckpoint | null {
  const area = store();
  if (!area) return null;
  let raw: string | null;
  try {
    raw = area.getItem(RESUME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parsed = parse(raw);
  if (!parsed) clearResumeCheckpoint();
  return parsed;
}

function parse(raw: string): ResumeCheckpoint | null {
  if (raw.length > MAX_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "owner,scan,v" || record.v !== 2) return null;
  if (!isId(record.owner) || !isId(record.scan)) return null;
  return { owner: record.owner.toLowerCase(), scan: record.scan.toLowerCase() };
}

/** Remember the person's own saved scan (idempotent). False when the ids are not ids or the storage refuses. */
export function noteSavedScan(owner: string, scan: string): boolean {
  const area = store();
  if (!area || !isId(owner) || !isId(scan)) return false;
  try {
    area.setItem(RESUME_STORAGE_KEY, JSON.stringify({ v: 2, owner: owner.toLowerCase(), scan: scan.toLowerCase() }));
    return true;
  } catch {
    return false;
  }
}

export function clearResumeCheckpoint(): void {
  const area = store();
  if (!area) return;
  try {
    area.removeItem(RESUME_STORAGE_KEY);
  } catch {
    /* nothing to do: the next read validates whatever is there */
  }
}
