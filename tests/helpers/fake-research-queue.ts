/*
 * An in-memory stand-in for the six bsproof_research_* Postgres functions in
 * docs/research-jobs.sql, layered over FakeSupabase (Supabase Auth + scan_runs).
 * It mirrors the SQL state machine line for line (owner filter, one job per
 * scan, open-job cap, lease token + expiry, compare-and-set complete/fail,
 * attempts) so route tests exercise the real status mapping. This file proves the
 * ROUTES, not the SQL: the SQL is executed by tests/research-jobs-sql-exec.test.ts
 * (PGlite), and tests/scan-research-queue-parity.test.ts runs one scripted history
 * through both this fake and the real file and requires identical answers.
 */
import { createHash, randomUUID } from "node:crypto";

import { FAKE_URL, FakeSupabase } from "./fake-supabase";

interface Job {
  id: string;
  owner_id: string;
  scan_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  prompt_version: string;
  target: unknown;
  attempts: number;
  lease_hash: string | null;
  lease_expires_at: number | null;
  result: unknown;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class FakeResearchQueue {
  jobs: Job[] = [];
  /** A fixed instant, advanced only by tests: leases never depend on the machine clock. */
  now = Date.UTC(2026, 9, 4, 12, 0, 0);
  rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  /** When set, every rpc answers 404 (migration not applied). */
  missing = false;

  constructor(readonly supabase: FakeSupabase) {}

  fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.startsWith(FAKE_URL) ? new URL(url).pathname : "";
    const m = /^\/rest\/v1\/rpc\/(bsproof_research_\w+)$/.exec(path);
    if (!m) return this.supabase.fetch(input, init);
    this.supabase.calls.push({ method: "POST", url, headers: {}, body: init?.body });
    if (this.missing) return new Response("{}", { status: 404 });
    const params = JSON.parse(String(init?.body)) as Record<string, unknown>;
    this.rpcCalls.push({ fn: m[1], params });
    const out = (this as unknown as Record<string, (p: Record<string, unknown>) => unknown>)[m[1]](params);
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  expireLease(id: string): void {
    const j = this.jobs.find((x) => x.id === id);
    if (j) j.lease_expires_at = this.now - 1000;
  }

  private view(j: Job) {
    return {
      id: j.id,
      scan_id: j.scan_id,
      status: j.status,
      prompt_version: j.prompt_version,
      target: j.target,
      created_at: j.created_at,
      updated_at: j.created_at,
      completed_at: null,
      failure_code: j.status === "failed" ? j.failure_code : null,
      result: j.status === "succeeded" ? j.result : null,
    };
  }

  bsproof_research_enqueue(p: Record<string, unknown>) {
    const existing = this.jobs.find((j) => j.owner_id === p.p_owner && j.scan_id === p.p_scan);
    if (existing) return { status: "existing", job: this.view(existing) };
    const open = this.jobs.filter((j) => j.owner_id === p.p_owner && (j.status === "queued" || j.status === "running")).length;
    if (open >= 3) return { status: "busy" };
    const j: Job = {
      id: randomUUID(),
      owner_id: String(p.p_owner),
      scan_id: String(p.p_scan),
      status: "queued",
      prompt_version: String(p.p_prompt_version),
      target: p.p_target,
      attempts: 0,
      lease_hash: null,
      lease_expires_at: null,
      result: null,
      failure_code: null,
      failure_message: null,
      created_at: new Date(this.now).toISOString(),
    };
    this.jobs.push(j);
    return { status: "created", job: this.view(j) };
  }

  bsproof_research_get(p: Record<string, unknown>) {
    const j = this.jobs.find((x) => x.id === p.p_id && x.owner_id === p.p_owner);
    return { job: j ? this.view(j) : null };
  }

  bsproof_research_claim() {
    for (const j of this.jobs) {
      if (j.status === "running" && (j.lease_expires_at ?? 0) <= this.now && j.attempts >= 3) {
        j.status = "failed";
        j.failure_code = "lease_expired";
        j.lease_hash = null;
      }
    }
    const j = this.jobs.find((x) => x.attempts < 3 && (x.status === "queued" || (x.status === "running" && (x.lease_expires_at ?? 0) <= this.now)));
    if (!j) return { job: null };
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    j.status = "running";
    j.attempts += 1;
    j.lease_hash = sha(token);
    j.lease_expires_at = this.now + 300_000;
    return { job: { id: j.id, lease_token: token, target: j.target, prompt_version: j.prompt_version } };
  }

  private current(p: Record<string, unknown>): Job | null {
    const j = this.jobs.find((x) => x.id === p.p_id);
    return j && j.lease_hash !== null && j.lease_hash === sha(String(p.p_lease_token ?? "")) ? j : null;
  }

  bsproof_research_heartbeat(p: Record<string, unknown>) {
    const j = this.current(p);
    if (!j || j.status !== "running" || (j.lease_expires_at ?? 0) <= this.now) return { status: "lease_invalid" };
    j.lease_expires_at = this.now + 300_000;
    return { status: "ok", lease_expires_at: new Date(j.lease_expires_at).toISOString() };
  }

  bsproof_research_complete(p: Record<string, unknown>) {
    const j = this.current(p);
    if (!j) return { status: "lease_invalid" };
    if (j.prompt_version !== "live-research-v0.2") return { status: "unsupported_prompt_version" };
    if (j.status === "succeeded") return { status: JSON.stringify(j.result) === JSON.stringify(p.p_result) ? "already_completed" : "conflict" };
    if (j.status !== "running" || (j.lease_expires_at ?? 0) <= this.now) return { status: "lease_invalid" };
    j.status = "succeeded";
    j.result = p.p_result;
    j.lease_expires_at = null;
    return { status: "completed" };
  }

  bsproof_research_fail(p: Record<string, unknown>) {
    const j = this.current(p);
    if (!j) return { status: "lease_invalid" };
    if (j.status === "succeeded") return { status: "already_completed" };
    if (j.status === "failed") return { status: "already_failed" };
    if (j.status !== "running" || (j.lease_expires_at ?? 0) <= this.now) return { status: "lease_invalid" };
    if (p.p_retryable === true && j.attempts < 3) {
      j.status = "queued";
      j.lease_hash = null;
      j.lease_expires_at = null;
      return { status: "requeued" };
    }
    j.status = "failed";
    j.failure_code = String(p.p_code);
    j.failure_message = typeof p.p_message === "string" ? p.p_message : null;
    j.lease_expires_at = null;
    return { status: "failed" };
  }
}
