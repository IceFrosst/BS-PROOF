"use client";

/*
 * THE SCAN. Photograph a label with a LIVE camera viewfinder -- or upload a
 * photo, or search for the supplement by name -- and get what can be said
 * about the product today: what the label says, an unverified orientation on
 * the literature, form and ingredient compatibility, and the company's
 * background -- every block stamped with the BASIS it rests on.
 *
 * EVIDENCE GRADING IS NOT ACTIVE (2026-10-15): the v14 score and the Evidence
 * Ledger were removed and evidence method v2 is not connected until it is
 * validated. <GradingNotice> says so on the landing screen and on every result.
 *
 * Design: docs/APP.md §11 (full history in
 * docs/history/2026-09-16-scan-design-log.md). The page is a state machine
 * (./flow-state.ts) and each state OWNS the viewport:
 *
 *   landing -> staged -> loading -> result | error
 *
 *   - landing / staged / loading: ./capture-views.tsx.
 *   - result / error: the capture chrome is GONE. A compact header sits at the
 *     top, the grading notice and the report sections (./report-sections.tsx)
 *     follow, and focus + scroll move to it (instant under
 *     prefers-reduced-motion).
 *
 * The `capture="environment"` and plain file inputs stay mounted at all times
 * as the fallback when getUserMedia is unavailable; `useSupabaseSession` gates
 * the "Save your result" card and the blurred/inert result lock;
 * `/api/scan/claim` is called the moment both a session and a `run_id` exist.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. No grade is shown: nothing here renders a score, a letter or a verdict.
 * 2. "not graded" is not "graded badly": the notice says no product is graded.
 * 3. A model-prior sentence is never typeset like a measurement. Every block
 *    carries a basis badge; model knowledge is the one dashed, amber badge and
 *    its text says "unverified".
 * 4. TYPED IS NOT READ. A manual entry renders under "What you entered" with
 *    the `user_input` badge; it never shows a read confidence, quoted spans or a
 *    vision model, because none exist. The server says which path ran
 *    (`source`) and the UI keys off that, not off which button was pressed.
 * 5. Sign-in never gates what is computed: the result is held in state
 *    identically whether or not it is currently visible.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { literatureDisclosures } from "@/lib/analyze/literature-disclosures";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";
import { useSupabaseSession } from "@/lib/auth/use-supabase-session";
import type { DemoProduct } from "@/lib/demo/products";

import { DemoLanding, LandingView, LoadingPanel, StagedView } from "./capture-views";
import { MANUAL_STAGES, MAX_BYTES, PHOTO_STAGES, flowReducer, initialFlowState, receivedAction } from "./flow-state";
import { mg, words } from "./format";
import { GradeCard } from "./grade-card";
import { SaveResultCard } from "./google-sign-in";
import {
  CompanySection,
  CompatibilitySection,
  EntryDetails,
  GradingNotice,
  PriorSection,
  SourceLegend,
  TechnicalDetails,
  WarningNotices,
  Warnings,
} from "./report-sections";
import { SearchSheet } from "./search-sheet";
import { SupplementSearch } from "./supplement-search";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

/**
 * `demo` (the /demo route): pick a sample label instead of the camera; the scan
 * replays its recorded analysis after a staged wait. No request, no sign-in.
 */
export function ScanFlow({ catalog, demo }: { catalog: CatalogIngredient[]; demo?: DemoProduct[] }) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const { file, preview, busy, stage, stages, data, error, heroImage } = state;
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const auth = useSupabaseSession();
  const claimedRuns = useRef<Set<string>>(new Set());
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const [demoPick, setDemoPick] = useState<DemoProduct | null>(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => dispatch({ type: "tick" }), demo ? 1300 : 6000);
    return () => clearInterval(id);
  }, [busy, demo]);

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
    if (demo) setDemoPick(null); // an own photo never gets a sample's recorded answer
    if (picked) stageFile(picked);
  }, [stageFile, demo]);

  const clearFile = useCallback(() => dispatch({ type: "clear" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const post = useCallback(async (init: RequestInit) => {
    if (demo) {
      // ponytail: the wait is theatre so the stages read on stage; one tick per stage.
      await new Promise((r) => setTimeout(r, PHOTO_STAGES.length * 1300));
      dispatch(demoPick ? { type: "received", data: { ...demoPick.analysis, analyzed_at: new Date().toISOString() }, error: null } : { type: "failed", error: "Pick a sample label first." });
      dispatch({ type: "done" });
      return;
    }
    try {
      const res = await fetch("/api/scan", { method: "POST", ...init });
      const json = (await res.json()) as ScanAnalysis & { error?: string };
      dispatch(receivedAction(json, res.ok, res.status));
    } catch (err) {
      dispatch({ type: "failed", error: `Could not reach the analyzer: ${String(err)}` });
    } finally {
      dispatch({ type: "done" });
    }
  }, [demo, demoPick]);

  const pickDemo = useCallback(async (p: DemoProduct) => {
    const blob = await (await fetch(p.image)).blob();
    setDemoPick(p);
    stageFile(new File([blob], `${p.id}.jpg`, { type: blob.type || "image/jpeg" }));
  }, [stageFile]);

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
  const prior = data?.evidence_prior;
  const compat = data?.compatibility;
  const company = data?.company;

  // Sign-in gate. `locked` only ever becomes true once we know for sure
  // sign-in is configured AND we have finished checking for an existing
  // session AND there is none -- never during the brief `loading` window,
  // so a returning signed-in visitor never sees a flash of the lock.
  const locked = !demo && auth.configured && !auth.loading && !auth.email;
  const showSaveCard = locked;

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
  const warningCount = (data?.caveats?.length ?? 0) + disclosures.length + (mlm ? 1 : 0);
  const warnings = <WarningNotices caveats={data?.caveats} disclosures={disclosures} mlm={mlm} brand={company?.brand} />;

  // The header shows only what is printed or typed; converted doses stay in Label details.
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const perDay = (n: number | null | undefined) => (n ? [`${n} serving${n === 1 ? "" : "s"} a day`] : []);
  const chips: string[] = typed && entry
    ? [entry.form_label, ...(entry.dose_per_serving ? [`${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} per serving`] : []), ...perDay(entry.servings_per_day)]
    : label
      ? [...(label.form_vocab_id ? [cap(words(label.form_vocab_id))] : []), ...(label.compound_dose_mg !== null ? [`${mg(label.compound_dose_mg)} per serving`] : []), ...perDay(label.servings_per_day)]
      : [];
  const brand = typed ? null : label?.brand ?? company?.brand ?? null;

  return (
    <section className="la scan sc" aria-label="Scan a supplement">
      {/* Two inputs, one difference: `capture` hands off to the platform
          camera. Kept mounted at all times -- this is the fallback path
          that must remain when getUserMedia is unavailable/denied/an
          insecure context, so nothing regresses. */}
      <input type="file" accept="image/*" capture="environment" className="la-input" id="scan-capture" aria-label="Photograph the label with the camera" disabled={busy} onChange={(e) => pick(e.target.files)} />
      <input type="file" accept={ACCEPTED_TYPES} className="la-input" id="scan-file" aria-label="Choose an image of the label" disabled={busy} onChange={(e) => pick(e.target.files)} />

      {!showingResult ? (
        <>
          <div className="sc-topbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-lockup" src="/bsproof-lockup.svg" alt="BS-PROOF" width={130} height={26} />
            {demo ? <span className="sc-demo-tag">Demo</span> : null}
          </div>
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
            ) : demo ? (
              <DemoLanding products={demo} onPick={(p) => void pickDemo(p)} />
            ) : (
              <LandingView active={!file} disabled={busy} cameraUnavailable={cameraUnavailable} onCapture={stageFile} onUnavailable={() => setCameraUnavailable(true)} onSearch={() => setSearchOpen(true)} />
            )}
          </div>
          {!busy && !staged && !demo ? <GradingNotice /> : null}
        </>
      ) : null}

      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} titleId="scan-search-title" title="Search your supplement">
        <p className="sc-search-lede">
          Pick the ingredient and its exact form, add the dose if you know it — the result is marked as typed, not read from a
          label.
        </p>
        <SupplementSearch catalog={catalog} busy={busy} onSubmit={(input) => void submitManual(input)} />
      </SearchSheet>

      {showingResult ? (
        <div className="rs">
          <div className="rs-bar sc-scanned" ref={resultTopRef} tabIndex={-1}>
            <button type="button" className="rs-back sc-again" aria-label="Scan another" onClick={reset}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-lockup" src="/bsproof-lockup.svg" alt="BS-PROOF" width={110} height={22} />
          </div>

          <header className="rs-product">
            {preview && !typed && heroImage !== "error" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="rs-photo" src={preview} alt="The label you scanned" onLoad={(event) => dispatch({ type: "hero", value: event.currentTarget.naturalWidth > 0 ? "loaded" : "error" })} onError={() => dispatch({ type: "hero", value: "error" })} />
            ) : (
              <span className="rs-photo rs-photo-empty" aria-hidden="true">{error ? "!" : "Aa"}</span>
            )}
            <div className="rs-id">
              <p className="rs-kicker">{headerKicker}</p>
              <h2 className="rs-name">{headerName}</h2>
              {brand ? <p className="rs-brand">{brand}</p> : null}
              {labResult && chips.length ? <ul className="rs-chips">{chips.map((c) => <li key={c}>{c}</li>)}</ul> : null}
            </div>
          </header>

          {error ? (
            <div className="la-alert la-alert-bad sc-error" role="alert">
              <strong>Could not scan that.</strong>
              <span>{error}</span>
            </div>
          ) : null}

          {labResult && data && legend ? (
            <>
              {locked ? <SaveResultCard /> : null}

              {/* The result is ALWAYS computed and held in state; when sign-in
                  is required and not yet present it is only blurred and made
                  inert, never re-fetched once a session appears. */}
              <div className={`la-result scan-result rs-body${locked ? " sc-locked" : ""}`} aria-hidden={locked} inert={locked}>
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

                {demoPick?.grades.length ? (
                  <GradeCard grades={demoPick.grades} context={demoPick.context} illustrative />
                ) : data.status !== "analyzer_unavailable" && data.status !== "not_a_supplement_label" ? <GradingNotice /> : null}

                {warningCount > 0 ? <Warnings count={warningCount}>{warnings}</Warnings> : null}

                <div className="rs-more">
                  <p className="rs-more-title">Behind the grade</p>
                  <EntryDetails typed={typed} entry={entry} label={label} product={product} legend={legend} summaryParts={summaryParts} />
                  {prior ? <PriorSection prior={prior} legend={legend} /> : null}
                  {compat ? <CompatibilitySection compat={compat} legend={legend} typed={typed} /> : null}
                  {company ? <CompanySection company={company} legend={legend} typed={typed} mlm={mlm} /> : null}
                  <SourceLegend legend={legend} />
                  <TechnicalDetails data={data} typed={typed} />
                </div>
              </div>
            </>
          ) : null}

          <button type="button" className="button button-dark sc-primary rs-again" onClick={reset}>
            Scan another
          </button>
        </div>
      ) : null}
    </section>
  );
}
