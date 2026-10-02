"use client";

/*
 * An accessible bottom sheet / modal for "Search your supplement"
 * (2026-09-16 redesign). Reuses <SupplementSearch> unchanged — this file
 * owns only the dialog chrome: role="dialog", aria-modal, a visible title,
 * a close button, Escape to close, backdrop click to close, and a focus
 * trap that keeps Tab cycling inside the sheet while it is open.
 */

import { useEffect, useRef, type ReactNode } from "react";

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function SearchSheet({
  open,
  onClose,
  titleId,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    const sheet = sheetRef.current;
    const toFocus = sheet ? focusableElements(sheet)[0] : null;
    toFocus?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheet) return;
      const focusables = focusableElements(sheet);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sc-sheet-backdrop" onMouseDown={onClose}>
      <div
        ref={sheetRef}
        className="sc-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sc-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sc-sheet-close" onClick={onClose} aria-label="Close search">
            <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
              <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="sc-sheet-body">{children}</div>
      </div>
    </div>
  );
}
