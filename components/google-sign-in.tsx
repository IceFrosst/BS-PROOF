"use client";

/*
 * Google sign-in for /scan. Since 2026-09-23 it is the gate in front of real
 * results wherever sign-in is configured (founder: results depend on a Google
 * login) -- the old "Save your result" nudge, which a person could ignore, is
 * gone. No redirect: Google Identity Services' button flow hands back an ID
 * token in-page, which becomes a Supabase session via `signInWithIdToken`, so a
 * photo already staged in the page is never lost to a navigation.
 *
 * The https://accounts.google.com/gsi/client script is loaded LAZILY, only when
 * a sign-in card actually mounts (which only happens when
 * `authFullyConfigured()` is true) -- a build with no sign-in configured never
 * fetches a third-party script.
 *
 * A BLANK CARD IS A BUG. Every way this can fail ends in words and an action:
 *   - the script does not load (offline, a content blocker, a hung request):
 *     an alert explains it and "Try again" re-attempts the load -- the failed
 *     <script> is removed and the cached promise dropped, otherwise the first
 *     failure would be permanent for the life of the page;
 *   - Google's button cannot render: same alert;
 *   - Google hands back a credential but Supabase refuses it (project not set
 *     up for Google, wrong client id, expired token, network): an alert says
 *     sign-in did not finish and the Google button is still there to try again.
 * No message ever contains the credential or the raw provider error.
 *
 * The token exchange is module-level, not per button, because Google Identity
 * Services keeps ONE global callback: with two sign-in cards mounted (the Scan
 * tab's and the History tab's), the credential would otherwise land in whichever
 * was initialised last. Every mounted button reflects the same exchange status.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { getSupabaseBrowserClient, googleClientId } from "@/lib/auth/supabase-browser";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (resp: GoogleCredentialResponse) => void }) => void;
  renderButton: (
    parent: HTMLElement,
    options: { theme?: string; size?: string; type?: string; width?: number | string; shape?: string },
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
const GSI_TIMEOUT_MS = 12_000;
const EXCHANGE_SLOW_MS = 20_000;

export const GOOGLE_LOAD_FAILED = "Google sign-in did not load. Check your connection, turn off any blocker for accounts.google.com, then try again.";
export const GOOGLE_EXCHANGE_FAILED = "Google accepted you, but sign-in did not finish. Use the Google button to try again.";
export const GOOGLE_EXCHANGE_SLOW = "Sign-in is taking longer than expected. Wait a moment, or use the Google button to try again.";

/* ---------------------------------------------------------------- script -- */

let gsiPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      // Forget the failure: a cached rejection would make "Try again" a no-op.
      gsiPromise = null;
      document.querySelector(`script[src="${GSI_SRC}"]`)?.remove();
      reject(new Error("failed to load Google Identity Services"));
    };
    const loaded = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.id) resolve();
      else fail();
    };
    // Declared after the handlers that clear it; they only ever run later.
    const timer = setTimeout(fail, GSI_TIMEOUT_MS);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", loaded);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = loaded;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return gsiPromise;
}

/* -------------------------------------------------------- token exchange -- */

interface ExchangeStatus {
  phase: "idle" | "exchanging" | "error";
  message: string | null;
}

const IDLE: ExchangeStatus = { phase: "idle", message: null };
let exchangeStatus: ExchangeStatus = IDLE;
let initializedFor: string | null = null;
const listeners = new Set<() => void>();

function publish(next: ExchangeStatus) {
  exchangeStatus = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function handleCredential(response: GoogleCredentialResponse) {
  const token = response?.credential;
  const supabase = getSupabaseBrowserClient();
  if (!token || !supabase) {
    publish({ phase: "error", message: GOOGLE_EXCHANGE_FAILED });
    return;
  }
  publish({ phase: "exchanging", message: null });
  // If Supabase is slow, say so -- but the real answer still wins when it lands.
  const slow = setTimeout(() => publish({ phase: "error", message: GOOGLE_EXCHANGE_SLOW }), EXCHANGE_SLOW_MS);
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
    clearTimeout(slow);
    if (error || !data?.session) publish({ phase: "error", message: GOOGLE_EXCHANGE_FAILED });
    else publish(IDLE);
  } catch {
    clearTimeout(slow);
    publish({ phase: "error", message: GOOGLE_EXCHANGE_FAILED });
  }
}

/** Test-only: forget the cached script promise, initialisation and status. */
export function resetGoogleSignInForTests(): void {
  gsiPromise = null;
  initializedFor = null;
  exchangeStatus = IDLE;
  listeners.clear();
}

/* ---------------------------------------------------------------- button -- */

type LoadState = "loading" | "ready" | "error";

/** The rendered Google button with its own loading / error / retry states.
 * Renders an empty container when sign-in is not configured -- callers should
 * not even mount this when `!authFullyConfigured()`, but it degrades safely. */
export function GoogleSignInButton() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const [load, setLoad] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const exchange = useSyncExternalStore(
    subscribe,
    () => exchangeStatus,
    () => IDLE,
  );

  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled) return;
        const accountsId = window.google?.accounts?.id;
        const container = containerRef.current;
        if (!accountsId || !container) {
          setLoad("error");
          return;
        }
        try {
          if (initializedFor !== clientId) {
            accountsId.initialize({ client_id: clientId, callback: (resp) => void handleCredential(resp) });
            initializedFor = clientId;
          }
          container.replaceChildren();
          const width = Math.min(320, Math.max(200, Math.floor(container.clientWidth) || 320));
          accountsId.renderButton(container, { theme: "filled_black", size: "large", type: "standard", shape: "pill", width });
          setLoad("ready");
        } catch {
          setLoad("error");
        }
      })
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad("loading");
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div className="sc-google" data-load-state={load}>
      <div
        ref={containerRef}
        id={`google-signin-${id}`}
        className="sc-google-btn"
        data-testid="google-signin-button"
        style={load === "error" ? { minHeight: 0 } : undefined}
      />
      {load === "loading" ? (
        <p className="sc-google-status" role="status">
          Loading Google sign-in…
        </p>
      ) : null}
      {exchange.phase === "exchanging" ? (
        <p className="sc-google-status" role="status">
          Signing you in…
        </p>
      ) : null}
      {load === "error" ? (
        <div className="sc-google-error" role="alert" data-testid="google-signin-error">
          <p>{GOOGLE_LOAD_FAILED}</p>
          <button type="button" className="sc-google-retry" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
      {exchange.phase === "error" && exchange.message ? (
        <div className="sc-google-error" role="alert" data-testid="google-exchange-error">
          <p>{exchange.message}</p>
        </div>
      ) : null}
    </div>
  );
}

/** The card that stands in for a result wherever sign-in is configured and
 * nobody is signed in. `notice` explains why the person is seeing it again
 * (their session ended, they signed out). */
export function SignInCard({ title, body, notice, children }: { title: string; body: string; notice?: string | null; children?: ReactNode }) {
  const titleId = useId();
  return (
    <section className="sc-signin-card" data-testid="signin-card" aria-labelledby={titleId}>
      <strong id={titleId}>{title}</strong>
      {notice ? (
        <p className="sc-signin-notice" role="status" data-testid="signin-notice">
          {notice}
        </p>
      ) : null}
      <p>{body}</p>
      {children}
      <GoogleSignInButton />
    </section>
  );
}
