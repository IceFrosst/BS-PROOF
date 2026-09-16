"use client";

/*
 * The client's one read of "is anyone signed in": wraps
 * `supabase.auth.getSession()` + `onAuthStateChange` behind a small hook so
 * <ScanFlow> does not need to know the Supabase SDK's shape. `configured`
 * mirrors `authFullyConfigured()` — when it is false the hook never touches
 * the SDK at all, so a build with no sign-in env vars never even calls
 * `getSession()`.
 */
import { useCallback, useEffect, useState } from "react";

import { authFullyConfigured, getSupabaseBrowserClient } from "./supabase-browser";

export interface AuthSessionState {
  /** All three NEXT_PUBLIC_* sign-in env vars are set. */
  configured: boolean;
  /** True until the first `getSession()` resolves (only meaningful when configured). */
  loading: boolean;
  email: string | null;
  accessToken: string | null;
  userId: string | null;
}

export interface AuthSession extends AuthSessionState {
  signOut: () => Promise<void>;
}

const EMPTY: Omit<AuthSessionState, "configured" | "loading"> = { email: null, accessToken: null, userId: null };

export function useSupabaseSession(): AuthSession {
  const configured = authFullyConfigured();
  const [state, setState] = useState<Omit<AuthSessionState, "configured">>({ loading: configured, ...EMPTY });

  // `configured` reads env vars Next.js inlines at build time, so it is
  // effectively constant for the app's lifetime -- the initial `useState`
  // above already sets `loading: false` when it starts false, so there is
  // nothing to synchronise here in that case. Returning early with no
  // setState (rather than re-asserting the same values) avoids a synchronous
  // setState directly in the effect body (react-hooks/set-state-in-effect);
  // every real state transition below happens inside Supabase's own async
  // callbacks (`getSession().then(...)`, `onAuthStateChange`), not inline.
  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      setState({
        loading: false,
        email: session?.user?.email ?? null,
        accessToken: session?.access_token ?? null,
        userId: session?.user?.id ?? null,
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        loading: false,
        email: session?.user?.email ?? null,
        accessToken: session?.access_token ?? null,
        userId: session?.user?.id ?? null,
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { configured, ...state, signOut };
}
