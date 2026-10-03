"use client";

/* Evidence method v2 result card on /scan: one letter grade per outcome
 * (docs/EVIDENCE_METHOD.md §4), re-matched to the scanned product's form and
 * daily dose by lib/analyze/grade-v2.ts. Every downgrade is shown with its
 * reason, and "I" is always "not enough evidence", never a low mark. The grade
 * is shadow until the Phase 4 benchmark passes, and the stamp says so. */

import { useState, type ReactNode } from "react";

import type { OutcomeGrade, ProductGradesV2 } from "@/lib/analyze/grade-v2";

import { words } from "./format";
import { DetailLine } from "./primitives";

const BENEFIT: Record<string, string> = {
  large: "Large benefit",
  meaningful: "Meaningful benefit",
  small: "Small benefit",
  none: "No meaningful effect",
  harm: "Evidence of harm",
  inconclusive: "Inconclusive",
  "no data": "No poolable trials",
};

const DOMAIN: Record<string, string> = {
  risk_of_bias: "Risk of bias",
  inconsistency: "Inconsistency",
  imprecision: "Imprecision",
  indirectness: "Indirectness (form / dose)",
  publication_bias: "Publication bias",
};

export function letterTone(letter: string): string {
  if (letter === "I") return "insufficient";
  const head = letter.charAt(0);
  return head === "A" ? "a" : head === "B" ? "b" : head === "C" ? "c" : head === "D" ? "d" : "f";
}

function summary(g: OutcomeGrade): string {
  if (g.letter === "I") {
    return g.benefit === "no data"
      ? "Not enough evidence: no trial reported numbers that could be pooled."
      : "Not enough evidence to say: too few, too small or too uncertain trials.";
  }
  return `${BENEFIT[g.benefit] ?? words(g.benefit)} · ${g.label.toLowerCase()} certainty`;
}

const num = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

function GradeDetail({ g }: { g: OutcomeGrade }): ReactNode {
  const downs = Object.entries(g.downgrades);
  return (
    <>
      <DetailLine term="Pooled effect">
        {g.estimate !== null && g.ci
          ? `${num(g.estimate)} SD (95% CI ${num(g.ci[0])} to ${num(g.ci[1])}) from ${g.k} trial${g.k === 1 ? "" : "s"}`
          : "No trial reported numbers that could be pooled."}
      </DetailLine>
      {g.natural ? (
        <DetailLine term="In real units">
          {`${num(g.natural.estimate)} ${g.natural.unit} (95% CI ${num(g.natural.ci[0])} to ${num(g.natural.ci[1])})`}
        </DetailLine>
      ) : null}
      {g.prediction ? (
        <DetailLine term="A new trial would likely land">{`${num(g.prediction[0])} to ${num(g.prediction[1])} SD`}</DetailLine>
      ) : null}
      <DetailLine term="Meaningful change">{`${g.threshold.toFixed(2)} SD — ${g.threshold_source}`}</DetailLine>
      <DetailLine term="Certainty">
        {downs.length
          ? `${g.label}: started High (randomised trials), lowered for ${downs.map(([d]) => (DOMAIN[d] ?? words(d)).toLowerCase()).join(", ")}.`
          : `${g.label}.`}
      </DetailLine>
      {downs.length ? (
        <ul className="gv2-reasons">
          {downs.map(([d, [p, why]]) => (
            <li key={d}>
              <b>{DOMAIN[d] ?? words(d)} −{p}</b> {why}
            </li>
          ))}
        </ul>
      ) : null}
      {g.threshold_sensitive ? (
        <DetailLine term="Sensitive to the threshold">
          {`At half the threshold this would grade ${g.letters_at.half}; at double, ${g.letters_at.double}.`}
        </DetailLine>
      ) : null}
      {g.not_assessed.length ? (
        <details className="sc-audit-exact">
          <summary>Also checked</summary>
          <ul className="gv2-reasons">{g.not_assessed.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      ) : null}
    </>
  );
}

export function GradeCard({ grades, warnings }: { grades: Extract<ProductGradesV2, { status: "graded" }>; warnings?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="ab-card scan-lab-card gv2-card" aria-label="Evidence grades">
      <p className="ab-stamp scan-lab-validity">
        <b>{grades.method_status === "live" ? "Evidence grade" : "Evidence grade · preview, not validated"}</b>{" "}
        Pooled trials graded with GRADE for {grades.form ? words(grades.form) : "an unstated form"}
        {grades.dose_mg !== null ? ` at ${Math.round(grades.dose_mg).toLocaleString()} mg a day` : ", dose not known"}.
        Run {grades.run_id}.
      </p>
      {warnings}
      <ul className="ab-bars gv2-list">
        {grades.outcomes.map((g) => {
          const isOpen = open === g.outcome;
          return (
            <li key={g.outcome} className={isOpen ? "open" : ""}>
              <button type="button" aria-expanded={isOpen} aria-controls={`gv2-${g.outcome}`} onClick={() => setOpen(isOpen ? null : g.outcome)}>
                <span className={`gv2-letter gv2-${letterTone(g.letter)}`} aria-label={`Grade ${g.letter}`}>{g.letter}</span>
                <span className="ab-bar-name">
                  {g.label}
                  <small>{summary(g)}{g.harm ? " · harm signal" : ""}</small>
                </span>
                <span className="ab-chev" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </button>
              {isOpen ? <div id={`gv2-${g.outcome}`} className="ab-bar-detail"><GradeDetail g={g} /></div> : null}
            </li>
          );
        })}
      </ul>
      <p className="ab-pop gv2-legend">
        A+ to F grade how much the product helps and how sure the evidence is; <b>I</b> means not enough evidence — not a low score.
      </p>
    </section>
  );
}
