/*
 * MODEL BOUNDARY 5: the label vision read over an OpenAI-compatible HTTP API.
 *
 * WHY THIS EXISTS BESIDE label_adapter.py. The Python adapter reads a label
 * through the local Claude CLI on the SUBSCRIPTION — zero marginal spend, but
 * it needs a machine with Python, this repo, and a signed-in CLI, which a
 * Vercel function is not. Founder decisions 2026-08-22, in order: the deployed
 * app must analyze uploads itself ("i don't want it to be local and i want it
 * work on vercel"), not on the Anthropic API ("it would be a deepseek api"),
 * and finally on a FREE api ("ok find a free api that accepts images then").
 *
 * THE DEFAULT IS THE GEMINI FREE TIER, verified 2026-08-22:
 *   - Google AI Studio issues free API keys, no card; the free tier covers the
 *     Flash models WITH image input (~10-15 requests/min, ~1,500/day — a label
 *     read is one request, so the quota is the daily upload budget)
 *   - Gemini exposes an OpenAI-compatible endpoint
 *     (https://generativelanguage.googleapis.com/v1beta/openai/chat/completions)
 *     taking standard `image_url` data-URL content parts and Bearer auth
 *
 * Because DeepSeek, Groq, OpenRouter and Gemini all speak this same envelope,
 * the provider is CONFIG, not code:
 *
 *   VISION_API_URL   chat-completions endpoint   (default: Gemini's, above)
 *   VISION_API_KEY   bearer key                  (GEMINI_API_KEY also accepted)
 *   LABEL_MODEL      model id                    (default: gemini-3.7-flash,
 *                                                 the id on the official compat
 *                                                 docs page 2026-08-22)
 *
 * e.g. DeepSeek (metered, vision model shipped 2026-08-21):
 *   VISION_API_URL=https://api.deepseek.com/chat/completions
 *   LABEL_MODEL=deepseek-v4-flash-vision-exp
 *
 * Two backends, ONE brain: the prompt is read from prompts/label.md — the same
 * file label_adapter renders, with the same {VOCAB} block — so a label reads
 * identically on either backend and invariant 3 has one prompt to version. The
 * output contract is schemas/label.json semantics: null is a valid answer
 * everywhere, evidence spans required, no salt->moiety arithmetic here.
 *
 * The prompt travels as the leading TEXT PART of the one user message, not as
 * a system message: some vision endpoints (DeepSeek's, verified in its docs)
 * reject requests pairing images with system messages, and a one-shot pure
 * function loses nothing by carrying its instructions in-message.
 *
 * PURITY, same bar as the Grok adapter (CLAUDE.md invariant 2): no chat memory
 * (single stateless request), fixed prompt version, temperature 0, zero tools
 * — the API takes the image inline, so the CLI adapter's Read-tool exemption
 * does not extend here.
 *
 * NEVER MERGED WITH THE CLI BACKEND (the invariant-9 discipline): a label read
 * answers one upload and is never stored, but `_meta.backend` records which
 * provider read it, so cross-provider disagreement stays attributable.
 */
import fs from "node:fs";
import path from "node:path";

import { vocabBlock } from "./vocab";

const ROOT = process.cwd();

/** Bump together with prompts/label.md — mirrors label_adapter.LABEL_PROMPT_VERSION. */
export const LABEL_PROMPT_VERSION = "label-v1.0";

const DEFAULT_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-3.7-flash";

const VISION_URL = process.env.VISION_API_URL ?? DEFAULT_URL;
const LABEL_MODEL = process.env.LABEL_MODEL ?? DEFAULT_MODEL;

/** One read's wall clock. The route's maxDuration is 60s; leave headroom. */
const TIMEOUT_MS = 50_000;

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
    backend: string;
    input_tokens: number | null;
    output_tokens: number | null;
  };
}

function apiKey(): string | undefined {
  // VISION_API_KEY is the canonical name; GEMINI_API_KEY is accepted because
  // it is the name AI Studio hands people and the default provider is Gemini.
  return process.env.VISION_API_KEY || process.env.GEMINI_API_KEY || undefined;
}

export function apiKeyPresent(): boolean {
  return Boolean(apiKey());
}

/**
 * Kill switch. LABEL_ANALYZER_ENABLED=0 turns the quick label analysis off
 * without touching the stored provider keys (founder 2026-08-23, conference
 * prep: the demo shows full-pipeline scored runs, not the quick vision read).
 * Unset or any other value means enabled — the key is still required either way.
 */
export function analyzerEnabled(): boolean {
  return process.env.LABEL_ANALYZER_ENABLED !== "0" && apiKeyPresent();
}

function labelPrompt(): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "label.md"), "utf8");
  return raw.replace("{VOCAB}", vocabBlock());
}

/**
 * The object out of the model's text. Same tolerance as the Python adapter's
 * _extract_json: a markdown fence is forgiven (models emit one about half the
 * time even when told not to), anything worse is an error — no repair of
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
 * lesson: models answer `"other_actives": null` on single-ingredient labels,
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

interface ChatCompletionsResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      // string on Gemini; some providers return an array of content parts.
      content?: string | Array<{ type?: string; text?: string }> | null;
      // Reasoning models (DeepSeek) stream chain-of-thought here; the final
      // answer is still `content`, but an empty content with a populated
      // reasoning_content + finish_reason "length" means the token budget
      // was eaten by reasoning before the answer started.
      reasoning_content?: string | null;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Message content -> plain text, tolerating the parts-array shape. */
function contentText(
  content: string | Array<{ type?: string; text?: string }> | null | undefined,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? "").join("");
  }
  return "";
}

/** One image -> one validated label read. Throws LabelReadError on failure. */
export async function readLabel(imageBase64: string, mediaType: LabelMediaType): Promise<LabelRead> {
  const key = apiKey();
  if (!key) {
    throw new LabelReadError(
      "no vision API key configured (set VISION_API_KEY or GEMINI_API_KEY)");
  }
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(VISION_URL, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: LABEL_MODEL,
        // Deterministic read: same purity bar as the Grok adapter.
        temperature: 0,
        // A label read is a few hundred tokens of JSON. Reasoning models
        // (DeepSeek vision) spend tokens on chain-of-thought BEFORE the
        // answer and count both against this cap: at 2048 the reasoning
        // consumed the whole budget and content came back empty with
        // finish_reason "length" (measured 2026-08-23). 8192 leaves room
        // for both; non-reasoning providers just never approach it.
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: labelPrompt() },
              {
                type: "image_url",
                image_url: { url: `data:${mediaType};base64,${imageBase64}` },
              },
              {
                type: "text",
                text: "This is the supplement label image. Return only the JSON object.",
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new LabelReadError(`label read timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new LabelReadError(`could not reach the vision API: ${String(err)}`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body unreadable; the status alone will have to do */
    }
    // 429 on the free tier means the daily/minute quota, not a broken upload —
    // say so, because "try again in a minute" is actionable and "error 429" is not.
    if (res.status === 429) {
      throw new LabelReadError(
        "the free vision quota is exhausted for now — try again in a minute or two");
    }
    throw new LabelReadError(`vision API error ${res.status}: ${detail}`);
  }

  const payload = (await res.json()) as ChatCompletionsResponse;
  const choice = payload.choices?.[0];
  const text = contentText(choice?.message?.content);
  if (!text) {
    // Say WHY there is no content: a reasoning model that spent the whole
    // max_tokens budget thinking reports finish_reason "length" with a
    // populated reasoning_content and an empty answer. Measured 2026-08-23
    // on deepseek's vision model -- the generic message hid exactly this.
    const finish = choice?.finish_reason ?? "unknown";
    const reasoned = choice?.message?.reasoning_content ? " after emitting reasoning_content" : "";
    throw new LabelReadError(
      `the vision API returned no message content (finish_reason: ${finish}${reasoned})`);
  }

  const read = validate(extractJson(text));
  read._meta = {
    model: LABEL_MODEL,
    prompt_version: LABEL_PROMPT_VERSION,
    elapsed_s: Math.round((Date.now() - started) / 10) / 100,
    backend: new URL(VISION_URL).hostname,
    input_tokens: payload.usage?.prompt_tokens ?? null,
    output_tokens: payload.usage?.completion_tokens ?? null,
  };
  return read;
}
