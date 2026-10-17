/* The evidence grade card: one row per outcome, and a letter never travels
 * without its certainty, trial count, effect and CI (CLAUDE.md invariant 8).
 * Each row carries a one-line forest plot: the pooled effect and its 95% CI
 * against zero. "I" is drawn neutral, never as a failing grade: not studied is
 * not failed. Used by /demo with illustrative rows; the live /scan wires it to
 * gradeProductV2() once evidence method v2 validates (docs/APP.md §4). */

import type { Certainty, DemoGrade } from "@/lib/demo/products";

function tone(letter: string): string {
  if (letter === "I") return "i";
  if (letter.startsWith("A")) return "a";
  if (letter.startsWith("B")) return "b";
  if (letter.startsWith("C")) return "c";
  return "d";
}

const DOTS: Record<Certainty, number> = { High: 4, Moderate: 3, Low: 2, "Very low": 1 };

// Forest-plot axis in SMD. ponytail: fixed range fits every demo row; derive from the rows if real data overflows it.
const MIN = -0.6;
const MAX = 1.2;
const at = (x: number) => `${(((Math.min(MAX, Math.max(MIN, x)) - MIN) / (MAX - MIN)) * 100).toFixed(1)}%`;
const fmt = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));

function Forest({ smd }: { smd: NonNullable<DemoGrade["smd"]> }) {
  const [lo, hi] = smd.ci;
  return (
    <div className="gc-forest" aria-hidden="true">
      <span className="gc-zero" style={{ left: at(0) }} />
      <span className="gc-ci" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} />
      <span className="gc-dot" style={{ left: at(smd.estimate) }} />
    </div>
  );
}

export function GradeCard({ grades, context, illustrative }: { grades: DemoGrade[]; context: string | null; illustrative: boolean }) {
  return (
    <section className="gc" aria-labelledby="gc-title">
      <header className="gc-head">
        <div>
          <h3 id="gc-title">What the evidence says</h3>
          {context ? <p className="gc-context">{context}</p> : null}
        </div>
        {illustrative ? <span className="gc-flag">Illustrative</span> : null}
      </header>

      <ul className="gc-list">
        {grades.map((g) => (
          <li key={g.outcome} className={`gc-row gc-${tone(g.letter)}`}>
            <span className="gc-letter" aria-label={`Grade ${g.letter}`}>{g.letter}</span>
            <div className="gc-body">
              <div className="gc-line">
                <strong>{g.outcome}</strong>
                <span className="gc-cert" aria-label={`${g.certainty} certainty`}>
                  {[1, 2, 3, 4].map((n) => <i key={n} className={n <= DOTS[g.certainty] ? "on" : ""} />)}
                  <em>{g.certainty}</em>
                </span>
              </div>
              <p className="gc-plain">{g.plain}</p>
              {g.smd ? <Forest smd={g.smd} /> : null}
              <p className="gc-stats">
                {g.smd ? <>Effect {fmt(g.smd.estimate)} <span>(95% CI {fmt(g.smd.ci[0])} to {fmt(g.smd.ci[1])})</span> · </> : null}
                {g.k} {g.k === 1 ? "trial" : "trials"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="gc-key">
        <div><dt className="gc-a">A</dt><dd>Strong benefit</dd></div>
        <div><dt className="gc-c">C</dt><dd>Small or unsure</dd></div>
        <div><dt className="gc-d">D</dt><dd>No benefit</dd></div>
        <div><dt className="gc-i">I</dt><dd>Not enough data</dd></div>
      </dl>
      {illustrative ? (
        <p className="gc-note">
          Demo data. Live grades are computed by code from the randomised trials we extract and check, and switch on once
          the method passes validation against published meta-analyses.
        </p>
      ) : null}
    </section>
  );
}
