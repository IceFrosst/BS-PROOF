/*
 * Mocked live-research API jobs for the /scan live-only tests (no model, no network, no real job).
 * Shapes follow lib/scan-research/contract.ts and are read by the same parseResearchJob /
 * parseResearchResult the browser uses. The narrative strings carry the things that must never
 * change on their way to the screen: signs, units, a verbatim quotation, study ids, hedges.
 */
export const JOB_ID = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
export const T0 = "2026-10-04T19:00:00.000000+00:00";
export const T0_MS = Date.parse("2026-10-04T19:00:00Z");

export const SENTENCE = "May modestly raise serum 25(OH)D (+12.4 nmol/L, 95% CI 9.1 to 15.7; p<0.05; n=1,204; 50 mcg/day) across 12 RCTs, and “no serious adverse events” were reported (Smith et al., 2019; PMID:12345678; NCT01234567).";
export const STUDY = "Smith J, Lee K. Nutrients. 2019;11(3):e456. doi:10.3390/nu11030456 — probably not generalisable.";

export const RESULT = {
  audit: {
    meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.2" },
    product: "Vitamin D3 2000 IU softgels", ingredient: "Vitamin D3", form: "cholecalciferol", daily_dose: "not stated (servings per day unknown)", dose_note: "Daily regimen not printed; none was assumed.",
    could_not_access: ["Full paper unavailable"],
    outcomes: [{ name: "Serum 25(OH)D", population: "Adults with low baseline", sentence: SENTENCE, strongest_study: STUDY, strongest_doubt: "Unclear whether benefits persist beyond 8 weeks.", study_that_would_move_this: "A larger preregistered trial.", ledger: { effectPoints: "1", effective_daily_range: "25–50 mcg/day" }, inventory: [{ id: "PMID:123456", access: "snippet" as const }] }],
  },
  source_access: { version: "SourceAccessSummaryV2" as const, summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 as const }, inventory: [{ id: "PMID:123456", evidence_class: "derived_snippet" as const }], limitations: ["WebSearch snippets and WebFetch model summaries are not original papers."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV2" as const },
};

/** A vitamin D label read: form unknown, dose printed in mcg, NO daily regimen. */
export const TARGET = { version: "ResearchJobV1", fact_basis: "label", product: { brand: "Acme", product_name: "Vitamin D3" }, ingredient: { vocab_id: "vitamin_d", label: "Vitamin D3" }, form: { vocab_id: null, label: null }, dose: { compound_per_serving_mg: 0.05, printed_elemental_per_serving_mg: null, unit_as_printed: "mcg", elemental_per_serving_mg: null, daily_elemental_mg: null }, servings_per_day: null, is_multi_ingredient: false, actives: [], other_actives: [], handling: { text_fields_are_untrusted_data: true, component_evidence_is_not_blend_efficacy: true } };

export function researchJob(scanId: string, status: "queued" | "running" | "succeeded" | "failed", extra: Record<string, unknown> = {}) {
  return {
    id: JOB_ID, scan_id: scanId, status, prompt_version: "live-research-v0.2", target: TARGET, created_at: T0, updated_at: T0,
    completed_at: status === "succeeded" || status === "failed" ? "2026-10-04T19:03:10.500000+00:00" : null,
    failure_code: status === "failed" ? "worker_failed" : null, result: status === "succeeded" ? RESULT : null, ...extra,
  };
}
