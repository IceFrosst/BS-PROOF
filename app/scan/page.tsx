import type { Metadata } from "next";

import { ScanFlow } from "@/components/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";

/*
 * THE PRODUCT SURFACE: scan a label, get the full analysis.
 *
 * REDESIGNED 2026-09-16 (founder: "use your eyes" -- match
 * https://bsproof.lovable.app's dark, camera-first look). The page itself is
 * now a thin shell: <ScanFlow> owns the "Search your supplement" button, the
 * live camera block (with the page's single H1 as an overlay on the block,
 * `#scan-title`), the shutter, the upload fallback, the results, and the
 * Google-sign-in-while-loading flow. This file keeps only the persistent
 * page chrome (the methodology link) and the dark scoping class.
 *
 * The page's white-to-dark ground is scoped by `body:has(.scan-page)` in
 * globals.css so the shared header stays -- restyled dark here -- for the
 * skip link, the home link and the methodology nav link, without touching
 * the root layout or any other route.
 *
 * Still absent from site navigation like /tester (site-wide robots noindex).
 * The 2026-09-14 PWA decision makes this the public manifest's installed
 * start_url while keeping the browser front door at / as the waitlist.
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
        <ScanFlow catalog={catalog} />
      </section>
    </main>
  );
}
