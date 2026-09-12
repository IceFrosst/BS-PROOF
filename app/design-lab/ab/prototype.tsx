"use client";

import { useState } from "react";
import Link from "next/link";
import { detailFromAudit, ledgerFromAudit, personFit, score, type AuditFile, type Ledger, type Profile, type StudiedIn } from "./ledger";
import { parseEffectResearch, type EffectResearchFile } from "./effect-contract";
import {
  NOT_ASSESSED_WORD, PREVIOUS_RUBRIC_LABEL, fictionalEffectBar, legacyEffectBar, notAssessedReason, outcomeKey,
  researchEffectBar, type EffectBar, type EffectLine, type EffectSourceLink, type IntervalScale,
} from "./effect-presentation";
import creatineAudit from "./audits/creatine.json";
import vitaminDAudit from "./audits/vitamin-d.json";
import magnesiumAudit from "./audits/magnesium.json";
import caffeineResearch from "./effect-research/caffeine.json";
import creatineResearch from "./effect-research/creatine-effect.json";
import omega3Research from "./effect-research/omega3-effect.json";
import { auditWarnings, researchWarnings, evidenceDetail, type EvidenceWarning } from "./evidence-warnings";
import "./ab.css";

type DimKey = "effect" | "evidence" | "form" | "dose" | "person";
interface Detail { found: string; missing: string; move: string }

/* HYPOTHETICAL ledgers. Fictional products; hand-written inputs to exercise the rubric. No search or study lookup was performed. */
interface OutcomeCase { warnings?: EvidenceWarning[]; name: string; sentence?: string; ledger?: Ledger; detail?: Record<Exclude<DimKey, "person">, Detail>; population?: string; studiedIn?: StudiedIn; effect: EffectBar }
interface Scenario {
  title: string; product: string;
  kind: "live" | "fictional" | "research";
  outcomes: OutcomeCase[];
  live?: { runAt: string; model: string; sources: number; doseNote: string; confidence: string; confidenceNote: string; couldNotAccess: string[] };
  research?: EffectResearchFile;
}
const okChecklist: Ledger["checklist"] = { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" };
const strongGates: Ledger["gates"] = { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false };
const thinDetail = (what: string): Record<Exclude<DimKey, "person">, Detail> => ({
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
    outcomes: ([
      { name: "Testosterone (blood level)", sentence: "One small maker-funded trial saw higher levels. A blood marker is not what most buyers want.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "concern", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 1, largestRctN: 60, longestRctWeeks: 4, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: true }, formFit: 2, doseFit: 4 },
        detail: { effect: { found: "A small rise in a blood marker over 4 weeks.", missing: "No trial on energy, libido or strength itself.", move: "A trial measuring what people actually buy it for." }, evidence: { found: "One RCT, n≈60, funded by the maker.", missing: "Only one trial (cap 1). Small and short. Surrogate outcome. Single funder.", move: "An independent replication of any size." }, form: { found: "Same plant, different standardization than the trial.", missing: "Extract ratio on the label does not match the tested one.", move: "A trial using this standardization." }, dose: { found: "400 mg/day matches the trial dose.", missing: "Nothing — but matching a dose from one trial proves little.", move: "—" } } },
      { name: "Energy", sentence: "No controlled trial measured energy or fatigue for this extract.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
      { name: "Libido", sentence: "No controlled trial on this outcome.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
    ] as FictionalCase[]).map(fictional),
  },
  none: {
    title: "Nothing to score", product: "Sample blend D · 2 capsules", kind: "fictional",
    outcomes: ([
      { name: "Cognitive function", sentence: "No human trial tested this formula. Missing evidence is not proof it fails.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" },
        detail: { effect: { found: "Nothing on the full formula.", missing: "Ingredient-level trials exist at very different doses.", move: "Any controlled trial of this blend." }, evidence: { found: "No controlled human trial.", missing: "Everything.", move: "One RCT would unlock a score." }, form: { found: "—", missing: "Proprietary blend; amounts per ingredient not printed.", move: "A label that states each amount." }, dose: { found: "—", missing: "Cannot compare without per-ingredient amounts.", move: "—" } } },
      { name: "Focus", sentence: "No trial on the formula.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" }, detail: thinDetail("Nothing measured.") },
    ] as FictionalCase[]).map(fictional),
  },
};

function personDetail(st: StudiedIn | undefined, p: Profile): Detail {
  if (!st) return { found: "This audit has not recorded who the trials enrolled.", missing: "Enrolled sex and age range per study.", move: "Re-reading the trials for their demographics." };
  const who = [st.sex === "unknown" ? "sex not reported" : st.sex === "mixed" ? "men and women" : st.sex === "male" ? "men only" : "women only", st.age_min !== null || st.age_max !== null ? `ages ${st.age_min ?? "?"}-${st.age_max ?? "?"}` : "age range not reported"].join(", ");
  const you = p.age === null && p.sex === null ? "Tell us your age and sex to see how well this transfers." : `You: ${p.sex ?? "sex not given"}${p.age !== null ? `, ${p.age}` : ""}.`;
  return {
    found: `Trials enrolled ${who}. ${st.sex_note ?? ""} ${st.age_note ?? ""}`.trim(),
    missing: `Ethnicity: ${st.ethnicity ?? "not reported"}.${st.confidence && st.confidence !== "verified" ? ` Demographics ${st.confidence}, not read from every paper.` : ""}`,
    move: you,
  };
}

/* The shipped audits carry two prose fields the older AuditFile type never
 * declared. They are read-only here: the Effect bar reuses that text verbatim
 * and stamps it "Previous AI audit · not reverified" instead of turning prose
 * into a number. */
type AuditOutcome = AuditFile["outcomes"][number] & { absolute_effect?: string; clinically_meaningful?: string };
type AuditFileWithEffect = Omit<AuditFile, "outcomes"> & { outcomes: AuditOutcome[] };

function fromAudit(title: string, a: AuditFileWithEffect): Scenario {
  return {
    title, product: a.product.replace(/,?\s*(softgel|powder|capsules)[^,]*/i, "").replace(" per day", "/day"),
    kind: "live",
    /* The audit's own one-line summary is deliberately NOT rendered. One of
     * them asserts "roughly a third more than training alone", a share-of-gain
     * claim the follow-up read could not defend. The row's full reported-effect
     * text stays reachable in the Effect expansion, stamped as that run's. */
    outcomes: a.outcomes.map((o) => ({
      name: o.name, population: o.population, studiedIn: o.studied_in, ledger: ledgerFromAudit(o),
      detail: { effect: detailFromAudit(o.detail.effect), evidence: evidenceDetail(ledgerFromAudit(o), detailFromAudit(o.detail.evidence).found, detailFromAudit(o.detail.evidence).move, detailFromAudit(o.detail.evidence).missing), form: detailFromAudit(o.detail.form), dose: detailFromAudit(o.detail.dose) },
      warnings: auditWarnings(o),
      effect: legacyEffectBar({
        effectPoints: o.ledger.effectPoints === "unclear" ? "unclear" : Number(o.ledger.effectPoints),
        rctCount: o.ledger.gates.rctCount,
        inventory: o.inventory,
        absoluteEffect: o.absolute_effect,
        clinicallyMeaningful: o.clinically_meaningful,
        strongestDoubt: o.strongest_doubt,
      }),
    })),
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
    warnings: researchWarnings(file, o),
    effect: researchEffectBar(file, o),
  })),
});

const liveScenarios: Record<string, Scenario> = {
  creatine: fromAudit("Creatine monohydrate · 4 g", creatineAudit as unknown as AuditFileWithEffect),
  vitaminD: fromAudit("Vitamin D3 · 2000 IU", vitaminDAudit as unknown as AuditFileWithEffect),
  magnesium: fromAudit("Magnesium glycinate · 300 mg", magnesiumAudit as unknown as AuditFileWithEffect),
};
const researchScenarios: Record<string, Scenario> = {
  creatineEffect: researchScenario("Creatine monohydrate · 3–5 g", creatineEffectFile),
  caffeine: researchScenario("Caffeine anhydrous · 200 mg", caffeineFile),
  omega3: researchScenario("Omega-3 (EPA/DHA) · 1 g", omega3File),
};
const allScenarios: Record<string, Scenario> = { ...liveScenarios, ...researchScenarios, ...scenarios };

const DIMS_BASE: { key: DimKey; name: string; color: string }[] = [
  { key: "effect", name: "Effect", color: "var(--ab-r1)" },
  { key: "evidence", name: "Evidence", color: "var(--ab-r4)" },
  { key: "form", name: "Form", color: "var(--ab-r2)" },
  { key: "dose", name: "Dose", color: "var(--ab-r3)" },
];
const PERSON_DIM = { key: "person" as const, name: "Studied in you", color: "var(--ab-r5)" };

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
  sourceLinks: EffectSourceLink[];
  provenance: string | null;
  jump: string | null;
  dim: boolean;
  kind?: string;
}

const TRACK_FOR: Record<EffectBar["kind"], TrackState> = {
  reported_interval: "interval",
  reported_point: "interval",
  not_graded: "hatch",
  no_evidence: "no-evidence",
  no_meaningful_benefit: "null-result",
  fictional_points: "fill",
};

type Layout = "hero" | "middle" | "overlap" | "split";
const LAYOUTS: { id: Layout; name: string; blurb: string }[] = [
  { id: "hero", name: "1 · Hero", blurb: "photo on top" },
  { id: "middle", name: "2 · Middle", blurb: "score, photo, rows" },
  { id: "overlap", name: "3 · Overlap", blurb: "score floats on photo" },
  { id: "split", name: "4 · Split", blurb: "photo beside score" },
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
  const [layout, setLayout] = useState<Layout>(initial?.layout ?? "middle");
  const [key, setKey] = useState(initial?.product ?? "creatine");
  const [tab, setTab] = useState<string | null>(initial?.outcome ?? null); // null = the Outcomes list
  const [open, setOpen] = useState<string | null>(initial?.open ?? null);
  const [profile, setProfile] = useState<Profile>({ age: null, sex: null });
  const [unpicked, setUnpicked] = useState<Record<string, boolean>>({}); // outcomes the user did NOT pick at the interests step
  const s = allScenarios[key];
  const keyOf = (o: OutcomeCase) => outcomeKey(o.name, o.population);
  const isPicked = (o: OutcomeCase) => !unpicked[`${key}:${keyOf(o)}`];
  const togglePick = (o: OutcomeCase) => setUnpicked((u) => ({ ...u, [`${key}:${keyOf(o)}`]: !u[`${key}:${keyOf(o)}`] }));
  const scored = s.outcomes.map((o) => ({ o, k: keyOf(o), r: o.ledger ? score(o.ledger, personFit(profile, o.studiedIn)) : null }));
  const isList = tab === null;
  const cur = isList ? null : (scored.find((x) => x.k === tab) ?? null);
  const legacy = s.kind !== "research";

  const dimRows: Row[] = cur ? [...DIMS_BASE, PERSON_DIM].map((d): Row => {
    const bar = cur.o.effect;
    if (d.key === "effect") {
      return {
        id: "effect", name: d.name, color: d.color, fill: bar.fill, track: TRACK_FOR[bar.kind], scale: bar.scale,
        pts: bar.pts, word: bar.word, negative: bar.kind === "fictional_points" && (typeof cur.o.ledger?.effectPoints === "number" ? cur.o.ledger.effectPoints < 0 : false),
        detail: cur.o.detail?.effect ?? null, lines: bar.lines, sourceLinks: bar.sourceLinks, provenance: bar.provenance,
        jump: null, dim: false, kind: bar.kind,
      };
    }
    if (!legacy || !cur.r || !cur.o.ledger) {
      const reason = s.research ? notAssessedReason(s.research, d.key as "evidence" | "form" | "dose" | "person") : null;
      return {
        id: d.key, name: d.name, color: d.color, fill: null, track: "hatch", scale: null, pts: "—", word: NOT_ASSESSED_WORD,
        negative: false, detail: null, lines: reason ? [{ label: "Why", body: reason }] : [], sourceLinks: [],
        provenance: "Effect-only pass · nothing here was graded", jump: null, dim: false, kind: "not_assessed",
      };
    }
    const L = cur.o.ledger; const r = cur.r;
    const fill = d.key === "evidence" ? r.certainty / 4 : d.key === "form" ? (L.formFit === "unknown" ? null : L.formFit / 4) : d.key === "dose" ? (L.doseFit === "unknown" ? null : L.doseFit / 4) : (r.person === "unknown" ? null : r.person / 3);
    const pts = d.key === "evidence" ? `${r.certainty}/4` : d.key === "form" ? (L.formFit === "unknown" ? "—" : `${L.formFit}/4`) : d.key === "dose" ? (L.doseFit === "unknown" ? "—" : `${L.doseFit}/4`) : (r.person === "unknown" ? "—" : `${r.person}/3`);
    const word = d.key === "evidence" ? r.certaintyWord : d.key === "form" ? r.formWord : d.key === "dose" ? r.doseWord : r.personWord;
    return {
      id: d.key, name: d.name, color: d.color, fill, track: fill === null ? "hatch" : "fill", scale: null, pts, word, negative: false,
      detail: (d.key === "person" ? personDetail(cur.o.studiedIn, profile) : cur.o.detail?.[d.key as Exclude<DimKey, "person">]) ?? null,
      lines: [], sourceLinks: [], provenance: PREVIOUS_RUBRIC_LABEL, jump: null, dim: false,
    };
  }) : [];

  const outcomeRows: Row[] = scored.map((x, i): Row => ({
    id: `o${i}`, name: x.o.name, sub: x.o.population, color: isPicked(x.o) ? "var(--ab-r1)" : "var(--ab-track)",
    fill: null, track: "none", scale: null,
    pts: x.r && x.r.headline !== null ? String(x.r.headline) : "—",
    word: isPicked(x.o) ? (x.r ? x.r.label : x.o.effect.word) : "Not picked",
    negative: false, detail: null, lines: [], sourceLinks: [], provenance: null, jump: x.k, dim: !isPicked(x.o),
  }));
  const rowsToShow = isList ? outcomeRows : dimRows;
  const firedGates = cur?.r?.firedGates ?? [];
  const headline = cur?.r?.headline ?? null;
  const tone = headline === null ? "muted" : headline >= 55 ? "good" : headline >= 45 ? "neutral" : "bad";
  const pick = (k: string) => { setKey(k); setTab(null); setOpen(null); };
  const go = (k: string | null) => { setTab(k); setOpen(null); };

  const profileRow = <div className="ab-profile"><span className="ab-kicker">WHO IS ASKING</span><div><input type="number" min={12} max={110} placeholder="Age" aria-label="Your age" value={profile.age ?? ""} onChange={(e) => setProfile((v) => ({ ...v, age: e.target.value === "" ? null : Number(e.target.value) }))} />{(["female", "male"] as const).map((x) => <button key={x} type="button" aria-pressed={profile.sex === x} onClick={() => setProfile((v) => ({ ...v, sex: v.sex === x ? null : x }))}>{x === "female" ? "Female" : "Male"}</button>)}<button type="button" className="ab-clear" onClick={() => setProfile({ age: null, sex: null })}>Clear</button></div><small>Optional experimental demographic match; changes the applicability term and can raise or lower an existing score. Not a validated prediction. Kept only in this page’s memory.</small></div>;
  const photo = <div className={`ab-photo-hero${layout === "overlap" ? " bleed" : ""}`} role="img" aria-label="Illustrated sample product (placeholder)"><div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(s.kind === "fictional" ? s.product : s.title).split(" · ")[0].replace(/^Sample /, "").toLowerCase()}</strong><i>Pure. Simple. Studied.</i><div>{s.kind === "fictional" ? "SAMPLE" : "DAILY"} <b>{(s.kind === "fictional" ? s.product : s.title).split(" · ")[1] ?? ""}</b></div></div></div>;

  /* THE LANDING TAB. No average, no overall number, no band label: a product is
   * not one benefit. Every row is a separate question in its own population. */
  const listBlock = (
    <div className="ab-listhead">
      <h2>Outcomes</h2>
      <p>Each row below is a separate question, in the population it was studied in. Tap one to see what was found. These suggestions help you choose a question — they are <b>not</b> a promise of benefit and not a measure of how many people buy it.</p>
      {legacy && <p className="ab-stamp">{PREVIOUS_RUBRIC_LABEL} — earlier audit inputs, recalculated without funding or publication-bias penalties. Scores are heuristic, not probabilities of benefit.</p>}
      {s.kind === "research" && <p className="ab-stamp">Effect-only research pass. No overall number, no certainty, form, dose or person score exists for this product.</p>}
    </div>
  );
  const detailBlock = cur ? (
    <div className={`ab-headline ${legacy ? tone : "muted"}${layout === "overlap" ? " float" : ""}`}>
      {legacy && <div className="ab-number"><strong>{headline ?? "—"}</strong><span>{headline === null ? "no score" : "test rubric"}</span></div>}
      <div>
        <h2>{cur.o.name}</h2>
        <p className="ab-pop"><b>Population</b> {cur.o.population ?? "not recorded by this run"}</p>
        {cur.o.sentence && <p>{cur.o.sentence}</p>}
        {legacy
          ? <p className="ab-stamp">{PREVIOUS_RUBRIC_LABEL} — {cur.r?.label ?? "Not scored"}. Recalculated without funding or publication-bias penalties.</p>
          : <p className="ab-stamp">Effect only. No overall number for this product; the other bars were not assessed.</p>}
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
        <span className="ab-bar-pts">{d.pts}</span>
        <span className="ab-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d={d.jump !== null ? "M6 3l5 5-5 5" : "M3 6l5 5 5-5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        {d.track === "interval" && d.scale && <Interval scale={d.scale} />}
        {d.track !== "interval" && d.track !== "none" && <span className={`ab-bar-track ${d.track}`}>{d.track === "fill" && d.fill !== null && <i style={{ width: `${Math.round(d.fill * 100)}%`, background: d.negative ? "var(--ab-warn)" : d.color }} />}{d.track === "null-result" && <i className="ab-null-tick" />}</span>}
      </button>
      {isOpen && hasDetail && <div id={`ab-det-${d.id}`} className="ab-bar-detail">
        {d.provenance && <p className="ab-stamp">{d.provenance}</p>}
        {d.detail && <><p><b>Found</b> {d.detail.found}</p><p><b>Missing</b> {d.detail.missing}</p><p><b>Would move it</b> {d.detail.move}</p></>}
        {d.lines.map((l, i) => <p key={`${i}-${l.label}`}><b>{l.label}</b> {l.body}</p>)}
        {d.sourceLinks.length > 0 && <p className="ab-srcs"><b>Sources</b> {d.sourceLinks.map((l) => <span key={l.id}>{l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a> : l.label} <small>({l.access})</small> </span>)}</p>}
      </div>}
    </li>;
  })}</ul>;
  const gates = legacy && firedGates.length > 0 && <details className="ab-gates"><summary>⚑ {firedGates.length === 1 ? firedGates[0] : `${firedGates.length} limits · ${firedGates[0]}`}</summary><ul>{firedGates.map((g) => <li key={g}>{g}</li>)}</ul></details>;
  const warnings = cur?.o.warnings && <section className="ab-warnings" aria-label="Evidence warnings" key={`${key}:${tab}`}>
    <p><b>⚠ Evidence warnings</b> · disclosure only, no score penalty</p>
    {cur.o.warnings.map((w) => <details key={w.id} data-warning={w.id}>
      <summary>{w.title} · {w.status}</summary>
      <p>{w.explanation}</p>
      <p className="ab-stamp">Retained AI source notes · not human-verified. Quoted audit commentary is not the current scoring rule.</p>
      {w.reported.length ? w.reported.map((text, i) => <p key={i}>{text}</p>) : <p>No specific source detail was retained. That is unknown, not evidence that the literature is free of this concern.</p>}
      {cur.o.effect.sourceLinks.length > 0 && <p><b>Sources for this outcome</b> {cur.o.effect.sourceLinks.map((l) => l.url ? <a key={l.id} href={l.url} target="_blank" rel="noreferrer">{l.label} ({l.access}) </a> : <span key={l.id}>{l.label} ({l.access}) </span>)}</p>}
    </details>)}
  </section>;
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
        {tabs}{block}{warnings}{photo}<section className="ab-card" aria-label="Outcome results">{bars}{gates}</section></div>
      <details className="ab-public-options"><summary>Optional profile & outcome interests</summary>{profileRow}<div className="ab-picks">{s.outcomes.map((o) => <label key={keyOf(o)}><input type="checkbox" checked={isPicked(o)} onChange={() => togglePick(o)} />{o.name}{o.population && <small>{o.population}</small>}</label>)}</div></details>
      <footer className="ab-fine">Saved research examples only. Sources and access limits are in the expandable Effect row. Funding and publication bias are warnings, not Evidence deductions. This test does not change the existing scanner or historical pipeline. Not medical advice.</footer>
    </div>
  </main>;

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD</span><h1>Show the tub.<br />Then the <em>truth.</em></h1><p>Photo takes a third of the phone. Four placements to compare; the rows are identical in all of them, and none of them carries an overall score.</p><span className="ab-kicker">PHOTO PLACEMENT</span><div className="ab-layouts" role="tablist" aria-label="Layout">{LAYOUTS.map((l) => <button key={l.id} role="tab" aria-selected={layout === l.id} onClick={() => { setLayout(l.id); setOpen(null); }}><b>{l.name}</b><small>{l.blurb}</small></button>)}</div><span className="ab-kicker">EARLIER AUDITS · UPDATED EVIDENCE POLICY</span><div className="ab-scenarios">{Object.entries(liveScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.outcomes.length} outcomes · {v.live?.sources} sources</small></button>)}</div><span className="ab-kicker">EFFECT-ONLY RESEARCH · NEW</span><div className="ab-scenarios">{Object.entries(researchScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.outcomes.length} outcomes · {v.research?.sources.length} sources · no score</small></button>)}</div>{profileRow}<span className="ab-kicker">WHAT THE USER PICKED</span><div className="ab-picks">{s.outcomes.map((o) => <label key={outcomeKey(o.name, o.population)}><input type="checkbox" checked={isPicked(o)} onChange={() => togglePick(o)} />{o.name}{o.population && <small>{o.population}</small>}</label>)}</div><details className="ab-provenance"><summary>Fictional test ledgers</summary><div className="ab-scenarios">{Object.entries(scenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.product}</small></button>)}</div></details>{s.live ? <p className="ab-fine"><strong>Previous audit</strong> run {s.live.runAt} by {s.live.model}. Its effect text and sources are shown as written then and were <strong>not reverified</strong> in this pass; scores now exclude funding and publication-bias penalties. Model confidence: {s.live.confidence}. {s.live.doseNote}</p> : s.research ? <p className="ab-fine"><strong>Effect-only research pass</strong> {s.research.meta.run_at}, {s.research.meta.model}. {s.research.meta.note} <b>Reading rules:</b> {s.research.guards.join(" ")}</p> : <p className="ab-fine">Hand-written inputs to exercise the rubric; no search or model call produced this card. The numeric bars here are invented.</p>}</aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className={`ab-screen layout-${layout}`}>
    {layout === "hero" && <>{header}{photo}{tabs}<section className="ab-card">{block}{warnings}{bars}{gates}</section></>}
    {layout === "middle" && <>{header}{tabs}{block}{warnings}{photo}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "overlap" && <>{photo}<div className="ab-overlap-wrap">{header}{block}</div>{tabs}{warnings}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "split" && <>{header}{tabs}<div className="ab-split">{photo}<div className="ab-split-score">{block}</div></div>{warnings}<section className="ab-card">{bars}{gates}</section></>}
  </div></div>
  <aside className="ab-notes"><span className="ab-kicker">THE FOUR PLACEMENTS</span><h3>1 · Hero</h3><p>Photo first, big and calm. The outcome list sits under it. Most “product page” feeling.</p><h3>2 · Middle</h3><p>Outcomes first, photo between the intro and the rows — the founder’s “a third, in the middle”.</p><h3>3 · Overlap</h3><p>Full-bleed photo; the block floats over its bottom edge. Most editorial, least whitespace.</p><h3>4 · Split</h3><p>Photo left, text right, side by side. Shortest; leaves room below the rows.</p><h3>Outcomes first</h3><p>Landing tab. <b>There is no overall number and no overall band.</b> A product is not one benefit: each row is a question in a named population, and tapping it drills in. Numbers beside a row are the earlier rubric, shown unchanged.</p><h3>The Effect bar</h3><p>Never a tier fill. When a source reported an estimate and an interval, the interval is drawn in its own unit and labelled <i>reported estimate, not a grade</i>. With an estimate and no interval, the point is drawn and the interval is called unavailable. Otherwise the track is hatched and reads <i>size not graded</i> — which is not the same as <i>no evidence found</i> or <i>no meaningful benefit</i>.</p></aside></main>;
}
