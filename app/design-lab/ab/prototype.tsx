"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { detailFromAudit, ledgerFromAudit, score, type AuditFile, type Ledger } from "./ledger";
import { parseEffectResearch, type EffectResearchFile } from "./effect-contract";
import {
  NOT_ASSESSED_WORD, fictionalEffectBar, legacyEffectBar, notAssessedReason, outcomeKey,
  researchEffectBar, type EffectBar, type EffectLine, type EffectSourceLink, type IntervalScale,
} from "./effect-presentation";
import creatineAudit from "./audits/creatine.json";
import vitaminDAudit from "./audits/vitamin-d.json";
import magnesiumAudit from "./audits/magnesium.json";
import caffeineResearch from "./effect-research/caffeine.json";
import creatineResearch from "./effect-research/creatine-effect.json";
import omega3Research from "./effect-research/omega3-effect.json";
import { auditWarnings, evidenceDetail, gateWarnings, productWarnings, type EvidenceWarning, type ProductDeclarations } from "./evidence-warnings";
import { PLAIN_LANGUAGE_STAMP, VERBATIM_SUMMARY, plainFor, plainText, type PlainDimension, type PlainProductKey } from "./plain-language";

type DimKey = "effect" | "evidence" | "form" | "dose";
interface Detail { found: string; missing: string; move: string }

/* HYPOTHETICAL ledgers. Fictional products; hand-written inputs to exercise the rubric. No search or study lookup was performed. */
interface OutcomeCase {
  warnings?: EvidenceWarning[]; name: string; sentence?: string; ledger?: Ledger;
  /** What the row RENDERS: the plain-language rewrite where a sidecar supplies one, otherwise the audit's own text. */
  detail?: Record<DimKey, Detail>;
  /** The audit's own wording for those same fields, kept verbatim behind a details. Absent on the hand-written ledgers. */
  originalDetail?: Record<DimKey, Detail>;
  /** Plain-language versions of the Effect bar's reported-effect lines; the bar itself keeps the audit's. */
  plainLines?: EffectLine[];
  population?: string; effect: EffectBar;
}
interface Scenario {
  title: string; product: string;
  kind: "live" | "fictional" | "research";
  /* Product-level facts this scenario DECLARES about itself (blend, missing
   * servings per day, MLM seller). Absent everywhere except the fictional
   * samples below, where each declared fact is true by construction. The three
   * retained audits and the effect-only passes declare nothing, so none of the
   * three product warnings can ever appear on a real brand. */
  declared?: ProductDeclarations;
  outcomes: OutcomeCase[];
  live?: { runAt: string; model: string; sources: number; doseNote: string; confidence: string; confidenceNote: string; couldNotAccess: string[] };
  research?: EffectResearchFile;
}
const okChecklist: Ledger["checklist"] = { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" };
const strongGates: Ledger["gates"] = { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false };
const thinDetail = (what: string): Record<DimKey, Detail> => ({
  effect: { found: what, missing: "Few trials measured this directly.", move: "A trial with this as the primary outcome." },
  evidence: { found: "A handful of small trials.", missing: "Imprecise; results vary.", move: "A preregistered replication." },
  form: { found: "Same preparation as the strength trials.", missing: "—", move: "—" },
  dose: { found: "Same dose range as the strength trials.", missing: "—", move: "—" },
});
type FictionalCase = Omit<OutcomeCase, "effect">;
const fictional = (o: FictionalCase): OutcomeCase => ({ ...o, effect: fictionalEffectBar(o.ledger!.effectPoints, o.ledger!.gates.rctCount) });
const scenarios: Record<string, Scenario> = {
  solid: {
    title: "Well-studied, good fit", product: "Sample powder A · 3 g/day", kind: "fictional",
    outcomes: ([
      { name: "Muscle strength", sentence: "Trials on this exact form, near this dose, mostly agree on a moderate benefit in adults who train.", ledger: { effectPoints: 2, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: 4, doseFit: 3 },
        detail: { effect: { found: "Pooled estimate in the moderate range; interval clear of the ‘meaningful’ threshold.", missing: "Effect varies by training status — larger in trained adults.", move: "A large trial in untrained adults reporting the same size." }, evidence: { found: "24 controlled trials; low bias; precise pooled estimate; outcome is the real thing, not a marker.", missing: "Consistency: trials disagree on size (−1). Publication bias not assessable.", move: "A preregistered replication with a published protocol." }, form: { found: "The tested preparation is the one on this label.", missing: "Nothing — exact match.", move: "—" }, dose: { found: "3 g/day sits just under the 3–5 g range where benefit was shown.", missing: "Most trials used 5 g/day; 3 g is at the edge.", move: "A trial comparing 3 g and 5 g directly." } } },
      { name: "Muscle growth", sentence: "A small gain in lean mass shows up across trials, partly water retention early on.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: 4, doseFit: 3 }, detail: thinDetail("Small increase in lean mass; some is early water gain.") },
      { name: "Endurance", sentence: "Trials on long-duration performance find little or no meaningful change.", ledger: { effectPoints: 0, bodyIsRct: true, checklist: { ...okChecklist, consistency: "supported" }, gates: { ...strongGates, rctCount: 9 }, formFit: 4, doseFit: 3 }, detail: thinDetail("No meaningful change in endurance outcomes.") },
    ] as FictionalCase[]).map(fictional),
  },
  untested: {
    title: "Good evidence, wrong form", product: "Sample capsule B · 1.5 g/day", kind: "fictional",
    outcomes: ([
      { name: "Muscle strength", sentence: "The benefit evidence is for a different preparation. This form and this lower dose have not been tested on strength.", ledger: { effectPoints: 2, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: "unknown", doseFit: 1 },
        detail: { effect: { found: "Moderate benefit — but measured on another preparation.", missing: "No trial of this form on this outcome.", move: "Any controlled trial using this exact preparation." }, evidence: { found: "Strong body of trials for the ingredient in general.", missing: "None of it is about this product’s form.", move: "—" }, form: { found: "Nothing. This preparation was never tested for strength.", missing: "Equivalence to the tested form is a marketing claim, not a finding.", move: "A head-to-head trial of the two forms." }, dose: { found: "1.5 g/day is about half the lowest effective dose tested.", missing: "No trial at this dose.", move: "A dose-ranging trial that includes 1.5 g." } } },
      { name: "Muscle growth", sentence: "Same story: the evidence is for another form at a higher dose.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: "unknown", doseFit: 1 }, detail: thinDetail("Small lean-mass gain on the other preparation.") },
      { name: "Endurance", sentence: "Little or no effect in the trials that exist — none on this form.", ledger: { effectPoints: 0, bodyIsRct: true, checklist: okChecklist, gates: { ...strongGates, rctCount: 9 }, formFit: "unknown", doseFit: 1 }, detail: thinDetail("No meaningful change in endurance outcomes.") },
    ] as FictionalCase[]).map(fictional),
  },
  thin: {
    title: "One small trial", product: "Sample extract C · 400 mg/day", kind: "fictional",
    /* FICTIONAL SELLER. This sample exists to exercise the MLM disclosure; it
     * names no real company and is not a claim about any real brand. */
    declared: {
      businessModel: { status: "confirmed_mlm", basis: "This sample declares a seller whose distributors are recruited and paid on their recruits' sales.", confidence: "high" },
      note: "Fictional sample seller — declared by this hand-written sample, not a model read of any real company.",
    },
    outcomes: ([
      { name: "Testosterone (blood level)", sentence: "One small maker-funded trial saw higher levels. A blood marker is not what most buyers want.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "concern", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 1, largestRctN: 60, longestRctWeeks: 4, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: true }, formFit: 2, doseFit: 4 },
        detail: { effect: { found: "A small rise in a blood marker over 4 weeks.", missing: "No trial on energy, libido or strength itself.", move: "A trial measuring what people actually buy it for." }, evidence: { found: "One RCT, n≈60, funded by the maker.", missing: "Only one trial (cap 1). Small and short. Surrogate outcome. Single funder.", move: "An independent replication of any size." }, form: { found: "Same plant, different standardization than the trial.", missing: "Extract ratio on the label does not match the tested one.", move: "A trial using this standardization." }, dose: { found: "400 mg/day matches the trial dose.", missing: "Nothing — but matching a dose from one trial proves little.", move: "—" } } },
      { name: "Energy", sentence: "No controlled trial measured energy or fatigue for this extract.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
      { name: "Libido", sentence: "No controlled trial on this outcome.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
    ] as FictionalCase[]).map(fictional),
  },
  none: {
    title: "Nothing to score", product: "Sample blend D · 2 capsules", kind: "fictional",
    /* True by construction for this sample: it is a proprietary multi-active
     * blend ("amounts per ingredient not printed") dosed as "2 capsules" with
     * no servings per day, so no daily dose can be computed. */
    declared: {
      multiIngredient: true, servingsNotStated: true,
      note: "Fictional sample label — declared by this hand-written sample, not read from a real product.",
    },
    outcomes: ([
      { name: "Cognitive function", sentence: "No human trial tested this formula. Missing evidence is not proof it fails.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" },
        detail: { effect: { found: "Nothing on the full formula.", missing: "Ingredient-level trials exist at very different doses.", move: "Any controlled trial of this blend." }, evidence: { found: "No controlled human trial.", missing: "Everything.", move: "One RCT would unlock a score." }, form: { found: "—", missing: "Proprietary blend; amounts per ingredient not printed.", move: "A label that states each amount." }, dose: { found: "—", missing: "Cannot compare without per-ingredient amounts.", move: "—" } } },
      { name: "Focus", sentence: "No trial on the formula.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" }, detail: thinDetail("Nothing measured.") },
    ] as FictionalCase[]).map(fictional),
  },
};


/* The shipped audits carry two prose fields the older AuditFile type never
 * declared. They are read-only here: the Effect bar reuses that text verbatim
 * and stamps it "Previous AI audit · not reverified" instead of turning prose
 * into a number. */
type AuditOutcome = AuditFile["outcomes"][number] & { absolute_effect?: string; clinically_meaningful?: string };
type AuditFileWithEffect = Omit<AuditFile, "outcomes"> & { outcomes: AuditOutcome[] };

/*
 * PLAIN BODY, AUDIT WORDING ONE TAP AWAY (2026-09-16).
 *
 * Each row now renders the model-written plain-language rewrite from
 * `audits/plain/<product>.json` as its body, and keeps the audit's own
 * sentences verbatim inside an "Exact wording from the audit" details. A field
 * with no rewrite falls back to the audit text, so nothing is ever dropped;
 * the rewrite carries every number, unit, interval and sample size unchanged
 * and changes no score, ledger or warning.
 */
function fromAudit(title: string, a: AuditFileWithEffect, plainKey: PlainProductKey): Scenario {
  return {
    title, product: a.product.replace(/,?\s*(softgel|powder|capsules)[^,]*/i, "").replace(" per day", "/day"),
    kind: "live",
    /* The audit's own one-line summary is deliberately NOT rendered. One of
     * them asserts "roughly a third more than training alone", a share-of-gain
     * claim the follow-up read could not defend. The row's full reported-effect
     * text stays reachable in the Effect expansion, stamped as that run's. */
    outcomes: a.outcomes.map((o) => {
      const ledger = ledgerFromAudit(o);
      const plain = plainFor(plainKey, outcomeKey(o.name, o.population));
      const audit: Record<DimKey, Detail> = {
        effect: detailFromAudit(o.detail.effect), evidence: detailFromAudit(o.detail.evidence),
        form: detailFromAudit(o.detail.form), dose: detailFromAudit(o.detail.dose),
      };
      const rewrite = (dim: PlainDimension, d: Detail): Detail => ({
        found: plainText(plain, dim, "found", d.found),
        missing: plainText(plain, dim, "missing", d.missing),
        move: plainText(plain, dim, "move", d.move),
      });
      // The Evidence row's "Current rubric" sentence is written by the rubric,
      // not by the audit, so it is appended to BOTH versions the same way.
      const withRubric = (d: Detail): Detail => evidenceDetail(ledger, d.found, d.move, d.missing);
      const plainDim = { effect: rewrite("effect", audit.effect), evidence: rewrite("evidence", audit.evidence), form: rewrite("form", audit.form), dose: rewrite("dose", audit.dose) };
      const barInput = {
        effectPoints: o.ledger.effectPoints === "unclear" ? ("unclear" as const) : Number(o.ledger.effectPoints),
        rctCount: o.ledger.gates.rctCount,
        inventory: o.inventory,
      };
      const effect = legacyEffectBar({ ...barInput, absoluteEffect: o.absolute_effect, clinicallyMeaningful: o.clinically_meaningful, strongestDoubt: o.strongest_doubt });
      const plainBar = legacyEffectBar({
        ...barInput,
        absoluteEffect: o.absolute_effect === undefined ? undefined : plainText(plain, "summary", "absolute_effect", o.absolute_effect),
        clinicallyMeaningful: o.clinically_meaningful === undefined ? undefined : plainText(plain, "summary", "clinically_meaningful", o.clinically_meaningful),
        strongestDoubt: o.strongest_doubt === undefined ? undefined : plainText(plain, "summary", "strongest_doubt", o.strongest_doubt),
      });
      return {
        name: o.name, population: o.population, ledger,
        detail: { ...plainDim, evidence: withRubric(plainDim.evidence) },
        originalDetail: { ...audit, evidence: withRubric(audit.evidence) },
        plainLines: plainBar.lines,
        warnings: auditWarnings(o),
        effect,
      };
    }),
    live: { runAt: a.meta.run_at, model: a.meta.model, sources: new Set(a.outcomes.flatMap((o) => o.inventory.map((i) => i.id))).size, doseNote: a.dose_note, confidence: a.self_confidence, confidenceNote: a.confidence_note, couldNotAccess: a.could_not_access },
  };
}

/* Effect-only research pass. Validated at module load: a malformed file throws
 * here rather than rendering a number nobody checked. */
const caffeineFile = parseEffectResearch(caffeineResearch);
const creatineEffectFile = parseEffectResearch(creatineResearch);
const omega3File = parseEffectResearch(omega3Research);
const researchScenario = (title: string, file: EffectResearchFile): Scenario => ({
  title, product: file.product, kind: "research", research: file,
  outcomes: file.outcomes.map((o) => ({
    name: o.name,
    population: o.population,
    sentence: o.comparator,
    /* No warnings: the effect-only pass graded neither funding independence nor
     * publication bias, and a not-assessed state renders nothing (founder
     * 2026-09-16). Each source's funding line and its method limits stay in the
     * Effect row. */
    effect: researchEffectBar(file, o),
  })),
});

/* ONE place assembles an outcome's warning stack, in display order:
 * product-level facts first (identical on every row of that product), then
 * the outcome-level ones — the ledger-derived "no human controlled trial"
 * cap, then the audit's funding and publication-bias disclosures. Each part
 * builds NOTHING unless it is actually true, so an outcome with nothing to
 * say keeps `warnings` empty and the view draws no block at all. */
function withWarnings(s: Scenario): Scenario {
  const product = productWarnings(s.declared);
  return {
    ...s,
    outcomes: s.outcomes.map((o) => {
      const rows = [...product, ...gateWarnings(o.ledger), ...(o.warnings ?? [])];
      return rows.length ? { ...o, warnings: rows } : o;
    }),
  };
}
const withWarningsEach = (r: Record<string, Scenario>): Record<string, Scenario> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, withWarnings(v)]));

const liveScenarios: Record<string, Scenario> = withWarningsEach({
  creatine: fromAudit("Creatine monohydrate · 4 g", creatineAudit as unknown as AuditFileWithEffect, "creatine"),
  vitaminD: fromAudit("Vitamin D3 · 2000 IU", vitaminDAudit as unknown as AuditFileWithEffect, "vitaminD"),
  magnesium: fromAudit("Magnesium glycinate · 300 mg", magnesiumAudit as unknown as AuditFileWithEffect, "magnesium"),
});
const researchScenarios: Record<string, Scenario> = withWarningsEach({
  creatineEffect: researchScenario("Creatine monohydrate · 3–5 g", creatineEffectFile),
  caffeine: researchScenario("Caffeine anhydrous · 200 mg", caffeineFile),
  omega3: researchScenario("Omega-3 (EPA/DHA) · 1 g", omega3File),
});
const fictionalScenarios: Record<string, Scenario> = withWarningsEach(scenarios);
const allScenarios: Record<string, Scenario> = { ...liveScenarios, ...researchScenarios, ...fictionalScenarios };

const DIMS_BASE: { key: DimKey; name: string; color: string }[] = [
  { key: "effect", name: "Effect", color: "var(--ab-r1)" },
  { key: "evidence", name: "Evidence", color: "var(--ab-r4)" },
  { key: "form", name: "Form", color: "var(--ab-r2)" },
  { key: "dose", name: "Dose", color: "var(--ab-r3)" },
];

type TrackState = "fill" | "hatch" | "null-result" | "no-evidence" | "interval" | "none";
interface Row {
  id: string;
  name: string;
  sub?: string;
  color: string;
  fill: number | null;
  track: TrackState;
  scale: IntervalScale | null;
  pts: string;
  word: string;
  negative: boolean;
  detail: Detail | null;
  lines: EffectLine[];
  /** The audit's own sentences for the SAME fields, shown verbatim under the plain body. Null when there is no rewrite to distinguish. */
  original: { detail: Detail | null; lines: EffectLine[] } | null;
  sourceLinks: EffectSourceLink[];
  provenance: string | null;
  jump: string | null;
  dim: boolean;
  kind?: string;
}

/**
 * What goes inside "Exact wording from the audit": only the fields whose body
 * is actually a rewrite. When the sidecar had nothing, the body IS the audit's
 * wording and a second copy of it would say nothing.
 */
function verbatim(plainDetail: Detail | null, auditDetail: Detail | null, plainLines: EffectLine[], auditLines: EffectLine[]): Row["original"] {
  const detailDiffers = !!plainDetail && !!auditDetail
    && (plainDetail.found !== auditDetail.found || plainDetail.missing !== auditDetail.missing || plainDetail.move !== auditDetail.move);
  const linesDiffer = auditLines.length === plainLines.length && auditLines.some((l, i) => l.body !== plainLines[i]?.body);
  if (!detailDiffers && !linesDiffer) return null;
  return { detail: detailDiffers ? auditDetail : null, lines: linesDiffer ? auditLines : [] };
}

function scoreSignalColor(score: number | null, signal = 1): string {
  if (score === null) return "var(--ab-muted)";
  const value = Math.max(0, Math.min(100, score));
  const strength = Math.max(0, Math.min(1, signal));
  // 0 → red, 60 → amber, 100 → green. Evidence strength controls
  // saturation/lightness: weak signals look deliberately washed, not certain.
  const hue = value <= 60 ? (value / 60) * 42 : 42 + ((value - 60) / 40) * 98;
  const saturation = 32 + strength * 48;
  const lightness = 54 - strength * 10;
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

const TRACK_FOR: Record<EffectBar["kind"], TrackState> = {
  reported_interval: "interval",
  reported_point: "interval",
  not_graded: "hatch",
  no_evidence: "no-evidence",
  no_meaningful_benefit: "null-result",
  fictional_points: "fill",
};

type Layout = "hero" | "overlap";
const LAYOUTS: { id: Layout; name: string; blurb: string }[] = [
  { id: "hero", name: "1 · Hero", blurb: "photo on top" },
  { id: "overlap", name: "2 · Overlap", blurb: "score floats on photo" },
];

function Interval({ scale }: { scale: IntervalScale }) {
  const hasInterval = scale.lowPct !== null && scale.highPct !== null;
  const readout = hasInterval
    ? `${scale.markerLabel} ${scale.unit} (95% CI ${scale.lowLabel} to ${scale.highLabel})`
    : `${scale.markerLabel} ${scale.unit} · interval not reported`;
  return (
    <span className="ab-interval" data-has-interval={hasInterval ? "true" : "false"}>
      <span className="ab-interval-axis" role="img" aria-label={`${readout}. No-effect line at ${scale.nullLabel}.`}>
        <i className="ab-interval-null" style={{ left: `${scale.nullPct}%` }} />
        {hasInterval && <i className="ab-interval-range" style={{ left: `${scale.lowPct}%`, width: `${(scale.highPct ?? 0) - (scale.lowPct ?? 0)}%` }} />}
        <i className="ab-interval-marker" style={{ left: `${scale.markerPct}%` }} />
      </span>
      <span className="ab-interval-labels">
        <small>{scale.axisLowLabel}</small>
        <small className="ab-interval-read">{readout}</small>
        <small>{scale.axisHighLabel}</small>
      </span>
    </span>
  );
}

export interface AbPrototypeProps {
  /** Dedicated public test endpoint: real fixtures only, normal page scrolling. */
  publicTest?: boolean;
  /** Test/smoke seam only: which product, outcome row and expanded bar to start on. */
  initial?: { product?: string; outcome?: string; layout?: Layout; open?: string };
}

export default function AbPrototype({ initial, publicTest = false }: AbPrototypeProps = {}) {
  const [layout, setLayout] = useState<Layout>(initial?.layout ?? "hero");
  const [key, setKey] = useState(initial?.product ?? "creatine");
  const [tab, setTab] = useState<string | null>(initial?.outcome ?? null); // null = the Outcomes list
  const [open, setOpen] = useState<string | null>(initial?.open ?? null);
  const [unpicked, setUnpicked] = useState<Record<string, boolean>>({}); // outcomes the user did NOT pick at the interests step
  const s = allScenarios[key];
  const keyOf = (o: OutcomeCase) => outcomeKey(o.name, o.population);
  const isPicked = (o: OutcomeCase) => !unpicked[`${key}:${keyOf(o)}`];
  const togglePick = (o: OutcomeCase) => setUnpicked((u) => ({ ...u, [`${key}:${keyOf(o)}`]: !u[`${key}:${keyOf(o)}`] }));
  const scored = s.outcomes.map((o) => ({ o, k: keyOf(o), r: o.ledger ? score(o.ledger) : null }));
  const isList = tab === null;
  const cur = isList ? null : (scored.find((x) => x.k === tab) ?? null);
  const legacy = s.kind !== "research";

  const dimRows: Row[] = cur ? DIMS_BASE.map((d): Row => {
    const bar = cur.o.effect;
    if (d.key === "effect") {
      const lines = cur.o.plainLines ?? bar.lines;
      return {
        id: "effect", name: d.name, color: d.color, fill: bar.fill, track: TRACK_FOR[bar.kind], scale: bar.scale,
        pts: bar.pts, word: bar.word, negative: bar.kind === "fictional_points" && (typeof cur.o.ledger?.effectPoints === "number" ? cur.o.ledger.effectPoints < 0 : false),
        detail: cur.o.detail?.effect ?? null, lines, sourceLinks: bar.sourceLinks, provenance: bar.provenance,
        original: verbatim(cur.o.detail?.effect ?? null, cur.o.originalDetail?.effect ?? null, lines, bar.lines),
        jump: null, dim: false, kind: bar.kind,
      };
    }
    if (!legacy || !cur.r || !cur.o.ledger) {
      const reason = s.research ? notAssessedReason(s.research, d.key as "evidence" | "form" | "dose") : null;
      return {
        id: d.key, name: d.name, color: d.color, fill: null, track: "hatch", scale: null, pts: "—", word: NOT_ASSESSED_WORD,
        negative: false, detail: null, lines: reason ? [{ label: "Why", body: reason }] : [], original: null, sourceLinks: [],
        provenance: "Effect-only pass · nothing here was graded", jump: null, dim: false, kind: "not_assessed",
      };
    }
    const L = cur.o.ledger; const r = cur.r;
    const fill = d.key === "evidence" ? r.certainty / 4 : d.key === "form" ? (L.formFit === "unknown" ? null : L.formFit / 4) : (L.doseFit === "unknown" ? null : L.doseFit / 4);
    const pts = d.key === "evidence" ? `${r.certainty}/4` : d.key === "form" ? (L.formFit === "unknown" ? "—" : `${L.formFit}/4`) : (L.doseFit === "unknown" ? "—" : `${L.doseFit}/4`);
    const word = d.key === "evidence" ? r.certaintyWord : d.key === "form" ? r.formWord : r.doseWord;
    const detail = cur.o.detail?.[d.key] ?? null;
    return {
      id: d.key, name: d.name, color: d.color, fill, track: fill === null ? "hatch" : "fill", scale: null, pts, word, negative: false,
      detail,
      original: verbatim(detail, cur.o.originalDetail?.[d.key] ?? null, [], []),
      lines: [], sourceLinks: [], provenance: null, jump: null, dim: false,
    };
  }) : [];

  /* Outcome rows read like the dimension rows on the right: name, a progress
   * bar filled to the 0-100 headline and that number as a percentage. No band
   * word ("probably works") -- the bar and the number carry it; the drill-in
   * button says where the detail lives. */
  const outcomeRows: Row[] = scored.map((x, i): Row => ({
    id: `o${i}`, name: x.o.name, sub: x.o.population, color: isPicked(x.o) ? scoreSignalColor(x.r?.headline ?? null, x.r ? x.r.certainty / 4 : 0) : "var(--ab-track)",
    fill: x.r && x.r.headline !== null ? x.r.headline / 100 : null, track: x.r && x.r.headline !== null ? "fill" : "hatch", scale: null,
    pts: x.r && x.r.headline !== null ? `${x.r.headline}%` : "—",
    word: isPicked(x.o) ? "" : "Not picked",
    negative: false, detail: null, lines: [], original: null, sourceLinks: [], provenance: null, jump: x.k, dim: !isPicked(x.o),
  }));
  const rowsToShow = isList ? outcomeRows : dimRows;
  const headline = cur?.r?.headline ?? null;
  const tone = headline === null ? "muted" : headline >= 55 ? "good" : headline >= 45 ? "neutral" : "bad";
  const pick = (k: string) => { setKey(k); setTab(null); setOpen(null); };
  const go = (k: string | null) => { setTab(k); setOpen(null); };

  const photo = <div className={`ab-photo-hero${layout === "overlap" ? " bleed" : ""}`} role="img" aria-label="Illustrated sample product (placeholder)"><div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(s.kind === "fictional" ? s.product : s.title).split(" · ")[0].replace(/^Sample /, "").toLowerCase()}</strong><i>Pure. Simple. Studied.</i><div>{s.kind === "fictional" ? "SAMPLE" : "DAILY"} <b>{(s.kind === "fictional" ? s.product : s.title).split(" · ")[1] ?? ""}</b></div></div></div>;

  /* THE LANDING TAB. No average, no overall number, no band label: a product is
   * not one benefit. Every row is a separate question in its own population. */
  /* General score: plain mean of the picked outcomes' 0-100 headlines, drawn
   * as a bar like every row below it. Labelled as an average so it never reads
   * as a verdict about one person (founder decision 2026-09-16). */
  const pickedHeadlines = scored.filter((x) => isPicked(x.o) && x.r && x.r.headline !== null).map((x) => x.r!.headline as number);
  const general = pickedHeadlines.length ? Math.round(pickedHeadlines.reduce((a, b) => a + b, 0) / pickedHeadlines.length) : null;
  const pickedSignals = scored.filter((x) => isPicked(x.o) && x.r && x.r.headline !== null).map((x) => x.r!.certainty / 4);
  const generalSignal = pickedSignals.length ? pickedSignals.reduce((a, b) => a + b, 0) / pickedSignals.length : 0;
  const listBlock = (
    <div className="ab-listhead">
      <div className="ab-general" style={{ "--ab-score-color": scoreSignalColor(general, generalSignal) } as CSSProperties} role="img" aria-label={general === null ? "General score: no scored outcomes" : `General score ${general}, average of ${pickedHeadlines.length} outcome scores; signal strength ${Math.round(generalSignal * 100)}%`}>
        <strong className="ab-general-score">{general === null ? "\u2014" : general}</strong>
        <span className="ab-general-name">General score<small>Average of {pickedHeadlines.length} outcome score{pickedHeadlines.length === 1 ? "" : "s"}</small></span>
      </div>
      <h2>Outcomes</h2>
    </div>
  );
  const detailBlock = cur ? (
    <div className={`ab-headline ${legacy ? tone : "muted"}${layout === "overlap" ? " float" : ""}`}>
      {legacy && <div className="ab-number"><strong>{headline ?? "—"}</strong></div>}
      <div>
        <h2>{cur.o.name}</h2>
        <p className="ab-pop"><b>Population</b> {cur.o.population ?? "not recorded by this run"}</p>
        {cur.o.sentence && <p>{cur.o.sentence}</p>}
        {!legacy ? <p className="ab-stamp">Effect only. The other dimensions were not assessed.</p> : null}
      </div>
    </div>
  ) : null;

  const bars = <ul className={isList ? "ab-bars outcomes" : "ab-bars"}>{rowsToShow.map((d) => {
    const isOpen = open === d.id;
    const onTap = () => (d.jump !== null ? go(d.jump) : setOpen(isOpen ? null : d.id));
    const hasDetail = d.detail !== null || d.lines.length > 0 || d.sourceLinks.length > 0 || d.provenance !== null;
    return <li key={d.id} className={`${isOpen ? "open" : ""}${d.dim ? " dim" : ""}`} data-row-id={d.id} data-effect-kind={d.kind}>
      <button type="button" aria-expanded={d.jump === null ? isOpen : undefined} aria-controls={d.jump === null ? `ab-det-${d.id}` : undefined} onClick={onTap}>
        <span className="ab-bar-name">{d.name}{d.sub && <small>{d.sub}</small>}</span>
        <span className="ab-bar-word">{d.word}</span>
        <span className="ab-bar-pts" style={isList && d.fill !== null ? { color: d.color } : undefined}>{d.pts}</span>
        {/* One affordance per row, and it is the row: a single chevron (pointing
          * right when the tap opens that outcome's tab, down when it expands in
          * place). The old lone "More" link sat on its own grid line and broke
          * the row into three disconnected fragments. */}
        <span className={`ab-chev${d.jump !== null ? " go" : ""}`} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        {d.track === "interval" && d.scale && <Interval scale={d.scale} />}
        {d.track !== "interval" && d.track !== "none" && <span className={`ab-bar-track ${d.track}`}>{d.track === "fill" && d.fill !== null && <i style={{ width: `${Math.round(d.fill * 100)}%`, background: d.negative ? "var(--ab-warn)" : d.color }} />}{d.track === "null-result" && <i className="ab-null-tick" />}</span>}
      </button>
      {isOpen && hasDetail && <div id={`ab-det-${d.id}`} className="ab-bar-detail">
        {d.provenance && <p className="ab-stamp">{d.provenance}</p>}
        {d.detail && <><p><b>Found</b> {d.detail.found}</p><p><b>Missing</b> {d.detail.missing}</p><p><b>Would move it</b> {d.detail.move}</p></>}
        {d.lines.map((l, i) => <p key={`${i}-${l.label}`}><b>{l.label}</b> {l.body}</p>)}
        {/* The body above is a plain-language rewrite; the audit's own sentences
          * stay here, verbatim and complete, one tap away. Quiet by design:
          * the same small muted type as the stamps around it. */}
        {d.original && <details className="ab-verbatim">
          <summary>{VERBATIM_SUMMARY}</summary>
          <p className="ab-stamp">{PLAIN_LANGUAGE_STAMP}</p>
          {d.original.detail && <><p><b>Found</b> {d.original.detail.found}</p><p><b>Missing</b> {d.original.detail.missing}</p><p><b>Would move it</b> {d.original.detail.move}</p></>}
          {d.original.lines.map((l, i) => <p key={`${i}-${l.label}`}><b>{l.label}</b> {l.body}</p>)}
        </details>}
        {d.sourceLinks.length > 0 && <p className="ab-srcs"><b>Sources</b> {d.sourceLinks.map((l) => <span key={l.id}>{l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a> : l.label} <small>({l.access})</small> </span>)}</p>}
      </div>}
    </li>;
  })}</ul>;
  /* The "⚑ Best RCT is small or short" gates strip was deleted 2026-09-16
   * (founder). Those caps are already spelled out in the Evidence row's
   * "Current rubric" sentence, where they belong; a second amber strip under
   * the card only competed with the warnings block. score() still computes
   * firedGates — it is what applies the caps — only the strip is gone. */
  const warnings = cur?.o.warnings?.length ? <details className="ab-warnings" key={`${key}:${tab}`}>
    <summary><span>⚠ {cur.o.warnings.length} evidence warning{cur.o.warnings.length === 1 ? "" : "s"}</span></summary>
    <div className="ab-warning-list" aria-label="Evidence warnings">
      {/* The retained-audit stamp, the quoted source notes and the source
        * links belong ONLY to the two warnings built from audit prose. A label
        * fact or a counted-trial cap has no quoted commentary, so printing
        * "no specific source detail was retained" under it would invent a
        * missing literature note that was never part of that warning. */}
      {cur.o.warnings.map((w) => <details key={w.id} data-warning={w.id} data-scope={w.scope}>
        <summary>{w.title} · {w.status}</summary>
        <p>{w.explanation}</p>
        {w.note && <p className="ab-stamp">{w.note}</p>}
        {w.auditQuoted && <>
          <p className="ab-stamp">Retained AI source notes · not human-verified. Quoted audit commentary is not the current scoring rule.</p>
          {w.reported.length ? w.reported.map((text, i) => <p key={i}>{text}</p>) : <p>No specific source detail was retained. That is unknown, not evidence that the literature is free of this concern.</p>}
          {cur.o.effect.sourceLinks.length > 0 && <p><b>Sources for this outcome</b> {cur.o.effect.sourceLinks.map((l) => l.url ? <a key={l.id} href={l.url} target="_blank" rel="noreferrer">{l.label} ({l.access}) </a> : <span key={l.id}>{l.label} ({l.access}) </span>)}</p>}
        </>}
      </details>)}
    </div>
  </details> : null;
  const tabs = <div className="ab-tabs" aria-label="Outcome"><button type="button" aria-pressed={isList} onClick={() => go(null)}>Outcomes</button>{scored.map((x) => <button key={x.k} type="button" aria-pressed={tab === x.k} onClick={() => go(x.k)} title={x.o.population ?? undefined}>{x.o.name}</button>)}</div>;
  const header = <header className="ab-top"><button type="button" className="ab-back" aria-label="Back" onClick={() => go(null)}>‹</button><div className="ab-title"><strong>{s.product}</strong>{s.live && <small>Researched {s.live.runAt} · {s.live.sources} sources</small>}{s.research && <small>Effect-only pass {s.research.meta.run_at} · {s.research.sources.length} sources</small>}</div></header>;
  const block = isList ? listBlock : detailBlock;

  if (publicTest) return <main id="main-content" className="ab-stage ab-public">
    <div className="ab-public-wrap">
      <header className="ab-public-intro"><Link href="/">BS Proof</Link><span className="ab-kicker">SUPPLEMENT TEST SITE</span><h1>What changes.<br /><em>What backs it up.</em></h1>
        <p>Choose a saved product example, then an outcome to explore its Effect, Evidence, Form and Dose.</p>
        <p className="ab-stamp"><b>Experimental results · AI research, not human-verified.</b> This is a test website, not a live research service or medical advice. Scores and impact labels are unvalidated rubric outputs—not personal benefit probabilities or promises that you will notice a change. No survey or follow-up is being collected.</p>
      </header>
      <section aria-label="Choose a product"><h2>Choose a product</h2><div className="ab-scenarios ab-product-grid">{Object.entries({ ...liveScenarios, ...researchScenarios }).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.kind === "research" ? "Effect-only · no composite score" : "Full card · experimental outcome scores"} · {v.outcomes.length} outcomes</small></button>)}</div></section>
      <div className="ab-public-result">{header}
        {s.live && <p className="ab-stamp">Model {s.live.model}, run {s.live.runAt} · AI research, not reverified and not human-verified.</p>}
        {s.research && <p className="ab-stamp">Model {s.research.meta.model}, effect-only pass {s.research.meta.run_at} · AI research, not reverified and not human-verified.</p>}
        {tabs}{block}{warnings}{photo}<section className="ab-card" aria-label="Outcome results">{bars}</section></div>
      <details className="ab-public-options"><summary>Optional outcome interests</summary><div className="ab-picks">{s.outcomes.map((o) => <label key={keyOf(o)}><input type="checkbox" checked={isPicked(o)} onChange={() => togglePick(o)} />{o.name}{o.population && <small>{o.population}</small>}</label>)}</div></details>
      <footer className="ab-fine">Saved research examples only. Sources and access limits are in the expandable Effect row. Funding and publication bias are warnings, not Evidence deductions. This test does not change the existing scanner or historical pipeline. Not medical advice.</footer>
    </div>
  </main>;

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD</span><h1>Show the tub.<br />Then the <em>truth.</em></h1><p>Photo takes a third of the phone. Two placements to compare; the rows are identical in both.</p><span className="ab-kicker">PHOTO PLACEMENT</span><div className="ab-layouts" role="tablist" aria-label="Layout">{LAYOUTS.map((l) => <button key={l.id} role="tab" aria-selected={layout === l.id} onClick={() => { setLayout(l.id); setOpen(null); }}><b>{l.name}</b><small>{l.blurb}</small></button>)}</div><span className="ab-kicker">EARLIER AUDITS · UPDATED EVIDENCE POLICY</span><div className="ab-scenarios">{Object.entries(liveScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.outcomes.length} outcomes · {v.live?.sources} sources</small></button>)}</div><span className="ab-kicker">EFFECT-ONLY RESEARCH · NEW</span><div className="ab-scenarios">{Object.entries(researchScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.outcomes.length} outcomes · {v.research?.sources.length} sources · no score</small></button>)}</div><span className="ab-kicker">WHAT THE USER PICKED</span><div className="ab-picks">{s.outcomes.map((o) => <label key={outcomeKey(o.name, o.population)}><input type="checkbox" checked={isPicked(o)} onChange={() => togglePick(o)} />{o.name}{o.population && <small>{o.population}</small>}</label>)}</div><details className="ab-provenance"><summary>Fictional test ledgers</summary><div className="ab-scenarios">{Object.entries(fictionalScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.product}{v.declared?.businessModel ? " · fictional seller" : ""}</small></button>)}</div></details>{s.live ? <p className="ab-fine"><strong>Previous audit</strong> run {s.live.runAt} by {s.live.model}. Its effect text and sources are shown as written then and were <strong>not reverified</strong> in this pass; scores now exclude funding and publication-bias penalties. Model confidence: {s.live.confidence}. {s.live.doseNote}</p> : s.research ? <p className="ab-fine"><strong>Effect-only research pass</strong> {s.research.meta.run_at}, {s.research.meta.model}. {s.research.meta.note} <b>Reading rules:</b> {s.research.guards.join(" ")}</p> : <p className="ab-fine">Hand-written inputs to exercise the rubric; no search or model call produced this card. The numeric bars here are invented.{s.declared?.multiIngredient || s.declared?.servingsNotStated ? " Its label facts (multi-active blend, no servings per day) are declared by this sample, not read from a real label." : ""}{s.declared?.businessModel ? " Its seller is fictional too: the MLM / direct-selling disclosure here exercises the row and names no real company." : ""}</p>}</aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className={`ab-screen layout-${layout}`}>
    {layout === "hero" && <>{header}{photo}{tabs}<section className="ab-card">{block}{warnings}{bars}</section></>}
    {layout === "overlap" && <>{photo}<div className="ab-overlap-wrap">{header}{block}</div>{tabs}{warnings}<section className="ab-card">{bars}</section></>}
  </div></div>
  <aside className="ab-notes"><span className="ab-kicker">THE TWO PLACEMENTS</span><h3>1 · Hero</h3><p>Photo first, big and calm. The outcome list sits under it. Most “product page” feeling.</p><h3>2 · Overlap</h3><p>Full-bleed photo; the block floats over its bottom edge. Most editorial, least whitespace.</p><p className="ab-fine">Middle and Split were dropped 2026-09-16 (founder pick).</p><h3>Outcomes first</h3><p>Landing tab. A compact <b>General score</b> tile sits directly above Outcomes: the plain mean of the outcome scores, labelled as an average and never given a band word (founder decision 2026-09-16; it replaces the 2026-09-11 “no overall number” rule). Each row is ONE unit: the outcome name and its score on the first line, the population under it, the full-width bar across the bottom. The whole row is the control and a single chevron on the right is the only affordance; tapping it opens that outcome’s tab. (The lone link that used to float mid-row was removed 2026-09-16.)</p><h3>The Effect bar</h3><p>Never a tier fill. When a source reported an estimate and an interval, the interval is drawn in its own unit and labelled <i>reported estimate, not a grade</i>. With an estimate and no interval, the point is drawn and the interval is called unavailable. Otherwise the track is hatched and reads <i>size not graded</i> — which is not the same as <i>no evidence found</i> or <i>no meaningful benefit</i>.</p></aside></main>;
}
