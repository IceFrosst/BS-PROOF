/*
 * POST /api/scan — one label image in, one ScanAnalysisV1 out.
 *
 * The product's full analysis (founder 2026-09-07): evidence score with its
 * four arcs, dose effectiveness, form and ingredient compatibility, and the
 * company's background — each section stamped with WHERE it came from. The
 * orchestration and every stage live in lib/analyze/scan.ts; this file only
 * validates the upload and maps the outcome to HTTP.
 *
 * /api/analyze-label remains as the earlier, evidence-only endpoint the tester
 * page uses. Both share the label read, the scorer, the census and the queue.
 *
 * Deployment: a model key (DEEPSEEK_API_KEY, or VISION_API_KEY / GEMINI_API_KEY)
 * and the traced files in next.config.ts (run artifacts, vocab, prompts,
 * schemas). Without a key, POST returns analyzer_unavailable (503) and the rest
 * of the site is unaffected.
 */
import { NextResponse } from "next/server";

import { availableProducts } from "@/lib/analyze/product-score";
import { BASIS_LEGEND, analyzeScan } from "@/lib/analyze/scan";
import { analyzerEnabled, type LabelMediaType } from "@/lib/analyze/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<NextResponse> {
  if (!analyzerEnabled()) {
    return NextResponse.json(
      {
        status: "analyzer_unavailable",
        error:
          "Scanning is not enabled on this deployment — no model API key is set (DEEPSEEK_API_KEY or VISION_API_KEY) or LABEL_ANALYZER_ENABLED=0.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "bad_request", error: "Expected a multipart form upload." }, { status: 400 });
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

/** What this deployment can answer, and how to read the badges. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      analyzer_available: analyzerEnabled(),
      scored_products: availableProducts(),
      sections: ["label", "evidence", "dose_effectiveness", "compatibility", "company"],
      basis_legend: BASIS_LEGEND,
    },
    { headers: NO_STORE },
  );
}
