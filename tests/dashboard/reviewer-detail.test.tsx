/**
 * The reviewer redesign's data path and components (2026-08-12):
 * contributions -> score story -> OutcomeBreakdown, and study extraction ->
 * StudyExtractionDetail. Every assertion here guards a founder decision:
 * inline attribution, measured-vs-label visibility, verbatim spans, and the
 * explicit "not recorded" fallbacks that keep null distinct from zero.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutcomeBreakdown } from "@/components/outcome-breakdown";
import { StudyExtractionDetail } from "@/components/study-extraction";
import { normalizeRun } from "@/lib/dashboard/normalize";
import { buildScoreStory } from "@/lib/dashboard/story";
import { reconcileRun } from "@/lib/dashboard/reconcile";
import type { DashboardOutcome, DashboardStudy } from "@/lib/dashboard/types";

const contributionRow = {
  ecu_key: "creatine|creatine_monohydrate|unbanded|muscle_strength|general_adult",
  outcome_vocab_id: "muscle_strength",
  score: -10,
  composite: 40,
  band: "inconclusive",
  components: { d: -0.1, c: 0.9, H: 0.1, E: 4 },
  arcs: {
    effect: { verdict: -0.1, coverage: 1 },
    form: { verdict: 0.2, coverage: 0.5 },
    dose: { verdict: -0.35, coverage: 0.027, closeness: 0.1 },
    evidence: { verdict: null, coverage: 0.9, is_quantity: true },
  },
  dose: {
    low: 20000, high: 21227, n_benefit: 9, n_null: 5,
    null_range: { low: 5000, high: 20000 },
    basis: "observed_benefit_doses",
    product_match: "below_50", product_factor: 0.1,
  },
  evidence: {
    n_primaries: 2,
    study_ids: ["doi:a", "doi:b"],
    contributions: [
      { id: "doi:a", w: 0.8, s: 0.383, design_rank: 4, direction: "null_effect",
        form_match: "exact", d_share: 0.6, points: 5.1,
        effect_route: "smd", effect_s: 0.383 },
      { id: "doi:b", w: 0.2, s: -0.35, design_rank: 4, direction: "null_effect",
        form_match: "exact", d_share: -0.4, points: -8.9,
        effect_route: "no_effect_size", effect_s: null },
    ],
  },
  n_primaries: 2,
  prompt_version: "v1.19",
};

function outcomeFromRow(row: unknown): DashboardOutcome {
  const run = normalizeRun({ schema_version: "DashboardRunV1", ecu_rows: [row] });
  return run.outcomes[0];
}

describe("normalize: reviewer fields", () => {
  it("parses contributions, dose story and arc closeness by name", () => {
    const outcome = outcomeFromRow(contributionRow);
    expect(outcome.contributions).toHaveLength(2);
    expect(outcome.contributions[0].effectRoute).toBe("smd");
    expect(outcome.contributions[1].effectS).toBeNull();
    expect(outcome.arcs.dose.closeness).toBe(0.1);
    expect(outcome.doseStory?.productFactor).toBe(0.1);
    expect(outcome.doseStory?.nullRange?.high).toBe(20000);
  });

  it("degrades a pre-attribution row to empty contributions, never a throw", () => {
    const legacy = { ...contributionRow, evidence: { n_primaries: 2, study_ids: ["doi:a"] } };
    const outcome = outcomeFromRow(legacy);
    expect(outcome.contributions).toEqual([]);
    expect(outcome.arcs.dose.closeness).toBe(0.1);
  });

  it("parses study extraction with spans and tolerates its absence", () => {
    const run = normalizeRun({
      schema_version: "DashboardRunV1",
      corpus: {
        studies: [
          { title: "With detail", canonical_id: "doi:a",
            extraction: {
              s3: { population_text: "40 healthy adults", n_randomised: 40,
                    evidence_spans: ["Forty adults were randomised"] },
              s5_claims: [{ outcome_vocab_id: "muscle_strength", discarded: false,
                            direction: "benefit", evidence_span: "1RM rose 12 kg" }],
              s7: { form_vocab_id: "creatine_monohydrate", dose_per_kg_mg: 300,
                    mean_body_mass_kg: 80 },
              s8: null,
            } },
          { title: "Legacy", canonical_id: "doi:b" },
        ],
      },
    });
    expect(run.studies[0].extraction?.s3?.evidenceSpans[0]).toContain("randomised");
    expect(run.studies[0].extraction?.s5Claims[0].evidenceSpan).toBe("1RM rose 12 kg");
    expect(run.studies[0].extraction?.s7?.dosePerKgMg).toBe(300);
    expect(run.studies[1].extraction).toBeNull();
  });
});

describe("score story", () => {
  it("tells the measured-vs-label split and the dose story", () => {
    const outcome = outcomeFromRow(contributionRow);
    const story = buildScoreStory(outcome);
    expect(story).toContain("-10");
    expect(story).toContain("1 of 2 study contributes a measured effect");
    expect(story).toContain("20 g");
    expect(story).toContain("closeness 0.10");
  });

  it("returns null when attribution was not recorded", () => {
    const outcome = outcomeFromRow({
      ...contributionRow,
      evidence: { n_primaries: 2, study_ids: [] },
    });
    expect(buildScoreStory(outcome)).toBeNull();
  });
});

describe("OutcomeBreakdown", () => {
  const studies = new Map<string, DashboardStudy>([
    ["doi:a", { canonicalId: "doi:a", title: "Alpha trial", year: 2024, doi: null,
                pmid: null, journal: null, oa: null, predatoryVenue: null,
                skipped: null, skipReason: null, failedPartial: null, extraction: null }],
  ]);

  it("sorts by |points| and names measured vs label", () => {
    const outcome = outcomeFromRow(contributionRow);
    const html = renderToStaticMarkup(
      createElement(OutcomeBreakdown, { outcome, studiesById: studies }),
    );
    // doi:b has |points| 8.9 > doi:a's 5.1, so it renders first
    expect(html.indexOf("doi:b")).toBeLessThan(html.indexOf("Alpha trial"));
    expect(html).toContain("measured effect");
    expect(html).toContain("direction label");
    expect(html).toContain("Alpha trial");
  });

  it("says attribution is absent instead of rendering an empty table", () => {
    const outcome = outcomeFromRow({
      ...contributionRow,
      evidence: { n_primaries: 2, study_ids: [] },
    });
    const html = renderToStaticMarkup(
      createElement(OutcomeBreakdown, { outcome, studiesById: studies }),
    );
    expect(html).toContain("attribution was not recorded");
    expect(html).not.toContain("<table");
  });
});

describe("StudyExtractionDetail", () => {
  it("renders spans as quotes and the S6B mapping per claim", () => {
    const run = normalizeRun({
      schema_version: "DashboardRunV1",
      corpus: { studies: [{ title: "T", canonical_id: "doi:a", extraction: {
        s5_claims: [{ outcome_vocab_id: "muscle_strength", discarded: false,
                      outcome_raw: "1RM bench press", direction: "null_effect",
                      effect_size: 0.43, effect_unit: "cohen's d",
                      effect_favours: "ingredient",
                      evidence_span: "d = 0.43 favouring creatine" }],
      } }] },
    });
    const html = renderToStaticMarkup(
      createElement(StudyExtractionDetail, { extraction: run.studies[0].extraction }),
    );
    expect(html).toContain("d = 0.43 favouring creatine");
    expect(html).toContain("Muscle Strength");
    expect(html).toContain("favours ingredient");
  });

  it("states the fallback when extraction was not retained", () => {
    const html = renderToStaticMarkup(
      createElement(StudyExtractionDetail, { extraction: null }),
    );
    expect(html).toContain("not retained for this run");
  });
});

describe("reconcile: contributions guard", () => {
  const artifactRun = normalizeRun({ schema_version: "DashboardRunV1", ecu_rows: [contributionRow] });

  it("raises no issue when the ARTIFACT lacks contributions the context has", () => {
    const bare = normalizeRun({
      schema_version: "DashboardRunV1",
      ecu_rows: [{ ...contributionRow, evidence: { n_primaries: 2, study_ids: ["doi:a", "doi:b"] } }],
    });
    const result = reconcileRun(bare, artifactRun);
    expect(result.issues.filter((issue) => issue.path.includes("contributions"))).toEqual([]);
  });

  it("flags a points mismatch when BOTH sides carry contributions", () => {
    const drifted = normalizeRun({
      schema_version: "DashboardRunV1",
      ecu_rows: [{
        ...contributionRow,
        evidence: {
          ...contributionRow.evidence,
          contributions: [
            { ...contributionRow.evidence.contributions[0], points: 99 },
            contributionRow.evidence.contributions[1],
          ],
        },
      }],
    });
    const result = reconcileRun(drifted, artifactRun);
    expect(
      result.issues.some((issue) => issue.path.includes("contributions") && issue.path.endsWith(".points")),
    ).toBe(true);
  });
});
