/*
 * An in-memory stand-in for the ONE Supabase project the scan API talks to:
 * Auth (`/auth/v1/user`), PostgREST (`/rest/v1/scan_runs`, `/rest/v1/scan_users`)
 * and Storage (`/storage/v1/object/...`), plus a canned DeepSeek chat endpoint.
 * No real network, no real keys -- tests install `fake.fetch` over `global.fetch`.
 *
 * It is deliberately HONEST about the parts the security tests depend on:
 *
 *   - `GET /rest/v1/scan_runs` actually APPLIES the `id=eq.` / `user_id=eq.` /
 *     `analysis=not.is.null` filters, the ordering, the limit and the `select`
 *     projection (including `a->b->>c` JSON paths, keyed by their last segment
 *     as PostgREST does). A route that forgets its owner filter therefore
 *     really does leak another user's row here, instead of passing by luck.
 *   - `POST /rest/v1/scan_runs` is a plain insert: an existing id is a 409 and
 *     is never merged or overwritten (as with the real table's primary key and
 *     no `on_conflict`). A `merge-duplicates` upsert is honoured, so a test can
 *     prove nobody asks for one.
 *   - Auth failures answer with a body full of provider text and the service
 *     key, so "no provider response / secret fragment reaches the caller" is a
 *     real assertion.
 */

export const FAKE_URL = "https://fake-project.supabase.co";
export const FAKE_KEY = "sb_service_role_super_secret_test_key";
export const PROVIDER_FRAGMENT = "PROVIDER_INTERNAL_FRAGMENT_do_not_leak";

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";
export const USER_C = "33333333-3333-4333-8333-333333333333";

export interface FakeUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: Array<Record<string, unknown>>;
}

export function googleUser(id: string, email: string | null): FakeUser {
  return {
    id,
    email,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: "Test Person", avatar_url: "https://example.test/a.png" },
    identities: [{ identity_id: `ident-${id}`, id: `g-${id}`, user_id: id, provider: "google", identity_data: { email } }],
  };
}

export function emailUser(id: string, email: string | null): FakeUser {
  return {
    id,
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [{ identity_id: `ident-${id}`, id, user_id: id, provider: "email", identity_data: { email } }],
  };
}

export interface FakeRun {
  id: string;
  created_at: string;
  source: string;
  status: string;
  error: string | null;
  request: Record<string, unknown>;
  analysis: Record<string, unknown> | null;
  app_version: Record<string, unknown>;
  image_bucket: string | null;
  image_path: string | null;
  image_mime_type: string | null;
  image_bytes: number | null;
  image_sha256: string | null;
  image_status: string | null;
  user_id?: string | null;
  user_email?: string | null;
}

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export type AuthMode = "ok" | "outage5xx" | "throw" | "garbage" | "badjson" | "hugebody";
export type StoreMode = "ok" | "down" | "throw" | "notjson" | "notarray" | "huge";

function lowerHeaders(raw: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  if (raw instanceof Headers) {
    raw.forEach((v, k) => (out[k.toLowerCase()] = v));
    return out;
  }
  if (Array.isArray(raw)) {
    for (const [k, v] of raw) out[k.toLowerCase()] = v;
    return out;
  }
  for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = String(v);
  return out;
}

function readPath(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return null;
  }
  return cur;
}

export class FakeSupabase {
  /** access token -> the user Supabase would report for it. */
  users = new Map<string, FakeUser>();
  runs: FakeRun[] = [];
  scanUsers = new Map<string, Record<string, unknown>>();
  storage = new Map<string, number>();
  calls: FakeCall[] = [];
  modelCalls = 0;

  authMode: AuthMode = "ok";
  /** Mode for GET /rest/v1/scan_runs only. Inserts are governed by `insertStatus`. */
  readMode: StoreMode = "ok";
  /** Force every scan_runs INSERT to this HTTP status (e.g. 500). */
  insertStatus: number | null = null;

  addUser(token: string, user: FakeUser): void {
    this.users.set(token, user);
  }

  addRun(run: Partial<FakeRun> & { id: string }): FakeRun {
    const full: FakeRun = {
      created_at: new Date().toISOString(),
      source: "manual",
      status: "scored",
      error: null,
      request: {},
      analysis: { schema_version: "ScanAnalysisV1", status: "scored", source: "manual" },
      app_version: { package_version: "0.0.0", git_sha: null, git_ref: null, deployment_id: null, vercel_env: null, url: null },
      image_bucket: null,
      image_path: null,
      image_mime_type: null,
      image_bytes: null,
      image_sha256: null,
      image_status: "not_applicable",
      ...run,
    };
    this.runs.push(full);
    return full;
  }

  callsTo(pattern: string): FakeCall[] {
    return this.calls.filter((c) => c.url.includes(pattern));
  }

  get nonGetRunWrites(): FakeCall[] {
    return this.calls.filter((c) => c.url.includes("/rest/v1/scan_runs") && c.method !== "GET");
  }

  fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = lowerHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    this.calls.push({ method, url, headers, body: init?.body });

    if (url.includes("deepseek.com") || url.includes("generativelanguage")) return this.model();
    if (!url.startsWith(FAKE_URL)) return new Response(`unexpected host: ${url}`, { status: 500 });

    const path = new URL(url).pathname;
    if (path === "/auth/v1/user") return this.auth(headers);
    if (path === "/rest/v1/scan_runs") return this.runsEndpoint(method, new URL(url), headers, init?.body);
    if (path === "/rest/v1/scan_users") return this.usersEndpoint(method, init?.body);
    if (path.startsWith("/storage/v1/object/")) return this.storageEndpoint(method, path, init?.body);
    return new Response(`unexpected path: ${path}`, { status: 500 });
  }) as typeof fetch;

  private model(): Response {
    this.modelCalls += 1;
    const label = {
      ingredient_vocab_id: null,
      form_vocab_id: null,
      compound_dose_mg: null,
      is_multi_ingredient: false,
      confidence: "low",
      evidence_spans: [],
      is_supplement_label: false, // stop right after stage 0 -- no further model calls to fake
    };
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(label) } }] }), { status: 200 });
  }

  private auth(headers: Record<string, string>): Response {
    if (headers.apikey !== FAKE_KEY) return new Response(JSON.stringify({ message: "No API key found in request" }), { status: 401 });
    if (this.authMode === "throw") throw new Error(`connect ECONNREFUSED ${PROVIDER_FRAGMENT}`);
    if (this.authMode === "outage5xx") return new Response(`upstream down ${PROVIDER_FRAGMENT} ${FAKE_KEY}`, { status: 503 });
    if (this.authMode === "garbage") return new Response(JSON.stringify({ hello: "not a user" }), { status: 200 });
    if (this.authMode === "badjson") return new Response(`<html>${PROVIDER_FRAGMENT}</html>`, { status: 200 });
    if (this.authMode === "hugebody") return new Response("x".repeat(200 * 1024), { status: 200 });
    const token = /^Bearer (.+)$/.exec(headers.authorization ?? "")?.[1] ?? "";
    const user = this.users.get(token);
    if (!user) {
      return new Response(
        JSON.stringify({ code: 401, error_code: "bad_jwt", msg: `invalid JWT: ${PROVIDER_FRAGMENT} ${FAKE_KEY}` }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ ...user, aud: "authenticated", role: "authenticated" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  private runsEndpoint(method: string, url: URL, headers: Record<string, string>, rawBody: unknown): Response {
    if (method === "POST") {
      if (this.insertStatus !== null) return new Response(`insert refused ${PROVIDER_FRAGMENT} ${FAKE_KEY}`, { status: this.insertStatus });
      const rows = JSON.parse(String(rawBody)) as FakeRun[];
      const merge = (headers.prefer ?? "").includes("merge-duplicates") || url.searchParams.has("on_conflict");
      for (const row of rows) {
        const existing = this.runs.findIndex((r) => r.id === row.id);
        if (existing >= 0) {
          if (!merge) return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), { status: 409 });
          this.runs[existing] = { ...this.runs[existing], ...row };
        } else {
          this.runs.push({ created_at: new Date().toISOString(), ...row });
        }
      }
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH" || method === "PUT" || method === "DELETE") {
      // The scan API must never issue these against scan_runs; the tests assert
      // on `nonGetRunWrites`. Answer like a permissive PostgREST would.
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (method !== "GET") return new Response("unsupported", { status: 405 });

    if (this.readMode === "down") return new Response(`store down ${PROVIDER_FRAGMENT} ${FAKE_KEY}`, { status: 500 });
    if (this.readMode === "throw") throw new Error(`socket hang up ${PROVIDER_FRAGMENT}`);
    if (this.readMode === "notjson") return new Response(`<html>${PROVIDER_FRAGMENT}</html>`, { status: 200 });
    if (this.readMode === "notarray") return new Response(JSON.stringify({ message: PROVIDER_FRAGMENT }), { status: 200 });
    if (this.readMode === "huge") return new Response("[" + "0,".repeat(3 * 1024 * 1024) + "0]", { status: 200 });

    const p = url.searchParams;
    let matched = this.runs.filter((r) => {
      const id = p.get("id");
      if (id?.startsWith("eq.") && r.id !== id.slice(3)) return false;
      const uid = p.get("user_id");
      if (uid?.startsWith("eq.") && (r.user_id ?? null) !== uid.slice(3)) return false;
      if (p.get("analysis") === "not.is.null" && r.analysis === null) return false;
      return true;
    });
    const order = p.get("order");
    if (order === "created_at.desc,id.desc") {
      matched = [...matched].sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
    }
    const total = matched.length;
    const limit = Number(p.get("limit"));
    const page = Number.isFinite(limit) && limit > 0 ? matched.slice(0, limit) : matched;
    const columns = (p.get("select") ?? "*").split(",");
    const projected = page.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        if (col === "*") Object.assign(out, row);
        else if (col.includes("->")) {
          const parts = col.split(/->>|->/);
          out[parts[parts.length - 1]] = readPath((row as unknown as Record<string, unknown>)[parts[0]], parts.slice(1));
        } else out[col] = (row as unknown as Record<string, unknown>)[col] ?? null;
      }
      return out;
    });
    const respHeaders: Record<string, string> = { "content-type": "application/json" };
    if ((headers.prefer ?? "").includes("count=exact")) {
      respHeaders["content-range"] = page.length ? `0-${page.length - 1}/${total}` : `*/${total}`;
    }
    return new Response(JSON.stringify(projected), { status: 200, headers: respHeaders });
  }

  private usersEndpoint(method: string, rawBody: unknown): Response {
    if (method === "POST") {
      for (const row of JSON.parse(String(rawBody)) as Array<{ user_id: string }>) {
        const prev = this.scanUsers.get(row.user_id);
        this.scanUsers.set(row.user_id, prev ? { ...prev, ...row } : { first_seen_at: "default-now", scans: 0, ...row });
      }
      return new Response(null, { status: 201 });
    }
    return new Response("[]", { status: 200 });
  }

  private storageEndpoint(method: string, path: string, rawBody: unknown): Response {
    if (method === "POST") {
      this.storage.set(path, (rawBody as { length?: number } | undefined)?.length ?? 0);
      return new Response(null, { status: 200 });
    }
    if (method === "DELETE") {
      this.storage.delete(path);
      return new Response(null, { status: 200 });
    }
    return new Response("unsupported", { status: 405 });
  }
}
