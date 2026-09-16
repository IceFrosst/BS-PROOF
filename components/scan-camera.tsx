"use client";

/*
 * THE LIVE CAMERA BLOCK (2026-09-16 redesign, founder: "use your eyes" — match
 * https://bsproof.lovable.app's one big rounded-corner viewfinder, not the
 * platform camera app). Renders a <video> covering a big rounded block,
 * a top-to-transparent gradient overlay carrying the scan mark, wordmark, H1
 * and subline, and — only once the stream is actually live — a big round
 * shutter button beneath the block.
 *
 * LIFECYCLE, exactly per spec:
 *   - starts getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false}
 *     on mount, IF `active` and the browser can plausibly support it
 *     (lib/camera/capture.ts#cameraSupported)
 *   - stops every track: when a capture is taken (the parent flips `active`
 *     to false once a photo is staged), on unmount, and when the tab is
 *     hidden (`visibilitychange`)
 *   - restarts automatically whenever `active` becomes true again — which is
 *     exactly what "Scan another" does by clearing the staged file
 *   - denial / no API / insecure context / any getUserMedia rejection all
 *     collapse to ONE calm fallback message; the existing file-input path
 *     (rendered by the parent, `capture="environment"` on the hidden input)
 *     is what actually recovers, so this component never needs to know about
 *     it beyond calling `onUnavailable`
 *
 * No model call and none of the marker strings `pipeline.invariants`'s TS
 * boundary check would flag (CLAUDE.md invariant 1).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { blobToCaptureFile, cameraSupported, captureVideoFrame, startCamera, stopCamera } from "@/lib/camera/capture";

type CameraStatus = "idle" | "starting" | "live" | "unavailable";

export function ScanCamera({
  active,
  disabled = false,
  onCapture,
  onUnavailable,
}: {
  /** Whether the viewfinder should be running. The parent flips this to
   * false the instant a frame is captured or a file is staged another way,
   * and back to true for "Scan another". */
  active: boolean;
  disabled?: boolean;
  onCapture: (file: File) => void;
  onUnavailable?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const wasLiveRef = useRef(false);

  const closeStream = useCallback(() => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const open = useCallback(async () => {
    if (!cameraSupported()) {
      setStatus("unavailable");
      onUnavailable?.();
      return;
    }
    setStatus("starting");
    try {
      const stream = await startCamera();
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("live");
      wasLiveRef.current = true;
    } catch {
      // Denied, no device, NotAllowedError, insecure context turned real by
      // the browser at call time — every rejection reads the same to a
      // person: the camera did not open, so upload instead.
      setStatus("unavailable");
      onUnavailable?.();
    }
  }, [onUnavailable]);

  // Mount / `active` toggling. When `active` goes false we only stop the
  // stream here -- `status` is read together with `active` at render time
  // (`isLive`/`isStarting`/`isUnavailable` below), so an inactive block always
  // renders as idle even if `status` itself still says "live" from before,
  // with no direct setState in the effect body (a synchronous setState here
  // would cascade a render -- react-hooks/set-state-in-effect; the actual
  // status transitions all happen inside `open()`, an async function invoked
  // from the effect rather than written inline in it).
  useEffect(() => {
    if (!active) {
      closeStream();
      return;
    }
    let cancelled = false;
    // `open()` is invoked from inside a resolved-promise callback, not as a
    // direct statement in the effect body: it is the thing that actually
    // calls setState (starting/live/unavailable), and the lint rule's own
    // guidance is exactly this shape -- "calling setState in a callback
    // function when external state changes" -- as opposed to a bare
    // synchronous call written inline in the effect.
    Promise.resolve().then(() => {
      if (!cancelled) void open();
    });
    return () => {
      cancelled = true;
      closeStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Tab visibility: stop on hide (spec), restart on show only if this block
  // was actually live before it was hidden and is still supposed to be
  // active.
  useEffect(() => {
    function onVisibility() {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        if (streamRef.current) {
          closeStream();
          setStatus("idle");
        }
      } else if (active && wasLiveRef.current && status !== "live" && status !== "starting") {
        void open();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status]);

  const handleShutter = useCallback(async () => {
    if (!videoRef.current || disabled) return;
    const blob = await captureVideoFrame(videoRef.current, { maxLongEdge: 2048, quality: 0.92 });
    if (!blob) return;
    const file = blobToCaptureFile(blob, "image/jpeg");
    // Stop the stream the instant a frame is captured, per spec — the parent
    // will flip `active` to false too once it stages the file, but doing it
    // here as well means the camera light turns off immediately even if the
    // parent's re-render is delayed.
    closeStream();
    onCapture(file);
  }, [disabled, onCapture, closeStream]);

  const isLive = active && status === "live";
  const isStarting = active && status === "starting";
  const isUnavailable = active && status === "unavailable";

  // The <video> is ALWAYS mounted (hidden until live). Attaching the stream
  // inside `open()` raced the first render -- with a conditionally rendered
  // <video>, `videoRef.current` was null at attach time and the feed never
  // showed (found with Playwright's fake camera, 2026-09-16). This effect
  // re-attaches whenever the stream is live and the element is present.
  useEffect(() => {
    const v = videoRef.current;
    if (!isLive || !v || !streamRef.current) return;
    if (v.srcObject !== streamRef.current) v.srcObject = streamRef.current;
    void v.play().catch(() => {
      /* autoplay policy: muted + playsInline should allow it; nothing else to do */
    });
  }, [isLive]);

  return (
    <div className="sc-viewfinder-wrap">
      <div className="sc-viewfinder" aria-label="Live camera viewfinder">
        <video ref={videoRef} className={`sc-video${isLive ? "" : " is-hidden"}`} playsInline muted autoPlay aria-hidden="true" />
        {isLive ? null : <div className="sc-viewfinder-fill" aria-hidden="true" />}

        <div className="sc-viewfinder-overlay">
          <div className="sc-viewfinder-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-viewfinder-mark" src="/scan-mark.svg" alt="" width={44} height={44} aria-hidden="true" />
            <span className="sc-viewfinder-word">BS PROOF</span>
          </div>
          <h1 id="scan-title" className="sc-headline">
            Does your Supplement actually work?
          </h1>
          <p className="sc-subline">Scan and see.</p>
        </div>

        {isUnavailable ? (
          <div className="sc-camera-fallback" role="status">
            <p>Camera unavailable — upload a photo instead.</p>
          </div>
        ) : null}
        {isStarting ? (
          <div className="sc-camera-starting" role="status" aria-live="polite">
            <p>Opening the camera…</p>
          </div>
        ) : null}
      </div>

      {isLive ? (
        <button
          type="button"
          className="sc-shutter"
          onClick={() => void handleShutter()}
          disabled={disabled}
          aria-label="Take a photo"
        >
          <span className="sc-shutter-ring" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
