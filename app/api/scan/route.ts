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
 *
 * SCAN-RUN HISTORY (2026-09-16). Every ACCEPTED run — one that reached
 * `analyzeScan`/`analyzeManual`, not a request rejected before that (bad
 * JSON, oversize, wrong content type) — is durably recorded by
 * `lib/scan-history/store.ts`: the complete ScanAnalysis JSON, the request
 * facts, the terminal status/error, this exact app release, and, for a photo,
 * the original image in a private Supabase Storage bucket (never base64 in
 * the database). The run id is generated BEFORE analysis and is always the
 * same id used to store the image and the row, so the two can never disagree.
 * `run_id`, `app_version` and `persistence` are attached to the response
 * AFTER `analyzeScan`/`analyzeManual` return — those functions know nothing
 * about history and stay exactly as tested. With no Supabase project
 * configured, persistence reports `unavailable` and the scan still answers
 * (local/test builds need no credentials). Set `SCAN_HISTORY_REQUIRED=1` to
 * make this fail closed instead: a run whose history could not be durably
 * stored is answered with `scan_history_required_failed` (500), never with an
 * unrecorded result. There is no read endpoint here and no signed image URL
 * is ever minted — see docs/scan-history.sql.
 */
import { NextResponse } from "next/server";

import { ingredientCatalog } from "@/lib/analyze/catalog";
import { MANUAL_DOSE_UNITS } from "@/lib/analyze/manual-dose";
import { availableProducts } from "@/lib/analyze/product-score";
import { BASIS_LEGEND, analyzeManual, analyzeScan, type ScanAnalysis } from "@/lib/analyze/scan";
import {
  appVersionInfo,
  newRunId,
  recordScanRun,
  scanHistoryConfigured,
  scanHistoryRequired,
  scanHistorySatisfies,
  type ScanHistorySource,
} from "@/lib/scan-history/store";
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

/**
 * Refuses the request up front when history is REQUIRED but not configured —
 * before any model call runs, so a run that could never be recorded never
 * spends a model call producing a result that would just be discarded.
 */
function historyRequiredButUnavailable(): NextResponse | null {
  if (!scanHistoryRequired() || scanHistoryConfigured()) return null;
  return NextResponse.json(
    {
      status: "scan_history_required_unavailable",
      error:
        "This deployment requires durable scan history (SCAN_HISTORY_REQUIRED=1) but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured.",
    },
    { status: 503, headers: NO_STORE },
  );
}

/**
 * Records one accepted run and decides what the caller sees. In the default
 * (non-required) mode, the analysis is always returned with an honest
 * `persistence` block, however that write went. In
 * `SCAN_HISTORY_REQUIRED=1` mode, a run that could not be durably recorded
 * (per `scanHistorySatisfies`) is answered with a failure instead of the
 * analysis — never an unrecorded result presented as a normal answer.
 */
async function finishAndRecord(args: {
  runId: string;
  source: ScanHistorySource;
  analysis: ScanAnalysis;
  request: Record<string, unknown>;
  image?: { bytes: Buffer; mimeType: string } | null;
  responseInit?: { status?: number };
}): Promise<NextResponse> {
  const { runId, source, analysis, request, image, responseInit } = args;
  const outcome = await recordScanRun({
    runId,
    source,
    status: analysis.status,
    error: analysis.error ?? null,
    request,
    analysis,
    image: image ?? null,
  });
  if (scanHistoryRequired() && !scanHistorySatisfies(outcome, source)) {
    return NextResponse.json(
      {
        status: "scan_history_required_failed",
        run_id: runId,
        error: "The analysis completed but could not be durably recorded, and this deployment requires that it is.",
        persistence: outcome,
      },
      { status: 500, headers: NO_STORE },
    );
  }
  const withHistory: ScanAnalysis = { ...analysis, run_id: runId, app_version: appVersionInfo(), persistence: outcome };
  return NextResponse.json(withHistory, { status: responseInit?.status, headers: NO_STORE });
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
  const historyGate = historyRequiredButUnavailable();
  if (historyGate) return historyGate;

  // Generated before analysis runs, and only for a body that passed the
  // shape check above -- an outright malformed request was never "accepted"
  // and has nothing worth a history row.
  const runId = newRunId();
  try {
    const analysis = await analyzeManual(body);
    if (analysis.status === "manual_input_invalid") {
      return NextResponse.json({ status: analysis.status, error: analysis.error, source: "manual" }, { status: 400, headers: NO_STORE });
    }
    return await finishAndRecord({ runId, source: "manual", analysis, request: body as Record<string, unknown> });
  } catch (err) {
    const analysis: ScanAnalysis = {
      schema_version: "ScanAnalysisV1",
      analyzed_at: new Date().toISOString(),
      source: "manual",
      status: "analyzer_failed",
      error: err instanceof Error ? err.message : "The analysis failed.",
      basis_legend: BASIS_LEGEND,
      meta: { timing_s: 0, stages: {}, provider_configured: false, models: { vision: null, text: null }, prompt_versions: {} },
    };
    return await finishAndRecord({ runId, source: "manual", analysis, request: body as Record<string, unknown>, responseInit: { status: 500 } });
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

  const historyGate = historyRequiredButUnavailable();
  if (historyGate) return historyGate;

  // The upload never touches disk: one buffer feeds both the model call (as
  // base64) and, on an accepted run, the private-bucket upload -- read once.
  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = imageBuffer.toString("base64");

  // Generated before analysis runs, for every request that reached here (past
  // every rejection above).
  const runId = newRunId();
  const requestFacts = { content_type: file.type, size_bytes: imageBuffer.length };
  try {
    const analysis = await analyzeScan(imageBase64, file.type as LabelMediaType);
    return await finishAndRecord({
      runId,
      source: "photo",
      analysis,
      request: requestFacts,
      image: { bytes: imageBuffer, mimeType: file.type },
    });
  } catch (err) {
    const analysis: ScanAnalysis = {
      schema_version: "ScanAnalysisV1",
      analyzed_at: new Date().toISOString(),
      source: "photo",
      status: "analyzer_failed",
      error: err instanceof Error ? err.message : "The scan failed.",
      basis_legend: BASIS_LEGEND,
      meta: { timing_s: 0, stages: {}, provider_configured: false, models: { vision: null, text: null }, prompt_versions: {} },
    };
    return await finishAndRecord({
      runId,
      source: "photo",
      analysis,
      request: requestFacts,
      image: { bytes: imageBuffer, mimeType: file.type },
      responseInit: { status: 500 },
    });
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
