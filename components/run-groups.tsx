import { RunCard } from "@/components/run-card";
import type { DashboardRun } from "@/lib/dashboard/types";

/*
 * Retained runs, grouped by the scoring model that produced them.
 *
 * The grouping is not cosmetic: comparing a number across scoring models is
 * reading a formula change as an evidence change, which is the mistake
 * reports/archive/ exists to prevent on disk. Showing them in one flat list
 * invites exactly that comparison.
 *
 * Lifted out of app/page.tsx on 2026-08-25 when the public page became the
 * waitlist alone; it renders on /tester now.
 */
export function RunGroups({ runs, prefix }: { runs: DashboardRun[]; prefix: string }) {
  const groups = new Map<string, DashboardRun[]>();
  for (const run of runs) {
    const model = run.run.scoringModel ?? "Scoring model unavailable";
    groups.set(model, [...(groups.get(model) ?? []), run]);
  }
  return (
    <div className="run-groups">
      {[...groups.entries()].map(([model, groupedRuns]) => {
        const headingId = `${prefix}-model-${model.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        return (
          <section className="run-group" key={model} aria-labelledby={headingId}>
            <div className="run-group-heading">
              <span>Scoring model</span>
              <h3 id={headingId}>{model}</h3>
              <span>
                {groupedRuns.length} run{groupedRuns.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="run-grid">
              {groupedRuns.map((run) => (
                <RunCard key={run.run.id} run={run} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
