/*
 * THE FALLBACK EVIDENCE PATH: what the literature says about an ingredient we
 * have NOT run through the extraction pipeline.
 *
 * Founder decision 2026-09-08: the scan must answer for ANY supplement, not
 * only the one ingredient with a retained run. "The retained runs, you can
 * access them if you have them, but even if you don't, do the analysis through
 * the system prompt of the API itself."
 *
 * PRECEDENCE, and it is not negotiable: a retained run always wins. This module
 * is called only when `scoreProduct` returns not_scored / form_not_scored /
 * recompute_refused. When a run exists, the measured rows are the answer and
 * nothing here runs.
 *
 * WHAT THIS DELIBERATELY DOES NOT PRODUCE: a 0-100 composite. That scale has a
 * specific meaning -- 50 + signed/2 discounted by applicability, computed from
 * extracted trials each carrying a quoted span -- and minting one from a
 * model's recollection would make the two indistinguishable on screen, which is
 * the single failure this project exists to prevent. Instead the model reports
 * per outcome: a DIRECTION, the STRENGTH of the literature behind it, and the
 * daily dose range at which benefit was observed. Those are things a model can
 * honestly recall and a reader can check.
 *
 * The dose comparison IS deterministic: the model supplies the range, and
 * `dose.dose_factor_for` -- the same pinned ramp the scored path uses -- places
 * the label's dose against it. Model supplies the yardstick; arithmetic is ours.
 */
import fs from "node:fs";
import path from "node:path";

import type { Basis } from "./compatibility";
import type { ChatJsonFn } from "./llm";
import { textModel } from "./llm";
import { doseFactorFor } from "./scoring";

const ROOT = process.cwd();

/** Bump together with prompts/evidence_prior.md. Its own cache domain (invariant 3). */
export const EVIDENCE_PRIOR_PROMPT_VERSION = "evidence-prior-v1.0";

export interface PriorOutcome {
  outcome: string;
  direction: "benefit" | "no_effect" | "harm" | "insufficient";
  evidence_strength: "strong" | "moderate" | "limited" | "none";
  effective_daily_dose_low_mg: number | null;
  effective_daily_dose_high_mg: number | null;
  pooled_effect_recalled: string | null;
  population: string | null;
  note: string | null;
  confidence: "high" | "medium" | "low";
  /** Added by us, deterministically, from the dose the label actually states. */
  dose_closeness?: number | null;
  dose_reading?: string | null;
}

export interface EvidencePrior {
  ingredient: string;
  recognised: boolean;
  summary: string;
  evidence_landscape?: { syntheses_exist: "many" | "few" | "none" | "unknown"; note?: string | null };
  outcomes: PriorOutcome[];
  form_assessment?: { form?: string | null; verdict: string; note?: string | null };
  safety_notes?: string[];
  confidence: "high" | "medium" | "low";
  caveats?: string[];
}

export interface EvidencePriorSection {
  status: "ok" | "skipped" | "unavailable";
  basis: Basis;
  reason: string | null;
  data: EvidencePrior | null;
  scored_dose_mg: number | null;
  prompt_version: string;
  model: string | null;
  elapsed_s: number | null;
  disclaimer: string;
}

export interface EvidencePriorInput {
  /** What the label printed, so an out-of-vocabulary ingredient still works. */
  ingredientText: string;
  formText: string | null;
  /** Daily dose actually on the tub, in mg, or null. */
  scoredDoseMg: number | null;
  doseIsElemental: boolean;
}

export interface EvidencePriorDeps {
  chatJson: ChatJsonFn | null;
  timeoutMs: number;
  allowModel: boolean;
}

function mg(value: number | null): string {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

function priorPrompt(input: EvidencePriorInput): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "evidence_prior.md"), "utf8");
  const dose =
    input.scoredDoseMg === null
      ? "(not printed / not convertible)"
      : `${mg(input.scoredDoseMg)} per day${input.doseIsElemental ? " (elemental)" : " (as printed on the label)"}`;
  return raw
    .replace("{INGREDIENT}", input.ingredientText)
    .replace("{FORM}", input.formText ?? "(not stated)")
    .replace("{DOSE}", dose);
}

/**
 * Place the label's dose against the model's recalled effective range, with the
 * SAME ramp the scored path uses. A one-sided range (only a low end recalled)
 * is treated as a floor rather than refused: "at least X per day" is a real and
 * common thing for the literature to say.
 */
export function readPriorDose(row: PriorOutcome, dose: number | null): { closeness: number | null; reading: string } {
  const low = row.effective_daily_dose_low_mg;
  const high = row.effective_daily_dose_high_mg;
  if (dose === null) {
    return { closeness: null, reading: "Your dose could not be read off the label, so it cannot be compared." };
  }
  if (low === null && high === null) {
    return { closeness: null, reading: "No effective dose range was recalled for this outcome, so there is nothing to compare against." };
  }
  const lo = low ?? high!;
  const hi = high ?? low!;
  if (lo <= 0 || hi <= 0 || hi < lo) {
    return { closeness: null, reading: "The recalled dose range is not usable, so no comparison is shown." };
  }
  const closeness = doseFactorFor(dose, dose, { low: lo, high: hi });
  const range = lo === hi ? mg(lo) : `${mg(lo)}–${mg(hi)}`;
  if (dose >= lo && dose <= hi) {
    return { closeness, reading: `${mg(dose)}/day sits inside the range the model recalls as effective (${range}).` };
  }
  if (dose < lo) {
    return { closeness, reading: `${mg(dose)}/day is below the range the model recalls as effective (${range}).` };
  }
  return { closeness, reading: `${mg(dose)}/day is above the range the model recalls as effective (${range}); more is not evidence of more effect.` };
}

const DISCLAIMER =
  "No extraction run exists for this ingredient, so this section is the model's own recollection of the " +
  "literature — not trials we read, scored and can quote. Treat it as orientation. It carries no 0–100 score " +
  "because that number means 'computed from extracted trials', and the two must not look alike.";

/** Never throws. Returns a section that says why it is empty when it is. */
export async function evidencePriorSection(
  input: EvidencePriorInput,
  deps: EvidencePriorDeps,
): Promise<EvidencePriorSection> {
  const section: EvidencePriorSection = {
    status: "skipped",
    basis: "model_prior",
    reason: null,
    data: null,
    scored_dose_mg: input.scoredDoseMg,
    prompt_version: EVIDENCE_PRIOR_PROMPT_VERSION,
    model: null,
    elapsed_s: null,
    disclaimer: DISCLAIMER,
  };
  if (!deps.allowModel || !deps.chatJson) {
    section.status = "unavailable";
    section.reason = deps.allowModel ? "no model provider configured" : "time budget exhausted before the evidence call";
    return section;
  }
  try {
    const { value, meta } = await deps.chatJson<EvidencePrior>({
      purpose: "evidence prior",
      schemaFile: "evidence_prior.json",
      model: textModel(),
      maxTokens: 3072,
      timeoutMs: deps.timeoutMs,
      defaults: {
        evidence_landscape: { syntheses_exist: "unknown", note: null },
        outcomes: [],
        form_assessment: { form: input.formText, verdict: "unknown", note: null },
        safety_notes: [],
        caveats: [],
      },
      messages: [{ role: "user", content: priorPrompt(input) }],
    });
    for (const row of value.outcomes) {
      const { closeness, reading } = readPriorDose(row, input.scoredDoseMg);
      row.dose_closeness = closeness;
      row.dose_reading = reading;
    }
    section.status = "ok";
    section.data = value;
    section.model = meta.model;
    section.elapsed_s = meta.elapsed_s;
  } catch (err) {
    section.status = "unavailable";
    section.reason = err instanceof Error ? err.message : String(err);
  }
  return section;
}
