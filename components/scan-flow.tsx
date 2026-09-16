"use client";

/*
 * THE SCAN. Photograph a label -- or, since 2026-09-15, search for the
 * supplement by name -- and get the product's full analysis: the evidence
 * verdicts with their four arcs, dose effectiveness, form and ingredient
 * compatibility, and the company's background -- every block stamped with the
 * BASIS it rests on.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. INVARIANT 8: no branch renders a composite without its arcs. A gated row is
 *    an em dash with its arcs still drawn, never a zero.
 * 2. "not scored" is not "scores badly": an unscored product renders a distinct
 *    non-numeric state.
 * 3. A model-prior sentence is never typeset like a measurement. Every block
 *    carries a basis badge; model knowledge is dashed and says "unverified".
 * 4. The validity banner is not decoration: every retained run withholds public
 *    claims and the UI has to say so.
 * 5. TYPED IS NOT READ. A manual entry renders under "What you entered" with
 *    the `user_input` badge; it never shows a read confidence, quoted spans or a
 *    vision model, because none exist. The server says which path ran
 *    (`source`) and the UI keys off that, not off which button was pressed.
 *
 * CAMERA. "Take a photo" is a plain <input type="file" capture="environment">.
 * Production sends `Permissions-Policy: camera=()`, which blocks
 * navigator.mediaDevices.getUserMedia outright, so an in-page viewfinder can
 * never open there; the capture attribute hands off to the platform camera
 * instead and needs no permission policy. "Upload an image" is the same input
 * without `capture`, for a photo already on the device or a desktop file.
 */

import { useCallback, useEffect, useState } from "react";

import { SupplementSearch } from "@/components/supplement-search";
import { businessModelDisclosure } from "@/lib/analyze/business-model";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import type { ManualScanInput, ScanAnalysis } from "@/lib/analyze/scan";

type Basis = keyof ScanAnalysis["basis_legend"];
type NullableNumber = number | null;

const MAX_BYTES = 12 * 1024 * 1024;

const PHOTO_STAGES = [
  "Reading the label…",
  "Converting the printed dose to its active moiety…",
  "Matching against retained evidence runs…",
  "Checking the FDA enforcement registry…",
  "Asking the model about the company and the combination…",
];

const MANUAL_STAGES = [
  "Converting the dose you entered to its active moiety…",
  "Matching against retained evidence runs…",
  "Asking the model what the literature says…",
];

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";

function pct(value: NullableNumber): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function signed(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
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
  eyebrow,
  title,
  basis,
  legend,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  basis: Basis[];
  legend: ScanAnalysis["basis_legend"];
  children: React.ReactNode;
}) {
  return (
    <section className="scan-section" id={`scan-${id}`} aria-labelledby={`scan-${id}-title`}>
      <header className="scan-section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 id={`scan-${id}-title`}>{title}</h3>
        </div>
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

/* One arc: its verdict AND the coverage behind it, never one without the other. */
function Arc({ label, value, coverage, note }: { label: string; value: string; coverage: NullableNumber; note?: string | null }) {
  const fill = coverage === null || coverage === undefined ? 0 : Math.max(0, Math.min(1, coverage));
  return (
    <div className="la-arc">
      <div className="la-arc-head">
        <span className="la-arc-label">{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="la-arc-track" role="img" aria-label={`${label}: ${value}, coverage ${pct(coverage)}`}>
        <span className="la-arc-fill" style={{ width: `${fill * 100}%` }} />
      </div>
      <span className="la-arc-foot">
        {coverage === null || coverage === undefined ? "no coverage recorded" : `${pct(coverage)} of the evidence`}
        {note ? ` · ${note}` : ""}
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
  const tone = row.composite === null ? "gated" : row.composite >= 55 ? "positive" : row.composite < 45 ? "negative" : "neutral";
  return (
    <article className={`scan-card scan-evidence scan-tone-${tone}`}>
      <header className="la-row-head">
        <div>
          <h4>{row.outcome_label ?? row.outcome.replace(/_/g, " ")}</h4>
          <p className="la-verdict">{row.verdict ?? "no verdict"}</p>
        </div>
        <div className="la-score">
          <strong>{row.composite === null ? "—" : row.composite}</strong>
          <span>/ 100</span>
        </div>
      </header>
      <div className="la-arcs">
        <Arc label="Does it work?" value={signed(row.arcs.effect?.verdict)} coverage={row.arcs.effect?.coverage} />
        <Arc
          label="In your form?"
          value={row.arcs.form?.strength == null ? "—" : row.arcs.form.strength.toFixed(2)}
          coverage={row.arcs.form?.coverage}
          note={row.arcs.form?.basis ?? null}
        />
        <Arc
          label="At your dose?"
          value={row.arcs.dose?.closeness == null ? "not assessable" : row.arcs.dose.closeness.toFixed(2)}
          coverage={row.arcs.dose?.coverage}
          note={row.arcs.dose?.product_match ?? null}
        />
        <Arc label="How much is known?" value={pct(row.arcs.evidence?.coverage)} coverage={row.arcs.evidence?.coverage} />
      </div>
      <footer className="la-row-foot">
        <span>
          <strong>{row.n_primaries ?? 0}</strong> trial{row.n_primaries === 1 ? "" : "s"}
        </span>
        {row.applicability != null ? <span>applies to your product at {pct(row.applicability)}</span> : null}
      </footer>
    </article>
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
  return (
    <div className={`scan-dose scan-dose-${reading.tone}`}>
      <div className="scan-dose-head">
        <strong>{reading.outcome_label ?? reading.outcome.replace(/_/g, " ")}</strong>
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
      <p className="scan-reading">{reading.reading}</p>
    </div>
  );
}

function severityLabel(kind: string, severity: string): string {
  const k = kind.replace(/_/g, " ");
  return severity === "high" ? `${k} · high` : severity === "moderate" ? `${k} · moderate` : k;
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

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy, stages.length]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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

  return (
    <section className="la scan sc" aria-label="Scan a supplement">
      <div
        className={`sc-capture${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
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
        {/* Two inputs, one difference: `capture` hands off to the platform camera. */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="la-input"
          id="scan-capture"
          disabled={busy}
          onChange={(e) => pick(e.target.files)}
        />
        <input type="file" accept={ACCEPTED_TYPES} className="la-input" id="scan-file" disabled={busy} onChange={(e) => pick(e.target.files)} />

        {file && preview ? (
          <div className="sc-staged">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="la-preview sc-preview" src={preview} alt="The label you staged for analysis" />
            <button type="button" className="button button-dark sc-primary la-analyze" onClick={() => void submitPhoto()} disabled={busy}>
              {busy ? "Scanning…" : "Scan this label"}
            </button>
            <div className="sc-secondary-row">
              <label className={`button button-outline sc-secondary${busy ? " is-disabled" : ""}`} htmlFor="scan-capture">
                Retake photo
              </label>
              <label className={`button button-outline sc-secondary${busy ? " is-disabled" : ""}`} htmlFor="scan-file">
                Choose a different image
              </label>
            </div>
            <span className="sc-hint">
              {file.name} · {(file.size / 1e6).toFixed(1)} MB — nothing is sent until you press Scan
            </span>
          </div>
        ) : (
          <div className="sc-actions">
            <label className={`button button-dark sc-primary${busy ? " is-disabled" : ""}`} htmlFor="scan-capture">
              Take a photo
            </label>
            <label className={`button button-outline sc-secondary${busy ? " is-disabled" : ""}`} htmlFor="scan-file">
              Upload an image
            </label>
            <span className="sc-hint">Supplement Facts panel · PNG, JPEG, WebP · up to 12 MB</span>
          </div>
        )}

        <div className="sc-or" role="separator" aria-label="or">
          <span>or</span>
        </div>

        <button
          type="button"
          className="sc-search-toggle"
          aria-expanded={searchOpen}
          aria-controls="scan-search"
          disabled={busy}
          onClick={() => setSearchOpen((v) => !v)}
        >
          <span>Search for your supplement</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" className="sc-chevron">
            <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div id="scan-search" className="sc-search-panel" hidden={!searchOpen}>
          <p className="sc-search-lede">
            No photo? Pick the ingredient and its exact form from the catalog, add the dose if you know it. The result is
            marked as typed — nothing verifies that a product contains what you enter.
          </p>
          <SupplementSearch catalog={catalog} busy={busy} onSubmit={(input) => void submitManual(input)} />
        </div>

        {busy ? (
          <p className="la-stage sc-stage" role="status" aria-live="polite">
            {stages[stage]}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="la-alert la-alert-bad" role="alert">
          <strong>Could not scan that.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {data && !error && legend ? (
        <div className="la-result scan-result">
          {/* The page's h1 is the headline; sections below are h3, so name the result level in between. */}
          <h2 className="sr-only">Result</h2>
          {data.status === "analyzer_unavailable" ? (
            <div className="la-empty">
              <strong>Scanning is not configured on this deployment.</strong>
              <span>The server needs a model API key (DEEPSEEK_API_KEY) to read a photo. Searching for a supplement by name still works.</span>
            </div>
          ) : null}

          {typed && entry ? (
            <div className="scan-identity sc-entered">
              <div className="scan-identity-main">
                <p className="eyebrow">What you entered</p>
                <h3>
                  {entry.ingredient_label}
                  <span className="scan-brand"> · {entry.form_label}</span>
                </h3>
                <div className="scan-chips">
                  <span className="scan-chip">{entry.ingredient_label}</span>
                  <span className="scan-chip">{entry.form_label}</span>
                  <span className="scan-chip">
                    {entry.dose_per_serving
                      ? `${entry.dose_per_serving.value} ${entry.dose_per_serving.unit} compound / serving`
                      : "no dose entered"}
                  </span>
                  {product ? (
                    <span className="scan-chip">
                      {product.elemental_dose_mg.low === null ? `active moiety not convertible (${product.elemental_dose_mg.basis})` : `${mg(product.elemental_dose_mg.low)} active moiety`}
                    </span>
                  ) : null}
                  {entry.servings_per_day !== null ? <span className="scan-chip">{entry.servings_per_day} serving(s)/day</span> : null}
                  <BasisBadge kind="user_input" legend={legend} />
                </div>
                <p className="la-dim sc-typed-note">Typed, not read from a label. There is no vision read behind this entry, so nothing in it is label-verified.</p>
              </div>
              {data.meta ? (
                <dl className="scan-meta">
                  <div>
                    <dt>Took</dt>
                    <dd>{data.meta.timing_s}s</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>typed</dd>
                  </div>
                  <div>
                    <dt>Text model</dt>
                    <dd>{data.meta.models.text ?? "—"}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : label ? (
            <div className="scan-identity">
              <div className="scan-identity-main">
                <p className="eyebrow">What the label says</p>
                <h3>
                  {label.product_name ?? label.ingredient_label_text ?? label.ingredient_vocab_id ?? "Unnamed product"}
                  {label.brand ? <span className="scan-brand"> by {label.brand}</span> : null}
                </h3>
                <div className="scan-chips">
                  <span className="scan-chip">{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "ingredient —"}</span>
                  <span className="scan-chip">{label.form_vocab_id ? label.form_vocab_id.replace(/_/g, " ") : "form not stated"}</span>
                  <span className="scan-chip">{mg(label.compound_dose_mg)} compound / serving</span>
                  {product ? (
                    <span className="scan-chip">
                      {product.elemental_dose_mg.low === null ? `active moiety not convertible (${product.elemental_dose_mg.basis})` : `${mg(product.elemental_dose_mg.low)} active moiety`}
                    </span>
                  ) : null}
                  {label.servings_per_day !== null ? <span className="scan-chip">{label.servings_per_day} serving(s)/day</span> : null}
                  <span className="scan-chip">read confidence: {label.confidence}</span>
                  <BasisBadge kind="label" legend={legend} />
                </div>
                {label.evidence_spans?.length ? (
                  <p className="la-spans">Read from: {label.evidence_spans.map((s) => `“${s}”`).join(", ")}</p>
                ) : null}
              </div>
              {data.meta ? (
                <dl className="scan-meta">
                  <div>
                    <dt>Took</dt>
                    <dd>{data.meta.timing_s}s</dd>
                  </div>
                  <div>
                    <dt>Vision model</dt>
                    <dd>{data.meta.models.vision ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Text model</dt>
                    <dd>{data.meta.models.text ?? "—"}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}

          {data.caveats?.map((c) => (
            <div className="la-alert la-alert-warn" key={c.code}>
              <strong>{c.code.replace(/_/g, " ")}</strong>
              <span>{c.text}</span>
            </div>
          ))}

          {data.status === "not_a_supplement_label" ? (
            <div className="la-empty">
              <strong>That does not look like a supplement label.</strong>
              <span>Upload the Supplement Facts panel so the ingredient and dose can be read.</span>
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

          {/* ---------------- evidence ---------------- */}
          {product ? (
            <Section id="evidence" eyebrow="Evidence" title="Does it work?" basis={["evidence_run"]} legend={legend}>
              {evidence?.validity ? (
                <div className={`la-alert ${evidence.validity.public_claims_allowed ? "la-alert-ok" : "la-alert-warn"}`}>
                  <strong>
                    {evidence.validity.public_claims_allowed ? "Validated run." : `Not a product claim — this run is marked ${evidence.validity.status ?? "unvalidated"}.`}
                  </strong>
                  <span>{evidence.validity.note ?? "Retained for inspection. The scoring constants have not passed anchor calibration."}</span>
                </div>
              ) : null}
              {rows.length ? (
                <div className="scan-grid">
                  {rows.map((row) => (
                    <EvidenceCard key={row.outcome} row={row} />
                  ))}
                </div>
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
              {evidence?.run ? (
                <details className="la-details">
                  <summary>How these numbers were produced</summary>
                  <p>
                    Effect, form and evidence arcs come from the retained run below. The dose term was recomputed for the dose
                    on your label, and a positive verdict is discounted by how much of the evidence applies to your form and dose.
                  </p>
                  <dl className="la-read-grid">
                    {Object.entries(evidence.run).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k.replace(/_/g, " ")}</dt>
                        <dd>{v === null || v === undefined ? "—" : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
            </Section>
          ) : null}

          {/* -------- evidence orientation (only when no run exists) -------- */}
          {prior ? (
            <Section
              id="prior"
              eyebrow="Evidence orientation"
              title="What the literature says"
              basis={["model_prior"]}
              legend={legend}
            >
              <p className="scan-disclaimer">{prior.disclaimer}</p>
              {prior.status === "ok" && prior.data ? (
                <>
                  <p className="scan-note">{prior.data.summary}</p>
                  {prior.data.evidence_landscape ? (
                    <p className="la-dim">
                      Systematic reviews: {prior.data.evidence_landscape.syntheses_exist}
                      {prior.data.evidence_landscape.note ? ` · ${prior.data.evidence_landscape.note}` : ""}
                    </p>
                  ) : null}

                  {prior.data.outcomes.length ? (
                    <ul className="scan-list">
                      {prior.data.outcomes.map((o, i) => (
                        <li key={`${o.outcome}-${i}`} className="scan-item scan-item-model_prior scan-prior">
                          <div className="scan-item-head">
                            <strong>{o.outcome}</strong>
                            <span className={`scan-dirchip scan-dir-${o.direction}`}>{o.direction.replace(/_/g, " ")}</span>
                            <span className={`scan-strength scan-strength-${o.evidence_strength}`}>
                              {o.evidence_strength} evidence
                            </span>
                          </div>
                          {o.note ? <p>{o.note}</p> : null}
                          {o.pooled_effect_recalled ? (
                            <p className="la-dim">Pooled estimate recalled: {o.pooled_effect_recalled}</p>
                          ) : null}
                          {o.population ? <p className="la-dim">Population: {o.population}</p> : null}
                          {o.dose_reading ? (
                            <p className={o.dose_closeness != null && o.dose_closeness >= 0.999 ? "scan-dose-hit" : "scan-dose-miss"}>
                              {o.dose_reading}
                            </p>
                          ) : null}
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
                        <span className="scan-strength">{prior.data.form_assessment.verdict.replace(/_/g, " ")}</span>
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
            <Section id="dose" eyebrow="Dose" title="Is your dose the dose that worked?" basis={["evidence_run", factsBasis]} legend={legend}>
              <p className="scan-note">{dose.note}</p>
              {dose.outcomes.length ? (
                <div className="scan-doses">
                  {dose.outcomes.map((o) => (
                    <DoseBar key={o.outcome} reading={o} dose={dose.scored_dose_mg} />
                  ))}
                  <div className="scan-dose-key" aria-hidden="true">
                    <span>
                      <i className="scan-key scan-key-benefit" /> range where trials found benefit
                    </span>
                    <span>
                      <i className="scan-key scan-key-null" /> range where trials found nothing
                    </span>
                    <span>
                      <i className="scan-key scan-key-marker" /> your dose
                    </span>
                  </div>
                </div>
              ) : (
                <p className="la-dim">No scored outcome, so there is no dose range to compare against.</p>
              )}
            </Section>
          ) : null}

          {/* ---------------- compatibility ---------------- */}
          {compat ? (
            <Section id="form" eyebrow="Form & combination" title="Does the form and the mix hold up?" basis={compat.basis_used} legend={legend}>
              <div className="scan-card scan-formfit">
                <strong>
                  {compat.evidence_form_fit.status === "exact_form_scored"
                    ? "Your form is the form the evidence run scored."
                    : compat.evidence_form_fit.status === "form_not_scored"
                      ? "Your form has not been run; evidence about another form is not evidence about yours."
                      : compat.evidence_form_fit.status === "ingredient_not_scored"
                        ? "No evidence run exists for this ingredient yet."
                        : "Form fit unknown."}
                </strong>
                <span className="la-dim">
                  {compat.evidence_form_fit.form_strength != null
                    ? `Form evidence strength ${compat.evidence_form_fit.form_strength.toFixed(2)} (${compat.evidence_form_fit.form_basis ?? "ladder"}).`
                    : compat.evidence_form_fit.scored_forms.length
                      ? `Forms run so far: ${compat.evidence_form_fit.scored_forms.join(", ")}.`
                      : ""}
                </span>
              </div>

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
                <span className="la-arc-label">{typed ? "Actives entered" : "Actives read"}</span>
                <div className="scan-chips">
                  {compat.actives.map((a) => (
                    <span key={a.printed} className="scan-chip">
                      {a.printed}
                      {a.compound_dose_mg !== null ? ` · ${mg(a.compound_dose_mg)}` : ""}
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
                        <span className="scan-sev">{severityLabel(x.kind, x.severity)}</span>
                        <BasisBadge kind={x.basis} legend={legend} />
                      </div>
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
            <Section id="company" eyebrow="Company" title="Who makes it, and what is on record?" basis={company.basis_used.length ? company.basis_used : ["label"]} legend={legend}>
              {company.status === "no_brand_on_label" ? (
                <p className="la-dim">
                  {typed
                    ? "The search path takes an ingredient, a form and a dose — no brand — so there is no company to look up."
                    : "No brand or manufacturer is printed on this panel, so there is nothing to look up."}
                </p>
              ) : (
                <>
                  <div className="scan-company-grid">
                    <div className="scan-card">
                      <div className="scan-item-head">
                        <strong>Printed on the label</strong>
                        <BasisBadge kind="label" legend={legend} />
                      </div>
                      <dl className="la-read-grid">
                        <div>
                          <dt>Brand</dt>
                          <dd>{company.brand ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Manufacturer</dt>
                          <dd>{company.manufacturer ?? "not printed"}</dd>
                        </div>
                        <div>
                          <dt>Country</dt>
                          <dd>{company.country_of_origin ?? "not printed"}</dd>
                        </div>
                      </dl>
                      {company.certifications_printed.length ? (
                        <div className="scan-chips">
                          {company.certifications_printed.map((c) => (
                            <span key={c.text} className="scan-chip scan-chip-claim" title={c.note}>
                              {c.text}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="la-dim">No third-party seal printed.</span>
                      )}
                      {company.certifications_printed.length ? (
                        <span className="la-dim">Seals are claims as printed; a certifier&rsquo;s registry confirms them, this page does not.</span>
                      ) : null}
                    </div>

                    <div className="scan-card">
                      <div className="scan-item-head">
                        <strong>FDA enforcement reports</strong>
                        <BasisBadge kind="registry" legend={legend} />
                      </div>
                      {company.registry.status === "ok" ? (
                        <ul className="scan-recalls">
                          {company.registry.recalls.map((r, i) => (
                            <li key={r.recall_number ?? i}>
                              <strong>
                                {r.initiated ?? "date —"} · {r.classification ?? "class —"} · {r.status ?? ""}
                              </strong>
                              <span>{r.product}</span>
                              <span className="la-dim">{r.reason}</span>
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
                      <span className="la-dim">{company.registry.note}</span>
                    </div>
                  </div>

                  <div className="scan-item scan-item-model_prior">
                    <div className="scan-item-head">
                      <strong>Company profile</strong>
                      <BasisBadge kind="model_prior" legend={legend} />
                    </div>
                    {company.profile.status === "ok" && company.profile.data ? (
                      <div className="scan-profile">
                        <p>{company.profile.data.summary}</p>
                        {(() => {
                          const disclosure = businessModelDisclosure(company.profile.data?.business_model);
                          // SAME warning visual language as every other disclosure on this
                          // page (`.la-alert.la-alert-warn` — the caveats above and the
                          // validity banner in the evidence section): a yellow/gold left
                          // border, never a new colour invented for this one field.
                          // Shown ONLY for confirmed/suspected; otherwise nothing.
                          if (!disclosure) return null;
                          return (
                            <div className="la-alert la-alert-warn" role="note" aria-label="Business model disclosure">
                              <strong>{disclosure.title}</strong>
                              <span>{disclosure.body}</span>
                            </div>
                          );
                        })()}
                        {company.profile.data.known ? (
                          <dl className="la-read-grid">
                            <div>
                              <dt>Founded</dt>
                              <dd>{company.profile.data.founded_year ?? "unknown"}</dd>
                            </div>
                            <div>
                              <dt>Headquarters</dt>
                              <dd>{company.profile.data.headquarters_country ?? "unknown"}</dd>
                            </div>
                            <div>
                              <dt>Ownership</dt>
                              <dd>
                                {company.profile.data.ownership_type}
                                {company.profile.data.parent_company ? ` (${company.profile.data.parent_company})` : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>Third-party testing</dt>
                              <dd>
                                {company.profile.data.third_party_testing.status}
                                {company.profile.data.third_party_testing.program ? ` · ${company.profile.data.third_party_testing.program}` : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>Batch certificates public</dt>
                              <dd>{company.profile.data.transparency.coa_published}</dd>
                            </div>
                            <div>
                              <dt>Profile confidence</dt>
                              <dd>{company.profile.data.confidence}</dd>
                            </div>
                          </dl>
                        ) : null}
                        {company.profile.data.regulatory_history.length ? (
                          <ul className="scan-list scan-reg">
                            {company.profile.data.regulatory_history.map((h, i) => (
                              <li key={i}>
                                <strong>
                                  {h.kind.replace(/_/g, " ")}
                                  {h.year ? ` · ${h.year}` : ""}
                                </strong>
                                <span>{h.summary}</span>
                                <span className="la-dim">
                                  model confidence {h.confidence}
                                  {h.kind === "recall"
                                    ? h.registry_corroborated === true
                                      ? " · a recall is on file in openFDA"
                                      : h.registry_corroborated === false
                                        ? " · NOT corroborated by openFDA under this firm name"
                                        : ""
                                    : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : company.profile.data.known ? (
                          <p className="la-dim">No widely reported regulatory action recalled by the model.</p>
                        ) : null}
                        {company.profile.data.reputation_notes.length ? (
                          <ul className="scan-plain">
                            {company.profile.data.reputation_notes.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                        ) : null}
                        {company.profile.data.caveats.length ? <p className="la-dim">Could not confirm: {company.profile.data.caveats.join("; ")}</p> : null}
                      </div>
                    ) : (
                      <p className="la-dim">Profile unavailable: {company.profile.reason ?? "skipped"}</p>
                    )}
                  </div>
                </>
              )}
            </Section>
          ) : null}

          {/* ---------------- legend ---------------- */}
          <section className="scan-legend" aria-labelledby="scan-legend-title">
            <h3 id="scan-legend-title">How to read the badges</h3>
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
          </section>
        </div>
      ) : null}
    </section>
  );
}
