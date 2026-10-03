/*
 * lib/camera/capture.ts: the live-camera redesign's pure(ish) pieces, tested
 * with a MOCKED canvas -- no real <video> decoding a real frame, no real
 * MediaStream, because jsdom (this project's unit-test DOM) implements
 * neither. `cameraSupported()` is exercised by toggling `navigator.mediaDevices`
 * itself, which is the exact shape production code branches on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { blobToCaptureFile, cameraSupported, captureFrameToBlob, coverCropRect, startCamera, stopCamera } from "@/lib/camera/capture";

describe("cameraSupported", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: originalMediaDevices, configurable: true });
  });

  it("is false when navigator.mediaDevices is undefined (jsdom's default, and older WebViews)", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(cameraSupported()).toBe(false);
  });

  it("is false when mediaDevices exists but has no getUserMedia", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    expect(cameraSupported()).toBe(false);
  });

  it("is true when getUserMedia is a function and the context is not known-insecure", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn() }, configurable: true });
    expect(cameraSupported()).toBe(true);
  });

  it("is false in a context explicitly reported as insecure", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn() }, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    expect(cameraSupported()).toBe(false);
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });
});

describe("startCamera / stopCamera", () => {
  it("requests the rear camera at its best resolution, with no audio, by default", async () => {
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });

    const stream = await startCamera();
    expect(stream).toBe(fakeStream);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    });
  });

  it("stops every track, and is safe to call with null/undefined/an already-stopped stream", () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const stream = { getTracks: () => [{ stop: stop1 }, { stop: stop2 }] } as unknown as MediaStream;
    stopCamera(stream);
    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).toHaveBeenCalledTimes(1);
    expect(() => stopCamera(null)).not.toThrow();
    expect(() => stopCamera(undefined)).not.toThrow();

    const throwing = { getTracks: () => [{ stop: () => { throw new Error("already stopped"); } }] } as unknown as MediaStream;
    expect(() => stopCamera(throwing)).not.toThrow();
  });
});

function fakeCanvas() {
  const calls: Array<{ mime: string | undefined; quality: number | undefined }> = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}) as unknown as CanvasRenderingContext2D,
    toBlob(cb: (b: Blob | null) => void, mime?: string, quality?: number) {
      calls.push({ mime, quality });
      cb(new Blob(["fake-jpeg-bytes"], { type: mime ?? "image/jpeg" }));
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe("captureFrameToBlob", () => {
  it("returns null when the video has no dimensions yet (not playing)", async () => {
    const { canvas } = fakeCanvas();
    const result = await captureFrameToBlob({ videoWidth: 0, videoHeight: 0 }, () => canvas, () => {});
    expect(result).toBeNull();
  });

  it("caps the encoded size at maxLongEdge, preserving aspect ratio", async () => {
    const { canvas } = fakeCanvas();
    let sizedWidth = 0;
    let sizedHeight = 0;
    const trackingCanvas = new Proxy(canvas, {
      set(target, prop, value) {
        if (prop === "width") sizedWidth = value as number;
        if (prop === "height") sizedHeight = value as number;
        (target as unknown as Record<string, unknown>)[prop as string] = value;
        return true;
      },
    });
    const drawn: Array<[number, number]> = [];
    const blob = await captureFrameToBlob(
      { videoWidth: 4000, videoHeight: 3000 },
      () => trackingCanvas,
      (_ctx, w, h) => drawn.push([w, h]),
      { maxLongEdge: 2048 },
    );
    expect(blob).not.toBeNull();
    // 4000x3000 at ratio 4:3 -> capped to 2048 long edge -> 2048x1536.
    expect(sizedWidth).toBe(2048);
    expect(sizedHeight).toBe(1536);
    expect(drawn).toEqual([[2048, 1536]]);
  });

  it("never upscales an image already under the cap", async () => {
    const { canvas } = fakeCanvas();
    const blob = await captureFrameToBlob({ videoWidth: 640, videoHeight: 480 }, () => canvas, () => {}, { maxLongEdge: 2048 });
    expect(blob).not.toBeNull();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it("encodes JPEG at the spec default quality (0.92) unless overridden", async () => {
    const { canvas, calls } = fakeCanvas();
    await captureFrameToBlob({ videoWidth: 100, videoHeight: 100 }, () => canvas, () => {});
    expect(calls).toEqual([{ mime: "image/jpeg", quality: 0.92 }]);
  });

  it("returns null when the 2D context is unavailable", async () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    const result = await captureFrameToBlob({ videoWidth: 100, videoHeight: 100 }, () => canvas, () => {});
    expect(result).toBeNull();
  });
});

describe("blobToCaptureFile", () => {
  it("produces a JPEG File the existing multipart upload path can carry as `image`", () => {
    const file = blobToCaptureFile(new Blob(["x"], { type: "image/jpeg" }), "image/jpeg");
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/jpeg");
    expect(file.name).toMatch(/^scan-capture-.*\.jpg$/);
  });
});

describe("coverCropRect", () => {
  it("maps the on-screen guide back to sensor pixels under object-fit: cover", () => {
    // 1600x1200 sensor shown in a 400x500 box: scale 500/1200, 1600 wide -> 666.7 shown, 133.3 cut each side.
    const view = { left: 0, top: 0, width: 400, height: 500 };
    const guide = { left: 24, top: 120, width: 352, height: 230 };
    const r = coverCropRect(1600, 1200, view, guide, 0)!;
    expect(r).toEqual({ x: Math.round((24 + 133.333) * 2.4), y: 288, w: Math.round(352 * 2.4), h: 552 });
  });
  it("clamps to the sensor frame and returns null for unsized inputs", () => {
    const r = coverCropRect(100, 100, { left: 0, top: 0, width: 100, height: 100 }, { left: -50, top: -50, width: 300, height: 300 }, 0)!;
    expect(r).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(coverCropRect(0, 0, { left: 0, top: 0, width: 1, height: 1 }, { left: 0, top: 0, width: 1, height: 1 })).toBeNull();
  });
});
