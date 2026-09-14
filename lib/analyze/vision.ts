/*
 * The label vision read for the deployed app.
 *
 * Since 2026-09-07 this file owns only the PROMPT and the CONTRACT of a label
 * read; the transport lives in ./llm.ts, the one TypeScript model boundary.
 * Nothing here reads a key or names an endpoint.
 *
 * Two backends, ONE brain: the prompt is prompts/label.md — the same file
 * label_adapter.py renders, with the same {VOCAB} block — so a label reads
 * identically on the CLI backend and on the API backend, and invariant 3 has
 * one prompt to version. `LABEL_PROMPT_VERSION` mirrors
 * label_adapter.LABEL_PROMPT_VERSION and both must move together.
 *
 * The prompt travels as the leading TEXT PART of the one user message, not as
 * a system message: some vision endpoints (DeepSeek's, verified in its docs)
 * reject requests pairing images with system messages, and a one-shot pure
 * function loses nothing by carrying its instructions in-message.
 *
 * NULL IS A VALID ANSWER EVERYWHERE (invariant 5). Optional fields are
 * defaulted BEFORE validation (models answer `"other_actives": null` to mean
 * "none"); required fields are never defaulted, because "the model did not
 * answer" and "the label prints no dose" are different facts and only one is
 * safe to show as "dose not assessable".
 */
import fs from "node:fs";
import path from "node:path";

import {
  ModelCallError,
  chat,
  extractJson,
  providerConfigured,
  validateAgainstSchema,
  visionModel,
  type ChatFn,
} from "./llm";
import { vocabBlock } from "./vocab";

const ROOT = process.cwd();

/** Bump together with prompts/label.md and label_adapter.LABEL_PROMPT_VERSION. */
export const LABEL_PROMPT_VERSION = "label-v1.1";

/** One read's wall clock. The route's maxDuration is 60s; leave headroom. */
const TIMEOUT_MS = 50_000;

export class LabelReadError extends Error {}

export type LabelMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface LabelActive {
  name: string;
  compound_dose_mg: number | null;
  dose_unit_as_printed: string | null;
  form_text: string | null;
}

export interface LabelRead {
  ingredient_vocab_id: string | null;
  ingredient_label_text: string | null;
  form_vocab_id: string | null;
  compound_dose_mg: number | null;
  dose_unit_as_printed: string | null;
  servings_per_day: number | null;
  is_multi_ingredient: boolean;
  other_actives: string[];
  /** Every dosed active as printed (label-v1.1). Feeds the compatibility check. */
  actives: LabelActive[];
  /** Third-party seals and testing claims AS PRINTED — claims, not verifications. */
  certifications: string[];
  manufacturer: string | null;
  country_of_origin: string | null;
  warnings_printed: string[];
  claims_printed: string[];
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
    backend: string;
    input_tokens: number | null;
    output_tokens: number | null;
  };
}

export function apiKeyPresent(): boolean {
  return providerConfigured();
}

/**
 * Kill switch. LABEL_ANALYZER_ENABLED=0 turns the label analysis off without
 * touching the stored provider keys (founder 2026-08-23, conference prep).
 * Unset or any other value means enabled — a key is still required either way.
 */
export function analyzerEnabled(): boolean {
  return process.env.LABEL_ANALYZER_ENABLED !== "0" && providerConfigured();
}

function labelPrompt(): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "label.md"), "utf8");
  return raw.replace("{VOCAB}", vocabBlock());
}

const OPTIONAL_DEFAULTS: Record<string, unknown> = {
  ingredient_label_text: null,
  dose_unit_as_printed: null,
  servings_per_day: null,
  other_actives: [],
  actives: [],
  certifications: [],
  manufacturer: null,
  country_of_origin: null,
  warnings_printed: [],
  claims_printed: [],
  brand: null,
  product_name: null,
  is_supplement_label: true,
  unreadable_reason: null,
};

/** Normalise then validate — mirrors label_adapter._validate. */
export function validateLabel(obj: Record<string, unknown>): LabelRead {
  for (const [key, value] of Object.entries(OPTIONAL_DEFAULTS)) {
    if (obj[key] === null || obj[key] === undefined) obj[key] = value;
  }
  // Tolerate the two shapes models actually emit for the actives list.
  if (Array.isArray(obj.actives)) {
    obj.actives = obj.actives
      .map((a) => {
        if (typeof a === "string") {
          return { name: a, compound_dose_mg: null, dose_unit_as_printed: null, form_text: null };
        }
        if (a && typeof a === "object") {
          const row = a as Record<string, unknown>;
          return {
            name: String(row.name ?? "").slice(0, 120),
            compound_dose_mg: typeof row.compound_dose_mg === "number" ? row.compound_dose_mg : null,
            dose_unit_as_printed: row.dose_unit_as_printed == null ? null : String(row.dose_unit_as_printed).slice(0, 60),
            form_text: row.form_text == null ? null : String(row.form_text).slice(0, 120),
          };
        }
        return null;
      })
      .filter((a): a is LabelActive => Boolean(a && a.name));
  }
  for (const key of ["certifications", "warnings_printed", "claims_printed", "other_actives"]) {
    if (!Array.isArray(obj[key])) obj[key] = [];
    obj[key] = (obj[key] as unknown[]).filter((x) => typeof x === "string" && x.trim()).map((x) => String(x));
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
  let clean: Record<string, unknown>;
  try {
    clean = validateAgainstSchema(obj, "label.json");
  } catch (err) {
    throw new LabelReadError(err instanceof Error ? err.message : String(err));
  }
  return clean as unknown as LabelRead;
}

/** One image -> one validated label read. Throws LabelReadError on failure. */
export async function readLabel(
  imageBase64: string,
  mediaType: LabelMediaType,
  chatFn: ChatFn = chat,
): Promise<LabelRead> {
  let result;
  try {
    result = await chatFn({
      purpose: "label read",
      model: visionModel(),
      timeoutMs: TIMEOUT_MS,
      // A label read is a few hundred tokens of JSON. The cap is generous
      // because a reasoning model spends its thinking against the SAME budget
      // and empties the answer when it runs out (2048 failed 2026-08-23, 8192
      // failed on label-v1.1 2026-09-14) — llm.ts now disables thinking, and
      // this ceiling is the belt to that braces.
      maxTokens: 8192,
      jsonMode: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: labelPrompt() },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
            { type: "text", text: "This is the supplement label image. Return only the JSON object." },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof ModelCallError) {
      if (err.kind === "no_key") {
        throw new LabelReadError("no model API key configured (set DEEPSEEK_API_KEY or VISION_API_KEY)");
      }
      if (err.kind === "quota") {
        throw new LabelReadError("the vision quota is exhausted for now — try again in a minute or two");
      }
      throw new LabelReadError(err.message);
    }
    throw new LabelReadError(String(err));
  }

  let obj: Record<string, unknown>;
  try {
    obj = extractJson(result.text);
  } catch (err) {
    throw new LabelReadError(err instanceof Error ? err.message : String(err));
  }
  const read = validateLabel(obj);
  read._meta = {
    model: result.model,
    prompt_version: LABEL_PROMPT_VERSION,
    elapsed_s: result.elapsed_s,
    backend: result.backend,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
  };
  return read;
}
