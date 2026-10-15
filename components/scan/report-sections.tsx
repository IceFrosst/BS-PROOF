/* The report sections of a /scan result. Every block carries a basis badge;
 * model knowledge is the one dashed amber badge and is never typeset like a
 * measurement (CLAUDE.md invariant 1). */

import type { ReactNode } from "react";

import type { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { ScanAnalysis } from "@/lib/analyze/scan";

import { firstSentence, mg, severityLabel, words } from "./format";
import { BasisBadge, Facts, Notice, Section, type Basis, type Legend } from "./primitives";

type Mlm = ReturnType<typeof businessModelDisclosure>;
type Disclosure = { title: string; body: string };

/* Evidence grading is not active yet (2026-10-15). One plain notice, shown on
 * the landing screen and at the top of every result, so nobody reads the
 * unverified sections below as a grade. */
export function GradingNotice() {
  return (
    <div className="la-alert la-alert-warn sc-grading-notice" role="note" aria-label="Evidence grading is not active yet">
      <strong>Evidence grades are not active yet.</strong>
      <span>
        We are still validating how we grade the research behind each supplement, so no product gets a grade
        today. What you see is what the label says and background marked &ldquo;unverified&rdquo;.
      </span>
    </div>
  );
}

/* The collapsible list of warnings: caveats and disclosures. */
export function Warnings({ count, children }: { count: number; children: ReactNode }) {
  if (!count) return null;
  return <details className="ab-warnings"><summary><span>{count} warning{count === 1 ? "" : "s"}</span></summary><div className="ab-warning-list">{children}</div></details>;
}

/* Every warning row, in one order. Disclosures only: none of them is a grade. */
export function WarningNotices({ caveats, disclosures, mlm, brand }: { caveats: ScanAnalysis["caveats"] | undefined; disclosures: Disclosure[]; mlm: Mlm; brand: string | null | undefined }) {
  return (
    <>
      {caveats?.map((c) => <Notice key={c.code} title={words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(c.text)} body={c.text} />)}
      {disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={`${d.title} disclosure`} />)}
      {mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body.replace(/^Model knowledge — unverified\.\s*/, "").replace(/^This company/, `${brand ?? "This company"}`))} body={mlm.body} role="note" ariaLabel="Business model disclosure" /> : null}
    </>
  );
}

/* "What you entered" (typed) or "Label details" (photo). TYPED IS NOT READ:
 * a manual entry never shows a read confidence, quoted spans or a vision model. */
export function EntryDetails({ typed, entry, label, product, legend, summaryParts }: { typed: boolean; entry: ScanAnalysis["input"]; label: ScanAnalysis["label"]; product: ScanAnalysis["product"]; legend: Legend; summaryParts: string[] }) {
  return (
    <>
      {typed && entry ? <details className="scan-lab-disclosure" open={false}><summary><h3>What you entered</h3><BasisBadge kind="user_input" legend={legend} /></summary><p className="la-dim"><b>{entry.ingredient_label}</b>, {entry.form_label}. {summaryParts.join(", ")}. Typed, not read from a label.</p><Facts rows={[["Ingredient", entry.ingredient_label], ["Form", entry.form_label], ["Dose per serving", entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} compound` : "no dose entered"], ...(product ? [["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, ReactNode]> : []), ...(entry.servings_per_day !== null ? [["Servings per day", String(entry.servings_per_day)]] as Array<[string, ReactNode]> : [])]} /></details> : label ? <details className="scan-lab-disclosure"><summary><h3>Label details</h3><BasisBadge kind="label" legend={legend} /></summary><p className="la-dim"><b>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</b>, {label.form_vocab_id ? words(label.form_vocab_id) : "form not stated"}. {summaryParts.join(", ")}.</p><Facts rows={[["Ingredient", label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"], ["Form", label.form_vocab_id ? words(label.form_vocab_id) : "not stated"], ["Dose per serving", `${mg(label.compound_dose_mg)} compound`], ...(product ? [["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, ReactNode]> : []), ...(label.servings_per_day !== null ? [["Servings per day", String(label.servings_per_day)]] as Array<[string, ReactNode]> : []), ["Read confidence", label.confidence], ["Source", <BasisBadge key="label-source" kind="label" legend={legend} />]]} />{label.evidence_spans?.length ? <p className="la-spans">Read from: {label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p> : null}</details> : null}
    </>
  );
}

export function PriorSection({ prior, legend }: { prior: NonNullable<ScanAnalysis["evidence_prior"]>; legend: Legend }) {
  return (
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
                  {o.dose_reading ? <p className={o.dose_in_range ? "scan-dose-hit" : "scan-dose-miss"}>{o.dose_reading}</p> : null}
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
  );
}


export function CompatibilitySection({ compat, legend, typed }: { compat: NonNullable<ScanAnalysis["compatibility"]>; legend: Legend; typed: boolean }) {
  return (
    <Section id="form" title="Does the form and the mix hold up?" basis={compat.basis_used} legend={legend}>
      <p className="scan-formfit">
        <strong>
          {compat.evidence_form_fit.status === "exact_form_scored"
            ? "Your form is the form the evidence run scored."
            : compat.evidence_form_fit.status === "form_not_scored"
              ? "Your form has not been run; evidence about another form is not evidence about yours."
              : compat.evidence_form_fit.status === "ingredient_not_scored"
                ? "Evidence grading is not active yet, so no form has been graded."
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
  );
}

export function CompanySection({ company, legend, typed, mlm }: { company: NonNullable<ScanAnalysis["company"]>; legend: Legend; typed: boolean; mlm: Mlm }) {
  return (
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
                {mlm ? <p className="la-dim sc-fine">Business model: see &ldquo;{mlm.title}&rdquo; in the evidence warnings.</p> : null}
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
  );
}

export function SourceLegend({ legend }: { legend: Legend }) {
  return (
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
  );
}

export function TechnicalDetails({ data, typed }: { data: ScanAnalysis; typed: boolean }) {
  return (
    <details className="sc-details sc-technical">
      <summary>Technical details</summary>
      {data.meta ? (
        <Facts
          rows={[
            ["Source", typed ? "typed" : "photo"],
            ["Took", `${data.meta.timing_s} s`],
            ...(typed ? [] : ([["Vision model", data.meta.models.vision ?? "—"]] as Array<[string, ReactNode]>)),
            ["Text model", data.meta.models.text ?? "—"],
            ...Object.entries(data.meta.stages ?? {}).map(([k, v]) => [`Stage: ${words(k)}`, v === null || v === undefined ? "skipped" : `${v} s`] as [string, ReactNode]),
            ...Object.entries(data.meta.prompt_versions ?? {}).map(([k, v]) => [`Prompt: ${words(k)}`, String(v)] as [string, ReactNode]),
            ...(data.run_id ? ([["Run id", <code key="r">{data.run_id}</code>]] as Array<[string, ReactNode]>) : []),
            ...(data.app_version
              ? ([
                  [
                    "App version",
                    <code key="v">
                      {data.app_version.package_version}
                      {data.app_version.git_sha ? ` ${data.app_version.git_sha.slice(0, 8)}` : ""}
                    </code>,
                  ],
                ] as Array<[string, ReactNode]>)
              : []),
            ...(data.persistence ? ([["Run stored", words(data.persistence.status)]] as Array<[string, ReactNode]>) : []),
          ]}
        />
      ) : null}
    </details>
  );
}
