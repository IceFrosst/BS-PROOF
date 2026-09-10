/*
 * Evidence Ledger rubric v0.1 — PROPOSED, demo-only implementation.
 * Mirrors docs/design/2026-09-10-evidence-ledger-rubric.md. Pure function so
 * the A/B page can show that the number is COMPUTED from the ledger, never
 * written by a model. Not imported by any production route.
 */
export type Judgement = "supported" | "concern" | "unknown";
export type Fit = 0 | 1 | 2 | 3 | 4 | "unknown";

export interface Ledger {
  effectPoints: -3 | 0 | 1 | 2 | 3 | "unclear";
  bodyIsRct: boolean;
  checklist: Record<"risk_of_bias" | "consistency" | "precision" | "directness" | "publication_bias", Judgement>;
  gates: { rctCount: number; largestRctN: number; longestRctWeeks: number; chronicOutcome: boolean; surrogate: boolean; allPositiveIndustryOrOneLab: boolean };
  formFit: Fit;
  doseFit: Fit;
}

export interface Scored {
  effect: number | "unclear";
  certainty: number;
  firedGates: string[];
  applicability: number;
  headline: number | null;
  label: string;
  effectWord: string;
  certaintyWord: string;
  formWord: string;
  doseWord: string;
}

const EFFECT_WORDS: Record<string, string> = { "-3": "Harm reported", "0": "No meaningful effect", "1": "Small benefit", "2": "Moderate benefit", "3": "Large benefit", unclear: "Unclear" };
const CERTAINTY_WORDS = ["Insufficient", "Very low", "Low", "Moderate", "High"];
const FIT_WORDS = ["No match", "Poor match", "Partial match", "Close match", "Exact match"];

export function bandLabel(h: number): string {
  return h >= 65 ? "Works" : h >= 55 ? "Probably works" : h >= 45 ? "Unclear" : h >= 30 ? "Probably does not work" : "Evidence against";
}

export function score(l: Ledger): Scored {
  const fired: string[] = [];
  let certainty = l.bodyIsRct ? 4 : 2;
  for (const [k, v] of Object.entries(l.checklist)) if (v === "concern") { certainty -= 1; void k; }
  certainty = Math.max(0, certainty);
  const caps: number[] = [];
  if (l.gates.rctCount === 0) { fired.push("No human controlled trial"); caps.push(0); }
  else if (l.gates.rctCount === 1) { fired.push("Only one RCT"); caps.push(1); }
  if (l.gates.largestRctN < 50 || (l.gates.chronicOutcome && l.gates.longestRctWeeks < 4)) { fired.push("Best RCT is small or short"); caps.push(2); }
  if (l.gates.surrogate) { fired.push("Outcome is a surrogate marker"); caps.push(3); }
  if (l.gates.allPositiveIndustryOrOneLab) { fired.push("All positive trials industry-funded or one lab"); caps.push(2); }
  if (caps.length) certainty = Math.min(certainty, ...caps);
  const fit = (f: Fit) => (f === "unknown" ? 0.1 : f / 4);
  const applicability = (fit(l.formFit) + fit(l.doseFit)) / 2;
  let headline: number | null = null;
  if (l.effectPoints !== "unclear" && certainty > 0 && l.gates.rctCount > 0) {
    const signal = (l.effectPoints / 3) * (certainty / 4);
    headline = Math.round(50 + 50 * signal * (signal > 0 ? applicability : 1));
  }
  return {
    effect: l.effectPoints,
    certainty,
    firedGates: fired,
    applicability,
    headline,
    label: headline === null ? (l.gates.rctCount === 0 ? "Not enough evidence to score" : "Unclear — no score") : bandLabel(headline),
    effectWord: EFFECT_WORDS[String(l.effectPoints)],
    certaintyWord: CERTAINTY_WORDS[certainty],
    formWord: l.formFit === "unknown" ? "Not tested" : FIT_WORDS[l.formFit],
    doseWord: l.doseFit === "unknown" ? "Unknown" : FIT_WORDS[l.doseFit],
  };
}
