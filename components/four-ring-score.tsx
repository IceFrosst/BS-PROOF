import { formatPercent, formatSigned } from "@/lib/dashboard/format";
import type { ArcKey, DashboardOutcome } from "@/lib/dashboard/types";

const ARC_META: Array<{ key: ArcKey; label: string; radius: number }> = [
  { key: "effect", label: "Effect", radius: 68 },
  { key: "form", label: "Form", radius: 56 },
  { key: "dose", label: "Dose", radius: 44 },
  { key: "evidence", label: "Evidence", radius: 32 },
];

interface FourRingScoreProps {
  outcome: DashboardOutcome;
  compact?: boolean;
}

function verdictPath(radius: number, verdict: number): string {
  const clamped = Math.max(-1, Math.min(1, verdict));
  const endAngle = (-90 + clamped * 180) * (Math.PI / 180);
  const endX = 88 + radius * Math.cos(endAngle);
  const endY = 88 + radius * Math.sin(endAngle);
  return `M 88 ${88 - radius} A ${radius} ${radius} 0 0 ${clamped >= 0 ? 1 : 0} ${endX} ${endY}`;
}

export function FourRingScore({ outcome, compact = false }: FourRingScoreProps) {
  const label = outcome.displayScore === null
    ? `${outcome.label}: score unavailable`
    : `${outcome.label}: composite score ${outcome.displayScore} out of 100`;

  return (
    <figure className={compact ? "ring-score ring-score-compact" : "ring-score"} aria-label={label}>
      <div className="ring-plot">
        <svg viewBox="0 0 176 176" role="img" aria-hidden="true">
          {ARC_META.map(({ key, radius }) => {
            const coverage = Math.max(0, Math.min(1, outcome.arcs[key].coverage ?? 0));
            const verdict = outcome.arcs[key].verdict;
            return (
              <g key={key}>
                <circle className="ring-track" cx="88" cy="88" r={radius} pathLength="100" />
                <circle
                  className={`ring-coverage ring-${key}`}
                  cx="88"
                  cy="88"
                  r={radius}
                  pathLength="100"
                  strokeDasharray="1.5 3.5"
                  style={{ opacity: 0.08 + coverage * 0.42 }}
                />
                {verdict !== null && verdict !== 0 ? <path className={`ring-verdict ring-${key}`} d={verdictPath(radius, verdict)} /> : null}
                {verdict === 0 ? <circle className={`ring-zero-marker ring-${key}`} cx="88" cy={88 - radius} r="3.5" /> : null}
              </g>
            );
          })}
        </svg>
        <div className="ring-center" aria-hidden="true">
          <strong>{outcome.displayScore ?? "—"}</strong>
          <span>{outcome.displayScore === null ? "gated" : "/ 100"}</span>
        </div>
        <div className="ring-direction" aria-hidden="true"><span>−</span><span>signed verdict</span><span>+</span></div>
      </div>
      {outcome.displayScore !== null ? (
        <figcaption className="arc-readout">
          {ARC_META.map(({ key, label: arcLabel }) => {
            const arc = outcome.arcs[key];
            return (
              <div className={`arc-line arc-${key}`} data-testid={`arc-${key}`} key={key}>
                <span className="arc-label"><i aria-hidden="true" />{arcLabel}</span>
                <span>
                  {arc.isQuantity || key === "evidence" ? "quantity" : formatSigned(arc.verdict)}
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
