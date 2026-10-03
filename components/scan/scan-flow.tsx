"use client";

/*
 * THE SCAN. Photograph a label with a LIVE camera viewfinder -- or upload a
 * photo, or search for the supplement by name -- and get the product's full
 * analysis: the evidence verdicts with their four arcs, dose effectiveness,
 * form and ingredient compatibility, and the company's background -- every
 * block stamped with the BASIS it rests on.
 *
 * Design: docs/SYSTEM_DESIGN.md §11 (full history in
 * docs/history/2026-09-16-scan-design-log.md). The page is a state machine
 * (./flow-state.ts) and each state OWNS the viewport:
 *
 *   landing -> staged -> loading -> result | error
 *
 *   - landing / staged / loading: ./capture-views.tsx.
 *   - result / error: the capture chrome is GONE. A compact header sits at the
 *     top, the Evidence Ledger card (./ledger-tabs.tsx) and the report
 *     sections (./report-sections.tsx) follow, and focus + scroll move to it
 *     (instant under prefers-reduced-motion).
 *
 * The `capture="environment"` and plain file inputs stay mounted at all times
 * as the fallback when getUserMedia is unavailable; `useSupabaseSession` gates
 * the "Save your result" card and the blurred/inert result lock;
 * `/api/scan/claim` is called the moment both a session and a `run_id` exist.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. INVARIANT 8: no branch renders a composite without its arcs. A gated row is
 *    an em dash with its arcs still drawn, never a zero, so `0.00 @ 0%` and
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

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
import { useSupabaseSession } from "@/lib/auth/use-supabase-session";

import { LandingView, LoadingPanel, StagedView } from "./capture-views";
import { MANUAL_STAGES, MAX_BYTES, PHOTO_STAGES, flowReducer, initialFlowState, receivedAction } from "./flow-state";
import { mg, words } from "./format";
import { SaveResultCard } from "./google-sign-in";
import { GradeCard } from "./grade-card";
import { LabTabs, LabValidity, LabWarnings, auditConcernNotices } from "./ledger-tabs";
import type { Basis } from "./primitives";
import {
  CompanySection,
  CompatibilitySection,
  DoseSection,
  EntryDetails,
  PriorSection,
  SourceLegend,
  TechnicalDetails,
  WarningNotices,
  type ScanEvidence,
} from "./report-sections";
import { SearchSheet } from "./search-sheet";
import { SupplementSearch } from "./supplement-search";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

export function ScanFlow({ catalog }: { catalog: CatalogIngredient[] }) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const { file, preview, busy, stage, stages, data, error, heroImage } = state;
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const auth = useSupabaseSession();
  const claimedRuns = useRef<Set<string>>(new Set());
  const resultTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => dispatch({ type: "tick" }), 6000);
    return () => clearInterval(id);
  }, [busy]);

  // A replaced or cleared preview URL is revoked here, the one place it can be.
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
  // run id exist, whichever arrives second.
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
      dispatch({ type: "reject", error: `That image is ${(picked.size / 1e6).toFixed(1)} MB. The limit is 12 MB.` });
      return;
    }
    setSearchOpen(false);
    dispatch({ type: "stage", file: picked, preview: URL.createObjectURL(picked) });
  }, []);

  const pick = useCallback((files: FileList | null) => {
    const picked = files?.[0];
    if (picked) stageFile(picked);
  }, [stageFile]);

  const clearFile = useCallback(() => dispatch({ type: "clear" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const post = useCallback(async (init: RequestInit) => {
    try {
      const res = await fetch("/api/scan", { method: "POST", ...init });
      const json = (await res.json()) as ScanAnalysis & { error?: string };
      dispatch(receivedAction(json, res.ok, res.status));
    } catch (err) {
      dispatch({ type: "failed", error: `Could not reach the analyzer: ${String(err)}` });
    } finally {
      dispatch({ type: "done" });
    }
  }, []);

  const submitPhoto = useCallback(async () => {
    if (!file || busy) return;
    dispatch({ type: "start", stages: PHOTO_STAGES, clearFile: false });
    const body = new FormData();
    body.append("image", file);
    await post({ body });
  }, [file, busy, post]);

  const submitManual = useCallback(async (input: ManualScanInput) => {
    if (busy) return;
    setSearchOpen(false);
    dispatch({ type: "start", stages: MANUAL_STAGES, clearFile: true });
    await post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "manual", ...input }) });
  }, [busy, post]);

  const legend = data?.basis_legend;
  const label = data?.label;
  const entry = data?.input;
  const typed = data?.source === "manual";
  const product = data?.product;
  const ledgerAudit = data?.ledger_audit ?? null;
  const gradesV2 = data?.evidence_v2?.status === "graded" ? data.evidence_v2 : null;
  const evidence = data?.evidence as ScanEvidence | undefined;
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
  const warnings = <WarningNotices caveats={data?.caveats} disclosures={disclosures} mlm={mlm} brand={company?.brand} auditWarnings={auditWarnings} />;

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
            <LoadingPanel preview={preview} stages={stages} stage={stage} showSaveCard={showSaveCard} />
          ) : staged ? (
            <StagedView preview={preview} onScan={() => void submitPhoto()} onRetake={clearFile} />
          ) : (
            <LandingView active={!file} disabled={busy} cameraUnavailable={cameraUnavailable} onCapture={stageFile} onUnavailable={() => setCameraUnavailable(true)} />
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
          {!labResult ? (
            <div className="sc-scanned" ref={resultTopRef} tabIndex={-1}>
              <span className="sc-thumb sc-thumb-typed" aria-hidden="true">!</span>
              <div className="sc-scanned-main">
                <p className="sc-scanned-kicker">{headerKicker}</p>
                <h2 className="sc-scanned-name">{headerName}</h2>
              </div>
              <button type="button" className="sc-again" onClick={reset}>Scan another</button>
            </div>
          ) : null}
          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>Could not scan that.</strong>
              <span>{error}</span>
            </div>
          ) : null}
          {/* Successful results switch to the field-notebook primitive. */}
          {labResult && data && legend ? (
            <div className="scan-lab-result">
              <header className="ab-top scan-lab-top sc-scanned" ref={resultTopRef} tabIndex={-1}>
                <button type="button" className="ab-back" aria-label="Scan another" onClick={reset}>‹</button>
                <div className="ab-title"><strong>{headerName}</strong><small>{typed ? "What you entered · source supplied by you" : `What the label says${label?.brand ? ` · ${label.brand}` : ""}`}</small></div>
              </header>
              <div className="ab-photo-hero scan-lab-hero">
                {preview && !typed && heroImage !== "error" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className={`scan-lab-photo${heroImage === "loaded" ? " is-loaded" : ""}`} src={preview} alt="The label you scanned" onLoad={(event) => dispatch({ type: "hero", value: event.currentTarget.naturalWidth > 0 ? "loaded" : "error" })} onError={() => dispatch({ type: "hero", value: "error" })} />
                ) : (
                  <div className="ab-jar"><div className="ab-jar-lid" /><span>FIELD NOTES / 001</span><strong>{(headerName || "product").split(" ").slice(0, 3).join(" ")}</strong><i>{typed ? "Typed product entry" : "Photo preview unavailable"}</i><div>FORM <b>{entry?.form_label ?? "—"}</b></div></div>
                )}
              </div>

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

                {/* The validity stamp and disclosures live inside the lab card,
                    immediately before its first score. */}
                {/* Evidence method v2: when a retained run carries pooled
                    grades for this ingredient, they replace the ledger card
                    (keep-then-retire, docs/EVIDENCE_METHOD.md §6). */}
                {product && gradesV2 ? (
                  <GradeCard grades={gradesV2} warnings={<LabWarnings count={warningCount}>{warnings}</LabWarnings>} />
                ) : null}
                {product && !gradesV2 ? (
                  <LabTabs
                    audit={ledgerAudit}
                    unmatchedRows={ledgerAudit ? undefined : rows}
                    population={evidence?.population ?? null}
                    emptyState={{ title: evidence?.status === "form_not_scored" ? "That form has not been run." : "No evidence run exists for this ingredient.", description: evidence?.status === "form_not_scored" ? "Evidence about a different form is not evidence about yours, so no number is shown." : "This is not a low score — it is no data." }}
                    validity={evidence?.validity}
                    warningCount={warningCount}
                    warnings={warnings}
                  />
                ) : null}
                {/* Only when it has something to hold: with no product, no validity
                    and no warnings (analyzer_unavailable) this drew an empty card. */}
                {!product && (ledgerAudit || evidence?.validity || warningCount > 0) ? (
                  <section className="ab-card scan-lab-card">
                    <LabValidity audit={ledgerAudit} validity={evidence?.validity} />
                    <LabWarnings count={warningCount}>{warnings}</LabWarnings>
                  </section>
                ) : null}

                <EntryDetails typed={typed} entry={entry} label={label} product={product} legend={legend} summaryParts={summaryParts} />
                {/* Evidence orientation, only when no run exists. */}
                {prior ? <PriorSection prior={prior} legend={legend} /> : null}
                {dose ? <DoseSection dose={dose} legend={legend} factsBasis={factsBasis} /> : null}
                {compat ? <CompatibilitySection compat={compat} legend={legend} typed={typed} /> : null}
                {company ? <CompanySection company={company} legend={legend} typed={typed} mlm={mlm} /> : null}
                <SourceLegend legend={legend} />
                <TechnicalDetails data={data} evidence={evidence} ledgerAudit={ledgerAudit} typed={typed} />
              </div>
            </div>
          ) : null}

          <button type="button" className="button button-dark sc-primary sc-again-bottom" onClick={reset}>
            Scan another
          </button>
        </div>
      ) : null}
    </section>
  );
}
