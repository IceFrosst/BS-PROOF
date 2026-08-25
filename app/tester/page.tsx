import type { Metadata } from "next";
import Link from "next/link";

import { LabelAnalyzer } from "@/components/label-analyzer";

/*
 * THE TESTER SURFACE. Scanning lives here and nowhere else.
 *
 * Founder, 2026-08-25: the public front door is the waitlist, and the analyzer
 * is for "testers who are like developers and our board members" — the two
 * audiences must not be mixed.
 *
 * Separate ROUTE rather than a flag on the homepage, deliberately. A toggle
 * that can put the scanner back in front of the public is a toggle that
 * eventually does: someone sets it to debug, a deploy carries it, and the
 * front door quietly changes for everyone. A route cannot be switched on by
 * accident — reaching it means typing it.
 *
 * WHAT THIS IS NOT: protected. It is unlisted (no link from the nav, and the
 * whole site is already `robots: index false`), which keeps it out of search
 * and out of a casual visitor's way. It does NOT stop anyone who knows or
 * guesses the URL. Nothing here is a secret — it is the same analyzer over the
 * same public artifacts — but if the requirement is ever "only these people",
 * that needs real auth, and this comment is here so nobody mistakes obscurity
 * for it later.
 */

export const metadata: Metadata = {
  title: "Tester",
  // Belt and braces: the layout already sets index:false site-wide, and this
  // page states it again so the intent survives a change to the global one.
  robots: { index: false, follow: false, nocache: true },
};

export default function TesterPage() {
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
            Scan a label and get that product&rsquo;s rows. Same pipeline, same retained runs as the
            archive below &mdash; this page just exposes the analyzer, which the public front door
            does not.
          </p>
        </div>
        <div className="shell analyze-hero-body">
          <LabelAnalyzer />
        </div>
      </section>

      <section className="section shell">
        <p className="tester-foot">
          Every retained run is <code>public_claims_allowed: false</code>. Numbers here are for
          inspection, not for claims &mdash; the same rule the run pages state.{" "}
          <Link href="/">Public page</Link> · <Link href="/methodology/">Methodology</Link>
        </p>
      </section>
    </main>
  );
}
