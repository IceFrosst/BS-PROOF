/*
 * GENERATED MOCK live audits for the live result card tests. No model, no network, no paid call,
 * and none of this is a real finding: the numbers, ids and sentences are synthetic and exist to
 * exercise the adapter and the card. Every audit built here validates against the real
 * schemas/research_audit.json (tests/live-result-card-adapter.test.ts proves it), so the shapes
 * match what the server stores. The ONE real fixture used is the public D3 + K2 audit already in
 * tests/fixtures/validation-run1-one-search-empty-audit.json (kept under its own privacy rules).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ResearchFacts } from "@/lib/scan-research/client";

type Json = Record<string, unknown>;

export const CHECKLIST_UNKNOWN = { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" } as const;
export const GATES_NONE = { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: false, surrogate: false, allPositiveIndustryOrOneLab: false } as const;

export const SYN_SENTENCE = "Mock: may lengthen sleep (+12 min, 95% CI 3 to 21; n=1,204; 400 mg/day); “no serious adverse events” reported (Mock A 2019; PMID:10000001).";
export const SYN_QUOTE = "Mock study note — probably not generalisable; Mock A, Mock B. Mock J. 2019;1(2):e3. doi:10.0000/mock.0001";
export const SYN_DOUBT = "Mock doubt: unclear whether the 12 min persist beyond 8 weeks; possibly industry-funded (Mock C 2020).";
export const SYN_RANGE = "300–400 mg/day elemental (as printed: 200 mg × 2)";
export const SYN_EVIDENCE_FOUND = "Mock: two small trials; funded by the manufacturer (industry funding disclosed); a funnel plot suggested publication bias.";

const block = (found: string, missing: string, move: string) => ({ found, missing, move });

export function outcome(over: Json = {}): Json {
  const ledgerOver = (over.ledger ?? {}) as Json;
  const { ledger: _ledger, ...rest } = over;
  void _ledger;
  return {
    name: "Sleep quality",
    population: "Adults with self-rated poor sleep",
    sentence: SYN_SENTENCE,
    ledger: {
      effectPoints: "2",
      effect_basis: "Mock basis: pooled estimate +12 min (95% CI 3 to 21), PMID:10000001; tier 2 because noticed over weeks.",
      bodyIsRct: true,
      checklist: { risk_of_bias: "concern", consistency: "supported", precision: "unknown", directness: "supported", publication_bias: "concern" },
      gates: { rctCount: 6, largestRctN: 120, longestRctWeeks: 8, chronicOutcome: false, surrogate: false, allPositiveIndustryOrOneLab: true },
      formFit: "3",
      doseFit: "2",
      effective_daily_range: SYN_RANGE,
      ...ledgerOver,
    },
    detail: {
      effect: block("Mock effect found: +12 min.", "Mock effect missing: long-term follow-up.", "Mock effect move: a 24-week trial."),
      evidence: block(SYN_EVIDENCE_FOUND, "Mock evidence missing: independent replication.", "Mock evidence move: an independent trial."),
      form: block("Mock form found: glycinate studied.", "Mock form missing: oxide untested.", "—"),
      dose: block("Mock dose found: 300–400 mg elemental studied.", "Mock dose missing: below 200 mg.", "Mock dose move: a low-dose arm."),
    },
    inventory: [
      { id: "PMID:10000001", year: 2019, design: "sr_ma", n: 1204, direction: "benefit", access: "snippet", funding: "industry", note: "Mock note: pooled estimate, snippet only." },
      { id: "10.0000/mock.0002", year: 2021, design: "rct", n: 60, direction: "none", access: "snippet", funding: "unknown", note: "Mock note: single small trial." },
    ],
    absolute_effect: "Mock absolute effect: +12 min (95% CI 3 to 21), ARR not derivable.",
    clinically_meaningful: "unknown. Mock: no MCID established for sleep minutes.",
    strongest_study: SYN_QUOTE,
    strongest_doubt: SYN_DOUBT,
    study_that_would_move_this: "Mock: a 24-week independent RCT of 400 mg elemental.",
    ...rest,
  };
}

export const UNKNOWN_ROW = (): Json => outcome({
  name: "Muscle cramps",
  population: "Older adults",
  sentence: "Mock: nothing could be sized for cramps in this run.",
  ledger: { effectPoints: "unclear", formFit: "unknown", doseFit: "unknown", effective_daily_range: "unknown", checklist: { ...CHECKLIST_UNKNOWN }, gates: { ...GATES_NONE }, bodyIsRct: false, effect_basis: "Mock: no estimate seen." },
  inventory: [],
  absolute_effect: "Not available.",
});

export function audit(outcomes: Json[] = [outcome(), UNKNOWN_ROW()], over: Json = {}): Json {
  return {
    meta: { run_at: "2026-10-05", model: "claude-sonnet-5-5", prompt: "live-research-v0.5", note: "Mock: experimental, unvalidated, unreviewed model audit. Snippets only; no paper opened." },
    product: "Mock Magnesium glycinate 200 mg",
    ingredient: "Magnesium",
    form: "Magnesium bisglycinate",
    daily_dose: "400 mg elemental per day (2 servings)",
    dose_note: "Mock dose note: elemental amount as printed; two servings a day as supplied.",
    for_whom: { reasonable: "Mock reasonable.", not_shown: "Mock not shown.", source: "Mock: no guideline body takes a position." },
    outcomes,
    searches_run: ["mock search one"],
    could_not_access: ["Mock: one publisher page returned HTTP 403."],
    self_confidence: "medium-low",
    confidence_note: "Mock confidence note.",
    ...over,
  };
}

/** A combination product: outcomes[0] is the exact combination (nothing cited); the rest are single-ingredient CONTEXT. */
export function blendAudit(): Json {
  return audit([
    outcome({
      name: "This exact D3 + K2 product",
      population: "Any population, exact whole product",
      sentence: "Mock: no study of this exact combination was confirmed in this run.",
      ledger: { effectPoints: "unclear", formFit: "unknown", doseFit: "unknown", effective_daily_range: "unknown", checklist: { ...CHECKLIST_UNKNOWN, directness: "concern" }, gates: { ...GATES_NONE, chronicOutcome: true }, bodyIsRct: false, effect_basis: "Mock: not tested as a combination." },
      inventory: [],
      absolute_effect: "Not available.",
    }),
    outcome({
      name: "Bone density (D plus K context)",
      population: "CONTEXT ONLY: single ingredient, not this product.",
      sentence: "Mock context: separate trials of D and of K each report small gains.",
      ledger: { effectPoints: "3", formFit: "4", doseFit: "0", gates: { rctCount: 8, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: false } },
      inventory: [{ id: "PMID:10000003", year: 2020, design: "sr_ma", n: 900, direction: "benefit", access: "snippet", funding: "unknown", note: "Mock context note." }],
    }),
  ], { product: "Mock D3 4000 IU + K2", ingredient: "Vitamin D3 and vitamin K2", form: "Vitamin D3; K2 form not stated", daily_dose: "unknown" });
}

/** The public D3 + K2 audit: one exact-combination row, every field unclear / unknown, empty inventory. */
export function publicD3K2Audit(): Json {
  const file = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/validation-run1-one-search-empty-audit.json"), "utf8")) as { audit: Json };
  return file.audit;
}

export function liveResult(auditJson: Json): Json {
  const ids = Array.from(new Set((auditJson.outcomes as Json[]).flatMap((o) => (o.inventory as Array<{ id: string }>).map((i) => i.id))));
  return {
    audit: auditJson,
    source_access: {
      version: "SourceAccessSummaryV2",
      summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 },
      inventory: ids.map((id) => ({ id, evidence_class: "derived_snippet" })),
      limitations: ["WebSearch snippets and WebFetch model summaries are not original papers."],
    },
    provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.5", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV3" },
  };
}

/** Facts as the scan recorded them: single ingredient, form known, dose known, two servings a day. */
export const KNOWN_FACTS: ResearchFacts = {
  basis: "user_input", product: "Mock Magnesium", ingredient: "Magnesium", form: "Magnesium bisglycinate",
  compoundPerServingMg: 1000, printedElementalPerServingMg: 200, unitAsPrinted: "mg", servingsPerDay: 2, multiIngredient: false,
};
export const facts = (over: Partial<ResearchFacts> = {}): ResearchFacts => ({ ...KNOWN_FACTS, ...over });
