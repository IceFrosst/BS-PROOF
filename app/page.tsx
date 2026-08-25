import { WaitlistForm } from "@/components/waitlist-form";

/*
 * THE PUBLIC FRONT DOOR. One thing on it: the waitlist.
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
 * This route no longer reads the catalog at all, so it renders the same
 * whether or not any artifact is present.
 */

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="analyze-hero waitlist-only" id="waitlist">
        <div className="shell analyze-hero-brand">
          <p className="eyebrow hero-kicker">Supplement evidence, with the seams showing</p>
          <h1>
            BS <em>PROOF</em>
          </h1>
        </div>
        <div className="shell analyze-hero-body">
          <WaitlistForm source="qr" />
        </div>
      </section>
    </main>
  );
}
