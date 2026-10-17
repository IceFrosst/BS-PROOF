/* What the research says, for ANY product: the model's recollection of the
 * literature (stage 2b), laid out like the grade card so every scan has a
 * readable answer. It is model knowledge, so it carries no letter, no number
 * typeset as a measurement and an "unverified" flag (CLAUDE.md invariant 1);
 * the footer is the grading notice. */

import type { PriorOutcome } from "@/lib/analyze/evidence-prior";
import type { ScanAnalysis } from "@/lib/analyze/scan";

const DIRECTION: Record<PriorOutcome["direction"], { label: string; tone: string; mark: string }> = {
  benefit: { label: "Likely helps", tone: "b", mark: "↑" },
  no_effect: { label: "Probably no effect", tone: "d", mark: "–" },
  harm: { label: "Possible harm", tone: "h", mark: "!" },
  insufficient: { label: "Not enough data", tone: "i", mark: "?" },
};

const STRENGTH: Record<PriorOutcome["evidence_strength"], number> = { strong: 4, moderate: 3, limited: 2, none: 1 };

const ORDER: PriorOutcome["direction"][] = ["benefit", "harm", "no_effect", "insufficient"];

export function EvidenceSummary({ prior }: { prior: NonNullable<ScanAnalysis["evidence_prior"]> }) {
  const data = prior.data;
  if (prior.status !== "ok" || !data?.outcomes.length) return null;
  const outcomes = [...data.outcomes].sort((a, b) => ORDER.indexOf(a.direction) - ORDER.indexOf(b.direction) || STRENGTH[b.evidence_strength] - STRENGTH[a.evidence_strength]);
  return (
    <section className="gc es" aria-labelledby="es-title">
      <header className="gc-head">
        <h3 id="es-title">What the research says</h3>
        <span className="gc-flag">AI summary</span>
      </header>
      <p className="es-summary">{data.summary}</p>

      <ul className="gc-list">
        {outcomes.map((o, i) => {
          const d = DIRECTION[o.direction];
          // The same dose sentence under every row is noise: show it where it changes.
          const dose = o.dose_reading && o.dose_reading !== outcomes[i - 1]?.dose_reading ? o.dose_reading : null;
          return (
            <li key={`${o.outcome}-${i}`} className={`gc-row gc-${d.tone}`}>
              <span className="gc-letter es-mark" aria-hidden="true">{d.mark}</span>
              <div className="gc-body">
                <div className="gc-line">
                  <strong>{o.outcome.charAt(0).toUpperCase() + o.outcome.slice(1)}</strong>
                  <span className="gc-cert" aria-label={`${o.evidence_strength} evidence`}>
                    {[1, 2, 3, 4].map((n) => <i key={n} className={n <= STRENGTH[o.evidence_strength] ? "on" : ""} />)}
                    <em>{o.evidence_strength === "none" ? "No" : o.evidence_strength.charAt(0).toUpperCase() + o.evidence_strength.slice(1)} evidence</em>
                  </span>
                </div>
                <p className="es-verdict">{d.label}</p>
                {o.note ? <p className="gc-plain">{o.note}</p> : null}
                {dose ? <p className={`es-dose ${o.dose_in_range ? "is-hit" : "is-miss"}`}>{dose}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="gc-note sc-grading-notice">
        Evidence grades are not active yet. This is the model&rsquo;s summary of the literature, not trials we read and
        checked; graded results switch on once our method passes validation.
      </p>
    </section>
  );
}
