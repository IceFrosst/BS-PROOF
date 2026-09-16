/*
 * Supplement TYPE COMPATIBILITY: does this form, and this combination of
 * actives, make sense together? Two layers, kept visibly apart:
 *
 *   curated   vocab/compatibility.json -- cited pairwise interactions and
 *             form notes. Deterministic alias matching. basis "curated_table".
 *   model     prompts/compatibility.md -- a DeepSeek fill-in ONLY for pairs the
 *             table does not cover. basis "model_prior", shown with a badge.
 *
 * The evidence-run form fit (does the scored run's form match the label's) is
 * a third, deterministic input: it comes from the retained artifact through
 * product-score and is basis "evidence_run".
 *
 * Nothing here produces a number the scorer consumes. Compatibility QUALIFIES
 * a product; it never moves an arc.
 */
import fs from "node:fs";
import path from "node:path";

import type { ChatJsonFn } from "./llm";
import { textModel } from "./llm";
import type { LabelActive } from "./vision";
import { formEntry } from "./vocab";

const ROOT = process.cwd();

/** Bump together with prompts/compatibility.md. Its own cache domain (invariant 3). */
export const COMPAT_PROMPT_VERSION = "compat-v1.0";

export type Basis = "label" | "evidence_run" | "registry" | "curated_table" | "model_prior";

interface Source {
  title: string;
  url: string;
}

interface CuratedInteraction {
  a: string;
  b: string;
  kind: string;
  severity: "info" | "moderate" | "high";
  advice: string;
  mechanism: string;
  source: Source;
}

interface CuratedFormNote {
  ingredient: string;
  form_id: string | null;
  kind: string;
  note: string;
  source: Source;
}

interface CompatVocab {
  aliases: Record<string, string[]>;
  interactions: CuratedInteraction[];
  form_notes: CuratedFormNote[];
}

let cached: CompatVocab | null = null;

export function loadCompatVocab(): CompatVocab {
  if (!cached) {
    cached = JSON.parse(
      fs.readFileSync(path.join(ROOT, "vocab", "compatibility.json"), "utf8"),
    ) as CompatVocab;
  }
  return cached;
}

function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * Printed active name -> canonical id in the alias table, or null. Whole-word
 * containment on the normalised string, longest alias first, so "calcium (as
 * calcium carbonate) 500 mg" is calcium and "vitamin d3 (cholecalciferol)" is
 * vitamin_d. "Magnesium ascorbate" is deliberately ambiguous (magnesium and
 * vitamin_c both match); the longer alias wins, which here is vitamin_c's
 * "calcium ascorbate"/"sodium ascorbate" only when printed -- otherwise the
 * first canonical whose alias matched at the greatest length. Ambiguity at the
 * same length falls to alphabetical order, which is deterministic; the raw name
 * is always kept beside the canonical so a reader can see what was matched.
 */
export function normaliseActive(name: string): string | null {
  const text = normalise(name);
  let best: { id: string; len: number } | null = null;
  for (const [id, aliases] of Object.entries(loadCompatVocab().aliases)) {
    for (const alias of aliases) {
      const a = normalise(alias);
      if (text.includes(a) && (best === null || a.length > best.len)) best = { id, len: a.length };
    }
  }
  return best?.id ?? null;
}

export interface ResolvedActive {
  printed: string;
  canonical: string | null;
  compound_dose_mg: number | null;
  form_text: string | null;
}

export function resolveActives(ingredient: string, actives: LabelActive[], otherActives: string[]): ResolvedActive[] {
  const seen = new Set<string>();
  const out: ResolvedActive[] = [];
  const push = (printed: string, dose: number | null, form: string | null) => {
    const key = normalise(printed);
    if (!printed.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ printed, canonical: normaliseActive(printed), compound_dose_mg: dose, form_text: form });
  };
  for (const a of actives) push(a.name, a.compound_dose_mg, a.form_text);
  for (const name of otherActives) push(name, null, null);
  if (!out.some((a) => a.canonical === ingredient)) {
    // The main active always takes part, even when the model's actives list
    // omitted it -- the label read already named it. `ingredient` may be a
    // vocabulary id ("vitamin_d") or, for an ingredient outside the vocabulary,
    // the printed text ("Shilajit"), so resolve it the same way as any other
    // printed name rather than trusting it to be a canonical id.
    const printed = ingredient.replace(/_/g, " ");
    const canonical = loadCompatVocab().aliases[ingredient] ? ingredient : normaliseActive(printed);
    out.unshift({ printed, canonical, compound_dose_mg: null, form_text: null });
  }
  return out;
}

export interface InteractionRow {
  a: string;
  b: string;
  kind: string;
  severity: "info" | "moderate" | "high";
  advice: string | null;
  mechanism: string | null;
  basis: Basis;
  confidence: "high" | "medium" | "low" | null;
  source: Source | null;
}

export interface FormNoteRow {
  active: string;
  note: string;
  basis: Basis;
  confidence: "high" | "medium" | "low" | null;
  source: Source | null;
  /**
   * The curated table's kind (low_bioavailability, well_absorbed, reference_form,
   * no_demonstrated_advantage, form_matters) so a consumer can react to WHAT
   * the note says without parsing its prose. Null for a model fill-in note.
   */
  kind: string | null;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Cited interactions among the resolved actives. */
export function curatedInteractions(actives: ResolvedActive[]): InteractionRow[] {
  const canon = new Map<string, ResolvedActive>();
  for (const a of actives) if (a.canonical && !canon.has(a.canonical)) canon.set(a.canonical, a);
  const out: InteractionRow[] = [];
  for (const row of loadCompatVocab().interactions) {
    const left = canon.get(row.a);
    const right = canon.get(row.b);
    if (!left || !right) continue;
    out.push({
      a: left.printed,
      b: right.printed,
      kind: row.kind,
      severity: row.severity,
      advice: row.advice,
      mechanism: row.mechanism,
      basis: "curated_table",
      confidence: "high",
      source: row.source,
    });
  }
  return out;
}

/** Cited notes about the label's own form of the main ingredient. */
export function curatedFormNotes(ingredient: string, formId: string | null): FormNoteRow[] {
  const entry = formEntry(ingredient, formId);
  const out: FormNoteRow[] = [];
  for (const note of loadCompatVocab().form_notes) {
    if (note.ingredient !== ingredient) continue;
    if (note.form_id !== null && note.form_id !== formId) continue;
    out.push({
      active: entry?.label ?? ingredient.replace(/_/g, " "),
      note: note.note,
      basis: "curated_table",
      confidence: "high",
      source: note.source,
      kind: note.kind,
    });
  }
  return out;
}

/** Pairs of actives the curated table does not cover (for the model fill-in). */
export function uncoveredPairs(actives: ResolvedActive[], curated: InteractionRow[]): Array<[ResolvedActive, ResolvedActive]> {
  const covered = new Set(curated.map((r) => pairKey(normalise(r.a), normalise(r.b))));
  const out: Array<[ResolvedActive, ResolvedActive]> = [];
  for (let i = 0; i < actives.length; i += 1) {
    for (let j = i + 1; j < actives.length; j += 1) {
      const key = pairKey(normalise(actives[i].printed), normalise(actives[j].printed));
      if (!covered.has(key)) out.push([actives[i], actives[j]]);
    }
  }
  return out;
}

interface ModelCompat {
  pairs: Array<{
    a: string;
    b: string;
    interaction: string;
    severity: "info" | "moderate" | "high";
    mechanism?: string | null;
    confidence: "high" | "medium" | "low";
  }>;
  form_notes?: Array<{ active: string; note: string; confidence: "high" | "medium" | "low" }>;
  overall: string;
}

function compatPrompt(actives: ResolvedActive[], pairs: Array<[ResolvedActive, ResolvedActive]>): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "compatibility.md"), "utf8");
  const activesText = actives
    .map((a) => `- ${a.printed}; dose: ${a.compound_dose_mg === null ? "not printed" : `${a.compound_dose_mg} mg`}; form: ${a.form_text ?? "not printed"}`)
    .join("\n");
  const pairsText = pairs.map(([a, b], i) => `${i + 1}. ${a.printed} + ${b.printed}`).join("\n");
  return raw.replace("{ACTIVES}", activesText || "- (none)").replace("{PAIRS}", pairsText || "(none)");
}

export interface EvidenceFormFit {
  status: "exact_form_scored" | "form_not_scored" | "ingredient_not_scored" | "unknown";
  scored_forms: string[];
  form_strength: number | null;
  form_basis: string | null;
}

export interface CompatibilitySection {
  status: "ok" | "single_active" | "unavailable";
  basis_used: Basis[];
  actives: ResolvedActive[];
  evidence_form_fit: EvidenceFormFit;
  form_notes: FormNoteRow[];
  interactions: InteractionRow[];
  model: {
    status: "ok" | "skipped_no_uncovered_pairs" | "skipped" | "unavailable";
    reason: string | null;
    overall: string | null;
    prompt_version: string;
    model: string | null;
    elapsed_s: number | null;
  };
}

export interface CompatibilityInput {
  ingredient: string;
  formId: string | null;
  actives: LabelActive[];
  otherActives: string[];
  evidenceFormFit: EvidenceFormFit;
}

export interface CompatibilityDeps {
  chatJson: ChatJsonFn | null;
  timeoutMs: number;
  /** false when the time budget or the operator says no model calls here. */
  allowModel: boolean;
}

/** Deterministic first, model second, both labelled. Never throws. */
export async function compatibilitySection(
  input: CompatibilityInput,
  deps: CompatibilityDeps,
): Promise<CompatibilitySection> {
  const actives = resolveActives(input.ingredient, input.actives, input.otherActives);
  const interactions = curatedInteractions(actives);
  const formNotes = curatedFormNotes(input.ingredient, input.formId);
  const basisUsed = new Set<Basis>(["evidence_run"]);
  if (interactions.length || formNotes.length) basisUsed.add("curated_table");

  const section: CompatibilitySection = {
    status: actives.length > 1 ? "ok" : "single_active",
    basis_used: [...basisUsed],
    actives,
    evidence_form_fit: input.evidenceFormFit,
    form_notes: formNotes,
    interactions,
    model: {
      status: "skipped",
      reason: null,
      overall: null,
      prompt_version: COMPAT_PROMPT_VERSION,
      model: null,
      elapsed_s: null,
    },
  };

  const pairs = uncoveredPairs(actives, interactions).slice(0, 12);
  if (!pairs.length) {
    section.model.status = "skipped_no_uncovered_pairs";
    return section;
  }
  if (!deps.allowModel || !deps.chatJson) {
    section.model.reason = deps.allowModel ? "no model provider configured" : "time budget exhausted before the compatibility call";
    section.model.status = "unavailable";
    return section;
  }

  try {
    const { value, meta } = await deps.chatJson<ModelCompat>({
      purpose: "compatibility",
      schemaFile: "compatibility.json",
      model: textModel(),
      maxTokens: 2048,
      timeoutMs: deps.timeoutMs,
      defaults: { form_notes: [] },
      messages: [{ role: "user", content: compatPrompt(actives, pairs) }],
    });
    for (const p of value.pairs) {
      if (p.interaction === "none") continue;
      section.interactions.push({
        a: p.a,
        b: p.b,
        kind: p.interaction,
        severity: p.severity,
        advice: null,
        mechanism: p.mechanism ?? null,
        basis: "model_prior",
        confidence: p.confidence,
        source: null,
      });
    }
    for (const n of value.form_notes ?? []) {
      section.form_notes.push({ active: n.active, note: n.note, basis: "model_prior", confidence: n.confidence, source: null, kind: null });
    }
    section.basis_used = [...new Set<Basis>([...section.basis_used, "model_prior"])];
    section.model = {
      status: "ok",
      reason: null,
      overall: value.overall,
      prompt_version: COMPAT_PROMPT_VERSION,
      model: meta.model,
      elapsed_s: meta.elapsed_s,
    };
  } catch (err) {
    section.model.status = "unavailable";
    section.model.reason = err instanceof Error ? err.message : String(err);
  }
  return section;
}
