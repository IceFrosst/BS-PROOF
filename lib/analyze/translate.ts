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

export { TRANSLATE_MAX_ITEMS, TRANSLATE_MAX_ITEM_CHARS, TRANSLATE_MAX_TOTAL_CHARS, TRANSLATE_MAX_BODY_BYTES } from "@/lib/i18n/translate-limits";

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

/*
 * What the guard compares is not the bare digits but the whole numeric FACT as
 * written: the sign or comparator attached in front (-, −, +, ±, <, >, ≤, ≥,
 * ≈, ~, =) + the number + the percent sign or measurement unit attached behind
 * (%, mg, g, mcg, IU, mL, kg/m², mmHg ...). "−0.31" -> "0.31", "p<0.05" ->
 * "p>0.05", "10 mg" -> "10 g" and "95%" -> "95" are all DIFFERENT facts, so the
 * translation is refused and the screen keeps the English.
 *
 * Whitespace between the parts is ignored ("p < 0.05" == "p<0.05",
 * "10 mg" == "10mg", "95 %" == "95%"), every dash-like character counts as the
 * same minus (hyphen, non-breaking hyphen, en/em dash, U+2212), "<=" is "≤".
 * An ASCII/typographic dash only counts when it touches the number ("5-10"
 * keeps "-10" as a fact, so "5 10" is refused; "Omega-3" -> "Omega 3" too:
 * fail-closed). Only SYMBOL units are matched, and only at a word boundary:
 * words that really are translated ("weeks", "days", "grams") are not facts,
 * and neither are "m"/"h"/"d", which are ordinary Lithuanian abbreviations
 * ("2019 m.", "val.") and would refuse every year.
 * What this cannot see (the words "less than", "increase", "not") stays the
 * prompt's job -- see prompts/translate.md -- and is listed as a limit in
 * CLAUDE.md.
 */
const DASHES = "\\-\u2010-\u2015\u2212\uFE63\uFF0D";
const NUMBER = "\\d(?:[\\d.,]*\\d)?";
const UNITS = [
  "mcg", "µg", "μg", "ug", "mg", "kg", "g", "ng", "pg", "IU", "mEq", "mmol", "µmol", "μmol", "nmol", "pmol", "mol",
  "kcal", "kJ", "cal", "mmHg", "mL", "ml", "dL", "dl", "L", "mm", "cm", "µm", "μm", "nm", "kDa", "Da", "Hz",
  "ppm", "ppb", "CFU", "cfu", "bpm", "min",
]
  .sort((x, y) => y.length - x.length)
  .join("|");
const PER_UNITS = "kg|g|mg|mcg|µg|μg|L|mL|ml|dL|dl|m²|m2|cm²";
const WORD_CHAR = "A-Za-z\\u00C0-\\u024F";
const FACT = new RegExp(
  // prefix: comparator / sign run (U+2212 may be spaced from the digit; the others must touch it)
  `((?:[<>≤≥≈~±+=]\\s{0,2}|\\u2212\\s{0,2}|[${DASHES}](?=[\\d<>≤≥≈~±+=${DASHES}]))*)` +
    `(${NUMBER})` +
    // suffix: percent / degree / a symbol unit (optionally per another), at a word boundary
    `(?:\\s{0,2}(%|‰|°[CF]?|(?:${UNITS})(?:\\/(?:${PER_UNITS}))?(?![${WORD_CHAR}\\d])))?`,
  "g",
);

function canonicalPrefix(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(new RegExp(`[${DASHES}]`, "g"), "-")
    .replace("<=", "≤")
    .replace(">=", "≥")
    .replace("+-", "±");
}

function canonicalSuffix(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/^[µμ]/, "µ").replace(/^ml/, "mL").replace(/^dl/, "dL").replace(/^cfu/, "CFU");
}

/** Every numeric fact as written, e.g. "-0.31", "<0.05", "95%", "10mg", "4,000", sorted. */
function numberTokens(text: string): string[] {
  const facts: string[] = [];
  for (const m of text.matchAll(FACT)) facts.push(`${canonicalPrefix(m[1])}${m[2]}${canonicalSuffix(m[3] ?? "")}`);
  return facts.sort();
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

function cacheKey(cacheScope: string, text: string): string {
  // A serialized tuple gives scope and text unambiguous boundaries; neither can
  // forge another caller's key by containing a separator.
  return JSON.stringify([TRANSLATE_PROMPT_VERSION, cacheScope, text]);
}

export function clearTranslationCache(): void {
  cache.clear();
}

function remember(cacheScope: string, text: string, translated: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey(cacheScope, text), translated);
}

/* ----------------------------- the call ------------------------------------- */

function prompt(): string {
  return fs.readFileSync(path.join(ROOT, "prompts", "translate.md"), "utf8");
}

export function defaultTranslateDeps(): TranslateDeps {
  return { chatJson, timeoutMs: 40_000 };
}

/** Never throws. Texts the model cannot be trusted with come back as null. */
export async function translateTexts(texts: string[], deps: TranslateDeps, cacheScope?: string): Promise<TranslateResult> {
  const base = { prompt_version: TRANSLATE_PROMPT_VERSION, model: null as string | null };
  // Only a server-verified caller identity enables reuse. Anonymous/direct calls
  // remain uncached rather than sharing a public bucket.
  const scope = typeof cacheScope === "string" && cacheScope.length > 0 ? cacheScope : null;
  const result: Array<string | null> = texts.map((text) => scope !== null ? cache.get(cacheKey(scope, text)) ?? null : null);
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
          if (scope !== null) remember(scope, text, checked);
        }
      });
    }
    return { status: "ok", translations: result, reason: null, ...base };
  } catch (err) {
    return { status: "unavailable", translations: result, reason: err instanceof Error ? err.message : String(err), ...base };
  }
}
