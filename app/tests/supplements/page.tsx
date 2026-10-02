import type { Metadata } from "next";
import AbPrototype from "@/components/evidence-ledger/ledger-lab-card";

export const metadata: Metadata = {
  title: "Supplement tests",
  description: "Experimental supplement result cards using saved AI research. Not human-verified.",
  robots: { index: false, follow: false, nocache: true },
};

/** Public, unlisted test page. Existing scanner and development gates are untouched. */
export default function SupplementTestsPage() {
  return <AbPrototype publicTest />;
}
