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
 *   - loading: a progress panel (dimmed thumbnail, a static "this check
 *     covers" list, indeterminate bar). Nothing is rendered disabled -- a greyed
 *     "Scanning…" pill read as broken.
 *   - result / error: the capture chrome is GONE. A compact scanned-product
 *     header (thumbnail or a typed chip, name, "Scan another") sits at the
 *     top, the report follows, and focus + scroll move to it (instant under
 *     prefers-reduced-motion). Previously the result rendered under the
 *     staged photo with no transition and people concluded nothing happened.
 *
 * Camera and search sheet are unchanged from the 2026-09-16 camera-first
 * redesign: <ScanCamera> runs whenever nothing is staged, no result is shown
 * and the Scan tab is the visible one; the `capture="environment"` and plain
 * file inputs stay mounted at all times as the fallback path.
 *
 * SIGN-IN IS THE GATE WHERE IT IS CONFIGURED (2026-09-23, founder: real results
 * depend on a Google login; supersedes the 2026-09-16 "Save your result" nudge,
 * the blurred result lock and the late `/api/scan/claim`, all removed). With
 * NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / _GOOGLE_CLIENT_ID all set:
 *   - nobody signed in: a photo can still be staged, but "Scan this label" and
 *     the search form are replaced by a Google sign-in card and NO request is
 *     sent; while a returning session is still being read a neutral "checking"
 *     line shows -- never the card and never an unlocked screen;
 *   - signed in: every `/api/scan` request carries `Authorization: Bearer
 *     <current access token>`, the server binds the run to that user, and the
 *     result says whether it was actually stored to History;
 *   - sign-out / expiry / another Google account: the in-flight request is
 *     aborted, a late answer is discarded, and the held result is removed --
 *     the next person is never shown the previous person's scan.
 * With any of the three missing the flow is exactly what it always was (no
 * header, no gate) so local and CI runs need no Google project. The UI gate is
 * a convenience; the server (SCAN_REQUIRE_AUTH=1) is what actually refuses an
 * unauthenticated request.
 *
 * REPLAY. `initialResult` renders a scan from the History tab through this very
 * component -- same Evidence Ledger card, same tabs -- with no request at all,
 * dated "Saved scan from ..." so it is never mistaken for fresh research.
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
 * 6. Sign-in gates the REQUEST, never the arithmetic: no composite, arc or dose
 *    band is ever computed, hidden or revealed client-side. Where sign-in is
 *    required a result simply does not exist until the server produced it for
 *    a signed-in owner.
 */

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { SignInCard } from "@/components/google-sign-in";
import { ScanCamera } from "@/components/scan-camera";
import { SearchSheet } from "@/components/search-sheet";
import { shrinkForUpload } from "@/lib/camera/capture";
import { SupplementSearch } from "@/components/supplement-search";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
import { auditPlainEntry, auditPlainText } from "@/lib/evidence-ledger/plain";
import { ledgerFromAudit, score as ledgerScore, type AuditOutcome, type RetainedLedgerAudit } from "@/lib/evidence-ledger";
import { useSupabaseSession, type AuthSession } from "@/lib/auth/use-supabase-session";
import { FLOW_COPY } from "@/lib/i18n/copy/flow";
import { RESULT_COPY, enumWord, ledgerWord, populationPieces, strengthLabel } from "@/lib/i18n/copy/result";
import { doseNoteText, doseReadingBody, knownServerText } from "@/lib/i18n/deterministic";
import { useLang, type Lang } from "@/lib/i18n/locale";
import { TranslationProvider, TranslationStatus, useHasTranslationProvider, useTr, type TranslateHeaders } from "@/lib/i18n/translate-client";

type Basis = keyof ScanAnalysis["basis_legend"];
type NullableNumber = number | null;

const MAX_BYTES = 12 * 1024 * 1024;

/* What the loading view lists for a run: a STATIC "this check covers" list
 * (Ignas PR3 merge): /api/scan answers once at the end and streams no
 * progress, so there is no timer, no "done" tick and no determinate bar.
 * Held as a KIND so a language switch while a scan runs rewords it; the words
 * live in lib/i18n/copy/flow.ts. */
type StageKind = "photo" | "manual";

/* Language + the two dictionaries + the model translator for the CURRENT render.
 * `tr` is identity in English; in Lithuanian it returns a fixed/translated
 * rendering when it has one and the ORIGINAL text otherwise (and queues it). */
function useLocalized() {
  const { lang, toggleLang } = useLang();
  const tr = useTr();
  return { lang, toggleLang, f: FLOW_COPY[lang], r: RESULT_COPY[lang], tr };
}

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

function populationLine(pop: Record<string, string | null> | null | undefined, lang: Lang = "en"): string | null {
  if (!pop) return null;
  const { ages, sexes, atBaseline, health } = populationPieces(lang);
  const parts = [pop.health_status && pop.health_status !== "unknown" ? health(pop.health_status) : null, pop.age_band ? ages[pop.age_band] ?? words(pop.age_band) : null].filter(Boolean) as string[];
  if (pop.sex && pop.sex !== "unknown") parts.push(sexes[pop.sex] ?? words(pop.sex));
  if (pop.deficiency_status && pop.deficiency_status !== "unknown") parts.push(atBaseline(pop.deficiency_status));
  if (pop.pregnancy && pop.pregnancy !== "unknown" && pop.pregnancy !== "not_pregnant") parts.push(words(pop.pregnancy));
  return parts.length ? parts.join(", ") : pop.id ? words(pop.id) : null;
}

/*
 * ID SCOPE. A saved scan opened from the History tab is rendered by this same
 * component while the Scan tab's own (hidden) result is still mounted, so the
 * element ids inside a result must be unique per <ScanFlow> instance or
 * aria-controls / aria-labelledby would resolve to the other result's elements.
 * Every id a result renders is prefixed with the instance's useId() value.
 */
const ScanIdScope = createContext("");

/** One deterministic, shared ID format for every outcome tab and its panel label. */
function tabId(key: string): string {
  const safe = key.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `sc-tab-${safe || "outcome"}-${Math.abs(hash).toString(36)}`;
}

function BasisBadge({ kind, legend }: { kind: Basis; legend: ScanAnalysis["basis_legend"] }) {
  const { lang, r } = useLocalized();
  // English shows the legend the server stored; Lithuanian the same six badges, keyed.
  const entry = lang === "en" || !r.basis[kind] ? legend[kind] : r.basis[kind];
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
  const scope = useContext(ScanIdScope);
  const { r } = useLocalized();
  return (
    <details className="scan-section scan-lab-disclosure" id={`${scope}scan-${id}`}>
      <summary className="scan-section-head" id={`${scope}scan-${id}-title`}>
        <h3>{title}</h3>
        <div className="scan-badges" aria-label={r.sourcesUsed}>
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
  const stripped = body.replace(/^(?:Model knowledge — unverified|Modelio žinios — nepatikrinta)\.\s*/, "");
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
function auditConcernNotices(audit: RetainedLedgerAudit | null, lang: Lang = "en", tr: (text: string) => string = (text) => text): AuditConcernNotice[] {
  if (!audit) return [];
  const r = RESULT_COPY[lang];
  return audit.audit.outcomes.flatMap((outcome) => {
    const notices: AuditConcernNotice[] = [];
    if (outcome.ledger.gates.allPositiveIndustryOrOneLab) {
      notices.push({
        key: `${outcome.name}:${outcome.population ?? ""}:funding`,
        title: r.fundingTitle,
        body: r.auditFundingBody(tr(outcome.name)),
      });
    }
    if (outcome.ledger.checklist.publication_bias === "concern") {
      notices.push({
        key: `${outcome.name}:${outcome.population ?? ""}:publication`,
        title: r.pubBiasTitle,
        body: r.auditPubBiasBody(tr(outcome.name)),
      });
    }
    return notices;
  });
}

function AuditDetailText({ audit, outcome, dimension }: { audit: RetainedLedgerAudit; outcome: AuditOutcome; dimension: "effect" | "evidence" | "form" | "dose" }) {
  const { r, tr } = useLocalized();
  const original = outcome.detail[dimension];
  const plain = auditPlainEntry(audit.plain, outcome);
  // The plain-language rewrite is what is shown (and translated); the audit's
  // own exact wording below stays the original English, labelled in the page language.
  return (
    <>
      {(["found", "missing", "move"] as const).map((field) => (
        <DetailLine key={field} term={field === "found" ? r.found : field === "missing" ? r.missing : r.wouldMove}>
          {tr(auditPlainText(plain, dimension, field, original[field]))}
        </DetailLine>
      ))}
      <details className="sc-audit-exact">
        <summary>{r.exactWording}</summary>
        <DetailLine term={r.found}>{original.found}</DetailLine>
        <DetailLine term={r.missing}>{original.missing}</DetailLine>
        <DetailLine term={r.wouldMove}>{original.move}</DetailLine>
      </details>
    </>
  );
}

function AuditSourceList({ outcome }: { outcome: AuditOutcome }) {
  const { lang, r } = useLocalized();
  return outcome.inventory.length ? (
    <div className="sc-audit-sources">
      <b>{r.sourcesOpened}</b>
      {outcome.inventory.map((source) => {
        const href = auditSourceHref(source.id);
        return <span key={`${source.id}-${source.year}`}>{href ? <a href={href} target="_blank" rel="noreferrer">{source.id}</a> : source.id} <small>({lang === "en" ? source.access : enumWord(lang, source.access)})</small></span>;
      })}
    </div>
  ) : null;
}

/* Production result primitive: this is deliberately the same markup as the
 * field-notebook card in app/design-lab/ab. The scan only supplies real audit
 * values; it does not reuse the older report's .sc-* visual grammar. */
function LabDimension({ id, label, value, word, fill, open, onToggle, children }: { id: string; label: string; value: string; word: string; fill: number | null; open: boolean; onToggle: () => void; children: ReactNode }) {
  const scope = useContext(ScanIdScope);
  return <li className={open ? "open" : ""} data-row-id={id}>
    <button type="button" aria-expanded={open} aria-controls={`${scope}ab-scan-${id}`} onClick={onToggle}>
      <span className="ab-bar-name">{label}</span><span className="ab-bar-word">{word}</span><span className="ab-bar-pts">{value}</span>
      <span className="ab-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <span className={`ab-bar-track ${fill === null ? "hatch" : "fill"}`}>{fill !== null ? <i style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%`, background: "var(--ab-accent)" }} /> : null}</span>
    </button>
    {open ? <div id={`${scope}ab-scan-${id}`} className="ab-bar-detail">{children}</div> : null}
  </li>;
}

function LabValidity({ audit, validity }: { audit: RetainedLedgerAudit | null; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null } }) {
  const { r, tr } = useLocalized();
  if (!audit && !validity) return null;
  // prompt_version and target_product are identifiers/product names (original); the dose phrase and the note are prose.
  return <p className="ab-stamp scan-lab-validity"><b>{audit ? r.retainedNotReverified : validity?.public_claims_allowed ? r.validatedRun : r.notPublicClaim(validity?.status ?? r.unvalidated)}</b>{" "}{audit ? `${audit.provenance.prompt_version} · ${audit.provenance.target_product} · ${tr(audit.provenance.target_dose)}` : validity?.note ? tr(validity.note) : r.validityDefaultNote}</p>;
}

function LabWarnings({ count, children }: { count: number; children: ReactNode }) {
  const { r } = useLocalized();
  if (!count) return null;
  return <details className="ab-warnings"><summary><span>{r.warningCount(count)}</span></summary><div className="ab-warning-list">{children}</div></details>;
}

function LabTabs({ audit, unmatchedRows, population, emptyState, validity, warnings, warningCount }: { audit: RetainedLedgerAudit | null; unmatchedRows?: EvidenceRow[]; population?: Record<string, string | null> | null; emptyState?: { title: string; description: string; census?: { rcts_indexed?: number; syntheses_indexed?: number } | null }; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null }; warnings: ReactNode; warningCount: number }) {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const scope = useContext(ScanIdScope);
  const { lang, r, tr } = useLocalized();
  const lw = (english: string) => ledgerWord(lang, english);
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
  const tabIdFor = (key: string) => `${scope}ab-scan-tab-${tabId(`${matched ? "matched" : "unmatched"}:${key}`)}`;
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
      { id: "effect", label: r.dimEffect, value: result.effect === "unclear" ? "—" : `${result.effect > 0 ? "+" : result.effect < 0 ? "−" : ""}${result.effect}/3`, word: lw(result.effectWord), fill: result.effect === "unclear" ? null : (result.effect + 3) / 6, body: <><p>{r.effectScaleNote}</p><DetailLine term={r.plainSummary}>{tr(auditPlainText(auditPlainEntry(audit!.plain, outcome), "summary", "sentence", outcome.sentence))}</DetailLine><DetailLine term={r.estimate}>{outcome.absolute_effect ? tr(outcome.absolute_effect) : r.noEstimate}</DetailLine><DetailLine term={r.meaningful}>{outcome.clinically_meaningful ? tr(outcome.clinically_meaningful) : r.unknownDot}</DetailLine><DetailLine term={r.strongestDoubt}>{tr(outcome.strongest_doubt)}</DetailLine>{detail("effect")}<AuditSourceList outcome={outcome} /></> },
      { id: "evidence", label: r.dimEvidence, value: `${result.certainty}/4`, word: lw(result.certaintyWord), fill: result.certainty / 4, body: <><p>{r.certaintyNote}</p><DetailLine term={r.gates}>{result.firedGates.length ? result.firedGates.map(lw).join("; ") : r.noGate}</DetailLine><DetailLine term={r.checklist}>{Object.entries(outcome.ledger.checklist).map(([name, state]) => `${lang === "en" ? words(name) : r.checklistNames[name] ?? words(name)}: ${enumWord(lang, state)}`).join("; ")}</DetailLine>{detail("evidence")}<AuditSourceList outcome={outcome} /></> },
      { id: "form", label: r.dimForm, value: fit(outcome.ledger.formFit), word: lw(result.formWord), fill: typeof outcome.ledger.formFit === "number" ? outcome.ledger.formFit / 4 : null, body: <><p>{r.formNote}</p>{detail("form")}<AuditSourceList outcome={outcome} /></> },
      { id: "dose", label: r.dimDose, value: fit(outcome.ledger.doseFit), word: lw(result.doseWord), fill: typeof outcome.ledger.doseFit === "number" ? outcome.ledger.doseFit / 4 : null, body: <><p>{r.doseNote}</p><DetailLine term={r.effectiveRange}>{tr(outcome.ledger.effective_daily_range)}</DetailLine>{detail("dose")}<AuditSourceList outcome={outcome} /></> },
    ];
    return <>
      <div className="ab-headline" style={{ "--ab-score-color": scoreSignalColor(result.headline, result.certainty / 4) } as CSSProperties}>
        <div className="ab-number"><strong>{result.headline ?? "—"}</strong>{result.headline !== null ? <span>/100</span> : null}</div>
        <div><h2>{tr(outcome.name)}</h2><p className="ab-pop"><b>{r.populationLabel}</b> {outcome.population ? tr(outcome.population) : r.populationNotRecorded}</p><p>{lw(result.label)}</p></div>
      </div>
      <LabWarnings count={warningCount}>{warnings}</LabWarnings>
      <ul className="ab-bars">{rows.map((row) => <LabDimension key={row.id} {...row} open={open === `${key}:${row.id}`} onToggle={() => setOpen(open === `${key}:${row.id}` ? null : `${key}:${row.id}`)}>{row.body}</LabDimension>)}</ul>
    </>;
  };
  const renderUnmatched = (outcome: { key: string; name: string }) => <><div className="ab-headline muted"><div className="ab-number"><strong>—</strong></div><div><h2>{tr(outcome.name)}</h2><p>{r.notAssessed}</p>{population && <p className="ab-pop"><b>{r.populationLabel}</b> {populationLine(population, lang)}</p>}</div></div><LabWarnings count={warningCount}>{warnings}</LabWarnings><ul className="ab-bars">{(["effect", "evidence", "form", "dose"] as const).map((id) => <LabDimension key={id} id={id} label={id === "evidence" ? r.dimEvidence : id === "effect" ? r.dimEffect : id === "form" ? r.dimForm : r.dimDose} value="—" word={r.notAssessed} fill={null} open={open === `${outcome.key}:${id}`} onToggle={() => setOpen(open === `${outcome.key}:${id}` ? null : `${outcome.key}:${id}`)}><p>{r.noAuditMatches}</p><DetailLine term={r.unmatchedStatus}>{r.unmatchedStatusBody}</DetailLine></LabDimension>)}</ul></>;
  const panel = current ? (matched ? renderMatched(audit!.audit.outcomes.find((o) => `${o.name}||${o.population ?? ""}` === current.key)!) : renderUnmatched(current)) : <><LabWarnings count={warningCount}>{warnings}</LabWarnings><div className="ab-listhead"><div className="ab-general" style={{ "--ab-score-color": scoreSignalColor(general, generalSignal) } as CSSProperties}><strong className="ab-general-score">{general ?? "—"}</strong><span className="ab-general-name">{r.generalScore}<small>{matched ? r.averageOf(numbers.length) : r.notAssessed}</small></span></div><h2>{r.outcomesTab}</h2>{!matched && <p className="ab-stamp">{outcomes.length ? r.noAuditMatchesConverted : emptyState?.title ?? r.noOutcomes}</p>}{!matched && !outcomes.length && <p className="ab-pop">{emptyState?.description ?? r.noRunBody}</p>}</div><ul className="ab-bars outcomes">{outcomes.map((o, index) => { const score = scores[index]; const value = score?.headline ?? null; return <li key={o.key}><button type="button" onClick={() => select(o.key)}><span className="ab-bar-name">{tr(o.name)}{o.population && <small>{tr(o.population)}</small>}</span><span className="ab-bar-pts" style={value === null ? undefined : { color: scoreSignalColor(value, score!.certainty / 4, "text") }}>{value ?? "—"}</span><span className="ab-chev go" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></span><span className={`ab-bar-track ${value === null ? "hatch" : "fill"}`}><i style={{ width: `${value ?? 0}%`, background: value === null ? undefined : scoreSignalColor(value, score!.certainty / 4) }} /></span></button></li>; })}</ul></>;
  return <><div className="ab-tabs" role="tablist" aria-label={r.outcomeTablist}><button id={tabIdFor("__general")} ref={(n) => { refs.current[0] = n; }} role="tab" aria-selected={active === null} aria-controls={`${scope}ab-scan-tabpanel`} tabIndex={active === null ? 0 : -1} onKeyDown={(e) => onKey(e, 0)} onClick={() => select("__general")}>{r.outcomesTab}</button>{outcomes.map((o, i) => <button key={o.key} id={tabIdFor(o.key)} ref={(n) => { refs.current[i + 1] = n; }} role="tab" aria-selected={active === o.key} aria-controls={`${scope}ab-scan-tabpanel`} tabIndex={active === o.key ? 0 : -1} onKeyDown={(e) => onKey(e, i + 1)} onClick={() => select(o.key)}>{tr(o.name)}</button>)}</div><section className="ab-card scan-lab-card" aria-label={r.outcomeResults}><LabValidity audit={audit} validity={validity} /><div id={`${scope}ab-scan-tabpanel`} role="tabpanel" tabIndex={-1} aria-labelledby={tabIdFor(active ?? "__general")}>{panel}</div></section></>;
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
  const { lang, r, tr } = useLocalized();
  const name = reading.outcome_label ?? words(reading.outcome);
  // The server's sentence starts with the outcome name; the heading already
  // says it, so the prefix is dropped here (presentation only). In Lithuanian
  // the sentence is re-rendered from the SAME stored numbers (ranges, closeness,
  // match class, dose); the stored English `reading` is never edited.
  const original = reading.reading;
  const text =
    lang === "en"
      ? original
      : doseReadingBody(lang, { dose, benefit: reading.benefit_range_mg, nulls: reading.null_range_mg, productMatch: reading.product_match, closeness: reading.closeness }).body;
  const stripped = lang === "en" && text.startsWith(`${name}: `) ? text.slice(name.length + 2) : text;
  const sentence = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return (
    <div className={`scan-dose scan-dose-${reading.tone}`}>
      <div className="scan-dose-head">
        <strong>{tr(name)}</strong>
        <span>{reading.closeness == null ? r.closenessDash : r.closeness(reading.closeness.toFixed(2))}</span>
      </div>
      <div className="scan-dosebar" role="img" aria-label={lang === "en" ? reading.reading : `${tr(name)}: ${sentence}`}>
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

function severityLabel(kind: string, severity: string, lang: Lang = "en"): string {
  const r = RESULT_COPY[lang];
  const k = lang === "en" ? words(kind) : enumWord(lang, kind);
  return severity === "high" ? `${k}, ${r.severityHigh}` : severity === "moderate" ? `${k}, ${r.severityModerate}` : k;
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

/** A scan that was saved to the signed-in person's history and is being shown again. */
export interface SavedScanResult {
  runId: string;
  /** ISO time the run was saved (the history list's `created_at`), when known. */
  savedAt: string | null;
  analysis: ScanAnalysis;
}

export interface ScanFlowProps {
  catalog: CatalogIngredient[];
  /**
   * The workspace's shared session. Omit it when <ScanFlow> is rendered on its
   * own and it reads the session itself.
   */
  auth?: AuthSession;
  /**
   * False while the Scan tab is hidden behind History: the camera stops and a
   * finished result does not pull focus. Default true.
   */
  active?: boolean;
  /**
   * A saved scan to show INSTEAD of the capture flow -- the History tab's replay.
   * The same renderer draws it and NO request is made. Read once at mount; give
   * <ScanFlow> a new `key` to show another. Must be mounted by someone who is
   * signed in as the owner (it is hidden the moment the signed-in person changes).
   */
  initialResult?: SavedScanResult;
  /** Replay only: what the back control does (it replaces "Scan another"). */
  onLeave?: () => void;
  /** A new scan finished AND the server reports it stored, so History is now out of date. */
  onScanStored?: (info: { runId: string }) => void;
}

/*
 * An error is held as a CODE (plus the few values it quotes), never as English
 * text, so switching language rewords an error that is already on screen.
 * `server` carries a message the server or a model wrote: it is original text
 * and is translated (or left original) by `tr` at render.
 */
type ScanError =
  | { code: "too_large"; mb: string }
  | { code: "not_set_up" }
  | { code: "signin_unavailable" }
  | { code: "request_failed"; status: number }
  | { code: "analysis_could_not_run" }
  | { code: "unreachable"; detail: string }
  | { code: "refusal"; which: "scan_history_required_failed" | "scan_history_required_unavailable" | "payload_too_large" }
  | { code: "server"; text: string };

type AuthNotice = "session_ended" | "cleared" | "stopped";

/** What one request left behind, stamped with whose it is. */
interface Outcome {
  owner: string | null;
  data: ScanAnalysis | null;
  error: ScanError | null;
}

/** The stand-in owner on a deployment with no sign-in configured. */
const LOCAL_OWNER = "local";

/**
 * Responses from `POST /api/scan` that are refusals, not analyses, and the
 * words a person sees for each. `scan_history_required_*` only exist when the
 * deployment turns durable history on (SCAN_HISTORY_REQUIRED=1): the first means
 * the scan ran but could not be recorded, the second that it was refused before
 * any model call because history storage is not configured. Neither is the
 * person's fault, and neither says which setting to fix. `payload_too_large`
 * (HTTP 413) is the typed-entry size wall; its server text only describes a
 * typed entry, which is wrong advice for a photo, so it is replaced too.
 */
const SERVER_REFUSALS: Record<string, ScanError> = {
  scan_history_required_failed: { code: "refusal", which: "scan_history_required_failed" },
  scan_history_required_unavailable: { code: "refusal", which: "scan_history_required_unavailable" },
  payload_too_large: { code: "refusal", which: "payload_too_large" },
};

/** "3 Mar 2026, 14:05" in the person's own locale; null when the value is not a date. */
export function formatSavedAt(iso: string | null | undefined, lang: Lang = "en"): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // English keeps the visitor's own locale (as before); Lithuanian formats the
  // same instant with Lithuanian month names. Same moment, same time zone.
  return date.toLocaleString(lang === "lt" ? "lt-LT" : undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ScanFlow(props: ScanFlowProps) {
  // Display translation needs the session's bearer token (same gate as a scan).
  // Normally <ScanWorkspace> already provides it; a bare <ScanFlow> brings its own.
  const provided = useHasTranslationProvider();
  const ownAuth = useSupabaseSession({ skip: Boolean(props.auth) || provided });
  if (provided) return <ScanFlowInner {...props} />;
  return <StandaloneScanFlow {...props} auth={props.auth ?? ownAuth} />;
}

function StandaloneScanFlow(props: ScanFlowProps & { auth: AuthSession }) {
  const { auth } = props;
  const { configured, getAccessToken, userId } = auth;
  const headers = useCallback<TranslateHeaders>(async (options): Promise<Record<string, string> | null> => {
    if (!configured) return {};
    const token = await getAccessToken({ userId, forceRefresh: options?.forceRefresh });
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, [configured, getAccessToken, userId]);
  return (
    <TranslationProvider getHeaders={headers} ownerKey={userId}>
      <ScanFlowInner {...props} />
    </TranslationProvider>
  );
}

function ScanFlowInner({ catalog, auth: sharedAuth, active = true, initialResult, onLeave, onScanStored }: ScanFlowProps) {
  const { lang, toggleLang, f, r, tr } = useLocalized();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stageKind, setStageKind] = useState<StageKind>("photo");
  const stages = stageKind === "photo" ? f.photoStages : f.manualStages;
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [authNoticeKey, setAuthNotice] = useState<AuthNotice | null>(null);
  const authNotice = authNoticeKey === "session_ended" ? f.sessionEnded : authNoticeKey === "cleared" ? f.signedOutCleared : authNoticeKey === "stopped" ? f.signedOutStopped : null;

  const ownAuth = useSupabaseSession({ skip: Boolean(sharedAuth) });
  const auth = sharedAuth ?? ownAuth;
  const { getAccessToken, signOut } = auth;
  const authConfigured = auth.configured;
  const replay = initialResult !== undefined;
  const idScope = `${useId()}-`;

  // WHOSE SCREEN IS THIS. Everything a request returns is stamped with the
  // owner it was made for, and only the CURRENT owner's outcome is ever drawn.
  // `ownerKey` is null while a returning session is still being read and once
  // nobody is signed in; on a deployment with no sign-in it is one fixed owner.
  // Deriving visibility from the stamp (rather than clearing in an effect) means
  // there is no render, however brief, in which the previous person's result is
  // on screen for the next one.
  const ownerKey: string | null = !auth.configured ? LOCAL_OWNER : auth.loading ? null : auth.userId;
  const gate: "open" | "checking" | "signin" = !auth.configured ? "open" : auth.loading ? "checking" : auth.userId ? "open" : "signin";

  const [outcome, setOutcome] = useState<Outcome | null>(() => (initialResult ? { owner: ownerKey, data: initialResult.analysis, error: null } : null));
  const [pending, setPending] = useState<{ id: number; owner: string | null } | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestSeq = useRef(0);
  const onScanStoredRef = useRef(onScanStored);
  const activeRef = useRef(active);
  const resultTopRef = useRef<HTMLElement | null>(null);
  const setResultTop = useCallback((node: HTMLElement | null) => {
    resultTopRef.current = node;
  }, []);
  const [heroImage, setHeroImage] = useState<"idle" | "loaded" | "error">("idle");

  // Sign-out or an account switch REVOKES what the previous person had here --
  // their result, their request in flight, and the photo that was being scanned
  // or shown -- rather than merely hiding it, and says why when they signed out.
  // A photo that was only staged (never sent) is kept: it is still the visitor's
  // own, and sign-in is exactly what unblocks it. (Adjusting state while
  // rendering is React's supported way to reset state when an input changes.)
  const leftOutcome = outcome !== null && outcome.owner !== ownerKey;
  const leftRequest = pending !== null && pending.owner !== ownerKey;
  if (leftOutcome || leftRequest) {
    setOutcome(null);
    setPending(null);
    setFile(null);
    setHeroImage("idle");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (ownerKey === null && !auth.loading) {
      const had = leftOutcome && (outcome?.data || outcome?.error) && outcome.owner !== LOCAL_OWNER;
      if (had) setAuthNotice((n) => n ?? "cleared");
      else if (leftRequest) setAuthNotice((n) => n ?? "stopped");
    }
  }

  // A notice explains why the sign-in card is showing; entering the open gate
  // (a successful sign-in) retires it. Not "while open": the session-ended
  // notice is set a beat BEFORE the gate closes.
  const [lastGate, setLastGate] = useState(gate);
  if (lastGate !== gate) {
    setLastGate(gate);
    if (gate === "open") setAuthNotice(null);
  }

  const data = outcome && outcome.owner === ownerKey ? outcome.data : null;
  const error = outcome && outcome.owner === ownerKey ? outcome.error : null;
  const busy = pending !== null && pending.owner === ownerKey;

  useEffect(() => {
    onScanStoredRef.current = onScanStored;
    activeRef.current = active;
  });

  const cancelRequest = useCallback(() => {
    const running = requestRef.current;
    requestRef.current = null;
    running?.controller.abort();
  }, []);

  // A request belongs to the person who started it: when the signed-in person
  // changes (sign-out, expiry, another Google account) or the page unmounts,
  // abort it. Its late answer is also discarded by the `isCurrent()` checks.
  useEffect(() => cancelRequest, [ownerKey, cancelRequest]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // The result is its own state: the instant an answer (or an error) lands,
  // scroll its header into view and move focus there, so the change of state
  // is unmistakable on a phone. Reduced-motion users get an instant jump. A
  // result that lands while the Scan tab is hidden does not pull focus.
  const finished = !busy && (data !== null || error !== null);
  useEffect(() => {
    if (!finished || !activeRef.current) return;
    const el = resultTopRef.current;
    if (!el || typeof window === "undefined") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [finished, data, error]);

  const stageFile = useCallback(
    (picked: File) => {
      if (picked.size > MAX_BYTES) {
        setOutcome({ owner: ownerKey, data: null, error: { code: "too_large", mb: (picked.size / 1e6).toFixed(1) } });
        return;
      }
      setOutcome(null);
      setHeroImage("idle");
      setFile(picked);
      setSearchOpen(false);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(picked);
      });
    },
    [ownerKey],
  );

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
    setOutcome(null);
    clearFile();
  }, [clearFile]);

  /*
   * ONE scan request, for the photo and the typed path alike.
   *
   *  - It never starts unless the gate is open: where sign-in is configured a
   *    live Supabase session must exist first, and the request carries that
   *    session's CURRENT access token (re-read now, not the render-time
   *    snapshot, so an hourly refresh is picked up).
   *  - If the API answers 401 the token is refreshed once and the request is
   *    retried once (the server rejects before any model work, so this costs
   *    nothing); a second 401 ends the session on screen instead of looping.
   *  - Whatever comes back is applied only if this is still the live request
   *    for the same owner.
   */
  const runScan = useCallback(
    async (kind: StageKind, send: (headers: Record<string, string>, signal: AbortSignal) => Promise<Response>) => {
      if (replay || busy || gate !== "open" || ownerKey === null) return;
      const owner = ownerKey;
      cancelRequest();
      const id = ++requestSeq.current;
      const controller = new AbortController();
      requestRef.current = { id, controller };
      const isCurrent = () => requestRef.current?.id === id;
      setOutcome(null);
      setAuthNotice(null);
      setStageKind(kind);
      setPending({ id, owner });

      const endSession = () => {
        // Stop "scanning" first so the sign-out that follows reads as an expiry
        // (the photo stays staged), not as a request abandoned mid-flight.
        setPending(null);
        setAuthNotice("session_ended");
        void signOut();
      };
      const authorize = async (forceRefresh: boolean): Promise<Record<string, string> | null> => {
        if (!authConfigured) return {};
        const token = await getAccessToken({ userId: owner, forceRefresh });
        return token ? { Authorization: `Bearer ${token}` } : null;
      };

      try {
        const headers = await authorize(false);
        if (!isCurrent()) return;
        if (!headers) {
          endSession();
          return;
        }
        let res = await send(headers, controller.signal);
        if (!isCurrent()) return;
        if (res.status === 401 && authConfigured) {
          const retryHeaders = await authorize(true);
          if (!isCurrent()) return;
          if (!retryHeaders || retryHeaders.Authorization === headers.Authorization) {
            endSession();
            return;
          }
          res = await send(retryHeaders, controller.signal);
          if (!isCurrent()) return;
          if (res.status === 401) {
            endSession();
            return;
          }
        }
        const json = (await res.json()) as ScanAnalysis & { error?: string };
        if (!isCurrent()) return;
        if (json.status === "unauthorized" || res.status === 401) {
          setOutcome({ owner, data: null, error: { code: "not_set_up" } });
          return;
        }
        if (json.status === "auth_unavailable") {
          setOutcome({ owner, data: null, error: { code: "signin_unavailable" } });
          return;
        }
        if (!res.ok && !json.status) {
          setOutcome({ owner, data: null, error: json.error ? { code: "server", text: json.error } : { code: "request_failed", status: res.status } });
          return;
        }
        // The server's own refusals that carry no analysis. Each one gets WORDS
        // and an action (a blank "Result" card with a "!" is a bug); the
        // history ones use fixed text because the server's detail names
        // deployment settings a visitor can do nothing about.
        const refusal = Object.prototype.hasOwnProperty.call(SERVER_REFUSALS, json.status) ? SERVER_REFUSALS[json.status] : undefined;
        if (refusal) {
          setOutcome({ owner, data: json, error: refusal });
          return;
        }
        const failed =
          json.status === "label_unreadable" ||
          json.status === "analyzer_failed" ||
          json.status === "bad_request" ||
          json.status === "manual_input_invalid";
        setOutcome({ owner, data: json, error: failed ? (json.error ? { code: "server", text: json.error } : { code: "analysis_could_not_run" }) : null });
        if (json.persistence?.status === "stored" && json.run_id) onScanStoredRef.current?.({ runId: json.run_id });
      } catch (err) {
        if (!isCurrent()) return;
        setOutcome({ owner, data: null, error: { code: "unreachable", detail: String(err) } });
      } finally {
        if (requestRef.current?.id === id) requestRef.current = null;
        setPending((p) => (p?.id === id ? null : p));
      }
    },
    [replay, busy, gate, ownerKey, authConfigured, getAccessToken, signOut, cancelRequest],
  );

  const submitPhoto = useCallback(async () => {
    if (!file) return;
    const picked = file;
    // Shrunk once even if the request is retried after a token refresh.
    let shrunk: Promise<File> | null = null;
    await runScan("photo", async (headers, signal) => {
      const body = new FormData();
      shrunk ??= shrinkForUpload(picked);
      body.append("image", await shrunk);
      return fetch("/api/scan", { method: "POST", headers, body, signal });
    });
  }, [file, runScan]);

  const submitManual = useCallback(
    async (input: ManualScanInput) => {
      if (replay || busy || gate !== "open") return;
      clearFile();
      setSearchOpen(false);
      await runScan("manual", (headers, signal) =>
        fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ source: "manual", ...input }),
          signal,
        }),
      );
    },
    [replay, busy, gate, runScan, clearFile],
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

  const showingResult = finished;
  const leave = replay ? (onLeave ?? (() => undefined)) : reset;
  const leaveLabel = replay ? f.backToHistory : f.scanAnother;
  const savedAtLabel = replay ? formatSavedAt(initialResult?.savedAt ?? initialResult?.analysis.analyzed_at, lang) : null;
  // Say only what the server reported. A signed-in scan is "saved" only when
  // the run row was actually stored; a failure is shown as one, not hidden.
  const persistenceStatus = data?.persistence?.status;
  const persistenceNote =
    !authConfigured || !persistenceStatus
      ? null
      : persistenceStatus === "stored"
        ? f.savedToHistory
        : persistenceStatus === "unavailable"
          ? f.historyUnavailableNotSaved
          : f.historySaveFailed;
  const staged = Boolean(file && preview);
  const labResult = Boolean(data && !error && legend);

  // The scanned-product header: what was scanned or typed, and what happened.
  const headerKicker = error
    ? f.kickerCouldNot
    : typed
      ? f.kickerEntered
      : label
        ? f.kickerLabel
        : data?.status === "analyzer_unavailable" || data?.status === "not_a_supplement_label"
          ? f.kickerDidNotFinish
          : f.kickerResult;
  const headerName = error
    ? f.nameDidNotFinish
    : typed && entry
      ? entry.form_label
      : label
        ? label.product_name ?? label.ingredient_label_text ?? label.ingredient_vocab_id ?? f.nameUnnamed
        : data?.status === "not_a_supplement_label"
          ? f.nameNotSupplement
          : data?.status === "analyzer_unavailable"
            ? f.namePhotoCouldNot
            : data?.ingredient_label_text ?? f.nameResult;

  // One line of the facts that decide "at my dose, in my form"; the full
  // definition list (read confidence, quoted spans…) opens below it.
  const activeMoiety = product ? (product.elemental_dose_mg.low === null ? r.moietyNotConvertibleShort : r.moietyActive(mg(product.elemental_dose_mg.low))) : null;
  const summaryParts: string[] = typed && entry
    ? [
        entry.dose_per_serving ? r.compoundPerServing(`${entry.dose_per_serving.value} ${entry.dose_per_serving.unit}`) : r.noDoseEntered,
        ...(activeMoiety && entry.dose_per_serving ? [activeMoiety] : []),
        ...(entry.servings_per_day !== null ? [f.servingsPerDay(entry.servings_per_day)] : []),
      ]
    : label
      ? [
          label.form_vocab_id ? words(label.form_vocab_id) : r.formNotStated,
          r.compoundPerServing(mg(label.compound_dose_mg)),
          ...(activeMoiety ? [activeMoiety] : []),
          ...(label.servings_per_day !== null ? [f.servingsPerDay(label.servings_per_day)] : []),
        ]
      : [];

  // Disclosure TEMPLATES are fixed per language; the model-authored basis /
  // signals inside them go through `tr`. Nothing here reads a score.
  const disclosureLocale = { lang, tr, confidenceWord: (value: string) => enumWord(lang, value) };
  const disclosures = data ? literatureDisclosures(data.literature_warnings?.data, disclosureLocale) : [];
  const mlm = company?.profile.status === "ok" ? businessModelDisclosure(company.profile.data?.business_model, disclosureLocale) : null;
  const auditWarnings = auditConcernNotices(ledgerAudit, lang, tr);
  const errorText = (e: ScanError): string => {
    switch (e.code) {
      case "too_large": return f.imageTooLarge(e.mb);
      case "not_set_up": return f.notSetUpToSignIn;
      case "signin_unavailable": return f.signInUnavailable;
      case "request_failed": return f.requestFailed(e.status);
      case "analysis_could_not_run": return f.analysisCouldNotRun;
      case "unreachable": return f.couldNotReach(e.detail);
      case "refusal": return e.which === "scan_history_required_failed" ? f.refusalHistoryFailed : e.which === "scan_history_required_unavailable" ? f.refusalHistoryUnavailable : f.refusalTooLarge;
      default: return tr(e.text);
    }
  };
  // Caveats are server sentences keyed by `code`. Known ones have a fixed
  // Lithuanian rendering; anything else goes to the translator (or stays English).
  const caveatBody = (text: string): string => (lang === "en" ? text : knownServerText(lang, text) ?? tr(text));
  const caveatTitle = (code: string): string => (lang === "en" ? words(code).replace(/^\w/, (ch) => ch.toUpperCase()) : r.caveatTitle[code] ?? words(code).replace(/^\w/, (ch) => ch.toUpperCase()));
  const mlmLede = (body: string): string => firstSentence(body.replace(/^(?:Model knowledge — unverified|Modelio žinios — nepatikrinta)\.\s*/, "").replace(/^(?:This company|Ši įmonė)/, `${company?.brand ?? (lang === "en" ? "This company" : "Ši įmonė")}`));
  const warningCount = (data?.caveats?.length ?? 0) + disclosures.length + (mlm ? 1 : 0) + auditWarnings.length;

  return (
    <ScanIdScope.Provider value={idScope}>
    <section className="la scan sc" aria-label={replay ? f.savedScanRegion : f.scanRegion}>
      {/* Page top bar (2026-10-03, Ignas PR3): the product's own scan mark, the
          language switch, and -- only once signed in -- the account initial.
          Replaces the shared site header on this page (hidden in globals.css).
          This is THE language switch while the Scan tab shows; the workspace
          shows its own only on History, so exactly one is ever visible. */}
      {!replay ? (
        <div className="sc-topbar">
          <span className="sc-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-lockup" src="/bsproof-lockup.svg" alt="BS-PROOF" width={130} height={26} />
          </span>
          <span className="sc-topbar-end">
            <button type="button" className="sc-lang" onClick={toggleLang} aria-label={f.switchTo} lang={lang === "en" ? "lt" : "en"} data-testid="lang-toggle">
              {f.switchShort}
            </button>
            {auth.configured && auth.email ? (
              <>
                <span className="sc-avatar" title={auth.email} aria-label={`${f.signedInAs} ${auth.email}`}>
                  {auth.email.charAt(0).toUpperCase()}
                </span>
                {/* Sign-out stays reachable from the landing, not only from a
                    result or the History tab. */}
                <button type="button" className="sc-signout" onClick={() => void signOut()}>
                  {f.signOut}
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {/* Two inputs, one difference: `capture` hands off to the platform
          camera. Kept mounted at all times -- this is the fallback path
          that must remain when getUserMedia is unavailable/denied/an
          insecure context, so nothing regresses. */}
      {!replay ? (
        <>
          <input type="file" accept="image/*" capture="environment" className="la-input" id="scan-capture" aria-label={f.captureInputLabel} disabled={busy} onChange={(e) => pick(e.target.files)} />
          <input type="file" accept={ACCEPTED_TYPES} className="la-input" id="scan-file" aria-label={f.fileInputLabel} disabled={busy} onChange={(e) => pick(e.target.files)} />
        </>
      ) : null}

      {!replay && !showingResult ? (
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
                  <p className="sc-progress-title">{f.loadingTitle}</p>
                  <p className="sc-progress-sub">{f.loadingSub}</p>
                </div>
              </div>
              <div className="sc-progress-bar" aria-hidden="true">
                <span />
              </div>
              <p className="sc-progress-covers">{f.loadingCovers}</p>
              <ol className="sc-stages">
                {stages.map((s) => (
                  <li key={s}>
                    <span className="sc-stage-mark" aria-hidden="true" />
                    <span className="la-stage">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : staged ? (
            /* ---------------- staged ---------------- */
            <div className="sc-staged">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="la-preview sc-preview" src={preview ?? undefined} alt={f.stagedAlt} />
              {gate === "open" ? (
                <button type="button" className="button button-dark sc-primary la-analyze" onClick={() => void submitPhoto()}>
                  {f.scanThis}
                </button>
              ) : gate === "checking" ? (
                <p className="sc-check" role="status">
                  {f.checkingSignIn}
                </p>
              ) : (
                <SignInCard title={f.signInScanTitle} body={f.signInScanBody} notice={authNotice} />
              )}
              <div className="sc-secondary-row">
                <button type="button" className="button button-outline sc-secondary" onClick={clearFile}>
                  {f.retake}
                </button>
                <label className="button button-outline sc-secondary" htmlFor="scan-file">
                  {f.chooseOther}
                </label>
              </div>
            </div>
          ) : (
            /* ---------------- landing ---------------- */
            <>
              <div className="sc-intro">
                <h1 id="scan-title" className="sc-headline" lang={lang}>{f.headline}</h1>
                <p className="sc-subline" lang={lang}>{f.subline}</p>
              </div>
              <ScanCamera
                active={!file}
                disabled={busy}
                onCapture={stageFile}
                onUnavailable={() => setCameraUnavailable(true)}
                labels={f.camera}
                leading={
                  <label className="sc-icon-btn" htmlFor="scan-file" aria-label={f.uploadLabel}>
                    <span className="sc-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></svg>
                    </span>
                    {f.upload}
                  </label>
                }
                trailing={
                  <button type="button" className="sc-icon-btn sc-search-cta" onClick={() => setSearchOpen(true)} aria-label={f.searchLabel}>
                    <span className="sc-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
                    </span>
                    {f.search}
                    {lang === "en" ? <span className="sr-only"> your supplement</span> : null}
                  </button>
                }
                fallback={
                  cameraUnavailable ? (
                    <label className="button button-dark sc-fallback-photo" htmlFor="scan-capture">
                      {f.takePhoto}
                    </label>
                  ) : null
                }
              />
              {gate === "signin" ? (
                <div className="sc-below-block">
                  <span className="sc-hint sc-signin-hint" data-testid="signin-hint">
                    {f.signInHint}
                  </span>
                  {authNotice ? (
                    <p className="sc-signin-notice" role="status" data-testid="signin-notice">
                      {authNotice}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!replay ? (
        <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} titleId="scan-search-title" title={f.searchTitle} closeLabel={f.searchClose}>
          {gate === "open" ? (
            <>
              <p className="sc-search-lede">{f.searchLede}</p>
              <SupplementSearch catalog={catalog} busy={busy} onSubmit={(input) => void submitManual(input)} />
            </>
          ) : gate === "checking" ? (
            <p className="sc-check" role="status">
              {f.checkingSignIn}
            </p>
          ) : (
            <SignInCard title={f.signInSearchTitle} body={f.signInSearchBody} notice={authNotice} />
          )}
        </SearchSheet>
      ) : null}

      {showingResult ? (
        <div className={`sc-result-wrap${labResult ? " scan-success" : ""}`}>
          {replay ? (
            <p className="sc-replay-note" ref={setResultTop} tabIndex={-1} data-testid="replay-note">
              {savedAtLabel ? (
                <>
                  {f.savedScanFrom} <time dateTime={initialResult?.savedAt ?? undefined}>{savedAtLabel}</time>.
                </>
              ) : (
                <>{f.savedScan}</>
              )}{" "}
              {f.replayExplain}
            </p>
          ) : null}
          {!labResult ? <div className="sc-scanned" ref={replay ? undefined : setResultTop} tabIndex={-1}><span className="sc-thumb sc-thumb-typed" aria-hidden="true">!</span><div className="sc-scanned-main"><p className="sc-scanned-kicker">{headerKicker}</p><h2 className="sc-scanned-name">{headerName}</h2></div><button type="button" className="sc-again" onClick={leave}>{leaveLabel}</button></div> : null}
          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>{f.couldNotScan}</strong>
              <span>{errorText(error)}</span>
            </div>
          ) : null}
          {/* A server error sentence can be machine-translated too (see errorText); a result carries its own status line below. */}
          {error ? <TranslationStatus /> : null}
          {/* Successful results switch to the field-notebook primitive. */}
          {labResult ? (<div className="scan-lab-result">
            <header className="ab-top scan-lab-top sc-scanned" ref={replay ? undefined : setResultTop} tabIndex={-1}>
              <button type="button" className="ab-back" aria-label={leaveLabel} onClick={leave}>‹</button>
              <div className="ab-title"><strong>{headerName}</strong><small>{typed ? f.subtitleTyped : `${f.subtitleLabel}${label?.brand ? ` · ${label.brand}` : ""}`}</small></div>
            </header>
            <div className="ab-photo-hero scan-lab-hero">
              {preview && !typed && heroImage !== "error" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className={`scan-lab-photo${heroImage === "loaded" ? " is-loaded" : ""}`} src={preview} alt={f.labelAlt} onLoad={(event) => setHeroImage(event.currentTarget.naturalWidth > 0 ? "loaded" : "error")} onError={() => setHeroImage("error")} />
              ) : (
                <div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(headerName || "product").split(" ").slice(0, 3).join(" ")}</strong><i>{typed ? f.typedProductEntry : f.photoPreviewUnavailable}</i><div>{f.heroFormLabel} <b>{entry?.form_label ?? "—"}</b></div></div>
              )}
            </div>

          {data && !error && legend ? (
            <>
              {/* A result is only ever drawn for the person it belongs to (see
                  `ownerKey`): sign-out or an account switch removes it from
                  state, so there is nothing to blur, lock or re-reveal. */}
              <div className="la-result scan-result">
                <TranslationStatus />
                {auth.configured && auth.email ? (
                  <p className="sc-signed-in-line">
                    {f.signedInAs} <strong>{auth.email}</strong>
                    <button type="button" className="sc-signout" onClick={() => void signOut()}>
                      {f.signOut}
                    </button>
                  </p>
                ) : null}
                {persistenceNote && !replay ? (
                  <p className="sc-save-status" role="status" data-testid="save-status" data-persistence={data.persistence?.status}>
                    {persistenceNote}
                  </p>
                ) : null}

                {data.status === "analyzer_unavailable" ? (
                  <div className="la-empty">
                    <strong>{r.analyzerNotConfigured}</strong>
                    <span>{r.analyzerNeedsKey}</span>
                  </div>
                ) : null}

                {data.status === "not_a_supplement_label" ? (
                  <div className="la-empty">
                    <strong>{r.notSupplementTitle}</strong>
                    <span>{r.notSupplementBody}</span>
                  </div>
                ) : null}

                {data.status === "ingredient_not_supported" ? (
                  <div className="la-empty">
                    <strong>{r.ingredientNotSupported(data.ingredient_label_text ?? null)}</strong>
                    <span>
                      {r.noDataNotLow} {r.nothingRun}
                      {data.queue && (data.queue as { queued?: boolean }).queued ? ` ${r.requestRecorded}` : ""}
                    </span>
                    {data.supported_ingredients?.length ? <span className="la-dim">{r.coveredSoFar} {data.supported_ingredients.join(", ")}</span> : null}
                  </div>
                ) : null}

                {/* The validity stamp and disclosures now live inside the lab card,
                    immediately before its first score. */}
                {product ? (
                  <LabTabs
                    audit={ledgerAudit}
                    unmatchedRows={ledgerAudit ? undefined : rows}
                    population={evidence?.population ?? null}
                    emptyState={{ title: evidence?.status === "form_not_scored" ? r.formNotRunTitle : r.noRunTitle, description: evidence?.status === "form_not_scored" ? r.formNotRunBody : r.noRunBody }}
                    validity={evidence?.validity}
                    warningCount={warningCount}
                    warnings={<>
                      {data.caveats?.map((c) => <Notice key={c.code} title={caveatTitle(c.code)} lede={firstSentence(caveatBody(c.text))} body={caveatBody(c.text)} />)}
                      {disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={r.disclosureAria(d.title)} />)}
                      {mlm ? <Notice title={mlm.title} lede={mlmLede(mlm.body)} body={mlm.body} role="note" ariaLabel={r.businessModelAria} /> : null}
                      {auditWarnings.map((warning) => <Notice key={warning.key} title={warning.title} lede={firstSentence(warning.body)} body={warning.body} role="note" ariaLabel={r.disclosureAria(warning.title)} />)}
                    </>}
                  />
                ) : null}
                {/* Only when it has something to hold: with no product, no validity
                    and no warnings (analyzer_unavailable) this drew an empty card. */}
                {!product && (ledgerAudit || evidence?.validity || warningCount > 0) ? <section className="ab-card scan-lab-card"><LabValidity audit={ledgerAudit} validity={evidence?.validity} /><LabWarnings count={warningCount}><>{data.caveats?.map((c) => <Notice key={c.code} title={caveatTitle(c.code)} lede={firstSentence(caveatBody(c.text))} body={caveatBody(c.text)} />)}{disclosures.map((d) => <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={r.disclosureAria(d.title)} />)}{mlm ? <Notice title={mlm.title} lede={mlmLede(mlm.body)} body={mlm.body} role="note" ariaLabel={r.businessModelAria} /> : null}{auditWarnings.map((warning) => <Notice key={warning.key} title={warning.title} lede={firstSentence(warning.body)} body={warning.body} role="note" ariaLabel={r.disclosureAria(warning.title)} />)}</></LabWarnings></section> : null}

                {typed && entry ? (
                  <details className="scan-lab-disclosure" open={false}>
                    <summary><h3>{r.whatYouEntered}</h3><BasisBadge kind="user_input" legend={legend} /></summary>
                    <p className="la-dim"><b>{entry.ingredient_label}</b>, {entry.form_label}. {summaryParts.join(", ")}. {r.typedNotRead}</p>
                    <Facts rows={[[r.ingredient, entry.ingredient_label], [r.form, entry.form_label], [r.dosePerServing, entry.dose_per_serving ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} ${r.compoundSuffix}` : r.noDoseEntered], ...(product ? [[r.activeMoiety, product.elemental_dose_mg.low === null ? r.notConvertible(product.elemental_dose_mg.basis) : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]> : []), ...(entry.servings_per_day !== null ? [[r.servingsPerDayLabel, String(entry.servings_per_day)]] as Array<[string, React.ReactNode]> : [])]} />
                  </details>
                ) : label ? (
                  <details className="scan-lab-disclosure">
                    <summary><h3>{r.labelDetails}</h3><BasisBadge kind="label" legend={legend} /></summary>
                    <p className="la-dim"><b>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</b>, {label.form_vocab_id ? words(label.form_vocab_id) : r.formNotStated}. {summaryParts.join(", ")}.</p>
                    <Facts rows={[[r.ingredient, label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"], [r.form, label.form_vocab_id ? words(label.form_vocab_id) : r.notStated], [r.dosePerServing, `${mg(label.compound_dose_mg)} ${r.compoundSuffix}`], ...(product ? [[r.activeMoiety, product.elemental_dose_mg.low === null ? r.notConvertible(product.elemental_dose_mg.basis) : mg(product.elemental_dose_mg.low)]] as Array<[string, React.ReactNode]> : []), ...(label.servings_per_day !== null ? [[r.servingsPerDayLabel, String(label.servings_per_day)]] as Array<[string, React.ReactNode]> : []), [r.readConfidence, enumWord(lang, label.confidence)], [r.sourceLabel, <BasisBadge key="label-source" kind="label" legend={legend} />]]} />
                    {label.evidence_spans?.length ? <p className="la-spans">{r.readFrom} {label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p> : null}
                  </details>
                ) : null}

                {/* -------- evidence orientation (only when no run exists) -------- */}
                {prior ? (
                  <Section id="prior" title={r.priorTitle} basis={["model_prior"]} legend={legend}>
                    <p className="scan-disclaimer">{tr(prior.disclaimer)}</p>
                    {prior.status === "ok" && prior.data ? (
                      <>
                        <p className="scan-note">{tr(prior.data.summary)}</p>
                        {prior.data.evidence_landscape ? (
                          <p className="la-dim">
                            {r.systematicReviews} {lang === "en" ? prior.data.evidence_landscape.syntheses_exist : enumWord(lang, prior.data.evidence_landscape.syntheses_exist)}
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
                                {o.dose_reading ? <p className={o.dose_closeness != null && o.dose_closeness >= 0.999 ? "scan-dose-hit" : "scan-dose-miss"}>{tr(o.dose_reading)}</p> : null}
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
                            <div className="scan-item-head">
                              <strong>{r.safety}</strong>
                            </div>
                            <ul className="scan-plain">
                              {prior.data.safety_notes.map((s) => (
                                <li key={s}>{tr(s)}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {prior.data.caveats?.length ? <p className="la-dim">{r.modelUnsure} {prior.data.caveats.map((c) => tr(c)).join("; ")}</p> : null}
                      </>
                    ) : (
                      <p className="la-dim">{r.orientationUnavailable} {prior.reason ? tr(prior.reason) : r.skipped}</p>
                    )}
                  </Section>
                ) : null}

                {/* ---------------- dose ---------------- */}
                {dose ? (
                  <Section id="dose" title={r.doseTitle} basis={["evidence_run", factsBasis]} legend={legend}>
                    <p className="scan-note">{lang === "en" ? dose.note : doseNoteText(lang, dose)}</p>
                    {dose.outcomes.length ? (
                      <div className="scan-doses">
                        <div className="scan-dose-key" aria-hidden="true">
                          <span>
                            <i className="scan-key scan-key-benefit" /> {r.keyBenefit}
                          </span>
                          <span>
                            <i className="scan-key scan-key-null" /> {r.keyNull}
                          </span>
                          <span>
                            <i className="scan-key scan-key-marker" /> {r.keyDose}
                          </span>
                        </div>
                        {dose.outcomes.map((o) => (
                          <DoseBar key={o.outcome} reading={o} dose={dose.scored_dose_mg} />
                        ))}
                      </div>
                    ) : (
                      <p className="la-dim">{r.noScoredOutcome}</p>
                    )}
                  </Section>
                ) : null}

                {/* ---------------- compatibility ---------------- */}
                {compat ? (
                  <Section id="form" title={r.compatTitle} basis={compat.basis_used} legend={legend}>
                    <p className="scan-formfit">
                      <strong>
                        {compat.evidence_form_fit.status === "exact_form_scored"
                          ? r.formFitExact
                          : compat.evidence_form_fit.status === "form_not_scored"
                            ? r.formFitNotRun
                            : compat.evidence_form_fit.status === "ingredient_not_scored"
                              ? r.formFitNoIngredient
                              : r.formFitUnknown}
                      </strong>{" "}
                      <span className="la-dim">
                        {compat.evidence_form_fit.form_strength != null
                          ? r.formEvidenceStrength(compat.evidence_form_fit.form_strength.toFixed(2), compat.evidence_form_fit.form_basis ?? r.ladder)
                          : compat.evidence_form_fit.scored_forms.length
                            ? `${r.formsRun} ${compat.evidence_form_fit.scored_forms.join(", ")}.`
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
                            <p>{tr(n.note)}</p>
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
                      <span className="sc-label">{typed ? r.activesEntered : r.activesRead}</span>
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
                      <p className="la-dim">{r.singleActive}</p>
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
                            <span className="scan-sev">{severityLabel(x.kind, x.severity, lang)}</span>
                            {x.advice ? <p>{tr(x.advice)}</p> : null}
                            {x.mechanism ? <p className="la-dim">{tr(x.mechanism)}</p> : null}
                            {x.source ? (
                              <a href={x.source.url} target="_blank" rel="noreferrer">
                                {x.source.title}
                              </a>
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
                      <p className="la-dim">{r.modelFillInUnavailable} {compat.model.reason ? tr(compat.model.reason) : ""}</p>
                    ) : null}
                  </Section>
                ) : null}

                {/* ---------------- company ---------------- */}
                {company ? (
                  <Section id="company" title={r.companyTitle} basis={company.basis_used.length ? company.basis_used : ["label"]} legend={legend}>
                    {company.status === "no_brand_on_label" ? (
                      <p className="la-dim">
                        {typed
                          ? r.noBrandTyped
                          : r.noBrandPhoto}
                      </p>
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
                                      <span key={c.text} className="scan-chip" title={tr(c.note)}>
                                        {c.text}
                                      </span>
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
                              {company.registry.recalls.map((rec, i) => (
                                /* Raw FDA record: product, reason, firm, class and dates stay as published. */
                                <li key={rec.recall_number ?? i}>
                                  <span className="scan-recall-meta">
                                    <span>{rec.initiated ?? r.dateDash}</span>
                                    <span>{rec.classification ?? r.classDash}</span>
                                    {rec.status ? <span>{rec.status}</span> : null}
                                  </span>
                                  <strong>{rec.product}</strong>
                                  <span>{rec.reason}</span>
                                  <span className="la-dim">{r.firm} {rec.firm}</span>
                                </li>
                              ))}
                            </ul>
                          ) : company.registry.status === "no_matches" ? (
                            <p>{r.noRecallOn(company.registry.queried.join(r.or))}</p>
                          ) : company.registry.status === "unavailable" ? (
                            <p className="la-dim">{r.registryUnavailable} {company.registry.reason ? tr(company.registry.reason) : ""}</p>
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
                                      <strong>
                                        {enumWord(lang, h.kind)}
                                        {h.year ? `, ${h.year}` : ""}
                                      </strong>
                                      <span>{tr(h.summary)}</span>
                                      <span className="la-dim">
                                        {r.profileModelConfidence} {enumWord(lang, h.confidence)}
                                        {h.kind === "recall"
                                          ? h.registry_corroborated === true
                                            ? r.recallOnFile
                                            : h.registry_corroborated === false
                                              ? r.notCorroborated
                                              : ""
                                          : ""}
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
                                        [r.ownership, `${lang === "en" ? company.profile.data.ownership_type : enumWord(lang, company.profile.data.ownership_type)}${company.profile.data.parent_company ? ` (${company.profile.data.parent_company})` : ""}`],
                                        [r.thirdParty, `${lang === "en" ? company.profile.data.third_party_testing.status : enumWord(lang, company.profile.data.third_party_testing.status)}${company.profile.data.third_party_testing.program ? `, ${company.profile.data.third_party_testing.program}` : ""}`],
                                        [r.batchCerts, lang === "en" ? company.profile.data.transparency.coa_published : enumWord(lang, company.profile.data.transparency.coa_published)],
                                        [r.profileConfidence, lang === "en" ? company.profile.data.confidence : enumWord(lang, company.profile.data.confidence)],
                                      ]}
                                    />
                                  ) : null}
                                  {company.profile.data.reputation_notes.length ? (
                                    <ul className="scan-plain">
                                      {company.profile.data.reputation_notes.map((n) => (
                                        <li key={n}>{tr(n)}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {company.profile.data.caveats.length ? <p className="la-dim">{r.couldNotConfirm} {company.profile.data.caveats.map((c) => tr(c)).join("; ")}</p> : null}
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
                ) : null}

                {/* ---------------- legend + technical details ---------------- */}
                <details className="sc-details scan-legend">
                  <summary id={`${idScope}scan-legend-title`}>{r.legendTitle}</summary>
                  <ol>
                    {Object.entries(legend)
                      .sort(([, a], [, b]) => a.rank - b.rank)
                      .map(([kind, entry]) => (
                        <li key={kind}>
                          <BasisBadge kind={kind as Basis} legend={legend} />
                          <span>{lang === "en" ? entry.means : r.basis[kind as Basis]?.means ?? entry.means}</span>
                        </li>
                      ))}
                  </ol>
                </details>

                <details className="sc-details sc-technical">
                  <summary>{r.technicalTitle}</summary>
                  {evidence?.run ? (
                    <>
                      <p>
                        {ledgerAudit ? (
                          <><strong>{r.retainedValuesBold}</strong>{r.retainedValuesBody}<a href="/methodology">{r.readMethodology}</a></>
                        ) : (
                          <><strong>{r.legacyBold}</strong>{r.legacyBody}<a href="/methodology">{r.readMethodology}</a></>
                        )}
                      </p>
                      {ledgerAudit ? <Facts rows={Object.entries(evidence.run).map(([k, v]) => [words(k), v === null || v === undefined ? "—" : String(v)])} /> : null}
                    </>
                  ) : null}
                  {data.meta ? (
                    <Facts
                      rows={[
                        [r.techSource, typed ? r.techTyped : r.techPhoto],
                        [r.techTook, `${data.meta.timing_s} s`],
                        ...(typed ? [] : ([[r.techVision, data.meta.models.vision ?? "—"]] as Array<[string, React.ReactNode]>)),
                        [r.techText, data.meta.models.text ?? "—"],
                        ...Object.entries(data.meta.stages ?? {}).map(([k, v]) => [r.techStage(r.stageNames[k] ?? words(k)), v === null || v === undefined ? r.techSkipped : `${v} s`] as [string, React.ReactNode]),
                        ...Object.entries(data.meta.prompt_versions ?? {}).map(([k, v]) => [r.techPrompt(r.stageNames[k] ?? words(k)), String(v)] as [string, React.ReactNode]),
                        ...(data.run_id ? ([[r.techRunId, <code key="r">{data.run_id}</code>]] as Array<[string, React.ReactNode]>) : []),
                        ...(data.app_version
                          ? ([
                              [
                                r.techAppVersion,
                                <code key="v">
                                  {data.app_version.package_version}
                                  {data.app_version.git_sha ? ` ${data.app_version.git_sha.slice(0, 8)}` : ""}
                                </code>,
                              ],
                            ] as Array<[string, React.ReactNode]>)
                          : []),
                        ...(data.persistence ? ([[r.techRunStored, r.persistenceStatus[data.persistence.status] ?? words(data.persistence.status)]] as Array<[string, React.ReactNode]>) : []),
                      ]}
                    />
                  ) : null}
                </details>
              </div>
            </>
                ) : null}
            </div>) : null}

          <button type="button" className="button button-dark sc-primary sc-again-bottom" onClick={leave}>
            {leaveLabel}
          </button>
        </div>
      ) : null}
    </section>
    </ScanIdScope.Provider>
  );
}
