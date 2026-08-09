import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology" };

const arcs = [
  ["01", "Effect", "Direction and magnitude retained for the outcome."],
  ["02", "Form", "How closely the studied supplement form matches the product form."],
  ["03", "Dose", "How closely the studied exposure matches the target dose context."],
  ["04", "Evidence", "Evidence quantity or confidence coverage, kept distinct from effect direction."],
];

export default function MethodologyPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="shell article-hero">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Runs</Link><span aria-hidden="true">/</span><span>Methodology</span></nav>
        <p className="eyebrow">Reader’s guide</p>
        <h1>A score with its<br /><em>working visible.</em></h1>
        <p className="article-lede">The dashboard is an inspection layer over retained pipeline outputs. It does not recompute scores, fill missing values, or promote historical runs into product claims.</p>
      </div>

      <div className="shell methodology-layout">
        <aside className="methodology-index" aria-label="On this page">
          <a href="#score">Composite</a><a href="#arcs">Four arcs</a><a href="#gating">Evidence gate</a><a href="#validity">Validity</a><a href="#limits">Display limits</a>
        </aside>
        <article className="methodology-article">
          <section id="score"><p className="eyebrow">Composite</p><h2>The displayed score</h2><p>The 0–100 composite is the run’s retained display field. The signed internal score is preserved separately for audit. This site never derives one from the other and never averages discrepancies.</p></section>
          <section id="arcs"><p className="eyebrow">Four-ring model</p><h2>Every score carries four arcs</h2><div className="arc-method-grid">{arcs.map(([number, name, description]) => <div key={number}><span>{number}</span><h3>{name}</h3><p>{description}</p></div>)}</div><p>Exact verdict and coverage values appear beside the graphic. A blank verdict remains an em dash; zero coverage is shown only when the artifact explicitly records zero.</p></section>
          <section id="gating"><p className="eyebrow">Evidence gate</p><h2>Unavailable is not zero</h2><p>When the pipeline’s evidence gate fires, the dashboard shows an em dash instead of a score. That means “not scored under this run’s rules,” not “no effect.”</p></section>
          <section id="validity"><p className="eyebrow">Validity registry</p><h2>Status travels with the run</h2><p>Validated, experimental, and invalid are run-level states. Invalid historical artifacts remain useful for extraction audits, but their scores must not be used as product claims. A reconciliation check compares dashboard-critical values with the retained lab context when both are present.</p></section>
          <section id="limits"><p className="eyebrow">Display limits</p><h2>What we deliberately do not imply</h2><ul><li>The corpus is run-level unless the artifact explicitly retains per-outcome attribution.</li><li>No forest plot is constructed without study-level effect sizes and uncertainty.</li><li>No dose-response curve is inferred from categorical dose applicability.</li><li>Missing telemetry is labeled unavailable. A recorded $0 subscription marginal spend remains $0, while absent API-equivalent cost and token counts remain unavailable.</li><li>These reports are evidence-system outputs, not medical advice.</li></ul></section>
        </article>
      </div>
    </main>
  );
}
