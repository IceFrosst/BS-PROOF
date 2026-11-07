/*
 * GET  /api/scan/research/?scan_id=<uuid> -- the research job that YOUR saved scan already has, if any. READ-ONLY:
 *   it never creates, queues or changes a job and never reads the scan; it exists so a page that was reloaded (or a
 *   scan re-opened from History) can find the job and keep following it instead of asking for research again.
 *   Google-verified bearer first, then the database function filters on `owner_id = <Supabase-verified user>`: another
 *   owner's scan, a scan with no job, a scan that does not exist and a malformed or extra query are ALL the same 404
 *   (and `Cache-Control: no-store`), so the route cannot be used to probe which scans or jobs exist. It does not look at
 *   SCAN_LIVE_RESEARCH_ENABLED, like GET /api/scan/research/[id]: it cannot start anything, and a job that exists stays
 *   readable by its owner.
 * POST /api/scan/research/ { scan_id } -- ask for a live-source research audit
 * of one of YOUR saved scans. Queues a job only; no model runs here (the PC
 * worker does the research later). Contract: lib/scan-research/contract.ts.
 *
 *  - Google-verified bearer required (same gate as scan history).
 *  - The target is derived from the owner's saved scan (owner-filtered read of
 *    scan_runs); the body may carry nothing but `scan_id`.
 *  - A scan that is not yours, has no owner, or does not exist: the same 404.
 *  - One job per scan: a repeat returns the existing job (200, created:false).
 *  - Off until SCAN_LIVE_RESEARCH_ENABLED is on: 503 research_disabled.
 *  - SCAN_LIVE_RESEARCH_ENABLED=owners is the private owner-smoke mode: only the
 *    Supabase-verified user ids in SCAN_LIVE_RESEARCH_OWNER_IDS may queue; anyone
 *    else gets the identical 503 research_disabled (so the list cannot be probed).
 *    The list is checked after authentication and before the body, the scan read
 *    or any queue call. Fail closed: lib/scan-research/contract.ts `liveResearchMode`.
 */
import { authenticateRequest, isUuid } from "@/lib/auth/server-auth";
import { RESEARCH_PROMPT_VERSION, liveResearchMode, researchOwnerIds } from "@/lib/scan-research/contract";
import { json, readJsonObject } from "@/lib/scan-research/http";
import { enqueueJob, getJobByScan, publicJob } from "@/lib/scan-research/store";
import { buildResearchTarget } from "@/lib/scan-research/target";
import { getScanRun } from "@/lib/scan-history/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

const NOT_FOUND = { status: "not_found", error: "No research job of yours for that scan." };

const disabled = () => json({ status: "research_disabled", error: "Live research is not available on this deployment yet." }, 503);

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return json(auth.body, auth.http);
    return json({ status: "unauthorized", error: "Sign in with Google to continue." }, 401);
  }

  // Exactly one parameter, `scan_id`, and it must be a UUID; anything else is the same 404 as "no job", before any lookup.
  const params = new URL(request.url).searchParams;
  const names = [...params.keys()];
  const scanId = params.get("scan_id");
  if (names.length !== 1 || names[0] !== "scan_id" || params.getAll("scan_id").length !== 1 || !isUuid(scanId)) return json(NOT_FOUND, 404);

  const found = await getJobByScan(auth.user.id, scanId.toLowerCase());
  if (found.status === "unavailable") return json({ status: "research_unavailable", error: "Research is not available on this deployment right now." }, 503);
  if (found.status !== "ok") return json({ status: "research_failed", error: "Could not load that research job right now. Please try again shortly." }, 502);

  const job = publicJob(found.data.job);
  // The database answers for (owner, scan); a row for any other scan is refused here too, never drawn.
  if (!job || job.scan_id !== scanId.toLowerCase()) return json(NOT_FOUND, 404);
  return json({ status: "ok", job });
}

export async function POST(request: Request) {
  const mode = liveResearchMode();
  if (mode === "off") return disabled();

  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return json(auth.body, auth.http);
    return json({ status: "unauthorized", error: "Sign in with Google to continue." }, 401);
  }
  // Owner-smoke: the verified id (from Supabase's own answer) must be listed. Same body as OFF.
  if (mode === "owners" && !researchOwnerIds().has(auth.user.id)) return disabled();

  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body.ok) return body.res;
  const keys = Object.keys(body.value);
  const scanId = body.value.scan_id;
  if (keys.length !== 1 || typeof scanId !== "string" || !isUuid(scanId.trim())) {
    return json({ status: "bad_request", error: "Send only a scan_id." }, 400);
  }

  const scan = await getScanRun(auth.user.id, scanId.trim().toLowerCase());
  if (scan.status === "not_found") return json({ status: "not_found", error: "No scan of yours with that id." }, 404);
  if (scan.status === "unavailable") return json({ status: "research_unavailable", error: "Research is not available on this deployment right now." }, 503);
  if (scan.status !== "ok") return json({ status: "research_failed", error: "Could not start research right now. Please try again shortly." }, 502);

  const built = buildResearchTarget(scan.analysis);
  if (!built.ok) {
    return json({ status: "scan_not_researchable", error: "That scan did not identify a supplement to research." }, 422);
  }

  const queued = await enqueueJob(auth.user.id, scan.run_id, built.target, RESEARCH_PROMPT_VERSION);
  if (queued.status === "unavailable") return json({ status: "research_unavailable", error: "Research is not available on this deployment right now." }, 503);
  if (queued.status !== "ok") return json({ status: "research_failed", error: "Could not start research right now. Please try again shortly." }, 502);

  const outcome = queued.data.status;
  if (outcome === "busy") {
    return json({ status: "research_busy", error: "You already have research running. Please wait for it to finish." }, 429);
  }
  const job = publicJob(queued.data.job);
  if ((outcome !== "created" && outcome !== "existing") || !job) {
    return json({ status: "research_failed", error: "Could not start research right now. Please try again shortly." }, 502);
  }
  return json({ status: "ok", created: outcome === "created", job }, outcome === "created" ? 201 : 200);
}
