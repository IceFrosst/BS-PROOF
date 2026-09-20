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

import { useCallback, useEffect, useRef, useState } from "react";

import { SaveResultCard } from "@/components/google-sign-in";
import { ScanCamera } from "@/components/scan-camera";
import { SearchSheet } from "@/components/search-sheet";
import { SupplementSearch } from "@/components/supplement-search";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
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

/* One evidence dimension, one full-width row: label, value and coverage stay
 * together above a prominent track. The identity class is a restrained visual
 * aid only; the words carry the meaning. `0.00 @ 0%` is explicitly striped and
 * says "untested", while `−0.70 @ 100%` has a full solid track. */
function Arc({
  dimension,
  label,
  value,
  coverage,
}: {
  dimension: "effect" | "form" | "dose" | "evidence";
  label: string;
  value: string;
  coverage: NullableNumber;
}) {
  const known = coverage !== null && coverage !== undefined;
  const fill = known ? Math.max(0, Math.min(1, coverage)) : 0;
  const untested = known && fill === 0;
  const coverageText = !known ? "coverage not recorded" : untested ? "0% · untested" : `${pct(coverage)} coverage`;
  const coverageLabel = !known ? "not recorded" : untested ? "0%, untested" : pct(coverage);
  return (
    <div
      className={`sc-arc sc-arc-${dimension}${untested ? " sc-arc-untested" : ""}${!known ? " sc-arc-unknown" : ""}`}
      role="img"
      aria-label={`${label}${value ? ` ${value},` : ","} coverage ${coverageLabel}`}
    >
      <div className="sc-arc-head">
        <span className="sc-arc-label">{label}</span>
        <span className="sc-arc-value">{value}</span>
        <span className="sc-arc-cov">{coverageText}</span>
      </div>
      <span className="sc-arc-track" aria-hidden="true">
        <span className="sc-arc-fill" style={{ width: `${fill * 100}%` }} />
      </span>
    </div>
  );
}

type EvidenceRow = {
  outcome: string;
  outcome_label: string | null;
  composite: NullableNumber;
  verdict: string | null;
  n_primaries: NullableNumber;
  applicability?: NullableNumber;
  arcs: Record<"effect" | "form" | "dose" | "evidence", { verdict: NullableNumber; coverage: NullableNumber; strength?: NullableNumber; closeness?: NullableNumber; basis?: string | null; product_match?: string | null }>;
};

function EvidenceCard({ row }: { row: EvidenceRow }) {
  const gated = row.composite === null;
  const notes: string[] = [];
  if (row.arcs.form?.basis) notes.push(`Form basis: ${words(row.arcs.form.basis)}.`);
  if (row.arcs.dose?.product_match) notes.push(`Dose match: ${words(row.arcs.dose.product_match)}${row.arcs.dose?.closeness == null ? " (not assessable)" : ""}.`);
  else if (row.arcs.dose?.closeness == null) notes.push("Dose: not assessable.");
  return (
    <article className={`scan-card scan-evidence${gated ? " scan-evidence-gated" : ""}`}>
      <header className="sc-outcome-head">
        <div className="sc-outcome-name">
          <h4>{row.outcome_label ?? words(row.outcome)}</h4>
          <p className="sc-verdict">{row.verdict ?? "no verdict"}</p>
        </div>
        <p className="sc-score" aria-label={gated ? "no composite score" : `${row.composite} out of 100`}>
          <strong>{gated ? "—" : row.composite}</strong>
          <span aria-hidden="true">/100</span>
        </p>
      </header>
      <div className="sc-arcs">
        <Arc dimension="effect" label="Does it work?" value={signed(row.arcs.effect?.verdict)} coverage={row.arcs.effect?.coverage} />
        <Arc dimension="form" label="In your form?" value={signed(row.arcs.form?.verdict)} coverage={row.arcs.form?.coverage} />
        <Arc dimension="dose" label="At your dose?" value={signed(row.arcs.dose?.verdict)} coverage={row.arcs.dose?.coverage} />
        <Arc dimension="evidence" label="Well studied?" value="" coverage={row.arcs.evidence?.coverage} />
      </div>
      <footer className="sc-outcome-foot">
        <span>
          {row.n_primaries ?? 0} trial{row.n_primaries === 1 ? "" : "s"}
        </span>
        {row.applicability != null ? <span>{pct(row.applicability)} applies to your product</span> : null}
        {notes.length ? <span className="sc-outcome-notes">{notes.join(" ")}</span> : null}
      </footer>
    </article>
  );
}

/* Outcomes as tabs: the first tab lists every outcome (no averaged overall
 * number — a product is not one benefit), each further tab is one outcome with
 * its four evidence tracks. Tapping a list row opens that outcome's tab. */
function OutcomeTabs({ rows }: { rows: EvidenceRow[] }) {
  const [active, setActive] = useState<string | null>(null);
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
            <EvidenceCard row={current} />
            <button type="button" className="sc-tab-back" onClick={() => go(null, true)}>
              ← All outcomes
            </button>
          </>
        ) : (
          <ul className="sc-outcome-list" aria-label="Scored outcomes">
            {rows.map((row) => {
              const gated = row.composite === null;
              return (
                <li key={row.outcome}>
                  <button type="button" className="sc-outcome-row" onClick={() => go(row.outcome, true)} aria-label={`${label(row)}, ${gated ? "no composite score" : `${row.composite} out of 100`}, ${row.verdict ?? "no verdict"}. Open details`}>
                    <span className="sc-outcome-row-name">
                      <strong>{label(row)}</strong>
                      <span className="sc-verdict">{row.verdict ?? "no verdict"}</span>
                    </span>
                    <span className="sc-outcome-row-score">
                      <strong>{gated ? "—" : row.composite}</strong>
                      <span aria-hidden="true">/100</span>
                    </span>
                    <span className="sc-outcome-row-chev" aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
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
  const evidence = data?.evidence as
    | { status: string; rows?: EvidenceRow[]; scored_forms?: string[]; run?: Record<string, unknown>; validity?: { status: string | null; public_claims_allowed: boolean; note: string | null; limitations?: string[] } }
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
  const hasNotices = Boolean(evidence?.validity || data?.caveats?.length || disclosures.length || mlm);

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
                    {evidence?.validity ? (
                      <div className={`la-alert ${evidence.validity.public_claims_allowed ? "la-alert-ok" : "la-alert-warn"} sc-notice sc-notice-open`}>
                        <strong>{evidence.validity.public_claims_allowed ? "Validated run." : `Not a product claim — this run is marked ${evidence.validity.status ?? "unvalidated"}.`}</strong>
                        <span>{evidence.validity.note ?? "Retained for inspection. The scoring constants have not passed anchor calibration."}</span>
                      </div>
                    ) : null}
                    {data.caveats?.map((c) => (
                      <Notice key={c.code} title={words(c.code).replace(/^\w/, (ch) => ch.toUpperCase())} lede={firstSentence(c.text)} body={c.text} />
                    ))}
                    {disclosures.map((d) => (
                      <Notice key={d.title} title={d.title} lede={firstSentence(d.body)} body={d.body} role="note" ariaLabel={`${d.title} disclosure`} />
                    ))}
                    {mlm ? <Notice title={mlm.title} lede={firstSentence(mlm.body.replace(/^Model knowledge — unverified\.\s*/, "").replace(/^This company/, `${company?.brand ?? "This company"}`))} body={mlm.body} role="note" ariaLabel="Business model disclosure" /> : null}
                  </section>
                ) : null}

                {/* ---------------- evidence ---------------- */}
                {product ? (
                  <Section id="evidence" title="Does it work?" basis={["evidence_run"]} legend={legend}>
                    {rows.length ? (
                      <OutcomeTabs rows={rows} />
                    ) : (
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
