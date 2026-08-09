import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bs-proof.vercel.app"),
  title: { default: "BS Proof · Evidence dashboard", template: "%s · BS Proof" },
  description: "Inspect retained supplement evidence runs, outcome scores, scoring arcs, quality limits, and source reports.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
