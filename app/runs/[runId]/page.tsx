import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CorpusExplorer } from "@/components/corpus-explorer";
import { EffectConfidenceScatter } from "@/components/effect-confidence-scatter";
import { MarkdownReport } from "@/components/markdown-report";
import { OutcomeExplorer } from "@/components/outcome-explorer";
import { AgentSuccessBars, SystematicReviewProgression } from "@/components/quality-visuals";
import { StatusBadge } from "@/components/status-badge";
import { TelemetryPanel } from "@/components/telemetry-panel";
import { formatDate, formatNumber, formatUnknown, humanize } from "@/lib/dashboard/format";
import { getRetainedRunIds, loadDashboardRun, loadReportMarkdown } from "@/lib/dashboard/catalog";

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

function archiveCheck(value: Record<string, unknown> | null): { ok: boolean | null; issues: number } {
  const raw = value?.reader_check;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: null, issues: 0 };
  const check = raw as Record<string, unknown>;
  return { ok: typeof check.ok === "boolean" ? check.ok : null, issues: Array.isArray(check.issues) ? check.issues.length : 0 };
}

export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  const dashboardRun = loadDashboardRun(runId);
  if (!dashboardRun) notFound();
  const scored = dashboardRun.outcomes.filter((outcome) => outcome.displayScore !== null).length;
  const gated = dashboardRun.outcomes.length - scored;
  const summaryMarkdown = loadReportMarkdown(dashboardRun.reports.summaryPath);
  const fullMarkdown = loadReportMarkdown(dashboardRun.reports.fullPath);
  const reconciliation = archiveCheck(dashboardRun.reconciliation);

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

      <nav className="section-nav" aria-label="Run sections"><div className="shell"><a href="#outcomes">Outcomes</a><a href="#evidence">Evidence</a><a href="#quality">Quality</a><a href="#cost-models">Cost &amp; models</a><a href="#full-report">Full report</a></div></nav>

      <section className="section shell" id="outcomes" aria-labelledby="outcomes-title">
        <div className="section-heading split-heading"><div><p className="eyebrow">Scores</p><h2 id="outcomes-title">Outcome evidence</h2></div><p>{scored} scored / {gated} unavailable. Every composite is paired with its exact effect, form, dose, and evidence arcs.</p></div>
        <div className="notice notice-neutral"><strong>Reader note</strong><span>Composite is a 0–100 display score. A gated em dash is not a score of zero.</span></div>
        <EffectConfidenceScatter outcomes={dashboardRun.outcomes} runId={dashboardRun.run.id} />
        <OutcomeExplorer outcomes={dashboardRun.outcomes} runId={dashboardRun.run.id} />
      </section>

      <section className="section section-tint" id="evidence" aria-labelledby="evidence-title">
        <div className="shell">
          <div className="section-heading split-heading"><div><p className="eyebrow">Retrieved corpus</p><h2 id="evidence-title">Evidence</h2></div><p>Searchable run-level study metadata. The retained artifact does not assert that every study belongs to every outcome.</p></div>
          <div className="evidence-summary-grid">
            <div><span>Targeted</span><strong>{formatNumber(dashboardRun.extraction.targeted)}</strong></div>
            <div><span>Usable in run</span><strong>{formatNumber(dashboardRun.extraction.usable)}</strong></div>
            <div><span>SR requested</span><strong>{formatNumber(dashboardRun.systematicReviews.requested)}</strong></div>
            <div><span>SR extracted</span><strong>{formatNumber(dashboardRun.systematicReviews.extracted)}</strong></div>
          </div>
          <SystematicReviewProgression reviews={dashboardRun.systematicReviews} />
          <CorpusExplorer studies={dashboardRun.studies} />
        </div>
      </section>

      <section className="section shell" id="quality" aria-labelledby="quality-title">
        <div className="section-heading split-heading"><div><p className="eyebrow">Limits &amp; provenance</p><h2 id="quality-title">Quality</h2></div><p>Pipeline validity and extraction completeness are separate from the displayed outcome score.</p></div>
        <div className={`validity-panel validity-${dashboardRun.run.validity.status.toLowerCase()}`}>
          <div><StatusBadge status={dashboardRun.run.validity.status} /><h3>{dashboardRun.run.validity.publicClaimsAllowed ? "Public claims allowed by registry" : "Do not use as product claims"}</h3></div>
          <p>{dashboardRun.run.validity.note ?? "No registry note was retained."}</p>
          {dashboardRun.run.validity.reasonCodes.length ? <ul>{dashboardRun.run.validity.reasonCodes.map((code) => <li key={code}>{humanize(code)}</li>)}</ul> : null}
        </div>
        <div className="quality-grid">
          <article><p className="eyebrow">Lab archive check</p><h3>{reconciliation.ok === true ? "Matched" : reconciliation.ok === false ? "Mismatch detected" : "Unavailable"}</h3><p>{reconciliation.ok === true ? "Display-critical fields reconcile with the retained context JSON." : reconciliation.ok === false ? `${reconciliation.issues} reconciliation issue(s) are retained; do not resolve by averaging.` : "No separate retained context was available for comparison."}</p></article>
          <article><p className="eyebrow">Extraction</p><dl className="detail-list"><div><dt>Skipped</dt><dd>{formatNumber(dashboardRun.extraction.skipped)}</dd></div><div><dt>Partial failures</dt><dd>{formatNumber(dashboardRun.extraction.partialFailures)}</dd></div><div><dt>Concurrency</dt><dd>{formatNumber(dashboardRun.extraction.concurrency)}</dd></div><div><dt>In flight</dt><dd>{formatNumber(dashboardRun.extraction.studiesInFlight)}</dd></div></dl></article>
          <article><p className="eyebrow">Venue screen</p><dl className="detail-list"><div><dt>Studies checked</dt><dd>{formatNumber(dashboardRun.predatoryScreen.studiesChecked)}</dd></div><div><dt>Studies flagged</dt><dd>{formatNumber(dashboardRun.predatoryScreen.studiesFlagged)}</dd></div><div><dt>Score affected</dt><dd>{dashboardRun.predatoryScreen.affectsScore === null ? "Unavailable" : dashboardRun.predatoryScreen.affectsScore ? "Yes" : "No"}</dd></div><div><dt>Source</dt><dd>{dashboardRun.predatoryScreen.source ?? "Unavailable"}</dd></div></dl></article>
        </div>
        <AgentSuccessBars agents={dashboardRun.extraction.agents} />
        {dashboardRun.extraction.agents.length ? <div className="table-card"><table><caption>Agent completion retained by the run</caption><thead><tr><th scope="col">Agent</th><th scope="col">OK</th><th scope="col">Failed</th><th scope="col">Cache</th></tr></thead><tbody>{dashboardRun.extraction.agents.map((agent) => <tr key={agent.name}><th scope="row">{agent.name}</th><td>{formatNumber(agent.ok)}</td><td>{formatNumber(agent.fail)}</td><td>{formatNumber(agent.cache)}</td></tr>)}</tbody></table></div> : null}
        {dashboardRun.run.validity.limitations.length ? <div className="limitations"><h3>Retained limitations</h3><ul>{dashboardRun.run.validity.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div> : null}
      </section>

      <section className="section section-dark" id="cost-models" aria-labelledby="cost-title"><div className="shell"><div className="section-heading split-heading"><div><p className="eyebrow">Operational ledger</p><h2 id="cost-title">Cost &amp; models</h2></div><p>Telemetry reflects what the artifact can prove. Missing token or price detail remains explicitly unavailable.</p></div><TelemetryPanel dashboardRun={dashboardRun} />
        <div className="model-card"><p className="eyebrow">Run identity</p><h3>Models &amp; execution</h3><dl className="detail-list"><div><dt>Provider</dt><dd>{humanize(dashboardRun.run.provider)}</dd></div><div><dt>Mode</dt><dd>{humanize(dashboardRun.run.mode)}</dd></div><div><dt>Scope</dt><dd>{humanize(dashboardRun.run.scope)}</dd></div><div><dt>Product dose</dt><dd>{formatUnknown(dashboardRun.run.dose)}</dd></div><div><dt>Population</dt><dd>{formatUnknown(dashboardRun.run.population)}</dd></div>{Object.entries(dashboardRun.run.models).map(([agent, model]) => <div key={agent}><dt>{humanize(agent)}</dt><dd>{model}</dd></div>)}</dl></div>
      </div></section>

      <section className="section shell" id="full-report" aria-labelledby="report-title">
        <div className="section-heading split-heading"><div><p className="eyebrow">Retained prose</p><h2 id="report-title">Full report</h2></div><p>Markdown is rendered with raw HTML disabled. Links are preserved; scripts and embedded content are not.</p></div>
        <details className="report-disclosure" open><summary>Summary report</summary><MarkdownReport markdown={summaryMarkdown} label="Summary report" /></details>
        <details className="report-disclosure"><summary>Full technical report</summary><MarkdownReport markdown={fullMarkdown} label="Full technical report" /></details>
      </section>
    </main>
  );
}
