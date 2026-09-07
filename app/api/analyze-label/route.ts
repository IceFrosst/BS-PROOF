/*
 * THE DASHBOARD'S FIRST RUNTIME API — and since 2026-08-22, one that runs on
 * Vercel. Read this before adding a second one.
 *
 * Every other route in this app is statically rendered from immutable
 * `DashboardRunV1` artifacts. This one accepts ONE image and returns ONE JSON
 * answer about that product. The founder's requirement (2026-08-22): the
 * analysis must happen in the background via an AI API and work on Vercel —
 * not require a local machine.
 *
 * The pipeline, all in-process (no Python, no subprocess, no CLI):
 *
 *   lib/analyze/vision.readLabel          image  -> printed COMPOUND dose  [MODEL, free-tier API]
 *   lib/analyze/vocab.elementalDoseRangeMg compound -> elemental mg        [exact]
 *   lib/analyze/product-score.scoreProduct elemental -> rows + four arcs   [exact]
 *   Europe PMC hitCount (fetch)           on a miss -> evidence census     [count]
 *
 * The deterministic pieces are line-for-line TypeScript ports of the Python
 * originals, pinned by tests/analyze-parity.test.ts to golden values computed
 * BY the Python code — one scoring model, verified in two languages, never a
 * second opinion. The vision read shares prompts/label.md with the CLI
 * adapter, so a label reads the same on either backend.
 *
 * What this route still never does: write to reports/, mutate an artifact,
 * start a pipeline run, or emit a number without its four arcs and validity
 * block. An unscored ingredient gets a COUNT (explicitly is_a_score: false)
 * and a queued request — nothing drains that queue automatically, because a
 * full extraction (~40 min, ~1000 calls) competing with a run in progress is
 * the failure that cost the 2026-08-10 run 364 of 906 calls.
 *
 * Deployment requirements (Vercel):
 *   - env GEMINI_API_KEY (or VISION_API_KEY) — a FREE key from Google AI
 *     Studio; the default vision backend is the Gemini free tier (~1,500
 *     reads/day, images included). VISION_API_URL + LABEL_MODEL switch the
 *     provider to any OpenAI-compatible endpoint (DeepSeek, Groq, OpenRouter)
 *     without a code change — see lib/analyze/vision.ts.
 *   - next.config.ts traces reports/runs/*_dashboard.json, run_statuses.json,
 *     vocab/*.json and prompts/label.md into this function's bundle
 * Without a key, POSTs return `analyzer_unavailable` and the static site is
 * unaffected.
 */
import { NextResponse } from "next/server";

import { census, enqueue } from "@/lib/analyze/census";
import { scoreProduct, availableProducts } from "@/lib/analyze/product-score";
import { readLabel, analyzerEnabled, LabelReadError, type LabelMediaType } from "@/lib/analyze/vision";
import { elementalDoseRangeMg, ingredientIds, resolveIngredientForm } from "@/lib/analyze/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type Json = Record<string, unknown>;

// The census and the demand queue are shared with /api/scan (lib/analyze/census).

export async function POST(request: Request): Promise<NextResponse> {
  if (!analyzerEnabled()) {
    return NextResponse.json(
      {
        status: "analyzer_unavailable",
        error:
          "Label reading is not enabled on this deployment — either no vision API key is set (GEMINI_API_KEY or VISION_API_KEY) or LABEL_ANALYZER_ENABLED=0.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { status: "bad_request", error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { status: "bad_request", error: "No image field in the upload." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { status: "bad_request", error: "That image is empty." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        status: "bad_request",
        error: `That image is ${(file.size / 1e6).toFixed(1)} MB. The limit is ${(MAX_BYTES / 1e6).toFixed(0)} MB.`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        status: "bad_request",
        error: `Unsupported image type ${file.type || "(none)"}. Use PNG, JPEG, WebP or GIF.`,
      },
      { status: 415 },
    );
  }

  const started = Date.now();
  const out: Json = {
    schema_version: "LabelAnalysisV1",
    analyzed_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };

  // The upload never touches disk: straight to base64 and into the API call.
  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let label;
  try {
    label = await readLabel(imageBase64, file.type as LabelMediaType);
  } catch (err) {
    const isRead = err instanceof LabelReadError;
    return NextResponse.json(
      {
        ...out,
        status: "label_unreadable",
        error: isRead ? String((err as Error).message) : "The label could not be read.",
        timing_s: Math.round((Date.now() - started) / 10) / 100,
      },
      { status: isRead ? 200 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  out.label = label;

  if (!label.is_supplement_label) {
    out.status = "not_a_supplement_label";
    out.timing_s = Math.round((Date.now() - started) / 10) / 100;
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  }

  // Vocabulary repair before any lookup: models regularly return the FORM id
  // ("creatine_monohydrate") in the ingredient field, because that is what the
  // label's ingredient line literally prints. Unrepaired, a fully-scored
  // product fell through to not_scored + census (HANDOFF 2026-08-23, measured
  // live on DeepSeek). Deterministic — every form id has exactly one parent.
  const resolved = resolveIngredientForm(label.ingredient_vocab_id, label.form_vocab_id);
  const ingredient = resolved.ingredient && ingredientIds().includes(resolved.ingredient)
    ? resolved.ingredient
    : null;
  const formId = resolved.form;
  const printed = label.compound_dose_mg;

  if (!ingredient) {
    out.status = "ingredient_not_supported";
    out.ingredient_label_text = label.ingredient_label_text;
    out.supported_ingredients = ingredientIds().sort();
    out.queue = await enqueue(null, null, label.ingredient_label_text);
    out.timing_s = Math.round((Date.now() - started) / 10) / 100;
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  }

  // Compound -> elemental, deterministically. A form of null (label stated no
  // form) refuses, which is the correct answer.
  const elemental = elementalDoseRangeMg(ingredient, formId, printed);
  out.product = {
    ingredient,
    form: formId,
    compound_dose_mg: printed,
    elemental_dose_mg: elemental,
    is_multi_ingredient: Boolean(label.is_multi_ingredient),
    other_actives: label.other_actives ?? [],
  };

  // The dose used for scoring is the elemental interval's low end when the
  // conversion succeeded, and null when it refused. Never the printed compound
  // number — that is a different quantity from the trial doses.
  const doseForScore = elemental.low;
  const result = scoreProduct(ingredient, formId ?? "", doseForScore);
  out.result = result;
  out.status = result.status;

  if (result.status !== "scored") {
    out.census = await census(ingredient);
    out.queue = await enqueue(ingredient, formId, label.ingredient_label_text);
  }

  const caveats: Json[] = [];
  if (label.is_multi_ingredient) {
    caveats.push({
      code: "multi_ingredient_product",
      text:
        `This product doses more than one active. The evidence below is about ${ingredient} ` +
        "on its own, which is not the same question as this blend.",
      other_actives: label.other_actives ?? [],
    });
  }
  if (elemental.basis === "compound_only" || elemental.basis === "unstated") {
    caveats.push({
      code: "dose_not_convertible",
      text:
        "The dose axis is unavailable: " +
        (elemental.basis === "unstated"
          ? "no per-serving mass for this ingredient is printed on the label."
          : "this form's hydration state is not stated, so its elemental dose cannot be computed without guessing."),
    });
  }
  if (caveats.length) out.caveats = caveats;

  out.timing_s = Math.round((Date.now() - started) / 10) / 100;
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

/*
 * GET: what can this deployment actually answer? Lets the UI say "creatine
 * monohydrate is scored; everything else gets a census" without hardcoding.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      analyzer_available: analyzerEnabled(),
      scored_products: availableProducts(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
