/*
 * POST /api/scan/claim { run_id } — attaches the signed-in Supabase user to a
 * scan run (2026-09-16, founder: "people log in once so we capture their
 * email"). Called by the client right after a successful Google sign-in
 * (`lib/auth/claim.ts`), and again on page load if the user was already
 * signed in when a new run_id arrives.
 *
 * Authorization: Bearer <supabase access token> — verified server-side
 * against Supabase Auth (`lib/auth/claim.ts#verifySupabaseUser`); the client
 * never gets to assert its own user id or email.
 *
 * No secret in the response, ever: only a status and a short message.
 */
import { NextResponse } from "next/server";

import { claimScanRun } from "@/lib/auth/claim";

const NO_STORE = { "Cache-Control": "no-store" };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ status: "unauthorized", error: "Missing Authorization: Bearer <token> header." }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Expected a JSON body." }, { status: 400, headers: NO_STORE });
  }
  const runId = body && typeof body === "object" ? (body as { run_id?: unknown }).run_id : undefined;
  if (typeof runId !== "string" || !runId.trim()) {
    return NextResponse.json({ status: "bad_request", error: "run_id is required." }, { status: 400, headers: NO_STORE });
  }

  const outcome = await claimScanRun({ runId: runId.trim(), accessToken: token });

  switch (outcome.status) {
    case "claimed":
      return NextResponse.json({ status: "claimed" }, { headers: NO_STORE });
    case "unauthorized":
      return NextResponse.json({ status: "unauthorized", error: "Invalid or expired session." }, { status: 401, headers: NO_STORE });
    case "not_found":
      return NextResponse.json({ status: "not_found", error: "No scan run with that id." }, { status: 404, headers: NO_STORE });
    case "unavailable":
      return NextResponse.json({ status: "unavailable", error: "Sign-in is not configured on this deployment." }, { status: 503, headers: NO_STORE });
    case "failed":
    default:
      return NextResponse.json({ status: "failed", error: "Could not record sign-in for this run. Nothing about your result was affected." }, { status: 502, headers: NO_STORE });
  }
}
