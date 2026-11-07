"use client";

/*
 * The client's one read of "is anyone signed in": wraps
 * `supabase.auth.getSession()` + `onAuthStateChange` behind a small hook so
 * the scan workspace does not need to know the Supabase SDK's shape.
 * `configured` mirrors `authFullyConfigured()` -- when it is false the hook
 * never touches the SDK at all, so a build with no sign-in env vars never even
 * calls `getSession()`.
 *
 * WHY THE STATE HERE IS SMALL AND THE REQUEST HELPER IS NOT.
 * The session the SDK holds can change underneath a mounted page: the access
 * token refreshes every hour, another tab can sign out, and a different Google
 * account can sign in. So the rendered `accessToken` is only ever a snapshot.
 * Anything that is about to talk to the API calls `getAccessToken()` instead,
 * which re-reads the SDK at that moment, can insist the live session still
 * belongs to the user the request was started for (`userId`), and can ask the
 * SDK for a refreshed session after the server rejected the old token
 * (`forceRefresh`). Callers key their own state on `userId`, never on the
 * token, so a routine token refresh does not look like an account switch.
 *
 * The session itself stays exactly where the SDK puts it (its default
 * storage, auto-refresh on). Nothing in this file stores, logs or re-exports a
 * token beyond handing it back to the caller that asked for it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { authFullyConfigured, getSupabaseBrowserClient } from "./supabase-browser";

export interface AuthSessionState {
  /** All three NEXT_PUBLIC_* sign-in env vars are set. */
  configured: boolean;
  /** True until the first session check resolves (only meaningful when configured). */
  loading: boolean;
  email: string | null;
  /** A snapshot for display/tests. Use `getAccessToken()` when making a request. */
  accessToken: string | null;
  userId: string | null;
}

export interface AccessTokenOptions {
  /** Only return a token if the live session still belongs to this user. */
  userId?: string | null;
  /** Ask Supabase for a refreshed session (used once after the API said 401). */
  forceRefresh?: boolean;
}

export interface AuthSession extends AuthSessionState {
  signOut: () => Promise<void>;
  /** The live access token right now, or null when there is no (matching) session. */
  getAccessToken: (options?: AccessTokenOptions) => Promise<string | null>;
}

export interface UseSupabaseSessionOptions {
  /**
   * The caller already has a session from a parent and only calls this hook
   * because hooks cannot be conditional. Nothing is subscribed or read.
   */
  skip?: boolean;
}

interface SessionLike {
  access_token?: string | null;
  user?: { id?: string | null; email?: string | null } | null;
}

type SessionFields = Omit<AuthSessionState, "configured">;

const EMPTY: Omit<SessionFields, "loading"> = { email: null, accessToken: null, userId: null };

function fieldsFrom(session: SessionLike | null | undefined): SessionFields {
  return {
    loading: false,
    email: session?.user?.email ?? null,
    accessToken: session?.access_token ?? null,
    userId: session?.user?.id ?? null,
  };
}

export function useSupabaseSession(options: UseSupabaseSessionOptions = {}): AuthSession {
  const configured = authFullyConfigured();
  const active = configured && !options.skip;
  const [state, setState] = useState<SessionFields>({ loading: active, ...EMPTY });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Every real state transition happens inside Supabase's own async callbacks
  // (`getSession().then(...)`, `onAuthStateChange`), never inline in the effect
  // body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Once any auth event has arrived it is newer than an in-flight
    // `getSession()`, so a late first read must never overwrite it.
    let eventSeen = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState(fieldsFrom(null));
      });
      return () => {
        cancelled = true;
      };
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || eventSeen) return;
        setState(fieldsFrom(data.session));
      })
      .catch(() => {
        // A failed first read is "not signed in", never an endless loading state.
        if (cancelled || eventSeen) return;
        setState(fieldsFrom(null));
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      eventSeen = true;
      if (cancelled) return;
      setState(fieldsFrom(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [active]);

  const getAccessToken = useCallback(async (opts: AccessTokenOptions = {}): Promise<string | null> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    try {
      let session: SessionLike | null | undefined;
      if (opts.forceRefresh) {
        const { data, error } = await supabase.auth.refreshSession();
        session = error ? null : data.session;
      } else {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }
      if (!session?.access_token) return null;
      if (opts.userId && session.user?.id !== opts.userId) return null;
      return session.access_token;
    } catch {
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch {
      // The SDK drops the local session even when its network call fails; the
      // state below makes the screen agree with that either way.
    }
    if (mounted.current) setState(fieldsFrom(null));
  }, []);

  return { configured, ...state, signOut, getAccessToken };
}
