/*
 * MODEL BOUNDARY 5: the label vision read over the Anthropic API (metered).
 *
 * WHY THIS EXISTS BESIDE label_adapter.py. The Python adapter reads a label
 * through the local Claude CLI on the SUBSCRIPTION — zero marginal spend, but
 * it needs a machine with Python, this repo, and a signed-in CLI, which a
 * Vercel function is not. Founder decision 2026-08-22: the deployed app must
 * analyze uploads itself, so this file makes the same read over HTTPS with an
 * API key (`ANTHROPIC_API_KEY`, metered per token). Two backends, ONE brain:
 *
 *   - the prompt is read from prompts/label.md — the same file label_adapter
 *     renders, with the same {VOCAB} block, so a label reads identically on
 *     either backend and invariant 3 has one prompt to version
 *   - the model is the same tier-A pin (label reading is OCR + a vocabulary
 *     mapping, the same shape as S1/S8; measured correct on the synthetic
 *     label 2026-08-21). `LABEL_MODEL` env overrides, mirroring SP_LABEL_MODEL
 *   - the output contract is schemas/label.json semantics: null is a valid
 *     answer everywhere, evidence spans required, no salt->moiety arithmetic
 *
 * The CLI backend needed a `Read` tool exemption because it had no way to pass
 * an image inline. The API has one — an image content block — so THIS backend
 * is a true pure function: one request, zero tools, no turns. The exemption in
 * CLAUDE.md invariant 2 stays scoped to the CLI adapter alone.
 *
 * Marginal cost is real here, unlike everywhere else in the pipeline. One read
 * is a few hundred output tokens against a ~2k-token prompt plus the image —
 * fractions of a cent on the tier-A model — but it is METERED, which the
 * subscription path never was. CLAUDE.md's cost accounting section is updated
 * accordingly; do not copy this pattern into the S1–S8 extractors.
 */
import fs from "node:fs";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { vocabBlock } from "./vocab";

const ROOT = process.cwd();

/** Bump together with prompts/label.md — mirrors label_adapter.LABEL_PROMPT_VERSION. */
export const LABEL_PROMPT_VERSION = "label-v1.0";

/** Tier A, same reasoning as label_adapter.LABEL_MODEL (see header). */
const LABEL_MODEL = process.env.LABEL_MODEL ?? "claude-haiku-4-5";

export class LabelReadError extends Error {}

export type LabelMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface LabelRead {
  ingredient_vocab_id: string | null;
  ingredient_label_text: string | null;
  form_vocab_id: string | null;
  compound_dose_mg: number | null;
  dose_unit_as_printed: string | null;
  servings_per_day: number | null;
  is_multi_ingredient: boolean;
  other_actives: string[];
  brand: string | null;
  product_name: string | null;
  is_supplement_label: boolean;
  confidence: "high" | "medium" | "low";
  unreadable_reason: string | null;
  evidence_spans: string[];
  _meta: {
    model: string;
    prompt_version: string;
    elapsed_s: number;
    backend: "anthropic_api";
    input_tokens: number | null;
    output_tokens: number | null;
  };
}

function systemPrompt(): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "label.md"), "utf8");
  return raw.replace("{VOCAB}", vocabBlock());
}

/**
 * The object out of the model's text. Same tolerance as the Python adapter's
 * _extract_json: a markdown fence is forgiven (the model emits one about half
 * the time even when told not to), anything worse is an error — no repair of
 * truncated JSON, because a partially-parsed label is how a wrong dose reaches
 * the score.
 */
function extractJson(text: string): Record<string, unknown> {
  let body = (text ?? "").trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new LabelReadError(`no JSON object in model output: ${body.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch (err) {
    throw new LabelReadError(`unparseable JSON from model: ${String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LabelReadError("model returned JSON that is not an object");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Normalise then validate — mirrors label_adapter._validate and its measured
 * lesson: the model answers `"other_actives": null` on single-ingredient labels,
 * which is a reasonable way to say "none", so optional fields are defaulted
 * BEFORE the required-field check. Required fields are never defaulted: "the
 * model did not answer" and "the label does not print a dose" are different
 * facts, and only one is safe to show as "dose not assessable".
 */
function validate(obj: Record<string, unknown>): LabelRead {
  const defaults: Record<string, unknown> = {
    ingredient_label_text: null,
    dose_unit_as_printed: null,
    servings_per_day: null,
    other_actives: [],
    brand: null,
    product_name: null,
    is_supplement_label: true,
    unreadable_reason: null,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (obj[key] === null || obj[key] === undefined) obj[key] = value;
  }

  const required = [
    "ingredient_vocab_id",
    "form_vocab_id",
    "compound_dose_mg",
    "is_multi_ingredient",
    "confidence",
    "evidence_spans",
  ];
  for (const key of required) {
    if (!(key in obj)) throw new LabelReadError(`label read is missing required field ${key}`);
  }
  if (!["high", "medium", "low"].includes(String(obj.confidence))) {
    throw new LabelReadError(`invalid confidence ${String(obj.confidence)}`);
  }
  if (!Array.isArray(obj.evidence_spans)) {
    throw new LabelReadError("evidence_spans must be an array");
  }
  const dose = obj.compound_dose_mg;
  if (dose !== null && (typeof dose !== "number" || !Number.isFinite(dose) || dose < 0)) {
    throw new LabelReadError(`compound_dose_mg must be a non-negative number or null, got ${String(dose)}`);
  }
  return obj as unknown as LabelRead;
}

export function apiKeyPresent(): boolean {
  // Both env credentials the SDK resolves headlessly. (It can also read an
  // `ant auth login` OAuth profile from disk, but a serverless function has no
  // profile directory, so on Vercel these two are the whole story.)
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** One image -> one validated label read. Throws LabelReadError on failure. */
export async function readLabel(imageBase64: string, mediaType: LabelMediaType): Promise<LabelRead> {
  if (!apiKeyPresent()) {
    throw new LabelReadError("ANTHROPIC_API_KEY is not configured on this deployment");
  }
  const client = new Anthropic();
  const started = Date.now();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: LABEL_MODEL,
      // A label read is a few hundred tokens of JSON; the cap is generous
      // headroom, not a target.
      max_tokens: 2048,
      system: systemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: "This is the supplement label image. Return only the JSON object.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new LabelReadError(`Anthropic API error ${err.status ?? "?"}: ${err.message}`);
    }
    throw new LabelReadError(`could not reach the Anthropic API: ${String(err)}`);
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const read = validate(extractJson(text));
  read._meta = {
    model: LABEL_MODEL,
    prompt_version: LABEL_PROMPT_VERSION,
    elapsed_s: Math.round((Date.now() - started) / 10) / 100,
    backend: "anthropic_api",
    input_tokens: response.usage?.input_tokens ?? null,
    output_tokens: response.usage?.output_tokens ?? null,
  };
  return read;
}
