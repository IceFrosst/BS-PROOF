import { formatNumber } from "@/lib/dashboard/format";
import type { AgentStat, DashboardSystematicReviews } from "@/lib/dashboard/types";

export function AgentSuccessBars({ agents }: { agents: AgentStat[] }) {
  if (!agents.length) return <p className="empty-state">Agent completion counts are unavailable.</p>;
  return (
    <figure className="agent-bars-card">
      <div className="chart-heading"><div><p className="eyebrow">Extraction agents</p><h3>OK / failure balance</h3></div><p>Exact retained completion counts; cache hits are listed in the accessible table below.</p></div>
      <div className="agent-bars">
        {agents.map((agent) => {
          const known = agent.ok !== null && agent.fail !== null;
          const total = known ? (agent.ok as number) + (agent.fail as number) : 0;
          const success = total ? ((agent.ok as number) / total) * 100 : 0;
          return (
            <div className="agent-bar-row" key={agent.name}>
              <strong>{agent.name}</strong>
              <div className="agent-bar-track" role="img" aria-label={`${agent.name}: ${formatNumber(agent.ok)} OK, ${formatNumber(agent.fail)} failed`}>
                {known ? <span className="agent-bar-ok" style={{ width: `${success}%` }} /> : <span className="agent-bar-missing">Unavailable</span>}
              </div>
              <span>{formatNumber(agent.ok)} / {formatNumber(agent.fail)}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="chart-note">Green is successful completion; the remainder of each known bar is failed completion. Bar length is not a study quality score.</figcaption>
    </figure>
  );
}

export function SystematicReviewProgression({ reviews }: { reviews: DashboardSystematicReviews }) {
  const values = [reviews.requested, reviews.extracted, reviews.resolved];
  const max = Math.max(1, ...values.filter((value): value is number => value !== null));
  const stages = [
    ["Requested", reviews.requested],
    ["Extracted", reviews.extracted],
    ["Resolved", reviews.resolved],
  ] as const;
  return (
    <figure className="sr-progress-card">
      <div className="chart-heading"><div><p className="eyebrow">Systematic reviews</p><h3>Retrieval progression</h3></div><p>Zero is displayed when explicitly retained; missing is labeled unavailable.</p></div>
      <div className="sr-stages">
        {stages.map(([label, value], index) => (
          <div className="sr-stage" key={label}>
            <span className="sr-step">0{index + 1}</span>
            <strong>{value ?? "—"}</strong>
            <span>{label}</span>
            <div className="sr-track" aria-hidden="true"><i style={{ width: value === null ? "0%" : `${(value / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <figcaption className="chart-note">Stages describe this run’s systematic-review workflow and are not an evidence hierarchy.</figcaption>
    </figure>
  );
}
