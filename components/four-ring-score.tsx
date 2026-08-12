import { formatPercent, formatSigned } from "@/lib/dashboard/format";
import type { ArcKey, DashboardOutcome } from "@/lib/dashboard/types";

const ARC_META: Array<{ key: ArcKey; label: string; radius: number }> = [
  { key: "effect", label: "Effect", radius: 70 },
  { key: "form", label: "Form", radius: 57 },
  { key: "dose", label: "Dose", radius: 44 },
  { key: "evidence", label: "Evidence", radius: 31 },
];

interface FourRingScoreProps {
  outcome: DashboardOutcome;
  compact?: boolean;
}

/*
 * VISUAL LANGUAGE (redesigned 2026-08-12, dataviz pass):
 *
 *   ring position   which axis (outer→inner: effect, form, dose, evidence) —
 *                   identity is carried by POSITION and the readout order, so
 *                   hue is free to mean something
 *   verdict arc     the POLARITY message, teal (+) / coral (−) — a diverging
 *                   pair, because "is this evidence for or against" is the one
 *                   thing a reviewer reads first. Sweep = |verdict| × 180°,
 *                   clockwise for +, counter-clockwise for −, from 12 o'clock.
 *   coverage arc    a recessive neutral arc, sweep = coverage × 360° — how much
 *                   of the evidence this axis could judge at all
 *   evidence ring   pure quantity (no direction exists): its coverage renders
 *                   as the gold arc, fill-is-the-value
 *
 * The previous design coloured rings by axis identity (effect=coral), which
 * made a strongly POSITIVE effect ring render in the colour every other chart
 * on the site uses for "against" — identity wearing a status colour.
 */

function arcSweep(radius: number, startDeg: number, sweepDeg: number, clockwise: boolean): string {
  const sweep = Math.min(Math.abs(sweepDeg), 359.9);
  const start = (startDeg * Math.PI) / 180;
  const end = ((startDeg + (clockwise ? sweep : -sweep)) * Math.PI) / 180;
  const x0 = 88 + radius * Math.cos(start);
  const y0 = 88 + radius * Math.sin(start);
  const x1 = 88 + radius * Math.cos(end);
  const y1 = 88 + radius * Math.sin(end);
  const large = sweep > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} ${clockwise ? 1 : 0} ${x1} ${y1}`;
}

export function FourRingScore({ outcome, compact = false }: FourRingScoreProps) {
  const label = outcome.displayScore === null
    ? `${outcome.label}: score unavailable`
    : `${outcome.label}: composite score ${outcome.displayScore} out of 100`;
  const signed = outcome.signedScore;

  return (
    <figure className={compact ? "ring-score ring-score-compact" : "ring-score"} aria-label={label}>
      <div className="ring-plot">
        <svg viewBox="0 0 176 176" role="img" aria-hidden="true">
          {ARC_META.map(({ key, radius }) => {
            const coverage = Math.max(0, Math.min(1, outcome.arcs[key].coverage ?? 0));
            const verdict = outcome.arcs[key].verdict;
            const isQuantity = outcome.arcs[key].isQuantity || key === "evidence";
            return (
              <g key={key}>
                <circle className="ring-track" cx="88" cy="88" r={radius} />
                {coverage > 0 ? (
                  <path
                    className={isQuantity ? "ring-quantity" : "ring-coverage"}
                    d={arcSweep(radius, -90, coverage * 360, true)}
                  />
                ) : null}
                {!isQuantity && verdict !== null && verdict !== 0 ? (
                  <path
                    className={verdict > 0 ? "ring-verdict ring-positive" : "ring-verdict ring-negative"}
                    d={arcSweep(radius, -90, Math.abs(verdict) * 180, verdict > 0)}
                  />
                ) : null}
                {!isQuantity && verdict === 0 ? (
                  <circle className="ring-zero-marker" cx="88" cy={88 - radius} r="3.5" />
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="ring-center" aria-hidden="true">
          <strong>{outcome.displayScore ?? "—"}</strong>
          <span>{outcome.displayScore === null ? "gated" : "/ 100"}</span>
          {outcome.displayScore !== null && signed !== null ? (
            <em className={signed > 0 ? "ring-signed signed-positive" : signed < 0 ? "ring-signed signed-negative" : "ring-signed"}>
              {signed > 0 ? `+${signed}` : signed} signed
            </em>
          ) : null}
        </div>
        <div className="ring-direction" aria-hidden="true"><span>−</span><span>signed verdict</span><span>+</span></div>
      </div>
      {outcome.displayScore !== null ? (
        <figcaption className="arc-readout">
          {ARC_META.map(({ key, label: arcLabel }, index) => {
            const arc = outcome.arcs[key];
            const isQuantity = arc.isQuantity || key === "evidence";
            const verdict = arc.verdict;
            const signClass = isQuantity || verdict === null
              ? ""
              : verdict > 0 ? " value-positive" : verdict < 0 ? " value-negative" : "";
            return (
              <div className={`arc-line arc-${key}`} data-testid={`arc-${key}`} key={key}>
                <span className="arc-label">
                  <i className="arc-ring-index" aria-hidden="true">{index + 1}</i>
                  {arcLabel}
                </span>
                <span className={`arc-value${signClass}`}>
                  {isQuantity ? "quantity" : formatSigned(verdict)}
                  <small>{formatPercent(arc.coverage)}</small>
                </span>
              </div>
            );
          })}
        </figcaption>
      ) : (
        <figcaption className="gated-caption">No composite or arc interpretation is shown because the evidence gate fired.</figcaption>
      )}
    </figure>
  );
}
