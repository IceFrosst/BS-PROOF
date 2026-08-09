import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FourRingScore } from "@/components/four-ring-score";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber, formatPercent, formatSigned, formatUnknown, humanize } from "@/lib/dashboard/format";
import { loadDashboardRun, loadRetainedRuns } from "@/lib/dashboard/catalog";

interface OutcomePageProps { params: Promise<{ runId: string; outcomeId: string }> }

export const dynamicParams = false;

export function generateStaticParams() {
  return loadRetainedRuns().flatMap((run) => run.outcomes.map((outcome) => ({ runId: run.run.id, outcomeId: outcome.id })));
}

export async function generateMetadata({ params }: OutcomePageProps): Promise<Metadata> {
  const { runId, outcomeId } = await params;
  const outcome = loadDashboardRun(runId)?.outcomes.find((item) => item.id === outcomeId);
  return { title: outcome?.label ?? "Outcome not found" };
}

export default async function OutcomePage({ params }: OutcomePageProps) {
  const { runId, outcomeId } = await params;
  const dashboardRun = loadDashboardRun(runId);
  const outcome = dashboardRun?.outcomes.find((item) => item.id === outcomeId);
  if (!dashboardRun || !outcome) notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="shell outcome-detail-hero">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Runs</Link><span aria-hidden="true">/</span><Link href={`/runs/${runId}`}>{humanize(dashboardRun.run.ingredient)}</Link><span aria-hidden="true">/</span><span>{outcome.label}</span></nav>
        <div className="outcome-detail-grid">
          <div>
            <div className="hero-status-row"><StatusBadge status={dashboardRun.run.validity.status} /><span>{outcome.displayScore === null ? "Evidence gated" : humanize(outcome.band)}</span></div>
            <p className="eyebrow">{humanize(outcome.kind)}</p>
            <h1>{outcome.label}</h1>
            <p className="article-lede">{outcome.definition ?? "No outcome definition was retained."}</p>
            <p className="outcome-verdict-large">{outcome.verdictLabel ?? "Verdict unavailable"}</p>
          </div>
          <FourRingScore outcome={outcome} />
        </div>
      </div>

      <div className="shell outcome-detail-body">
        <section aria-labelledby="signal-title"><p className="eyebrow">Retained components</p><h2 id="signal-title">Signal and confidence</h2><dl className="component-grid"><div><dt>Internal signed score</dt><dd>{outcome.signedScore === null ? "—" : formatSigned(outcome.signedScore, 0)}</dd></div><div><dt>Effect (d)</dt><dd>{formatSigned(outcome.components.d)}</dd></div><div><dt>Confidence (c)</dt><dd>{formatPercent(outcome.components.c)}</dd></div><div><dt>Heterogeneity (H)</dt><dd>{outcome.components.heterogeneity === null ? "Unavailable" : outcome.components.heterogeneity.toFixed(3)}</dd></div><div><dt>Evidence mass (E)</dt><dd>{outcome.components.evidenceMass === null ? "Unavailable" : outcome.components.evidenceMass.toFixed(3)}</dd></div><div><dt>Adjusted mass (E′)</dt><dd>{outcome.components.adjustedEvidenceMass === null ? "Unavailable" : outcome.components.adjustedEvidenceMass.toFixed(3)}</dd></div></dl></section>
        <section aria-labelledby="evidence-detail-title"><p className="eyebrow">Evidence boundary</p><h2 id="evidence-detail-title">What is retained here</h2><div className="quality-grid"><article><p className="eyebrow">Primary studies</p><h3>{formatNumber(outcome.nPrimaries)}</h3><p>Count attached to this outcome by the run.</p></article><article><p className="eyebrow">Syntheses</p><h3>{formatNumber(outcome.nSyntheses)}</h3><p>Unavailable means the artifact did not retain this count.</p></article><article><p className="eyebrow">Prompt version</p><h3 className="code-heading">{outcome.promptVersion ?? "Unavailable"}</h3><p>Exact run prompt identity where retained.</p></article></div><div className="notice notice-neutral"><strong>No invented study chart</strong><span>This artifact does not retain per-study effect sizes, confidence intervals, or dose-response points for this outcome. A forest plot or dose-response curve would imply data that are not present.</span></div></section>
        <section aria-labelledby="audit-fields-title"><p className="eyebrow">ECU audit record</p><h2 id="audit-fields-title">Identity &amp; applicability</h2><dl className="audit-grid"><div><dt>ECU key</dt><dd>{outcome.ecuKey ?? "Unavailable"}</dd></div><div><dt>Ingredient</dt><dd>{outcome.ingredient ?? dashboardRun.run.ingredient}</dd></div><div><dt>Form vocabulary ID</dt><dd>{outcome.formVocabId ?? "Unavailable"}</dd></div><div><dt>Dose band</dt><dd>{outcome.doseBand ?? "Unavailable"}</dd></div><div><dt>Band version</dt><dd>{formatNumber(outcome.bandVersion)}</dd></div><div><dt>Population</dt><dd>{formatUnknown(outcome.population)}</dd></div><div><dt>Dose</dt><dd>{formatUnknown(outcome.dose)}</dd></div><div><dt>Dose range (mg)</dt><dd>{formatUnknown(outcome.doseRangeMg)}</dd></div><div><dt>Form mix</dt><dd>{formatUnknown(outcome.formMix)}</dd></div><div><dt>Applicability</dt><dd>{formatUnknown(outcome.applicability)}</dd></div><div><dt>Study IDs</dt><dd>{outcome.studyIds.length ? outcome.studyIds.join(", ") : "Unavailable"}</dd></div><div><dt>Flags</dt><dd>{outcome.flags.length ? outcome.flags.join(", ") : "None retained"}</dd></div><div><dt>Provenance</dt><dd>{formatUnknown(outcome.provenance)}</dd></div></dl></section>
        <section aria-labelledby="arc-table-title"><p className="eyebrow">Exact four-arc record</p><h2 id="arc-table-title">Arc values</h2><div className="table-card"><table><thead><tr><th scope="col">Arc</th><th scope="col">Verdict</th><th scope="col">Coverage</th><th scope="col">Meaning</th></tr></thead><tbody>{(["effect", "form", "dose", "evidence"] as const).map((key) => <tr key={key}><th scope="row">{humanize(key)}</th><td>{outcome.arcs[key].isQuantity || key === "evidence" ? "Quantity" : formatSigned(outcome.arcs[key].verdict)}</td><td>{formatPercent(outcome.arcs[key].coverage)}</td><td>{key === "effect" ? "Outcome direction" : key === "form" ? "Form applicability" : key === "dose" ? "Dose applicability" : "Evidence quantity / confidence"}</td></tr>)}</tbody></table></div></section>
        <Link className="back-link" href={`/runs/${runId}`}>← Back to all outcomes</Link>
      </div>
    </main>
  );
}
