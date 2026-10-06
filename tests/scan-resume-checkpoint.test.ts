// @vitest-environment jsdom
/*
 * lib/scan-research/resume.ts: the reload checkpoint is four short fields in this tab's sessionStorage and nothing else.
 * Whatever is in storage is a HINT that is validated before use; any failure of the storage is "no checkpoint".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RESUME_STORAGE_KEY,
  clearResumeCheckpoint,
  noteFreshScan,
  noteJobKnown,
  readResumeCheckpoint,
  writeResumeCheckpoint,
} from "@/lib/scan-research/resume";

import { installSessionStorage } from "./helpers/local-storage";

const OWNER = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SCAN = "11111111-1111-4111-8111-111111111111";
const SCAN2 = "22222222-2222-4222-8222-222222222222";
let store: Storage;
const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");

beforeEach(() => { store = installSessionStorage(); });
afterEach(() => {
  if (original) Object.defineProperty(window, "sessionStorage", original);
  else Reflect.deleteProperty(window, "sessionStorage");
});

describe("the checkpoint record", () => {
  it("round-trips exactly {v, owner, scan, intent} and lower-cases the ids", () => {
    expect(writeResumeCheckpoint({ owner: OWNER.toUpperCase(), scan: SCAN.toUpperCase(), intent: "fresh" })).toBe(true);
    expect(JSON.parse(store.getItem(RESUME_STORAGE_KEY)!)).toEqual({ v: 1, owner: OWNER, scan: SCAN, intent: "fresh" });
    expect(Object.keys(JSON.parse(store.getItem(RESUME_STORAGE_KEY)!)).sort()).toEqual(["intent", "owner", "scan", "v"]);
    expect(readResumeCheckpoint()).toEqual({ owner: OWNER, scan: SCAN, intent: "fresh" });
  });

  it("refuses to write anything that is not two ids and a known intent (nothing is stored)", () => {
    for (const bad of [{ owner: "user-a", scan: SCAN, intent: "fresh" }, { owner: OWNER, scan: "run-1", intent: "fresh" }, { owner: OWNER, scan: SCAN, intent: "other" }, { owner: "", scan: "", intent: "saved" }]) {
      expect(writeResumeCheckpoint(bad as never), JSON.stringify(bad)).toBe(false);
    }
    expect(store.length).toBe(0);
  });

  it("reads back only a well-formed record; every other value is deleted, not interpreted", () => {
    const bad = ["", "null", "true", "7", "[]", "{}", "not json", "{\"v\":1", JSON.stringify({ v: 1, owner: OWNER, scan: SCAN }), JSON.stringify({ v: 1, owner: OWNER, scan: SCAN, intent: "saved", extra: 1 }),
      JSON.stringify({ v: 1, owner: OWNER, scan: SCAN, intent: "saved", access_token: "eyJ" }), JSON.stringify({ v: "1", owner: OWNER, scan: SCAN, intent: "saved" }), JSON.stringify({ v: 1, owner: OWNER, scan: `${SCAN}?x=1`, intent: "saved" }),
      JSON.stringify({ v: 1, owner: OWNER, scan: SCAN, intent: "FRESH" }), JSON.stringify({ v: 1, owner: { id: OWNER }, scan: SCAN, intent: "saved" }), "x".repeat(300)];
    for (const value of bad) {
      store.setItem(RESUME_STORAGE_KEY, value);
      expect(readResumeCheckpoint(), value.slice(0, 30)).toBeNull();
      expect(store.getItem(RESUME_STORAGE_KEY), value.slice(0, 30)).toBeNull();
    }
    expect(readResumeCheckpoint()).toBeNull(); // nothing stored is nothing
  });

  it("clear removes it; clearing twice is fine", () => {
    writeResumeCheckpoint({ owner: OWNER, scan: SCAN, intent: "saved" });
    clearResumeCheckpoint();
    clearResumeCheckpoint();
    expect(store.getItem(RESUME_STORAGE_KEY)).toBeNull();
  });
});

describe("the two notes", () => {
  it("a fresh scan is 'fresh'; the same scan seen again never turns 'saved' back into 'fresh'", () => {
    expect(noteFreshScan(OWNER, SCAN)).toBe(true);
    expect(readResumeCheckpoint()?.intent).toBe("fresh");
    expect(noteJobKnown(OWNER, SCAN)).toBe(true);
    expect(readResumeCheckpoint()?.intent).toBe("saved");
    expect(noteFreshScan(OWNER, SCAN)).toBe(true); // a repeated render
    expect(readResumeCheckpoint()?.intent).toBe("saved");
    expect(noteJobKnown(OWNER, SCAN)).toBe(true);
    expect(readResumeCheckpoint()?.intent).toBe("saved");
  });

  it("another scan, or another owner, replaces the pointer: there is only ever ONE current scan", () => {
    noteFreshScan(OWNER, SCAN);
    noteJobKnown(OWNER, SCAN);
    noteFreshScan(OWNER, SCAN2);
    expect(readResumeCheckpoint()).toEqual({ owner: OWNER, scan: SCAN2, intent: "fresh" });
    noteFreshScan(OTHER, SCAN2);
    expect(readResumeCheckpoint()).toEqual({ owner: OTHER, scan: SCAN2, intent: "fresh" });
  });
});

describe("a storage that fails is 'no checkpoint', never an error", () => {
  const set = (value: unknown) => Object.defineProperty(window, "sessionStorage", { value, configurable: true, writable: true });
  it("throws on every call", () => {
    const boom = () => { throw new DOMException("denied", "SecurityError"); };
    set({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 });
    expect(readResumeCheckpoint()).toBeNull();
    expect(writeResumeCheckpoint({ owner: OWNER, scan: SCAN, intent: "fresh" })).toBe(false);
    expect(noteFreshScan(OWNER, SCAN)).toBe(false);
    expect(noteJobKnown(OWNER, SCAN)).toBe(false);
    expect(() => clearResumeCheckpoint()).not.toThrow();
  });
  it("is missing, or the property getter itself throws", () => {
    set(undefined);
    expect(readResumeCheckpoint()).toBeNull();
    expect(writeResumeCheckpoint({ owner: OWNER, scan: SCAN, intent: "fresh" })).toBe(false);
    Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("denied", "SecurityError"); }, configurable: true });
    expect(readResumeCheckpoint()).toBeNull();
    expect(() => clearResumeCheckpoint()).not.toThrow();
  });
  it("a full storage (quota) on write", () => {
    set({ getItem: () => null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); }, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 });
    expect(writeResumeCheckpoint({ owner: OWNER, scan: SCAN, intent: "fresh" })).toBe(false);
  });
});
