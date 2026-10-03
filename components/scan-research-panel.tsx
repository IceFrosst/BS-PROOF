"use client";

import { useCallback, useEffect, useState } from "react";
import { ledgerFromAudit, score as scoreLedger, type AuditOutcome } from "@/lib/evidence-ledger";
import { ledgerWord } from "@/lib/i18n/copy/result";
import { RESEARCH_COPY, type ResearchLanguage } from "@/lib/i18n/copy/research";
import { RESEARCH_POLL_MS, researchWithCurrentToken, waitForResearch, type LiveResearchJob, type ResearchResultV2 } from "@/lib/scan-research/client";

type TokenOptions = { userId?: string; forceRefresh?: boolean };
type Audit = { meta: { model: string; prompt: string }; product: string; ingredient: string; form: string; daily_dose: string; outcomes: AuditOutcome[]; could_not_access: string[] };
const object = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
function validAudit(x: unknown): x is Audit {
  if (!object(x) || !object(x.meta) || typeof x.meta.model !== "string" || typeof x.meta.prompt !== "string" || typeof x.product !== "string" || typeof x.ingredient !== "string" || typeof x.form !== "string" || typeof x.daily_dose !== "string" || !Array.isArray(x.outcomes) || !Array.isArray(x.could_not_access) || !x.could_not_access.every((v) => typeof v === "string")) return false;
  return x.outcomes.every((raw) => {
    if (!object(raw) || typeof raw.name !== "string" || typeof raw.sentence !== "string" || typeof raw.strongest_study !== "string" || typeof raw.strongest_doubt !== "string" || !object(raw.ledger)) return false;
    const l = raw.ledger;
    if (typeof l.effectPoints !== "string" || typeof l.bodyIsRct !== "boolean" || !object(l.checklist) || !object(l.gates) || typeof l.formFit !== "string" || typeof l.doseFit !== "string" || typeof l.effective_daily_range !== "string" || !Array.isArray(raw.inventory)) return false;
    const checklist = l.checklist, gates = l.gates;
    return ["risk_of_bias", "consistency", "precision", "directness", "publication_bias"].every((k) => ["supported", "concern", "unknown"].includes(String(checklist[k])))
      && ["rctCount", "largestRctN", "longestRctWeeks"].every((k) => typeof gates[k] === "number" && Number.isFinite(gates[k]))
      && ["chronicOutcome", "surrogate", "allPositiveIndustryOrOneLab"].every((k) => typeof gates[k] === "boolean")
      && raw.inventory.every((item) => object(item) && typeof item.id === "string" && item.access === "snippet");
  });
}
const SUMMARY_KEYS = ["requests", "errors", "walls", "refusals", "search_snippets", "fetch_summaries", "original_documents"] as const;
function validResult(x: unknown): x is ResearchResultV2 {
  if (!object(x) || !validAudit(x.audit) || !object(x.provenance) || !object(x.source_access)) return false;
  const p = x.provenance, a = x.source_access;
  if (typeof p.evidence_status !== "string" || typeof p.affects_score !== "boolean" || typeof p.clinically_approved !== "boolean" || typeof p.human_verified !== "boolean" || typeof p.runner !== "string" || typeof p.billing !== "string" || typeof p.model !== "string" || typeof p.prompt_version !== "string" || typeof p.cli_version !== "string" || typeof p.adapter_version !== "string" || typeof p.classifier_version !== "string" || p.source_access_version !== "SourceAccessV2") return false;
  if (a.version !== "SourceAccessSummaryV2" || !object(a.summary) || !Array.isArray(a.inventory) || !Array.isArray(a.limitations)) return false;
  const s = a.summary;
  return SUMMARY_KEYS.every((key) => typeof s[key] === "number" && Number.isInteger(s[key]) && s[key] >= 0) && s.original_documents === 0
    && a.inventory.every((item) => object(item) && typeof item.id === "string" && item.evidence_class === "derived_snippet") && a.limitations.every((v) => typeof v === "string");
}

export function ScanResearchPanel({ scanId, ownerId, lang, getAccessToken, enabled = true }: { scanId: string | null; ownerId: string | null; lang: ResearchLanguage; getAccessToken: (options?: TokenOptions) => Promise<string | null>; enabled?: boolean }) {
  const c = RESEARCH_COPY[lang];
  const [job, setJob] = useState<LiveResearchJob | null>(null);
  const [state, setState] = useState<"starting" | "queued" | "running" | "succeeded" | "failed" | "disabled" | "unavailable" | "error" | "no-id" | "auth" | "busy" | "not-researchable">("starting");
  const [attempt, setAttempt] = useState(0);
  const run = useCallback(async (signal: AbortSignal) => {
    void attempt;
    setJob(null);
    if (!enabled) { setState("disabled"); return; }
    if (!ownerId) { setState("auth"); return; }
    if (!scanId) { setState("no-id"); return; }
    try {
      const started = await researchWithCurrentToken("/api/scan/research", getAccessToken, signal, ownerId, { scan_id: scanId });
      if (signal.aborted) return;
      if (started.response.status === 401 || started.json.status === "unauthorized") { setState("auth"); return; }
      if (started.json.status === "research_disabled") { setState("disabled"); return; }
      if (started.json.status === "research_unavailable" || started.json.status === "auth_unavailable") { setState("unavailable"); return; }
      if (started.response.status === 429 || started.json.status === "research_busy") { setState("busy"); return; }
      if (started.response.status === 422 || started.json.status === "scan_not_researchable") { setState("not-researchable"); return; }
      if (!started.response.ok || !started.json.job) { setState("error"); return; }
      let current = started.json.job;
      setJob(current); setState(current.status);
      while (current.status === "queued" || current.status === "running") {
        await waitForResearch(RESEARCH_POLL_MS, signal);
        const polled = await researchWithCurrentToken(`/api/scan/research/${encodeURIComponent(current.id)}`, getAccessToken, signal, ownerId);
        if (signal.aborted) return;
        if (!polled.response.ok || !polled.json.job) {
          if (polled.response.status === 401 || polled.json.status === "unauthorized") setState("auth");
          else if (polled.response.status === 429 || polled.json.status === "research_busy") setState("busy");
          else if (polled.response.status === 422 || polled.json.status === "scan_not_researchable") setState("not-researchable");
          else setState(polled.json.status === "research_unavailable" ? "unavailable" : "error");
          return;
        }
        current = polled.json.job; setJob(current); setState(current.status);
      }
    } catch (error) {
      if (!signal.aborted) setState(error instanceof Error && error.message === "auth" ? "auth" : "error");
    }
  }, [enabled, ownerId, scanId, getAccessToken, attempt]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void run(controller.signal); }); return () => controller.abort(); }, [run]);
  const result = job?.status === "succeeded" && validResult(job.result) ? job.result : null;
  const text = state === "queued" ? c.queued : state === "running" || state === "starting" ? c.running : state === "succeeded" ? (result ? c.succeeded : c.error) : state === "failed" ? c.failed : state === "disabled" ? c.disabled : state === "unavailable" ? c.unavailable : state === "no-id" ? c.noId : state === "auth" ? c.auth : state === "busy" ? c.busy : state === "not-researchable" ? c.notResearchable : state === "error" ? c.error : c.startFailed;
  const audit = result ? result.audit as Audit : null;
  const showRetry = (state === "error" || state === "unavailable" || state === "busy") && scanId && ownerId;
  return <section className="sc-research" aria-label={c.title} data-research-state={state}>
    <h2>{c.title}</h2><p role="status">{text}</p>
    {state === "failed" && job?.failure_code ? <p>{c.failureCode}: {/^[a-z0-9_]{1,80}$/i.test(job.failure_code) ? job.failure_code : "unavailable"}</p> : null}
    {showRetry ? <button type="button" onClick={() => { setState("starting"); setAttempt((n) => n + 1); }}>{c.retry}</button> : null}
    {result && audit ? <div className="sc-research-audit" data-testid="research-audit">
      <p>{audit.product} · {audit.ingredient} · {audit.form} · {audit.daily_dose}</p>
      <p>{c.model}: {audit.meta.model} · {c.prompt}: {audit.meta.prompt}</p>
      <p>{c.provenance}: {c.evidenceStatus}: {result.provenance.evidence_status} · {c.runner}: {result.provenance.runner} · {c.affectsScore}: {result.provenance.affects_score ? c.yes : c.no}</p>
      {result.provenance.affects_score === false ? <p>{c.succeeded} — {c.notAffectScore}</p> : null}
      <p>{c.access}: {SUMMARY_KEYS.map((key) => `${c.summaryLabels[key]}: ${result.source_access.summary[key]}`).join(" · ")}</p>
      <p>{c.inventory}: {result.source_access.inventory.map((item) => `${item.id}: ${item.evidence_class}`).join(" · ") || "—"}</p>
      {result.source_access.limitations.length ? <p>{c.sourceLimitations}: {result.source_access.limitations.join("; ")}</p> : null}
      {audit.could_not_access.length ? <p>{c.couldNotAccess}: {audit.could_not_access.join("; ")}</p> : null}
      {lang === "lt" ? <p role="note">{c.modelTextNote}</p> : null}
      {audit.outcomes.map((outcome, i) => {
        try {
          const scored = scoreLedger(ledgerFromAudit(outcome));
          return <article key={`${outcome.name}-${i}`}><h3>{outcome.name}</h3>{outcome.population ? <p>{outcome.population}</p> : null}<p>{outcome.sentence}</p><p>{c.outcome}: {ledgerWord(lang, scored.effectWord)} · {ledgerWord(lang, scored.certaintyWord)} · {scored.headline ?? c.notScored}/100 ({ledgerWord(lang, scored.label)})</p><p>{c.basis}: {outcome.strongest_study}</p><p>{outcome.strongest_doubt}</p><p>{outcome.ledger.effective_daily_range}</p>{outcome.inventory.map((item, j) => <p key={`${item.id}-${j}`}>{c.inventory}: {item.id} · {item.access}</p>)}</article>;
        } catch { return <article key={`${outcome.name}-${i}`}><h3>{outcome.name}</h3><p>{c.error}</p></article>; }
      })}
    </div> : null}
  </section>;
}
