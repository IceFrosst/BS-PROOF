"use client";

/*
 * THE SCAN. Photograph a label, send it, hand the answer to <ScanReport>.
 *
 * This component owns CAPTURE only: the drop zone, the camera, the two-step
 * consent (nothing is sent on pick), the stage messages while the request
 * runs, and the error states. Everything the user reads afterwards lives in
 * components/scan-report.tsx, which was split out on 2026-09-15 when the
 * result view was redesigned around a plain-language "At a glance" card.
 *
 * Rules this component keeps, all from CLAUDE.md:
 *
 * 1. Nothing is uploaded until the user presses Scan.
 * 2. A failed request is an error banner, never a partially rendered report.
 * 3. The response is rendered as-is: no client-side scoring, no merging.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { ScanAnalysis } from "@/lib/analyze/scan";

import { ScanReport } from "./scan-report";

const MAX_BYTES = 12 * 1024 * 1024;

const STAGES = [
  "Reading the label…",
  "Converting the printed dose to its active amount…",
  "Matching against the trials we have scored…",
  "Checking the FDA recall registry…",
  "Asking the model about the company and the combination…",
];

export function ScanFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [data, setData] = useState<ScanAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 6000);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Once a report lands, bring it into view: on a phone the capture card fills
  // the screen and a result rendered below it is otherwise invisible.
  useEffect(() => {
    if (data && !error) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data, error]);

  const stageFile = useCallback((picked: File) => {
    if (picked.size > MAX_BYTES) {
      setError(`That image is ${(picked.size / 1e6).toFixed(1)} MB. The limit is 12 MB.`);
      return;
    }
    setError(null);
    setData(null);
    setFile(picked);
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

  const closeCamera = useCallback(() => {
    setStream((old) => {
      old?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      captureInputRef.current?.click();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setError(null);
      setStream(media);
    } catch {
      captureInputRef.current?.click();
    }
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) stageFile(new File([blob], "camera-label.jpg", { type: "image/jpeg" }));
        closeCamera();
      },
      "image/jpeg",
      0.92,
    );
  }, [stageFile, closeCamera]);

  const submit = useCallback(async () => {
    if (!file || busy) return;
    setError(null);
    setData(null);
    setStage(0);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/scan", { method: "POST", body });
      const json = (await res.json()) as ScanAnalysis & { error?: string };
      if (!res.ok && !json.status) {
        setError(json.error ?? `Request failed (${res.status}).`);
      } else {
        setData(json);
        if (json.status === "label_unreadable" || json.status === "analyzer_failed" || json.status === "bad_request") {
          setError(json.error ?? "The label could not be read.");
        }
      }
    } catch (err) {
      setError(`Could not reach the analyzer: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [file, busy]);

  return (
    <section className="la scan" aria-labelledby="scan-title">
      <div className="la-intro">
        <p className="eyebrow">Scan a product</p>
        <h2 id="scan-title">Photograph the label.</h2>
        <p className="la-lede">
          One photo of the Supplement Facts panel. You get a plain answer to five questions: does it work, is the dose right, is this the right form, does
          the mix hold up, and who makes it — each one marked with where the answer came from.
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
          if (!busy) pick(e.dataTransfer.files);
        }}
      >
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="la-input" id="scan-file" disabled={busy} onChange={(e) => pick(e.target.files)} />
        <input ref={captureInputRef} type="file" accept="image/*" capture="environment" className="la-input" aria-hidden="true" tabIndex={-1} onChange={(e) => pick(e.target.files)} />

        {stream ? (
          <div className="la-camera">
            <video ref={videoRef} className="la-camera-view" muted playsInline autoPlay />
            <div className="la-actions">
              <button type="button" className="button button-dark la-analyze" onClick={snap}>
                Capture
              </button>
              <button type="button" className="button button-outline" onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="la-preview" src={preview} alt="The label you staged for analysis" />
            ) : (
              <div className="la-drop-art" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="3">
                  <rect x="10" y="6" width="44" height="52" rx="5" />
                  <path d="M18 24h28M18 34h28M18 44h18" strokeLinecap="round" />
                </svg>
              </div>
            )}
            <div className="la-drop-copy">
              {file ? (
                <>
                  <button type="button" className="button button-dark la-analyze" onClick={() => void submit()} disabled={busy}>
                    {busy ? "Scanning…" : "Scan"}
                  </button>
                  <div className="la-actions">
                    <button type="button" className="button button-outline" onClick={() => void openCamera()} disabled={busy}>
                      Retake photo
                    </button>
                    <label className="button button-outline" htmlFor="scan-file">
                      Choose a different image
                    </label>
                  </div>
                </>
              ) : (
                <div className="la-actions">
                  <button type="button" className="button button-dark" onClick={() => void openCamera()} disabled={busy}>
                    Take a photo
                  </button>
                  <label className="button button-light" htmlFor="scan-file">
                    Upload an image
                  </label>
                </div>
              )}
              <span>
                {file
                  ? `${file.name} · ${(file.size / 1e6).toFixed(1)} MB — nothing is sent until you press Scan`
                  : "or drag an image here · PNG, JPEG, WebP · up to 12 MB"}
              </span>
            </div>
          </>
        )}
        {busy ? (
          <p className="la-stage" role="status" aria-live="polite">
            {STAGES[stage]}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="la-alert la-alert-bad" role="alert">
          <strong>Could not scan that.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {data && !error ? (
        <div ref={resultRef} className="scan-report-anchor">
          <ScanReport data={data} imageUrl={preview} />
        </div>
      ) : null}
    </section>
  );
}
