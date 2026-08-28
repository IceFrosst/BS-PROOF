import Link from "next/link";

import { WaitlistForm } from "@/components/waitlist-form";

/*
 * THE PUBLIC FRONT DOOR. One action on it: the waitlist.
 *
 * Founder, 2026-08-25: "The only thing that needs to be on the main page for
 * now is just the waitlist." So the scanner, the run archive, the totals strip
 * and the methodology promo are all gone from here — not hidden behind a flag,
 * not moved below the fold. Everything a tester or board member needs lives at
 * /tester, which carries the analyzer and the full run archive.
 *
 * Why the archive left too, since it was the honest provenance for every
 * number: there are no numbers on this page any more. Provenance for a claim
 * we are not making is just a second thing competing for the ten seconds
 * somebody gives a QR code, and the run cards say "invalid" and "not approved
 * for public claims" — true, necessary on a page that shows scores, and
 * actively confusing on a page that only asks for an email.
 *
 * REDESIGNED 2026-08-28 (founder: the page was "too compact" and "from mobile
 * it looks like shit"). One action is not the same as one screen of text, and
 * what was here was one dense dark block: a two-line shouty kicker, a wall of
 * five-line body copy, an email field, and then a footer floating in an empty
 * half-page. Three things changed and each is a reason, not a preference:
 *
 * 1. THE KICKER IS GONE. It read "Supplement evidence, with the seams showing"
 *    — a metaphor about showing your working that the founder read and could
 *    not parse, which is the only test a tagline has to pass. The page now
 *    opens with the question the visitor actually arrived with ("Does that
 *    supplement actually do anything?") and answers it in one sentence.
 * 2. THE EXPLANATION IS PACED, not compressed. The old paragraph carried the
 *    input, the method, the differentiator and the ask in one breath. It is now
 *    four beats — ask, how it works, why a product score differs from an
 *    ingredient score, where the project honestly stands — so a phone reader
 *    meets one idea per screen instead of all four at once.
 * 3. THE PAGE HAS A BOTTOM. With one short section the footer sat mid-viewport
 *    above a blank half-page on desktop; the extra beats plus the sticky-footer
 *    rule in globals.css mean the ground now reaches the fold on every size.
 *
 * This route still reads no catalog at all, so it renders the same whether or
 * not any artifact is present, and it still offers no scanner and no link to
 * /tester (pinned by tests/e2e/front-door.spec.ts).
 */

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="front-hero" id="waitlist">
        <div className="shell front-hero-inner">
          <p className="eyebrow front-kicker">Early access · opening soon</p>
          <h1 className="front-wordmark">
            BS <em>PROOF</em>
          </h1>
          <p className="front-ask">Does that supplement actually do anything?</p>
          <p className="front-answer">
            Photograph the label. We score that exact product against the clinical trials that
            tested it — and show you every study behind the number.
          </p>

          <div className="front-form">
            <WaitlistForm source="qr" />
          </div>

          <a className="front-scroll" href="#how">
            See how it works
          </a>
        </div>
      </section>

      <section className="section front-steps" id="how" aria-labelledby="how-heading">
        <div className="shell">
          <div className="front-heading">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading">Three steps, one photo</h2>
          </div>
          <ol className="front-step-grid">
            <li className="front-step">
              <span className="front-step-n" aria-hidden="true">
                1
              </span>
              <h3>Snap the label</h3>
              <p>
                One photo of the Supplement Facts panel. That is the whole input — no typing, no
                account, no shopping list.
              </p>
            </li>
            <li className="front-step">
              <span className="front-step-n" aria-hidden="true">
                2
              </span>
              <h3>We match the trials</h3>
              <p>
                We find the trials that tested that ingredient, in that form, near that dose — and
                discount the ones that tested something else.
              </p>
            </li>
            <li className="front-step">
              <span className="front-step-n" aria-hidden="true">
                3
              </span>
              <h3>You get the receipts</h3>
              <p>
                A score for each health outcome, with the studies, the doses and the limitations
                readable underneath it.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-tint front-why" aria-labelledby="why-heading">
        <div className="shell">
          <div className="front-heading">
            <p className="eyebrow">Why it is different</p>
            <h2 id="why-heading">Everyone rates the ingredient. You bought a product.</h2>
          </div>
          <div className="front-compare">
            <article className="front-compare-card">
              <p className="front-compare-tag">The usual rating</p>
              <p>
                Creatine is well studied, so every creatine tub gets the same tick — whatever form
                it uses, and however much of it is actually in a scoop.
              </p>
            </article>
            <article className="front-compare-card front-compare-ours">
              <p className="front-compare-tag">What we score</p>
              <p>
                Your label says <strong>creatine monohydrate 4,400&nbsp;mg</strong>. That is
                <strong> 3,868&nbsp;mg</strong> of actual creatine — and some of the trials behind
                the headline used four times that.
              </p>
            </article>
          </div>
          <p className="front-punchline">
            Same ingredient. Different product. Often a different answer.
          </p>
        </div>
      </section>

      <section className="section front-status" aria-labelledby="status-heading">
        <div className="shell front-status-inner">
          <div>
            <p className="eyebrow">Where this is at</p>
            <h2 id="status-heading">Honest about the stage</h2>
          </div>
          <div>
            <p>
              The scoring pipeline is built and runs today on retained research runs. The label
              scanner opens to a small group of testers first, then to the waitlist. Every score is
              research output — not medical advice, and not yet approved for public claims.
            </p>
            <p className="front-status-actions">
              <a className="button button-dark" href="#waitlist">
                Join the waitlist
              </a>
              <Link className="front-status-link" href="/methodology">
                Read the methodology
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
