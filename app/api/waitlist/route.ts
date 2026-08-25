/*
 * The dashboard's SECOND runtime API. Read app/api/analyze-label/route.ts
 * before adding a third.
 *
 * Someone scans the QR code on the stand's roll-up, lands on the site, and
 * leaves an email address. That address goes to Supabase and nowhere else.
 *
 *   POST /api/waitlist   { email, source? }  -> { status }
 *   GET  /api/waitlist                       -> { waitlist_available }
 *
 * Three properties worth keeping:
 *
 * 1. THE SERVICE ROLE KEY STAYS ON THE SERVER. The insert happens here, never
 *    in the browser, and the key has no NEXT_PUBLIC_ prefix so Next cannot put
 *    it in a client bundle. A waitlist wired straight from the browser to
 *    Supabase would ship a key that bypasses row level security to every
 *    visitor.
 *
 * 2. WE STORE THE ADDRESS AND THE SOURCE. Not the IP, not the user agent, not
 *    a fingerprint. This is a stand at a conference in the EU: every extra
 *    column is personal data we would have to justify, and none of it helps us
 *    email someone later.
 *
 * 3. SIGNING UP TWICE IS NOT AN ERROR. A person who scans the code again gets
 *    "you are already on the list", which is true and reassuring, rather than
 *    a red failure that makes them think the stand is broken.
 */
import { NextResponse } from "next/server";

import { checkEmail } from "@/lib/waitlist/email";
import { addToWaitlist, waitlistConfigured } from "@/lib/waitlist/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for any address plus a short source tag, short enough to ignore. */
const MAX_BODY_BYTES = 2_000;

/** Source tags we set ourselves. Anything else is recorded as null. */
const KNOWN_SOURCES = new Set(["qr", "web", "stand"]);

function noStore(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!waitlistConfigured()) {
    return noStore(
      {
        status: "waitlist_unavailable",
        error:
          "The waitlist is not configured on this deployment. The rest of the site is unaffected.",
      },
      503,
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return noStore({ status: "bad_request", error: "That request was too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return noStore({ status: "bad_request", error: "Expected a JSON body." }, 400);
  }
  if (typeof body !== "object" || body === null) {
    return noStore({ status: "bad_request", error: "Expected a JSON object." }, 400);
  }

  const { email: rawEmail, source: rawSource } = body as Record<string, unknown>;

  const check = checkEmail(rawEmail);
  if (!check.ok || !check.email) {
    // 400 with the reason IN THE PAYLOAD: the form shows `error` verbatim, so
    // this text is what the person reads. It has to be about their address,
    // not about our validator.
    return noStore({ status: "invalid_email", error: check.message ?? "That address is not valid." }, 400);
  }

  // An arbitrary string from the client is never stored as-is; an unrecognised
  // tag becomes null rather than a free-text column we did not design.
  const source =
    typeof rawSource === "string" && KNOWN_SOURCES.has(rawSource.trim().toLowerCase())
      ? rawSource.trim().toLowerCase()
      : null;

  const outcome = await addToWaitlist({ email: check.email, source });

  switch (outcome.status) {
    case "joined":
      return noStore({ status: "joined" });
    case "already_joined":
      return noStore({ status: "already_joined" });
    case "unavailable":
      return noStore({ status: "waitlist_unavailable", error: outcome.detail }, 503);
    case "failed":
    default:
      // The detail names the store's own status and body. It goes to the
      // response because this deployment has no log anyone reads, and a
      // waitlist that fails silently at a conference is worse than one that
      // says what broke. It contains no key and no other person's address.
      return noStore({ status: "failed", error: outcome.detail }, 502);
  }
}

/** Lets the UI hide the form entirely rather than offering a field that 503s. */
export async function GET(): Promise<NextResponse> {
  return noStore({ waitlist_available: waitlistConfigured() });
}
