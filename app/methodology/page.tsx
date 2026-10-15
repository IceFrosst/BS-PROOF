import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology" };

/* The method is being validated (2026-10-15): this page says what the grade
 * will be and that no product carries one yet. The full method is
 * docs/METHOD.md; the retired v14 score is docs/history/v14-scoring-model.md. */
export default function MethodologyPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="shell article-hero">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Methodology</span></nav>
        <p className="eyebrow">Reader’s guide</p>
        <h1>How we will grade<br /><em>the evidence.</em></h1>
        <p className="article-lede">Evidence grades are not active yet. We are checking our method against published meta-analyses before any product gets a grade.</p>
      </div>

      <div className="shell">
        <article className="methodology-article">
          <section>
            <h2>The method</h2>
            <p>
              We follow the way a systematic review works, automated and per product. For each outcome a supplement
              claims to help — strength, sleep, mood — we:
            </p>
            <ol>
              <li>find the randomised trials that tested the ingredient against a real control;</li>
              <li>read the numbers each trial reports, and check every number against the sentence or table it came from;</li>
              <li>combine the trials into one estimate of the effect, with its uncertainty (a random-effects meta-analysis);</li>
              <li>rate how sure that estimate is (GRADE: study quality, consistency, precision, and how well the trials match your product’s form and dose);</li>
              <li>give a letter that combines how big the benefit is with how sure we are, always shown with those parts.</li>
            </ol>
            <p>A language model only reads the papers. Every judgement above is fixed, published arithmetic.</p>
          </section>
          <section>
            <h2>Why there is no grade yet</h2>
            <p>
              Before a grade means anything, our combined estimates have to agree with the published meta-analyses on
              the same question. That check does not pass yet for enough outcomes, so no product is graded today.
              Until it does, a scan shows what the label says and background clearly marked as unverified.
            </p>
            <div className="method-example">
              <strong>What “unverified” means.</strong> Sections with that badge are what a language model recalls from
              its training. They are shown for orientation only and never become a grade.
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
