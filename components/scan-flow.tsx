"use client";

/*
 * THE SCAN. Photograph a label with a LIVE camera viewfinder -- or upload a
 * photo, or search for the supplement by name -- and get the product's full
 * analysis: the evidence verdicts with their four arcs, dose effectiveness,
 * form and ingredient compatibility, and the company's background -- every
 * block stamped with the BASIS it rests on.
 *
 * DESIGN PASS 2026-09-16 (docs/design/2026-09-16-scan-design-system.md).
 * The page is a state machine and each state OWNS the viewport:
 *
 *   landing -> staged -> loading -> result | error
 *
 *   - landing: search pill, live viewfinder (<ScanCamera>, the page's H1 is
 *     its overlay), shutter, upload link.
 *   - staged: the photo and "Scan this label" / Retake / Choose another.
 *   - loading: a progress panel (dimmed thumbnail, stage list with the current
 *     step marked, indeterminate bar). The Google "Save your result" card is
 *     the ONE call to action in it when sign-in is configured. Nothing is
 *     rendered disabled -- a greyed "Scanning…" pill read as broken.
 *   - result / error: the capture chrome is GONE. A compact scanned-product
 *     header (thumbnail or a typed chip, name, "Scan another") sits at the
 *     top, the report follows, and focus + scroll move to it (instant under
 *     prefers-reduced-motion). Previously the result rendered under the
 *     staged photo with no transition and people concluded nothing happened.
 *
 * Camera, search sheet and sign-in behaviour are unchanged from the 2026-09-16
 * camera-first redesign: <ScanCamera> runs whenever nothing is staged and no
 * result is shown; the `capture="environment"` and plain file inputs stay
 * mounted at all times as the fallback path; `useSupabaseSession` gates the
 * "Save your result" card and the blurred/inert result lock; `/api/scan/claim`
 * is called the moment both a session and a `run_id` exist.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. INVARIANT 8: no branch renders a composite without its arcs. A gated row is
 *    an em dash with its arcs still drawn, never a zero. Every arc is its own
 *    full-width row with its VERDICT/VALUE and COVERAGE, so `0.00 @ 0%` and
 *    `-0.70 @ 100%` can never look alike.
 * 2. "not scored" is not "scores badly": an unscored product renders a distinct
 *    non-numeric state.
 * 3. A model-prior sentence is never typeset like a measurement. Every block
 *    carries a basis badge; model knowledge is the one dashed, amber badge and
 *    its text says "unverified".
 * 4. The validity banner is not decoration: it is the first, always-open line
 *    of the "Before you read the score" stack, above every number.
 * 5. TYPED IS NOT READ. A manual entry renders under "What you entered" with
 *    the `user_input` badge; it never shows a read confidence, quoted spans or a
 *    vision model, because none exist. The server says which path ran
 *    (`source`) and the UI keys off that, not off which button was pressed.
 * 6. Sign-in never gates the SCORE: the composite, arcs and dose bands are
 *    computed and held in state identically whether or not the result is
 *    currently visible.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { SaveResultCard } from "@/components/google-sign-in";
import { ScanCamera } from "@/components/scan-camera";
import { SearchSheet } from "@/components/search-sheet";
import { SupplementSearch } from "@/components/supplement-search";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
import { auditPlainEntry, auditPlainText } from "@/lib/evidence-ledger/plain";
import { ledgerFromAudit, score as ledgerScore, type AuditOutcome, type RetainedLedgerAudit } from "@/lib/evidence-ledger";
import { useSupabaseSession } from "@/lib/auth/use-supabase-session";

type Basis = keyof ScanAnalysis["basis_legend"];
type NullableNumber = number | null;

const MAX_BYTES = 12 * 1024 * 1024;

const PHOTO_STAGES = [
  "Reading the label",
  "Converting the printed dose to its active moiety",
  "Matching against retained evidence runs",
  "Checking the FDA enforcement registry",
  "Asking the model about the company and the combination",
];

const MANUAL_STAGES = [
  "Converting the dose you entered to its active moiety",
  "Matching against retained evidence runs",
  "Asking the model what the literature says",
];

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

function pct(value: NullableNumber): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

/*
 * ONE ramp, two usages. Hue is the score (0 red -> 60 amber -> 100 green) and
 * saturation follows evidence coverage, so a weak signal looks deliberately
 * washed. `usage: "text"` keeps the SAME hue and only darkens it: the fill
 * lightness that reads well as a 10px bar fails WCAG 1.4.3 as 22-40px type
 * (measured: amber `#c68f2f` on white is 2.84:1). This is not a second ramp --
 * the hue, and therefore the meaning, is identical.
 */
function scoreSignalColor(score: NullableNumber, signal: NullableNumber, usage: "fill" | "text" = "fill"): string {
  if (score === null || score === undefined) return "var(--sp-mute)";
  const value = Math.max(0, Math.min(100, score));
  const strength = Math.max(0, Math.min(1, signal ?? 0));
  const hue = value <= 60 ? (value / 60) * 42 : 42 + ((value - 60) / 40) * 98;
  const saturation = usage === "text" ? 48 + strength * 32 : 32 + strength * 48;
  const lightness = usage === "text" ? 30 - strength * 4 : 54 - strength * 10;
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function signed(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

function words(value: string): string {
  return value.replace(/_/g, " ");
}

function BasisBadge({ kind, legend }: { kind: Basis; legend: ScanAnalysis["basis_legend"] }) {
  const entry = legend[kind];
  return (
    <span className={`scan-badge scan-badge-${kind}`} title={entry.means}>
      {entry.label}
    </span>
  );
}

function Section({
  id,
  title,
  basis,
  legend,
  children,
}: {
  id: string;
  title: string;
  basis: Basis[];
  legend: ScanAnalysis["basis_legend"];
  children: React.ReactNode;
}) {
  return (
    <section className="scan-section" id={`scan-${id}`} aria-labelledby={`scan-${id}-title`}>
      <header className="scan-section-head">
        <h3 id={`scan-${id}-title`}>{title}</h3>
        <div className="scan-badges" aria-label="Sources used in this section">
          {basis.map((b) => (
            <BasisBadge key={b} kind={b} legend={legend} />
          ))}
        </div>
      </header>
      {children}
    </section>
  );
}

/* One "before you read the score" row: a one-line summary, the full text
 * inside a native <details>. The wrapper keeps the `la-alert la-alert-warn`
 * class every disclosure on this page has always carried (tests key on it). */
function Notice({
  title,
  body,
  lede,
  role,
  ariaLabel,
}: {
  title: string;
  body: string;
  lede?: string;
  role?: "note";
  ariaLabel?: string;
}) {
  return (
    <div className="la-alert la-alert-warn sc-notice" role={role} aria-label={ariaLabel}>
      <details className="sc-notice-details">
        <summary>
          <strong>{title}</strong>
          {lede ? <span className="sc-notice-lede">{lede}</span> : null}
        </summary>
        <p>{body}</p>
      </details>
    </div>
  );
}

/* A short lede for a notice: its first sentence, minus the "Model knowledge —
 * unverified." prefix every model disclosure carries (the badge says that). */
function firstSentence(body: string): string {
  const stripped = body.replace(/^Model knowledge — unverified\.\s*/, "");
  const m = stripped.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : stripped).trim();
}

/* One evidence dimension, one TAPPABLE full-width row (the design-lab A/B card's
 * geometry, shipped here 2026-09-16): label, the plain word production already
 * computes, the signed value and its coverage on line one, a prominent coloured
 * track underneath, and the detail expanding in place below it.
 *
 * INVARIANT 8 lives in this row. The verdict never travels without its
 * coverage: `0.00 @ 0%` is striped and says "untested" in words, while
 * `−0.70 @ 100%` has a full solid track. The identity colour is a scanning aid
 * only; the words carry the meaning.
 *
 * NOT ADOPTED from the lab: its ordinal readouts ("2/4", "Exact match") come
 * from the lab's own rubric, and its reported confidence interval comes from
 * audit prose that carries one. Production's retained runs carry neither, so
 * this row renders the run's real signed verdict and real coverage instead of
 * an invented grade, and draws no interval axis at all rather than an empty one.
 */
function DimensionRow({
  dimension,
  label,
  value,
  word,
  coverage,
  open,
  onToggle,
  children,
}: {
  dimension: "effect" | "form" | "dose" | "evidence";
  label: string;
  value: string;
  word?: string | null;
  coverage: NullableNumber;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const known = coverage !== null && coverage !== undefined;
  const fill = known ? Math.max(0, Math.min(1, coverage)) : 0;
  const untested = known && fill === 0;
  const coverageLabel = !known ? "not recorded" : untested ? "0%, untested" : pct(coverage);
  const detailId = `sc-dim-${dimension}`;
  return (
    <li
      className={`sc-arc sc-arc-${dimension}${untested ? " sc-arc-untested" : ""}${!known ? " sc-arc-unknown" : ""}${open ? " is-open" : ""}`}
      data-dimension={dimension}
    >
      <button
        type="button"
        className="sc-arc-row"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={`${label}${value ? ` verdict ${value},` : ","}${word ? ` ${word},` : ""} coverage ${coverageLabel}`}
        onClick={onToggle}
      >
        <span className="sc-arc-label">{label}</span>
        <span className="sc-arc-word">{word ?? ""}</span>
        {/* The sign is already in the text; the colour only repeats it, so a
            verdict AGAINST cannot be skimmed as one in favour. */}
        <span className="sc-arc-value" data-sign={value.startsWith("\u2212") ? "negative" : "other"}>
          {value}
        </span>
        <span className="sc-arc-cov">
          {!known ? (
            "coverage not recorded"
          ) : untested ? (
            "0% · untested"
          ) : (
            <>
              {pct(coverage)}
              <span className="sc-arc-cov-word"> coverage</span>
            </>
          )}
        </span>
        <span className="sc-arc-chev" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="sc-arc-track" aria-hidden="true">
          <span className="sc-arc-fill" style={{ width: `${fill * 100}%` }} />
        </span>
      </button>
      {open ? (
        <div id={detailId} className="sc-arc-detail">
          {children}
        </div>
      ) : null}
    </li>
  );
}

/* A line of the expanded detail. Every one of these is a fact the retained run
 * (or the label) actually carries -- there is no written audit prose on this
 * path, so nothing here is narrated. */
function DetailLine({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      <b>{term}</b> {children}
    </p>
  );
}

type DoseRange = { low: NullableNumber; high: NullableNumber; basis?: string | null } | null | undefined;
type FormFit = { status: string; form_strength?: NullableNumber; form_basis?: string | null; scored_forms: string[] };

type EvidenceRow = {
  outcome: string;
  outcome_label: string | null;
  polarity?: string | null;
  composite: NullableNumber;
  verdict: string | null;
  n_primaries: NullableNumber;
  applicability?: NullableNumber;
  benefit_dose_range_mg?: DoseRange;
  null_dose_range_mg?: DoseRange;
  arcs: Record<"effect" | "form" | "dose" | "evidence", { verdict: NullableNumber; coverage: NullableNumber; strength?: NullableNumber; closeness?: NullableNumber; basis?: string | null; product_match?: string | null }>;
};

/* Everything the expanded dimension rows may say, gathered from parts of the
 * answer that already exist. Nothing here is computed for the display: each
 * field is read straight off the retained run, the dose section or the
 * compatibility section. */
type RunContext = {
  population?: Record<string, string | null> | null;
  run?: Record<string, unknown> | null;
  doseReadings?: NonNullable<ScanAnalysis["dose_effectiveness"]>["outcomes"] | null;
  scoredDoseMg?: NullableNumber;
  formFit?: FormFit | null;
};

/* The run's population as a plain FACT line. It is never a scored bar: the
 * design-lab card's fifth bar ("Studied in you") comes from a person-fit term
 * this pipeline does not compute, so it is not shown at all here. */
function populationLine(pop: Record<string, string | null> | null | undefined): string | null {
  if (!pop) return null;
  const ages: Record<string, string> = { adult: "adults", older_adult: "older adults", adolescent: "adolescents", child: "children", infant: "infants" };
  const sexes: Record<string, string> = { mixed: "men and women", male: "men", female: "women" };
  const parts: string[] = [];
  const who = [
    pop.health_status && pop.health_status !== "unknown" ? words(pop.health_status) : null,
    pop.age_band ? ages[pop.age_band] ?? words(pop.age_band) : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (who) parts.push(who);
  if (pop.sex && pop.sex !== "unknown") parts.push(sexes[pop.sex] ?? words(pop.sex));
  if (pop.deficiency_status && pop.deficiency_status !== "unknown") parts.push(`${words(pop.deficiency_status)} at baseline`);
  if (pop.pregnancy && pop.pregnancy !== "unknown" && pop.pregnancy !== "not_pregnant") parts.push(words(pop.pregnancy));
  if (!parts.length) return pop.id ? words(pop.id) : null;
  return parts.join(", ");
}

/* The one plain word the dose axis really has: `tone`, computed by
 * lib/analyze/dose-effectiveness.ts. Effect, form strength and evidence mass
 * have no such word in this pipeline, so those rows show none rather than an
 * invented one. */
const DOSE_TONE_WORD: Record<string, string> = {
  in_range: "in range",
  below: "below the range",
  above: "above the range",
  unassessable: "not assessable",
};

function EvidenceCard({ row, context }: { row: EvidenceRow; context: RunContext }) {
  const [open, setOpen] = useState<string | null>(null);
  const gated = row.composite === null;
  const signal = row.arcs.evidence?.coverage ?? null;
  const name = row.outcome_label ?? words(row.outcome);
  const population = populationLine(context.population);
  const reading = context.doseReadings?.find((d) => d.outcome === row.outcome) ?? null;
  const trials = `${row.n_primaries ?? 0} trial${row.n_primaries === 1 ? "" : "s"}`;
  const band = row.benefit_dose_range_mg && row.benefit_dose_range_mg.low !== null ? row.benefit_dose_range_mg : null;
  const nulls = row.null_dose_range_mg && row.null_dose_range_mg.low !== null ? row.null_dose_range_mg : null;
  // A band whose ends are equal is one dose, not a range (presentation only).
  const range = (r: NonNullable<DoseRange>) => (r.low === r.high ? mg(r.low) : `${mg(r.low)}\u2013${mg(r.high)}`);
  // The server's reading sentence opens with the outcome name; the card above
  // already says it, exactly as DoseBar already strips it.
  const readingText = reading ? (reading.reading.startsWith(`${name}: `) ? reading.reading.slice(name.length + 2) : reading.reading) : null;
  const formFit = context.formFit ?? null;
  const run = context.run ?? null;
  const runId = run && typeof run.id === "string" ? run.id : null;
  const scoringModel = run && typeof run.scoring_model === "string" ? run.scoring_model : null;
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));
  return (
    <article className={`scan-card scan-evidence${gated ? " scan-evidence-gated" : ""}`}>
      <header
        className="sc-outcome-headline"
        style={{ "--sc-score-color": scoreSignalColor(row.composite, signal), "--sc-score-text": scoreSignalColor(row.composite, signal, "text") } as CSSProperties}
      >
        <p className="sc-outcome-number" aria-label={gated ? "no composite score" : `${row.composite} out of 100`}>
          <strong>{gated ? "—" : row.composite}</strong>
          <span aria-hidden="true">/100</span>
        </p>
        <div className="sc-outcome-headline-main">
          <h4>{name}</h4>
          <p className="sc-verdict">{row.verdict ?? "no verdict"}</p>
          {population ? (
            <p className="sc-pop">
              <b>Population</b> {population}
            </p>
          ) : null}
        </div>
      </header>
      <ul className="sc-arcs" aria-label="Evidence dimensions">
        <DimensionRow
          dimension="effect"
          label="Does it work?"
          value={signed(row.arcs.effect?.verdict)}
          coverage={row.arcs.effect?.coverage}
          open={open === "effect"}
          onToggle={() => toggle("effect")}
        >
          <p className="sc-arc-what">
            What the trials found overall for this outcome, from −1 (they found harm) to +1 (they found benefit). Coverage is how much of the
            evidence for this outcome could be read that way.
          </p>
          <DetailLine term="Verdict">{signed(row.arcs.effect?.verdict)} over all the evidence.</DetailLine>
          <DetailLine term="Coverage">{row.arcs.effect?.coverage == null ? "not recorded." : pct(row.arcs.effect.coverage)}</DetailLine>
          <DetailLine term="Trials">{trials} read for this outcome.</DetailLine>
          {row.polarity ? (
            <DetailLine term="Direction">
              {row.polarity === "higher_better"
                ? "A higher measurement is the better result here."
                : row.polarity === "lower_better"
                  ? "A lower measurement is the better result here."
                  : words(row.polarity)}
            </DetailLine>
          ) : null}
          <p className="sc-arc-note">This run keeps no pooled estimate or confidence interval, so none is drawn.</p>
        </DimensionRow>

        <DimensionRow
          dimension="form"
          label="In your form?"
          value={signed(row.arcs.form?.verdict)}
          word={formFit && formFit.status !== "unknown" ? words(formFit.status) : null}
          coverage={row.arcs.form?.coverage}
          open={open === "form"}
          onToggle={() => toggle("form")}
        >
          <p className="sc-arc-what">
            What the trials that used your preparation found. Coverage is how much of the evidence was run in your form; the rest used another
            preparation or never said which one.
          </p>
          <DetailLine term="Verdict">{signed(row.arcs.form?.verdict)} over the evidence in your form.</DetailLine>
          <DetailLine term="Coverage">{row.arcs.form?.coverage == null ? "not recorded." : pct(row.arcs.form.coverage)}</DetailLine>
          {row.arcs.form?.strength != null ? (
            <DetailLine term="Form strength">
              {row.arcs.form.strength.toFixed(2)}
              {!row.arcs.form.basis || row.arcs.form.basis === "ladder" ? " on the evidence ladder." : ` (${words(row.arcs.form.basis)}).`}
            </DetailLine>
          ) : null}
          {formFit ? (
            <DetailLine term="Form fit">
              {formFit.status === "exact_form_scored"
                ? "Your form is the form this run scored."
                : formFit.status === "form_not_scored"
                  ? "Your form has not been run. Evidence about another form is not evidence about yours."
                  : formFit.status === "ingredient_not_scored"
                    ? "No evidence run exists for this ingredient yet."
                    : "Form fit unknown."}
              {formFit.scored_forms?.length ? ` Forms run so far: ${formFit.scored_forms.map((f) => words(f)).join(", ")}.` : ""}
            </DetailLine>
          ) : null}
        </DimensionRow>

        <DimensionRow
          dimension="dose"
          label="At your dose?"
          value={signed(row.arcs.dose?.verdict)}
          word={reading ? DOSE_TONE_WORD[reading.tone] ?? words(reading.tone) : null}
          coverage={row.arcs.dose?.coverage}
          open={open === "dose"}
          onToggle={() => toggle("dose")}
        >
          <p className="sc-arc-what">What the trials dosed near your daily amount found. Coverage is how much of the evidence sat in that band.</p>
          <DetailLine term="Verdict">{signed(row.arcs.dose?.verdict)} over the evidence at your dose.</DetailLine>
          <DetailLine term="Coverage">{row.arcs.dose?.coverage == null ? "not recorded." : pct(row.arcs.dose.coverage)}</DetailLine>
          <DetailLine term="Your daily dose">{context.scoredDoseMg == null ? "could not be established from the label." : mg(context.scoredDoseMg)}</DetailLine>
          <DetailLine term="Benefit range">{band ? range(band) : "no trial that found a benefit carried a usable dose."}</DetailLine>
          {nulls ? <DetailLine term="Nothing found at">{range(nulls)}</DetailLine> : null}
          <DetailLine term="Closeness">{row.arcs.dose?.closeness == null ? "not assessable." : row.arcs.dose.closeness.toFixed(2)}</DetailLine>
          {/* The run's own dose tier, kept reachable: it used to sit in the
            * card's footnote line, which the expansions replaced. */}
          {row.arcs.dose?.product_match ? <DetailLine term="Dose match">{words(row.arcs.dose.product_match)}</DetailLine> : null}
          {readingText ? <p className="sc-arc-note">{readingText.charAt(0).toUpperCase() + readingText.slice(1)}</p> : null}
        </DimensionRow>

        <DimensionRow
          dimension="evidence"
          label="Well studied?"
          value=""
          coverage={row.arcs.evidence?.coverage}
          open={open === "evidence"}
          onToggle={() => toggle("evidence")}
        >
          <p className="sc-arc-what">
            How much is known in total: the quality-weighted mass of the trials, which saturates as more good trials arrive. It carries no
            direction, so it never says the ingredient works.
          </p>
          <DetailLine term="Coverage">{row.arcs.evidence?.coverage == null ? "not recorded." : pct(row.arcs.evidence.coverage)}</DetailLine>
          <DetailLine term="Trials">{trials}.</DetailLine>
          {row.applicability != null ? (
            <DetailLine term="Applies to your product">
              {pct(row.applicability)} — the average of the form and dose terms. A positive score is discounted by it.
            </DetailLine>
          ) : null}
          <DetailLine term="Score">
            {gated
              ? "This outcome was gated in the run, so it carries no number."
              : `${row.composite} out of 100, the signed score rescaled and discounted by what applies to your product.`}
          </DetailLine>
          {runId ? (
            <DetailLine term="Source">
              Retained evidence run <code>{runId}</code>
              {scoringModel ? `, scoring model ${scoringModel}` : ""}. Full run parameters are under Technical details.
            </DetailLine>
          ) : null}
        </DimensionRow>
      </ul>
    </article>
  );
}

function auditSourceHref(id: string): string | null {
  const doi = id.match(/10\.\d{4,9}\/[^^\s,;]+/i)?.[0];
  if (doi) return `https://doi.org/${doi.replace(/[.)]+$/, "")}`;
  const pmid = id.match(/PMID[: ]+(\d+)/i)?.[1];
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  const pmc = id.match(/\b(PMC\d+)\b/i)?.[1];
  return pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : null;
}

type AuditConcernNotice = { key: string; title: string; body: string };

/* Retained-audit concerns share the same collapsed warning bundle as product
 * caveats and live literature disclosures. They are disclosures only: neither
 * funding nor publication bias changes score(), and the detailed audit wording
 * plus opened sources remain reachable from each outcome expansion. */
function auditConcernNotices(audit: RetainedLedgerAudit | null): AuditConcernNotice[] {
  if (!audit) return [];
  return audit.audit.outcomes.flatMap((outcome) => {
    const notices: AuditConcernNotice[] = [];
    if (outcome.ledger.gates.allPositiveIndustryOrOneLab) {
      notices.push({
        key: `${outcome.name}:${outcome.population ?? ""}:funding`,
        title: "Funding & independence",
        body: `The retained audit flagged industry funding or one laboratory across the positive evidence for ${outcome.name}. This is a disclosure about the evidence, not a claim that the result is wrong. It does not affect the Evidence Ledger score.`,
      });
    }
    if (outcome.ledger.checklist.publication_bias === "concern") {
      notices.push({
        key: `${outcome.name}:${outcome.population ?? ""}:publication`,
        title: "Publication bias",
        body: `The retained audit recorded a publication-bias concern for ${outcome.name}. Studies with positive findings may be more likely to appear in the published record. This disclosure does not affect the Evidence Ledger score.`,
      });
    }
    return notices;
  });
}

function AuditDetailText({ audit, outcome, dimension }: { audit: RetainedLedgerAudit; outcome: AuditOutcome; dimension: "effect" | "evidence" | "form" | "dose" }) {
  const original = outcome.detail[dimension];
  const plain = auditPlainEntry(audit.plain, outcome);
  return (
    <>
      {(["found", "missing", "move"] as const).map((field) => (
        <DetailLine key={field} term={field === "found" ? "Found" : field === "missing" ? "Missing" : "Would move it"}>
          {auditPlainText(plain, dimension, field, original[field])}
        </DetailLine>
      ))}
      <details className="sc-audit-exact">
        <summary>Exact wording from the audit</summary>
        <DetailLine term="Found">{original.found}</DetailLine>
        <DetailLine term="Missing">{original.missing}</DetailLine>
        <DetailLine term="Would move it">{original.move}</DetailLine>
      </details>
    </>
  );
}

function AuditSourceList({ outcome }: { outcome: AuditOutcome }) {
  return outcome.inventory.length ? (
    <div className="sc-audit-sources">
      <b>Sources opened for this outcome</b>
      {outcome.inventory.map((source) => {
        const href = auditSourceHref(source.id);
        return <span key={`${source.id}-${source.year}`}>{href ? <a href={href} target="_blank" rel="noreferrer">{source.id}</a> : source.id} <small>({source.access})</small></span>;
      })}
    </div>
  ) : null;
}

function AuditDimensionRow({ id, label, value, word, open, onToggle, children }: { id: string; label: string; value: string; word: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <li className={`sc-arc sc-ledger-row sc-arc-${id}${open ? " is-open" : ""}`}>
      <button type="button" className="sc-arc-row" aria-expanded={open} aria-controls={`sc-ledger-${id}`} onClick={onToggle}>
        <span className="sc-arc-label">{label}</span><span className="sc-arc-word">{word}</span><span className="sc-arc-value" data-sign={value.startsWith("−") ? "negative" : "other"}>{value}</span>
        <span className="sc-arc-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      </button>
      {open ? <div id={`sc-ledger-${id}`} className="sc-arc-detail">{children}</div> : null}
    </li>
  );
}

function LedgerOutcomeTabs({ audit }: { audit: RetainedLedgerAudit }) {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const outcomes = audit.audit.outcomes;
  const current = active ? outcomes.find((o) => `${o.name}||${o.population ?? ""}` === active) ?? null : null;
  const scored = outcomes.map((outcome) => ({ outcome, score: ledgerScore(ledgerFromAudit(outcome)) }));
  const numbers = scored.map((x) => x.score.headline).filter((x): x is number => x !== null);
  const general = numbers.length ? Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
  const generalSignal = scored.length ? scored.reduce((sum, x) => sum + x.score.certainty / 4, 0) / scored.length : 0;
  const go = (key: string | null) => { setActive(key); setOpen(null); };
  const render = (outcome: AuditOutcome) => {
    const key = `${outcome.name}||${outcome.population ?? ""}`;
    const result = ledgerScore(ledgerFromAudit(outcome));
    const detail = (dimension: "effect" | "evidence" | "form" | "dose") => <AuditDetailText audit={audit} outcome={outcome} dimension={dimension} />;
    const fitValue = (value: string) => value === "unknown" ? "—" : `${value}/4`;
    const scoreColor = scoreSignalColor(result.headline, result.certainty / 4);
    const scoreTextColor = scoreSignalColor(result.headline, result.certainty / 4, "text");
    return <article className="scan-card scan-evidence sc-ledger-card" key={key}>
      <header className="sc-outcome-headline sc-ledger-headline" style={{ "--sc-score-color": scoreColor, "--sc-score-text": scoreTextColor } as CSSProperties}>
        <p className="sc-outcome-number" aria-label={result.headline === null ? "no ledger score" : `${result.headline} out of 100`}><strong>{result.headline ?? "—"}</strong>{result.headline !== null ? <span aria-hidden="true">/100</span> : null}</p>
        <div className="sc-outcome-headline-main"><h4>{outcome.name}</h4><p className="sc-verdict">{result.label}</p>{outcome.population ? <p className="sc-pop"><b>Population</b> {outcome.population}</p> : null}</div>
      </header>
      <ul className="sc-arcs sc-ledger-arcs" aria-label="Evidence Ledger dimensions">
        <AuditDimensionRow id="effect" label="Effect" value={result.effect === "unclear" ? "—" : `${result.effect > 0 ? "+" : result.effect < 0 ? "−" : ""}${result.effect}`} word={result.effectWord} open={open === `${key}:effect`} onToggle={() => setOpen(open === `${key}:effect` ? null : `${key}:effect`)}>
          <p className="sc-arc-what">The audit&apos;s effect state is shown on its real −3 to +3 scale. It is not a /4 grade.</p>
          <DetailLine term="Plain summary">{auditPlainText(auditPlainEntry(audit.plain, outcome), "summary", "sentence", outcome.sentence)}</DetailLine>
          <DetailLine term="Estimate">{outcome.absolute_effect ?? "No usable interval or point estimate was retained."}</DetailLine>
          <DetailLine term="Meaningful">{outcome.clinically_meaningful ?? "Unknown."}</DetailLine>
          <DetailLine term="Strongest doubt">{outcome.strongest_doubt}</DetailLine>
          {detail("effect")}
          <AuditSourceList outcome={outcome} />
        </AuditDimensionRow>
        <AuditDimensionRow id="certainty" label="Evidence certainty" value={`${result.certainty}/4`} word={result.certaintyWord} open={open === `${key}:certainty`} onToggle={() => setOpen(open === `${key}:certainty` ? null : `${key}:certainty`)}>
          <p className="sc-arc-what">Certainty is calculated from the body type, checklist and gates. Funding and publication bias are disclosed separately and do not change this number.</p>
          <DetailLine term="Gates">{result.firedGates.length ? result.firedGates.join("; ") : "No certainty gate fired."}</DetailLine>
          <DetailLine term="Checklist">{Object.entries(outcome.ledger.checklist).map(([name, state]) => `${words(name)}: ${state}`).join("; ")}</DetailLine>
          {detail("evidence")}
          <AuditSourceList outcome={outcome} />
        </AuditDimensionRow>
        <AuditDimensionRow id="form" label="Form" value={fitValue(outcome.ledger.formFit)} word={result.formWord} open={open === `${key}:form`} onToggle={() => setOpen(open === `${key}:form` ? null : `${key}:form`)}>
          <p className="sc-arc-what">Form fit is the audit&apos;s 0 to 4 preparation match. Unknown is shown as a dash, never as 0/4.</p>
          {detail("form")}<AuditSourceList outcome={outcome} />
        </AuditDimensionRow>
        <AuditDimensionRow id="dose" label="Dose" value={fitValue(outcome.ledger.doseFit)} word={result.doseWord} open={open === `${key}:dose`} onToggle={() => setOpen(open === `${key}:dose` ? null : `${key}:dose`)}>
          <p className="sc-arc-what">Dose fit is the audit&apos;s 0 to 4 comparison with the effective daily range. Unknown is shown as a dash, never as 0/4.</p>
          <DetailLine term="Effective daily range">{outcome.ledger.effective_daily_range}</DetailLine>
          {detail("dose")}<AuditSourceList outcome={outcome} />
        </AuditDimensionRow>
      </ul>
    </article>;
  };
  return <div className="sc-tabs sc-ledger-tabs">
    <div className="sc-tablist" role="tablist" aria-label="Evidence Ledger outcomes">
      <button type="button" className={`sc-tab${active === null ? " sc-tab-selected" : ""}`} role="tab" aria-selected={active === null} onClick={() => go(null)} style={{ "--sc-tab-score": scoreSignalColor(general, generalSignal, "text") } as CSSProperties}>General</button>
      {outcomes.map((o) => { const key = `${o.name}||${o.population ?? ""}`; const tabScore = ledgerScore(ledgerFromAudit(o)); return <button type="button" className={`sc-tab${active === key ? " sc-tab-selected" : ""}`} role="tab" key={key} aria-selected={active === key} onClick={() => go(key)} style={{ "--sc-tab-score": scoreSignalColor(tabScore.headline, tabScore.certainty / 4, "text") } as CSSProperties}>{o.name}</button>; })}
    </div>
    {current ? render(current) : <div className="sc-ledger-general">
      <div className="sc-general" style={{ "--sc-score-color": scoreSignalColor(general, generalSignal), "--sc-score-text": scoreSignalColor(general, generalSignal, "text") } as CSSProperties} role="img" aria-label={general === null ? "General score: no scored outcomes" : `General score ${general}, mean of ${numbers.length} scored outcome scores; not a probability`}><strong className="sc-general-score">{general ?? "—"}</strong><span className="sc-general-name"><strong>General score</strong><small>Mean of {numbers.length} scored outcome score{numbers.length === 1 ? "" : "s"} · not a probability</small></span></div>
      <ul className="sc-outcome-list" aria-label="Evidence Ledger outcomes">{outcomes.map((o) => { const key = `${o.name}||${o.population ?? ""}`; const r = ledgerScore(ledgerFromAudit(o)); return <li key={key}><button type="button" className="sc-outcome-row" onClick={() => go(key)} aria-label={`${o.name}, ${r.headline === null ? "no ledger score" : `${r.headline} out of 100`}`}><span className="sc-outcome-row-name"><strong>{o.name}</strong><small>{o.population}</small></span><span className="sc-outcome-row-score"><strong style={{ color: scoreSignalColor(r.headline, r.certainty / 4, "text") }}>{r.headline ?? "—"}</strong></span><span className="sc-outcome-row-more" aria-hidden="true">›</span><span className="sc-outcome-row-track" aria-hidden="true"><span className="sc-outcome-row-fill" style={{ width: `${r.headline === null ? 0 : r.headline}%`, background: scoreSignalColor(r.headline, r.certainty / 4) }} /></span></button></li>; })}</ul>
    </div>}
  </div>;
}

/* Outcomes as tabs: the first tab lists every outcome (no averaged overall
 * number — a product is not one benefit), each further tab is one outcome with
 * its four evidence tracks. Tapping a list row opens that outcome's tab. */
function OutcomeTabs({ rows, context }: { rows: EvidenceRow[]; context: RunContext }) {
  const [active, setActive] = useState<string | null>(null);
  const population = populationLine(context.population);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = active ? rows.find((r) => r.outcome === active) ?? null : null;
  const ids = ["__all", ...rows.map((r) => r.outcome)];
  const go = (id: string | null, focusPanel = false) => {
    setActive(id);
    if (focusPanel) requestAnimationFrame(() => panelRef.current?.focus());
  };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : (idx + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    go(next === 0 ? null : ids[next]);
    tabRefs.current[next]?.focus();
  };
  const label = (r: EvidenceRow) => r.outcome_label ?? words(r.outcome);
  return (
    <div className="sc-tabs">
      <div className="sc-tablist" role="tablist" aria-label="Outcomes">
        {ids.map((id, idx) => {
          const selected = (id === "__all" && !active) || id === active;
          const row = id === "__all" ? null : rows.find((r) => r.outcome === id)!;
          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[idx] = el; }}
              type="button"
              role="tab"
              id={`sc-tab-${idx}`}
              aria-selected={selected}
              aria-controls="sc-tabpanel"
              tabIndex={selected ? 0 : -1}
              className={`sc-tab${selected ? " sc-tab-selected" : ""}`}
              onClick={() => go(id === "__all" ? null : id)}
              onKeyDown={(e) => onKey(e, idx)}
            >
              {row ? label(row) : `Outcomes (${rows.length})`}
            </button>
          );
        })}
      </div>
      <div
        ref={panelRef}
        id="sc-tabpanel"
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`sc-tab-${current ? ids.indexOf(current.outcome) : 0}`}
        className="sc-tabpanel"
      >
        {current ? (
          <>
            <EvidenceCard row={current} context={context} />
            <button type="button" className="sc-tab-back" onClick={() => go(null, true)}>
              ← All outcomes
            </button>
          </>
        ) : (
          <>
            {(() => {
              const scoredRows = rows.filter((r) => typeof r.composite === "number");
              const scores = scoredRows.map((r) => r.composite as number);
              const general = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
              const signals = scoredRows.map((r) => r.arcs.evidence?.coverage).filter((v): v is number => typeof v === "number");
              const generalSignal = signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : 0;
              return (
                <div className="sc-general" style={{ "--sc-score-color": scoreSignalColor(general, generalSignal), "--sc-score-text": scoreSignalColor(general, generalSignal, "text") } as CSSProperties} role="img" aria-label={general === null ? "General score: no scored outcomes" : `General score ${general}, average of ${scores.length} outcome scores; signal strength ${Math.round(generalSignal * 100)}%`}>
                  <strong className="sc-general-score">{general === null ? "\u2014" : general}</strong>
                  <span className="sc-general-name">
                    <strong>General score</strong>
                    <small>Average of {scores.length} outcome score{scores.length === 1 ? "" : "s"}</small>
                  </span>
                </div>
              );
            })()}
          {/* The run's population, stated ONCE: it is recorded per RUN, not per
            * outcome, so repeating it on every row would print the same string
            * four times. It is a plain fact line, never a scored bar -- the
            * design-lab card's "Studied in you" bar comes from a person-fit term
            * this pipeline does not compute and is not shown at all. */}
          {population ? (
            <p className="sc-pop sc-list-pop">
              <b>Population</b> every outcome below was scored in {population}.
            </p>
          ) : null}
          <ul className="sc-outcome-list" aria-label="Scored outcomes">
            {rows.map((row) => {
              const gated = row.composite === null;
              return (
                <li key={row.outcome}>
                  <button type="button" className={`sc-outcome-row${gated ? " sc-outcome-row-gated" : ""}`} onClick={() => go(row.outcome, true)} aria-label={`${label(row)}, ${gated ? "no composite score" : `${row.composite} out of 100`}. More`}>
                    <span className="sc-outcome-row-name"><strong>{label(row)}</strong></span>
                    <span className="sc-outcome-row-score"><strong style={!gated ? { color: scoreSignalColor(row.composite, row.arcs.evidence?.coverage, "text") } : undefined}>{gated ? "—" : `${row.composite}%`}</strong></span>
                    {/* One affordance, and it is the row itself: a single chevron on the
                      * first line. The lone "More" link used to sit on its own grid line
                      * between the score and the bar, which broke the row into fragments. */}
                    <span className="sc-outcome-row-more" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <span className="sc-outcome-row-track" aria-hidden="true">
                      <span className="sc-outcome-row-fill" style={{ width: `${gated ? 0 : Math.max(0, Math.min(100, row.composite ?? 0))}%`, background: scoreSignalColor(row.composite, row.arcs.evidence?.coverage) }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </div>
    </div>
  );
}

/* Your dose against the range where trials found benefit, on one bar. */
function DoseBar({ reading, dose }: { reading: NonNullable<ScanAnalysis["dose_effectiveness"]>["outcomes"][number]; dose: NullableNumber }) {
  const b = reading.benefit_range_mg;
  const n = reading.null_range_mg;
  const candidates = [b?.high, n?.high, dose].filter((x): x is number => typeof x === "number" && x > 0);
  const max = candidates.length ? Math.max(...candidates) * 1.25 : 1;
  const left = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const width = (lo: number, hi: number) => `${Math.max(1.5, Math.min(100, ((hi - lo) / max) * 100))}%`;
  const name = reading.outcome_label ?? words(reading.outcome);
  // The server's sentence starts with the outcome name; the heading already
  // says it, so the prefix is dropped here (presentation only).
  const stripped = reading.reading.startsWith(`${name}: `) ? reading.reading.slice(name.length + 2) : reading.reading;
  const sentence = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return (
    <div className={`scan-dose scan-dose-${reading.tone}`}>
      <div className="scan-dose-head">
        <strong>{name}</strong>
        <span>{reading.closeness == null ? "closeness —" : `closeness ${reading.closeness.toFixed(2)}`}</span>
      </div>
      <div className="scan-dosebar" role="img" aria-label={reading.reading}>
        {n && n.low !== null && n.high !== null ? (
          <span className="scan-band scan-band-null" style={{ left: left(n.low), width: width(n.low, n.high) }} />
        ) : null}
        {b && b.low !== null && b.high !== null ? (
          <span className="scan-band scan-band-benefit" style={{ left: left(b.low), width: width(b.low, b.high) }} />
        ) : null}
        {dose !== null ? <span className="scan-marker" style={{ left: left(dose) }} /> : null}
      </div>
      <div className="scan-dose-scale" aria-hidden="true">
        <span>0</span>
        <span>{mg(max)}</span>
      </div>
      <p className="scan-reading">{sentence}</p>
    </div>
  );
}

function severityLabel(kind: string, severity: string): string {
  const k = words(kind);
  return severity === "high" ? `${k}, high` : severity === "moderate" ? `${k}, moderate` : k;
}

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="sc-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ScanFlow({ catalog }: { catalog: CatalogIngredient[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [stages, setStages] = useState<string[]>(PHOTO_STAGES);
  const [data, setData] = useState<ScanAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const auth = useSupabaseSession();
  const claimedRuns = useRef<Set<string>>(new Set());
  const resultTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy, stages.length]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // The result is its own state: the instant an answer (or an error) lands,
  // scroll its header into view and move focus there, so the change of state
  // is unmistakable on a phone. Reduced-motion users get an instant jump.
  const finished = !busy && (data !== null || error !== null);
  useEffect(() => {
    if (!finished) return;
    const el = resultTopRef.current;
    if (!el || typeof window === "undefined") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [finished, data, error]);

  // Claim the run for the signed-in user the instant BOTH a session and a
  // run id exist, whichever arrives second: right after sign-in (if a result
  // with a run_id already arrived) or right after a result arrives (if
  // already signed in).
  useEffect(() => {
    if (!auth.configured || !auth.email || !auth.accessToken) return;
    const runId = data?.run_id;
    if (!runId || claimedRuns.current.has(runId)) return;
    claimedRuns.current.add(runId);
    void fetch("/api/scan/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
      body: JSON.stringify({ run_id: runId }),
    }).catch(() => {
      // Best effort -- claiming never affects what the person already sees.
    });
  }, [auth.configured, auth.email, auth.accessToken, data?.run_id]);

  const stageFile = useCallback((picked: File) => {
    if (picked.size > MAX_BYTES) {
      setError(`That image is ${(picked.size / 1e6).toFixed(1)} MB. The limit is 12 MB.`);
      return;
    }
    setError(null);
    setData(null);
    setFile(picked);
    setSearchOpen(false);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(picked);
    });
  }, []);

  const pick = useCallback(
    (files: FileList | null) => {
      const picked = files?.[0];
      if (picked) stageFile(picked);
    },
    [stageFile],
  );

  const clearFile = useCallback(() => {
    setFile(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  // "Scan another": back to the landing state. Clearing the staged file is
  // what restarts the viewfinder.
  const reset = useCallback(() => {
    setData(null);
    setError(null);
    clearFile();
  }, [clearFile]);

  const receive = useCallback(async (res: Response) => {
    const json = (await res.json()) as ScanAnalysis & { error?: string };
    if (!res.ok && !json.status) {
      setError(json.error ?? `Request failed (${res.status}).`);
      return;
    }
    setData(json);
    if (
      json.status === "label_unreadable" ||
      json.status === "analyzer_failed" ||
      json.status === "bad_request" ||
      json.status === "manual_input_invalid"
    ) {
      setError(json.error ?? "The analysis could not run.");
    }
  }, []);

  const submitPhoto = useCallback(async () => {
    if (!file || busy) return;
    setError(null);
    setData(null);
    setStages(PHOTO_STAGES);
    setStage(0);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      await receive(await fetch("/api/scan", { method: "POST", body }));
    } catch (err) {
      setError(`Could not reach the analyzer: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [file, busy, receive]);

  const submitManual = useCallback(
    async (input: ManualScanInput) => {
      if (busy) return;
      setError(null);
      setData(null);
      clearFile();
      setSearchOpen(false);
      setStages(MANUAL_STAGES);
      setStage(0);
      setBusy(true);
      try {
        await receive(
          await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "manual", ...input }),
          }),
        );
      } catch (err) {
        setError(`Could not reach the analyzer: ${String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, receive, clearFile],
  );

  const legend = data?.basis_legend;
  const label = data?.label;
  const entry = data?.input;
  const typed = data?.source === "manual";
  const product = data?.product;
  const ledgerAudit = data?.ledger_audit ?? null;
  const evidence = data?.evidence as
    | { status: string; rows?: EvidenceRow[]; scored_forms?: string[]; run?: Record<string, unknown>; population?: Record<string, string | null> | null; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null; limitations?: string[] } }
    | undefined;
  const rows = evidence?.rows ?? [];
  const prior = data?.evidence_prior;
  const dose = data?.dose_effectiveness;
  const compat = data?.compatibility;
  const company = data?.company;
  // What an expanded evidence dimension is allowed to show. Every field is a
  // fact the answer already carries; nothing is derived for the display.
  const runContext: RunContext = {
    population: evidence?.population ?? null,
    run: evidence?.run ?? null,
    doseReadings: dose?.outcomes ?? null,
    scoredDoseMg: dose?.scored_dose_mg ?? product?.scored_dose_mg ?? null,
    formFit: compat?.evidence_form_fit ?? null,
  };
  const factsBasis: Basis = typed ? "user_input" : "label";

  // Sign-in gate. `locked` only ever becomes true once we know for sure
  // sign-in is configured AND we have finished checking for an existing
  // session AND there is none -- never during the brief `loading` window,
  // so a returning signed-in visitor never sees a flash of the lock.
  const locked = auth.configured && !auth.loading && !auth.email;
  const showSaveCard = auth.configured && !auth.loading && !auth.email;

  const showingResult = finished;
  const staged = Boolean(file && preview);

  // The scanned-product header: what was scanned or typed, and what happened.
  const headerKicker = error
    ? "Could not scan that"
    : typed
      ? "What you entered"
      : label
        ? "What the label says"
        : data?.status === "analyzer_unavailable" || data?.status === "not_a_supplement_label"
          ? "Scan did not finish"
          : "Result";
  const headerName = error
    ? "Scan did not finish"
    : typed && entry
      ? entry.form_label
      : label
        ? label.product_name ?? label.ingredient_label_text ?? label.ingredient_vocab_id ?? "Unnamed product"
        : data?.status === "not_a_supplement_label"
          ? "Not a supplement label"
          : data?.status === "analyzer_unavailable"
            ? "Photo could not be analysed"
            : data?.ingredient_label_text ?? "Result";

  // One line of the facts that decide "at my dose, in my form"; the full
  // definition list (read confidence, quoted spans…) opens below it.
  const activeMoiety = product ? (product.elemental_dose_mg.low === null ? `active moiety not convertible` : `${mg(product.elemental_dose_mg.low)} active`) : null;
  const summaryParts: string[] = typed && entry
    ? [
        entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} compound per serving` : "no dose entered",
        ...(activeMoiety && entry.dose_per_serving ? [activeMoiety] : []),
        ...(entry.servings_per_day !== null ? [`${entry.servings_per_day} serving${entry.servings_per_day === 1 ? "" : "s"} a day`] : []),
      ]
    : label
      ? [
          label.form_vocab_id ? words(label.form_vocab_id) : "form not stated",
          `${mg(label.compound_dose_mg)} compound per serving`,
          ...(activeMoiety ? [activeMoiety] : []),
          ...(label.servings_per_day !== null ? [`${label.servings_per_day} serving${label.servings_per_day === 1 ? "" : "s"} a day`] : []),
        ]
      : [];

  const disclosures = data ? literatureDisclosures(data.literature_warnings?.data) : [];
  const mlm = company?.profile.status === "ok" ? businessModelDisclosure(company.profile.data?.business_model) : null;
  const auditWarnings = auditConcernNotices(ledgerAudit);
  const warningCount = (data?.caveats?.length ?? 0) + disclosures.length + (mlm ? 1 : 0) + auditWarnings.length;
  const hasNotices = Boolean(ledgerAudit || evidence?.validity || warningCount);

  return (
    <section className="la scan sc" aria-label="Scan a supplement">
      {!busy && !showingResult ? (
        <button type="button" className="sc-search-cta" onClick={() => setSearchOpen(true)}>
          Search your supplement
        </button>
      ) : null}

      {/* Two inputs, one difference: `capture` hands off to the platform
          camera. Kept mounted at all times -- this is the fallback path
          that must remain when getUserMedia is unavailable/denied/an
          insecure context, so nothing regresses. */}
      <input type="file" accept="image/*" capture="environment" className="la-input" id="scan-capture" aria-label="Photograph the label with the camera" disabled={busy} onChange={(e) => pick(e.target.files)} />
      <input type="file" accept={ACCEPTED_TYPES} className="la-input" id="scan-file" aria-label="Choose an image of the label" disabled={busy} onChange={(e) => pick(e.target.files)} />

      {!showingResult ? (
        <div
          className={`sc-capture${dragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) pick(e.dataTransfer.files);
          }}
        >
          {busy ? (
            /* ---------------- loading ---------------- */
            <div className="sc-progress" role="status" aria-live="polite" aria-busy="true">
              <div className="sc-progress-head">
                {preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="sc-thumb sc-thumb-dim" src={preview} alt="" />
                ) : (
                  <span className="sc-thumb sc-thumb-typed" aria-hidden="true">
                    Aa
                  </span>
                )}
                <div>
                  <p className="sc-progress-title">{preview ? "Scanning the label" : "Analysing what you entered"}</p>
                  <p className="sc-progress-sub">Usually under a minute.</p>
                </div>
              </div>
              <div className="sc-progress-bar" aria-hidden="true">
                <span />
              </div>
              <ol className="sc-stages">
                {stages.map((s, i) => (
                  <li key={s} className={i < stage ? "is-done" : i === stage ? "is-current" : ""} aria-current={i === stage ? "step" : undefined}>
                    <span className="sc-stage-mark" aria-hidden="true" />
                    <span className="la-stage">{s}</span>
                  </li>
                ))}
              </ol>
              {showSaveCard ? <SaveResultCard /> : null}
            </div>
          ) : staged ? (
            /* ---------------- staged ---------------- */
            <div className="sc-staged">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="la-preview sc-preview" src={preview ?? undefined} alt="The label you staged for analysis" />
              <button type="button" className="button button-dark sc-primary la-analyze" onClick={() => void submitPhoto()}>
                Scan this label
              </button>
              <div className="sc-secondary-row">
                <button type="button" className="button button-outline sc-secondary" onClick={clearFile}>
                  Retake photo
                </button>
                <label className="button button-outline sc-secondary" htmlFor="scan-file">
                  Choose a different image
                </label>
              </div>
            </div>
          ) : (
            /* ---------------- landing ---------------- */
            <>
              <ScanCamera active={!file} disabled={busy} onCapture={stageFile} onUnavailable={() => setCameraUnavailable(true)} />
              <div className="sc-below-block">
                {cameraUnavailable ? (
                  <label className="button button-outline sc-fallback-photo" htmlFor="scan-capture">
                    Take a photo
                  </label>
                ) : null}
                <label className="sc-upload-link" htmlFor="scan-file">
                  Upload a photo
                </label>
                <span className="sc-hint">PNG, JPEG or WebP, up to 12 MB.</span>
              </div>
            </>
          )}
        </div>
      ) : null}

      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} titleId="scan-search-title" title="Search your supplement">
        <p className="sc-search-lede">
          Pick the ingredient and its exact form, add the dose if you know it — the result is marked as typed, not read from a
          label.
        </p>
        <SupplementSearch catalog={catalog} busy={busy} onSubmit={(input) => void submitManual(input)} />
      </SearchSheet>

      {showingResult ? (
        <div className="sc-result-wrap">
          {/* ---------------- scanned-product header ---------------- */}
          <div className="sc-scanned" ref={resultTopRef} tabIndex={-1}>
            {preview && !typed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="sc-thumb" src={preview} alt="The label you scanned" />
            ) : (
              <span className="sc-thumb sc-thumb-typed" aria-hidden="true">
                Aa
              </span>
            )}
            <div className="sc-scanned-main">
              <p className="sc-scanned-kicker">{headerKicker}</p>
              <h2 className="sc-scanned-name">{headerName}</h2>
              {!typed && label?.brand ? <p className="sc-scanned-brand">by {label.brand}</p> : typed && entry ? <p className="sc-scanned-brand">{entry.ingredient_label}</p> : null}
            </div>
            <button type="button" className="sc-again" onClick={reset}>
              Scan another
            </button>
          </div>

          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>Could not scan that.</strong>
              <span>{error}</span>
            </div>
          ) : null}

          {data && !error && legend ? (
            <>
              {locked ? <SaveResultCard /> : null}
              {/* The la-result content is ALWAYS computed and held in state; when
                  sign-in is required and not yet present it is only blurred and
                  made inert, never re-fetched once a session appears. */}
              <div className={`la-result scan-result${locked ? " sc-locked" : ""}`} aria-hidden={locked} inert={locked}>
                {auth.configured && auth.email ? (
                  <p className="sc-signed-in-line">
                    Signed in as <strong>{auth.email}</strong>
                    <button type="button" className="sc-signout" onClick={() => void auth.signOut()}>
                      Sign out
                    </button>
                  </p>
                ) : null}

                {data.status === "analyzer_unavailable" ? (
                  <div className="la-empty">
                    <strong>Scanning is not configured on this deployment.</strong>
                    <span>The server needs a model API key (DEEPSEEK_API_KEY) to read a photo. Searching for a supplement by name still works.</span>
                  </div>
                ) : null}

                {/* ---------------- what was read / entered ---------------- */}
                {typed && entry ? (
                  <div className="sc-identity sc-entered">
                    <p className="sc-summary">
                      <span>{summaryParts.join(", ")}.</span> <BasisBadge kind="user_input" legend={legend} />
                    </p>
                    <p className="la-dim sc-typed-note">Typed, not read from a label. There is no vision read behind this entry, so nothing in it is label-verified.</p>
                    <details className="sc-details sc-identity-details">
                      <summary>Entry details</summary>
                      <Facts
                        rows={[
                          ["Ingredient", entry.ingredient_label],
                          ["Form", entry.form_label],
                          ["Dose per serving", entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} compound` : "no dose entered"],
                          ...(product
                            ? ([["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]>)
                            : []),
                          ...(entry.servings_per_day !== null ? ([["Servings per day", String(entry.servings_per_day)]] as Array<[string, React.ReactNode]>) : []),
                          ["Source", <BasisBadge key="b" kind="user_input" legend={legend} />],
                        ]}
                      />
                    </details>
                  </div>
                ) : label ? (
                  <div className="sc-identity">
                    <p className="sc-summary">
                      <span>{summaryParts.join(", ")}.</span> <BasisBadge kind="label" legend={legend} />
                    </p>
                    <details className="sc-details sc-identity-details">
                      <summary>Label details</summary>
                      <Facts
                        rows={[
                          ["Ingredient", label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"],
                          ["Form", label.form_vocab_id ? words(label.form_vocab_id) : "not stated"],
                          ["Dose per serving", `${mg(label.compound_dose_mg)} compound`],
                          ...(product
                            ? ([["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]>)
                            : []),
                          ...(label.servings_per_day !== null ? ([["Servings per day", String(label.servings_per_day)]] as Array<[string, React.ReactNode]>) : []),
                          ["Read confidence", label.confidence],
                          ["Source", <BasisBadge key="b" kind="label" legend={legend} />],
                        ]}
                      />
                      {label.evidence_spans?.length ? <p className="la-spans">Read from: {label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p> : null}
                    </details>
                  </div>
                ) : null}

                {data.status === "not_a_supplement_label" ? (
                  <div className="la-empty">
                    <strong>That does not look like a supplement label.</strong>
                    <span>Photograph the Supplement Facts panel so the ingredient and dose can be read.</span>
                  </div>
                ) : null}

                {data.status === "ingredient_not_supported" ? (
                  <div className="la-empty">
                    <strong>{data.ingredient_label_text ?? "That ingredient"} is not in the evidence vocabulary yet.</strong>
                    <span>
                      This is not a low score — it is no data. Nothing has been run for it.
                      {data.queue && (data.queue as { queued?: boolean }).queued ? " Your request was recorded." : ""}
                    </span>
                    {data.supported_ingredients?.length ? <span className="la-dim">Covered so far: {data.supported_ingredients.join(", ")}</span> : null}
                  </div>
                ) : null}

                {/* ---------------- before you read the score ----------------
                 * ONE stack: the run-validity banner first and always open
                 * (load-bearing: every retained run withholds public claims),
                 * then the caveats and the model-decided disclosures
                 * (funding, publication bias, MLM) as one-line rows whose full
                 * text opens in a native <details>. Disclosures render ONLY
                 * for "concern"/confirmed/suspected; everything else renders
                 * nothing at all. */}
                {hasNotices ? (
                  <section className="sc-notices" aria-labelledby="scan-notices-title">
                    <h3 id="scan-notices-title" className="sc-notices-title">
                      Before you read the score
                    </h3>
                    {ledgerAudit ? (
                      <div className="la-alert la-alert-warn sc-notice sc-notice-open sc-ledger-validity">
                        <strong>Retained previous audit · not reverified</strong>
                        <span>{ledgerAudit.provenance.prompt_version} · target: {ledgerAudit.provenance.target_product} · {ledgerAudit.provenance.target_dose}</span>
                      </div>
                    ) : null}
                    {evidence?.validity ? (
                      <div className={`la-alert ${evidence.validity.public_claims_allowed ? "la-alert-ok" : "la-alert-warn"} sc-notice sc-notice-open`}>
                        <strong>{evidence.validity.public_claims_allowed ? "Validated run." : `Not a product claim — this run is marked ${evidence.validity.status ?? "unvalidated"}.`}</strong>
                        <span>{evidence.validity.note ?? "Retained for inspection. The scoring constants have not passed anchor calibration."}</span>
                      </div>
                    ) : null}
                    {warningCount ? (
                      <details className="sc-warning-bundle">
                        {/* The count IS the label. The "Open before deciding"
                          * sub-line was removed 2026-09-16 (founder): one clean
                          * row, chevron on the right. */}
                        <summary>
                          <span>{warningCount} warning{warningCount === 1 ? "" : "s"}</span>
                        </summary>
                        <div className="sc-warning-list">
                          {data.caveats?.map((c) => (
                            <Notice key={c.code} title={words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(c.text)} body={c.text} />
                          ))}
                          {disclosures.map((d) => (
                            <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={`${d.title} disclosure`} />
                          ))}
                          {mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body.replace(/^Model knowledge — unverified\.\s*/, "").replace(/^This company/, `${company?.brand ?? "This company"}`))} body={mlm.body} role="note" ariaLabel="Business model disclosure" /> : null}
                          {auditWarnings.map((warning) => <Notice key={warning.key} title={warning.title} lede={firstSentence(warning.body)} body={warning.body} role="note" ariaLabel={`${warning.title} disclosure`} />)}
                        </div>
                      </details>
                    ) : null}
                  </section>
                ) : null}

                {/* ---------------- evidence ---------------- */}
                {product ? (
                  <Section id="evidence" title="Does it work?" basis={["evidence_run"]} legend={legend}>
                    {ledgerAudit ? (
                      <LedgerOutcomeTabs audit={ledgerAudit} />
                    ) : rows.length ? (
                      <>
                        <p className="sc-no-ledger-audit">No /4 audit for this exact form and daily dose yet.</p>
                        <OutcomeTabs rows={rows} context={runContext} />
                      </>
                    ) : (
                      <>
                        <p className="sc-no-ledger-audit">No /4 audit for this exact form and daily dose yet.</p>
                      <div className="la-empty">
                        <strong>{evidence?.status === "form_not_scored" ? "That form has not been run." : "No evidence run exists for this ingredient."}</strong>
                        <span>
                          {evidence?.status === "form_not_scored"
                            ? `Evidence about a different form is not evidence about yours, so no number is shown.${evidence.scored_forms?.length ? ` Run so far: ${evidence.scored_forms.join(", ")}.` : ""}`
                            : "This is not a low score — it is no data. A score needs the full pipeline over ~180 studies."}
                        </span>
                        {data.census && (data.census as { available?: boolean }).available ? (
                          <div className="la-census">
                            <span className="la-census-tag">Counts, not a score</span>
                            <div className="la-census-figures">
                              <div className="la-census-figure">
                                <strong>{String((data.census as { rcts_indexed?: number }).rcts_indexed)}</strong>
                                <span>randomised trials</span>
                              </div>
                              <div className="la-census-figure">
                                <strong>{String((data.census as { syntheses_indexed?: number }).syntheses_indexed)}</strong>
                                <span>systematic reviews</span>
                              </div>
                            </div>
                            <span className="la-dim">Indexed in Europe PMC at supplement scope.</span>
                          </div>
                        ) : null}
                      </div>
                      </>
                    )}
                  </Section>
                ) : null}

                {/* -------- evidence orientation (only when no run exists) -------- */}
                {prior ? (
                  <Section id="prior" title="What the literature says" basis={["model_prior"]} legend={legend}>
                    <p className="scan-disclaimer">{prior.disclaimer}</p>
                    {prior.status === "ok" && prior.data ? (
                      <>
                        <p className="scan-note">{prior.data.summary}</p>
                        {prior.data.evidence_landscape ? (
                          <p className="la-dim">
                            Systematic reviews: {prior.data.evidence_landscape.syntheses_exist}
                            {prior.data.evidence_landscape.note ? `. ${prior.data.evidence_landscape.note}` : ""}
                          </p>
                        ) : null}

                        {prior.data.outcomes.length ? (
                          <ul className="scan-list">
                            {prior.data.outcomes.map((o, i) => (
                              <li key={`${o.outcome}-${i}`} className="scan-item scan-item-model_prior scan-prior">
                                <div className="scan-item-head">
                                  <strong>{o.outcome}</strong>
                                  <span className={`scan-dirchip scan-dir-${o.direction}`}>{words(o.direction)}</span>
                                  <span className={`scan-strength scan-strength-${o.evidence_strength}`}>{o.evidence_strength} evidence</span>
                                </div>
                                {o.note ? <p>{o.note}</p> : null}
                                {o.pooled_effect_recalled ? <p className="la-dim">Pooled estimate recalled: {o.pooled_effect_recalled}</p> : null}
                                {o.population ? <p className="la-dim">Population: {o.population}</p> : null}
                                {o.dose_reading ? <p className={o.dose_closeness != null && o.dose_closeness >= 0.999 ? "scan-dose-hit" : "scan-dose-miss"}>{o.dose_reading}</p> : null}
                                <span className="la-dim">model confidence: {o.confidence}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="la-dim">The model named no outcome with describable evidence for this ingredient.</p>
                        )}

                        {prior.data.form_assessment ? (
                          <div className="scan-item scan-item-model_prior">
                            <div className="scan-item-head">
                              <strong>This form</strong>
                              <span className="scan-strength">{words(prior.data.form_assessment.verdict)}</span>
                            </div>
                            {prior.data.form_assessment.note ? <p>{prior.data.form_assessment.note}</p> : null}
                          </div>
                        ) : null}

                        {prior.data.safety_notes?.length ? (
                          <div className="scan-item scan-item-model_prior">
                            <div className="scan-item-head">
                              <strong>Safety</strong>
                            </div>
                            <ul className="scan-plain">
                              {prior.data.safety_notes.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {prior.data.caveats?.length ? <p className="la-dim">Model is unsure about: {prior.data.caveats.join("; ")}</p> : null}
                      </>
                    ) : (
                      <p className="la-dim">Orientation unavailable: {prior.reason ?? "skipped"}</p>
                    )}
                  </Section>
                ) : null}

                {/* ---------------- dose ---------------- */}
                {dose ? (
                  <Section id="dose" title="Is your dose the dose that worked?" basis={["evidence_run", factsBasis]} legend={legend}>
                    <p className="scan-note">{dose.note}</p>
                    {dose.outcomes.length ? (
                      <div className="scan-doses">
                        <div className="scan-dose-key" aria-hidden="true">
                          <span>
                            <i className="scan-key scan-key-benefit" /> benefit found
                          </span>
                          <span>
                            <i className="scan-key scan-key-null" /> nothing found
                          </span>
                          <span>
                            <i className="scan-key scan-key-marker" /> your dose
                          </span>
                        </div>
                        {dose.outcomes.map((o) => (
                          <DoseBar key={o.outcome} reading={o} dose={dose.scored_dose_mg} />
                        ))}
                      </div>
                    ) : (
                      <p className="la-dim">No scored outcome, so there is no dose range to compare against.</p>
                    )}
                  </Section>
                ) : null}

                {/* ---------------- compatibility ---------------- */}
                {compat ? (
                  <Section id="form" title="Does the form and the mix hold up?" basis={compat.basis_used} legend={legend}>
                    <p className="scan-formfit">
                      <strong>
                        {compat.evidence_form_fit.status === "exact_form_scored"
                          ? "Your form is the form the evidence run scored."
                          : compat.evidence_form_fit.status === "form_not_scored"
                            ? "Your form has not been run; evidence about another form is not evidence about yours."
                            : compat.evidence_form_fit.status === "ingredient_not_scored"
                              ? "No evidence run exists for this ingredient yet."
                              : "Form fit unknown."}
                      </strong>{" "}
                      <span className="la-dim">
                        {compat.evidence_form_fit.form_strength != null
                          ? `Form evidence strength ${compat.evidence_form_fit.form_strength.toFixed(2)} (${compat.evidence_form_fit.form_basis ?? "ladder"}).`
                          : compat.evidence_form_fit.scored_forms.length
                            ? `Forms run so far: ${compat.evidence_form_fit.scored_forms.join(", ")}.`
                            : ""}
                      </span>
                    </p>

                    {compat.form_notes.length ? (
                      <ul className="scan-list">
                        {compat.form_notes.map((n, i) => (
                          <li key={`${n.active}-${i}`} className={`scan-item scan-item-${n.basis}`}>
                            <div className="scan-item-head">
                              <strong>{n.active}</strong>
                              <BasisBadge kind={n.basis} legend={legend} />
                            </div>
                            <p>{n.note}</p>
                            {n.source ? (
                              <a href={n.source.url} target="_blank" rel="noreferrer">
                                {n.source.title}
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="scan-actives">
                      <span className="sc-label">{typed ? "Actives entered" : "Actives read"}</span>
                      <div className="scan-chips">
                        {compat.actives.map((a) => (
                          <span key={a.printed} className="scan-chip">
                            {a.printed}
                            {a.compound_dose_mg !== null ? <span className="scan-chip-dose">{mg(a.compound_dose_mg)}</span> : null}
                          </span>
                        ))}
                      </div>
                    </div>

                    {compat.status === "single_active" ? (
                      <p className="la-dim">Single active on the panel — no combination to check.</p>
                    ) : compat.interactions.length ? (
                      <ul className="scan-list">
                        {compat.interactions.map((x, i) => (
                          <li key={`${x.a}-${x.b}-${i}`} className={`scan-item scan-item-${x.basis} scan-sev-${x.severity}`}>
                            <div className="scan-item-head">
                              <strong>
                                {x.a} + {x.b}
                              </strong>
                              <BasisBadge kind={x.basis} legend={legend} />
                            </div>
                            <span className="scan-sev">{severityLabel(x.kind, x.severity)}</span>
                            {x.advice ? <p>{x.advice}</p> : null}
                            {x.mechanism ? <p className="la-dim">{x.mechanism}</p> : null}
                            {x.source ? (
                              <a href={x.source.url} target="_blank" rel="noreferrer">
                                {x.source.title}
                              </a>
                            ) : x.confidence ? (
                              <span className="la-dim">model confidence: {x.confidence}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="la-dim">No documented interaction among these actives in the curated table.</p>
                    )}

                    {compat.model.status === "ok" && compat.model.overall ? (
                      <div className="scan-item scan-item-model_prior scan-overall">
                        <div className="scan-item-head">
                          <strong>Model summary of the combination</strong>
                          <BasisBadge kind="model_prior" legend={legend} />
                        </div>
                        <p>{compat.model.overall}</p>
                      </div>
                    ) : compat.model.status === "unavailable" ? (
                      <p className="la-dim">Model fill-in unavailable: {compat.model.reason}</p>
                    ) : null}
                  </Section>
                ) : null}

                {/* ---------------- company ---------------- */}
                {company ? (
                  <Section id="company" title="Who makes it, and what is on record?" basis={company.basis_used.length ? company.basis_used : ["label"]} legend={legend}>
                    {company.status === "no_brand_on_label" ? (
                      <p className="la-dim">
                        {typed
                          ? "The search path takes an ingredient, a form and a dose — no brand — so there is no company to look up."
                          : "No brand or manufacturer is printed on this panel, so there is nothing to look up."}
                      </p>
                    ) : (
                      <>
                        <div className="sc-sub">
                          <div className="scan-item-head">
                            <strong>Printed on the label</strong>
                            <BasisBadge kind="label" legend={legend} />
                          </div>
                          <Facts
                            rows={[
                              ["Brand", company.brand ?? "—"],
                              ["Manufacturer", company.manufacturer ?? "not printed"],
                              ["Country", company.country_of_origin ?? "not printed"],
                              [
                                "Seals printed",
                                company.certifications_printed.length ? (
                                  <span className="scan-chips">
                                    {company.certifications_printed.map((c) => (
                                      <span key={c.text} className="scan-chip" title={c.note}>
                                        {c.text}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  "none"
                                ),
                              ],
                            ]}
                          />
                          {company.certifications_printed.length ? <p className="la-dim sc-fine">Seals are claims as printed; a certifier&rsquo;s registry confirms them, this page does not.</p> : null}
                        </div>

                        <div className="sc-sub">
                          <div className="scan-item-head">
                            <strong>FDA enforcement reports</strong>
                            <BasisBadge kind="registry" legend={legend} />
                          </div>
                          {company.registry.status === "ok" ? (
                            <ul className="scan-recalls">
                              {company.registry.recalls.map((r, i) => (
                                <li key={r.recall_number ?? i}>
                                  <span className="scan-recall-meta">
                                    <span>{r.initiated ?? "date —"}</span>
                                    <span>{r.classification ?? "class —"}</span>
                                    {r.status ? <span>{r.status}</span> : null}
                                  </span>
                                  <strong>{r.product}</strong>
                                  <span>{r.reason}</span>
                                  <span className="la-dim">Firm: {r.firm}</span>
                                </li>
                              ))}
                            </ul>
                          ) : company.registry.status === "no_matches" ? (
                            <p>No recall on file under {company.registry.queried.join(" or ")}.</p>
                          ) : company.registry.status === "unavailable" ? (
                            <p className="la-dim">Registry unavailable: {company.registry.reason}</p>
                          ) : (
                            <p className="la-dim">Not queried.</p>
                          )}
                          <p className="la-dim sc-fine">{company.registry.note}</p>
                        </div>

                        <div className="scan-item scan-item-model_prior">
                          <div className="scan-item-head">
                            <strong>Company profile</strong>
                            <BasisBadge kind="model_prior" legend={legend} />
                          </div>
                          {company.profile.status === "ok" && company.profile.data ? (
                            <div className="scan-profile">
                              <p>{company.profile.data.summary}</p>
                              {mlm ? <p className="la-dim sc-fine">Business model: see &ldquo;{mlm.title}&rdquo; under Before you read the score.</p> : null}
                              {company.profile.data.regulatory_history.length ? (
                                <ul className="scan-list scan-reg">
                                  {company.profile.data.regulatory_history.map((h, i) => (
                                    <li key={i}>
                                      <strong>
                                        {words(h.kind)}
                                        {h.year ? `, ${h.year}` : ""}
                                      </strong>
                                      <span>{h.summary}</span>
                                      <span className="la-dim">
                                        model confidence {h.confidence}
                                        {h.kind === "recall"
                                          ? h.registry_corroborated === true
                                            ? "; a recall is on file in openFDA"
                                            : h.registry_corroborated === false
                                              ? "; NOT corroborated by openFDA under this firm name"
                                              : ""
                                          : ""}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : company.profile.data.known ? (
                                <p className="la-dim">No widely reported regulatory action recalled by the model.</p>
                              ) : null}
                              {company.profile.data.known || company.profile.data.reputation_notes.length || company.profile.data.caveats.length ? (
                                <details className="sc-details sc-inline-details">
                                  <summary>What the model recalls about the company</summary>
                                  {company.profile.data.known ? (
                                    <Facts
                                      rows={[
                                        ["Founded", company.profile.data.founded_year ?? "unknown"],
                                        ["Headquarters", company.profile.data.headquarters_country ?? "unknown"],
                                        ["Ownership", `${company.profile.data.ownership_type}${company.profile.data.parent_company ? ` (${company.profile.data.parent_company})` : ""}`],
                                        ["Third-party testing", `${company.profile.data.third_party_testing.status}${company.profile.data.third_party_testing.program ? `, ${company.profile.data.third_party_testing.program}` : ""}`],
                                        ["Batch certificates public", company.profile.data.transparency.coa_published],
                                        ["Profile confidence", company.profile.data.confidence],
                                      ]}
                                    />
                                  ) : null}
                                  {company.profile.data.reputation_notes.length ? (
                                    <ul className="scan-plain">
                                      {company.profile.data.reputation_notes.map((n) => (
                                        <li key={n}>{n}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {company.profile.data.caveats.length ? <p className="la-dim">Could not confirm: {company.profile.data.caveats.join("; ")}</p> : null}
                                </details>
                              ) : null}
                            </div>
                          ) : (
                            <p className="la-dim">Profile unavailable: {company.profile.reason ?? "skipped"}</p>
                          )}
                        </div>
                      </>
                    )}
                  </Section>
                ) : null}

                {/* ---------------- legend + technical details ---------------- */}
                <details className="sc-details scan-legend">
                  <summary id="scan-legend-title">How to read the source badges</summary>
                  <ol>
                    {Object.entries(legend)
                      .sort(([, a], [, b]) => a.rank - b.rank)
                      .map(([kind, entry]) => (
                        <li key={kind}>
                          <BasisBadge kind={kind as Basis} legend={legend} />
                          <span>{entry.means}</span>
                        </li>
                      ))}
                  </ol>
                </details>

                <details className="sc-details sc-technical">
                  <summary>Technical details</summary>
                  {evidence?.run ? (
                    <>
                      <p>
                        <strong>How these numbers were produced.</strong> Effect, form and evidence arcs come from the retained run below. The dose term was
                        recomputed for the dose on your label, and a positive verdict is discounted by how much of the evidence applies to your form and
                        dose. <a href="/methodology">Read the methodology.</a>
                      </p>
                      <Facts rows={Object.entries(evidence.run).map(([k, v]) => [words(k), v === null || v === undefined ? "—" : String(v)])} />
                    </>
                  ) : null}
                  {data.meta ? (
                    <Facts
                      rows={[
                        ["Source", typed ? "typed" : "photo"],
                        ["Took", `${data.meta.timing_s} s`],
                        ...(typed ? [] : ([["Vision model", data.meta.models.vision ?? "—"]] as Array<[string, React.ReactNode]>)),
                        ["Text model", data.meta.models.text ?? "—"],
                        ...Object.entries(data.meta.stages ?? {}).map(([k, v]) => [`Stage: ${words(k)}`, v === null || v === undefined ? "skipped" : `${v} s`] as [string, React.ReactNode]),
                        ...Object.entries(data.meta.prompt_versions ?? {}).map(([k, v]) => [`Prompt: ${words(k)}`, String(v)] as [string, React.ReactNode]),
                        ...(data.run_id ? ([["Run id", <code key="r">{data.run_id}</code>]] as Array<[string, React.ReactNode]>) : []),
                        ...(data.app_version
                          ? ([
                              [
                                "App version",
                                <code key="v">
                                  {data.app_version.package_version}
                                  {data.app_version.git_sha ? ` ${data.app_version.git_sha.slice(0, 8)}` : ""}
                                </code>,
                              ],
                            ] as Array<[string, React.ReactNode]>)
                          : []),
                        ...(data.persistence ? ([["Run stored", words(data.persistence.status)]] as Array<[string, React.ReactNode]>) : []),
                      ]}
                    />
                  ) : null}
                </details>
              </div>
            </>
          ) : null}

          <button type="button" className="button button-dark sc-primary sc-again-bottom" onClick={reset}>
            Scan another
          </button>
        </div>
      ) : null}
    </section>
  );
}
