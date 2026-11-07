/*
 * POST /api/scan/claim { run_id } — confirms that a scan run ALREADY belongs
 * to the signed-in Supabase user.
 *
 * NOTHING IN THE UI CALLS THIS ANY MORE (2026-10-03). Sign-in now gates the
 * scan itself and the owner is bound at INSERT, so there is no "claim" step; the
 * route and its tests are kept as an owner-verified acknowledgement endpoint
 * only. Consequently `scan_users` is NOT populated by the app (it stays empty
 * unless something calls this route), and a signed-in person's email is kept in
 * `scan_runs.user_email`, not here. If this route is ever deleted, drop the
 * `scan_users` table with it (docs/scan-history.sql). Like the other auth
 * routes it does not require a Google identity (only the scan, history and
 * label routes do), which is harmless because it never assigns or reveals
 * anything.
 *
 * THIS ROUTE NEVER TRANSFERS OR ASSIGNS OWNERSHIP. A run's owner is bound once,
 * at INSERT, by POST /api/scan from the verified caller; there is no way to
 * take over an unowned (legacy / anonymous) row or someone else's row by
 * knowing its UUID. A run that is not yours, has no owner, or does not exist
 * all answer the same 404, so the route cannot be used to probe which ids
 * exist. See lib/auth/claim.ts. The `claimed` status therefore means "verified
 * as yours", and calling it again changes nothing.
 *
 * Authorization: Bearer <supabase access token> — verified server-side
 * against Supabase Auth (lib/auth/server-auth.ts); the client never gets to
 * assert its own user id or email, and the body carries nothing but run_id.
 *
 * No secret and no provider response in the response, ever: only a status
 * and a short fixed message.
 */
import { NextResponse } from "next/server";

import { claimScanRun } from "@/lib/auth/claim";
import {
  AUTH_UNAVAILABLE_BODY,
  UNAUTHORIZED_BODY,
  extractBearerToken,
  isUuid,
  scanAuthRequired,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** The body is `{ "run_id": "<uuid>" }`; 4 KiB is generous and bounded. */
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const bearer = extractBearerToken(request);
  if (bearer.kind !== "token") {
    return NextResponse.json({ ...UNAUTHORIZED_BODY }, { status: 401, headers: NO_STORE });
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "bad_request", error: "Request body is too large." }, { status: 413, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ status: "bad_request", error: "Request body is too large." }, { status: 413, headers: NO_STORE });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Expected a JSON body." }, { status: 400, headers: NO_STORE });
  }
  const runId = body && typeof body === "object" ? (body as { run_id?: unknown }).run_id : undefined;
  if (typeof runId !== "string" || !isUuid(runId.trim())) {
    return NextResponse.json({ status: "bad_request", error: "run_id must be a scan run id." }, { status: 400, headers: NO_STORE });
  }

  const outcome = await claimScanRun({ runId: runId.trim(), accessToken: bearer.token, requireGoogle: scanAuthRequired() });

  switch (outcome.status) {
    case "claimed":
      return NextResponse.json({ status: "claimed" }, { headers: NO_STORE });
    case "unauthorized":
      return NextResponse.json({ ...UNAUTHORIZED_BODY }, { status: 401, headers: NO_STORE });
    case "not_found":
      return NextResponse.json({ status: "not_found", error: "No scan run of yours with that id." }, { status: 404, headers: NO_STORE });
    case "unavailable":
      return NextResponse.json({ ...AUTH_UNAVAILABLE_BODY }, { status: 503, headers: NO_STORE });
    case "failed":
    default:
      return NextResponse.json(
        { status: "failed", error: "Could not confirm this run right now. Nothing about your result was affected." },
        { status: 502, headers: NO_STORE },
      );
  }
}
