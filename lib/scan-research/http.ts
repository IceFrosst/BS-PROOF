/* Small shared HTTP helpers for the research routes. No secrets, no logging. */
import { NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export type BodyOutcome = { ok: true; value: Record<string, unknown>; bytes: number } | { ok: false; res: NextResponse };

/** Reads a bounded JSON-object body. 413 when too large, 400 when not a JSON object. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<BodyOutcome> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, res: json({ status: "bad_request", error: "Request body is too large." }, 413) };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, res: json({ status: "bad_request", error: "Expected a JSON body." }, 400) };
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) return { ok: false, res: json({ status: "bad_request", error: "Request body is too large." }, 413) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, res: json({ status: "bad_request", error: "Expected a JSON body." }, 400) };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, res: json({ status: "bad_request", error: "Expected a JSON object." }, 400) };
  }
  return { ok: true, value: parsed as Record<string, unknown>, bytes };
}
