"use client";

import { useState } from "react";
import { score, type Ledger } from "./ledger";
import "./ab.css";

type Variant = "A" | "B";
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

export default function AbPrototype() {
  const [variant, setVariant] = useState<Variant>("B");
  const [key, setKey] = useState("solid");
  const [open, setOpen] = useState<DimKey | null>(null);
  const [showMath, setShowMath] = useState(false);
  const s = scenarios[key];
  const r = score(s.ledger);
  const effectNum = r.effect === "unclear" ? null : r.effect;
  const rows = DIMS.map((d) => {
    const fill = d.key === "effect" ? (effectNum === null ? null : Math.abs(effectNum) / 3)
      : d.key === "evidence" ? r.certainty / 4
      : d.key === "form" ? (s.ledger.formFit === "unknown" ? null : s.ledger.formFit / 4)
      : (s.ledger.doseFit === "unknown" ? null : s.ledger.doseFit / 4);
    const pts = d.key === "effect" ? (effectNum === null ? "—" : `${effectNum > 0 ? "+" : ""}${effectNum}/3`)
      : d.key === "evidence" ? `${r.certainty}/4`
      : d.key === "form" ? (s.ledger.formFit === "unknown" ? "—" : `${s.ledger.formFit}/4`)
      : (s.ledger.doseFit === "unknown" ? "—" : `${s.ledger.doseFit}/4`);
    const word = d.key === "effect" ? r.effectWord : d.key === "evidence" ? r.certaintyWord : d.key === "form" ? r.formWord : r.doseWord;
    return { ...d, fill, pts, word, negative: d.key === "effect" && (effectNum ?? 0) < 0, detail: s.detail[d.key] };
  });
  const tone = r.headline === null ? "muted" : r.headline >= 55 ? "good" : r.headline >= 45 ? "neutral" : "bad";
  const pick = (k: string) => { setKey(k); setOpen(null); setShowMath(false); };

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD · A/B</span><h1>Same ledger.<br />Two ways to <em>say it.</em></h1><p>Both variants read the same structured audit. Only the presentation differs. Everything must fit above the fold on a 390 × 844 phone.</p><div className="ab-switch" role="tablist" aria-label="Variant"><button role="tab" aria-selected={variant === "A"} onClick={() => setVariant("A")}><b>A</b> Words</button><button role="tab" aria-selected={variant === "B"} onClick={() => setVariant("B")}><b>B</b> Score + bars</button></div><span className="ab-kicker">SAMPLE LEDGERS · FICTIONAL PRODUCTS</span><div className="ab-scenarios">{Object.entries(scenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => pick(k)}>{v.title}<small>{v.product}</small></button>)}</div><p className="ab-fine">Every value is a hand-written input to exercise the rubric. <strong>No search, no study lookup, no model call</strong> produced these cards. Rubric: <code>docs/design/2026-09-10-evidence-ledger-rubric.md</code> (proposed).</p></aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className="ab-screen"><div className="ab-demo-banner">Illustrative inputs — no research performed</div><header className="ab-top"><button aria-label="Back">‹</button><div><strong>{s.product}</strong><small>{variant === "A" ? "words" : "score + bars"} variant</small></div><button aria-label="Edit product">✎</button></header>
  <div className="ab-tabs" aria-label="Outcome">{[s.outcome, "Muscle growth", "Endurance"].map((t, i) => <button key={t} aria-pressed={i === 0}>{t}</button>)}</div>
  <section className="ab-card" aria-live="polite">
    {variant === "A" ? <>
      <div className={`ab-headline ${tone}`}><div><span className="ab-kicker">VERDICT</span><h2>{r.label}</h2><p>{s.sentence}</p></div></div>
      <ul className="ab-dims">{rows.map((d) => <li key={d.key}><i style={{ background: d.color }} /><div><span>{d.name}</span><strong>{d.word}</strong></div></li>)}</ul>
    </> : <>
      <div className={`ab-headline ${tone}`}><div className="ab-number"><strong>{r.headline ?? "—"}</strong><span>{r.headline === null ? "no score" : "/ 100"}</span></div><div><span className="ab-kicker">VERDICT</span><h2>{r.label}</h2><p>{s.sentence}</p></div></div>
      <ul className="ab-bars">{rows.map((d) => { const isOpen = open === d.key; return <li key={d.key} className={isOpen ? "open" : ""}><button aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.key)}><span className="ab-bar-name">{d.name}</span><span className="ab-bar-word">{d.word}</span><span className="ab-bar-pts">{d.pts}</span><span className={`ab-bar-track${d.fill === null ? " unknown" : ""}`}>{d.fill !== null && <i style={{ width: `${Math.round(d.fill * 100)}%`, background: d.negative ? "var(--ab-warn)" : d.color }} />}</span><span className="ab-chev" aria-hidden="true">{isOpen ? "–" : "+"}</span></button>{isOpen && <div className="ab-bar-detail"><p><b>Found</b> {d.detail.found}</p><p><b>Missing</b> {d.detail.missing}</p><p><b>Would move it</b> {d.detail.move}</p></div>}</li>; })}</ul>
      <div className="ab-meta-row">{r.firedGates.length > 0 ? <details className="ab-gates"><summary>⚑ {r.firedGates.length === 1 ? r.firedGates[0] : `${r.firedGates.length} limits · ${r.firedGates[0]}`}</summary><ul>{r.firedGates.map((g) => <li key={g}>{g}</li>)}</ul></details> : <span />}<button className="ab-math-toggle" onClick={() => setShowMath((m) => !m)} aria-expanded={showMath}>{showMath ? "Hide maths" : "How computed?"}</button></div>
      {showMath && <pre className="ab-math">{r.headline === null ? `no headline: ${r.firedGates[0] ?? "effect unclear"}` : `signal = (${effectNum}/3) × (${r.certainty}/4) = ${(((effectNum ?? 0) / 3) * (r.certainty / 4)).toFixed(2)}\napplicability = mean(form, dose) = ${r.applicability.toFixed(3)}\nheadline = 50 + 50 × signal${((effectNum ?? 0) / 3) * (r.certainty / 4) > 0 ? " × applicability" : ""} = ${r.headline}`}</pre>}
    </>}
  </section>
  <div className="ab-foot"><button className="ab-safety">! Safety</button><button className="ab-details">Full report ›</button></div>
  <p className="ab-disclaimer">AI research audit · sources in report · not medical advice</p>
  <nav className="ab-nav" aria-label="Main">{["Explore", "My notes", "Learn", "Safety"].map((n, i) => <button key={n} aria-current={i === 0 ? "page" : undefined}>{n}</button>)}</nav></div></div>
  <aside className="ab-notes"><span className="ab-kicker">WHAT TO JUDGE</span><h3>B · Score + bars</h3><p>Big number and verdict on top. Each dimension is one row: name, word, points, a horizontal bar. Tap a row to see what was found, what is missing and what would move it. Rings removed.</p><h3>Unknown ≠ zero</h3><p>An untested form or unknown dose shows a hatched empty track and “—”, never 0/4.</p><h3>Above the fold</h3><p>Collapsed state fits inside the first screen for all four scenarios. Opening a row may push the footer; that is on demand.</p></aside></main>;
}
