/*
 * THE TYPESCRIPT MODEL BOUNDARY. This is the one file under lib/, app/ and
 * components/ that may talk to a model API (CLAUDE.md invariant 1; enforced by
 * pipeline.invariants' text scan, TS_MODEL_BOUNDARY). Every model-backed answer
 * the deployed app produces -- the label read, the compatibility fill-in, the
 * company profile -- goes through `chat` / `chatJson` here and nowhere else.
 *
 * WHY ONE FILE. Founder 2026-09-07: the scan should analyze "all parts of a
 * background of the supplement" through the DeepSeek API. That is three model
 * calls per scan instead of one, and three copies of "fetch + bearer + parse the
 * choices array + tolerate a markdown fence" is how three providers' quirks end
 * up handled three different ways. One transport, one JSON extractor, one
 * schema validator; the callers own only their prompt and their schema.
 *
 * PROVIDER IS CONFIG, NOT CODE. Any OpenAI-compatible chat-completions endpoint
 * works (DeepSeek, Gemini's compat endpoint, Groq, OpenRouter):
 *
 *   DEEPSEEK_API_KEY   bearer key (VISION_API_KEY / GEMINI_API_KEY still read,
 *                      because that is what earlier deployments set)
 *   MODEL_API_URL      chat-completions endpoint (VISION_API_URL accepted)
 *                      default: https://api.deepseek.com/chat/completions
 *   LABEL_MODEL        vision model id   default deepseek-v4-flash-vision-exp
 *   TEXT_MODEL         text model id     default deepseek-chat
 *
 * The defaults moved to DeepSeek on 2026-09-07 (founder: "they get a result
 * through deepseek api"). Verify a model id against the provider before setting
 * it -- the 2026-08-07 `grok-4.3` incident was an id copied from a pricing
 * table that the CLI did not accept, and it failed an agent 0/80.
 *
 * PURITY, same bar as the Grok adapter (invariant 2): every call is one
 * stateless request, temperature 0, no tools, fixed prompt version supplied by
 * the caller, JSON out. A call that "needs a second turn" is a prompt bug.
 *
 * WHAT A MODEL ANSWER MAY BECOME. The label read feeds deterministic code (dose
 * conversion, the scorer). The compatibility and company calls produce
 * MODEL-PRIOR text that is shown with a "model knowledge, unverified" badge and
 * never enters a score, a dose band or an evidence arc. That boundary is the
 * whole reason the pipeline exists (see docs/SYSTEM_DESIGN.md), so keep it: no
 * function here returns a number that scoring code consumes.
 */
import fs from "node:fs";
import path from "node:path";

import Ajv, { type ValidateFunction } from "ajv";

const ROOT = process.cwd();

const DEFAULT_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";
const DEFAULT_TEXT_MODEL = "deepseek-chat";

export type ModelErrorKind =
  | "no_key"
  | "timeout"
  | "quota"
  | "http"
  | "empty"
  | "network"
  | "invalid_json"
  | "schema";

export class ModelCallError extends Error {
  readonly kind: ModelErrorKind;
  constructor(kind: ModelErrorKind, message: string) {
    super(message);
    this.name = "ModelCallError";
    this.kind = kind;
  }
}

function apiKey(): string | undefined {
  return (
    process.env.DEEPSEEK_API_KEY ||
    process.env.VISION_API_KEY ||
    process.env.GEMINI_API_KEY ||
    undefined
  );
}

/** Is any model provider configured on this host? */
export function providerConfigured(): boolean {
  return Boolean(apiKey());
}

export function endpoint(): string {
  return process.env.MODEL_API_URL ?? process.env.VISION_API_URL ?? DEFAULT_URL;
}

export function visionModel(): string {
  return process.env.LABEL_MODEL ?? DEFAULT_VISION_MODEL;
}

export function textModel(): string {
  return process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
}

export function backendHost(): string {
  try {
    return new URL(endpoint()).hostname;
  } catch {
    return "unknown";
  }
}

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user";
  content: string | ChatPart[];
}

export interface ChatRequest {
  /** Names the caller in error messages and metadata: "label", "company", ... */
  purpose: string;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask for a JSON object; dropped automatically if the provider rejects it. */
  jsonMode?: boolean;
  /**
   * Chain-of-thought. DEFAULT "disabled", and that is invariant 2 applied to
   * the transport: these are one-shot pure functions reading a panel or
   * recalling a fact into a fixed schema, none of which needs a model to think
   * out loud -- and on DeepSeek thinking is ON by default, unbounded, and
   * BILLED AGAINST THE SAME max_tokens as the answer. Measured twice: at 2048
   * the label read came back empty with finish_reason "length" (2026-08-23,
   * fixed by raising to 8192), and at 8192 it came back empty again once
   * prompts/label.md grew to label-v1.1's whole-panel fields (2026-09-14).
   * Raising the ceiling only moves the cliff; removing the thinking budget
   * removes the failure. Dropped automatically if the provider rejects it.
   */
  thinking?: "enabled" | "disabled";
}

export interface ChatResult {
  text: string;
  model: string;
  backend: string;
  elapsed_s: number;
  input_tokens: number | null;
  output_tokens: number | null;
  finish_reason: string | null;
}

export type ChatFn = (request: ChatRequest) => Promise<ChatResult>;

interface ChatCompletionsResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      // Reasoning models (DeepSeek) put chain-of-thought here; the answer is
      // still `content`. Empty content + finish_reason "length" means the
      // budget was spent thinking (measured 2026-08-23 on the vision model).
      reasoning_content?: string | null;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function contentText(
  content: string | Array<{ type?: string; text?: string }> | null | undefined,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? "").join("");
  return "";
}

async function post(
  url: string,
  key: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  purpose: string,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new ModelCallError(
        "timeout",
        `${purpose}: the model did not answer within ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw new ModelCallError("network", `${purpose}: could not reach the model API: ${String(err)}`);
  }
}

/** One stateless chat-completions request. Temperature 0, no tools. */
export async function chat(request: ChatRequest): Promise<ChatResult> {
  const key = apiKey();
  if (!key) {
    throw new ModelCallError(
      "no_key",
      "no model API key configured (set DEEPSEEK_API_KEY, or VISION_API_KEY / GEMINI_API_KEY)",
    );
  }
  const url = endpoint();
  const model = request.model ?? textModel();
  const timeoutMs = request.timeoutMs ?? 30_000;
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages,
  };
  if (request.jsonMode) body.response_format = { type: "json_object" };
  // OpenAI-format thinking switch (DeepSeek `thinking.type`); other providers
  // ignore an unknown field, and the ones that 400 on it are handled below.
  if ((request.thinking ?? "disabled") === "disabled") body.thinking = { type: "disabled" };

  let res = await post(url, key, body, timeoutMs, request.purpose);
  if (res.status === 400 && (body.response_format || body.thinking)) {
    // Not every compatible endpoint accepts response_format or thinking. The
    // prompt already demands a bare JSON object and a thinking model still
    // answers, so drop both optional fields and retry once rather than fail.
    delete body.response_format;
    delete body.thinking;
    res = await post(url, key, body, timeoutMs, request.purpose);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* body unreadable */
    }
    if (res.status === 429) {
      throw new ModelCallError(
        "quota",
        `${request.purpose}: the model quota is exhausted for now (429) — try again in a minute`,
      );
    }
    throw new ModelCallError("http", `${request.purpose}: model API error ${res.status}: ${detail}`);
  }

  const payload = (await res.json()) as ChatCompletionsResponse;
  const choice = payload.choices?.[0];
  const text = contentText(choice?.message?.content);
  if (!text) {
    const finish = choice?.finish_reason ?? "unknown";
    // reasoning_content + "length" means the budget went on chain-of-thought.
    // Say so, and say which knob: the thinking switch above should have
    // prevented it, so seeing this means the provider ignored or rejected it.
    const reasoned = choice?.message?.reasoning_content
      ? ` after emitting reasoning_content — the provider kept thinking mode on despite thinking.type=disabled; raise maxTokens for ${request.purpose} or point LABEL_MODEL/TEXT_MODEL at a non-thinking model`
      : "";
    throw new ModelCallError(
      "empty",
      `${request.purpose}: the model returned no message content (finish_reason: ${finish}${reasoned})`,
    );
  }
  return {
    text,
    model,
    backend: backendHost(),
    elapsed_s: Math.round((Date.now() - started) / 10) / 100,
    input_tokens: payload.usage?.prompt_tokens ?? null,
    output_tokens: payload.usage?.completion_tokens ?? null,
    finish_reason: choice?.finish_reason ?? null,
  };
}

/**
 * The object out of a model's text. A markdown fence is forgiven (models emit
 * one about half the time even when told not to); anything worse is an error.
 * No repair of truncated JSON: a partially parsed answer is how a wrong dose
 * or an invented recall reaches the user.
 */
export function extractJson(text: string): Record<string, unknown> {
  let body = (text ?? "").trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ModelCallError("invalid_json", `no JSON object in model output: ${body.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch (err) {
    throw new ModelCallError("invalid_json", `unparseable JSON from model: ${String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ModelCallError("invalid_json", "model returned JSON that is not an object");
  }
  return parsed as Record<string, unknown>;
}

const validators = new Map<string, { validate: ValidateFunction; allowed: Set<string> | null }>();

function loadValidator(schemaFile: string) {
  let entry = validators.get(schemaFile);
  if (!entry) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "schemas", schemaFile), "utf8"),
    ) as Record<string, unknown>;
    // The 2020-12 meta-schema id is not registered in a default Ajv instance
    // and none of these schemas use 2020-only keywords, so drop the pointer.
    delete raw.$schema;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const props = raw.properties as Record<string, unknown> | undefined;
    entry = {
      validate: ajv.compile(raw),
      allowed: raw.additionalProperties === false && props ? new Set(Object.keys(props)) : null,
    };
    validators.set(schemaFile, entry);
  }
  return entry;
}

/**
 * Validate a model object against schemas/<file>. Unknown top-level keys are
 * dropped before validation when the schema forbids them: a chatty model adding
 * "note": "..." is harmless, and failing the whole read over it would be worse
 * than the noise. Everything else -- wrong types, missing required fields,
 * out-of-enum values -- is a hard error, because a lenient read is how an
 * invented field reaches the screen.
 */
export function validateAgainstSchema(
  obj: Record<string, unknown>,
  schemaFile: string,
): Record<string, unknown> {
  const { validate, allowed } = loadValidator(schemaFile);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (allowed === null || allowed.has(key)) clean[key] = value;
  }
  if (!validate(clean)) {
    const first = validate.errors?.[0];
    throw new ModelCallError(
      "schema",
      `model output violates schemas/${schemaFile}: ${first?.instancePath || "/"} ${first?.message ?? "invalid"}`,
    );
  }
  return clean;
}

export interface ChatJsonRequest extends ChatRequest {
  schemaFile: string;
  /** Optional fields to fill when the model answers null/omits them. Never a required field. */
  defaults?: Record<string, unknown>;
}

export interface ChatJsonResult<T> {
  value: T;
  meta: ChatResult;
}

export type ChatJsonFn = <T>(request: ChatJsonRequest) => Promise<ChatJsonResult<T>>;

/** chat -> JSON object -> defaults -> schema. The shape every pure-function call uses. */
export async function chatJson<T>(request: ChatJsonRequest): Promise<ChatJsonResult<T>> {
  const meta = await chat({ ...request, jsonMode: request.jsonMode ?? true });
  const obj = extractJson(meta.text);
  for (const [key, value] of Object.entries(request.defaults ?? {})) {
    if (obj[key] === null || obj[key] === undefined) obj[key] = value;
  }
  const value = validateAgainstSchema(obj, request.schemaFile) as unknown as T;
  return { value, meta };
}
