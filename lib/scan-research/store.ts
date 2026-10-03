/*
 * The queue's storage client: Supabase PostgREST RPC with the SERVICE ROLE key,
 * server-side only (docs/research-jobs.sql). The table itself is not reachable
 * by any role over REST; every operation is one of six service-role-only
 * functions, each atomic in the database (claim uses `for update skip locked`,
 * complete/fail/heartbeat are compare-and-set on the lease).
 *
 * Every failure (not configured, network, timeout, non-2xx, oversize, malformed
 * JSON, function not installed) is a returned outcome -- never a throw, and
 * never provider text, a URL or a key. `unavailable` means "not provisioned
 * here" (no Supabase config, or the migration has not been applied: PostgREST
 * answers 404 for a missing function); `failed` is anything else.
 */
import { readBoundedText, supabaseServerConfig } from "@/lib/auth/server-auth";
import { LEASE_SECONDS } from "./contract";

const TIMEOUT_MS = 10_000;
/** A completed job carries an audit: bounded, but well above a real one. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type RpcOutcome = { status: "ok"; data: Record<string, unknown> } | { status: "unavailable" } | { status: "failed" };

async function rpc(fn: string, params: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<RpcOutcome> {
  const cfg = supabaseServerConfig();
  if (!cfg) return { status: "unavailable" };
  let res: Response;
  try {
    res = await fetchFn(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: "failed" };
  }
  if (res.status === 404) {
    try {
      await res.body?.cancel();
    } catch {
      /* nothing more to do */
    }
    return { status: "unavailable" };
  }
  if (!res.ok) {
    try {
      await res.body?.cancel();
    } catch {
      /* nothing more to do */
    }
    return { status: "failed" };
  }
  const body = await readBoundedText(res, MAX_RESPONSE_BYTES);
  if (body === null) return { status: "failed" };
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { status: "failed" };
    return { status: "ok", data: parsed as Record<string, unknown> };
  } catch {
    return { status: "failed" };
  }
}

export const enqueueJob = (owner: string, scan: string, target: unknown, promptVersion: string) =>
  rpc("bsproof_research_enqueue", { p_owner: owner, p_scan: scan, p_target: target, p_prompt_version: promptVersion });

export const getJob = (owner: string, id: string) => rpc("bsproof_research_get", { p_owner: owner, p_id: id });

export const claimJob = () => rpc("bsproof_research_claim", { p_lease_seconds: LEASE_SECONDS });

export const heartbeatJob = (id: string, leaseToken: string) =>
  rpc("bsproof_research_heartbeat", { p_id: id, p_lease_token: leaseToken, p_lease_seconds: LEASE_SECONDS });

export const completeJob = (id: string, leaseToken: string, result: unknown) =>
  rpc("bsproof_research_complete", { p_id: id, p_lease_token: leaseToken, p_result: result });

export const failJob = (id: string, leaseToken: string, code: string, message: string | null, retryable: boolean) =>
  rpc("bsproof_research_fail", { p_id: id, p_lease_token: leaseToken, p_code: code, p_message: message, p_retryable: retryable });

const JOB_FIELDS = ["id", "scan_id", "status", "prompt_version", "target", "created_at", "updated_at", "completed_at", "failure_code", "result"] as const;

/** The owner-facing job: an explicit allow-list, so no column added later can leak. Null if `row` is not a job. */
export function publicJob(row: unknown): Record<string, unknown> | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.status !== "string") return null;
  const out: Record<string, unknown> = {};
  for (const key of JOB_FIELDS) out[key] = r[key] ?? null;
  if (out.status !== "succeeded") out.result = null;
  if (out.status !== "failed") out.failure_code = null;
  return out;
}
