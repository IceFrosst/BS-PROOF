import type { Metadata } from "next";
import Link from "next/link";

import { RunGroups } from "@/components/run-groups";
import { loadDashboardCatalog } from "@/lib/dashboard/catalog";

/*
 * THE RUN ARCHIVE: every retained evidence run, validated first, then the lab
 * archive. Each card opens /runs/<id>, the reviewer view of one run.
 *
 * Moved here 2026-10-03 from /tester when the old label analyzer was retired
 * (/scan replaced it). The archive is the provenance FOR the scores, so it stays
 * off the public waitlist page and out of the site nav.
 *
 * WHAT THIS IS NOT: protected. It is unlisted (no link from the public page or
 * the nav, and the site is `robots: index false`). It does NOT stop anyone who
 * knows the URL. Nothing here is a secret, but if the requirement ever becomes
 * "only these people", that needs real auth.
 */

export const metadata: Metadata = {
  title: "Runs",
  // The layout already sets index:false site-wide; restated so the intent
  // survives a change to the global config.
  robots: { index: false, follow: false, nocache: true },
};

export default function RunsPage() {
  const runs = loadDashboardCatalog();
  const validatedRuns = runs.filter((run) => run.run.validity.status.toLowerCase() === "validated");
  const archiveRuns = runs.filter((run) => run.run.validity.status.toLowerCase() !== "validated");
  const studies = runs.reduce((total, run) => total + (run.extraction.targeted ?? 0), 0);
  const scored = runs.reduce(
    (total, run) => total + run.outcomes.filter((outcome) => outcome.displayScore !== null).length,
    0,
  );

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="run-hero">
        <div className="shell">
          <nav className="breadcrumbs breadcrumbs-light" aria-label="Breadcrumb">
            <Link href="/scan">BS Proof</Link>
            <span aria-hidden="true">/</span>
            <span>Runs</span>
          </nav>
          <div className="run-hero-grid">
            <div>
              <p className="eyebrow">Internal · not the public page</p>
              <h1>Evidence runs</h1>
              <p>
                The retained runs behind every score <Link href="/scan">/scan</Link> shows. Open one
                to see its outcomes, the studies behind them and what the extraction cost.
              </p>
            </div>
            <dl className="run-hero-stats" aria-label="Dashboard totals">
              <div><dt>Retained runs</dt><dd>{runs.length}</dd></div>
              <div><dt>Study records</dt><dd>{studies}</dd></div>
              <div><dt>Scored outcomes</dt><dd>{scored}</dd></div>
              <div><dt>Scoring arcs</dt><dd>4</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <section className="section shell" id="runs" aria-labelledby="validated-runs-title">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Results</p>
            <h2 id="validated-runs-title">Validated runs</h2>
          </div>
          <p>
            Only registry-validated runs belong here. Validation is separate from whether an outcome
            received a numeric score.
          </p>
        </div>
        {validatedRuns.length ? (
          <RunGroups prefix="validated" runs={validatedRuns} />
        ) : (
          <div className="empty-state validated-empty">
            <strong>No validated results yet.</strong>
            <span>Experimental and invalid work remains available below for lab inspection.</span>
          </div>
        )}
      </section>

      <section className="section section-tint" aria-labelledby="archive-runs-title">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Inspection only</p>
              <h2 id="archive-runs-title">Lab archive</h2>
            </div>
            <p>
              Invalid and experimental runs stay visible for provenance, extraction debugging, and
              methodology review—not product claims.
            </p>
          </div>
          {archiveRuns.length ? (
            <RunGroups prefix="archive" runs={archiveRuns} />
          ) : (
            <p className="empty-state">No lab archive artifacts are available.</p>
          )}
        </div>
      </section>

      <section className="section shell methodology-promo">
        <p className="eyebrow">Read the score correctly</p>
        <div>
          <h2>One number is not the evidence.</h2>
          <p>
            The composite sits beside effect, form, dose, and evidence arcs. Gating, provenance, and
            validity remain part of the answer.
          </p>
          <Link href="/methodology">
            How this dashboard reads a run <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
