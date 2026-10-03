/*
 * THE WEBSITE -> PC RESEARCH QUEUE: shared contract (backend only).
 *
 * WHAT THIS IS. A signed-in person asks for a live-source research audit of ONE
 * of their own saved scans. The website only RECORDS that request in a private
 * Postgres queue (docs/research-jobs.sql). A separate worker on the founder's
 * main PC -- which opens NO public port -- polls the website over HTTPS, runs
 * the audit through the founder's Claude SUBSCRIPTION (a logged-in CLI, no API
 * key, no metered spend, no per-call budget), and posts the result back. NO
 * MODEL IS CALLED FROM THIS REPOSITORY'S VERCEL CODE: nothing under
 * lib/scan-research/ or app/api/scan/research/ imports a model client.
 *
 * Because it runs on a subscription there is deliberately NO auth budget
 * attached to a job: the cost control is the per-owner open-job cap in SQL
 * (MAX 3 queued/running per owner), one job per scan, and the off-by-default
 * SCAN_LIVE_RESEARCH_ENABLED flag.
 *
 * API (all JSON, all `Cache-Control: no-store`)
 *
 *   POST /api/scan/research/            { scan_id }                 Google bearer
 *       -> 201 { status:"ok", created:true,  job }   new job
 *       -> 200 { status:"ok", created:false, job }   idempotent repeat (one job per scan)
 *       401 unauthorized | 400 bad_request | 404 not_found (not YOUR scan)
 *       422 scan_not_researchable | 429 research_busy | 503 research_disabled /
 *       research_unavailable / auth_unavailable | 502 research_failed
 *     The target is DERIVED on the server from the owner's saved scan. The body
 *     may carry nothing but `scan_id` (any other key -> 400): never a prompt,
 *     an owner id, a product, a dose.
 *
 *   GET  /api/scan/research/[id]/                                   Google bearer
 *       -> 200 { status:"ok", job }   owner only; a job that is someone else's,
 *          missing or not a UUID is the same 404 { status:"not_found" }
 *     job = { id, scan_id, status:"queued"|"running"|"succeeded"|"failed",
 *             prompt_version, target, created_at, updated_at, completed_at,
 *             failure_code (failed only), result (succeeded only) }
 *     result = { audit, source_access, provenance }.
 *
 *   POST /api/scan/research/worker/     Authorization: Bearer <BS_PROOF_RESEARCH_WORKER_TOKEN>
 *     { action:"claim" }
 *         -> 200 { job: null } | { job:{ id, lease_token, target, prompt_version } }
 *     { action:"heartbeat", job_id, lease_token }
 *         -> 200 { status:"ok", lease_expires_at } | 409 { status:"lease_invalid" }
 *     { action:"complete",  job_id, lease_token, audit, source_access }
 *         -> 200 { status:"completed"|"already_completed" } | 409 lease_invalid|conflict
 *            | 422 { status:"invalid_result", errors:[...] }
 *     { action:"fail", job_id, lease_token, code, message?, retryable? }
 *         -> 200 { status:"failed"|"requeued"|"already_failed"|"already_completed" }
 *            | 409 lease_invalid
 *     401 bad/missing worker token | 503 worker_unavailable (token not configured)
 *
 * LEASES. A lease lasts LEASE_SECONDS (300) from claim and from every
 * heartbeat; heartbeat at most every ~100 s. A lease is valid only while its
 * token matches AND it has not expired AND the job is still `running`. An
 * expired lease may be re-claimed by another claim call (new token, attempts+1,
 * at most 3 attempts), after which the old token can do nothing at all. `complete`
 * is a compare-and-set: the first valid completion wins; re-posting the identical
 * result with the same lease is `already_completed`; a different result is
 * `conflict`; a stale `fail` can never overwrite a completion.
 *
 * WHAT THE WORKER IS TOLD (ResearchJobV1, see target.ts). Supplement facts
 * only. No photo, no email, no user id, no bearer, no credential, no body
 * weight, no inferred servings. Printed text fields are UNTRUSTED DATA, not
 * instructions: `target.handling.text_fields_are_untrusted_data` is always true
 * and the worker must treat every string as data.
 *
 * WHAT COMES BACK. The audit must validate against schemas/research_audit.json
 * (strict, additionalProperties:false, finite numbers) and carry
 * `meta.prompt === prompt_version`. `source_access` (SourceAccessV1,
 * source-access.ts) is the worker's access log, kept in four distinct kinds --
 * request / error / wall / refusal -- plus a summary the server recomputes. The
 * server NEVER lets a tool call that returned without an error stand as
 * "papers read" or "full text": an inventory entry citing access
 * snippet/abstract/full_text must be backed by a content-verified request event
 * (content bytes + SHA-256) for that same id at that level or higher.
 *
 * PROVENANCE. The server stamps `result.provenance` itself; the worker cannot
 * supply or alter it. A result is EXPERIMENTAL and UNVALIDATED: it is not a
 * clinical approval, not human-verified, and not an input to any scoring
 * constant (invariant 4). It does not change the scan's score.
 *
 * SECRETS. The worker token is compared in constant time, lives only in server
 * env and the PC's env, and is never returned, stored, logged or put in history.
 * Lease tokens are stored only as SHA-256 hashes.
 */

/** The stable job-target version. A breaking change is a new version, never an edit. */
export const RESEARCH_JOB_VERSION = "ResearchJobV1" as const;

/** The prompt the PC worker must run (prompts/research_audit.md). Bumped together with that file (invariant 3). */
export const RESEARCH_PROMPT_VERSION = "audit-v0.4" as const;

/** Lease length in seconds (must equal the SQL default). */
export const LEASE_SECONDS = 300;

/** The `result.provenance` the SERVER stamps on every completed job. */
export const RESEARCH_PROVENANCE = {
  evidence_status: "experimental_unvalidated",
  clinically_approved: false,
  human_verified: false,
  affects_score: false,
  runner: "claude_subscription_cli",
  billing: "subscription_no_api_spend",
} as const;

/** The lease token: server-minted, 64 hex characters. Anything else is refused before a query is built. */
export const LEASE_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * `SCAN_LIVE_RESEARCH_ENABLED`. OFF unless explicitly turned on (the opposite
 * parsing to SCAN_REQUIRE_AUTH on purpose: a typo must leave a spending feature
 * OFF). Turn it on only after docs/research-jobs.sql is applied and the PC worker
 * and BS_PROOF_RESEARCH_WORKER_TOKEN are provisioned.
 */
export function liveResearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.SCAN_LIVE_RESEARCH_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
