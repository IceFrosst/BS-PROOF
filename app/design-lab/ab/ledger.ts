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

/** Who the studies behind a row actually enrolled. */
export interface StudiedIn {
  sex: "male" | "female" | "mixed" | "unknown";
  sex_note?: string;
  age_min: number | null;
  age_max: number | null;
  age_note?: string;
  ethnicity?: string;
  confidence?: "verified" | "inferred" | "unknown";
}
/** What the person in front of us said about themselves. */
export interface Profile { age: number | null; sex: "male" | "female" | null }

/**
 * Fifth dimension — "studied in people like you". Founder scale (2026-09-11), 0-3:
 *   3 same sex as you AND similar age
 *   2 mixed-sex trials AND similar age, OR same sex but the age is off
 *   1 other sex but similar age
 *   0 other sex and the age is off
 * "Similar age" = your age falls inside the enrolled range, widened by AGE_SLACK
 * years at each end. Returns "unknown" when we do not know who was enrolled or
 * the user has not told us - never a guessed number.
 */
export const AGE_SLACK = 5;
export type PersonFit = 0 | 1 | 2 | 3 | "unknown";
export function personFit(p: Profile | null, st: StudiedIn | null | undefined): PersonFit {
  if (!p || !st || (p.age === null && p.sex === null)) return "unknown";
  if (st.sex === "unknown" && st.age_min === null && st.age_max === null) return "unknown";
  const sexKnown = st.sex !== "unknown" && p.sex !== null;
  const sexMatch = sexKnown ? (st.sex === "mixed" ? "mixed" : st.sex === p.sex ? "same" : "other") : "unknown";
  let ageMatch: "similar" | "off" | "unknown" = "unknown";
  if (p.age !== null && (st.age_min !== null || st.age_max !== null)) {
    const lo = (st.age_min ?? 0) - AGE_SLACK;
    const hi = (st.age_max ?? 200) + AGE_SLACK;
    ageMatch = p.age >= lo && p.age <= hi ? "similar" : "off";
  }
  if (sexMatch === "unknown" || ageMatch === "unknown") return "unknown";
  if (sexMatch === "same") return ageMatch === "similar" ? 3 : 2;
  if (sexMatch === "mixed") return ageMatch === "similar" ? 2 : 1;
  return ageMatch === "similar" ? 1 : 0;
}
const PERSON_WORDS = ["Different group", "Weak match", "Partial match", "People like you"];

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
  person: PersonFit;
  personWord: string;
}

const EFFECT_WORDS: Record<string, string> = { "-3": "Harm reported", "0": "No meaningful effect", "1": "Small benefit", "2": "Moderate benefit", "3": "Large benefit", unclear: "Unclear" };
const CERTAINTY_WORDS = ["Insufficient", "Very low", "Low", "Moderate", "High"];
const FIT_WORDS = ["No match", "Poor match", "Partial match", "Close match", "Exact match"];

export function bandLabel(h: number): string {
  return h >= 65 ? "Works" : h >= 55 ? "Probably works" : h >= 45 ? "Unclear" : h >= 30 ? "Probably does not work" : "Evidence against";
}

export function score(l: Ledger, person: PersonFit = "unknown"): Scored {
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
  // Person fit joins form and dose as a THIRD applicability term when we know it.
  // It can dampen a positive result but can never create one: applicability only
  // multiplies a signal that is already positive.
  const parts = [fit(l.formFit), fit(l.doseFit)];
  if (person !== "unknown") parts.push(person / 3);
  const applicability = parts.reduce((a, b) => a + b, 0) / parts.length;
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
    label: headline === null ? "Not scored" : (l.effectPoints === 0 && certainty >= 3 ? "No meaningful benefit" : bandLabel(headline)),
    effectWord: EFFECT_WORDS[String(l.effectPoints)],
    certaintyWord: CERTAINTY_WORDS[certainty],
    person,
    personWord: person === "unknown" ? "Not reported" : PERSON_WORDS[person],
    formWord: l.formFit === "unknown" ? "Not tested" : FIT_WORDS[l.formFit],
    doseWord: l.doseFit === "unknown" ? "Unknown" : FIT_WORDS[l.doseFit],
  };
}

/** Shape of app/design-lab/ab/audits/*.json — a live audit written by the model against audit-v0.1. */
export interface AuditFile {
  meta: { run_at: string; model: string; prompt: string; note: string };
  product: string; ingredient: string; form: string; daily_dose: string; dose_note: string;
  for_whom?: { reasonable: string; not_shown: string; source: string };
  outcomes: Array<{
    name: string; population?: string; sentence: string;
    ledger: { effectPoints: string; effect_basis: string; bodyIsRct: boolean; checklist: Ledger["checklist"]; gates: Ledger["gates"]; formFit: string; doseFit: string; effective_daily_range: string };
    detail: Record<"effect" | "evidence" | "form" | "dose", Record<string, string>>;
    studied_in?: StudiedIn;
    inventory: Array<{ id: string; year: number; design: string; n: number; direction: string; access: string; note: string }>;
    strongest_study: string; strongest_doubt: string; study_that_would_move_this: string;
  }>;
  searches_run: string[]; could_not_access: string[]; self_confidence: string; confidence_note: string;
}

const EFFECT_ENUM: Record<string, Ledger["effectPoints"]> = { "-3": -3, "0": 0, "1": 1, "2": 2, "3": 3, unclear: "unclear" };
function fit(v: string): Fit { return v === "unknown" ? "unknown" : (Math.max(0, Math.min(4, Number(v))) as 0 | 1 | 2 | 3 | 4); }

/** Convert the model's string enums into the typed Ledger; tolerate missing detail keys. */
export function ledgerFromAudit(o: AuditFile["outcomes"][number]): Ledger {
  return { effectPoints: EFFECT_ENUM[o.ledger.effectPoints] ?? "unclear", bodyIsRct: o.ledger.bodyIsRct, checklist: o.ledger.checklist, gates: o.ledger.gates, formFit: fit(o.ledger.formFit), doseFit: fit(o.ledger.doseFit) };
}
export function detailFromAudit(d: Record<string, string> | undefined): { found: string; missing: string; move: string } {
  return { found: d?.found ?? d?.body ?? d?.match ?? "—", missing: d?.missing ?? d?.quality ?? "—", move: d?.move ?? "—" };
}
