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
 * REWRITTEN 2026-08-28 (founder: the page was "too compact" and "from mobile
 * it looks like shit"). What was here was one dark block: a two-line shouty
 * kicker reading "Supplement evidence, with the seams showing", a five-line
 * paragraph, an email field, and then a footer floating above an empty half
 * page. Two things changed:
 *
 * 1. THE KICKER IS GONE. A metaphor about showing your working that the
 *    founder read and could not parse, which is the only test a tagline has to
 *    pass. The page now opens with the question the visitor actually arrived
 *    with and answers it in one sentence.
 * 2. THE COPY IS PACED, not compressed — a question, an answer, the ask —
 *    each capped in ch so no line runs past comfortable reading width on a
 *    phone. The old paragraph ran a full 560px column at 0.92rem, which is
 *    ~62 characters on a phone and the reason it read as a wall.
 *
 * TRIMMED BACK the same day, also on the founder's call: an explanatory pass
 * below the fold (how it works / why a product score / project status) is
 * gone, and the "see how it works" cue with it — a scroll cue pointing at
 * nothing is worse than no cue. So the page is one screen again, deliberately:
 * the hero stretches to fill the viewport (see .front-hero in globals.css)
 * rather than stopping halfway down with paper underneath it.
 *
 * This route still reads no catalog at all, so it renders the same whether or
 * not any artifact is present, and it still offers no scanner and no link to
 * /tester (pinned by tests/e2e/front-door.spec.ts).
 */

export default function HomePage() {
  return (
    <main className="front-main" id="main-content" tabIndex={-1}>
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
        </div>
      </section>
    </main>
  );
}
