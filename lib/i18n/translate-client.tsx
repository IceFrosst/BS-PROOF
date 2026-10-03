"use client";

/*
 * The browser side of display translation (see lib/analyze/translate.ts).
 *
 * `useTr()` returns `tr(text)`:
 *   - English: the text itself.
 *   - Lithuanian: (1) a fixed server sentence -> its deterministic Lithuanian
 *     (lib/i18n/deterministic.ts), else (2) a translation already fetched, else
 *     the ORIGINAL text, and the text is queued so the next render has it.
 * A translation is only ever shown in place of the original, and the original
 * is always what is stored, scored and replayed. A failure leaves English on
 * screen and a visible "some text is in English" note; it never blocks a result.
 *
 * Queueing is lazy and per rendered string: only prose that is actually
 * on screen (an opened outcome, a tab that was selected) is requested, one
 * batched POST per tick, <= 24 strings per request.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { knownServerText } from "./deterministic";
import type { Lang } from "./lang";
import { useLang } from "./locale";
import { RESULT_COPY } from "./copy/result";

export type Tr = (text: string) => string;

interface TranslationScope {
  provided: boolean;
  lang: Lang;
  tr: Tr;
  flush: () => void;
  busy: boolean;
  failed: boolean;
}

const IDENTITY: Tr = (text) => text;
const NONE: TranslationScope = { provided: false, lang: "en", tr: IDENTITY, flush: () => undefined, busy: false, failed: false };
const TranslationContext = createContext<TranslationScope>(NONE);

const BATCH_ITEMS = 24;
const BATCH_CHARS = 20_000;
/** Shared for the whole page session so a replay never re-requests what the live result already has. */
const SHARED = new Map<string, string>();

export function resetTranslationsForTests(): void {
  SHARED.clear();
}

/** Worth sending to a translator at all: at least a few letters. */
function translatable(text: string): boolean {
  return /[A-Za-z]{3}/.test(text);
}

export type TranslateHeaders = () => Promise<Record<string, string> | null>;

export function TranslationProvider({ getHeaders, children }: { getHeaders: TranslateHeaders; children: ReactNode }) {
  const { lang } = useLang();
  const [state, setState] = useState({ version: 0, busy: false, failed: false });
  const pending = useRef(new Set<string>());
  const inflight = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const headersRef = useRef(getHeaders);
  useEffect(() => {
    headersRef.current = getHeaders;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(async () => {
    timer.current = null;
    if (!pending.current.size) return;
    const batch: string[] = [];
    let chars = 0;
    for (const text of pending.current) {
      if (batch.length >= BATCH_ITEMS || chars + text.length > BATCH_CHARS) break;
      batch.push(text);
      chars += text.length;
    }
    batch.forEach((text) => {
      pending.current.delete(text);
      inflight.current.add(text);
    });
    if (alive.current) setState((s) => ({ ...s, busy: true, version: s.version + 1 }));
    const settle = (translations: Array<string | null> | null) => {
      batch.forEach((text, i) => {
        inflight.current.delete(text);
        const value = translations?.[i];
        if (typeof value === "string" && value.trim()) SHARED.set(text, value);
        else failed.current.add(text);
      });
      if (alive.current) {
        const busy = pending.current.size > 0 || inflight.current.size > 0;
        setState((s) => ({ version: s.version + 1, busy, failed: failed.current.size > 0 }));
      }
    };
    try {
      const headers = await headersRef.current();
      if (headers === null) return settle(null);
      const res = await fetch("/api/scan/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ lang: "lt", texts: batch }),
      });
      if (!res.ok) return settle(null);
      const json = (await res.json()) as { translations?: Array<string | null> };
      settle(Array.isArray(json.translations) && json.translations.length === batch.length ? json.translations : null);
    } catch {
      settle(null);
    }
  }, []);

  const flush = useCallback(() => {
    if (!pending.current.size || timer.current) return;
    timer.current = setTimeout(() => void run(), 0);
  }, [run]);

  // A batch can leave more queued strings behind (> 24 or > 20k chars).
  const { version, busy, failed: someFailed } = state;
  useEffect(() => {
    flush();
  }, [version, flush]);

  const value = useMemo<TranslationScope>(() => {
    const tr: Tr =
      lang === "en"
        ? IDENTITY
        : (text) => {
            if (!text) return text;
            const known = knownServerText("lt", text);
            if (known !== null) return known;
            if (!translatable(text)) return text;
            const hit = SHARED.get(text);
            if (hit !== undefined) return hit;
            if (!failed.current.has(text) && !inflight.current.has(text)) pending.current.add(text);
            return text;
          };
    return {
      provided: true,
      lang,
      tr,
      flush,
      busy: lang === "lt" && busy,
      failed: lang === "lt" && someFailed,
    };
    // `version` is the cache-changed signal: it re-creates `tr` so consumers re-render with the new strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, version, busy, someFailed, flush]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

/** `tr(text)` for the current language; also queues anything it could not translate yet. */
export function useTr(): Tr {
  const scope = useContext(TranslationContext);
  useEffect(() => {
    scope.flush();
  });
  return scope.tr;
}

export function useHasTranslationProvider(): boolean {
  return useContext(TranslationContext).provided;
}

/** One polite status line: "Translating…" while strings are in flight, a note when some stayed English. */
export function TranslationStatus() {
  const scope = useContext(TranslationContext);
  const copy = RESULT_COPY[scope.lang];
  useEffect(() => {
    scope.flush();
  });
  if (scope.lang !== "lt") return null;
  if (!scope.busy && !scope.failed) return null;
  return (
    <p className="sc-translate-status" role="status" aria-live="polite" data-testid="translate-status">
      {scope.busy ? copy.translating : copy.translationPartial}
    </p>
  );
}
