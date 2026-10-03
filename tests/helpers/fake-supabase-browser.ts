/*
 * A controllable stand-in for `@/lib/auth/supabase-browser`, shared by the
 * sign-in / workspace / history tests. It is the ONE module that would
 * otherwise talk to a real Supabase project; everything above it (the session
 * hook, the Google button, <ScanFlow>, <ScanHistory>, <ScanWorkspace>) runs for
 * real in jsdom.
 *
 * Use it from a test file:
 *
 *   vi.mock("@/lib/auth/supabase-browser", async () => (await import("./helpers/fake-supabase-browser")).fakeAuth.module());
 *   const { fakeAuth } = await import("./helpers/fake-supabase-browser");
 *
 * Plain functions only (no vi.fn): the vitest config sets `mockReset: true`,
 * which would wipe a vi.fn implementation before each test.
 */

export interface FakeUser {
  id: string;
  email: string;
}

export interface FakeSession {
  user: FakeUser;
  access_token: string;
}

type Listener = (event: string, session: FakeSession | null) => void;

export const USER_A: FakeUser = { id: "user-a", email: "a@example.com" };
export const USER_B: FakeUser = { id: "user-b", email: "b@example.com" };

export function sessionFor(user: FakeUser, token = `token-${user.id}`): FakeSession {
  return { user, access_token: token };
}

class FakeAuth {
  configured = false;
  session: FakeSession | null = null;
  listeners: Listener[] = [];
  /** While set, `getSession()` does not resolve until it is released. */
  private sessionGate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;
  getSessionFails = false;
  /** What `refreshSession()` yields; `undefined` = a rejected refresh. */
  refreshTo: FakeSession | null | undefined = undefined;
  refreshCalls = 0;
  signOutCalls = 0;
  signInCalls: Array<{ provider: string; token: string }> = [];
  /** Result of `signInWithIdToken`: set `error` to simulate Supabase refusing the credential. */
  idTokenError: { message: string } | null = null;
  idTokenThrows = false;
  unsubscribed = 0;
  private idTokenGate: Promise<void> | null = null;
  private releaseIdTokenGate: (() => void) | null = null;

  /** Make `signInWithIdToken()` hang until `releaseIdToken()` (a slow Supabase). */
  holdIdToken() {
    this.idTokenGate = new Promise<void>((resolve) => {
      this.releaseIdTokenGate = resolve;
    });
  }

  releaseIdToken() {
    this.releaseIdTokenGate?.();
    this.idTokenGate = null;
    this.releaseIdTokenGate = null;
  }

  reset() {
    this.configured = false;
    this.session = null;
    this.listeners = [];
    this.sessionGate = null;
    this.releaseGate = null;
    this.getSessionFails = false;
    this.refreshTo = undefined;
    this.refreshCalls = 0;
    this.signOutCalls = 0;
    this.signInCalls = [];
    this.idTokenError = null;
    this.idTokenThrows = false;
    this.unsubscribed = 0;
    this.idTokenGate = null;
    this.releaseIdTokenGate = null;
  }

  /** Make the next `getSession()` calls hang until `releaseSession()`. */
  holdSession() {
    this.sessionGate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  releaseSession() {
    this.releaseGate?.();
    this.sessionGate = null;
    this.releaseGate = null;
  }

  /** Change the live session and tell every subscriber, like the SDK does. */
  setSession(next: FakeSession | null, event = next ? "SIGNED_IN" : "SIGNED_OUT") {
    this.session = next;
    for (const listener of [...this.listeners]) listener(event, next);
  }

  readonly client = {
    auth: {
      getSession: async () => {
        if (this.sessionGate) await this.sessionGate;
        if (this.getSessionFails) throw new Error("storage unavailable");
        return { data: { session: this.session } };
      },
      onAuthStateChange: (listener: Listener) => {
        this.listeners.push(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.unsubscribed += 1;
                this.listeners = this.listeners.filter((l) => l !== listener);
              },
            },
          },
        };
      },
      signOut: async () => {
        this.signOutCalls += 1;
        this.setSession(null, "SIGNED_OUT");
        return { error: null };
      },
      refreshSession: async () => {
        this.refreshCalls += 1;
        if (this.refreshTo === undefined) return { data: { session: null }, error: { message: "refresh failed" } };
        if (this.refreshTo) this.setSession(this.refreshTo, "TOKEN_REFRESHED");
        return { data: { session: this.refreshTo }, error: null };
      },
      signInWithIdToken: async (credentials: { provider: string; token: string }) => {
        this.signInCalls.push(credentials);
        if (this.idTokenGate) await this.idTokenGate;
        if (this.idTokenThrows) throw new Error("network down");
        if (this.idTokenError) return { data: { session: null, user: null }, error: this.idTokenError };
        const session = sessionFor(USER_A, "token-from-google");
        this.setSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      },
    },
  };

  /** The mock module body for `vi.mock("@/lib/auth/supabase-browser", ...)`. */
  module() {
    return {
      authFullyConfigured: () => this.configured,
      supabaseUrl: () => (this.configured ? "https://example.supabase.co" : null),
      supabaseAnonKey: () => (this.configured ? "anon-key" : null),
      googleClientId: () => (this.configured ? "test-client-id.apps.googleusercontent.com" : null),
      getSupabaseBrowserClient: () => (this.configured ? this.client : null),
      resetSupabaseBrowserClientForTests: () => {},
    };
  }
}

export const fakeAuth = new FakeAuth();

/* ------------------------------------------------------------ fake Google -- */

export interface FakeGoogle {
  initializeCalls: Array<{ client_id: string }>;
  renderCalls: number;
  /** Deliver a credential the way Google Identity Services would. */
  deliver: (credential: string | undefined) => void;
}

/** Install `window.google.accounts.id`, as if the GIS script had loaded. */
export function installFakeGoogle(options: { renderThrows?: boolean } = {}): FakeGoogle {
  let callback: ((resp: { credential?: string }) => void) | null = null;
  const fake: FakeGoogle = {
    initializeCalls: [],
    renderCalls: 0,
    deliver: (credential) => callback?.({ credential }),
  };
  window.google = {
    accounts: {
      id: {
        initialize: (config) => {
          fake.initializeCalls.push({ client_id: config.client_id });
          callback = config.callback;
        },
        renderButton: (parent) => {
          fake.renderCalls += 1;
          if (options.renderThrows) throw new Error("render failed");
          const button = document.createElement("div");
          button.setAttribute("data-fake-google-button", "true");
          parent.appendChild(button);
        },
      },
    },
  };
  return fake;
}

export function removeFakeGoogle(): void {
  delete window.google;
  document.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]').forEach((node) => node.remove());
}
