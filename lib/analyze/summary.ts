/*
 * THE PLAIN-LANGUAGE SUMMARY: the five questions a shopper actually asks,
 * answered in words, from facts the scan has already established.
 *
 * Founder ask 2026-09-15: the scan result should be "in a better presentable
 * form ... smth that an average user can benefit from, whether the certain
 * supplement is legit". The report underneath keeps every number and every
 * arc. This module is the translation layer that sits on top of it -- and it
 * is deliberately a TRANSLATION, not a new measurement:
 *
 *   1. IT MINTS NO NUMBER. Not a 0-100, not stars, not "4 of 5 checks passed"
 *      as a grade. Each finding carries a TONE (good / mixed / caution /
 *      concern / unknown) read off a status or a verdict label the pipeline
 *      already produced. The tally is a count of findings per tone and is
 *      never folded into one figure: that would put "measured against 12
 *      trials" and "the model recalls" on a single axis, which is the failure
 *      this project exists to prevent.
 *   2. "NOT SCORED" IS NEVER A LOW TONE. No run -> tone `unknown`, headline
 *      "not measured yet". Same rule the analyzer keeps for its cards.
 *   3. A MODEL ESTIMATE IS STAMPED. `estimated: true` whenever the tone rests
 *      on model recollection (stage 2b, the model form assessment, the model
 *      company profile). The UI renders those findings dashed, under the same
 *      "model knowledge -- unverified" badge every other model block wears.
 *   4. EVERY SENTENCE IS A TEMPLATE over fields that already exist. Nothing
 *      here reads a paper, infers a dose or guesses a firm's history.
 *
 * Pure function of the ScanAnalysis. Unit-tested against the fakes in
 * tests/scan.test.ts with zero model calls.
 */
import type { Basis } from "./compatibility";
import { mg } from "./dose-effectiveness";
import type { PriorOutcome } from "./evidence-prior";
import type { ScanAnalysis } from "./scan";

export type Tone = "good" | "mixed" | "caution" | "concern" | "unknown";
export type Certainty = "measured" | "estimated" | "none";
export type FindingKey = "evidence" | "dose" | "form" | "combination" | "company";

export interface Finding {
  key: FindingKey;
  /** The shopper's question, e.g. "Does it work?" */
  question: string;
  tone: Tone;
  /** One plain sentence. Never contains a score. */
  headline: string;
  detail: string | null;
  basis: Basis[];
  /** True when the tone rests on model recollection rather than a measurement or a record. */
  estimated: boolean;
}

export interface ScanSummary {
  schema_version: "ScanSummaryV1";
  certainty: Certainty;
  headline: string;
  subline: string | null;
  tally: Record<Tone, number>;
  findings: Finding[];
}

/* ---- the evidence block is untyped JSON on ScanAnalysis; this is its shape -- */

export interface ArcShape {
  verdict?: number | null;
  coverage?: number | null;
  strength?: number | null;
  closeness?: number | null;
  basis?: string | null;
  product_match?: string | null;
  is_quantity?: boolean;
}

export interface EvidenceRowShape {
  outcome: string;
  outcome_label: string | null;
  composite: number | null;
  verdict: string | null;
  n_primaries: number | null;
  applicability?: number | null;
  arcs: { effect: ArcShape; form: ArcShape; dose: ArcShape; evidence: ArcShape };
  benefit_dose_range_mg?: { low: number | null; high: number | null; basis?: string | null } | null;
  null_dose_range_mg?: { low: number | null; high: number | null } | null;
}

export interface EvidenceShape {
  status: string;
  rows?: EvidenceRowShape[];
  scored_forms?: string[];
  refused?: Array<{ outcome: string; reason: string }>;
  run?: Record<string, unknown>;
  validity?: { status: string | null; public_claims_allowed: boolean; note: string | null; limitations?: unknown[] };
}

export function evidenceOf(analysis: Pick<ScanAnalysis, "evidence">): EvidenceShape | null {
  const e = analysis.evidence;
  if (!e || typeof e !== "object" || typeof (e as { status?: unknown }).status !== "string") return null;
  return e as unknown as EvidenceShape;
}

/* ---- vocabulary ----------------------------------------------------------- */

/** Verdict labels from lib/analyze/scoring.ts verdictLabel -> a tone. */
const LABEL_TONE: Record<string, Tone> = {
  works: "good",
  "probably works": "good",
  "works, but weakly evidenced": "mixed",
  "works, but not tested for your product": "mixed",
  unclear: "mixed",
  "barely studied": "unknown",
  "confidence unknown": "unknown",
  "not enough human evidence": "unknown",
  "probably does not work": "concern",
  "does not work": "concern",
};

const STRENGTH_RANK: Record<PriorOutcome["evidence_strength"], number> = { strong: 3, moderate: 2, limited: 1, none: 0 };

const TONE_ORDER: Tone[] = ["good", "mixed", "caution", "concern", "unknown"];

export function outcomeName(row: { outcome: string; outcome_label: string | null }): string {
  return row.outcome_label ?? row.outcome.replace(/_/g, " ");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinNames(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function humanForm(id: string | null): string {
  return id ? id.replace(/_/g, " ") : "form not stated";
}

function emptyTally(): Record<Tone, number> {
  return { good: 0, mixed: 0, caution: 0, concern: 0, unknown: 0 };
}

/* ---- evidence ------------------------------------------------------------- */

function measuredEvidence(rows: EvidenceRowShape[], analysis: ScanAnalysis): Finding {
  const tones = rows.map((r) => LABEL_TONE[r.verdict ?? ""] ?? "unknown");
  const has = (t: Tone) => tones.includes(t);
  let tone: Tone;
  if (has("good") && has("concern")) tone = "mixed";
  else if (has("good")) tone = "good";
  else if (has("concern")) tone = "concern";
  else if (has("mixed")) tone = "mixed";
  else tone = "unknown";

  // Lead with the concern when nothing good offsets it; otherwise with the best row.
  const lead = tone === "concern" ? rows[rows.length - 1] : rows[0];
  const rest = rows.filter((r) => r !== lead);
  const byVerdict = new Map<string, string[]>();
  for (const r of rest) {
    const key = r.verdict ?? "not assessed";
    byVerdict.set(key, [...(byVerdict.get(key) ?? []), outcomeName(r)]);
  }
  const restText = [...byVerdict.entries()].map(([verdict, names]) => `${cap(verdict)} for ${joinNames(names)}.`).join(" ");
  const maxN = Math.max(0, ...rows.map((r) => r.n_primaries ?? 0));
  const detail = [
    restText,
    `${rows.length} outcome${rows.length === 1 ? "" : "s"} measured from trials we read and can quote${maxN ? `, the largest on ${maxN} trials` : ""}.`,
    analysis.label?.is_multi_ingredient
      ? "This label doses more than one active; the trials are about the main ingredient on its own."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    key: "evidence",
    question: "Does it work?",
    tone,
    headline: `${cap(lead.verdict ?? "not assessed")} for ${outcomeName(lead)}`,
    detail,
    basis: ["evidence_run"],
    estimated: false,
  };
}

function priorTone(o: PriorOutcome): Tone {
  const rank = STRENGTH_RANK[o.evidence_strength] ?? 0;
  switch (o.direction) {
    case "harm":
      return rank >= 1 ? "concern" : "caution";
    case "benefit":
      return rank >= 2 ? "good" : rank === 1 ? "mixed" : "unknown";
    case "no_effect":
      return rank >= 2 ? "concern" : rank === 1 ? "caution" : "unknown";
    default:
      return "unknown";
  }
}

function priorHeadline(o: PriorOutcome): string {
  const rank = STRENGTH_RANK[o.evidence_strength] ?? 0;
  switch (o.direction) {
    case "harm":
      return `Possible harm for ${o.outcome}`;
    case "benefit":
      return rank >= 2 ? `Likely helps ${o.outcome}` : `May help ${o.outcome}`;
    case "no_effect":
      return rank >= 2 ? `Likely does not help ${o.outcome}` : `Probably no effect on ${o.outcome}`;
    default:
      return `Not enough research on ${o.outcome}`;
  }
}

function estimatedEvidence(analysis: ScanAnalysis, formGap: string | null): Finding | null {
  const prior = analysis.evidence_prior;
  if (!prior || prior.status !== "ok" || !prior.data) return null;
  const outcomes = [...prior.data.outcomes].sort(
    (a, b) => (STRENGTH_RANK[b.evidence_strength] ?? 0) - (STRENGTH_RANK[a.evidence_strength] ?? 0),
  );
  if (!outcomes.length) {
    return {
      key: "evidence",
      question: "Does it work?",
      tone: "unknown",
      headline: "Very little research to go on",
      detail: [formGap, prior.data.summary, "This is the model's reading of the literature, not trials we scored."].filter(Boolean).join(" "),
      basis: ["model_prior"],
      estimated: true,
    };
  }
  const harm = outcomes.find((o) => o.direction === "harm" && (STRENGTH_RANK[o.evidence_strength] ?? 0) >= 1);
  const lead = harm ?? outcomes[0];
  const others = outcomes.filter((o) => o !== lead).slice(0, 3);
  const detail = [
    formGap,
    `Strength of the published literature: ${lead.evidence_strength}.`,
    others.length ? `Also: ${others.map((o) => `${o.outcome} — ${o.direction.replace(/_/g, " ")}`).join("; ")}.` : null,
    "This is the model's reading of the literature, not trials we scored.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    key: "evidence",
    question: "Does it work?",
    tone: priorTone(lead),
    headline: priorHeadline(lead),
    detail,
    basis: ["model_prior"],
    estimated: true,
  };
}

function evidenceFinding(analysis: ScanAnalysis): Finding {
  const evidence = evidenceOf(analysis);
  if (evidence?.status === "scored" && evidence.rows?.length) return measuredEvidence(evidence.rows, analysis);

  const formGap =
    evidence?.status === "form_not_scored"
      ? `Trials have been scored for ${joinNames((evidence.scored_forms ?? []).map(humanForm))}, not for your form.`
      : null;
  const estimated = estimatedEvidence(analysis, formGap);
  if (estimated) return estimated;

  const ingredient = analysis.product?.ingredient.replace(/_/g, " ") ?? analysis.ingredient_label_text ?? "this ingredient";
  const census = analysis.census as { available?: boolean; rcts_indexed?: number; syntheses_indexed?: number } | undefined;
  const detail = [
    formGap ?? `No trial run exists for ${ingredient} yet. That is no data, not a low score.`,
    census?.available ? `Europe PMC indexes ${census.rcts_indexed} randomised trials and ${census.syntheses_indexed} reviews for it.` : null,
    analysis.evidence_prior?.status === "unavailable" ? `The model orientation was unavailable (${analysis.evidence_prior.reason ?? "skipped"}).` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    key: "evidence",
    question: "Does it work?",
    tone: "unknown",
    headline: "Not measured yet",
    detail,
    basis: evidence ? ["evidence_run"] : [],
    estimated: false,
  };
}

/* ---- dose ------------------------------------------------------------------ */

function doseFinding(analysis: ScanAnalysis): Finding {
  const d = analysis.dose_effectiveness;
  const question = "Is the dose right?";

  if (d?.status === "dose_unavailable") {
    const why = analysis.caveats?.find((c) => c.code === "dose_not_convertible")?.text;
    return {
      key: "dose",
      question,
      tone: "unknown",
      headline: "Your dose could not be established",
      detail: why ?? "No per-serving amount could be read or converted, so there is nothing to compare.",
      basis: ["label"],
      estimated: false,
    };
  }

  if (d?.status === "ok" && d.outcomes.length && d.scored_dose_mg !== null) {
    const assessable = d.outcomes.filter((o) => o.tone !== "unassessable");
    const servings = d.scored_dose_basis === "per_serving" ? " Scored per serving because servings per day are not printed; your daily dose may be higher." : "";
    const dose = `${mg(d.scored_dose_mg)}/day`;
    if (!assessable.length) {
      return {
        key: "dose",
        question,
        tone: "unknown",
        headline: "No benefit dose range to compare against yet",
        detail: `No trial that found a benefit carried a usable dose, so ${dose} cannot be placed.${servings}`,
        basis: ["evidence_run", "label"],
        estimated: false,
      };
    }
    const inRange = assessable.filter((o) => o.tone === "in_range");
    const below = assessable.filter((o) => o.tone === "below");
    const above = assessable.filter((o) => o.tone === "above");
    const ranges = (list: typeof assessable) =>
      list
        .map((o) => `${outcomeName(o)} (benefit seen at ${mg(o.benefit_range_mg?.low ?? null)}–${mg(o.benefit_range_mg?.high ?? null)})`)
        .join("; ");
    if (!below.length && !above.length) {
      return {
        key: "dose",
        question,
        tone: "good",
        headline: "Your dose is in the range that worked",
        detail: `${dose} sits inside the benefit range for ${joinNames(inRange.map(outcomeName))}.${servings}`,
        basis: ["evidence_run", "label"],
        estimated: false,
      };
    }
    if (!inRange.length) {
      const where = below.length && above.length ? "outside" : below.length ? "below" : "above";
      return {
        key: "dose",
        question,
        tone: "caution",
        headline: `Your dose is ${where} the range that worked`,
        detail: `${dose} vs ${ranges([...below, ...above])}.${above.length ? " More than the trials used is not evidence of more effect." : ""}${servings}`,
        basis: ["evidence_run", "label"],
        estimated: false,
      };
    }
    return {
      key: "dose",
      question,
      tone: "mixed",
      headline: "In range for some outcomes, not others",
      detail:
        `${dose} is in range for ${joinNames(inRange.map(outcomeName))}` +
        (below.length ? `; below for ${ranges(below)}` : "") +
        (above.length ? `; above for ${ranges(above)}` : "") +
        `.${servings}`,
      basis: ["evidence_run", "label"],
      estimated: false,
    };
  }

  // No scored rows: fall back to the model's recalled range, placed by OUR ramp.
  const prior = analysis.evidence_prior;
  if (prior?.status === "ok" && prior.data) {
    const placed = prior.data.outcomes.filter((o) => o.dose_closeness !== null && o.dose_closeness !== undefined);
    if (prior.scored_dose_mg === null) {
      return {
        key: "dose",
        question,
        tone: "unknown",
        headline: "Your dose could not be read off the label",
        detail: "Without a per-serving amount there is nothing to compare against the recalled range.",
        basis: ["label"],
        estimated: false,
      };
    }
    if (!placed.length) {
      return {
        key: "dose",
        question,
        tone: "unknown",
        headline: "No effective dose range to compare against",
        detail: "The model recalled no effective daily range for any outcome, so your dose is not placed.",
        basis: ["model_prior", "label"],
        estimated: true,
      };
    }
    const inRange = placed.filter((o) => (o.dose_closeness ?? 0) >= 0.999);
    const off = placed.filter((o) => (o.dose_closeness ?? 0) < 0.999);
    const tone: Tone = !off.length ? "good" : !inRange.length ? "caution" : "mixed";
    const headline = !off.length
      ? "Your dose matches the range the literature reports"
      : !inRange.length
        ? "Your dose is outside the range the literature reports"
        : "In range for some outcomes, not others";
    return {
      key: "dose",
      question,
      tone,
      headline,
      detail: `${(off[0] ?? inRange[0]).dose_reading ?? ""} The range is the model's recollection; the placement is ours.`.trim(),
      basis: ["model_prior", "label"],
      estimated: true,
    };
  }

  return {
    key: "dose",
    question,
    tone: "unknown",
    headline: "No dose range to compare against yet",
    detail: d?.status === "not_scored" ? "No scored outcome, so there is no benefit range." : null,
    basis: ["label"],
    estimated: false,
  };
}

/* ---- form ------------------------------------------------------------------ */

function formFinding(analysis: ScanAnalysis): Finding {
  const compat = analysis.compatibility;
  const question = "Is this the right form?";
  const notes = compat?.form_notes ?? [];
  // Only the curated table can lower the tone: its kind is a cited fact.
  const curatedCaution = notes.find((n) => n.basis === "curated_table" && n.kind === "low_bioavailability");
  const firstNote = notes[0]?.note ?? null;
  const form = humanForm(analysis.product?.form ?? analysis.label?.form_vocab_id ?? null);
  const fit = compat?.evidence_form_fit;
  const basis: Basis[] = notes.length ? ["evidence_run", "curated_table"] : ["evidence_run"];

  if (fit?.status === "exact_form_scored") {
    return {
      key: "form",
      question,
      tone: curatedCaution ? "caution" : "good",
      headline: curatedCaution ? `${cap(form)} was scored, but absorbs poorly` : `${cap(form)} is the form the trials used`,
      detail: curatedCaution?.note ?? firstNote ?? "The evidence run scored this exact form, so the verdicts above are about your product's form.",
      basis,
      estimated: false,
    };
  }
  if (fit?.status === "form_not_scored") {
    return {
      key: "form",
      question,
      tone: "caution",
      headline: `${cap(form)} has not been tested directly`,
      detail: `Trials scored so far used ${joinNames(fit.scored_forms.map(humanForm))}. Evidence about another form is not evidence about yours.${firstNote ? ` ${firstNote}` : ""}`,
      basis,
      estimated: false,
    };
  }

  const assessment = analysis.evidence_prior?.status === "ok" ? analysis.evidence_prior.data?.form_assessment : null;
  if (assessment && assessment.verdict !== "unknown") {
    const tone: Tone = assessment.verdict === "well_absorbed" ? "good" : assessment.verdict === "poorly_absorbed" ? "caution" : "mixed";
    const headline =
      assessment.verdict === "well_absorbed"
        ? `${cap(form)} is a well-absorbed form`
        : assessment.verdict === "poorly_absorbed"
          ? `${cap(form)} is a poorly absorbed form`
          : `No established difference between forms`;
    return {
      key: "form",
      question,
      tone: curatedCaution ? "caution" : tone,
      headline,
      detail: [curatedCaution?.note ?? assessment.note, "The model's assessment, not a scored form arc."].filter(Boolean).join(" "),
      basis: notes.length ? ["model_prior", "curated_table"] : ["model_prior"],
      estimated: true,
    };
  }
  if (curatedCaution) {
    return {
      key: "form",
      question,
      tone: "caution",
      headline: `${cap(form)} absorbs poorly`,
      detail: curatedCaution.note,
      basis: ["curated_table"],
      estimated: false,
    };
  }
  return {
    key: "form",
    question,
    tone: "unknown",
    headline: "Form not assessed yet",
    detail: firstNote ?? "No run scored this form and the model offered no assessment.",
    basis: notes.length ? ["curated_table"] : [],
    estimated: false,
  };
}

/* ---- combination ----------------------------------------------------------- */

function combinationFinding(analysis: ScanAnalysis): Finding {
  const c = analysis.compatibility;
  const question = "Does the mix hold up?";
  if (!c) {
    return { key: "combination", question, tone: "unknown", headline: "Combination not checked", detail: null, basis: [], estimated: false };
  }
  if (c.status === "single_active") {
    return {
      key: "combination",
      question,
      tone: "good",
      headline: "One active ingredient, nothing to clash with",
      detail: null,
      basis: ["label"],
      estimated: false,
    };
  }
  const ints = c.interactions;
  const pair = (x: (typeof ints)[number]) => `${x.a} + ${x.b}: ${x.advice ?? x.kind.replace(/_/g, " ")}`;
  const bases = [...new Set<Basis>(["label", ...ints.map((i) => i.basis)])];
  const allModel = ints.length > 0 && ints.every((i) => i.basis === "model_prior");
  const high = ints.filter((i) => i.severity === "high");
  const moderate = ints.filter((i) => i.severity === "moderate");
  if (high.length) {
    return {
      key: "combination",
      question,
      tone: "concern",
      headline: "A combination on this label needs attention",
      detail: high.map(pair).join(" "),
      basis: bases,
      estimated: allModel,
    };
  }
  if (moderate.length) {
    return {
      key: "combination",
      question,
      tone: "caution",
      headline: "Some actives compete or need spacing out",
      detail: moderate.map(pair).join(" "),
      basis: bases,
      estimated: allModel,
    };
  }
  if (ints.length) {
    return {
      key: "combination",
      question,
      tone: "good",
      headline: "The mix holds up",
      detail: ints.map(pair).join(" "),
      basis: bases,
      estimated: allModel,
    };
  }
  if (c.model.status === "ok" && c.model.overall) {
    return {
      key: "combination",
      question,
      tone: "good",
      headline: "No documented problem in the mix",
      detail: `${c.model.overall} (The model's read of pairs the curated table does not cover.)`,
      basis: ["label", "model_prior"],
      estimated: true,
    };
  }
  if (c.model.status === "skipped_no_uncovered_pairs") {
    return {
      key: "combination",
      question,
      tone: "good",
      headline: "No documented interaction among these actives",
      detail: "Every pair on the label is covered by the curated, cited table and none is flagged.",
      basis: ["label", "curated_table"],
      estimated: false,
    };
  }
  return {
    key: "combination",
    question,
    tone: "unknown",
    headline: "Combination not fully checked",
    detail: c.model.reason ? `The model fill-in was unavailable (${c.model.reason}); the curated table flagged nothing.` : null,
    basis: ["label"],
    estimated: false,
  };
}

/* ---- company --------------------------------------------------------------- */

function companyFinding(analysis: ScanAnalysis): Finding {
  const co = analysis.company;
  const question = "Who makes it?";
  if (!co || co.status === "no_brand_on_label") {
    return {
      key: "company",
      question,
      tone: "unknown",
      headline: "No brand printed on the label",
      detail: "Nothing to look up without a brand or manufacturer name.",
      basis: ["label"],
      estimated: false,
    };
  }
  const who = co.brand ?? co.manufacturer ?? "this company";
  const recalls = co.registry.recalls;
  if (recalls.length) {
    const latest = [...recalls].sort((a, b) => (b.initiated ?? "").localeCompare(a.initiated ?? ""))[0];
    return {
      key: "company",
      question,
      tone: "concern",
      headline: `${recalls.length} FDA recall${recalls.length === 1 ? "" : "s"} on file for ${latest.firm ?? who}`,
      detail: `${latest.initiated ?? "Date unknown"}: ${latest.reason ?? "reason not stated"}${latest.classification ? ` (${latest.classification})` : ""}.`,
      basis: ["registry"],
      estimated: false,
    };
  }
  const profile = co.profile.status === "ok" ? co.profile.data : null;
  const serious = (profile?.regulatory_history ?? []).filter((h) => h.kind !== "other" && !(h.kind === "recall" && h.registry_corroborated === false));
  const uncorroborated = (profile?.regulatory_history ?? []).filter((h) => h.kind === "recall" && h.registry_corroborated === false);
  const noRecall = co.registry.status === "no_matches" ? `No FDA recall on file for ${who}.` : null;
  const seals = co.certifications_printed.map((s) => s.text);

  if (serious.length) {
    const item = serious[0];
    return {
      key: "company",
      question,
      tone: "caution",
      headline: `${who}: ${item.kind.replace(/_/g, " ")} recalled by the model${item.year ? ` (${item.year})` : ""}`,
      detail: [item.summary, noRecall, "Model recollection; not corroborated by a registry here."].filter(Boolean).join(" "),
      basis: noRecall ? ["model_prior", "registry"] : ["model_prior"],
      estimated: true,
    };
  }
  if (profile?.third_party_testing.status === "documented") {
    return {
      key: "company",
      question,
      tone: "good",
      headline: `${who} publishes third-party testing`,
      detail: [noRecall, profile.third_party_testing.program ? `Program: ${profile.third_party_testing.program}.` : null, "The testing claim is model recollection; the recall check is a registry fact."]
        .filter(Boolean)
        .join(" "),
      basis: noRecall ? ["registry", "model_prior"] : ["model_prior"],
      estimated: true,
    };
  }
  if (seals.length || profile?.third_party_testing.status === "claimed") {
    return {
      key: "company",
      question,
      tone: "mixed",
      headline: noRecall ? `No recall on file; testing seals printed but unverified` : "Testing seals printed but unverified",
      detail: [
        seals.length ? `Printed: ${joinNames(seals)}.` : null,
        "A seal is a claim until the certifier's registry confirms it; this page does not.",
        uncorroborated.length ? "The model also recalled a recall that openFDA does not hold under this firm name." : null,
      ]
        .filter(Boolean)
        .join(" "),
      basis: noRecall ? ["registry", "label"] : ["label"],
      estimated: false,
    };
  }
  if (noRecall) {
    return {
      key: "company",
      question,
      tone: "mixed",
      headline: `No recall on file, but little else is known about ${who}`,
      detail: [noRecall, profile?.summary ?? null, uncorroborated.length ? "The model recalled a recall that openFDA does not hold under this firm name." : null].filter(Boolean).join(" "),
      basis: profile ? ["registry", "model_prior"] : ["registry"],
      estimated: false,
    };
  }
  return {
    key: "company",
    question,
    tone: "unknown",
    headline: `Nothing on record could be checked for ${who}`,
    detail: co.registry.status === "unavailable" ? `The FDA registry was unavailable (${co.registry.reason ?? "no reason given"}).` : null,
    basis: ["label"],
    estimated: false,
  };
}

/* ---- the summary ----------------------------------------------------------- */

export function buildScanSummary(analysis: ScanAnalysis): ScanSummary | null {
  if (!analysis.label || !analysis.label.is_supplement_label) return null;

  const findings: Finding[] = [
    evidenceFinding(analysis),
    doseFinding(analysis),
    formFinding(analysis),
    combinationFinding(analysis),
    companyFinding(analysis),
  ];
  const tally = emptyTally();
  for (const f of findings) tally[f.tone] += 1;

  const evidence = evidenceOf(analysis);
  const measured = evidence?.status === "scored" && Boolean(evidence.rows?.length);
  const estimated = !measured && analysis.evidence_prior?.status === "ok" && Boolean(analysis.evidence_prior.data);
  const certainty: Certainty = measured ? "measured" : estimated ? "estimated" : "none";

  const product = analysis.label.product_name ?? analysis.label.ingredient_label_text ?? "This product";
  let headline: string;
  let subline: string | null;
  if (certainty === "measured") {
    headline = `${product}, checked against clinical trials`;
    subline = evidence?.validity && !evidence.validity.public_claims_allowed
      ? "The evidence verdicts come from trials we read and can quote. Early-stage: this run has not passed independent validation, so nothing here is a product claim."
      : "The evidence verdicts come from trials we read and can quote.";
  } else if (certainty === "estimated") {
    headline = `${product}: no trial run yet, so the evidence reading is a model estimate`;
    subline = "Dose, form, mix and company checks use the label, cited tables and public records where they exist. Anything resting on the model alone is marked.";
  } else {
    headline = `${product}: evidence not measured yet`;
    subline = "What could be checked from the label and public records is below. Not measured is not a low score.";
  }

  return { schema_version: "ScanSummaryV1", certainty, headline, subline, tally, findings };
}

export { TONE_ORDER };
