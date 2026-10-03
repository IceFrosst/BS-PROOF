"use client";

/*
 * THE /scan WORKSPACE (2026-09-23): two tabs over one page -- Scan (default)
 * and History -- instead of a second route.
 *
 *   Scan     the approved camera-first <ScanFlow>, unchanged in look. It stays
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
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import { ScanFlow } from "@/components/scan-flow";
import { ScanHistory } from "@/components/history-tab";
import type { CatalogIngredient } from "@/lib/analyze/catalog";
import { useSupabaseSession } from "@/lib/auth/use-supabase-session";

type TabKey = "scan" | "history";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "scan", label: "Scan" },
  { key: "history", label: "History" },
];

export function ScanWorkspace({ catalog }: { catalog: CatalogIngredient[] }) {
  const auth = useSupabaseSession();
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

  const onScanStored = useCallback(() => setRefreshToken((n) => n + 1), []);
  const goToScan = useCallback(() => setTab("scan"), []);

  return (
    <div className="scan-workspace">
      <div className="sw-tabs" role="tablist" aria-label="Scan workspace">
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
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={panelId("scan")} aria-labelledby={tabId("scan")} className="sw-panel" hidden={tab !== "scan"}>
        <ScanFlow catalog={catalog} auth={auth} active={tab === "scan"} onScanStored={onScanStored} />
      </div>

      <div role="tabpanel" id={panelId("history")} aria-labelledby={tabId("history")} className="sw-panel" hidden={tab !== "history"}>
        {tab === "history" ? <ScanHistory catalog={catalog} auth={auth} refreshToken={refreshToken} onGoToScan={goToScan} /> : null}
      </div>
    </div>
  );
}
