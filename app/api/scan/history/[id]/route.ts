/*
 * GET /api/scan/history/[id] — one saved scan result, if it is the signed-in
 * user's.
 *
 * Requires a Supabase-verified, Google-backed bearer token regardless of
 * SCAN_REQUIRE_AUTH (see ../route.ts). `id` must be a strict UUID (400
 * otherwise, before any query is built) and the lookup is filtered on
 * `user_id = <verified user>` in the database query itself. A run that belongs
 * to another user, a legacy run with no owner, and a run that does not exist
 * are INDISTINGUISHABLE: the same 404 body, so the route cannot be used to
 * probe which ids exist.
 *
 *   200 { status: "ok", run_id, analysis: <the saved ScanAnalysis> }
 *
 * `analysis` is read back exactly as it was saved -- the model and pipeline are
 * never re-run. It carries a reconstructed `run_id` and `app_version` and no
 * `persistence` block: no photo bytes, no storage path, no signed image URL, no
 * other user's data. Every response is `Cache-Control: no-store`.
 */
import { NextResponse } from "next/server";

import { authenticateRequest, isUuid } from "@/lib/auth/server-auth";
import { getScanRun } from "@/lib/scan-history/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return NextResponse.json(auth.body, { status: auth.http, headers: NO_STORE });
    return NextResponse.json({ status: "unauthorized", error: "Sign in with Google to continue." }, { status: 401, headers: NO_STORE });
  }

  let id: unknown;
  try {
    id = (await ctx.params).id;
  } catch {
    id = undefined;
  }
  if (!isUuid(id)) {
    return NextResponse.json({ status: "bad_request", error: "That is not a valid scan id." }, { status: 400, headers: NO_STORE });
  }

  const outcome = await getScanRun(auth.user.id, id);
  switch (outcome.status) {
    case "ok":
      return NextResponse.json({ status: "ok", run_id: outcome.run_id, analysis: outcome.analysis }, { headers: NO_STORE });
    case "not_found":
      return NextResponse.json({ status: "not_found", error: "No saved scan of yours with that id." }, { status: 404, headers: NO_STORE });
    case "unavailable":
      return NextResponse.json(
        { status: "history_unavailable", error: "Scan history is not available on this deployment right now." },
        { status: 503, headers: NO_STORE },
      );
    case "failed":
    default:
      return NextResponse.json(
        { status: "history_failed", error: "Could not load that saved scan right now. Please try again shortly." },
        { status: 502, headers: NO_STORE },
      );
  }
}
