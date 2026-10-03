"use client";

/*
 * THE /scan WORKSPACE (2026-09-23): two tabs over one page -- Scan (default)
 * and History -- instead of a second route.
 *
 *   Scan     the approved camera-first <ScanFlow> (Ignas PR3 layout). It stays
 *            MOUNTED while History is showing (the panel is only `hidden`), so
 *            a staged photo, a scan still running and a finished result all
 *            survive a trip to History. Its camera is switched off while hidden.
 *   History  <ScanHistory>, mounted only while it is the visible tab, so it
 *            asks for the list every time it is opened and shows nothing from a
 *            previous visit. A scan that finishes and is reported stored bumps
 *            `refreshToken`, which refetches the list if History is open.
 *
 * ONE session for the whole page: this component owns the only
 * `useSupabaseSession()` and hands it to both panels, so there is a single
 * subscription and both always agree on who is signed in.
 *
 * The tab pattern is the WAI-ARIA one (the same keys the result's outcome tabs
 * use): role=tablist with two role=tab buttons, aria-selected, roving tabindex,
 * ArrowLeft/ArrowRight/Home/End move AND select, and each panel is a
 * role=tabpanel labelled by its tab.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { ScanFlow } from "@/components/scan-flow";
import { ScanHistory } from "@/components/history-tab";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { useSupabaseSession } from "@/lib/auth/use-supabase-session";
import { FLOW_COPY } from "@/lib/i18n/copy/flow";
import { useLang } from "@/lib/i18n/locale";
import { TranslationProvider, type TranslateHeaders } from "@/lib/i18n/translate-client";

type TabKey = "scan" | "history";

const TAB_KEYS: TabKey[] = ["scan", "history"];

export function ScanWorkspace({ catalog }: { catalog: CatalogIngredient[] }) {
  const auth = useSupabaseSession();
  const { lang, toggleLang } = useLang();
  const t = FLOW_COPY[lang];
  const TABS = TAB_KEYS.map((key) => ({ key, label: key === "scan" ? t.tabScan : t.tabHistory }));
  const [tab, setTab] = useState<TabKey>("scan");
  const [refreshToken, setRefreshToken] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const tabId = (key: TabKey) => `${base}-tab-${key}`;
  const panelId = (key: TabKey) => `${base}-panel-${key}`;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].key);
    refs.current[next]?.focus();
  };

  // The page language is the document language (screen readers, hyphenation).
  useEffect(() => {
    const root = document.documentElement;
    const before = root.lang;
    root.lang = lang;
    return () => {
      root.lang = before || "en";
    };
  }, [lang]);

  // Display translation asks the server with the same bearer token a scan uses.
  const { configured, getAccessToken, userId } = auth;
  const translateHeaders = useCallback<TranslateHeaders>(async (options): Promise<Record<string, string> | null> => {
    if (!configured) return {};
    const token = await getAccessToken({ userId, forceRefresh: options?.forceRefresh });
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, [configured, getAccessToken, userId]);

  const onScanStored = useCallback(() => setRefreshToken((n) => n + 1), []);
  const goToScan = useCallback(() => setTab("scan"), []);

  return (
    <TranslationProvider getHeaders={translateHeaders} ownerKey={userId}>
    <div className="scan-workspace">
      {/* One top bar for both tabs (2026-10-03, Ignas): brand left; on the
          right the two tabs as icon buttons, the language switch and -- once
          signed in -- the account initial. The tab labels stay in the DOM as
          visually hidden text, so screen readers still hear "Scan"/"History". */}
      <div className="sw-bar sc-topbar">
        <span className="sc-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sc-lockup" src="/bsproof-lockup.svg" alt="BS-PROOF" width={130} height={26} />
        </span>
        <span className="sc-topbar-end">
          <div className="sw-tabs" role="tablist" aria-label={t.workspaceLabel}>
            {TABS.map((item, index) => (
              <button
                key={item.key}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={tabId(item.key)}
                className="sw-tab"
                aria-selected={tab === item.key}
                aria-controls={panelId(item.key)}
                tabIndex={tab === item.key ? 0 : -1}
                title={item.label}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {item.key === "scan" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                )}
                <span className="sw-sr-only">{item.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="sc-lang" onClick={toggleLang} aria-label={t.switchTo} lang={lang === "en" ? "lt" : "en"} data-testid="lang-toggle">
            {t.switchShort}
          </button>
          {auth.configured && auth.email ? (
            <span className="sc-avatar" title={auth.email} aria-label={`${t.signedInAs} ${auth.email}`}>
              {auth.email.charAt(0).toUpperCase()}
            </span>
          ) : null}
        </span>
      </div>

      <div role="tabpanel" id={panelId("scan")} aria-labelledby={tabId("scan")} className="sw-panel" hidden={tab !== "scan"}>
        <ScanFlow catalog={catalog} auth={auth} active={tab === "scan"} onScanStored={onScanStored} hideTopbar />
      </div>

      <div role="tabpanel" id={panelId("history")} aria-labelledby={tabId("history")} className="sw-panel" hidden={tab !== "history"}>
        {tab === "history" ? <ScanHistory catalog={catalog} auth={auth} refreshToken={refreshToken} onGoToScan={goToScan} /> : null}
      </div>
    </div>
    </TranslationProvider>
  );
}
