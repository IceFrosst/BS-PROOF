/*
 * GET /api/scan/research/[id]/ -- status and result of ONE research job, owner
 * only. Google-verified bearer required. The lookup is filtered on
 * `owner_id = <Supabase-verified user>` inside the database function, so a job
 * that belongs to someone else, a job that does not exist and an id that is not
 * a UUID are all the same 404 -- the route cannot be used to probe which jobs
 * exist. Never returns a lease token, the owner id or any worker detail.
 * Contract: lib/scan-research/contract.ts.
 */
import { authenticateRequest, isUuid } from "@/lib/auth/server-auth";
import { json } from "@/lib/scan-research/http";
import { getJob, publicJob } from "@/lib/scan-research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = { status: "not_found", error: "No research job of yours with that id." };

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return json(auth.body, auth.http);
    return json({ status: "unauthorized", error: "Sign in with Google to continue." }, 401);
  }

  let id: unknown;
  try {
    id = (await ctx.params).id;
  } catch {
    id = undefined;
  }
  if (!isUuid(id)) return json(NOT_FOUND, 404);

  const found = await getJob(auth.user.id, id.toLowerCase());
  if (found.status === "unavailable") return json({ status: "research_unavailable", error: "Research is not available on this deployment right now." }, 503);
  if (found.status !== "ok") return json({ status: "research_failed", error: "Could not load that research job right now. Please try again shortly." }, 502);

  const job = publicJob(found.data.job);
  if (!job) return json(NOT_FOUND, 404);
  return json({ status: "ok", job });
}
