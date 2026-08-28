import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology" };

const arcs = [
  ["01", "Effect", "Direction and magnitude retained for the outcome."],
  ["02", "Form", "How closely the studied supplement form matches the product form."],
  ["03", "Dose", "How closely the studied exposure matches the target dose context."],
  ["04", "Evidence", "Evidence quantity or confidence coverage, kept distinct from effect direction."],
];

export default function MethodologyPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="shell article-hero">
        {/* "Runs", not "Home", until 2026-08-28 -- but "/" stopped being the run
            archive on 2026-08-25 and is now the waitlist, so the crumb promised
            an archive and delivered an email field. The archive lives at
            /tester, which this page cannot link to (unlisted is the whole
            mechanism), so the crumb says where it actually goes. */}
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Methodology</span></nav>
        <p className="eyebrow">Reader’s guide</p>
        <h1>A score with its<br /><em>working visible.</em></h1>
        <p className="article-lede">The dashboard is an inspection layer over retained pipeline outputs. It does not recompute scores, fill missing values, or promote historical runs into product claims.</p>
      </div>

      <div className="shell methodology-layout">
        <aside className="methodology-index" aria-label="On this page">
          <a href="#how">How a score is computed</a><a href="#score">Composite</a><a href="#arcs">Four arcs</a><a href="#gating">Evidence gate</a><a href="#validity">Validity</a><a href="#limits">Display limits</a>
        </aside>
        <article className="methodology-article">
          <section id="how">
            <p className="eyebrow">Plain language</p>
            <h2>How a score is computed</h2>
            <p>
              Every number on this site is built the same way, in five steps.
              Nothing below is a metaphor — each step names the real rule the
              pipeline runs, with the constants it actually uses.
            </p>

            <h3>1. Every study casts one vote, between −1 and +1</h3>
            <p>
              +1 means &ldquo;this trial is strong evidence the ingredient
              delivers a benefit big enough to matter&rdquo;; −1 means strong
              evidence of harm; around −0.35 means &ldquo;a well-run trial
              looked and found nothing worth buying.&rdquo; A study never votes
              twice: a trial that measured six versions of the same endpoint is
              still one vote.
            </p>

            <h3>2. The vote comes from the measured effect when the paper gives one</h3>
            <p>
              If the paper reports a usable effect size, the vote is that
              number placed on a &ldquo;big enough to matter&rdquo; scale: an
              effect below 0.2 standard deviations (or under a 2% relative
              change) is smaller than anyone would notice, so it counts
              <em> against</em>; around 0.5 is solidly useful; 0.8 or more is a
              full +1. The scale is centred on &ldquo;worth buying&rdquo;, not
              on zero — a trial that measured exactly nothing votes about
              −0.33, almost the same as a plain null, which is deliberate.
            </p>
            <div className="method-example">
              <strong>Example — the fix that motivated this scale.</strong>{" "}
              A trial finds creatine improved strength by 0.43 standard
              deviations, but with too few participants to reach statistical
              significance. The old rule filed it as a null: −0.35, evidence{" "}
              <em>against</em>. The measured rule reads the size: +0.38,
              evidence <em>for</em>. Same paper, opposite vote — and the
              published meta-analyses agree with the second reading.
            </div>
            <div className="method-example">
              <strong>Same label, opposite votes.</strong> Two trials both
              report &ldquo;no significant difference.&rdquo; One measured a
              6.1% improvement (p&nbsp;=&nbsp;0.09): it votes <em>+0.68</em>.
              The other measured 0.3% (p&nbsp;=&nbsp;0.81): it votes{" "}
              <em>−0.28</em>, because a difference nobody would notice is
              evidence against a meaningful effect. When a paper prints no
              usable number, the direction label decides instead (benefit
              +1 or +0.3, null −0.35, harm −1). The &ldquo;More info&rdquo;
              panel on every outcome shows which basis each study used.
            </div>

            <h3>3. Votes are weighted by how much the study can be trusted</h3>
            <p>
              Design (a randomised trial outweighs a case report ~250:1), risk
              of bias, size, funding independence, and whether we read the full
              text or only the abstract. A large, independent, low-bias RCT
              read in full carries roughly forty times the weight of a tiny
              abstract-only trial. The weighted average of all votes, times
              100, is the <strong>signed score</strong> (−100…+100); strong
              disagreement between studies trims it further.
            </p>

            <h3>4. Confidence is how much evidence exists — it multiplies, never averages</h3>
            <p>
              One weak trial gives confidence near zero; around thirty solid
              full-text studies approach certainty. It multiplies the final
              number because if we barely know anything, nothing else should
              matter: a perfect-looking result from one small trial must not
              score like a replicated literature.
            </p>

            <h3>5. The displayed 0–100 answers three questions at once</h3>
            <p>
              <strong>Does it work?</strong> (the signed verdict over all
              evidence) · <strong>Was your form tested?</strong> (the best
              three non-negative studies in your exact form, ranked by
              evidence hierarchy: an umbrella review in your form scores 1.0,
              an RCT 0.8, an animal study 0.1) ·{" "}
              <strong>Is your dose in the range that worked?</strong> (how
              close your dose sits to the doses at which trials actually found
              benefit). The composite is the average of those three, times
              confidence.
            </p>
            <div className="method-example">
              <strong>Worked example.</strong> An outcome where the evidence
              leans mildly positive (+0.30), your form has solid RCT backing
              (0.80), and your dose sits just under the range that worked
              (closeness 0.85), with good confidence (0.80), scores{" "}
              <em>61 / 100</em>. Identical evidence but a dose far below where
              benefits occurred (closeness 0.10) scores <em>41</em> — the
              same science, honestly re-priced for <em>your</em> bottle.
              Creatine power is the live case: benefits were shown at 20 g
              loading doses, so a 4.4 g product is scored against that fact
              rather than credited for it.
            </div>
            <div className="method-example">
              <strong>What a low score does NOT mean.</strong> 50 means
              &ldquo;no effect either way&rdquo;, not &ldquo;half good.&rdquo;
              A well-studied useless product lands near 0–25 <em>with a full
              evidence ring</em>; a barely-studied one lands low <em>with an
              empty evidence ring</em>. The ring is what tells those two
              stories apart — the number alone never could.
            </div>
          </section>
          <section id="score"><p className="eyebrow">Composite</p><h2>The displayed score</h2><p>The 0–100 composite is the run’s retained display field. The signed internal score is preserved separately for audit. This site never derives one from the other and never averages discrepancies.</p></section>
          <section id="arcs"><p className="eyebrow">Four-ring model</p><h2>Every score carries four arcs</h2><div className="arc-method-grid">{arcs.map(([number, name, description]) => <div key={number}><span>{number}</span><h3>{name}</h3><p>{description}</p></div>)}</div><p>Exact verdict and coverage values appear beside the graphic. A blank verdict remains an em dash; zero coverage is shown only when the artifact explicitly records zero.</p></section>
          <section id="gating"><p className="eyebrow">Evidence gate</p><h2>Unavailable is not zero</h2><p>When the pipeline’s evidence gate fires, the dashboard shows an em dash instead of a score. That means “not scored under this run’s rules,” not “no effect.”</p></section>
          <section id="validity"><p className="eyebrow">Validity registry</p><h2>Status travels with the run</h2><p>Validated, experimental, and invalid are run-level states. Invalid historical artifacts remain useful for extraction audits, but their scores must not be used as product claims. A reconciliation check compares dashboard-critical values with the retained lab context when both are present.</p></section>
          <section id="limits"><p className="eyebrow">Display limits</p><h2>What we deliberately do not imply</h2><ul><li>The corpus is run-level unless the artifact explicitly retains per-outcome attribution.</li><li>No forest plot is constructed without study-level effect sizes and uncertainty.</li><li>No dose-response curve is inferred from categorical dose applicability.</li><li>Missing telemetry is labeled unavailable. A recorded $0 subscription marginal spend remains $0, while absent API-equivalent cost and token counts remain unavailable.</li><li>These reports are evidence-system outputs, not medical advice.</li></ul></section>
        </article>
      </div>
    </main>
  );
}
