/*
 * POST /api/scan/translate -- display translation of result prose, EN -> LT.
 *
 * Body: { lang: "lt", texts: string[] }  (<= 24 items, bounded sizes).
 * Reply: { status: "ok", translations: (string | null)[], prompt_version }.
 * `null` means "keep the original English" (guard rejected it, or the model was
 * unreachable). It is DISPLAY ONLY: nothing is stored, nothing is scored, and
 * the stored analysis is never touched -- see lib/analyze/translate.ts.
 *
 * Same auth gate as POST /api/scan: where Google sign-in is required for scans
 * (SCAN_REQUIRE_AUTH=1) this needs the same bearer token, so it is not an
 * anonymous way to spend model calls; the gate runs before the body is read.
 * The body is read with a hard BYTE cap (not only the declared Content-Length)
 * before it is parsed, and LABEL_ANALYZER_ENABLED=0 (the kill switch every
 * model-spending scan route honours) turns translation off too.
 */
import { NextResponse } from "next/server";

import { authenticateRequest, scanAuthRequired } from "@/lib/auth/server-auth";
import { providerConfigured } from "@/lib/analyze/llm";
import {
  TRANSLATE_MAX_BODY_BYTES,
  TRANSLATE_MAX_ITEMS,
  TRANSLATE_MAX_ITEM_CHARS,
  TRANSLATE_MAX_TOTAL_CHARS,
  defaultTranslateDeps,
  translateTexts,
} from "@/lib/analyze/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function killSwitchOn(): boolean {
  return process.env.LABEL_ANALYZER_ENABLED === "0";
}

function tooLarge(): NextResponse {
  return NextResponse.json({ status: "bad_request", error: "Too much text in one request." }, { status: 413, headers: NO_STORE });
}

/**
 * The request body as text, or null when it exceeds `max` bytes. The declared
 * Content-Length is only a fast refusal; the stream itself is counted while it
 * is read and cancelled the moment it passes the cap, so a chunked or lying
 * sender cannot make the server buffer an unbounded body.
 */
async function readBoundedBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request): Promise<NextResponse> {
  const required = scanAuthRequired();
  const auth = await authenticateRequest(request, { tokenRequired: required, requireGoogle: required });
  if (auth.status === "denied") return NextResponse.json(auth.body, { status: auth.http, headers: NO_STORE });

  if (killSwitchOn()) {
    return NextResponse.json({ status: "translator_unavailable", error: "Translation is switched off." }, { status: 503, headers: NO_STORE });
  }

  let text: string | null;
  try {
    text = await readBoundedBody(request, TRANSLATE_MAX_BODY_BYTES);
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Could not read the request body." }, { status: 400, headers: NO_STORE });
  }
  if (text === null) return tooLarge();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Could not read the request body." }, { status: 400, headers: NO_STORE });
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const texts = record?.texts;
  if (!record || record.lang !== "lt" || !Array.isArray(texts) || !texts.length || texts.length > TRANSLATE_MAX_ITEMS || !texts.every((t) => typeof t === "string" && t.length > 0 && t.length <= TRANSLATE_MAX_ITEM_CHARS)) {
    return NextResponse.json({ status: "bad_request", error: "Expected { lang: 'lt', texts: string[] } within the size limits." }, { status: 400, headers: NO_STORE });
  }
  const list = texts as string[];
  if (list.reduce((sum, t) => sum + t.length, 0) > TRANSLATE_MAX_TOTAL_CHARS) {
    return tooLarge();
  }
  if (!providerConfigured()) {
    return NextResponse.json({ status: "translator_unavailable", error: "No model provider is configured." }, { status: 503, headers: NO_STORE });
  }

  // Cache partitioning uses only Supabase's verified user ID. Never accept a
  // caller-supplied scope, and do not pool anonymous requests into one bucket.
  const cacheScope = auth.status === "authenticated" ? auth.user.id : undefined;
  const result = await translateTexts(list, defaultTranslateDeps(), cacheScope);
  return NextResponse.json(
    { status: result.status === "ok" ? "ok" : "translator_unavailable", translations: result.translations, prompt_version: result.prompt_version },
    // 200 either way: a partly cached answer is still useful, and `null`
    // entries already mean "keep the English".
    { status: 200, headers: NO_STORE },
  );
}
