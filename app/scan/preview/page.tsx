import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ScanReport } from "@/components/scan-report";
import { analyzeScan } from "@/lib/analyze/scan";
import { SCENARIOS, type ScenarioName } from "@/tests/fixtures/scan-fakes";

/*
 * DEVELOPMENT-ONLY PREVIEW of the scan report.
 *
 * The real /scan needs a model key and a photo, and a DeepSeek round trip
 * takes 20-60 s, so iterating on the RESULT view against production was slow
 * and cost a metered call per glance. This page runs the real orchestrator
 * (lib/analyze/scan.ts) over the test fakes -- fake label read, fake text
 * model, fake openFDA / Europe PMC -- and renders the real <ScanReport>.
 * Zero model calls, zero network, and the same code path the upload uses.
 *
 * It is a 404 in production: `notFound()` before anything renders, and the
 * route is force-dynamic so the production build does not prerender it. The
 * fakes live in tests/fixtures/scan-fakes.ts and are shared with the unit and
 * render tests, so a scenario shown here is a scenario that is tested.
 *
 *   /scan/preview/                 creatine monohydrate (the measured path)
 *   /scan/preview/?case=magnesium  no run -> model orientation
 *   /scan/preview/?case=shilajit   out of vocabulary
 *   /scan/preview/?case=recall     a firm with an FDA recall on file
 *   /scan/preview/?case=nomodel    a keyless deployment
 *   /scan/preview/?case=notlabel   not a supplement label
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan preview",
  robots: { index: false, follow: false, nocache: true },
};

function isScenario(value: string | undefined): value is ScenarioName {
  return value !== undefined && Object.hasOwn(SCENARIOS, value);
}

export default async function ScanPreviewPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const name: ScenarioName = isScenario(params.case) ? params.case : "creatine";
  const data = await analyzeScan("aW1n", "image/png", SCENARIOS[name]());

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="analyze-hero" id="scan">
        <div className="shell analyze-hero-brand">
          <nav className="breadcrumbs tester-crumbs" aria-label="Breadcrumb">
            <Link href="/">BS Proof</Link>
            <span aria-hidden="true">/</span>
            <Link href="/scan">Scan</Link>
            <span aria-hidden="true">/</span>
            <span>Preview</span>
          </nav>
          <p className="eyebrow hero-kicker">Development preview · fake model, real code path</p>
          <h1>
            BS <em>PROOF</em>
          </h1>
          <p className="tester-lede">
            Scenario: <strong>{name}</strong>. Others:{" "}
            {(Object.keys(SCENARIOS) as ScenarioName[])
              .filter((k) => k !== name)
              .map((k, i, all) => (
                <span key={k}>
                  <Link href={`/scan/preview/?case=${k}`}>{k}</Link>
                  {i < all.length - 1 ? " · " : ""}
                </span>
              ))}
          </p>
        </div>
        <div className="shell analyze-hero-body">
          <section className="la scan" aria-label="Preview of a scan result">
            <ScanReport data={data} />
          </section>
        </div>
      </section>
    </main>
  );
}
