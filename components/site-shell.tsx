"use client";

import Link from "next/link";

import { FLOW_COPY } from "@/lib/i18n/copy/flow";
import { useScanLang } from "@/lib/i18n/locale";

/* The shared chrome follows the persisted EN/LT choice ONLY on the /scan
 * workspace (2026-10-03 localization). Every other route -- the waitlist, the
 * methodology page -- is English-only, so it must not flip because someone
 * chose Lithuanian in the scan. */
function useChromeCopy() {
  return FLOW_COPY[useScanLang()];
}

export function SiteHeader() {
  const t = useChromeCopy();
  return (
    <>
      <a className="skip-link" href="#main-content">{t.skipLink}</a>
      <header className="site-header">
        <div className="shell header-inner">
          {/* "BS Proof home", not "...dashboard home". The 404 page's only
              recovery control is "Back to dashboard"; a wordmark whose
              accessible name also contained "dashboard" made that link
              ambiguous on every page. */}
          <Link className="wordmark" href="/" aria-label={t.homeLabel}>
            <span aria-hidden="true" className="wordmark-mark">B·S</span>
            <span>Proof</span>
          </Link>
          {/* "Runs" pointed at "/", which since 2026-08-25 is the waitlist and
              carries no runs at all -- a nav item promising a run archive and
              delivering an email field. The archive moved to /tester, and the
              nav cannot link there: /tester is unlisted, and a header link on
              every public page would hand it to the audience it excludes.

              Methodology stays. It is a public explainer, it makes sense to
              somebody who has just been asked for their email, and it is the
              one page that says what the score would even mean. */}
          <nav aria-label={t.primaryNav}>
            <Link href="/methodology">{t.methodology}</Link>
          </nav>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  const t = useChromeCopy();
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <p>{t.footerLine1}</p>
        <p>{t.footerLine2}</p>
      </div>
    </footer>
  );
}
