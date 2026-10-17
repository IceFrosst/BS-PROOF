/* The evidence grade card: one row per outcome, and a letter never travels
 * without its certainty, trial count, effect and CI (CLAUDE.md invariant 8).
 * "I" is drawn neutral, never as a failing grade: not studied is not failed.
 * Used by /demo with illustrative rows; the live /scan wires it to
 * gradeProductV2() once evidence method v2 validates (docs/APP.md §4). */

import type { DemoGrade } from "@/lib/demo/products";

function tone(letter: string): string {
  if (letter === "I") return "none";
  if (letter.startsWith("A")) return "a";
  if (letter.startsWith("B")) return "b";
  if (letter.startsWith("C")) return "c";
  return "d";
}

const fmt = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));

export function GradeCard({ grades, context, illustrative }: { grades: DemoGrade[]; context: string | null; illustrative: boolean }) {
  return (
    <section className="gc" aria-labelledby="gc-title">
      <header className="gc-head">
        <div>
          <h3 id="gc-title">Evidence grades</h3>
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
                <span className="gc-cert">{g.certainty} certainty</span>
              </div>
              <p className="gc-plain">{g.plain}</p>
              <p className="gc-stats">
                {g.k} {g.k === 1 ? "trial" : "trials"}
                {g.smd ? ` · effect ${fmt(g.smd.estimate)} SMD (95% CI ${fmt(g.smd.ci[0])} to ${fmt(g.smd.ci[1])})` : " · nothing to pool"}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="gc-key">
        <b>A</b> large, well-proven benefit · <b>C</b> small or uncertain · <b>D/F</b> no benefit or harm · <b>I</b> not enough
        evidence (not a bad grade)
      </p>
      {illustrative ? (
        <p className="gc-note">
          Demo: these grades illustrate the output. Live grades are computed by code from randomised trials we extract
          and check, and switch on once our method passes validation against published meta-analyses.
        </p>
      ) : null}
    </section>
  );
}
