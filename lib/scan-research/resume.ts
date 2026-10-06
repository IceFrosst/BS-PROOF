"use client";

/*
 * THE RELOAD CHECKPOINT: what a browser tab keeps so that reloading /scan puts the
 * scan the person was looking at -- and its live research -- back on the screen.
 *
 * It is an OPAQUE POINTER, never content. In `sessionStorage` (this tab only, gone
 * when the tab closes, never sent anywhere) it holds exactly four things:
 *
 *     { v: 1, owner: <the signed-in user's id>, scan: <the saved scan's id>, intent: "fresh" | "saved" }
 *
 * and NOTHING else: no access or refresh token, no JWT, no email, no photo, no
 * label text, no analysis, no research job or result, no model output, no patient
 * or serving facts. Everything shown after a reload is read again from the server
 * with the person's own bearer token (GET /api/scan/history/<scan>, then the
 * read-only GET /api/scan/research?scan_id=<scan>), so this record cannot grant
 * access to anything: another owner, a lost or edited value, or a scan that is gone
 * all get the server's same uniform 404 and the checkpoint is thrown away.
 *
 *   owner   binds the pointer to ONE account. A different (or no longer signed-in) user
 *           never uses it; the first different user to look at it deletes it.
 *   scan    the saved scan the Scan tab was showing (a UUID; checked before use).
 *   intent  "fresh": this person's own new scan whose research request may not have
 *                    got through before the page went away. Only this lets a restored
 *                    scan ask for research ONCE, and only when the server has no job
 *                    for it (the request is idempotent per scan).
 *           "saved": the scan's research job is known to exist (or the request got
 *                    through). A restored view only READS it; it never asks again.
 *           Merely opening a scan from History writes NO checkpoint, so a History view
 *           can never start research after a reload.
 *
 * Every storage access is guarded: private mode, a disabled or full storage and a
 * hostile value all end as "no checkpoint" (the normal landing screen), never as an
 * error and never as a request.
 */
import { isResearchId } from "./client";

export const RESUME_STORAGE_KEY = "bsproof.scan.resume";
export type ResumeIntent = "fresh" | "saved";
export interface ResumeCheckpoint {
  owner: string;
  scan: string;
  intent: ResumeIntent;
}

/** The record is four short fields; anything much longer is not ours. */
const MAX_BYTES = 256;

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
  const keys = Object.keys(record).sort().join(",");
  if (keys !== "intent,owner,scan,v" || record.v !== 1) return null;
  if (!isResearchId(record.owner) || !isResearchId(record.scan)) return null;
  if (record.intent !== "fresh" && record.intent !== "saved") return null;
  return { owner: record.owner.toLowerCase(), scan: record.scan.toLowerCase(), intent: record.intent };
}

/** Write the pointer. False (and nothing stored) when the ids are not ids or the storage refuses: the feature then simply is off. */
export function writeResumeCheckpoint(checkpoint: ResumeCheckpoint): boolean {
  const area = store();
  if (!area || !isResearchId(checkpoint.owner) || !isResearchId(checkpoint.scan) || (checkpoint.intent !== "fresh" && checkpoint.intent !== "saved")) return false;
  try {
    area.setItem(RESUME_STORAGE_KEY, JSON.stringify({ v: 1, owner: checkpoint.owner.toLowerCase(), scan: checkpoint.scan.toLowerCase(), intent: checkpoint.intent }));
    return true;
  } catch {
    return false;
  }
}

/**
 * A fresh scan was just saved for `owner`: remember it, unless a checkpoint for this very (owner, scan) exists
 * already (it may already say "saved"; a repeated render must never turn that back into "fresh").
 */
export function noteFreshScan(owner: string, scan: string): boolean {
  const have = readResumeCheckpoint();
  if (have && have.owner === owner.toLowerCase() && have.scan === scan.toLowerCase()) return true;
  return writeResumeCheckpoint({ owner, scan, intent: "fresh" });
}

/** The scan's research job is known to exist: from here on a reload only READS it. */
export function noteJobKnown(owner: string, scan: string): boolean {
  const have = readResumeCheckpoint();
  if (have && have.owner === owner.toLowerCase() && have.scan === scan.toLowerCase() && have.intent === "saved") return true;
  return writeResumeCheckpoint({ owner, scan, intent: "saved" });
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
