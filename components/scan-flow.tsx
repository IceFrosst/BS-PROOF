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
 * 4. The validity stamp is not decoration: it is the first line inside the
 *    result card, above every number.
 * 5. TYPED IS NOT READ. A manual entry renders under "What you entered" with
 *    the `user_input` badge; it never shows a read confidence, quoted spans or a
 *    vision model, because none exist. The server says which path ran
 *    (`source`) and the UI keys off that, not off which button was pressed.
 * 6. Sign-in never gates the SCORE: the composite, arcs and dose bands are
 *    computed and held in state identically whether or not the result is
 *    currently visible.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

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

function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

function words(value: string): string {
  return value.replace(/_/g, " ");
}

function populationLine(pop: Record<string, string | null> | null | undefined): string | null {
  if (!pop) return null;
  const ages: Record<string, string> = { adult: "adults", older_adult: "older adults", adolescent: "adolescents", child: "children", infant: "infants" };
  const sexes: Record<string, string> = { mixed: "men and women", male: "men", female: "women" };
  const parts = [pop.health_status && pop.health_status !== "unknown" ? words(pop.health_status) : null, pop.age_band ? ages[pop.age_band] ?? words(pop.age_band) : null].filter(Boolean) as string[];
  if (pop.sex && pop.sex !== "unknown") parts.push(sexes[pop.sex] ?? words(pop.sex));
  if (pop.deficiency_status && pop.deficiency_status !== "unknown") parts.push(`${words(pop.deficiency_status)} at baseline`);
  if (pop.pregnancy && pop.pregnancy !== "unknown" && pop.pregnancy !== "not_pregnant") parts.push(words(pop.pregnancy));
  return parts.length ? parts.join(", ") : pop.id ? words(pop.id) : null;
}

/** One deterministic, shared ID format for every outcome tab and its panel label. */
function tabId(key: string): string {
  const safe = key.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `sc-tab-${safe || "outcome"}-${Math.abs(hash).toString(36)}`;
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
    <details className="scan-section scan-lab-disclosure" id={`scan-${id}`}>
      <summary className="scan-section-head" id={`scan-${id}-title`}>
        <h3>{title}</h3>
        <div className="scan-badges" aria-label="Sources used in this section">
          {basis.map((b) => <BasisBadge key={b} kind={b} legend={legend} />)}
        </div>
      </summary>
      <div className="scan-section-body">{children}</div>
    </details>
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
    <details className="ab-warning-row la-alert la-alert-warn" role={role} aria-label={ariaLabel}>
      <summary><strong>{title}</strong>{lede ? <span>{lede}</span> : null}</summary>
      <p>{body}</p>
    </details>
  );
}

/* A short lede for a notice: its first sentence, minus the "Model knowledge —
 * unverified." prefix every model disclosure carries (the badge says that). */
function firstSentence(body: string): string {
  const stripped = body.replace(/^Model knowledge — unverified\.\s*/, "");
  const m = stripped.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : stripped).trim();
}

/* A line of expanded detail, shared by retained and unmatched cards. */
function DetailLine({ term, children }: { term: string; children: React.ReactNode }) {
  return <p><b>{term}</b> {children}</p>;
}

type EvidenceRow = {
  outcome: string;
  outcome_label: string | null;
  polarity?: string | null;
  composite: NullableNumber;
  verdict: string | null;
  n_primaries: NullableNumber;
  applicability?: NullableNumber;
  arcs: Record<"effect" | "form" | "dose" | "evidence", { verdict: NullableNumber; coverage: NullableNumber; strength?: NullableNumber; closeness?: NullableNumber; basis?: string | null; product_match?: string | null }>;
};

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

/* Production result primitive: this is deliberately the same markup as the
 * field-notebook card in app/design-lab/ab. The scan only supplies real audit
 * values; it does not reuse the older report's .sc-* visual grammar. */
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

function LabValidity({ audit, validity }: { audit: RetainedLedgerAudit | null; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null } }) {
  if (!audit && !validity) return null;
  return <p className="ab-stamp scan-lab-validity"><b>{audit ? "Retained audit · not reverified" : validity?.public_claims_allowed ? "Validated run" : `Not a public product claim · ${validity?.status ?? "unvalidated"}`}</b>{" "}{audit ? `${audit.provenance.prompt_version} · ${audit.provenance.target_product} · ${audit.provenance.target_dose}` : validity?.note ?? "Retained for inspection; scoring constants are not calibrated for public claims."}</p>;
}

function LabWarnings({ count, children }: { count: number; children: ReactNode }) {
  if (!count) return null;
  return <details className="ab-warnings"><summary><span>{count} evidence warning{count === 1 ? "" : "s"}</span></summary><div className="ab-warning-list">{children}</div></details>;
}

function LabTabs({ audit, unmatchedRows, population, emptyState, validity, warnings, warningCount }: { audit: RetainedLedgerAudit | null; unmatchedRows?: EvidenceRow[]; population?: Record<string, string | null> | null; emptyState?: { title: string; description: string; census?: { rcts_indexed?: number; syntheses_indexed?: number } | null }; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null }; warnings: ReactNode; warningCount: number }) {
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

/* The legacy continuous renderer was intentionally removed from the public UI.
 * Its API/scoring data remains available to compatibility consumers. */

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
  const [heroImage, setHeroImage] = useState<"idle" | "loaded" | "error">("idle");

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
    setHeroImage("idle");
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
    setHeroImage("idle");
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
  const factsBasis: Basis = typed ? "user_input" : "label";

  // Sign-in gate. `locked` only ever becomes true once we know for sure
  // sign-in is configured AND we have finished checking for an existing
  // session AND there is none -- never during the brief `loading` window,
  // so a returning signed-in visitor never sees a flash of the lock.
  const locked = auth.configured && !auth.loading && !auth.email;
  const showSaveCard = auth.configured && !auth.loading && !auth.email;

  const showingResult = finished;
  const staged = Boolean(file && preview);
  const labResult = Boolean(data && !error && legend);

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
        <div className={`sc-result-wrap${labResult ? " scan-success" : ""}`}>
          {!labResult ? <div className="sc-scanned" ref={resultTopRef} tabIndex={-1}><span className="sc-thumb sc-thumb-typed" aria-hidden="true">!</span><div className="sc-scanned-main"><p className="sc-scanned-kicker">{headerKicker}</p><h2 className="sc-scanned-name">{headerName}</h2></div><button type="button" className="sc-again" onClick={reset}>Scan another</button></div> : null}
          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>Could not scan that.</strong>
              <span>{error}</span>
            </div>
          ) : null}
          {/* Successful results switch to the field-notebook primitive. */}
          {labResult ? (<div className="scan-lab-result">
            <header className="ab-top scan-lab-top sc-scanned" ref={resultTopRef} tabIndex={-1}>
              <button type="button" className="ab-back" aria-label="Scan another" onClick={reset}>‹</button>
              <div className="ab-title"><strong>{headerName}</strong><small>{typed ? "What you entered · source supplied by you" : `What the label says${label?.brand ? ` · ${label.brand}` : ""}`}</small></div>
            </header>
            <div className="ab-photo-hero scan-lab-hero">
              {preview && !typed && heroImage !== "error" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className={`scan-lab-photo${heroImage === "loaded" ? " is-loaded" : ""}`} src={preview} alt="The label you scanned" onLoad={(event) => setHeroImage(event.currentTarget.naturalWidth > 0 ? "loaded" : "error")} onError={() => setHeroImage("error")} />
              ) : (
                <div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(headerName || "product").split(" ").slice(0, 3).join(" ")}</strong><i>{typed ? "Typed product entry" : "Photo preview unavailable"}</i><div>FORM <b>{entry?.form_label ?? "—"}</b></div></div>
              )}
            </div>

          {locked ? <SaveResultCard /> : null}

          {data && !error && legend ? (
            <>
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

                {/* The validity stamp and disclosures now live inside the lab card,
                    immediately before its first score. */}
                {product ? (
                  <LabTabs
                    audit={ledgerAudit}
                    unmatchedRows={ledgerAudit ? undefined : rows}
                    population={evidence?.population ?? null}
                    emptyState={{ title: evidence?.status === "form_not_scored" ? "That form has not been run." : "No evidence run exists for this ingredient.", description: evidence?.status === "form_not_scored" ? "Evidence about a different form is not evidence about yours, so no number is shown." : "This is not a low score — it is no data." }}
                    validity={evidence?.validity}
                    warningCount={warningCount}
                    warnings={<>
                      {data.caveats?.map((c) => <Notice key={c.code} title={words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(c.text)} body={c.text} />)}
                      {disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={`${d.title} disclosure`} />)}
                      {mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body.replace(/^Model knowledge — unverified\.\s*/, "").replace(/^This company/, `${company?.brand ?? "This company"}`))} body={mlm.body} role="note" ariaLabel="Business model disclosure" /> : null}
                      {auditWarnings.map((warning) => <Notice key={warning.key} title={warning.title} lede={firstSentence(warning.body)} body={warning.body} role="note" ariaLabel={`${warning.title} disclosure`} />)}
                    </>}
                  />
                ) : null}
                {/* Only when it has something to hold: with no product, no validity
                    and no warnings (analyzer_unavailable) this drew an empty card. */}
                {!product && (ledgerAudit || evidence?.validity || warningCount > 0) ? <section className="ab-card scan-lab-card"><LabValidity audit={ledgerAudit} validity={evidence?.validity} /><LabWarnings count={warningCount}><>{data.caveats?.map((c) => <Notice key={c.code} title={words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(c.text)} body={c.text} />)}{disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={`${d.title} disclosure`} />)}{mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body.replace(/^Model knowledge — unverified\.\s*/, "").replace(/^This company/, `${company?.brand ?? "This company"}`))} body={mlm.body} role="note" ariaLabel="Business model disclosure" /> : null}{auditWarnings.map((warning) => <Notice key={warning.key} title={warning.title} lede={firstSentence(warning.body)} body={warning.body} role="note" ariaLabel={`${warning.title} disclosure`} />)}</></LabWarnings></section> : null}

                {typed && entry ? <details className="scan-lab-disclosure" open={false}><summary><h3>What you entered</h3><BasisBadge kind="user_input" legend={legend} /></summary><p className="la-dim"><b>{entry.ingredient_label}</b>, {entry.form_label}. {summaryParts.join(", ")}. Typed, not read from a label.</p><Facts rows={[["Ingredient", entry.ingredient_label], ["Form", entry.form_label], ["Dose per serving", entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} compound` : "no dose entered"], ...(product ? [["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]> : []), ...(entry.servings_per_day !== null ? [["Servings per day", String(entry.servings_per_day)]] as Array<[string, React.ReactNode]> : [])]} /></details> : label ? <details className="scan-lab-disclosure"><summary><h3>Label details</h3><BasisBadge kind="label" legend={legend} /></summary><p className="la-dim"><b>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</b>, {label.form_vocab_id ? words(label.form_vocab_id) : "form not stated"}. {summaryParts.join(", ")}.</p><Facts rows={[["Ingredient", label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"], ["Form", label.form_vocab_id ? words(label.form_vocab_id) : "not stated"], ["Dose per serving", `${mg(label.compound_dose_mg)} compound`], ...(product ? [["Active moiety", product.elemental_dose_mg.low === null ? `not convertible (${product.elemental_dose_mg.basis})` : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]> : []), ...(label.servings_per_day !== null ? [["Servings per day", String(label.servings_per_day)]] as Array<[string, React.ReactNode]> : []), ["Read confidence", label.confidence], ["Source", <BasisBadge key="label-source" kind="label" legend={legend} />]]} />{label.evidence_spans?.length ? <p className="la-spans">Read from: {label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p> : null}</details> : null}

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
                        {ledgerAudit ? (
                          <><strong>Retained audit values.</strong> The Effect, Evidence certainty, Form and Dose values shown above come from the retained, source-verified audit for this exact form and daily dose. <a href="/methodology">Read the methodology.</a></>
                        ) : (
                          <><strong>How these numbers were produced (none are shown): legacy continuous API data.</strong> This unmatched result keeps the continuous evidence response for compatibility, but its outcome numbers are not shown and were not converted into /4 audit values. <a href="/methodology">Read the methodology.</a></>
                        )}
                      </p>
                      {ledgerAudit ? <Facts rows={Object.entries(evidence.run).map(([k, v]) => [words(k), v === null || v === undefined ? "—" : String(v)])} /> : null}
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
            </div>) : null}

          <button type="button" className="button button-dark sc-primary sc-again-bottom" onClick={reset}>
            Scan another
          </button>
        </div>
      ) : null}
    </section>
  );
}
