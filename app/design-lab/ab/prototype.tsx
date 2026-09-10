"use client";

import { useState } from "react";
import { bandLabel, detailFromAudit, ledgerFromAudit, score, type AuditFile, type Ledger } from "./ledger";
import creatineAudit from "./audits/creatine.json";
import vitaminDAudit from "./audits/vitamin-d.json";
import magnesiumAudit from "./audits/magnesium.json";
import "./ab.css";

type DimKey = "effect" | "evidence" | "form" | "dose";
interface Detail { found: string; missing: string; move: string }

/* HYPOTHETICAL ledgers. Fictional products; hand-written inputs to exercise the rubric. No search or study lookup was performed. */
interface OutcomeCase { name: string; sentence: string; ledger: Ledger; detail: Record<DimKey, Detail> }
interface Scenario { title: string; product: string; outcomes: OutcomeCase[]; live?: { runAt: string; model: string; sources: number; doseNote: string; confidence: string; confidenceNote: string; couldNotAccess: string[] } }
const okChecklist: Ledger["checklist"] = { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" };
const strongGates: Ledger["gates"] = { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false };
const thinDetail = (what: string): Record<DimKey, Detail> => ({
  effect: { found: what, missing: "Few trials measured this directly.", move: "A trial with this as the primary outcome." },
  evidence: { found: "A handful of small trials.", missing: "Imprecise; results vary.", move: "A preregistered replication." },
  form: { found: "Same preparation as the strength trials.", missing: "—", move: "—" },
  dose: { found: "Same dose range as the strength trials.", missing: "—", move: "—" },
});
const scenarios: Record<string, Scenario> = {
  solid: {
    title: "Well-studied, good fit", product: "Sample powder A · 3 g/day",
    outcomes: [
      { name: "Muscle strength", sentence: "Trials on this exact form, near this dose, mostly agree on a moderate benefit in adults who train.", ledger: { effectPoints: 2, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: 4, doseFit: 3 },
        detail: { effect: { found: "Pooled estimate in the moderate range; interval clear of the ‘meaningful’ threshold.", missing: "Effect varies by training status — larger in trained adults.", move: "A large trial in untrained adults reporting the same size." }, evidence: { found: "24 controlled trials; low bias; precise pooled estimate; outcome is the real thing, not a marker.", missing: "Consistency: trials disagree on size (−1). Publication bias not assessable.", move: "A preregistered replication with a published protocol." }, form: { found: "The tested preparation is the one on this label.", missing: "Nothing — exact match.", move: "—" }, dose: { found: "3 g/day sits just under the 3–5 g range where benefit was shown.", missing: "Most trials used 5 g/day; 3 g is at the edge.", move: "A trial comparing 3 g and 5 g directly." } } },
      { name: "Muscle growth", sentence: "A small gain in lean mass shows up across trials, partly water retention early on.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: 4, doseFit: 3 }, detail: thinDetail("Small increase in lean mass; some is early water gain.") },
      { name: "Endurance", sentence: "Trials on long-duration performance find little or no meaningful change.", ledger: { effectPoints: 0, bodyIsRct: true, checklist: { ...okChecklist, consistency: "supported" }, gates: { ...strongGates, rctCount: 9 }, formFit: 4, doseFit: 3 }, detail: thinDetail("No meaningful change in endurance outcomes.") },
    ],
  },
  untested: {
    title: "Good evidence, wrong form", product: "Sample capsule B · 1.5 g/day",
    outcomes: [
      { name: "Muscle strength", sentence: "The benefit evidence is for a different preparation. This form and this lower dose have not been tested on strength.", ledger: { effectPoints: 2, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: "unknown", doseFit: 1 },
        detail: { effect: { found: "Moderate benefit — but measured on another preparation.", missing: "No trial of this form on this outcome.", move: "Any controlled trial using this exact preparation." }, evidence: { found: "Strong body of trials for the ingredient in general.", missing: "None of it is about this product’s form.", move: "—" }, form: { found: "Nothing. This preparation was never tested for strength.", missing: "Equivalence to the tested form is a marketing claim, not a finding.", move: "A head-to-head trial of the two forms." }, dose: { found: "1.5 g/day is about half the lowest effective dose tested.", missing: "No trial at this dose.", move: "A dose-ranging trial that includes 1.5 g." } } },
      { name: "Muscle growth", sentence: "Same story: the evidence is for another form at a higher dose.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: okChecklist, gates: strongGates, formFit: "unknown", doseFit: 1 }, detail: thinDetail("Small lean-mass gain on the other preparation.") },
      { name: "Endurance", sentence: "Little or no effect in the trials that exist — none on this form.", ledger: { effectPoints: 0, bodyIsRct: true, checklist: okChecklist, gates: { ...strongGates, rctCount: 9 }, formFit: "unknown", doseFit: 1 }, detail: thinDetail("No meaningful change in endurance outcomes.") },
    ],
  },
  thin: {
    title: "One small trial", product: "Sample extract C · 400 mg/day",
    outcomes: [
      { name: "Testosterone (blood level)", sentence: "One small maker-funded trial saw higher levels. A blood marker is not what most buyers want.", ledger: { effectPoints: 1, bodyIsRct: true, checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "concern", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 1, largestRctN: 60, longestRctWeeks: 4, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: true }, formFit: 2, doseFit: 4 },
        detail: { effect: { found: "A small rise in a blood marker over 4 weeks.", missing: "No trial on energy, libido or strength itself.", move: "A trial measuring what people actually buy it for." }, evidence: { found: "One RCT, n≈60, funded by the maker.", missing: "Only one trial (cap 1). Small and short. Surrogate outcome. Single funder.", move: "An independent replication of any size." }, form: { found: "Same plant, different standardization than the trial.", missing: "Extract ratio on the label does not match the tested one.", move: "A trial using this standardization." }, dose: { found: "400 mg/day matches the trial dose.", missing: "Nothing — but matching a dose from one trial proves little.", move: "—" } } },
      { name: "Energy", sentence: "No controlled trial measured energy or fatigue for this extract.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
      { name: "Libido", sentence: "No controlled trial on this outcome.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 2, doseFit: 4 }, detail: thinDetail("Nothing measured.") },
    ],
  },
  none: {
    title: "Nothing to score", product: "Sample blend D · 2 capsules",
    outcomes: [
      { name: "Cognitive function", sentence: "No human trial tested this formula. Missing evidence is not proof it fails.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" },
        detail: { effect: { found: "Nothing on the full formula.", missing: "Ingredient-level trials exist at very different doses.", move: "Any controlled trial of this blend." }, evidence: { found: "No controlled human trial.", missing: "Everything.", move: "One RCT would unlock a score." }, form: { found: "—", missing: "Proprietary blend; amounts per ingredient not printed.", move: "A label that states each amount." }, dose: { found: "—", missing: "Cannot compare without per-ingredient amounts.", move: "—" } } },
      { name: "Focus", sentence: "No trial on the formula.", ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "unknown", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" }, detail: thinDetail("Nothing measured.") },
    ],
  },
};

function fromAudit(title: string, a: AuditFile): Scenario {
  return {
    title, product: a.product.replace(/,?\s*(softgel|powder|capsules)[^,]*/i, "").replace(" per day", "/day"),
    outcomes: a.outcomes.map((o) => ({ name: o.name, sentence: o.sentence, ledger: ledgerFromAudit(o), detail: { effect: detailFromAudit(o.detail.effect), evidence: detailFromAudit(o.detail.evidence), form: detailFromAudit(o.detail.form), dose: detailFromAudit(o.detail.dose) } })),
    live: { runAt: a.meta.run_at, model: a.meta.model, sources: new Set(a.outcomes.flatMap((o) => o.inventory.map((i) => i.id))).size, doseNote: a.dose_note, confidence: a.self_confidence, confidenceNote: a.confidence_note, couldNotAccess: a.could_not_access },
  };
}
const liveScenarios: Record<string, Scenario> = {
  creatine: fromAudit("Creatine monohydrate · 4 g", creatineAudit as AuditFile),
  vitaminD: fromAudit("Vitamin D3 · 2000 IU", vitaminDAudit as AuditFile),
  magnesium: fromAudit("Magnesium glycinate · 300 mg", magnesiumAudit as AuditFile),
};
const allScenarios: Record<string, Scenario> = { ...liveScenarios, ...scenarios };

const DIMS: { key: DimKey; name: string; color: string }[] = [
  { key: "effect", name: "Effect", color: "var(--ab-r1)" },
  { key: "evidence", name: "Evidence", color: "var(--ab-r4)" },
  { key: "form", name: "Form", color: "var(--ab-r2)" },
  { key: "dose", name: "Dose", color: "var(--ab-r3)" },
];

type Layout = "hero" | "middle" | "overlap" | "split";
const LAYOUTS: { id: Layout; name: string; blurb: string }[] = [
  { id: "hero", name: "1 · Hero", blurb: "photo on top" },
  { id: "middle", name: "2 · Middle", blurb: "score, photo, rows" },
  { id: "overlap", name: "3 · Overlap", blurb: "score floats on photo" },
  { id: "split", name: "4 · Split", blurb: "photo beside score" },
];

export default function AbPrototype() {
  const [layout, setLayout] = useState<Layout>("middle");
  const [key, setKey] = useState("creatine");
  const [tab, setTab] = useState<number>(-1); // -1 = Overall
  const [open, setOpen] = useState<string | null>(null);
  const [unpicked, setUnpicked] = useState<Record<string, boolean>>({}); // outcomes the user did NOT pick at the interests step
  const s = allScenarios[key];
  const isPicked = (name: string) => !unpicked[`${key}:${name}`];
  const togglePick = (name: string) => setUnpicked((u) => ({ ...u, [`${key}:${name}`]: !u[`${key}:${name}`] }));
  const scored = s.outcomes.map((o) => ({ o, r: score(o.ledger) }));
  const pickedCount = s.outcomes.filter((o) => isPicked(o.name)).length;
  const withScore = scored.filter((x) => x.r.headline !== null && isPicked(x.o.name));
  const overall = withScore.length ? Math.round(withScore.reduce((a, x) => a + (x.r.headline as number), 0) / withScore.length) : null;
  const isOverall = tab < 0;
  const cur = isOverall ? null : scored[tab];
  const headline = isOverall ? overall : cur!.r.headline;
  const label = isOverall ? (overall === null ? "Not scored" : bandLabel(overall)) : cur!.r.label;
  const sentence = isOverall
    ? (overall === null ? (pickedCount === 0 ? "Pick at least one outcome to see an overall score." : "None of the outcomes you picked has a scorable trial base yet.") : `Average of the ${withScore.length} outcome${withScore.length === 1 ? "" : "s"} you picked${pickedCount - withScore.length > 0 ? ` · ${pickedCount - withScore.length} not scored` : ""}. Tap one to see why.`)
    : cur!.o.sentence;
  const effectNum = cur ? (cur.r.effect === "unclear" ? null : cur.r.effect) : null;
  const dimRows = cur ? DIMS.map((d) => {
    const L = cur.o.ledger; const r = cur.r;
    const fill = d.key === "effect" ? (effectNum === null ? null : Math.abs(effectNum) / 3) : d.key === "evidence" ? r.certainty / 4 : d.key === "form" ? (L.formFit === "unknown" ? null : L.formFit / 4) : (L.doseFit === "unknown" ? null : L.doseFit / 4);
    const pts = d.key === "effect" ? (effectNum === null ? "—" : `${effectNum}/3`) : d.key === "evidence" ? `${r.certainty}/4` : d.key === "form" ? (L.formFit === "unknown" ? "—" : `${L.formFit}/4`) : (L.doseFit === "unknown" ? "—" : `${L.doseFit}/4`);
    const word = d.key === "effect" ? r.effectWord : d.key === "evidence" ? r.certaintyWord : d.key === "form" ? r.formWord : r.doseWord;
    return { id: d.key, name: d.name, color: d.color, fill, pts, word, negative: d.key === "effect" && (effectNum ?? 0) < 0, detail: cur.o.detail[d.key] as Detail | null, jump: null as number | null, dim: false };
  }) : [];
  const outcomeRows = scored.map((x, i) => ({ id: `o${i}`, name: x.o.name, color: isPicked(x.o.name) ? "var(--ab-r1)" : "var(--ab-track)", fill: x.r.headline === null ? null : x.r.headline / 100, pts: x.r.headline === null ? "—" : String(x.r.headline), word: isPicked(x.o.name) ? x.r.label : "Not picked", negative: isPicked(x.o.name) && (x.r.headline ?? 50) < 45, detail: null as Detail | null, jump: i as number | null, dim: !isPicked(x.o.name) }));
  const rowsToShow = isOverall ? outcomeRows : dimRows;
  const firedGates = cur ? cur.r.firedGates : [];
  const tone = headline === null ? "muted" : headline >= 55 ? "good" : headline >= 45 ? "neutral" : "bad";
  const pick = (k: string) => { setKey(k); setTab(-1); setOpen(null); };
  const go = (i: number) => { setTab(i); setOpen(null); };

  const photo = <div className={`ab-photo-hero${layout === "overlap" ? " bleed" : ""}`} role="img" aria-label="Illustrated sample product (placeholder)"><div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(s.live ? s.title : s.product).split(" · ")[0].replace(/^Sample /, "").toLowerCase()}</strong><i>Pure. Simple. Studied.</i><div>{s.live ? "DAILY" : "SAMPLE"} <b>{(s.live ? s.title : s.product).split(" · ")[1] ?? ""}</b></div></div></div>;
  const scoreBlock = <div className={`ab-headline ${tone}${layout === "overlap" ? " float" : ""}`}><div className="ab-number"><strong>{headline ?? "—"}</strong>{headline === null && <span>no score</span>}</div><div><h2>{label}</h2><p>{sentence}</p></div></div>;
  const bars = <ul className={isOverall ? "ab-bars outcomes" : "ab-bars"}>{rowsToShow.map((d) => { const isOpen = open === d.id; const onTap = () => (d.jump !== null ? go(d.jump) : setOpen(isOpen ? null : d.id)); return <li key={d.id} className={`${isOpen ? "open" : ""}${d.dim ? " dim" : ""}`}><button type="button" aria-expanded={d.jump === null ? isOpen : undefined} aria-controls={d.jump === null ? `ab-det-${d.id}` : undefined} onClick={onTap}><span className="ab-bar-name">{d.name}</span><span className="ab-bar-word">{d.word}</span><span className="ab-bar-pts">{d.pts}</span><span className="ab-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d={d.jump !== null ? "M6 3l5 5-5 5" : "M3 6l5 5 5-5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className={`ab-bar-track${d.fill === null ? " unknown" : ""}`}>{d.fill !== null && <i style={{ width: `${Math.round(d.fill * 100)}%`, background: d.negative ? "var(--ab-warn)" : d.color }} />}</span></button>{isOpen && d.detail && <div id={`ab-det-${d.id}`} className="ab-bar-detail"><p><b>Found</b> {d.detail.found}</p><p><b>Missing</b> {d.detail.missing}</p><p><b>Would move it</b> {d.detail.move}</p></div>}</li>; })}</ul>;
  const gates = firedGates.length > 0 && <details className="ab-gates"><summary>⚑ {firedGates.length === 1 ? firedGates[0] : `${firedGates.length} limits · ${firedGates[0]}`}</summary><ul>{firedGates.map((g) => <li key={g}>{g}</li>)}</ul></details>;
  const tabs = <div className="ab-tabs" aria-label="Outcome"><button type="button" aria-pressed={isOverall} onClick={() => go(-1)}>Overall</button>{s.outcomes.map((o, i) => <button key={o.name} type="button" aria-pressed={tab === i} onClick={() => go(i)}>{o.name}</button>)}</div>;
  const header = <header className="ab-top"><button type="button" className="ab-back" aria-label="Back">‹</button><div className="ab-title"><strong>{s.product}</strong>{s.live && <small>Researched {s.live.runAt} · {s.live.sources} sources</small>}</div></header>;

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD</span><h1>Show the tub.<br />Then the <em>truth.</em></h1><p>Photo takes a third of the phone. Four placements to compare; the rows and the number are identical in all of them.</p><span className="ab-kicker">PHOTO PLACEMENT</span><div className="ab-layouts" role="tablist" aria-label="Layout">{LAYOUTS.map((l) => <button key={l.id} role="tab" aria-selected={layout === l.id} onClick={() => { setLayout(l.id); setOpen(null); }}><b>{l.name}</b><small>{l.blurb}</small></button>)}</div><span className="ab-kicker">LIVE AUDITS · REAL SOURCES</span><div className="ab-scenarios">{Object.entries(liveScenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.outcomes.length} outcomes · {v.live?.sources} sources</small></button>)}</div><span className="ab-kicker">WHAT THE USER PICKED</span><div className="ab-picks">{s.outcomes.map((o) => <label key={o.name}><input type="checkbox" checked={isPicked(o.name)} onChange={() => togglePick(o.name)} />{o.name}</label>)}</div><details className="ab-provenance"><summary>Fictional test ledgers</summary><div className="ab-scenarios">{Object.entries(scenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.product}</small></button>)}</div></details>{s.live ? <p className="ab-fine"><strong>Live audit</strong> run {s.live.runAt} by {s.live.model}. The model searched, read sources and classified effect/fit per the rubric; the number is computed by code. Model confidence: {s.live.confidence}. {s.live.doseNote} Not yet human-verified.</p> : <p className="ab-fine">Hand-written inputs to exercise the rubric; no search or model call produced this card.</p>}</aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className={`ab-screen layout-${layout}`}>
    {layout === "hero" && <>{header}{photo}{tabs}<section className="ab-card">{scoreBlock}{bars}{gates}</section></>}
    {layout === "middle" && <>{header}{tabs}{scoreBlock}{photo}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "overlap" && <>{photo}<div className="ab-overlap-wrap">{header}{scoreBlock}</div>{tabs}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "split" && <>{header}{tabs}<div className="ab-split">{photo}<div className="ab-split-score">{scoreBlock}</div></div><section className="ab-card">{bars}{gates}</section></>}
  </div></div>
  <aside className="ab-notes"><span className="ab-kicker">THE FOUR PLACEMENTS</span><h3>1 · Hero</h3><p>Photo first, big and calm. The number sits under it with the sentence. Most “product page” feeling.</p><h3>2 · Middle</h3><p>Number first, photo between the score and the rows — the founder’s “a third, in the middle”. Photo separates verdict from detail.</p><h3>3 · Overlap</h3><p>Full-bleed photo; the score tile floats over its bottom edge. Most editorial, least whitespace.</p><h3>4 · Split</h3><p>Photo left, number right, side by side. Shortest; leaves room below the rows.</p><h3>Overall first</h3><p>Landing tab. The number is the plain average of the scored outcomes; each bar is one outcome at its own score, and tapping it drills into that outcome’s four dimensions. Unscored outcomes are hatched and left out of the average — the sentence says how many.</p><h3>Shared</h3><p>No banner, no chips, no verdict label, no footer. Unknown axes stay hatched. Collapsed state fits above the fold in all four.</p></aside></main>;
}
