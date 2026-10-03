/*
 * POST /api/scan/research/worker/ -- the PC worker's only door into the queue.
 *
 * Authenticated by the dedicated BS_PROOF_RESEARCH_WORKER_TOKEN (constant-time
 * compare, lib/scan-research/worker-auth.ts); a user's Google bearer is not
 * accepted here and this token is not accepted anywhere else. Body:
 *   { action: "claim" }
 *   { action: "heartbeat", job_id, lease_token }
 *   { action: "complete",  job_id, lease_token, audit, source_access }
 *   { action: "fail",      job_id, lease_token, code, message?, retryable? }
 * heartbeat / complete / fail need the CURRENT valid lease (token matches, not
 * expired, job still running); anything else is 409 lease_invalid, and nothing
 * about the job is revealed. Full contract: lib/scan-research/contract.ts.
 *
 * The worker's text (audit, log, failure message) is stored as data and never
 * interpreted. Failure messages are kept for the operator and never returned to
 * the job's owner (only the short `code` is). Nothing here logs a request.
 */
import { isUuid } from "@/lib/auth/server-auth";
import { LEASE_TOKEN_RE, RESEARCH_PROMPT_VERSION } from "@/lib/scan-research/contract";
import { json, readJsonObject } from "@/lib/scan-research/http";
import { checkJobResult } from "@/lib/scan-research/result";
import { claimJob, completeJob, failJob, heartbeatJob, type RpcOutcome } from "@/lib/scan-research/store";
import { authenticateWorker } from "@/lib/scan-research/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A complete audit is well under this; it is a wall, not an expectation. */
const MAX_COMPLETE_BYTES = 1024 * 1024;
const MAX_SMALL_BYTES = 8 * 1024;
const CODE_RE = /^[a-z0-9_]{1,64}$/;

const unavailable = () => json({ status: "research_unavailable", error: "Research queue is not available." }, 503);
const failed = () => json({ status: "research_failed", error: "The queue could not complete that request." }, 502);
const leaseInvalid = () => json({ status: "lease_invalid" }, 409);

function stored(outcome: RpcOutcome): { data: Record<string, unknown> } | { res: Response } {
  if (outcome.status === "unavailable") return { res: unavailable() };
  if (outcome.status !== "ok") return { res: failed() };
  return { data: outcome.data };
}

export async function POST(request: Request) {
  const who = authenticateWorker(request);
  if (who === "unconfigured") return json({ status: "worker_unavailable", error: "The research worker is not configured." }, 503);
  if (who !== "ok") return json({ status: "unauthorized", error: "Not authorized." }, 401);

  const body = await readJsonObject(request, MAX_COMPLETE_BYTES);
  if (!body.ok) return body.res;
  const b = body.value;
  const action = b.action;
  if (action !== "claim" && action !== "heartbeat" && action !== "complete" && action !== "fail") {
    return json({ status: "bad_request", error: "Unknown action." }, 400);
  }
  if (action !== "complete" && body.bytes > MAX_SMALL_BYTES) return json({ status: "bad_request", error: "Request body is too large." }, 413);

  if (action === "claim") {
    const out = stored(await claimJob());
    if ("res" in out) return out.res;
    const job = out.data.job as Record<string, unknown> | null | undefined;
    if (!job) return json({ job: null });
    if (typeof job.id !== "string" || typeof job.lease_token !== "string" || typeof job.target !== "object" || job.target === null || typeof job.prompt_version !== "string") return failed();
    return json({ job: { id: job.id, lease_token: job.lease_token, target: job.target, prompt_version: job.prompt_version } });
  }

  const jobId = b.job_id;
  const lease = b.lease_token;
  if (typeof jobId !== "string" || !isUuid(jobId) || typeof lease !== "string" || !LEASE_TOKEN_RE.test(lease)) {
    return json({ status: "bad_request", error: "job_id and lease_token are required." }, 400);
  }
  const id = jobId.toLowerCase();

  if (action === "heartbeat") {
    const out = stored(await heartbeatJob(id, lease));
    if ("res" in out) return out.res;
    if (out.data.status !== "ok") return leaseInvalid();
    return json({ status: "ok", lease_expires_at: typeof out.data.lease_expires_at === "string" ? out.data.lease_expires_at : null });
  }

  if (action === "complete") {
    const checked = checkJobResult({ audit: b.audit, source_access: b.source_access }, RESEARCH_PROMPT_VERSION);
    if (!checked.ok) return json({ status: "invalid_result", errors: checked.errors }, 422);
    const out = stored(await completeJob(id, lease, checked.result));
    if ("res" in out) return out.res;
    const status = out.data.status;
    if (status === "completed" || status === "already_completed") return json({ status });
    if (status === "conflict") return json({ status: "conflict" }, 409);
    return leaseInvalid();
  }

  // action === "fail"
  const code = b.code;
  const message = b.message;
  const retryable = b.retryable;
  if (typeof code !== "string" || !CODE_RE.test(code)) return json({ status: "bad_request", error: "code must be a short snake_case identifier." }, 400);
  if (message !== undefined && message !== null && (typeof message !== "string" || message.length > 300 || message.includes("\u0000"))) {
    return json({ status: "bad_request", error: "message must be a string of at most 300 characters." }, 400);
  }
  if (retryable !== undefined && typeof retryable !== "boolean") return json({ status: "bad_request", error: "retryable must be a boolean." }, 400);
  const out = stored(await failJob(id, lease, code, typeof message === "string" ? message : null, retryable === true));
  if ("res" in out) return out.res;
  const status = out.data.status;
  if (status === "failed" || status === "requeued" || status === "already_failed" || status === "already_completed") return json({ status });
  return leaseInvalid();
}
