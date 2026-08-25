import Link from "next/link";

import { WaitlistForm } from "@/components/waitlist-form";
import { RunCard } from "@/components/run-card";
import { loadRetainedRuns } from "@/lib/dashboard/catalog";
import type { DashboardRun } from "@/lib/dashboard/types";

function RunGroups({ runs, prefix }: { runs: DashboardRun[]; prefix: string }) {
  const groups = new Map<string, DashboardRun[]>();
  for (const run of runs) {
    const model = run.run.scoringModel ?? "Scoring model unavailable";
    groups.set(model, [...(groups.get(model) ?? []), run]);
  }
  return <div className="run-groups">{[...groups.entries()].map(([model, groupedRuns]) => {
    const headingId = `${prefix}-model-${model.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    return <section className="run-group" key={model} aria-labelledby={headingId}><div className="run-group-heading"><span>Scoring model</span><h3 id={headingId}>{model}</h3><span>{groupedRuns.length} run{groupedRuns.length === 1 ? "" : "s"}</span></div><div className="run-grid">{groupedRuns.map((run) => <RunCard key={run.run.id} run={run} />)}</div></section>;
  })}</div>;
}

export default function HomePage() {
  const runs = loadRetainedRuns();
  const validatedRuns = runs.filter((run) => run.run.validity.status.toLowerCase() === "validated");
  const archiveRuns = runs.filter((run) => run.run.validity.status.toLowerCase() !== "validated");
  const studies = runs.reduce((total, run) => total + (run.extraction.targeted ?? 0), 0);
  const scored = runs.reduce((total, run) => total + run.outcomes.filter((outcome) => outcome.displayScore !== null).length, 0);

  return (
    <main id="main-content" tabIndex={-1}>
      {/* The upload IS the hero (founder 2026-08-22: "i want a field with a
          file upload in the middle and it should be the focus of the
          website"). The brand shrinks to a strip; the run archive and totals
          are the provenance for every number the analyzer returns, so they
          stay — demoted below the fold, not removed. */}
      <section className="analyze-hero" id="analyze">
        <div className="shell analyze-hero-brand">
          <p className="eyebrow hero-kicker">Supplement evidence, with the seams showing</p>
          <h1>BS <em>PROOF</em></h1>
        </div>
        {/* THE PUBLIC FRONT DOOR IS THE WAITLIST, AND ONLY THE WAITLIST
            (founder, 2026-08-25). No flag: a switch that can put the scanner
            back on this page is a switch that eventually does, by accident, in
            front of the people it was hidden from.

            The analyzer lives at /tester instead -- same component, separate
            route, for developers and board members. Two audiences, two pages,
            no shared toggle between them. */}
        <div className="shell analyze-hero-body">
          <WaitlistForm source="qr" />
        </div>
        <div className="shell hero-ledger" aria-label="Dashboard totals">
          <div><strong>{runs.length}</strong><span>Retained run{runs.length === 1 ? "" : "s"}</span></div>
          <div><strong>{studies}</strong><span>Study records</span></div>
          <div><strong>{scored}</strong><span>Scored outcomes</span></div>
          <div><strong>4</strong><span>Visible scoring arcs</span></div>
        </div>
      </section>

      <section className="section shell" id="runs" aria-labelledby="validated-runs-title">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Results</p><h2 id="validated-runs-title">Validated runs</h2></div>
          <p>Only registry-validated runs belong here. Validation is separate from whether an outcome received a numeric score.</p>
        </div>
        {validatedRuns.length ? <RunGroups prefix="validated" runs={validatedRuns} /> : <div className="empty-state validated-empty"><strong>No validated results yet.</strong><span>Experimental and invalid work remains available below for lab inspection.</span></div>}
      </section>

      <section className="section section-tint" aria-labelledby="archive-runs-title">
        <div className="shell">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">Inspection only</p><h2 id="archive-runs-title">Lab archive</h2></div>
            <p>Invalid and experimental runs stay visible for provenance, extraction debugging, and methodology review—not product claims.</p>
          </div>
          {archiveRuns.length ? <RunGroups prefix="archive" runs={archiveRuns} /> : <p className="empty-state">No lab archive artifacts are available.</p>}
        </div>
      </section>

      <section className="section shell methodology-promo">
        <p className="eyebrow">Read the score correctly</p>
        <div>
          <h2>One number is not the evidence.</h2>
          <p>The composite sits beside effect, form, dose, and evidence arcs. Gating, provenance, and validity remain part of the answer.</p>
          <Link href="/methodology">How this dashboard reads a run <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
