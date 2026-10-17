/* The three capture states of /scan. Each one owns the viewport while it is
 * active (docs/APP.md §11, state model). */

import type { DemoProduct } from "@/lib/demo/products";

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

/* ---------------- landing ----------------
 * 2026-10-03 layout (main, PR #3): headline above the camera, four corners
 * where the panel goes, Upload / shutter / Search in one row. */
const UPLOAD_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" /></svg>;
const SEARCH_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;

function Intro() {
  return (
    <div className="sc-intro">
      <h1 id="scan-title" className="sc-headline">Does your Supplement actually work?</h1>
      <p className="sc-subline">Scan and see.</p>
    </div>
  );
}

export function LandingView({ active, disabled, cameraUnavailable, onCapture, onUnavailable, onSearch }: { active: boolean; disabled: boolean; cameraUnavailable: boolean; onCapture: (file: File) => void; onUnavailable: () => void; onSearch: () => void }) {
  return (
    <>
      <Intro />
      <ScanCamera
        active={active}
        disabled={disabled}
        onCapture={onCapture}
        onUnavailable={onUnavailable}
        leading={<label className="sc-icon-btn" htmlFor="scan-file" aria-label="Upload a photo"><span className="sc-icon" aria-hidden="true">{UPLOAD_ICON}</span>Upload</label>}
        trailing={<button type="button" className="sc-icon-btn sc-search-cta" onClick={onSearch} aria-label="Search your supplement"><span className="sc-icon" aria-hidden="true">{SEARCH_ICON}</span>Search<span className="sr-only"> your supplement</span></button>}
        fallback={cameraUnavailable ? <label className="button button-dark sc-fallback-photo" htmlFor="scan-capture">Take a photo</label> : null}
      />
    </>
  );
}

/* /demo: under the camera, sample labels with recorded answers (no network). */
export function DemoLanding({ products, onPick }: { products: DemoProduct[]; onPick: (p: DemoProduct) => void }) {
  return (
    <>
      <p className="dm-kicker">No supplement at hand? Try a sample</p>
      <ul className="dm-list">
        {products.map((p) => (
          <li key={p.id}>
            <button type="button" className="dm-card" onClick={() => onPick(p)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" />
              <span className="dm-text"><strong>{p.name}</strong><small>{p.detail}</small></span>
              <span className="dm-go" aria-hidden="true">Scan</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
