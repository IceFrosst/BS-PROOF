"use client";

/* The Evidence Ledger result card on /scan: outcome tabs, the General score
 * tile, and four dimension rows per outcome. Deliberately the same markup as
 * the lab card (components/evidence-ledger/ledger-lab-card.tsx); the scan only
 * supplies real audit values. Matched products show the retained audit;
 * unmatched products show the same shell as "Not assessed" -- the continuous
 * v14 result is never converted into quarters (docs/SYSTEM_DESIGN.md §10, §13). */

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { auditPlainEntry, auditPlainText } from "@/lib/evidence-ledger/plain";
import { ledgerFromAudit, score as ledgerScore, type AuditOutcome, type RetainedLedgerAudit } from "@/lib/evidence-ledger";

import { auditSourceHref, populationLine, scoreSignalColor, tabId, words, type NullableNumber } from "./format";
import { DetailLine } from "./primitives";

export type Validity = { status: string | null; public_claims_allowed: boolean; note: string | null };

export type EvidenceRow = {
  outcome: string;
  outcome_label: string | null;
  polarity?: string | null;
  composite: NullableNumber;
  verdict: string | null;
  n_primaries: NullableNumber;
  applicability?: NullableNumber;
  arcs: Record<"effect" | "form" | "dose" | "evidence", { verdict: NullableNumber; coverage: NullableNumber; strength?: NullableNumber; closeness?: NullableNumber; basis?: string | null; product_match?: string | null }>;
};

export type AuditConcernNotice = { key: string; title: string; body: string };

/* Retained-audit concerns share the same collapsed warning bundle as product
 * caveats and live literature disclosures. They are disclosures only: neither
 * funding nor publication bias changes score(), and the detailed audit wording
 * plus opened sources remain reachable from each outcome expansion. */
export function auditConcernNotices(audit: RetainedLedgerAudit | null): AuditConcernNotice[] {
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

function LabDimension({ id, label, value, word, fill, open, onToggle, children }: { id: string; label: string; value: string; word: string; fill: number | null; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <li className={open ? "open" : ""} data-row-id={id}>
    <button type="button" aria-expanded={open} aria-controls={`ab-scan-${id}`} onClick={onToggle}>
      <span className="ab-bar-name">{label}</span><span className="ab-bar-word">{word}</span><span className="ab-bar-pts">{value}</span>
      <span className="ab-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <span className={`ab-bar-track ${fill === null ? "hatch" : "fill"}`}>{fill !== null ? <i style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%`, background: "var(--ab-accent)" }} /> : null}</span>
    </button>
    {open ? <div id={`ab-scan-${id}`} className="ab-bar-detail">{children}</div> : null}
  </li>;
}

export function LabValidity({ audit, validity }: { audit: RetainedLedgerAudit | null; validity?: Validity }) {
  if (!audit && !validity) return null;
  return <p className="ab-stamp scan-lab-validity"><b>{audit ? "Retained audit · not reverified" : validity?.public_claims_allowed ? "Validated run" : `Not a public product claim · ${validity?.status ?? "unvalidated"}`}</b>{" "}{audit ? `${audit.provenance.prompt_version} · ${audit.provenance.target_product} · ${audit.provenance.target_dose}` : validity?.note ?? "Retained for inspection; scoring constants are not calibrated for public claims."}</p>;
}

export function LabWarnings({ count, children }: { count: number; children: ReactNode }) {
  if (!count) return null;
  return <details className="ab-warnings"><summary><span>{count} evidence warning{count === 1 ? "" : "s"}</span></summary><div className="ab-warning-list">{children}</div></details>;
}

export function LabTabs({ audit, unmatchedRows, population, emptyState, validity, warnings, warningCount }: { audit: RetainedLedgerAudit | null; unmatchedRows?: EvidenceRow[]; population?: Record<string, string | null> | null; emptyState?: { title: string; description: string; census?: { rcts_indexed?: number; syntheses_indexed?: number } | null }; validity?: Validity; warnings: ReactNode; warningCount: number }) {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const matched = Boolean(audit);
  const outcomes = matched ? audit!.audit.outcomes.map((o) => ({ key: `${o.name}||${o.population ?? ""}`, name: o.name, population: o.population })) : (unmatchedRows ?? []).map((r) => ({ key: `unmatched:${r.outcome}||${r.outcome_label ?? words(r.outcome)}`, name: r.outcome_label ?? words(r.outcome), population: undefined }));
  const keys = ["__general", ...outcomes.map((o) => o.key)];
  const current = active ? outcomes.find((o) => o.key === active) ?? null : null;
  const select = (key: string) => { setActive(key === "__general" ? null : key); setOpen(null); };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    select(keys[next]); refs.current[next]?.focus();
  };
  const tabIdFor = (key: string) => `ab-scan-tab-${tabId(`${matched ? "matched" : "unmatched"}:${key}`)}`;
  const scores = matched ? audit!.audit.outcomes.map((o) => ledgerScore(ledgerFromAudit(o))) : [];
  const numbers = scores.map((s) => s.headline).filter((n): n is number => n !== null);
  const general = numbers.length ? Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
  const generalSignal = scores.length ? scores.reduce((sum, s) => sum + s.certainty / 4, 0) / scores.length : 0;
  const renderMatched = (outcome: AuditOutcome) => {
    const result = ledgerScore(ledgerFromAudit(outcome));
    const key = `${outcome.name}||${outcome.population ?? ""}`;
    const detail = (dimension: "effect" | "evidence" | "form" | "dose") => <AuditDetailText audit={audit!} outcome={outcome} dimension={dimension} />;
    const fit = (v: string) => v === "unknown" ? "—" : `${v}/4`;
    const rows: Array<{ id: string; label: string; value: string; word: string; fill: number | null; body: ReactNode }> = [
      { id: "effect", label: "Effect", value: result.effect === "unclear" ? "—" : `${result.effect > 0 ? "+" : result.effect < 0 ? "−" : ""}${result.effect}/3`, word: result.effectWord, fill: result.effect === "unclear" ? null : (result.effect + 3) / 6, body: <><p>The audit effect state uses its real −3 to +3 scale; it is not a /4 grade.</p><DetailLine term="Plain summary">{auditPlainText(auditPlainEntry(audit!.plain, outcome), "summary", "sentence", outcome.sentence)}</DetailLine><DetailLine term="Estimate">{outcome.absolute_effect ?? "No usable interval or point estimate was retained."}</DetailLine><DetailLine term="Meaningful">{outcome.clinically_meaningful ?? "Unknown."}</DetailLine><DetailLine term="Strongest doubt">{outcome.strongest_doubt}</DetailLine>{detail("effect")}<AuditSourceList outcome={outcome} /></> },
      { id: "evidence", label: "Evidence", value: `${result.certainty}/4`, word: result.certaintyWord, fill: result.certainty / 4, body: <><p>Certainty comes from the retained body type, checklist and gates. Funding and publication bias remain disclosures.</p><DetailLine term="Gates">{result.firedGates.length ? result.firedGates.join("; ") : "No certainty gate fired."}</DetailLine><DetailLine term="Checklist">{Object.entries(outcome.ledger.checklist).map(([name, state]) => `${words(name)}: ${state}`).join("; ")}</DetailLine>{detail("evidence")}<AuditSourceList outcome={outcome} /></> },
      { id: "form", label: "Form", value: fit(outcome.ledger.formFit), word: result.formWord, fill: typeof outcome.ledger.formFit === "number" ? outcome.ledger.formFit / 4 : null, body: <><p>Form fit compares this product preparation with the retained audit.</p>{detail("form")}<AuditSourceList outcome={outcome} /></> },
      { id: "dose", label: "Dose", value: fit(outcome.ledger.doseFit), word: result.doseWord, fill: typeof outcome.ledger.doseFit === "number" ? outcome.ledger.doseFit / 4 : null, body: <><p>Dose fit compares the entered daily dose with the retained effective range.</p><DetailLine term="Effective daily range">{outcome.ledger.effective_daily_range}</DetailLine>{detail("dose")}<AuditSourceList outcome={outcome} /></> },
    ];
    return <>
      <div className="ab-headline" style={{ "--ab-score-color": scoreSignalColor(result.headline, result.certainty / 4) } as CSSProperties}>
        <div className="ab-number"><strong>{result.headline ?? "—"}</strong>{result.headline !== null ? <span>/100</span> : null}</div>
        <div><h2>{outcome.name}</h2><p className="ab-pop"><b>Population</b> {outcome.population ?? "not recorded by this run"}</p><p>{result.label}</p></div>
      </div>
      <LabWarnings count={warningCount}>{warnings}</LabWarnings>
      <ul className="ab-bars">{rows.map((row) => <LabDimension key={row.id} {...row} open={open === `${key}:${row.id}`} onToggle={() => setOpen(open === `${key}:${row.id}` ? null : `${key}:${row.id}`)}>{row.body}</LabDimension>)}</ul>
    </>;
  };
  const renderUnmatched = (outcome: { key: string; name: string }) => <><div className="ab-headline muted"><div className="ab-number"><strong>—</strong></div><div><h2>{outcome.name}</h2><p>Not assessed</p>{population && <p className="ab-pop"><b>Population</b> {populationLine(population)}</p>}</div></div><LabWarnings count={warningCount}>{warnings}</LabWarnings><ul className="ab-bars">{(["effect", "evidence", "form", "dose"] as const).map((id) => <LabDimension key={id} id={id} label={id === "evidence" ? "Evidence" : id.charAt(0).toUpperCase() + id.slice(1)} value="—" word="Not assessed" fill={null} open={open === `${outcome.key}:${id}`} onToggle={() => setOpen(open === `${outcome.key}:${id}` ? null : `${outcome.key}:${id}`)}><p>No source-verified /4 audit matches this exact form and daily dose.</p><DetailLine term="Status">Not assessed. The old continuous result was not converted into quarters.</DetailLine></LabDimension>)}</ul></>;
  const panel = current ? (matched ? renderMatched(audit!.audit.outcomes.find((o) => `${o.name}||${o.population ?? ""}` === current.key)!) : renderUnmatched(current)) : <><LabWarnings count={warningCount}>{warnings}</LabWarnings><div className="ab-listhead"><div className="ab-general" style={{ "--ab-score-color": scoreSignalColor(general, generalSignal) } as CSSProperties}><strong className="ab-general-score">{general ?? "—"}</strong><span className="ab-general-name">General score<small>{matched ? `Average of ${numbers.length} outcome score${numbers.length === 1 ? "" : "s"}` : "Not assessed"}</small></span></div><h2>Outcomes</h2>{!matched && <p className="ab-stamp">{outcomes.length ? "No source-verified /4 audit matches this exact form and daily dose. The old continuous result was not converted into quarters." : emptyState?.title ?? "No retained audit outcomes are available."}</p>}{!matched && !outcomes.length && <p className="ab-pop">{emptyState?.description ?? "This is not a low score — it is no data."}</p>}</div><ul className="ab-bars outcomes">{outcomes.map((o, index) => { const score = scores[index]; const value = score?.headline ?? null; return <li key={o.key}><button type="button" onClick={() => select(o.key)}><span className="ab-bar-name">{o.name}{o.population && <small>{o.population}</small>}</span><span className="ab-bar-pts" style={value === null ? undefined : { color: scoreSignalColor(value, score!.certainty / 4, "text") }}>{value ?? "—"}</span><span className="ab-chev go" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></span><span className={`ab-bar-track ${value === null ? "hatch" : "fill"}`}><i style={{ width: `${value ?? 0}%`, background: value === null ? undefined : scoreSignalColor(value, score!.certainty / 4) }} /></span></button></li>; })}</ul></>;
  return <><div className="ab-tabs" role="tablist" aria-label="Outcome"><button id={tabIdFor("__general")} ref={(n) => { refs.current[0] = n; }} role="tab" aria-selected={active === null} aria-controls="ab-scan-tabpanel" tabIndex={active === null ? 0 : -1} onKeyDown={(e) => onKey(e, 0)} onClick={() => select("__general")}>Outcomes</button>{outcomes.map((o, i) => <button key={o.key} id={tabIdFor(o.key)} ref={(n) => { refs.current[i + 1] = n; }} role="tab" aria-selected={active === o.key} aria-controls="ab-scan-tabpanel" tabIndex={active === o.key ? 0 : -1} onKeyDown={(e) => onKey(e, i + 1)} onClick={() => select(o.key)}>{o.name}</button>)}</div><section className="ab-card scan-lab-card" aria-label="Outcome results"><LabValidity audit={audit} validity={validity} /><div id="ab-scan-tabpanel" role="tabpanel" tabIndex={-1} aria-labelledby={tabIdFor(active ?? "__general")}>{panel}</div></section></>;
}
