/*
 * Effect PRESENTATION — what the Effect bar is allowed to say. Development-only.
 *
 * This replaces the old `effectPoints / 3` noticeability fill, which drew a
 * partially filled bar out of a tier a model had chosen and rendered "no number
 * was graded" as an empty bar — indistinguishable from a measured zero.
 *
 * Five honest states, and they are deliberately NOT interchangeable:
 *
 *   reported_interval     an estimate AND its interval exist -> draw the interval
 *                         in its own natural unit, labelled "Reported estimate,
 *                         not a grade". No 0-3 fill, no conversion, no anchor.
 *   reported_point        an estimate exists, the interval does NOT -> draw the
 *                         point and say the interval is unavailable. Never a
 *                         fabricated interval.
 *   not_graded            no structured estimate or no threshold -> hatched
 *                         track, "Size not graded". NEVER a zero fill.
 *   no_evidence           nothing was measured at all.
 *   no_meaningful_benefit a previous pass recorded a measured null.
 *
 * "Size not graded", "No evidence found" and "No meaningful benefit" are three
 * different sentences about the world and must never render the same.
 *
 * The legacy path reuses text the earlier audits ALREADY contain
 * (absolute_effect, clinically_meaningful, inventory, strongest_doubt) and
 * stamps it "Previous AI audit · not reverified". It does not regex-parse
 * clinical prose into a number and does not endorse a legacy MCID assertion.
 */
import { impact } from "./effect-impact";
import {
  findSource, sourceUrl,
  type EffectMetric, type EffectOutcome, type EffectResearchFile, type NotAssessedBar, type ReportedEstimate,
} from "./effect-contract";

export const PREVIOUS_AUDIT_LABEL = "Previous AI audit · not reverified";
export const PREVIOUS_RUBRIC_LABEL = "Previous rubric · unchanged";
export const REPORTED_ESTIMATE_LABEL = "Reported estimate, not a grade";
export const FICTIONAL_LABEL = "Fictional demo ledger · invented numbers";
export const NOT_ASSESSED_WORD = "Not assessed in this run";
export const SIZE_NOT_GRADED_WORD = "Size not graded";
/** The previous rubric's own effect words, shown for the audits that carry a tier. */
export const LEGACY_EFFECT_WORDS: Record<string, string> = {
  "-3": "Harm reported", "1": "Small benefit", "2": "Moderate benefit", "3": "Large benefit",
};
export const NO_EVIDENCE_WORD = "No evidence found";
export const NO_MEANINGFUL_BENEFIT_WORD = "No meaningful benefit";

export type EffectBarKind =
  | "reported_interval"
  | "reported_point"
  | "not_graded"
  | "no_evidence"
  | "no_meaningful_benefit"
  | "fictional_points";

export interface EffectLine { label: string; body: string }
export interface EffectSourceLink { id: string; label: string; url: string | null; access: string }

export interface IntervalScale {
  metric: EffectMetric;
  unit: string;
  axisLow: number;
  axisHigh: number;
  /** null when no interval was reported — the caller must not draw a bar. */
  lowPct: number | null;
  highPct: number | null;
  markerPct: number;
  /** Position of the no-effect line: 0 for SMD, 1 for a ratio. */
  nullPct: number;
  lowLabel: string | null;
  highLabel: string | null;
  markerLabel: string;
  nullLabel: string;
  axisLowLabel: string;
  axisHighLabel: string;
}

export interface EffectBar {
  kind: EffectBarKind;
  /** Short state word in the row. */
  word: string;
  /** Compact right-hand value. "—" whenever nothing was graded. */
  pts: string;
  /** Where this came from and how much it is worth. Always rendered. */
  provenance: string;
  /** ONLY the explicitly fictional ledgers fill a bar. Everything else is null. */
  fill: number | null;
  scale: IntervalScale | null;
  lines: EffectLine[];
  sourceLinks: EffectSourceLink[];
}

/** Rows are keyed by name AND population. Two outcomes can share a name. */
export function outcomeKey(name: string, population?: string | null): string {
  return `${name}||${population ?? ""}`;
}

/** Select by the composite key, so a same-named row in another population is untouched. */
export function pickByKey<T extends { name: string; population?: string | null }>(rows: T[], key: string): T | undefined {
  return rows.find((r) => outcomeKey(r.name, r.population) === key);
}

const MINUS = "\u2212";
function fmt(n: number): string {
  const s = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
  return s.startsWith("-") ? MINUS + s.slice(1) : s;
}

/** Print an estimate in its own metric. SMD stays SMD, RR stays RR. */
export function estimateText(e: ReportedEstimate): string {
  const core = `${e.unit} ${fmt(e.value)}`;
  if (e.ciLow === null || e.ciHigh === null) return `${core} (no interval reported)`;
  return `${core} (95% CI ${fmt(e.ciLow)} to ${fmt(e.ciHigh)})`;
}

const nullValueFor = (metric: EffectMetric) => (metric === "rr" ? 1 : 0);

/**
 * Geometry for a plain horizontal interval. The axis is derived ONLY from the
 * numbers in the file plus the metric's own null value — there is no global
 * threshold, no SMD anchor and no "meaningful" mark anywhere on it.
 */
export function intervalScale(e: ReportedEstimate): IntervalScale {
  const nullValue = nullValueFor(e.metric);
  const points = [e.value, nullValue, ...(e.ciLow !== null ? [e.ciLow] : []), ...(e.ciHigh !== null ? [e.ciHigh] : [])];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const pad = span > 0 ? span * 0.2 : Math.max(Math.abs(max) * 0.5, 0.1);
  const axisLow = min - pad;
  const axisHigh = max + pad;
  const pct = (x: number) => ((x - axisLow) / (axisHigh - axisLow)) * 100;
  return {
    metric: e.metric,
    unit: e.unit,
    axisLow,
    axisHigh,
    lowPct: e.ciLow === null ? null : pct(e.ciLow),
    highPct: e.ciHigh === null ? null : pct(e.ciHigh),
    markerPct: pct(e.value),
    nullPct: pct(nullValue),
    lowLabel: e.ciLow === null ? null : fmt(e.ciLow),
    highLabel: e.ciHigh === null ? null : fmt(e.ciHigh),
    markerLabel: fmt(e.value),
    nullLabel: e.metric === "rr" ? "1 (no effect)" : "0 (no effect)",
    axisLowLabel: fmt(axisLow),
    axisHighLabel: fmt(axisHigh),
  };
}

/* ------------------------------------------------------------------ legacy */

export interface LegacyInventoryRow { id: string; access?: string; note?: string }
export interface LegacyEffectInput {
  effectPoints: number | "unclear";
  rctCount: number;
  inventory: LegacyInventoryRow[];
  absoluteEffect?: string;
  clinicallyMeaningful?: string;
  strongestDoubt?: string;
}

/**
 * The three shipped audits carry prose, not a structured estimate. So the bar
 * reports a STATE, never a size — and the prose goes under the expansion with
 * its source ids, attributed to the run that wrote it.
 */
export function legacyEffectBar(input: LegacyEffectInput): EffectBar {
  const lines: EffectLine[] = [];
  if (input.absoluteEffect) lines.push({ label: "Reported effect, previous audit", body: input.absoluteEffect });
  if (input.clinicallyMeaningful) {
    lines.push({ label: "Meaningfulness AS CLAIMED by that audit (not reverified)", body: input.clinicallyMeaningful });
  }
  if (input.strongestDoubt) lines.push({ label: "Strongest doubt recorded then", body: input.strongestDoubt });
  const sourceLinks: EffectSourceLink[] = input.inventory.map((row) => ({
    id: row.id,
    label: row.id,
    url: legacyUrl(row.id),
    access: row.access ?? "unknown",
  }));

  /* Founder call 2026-09-11: the previous audits keep the bar they shipped with.
   * Blanking a graded row to "size not graded" threw away the audit's own
   * judgement and read as a downgrade of the product rather than of our rubric.
   * The tier is the PREVIOUS audit's, stamped as such, not a fresh measurement;
   * the reported effect and its sources stay under the expansion. */
  const noEvidence = input.rctCount === 0 && input.inventory.length === 0;
  const graded = typeof input.effectPoints === "number";
  const kind: EffectBarKind = noEvidence
    ? "no_evidence"
    : input.effectPoints === 0
      ? "no_meaningful_benefit"
      : graded
        ? "fictional_points"
        : "not_graded";
  const word = kind === "no_evidence"
    ? NO_EVIDENCE_WORD
    : kind === "no_meaningful_benefit"
      ? NO_MEANINGFUL_BENEFIT_WORD
      : graded
        ? LEGACY_EFFECT_WORDS[String(input.effectPoints)] ?? SIZE_NOT_GRADED_WORD
        : SIZE_NOT_GRADED_WORD;
  // effectPoints 0 IS a number, but a null result must never draw a zero-width
  // fill: "no meaningful benefit" is a finding, not a small effect.
  const points = graded && input.effectPoints !== 0 ? (input.effectPoints as number) : null;
  return {
    kind,
    word,
    pts: points === null ? "—" : `${points}/3`,
    provenance: PREVIOUS_AUDIT_LABEL,
    fill: points === null ? null : Math.abs(points) / 3,
    scale: null,
    lines,
    sourceLinks,
  };
}

/** PMID / PMCID / DOI as written in a legacy inventory id, e.g. "PMID 39519498 / 10.3390/nu16213665". */
export function legacyUrl(id: string): string | null {
  const pmid = /PMID\s*(\d{5,9})/i.exec(id);
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`;
  const pmc = /(PMC\d{5,9})/i.exec(id);
  if (pmc) return `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc[1].toUpperCase()}/`;
  const doi = /(10\.\d{4,9}\/[^\s,;)]+)/.exec(id);
  if (doi) return `https://doi.org/${doi[1]}`;
  return null;
}

/* ------------------------------------------------------------------ research */

export function researchEffectBar(file: EffectResearchFile, outcome: EffectOutcome): EffectBar {
  const e = outcome.estimate;
  const hasInterval = e.ciLow !== null && e.ciHigh !== null;
  const primary = findSource(file, outcome.primary_source);
  // The life-impact rung, computed from the outcome kind and the threshold.
  const graded = impact({ outcome });
  const lines: EffectLine[] = [
    { label: `How much better your life gets · ${graded.word}`, body: graded.because },
    ...(graded.toMoveUp ? [{ label: "What would move it up", body: graded.toMoveUp }] : []),
    {
      label: "Published bar for noticing",
      body: outcome.threshold.verdict === "none"
        ? `None found. ${outcome.threshold.note}`
        : `${outcome.threshold.value} ${outcome.threshold.unit} — ${outcome.threshold.verdict === "cleared" ? "CLEARED" : "NOT met by this effect"}. Derived in ${outcome.threshold.derived_in}. ${outcome.threshold.note}`,
    },
    { label: "Quoted estimate", body: `“${outcome.quote.text}” — ${findSource(file, outcome.quote.source)?.label ?? outcome.quote.source}` },
    { label: "Comparator", body: outcome.comparator },
    { label: "Population", body: outcome.population },
    { label: "Timeframe", body: outcome.timeframe },
    { label: "Dose applicability", body: outcome.dose_applicability },
    {
      label: "Practical importance",
      body: outcome.practical_importance.status === "unknown"
        ? `Unknown. ${outcome.practical_importance.note}`
        : outcome.practical_importance.note,
    },
  ];
  for (const also of outcome.also_reported) {
    lines.push({ label: `Also reported (${also.what}, never combined with the above)`, body: estimateText(also) });
  }
  if (primary) {
    if (primary.methods_strengths.length > 0) {
      lines.push({ label: `Method strengths · ${primary.label}`, body: primary.methods_strengths.join(" ") });
    }
    if (primary.methods_limits.length > 0) {
      lines.push({ label: `Method limits · ${primary.label}`, body: primary.methods_limits.join(" ") });
    }
  }
  for (const limit of outcome.limits) lines.push({ label: "Limit", body: limit });
  for (const c of outcome.cross_checks) {
    const src = findSource(file, c.source);
    const relation = c.relation === "same_question"
      ? "same question"
      : c.relation === "different_population"
        ? "DIFFERENT population — does not size this row"
        : "DIFFERENT endpoint — non-comparable context, not a contradiction";
    const overlap = c.overlap === "none"
      ? "no trial overlap"
      : c.overlap === "unknown"
        ? "trial overlap unknown"
        : c.overlap === "partial"
          ? "partial trial overlap"
          : "likely substantial trial overlap";
    const replication = c.independent_replication ? "independent replication" : "NOT counted as independent replication";
    const estimate = c.estimate ? ` ${estimateText(c.estimate)}.` : "";
    lines.push({
      label: `Cross-check · ${src?.label ?? c.source}`,
      body: `${relation}; ${overlap}; ${replication}.${estimate} ${c.note}`,
    });
  }
  const fundingSources = sourcesFor(file, outcome);
  if (fundingSources.length > 0) {
    lines.push({
      label: "Funding — disclosure only, never a score penalty",
      body: fundingSources.map((s) => `${s.label}: ${s.funding}`).join(" "),
    });
  }
  if (file.access_failures.length > 0) {
    lines.push({ label: "Could not access", body: file.access_failures.join(" ") });
  }

  return {
    kind: hasInterval ? "reported_interval" : "reported_point",
    // The ROW now says how much better your life gets. The estimate and its
    // interval stay visible underneath, in the unit the source printed.
    word: graded.word,
    pts: `${fmt(e.value)} ${e.unit}`,
    provenance: hasInterval
      ? REPORTED_ESTIMATE_LABEL
      : `${REPORTED_ESTIMATE_LABEL} · ${e.interval_note}`,
    fill: null,
    scale: intervalScale(e),
    lines,
    sourceLinks: fundingSources.map((s) => ({ id: s.id, label: s.label, url: sourceUrl(s), access: s.access })),
  };
}

/** Primary source first, then every cross-checked source, de-duplicated. */
export function sourcesFor(file: EffectResearchFile, outcome: EffectOutcome) {
  const ids = [outcome.primary_source, outcome.quote.source, ...outcome.also_reported.map((a) => a.source), ...outcome.cross_checks.map((c) => c.source)];
  const seen = new Set<string>();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const src = findSource(file, id);
    if (src) out.push(src);
  }
  return out;
}

/** Why a bar this pass did not look at reads "Not assessed in this run". */
export function notAssessedReason(file: EffectResearchFile, bar: NotAssessedBar): string | null {
  return file.not_assessed.find((n) => n.bar === bar)?.reason ?? null;
}

/* ------------------------------------------------------------------ fictional */

/** The explicitly fictional demo ledgers keep their invented 0-3 bars, labelled as invented. */
export function fictionalEffectBar(effectPoints: number | "unclear", rctCount: number): EffectBar {
  if (effectPoints === "unclear") {
    return {
      kind: rctCount === 0 ? "no_evidence" : "not_graded",
      word: rctCount === 0 ? NO_EVIDENCE_WORD : SIZE_NOT_GRADED_WORD,
      pts: "—",
      provenance: FICTIONAL_LABEL,
      fill: null,
      scale: null,
      lines: [],
      sourceLinks: [],
    };
  }
  if (effectPoints === 0) {
    return {
      kind: "no_meaningful_benefit",
      word: NO_MEANINGFUL_BENEFIT_WORD,
      pts: "0/3",
      provenance: FICTIONAL_LABEL,
      fill: null,
      scale: null,
      lines: [],
      sourceLinks: [],
    };
  }
  return {
    kind: "fictional_points",
    word: effectPoints < 0 ? "Harm reported" : effectPoints === 1 ? "Small benefit" : effectPoints === 2 ? "Moderate benefit" : "Large benefit",
    pts: `${effectPoints}/3`,
    provenance: FICTIONAL_LABEL,
    fill: Math.abs(effectPoints) / 3,
    scale: null,
    lines: [],
    sourceLinks: [],
  };
}
