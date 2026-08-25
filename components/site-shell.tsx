import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <div className="shell header-inner">
          {/* "BS Proof home", not "...dashboard home". The 404 page's only
              recovery control is "Back to dashboard"; a wordmark whose
              accessible name also contained "dashboard" made that link
              ambiguous on every page. */}
          <Link className="wordmark" href="/" aria-label="BS Proof home">
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
          <nav aria-label="Primary navigation">
            <Link href="/methodology">Methodology</Link>
          </nav>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <p>Evidence made inspectable. Scores are not medical advice.</p>
        <p>BS Proof · retained laboratory artifacts</p>
      </div>
    </footer>
  );
}
