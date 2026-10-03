/*
 * DISPLAY TRANSLATION of model-authored and retained prose (EN -> LT).
 *
 * The scan result screen shows prose a model wrote (company profile,
 * literature orientation, compatibility notes, disclosures' `basis` text) and
 * prose retained in audit files. History replays show the English stored with
 * the run. For the Lithuanian view that English is translated HERE, at read
 * time, through the one model boundary (lib/analyze/llm.ts `chatJson`) and
 * shown instead of -- never written over -- the original:
 *
 *   - nothing is stored: not in the run, not in History. The original text is
 *     the record; a translation is a view of it.
 *   - nothing computed reads a translation. No score, arc, dose band, enum,
 *     unit, direction or exact-match rule takes a translated string as input.
 *   - a translation is accepted ONLY if it passes `guardTranslation`: every
 *     number token and every quoted span of the source is present, unchanged,
 *     in the translation. A failing item is returned as `null` and the screen
 *     keeps the English. A model that "improves" a number costs one sentence
 *     of English, not a wrong figure.
 *
 * Same purity bar as the other model calls (invariant 2): one stateless
 * request, temperature 0, no tools, fixed prompt version, JSON out. The prompt
 * is prompts/translate.md; bump TRANSLATE_PROMPT_VERSION with it (invariant 3)
 * -- it is also the key of the in-memory cache, so a new prompt never serves
 * old translations.
 */
import fs from "node:fs";
import path from "node:path";

import { chatJson, textModel, type ChatJsonFn } from "./llm";

const ROOT = process.cwd();

/** Bump together with prompts/translate.md. Its own cache domain (invariant 3). */
export const TRANSLATE_PROMPT_VERSION = "translate-lt-v1.0";

export const TRANSLATE_MAX_ITEMS = 24;
export const TRANSLATE_MAX_ITEM_CHARS = 4_000;
export const TRANSLATE_MAX_TOTAL_CHARS = 24_000;

export type TranslateStatus = "ok" | "unavailable";

export interface TranslateResult {
  status: TranslateStatus;
  /** One entry per input text; `null` = not translated (keep the original). */
  translations: Array<string | null>;
  prompt_version: string;
  model: string | null;
  reason: string | null;
}

export interface TranslateDeps {
  chatJson: ChatJsonFn | null;
  timeoutMs: number;
}

/* ----------------------------- the guard ----------------------------------- */

/** Every number-like token, e.g. "4,000", "0.048", "2.39", "10". */
function numberTokens(text: string): string[] {
  return (text.match(/\d(?:[\d.,]*\d)?/g) ?? []).slice().sort();
}

/** Text inside straight or curly double quotes: verbatim source quotes. */
function quotedSpans(text: string): string[] {
  const spans: string[] = [];
  for (const m of text.matchAll(/[“"]([^”"]{2,})[”"]/g)) spans.push(m[1].trim());
  return spans;
}

/**
 * The translation if it keeps every number and every quoted span of `source`
 * exactly, otherwise null. Also refuses an empty result and an absurd length.
 */
export function guardTranslation(source: string, translated: unknown): string | null {
  if (typeof translated !== "string") return null;
  const out = translated.trim();
  if (!out) return null;
  if (out.length > source.length * 4 + 200) return null;
  const a = numberTokens(source);
  const b = numberTokens(out);
  if (a.length !== b.length || a.some((token, i) => token !== b[i])) return null;
  for (const span of quotedSpans(source)) {
    if (!out.includes(span)) return null;
  }
  return out;
}

/* ----------------------------- cache ---------------------------------------- */

const CACHE_LIMIT = 800;
const cache = new Map<string, string>();

function cacheKey(text: string): string {
  return `${TRANSLATE_PROMPT_VERSION}\u0000${text}`;
}

export function clearTranslationCache(): void {
  cache.clear();
}

function remember(text: string, translated: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey(text), translated);
}

/* ----------------------------- the call ------------------------------------- */

function prompt(): string {
  return fs.readFileSync(path.join(ROOT, "prompts", "translate.md"), "utf8");
}

export function defaultTranslateDeps(): TranslateDeps {
  return { chatJson, timeoutMs: 40_000 };
}

/** Never throws. Texts the model cannot be trusted with come back as null. */
export async function translateTexts(texts: string[], deps: TranslateDeps): Promise<TranslateResult> {
  const base = { prompt_version: TRANSLATE_PROMPT_VERSION, model: null as string | null };
  const result: Array<string | null> = texts.map((text) => cache.get(cacheKey(text)) ?? null);
  const todo = texts.map((text, i) => ({ text, i })).filter(({ i }) => result[i] === null);
  if (!todo.length) return { status: "ok", translations: result, reason: null, ...base };
  if (!deps.chatJson) {
    return { status: "unavailable", translations: result, reason: "no model provider configured", ...base };
  }
  try {
    const { value, meta } = await deps.chatJson<{ translations: string[] }>({
      purpose: "translate",
      schemaFile: "translate.json",
      model: textModel(),
      maxTokens: 4096,
      timeoutMs: deps.timeoutMs,
      disableThinking: true,
      messages: [
        { role: "system", content: prompt() },
        { role: "user", content: JSON.stringify({ texts: todo.map((t) => t.text) }) },
      ],
    });
    base.model = meta.model;
    // A length mismatch means the answer cannot be aligned to the inputs;
    // trust none of it rather than shifting sentences onto the wrong rows.
    if (value.translations.length === todo.length) {
      todo.forEach(({ text, i }, k) => {
        const checked = guardTranslation(text, value.translations[k]);
        if (checked !== null) {
          result[i] = checked;
          remember(text, checked);
        }
      });
    }
    return { status: "ok", translations: result, reason: null, ...base };
  } catch (err) {
    return { status: "unavailable", translations: result, reason: err instanceof Error ? err.message : String(err), ...base };
  }
}
