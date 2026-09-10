"use client";

import { useState } from "react";
import { score, type Ledger } from "./ledger";
import "./ab.css";

type Variant = "A" | "B";

/* HYPOTHETICAL ledgers. Numbers are illustrative inputs to show the rubric working — not audits of any real product. */
const scenarios: Record<string, { title: string; product: string; outcome: string; sentence: string; strongest: string; doubt: string; ledger: Ledger }> = {
  solid: {
    title: "Well-studied, good fit",
    product: "Creatine monohydrate · 3 g/day",
    outcome: "Muscle strength",
    sentence: "Trials on this exact form, near this dose, mostly agree on a moderate benefit in adults who train.",
    strongest: "Meta-analysis of resistance-training RCTs (hypothetical ledger entry)",
    doubt: "Some trials are short and small; effect varies by training status.",
    ledger: { effectPoints: 2, bodyIsRct: true, checklist: { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" }, gates: { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: 4, doseFit: 3 },
  },
  untested: {
    title: "Good evidence, wrong form",
    product: "Creatine HCl · 1.5 g/day",
    outcome: "Muscle strength",
    sentence: "The benefit evidence is for monohydrate. This form and this lower dose have not been tested on strength.",
    strongest: "Same monohydrate meta-analysis (hypothetical)",
    doubt: "No trial used this preparation; equivalence is assumed by marketing, not shown.",
    ledger: { effectPoints: 2, bodyIsRct: true, checklist: { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" }, gates: { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: 1 },
  },
  thin: {
    title: "One small trial",
    product: "Tongkat ali extract · 400 mg/day",
    outcome: "Testosterone (blood level)",
    sentence: "One small industry-funded trial reported higher levels; a blood marker is not the outcome most buyers want.",
    strongest: "A single 4-week RCT, n≈60 (hypothetical)",
    doubt: "One lab, one funder, and no trial on energy, libido or strength itself.",
    ledger: { effectPoints: 1, bodyIsRct: true, checklist: { risk_of_bias: "concern", consistency: "unknown", precision: "concern", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 1, largestRctN: 60, longestRctWeeks: 4, chronicOutcome: true, surrogate: true, allPositiveIndustryOrOneLab: true }, formFit: 2, doseFit: 4 },
  },
  none: {
    title: "Nothing to score",
    product: "Proprietary “Focus blend” · 2 capsules",
    outcome: "Cognitive function",
    sentence: "No human controlled trial tested this formula. That is missing evidence, not proof it fails.",
    strongest: "None found for the full formula.",
    doubt: "Ingredient-level trials exist at very different doses.",
    ledger: { effectPoints: "unclear", bodyIsRct: false, checklist: { risk_of_bias: "unknown", consistency: "unknown", precision: "unknown", directness: "concern", publication_bias: "unknown" }, gates: { rctCount: 0, largestRctN: 0, longestRctWeeks: 0, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false }, formFit: "unknown", doseFit: "unknown" },
  },
};

function Rings({ effect, certainty, form, dose, headline, label }: { effect: number | null; certainty: number; form: number | null; dose: number | null; headline: number | null; label: string }) {
  const radii = [82, 68, 54, 40];
  const fills = [effect === null ? 0 : Math.abs(effect) / 3, form === null ? 0 : form / 4, dose === null ? 0 : dose / 4, certainty / 4];
  const colors = ["var(--ab-r1)", "var(--ab-r2)", "var(--ab-r3)", "var(--ab-r4)"];
  return <div className="ab-rings" role="img" aria-label={headline === null ? "No score" : `Score ${headline} of 100, ${label}`}><svg viewBox="0 0 190 190" aria-hidden="true">{radii.map((r, i) => <g key={r}><circle cx="95" cy="95" r={r} fill="none" stroke="var(--ab-track)" strokeWidth="9" strokeDasharray={i < 3 && fills[i] === 0 ? "3 5" : undefined} />{fills[i] > 0 && <circle cx="95" cy="95" r={r} fill="none" stroke={i === 0 && (effect ?? 0) < 0 ? "var(--ab-warn)" : colors[i]} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * r * fills[i]} ${2 * Math.PI * r}`} transform="rotate(-90 95 95)" />}</g>)}</svg><div><strong>{headline ?? "—"}</strong><span>{headline === null ? "no score" : "/ 100"}</span></div></div>;
}

export default function AbPrototype() {
  const [variant, setVariant] = useState<Variant>("A");
  const [key, setKey] = useState("solid");
  const [showMath, setShowMath] = useState(false);
  const s = scenarios[key];
  const r = score(s.ledger);
  const effectNum = r.effect === "unclear" ? null : r.effect;
  const dims = [
    { name: "Effect", word: r.effectWord, pts: effectNum === null ? "—" : `${effectNum > 0 ? "+" : ""}${effectNum} / 3`, color: "var(--ab-r1)", note: "what trials found" },
    { name: "Evidence", word: r.certaintyWord, pts: `${r.certainty} / 4`, color: "var(--ab-r4)", note: "how sure we can be" },
    { name: "Form", word: r.formWord, pts: s.ledger.formFit === "unknown" ? "—" : `${s.ledger.formFit} / 4`, color: "var(--ab-r2)", note: "your preparation" },
    { name: "Dose", word: r.doseWord, pts: s.ledger.doseFit === "unknown" ? "—" : `${s.ledger.doseFit} / 4`, color: "var(--ab-r3)", note: "your daily amount" },
  ];

  return <main id="main-content" className="ab-stage"><aside className="ab-side"><a href="/design-lab/mobile">← Field Notebook</a><span className="ab-kicker">RESULT CARD · A/B</span><h1>Same ledger.<br />Two ways to <em>say it.</em></h1><p>Both variants read the same structured audit. Only the presentation differs. Everything must fit above the fold on a 390 × 844 phone.</p><div className="ab-switch" role="tablist" aria-label="Variant"><button role="tab" aria-selected={variant === "A"} onClick={() => setVariant("A")}><b>A</b> Words</button><button role="tab" aria-selected={variant === "B"} onClick={() => setVariant("B")}><b>B</b> Score</button></div><span className="ab-kicker">SAMPLE LEDGERS · HYPOTHETICAL</span><div className="ab-scenarios">{Object.entries(scenarios).map(([k, v]) => <button key={k} aria-pressed={key === k} onClick={() => setKey(k)}>{v.title}<small>{v.product}</small></button>)}</div><p className="ab-fine">Ledger values are made-up inputs to exercise the rubric. No real study was audited. Rubric: <code>docs/design/2026-09-10-evidence-ledger-rubric.md</code> (proposed).</p></aside>
  <div className="ab-phone"><div className="ab-status"><b>9:41</b><i /><span>▮▮▮ ▰</span></div><div className="ab-screen"><header className="ab-top"><button aria-label="Back">‹</button><div><strong>{s.product}</strong><small>Sample audit · {variant === "A" ? "words" : "score"} variant</small></div><button aria-label="Edit product">✎</button></header>
  <div className="ab-tabs" aria-label="Outcome">{[s.outcome, "Muscle growth", "Endurance"].map((t, i) => <button key={t} aria-pressed={i === 0}>{t}</button>)}</div>
  <section className="ab-card" aria-live="polite">
    {variant === "A" ? <>
      <div className={`ab-verdict ${r.headline === null ? "muted" : r.headline >= 55 ? "good" : r.headline >= 45 ? "neutral" : "bad"}`}><span className="ab-kicker">VERDICT</span><h2>{r.label}</h2><p>{s.sentence}</p></div>
      <ul className="ab-dims">{dims.map((d) => <li key={d.name}><i style={{ background: d.color }} /><div><span>{d.name}</span><strong>{d.word}</strong></div><small>{d.note}</small></li>)}</ul>
    </> : <>
      <div className="ab-score-row"><Rings effect={effectNum} certainty={r.certainty} form={s.ledger.formFit === "unknown" ? null : s.ledger.formFit} dose={s.ledger.doseFit === "unknown" ? null : s.ledger.doseFit} headline={r.headline} label={r.label} /><div className="ab-score-text"><span className="ab-kicker">VERDICT</span><h2>{r.label}</h2><p>{s.sentence}</p></div></div>
      <ul className="ab-dims compact">{dims.map((d) => <li key={d.name}><i style={{ background: d.color }} /><span>{d.name}</span><strong>{d.pts}</strong><small>{d.word}</small></li>)}</ul>
      <button className="ab-math-toggle" onClick={() => setShowMath((m) => !m)} aria-expanded={showMath}>{showMath ? "Hide" : "How is this computed?"}</button>
      {showMath && <pre className="ab-math">{r.headline === null ? `no headline: ${r.firedGates[0] ?? "effect unclear"}` : `signal = (${effectNum}/3) × (${r.certainty}/4) = ${(((effectNum ?? 0) / 3) * (r.certainty / 4)).toFixed(2)}\napplicability = ${r.applicability.toFixed(3)}\nheadline = 50 + 50 × signal${((effectNum ?? 0) / 3) * (r.certainty / 4) > 0 ? " × applicability" : ""} = ${r.headline}`}</pre>}
    </>}
    {r.firedGates.length > 0 && <details className="ab-gates"><summary>⚑ {r.firedGates.length === 1 ? r.firedGates[0] : `${r.firedGates.length} limits applied · ${r.firedGates[0]}`}</summary><ul>{r.firedGates.map((g) => <li key={g}>{g}</li>)}</ul></details>}
    <div className="ab-foot"><button className="ab-safety">! Safety notes</button><button className="ab-details">Full report · 11 questions ›</button></div>
  </section>
  <p className="ab-disclaimer">AI research audit · sources listed in report · not medical advice</p>
  <nav className="ab-nav" aria-label="Main">{["Explore", "My notes", "Learn", "Safety"].map((n, i) => <button key={n} aria-current={i === 0 ? "page" : undefined}>{n}</button>)}</nav></div></div>
  <aside className="ab-notes"><span className="ab-kicker">WHAT TO JUDGE</span><h3>Above the fold?</h3><p>Verdict, four dimensions, safety and the report entry point all render inside the first screen in both variants — no scroll needed.</p><h3>A · Words</h3><p>Plain-language read per dimension. No number to misread as precision. Risk: feels less “scored”.</p><h3>B · Score</h3><p>Rings + points per dimension + a headline that code computes from the ledger. Tap “How is this computed?” to see the arithmetic. Risk: a number invites over-trust, so gates and the unknown-axis hatching stay visible.</p><h3>Shared rule</h3><p>No RCT → no score. Unknown form/dose is hatched, never zero. Safety is its own block.</p></aside></main>;
}
