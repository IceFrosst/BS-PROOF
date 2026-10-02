/* The three capture states of /scan. Each one owns the viewport while it is
 * active (docs/SYSTEM_DESIGN.md §11, state model). */

import { SaveResultCard } from "./google-sign-in";
import { ScanCamera } from "./scan-camera";

/* ---------------- loading ---------------- */
export function LoadingPanel({ preview, stages, stage, showSaveCard }: { preview: string | null; stages: string[]; stage: number; showSaveCard: boolean }) {
  return (
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
  );
}

/* ---------------- staged ---------------- */
export function StagedView({ preview, onScan, onRetake }: { preview: string | null; onScan: () => void; onRetake: () => void }) {
  return (
    <div className="sc-staged">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="la-preview sc-preview" src={preview ?? undefined} alt="The label you staged for analysis" />
      <button type="button" className="button button-dark sc-primary la-analyze" onClick={onScan}>
        Scan this label
      </button>
      <div className="sc-secondary-row">
        <button type="button" className="button button-outline sc-secondary" onClick={onRetake}>
          Retake photo
        </button>
        <label className="button button-outline sc-secondary" htmlFor="scan-file">
          Choose a different image
        </label>
      </div>
    </div>
  );
}

/* ---------------- landing ---------------- */
export function LandingView({ active, disabled, cameraUnavailable, onCapture, onUnavailable }: { active: boolean; disabled: boolean; cameraUnavailable: boolean; onCapture: (file: File) => void; onUnavailable: () => void }) {
  return (
    <>
      <ScanCamera active={active} disabled={disabled} onCapture={onCapture} onUnavailable={onUnavailable} />
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
  );
}
