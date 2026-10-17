/*
 * THE LIVE CAMERA VIEWFINDER's two pure(ish) jobs, split out of
 * components/scan-camera.tsx so they are unit-testable without mounting React
 * or a real camera (2026-09-16 redesign, founder: "use your eyes" — the
 * reference is a live getUserMedia viewfinder, not the platform camera app).
 *
 * 1. `cameraSupported()` — a calm, honest capability check. getUserMedia is
 *    unavailable in an insecure context (http, not localhost), in an iframe
 *    without the `camera` permission, or simply absent (older WebView,
 *    desktop without a camera API polyfill, most test environments). Every
 *    one of those must fall back to the existing file-input path, never throw
 *    past the caller.
 * 2. `captureFrameToBlob()` — draw the CURRENT video frame to an off-DOM
 *    canvas, capped at `maxLongEdge` (2048 by default, matching the founder's
 *    spec) and re-encoded as JPEG at `quality` (0.92 default). Downscaling
 *    happens here, once, so the upload is never larger than the label photo
 *    needs to be — a live 4K sensor feed would otherwise cost 4x the bytes of
 *    the existing file-picker path for no reading benefit.
 *
 * Neither function is the model boundary: this file draws pixels and manages
 * a MediaStream, and never calls a model API -- it carries none of the
 * markers `pipeline.invariants` scans lib/, app/ and components/ for
 * (CLAUDE.md invariant 1).
 */

export interface CaptureOptions {
  /** Longest edge of the encoded image, in pixels. */
  maxLongEdge?: number;
  /** JPEG quality, 0..1. */
  quality?: number;
  mimeType?: string;
}

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_QUALITY = 0.92;
const DEFAULT_MIME = "image/jpeg";

/**
 * True only when a live camera request could plausibly succeed. Never
 * throws — every reason it might be false (insecure context, no API, no
 * devices enumerable) is a fallback path, not an error to surface.
 */
export function cameraSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") return false;
  // `isSecureContext` is undefined in some very old environments; treat
  // "unknown" as supported and let the getUserMedia call itself fail, rather
  // than refusing a context we cannot actually prove is insecure.
  if (typeof window !== "undefined" && window.isSecureContext === false) return false;
  return true;
}

/** Requests the rear (environment-facing) camera, no audio. Rejects on
 * denial, no device, or any other getUserMedia failure — the caller decides
 * what the person sees. */
export async function startCamera(constraints?: MediaStreamConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(
    constraints ?? {
      // Ask for the sensor's real resolution (2026-10-03). With facingMode
      // alone browsers hand back ~640x480, and desktop webcams also lack
      // autofocus -- a small, soft frame of a dense Supplement Facts panel.
      // `ideal` never rejects; a camera that cannot do 4K returns its best.
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    },
  );
}

/** Stops every track on a stream. Safe to call with null/undefined and safe
 * to call twice — stopping an already-stopped track is a no-op per spec. */
export function stopCamera(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // A track that is already stopped or already removed throws nothing
      // per spec, but guard anyway — this must never be the reason a capture
      // flow breaks.
    }
  }
}

/**
 * Draws the current frame of `video` to a canvas sized to at most
 * `maxLongEdge` on its longest side, and encodes it as JPEG. Returns null
 * (never throws) when the video has no dimensions yet (not playing) or the
 * canvas 2D context / encode is unavailable — every caller must already have
 * a file-input fallback for exactly this reason.
 */
export async function captureFrameToBlob(
  video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">,
  createCanvas: () => HTMLCanvasElement,
  drawImage: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  options: CaptureOptions = {},
): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const scale = Math.min(1, maxLongEdge / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawImage(ctx, width, height);

  const mimeType = options.mimeType ?? DEFAULT_MIME;
  const quality = options.quality ?? DEFAULT_QUALITY;
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      return;
    }
    // jsdom / very old browsers: no toBlob. Fall back to a data-URL round
    // trip only when it exists either; otherwise honestly return null.
    if (typeof canvas.toDataURL !== "function") {
      resolve(null);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(",")[1] ?? "";
      const binary = typeof atob === "function" ? atob(base64) : "";
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: mimeType }));
    } catch {
      resolve(null);
    }
  });
}

/** Convenience wrapper for the real DOM: draws `video` itself via
 * `drawImage`, the shape components/scan-camera.tsx actually needs. Split
 * from `captureFrameToBlob` above so tests can mock canvas creation and
 * drawing without a real <video> element decoding frames. */
export async function captureVideoFrame(video: HTMLVideoElement, options: CaptureOptions = {}, crop?: CropRect | null): Promise<Blob | null> {
  if (crop) {
    return captureFrameToBlob(
      { videoWidth: crop.w, videoHeight: crop.h },
      () => document.createElement("canvas"),
      (ctx, width, height) => ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height),
      options,
    );
  }
  return captureFrameToBlob(
    video,
    () => document.createElement("canvas"),
    (ctx, width, height) => ctx.drawImage(video, 0, 0, width, height),
    options,
  );
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of the camera frame the person actually sees inside the on-screen
 * guide (2026-10-03: the photo used to be the whole sensor frame, much wider
 * than the guide). The <video> is `object-fit: cover`, so the sensor frame is
 * scaled up and centred; this maps the guide's on-screen box back to sensor
 * pixels. `pad` (fraction of the guide) keeps a little margin so a panel
 * touching the corners is not clipped. Null when anything has no size.
 */
export function coverCropRect(
  videoW: number,
  videoH: number,
  view: { left: number; top: number; width: number; height: number },
  guide: { left: number; top: number; width: number; height: number },
  pad = 0.06,
): CropRect | null {
  if (!videoW || !videoH || !view.width || !view.height || !guide.width || !guide.height) return null;
  const scale = Math.max(view.width / videoW, view.height / videoH);
  const ox = (view.width - videoW * scale) / 2;
  const oy = (view.height - videoH * scale) / 2;
  const px = guide.width * pad;
  const py = guide.height * pad;
  const x0 = Math.max(0, (guide.left - px - view.left - ox) / scale);
  const y0 = Math.max(0, (guide.top - py - view.top - oy) / scale);
  const x1 = Math.min(videoW, (guide.left + guide.width + px - view.left - ox) / scale);
  const y1 = Math.min(videoH, (guide.top + guide.height + py - view.top - oy) / scale);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

let captureCounter = 0;

/** Blob -> File with a fresh, sortable-ish name, for the existing multipart
 * upload path (`POST /api/scan`, field `image`) that a picked file already
 * uses — the live capture must produce the exact same shape. */
export function blobToCaptureFile(blob: Blob, mimeType = DEFAULT_MIME): File {
  captureCounter += 1;
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "bin";
  return new File([blob], `scan-capture-${Date.now()}-${captureCounter}.${ext}`, { type: mimeType });
}

/** Uploads above this are re-encoded before POST /api/scan (2026-10-03).
 * Vercel refuses request bodies over 4.5 MB before the route runs, so a
 * typical 4-8 MB phone photo failed with an opaque error. */
export const UPLOAD_REENCODE_BYTES = 3_500_000;

/**
 * A picked photo, downscaled to `maxLongEdge` and re-encoded as JPEG when it
 * is too large to upload. Small files pass through untouched, and any decode
 * failure returns the original file -- the server's own size check still
 * answers for it, so this can only make an upload smaller, never break one.
 */
export async function shrinkForUpload(file: File, options: CaptureOptions = {}): Promise<File> {
  if (file.size <= UPLOAD_REENCODE_BYTES || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const decoded = bitmap;
    const blob = await captureFrameToBlob(
      { videoWidth: decoded.width, videoHeight: decoded.height },
      () => document.createElement("canvas"),
      (ctx, width, height) => ctx.drawImage(decoded, 0, 0, width, height),
      { maxLongEdge: 2560, ...options },
    );
    // Only ever swap in a SMALLER file; anything else keeps the original.
    return blob && blob.size < file.size ? blobToCaptureFile(blob, "image/jpeg") : file;
  } catch {
    return file;
  } finally {
    try {
      bitmap?.close();
    } catch {
      /* closing is best effort */
    }
  }
}
