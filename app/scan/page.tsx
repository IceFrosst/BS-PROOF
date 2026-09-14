import type { Metadata } from "next";
import Link from "next/link";

import { ScanFlow } from "@/components/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";

/*
 * THE PRODUCT SURFACE: scan a label, get the full analysis.
 *
 * REDESIGNED 2026-09-15 (founder-approved option 1): pure white, phone-first,
 * and scanning owns the first viewport -- the transparent scanner mark, one
 * concise headline, "Take a photo" as the primary action, "Upload an image" as
 * the secondary, then an "or" divider and the expandable "Search for your
 * supplement" control for people without the tub in front of them. The
 * catalog behind that search is derived on the server from vocab/form.json at
 * render time and handed to the client as a prop, so the browser holds no
 * second copy of the vocabulary.
 *
 * Still absent from site navigation like /tester (site-wide robots noindex).
 * The 2026-09-14 PWA decision makes this the public manifest's installed
 * start_url while keeping the browser front door at / as the waitlist. The
 * page's white ground is scoped by `body:has(.scan-page)` in globals.css so
 * the shared header stays -- minimal and white here -- for the skip link, the
 * home link and the methodology link, without touching the root layout.
 */
export const metadata: Metadata = {
  title: "Scan",
  robots: { index: false, follow: false, nocache: true },
};

export default function ScanPage() {
  const catalog = ingredientCatalog();
  return (
    <main id="main-content" tabIndex={-1} className="scan-page">
      <section className="shell scan-hero" id="scan" aria-labelledby="scan-title">
        {/* Same artwork as the app icon, minus its ink ground (scripts/write_scan_mark.mjs). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="scan-mark" src="/scan-mark.svg" alt="" width={512} height={512} aria-hidden="true" />
        <h1 id="scan-title" className="scan-headline">
          Does it actually work?
        </h1>
        <p className="scan-sub">Scan the Supplement Facts panel. Every part of the answer says where it came from.</p>
        <ScanFlow catalog={catalog} />
      </section>

      <p className="shell scan-foot">
        Only the evidence run produces a number; a model&rsquo;s recollection never does.{" "}
        <Link href="/methodology">How the score is built</Link>
      </p>
    </main>
  );
}
