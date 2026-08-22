"use client";

/*
 * The app's front door: upload a supplement label, get that product's rows.
 *
 * TWO RULES THIS COMPONENT EXISTS TO KEEP, both from CLAUDE.md:
 *
 * 1. INVARIANT 8 -- "the centre number never travels without its arcs". There is
 *    no branch here that renders a composite alone. `ScoreRow` always draws the
 *    four arcs, and a row with no composite renders as an em dash with its arcs
 *    still shown, never as 0.
 *
 * 2. "not scored" IS NOT "scores badly". A product we have never run renders in
 *    a visually distinct, non-numeric state that names the ingredient and says
 *    no run exists. The evidence arc is what separates "well studied and weak"
 *    from "barely studied", so a low number always ships with its coverage.
 *
 * Every retained run is currently `public_claims_allowed: false`, so the
 * validity banner is not optional decoration -- omitting it would publish a
 * claim the run registry explicitly withheld.
 */

import { useCallback, useEffect, useState } from "react";

type NullableNumber = number | null;

interface AnalyzerArc {
  verdict: NullableNumber;
  coverage: NullableNumber;
  strength?: NullableNumber;
  closeness?: NullableNumber;
  basis?: string | null;
  product_match?: string | null;
  is_quantity?: boolean;
}

interface AnalyzerRow {
  outcome: string;
  outcome_label: string | null;
  composite: NullableNumber;
  verdict: string | null;
  n_primaries: NullableNumber;
  arcs: Record<"effect" | "form" | "dose" | "evidence", AnalyzerArc>;
  benefit_dose_range_mg: { low: NullableNumber; high: NullableNumber; basis?: string | null } | null;
  null_dose_range_mg: { low: NullableNumber; high: NullableNumber } | null;
  run_composite: NullableNumber;
}

interface AnalyzerResponse {
  status: string;
  error?: string;
  timing_s?: number;
  ingredient_label_text?: string | null;
  supported_ingredients?: string[];
  label?: {
    ingredient_vocab_id: string | null;
    ingredient_label_text: string | null;
    form_vocab_id: string | null;
    compound_dose_mg: NullableNumber;
    confidence: string;
    is_multi_ingredient: boolean;
    other_actives: string[];
    brand: string | null;
    unreadable_reason: string | null;
    evidence_spans: string[];
  };
  product?: {
    ingredient: string;
    form: string | null;
    compound_dose_mg: NullableNumber;
    elemental_dose_mg: { low: NullableNumber; high: NullableNumber; basis: string };
  };
  result?: {
    status: string;
    rows?: AnalyzerRow[];
    scored_forms?: string[];
    refused?: Array<{ outcome: string; reason: string }>;
    population?: Record<string, unknown> | null;
    run?: Record<string, unknown> | null;
    validity?: {
      status: string | null;
      public_claims_allowed: boolean;
      limitations: string[];
      note: string | null;
    };
  };
  census?: {
    available: boolean;
    rcts_indexed?: number;
    syntheses_indexed?: number;
    means?: string;
    reason?: string;
  };
  queue?: { queued: boolean; note?: string };
  caveats?: Array<{ code: string; text: string; other_actives?: string[] }>;
}

const MAX_BYTES = 12 * 1024 * 1024;

/* The read takes ~20-30 s (measured: 17.7 s model call plus conversion and
 * lookup). A spinner alone reads as "hung" at that length, so the stages are
 * narrated. They are honest about what is happening, including the last one --
 * nothing here runs the pipeline. */
const STAGES = [
  "Reading the label…",
  "Mapping to the ingredient vocabulary…",
  "Converting the printed dose to its active moiety…",
  "Matching against retained runs…",
];

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

/* One arc: its verdict AND the coverage behind it, never one without the other. */
function Arc({
  label,
  value,
  coverage,
  note,
}: {
  label: string;
  value: string;
  coverage: NullableNumber;
  note?: string | null;
}) {
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

function ScoreRow({ row }: { row: AnalyzerRow }) {
  const { arcs } = row;
  const band = row.benefit_dose_range_mg;
  const closeness = arcs.dose?.closeness ?? null;
  return (
    <article className="la-row">
      <header className="la-row-head">
        <div>
          <h3>{row.outcome_label ?? row.outcome}</h3>
          <p className="la-verdict">{row.verdict ?? "no verdict"}</p>
        </div>
        <div className="la-score">
          {/* An em dash, never a zero: a gated row has no number, and 0 would
              read as "actively harmful on strong evidence". */}
          <strong>{row.composite === null ? "—" : row.composite}</strong>
          <span>/ 100</span>
        </div>
      </header>

      <div className="la-arcs">
        <Arc label="Does it work?" value={signed(arcs.effect?.verdict)} coverage={arcs.effect?.coverage} />
        <Arc
          label="In your form?"
          value={arcs.form?.strength === null || arcs.form?.strength === undefined ? "—" : arcs.form.strength.toFixed(2)}
          coverage={arcs.form?.coverage}
          note={arcs.form?.basis ?? null}
        />
        <Arc
          label="At your dose?"
          value={closeness === null ? "not assessable" : closeness.toFixed(2)}
          coverage={arcs.dose?.coverage}
          note={arcs.dose?.product_match ?? null}
        />
        <Arc label="How much is known?" value={pct(arcs.evidence?.coverage)} coverage={arcs.evidence?.coverage} />
      </div>

      <footer className="la-row-foot">
        <span>
          <strong>{row.n_primaries ?? 0}</strong> trial{row.n_primaries === 1 ? "" : "s"}
        </span>
        {band && band.low !== null ? (
          <span>
            benefit seen at {mg(band.low)}&ndash;{mg(band.high)}
          </span>
        ) : (
          <span>no benefit trial carried a usable dose</span>
        )}
        {row.null_dose_range_mg && row.null_dose_range_mg.low !== null ? (
          <span>
            found nothing at {mg(row.null_dose_range_mg.low)}&ndash;{mg(row.null_dose_range_mg.high)}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export function LabelAnalyzer() {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [data, setData] = useState<AnalyzerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Advances the narrated stage while a read is in flight. The reset to stage 0
  // happens in `submit`, where the request actually starts -- doing it here
  // instead would be a synchronous setState inside an effect, which cascades a
  // render (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const submit = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1e6).toFixed(1)} MB. The limit is 12 MB.`);
      return;
    }
    setError(null);
    setData(null);
    setStage(0);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/analyze-label", { method: "POST", body });
      const json = (await res.json()) as AnalyzerResponse;
      // `analyzer_unavailable` is not a failure of the upload -- it means this
      // host cannot read labels at all (no Python / no Claude CLI, e.g. the
      // Vercel preview). It gets its own state so it never reads as "your photo
      // was bad".
      if (json.status === "analyzer_unavailable") {
        setData(json);
      } else if (!res.ok && !json.status) {
        setError(json.error ?? `Request failed (${res.status}).`);
      } else {
        setData(json);
        if (
          json.status === "label_unreadable" ||
          json.status === "analyzer_failed" ||
          json.status === "timeout" ||
          json.status === "bad_request"
        ) {
          setError(json.error ?? "The label could not be read.");
        }
      }
    } catch (err) {
      setError(`Could not reach the analyzer: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onPick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void submit(file);
  };

  const rows = data?.result?.rows ?? [];
  const validity = data?.result?.validity;
  const label = data?.label;
  const product = data?.product;

  return (
    <section className="la" aria-labelledby="la-title">
      <div className="la-intro">
        <p className="eyebrow">Score a product</p>
        <h2 id="la-title">Photograph the label.</h2>
        <p className="la-lede">
          Upload the Supplement Facts panel. The ingredient, form and dose are read off the label, the
          printed dose is converted to its active moiety, and the product is matched against retained
          evidence runs.
        </p>
      </div>

      <div
        className={`la-drop${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) onPick(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="la-input"
          id="la-file"
          disabled={busy}
          onChange={(e) => onPick(e.target.files)}
        />

        {preview ? (
          // `preview` is a blob: URL for a file the user just picked. next/image
          // cannot optimise an object URL -- it would put a loader in front of
          // bytes already in memory -- and the image never leaves the browser.
          // The directive has to be the LAST comment line before the tag or it
          // disables the rule on a comment and the warning returns.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="la-preview" src={preview} alt="The label you uploaded" />
        ) : (
          <div className="la-drop-art" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="3">
              <rect x="10" y="6" width="44" height="52" rx="5" />
              <path d="M18 24h28M18 34h28M18 44h18" strokeLinecap="round" />
            </svg>
          </div>
        )}

        <div className="la-drop-copy">
          <label className="button button-light" htmlFor="la-file">
            {busy ? "Reading…" : preview ? "Try another label" : "Choose a label photo"}
          </label>
          <span>or drag one here · PNG, JPEG, WebP · up to 12 MB</span>
        </div>

        {busy ? (
          <p className="la-stage" role="status" aria-live="polite">
            {STAGES[stage]}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="la-alert la-alert-bad" role="alert">
          <strong>Could not score that.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {data && !error ? (
        <div className="la-result">
          {/* What was actually read. Shown before any number, so a
              misread is visible rather than buried under a score. */}
          {label ? (
            <div className="la-read">
              <h3>What the label says</h3>
              <dl className="la-read-grid">
                <div>
                  <dt>Ingredient</dt>
                  <dd>{label.ingredient_label_text ?? label.ingredient_vocab_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Form</dt>
                  <dd>{label.form_vocab_id ?? "not stated"}</dd>
                </div>
                <div>
                  <dt>Printed dose</dt>
                  <dd>{mg(label.compound_dose_mg)} compound</dd>
                </div>
                <div>
                  <dt>Active moiety</dt>
                  <dd>
                    {product ? (
                      product.elemental_dose_mg.low === null ? (
                        <span className="la-dim">not convertible ({product.elemental_dose_mg.basis})</span>
                      ) : (
                        `${mg(product.elemental_dose_mg.low)} (${product.elemental_dose_mg.basis})`
                      )
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Read confidence</dt>
                  <dd>{label.confidence}</dd>
                </div>
                {data.timing_s ? (
                  <div>
                    <dt>Took</dt>
                    <dd>{data.timing_s}s</dd>
                  </div>
                ) : null}
              </dl>
              {label.evidence_spans?.length ? (
                <p className="la-spans">
                  Read from: {label.evidence_spans.map((s) => `“${s}”`).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {data.caveats?.map((c) => (
            <div className="la-alert la-alert-warn" key={c.code}>
              <strong>{c.code === "multi_ingredient_product" ? "This is a blend." : "Dose axis unavailable."}</strong>
              <span>{c.text}</span>
            </div>
          ))}

          {/* The honest terminal states. */}
          {data.status === "analyzer_unavailable" ? (
            <div className="la-empty">
              <strong>Label reading is not configured on this deployment.</strong>
              <span>
                The vision read needs an API key on the server (GEMINI_API_KEY — free from Google AI
                Studio — or VISION_API_KEY for another provider). The retained runs below are unaffected.
              </span>
            </div>
          ) : null}

          {data.status === "not_a_supplement_label" ? (
            <div className="la-empty">
              <strong>That does not look like a supplement label.</strong>
              <span>Upload the Supplement Facts panel so the ingredient and dose can be read.</span>
            </div>
          ) : null}

          {data.status === "ingredient_not_supported" ? (
            <div className="la-empty">
              <strong>
                {data.ingredient_label_text ?? "That ingredient"} is not in the vocabulary yet.
              </strong>
              <span>
                This is not a low score — it is no data. Nothing has been run for it.
                {data.queue?.queued ? " Your request was recorded." : ""}
              </span>
              {data.supported_ingredients?.length ? (
                <span className="la-dim">Covered so far: {data.supported_ingredients.join(", ")}</span>
              ) : null}
            </div>
          ) : null}

          {data.result?.status === "not_scored" || data.result?.status === "form_not_scored" ? (
            <div className="la-empty">
              <strong>
                {data.result.status === "form_not_scored"
                  ? "That form has not been run."
                  : "No evidence run exists for this ingredient."}
              </strong>
              <span>
                {data.result.status === "form_not_scored" ? (
                  <>
                    Evidence about a different form is not evidence about yours, so no number is shown.
                    {data.result.scored_forms?.length
                      ? ` Run so far: ${data.result.scored_forms.join(", ")}.`
                      : ""}
                  </>
                ) : (
                  <>
                    This is not a low score — it is no data. A score needs the full pipeline: retrieval,
                    full text, and roughly ten model calls per study across ~180 studies.
                  </>
                )}
              </span>
              {data.census?.available ? (
                <span className="la-census">
                  <strong>
                    {data.census.rcts_indexed} trials and {data.census.syntheses_indexed} reviews
                  </strong>{" "}
                  exist in the literature. {data.census.means}
                </span>
              ) : null}
              {data.queue?.queued ? (
                <span className="la-dim">
                  Queued for a future run. Nothing starts automatically — an extraction has to run on its
                  own, or it competes with itself for the session limit.
                </span>
              ) : null}
            </div>
          ) : null}

          {rows.length ? (
            <>
              {/* Not optional. Every retained run is withheld from public claims. */}
              {validity ? (
                <div className={`la-alert ${validity.public_claims_allowed ? "la-alert-ok" : "la-alert-warn"}`}>
                  <strong>
                    {validity.public_claims_allowed
                      ? "Validated run."
                      : `Not a product claim — this run is marked ${validity.status ?? "unvalidated"}.`}
                  </strong>
                  <span>
                    {validity.note ??
                      "Retained for inspection. The scoring constants have not passed anchor calibration."}
                  </span>
                </div>
              ) : null}

              <div className="la-rows">
                {rows.map((row) => (
                  <ScoreRow key={row.outcome} row={row} />
                ))}
              </div>

              <details className="la-details">
                <summary>How this number was produced</summary>
                <p>
                  The effect, form and evidence arcs come from the retained run named below. Only the dose
                  term was recomputed, for the active-moiety dose read off your label — under the current
                  scoring model the dose term is how close your dose sits to the range where trials actually
                  measured a benefit, so it is a property of your product, not of the run.
                </p>
                <dl className="la-read-grid">
                  {Object.entries(data.result?.run ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/_/g, " ")}</dt>
                      <dd>{v === null || v === undefined ? "—" : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                {data.result?.refused?.length ? (
                  <p className="la-dim">
                    Not recomputed: {data.result.refused.map((r) => `${r.outcome} (${r.reason})`).join(", ")}.
                  </p>
                ) : null}
                {validity?.limitations?.length ? (
                  <ul className="la-limits">
                    {validity.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
