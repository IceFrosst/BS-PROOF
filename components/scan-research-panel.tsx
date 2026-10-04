"use client";

/*
 * Owner-private LIVE RESEARCH panel under a saved scan result.
 *
 * Contract: lib/scan-research/contract.ts (POST /api/scan/research, GET
 * /api/scan/research/[id]); client rules: lib/scan-research/client.ts; copy:
 * lib/i18n/copy/research.ts. What this panel promises, and how:
 *
 *  - ONLY A SAVED, OWNED RUN. Research is asked for with a stored run id (a UUID)
 *    and the signed-in owner's Google bearer token, nothing else. No id, no
 *    sign-in, or a deployment without sign-in: no request at all.
 *  - A REPLAY ASKS NOTHING BY ITSELF. A saved scan opened from History is shown
 *    "as it was, nothing re-run". It looks the research up (GET) only when this
 *    page already knows the job, and otherwise waits for the person to press the
 *    button. Nothing here ever re-requests research for a scan that has a job.
 *  - NO STALE OWNER. Everything shown is keyed to (owner, scan). A different
 *    owner, a sign-out or an unmount aborts the request in flight, and a late
 *    answer is dropped; the previous owner's job is never drawn, not even for a
 *    frame.
 *  - REAL STATE ONLY. queued / running / succeeded / failed are the job's own
 *    status; times are the server's timestamps; "no update from the worker" is
 *    derived from the last worker signal and the lease. There is no percentage,
 *    no estimate and no fabricated progress.
 *  - EXPERIMENTAL AND UNGRADED. A research audit is drawn WITHOUT a score, bar,
 *    arc or verdict: it is not run through the retained rubric and does not touch
 *    the saved audits. It never averages anything or speaks for a blend.
 *  - SOURCE ACCESS IS NOT PAPERS. Counters come from the server's
 *    SourceAccessSummaryV2: snippets and page summaries (written by Claude Haiku)
 *    are "returned content"; errors (HTTP 403, redirects), walls and refusals are
 *    "no content". Nothing is presented as a paper read or as a quotation.
 *  - MODEL TEXT IS NEVER TRANSLATED. It is shown verbatim and, in Lithuanian,
 *    tagged lang="en" under a note. Every control is Lithuanian.
 *  - NOTHING RAW. A failing server's text, stack or secret never reaches the
 *    screen: only a short allow-listed failure code does.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { RESEARCH_COPY, type ResearchCopy, type ResearchLanguage } from "@/lib/i18n/copy/research";
import {
  forgetResearchJob,
  formatUtc,
  isResearchId,
  isStalled,
  knownResearchJob,
  missingFacts,
  noteResearchOwner,
  parseResearchJob,
  parseResearchResult,
  rememberResearchJob,
  researchWithCurrentToken,
  waitForResearch,
  RESEARCH_POLL_MS,
  type LiveResearchJob,
  type ResearchFacts,
  type ResearchReply,
  type ResearchResultV2,
} from "@/lib/scan-research/client";

type TokenOptions = { userId?: string; forceRefresh?: boolean };
type PanelState = "idle" | "starting" | "queued" | "running" | "succeeded" | "failed" | "disabled" | "unavailable" | "error" | "no-id" | "auth" | "busy" | "not-researchable" | "not-found";
type View = { key: string; state: PanelState; job: LiveResearchJob | null; stalled: boolean };

/** The state a (owner, scan) starts in, before any request. "starting" is the only state that sends one. */
function startState(enabled: boolean, ownerId: string | null, scanId: string | null, mayStart: boolean): PanelState {
  if (!enabled) return "disabled";
  if (!ownerId) return "auth";
  if (!scanId || !isResearchId(scanId)) return "no-id";
  return mayStart ? "starting" : "idle";
}

/** One API answer -> the panel state that must replace the job, or null when it carries a usable job. */
function failureOf({ response, json }: { response: Response; json: ResearchReply }): PanelState | null {
  if (response.status === 401 || json.status === "unauthorized") return "auth";
  if (response.status === 404 || json.status === "not_found") return "not-found";
  if (json.status === "research_disabled") return "disabled";
  if (json.status === "research_unavailable" || json.status === "auth_unavailable") return "unavailable";
  if (response.status === 429 || json.status === "research_busy") return "busy";
  if (response.status === 422 || json.status === "scan_not_researchable") return "not-researchable";
  if (!response.ok || json.status !== "ok" || !json.job) return "error";
  return null;
}

/** The states that still draw the job (its stages and facts); every other state discards it. */
const SHOWS_JOB: ReadonlySet<PanelState> = new Set(["queued", "running", "succeeded", "failed", "error", "unavailable", "busy"]);

export function ScanResearchPanel({ scanId, ownerId, lang, getAccessToken, enabled = true, replay = false, clock = Date.now }: {
  scanId: string | null;
  ownerId: string | null;
  lang: ResearchLanguage;
  getAccessToken: (options?: TokenOptions) => Promise<string | null>;
  enabled?: boolean;
  /** A saved scan opened from History: never asks for research on its own. */
  replay?: boolean;
  /** Milliseconds since the epoch. Injected so no test (and no render) depends on the wall clock. */
  clock?: () => number;
}) {
  const c = RESEARCH_COPY[lang];
  const headingId = useId();
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const key = [enabled ? "on" : "off", ownerId ?? "", scanId ?? "", replay ? "replay" : "fresh"].join("|");

  // Explicit presses (look up / check again), counted PER (owner, scan) so a press never leaks across them.
  const [action, setAction] = useState({ key, n: 0 });
  const presses = action.key === key ? action.n : 0;
  const mayStart = !replay || presses > 0 || (ownerId !== null && scanId !== null && knownResearchJob(ownerId, scanId) !== null);
  const base = startState(enabled, ownerId, scanId, mayStart);

  const [view, setView] = useState<View>({ key, state: base, job: null, stalled: false });
  // Only the CURRENT (owner, scan)'s view is ever drawn: a view stamped with another key is simply not this panel's.
  const live: View = view.key === key ? view : { key, state: base, job: null, stalled: false };

  // The latest callbacks, so a parent that re-creates them cannot restart (re-request) a running flow.
  const latest = useRef({ getAccessToken, clock });
  useEffect(() => { latest.current = { getAccessToken, clock }; });

  useEffect(() => {
    noteResearchOwner(ownerId);
    if (!ownerId || !scanId || startState(enabled, ownerId, scanId, mayStart) !== "starting") return;
    const controller = new AbortController();
    const { signal } = controller;
    const owner = ownerId;
    const scan = scanId;
    const publish = (state: PanelState, job: LiveResearchJob | null = null) => {
      if (signal.aborted) return;
      const shown = job && SHOWS_JOB.has(state) ? job : null;
      setView({ key, state, job: shown, stalled: shown ? isStalled(shown, latest.current.clock()) : false });
    };
    const send = (path: string, body?: unknown) => researchWithCurrentToken(path, latest.current.getAccessToken, signal, owner, body);
    const run = async () => {
      let job: LiveResearchJob | null = null;
      try {
        const knownId = knownResearchJob(owner, scan);
        // A job this page already knows is LOOKED UP; research is requested (POST) only when there is none.
        const first = knownId ? await send(`/api/scan/research/${encodeURIComponent(knownId)}`) : await send("/api/scan/research", { scan_id: scan });
        if (signal.aborted) return;
        const failed = failureOf(first);
        if (failed) {
          if (failed === "not-found") forgetResearchJob(owner, scan);
          publish(failed);
          return;
        }
        job = parseResearchJob(first.json.job);
        if (!job || job.scan_id !== scan || (knownId !== null && job.id !== knownId)) { publish("error"); return; }
        rememberResearchJob(owner, scan, job.id);
        publish(job.status, job);
        while (job.status === "queued" || job.status === "running") {
          await waitForResearch(RESEARCH_POLL_MS, signal);
          const polled = await send(`/api/scan/research/${encodeURIComponent(job.id)}`);
          if (signal.aborted) return;
          const bad = failureOf(polled);
          if (bad) {
            if (bad === "not-found") forgetResearchJob(owner, scan);
            publish(bad, job);
            return;
          }
          const next = parseResearchJob(polled.json.job);
          // A poll must answer for the same job of the same scan; anything else is dropped, not drawn.
          if (!next || next.id !== job.id || next.scan_id !== scan) { publish("error", job); return; }
          job = next;
          publish(job.status, job);
        }
      } catch (error) {
        if (!signal.aborted) publish(error instanceof Error && error.message === "auth" ? "auth" : "error", job);
      }
    };
    queueMicrotask(() => { if (!signal.aborted) void run(); });
    return () => controller.abort();
  }, [key, enabled, ownerId, scanId, mayStart, presses]);

  const press = () => {
    statusRef.current?.focus(); // the pressed button is about to disappear: keep focus on the status line
    setView({ ...live, state: "starting" });
    setAction({ key, n: presses + 1 });
  };

  // Retrying never asks again for research the server already holds: a known job id is looked up (GET).
  const { job, stalled, state } = live;
  const result = useMemo(() => (job?.status === "succeeded" ? parseResearchResult(job.result) : null), [job]);
  const when = (iso: string | null) => formatUtc(iso);
  const statusText =
    state === "succeeded" ? (result ? c.succeeded : c.error)
    : state === "running" && stalled && job ? c.stalled(when(job.updated_at) ?? "—")
    : state === "queued" ? c.queued
    : state === "running" ? c.running
    : state === "starting" ? c.starting
    : state === "idle" ? c.idle
    : state === "failed" ? c.failed
    : state === "disabled" ? c.disabled
    : state === "unavailable" ? c.unavailable
    : state === "no-id" ? c.noId
    : state === "auth" ? c.auth
    : state === "busy" ? c.busy
    : state === "not-researchable" ? c.notResearchable
    : state === "not-found" ? c.notFound
    : c.error;
  const canAsk = Boolean(enabled && ownerId && scanId && isResearchId(scanId));
  const showRetry = canAsk && (state === "error" || state === "unavailable" || state === "busy");
  const showLoad = canAsk && state === "idle";
  const open = job && (job.status === "queued" || job.status === "running");

  return <section className="sc-research" aria-labelledby={headingId} data-research-state={state}>
    <h2 id={headingId}>{c.title}</h2>
    <p className="sc-research-tags"><span className="sc-research-tag">{c.tagExperimental}</span><span className="sc-research-tag">{c.tagUngraded}</span></p>
    <p ref={statusRef} className="sc-research-status" role="status" tabIndex={-1}>{statusText}</p>
    {showLoad ? <p className="sc-research-dim" id={`${headingId}-hint`}>{c.loadHint}</p> : null}
    {showLoad ? <button type="button" className="sc-research-btn" aria-describedby={`${headingId}-hint`} onClick={press}>{c.load}</button> : null}
    {showRetry ? <button type="button" className="sc-research-btn" onClick={press}>{c.retry}</button> : null}
    {job ? <Progress c={c} job={job} /> : null}
    {open ? <p className="sc-research-dim">{c.noEstimate}</p> : null}
    {state === "failed" && job ? <p className="sc-research-failure">{c.failureCode}: {job.failure_code ?? c.failureUnknown}</p> : null}
    {job?.facts ? <Facts c={c} facts={job.facts} /> : null}
    {result && state === "succeeded" ? <Audit c={c} lang={lang} result={result} /> : null}
  </section>;
}

/** The job's real stages, from its real status. No bar, no percentage. */
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
