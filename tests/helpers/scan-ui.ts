/*
 * Small jsdom drivers shared by the /scan sign-in, workspace and history tests:
 * mount a component, stage a photo, submit it, drive the search sheet, and build
 * the JSON responses the API would send. Nothing here knows about auth.
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BASIS_LEGEND } from "@/lib/analyze/scan";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export class Harness {
  container: HTMLDivElement | null = null;
  root: Root | null = null;

  async mount(element: ReactElement): Promise<HTMLElement> {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    this.container = document.createElement("div");
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    await act(async () => {
      this.root?.render(element);
    });
    return this.container;
  }

  async rerender(element: ReactElement) {
    await act(async () => {
      this.root?.render(element);
    });
  }

  async cleanup() {
    if (this.root) await act(async () => this.root?.unmount());
    this.container?.remove();
    this.root = null;
    this.container = null;
  }
}

export { createElement };

/** Let pending promises (and the state updates they cause) settle. */
export async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

export async function click(el: Element | null | undefined) {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export async function keydown(el: Element | null | undefined, key: string) {
  if (!el) throw new Error("nothing to press a key on");
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

export function buttonByText(root: ParentNode, pattern: RegExp): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll("button")).find((b) => pattern.test(b.textContent ?? ""));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A minimal, valid ScanAnalysis that the real renderer draws as a result. */
export function analysis(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "ScanAnalysisV1",
    analyzed_at: "2026-09-20T10:30:00Z",
    source: "photo",
    status: "ingredient_not_supported",
    ingredient_label_text: "Ashwagandha",
    supported_ingredients: ["creatine"],
    basis_legend: BASIS_LEGEND,
    run_id: "run-abc-123",
    meta: { timing_s: 1, stages: {}, provider_configured: true, models: { vision: null, text: null }, prompt_versions: {} },
    ...overrides,
  };
}

export const STORED = { status: "stored", run_id: "run-abc-123", image: { status: "stored", bucket: null, path: null, mime_type: null, bytes: null, sha256: null } };

/** Put a photo into the staged state (the "Scan this label" / sign-in step). */
export async function stagePhoto(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>("#scan-file");
  if (!input) throw new Error("no upload input rendered");
  const file = new File(["fake-bytes"], "label.png", { type: "image/png" });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function stageAndScan(root: HTMLElement) {
  await stagePhoto(root);
  const scan = buttonByText(root, /scan this label/i);
  if (!scan) throw new Error("no 'Scan this label' button rendered after staging a file");
  await click(scan);
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Open the search sheet. */
export async function openSearch(root: HTMLElement) {
  await click(buttonByText(root, /search your supplement/i));
}

/** Fill the (already open) search form with magnesium glycinate and submit it. */
export async function submitMagnesium() {
  const input = document.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!input) throw new Error("no search combobox rendered");
  await typeInto(input, "mag");
  await keydown(input, "ArrowDown");
  await keydown(input, "Enter");
  const select = document.querySelector<HTMLSelectElement>(".sc-sheet select");
  if (!select) throw new Error("no form select rendered");
  await act(async () => {
    select.value = "magnesium_glycinate";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    document.querySelector(".sc-sheet form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal | null | undefined;
}

export function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers;
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => (out[k] = v));
  else if (Array.isArray(h)) for (const [k, v] of h) out[k] = v;
  else Object.assign(out, h);
  return out;
}

export function record(url: unknown, init?: RequestInit): RecordedCall {
  return { url: String(url), method: init?.method ?? "GET", headers: headersOf(init), body: init?.body, signal: init?.signal };
}
