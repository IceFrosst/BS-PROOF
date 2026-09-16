"use client";

/*
 * "Save your result" — Google sign-in while a scan is loading, so the app
 * captures an email once per device (2026-09-16, founder: "people log in
 * once so we capture their email"). No redirect: Google Identity Services'
 * One Tap / button flow hands back an ID token in-page, which becomes a
 * Supabase session via `signInWithIdToken` — the in-flight scan (already in
 * component state) is never lost to a navigation.
 *
 * The https://accounts.google.com/gsi/client script is loaded LAZILY, only
 * when this component actually mounts (which only happens when
 * `authFullyConfigured()` is true and the founder has opted in by setting
 * all three NEXT_PUBLIC_* vars) — a build with no sign-in configured never
 * fetches a third-party script.
 */
import { useEffect, useId, useRef } from "react";

import { getSupabaseBrowserClient, googleClientId } from "@/lib/auth/supabase-browser";

interface GoogleCredentialResponse {
  credential: string;
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
let gsiPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("no document"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("failed to load Google Identity Services")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

/** The rendered Google button. Renders nothing (an empty container) when
 * sign-in is not configured — callers should not even mount this when
 * `!authFullyConfigured()`, but it degrades safely either way. */
export function GoogleSignInButton({ onSignedIn }: { onSignedIn?: (email: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    const clientId = googleClientId();
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled) return;
        const accountsId = window.google?.accounts?.id;
        if (!accountsId || !containerRef.current) return;
        accountsId.initialize({
          client_id: clientId,
          callback: (resp) => {
            void (async () => {
              const supabase = getSupabaseBrowserClient();
              if (!supabase) return;
              const { data, error } = await supabase.auth.signInWithIdToken({
                provider: "google",
                token: resp.credential,
              });
              if (!error) onSignedIn?.(data.session?.user?.email ?? null);
            })();
          },
        });
        accountsId.renderButton(containerRef.current, {
          theme: "filled_black",
          size: "large",
          type: "standard",
          shape: "pill",
          width: 320,
        });
      })
      .catch(() => {
        // The card's surrounding copy already explains what sign-in buys;
        // a script load failure (offline, an ad blocker) just means the
        // button never appears, not a crash.
      });
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  return <div ref={containerRef} id={`google-signin-${id}`} className="sc-google-btn" data-testid="google-signin-button" />;
}

/** The card shown while a scan/search is loading, when the deployment has
 * sign-in configured and nobody is signed in yet. */
export function SaveResultCard({ onSignedIn }: { onSignedIn?: (email: string | null) => void }) {
  return (
    <div className="sc-signin-card" data-testid="save-result-card">
      <strong>Save your result</strong>
      <p>Sign in with Google once — your results are kept for you and you skip this next time.</p>
      <GoogleSignInButton onSignedIn={onSignedIn} />
    </div>
  );
}
