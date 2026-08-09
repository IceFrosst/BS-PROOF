import Link from "next/link";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <div className="shell header-inner">
          <Link className="wordmark" href="/" aria-label="BS Proof dashboard home">
            <span aria-hidden="true" className="wordmark-mark">B·S</span>
            <span>Proof</span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/">Runs</Link>
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
