import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CorpusExplorer } from "@/components/corpus-explorer";
import { OutcomeExplorer } from "@/components/outcome-explorer";
import { StatusBadge } from "@/components/status-badge";
import { TelemetryPanel } from "@/components/telemetry-panel";
import { formatDate, formatNumber, humanize } from "@/lib/dashboard/format";
import { getRetainedRunIds, loadDashboardRun } from "@/lib/dashboard/catalog";

interface RunPageProps { params: Promise<{ runId: string }> }

export const dynamicParams = false;

export function generateStaticParams() {
  return getRetainedRunIds().map((runId) => ({ runId }));
}

export async function generateMetadata({ params }: RunPageProps): Promise<Metadata> {
  const { runId } = await params;
  const dashboardRun = loadDashboardRun(runId);
  return { title: dashboardRun ? `${humanize(dashboardRun.run.ingredient)} run` : "Run not found" };
}

/*
 * REDESIGNED 2026-08-12 (founder decision) for the page's real audience: the
 * team and the scientists doing manual score reviews. Three sections only —
 * outcomes (with inline per-study score attribution), the literature with what
 * each subagent extracted from it, and a simplified cost ledger. The scatter,
 * SR-progression, Quality section and rendered Markdown reports were removed
 * outright; the .md reports remain in the repo and the data remains in the
 * downloadable artifact.
 */
export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  const dashboardRun = loadDashboardRun(runId);
  if (!dashboardRun) notFound();
  const scored = dashboardRun.outcomes.filter((outcome) => outcome.displayScore !== null).length;
  const gated = dashboardRun.outcomes.length - scored;

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="run-hero">
        <div className="shell">
          <nav className="breadcrumbs breadcrumbs-light" aria-label="Breadcrumb"><Link href="/">Runs</Link><span aria-hidden="true">/</span><span>{humanize(dashboardRun.run.ingredient)}</span></nav>
          <div className="run-hero-grid">
            <div>
              <div className="hero-status-row"><StatusBadge status={dashboardRun.run.validity.status} testId="run-status" /><span>{formatDate(dashboardRun.run.timestamp)}</span></div>
              <p className="eyebrow">{humanize(dashboardRun.run.form)}</p>
              <h1>{humanize(dashboardRun.run.ingredient)}</h1>
              <p>{dashboardRun.run.validity.note ?? "Retained supplement evidence run."}</p>
            </div>
            <dl className="run-hero-stats">
              <div><dt>Study records</dt><dd>{formatNumber(dashboardRun.extraction.targeted)}</dd></div>
              <div><dt>Outcomes</dt><dd>{dashboardRun.outcomes.length}</dd></div>
              <div><dt>Scored</dt><dd>{scored}</dd></div>
              <div><dt>Unavailable</dt><dd>{gated}</dd></div>
            </dl>
          </div>
          <div className="provenance-strip">
            <span>Provider <strong>{humanize(dashboardRun.run.provider)}</strong></span>
            <span>Scoring <strong>{dashboardRun.run.scoringModel ?? "Unavailable"}</strong></span>
            <span>Prompt <strong>{dashboardRun.run.promptVersion ?? "Unavailable"}</strong></span>
            <span>Source <strong title={dashboardRun.run.sourceCommit ?? undefined}>{dashboardRun.run.sourceCommit?.slice(0, 9) ?? "Unavailable"}</strong></span>
          </div>
        </div>
      </div>

      <nav className="section-nav" aria-label="Run sections"><div className="shell"><a href="#outcomes">Outcomes</a><a href="#literature">Literature</a><a href="#cost">Cost</a></div></nav>

      <section className="section shell" id="outcomes" aria-labelledby="outcomes-title">
        <div className="section-heading split-heading"><div><p className="eyebrow">Scores</p><h2 id="outcomes-title">Outcome evidence</h2></div><p>{scored} scored / {gated} unavailable. Open “More info” on any outcome to see each study&apos;s pull on the score and whether it came from a measured effect or a direction label. <Link href="/methodology#how">How a score is computed →</Link></p></div>
        <div className="notice notice-neutral"><strong>Reader note</strong><span>Composite is a 0–100 display score. A gated em dash is not a score of zero.</span></div>
        <OutcomeExplorer outcomes={dashboardRun.outcomes} runId={dashboardRun.run.id} studies={dashboardRun.studies} />
      </section>

      <section className="section section-tint" id="literature" aria-labelledby="literature-title">
        <div className="shell">
          <div className="section-heading split-heading"><div><p className="eyebrow">Retrieved corpus</p><h2 id="literature-title">Literature</h2></div><p>{formatNumber(dashboardRun.extraction.targeted)} records targeted, {formatNumber(dashboardRun.extraction.usable)} usable. Expand a study to see what each subagent extracted from it, with the verbatim sentence it relied on.</p></div>
          <CorpusExplorer studies={dashboardRun.studies} />
        </div>
      </section>

      <section className="section section-dark" id="cost" aria-labelledby="cost-title"><div className="shell"><div className="section-heading split-heading"><div><p className="eyebrow">Operational ledger</p><h2 id="cost-title">Cost</h2></div><p>Total spend and the per-agent breakdown. Missing token or price detail remains explicitly unavailable; the full ledger is in the downloadable artifact.</p></div><TelemetryPanel dashboardRun={dashboardRun} />
      </div></section>
    </main>
  );
}
