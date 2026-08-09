import Link from "next/link";

import { formatSigned } from "@/lib/dashboard/format";
import type { DashboardOutcome } from "@/lib/dashboard/types";

interface ScatterProps {
  outcomes: DashboardOutcome[];
  runId: string;
}

export function EffectConfidenceScatter({ outcomes, runId }: ScatterProps) {
  const points = outcomes.filter((outcome) => outcome.displayScore !== null && outcome.components.d !== null && outcome.components.c !== null);
  if (!points.length) return <p className="empty-state">Effect and confidence coordinates are unavailable for this run.</p>;

  const maxMass = Math.max(1, ...points.map((outcome) => outcome.components.evidenceMass ?? 0));
  const x = (value: number) => 66 + ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 638;
  const y = (value: number) => 318 - Math.max(0, Math.min(1, value)) * 264;
  const radius = (value: number | null) => 5 + Math.sqrt(Math.max(0, value ?? 0) / maxMass) * 10;

  return (
    <figure className="scatter-card">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">Outcome map</p>
          <h3>Effect × confidence</h3>
        </div>
        <p>Circle area reflects evidence mass. Select a point to inspect it.</p>
      </div>
      <svg className="scatter" viewBox="0 0 760 370" role="img" aria-labelledby="scatter-title scatter-desc">
        <title id="scatter-title">Effect direction versus confidence by scored outcome</title>
        <desc id="scatter-desc">Horizontal position is effect direction from minus one to plus one. Vertical position is confidence from zero to one. Circle size reflects evidence mass.</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line className="grid-line" x1="66" x2="704" y1={y(tick)} y2={y(tick)} />
            <text className="axis-tick" x="54" y={y(tick) + 4} textAnchor="end">{tick.toFixed(2)}</text>
          </g>
        ))}
        {[-1, -0.5, 0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line className={tick === 0 ? "zero-line" : "grid-line"} x1={x(tick)} x2={x(tick)} y1="54" y2="318" />
            <text className="axis-tick" x={x(tick)} y="340" textAnchor="middle">{formatSigned(tick, 1)}</text>
          </g>
        ))}
        <text className="axis-label" x="385" y="366" textAnchor="middle">Effect direction (d)</text>
        <text className="axis-label" x="16" y="186" textAnchor="middle" transform="rotate(-90 16 186)">Confidence (c)</text>
        {points.map((outcome) => (
          <Link
            aria-label={`Inspect ${outcome.label}: effect ${formatSigned(outcome.components.d)}, confidence ${(outcome.components.c as number).toFixed(3)}`}
            className="scatter-link"
            href={`/runs/${runId}/outcomes/${outcome.id}`}
            key={outcome.id}
          >
            <circle
              className="scatter-hit-target"
              cx={x(outcome.components.d as number)}
              cy={y(outcome.components.c as number)}
              r="22"
            />
            <circle
              className="scatter-point"
              cx={x(outcome.components.d as number)}
              cy={y(outcome.components.c as number)}
              r={radius(outcome.components.evidenceMass)}
            >
              <title>{`${outcome.label}: effect ${formatSigned(outcome.components.d)}, confidence ${(outcome.components.c as number).toFixed(3)}, evidence mass ${outcome.components.evidenceMass ?? "unavailable"}`}</title>
            </circle>
          </Link>
        ))}
      </svg>
      <figcaption className="chart-note">Only scored outcomes with retained d and c components are plotted. Position is descriptive, not a treatment comparison.</figcaption>
    </figure>
  );
}
