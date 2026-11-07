/*
 * OWNER-ONLY READ PATH for the durable scan-run history written by
 * lib/scan-history/store.ts. Used by `GET /api/scan/history` (a private list)
 * and `GET /api/scan/history/[id]` (one saved result).
 *
 * THE BOUNDARY THIS MODULE ENFORCES. Every query carries
 * `user_id = <the id Supabase Auth verified for the bearer token>` IN THE
 * QUERY ITSELF (the service role key bypasses RLS, so the application filter
 * IS the access control), and every returned row is re-checked against that id
 * before it is used. The caller supplies no owner, no filter and no cursor. A
 * run that belongs to someone else, has no owner (legacy/anonymous), or does
 * not exist is the same `not_found`.
 *
 * WHAT IT NEVER RETURNS. Only an explicit column allow-list is selected, so
 * the request body, `user_email`, `image_bucket`, `image_path`,
 * `image_sha256`, the storage object, and the write-time `persistence` block
 * never leave the database through here. No signed image URL is ever minted.
 * The list carries metadata only (id, time, source, status, a short product
 * name), never an analysis; the detail carries the saved ScanAnalysis -- only
 * the top-level keys on the explicit allow-list in
 * lib/scan-history/analysis-keys.ts -- with a reconstructed `run_id` and a
 * sanitised `app_version`.
 *
 * IT NEVER RE-RUNS ANYTHING. A saved result is read back verbatim; there is no
 * model call, no pipeline, no scoring here.
 *
 * BOUNDED AND HONEST. The list is the latest 20 (`recent`, deliberately not an
 * exhaustive history); response bodies are size-capped; every failure (not
 * configured, network, timeout, non-2xx, malformed JSON) becomes a reported
 * outcome -- NEVER a thrown error, and never provider text or a secret.
 */
import { isUuid, readBoundedText, supabaseServerConfig, type SupabaseServerConfig } from "@/lib/auth/server-auth";
import { ANALYSIS_KEYS } from "@/lib/scan-history/analysis-keys";

const TABLE = "scan_runs";
const STORE_TIMEOUT_MS = 10_000;

/** The list is the most recent runs only. The UI must say "recent", not "all". */
export const HISTORY_LIST_LIMIT = 20;
const MAX_LIST_BYTES = 256 * 1024;
/** A saved ScanAnalysis is tens of KiB; this is a wall, not an expectation. */
const MAX_DETAIL_BYTES = 2 * 1024 * 1024;
const MAX_PRODUCT_NAME = 120;

export interface ScanRunListItem {
  id: string;
  created_at: string;
  source: "photo" | "manual";
  status: string;
  product_name: string | null;
}

export type ScanRunListOutcome = { status: "ok"; runs: ScanRunListItem[] } | { status: "unavailable" } | { status: "failed" };

export type ScanRunDetailOutcome =
  | { status: "ok"; run_id: string; analysis: Record<string, unknown> }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A short, single-line display name -- or null. Control characters never pass. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, MAX_PRODUCT_NAME) : null;
}

/**
 * One owner-filtered PostgREST GET. `ok: false` carries only whether the
 * deployment is unconfigured; every other failure is just `failed`.
 */
async function fetchRows(
  cfg: SupabaseServerConfig,
  query: URLSearchParams,
  maxBytes: number,
  fetchFn: typeof fetch,
): Promise<{ ok: true; rows: unknown[] } | { ok: false }> {
  try {
    const res = await fetchFn(`${cfg.url}/rest/v1/${TABLE}?${query.toString()}`, {
      method: "GET",
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* nothing more to do */
      }
      return { ok: false };
    }
    const text = await readBoundedText(res, maxBytes);
    if (text === null) return { ok: false };
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? { ok: true, rows: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * The caller's most recent runs, newest first, metadata only. `userId` MUST be
 * the id Supabase Auth verified -- the one argument that decides whose data
 * this is.
 */
export async function listScanRuns(userId: string, fetchFn: typeof fetch = fetch): Promise<ScanRunListOutcome> {
  const cfg = supabaseServerConfig();
  if (!cfg) return { status: "unavailable" };
  if (!isUuid(userId)) return { status: "failed" };
  const owner = userId.toLowerCase();

  const query = new URLSearchParams({
    // Unaliased JSON paths come back keyed by their last segment
    // (`product_name`, `ingredient_label`, `ingredient`). `user_id` is selected
    // only to re-verify ownership below; it is never returned.
    select: "id,user_id,created_at,source,status,analysis->label->>product_name,analysis->input->>ingredient_label,analysis->product->>ingredient",
    user_id: `eq.${owner}`,
    // A row with no saved analysis could not be opened, so it is not listed.
    analysis: "not.is.null",
    order: "created_at.desc,id.desc",
    limit: String(HISTORY_LIST_LIMIT),
  });
  const result = await fetchRows(cfg, query, MAX_LIST_BYTES, fetchFn);
  if (!result.ok) return { status: "failed" };

  const runs: ScanRunListItem[] = [];
  for (const raw of result.rows) {
    if (!isRecord(raw)) continue;
    // Defence in depth: drop anything that is not provably this user's.
    if (typeof raw.user_id !== "string" || raw.user_id.toLowerCase() !== owner) continue;
    if (!isUuid(raw.id) || typeof raw.created_at !== "string") continue;
    if (raw.source !== "photo" && raw.source !== "manual") continue;
    if (typeof raw.status !== "string") continue;
    runs.push({
      id: raw.id.toLowerCase(),
      created_at: raw.created_at,
      source: raw.source,
      status: raw.status,
      product_name: cleanName(raw.product_name) ?? cleanName(raw.ingredient_label) ?? cleanName(raw.ingredient),
    });
    if (runs.length >= HISTORY_LIST_LIMIT) break;
  }
  return { status: "ok", runs };
}

const APP_VERSION_KEYS = ["package_version", "git_sha", "git_ref", "deployment_id", "vercel_env", "url"] as const;

/** `app_version` restated from its six known string fields only. */
function cleanAppVersion(value: unknown): Record<string, string | null> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | null> = {};
  for (const key of APP_VERSION_KEYS) {
    const v = value[key];
    out[key] = typeof v === "string" ? v.slice(0, 200) : null;
  }
  return out;
}

/**
 * One saved result, only if it belongs to `userId`. The owner filter is part of
 * the query, so another user's run, a legacy unowned run and a missing run are
 * indistinguishable: `not_found`. `runId` is validated as a strict UUID before
 * any query is built.
 */
export async function getScanRun(userId: string, runId: string, fetchFn: typeof fetch = fetch): Promise<ScanRunDetailOutcome> {
  const cfg = supabaseServerConfig();
  if (!cfg) return { status: "unavailable" };
  if (!isUuid(userId)) return { status: "failed" };
  if (!isUuid(runId)) return { status: "not_found" };
  const owner = userId.toLowerCase();
  const id = runId.toLowerCase();

  const query = new URLSearchParams({
    select: "id,user_id,source,status,analysis,app_version",
    id: `eq.${id}`,
    user_id: `eq.${owner}`,
    limit: "1",
  });
  const result = await fetchRows(cfg, query, MAX_DETAIL_BYTES, fetchFn);
  if (!result.ok) return { status: "failed" };

  const row = result.rows[0];
  if (!isRecord(row)) return { status: "not_found" };
  if (typeof row.user_id !== "string" || row.user_id.toLowerCase() !== owner) return { status: "not_found" };
  if (typeof row.id !== "string" || row.id.toLowerCase() !== id) return { status: "not_found" };

  const saved = row.analysis;
  if (!isRecord(saved) || typeof saved.schema_version !== "string" || typeof saved.status !== "string") return { status: "failed" };

  // Rebuild from the saved payload through the ALLOW-LIST (ANALYSIS_KEYS; own keys
  // only, so nothing inherited and nothing unlisted -- `persistence` with the
  // private photo's bucket / path / sha included -- can ride along), then
  // restate a safe run_id and a sanitised app_version from the row itself.
  const analysis: Record<string, unknown> = {};
  for (const key of ANALYSIS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(saved, key)) analysis[key] = saved[key];
  }
  analysis.run_id = id;
  const appVersion = cleanAppVersion(row.app_version);
  if (appVersion) analysis.app_version = appVersion;

  return { status: "ok", run_id: id, analysis };
}
