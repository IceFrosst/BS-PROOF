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
 */
import { NextResponse } from "next/server";

import { authenticateRequest, scanAuthRequired } from "@/lib/auth/server-auth";
import { providerConfigured } from "@/lib/analyze/llm";
import {
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

export async function POST(request: Request): Promise<NextResponse> {
  const required = scanAuthRequired();
  const auth = await authenticateRequest(request, { tokenRequired: required, requireGoogle: required });
  if (auth.status === "denied") return NextResponse.json(auth.body, { status: auth.http, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
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
    return NextResponse.json({ status: "bad_request", error: "Too much text in one request." }, { status: 413, headers: NO_STORE });
  }
  if (!providerConfigured()) {
    return NextResponse.json({ status: "translator_unavailable", error: "No model provider is configured." }, { status: 503, headers: NO_STORE });
  }

  const result = await translateTexts(list, defaultTranslateDeps());
  return NextResponse.json(
    { status: result.status === "ok" ? "ok" : "translator_unavailable", translations: result.translations, prompt_version: result.prompt_version },
    // 200 either way: a partly cached answer is still useful, and `null`
    // entries already mean "keep the English".
    { status: 200, headers: NO_STORE },
  );
}
