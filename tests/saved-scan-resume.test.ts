// @vitest-environment jsdom
/*
 * lib/saved-scans/resume.ts: the reload checkpoint is three short fields in this tab's sessionStorage and nothing
 * else. Whatever is in storage is a HINT that is validated before use; any failure of the storage is "no checkpoint".
 * (Replaces the 2026-10 live-research checkpoint test; its v1 record carried a research "intent".)
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RESUME_STORAGE_KEY, clearResumeCheckpoint, noteSavedScan, readResumeCheckpoint } from "@/lib/saved-scans/resume";

import { installSessionStorage } from "./helpers/local-storage";

const OWNER = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SCAN = "11111111-1111-4111-8111-111111111111";
let store: Storage;
const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");

beforeEach(() => { store = installSessionStorage(); });
afterEach(() => {
  if (original) Object.defineProperty(window, "sessionStorage", original);
  else Reflect.deleteProperty(window, "sessionStorage");
});

describe("the reload checkpoint", () => {
  it("round-trips exactly {v: 2, owner, scan} and lower-cases the ids", () => {
    expect(noteSavedScan(OWNER.toUpperCase(), SCAN.toUpperCase())).toBe(true);
    expect(JSON.parse(store.getItem(RESUME_STORAGE_KEY)!)).toEqual({ v: 2, owner: OWNER, scan: SCAN });
    expect(readResumeCheckpoint()).toEqual({ owner: OWNER, scan: SCAN });
  });

  it("refuses to write anything that is not two ids", () => {
    expect(noteSavedScan("not-an-id", SCAN)).toBe(false);
    expect(noteSavedScan(OWNER, "x")).toBe(false);
    expect(store.getItem(RESUME_STORAGE_KEY)).toBeNull();
  });

  it("deletes a foreign, malformed, oversized or old (v1, research-era) value instead of using it", () => {
    for (const raw of [
      "{",
      JSON.stringify({ v: 1, owner: OWNER, scan: SCAN, intent: "fresh" }),
      JSON.stringify({ v: 2, owner: OWNER, scan: SCAN, token: "secret" }),
      JSON.stringify({ v: 2, owner: OWNER, scan: "x".repeat(300) }),
    ]) {
      store.setItem(RESUME_STORAGE_KEY, raw);
      expect(readResumeCheckpoint()).toBeNull();
      expect(store.getItem(RESUME_STORAGE_KEY)).toBeNull();
    }
  });

  it("clears, and treats a storage that throws as no checkpoint", () => {
    noteSavedScan(OWNER, SCAN);
    clearResumeCheckpoint();
    expect(readResumeCheckpoint()).toBeNull();
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
    expect(readResumeCheckpoint()).toBeNull();
    expect(noteSavedScan(OWNER, SCAN)).toBe(false);
    expect(() => clearResumeCheckpoint()).not.toThrow();
  });
});
