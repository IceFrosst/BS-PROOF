import type { Metadata } from "next";
import Link from "next/link";

import { ScanFlow } from "@/components/scan-flow";

/*
 * THE PRODUCT SURFACE: scan a label, get the full analysis.
 *
 * Unlisted like /tester (no nav link, site is robots noindex). The founder's
 * front-door decision of 2026-08-25 -- the public page is the waitlist alone --
 * still stands; wiring this page into the front door is one link in
 * app/page.tsx, and tests/e2e/front-door.spec.ts will say so when it happens.
 */
export const metadata: Metadata = {
  title: "Scan",
  robots: { index: false, follow: false, nocache: true },
};

export default function ScanPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="analyze-hero" id="scan">
        <div className="shell analyze-hero-brand">
          <nav className="breadcrumbs tester-crumbs" aria-label="Breadcrumb">
            <Link href="/">BS Proof</Link>
            <span aria-hidden="true">/</span>
            <span>Scan</span>
          </nav>
          <p className="eyebrow hero-kicker">Scan · full product analysis</p>
          <h1>
            BS <em>PROOF</em>
          </h1>
          <p className="tester-lede">
            Evidence, dose, form, combination and company &mdash; from one photo of the label. Every block says where
            it came from, and only the evidence run produces a number.
          </p>
        </div>
        <div className="shell analyze-hero-body">
          <ScanFlow />
        </div>
      </section>

      <section className="section shell methodology-promo">
        <p className="eyebrow">Read the score correctly</p>
        <div>
          <h2>One number is not the evidence.</h2>
          <p>
            The score sits beside effect, form, dose and evidence arcs, and a model&rsquo;s recollection about a
            company is never typeset like a measurement.
          </p>
          <Link href="/methodology">
            How the score is built <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
