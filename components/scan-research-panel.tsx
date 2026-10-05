"use client";

/*
 * The /scan LIVE RESEARCH SCREEN: what a scan shows between its label read and its
 * result, and the only evidence a scan shows. components/scan-flow.tsx owns the
 * state (lib/scan-research/use-live-research.ts) and renders this; nothing here
 * fetches anything. One of four screens, by `research.phase`:
 *
 *   loading        (starting / queued / running) a TOP-LEVEL loading screen with an
 *                  INDETERMINATE progress bar. The API reports a status and server
 *                  timestamps, never a percentage, so the bar carries no value
 *                  (role=progressbar without aria-valuenow) and no number is shown:
 *                  no percentage, no ETA, no count of studies found. The words say
 *                  what is really happening (the job's own status, its real
 *                  timestamps, "no update from the worker" when its lease lapsed).
 *   result         the completed audit, and ONLY that. EXPERIMENTAL and UNGRADED: no
 *                  score, bar, arc or verdict, never run through the retained rubric.
 *   not-requested  a saved scan opened from History that has no job this page knows:
 *                  "Live research not requested" and a deliberate button. Opening a
 *                  scan never asks for research by itself.
 *   problem        failed / refused / unavailable / busy / not saved / not eligible /
 *                  signed out ... each one says what happened, what is NOT shown in
 *                  its place (no saved, cached or model-recalled evidence) and what
 *                  the person can do. Never blank, never a legacy "no evidence run".
 *
 * Source access is not papers. Counters come from the server's
 * SourceAccessSummaryV2: snippets and page summaries (written by Claude Haiku) are
 * "returned content"; errors (HTTP 403, redirects), walls and refusals are "no
 * content". Nothing is presented as a paper read or as a quotation.
 *
 * MODEL TEXT IS NEVER TRANSLATED. It is shown verbatim and, in Lithuanian, tagged
 * lang="en" under a note, so no number, unit, quotation or study ID can change on the
 * way to the screen. Every control is Lithuanian. NOTHING RAW: a failing server's
 * text, stack or secret never reaches the screen, only a short allow-listed code.
 */
import { useId, type ReactNode } from "react";

import { RESEARCH_COPY, type ResearchCopy, type ResearchLanguage } from "@/lib/i18n/copy/research";
import { formatUtc, missingFacts, type LiveResearchJob, type ResearchFacts, type ResearchResultV2 } from "@/lib/scan-research/client";
import type { LiveResearch, ResearchState } from "@/lib/scan-research/use-live-research";

function statusLine(c: ResearchCopy, state: ResearchState, job: LiveResearchJob | null, stalled: boolean): string {
  switch (state) {
    case "succeeded": return c.succeeded;
    case "running": return stalled && job ? c.stalled(formatUtc(job.updated_at) ?? "—") : c.running;
    case "queued": return c.queued;
    case "starting": return c.starting;
    case "idle": return c.idle;
    case "failed": return c.failed;
    case "disabled": return c.disabled;
    case "unavailable": return c.unavailable;
    case "no-id": return c.noId;
    case "auth": return c.auth;
    case "busy": return c.busy;
    case "not-researchable": return c.notResearchable;
    case "not-found": return c.notFound;
    default: return c.error;
  }
}

export function ScanResearchScreen({ research, lang, head, context, onRescan }: {
  research: LiveResearch;
  lang: ResearchLanguage;
  /** The scanned product's identity (a thumbnail), drawn at the head of the loading screen. */
  head?: ReactNode;
  /** What was read from the label, drawn inside the loading screen so it is not lost while waiting. */
  context?: ReactNode;
  /** Scan the same photo again: offered only where the scan itself was not saved. */
  onRescan?: () => void;
}) {
  const c = RESEARCH_COPY[lang];
  const headingId = useId();
  const { state, phase, job, result, stalled, canAsk, press, statusRef } = research;
  const text = statusLine(c, state, job, stalled);
  const open = job !== null && (job.status === "queued" || job.status === "running");

  const tags = <p className="sc-research-tags"><span className="sc-research-tag">{c.tagExperimental}</span><span className="sc-research-tag">{c.tagUngraded}</span></p>;
  const status = <p ref={statusRef} className="sc-research-status" role="status" tabIndex={-1}>{text}</p>;

  if (phase === "loading") {
    return <section className="sc-research sc-research-loading" aria-labelledby={headingId} aria-busy="true" data-research-state={state} data-research-phase="loading">
      <div className="sc-progress-head sc-research-head">
        {head}
        <div>
          <h2 id={headingId}>{c.loadingTitle}</h2>
          {tags}
        </div>
      </div>
      <p className="sc-research-dim">{c.loadingLead}</p>
      <IndeterminateBar c={c} />
      {status}
      {job ? <Progress c={c} job={job} /> : null}
      <p className="sc-research-dim">{c.noEstimate}</p>
      {open ? <p className="sc-research-dim">{c.leaveNote}</p> : null}
      {job?.facts ? <Facts c={c} facts={job.facts} /> : null}
      {context}
    </section>;
  }

  if (phase === "result" && result) {
    return <section className="sc-research" aria-labelledby={headingId} data-research-state={state} data-research-phase="result">
      <h2 id={headingId}>{c.title}</h2>
      {tags}
      {status}
      {job ? <Progress c={c} job={job} /> : null}
      {job?.facts ? <Facts c={c} facts={job.facts} /> : null}
      <Audit c={c} lang={lang} result={result} />
    </section>;
  }

  if (phase === "not-requested") {
    return <section className="sc-research" aria-labelledby={headingId} data-research-state={state} data-research-phase="not-requested">
      <h2 id={headingId}>{c.notRequestedTitle}</h2>
      {tags}
      {status}
      <p className="sc-research-dim">{c.noFallback}</p>
      {canAsk ? <>
        <p className="sc-research-dim" id={`${headingId}-hint`}>{c.loadHint}</p>
        <button type="button" className="sc-research-btn" aria-describedby={`${headingId}-hint`} onClick={press}>{c.load}</button>
      </> : null}
    </section>;
  }

  // problem: every state that has no completed audit and is not waiting.
  const retryable = canAsk && (state === "error" || state === "unavailable" || state === "busy");
  const requestable = canAsk && state === "not-found";
  return <section className="sc-research" aria-labelledby={headingId} data-research-state={state} data-research-phase="problem">
    <h2 id={headingId}>{c.problemTitle}</h2>
    {tags}
    {status}
    {state === "failed" && job ? <p className="sc-research-failure">{c.failureCode}: {job.failure_code ?? c.failureUnknown}</p> : null}
    <p className="sc-research-dim">{c.noFallback}</p>
    {retryable ? <button type="button" className="sc-research-btn" onClick={press}>{c.retry}</button> : null}
    {requestable ? <button type="button" className="sc-research-btn" onClick={press}>{c.load}</button> : null}
    {state === "no-id" && onRescan ? <button type="button" className="sc-research-btn" onClick={onRescan}>{c.retryPhoto}</button> : null}
    {job ? <Progress c={c} job={job} /> : null}
    {job?.facts ? <Facts c={c} facts={job.facts} /> : null}
    {context}
  </section>;
}

/**
 * An INDETERMINATE progress bar. `role="progressbar"` with no `aria-valuenow` is the
 * ARIA indeterminate bar, which is the only honest one here: the research API has no
 * percentage to bind to. If it ever exposes a reliable one, add a determinate branch
 * next to this one; until then nothing may fill, count or estimate.
 */
function IndeterminateBar({ c }: { c: ResearchCopy }) {
  return <div className="sc-progress-bar sc-research-bar" role="progressbar" aria-label={c.progressLabel} data-indeterminate="true"><span /></div>;
}

/** The job's real stages, from its real status. No percentage, no estimate. */
function Progress({ c, job }: { c: ResearchCopy; job: LiveResearchJob }) {
  const index = job.status === "queued" ? 0 : job.status === "running" ? 1 : 2;
  const last = job.status === "succeeded" ? c.stages.completed : job.status === "failed" ? c.stages.failed : c.stages.finished;
  const labels = [c.stages.queued, c.stages.running, last];
  const created = formatUtc(job.created_at);
  const updated = formatUtc(job.updated_at);
  const completed = formatUtc(job.completed_at);
  return <>
    <ol className="sc-research-steps" aria-label={c.stepsLabel}>
      {labels.map((label, i) => <li key={i} aria-current={i === index ? "step" : undefined} data-done={i < index ? "true" : "false"} data-failed={i === 2 && job.status === "failed" ? "true" : "false"}>{label}</li>)}
    </ol>
    <p className="sc-research-dim sc-research-times">
      {[created ? c.queuedAt(created) : null, job.status === "running" && updated ? c.lastSignal(updated) : null, (job.status === "succeeded" || job.status === "failed") && completed ? c.finishedAt(completed) : null].filter(Boolean).join(" · ")}
    </p>
  </>;
}

/** What the research was given, and what it was NOT: a missing fact is listed as missing, never filled in. */
function Facts({ c, facts }: { c: ResearchCopy; facts: ResearchFacts }) {
  const rows: Array<[string, string]> = [];
  if (facts.basis) rows.push([c.factLabels.basis, c.factBasis[facts.basis]]);
  if (facts.product) rows.push([c.factLabels.product, facts.product]);
  if (facts.ingredient) rows.push([c.factLabels.ingredient, facts.ingredient]);
  if (facts.form) rows.push([c.factLabels.form, facts.form]);
  if (facts.compoundPerServingMg !== null) rows.push([c.factLabels.compoundPerServing, `${facts.compoundPerServingMg} mg`]);
  if (facts.printedElementalPerServingMg !== null) rows.push([c.factLabels.printedElementalPerServing, `${facts.printedElementalPerServingMg} mg`]);
  if (facts.unitAsPrinted) rows.push([c.factLabels.unit, facts.unitAsPrinted]);
  if (facts.servingsPerDay !== null) rows.push([c.factLabels.servingsPerDay, String(facts.servingsPerDay)]);
  if (facts.multiIngredient !== null) rows.push([c.factLabels.multiIngredient, facts.multiIngredient ? c.yes : c.no]);
  const missing = missingFacts(facts);
  return <div className="sc-research-facts" data-testid="research-facts">
    {missing.length ? <>
      <p className="sc-research-missing" data-testid="research-missing">{c.missingLead} {missing.map((m) => c.missing[m]).join("; ")}.</p>
      <p className="sc-research-dim">{c.missingHow}</p>
    </> : null}
    {facts.multiIngredient === true ? <p className="sc-research-missing" data-testid="research-blend">{c.blendNote}</p> : null}
    {rows.length ? <details className="sc-research-details">
      <summary>{c.factsTitle}</summary>
      <p className="sc-research-dim">{c.factsRecorded}</p>
      <dl className="sc-research-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details> : null}
  </div>;
}

const COUNTED = ["requests", "search_snippets", "fetch_summaries", "original_documents"] as const;
const UNCOUNTED = ["errors", "walls", "refusals"] as const;

function Audit({ c, lang, result }: { c: ResearchCopy; lang: ResearchLanguage; result: ResearchResultV2 }) {
  const { audit, provenance, source_access: access } = result;
  // Model-written text is rendered verbatim -- never through a translator -- and tagged English in the LT view.
  const en = lang === "lt" ? "en" : undefined;
  const status = c.evidenceStatusValues[provenance.evidence_status] ?? provenance.evidence_status;
  const limit = (text: string) => c.knownLimitations[text] ?? text;
  return <div className="sc-research-audit" data-testid="research-audit">
    <p className="sc-research-note">{c.ungradedNote}</p>
    <p lang={en}>{audit.product} · {audit.ingredient} · {audit.form} · {audit.daily_dose}</p>
    {audit.dose_note ? <p lang={en}>{audit.dose_note}</p> : null}
    <p>{c.model}: {audit.model} · {c.prompt}: {audit.prompt}</p>
    <p>{c.provenance}: {c.evidenceStatus}: {status} · {c.runner}: {provenance.runner} · {c.affectsScore}: {provenance.affects_score ? c.yes : c.no}</p>
    <p>{c.notAffectScore}</p>

    <h3>{c.access}</h3>
    <p className="sc-research-group">{c.accessContent}</p>
    <ul className="sc-research-counts">{COUNTED.map((k) => <li key={k}>{c.summaryLabels[k]}: {access.summary[k]}</li>)}</ul>
    <p className="sc-research-dim">{c.haikuNote}</p>
    <p className="sc-research-group">{c.accessNone}</p>
    <ul className="sc-research-counts">{UNCOUNTED.map((k) => <li key={k}>{c.summaryLabels[k]}: {access.summary[k]}</li>)}</ul>
    <p className="sc-research-dim">{c.notAccessedNote}</p>
    <p>{c.inventory}: {access.inventory.map((item) => item.id).join(" · ") || c.none} — {c.inventoryItem}</p>
    <p className="sc-research-dim">{c.inventoryNote}</p>
    {access.limitations.length ? <p>{c.sourceLimitations}: {access.limitations.map(limit).join("; ")}</p> : null}
    {audit.could_not_access.length ? <p lang={en}><span lang={lang}>{c.couldNotAccess}: </span>{audit.could_not_access.join("; ")}</p> : null}

    {lang === "lt" ? <p className="sc-research-note" role="note">{c.narrativeNote}</p> : null}
    <p className="sc-research-dim">{c.ownWordsNote}</p>
    {audit.outcomes.map((o, i) => <article key={`${o.name}-${i}`} className="sc-research-outcome">
      <h3 lang={en}>{o.name}</h3>
      {o.population ? <p lang={en}><span lang={lang}>{c.population}: </span>{o.population}</p> : null}
      <p lang={en}><span lang={lang}>{c.statement}: </span>{o.sentence}</p>
      <p lang={en}><span lang={lang}>{c.basis}: </span>{o.strongest_study}</p>
      <p lang={en}><span lang={lang}>{c.doubt}: </span>{o.strongest_doubt}</p>
      {o.study_that_would_move_this ? <p lang={en}><span lang={lang}>{c.wouldMove}: </span>{o.study_that_would_move_this}</p> : null}
      {o.effective_daily_range ? <p lang={en}><span lang={lang}>{c.dailyRange}: </span>{o.effective_daily_range}</p> : null}
      <p>{c.outcomeIds}: {o.inventory.map((item) => item.id).join(" · ") || c.none}</p>
    </article>)}
  </div>;
}
