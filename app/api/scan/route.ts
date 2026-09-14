/*
 * POST /api/scan — one label image in, one ScanAnalysisV1 out.
 *                  or one typed product (JSON) in, the same ScanAnalysisV1 out.
 *
 * The product's full analysis (founder 2026-09-07): evidence score with its
 * four arcs, dose effectiveness, form and ingredient compatibility, and the
 * company's background — each section stamped with WHERE it came from. The
 * orchestration and every stage live in lib/analyze/scan.ts; this file only
 * validates the request and maps the outcome to HTTP.
 *
 * TWO BODIES, ONE ROUTE (2026-09-15, founder-approved option 1). A multipart
 * upload with an `image` field is the photo path (stage 0 = vision read). An
 * `application/json` body `{ source: "manual", ingredient, form, dose?,
 * servings_per_day? }` is the manual search path (stage 0' = validation, no
 * model). Both run the same stages 1-5 via `analyzeFromLabel`, and the answer
 * says which it was (`source`) so the client never renders typed figures as a
 * label read. A second route would have been a second orchestration to drift.
 *
 * The photo path needs a model key; the manual path does not — its evidence
 * score is deterministic and its model sections degrade to `unavailable` on
 * their own — so only the photo path is refused when no provider is
 * configured. The LABEL_ANALYZER_ENABLED=0 kill switch stops both.
 *
 * /api/analyze-label remains as the earlier, evidence-only endpoint the tester
 * page uses. Both share the label read, the scorer, the census and the queue.
 *
 * Deployment: a model key (DEEPSEEK_API_KEY, or VISION_API_KEY / GEMINI_API_KEY)
 * and the traced files in next.config.ts (run artifacts, vocab, prompts,
 * schemas). Without a key, a photo POST returns analyzer_unavailable (503) and
 * the rest of the site is unaffected.
 */
import { NextResponse } from "next/server";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { MANUAL_DOSE_UNITS } from "@/lib/analyze/manual-dose";
import { availableProducts } from "@/lib/analyze/product-score";
import { BASIS_LEGEND, analyzeManual, analyzeScan } from "@/lib/analyze/scan";
import { analyzerEnabled, type LabelMediaType } from "@/lib/analyze/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
/*
 * A typed entry is a few hundred bytes; 16 KiB is generous. Checked TWICE:
 * against Content-Length before the body is read, so an oversize body is
 * refused without buffering it, and against the bytes actually read, because a
 * chunked or mis-declared body carries no trustworthy length. Both answer 413
 * with the same status so a client sees one contract however it was caught.
 */
const MAX_JSON_BYTES = 16 * 1024;
const ALLOWED_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const NO_STORE = { "Cache-Control": "no-store" };

function killSwitchOn(): boolean {
  return process.env.LABEL_ANALYZER_ENABLED === "0";
}

function tooLarge(): NextResponse {
  return NextResponse.json(
    { status: "payload_too_large", error: `That request is too large. A typed entry is at most ${MAX_JSON_BYTES / 1024} KiB.`, source: "manual" },
    { status: 413, headers: NO_STORE },
  );
}

async function manualPost(request: Request): Promise<NextResponse> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) return tooLarge();

  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Could not read the request body." }, { status: 400, headers: NO_STORE });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) return tooLarge();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Expected a JSON object." }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object" || (body as { source?: unknown }).source !== "manual") {
    return NextResponse.json(
      { status: "bad_request", error: 'A JSON body must carry source: "manual" with ingredient, form and an optional dose.' },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const analysis = await analyzeManual(body);
    if (analysis.status === "manual_input_invalid") {
      return NextResponse.json({ status: analysis.status, error: analysis.error, source: "manual" }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(analysis, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { status: "analyzer_failed", error: err instanceof Error ? err.message : "The analysis failed.", source: "manual" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (killSwitchOn()) {
    return NextResponse.json(
      { status: "analyzer_unavailable", error: "Scanning is switched off on this deployment (LABEL_ANALYZER_ENABLED=0)." },
      { status: 503, headers: NO_STORE },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) return manualPost(request);

  if (!analyzerEnabled()) {
    return NextResponse.json(
      {
        status: "analyzer_unavailable",
        error:
          "Photo scanning is not enabled on this deployment — no model API key is set (DEEPSEEK_API_KEY or VISION_API_KEY). Searching for a supplement by name still works.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Expected a multipart form upload or a JSON body." }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ status: "bad_request", error: "No image field in the upload." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ status: "bad_request", error: "That image is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { status: "bad_request", error: `That image is ${(file.size / 1e6).toFixed(1)} MB. The limit is ${(MAX_BYTES / 1e6).toFixed(0)} MB.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { status: "bad_request", error: `Unsupported image type ${file.type || "(none)"}. Use PNG, JPEG, WebP or GIF.` },
      { status: 415 },
    );
  }

  // The upload never touches disk: straight to base64 and into the model call.
  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const analysis = await analyzeScan(imageBase64, file.type as LabelMediaType);
    return NextResponse.json(analysis, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { status: "analyzer_failed", error: err instanceof Error ? err.message : "The scan failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}

/**
 * What this deployment can answer, and how to read the badges. `catalog` is
 * the slim, server-derived ingredient × form list the manual path accepts —
 * labels, aliases and conversion behaviour, never molar-mass internals.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      analyzer_available: analyzerEnabled() && !killSwitchOn(),
      manual_available: !killSwitchOn(),
      scored_products: availableProducts(),
      sections: ["label", "evidence", "dose_effectiveness", "compatibility", "company"],
      basis_legend: BASIS_LEGEND,
      catalog: ingredientCatalog(),
      manual_input: {
        body: { source: "manual", ingredient: "<catalog id>", form: "<form id>", dose: { value: 0, unit: "mg" }, servings_per_day: 1 },
        dose_units: MANUAL_DOSE_UNITS,
        note: "dose and servings_per_day are optional; IU is not accepted",
      },
    },
    { headers: NO_STORE },
  );
}
