"use client";

/*
 * ONE persisted EN/LT choice for the whole /scan workspace.
 *
 * Same contract as the Ignas PR3 landing page (origin/ignas-pr3): English is
 * the default, the choice lives in localStorage under `bsproof.lang`, and the
 * only stored values are "en" and "lt". PR3 kept that state inside <ScanFlow>;
 * the History tab, the sign-in card, the footer and every replayed result need
 * the same answer, so it is a tiny external store here and every component
 * reads it through `useLang()`. When PR3's top-bar toggle is integrated it
 * should call `toggleLang()` from this hook instead of owning a copy of the
 * state -- the key and values are identical, so a stored choice carries over.
 *
 * Display only. The language never reaches a score, an enum, a unit, a
 * request that produces evidence, or a stored analysis (the History row keeps
 * the original English record; LT is rendered at read time).
 *
 * SSR / hydration: the server snapshot is always "en". The first client
 * render therefore agrees with the server; `useSyncExternalStore` then moves
 * to the stored value without a hydration mismatch.
 */
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import type { Lang } from "./lang";

export type { Lang };
export const LANG_KEY = "bsproof.lang";
export const LANGS: readonly Lang[] = ["en", "lt"];

const CHANGE_EVENT = "bsproof:lang";

export function normalizeLang(value: unknown): Lang {
  return value === "lt" ? "lt" : "en";
}

/** Stored language, or English when storage is blocked / empty / unknown. */
export function readStoredLang(): Lang {
  const remembered = memoryChoice();
  if (remembered !== null) return remembered;
  try {
    return normalizeLang(window.localStorage.getItem(LANG_KEY));
  } catch {
    return "en";
  }
}

// The in-memory copy exists ONLY while storage cannot be WRITTEN (setItem
// throws -- quota, Safari private mode, a locked-down profile), whether or not
// reading still works: then it is the visit's choice and wins over whatever
// is readable, so the toggle still switches. It belongs to the storage object
// that failed (`memoryStore`): a different/replaced storage, or the next
// successful write, drops it and storage is the single source of truth again.
let memoryLang: Lang | null = null;
let memoryStore: Storage | null = null;

function currentStore(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function memoryChoice(): Lang | null {
  return memoryLang !== null && currentStore() === memoryStore ? memoryLang : null;
}

function snapshot(): Lang {
  const remembered = memoryChoice();
  if (remembered !== null) return remembered;
  try {
    return normalizeLang(window.localStorage.getItem(LANG_KEY));
  } catch {
    return "en";
  }
}

export function writeLang(next: Lang): void {
  try {
    window.localStorage.setItem(LANG_KEY, next);
    memoryLang = null;
    memoryStore = null;
  } catch {
    memoryLang = next;
    memoryStore = currentStore();
    /* storage blocked: the in-memory choice still applies for this visit */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Test seam: forget the in-memory copy so the stored value is read again. */
export function resetLangMemory(): void {
  memoryLang = null;
  memoryStore = null;
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANG_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void; toggleLang: () => void } {
  const lang = useSyncExternalStore(subscribe, snapshot, () => "en" as Lang);
  const setLang = useCallback((next: Lang) => writeLang(next), []);
  const toggleLang = useCallback(() => writeLang(snapshot() === "en" ? "lt" : "en"), []);
  return { lang, setLang, toggleLang };
}

/**
 * The language for SHARED chrome (the site header/footer, the Google button).
 * The choice belongs to the /scan workspace: every other route that renders the
 * same components -- the waitlist, /methodology, /tester -- is English-only and
 * must not flip because someone chose Lithuanian in the scan. Without a router
 * (a bare component in a test) the choice applies.
 */
export function useScanLang(): Lang {
  const { lang } = useLang();
  const pathname = usePathname();
  const outsideScan = typeof pathname === "string" && pathname !== "/scan" && !pathname.startsWith("/scan/");
  return outsideScan ? "en" : lang;
}

/** Pick the right dictionary. Both languages are always complete (typed), so no fallback chain. */
export function pick<T>(lang: Lang, dictionaries: Record<Lang, T>): T {
  return dictionaries[lang];
}
