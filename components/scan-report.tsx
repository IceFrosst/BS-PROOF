/*
 * THE SCAN REPORT: what a shopper sees after the scan (redesigned 2026-09-15).
 *
 * Founder: results should be "in a better presentable form, better ui and smth
 * that an average user can benefit from, whether the certain supplement is
 * legit". The previous rendering was an audit dump -- "/ 100" beside "closeness
 * 0.94", "strength 0.80 (ladder)", prompt versions and model ids all at one
 * visual weight. This file reads top-down the way a buyer does:
 *
 *   1. WHAT WAS SCANNED      the product, its ingredient, form and daily dose
 *   2. AT A GLANCE           five questions answered in words, each with a tone
 *                            mark, a one-line reason and its source badge
 *                            (lib/analyze/summary.ts -- a translation, no number)
 *   3. THE DETAIL            evidence per outcome on a labelled 0-100 gauge with
 *                            the four arcs as plain-worded checks; dose on a bar;
 *                            form and mix; a company trust checklist
 *   4. THE FINE PRINT        legend, run id, models, timings -- collapsed
 *
 * Rules carried over unchanged, all from CLAUDE.md:
 *
 *   - INVARIANT 8: a composite never renders without its four arcs. Every
 *     outcome card draws the gauge AND the four checks with their coverage.
 *     "0.00 @ 0%" (untested) and "-0.70 @ 100%" (tested and failed) are
 *     different sentences here, never the same bar.
 *   - "not scored" is never a low score: no gauge, no number, a distinct
 *     "not measured yet" state. Tone `unknown` renders a dashed "?" mark.
 *   - A model recollection is never typeset like a measurement: every model
 *     block and every estimated finding is dashed and carries the
 *     "Model knowledge -- unverified" badge.
 *   - The validity banner is load-bearing: every retained run withholds public
 *     claims, and the At-a-glance subline says so in plain words.
 *
 * The numbers are still here for anyone who wants them -- "Show the numbers"
 * on each outcome card, and the fine print at the bottom -- they are simply
 * no longer the first thing on the page.
 */
import { mg } from "@/lib/analyze/dose-effectiveness";
import type { ScanAnalysis } from "@/lib/analyze/scan";
import { evidenceOf, outcomeName, type EvidenceRowShape, type Finding, type Tone } from "@/lib/analyze/summary";

type Legend = ScanAnalysis["basis_legend"];
type Basis = keyof Legend;
type NullableNumber = number | null | undefined;

/* ------------------------------------------------------------------ atoms -- */

function pct(value: NullableNumber): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function signed(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function fixed(value: NullableNumber): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanForm(id: string | null | undefined): string {
  return id ? id.replace(/_/g, " ") : "form not stated";
}

const TONE_TEXT: Record<Tone, string> = {
  good: "Good",
  mixed: "Mixed",
  caution: "Needs attention",
  concern: "Concern",
  unknown: "Unknown",
};

const TONE_GLYPH: Record<Tone, string> = { good: "✓", mixed: "~", caution: "!", concern: "✕", unknown: "?" };

/** The tone mark: a glyph for sighted readers, the word for everyone else. */
function ToneMark({ tone }: { tone: Tone }) {
  return (
    <span className={`scan-mark scan-mark-${tone}`}>
      <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
      <span className="sr-only">{TONE_TEXT[tone]}</span>
    </span>
  );
}

function BasisBadge({ kind, legend }: { kind: Basis; legend: Legend }) {
  const entry = legend[kind];
  return (
    <span className={`scan-badge scan-badge-${kind}`} title={entry.means}>
      {entry.label}
    </span>
  );
}

function EstimateBadge() {
  return (
    <span className="scan-badge scan-badge-model_prior" title="What the model recalls from training data. Unverified; orientation only and never scored.">
      Model estimate · unverified
    </span>
  );
}

function Section({
  id,
  eyebrow,
  title,
  basis,
  legend,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  basis: Basis[];
  legend: Legend;
  children: React.ReactNode;
}) {
  return (
    <section className="scan-section" id={`scan-${id}`} aria-labelledby={`scan-${id}-title`}>
      <header className="scan-section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 id={`scan-${id}-title`}>{title}</h3>
        </div>
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

/* --------------------------------------------------------- 1. the product -- */

function ProductCard({ data, imageUrl }: { data: ScanAnalysis; imageUrl: string | null }) {
  const label = data.label!;
  const product = data.product;
  const name = label.product_name ?? label.ingredient_label_text ?? label.ingredient_vocab_id ?? "Unnamed product";
  const daily =
    product && product.scored_dose_mg !== null
      ? `${mg(product.scored_dose_mg)}${product.scored_dose_basis === "daily" ? " / day" : " / serving"}`
      : product
        ? "not convertible"
        : null;
  return (
    <header className="scan-product">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="scan-product-thumb" src={imageUrl} alt="" />
      ) : null}
      <div>
        <p className="eyebrow">Scanned label</p>
        <h3>
          {name}
          {label.brand ? <span className="scan-brand"> by {label.brand}</span> : null}
        </h3>
        <ul className="scan-facts">
          <li>
            <span>Ingredient</span>
            <strong>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</strong>
          </li>
          <li>
            <span>Form</span>
            <strong>{humanForm(label.form_vocab_id)}</strong>
          </li>
          <li>
            <span>Per serving</span>
            <strong>{label.dose_unit_as_printed ?? mg(label.compound_dose_mg)}</strong>
          </li>
          {daily ? (
            <li>
              <span>Active amount</span>
              <strong>{daily}</strong>
            </li>
          ) : null}
          <li>
            <span>Servings / day</span>
            <strong>{label.servings_per_day ?? "not printed"}</strong>
          </li>
          {label.is_multi_ingredient ? (
            <li>
              <span>Other actives</span>
              <strong>{label.other_actives.length ? label.other_actives.slice(0, 4).join(", ") : "several"}</strong>
            </li>
          ) : null}
        </ul>
      </div>
    </header>
  );
}

/* -------------------------------------------------------- 2. at a glance -- */

function jumpTarget(finding: Finding, present: Set<string>): string | null {
  const wanted: Record<Finding["key"], string[]> = {
    evidence: finding.estimated ? ["scan-prior", "scan-evidence"] : ["scan-evidence", "scan-prior"],
    dose: ["scan-dose", "scan-prior"],
    form: ["scan-form"],
    combination: ["scan-form"],
    company: ["scan-company"],
  };
  return wanted[finding.key].find((id) => present.has(id)) ?? null;
}

function VerdictCard({ data, legend, present }: { data: ScanAnalysis; legend: Legend; present: Set<string> }) {
  const summary = data.summary;
  if (!summary) return null;
  const tally = (Object.entries(summary.tally) as Array<[Tone, number]>).filter(([, n]) => n > 0);
  return (
    <section className={`scan-verdict scan-verdict-${summary.certainty}`} aria-labelledby="scan-verdict-title">
      <div className="scan-verdict-head">
        <p className="eyebrow">At a glance</p>
        <h3 id="scan-verdict-title">{summary.headline}</h3>
        {summary.subline ? <p className="scan-verdict-sub">{summary.subline}</p> : null}
      </div>
      <ul className="scan-tally" aria-label="Checks by outcome">
        {tally.map(([tone, n]) => (
          <li key={tone} className={`scan-tally-${tone}`}>
            <ToneMark tone={tone} />
            {n} {TONE_TEXT[tone].toLowerCase()}
          </li>
        ))}
      </ul>
      <ol className="scan-findings">
        {summary.findings.map((f) => {
          const target = jumpTarget(f, present);
          return (
            <li key={f.key} className={`scan-finding scan-finding-${f.tone}${f.estimated ? " is-estimated" : ""}`}>
              <ToneMark tone={f.tone} />
              <div className="scan-finding-body">
                <span className="scan-finding-q">{f.question}</span>
                <strong>{f.headline}</strong>
                {f.detail ? <p>{f.detail}</p> : null}
                <div className="scan-finding-basis">
                  {f.estimated ? <EstimateBadge /> : null}
                  {f.basis.filter((b) => !(f.estimated && b === "model_prior")).map((b) => <BasisBadge key={b} kind={b} legend={legend} />)}
                </div>
              </div>
              {target ? (
                <a className="scan-finding-jump" href={`#${target}`}>
                  Details
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------- 3a. the evidence -- */

/** Zones are verdictLabel's thresholds (30 / 45 / 55 / 65) so the words on the gauge match the words on the card. */
function ScoreGauge({ composite, verdict }: { composite: number; verdict: string }) {
  const left = Math.max(0, Math.min(100, composite));
  return (
    <div className="scan-gauge" role="img" aria-label={`${composite} out of 100: ${verdict}`}>
      <div className="scan-gauge-track">
        <span className="scan-zone scan-zone-no" style={{ width: "30%" }} />
        <span className="scan-zone scan-zone-probno" style={{ width: "15%" }} />
        <span className="scan-zone scan-zone-unclear" style={{ width: "10%" }} />
        <span className="scan-zone scan-zone-prob" style={{ width: "10%" }} />
        <span className="scan-zone scan-zone-yes" style={{ width: "35%" }} />
        <span className="scan-gauge-marker" style={{ left: `${left}%` }}>
          <b>{composite}</b>
        </span>
      </div>
      <div className="scan-gauge-ticks" aria-hidden="true">
        <span>does not work</span>
        <span>unclear</span>
        <span>works</span>
      </div>
    </div>
  );
}

function effectCheck(d: NullableNumber): { answer: string; tone: Tone } {
  if (d === null || d === undefined) return { answer: "Not assessed", tone: "unknown" };
  if (d >= 0.5) return { answer: "Clearly toward benefit", tone: "good" };
  if (d >= 0.25) return { answer: "Toward benefit", tone: "good" };
  if (d > 0.1) return { answer: "Leans toward benefit", tone: "mixed" };
  if (d >= -0.1) return { answer: "No clear effect either way", tone: "mixed" };
  if (d > -0.25) return { answer: "Leans against", tone: "caution" };
  return { answer: "Against", tone: "concern" };
}

function formCheck(coverage: NullableNumber): { answer: string; tone: Tone } {
  if (coverage === null || coverage === undefined) return { answer: "Not recorded", tone: "unknown" };
  if (coverage >= 0.9) return { answer: "Yes, nearly all of it", tone: "good" };
  if (coverage >= 0.5) return { answer: "Mostly", tone: "good" };
  if (coverage > 0.15) return { answer: "Partly", tone: "mixed" };
  if (coverage > 0) return { answer: "Barely", tone: "caution" };
  return { answer: "No, never in your form", tone: "caution" };
}

function doseCheck(closeness: NullableNumber, match: string | null | undefined): { answer: string; tone: Tone } {
  if (closeness === null || closeness === undefined) return { answer: "No benefit dose to compare", tone: "unknown" };
  if (match === "in_band" || closeness >= 0.999) return { answer: "Yes, in the range that worked", tone: "good" };
  if (match === "below_50") return { answer: "No, well below", tone: "caution" };
  if (match === "low_50_99") return { answer: "Below, but close", tone: "mixed" };
  if (match === "above_200") return { answer: "Well above", tone: "caution" };
  if (closeness >= 0.6) return { answer: "Near the range", tone: "mixed" };
  return { answer: "Far from the range", tone: "caution" };
}

function amountCheck(c: NullableNumber, n: NullableNumber): { answer: string; tone: Tone } {
  if (c === null || c === undefined) return { answer: "Unknown", tone: "unknown" };
  const trials = n ? ` (${n} trial${n === 1 ? "" : "s"})` : "";
  if (c >= 0.7) return { answer: `Substantial${trials}`, tone: "good" };
  if (c >= 0.4) return { answer: `Moderate${trials}`, tone: "mixed" };
  if (c >= 0.15) return { answer: `Thin${trials}`, tone: "caution" };
  return { answer: `Barely studied${trials}`, tone: "caution" };
}

function Check({ label, answer, tone, coverage, covText }: { label: string; answer: string; tone: Tone; coverage: NullableNumber; covText: string }) {
  const fill = coverage === null || coverage === undefined ? 0 : Math.max(0, Math.min(1, coverage));
  return (
    <li className={`scan-check scan-check-${tone}`}>
      <ToneMark tone={tone} />
      <div className="scan-check-body">
        <span className="scan-check-label">{label}</span>
        <strong>{answer}</strong>
      </div>
      <div className="scan-check-cov" role="img" aria-label={covText}>
        <span className="scan-check-bar">
          <span style={{ width: `${fill * 100}%` }} />
        </span>
        <em>{pct(coverage)}</em>
      </div>
    </li>
  );
}

function OutcomeCard({ row }: { row: EvidenceRowShape }) {
  const verdict = row.verdict ?? "not assessed";
  const composite = row.composite;
  const tone: Tone =
    composite === null ? "unknown" : composite >= 55 ? "good" : composite >= 45 ? "mixed" : composite >= 30 ? "caution" : "concern";
  const effect = effectCheck(row.arcs.effect?.verdict);
  const form = formCheck(row.arcs.form?.coverage);
  const dose = doseCheck(row.arcs.dose?.closeness, row.arcs.dose?.product_match);
  const amount = amountCheck(row.arcs.evidence?.coverage, row.n_primaries);
  return (
    <article className={`scan-outcome scan-tone-${tone}`} data-testid="scan-outcome">
      <header className="scan-outcome-head">
        <div>
          <h4>{outcomeName(row)}</h4>
          <p className="scan-outcome-verdict">{cap(verdict)}</p>
        </div>
        {composite === null ? (
          <p className="scan-outcome-gated">Not scored — the evidence gate fired, so no number is shown.</p>
        ) : (
          <ScoreGauge composite={composite} verdict={verdict} />
        )}
      </header>
      <ul className="scan-checks" aria-label="The four arcs behind this score">
        <Check label="Direction of the evidence" answer={effect.answer} tone={effect.tone} coverage={row.arcs.effect?.coverage} covText={`${pct(row.arcs.effect?.coverage)} of the evidence judged`} />
        <Check label="Tested in your form?" answer={form.answer} tone={form.tone} coverage={row.arcs.form?.coverage} covText={`${pct(row.arcs.form?.coverage)} of the evidence used your form`} />
        <Check label="Tested at your dose?" answer={dose.answer} tone={dose.tone} coverage={row.arcs.dose?.coverage} covText={`${pct(row.arcs.dose?.coverage)} of the evidence was dosed near yours`} />
        <Check label="How much evidence?" answer={amount.answer} tone={amount.tone} coverage={row.arcs.evidence?.coverage} covText={`confidence ${pct(row.arcs.evidence?.coverage)}`} />
      </ul>
      <footer className="scan-outcome-foot">
        {row.applicability != null ? <span>{pct(row.applicability)} of this evidence applies to your exact product.</span> : null}
        <details className="scan-numbers">
          <summary>Show the numbers</summary>
          <dl className="la-read-grid">
            <div>
              <dt>Effect verdict</dt>
              <dd>{signed(row.arcs.effect?.verdict)}</dd>
            </div>
            <div>
              <dt>Form strength</dt>
              <dd>
                {fixed(row.arcs.form?.strength)}
                {row.arcs.form?.basis ? ` (${row.arcs.form.basis})` : ""}
              </dd>
            </div>
            <div>
              <dt>Dose closeness</dt>
              <dd>
                {fixed(row.arcs.dose?.closeness)}
                {row.arcs.dose?.product_match ? ` (${row.arcs.dose.product_match.replace(/_/g, " ")})` : ""}
              </dd>
            </div>
            <div>
              <dt>Confidence c</dt>
              <dd>{fixed(row.arcs.evidence?.coverage)}</dd>
            </div>
            <div>
              <dt>Applicability</dt>
              <dd>{fixed(row.applicability)}</dd>
            </div>
            <div>
              <dt>Trials</dt>
              <dd>{row.n_primaries ?? "—"}</dd>
            </div>
          </dl>
        </details>
      </footer>
    </article>
  );
}

function EvidenceSection({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const evidence = evidenceOf(data);
  if (!data.product || !evidence) return null;
  const rows = evidence.rows ?? [];
  const census = data.census as { available?: boolean; rcts_indexed?: number; syntheses_indexed?: number } | undefined;
  return (
    <Section id="evidence" eyebrow="Evidence" title="Does it work?" basis={["evidence_run"]} legend={legend}>
      {evidence.validity ? (
        <div className={`la-alert ${evidence.validity.public_claims_allowed ? "la-alert-ok" : "la-alert-warn"}`}>
          <strong>{evidence.validity.public_claims_allowed ? "Validated run." : "Early-stage results, not a product claim."}</strong>
          <span>
            {evidence.validity.public_claims_allowed
              ? evidence.validity.note
              : `This run is marked ${evidence.validity.status ?? "unvalidated"}: the trials are real and quoted, but the scoring has not passed independent validation yet.`}
          </span>
        </div>
      ) : null}
      {rows.length ? (
        <>
          <p className="scan-note">
            One card per health outcome the trials measured. The gauge is the score; the four checks underneath are what it is made of, and a check can be weak while the score is fine.
          </p>
          <div className="scan-outcomes">
            {rows.map((row) => (
              <OutcomeCard key={row.outcome} row={row} />
            ))}
          </div>
        </>
      ) : (
        <div className="la-empty">
          <strong>{evidence.status === "form_not_scored" ? "This form has not been run yet." : "No evidence run exists for this ingredient yet."}</strong>
          <span>
            {evidence.status === "form_not_scored"
              ? `Trials scored so far used ${(evidence.scored_forms ?? []).map(humanForm).join(", ") || "another form"}. Evidence about another form is not evidence about yours, so no number is shown.`
              : "Not measured is not a low score. A score needs the full pipeline over ~180 studies; the model orientation below is what can be said meanwhile."}
          </span>
          {census?.available ? (
            <div className="la-census">
              <span className="la-census-tag">Counts, not a score</span>
              <div className="la-census-figures">
                <div className="la-census-figure">
                  <strong>{String(census.rcts_indexed)}</strong>
                  <span>randomised trials</span>
                </div>
                <div className="la-census-figure">
                  <strong>{String(census.syntheses_indexed)}</strong>
                  <span>systematic reviews</span>
                </div>
              </div>
              <span className="la-dim">Indexed in Europe PMC at supplement scope.</span>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------ 3b. model orientation -- */

const STRENGTH_DOTS: Record<string, number> = { strong: 3, moderate: 2, limited: 1, none: 0 };
const DIRECTION_TEXT: Record<string, string> = {
  benefit: "Points to benefit",
  no_effect: "No effect found",
  harm: "Possible harm",
  insufficient: "Not enough research",
};

function StrengthDots({ strength }: { strength: string }) {
  const n = STRENGTH_DOTS[strength] ?? 0;
  return (
    <span className="scan-dots" role="img" aria-label={`${strength} evidence`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? "is-on" : ""} />
      ))}
      <span>{strength} evidence</span>
    </span>
  );
}

function PriorSection({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const prior = data.evidence_prior;
  if (!prior) return null;
  return (
    <Section id="prior" eyebrow="Evidence orientation" title="What the published research says" basis={["model_prior"]} legend={legend}>
      <p className="scan-disclaimer">
        No trial run exists for this product, so this is the model&rsquo;s recollection of the literature, not trials we read and scored. It carries no
        score on purpose: a recalled number would look exactly like a measured one.
      </p>
      {prior.status === "ok" && prior.data ? (
        <>
          <p className="scan-note">{prior.data.summary}</p>
          {prior.data.outcomes.length ? (
            <ul className="scan-list">
              {prior.data.outcomes.map((o, i) => (
                <li key={`${o.outcome}-${i}`} className={`scan-item scan-item-model_prior scan-prior scan-prior-${o.direction}`}>
                  <div className="scan-item-head">
                    <strong>{cap(o.outcome)}</strong>
                    <span className={`scan-dirchip scan-dir-${o.direction}`}>{DIRECTION_TEXT[o.direction] ?? o.direction}</span>
                  </div>
                  <StrengthDots strength={o.evidence_strength} />
                  {o.note ? <p>{o.note}</p> : null}
                  {o.dose_reading ? (
                    <p className={o.dose_closeness != null && o.dose_closeness >= 0.999 ? "scan-dose-hit" : "scan-dose-miss"}>{o.dose_reading}</p>
                  ) : null}
                  <span className="la-dim">
                    {o.population ? `Population: ${o.population}. ` : ""}
                    {o.pooled_effect_recalled ? `Pooled estimate recalled: ${o.pooled_effect_recalled}. ` : ""}
                    Model confidence: {o.confidence}.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="la-dim">The model named no outcome with describable evidence for this ingredient.</p>
          )}
          {prior.data.safety_notes?.length ? (
            <div className="scan-item scan-item-model_prior">
              <div className="scan-item-head">
                <strong>Safety notes</strong>
                <EstimateBadge />
              </div>
              <ul className="scan-plain">
                {prior.data.safety_notes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {prior.data.caveats?.length ? <p className="la-dim">The model is unsure about: {prior.data.caveats.join("; ")}</p> : null}
        </>
      ) : (
        <p className="la-dim">Orientation unavailable: {prior.reason ?? "skipped"}.</p>
      )}
    </Section>
  );
}

/* --------------------------------------------------------- 3c. the dose -- */

function DoseBar({ reading, dose }: { reading: NonNullable<ScanAnalysis["dose_effectiveness"]>["outcomes"][number]; dose: NullableNumber }) {
  const b = reading.benefit_range_mg;
  const n = reading.null_range_mg;
  const candidates = [b?.high, n?.high, dose].filter((x): x is number => typeof x === "number" && x > 0);
  const max = candidates.length ? Math.max(...candidates) * 1.25 : 1;
  const left = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const width = (lo: number, hi: number) => `${Math.max(1.5, Math.min(100, ((hi - lo) / max) * 100))}%`;
  const tone: Tone = reading.tone === "in_range" ? "good" : reading.tone === "unassessable" ? "unknown" : "caution";
  return (
    <div className={`scan-dose scan-dose-${reading.tone}`}>
      <div className="scan-dose-head">
        <ToneMark tone={tone} />
        <strong>{outcomeName(reading)}</strong>
      </div>
      <div className="scan-dosebar" role="img" aria-label={reading.reading}>
        {n && n.low !== null && n.high !== null ? <span className="scan-band scan-band-null" style={{ left: left(n.low), width: width(n.low, n.high) }} /> : null}
        {b && b.low !== null && b.high !== null ? <span className="scan-band scan-band-benefit" style={{ left: left(b.low), width: width(b.low, b.high) }} /> : null}
        {dose !== null && dose !== undefined ? <span className="scan-marker" style={{ left: left(dose) }} /> : null}
      </div>
      <div className="scan-dose-scale" aria-hidden="true">
        <span>0</span>
        <span>{mg(max)}</span>
      </div>
      <p className="scan-reading">{reading.reading}</p>
    </div>
  );
}

function DoseSection({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const dose = data.dose_effectiveness;
  if (!dose) return null;
  return (
    <Section id="dose" eyebrow="Dose" title="Is the dose right?" basis={["evidence_run", "label"]} legend={legend}>
      <p className="scan-note">{dose.note}</p>
      {dose.outcomes.length ? (
        <div className="scan-doses">
          {dose.outcomes.map((o) => (
            <DoseBar key={o.outcome} reading={o} dose={dose.scored_dose_mg} />
          ))}
          <div className="scan-dose-key" aria-hidden="true">
            <span>
              <i className="scan-key scan-key-benefit" /> where trials found benefit
            </span>
            <span>
              <i className="scan-key scan-key-null" /> where trials found nothing
            </span>
            <span>
              <i className="scan-key scan-key-marker" /> your dose
            </span>
          </div>
        </div>
      ) : (
        <p className="la-dim">No scored outcome, so there is no dose range to compare against.</p>
      )}
    </Section>
  );
}

/* -------------------------------------------------- 3d. form and the mix -- */

function severityLabel(kind: string, severity: string): string {
  const k = kind.replace(/_/g, " ");
  return severity === "high" ? `${k} · high` : severity === "moderate" ? `${k} · moderate` : k;
}

function MixSection({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const compat = data.compatibility;
  if (!compat) return null;
  const fit = compat.evidence_form_fit;
  const fitTone: Tone = fit.status === "exact_form_scored" ? "good" : fit.status === "form_not_scored" ? "caution" : "unknown";
  return (
    <Section id="form" eyebrow="Form & combination" title="Does the form and the mix hold up?" basis={compat.basis_used} legend={legend}>
      <div className={`scan-item scan-formfit scan-formfit-${fitTone}`}>
        <div className="scan-item-head">
          <ToneMark tone={fitTone} />
          <strong>
            {fit.status === "exact_form_scored"
              ? "Your form is the form the evidence run scored."
              : fit.status === "form_not_scored"
                ? "Your form has not been run; evidence about another form is not evidence about yours."
                : fit.status === "ingredient_not_scored"
                  ? "No evidence run exists for this ingredient yet, so the form arc is empty."
                  : "Form fit unknown."}
          </strong>
        </div>
        {fit.scored_forms.length && fit.status !== "exact_form_scored" ? <p className="la-dim">Forms run so far: {fit.scored_forms.map(humanForm).join(", ")}.</p> : null}
      </div>

      {compat.form_notes.length ? (
        <ul className="scan-list">
          {compat.form_notes.map((n, i) => (
            <li key={`${n.active}-${i}`} className={`scan-item scan-item-${n.basis}`}>
              <div className="scan-item-head">
                <strong>About {n.active}</strong>
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
        <span className="scan-check-label">Actives read off the label</span>
        <div className="scan-chips">
          {compat.actives.map((a) => (
            <span key={a.printed} className="scan-chip">
              {a.printed}
              {a.compound_dose_mg !== null ? ` · ${mg(a.compound_dose_mg)}` : ""}
            </span>
          ))}
        </div>
      </div>

      {compat.status === "single_active" ? (
        <p className="scan-plainline">
          <ToneMark tone="good" /> One active on the panel, so there is no combination to check.
        </p>
      ) : compat.interactions.length ? (
        <ul className="scan-list">
          {compat.interactions.map((x, i) => (
            <li key={`${x.a}-${x.b}-${i}`} className={`scan-item scan-item-${x.basis} scan-sev-${x.severity}`}>
              <div className="scan-item-head">
                <ToneMark tone={x.severity === "high" ? "concern" : x.severity === "moderate" ? "caution" : "good"} />
                <strong>
                  {x.a} + {x.b}
                </strong>
                <span className="scan-sev">{severityLabel(x.kind, x.severity)}</span>
                <BasisBadge kind={x.basis} legend={legend} />
              </div>
              {x.advice ? <p>{x.advice}</p> : null}
              {x.mechanism ? <p className="la-dim">{x.mechanism}</p> : null}
              {x.source ? (
                <a href={x.source.url} target="_blank" rel="noreferrer">
                  {x.source.title}
                </a>
              ) : x.confidence ? (
                <span className="la-dim">Model confidence: {x.confidence}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="scan-plainline">
          <ToneMark tone="good" /> No documented interaction among these actives in the curated table.
        </p>
      )}

      {compat.model.status === "ok" && compat.model.overall ? (
        <div className="scan-item scan-item-model_prior">
          <div className="scan-item-head">
            <strong>Model summary of the combination</strong>
            <EstimateBadge />
          </div>
          <p>{compat.model.overall}</p>
        </div>
      ) : compat.model.status === "unavailable" ? (
        <p className="la-dim">Model fill-in unavailable: {compat.model.reason}.</p>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------ 3e. the company -- */

function CompanySection({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const company = data.company;
  if (!company) return null;
  const profile = company.profile.status === "ok" ? company.profile.data : null;
  const registry = company.registry;
  const recallTone: Tone = registry.status === "ok" ? "concern" : registry.status === "no_matches" ? "good" : "unknown";
  const testingStatus = profile?.third_party_testing.status ?? "unknown";
  const seals = company.certifications_printed;
  const testingTone: Tone = testingStatus === "documented" ? "good" : testingStatus === "claimed" || seals.length ? "mixed" : "unknown";
  const history = profile?.regulatory_history ?? [];
  const historyTone: Tone = !profile ? "unknown" : history.some((h) => h.kind !== "other" && h.registry_corroborated !== false) ? "caution" : "good";

  return (
    <Section id="company" eyebrow="Company" title="Who makes it, and what is on record?" basis={company.basis_used.length ? company.basis_used : ["label"]} legend={legend}>
      {company.status === "no_brand_on_label" ? (
        <p className="la-dim">No brand or manufacturer is printed on this panel, so there is nothing to look up.</p>
      ) : (
        <ul className="scan-trust">
          <li className="scan-trust-row">
            <ToneMark tone={recallTone} />
            <div>
              <div className="scan-item-head">
                <strong>FDA recalls</strong>
                <BasisBadge kind="registry" legend={legend} />
              </div>
              {registry.status === "ok" ? (
                <ul className="scan-recalls">
                  {registry.recalls.map((r, i) => (
                    <li key={r.recall_number ?? i}>
                      <strong>
                        {r.initiated ?? "date —"} · {r.classification ?? "class —"} · {r.status ?? ""}
                      </strong>
                      <span>{r.product}</span>
                      <span className="la-dim">{r.reason}</span>
                      <span className="la-dim">Firm: {r.firm}</span>
                    </li>
                  ))}
                </ul>
              ) : registry.status === "no_matches" ? (
                <p>None on file under {registry.queried.join(" or ")}.</p>
              ) : registry.status === "unavailable" ? (
                <p className="la-dim">Registry unavailable: {registry.reason}.</p>
              ) : (
                <p className="la-dim">Not queried.</p>
              )}
              {registry.note ? <span className="la-dim">{registry.note}</span> : null}
            </div>
          </li>

          <li className={`scan-trust-row${profile ? " is-model" : ""}`}>
            <ToneMark tone={testingTone} />
            <div>
              <div className="scan-item-head">
                <strong>Third-party testing</strong>
                <BasisBadge kind="label" legend={legend} />
                {profile ? <EstimateBadge /> : null}
              </div>
              {seals.length ? (
                <div className="scan-chips">
                  {seals.map((c) => (
                    <span key={c.text} className="scan-chip scan-chip-claim" title={c.note}>
                      {c.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p>No third-party seal is printed on the label.</p>
              )}
              {profile ? (
                <p>
                  {testingStatus === "documented"
                    ? `The model recalls documented third-party testing${profile.third_party_testing.program ? ` (${profile.third_party_testing.program})` : ""}.`
                    : testingStatus === "claimed"
                      ? `The model recalls testing that is claimed but not documented${profile.third_party_testing.program ? ` (${profile.third_party_testing.program})` : ""}.`
                      : "The model recalls no third-party testing programme."}
                  {" "}Batch certificates public: {profile.transparency.coa_published}.
                </p>
              ) : null}
              <span className="la-dim">A seal is a claim as printed; the certifier&rsquo;s registry confirms it, this page does not.</span>
            </div>
          </li>

          {profile ? (
            <li className="scan-trust-row is-model">
              <ToneMark tone={historyTone} />
              <div>
                <div className="scan-item-head">
                  <strong>Regulatory history</strong>
                  <EstimateBadge />
                </div>
                {history.length ? (
                  <ul className="scan-reg">
                    {history.map((h, i) => (
                      <li key={i}>
                        <strong>
                          {h.kind.replace(/_/g, " ")}
                          {h.year ? ` · ${h.year}` : ""}
                        </strong>
                        <span>{h.summary}</span>
                        <span className="la-dim">
                          Model confidence {h.confidence}
                          {h.kind === "recall"
                            ? h.registry_corroborated === true
                              ? " · a recall IS on file in openFDA"
                              : h.registry_corroborated === false
                                ? " · NOT corroborated by openFDA under this firm name"
                                : ""
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No widely reported regulatory action recalled by the model.</p>
                )}
              </div>
            </li>
          ) : null}

          <li className={`scan-trust-row${profile ? " is-model" : ""}`}>
            <ToneMark tone={profile ? (profile.known ? "good" : "unknown") : "unknown"} />
            <div>
              <div className="scan-item-head">
                <strong>About {company.brand ?? company.manufacturer ?? "the company"}</strong>
                <BasisBadge kind="label" legend={legend} />
                {profile ? <EstimateBadge /> : null}
              </div>
              <dl className="la-read-grid">
                <div>
                  <dt>Manufacturer</dt>
                  <dd>{company.manufacturer ?? "not printed"}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{company.country_of_origin ?? "not printed"}</dd>
                </div>
                {profile?.known ? (
                  <>
                    <div>
                      <dt>Founded</dt>
                      <dd>{profile.founded_year ?? "unknown"}</dd>
                    </div>
                    <div>
                      <dt>Headquarters</dt>
                      <dd>{profile.headquarters_country ?? "unknown"}</dd>
                    </div>
                    <div>
                      <dt>Ownership</dt>
                      <dd>
                        {profile.ownership_type}
                        {profile.parent_company ? ` (${profile.parent_company})` : ""}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {profile ? <p>{profile.summary}</p> : company.profile.status === "unavailable" ? <p className="la-dim">Company profile unavailable: {company.profile.reason}.</p> : null}
              {profile?.reputation_notes.length ? (
                <ul className="scan-plain">
                  {profile.reputation_notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {profile?.caveats.length ? <span className="la-dim">The model could not confirm: {profile.caveats.join("; ")}.</span> : null}
            </div>
          </li>
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------- 4. fine print -- */

function FinePrint({ data, legend }: { data: ScanAnalysis; legend: Legend }) {
  const evidence = evidenceOf(data);
  const run = evidence?.run;
  return (
    <details className="scan-fineprint">
      <summary>How to read this page, and where every number came from</summary>
      <div className="scan-fineprint-grid">
        <div>
          <h4>The source badges</h4>
          <ol className="scan-legend">
            {(Object.entries(legend) as Array<[Basis, Legend[Basis]]>)
              .sort(([, a], [, b]) => a.rank - b.rank)
              .map(([kind, entry]) => (
                <li key={kind}>
                  <BasisBadge kind={kind} legend={legend} />
                  <span>{entry.means}</span>
                </li>
              ))}
          </ol>
        </div>
        <div>
          <h4>The score</h4>
          <p>
            Each outcome&rsquo;s score is the signed evidence verdict rescaled onto 0–100, so 50 means the trials point nowhere. A positive score is pulled back toward 50 by
            however much of the evidence is not about your form and dose. The dose term is recomputed for the dose on your label; effect, form and confidence come from the
            retained run unchanged.
          </p>
          {run ? (
            <dl className="la-read-grid">
              {Object.entries(run).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replace(/_/g, " ")}</dt>
                  <dd>{v === null || v === undefined ? "—" : String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {evidence?.validity?.limitations?.length ? (
            <ul className="la-limits">
              {evidence.validity.limitations.map((l, i) => (
                <li key={i}>{String(l)}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <h4>This scan</h4>
          <dl className="la-read-grid">
            <div>
              <dt>Took</dt>
              <dd>{data.meta.timing_s}s</dd>
            </div>
            <div>
              <dt>Label read by</dt>
              <dd>{data.meta.models.vision ?? "—"}</dd>
            </div>
            <div>
              <dt>Text model</dt>
              <dd>{data.meta.models.text ?? "—"}</dd>
            </div>
            <div>
              <dt>Read confidence</dt>
              <dd>{data.label?.confidence ?? "—"}</dd>
            </div>
            {Object.entries(data.meta.prompt_versions).map(([k, v]) => (
              <div key={k}>
                <dt>{k.replace(/_/g, " ")} prompt</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {data.label?.evidence_spans?.length ? <p className="la-spans">Read from: {data.label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p> : null}
        </div>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------- the page -- */

export function ScanReport({ data, imageUrl = null }: { data: ScanAnalysis; imageUrl?: string | null }) {
  const legend = data.basis_legend;

  if (data.status === "analyzer_unavailable") {
    return (
      <div className="la-result scan-result">
        <div className="la-empty">
          <strong>Scanning is not configured on this deployment.</strong>
          <span>The server needs a model API key (DEEPSEEK_API_KEY). The retained runs are unaffected.</span>
        </div>
      </div>
    );
  }
  if (!data.label) return null;
  if (data.status === "not_a_supplement_label") {
    return (
      <div className="la-result scan-result">
        <div className="la-empty">
          <strong>That does not look like a supplement label.</strong>
          <span>Upload the Supplement Facts panel so the ingredient and dose can be read.</span>
        </div>
      </div>
    );
  }

  const present = new Set<string>();
  if (data.product && evidenceOf(data)) present.add("scan-evidence");
  if (data.evidence_prior) present.add("scan-prior");
  if (data.dose_effectiveness) present.add("scan-dose");
  if (data.compatibility) present.add("scan-form");
  if (data.company) present.add("scan-company");

  return (
    <div className="la-result scan-result">
      <ProductCard data={data} imageUrl={imageUrl} />
      <VerdictCard data={data} legend={legend} present={present} />

      {data.status === "ingredient_not_supported" ? (
        <div className="la-alert la-alert-warn">
          <strong>{data.ingredient_label_text ?? "This ingredient"} has not been run through the trial pipeline yet.</strong>
          <span>
            The evidence reading below is a model estimate and is marked as such. Not measured is not a low score.
            {data.queue && (data.queue as { queued?: boolean }).queued ? " Your scan was recorded as demand for a run." : ""}
            {data.supported_ingredients?.length ? ` Run so far: ${data.supported_ingredients.join(", ")}.` : ""}
          </span>
        </div>
      ) : null}

      {data.caveats?.length ? (
        <ul className="scan-caveats" aria-label="Things to know about this result">
          {data.caveats.map((c) => (
            <li key={c.code}>
              <ToneMark tone="caution" />
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <EvidenceSection data={data} legend={legend} />
      <PriorSection data={data} legend={legend} />
      <DoseSection data={data} legend={legend} />
      <MixSection data={data} legend={legend} />
      <CompanySection data={data} legend={legend} />
      <FinePrint data={data} legend={legend} />
    </div>
  );
}
