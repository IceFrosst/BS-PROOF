/*
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
 */
import { authenticateRequest, isUuid } from "@/lib/auth/server-auth";
import { RESEARCH_PROMPT_VERSION, liveResearchEnabled } from "@/lib/scan-research/contract";
import { json, readJsonObject } from "@/lib/scan-research/http";
import { enqueueJob, publicJob } from "@/lib/scan-research/store";
import { buildResearchTarget } from "@/lib/scan-research/target";
import { getScanRun } from "@/lib/scan-history/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  if (!liveResearchEnabled()) {
    return json({ status: "research_disabled", error: "Live research is not available on this deployment yet." }, 503);
  }

  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return json(auth.body, auth.http);
    return json({ status: "unauthorized", error: "Sign in with Google to continue." }, 401);
  }

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
