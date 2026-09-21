/*
 * Plain-language sidecars for the retained audits. Development-only.
 *
 * `audits/plain/*.json` holds a MODEL-WRITTEN rewrite of the audit prose in
 * shop-floor language. It is a presentation layer and nothing else:
 *
 *   - it never enters a score, a ledger or a warning;
 *   - every number, unit, interval, p-value, sample size and direction in the
 *     rewrite is carried over from the audit unchanged;
 *   - the AUDIT'S OWN WORDING IS STILL THE RECORD. The card keeps it verbatim
 *     behind an "Exact wording from the audit" details, so the plain text can
 *     be checked against the sentence it was written from.
 *
 * A missing key is not an error: `plainPair()` falls back to the original
 * string, so a sidecar that covers three of four fields renders the audit text
 * for the fourth rather than dropping it.
 *
 * Files are keyed "<outcome name>||<population>" — the same composite key as
 * `outcomeKey()` in effect-presentation.ts, because two outcomes can share a
 * name in different populations.
 */
import creatinePlain from "./audits/plain/creatine.json";
import vitaminDPlain from "./audits/plain/vitamin-d.json";
import magnesiumPlain from "./audits/plain/magnesium.json";

/** Printed where the verbatim audit text is revealed, so the rewrite is never mistaken for the source. */
export const PLAIN_LANGUAGE_STAMP =
  "Plain-language rewrite, written by a model from the audit text below. Every number, unit, interval and sample size is the audit's; none was changed.";
export const VERBATIM_SUMMARY = "Exact wording from the audit";

export type PlainProductKey = "creatine" | "vitaminD" | "magnesium";
export type PlainDimension = "effect" | "evidence" | "form" | "dose";
export type PlainDetailField = "found" | "missing" | "move";
export type PlainSummaryField = "sentence" | "absolute_effect" | "clinically_meaningful" | "strongest_doubt";
export type PlainGroup = PlainDimension | "summary";
export type PlainFieldOf<G extends PlainGroup> = G extends "summary" ? PlainSummaryField : PlainDetailField;

export type PlainDetail = Partial<Record<PlainDetailField, string>>;
export type PlainSummary = Partial<Record<PlainSummaryField, string>>;
export type PlainEntry = Partial<Record<PlainDimension, PlainDetail>> & { summary?: PlainSummary };
export type PlainFile = Record<string, PlainEntry>;

export const PLAIN_DIMENSIONS: readonly PlainDimension[] = ["effect", "evidence", "form", "dose"];
const DETAIL_FIELDS: readonly PlainDetailField[] = ["found", "missing", "move"];
const SUMMARY_FIELDS: readonly PlainSummaryField[] = ["sentence", "absolute_effect", "clinically_meaningful", "strongest_doubt"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate a sidecar at module load, the same discipline as
 * `parseEffectResearch`: a malformed or empty rewrite throws here rather than
 * rendering a blank paragraph where an audit sentence used to be.
 */
export function parsePlainFile(raw: unknown, label: string): PlainFile {
  if (!isRecord(raw)) throw new Error(`plain sidecar ${label}: expected an object`);
  const out: PlainFile = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!key.includes("||")) throw new Error(`plain sidecar ${label}: key ${key} is not "<name>||<population>"`);
    if (!isRecord(entry)) throw new Error(`plain sidecar ${label}: ${key} is not an object`);
    const parsed: PlainEntry = {};
    for (const [group, fields] of Object.entries(entry)) {
      const isSummary = group === "summary";
      if (!isSummary && !PLAIN_DIMENSIONS.includes(group as PlainDimension)) {
        throw new Error(`plain sidecar ${label}: ${key} has unknown group ${group}`);
      }
      if (!isRecord(fields)) throw new Error(`plain sidecar ${label}: ${key}.${group} is not an object`);
      const allowed: readonly string[] = isSummary ? SUMMARY_FIELDS : DETAIL_FIELDS;
      const bucket: Record<string, string> = {};
      for (const [field, text] of Object.entries(fields)) {
        if (!allowed.includes(field)) throw new Error(`plain sidecar ${label}: ${key}.${group} has unknown field ${field}`);
        if (typeof text !== "string" || text.trim() === "") {
          throw new Error(`plain sidecar ${label}: ${key}.${group}.${field} is empty`);
        }
        bucket[field] = text;
      }
      if (isSummary) parsed.summary = bucket as PlainSummary;
      else parsed[group as PlainDimension] = bucket as PlainDetail;
    }
    out[key] = parsed;
  }
  return out;
}

export const PLAIN_FILES: Record<PlainProductKey, PlainFile> = {
  creatine: parsePlainFile(creatinePlain, "creatine"),
  vitaminD: parsePlainFile(vitaminDPlain, "vitamin-d"),
  magnesium: parsePlainFile(magnesiumPlain, "magnesium"),
};

export function isPlainProductKey(key: string): key is PlainProductKey {
  return Object.prototype.hasOwnProperty.call(PLAIN_FILES, key);
}

/** The rewrite for one outcome, or null when this product or row has none. */
export function plainFor(productKey: string, outcomeKey: string): PlainEntry | null {
  if (!isPlainProductKey(productKey)) return null;
  return PLAIN_FILES[productKey][outcomeKey] ?? null;
}

export interface PlainPair {
  /** What the card renders as body text: the rewrite when there is one, otherwise the audit's own sentence. */
  plain: string;
  /** The audit's own sentence, always kept. */
  original: string;
  /** False when the sidecar had nothing for this field and the original is being shown as the body. */
  rewritten: boolean;
}

/** {plain, original} for one dimension+field, falling back to `original` when the key is absent. */
export function plainPair<G extends PlainGroup>(
  entry: PlainEntry | null | undefined,
  group: G,
  field: PlainFieldOf<G>,
  original: string,
): PlainPair {
  const groups = (entry ?? {}) as Record<string, Record<string, string> | undefined>;
  const text = groups[group]?.[field];
  const plain = typeof text === "string" && text.trim() !== "" ? text : original;
  return { plain, original, rewritten: plain !== original };
}

/** Convenience for the view: the body string only. */
export function plainText<G extends PlainGroup>(
  entry: PlainEntry | null | undefined,
  group: G,
  field: PlainFieldOf<G>,
  original: string,
): string {
  return plainPair(entry, group, field, original).plain;
}
