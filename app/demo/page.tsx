import type { Metadata } from "next";

import { ScanFlow } from "@/components/scan/scan-flow";
import { ingredientCatalog } from "@/lib/analyze/catalog";
import { DEMO_PRODUCTS } from "@/lib/demo/products";

/* The pitch demo: /scan's own flow on two sample labels with recorded
 * answers (lib/demo/products.ts). Works offline of every service. */
export const metadata: Metadata = {
  title: "Demo",
  robots: { index: false, follow: false, nocache: true },
};

export default function DemoPage() {
  return (
    <main id="main-content" tabIndex={-1} className="scan-page">
      <section className="shell scan-hero" id="scan" aria-labelledby="scan-title">
        <ScanFlow catalog={ingredientCatalog()} demo={DEMO_PRODUCTS} />
      </section>
    </main>
  );
}
