"use client";

import { useState } from "react";
import { score, type Ledger } from "./ledger";
import "./ab.css";

type DimKey = "effect" | "evidence" | "form" | "dose";
interface Detail { found: string; missing: string; move: string }

/* HYPOTHETICAL ledgers. Fictional products; hand-written inputs to exercise the rubric. No search or study lookup was performed. */
const scenarios: Record<string, { title: string; product: string; outcome: string; sentence: string; ledger: Ledger; detail: Record<DimKey, Detail> }> = {
  solid: {
    title: "Well-studied, good fit", product: "Sample powder A · 3 g/day", outcome: "Muscle strength",
    sentence: "Trials on this exact form, near this dose, mostly agree on a moderate benefit in adults who train.",
    ledger: { effectPoints: 2, bodyIsRct: true, checklist: { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" }, gates: { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 4, doseFit: 3 },
    detail: {
      effect: { found: "Pooled estimate in the moderate range; interval clear of the ‘meaningful’ threshold.", missing: "Effect varies by training status — larger in trained adults.", move: "A large trial in untrained adults reporting the same size." },
      evidence: { found: "24 controlled trials; low bias; precise pooled estimate; outcome is the real thing, not a marker.", missing: "Consistency: trials disagree on size (−1). Publication bias not assessable.", move: "A preregistered replication with a published protocol." },
      form: { found: "The tested preparation is the one on this label.", missing: "Nothing — exact match.", move: "—" },
      dose: { found: "3 g/day sits just under the 3–5 g range where benefit was shown.", missing: "Most trials used 5 g/day; 3 g is at the edge.", move: "A trial comparing 3 g and 5 g directly." },
    },
  },
  untested: {
    title: "Good evidence, wrong form", product: "Sample capsule B · 1.5 g/day", outcome: "Muscle strength",
    sentence: "The benefit evidence is for a different preparation. This form and this lower dose have not been tested on strength.",
    ledger: { effectPoints: 2, bodyIsRct: true, checklist: { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" }, gates: { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: 1 },
    detail: {
      effect: { found: "Moderate benefit — but measured on another preparation.", missing: "No trial of this form on this outcome.", move: "Any controlled trial using this exact preparation." },
      evidence: { found: "Strong body of trials for the ingredient in general.", missing: "None of it is about this product’s form.", move: "—" },
      form: { found: "Nothing. This preparation was never tested for strength.", missing: "Equivalence to the tested form is a marketing claim, not a finding.", move: "A head-to-head trial of the two forms." },
      dose: { found: "1.5 g/day is about half the lowest effective dose tested.", missing: "No trial at this dose.", move: "A dose-ranging trial that includes 1.5 g." },
    },
  },
  thin: {
    title: "One small trial", product: "Sample extract C · 400 mg/day", outcome: "Testosterone (blood level)",
    sentence: "One small maker-funded trial saw higher levels. A blood marker is not what most buyers want.",
    ledger: { effectPoints: 1, bodyIsRct: true, checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "concern", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 1, largestRctN: 60, longestRctWeeks: 4, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: true }, formFit: 2, doseFit: 4 },
    detail: {
      effect: { found: "A small rise in a blood marker over 4 weeks.", missing: "No trial on energy, libido or strength itself.", move: "A trial measuring what people actually buy it for." },
      evidence: { found: "One RCT, n≈60, funded by the maker.", missing: "Only one trial (cap 1). Small and short. Surrogate outcome. Single funder.", move: "An independent replication of any size." },
      form: { found: "Same plant, different standardization than the trial.", missing: "Extract ratio on the label does not match the tested one.", move: "A trial using this standardization." },
      dose: { found: "400 mg/day matches the trial dose.", missing: "Nothing — but matching a dose from one trial proves little.", move: "—" },
    },
  },
  none: {
    title: "Nothing to score", product: "Sample blend D · 2 capsules", outcome: "Cognitive function",
    sentence: "No human trial tested this formula. Missing evidence is not proof it fails.",
    ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" },
    detail: {
      effect: { found: "Nothing on the full formula.", missing: "Ingredient-level trials exist at very different doses.", move: "Any controlled trial of this blend." },
      evidence: { found: "No controlled human trial.", missing: "Everything.", move: "One RCT would unlock a score." },
      form: { found: "—", missing: "Proprietary blend; amounts per ingredient not printed.", move: "A label that states each amount." },
      dose: { found: "—", missing: "Cannot compare without per-ingredient amounts.", move: "—" },
    },
  },
};

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
  const [key, setKey] = useState("solid");
  const [open, setOpen] = useState<DimKey | null>(null);
  const s = scenarios[key];
  const r = score(s.ledger);
  const effectNum = r.effect === "unclear" ? null : r.effect;
  const rows = DIMS.map((d) => {
    const fill = d.key === "effect" ? (effectNum === null ? null : Math.abs(effectNum) / 3)
      : d.key === "evidence" ? r.certainty / 4
      : d.key === "form" ? (s.ledger.formFit === "unknown" ? null : s.ledger.formFit / 4)
      : (s.ledger.doseFit === "unknown" ? null : s.ledger.doseFit / 4);
    const pts = d.key === "effect" ? (effectNum === null ? "—" : `${effectNum}/3`)
      : d.key === "evidence" ? `${r.certainty}/4`
      : d.key === "form" ? (s.ledger.formFit === "unknown" ? "—" : `${s.ledger.formFit}/4`)
      : (s.ledger.doseFit === "unknown" ? "—" : `${s.ledger.doseFit}/4`);
    const word = d.key === "effect" ? r.effectWord : d.key === "evidence" ? r.certaintyWord : d.key === "form" ? r.formWord : r.doseWord;
    return { ...d, fill, pts, word, negative: d.key === "effect" && (effectNum ?? 0) < 0, detail: s.detail[d.key] };
  });
  const tone = r.headline === null ? "muted" : r.headline >= 55 ? "good" : r.headline >= 45 ? "neutral" : "bad";
  const pick = (k: string) => { setKey(k); setOpen(null); };

  const photo = <div className={`ab-photo-hero${layout === "overlap" ? " bleed" : ""}`} role="img" aria-label="Illustrated sample product (placeholder)"><div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{s.product.split(" · ")[0].toLowerCase()}</strong><i>Pure. Simple. Studied.</i><div>SAMPLE <b>{s.product.split(" · ")[1] ?? ""}</b></div></div></div>;
  const scoreBlock = <div className={`ab-headline ${tone}${layout === "overlap" ? " float" : ""}`}><div className="ab-number"><strong>{r.headline ?? "—"}</strong>{r.headline === null && <span>no score</span>}</div><div><h2>{r.label}</h2><p>{s.sentence}</p></div></div>;
  const bars = <ul className="ab-bars">{rows.map((d) => { const isOpen = open === d.key; return <li key={d.key} className={isOpen ? "open" : ""}><button type="button" aria-expanded={isOpen} aria-controls={`ab-det-${d.key}`} onClick={() => setOpen(isOpen ? null : d.key)}><span className="ab-bar-name">{d.name}</span><span className="ab-bar-word">{d.word}</span><span className="ab-bar-pts">{d.pts}</span><span className="ab-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className={`ab-bar-track${d.fill === null ? " unknown" : ""}`}>{d.fill !== null && <i style={{ width: `${Math.round(d.fill * 100)}%`, background: d.negative ? "var(--ab-warn)" : d.color }} />}</span></button>{isOpen && <div id={`ab-det-${d.key}`} className="ab-bar-detail"><p><b>Found</b> {d.detail.found}</p><p><b>Missing</b> {d.detail.missing}</p><p><b>Would move it</b> {d.detail.move}</p></div>}</li>; })}</ul>;
  const gates = r.firedGates.length > 0 && <details className="ab-gates"><summary>⚑ {r.firedGates.length === 1 ? r.firedGates[0] : `${r.firedGates.length} limits · ${r.firedGates[0]}`}</summary><ul>{r.firedGates.map((g) => <li key={g}>{g}</li>)}</ul></details>;
  const tabs = <div className="ab-tabs" aria-label="Outcome">{[s.outcome, "Muscle growth", "Endurance"].map((t, i) => <button key={t} aria-pressed={i === 0}>{t}</button>)}</div>;
  const header = <header className="ab-top"><button type="button" className="ab-back" aria-label="Back">‹</button><strong>{s.product}</strong></header>;

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD</span><h1>Show the tub.<br />Then the <em>truth.</em></h1><p>Photo takes a third of the phone. Four placements to compare; the rows and the number are identical in all of them.</p><span className="ab-kicker">PHOTO PLACEMENT</span><div className="ab-layouts" role="tablist" aria-label="Layout">{LAYOUTS.map((l) => <button key={l.id} role="tab" aria-selected={layout === l.id} onClick={() => { setLayout(l.id); setOpen(null); }}><b>{l.name}</b><small>{l.blurb}</small></button>)}</div><span className="ab-kicker">SAMPLE LEDGERS · FICTIONAL PRODUCTS</span><div className="ab-scenarios">{Object.entries(scenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.product}</small></button>)}</div><p className="ab-fine">Hand-written inputs to exercise the rubric; no search or model call produced these cards. The jar is an illustration standing in for the fetched product photo.</p></aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className={`ab-screen layout-${layout}`}>
    {layout === "hero" && <>{header}{photo}{tabs}<section className="ab-card">{scoreBlock}{bars}{gates}</section></>}
    {layout === "middle" && <>{header}{tabs}{scoreBlock}{photo}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "overlap" && <>{photo}<div className="ab-overlap-wrap">{header}{scoreBlock}</div>{tabs}<section className="ab-card">{bars}{gates}</section></>}
    {layout === "split" && <>{header}{tabs}<div className="ab-split">{photo}<div className="ab-split-score">{scoreBlock}</div></div><section className="ab-card">{bars}{gates}</section></>}
  </div></div>
  <aside className="ab-notes"><span className="ab-kicker">THE FOUR PLACEMENTS</span><h3>1 · Hero</h3><p>Photo first, big and calm. The number sits under it with the sentence. Most “product page” feeling.</p><h3>2 · Middle</h3><p>Number first, photo between the score and the rows — the founder’s “a third, in the middle”. Photo separates verdict from detail.</p><h3>3 · Overlap</h3><p>Full-bleed photo; the score tile floats over its bottom edge. Most editorial, least whitespace.</p><h3>4 · Split</h3><p>Photo left, number right, side by side. Shortest; leaves room below the rows.</p><h3>Shared</h3><p>No banner, no chips, no verdict label, no footer. Unknown axes stay hatched. Collapsed state fits above the fold in all four.</p></aside></main>;
}
