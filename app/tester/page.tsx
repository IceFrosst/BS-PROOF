import type { Metadata } from "next";
import Link from "next/link";

import "../scan-workspace.css";
import { LabelAnalyzer } from "@/components/label-analyzer";
import { RunGroups } from "@/components/run-groups";
import { loadRetainedRuns } from "@/lib/dashboard/catalog";

/*
 * THE TESTER SURFACE. Scanning and the run archive both live here.
 *
 * Founder, 2026-08-25: the public page is the waitlist alone, and the analyzer
 * is for "testers who are like developers and our board members". The archive
 * followed the analyzer here rather than staying on the public page, because
 * it is the provenance FOR the scores — and the public page has no scores.
 *
 * Separate ROUTE rather than a flag, deliberately. A toggle that can put the
 * scanner back in front of the public is a toggle that eventually does:
 * someone sets it to debug, a deploy carries it, and the front door quietly
 * changes for everyone. A route cannot be switched on by accident.
 *
 * WHAT THE PAGE ITSELF IS NOT: protected. It is unlisted (no link from the
 * public page or the nav, and the site is `robots: index false`), which keeps
 * it out of search and out of a casual visitor's way. It does NOT stop anyone
 * who knows or guesses the URL, and the retained runs below stay open: nothing
 * here is a secret — the same artifacts the public methodology reads.
 *
 * THE SCANNER ON IT IS GATED (2026-10-03, owner finding). Reading a label spends
 * a model call, so `POST /api/analyze-label` takes the same Google-required gate
 * as `POST /api/scan` (server: `SCAN_REQUIRE_AUTH`; browser: the same Google
 * sign-in card and bearer token, see components/label-analyzer.tsx). That is
 * identity, not a budget: any Google account can use it, there is no per-user
 * quota or allow-list. Do not mistake the page being unlisted for either.
 * (`scan-workspace.css` is imported only for the sign-in card's states.)
 */

export const metadata: Metadata = {
  title: "Tester",
  // The layout already sets index:false site-wide; restated so the intent
  // survives a change to the global config.
  robots: { index: false, follow: false, nocache: true },
};

export default function TesterPage() {
  const runs = loadRetainedRuns();
  const validatedRuns = runs.filter((run) => run.run.validity.status.toLowerCase() === "validated");
  const archiveRuns = runs.filter((run) => run.run.validity.status.toLowerCase() !== "validated");
  const studies = runs.reduce((total, run) => total + (run.extraction.targeted ?? 0), 0);
  const scored = runs.reduce(
    (total, run) => total + run.outcomes.filter((outcome) => outcome.displayScore !== null).length,
    0,
  );

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="analyze-hero" id="analyze">
        <div className="shell analyze-hero-brand">
          <nav className="breadcrumbs tester-crumbs" aria-label="Breadcrumb">
            <Link href="/">BS Proof</Link>
            <span aria-hidden="true">/</span>
            <span>Tester</span>
          </nav>
          <p className="eyebrow hero-kicker">Internal · not the public page</p>
          <h1>
            BS <em>PROOF</em>
          </h1>
          <p className="tester-lede">
            Scan a label and get that product&rsquo;s rows. The retained runs behind every number
            are below &mdash; this page carries both, which the public front door deliberately does
            not.
          </p>
        </div>
        <div className="shell analyze-hero-body">
          <LabelAnalyzer />
        </div>
        <div className="shell hero-ledger" aria-label="Dashboard totals">
          <div>
            <strong>{runs.length}</strong>
            <span>Retained run{runs.length === 1 ? "" : "s"}</span>
          </div>
          <div>
            <strong>{studies}</strong>
            <span>Study records</span>
          </div>
          <div>
            <strong>{scored}</strong>
            <span>Scored outcomes</span>
          </div>
          <div>
            <strong>4</strong>
            <span>Visible scoring arcs</span>
          </div>
        </div>
      </section>

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
