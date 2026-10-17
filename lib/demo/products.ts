/*
 * The /demo products: two labels with a PRE-RECORDED scan, so a live demo
 * needs no camera, no model key, no sign-in and no network.
 *
 * `analysis` is a real ScanAnalysisV1, recorded 2026-10-17 by analyzeScan() on
 * the photo in public/demo/ (gemini-3.5-flash via MODEL_API_URL). Re-record
 * with the same call when the schema changes.
 *
 * `grades` are ILLUSTRATIVE: hand-written to show the shape of an evidence
 * method v2 answer (letter + certainty + trials + effect + CI, CLAUDE.md
 * invariant 8), loosely after published meta-analyses. They are NOT pipeline
 * output, and the page says so on every grade card. Swap in
 * gradeProductV2() rows once v2 validates (docs/APP.md §4).
 */
import type { ScanAnalysis } from "@/lib/analyze/scan";

import creatine from "./fixtures/creatine.json";
import magnesium from "./fixtures/magnesium.json";

export type Certainty = "High" | "Moderate" | "Low" | "Very low";

export interface DemoGrade {
  outcome: string;
  letter: string;
  certainty: Certainty;
  /** Trials pooled. */
  k: number;
  /** Standardised mean difference and its 95% CI; null when nothing pooled. */
  smd: { estimate: number; ci: [number, number] } | null;
  /** One sentence a non-scientist can act on. */
  plain: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  detail: string;
  image: string;
  /** For whom and at what dose the grades are read. */
  context: string | null;
  analysis: ScanAnalysis;
  grades: DemoGrade[];
}

const asScan = (json: unknown) => json as ScanAnalysis;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "creatine",
    name: "Creatine monohydrate",
    detail: "Thorne · 5 g scoop",
    image: "/demo/creatine.jpg",
    context: "Creatine monohydrate, 5 g a day, healthy adults",
    analysis: asScan(creatine),
    grades: [
      { outcome: "Lean body mass", letter: "A", certainty: "High", k: 35, smd: { estimate: 0.36, ci: [0.26, 0.46] }, plain: "Reliably adds lean mass when combined with resistance training." },
      { outcome: "Muscle strength", letter: "B+", certainty: "Moderate", k: 22, smd: { estimate: 0.32, ci: [0.2, 0.44] }, plain: "A meaningful strength gain at this dose, with training." },
      { outcome: "Power and sprint", letter: "C+", certainty: "Low", k: 14, smd: { estimate: 0.29, ci: [0.05, 0.53] }, plain: "Probably helps short, repeated efforts; trials are small and mixed." },
      { outcome: "Thinking and memory", letter: "C-", certainty: "Low", k: 8, smd: { estimate: 0.14, ci: [-0.02, 0.3] }, plain: "At most a small effect, mostly in sleep-deprived or older people." },
      { outcome: "Sleep quality", letter: "I", certainty: "Very low", k: 1, smd: null, plain: "Not enough evidence. That is not the same as “does not work”." },
    ],
  },
  {
    id: "magnesium",
    name: "Magnesium bisglycinate",
    detail: "200 mg per serving",
    image: "/demo/magnesium.jpg",
    context: "Magnesium bisglycinate, 200 mg a day, healthy adults",
    analysis: asScan(magnesium),
    grades: [
      { outcome: "Blood pressure", letter: "C", certainty: "Moderate", k: 34, smd: { estimate: 0.18, ci: [0.08, 0.28] }, plain: "A small drop (about 2 mmHg), larger if you are low in magnesium." },
      { outcome: "Sleep quality", letter: "C-", certainty: "Low", k: 5, smd: { estimate: 0.21, ci: [-0.04, 0.46] }, plain: "Maybe a small benefit; the trials are few and mostly in older adults." },
      { outcome: "Muscle cramps", letter: "D", certainty: "Moderate", k: 11, smd: { estimate: 0.03, ci: [-0.12, 0.18] }, plain: "Probably does not prevent ordinary muscle cramps." },
      { outcome: "Migraine", letter: "I", certainty: "Very low", k: 0, smd: null, plain: "No trials of this form at this dose. Not studied is not “failed”." },
    ],
  },
];
