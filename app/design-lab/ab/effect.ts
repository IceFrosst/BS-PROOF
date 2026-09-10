/*
 * Effect grading — data driven, umbrella-review shaped. PROPOSED, demo-only.
 *
 * Replaces "the model picks an effect tier" with "code computes one from the
 * best-conducted sources". Four steps, per docs/design/2026-09-10-evidence-ledger-rubric.md:
 *
 *   1. QUALITY   score each source from objective reported facts (short-form AMSTAR-2).
 *   2. OVERLAP   corrected covered area; heavily overlapping reviews are ONE source.
 *   3. COMBINE   inverse-variance weighted mean across independent sources (max 3).
 *   4. DISAGREE  sources that disagree beyond their intervals cost a tier.
 *
 * Industry funding is deliberately NOT part of the quality score. It is a
 * separate disclosure surface in the product, not a silent score penalty.
 */

/** Objective, checkable facts about a source. No judgement calls. */
export interface QualityFacts {
  isCochrane: boolean;
  prosperoRegistered: boolean;
  gradeReported: boolean;
  robToolUsed: boolean;
  heterogeneityReported: boolean;
  publicationBiasTested: boolean;
  trialCount: number;
  totalN: number;
}

export type Metric = "smd" | "rr";

export interface EvidenceSource {
  id: string;
  year: number;
  design: "sr_ma" | "rct";
  metric: Metric;
  /** Point estimate: SMD/Hedges g, or a risk ratio. */
  estimate: number;
  ciLow: number;
  ciHigh: number;
  quality: QualityFacts;
  /** Trial ids pooled by this review; used for overlap. An RCT lists itself. */
  trialIds: string[];
}

export const QUALITY_MAX = 9;
/** Below this a source is not allowed to drive the effect tier on its own. */
export const QUALITY_FLOOR = 4;
/** Corrected covered area above this means the reviews are not independent. */
export const CCA_SAME_SOURCE = 0.5;
/** One review subsuming this share of another means they are not independent. */
export const CONTAINMENT_SAME_SOURCE = 0.5;
export const MAX_COMBINED_SOURCES = 3;

/**
 * Short-form AMSTAR-2. Deliberately excludes funding.
 * Cochrane counts double because it bundles registration, duplicate screening
 * and a mandated RoB tool that we would otherwise score separately.
 */
export function qualityScore(q: QualityFacts): number {
  let s = 0;
  if (q.isCochrane) s += 2;
  if (q.prosperoRegistered) s += 1;
  if (q.gradeReported) s += 1;
  if (q.robToolUsed) s += 1;
  if (q.heterogeneityReported) s += 1;
  if (q.publicationBiasTested) s += 1;
  if (q.trialCount >= 10) s += 1;
  if (q.totalN >= 1000) s += 1;
  return Math.min(QUALITY_MAX, s);
}

/**
 * Corrected covered area (Pieper et al.) over a set of reviews:
 *   CCA = (N - r) / (r*c - r)
 * N = total index entries, r = distinct trials, c = reviews.
 * 0 = no shared trials, 1 = identical trial sets.
 */
export function correctedCoveredArea(sources: EvidenceSource[]): number {
  if (sources.length < 2) return 0;
  const c = sources.length;
  const N = sources.reduce((a, s) => a + s.trialIds.length, 0);
  const r = new Set(sources.flatMap((s) => s.trialIds)).size;
  if (r === 0) return 0;
  const denom = r * c - r;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(1, (N - r) / denom));
}

/**
 * Share of the SMALLER trial set that also appears in the larger one.
 * CCA understates subsumption: 23 trials wholly inside a 69-trial review scores
 * only 0.33, yet the two are plainly not independent evidence. Containment
 * catches that case, which is exactly the creatine one.
 */
export function containment(a: EvidenceSource, b: EvidenceSource): number {
  const A = new Set(a.trialIds), B = new Set(b.trialIds);
  const smaller = A.size <= B.size ? A : B;
  const larger = A.size <= B.size ? B : A;
  if (smaller.size === 0) return 0;
  let shared = 0;
  for (const t of smaller) if (larger.has(t)) shared += 1;
  return shared / smaller.size;
}

/** Not independent if they either overlap heavily or one subsumes the other. */
export function sameEvidence(a: EvidenceSource, b: EvidenceSource): boolean {
  return correctedCoveredArea([a, b]) > CCA_SAME_SOURCE || containment(a, b) > CONTAINMENT_SAME_SOURCE;
}

/** Standard error implied by a reported 95% interval. */
export function seFromCi(lo: number, hi: number): number {
  const se = (hi - lo) / 3.92;
  return se > 0 ? se : Number.NaN;
}

/**
 * Step 2. Group sources that share most of their trials, keep the
 * best-conducted one per group (ties: more trials, then newer).
 */
export function dedupeByOverlap(sources: EvidenceSource[]): { kept: EvidenceSource[]; dropped: { id: string; supersededBy: string; cca: number }[] } {
  const better = (a: EvidenceSource, b: EvidenceSource) => {
    const qa = qualityScore(a.quality);
    const qb = qualityScore(b.quality);
    if (qa !== qb) return qa > qb ? a : b;
    if (a.quality.trialCount !== b.quality.trialCount) return a.quality.trialCount > b.quality.trialCount ? a : b;
    return a.year >= b.year ? a : b;
  };
  const kept: EvidenceSource[] = [];
  const dropped: { id: string; supersededBy: string; cca: number }[] = [];
  for (const s of [...sources].sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))) {
    const clash = kept.find((k) => sameEvidence(k, s));
    if (!clash) { kept.push(s); continue; }
    const win = better(clash, s);
    const lose = win === clash ? s : clash;
    const cca = Math.max(correctedCoveredArea([clash, s]), containment(clash, s));
    if (win !== clash) kept.splice(kept.indexOf(clash), 1, s);
    dropped.push({ id: lose.id, supersededBy: win.id, cca: Number(cca.toFixed(2)) });
  }
  return { kept, dropped };
}

/** Two sources disagree when their 95% intervals do not overlap at all. */
export function disagree(a: EvidenceSource, b: EvidenceSource): boolean {
  if (a.metric !== b.metric) return false;
  return a.ciHigh < b.ciLow || b.ciHigh < a.ciLow;
}

export interface CombinedEffect {
  metric: Metric;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  usedSourceIds: string[];
  droppedForOverlap: { id: string; supersededBy: string; cca: number }[];
  excludedForQuality: string[];
  disagreement: boolean;
  /** Interval BEFORE any disagreement widening, so the cost of disagreement is visible. */
  ciLowNarrow: number;
  ciHighNarrow: number;
  notes: string[];
}

/**
 * Steps 1-3. Filter on quality, collapse overlapping reviews, then combine what
 * is left by inverse variance. Returns null when nothing survives.
 */
export function combineSources(all: EvidenceSource[]): CombinedEffect | null {
  const notes: string[] = [];
  if (all.length === 0) return null;

  const metric = all[0].metric;
  const sameMetric = all.filter((s) => s.metric === metric);
  if (sameMetric.length !== all.length) notes.push("Sources on a different metric were left out rather than converted.");

  let pool = sameMetric.filter((s) => qualityScore(s.quality) >= QUALITY_FLOOR);
  const excludedForQuality = sameMetric.filter((s) => qualityScore(s.quality) < QUALITY_FLOOR).map((s) => s.id);
  if (pool.length === 0) {
    // Nothing clears the bar: fall back to the single best, and say so.
    const best = [...sameMetric].sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality))[0];
    pool = [best];
    notes.push("No source met the methodology floor; the best available one is used and certainty should reflect that.");
  }

  const { kept, dropped } = dedupeByOverlap(pool);
  const ranked = [...kept].sort((a, b) => qualityScore(b.quality) - qualityScore(a.quality)).slice(0, MAX_COMBINED_SOURCES);
  if (kept.length > ranked.length) notes.push(`Combined the ${ranked.length} best-conducted independent sources.`);

  let disagreement = false;
  for (let i = 0; i < ranked.length; i++) for (let j = i + 1; j < ranked.length; j++) if (disagree(ranked[i], ranked[j])) disagreement = true;

  // Inverse-variance weighting on the analysis scale (log for ratios).
  const toScale = (v: number) => (metric === "rr" ? Math.log(v) : v);
  const fromScale = (v: number) => (metric === "rr" ? Math.exp(v) : v);
  let wSum = 0, wxSum = 0;
  for (const s of ranked) {
    const se = seFromCi(toScale(s.ciLow), toScale(s.ciHigh));
    const w = Number.isFinite(se) && se > 0 ? 1 / (se * se) : 1;
    wSum += w; wxSum += w * toScale(s.estimate);
  }
  const mean = wxSum / wSum;
  const seNarrow = Math.sqrt(1 / wSum);
  let se = seNarrow;

  if (disagreement) {
    // Do not let averaging manufacture precision the sources do not share:
    // widen until the interval covers every point estimate.
    const pts = ranked.map((s) => toScale(s.estimate));
    const need = Math.max(...pts.map((p) => Math.abs(p - mean))) / 1.96;
    se = Math.max(se, need);
    notes.push("Sources disagree beyond their confidence intervals; the interval was widened and the tier lowered.");
  }

  return {
    metric,
    estimate: Number(fromScale(mean).toFixed(4)),
    ciLow: Number(fromScale(mean - 1.96 * se).toFixed(4)),
    ciHigh: Number(fromScale(mean + 1.96 * se).toFixed(4)),
    ciLowNarrow: Number(fromScale(mean - 1.96 * seNarrow).toFixed(4)),
    ciHighNarrow: Number(fromScale(mean + 1.96 * seNarrow).toFixed(4)),
    usedSourceIds: ranked.map((s) => s.id),
    droppedForOverlap: dropped,
    excludedForQuality,
    disagreement,
    notes,
  };
}

export type EffectTier = -3 | 0 | 1 | 2 | 3;

/**
 * Bands calibrated against things a person can check by feel, NOT Cohen's
 * variance convention:
 *   3  caffeine on alertness      — you notice it without being told
 *   2  creatine on strength       — you notice it over weeks
 *   1  melatonin, 7 min to sleep  — real, but only visible in the data
 *   0  magnesium, 1.6 ISI points against a 6-point threshold
 * Ratio bands follow GRADE's large-effect guidance (2-fold / 5-fold).
 */
export const SMD_BANDS = { large: 0.5, moderate: 0.3, small: 0.1 } as const;
export const RR_BANDS = { large: 0.5, moderate: 0.67, small: 0.8 } as const;

export function tierFromEstimate(metric: Metric, estimate: number, ciLow: number, ciHigh: number): EffectTier {
  if (metric === "smd") {
    if (ciLow < 0 && ciHigh > 0) return 0; // interval spans no effect
    if (estimate < 0) {
      const m = Math.abs(estimate);
      return m >= SMD_BANDS.small ? -3 : 0;
    }
    if (estimate >= SMD_BANDS.large) return 3;
    if (estimate >= SMD_BANDS.moderate) return 2;
    if (estimate >= SMD_BANDS.small) return 1;
    return 0;
  }
  if (ciLow < 1 && ciHigh > 1) return 0;
  if (estimate > 1) return estimate >= 1 / RR_BANDS.small ? -3 : 0; // ratio above 1 = more bad events
  if (estimate <= RR_BANDS.large) return 3;
  if (estimate <= RR_BANDS.moderate) return 2;
  if (estimate <= RR_BANDS.small) return 1;
  return 0;
}

export interface GradedEffect extends CombinedEffect {
  tier: EffectTier;
  tierBeforeDisagreement: EffectTier;
}

/** Steps 1-4 end to end. Disagreement costs exactly one tier. */
export function gradeEffect(sources: EvidenceSource[]): GradedEffect | null {
  const c = combineSources(sources);
  if (!c) return null;
  // Tier the sources would have supported had they agreed...
  const raw = tierFromEstimate(c.metric, c.estimate, c.ciLowNarrow, c.ciHighNarrow);
  // ...and the tier the widened interval supports. Disagreement costs at least
  // one tier, and more if widening pushes the interval across no-effect.
  let tier = raw;
  if (c.disagreement) {
    const widened = tierFromEstimate(c.metric, c.estimate, c.ciLow, c.ciHigh);
    tier = Math.min(widened, Math.max(0, raw - 1)) as EffectTier;
  }
  return { ...c, tier, tierBeforeDisagreement: raw };
}
