import type { Page, Route } from "@playwright/test";

/*
 * Browser-side stand-ins for the two third parties the sign-in flow talks to, so
 * a build with fake public sign-in env can run the Google-required flows end to
 * end in a real browser with ZERO real network, credentials or model calls:
 *
 *   - the Google Identity Services script (a button whose click delivers a fake
 *     credential), and
 *   - Supabase Auth's token endpoint (turns that credential into a session).
 *
 * Shared by tests/e2e/scan-workspace.spec.ts (/scan) and
 * tests/e2e/tester-auth.spec.ts (/tester).
 */

export const SUPABASE = "https://e2e.supabase.invalid";

export async function mockGoogle(page: Page) {
  await page.route("https://accounts.google.com/gsi/client", (route: Route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.google = { accounts: { id: {
          initialize: function (cfg) { window.__gsiCallback = cfg.callback; },
          renderButton: function (parent) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = "Sign in with Google"; b.setAttribute("data-e2e-google", "1");
            b.onclick = function () { window.__gsiCallback({ credential: "e2e-fake-credential" }); };
            parent.appendChild(b);
          }
        } } };`,
    }),
  );
}

export function sessionBody(token: string, id = "e2e-user", email = "e2e@example.com") {
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "e2e-refresh",
    user: { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" },
  };
}

/** `userId` / `email` default to the shared fake owner; a test that needs a real-looking owner id (the reload checkpoint only accepts UUIDs) passes its own. */
export async function mockSupabase(page: Page, state: { exchange: "ok" | "fail"; userId?: string; email?: string }) {
  await page.route(`${SUPABASE}/auth/v1/**`, (route) => {
    const url = route.request().url();
    if (url.includes("grant_type=id_token")) {
      return state.exchange === "ok"
        ? route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionBody("e2e-token", state.userId, state.email)) })
        : route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant", error_description: "Unacceptable audience in id_token" }) });
    }
    if (url.includes("/logout")) return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
}

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
