"use client";

/*
 * THE /scan RESULT BODY (2026-11 merge): what a scan shows after the label read,
 * now that evidence grading is not active (2026-10-15) and live research was
 * removed (2026-11). Every block carries a basis badge; model knowledge is the
 * one dashed amber badge and is never typeset like a measurement (CLAUDE.md
 * invariant 1). Nothing here computes, shows or implies a grade:
 * <GradingNotice> says so on every result and History replay.
 *
 * Display language: fixed words come from lib/i18n/copy/result.ts (EN/LT);
 * text a model or the server wrote goes through `tr` (identity in English).
 * Stored values are never edited, so a History replay renders the same way.
 */

import { useId, type ReactNode } from "react";

import { businessModelDisclosure } from "@/lib/analyze/business-model";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ScanAnalysis } from "@/lib/analyze/scan";
import { RESULT_COPY, enumWord, strengthLabel, type ResultCopy } from "@/lib/i18n/copy/result";
import { useLang, type Lang } from "@/lib/i18n/locale";
import { useTr } from "@/lib/i18n/translate-client";

type Basis = keyof ScanAnalysis["basis_legend"];
type Legend = ScanAnalysis["basis_legend"];
type Tr = (text: string) => string;

function useCopy(): { lang: Lang; r: ResultCopy; tr: Tr } {
  const { lang } = useLang();
  return { lang, r: RESULT_COPY[lang], tr: useTr() };
}

function words(value: string): string {
  return value.replace(/_/g, " ");
}

/** A recorded mass exactly as recorded: no rounding and no unit change (0.05 mg stays "0.05 mg"). */
function exactMg(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value} mg`;
}

/* A short lede for a notice: its first sentence, minus the "Model knowledge —
 * unverified." prefix every model disclosure carries (the badge says that). */
function firstSentence(body: string): string {
  const stripped = body.replace(/^(Model knowledge — unverified|Modelio žinios — nepatikrinta)\.\s*/, "");
  const m = stripped.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : stripped).trim();
}

export function BasisBadge({ kind, legend }: { kind: Basis; legend: Legend }) {
  const { lang, r } = useCopy();
  // English shows the legend the server stored; Lithuanian the same badges, keyed.
  const entry = lang === "en" || !r.basis[kind] ? legend[kind] : r.basis[kind];
  return (
    <span className={`scan-badge scan-badge-${kind}`} title={entry.means}>
      {entry.label}
    </span>
  );
}

export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
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

function Section({ id, title, basis, legend, children }: { id: string; title: string; basis: Basis[]; legend: Legend; children: ReactNode }) {
  const { r } = useCopy();
  // A live result and a History replay can be on the page together: ids are per instance.
  const uid = useId();
  return (
    <details className="scan-section scan-lab-disclosure" id={`${uid}-scan-${id}`}>
      <summary className="scan-section-head" id={`${uid}-scan-${id}-title`}>
        <h3>{title}</h3>
        <div className="scan-badges" aria-label={r.sourcesUsed}>
          {basis.map((b) => <BasisBadge key={b} kind={b} legend={legend} />)}
        </div>
      </summary>
      <div className="scan-section-body">{children}</div>
    </details>
  );
}

/* One warning row: a one-line summary, the full text inside a native <details>.
 * Keeps the `la-alert la-alert-warn` class every disclosure has carried. */
function Notice({ title, body, lede, role, ariaLabel }: { title: string; body: string; lede?: string; role?: "note"; ariaLabel?: string }) {
  return (
    <details className="ab-warning-row la-alert la-alert-warn" role={role} aria-label={ariaLabel}>
      <summary><strong>{title}</strong>{lede ? <span>{lede}</span> : null}</summary>
      <p>{body}</p>
    </details>
  );
}

/* Evidence grading is not active yet (2026-10-15). One plain notice, shown on
 * every result and replay, so nobody reads the unverified sections as a grade. */
export function GradingNotice() {
  const { r } = useCopy();
  return (
    <div className="la-alert la-alert-warn sc-grading-notice" role="note" aria-label={r.gradingNoticeAria} data-testid="grading-notice">
      <strong>{r.gradingNoticeTitle}</strong>
      <span>{r.gradingNoticeBody}</span>
    </div>
  );
}

/* Caveats and disclosures, in one collapsible list. None of them is a grade. */
export function WarningsCard({ data }: { data: ScanAnalysis }) {
  const { lang, r, tr } = useCopy();
  const locale = { lang, tr, confidenceWord: (value: string) => enumWord(lang, value) };
  const disclosures = literatureDisclosures(data.literature_warnings?.data, locale);
  const company = data.company;
  const mlm = company?.profile.status === "ok" ? businessModelDisclosure(company.profile.data?.business_model, locale) : null;
  const caveats = data.caveats ?? [];
  const count = caveats.length + disclosures.length + (mlm ? 1 : 0);
  if (!count) return null;
  return (
    <section className="ab-card scan-lab-card">
      <details className="ab-warnings">
        <summary><span>{r.warningCount(count)}</span></summary>
        <div className="ab-warning-list">
          {caveats.map((c) => {
            const text = tr(c.text);
            return <Notice key={c.code} title={r.caveatTitle[c.code] ?? words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(text)} body={text} />;
          })}
          {disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={r.disclosureAria(d.title)} />)}
          {mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body)} body={mlm.body} role="note" ariaLabel={r.businessModelAria} /> : null}
        </div>
      </details>
    </section>
  );
}

export function PriorSection({ prior, legend }: { prior: NonNullable<ScanAnalysis["evidence_prior"]>; legend: Legend }) {
  const { lang, r, tr } = useCopy();
  return (
    <Section id="prior" title={r.priorTitle} basis={["model_prior"]} legend={legend}>
      <p className="scan-disclaimer">{tr(prior.disclaimer)}</p>
      {prior.status === "ok" && prior.data ? (
        <>
          <p className="scan-note">{tr(prior.data.summary)}</p>
          {prior.data.evidence_landscape ? (
            <p className="la-dim">
              {r.systematicReviews} {enumWord(lang, prior.data.evidence_landscape.syntheses_exist)}
              {prior.data.evidence_landscape.note ? `. ${tr(prior.data.evidence_landscape.note)}` : ""}
            </p>
          ) : null}
          {prior.data.outcomes.length ? (
            <ul className="scan-list">
              {prior.data.outcomes.map((o, i) => (
                <li key={`${o.outcome}-${i}`} className="scan-item scan-item-model_prior scan-prior">
                  <div className="scan-item-head">
                    <strong>{tr(o.outcome)}</strong>
                    <span className={`scan-dirchip scan-dir-${o.direction}`}>{enumWord(lang, o.direction)}</span>
                    <span className={`scan-strength scan-strength-${o.evidence_strength}`}>{strengthLabel(lang, o.evidence_strength)}</span>
                  </div>
                  {o.note ? <p>{tr(o.note)}</p> : null}
                  {o.pooled_effect_recalled ? <p className="la-dim">{r.pooledRecalled} {tr(o.pooled_effect_recalled)}</p> : null}
                  {o.population ? <p className="la-dim">{r.populationColon} {tr(o.population)}</p> : null}
                  {o.dose_reading ? <p className={o.dose_in_range ? "scan-dose-hit" : "scan-dose-miss"}>{tr(o.dose_reading)}</p> : null}
                  <span className="la-dim">{r.modelConfidence} {enumWord(lang, o.confidence)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="la-dim">{r.noOutcomeNamed}</p>
          )}
          {prior.data.form_assessment ? (
            <div className="scan-item scan-item-model_prior">
              <div className="scan-item-head">
                <strong>{r.thisForm}</strong>
                <span className="scan-strength">{enumWord(lang, prior.data.form_assessment.verdict)}</span>
              </div>
              {prior.data.form_assessment.note ? <p>{tr(prior.data.form_assessment.note)}</p> : null}
            </div>
          ) : null}
          {prior.data.safety_notes?.length ? (
            <div className="scan-item scan-item-model_prior">
              <div className="scan-item-head"><strong>{r.safety}</strong></div>
              <ul className="scan-plain">
                {prior.data.safety_notes.map((s) => <li key={s}>{tr(s)}</li>)}
              </ul>
            </div>
          ) : null}
          {prior.data.caveats?.length ? <p className="la-dim">{r.modelUnsure} {prior.data.caveats.map(tr).join("; ")}</p> : null}
        </>
      ) : (
        <p className="la-dim">{r.orientationUnavailable} {prior.reason ? tr(prior.reason) : r.skipped}</p>
      )}
    </Section>
  );
}

export function CompatibilitySection({ compat, legend, typed }: { compat: NonNullable<ScanAnalysis["compatibility"]>; legend: Legend; typed: boolean }) {
  const { lang, r, tr } = useCopy();
  const severity = (kind: string, sev: string) => {
    const k = enumWord(lang, kind);
    return sev === "high" ? `${k}, ${r.severityHigh}` : sev === "moderate" ? `${k}, ${r.severityModerate}` : k;
  };
  return (
    <Section id="form" title={r.compatTitle} basis={compat.basis_used} legend={legend}>
      {/* No form is graded while grading is off, whatever an older saved scan stored. */}
      <p className="scan-formfit"><strong>{r.formFitNotGraded}</strong></p>
      {compat.form_notes.length ? (
        <ul className="scan-list">
          {compat.form_notes.map((n, i) => (
            <li key={`${n.active}-${i}`} className={`scan-item scan-item-${n.basis}`}>
              <div className="scan-item-head">
                <strong>{n.active}</strong>
                <BasisBadge kind={n.basis} legend={legend} />
              </div>
              <p>{tr(n.note)}</p>
              {n.source ? <a href={n.source.url} target="_blank" rel="noreferrer">{n.source.title}</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="scan-actives">
        <span className="sc-label">{typed ? r.activesEntered : r.activesRead}</span>
        <div className="scan-chips">
          {compat.actives.map((a) => (
            <span key={a.printed} className="scan-chip">
              {a.printed}
              {a.printed_elemental_dose_mg != null ? (
                <span className="scan-chip-dose">{r.elementalPerServing(exactMg(a.printed_elemental_dose_mg))}</span>
              ) : a.compound_dose_mg !== null ? (
                <span className="scan-chip-dose">{exactMg(a.compound_dose_mg)}</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
      {compat.status === "single_active" ? (
        <p className="la-dim">{r.singleActive}</p>
      ) : compat.interactions.length ? (
        <ul className="scan-list">
          {compat.interactions.map((x, i) => (
            <li key={`${x.a}-${x.b}-${i}`} className={`scan-item scan-item-${x.basis} scan-sev-${x.severity}`}>
              <div className="scan-item-head">
                <strong>{x.a} + {x.b}</strong>
                <BasisBadge kind={x.basis} legend={legend} />
              </div>
              <span className="scan-sev">{severity(x.kind, x.severity)}</span>
              {x.advice ? <p>{tr(x.advice)}</p> : null}
              {x.mechanism ? <p className="la-dim">{tr(x.mechanism)}</p> : null}
              {x.source ? (
                <a href={x.source.url} target="_blank" rel="noreferrer">{x.source.title}</a>
              ) : x.confidence ? (
                <span className="la-dim">{r.modelConfidence} {enumWord(lang, x.confidence)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="la-dim">{r.noInteraction}</p>
      )}
      {compat.model.status === "ok" && compat.model.overall ? (
        <div className="scan-item scan-item-model_prior scan-overall">
          <div className="scan-item-head">
            <strong>{r.modelSummary}</strong>
            <BasisBadge kind="model_prior" legend={legend} />
          </div>
          <p>{tr(compat.model.overall)}</p>
        </div>
      ) : compat.model.status === "unavailable" ? (
        <p className="la-dim">{r.modelFillInUnavailable} {tr(compat.model.reason ?? "")}</p>
      ) : null}
    </Section>
  );
}

export function CompanySection({ company, legend, typed }: { company: NonNullable<ScanAnalysis["company"]>; legend: Legend; typed: boolean }) {
  const { lang, r, tr } = useCopy();
  const mlm = company.profile.status === "ok" ? businessModelDisclosure(company.profile.data?.business_model, { lang, tr }) : null;
  return (
    <Section id="company" title={r.companyTitle} basis={company.basis_used.length ? company.basis_used : ["label"]} legend={legend}>
      {company.status === "no_brand_on_label" ? (
        <p className="la-dim">{typed ? r.noBrandTyped : r.noBrandPhoto}</p>
      ) : (
        <>
          <div className="sc-sub">
            <div className="scan-item-head">
              <strong>{r.printedOnLabel}</strong>
              <BasisBadge kind="label" legend={legend} />
            </div>
            <Facts
              rows={[
                [r.brand, company.brand ?? "—"],
                [r.manufacturer, company.manufacturer ?? r.notPrinted],
                [r.country, company.country_of_origin ?? r.notPrinted],
                [
                  r.sealsPrinted,
                  company.certifications_printed.length ? (
                    <span className="scan-chips">
                      {company.certifications_printed.map((c) => (
                        <span key={c.text} className="scan-chip" title={tr(c.note)}>{c.text}</span>
                      ))}
                    </span>
                  ) : (
                    r.none
                  ),
                ],
              ]}
            />
            {company.certifications_printed.length ? <p className="la-dim sc-fine">{r.sealsNote}</p> : null}
          </div>

          <div className="sc-sub">
            <div className="scan-item-head">
              <strong>{r.fdaReports}</strong>
              <BasisBadge kind="registry" legend={legend} />
            </div>
            {company.registry.status === "ok" ? (
              <ul className="scan-recalls">
                {company.registry.recalls.map((rc, i) => (
                  <li key={rc.recall_number ?? i}>
                    <span className="scan-recall-meta">
                      <span>{rc.initiated ?? r.dateDash}</span>
                      <span>{rc.classification ?? r.classDash}</span>
                      {rc.status ? <span>{rc.status}</span> : null}
                    </span>
                    <strong>{rc.product}</strong>
                    <span>{rc.reason ? tr(rc.reason) : "—"}</span>
                    <span className="la-dim">{r.firm} {rc.firm}</span>
                  </li>
                ))}
              </ul>
            ) : company.registry.status === "no_matches" ? (
              <p>{r.noRecallOn(company.registry.queried.join(r.or))}</p>
            ) : company.registry.status === "unavailable" ? (
              <p className="la-dim">{r.registryUnavailable} {tr(company.registry.reason ?? "")}</p>
            ) : (
              <p className="la-dim">{r.notQueried}</p>
            )}
            <p className="la-dim sc-fine">{tr(company.registry.note)}</p>
          </div>

          <div className="scan-item scan-item-model_prior">
            <div className="scan-item-head">
              <strong>{r.companyProfile}</strong>
              <BasisBadge kind="model_prior" legend={legend} />
            </div>
            {company.profile.status === "ok" && company.profile.data ? (
              <div className="scan-profile">
                <p>{tr(company.profile.data.summary)}</p>
                {mlm ? <p className="la-dim sc-fine">{r.businessModelSee(mlm.title)}</p> : null}
                {company.profile.data.regulatory_history.length ? (
                  <ul className="scan-list scan-reg">
                    {company.profile.data.regulatory_history.map((h, i) => (
                      <li key={i}>
                        <strong>{enumWord(lang, h.kind)}{h.year ? `, ${h.year}` : ""}</strong>
                        <span>{tr(h.summary)}</span>
                        <span className="la-dim">
                          {r.profileModelConfidence} {enumWord(lang, h.confidence)}
                          {h.kind === "recall" ? (h.registry_corroborated === true ? r.recallOnFile : h.registry_corroborated === false ? r.notCorroborated : "") : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : company.profile.data.known ? (
                  <p className="la-dim">{r.noRegulatory}</p>
                ) : null}
                {company.profile.data.known || company.profile.data.reputation_notes.length || company.profile.data.caveats.length ? (
                  <details className="sc-details sc-inline-details">
                    <summary>{r.modelRecalls}</summary>
                    {company.profile.data.known ? (
                      <Facts
                        rows={[
                          [r.founded, company.profile.data.founded_year ?? r.unknown],
                          [r.headquarters, company.profile.data.headquarters_country ?? r.unknown],
                          [r.ownership, `${enumWord(lang, company.profile.data.ownership_type)}${company.profile.data.parent_company ? ` (${company.profile.data.parent_company})` : ""}`],
                          [r.thirdParty, `${enumWord(lang, company.profile.data.third_party_testing.status)}${company.profile.data.third_party_testing.program ? `, ${company.profile.data.third_party_testing.program}` : ""}`],
                          [r.batchCerts, enumWord(lang, company.profile.data.transparency.coa_published)],
                          [r.profileConfidence, enumWord(lang, company.profile.data.confidence)],
                        ]}
                      />
                    ) : null}
                    {company.profile.data.reputation_notes.length ? (
                      <ul className="scan-plain">
                        {company.profile.data.reputation_notes.map((n) => <li key={n}>{tr(n)}</li>)}
                      </ul>
                    ) : null}
                    {company.profile.data.caveats.length ? <p className="la-dim">{r.couldNotConfirm} {company.profile.data.caveats.map(tr).join("; ")}</p> : null}
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="la-dim">{r.profileUnavailable} {company.profile.reason ? tr(company.profile.reason) : r.skipped}</p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

export function SourceLegend({ legend }: { legend: Legend }) {
  const { lang, r } = useCopy();
  return (
    <details className="sc-details scan-legend">
      <summary>{r.legendTitle}</summary>
      <ol>
        {Object.entries(legend)
          .sort(([, a], [, b]) => a.rank - b.rank)
          .map(([kind, entry]) => (
            <li key={kind}>
              <BasisBadge kind={kind as Basis} legend={legend} />
              <span>{lang === "en" || !r.basis[kind as Basis] ? entry.means : r.basis[kind as Basis].means}</span>
            </li>
          ))}
      </ol>
    </details>
  );
}

/* The whole body below the label facts. */
export function ResultSections({ data, typed }: { data: ScanAnalysis; typed: boolean }) {
  const legend = data.basis_legend;
  return (
    <>
      {data.evidence_prior ? <PriorSection prior={data.evidence_prior} legend={legend} /> : null}
      {data.compatibility ? <CompatibilitySection compat={data.compatibility} legend={legend} typed={typed} /> : null}
      {data.company ? <CompanySection company={data.company} legend={legend} typed={typed} /> : null}
      <SourceLegend legend={legend} />
    </>
  );
}
