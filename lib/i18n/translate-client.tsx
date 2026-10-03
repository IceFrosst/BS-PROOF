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
 * A SUCCESS is never silent either: while any machine translation has been
 * fetched, <TranslationStatus> keeps a standing "machine-translated, not
 * checked by a person" note with a switch back to the English original (live
 * results and History replays alike -- both render through <ScanFlow>).
 *
 * Queueing is lazy and per rendered string: only prose that is actually
 * on screen (an opened outcome, a tab that was selected) is requested, one
 * batched POST per tick. Batches are small (BATCH_*) so the model's answer fits
 * its token budget; a string over the server's per-item limit is never sent
 * (it would 400 the whole batch) -- it stays English with the note.
 *
 * Owner scope: the session map and the failure memory belong to ONE signed-in
 * owner (`ownerKey`). When it changes, both are cleared (failures from a
 * signed-out/other session must not stick; one owner's fetched prose is not
 * kept for the next) and an answer that arrives for the previous owner is
 * dropped.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { knownServerText } from "./deterministic";
import type { Lang } from "./lang";
import { useLang } from "./locale";
import { RESULT_COPY } from "./copy/result";
import { TRANSLATE_MAX_ITEM_CHARS } from "./translate-limits";

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

// Small on purpose: the server's answer (Lithuanian is token-heavy) has to fit
// its 4096-token budget, or the WHOLE batch parses to nothing and stays English.
const BATCH_ITEMS = 12;
const BATCH_CHARS = 4_000;
/** Shared for the whole page session so a replay never re-requests what the live result already has. */
const SHARED = new Map<string, string>();

export function resetTranslationsForTests(): void {
  SHARED.clear();
}

/** Worth sending to a translator at all: at least a few letters. */
function translatable(text: string): boolean {
  return /[A-Za-z]{3}/.test(text);
}

/** Auth headers for one request, or null when signed out. `forceRefresh` asks for a freshly refreshed token (after a 401). */
export type TranslateHeaders = (options?: { forceRefresh?: boolean }) => Promise<Record<string, string> | null>;

export function TranslationProvider({
  getHeaders,
  ownerKey = null,
  children,
}: {
  getHeaders: TranslateHeaders;
  /** The signed-in user id (null when signed out / auth is off). A change resets what was fetched and what failed. */
  ownerKey?: string | null;
  children: ReactNode;
}) {
  const { lang } = useLang();
  const [state, setState] = useState({ version: 0, busy: false, failed: false });
  const pending = useRef(new Set<string>());
  const inflight = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const headersRef = useRef(getHeaders);
  const ownerRef = useRef(ownerKey);
  useEffect(() => {
    headersRef.current = getHeaders;
  });
  // A new owner (sign-in, sign-out, account switch) starts clean: failures
  // recorded while signed out would otherwise keep English on screen for the
  // whole page session, and one owner's fetched prose must not outlive them.
  useEffect(() => {
    if (ownerRef.current === ownerKey) return;
    ownerRef.current = ownerKey;
    failed.current.clear();
    pending.current.clear();
    SHARED.clear();
    setState((s) => ({ version: s.version + 1, busy: inflight.current.size > 0, failed: false }));
  }, [ownerKey]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(async () => {
    timer.current = null;
    const owner = ownerRef.current;
    // A string over the server's per-item limit would 400 the whole batch, and
    // one longer than the batch budget could never be taken: set it aside (English + note).
    let oversized = false;
    for (const text of pending.current) {
      if (text.length > TRANSLATE_MAX_ITEM_CHARS) {
        pending.current.delete(text);
        failed.current.add(text);
        oversized = true;
      }
    }
    const batch: string[] = [];
    let chars = 0;
    for (const text of pending.current) {
      if (batch.length >= BATCH_ITEMS || (batch.length > 0 && chars + text.length > BATCH_CHARS)) break;
      batch.push(text);
      chars += text.length;
    }
    if (!batch.length) {
      if (oversized && alive.current) setState((s) => ({ ...s, version: s.version + 1, failed: true }));
      return;
    }
    batch.forEach((text) => {
      pending.current.delete(text);
      inflight.current.add(text);
    });
    if (alive.current) setState((s) => ({ ...s, busy: true, failed: failed.current.size > 0, version: s.version + 1 }));
    const settle = (translations: Array<string | null> | null) => {
      const sameOwner = ownerRef.current === owner;
      batch.forEach((text, i) => {
        inflight.current.delete(text);
        // An answer for the previous owner is dropped, never shown or remembered for the next one.
        if (!sameOwner) return;
        const value = translations?.[i];
        if (typeof value === "string" && value.trim()) SHARED.set(text, value);
        else failed.current.add(text);
      });
      if (alive.current) {
        const busy = pending.current.size > 0 || inflight.current.size > 0;
        setState((s) => ({ version: s.version + 1, busy, failed: failed.current.size > 0 }));
      }
    };
    const post = (headers: Record<string, string>) =>
      fetch("/api/scan/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ lang: "lt", texts: batch }),
      });
    try {
      const headers = await headersRef.current();
      if (headers === null) return settle(null);
      let res = await post(headers);
      if (res.status === 401) {
        // The token may simply have expired: refresh once and retry once.
        const fresh = await headersRef.current({ forceRefresh: true });
        if (fresh === null || fresh.Authorization === headers.Authorization) return settle(null);
        res = await post(fresh);
      }
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

  // A batch can leave more queued strings behind (> BATCH_ITEMS or > BATCH_CHARS).
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

/**
 * The standing notes of the Lithuanian view (nothing in English):
 *  - "Translating…" while strings are in flight / a note when some stayed English;
 *  - once ANY machine translation has been fetched, a note that it is a machine
 *    translation, not checked by a person, with a button back to the English
 *    original. It is derived from the fetched-translation map (no state is set
 *    in render), so it is also there on a History replay that only reuses what
 *    the live result already fetched. Wherever a result or an error can show
 *    translated prose it renders one <TranslationStatus>.
 */
export function TranslationStatus() {
  const scope = useContext(TranslationContext);
  const { setLang } = useLang();
  const copy = RESULT_COPY[scope.lang];
  useEffect(() => {
    scope.flush();
  });
  if (scope.lang !== "lt") return null;
  const machine = SHARED.size > 0;
  if (!scope.busy && !scope.failed && !machine) return null;
  return (
    <>
      {scope.busy || scope.failed ? (
        <p className="sc-translate-status" role="status" aria-live="polite" data-testid="translate-status">
          {scope.busy ? copy.translating : copy.translationPartial}
        </p>
      ) : null}
      {machine ? (
        <p className="sc-translate-status sc-translate-machine" data-testid="translate-machine-note">
          {copy.machineTranslated}{" "}
          <button type="button" className="sc-translate-original" lang="en" onClick={() => setLang("en")} data-testid="translate-show-original">
            {copy.showOriginal}
          </button>
        </p>
      ) : null}
    </>
  );
}
