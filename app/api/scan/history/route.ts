/*
 * GET /api/scan/history — the signed-in user's PRIVATE list of recent scans.
 *
 * Requires a Supabase access token (Authorization: Bearer ...) that Supabase
 * Auth verifies AND that belongs to a user with a Google identity. This is
 * enforced REGARDLESS of SCAN_REQUIRE_AUTH: history is personal data, so there
 * is no anonymous or "demo" mode for it. The caller supplies no user id, filter
 * or cursor -- the owner is whoever Supabase says the token belongs to, and the
 * query is filtered on that id server-side (lib/scan-history/reader.ts).
 *
 *   200 { status: "ok", runs: [{ id, created_at, source, status, product_name }],
 *         next_cursor: null }
 *
 * `runs` is the latest 20 of THIS user, metadata only -- no analyses, no
 * images, no image paths, no emails. It is a "recent" list, deliberately not
 * an exhaustive history, which is why `next_cursor` is always null.
 *
 *   401 { status: "unauthorized" }        missing / invalid / expired / non-Google
 *   503 { status: "auth_unavailable" }    sign-in verification cannot be done
 *   503 { status: "history_unavailable" } history store not configured
 *   502 { status: "history_failed" }      the store could not be read
 *
 * Every response is `Cache-Control: no-store`. Nothing here ever re-runs the
 * model or the pipeline.
 */
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/server-auth";
import { listScanRuns } from "@/lib/scan-history/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateRequest(request, { tokenRequired: true, requireGoogle: true });
  if (auth.status !== "authenticated") {
    if (auth.status === "denied") return NextResponse.json(auth.body, { status: auth.http, headers: NO_STORE });
    // `anonymous` cannot happen with tokenRequired, but fail closed regardless.
    return NextResponse.json({ status: "unauthorized", error: "Sign in with Google to continue." }, { status: 401, headers: NO_STORE });
  }

  const outcome = await listScanRuns(auth.user.id);
  if (outcome.status === "ok") {
    return NextResponse.json({ status: "ok", runs: outcome.runs, next_cursor: null }, { headers: NO_STORE });
  }
  if (outcome.status === "unavailable") {
    return NextResponse.json(
      { status: "history_unavailable", error: "Scan history is not available on this deployment right now." },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { status: "history_failed", error: "Could not load your scan history right now. Please try again shortly." },
    { status: 502, headers: NO_STORE },
  );
}
