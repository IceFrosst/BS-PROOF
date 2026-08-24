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

/*
 * How much literature EXISTS for an ingredient we have not scored. A count,
 * explicitly labelled as one — it answers "is there anything to read", never
 * "does it work". Query shape mirrors sources/europepmc.py `_query` at
 * supplement scope (field-scoped since the 2026-08-19 fix). Fails soft: a
 * census is a nice-to-have on a path that already has an honest answer.
 */
async function census(ingredient: string): Promise<Json> {
  const ing = ingredient.split("_").join(" ").trim();
  const supplementScoped = [
    "TITLE:supplementation",
    "ABSTRACT:supplementation",
    'TITLE:"dietary supplement"',
    'ABSTRACT:"dietary supplement"',
    'TITLE:"oral supplement"',
    'ABSTRACT:"oral supplement"',
    "TITLE:oral",
    "ABSTRACT:oral",
  ].join(" OR ");
  const exclusions =
    "eclampsia OR anesthesia OR anaesthesia OR surgery OR intravenous OR infusion " +
    "OR intubation OR ventilation OR sedation OR perioperative OR postoperative " +
    "OR preoperative OR ketamine";

  const count = async (kinds: string): Promise<number> => {
    const query =
      `("${ing}") AND (SRC:"MED") AND (${kinds}) ` +
      `AND (${supplementScoped}) NOT (${exclusions})`;
    const url =
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" +
      new URLSearchParams({ query, format: "json", pageSize: "1" }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Europe PMC ${res.status}`);
    const page = (await res.json()) as { hitCount?: number };
    return page.hitCount ?? 0;
  };

  try {
    const [rcts, syntheses] = await Promise.all([
      count('PUB_TYPE:"Randomized Controlled Trial"'),
      count(
        'PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review" ' +
          'OR TITLE:"umbrella review" OR TITLE:"overview of reviews"',
      ),
    ]);
    return {
      available: true,
      rcts_indexed: rcts,
      syntheses_indexed: syntheses,
      source: "Europe PMC",
      scope: "supplement",
      is_a_score: false,
      means:
        "How many trials EXIST. Not what they found — direction and quality " +
        "require extraction, which has not been run for this product.",
    };
  } catch (err) {
    return { available: false, reason: String(err), is_a_score: false };
  }
}

/*
 * Record demand for a product we cannot score yet. On Vercel the filesystem is
 * read-only outside /tmp and functions are ephemeral, so a durable queue needs
 * a store this app deliberately does not have (no Supabase — handoff decision).
 * Best-effort: try the repo's out/ dir (works locally / self-hosted), fall
 * back to /tmp (survives warm invocations only), and never fail the request
 * over it. `durable: false` tells the UI not to promise anything.
 */
async function enqueue(ingredient: string | null, form: string | null, labelText: string | null): Promise<Json> {
  if (!ingredient && !labelText) return { queued: false, reason: "nothing identifiable to queue" };
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const key = ingredient ?? `?${labelText}`;
  const candidates = [
    path.join(process.cwd(), "out", "analysis_queue.json"),
    path.join("/tmp", "bsproof_analysis_queue.json"),
  ];
  for (const file of candidates) {
    try {
      let data: { schema_version: string; requests: Json[] } = {
        schema_version: "AnalysisQueueV1",
        requests: [],
      };
      try {
        // turbopackIgnore: the path is a runtime queue location (repo out/ or
        // /tmp), not an asset to bundle — without the annotation this variable
        // path makes the bundler trace the ENTIRE project into the function.
        data = JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8"));
      } catch {
        /* first write */
      }
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const existing = data.requests.find((r) => r.ingredient === key && r.form === form);
      if (existing) {
        existing.count = Number(existing.count ?? 1) + 1;
        existing.last_requested_at = now;
      } else {
        data.requests.push({
          ingredient: key,
          form,
          label_text: labelText,
          in_vocab: Boolean(ingredient),
          count: 1,
          first_requested_at: now,
          last_requested_at: now,
          status: "pending",
        });
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
      return {
        queued: true,
        durable: !file.startsWith("/tmp"),
        note: "recorded for a future run; nothing runs automatically",
      };
    } catch {
      /* next candidate */
    }
  }
  return { queued: false, reason: "no writable queue location on this host" };
}

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
