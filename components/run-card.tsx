import Link from "next/link";

import { formatDate, humanize } from "@/lib/dashboard/format";
import type { DashboardRun } from "@/lib/dashboard/types";
import { StatusBadge } from "./status-badge";

export function RunCard({ run }: { run: DashboardRun }) {
  const scored = run.outcomes.filter((outcome) => outcome.displayScore !== null).length;
  const gated = run.outcomes.length - scored;
  return (
    <article className="run-card" data-testid="run-card">
      <div className="run-card-topline">
        <StatusBadge status={run.run.validity.status} testId="run-status" />
        <time dateTime={run.run.timestamp ?? undefined}>{formatDate(run.run.timestamp)}</time>
      </div>
      <div>
        <p className="eyebrow">{humanize(run.run.form)}</p>
        <h2>{humanize(run.run.ingredient)}</h2>
        <p className="run-deck">
          {run.run.validity.note ?? `${run.outcomes.length} outcomes retained from this evidence run.`}
        </p>
      </div>
      <dl className="compact-stats">
        <div><dt>Studies</dt><dd>{run.extraction.targeted ?? "—"}</dd></div>
        <div><dt>Scored</dt><dd>{scored}</dd></div>
        <div><dt>Gated</dt><dd>{gated}</dd></div>
        <div><dt>Provider</dt><dd>{humanize(run.run.provider)}</dd></div>
      </dl>
      <Link className="button button-dark" href={`/runs/${run.run.id}`}>
        Inspect retained run <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
