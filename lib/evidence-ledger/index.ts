/*
 * Evidence Ledger rubric: the single browser-safe implementation used by the
 * design lab and the retained-audit production result. The ledger is a
 * heuristic, unvalidated rubric, not a probability of benefit.
 */
export type Judgement = "supported" | "concern" | "unknown";
export type Fit = 0 | 1 | 2 | 3 | 4 | "unknown";
export type EffectPoints = -3 | 0 | 1 | 2 | 3 | "unclear";
export type Checklist = Record<"risk_of_bias" | "consistency" | "precision" | "directness" | "publication_bias", Judgement>;
export interface Gates {
  rctCount: number; largestRctN: number; longestRctWeeks: number;
  chronicOutcome: boolean; surrogate: boolean; allPositiveIndustryOrOneLab: boolean;
}
export interface Ledger { effectPoints: EffectPoints; bodyIsRct: boolean; checklist: Checklist; gates: Gates; formFit: Fit; doseFit: Fit; }

/* Retained audit files may still carry studied_in as source context, but person fit
 * is deliberately not a rubric dimension. No user profile is collected and this
 * production rubric must not turn population description into a score. */
export interface StudiedIn { sex: "male" | "female" | "mixed" | "unknown"; sex_note?: string; age_min: number | null; age_max: number | null; age_note?: string; ethnicity?: string; confidence?: "verified" | "inferred" | "unknown"; }

export interface Scored {
  effect: EffectPoints; certainty: number; firedGates: string[]; applicability: number;
  headline: number | null; label: string; effectWord: string; certaintyWord: string;
  formWord: string; doseWord: string;
}
const EFFECT_WORDS: Record<string, string> = { "-3": "Harm reported", "0": "No meaningful effect", "1": "Small benefit", "2": "Moderate benefit", "3": "Large benefit", unclear: "Unclear" };
const CERTAINTY_WORDS = ["Insufficient", "Very low", "Low", "Moderate", "High"];
const FIT_WORDS = ["No match", "Poor match", "Partial match", "Close match", "Exact match"];
export function bandLabel(h: number): string { return h >= 65 ? "Works" : h >= 55 ? "Probably works" : h >= 45 ? "Unclear" : h >= 30 ? "Probably does not work" : "Evidence against"; }

/** Code derives every displayed ledger number. publication_bias and funding are disclosures only. */
export function score(l: Ledger): Scored {
  const fired: string[] = [];
  let certainty = l.bodyIsRct ? 4 : 2;
  for (const [k, v] of Object.entries(l.checklist)) if (k !== "publication_bias" && v === "concern") certainty -= 1;
  certainty = Math.max(0, certainty);
  const caps: number[] = [];
  if (l.gates.rctCount === 0) { fired.push("No human controlled trial"); caps.push(0); }
  else if (l.gates.rctCount === 1) { fired.push("Only one RCT"); caps.push(1); }
  if (l.gates.largestRctN < 50 || (l.gates.chronicOutcome && l.gates.longestRctWeeks < 4)) { fired.push("Best RCT is small or short"); caps.push(2); }
  if (l.gates.surrogate) { fired.push("Outcome is a surrogate marker"); caps.push(3); }
  if (caps.length) certainty = Math.min(certainty, ...caps);
  const fit = (f: Fit) => f === "unknown" ? 0.1 : f / 4;
  const applicability = (fit(l.formFit) + fit(l.doseFit)) / 2;
  let headline: number | null = null;
  if (l.effectPoints !== "unclear" && certainty > 0 && l.gates.rctCount > 0) {
    const signal = (l.effectPoints / 3) * (certainty / 4);
    headline = Math.round(50 + 50 * signal * (signal > 0 ? applicability : 1));
  }
  return {
    effect: l.effectPoints, certainty, firedGates: fired, applicability, headline,
    label: headline === null ? "Not scored" : (l.effectPoints === 0 && certainty >= 3 ? "No meaningful benefit" : bandLabel(headline)),
    effectWord: EFFECT_WORDS[String(l.effectPoints)], certaintyWord: CERTAINTY_WORDS[certainty],
    formWord: l.formFit === "unknown" ? "Not tested" : FIT_WORDS[l.formFit], doseWord: l.doseFit === "unknown" ? "Unknown" : FIT_WORDS[l.doseFit],
  };
}

export interface AuditDetail { found: string; missing: string; move: string; }
export interface AuditInventory { id: string; year: number; design: string; n: number; direction: string; access: "full_text" | "abstract" | "snippet"; pooled_in?: string; funding?: string; note: string; }
export interface AuditOutcome {
  name: string; population?: string; sentence: string; ledger: { effectPoints: string; effect_basis: string; bodyIsRct: boolean; checklist: Checklist; gates: Gates; formFit: string; doseFit: string; effective_daily_range: string };
  detail: Record<"effect" | "evidence" | "form" | "dose", AuditDetail>; studied_in?: StudiedIn; inventory: AuditInventory[];
  absolute_effect?: string; clinically_meaningful?: string; why_positive_signal_is_unreliable?: string;
  strongest_study: string; strongest_doubt: string; study_that_would_move_this: string;
}
export interface AuditFile { meta: { run_at: string; model: string; prompt: string; note: string }; product: string; ingredient: string; form: string; daily_dose: string; dose_note: string; for_whom: { reasonable: string; not_shown: string; source: string }; outcomes: AuditOutcome[]; searches_run: string[]; could_not_access: string[]; self_confidence: string; confidence_note: string; }
export type PlainEntry = Partial<Record<"effect" | "evidence" | "form" | "dose", Partial<Record<"found" | "missing" | "move", string>>>> & { summary?: Partial<Record<"sentence" | "absolute_effect" | "clinically_meaningful" | "strongest_doubt", string>> };
export type PlainFile = Record<string, PlainEntry>;
export interface RetainedLedgerAudit { audit: AuditFile; plain: PlainFile; provenance: { kind: "retained_previous_audit"; prompt_version: string; target_product: string; target_dose: string; note: string; }; }
const EFFECT_ENUM: Record<string, EffectPoints> = { "-3": -3, "0": 0, "1": 1, "2": 2, "3": 3, unclear: "unclear" };
function fit(v: string): Fit { return v === "unknown" ? "unknown" : Math.max(0, Math.min(4, Number(v))) as Fit; }
export function ledgerFromAudit(o: AuditOutcome): Ledger { return { effectPoints: EFFECT_ENUM[o.ledger.effectPoints] ?? "unclear", bodyIsRct: o.ledger.bodyIsRct, checklist: o.ledger.checklist, gates: o.ledger.gates, formFit: fit(o.ledger.formFit), doseFit: fit(o.ledger.doseFit) }; }
export function detailFromAudit(d: Partial<AuditDetail> | undefined): AuditDetail { return { found: d?.found ?? "—", missing: d?.missing ?? "—", move: d?.move ?? "—" }; }
