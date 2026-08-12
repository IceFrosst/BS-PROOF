import type { DashboardOutcome } from "./types";

/**
 * The human-terms score story for one outcome — a deterministic paragraph a
 * reviewing scientist reads before the numbers.
 *
 * Pure and null-safe by design: it renders ONLY facts present on the outcome,
 * and returns null when the run's artifact predates per-study attribution
 * (contributions empty), so the UI can say "not recorded" instead of showing
 * an empty story. No React, unit-testable in isolation.
 */

const MEASURED_ROUTES = new Set(["smd", "percent"]);

function formatMg(value: number): string {
  if (value >= 1000) {
    const grams = value / 1000;
    return `${Number.isInteger(grams) ? grams : grams.toFixed(1)} g`;
  }
  return `${Math.round(value)} mg`;
}

export function isMeasuredRoute(route: string | null): boolean {
  return route !== null && MEASURED_ROUTES.has(route);
}

export function buildScoreStory(outcome: DashboardOutcome): string | null {
  const contributions = outcome.contributions;
  if (!contributions.length) return null;

  const sentences: string[] = [];
  const signed = outcome.signedScore;
  const n = contributions.length;

  const totalWeight = contributions.reduce((sum, c) => sum + (c.w ?? 0), 0);
  const nullWeight = contributions
    .filter((c) => c.direction === "null_effect")
    .reduce((sum, c) => sum + (c.w ?? 0), 0);
  const measured = contributions.filter((c) => isMeasuredRoute(c.effectRoute)).length;

  const lead =
    signed === null
      ? `${n} studies contributed to this outcome.`
      : `The signed score is ${signed > 0 ? "+" : ""}${signed} from ${n} contributing studies.`;
  sentences.push(lead);

  if (totalWeight > 0) {
    const nullShare = Math.round((nullWeight / totalWeight) * 100);
    if (nullShare > 0) {
      sentences.push(
        `Trials reporting no significant difference carry ${nullShare}% of the evidence weight.`,
      );
    }
  }

  if (measured === 0) {
    sentences.push(
      "No study's contribution came from a measured effect size — every vote below is a direction label.",
    );
  } else {
    sentences.push(
      `${measured} of ${n} ${measured === 1 ? "study contributes" : "studies contribute"} a measured effect size; the rest vote by direction label.`,
    );
  }

  const story = outcome.doseStory;
  if (story) {
    if (story.low !== null && story.high !== null) {
      const range =
        story.low === story.high
          ? formatMg(story.low)
          : `${formatMg(story.low)}–${formatMg(story.high)}`;
      let doseSentence = `Benefit has been observed at doses of ${range}`;
      const closeness = outcome.arcs.dose.closeness ?? story.productFactor;
      if (closeness !== null) {
        doseSentence += `; this product's dose sits at closeness ${closeness.toFixed(2)} to that range`;
      }
      sentences.push(`${doseSentence}.`);
    } else if (story.basis === "no_dosed_benefit_trial") {
      sentences.push(
        "No trial that found benefit reported a usable dose, so the dose axis is unassessed.",
      );
    }
    if (story.nullRange && story.nullRange.low !== null && story.nullRange.high !== null) {
      const nullRange =
        story.nullRange.low === story.nullRange.high
          ? formatMg(story.nullRange.low)
          : `${formatMg(story.nullRange.low)}–${formatMg(story.nullRange.high)}`;
      sentences.push(`Trials that found nothing were dosed at ${nullRange}.`);
    }
  }

  return sentences.join(" ");
}
