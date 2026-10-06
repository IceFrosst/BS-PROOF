import { afterEach, describe, expect, it, vi } from "vitest";

import { LEASE_SECONDS } from "@/lib/scan-research/contract";
import {
  RESEARCH_LEASE_SECONDS,
  RESEARCH_MAX_RESPONSE_BYTES,
  RESEARCH_REQUEST_TIMEOUT_MS,
  RESEARCH_RETRY_DELAYS_MS,
  ResearchTimeout,
  researchJobPath,
  researchLookupPath,
  forgetResearchJob,
  forgetResearchJobs,
  formatUtc,
  isResearchId,
  isStalled,
  knownResearchJob,
  missingFacts,
  noteResearchOwner,
  parseResearchJob,
  parseResearchResult,
  rememberResearchJob,
  researchRequest,
  researchWithCurrentToken,
  waitForResearch,
} from "@/lib/scan-research/client";

const SCAN = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";
const JOB = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const rawJob = (extra: Record<string, unknown> = {}) => ({ id: JOB, scan_id: SCAN, status: "queued", prompt_version: "live-research-v0.2", target: null, created_at: "2026-10-04T19:37:52.123456+00:00", updated_at: "2026-10-04T19:37:52.123456+00:00", completed_at: null, failure_code: null, result: null, ...extra });

afterEach(() => { vi.restoreAllMocks(); forgetResearchJobs(); noteResearchOwner(null); });

describe("live research owner client: transport", () => {
  it("refreshes the bearer once after a 401 and retries the same request", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("expired").mockResolvedValueOnce("fresh");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 401 })).mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    const result = await researchWithCurrentToken("/api/scan/research", getToken, new AbortController().signal, "owner-1", { scan_id: SCAN });
    expect(result.response.status).toBe(200);
    expect(getToken).toHaveBeenNthCalledWith(1, { userId: "owner-1" });
    expect(getToken).toHaveBeenNthCalledWith(2, { userId: "owner-1", forceRefresh: true });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer expired" });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer fresh" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", cache: "no-store" });
  });

  it("does not loop when the refresh hands back the same token, or no token", async () => {
    const same = vi.fn().mockResolvedValue("same");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(researchWithCurrentToken("/api/scan/research/x", same, new AbortController().signal, "owner-1")).rejects.toThrow("auth");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const none = vi.fn().mockResolvedValueOnce("t").mockResolvedValueOnce(null);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(researchWithCurrentToken("/api/scan/research/x", none, new AbortController().signal, "owner-1")).rejects.toThrow("auth");
    await expect(researchWithCurrentToken("/api/scan/research/x", vi.fn().mockResolvedValue(null), new AbortController().signal, "owner-1")).rejects.toThrow("auth");
  });

  it("reduces any reply to { status, created?, job? }: provider text, stacks and secrets are never kept", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ status: "research_failed", error: "boom sk-live-SECRET", stack: "at x (/srv/app.js:1)", detail: { token: "t" } }), { status: 502 }));
    const { json } = await researchRequest("/api/scan/research", "tok", new AbortController().signal, { scan_id: SCAN });
    expect(json).toEqual({ status: "research_failed" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok\nInjected <b>html</b>", job: 1 }), { status: 200 }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json.status).toBe("error");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not json at all", { status: 502 }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json).toEqual({ status: "error" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("[1,2]", { status: 200 }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json).toEqual({ status: "error" });
  });

  it("bounds the response it will read: a reply over the cap is an error, not parsed", async () => {
    const big = JSON.stringify({ status: "ok", job: { pad: "x".repeat(RESEARCH_MAX_RESPONSE_BYTES + 10) } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(big, { status: 200 }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json).toEqual({ status: "error" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-length": String(RESEARCH_MAX_RESPONSE_BYTES + 1) } }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json).toEqual({ status: "error" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok", job: rawJob() }), { status: 200 }));
    expect((await researchRequest("/api/scan/research/x", "tok", new AbortController().signal)).json.status).toBe("ok");
  });

  it("cancels a pending poll wait on owner departure, and never waits on an already-aborted signal", async () => {
    const controller = new AbortController();
    const pending = waitForResearch(60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(waitForResearch(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("live research owner client: ids, time, stall", () => {
  it("accepts only the strict UUID shape the server accepts, before any URL is built", () => {
    expect(isResearchId(SCAN)).toBe(true);
    expect(isResearchId(SCAN.toUpperCase())).toBe(true);
    for (const bad of ["saved-1", "", `${SCAN}/../x`, `${SCAN} `, `{${SCAN}}`, "00000000-0000-0000-0000-000000000000", 5, null, undefined]) expect(isResearchId(bad)).toBe(false);
  });

  it("prints a fixed-format UTC time from any ISO instant, and nothing from anything else", () => {
    expect(formatUtc("2026-10-04T19:37:52.123456+00:00")).toBe("2026-10-04 19:37 UTC");
    expect(formatUtc("2026-10-04T22:37:52+03:00")).toBe("2026-10-04 19:37 UTC");
    expect(formatUtc("2026-10-04")).toBeNull();
    expect(formatUtc("yesterday")).toBeNull();
    expect(formatUtc(null)).toBeNull();
  });

  it("mirrors the backend lease and calls a RUNNING job stalled only after that lease without a worker signal", () => {
    expect(RESEARCH_LEASE_SECONDS).toBe(LEASE_SECONDS);
    const at = Date.parse("2026-10-04T19:00:00Z");
    const running = { status: "running" as const, updated_at: "2026-10-04T19:00:00Z" };
    expect(isStalled(running, at + LEASE_SECONDS * 1000)).toBe(false);
    expect(isStalled(running, at + LEASE_SECONDS * 1000 + 1)).toBe(true);
    expect(isStalled({ ...running, status: "queued" }, at + 86_400_000)).toBe(false);
    expect(isStalled({ status: "succeeded", updated_at: running.updated_at }, at + 86_400_000)).toBe(false);
    expect(isStalled({ status: "running", updated_at: null }, at + 86_400_000)).toBe(false);
  });
});

describe("live research owner client: the job", () => {
  it("projects a well-formed job and refuses anything without two ids and a known status", () => {
    const job = parseResearchJob(rawJob({ status: "running", target: { fact_basis: "label" }, failure_code: "ignored_unless_failed", extra: "dropped" }));
    expect(job).toMatchObject({ id: JOB, scan_id: SCAN, status: "running", failure_code: null });
    expect(job).not.toHaveProperty("extra");
    for (const bad of [null, [], "x", rawJob({ id: "job-1" }), rawJob({ scan_id: "saved-1" }), rawJob({ status: "weird" }), rawJob({ status: "SUCCEEDED" }), { ...rawJob(), id: undefined }]) expect(parseResearchJob(bad)).toBeNull();
  });

  it("keeps only a safe failure code and only for a failed job; result only for a succeeded one", () => {
    expect(parseResearchJob(rawJob({ status: "failed", failure_code: "worker_failed" }))?.failure_code).toBe("worker_failed");
    expect(parseResearchJob(rawJob({ status: "failed", failure_code: "Traceback: sk-live-123 at /srv/x" }))?.failure_code).toBeNull();
    expect(parseResearchJob(rawJob({ status: "failed", failure_code: "x".repeat(81) }))?.failure_code).toBeNull();
    expect(parseResearchJob(rawJob({ status: "queued", result: { audit: 1 } }))?.result).toBeNull();
    expect(parseResearchJob(rawJob({ status: "succeeded", result: { audit: 1 } }))?.result).toEqual({ audit: 1 });
    expect(parseResearchJob(rawJob({ created_at: "not a time", updated_at: 5 }))).toMatchObject({ created_at: null, updated_at: null });
  });

  it("lists as missing exactly what the scan did not record; nothing is defaulted (no serving 1, no dose basis, no compound guess)", () => {
    const none = parseResearchJob(rawJob({ target: { fact_basis: "label", product: { brand: null, product_name: null }, ingredient: { vocab_id: "omega_3", label: "EPA/DHA" }, form: { vocab_id: null, label: null }, dose: { compound_per_serving_mg: null, printed_elemental_per_serving_mg: null, unit_as_printed: null }, servings_per_day: null, is_multi_ingredient: null } }))!.facts;
    expect(none).toMatchObject({ servingsPerDay: null, compoundPerServingMg: null, printedElementalPerServingMg: null, form: null, multiIngredient: null, ingredient: "EPA/DHA" });
    expect(missingFacts(none)).toEqual(["servings_per_day", "dose_per_serving", "form", "other_ingredients"]);
    const full = parseResearchJob(rawJob({ target: { fact_basis: "label", product: { brand: "Acme", product_name: "Mag" }, ingredient: { vocab_id: "magnesium", label: null }, form: { vocab_id: "magnesium_glycinate", label: null }, dose: { compound_per_serving_mg: 200, printed_elemental_per_serving_mg: null, unit_as_printed: "mg" }, servings_per_day: 2, is_multi_ingredient: false } }))!.facts;
    expect(missingFacts(full)).toEqual([]);
    expect(full).toMatchObject({ product: "Acme Mag", compoundPerServingMg: 200, printedElementalPerServingMg: null, servingsPerDay: 2, multiIngredient: false });
    // a printed elemental amount is a dose basis on its own; it is never turned into a compound amount
    const elemental = parseResearchJob(rawJob({ target: { ingredient: { label: "Magnesium" }, form: { label: "bisglycinate" }, dose: { printed_elemental_per_serving_mg: 200 }, servings_per_day: 1, is_multi_ingredient: false } }))!.facts;
    expect(elemental).toMatchObject({ compoundPerServingMg: null, printedElementalPerServingMg: 200 });
    expect(missingFacts(elemental)).toEqual([]);
    expect(missingFacts(null)).toEqual([]);
    // non-numbers, negatives and non-finite numbers are not facts
    expect(parseResearchJob(rawJob({ target: { servings_per_day: "2", dose: { compound_per_serving_mg: -5 } } }))!.facts).toMatchObject({ servingsPerDay: null, compoundPerServingMg: null });
  });
});

const validResult = () => ({
  audit: { meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.2" }, product: "P", ingredient: "I", form: "F", daily_dose: "D", could_not_access: ["Full paper unavailable"], outcomes: [{ name: "Sleep", sentence: "S", strongest_study: "ST", strongest_doubt: "DB", ledger: { effective_daily_range: "1-2 g" }, inventory: [{ id: "PMID:123456", access: "snippet" }] }] },
  source_access: { version: "SourceAccessSummaryV2", summary: { requests: 3, errors: 1, walls: 0, refusals: 0, search_snippets: 2, fetch_summaries: 1, original_documents: 0 }, inventory: [{ id: "PMID:123456", evidence_class: "derived_snippet" }], limitations: ["L"] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "a", classifier_version: "c", source_access_version: "SourceAccessV2" },
});

describe("live research owner client: the result (SourceAccessSummaryV2)", () => {
  it("projects the audit text, the seven counters and the server provenance", () => {
    const result = parseResearchResult(validResult())!;
    expect(result.source_access.summary).toEqual({ requests: 3, errors: 1, walls: 0, refusals: 0, search_snippets: 2, fetch_summaries: 1, original_documents: 0 });
    expect(result.audit.outcomes[0]).toMatchObject({ name: "Sleep", effective_daily_range: "1-2 g", inventory: [{ id: "PMID:123456", access: "snippet" }] });
    expect(result.provenance).toMatchObject({ affects_score: false, clinically_approved: false, human_verified: false });
  });

  it("is additive-tolerant: keys the backend adds to the same V2 version are ignored, never drawn", () => {
    const extended = validResult() as unknown as { source_access: { summary: Record<string, unknown>; [k: string]: unknown }; provenance: Record<string, unknown>; audit: { outcomes: Array<{ ledger: Record<string, unknown> }>; [k: string]: unknown } };
    extended.source_access.summary.http_403 = 4;
    extended.source_access.extra = "x";
    extended.provenance.extra = "y";
    extended.audit.extra = "z";
    extended.audit.outcomes[0].ledger.effectPoints = "3";
    const result = parseResearchResult(extended)!;
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/http_403|"extra"|effectPoints/);
  });

  it("fails closed on anything that would overstate what was done", () => {
    type Loose = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- a deliberately malformed copy of the result
    const mutate = (fn: (r: Loose) => void) => { const r = validResult() as Loose; fn(r); return parseResearchResult(r); };
    expect(mutate(() => undefined)).not.toBeNull();
    // a V1 summary, a missing/odd provenance, and a result that claims a score, approval or human check
    expect(mutate((r) => { r.source_access.version = "SourceAccessV1"; })).toBeNull();
    expect(mutate((r) => { r.provenance.source_access_version = "SourceAccessV1"; })).toBeNull();
    expect(mutate((r) => { r.provenance = null; })).toBeNull();
    expect(mutate((r) => { r.provenance.affects_score = true; })).toBeNull();
    expect(mutate((r) => { r.provenance.clinically_approved = true; })).toBeNull();
    expect(mutate((r) => { r.provenance.human_verified = true; })).toBeNull();
    // an original document, or an inventory item above a snippet, would claim a paper was opened
    expect(mutate((r) => { r.source_access.summary.original_documents = 1; })).toBeNull();
    expect(mutate((r) => { r.audit.outcomes[0].inventory[0].access = "abstract"; })).toBeNull();
    expect(mutate((r) => { r.audit.outcomes[0].inventory[0].access = "full_text"; })).toBeNull();
    expect(mutate((r) => { r.source_access.inventory[0].evidence_class = "full_text"; })).toBeNull();
    // malformed counters
    for (const bad of [-1, 1.5, "3", null, Number.NaN]) expect(mutate((r) => { r.source_access.summary.walls = bad; })).toBeNull();
    expect(mutate((r) => { delete r.source_access.summary.refusals; })).toBeNull();
    // malformed audit
    expect(mutate((r) => { r.audit.outcomes[0].sentence = 5; })).toBeNull();
    expect(mutate((r) => { r.audit.could_not_access = [1]; })).toBeNull();
    expect(mutate((r) => { r.audit = null; })).toBeNull();
    expect(parseResearchResult(null)).toBeNull();
    expect(parseResearchResult([])).toBeNull();
  });
});

describe("live research owner client: a request has a ceiling and a lookup has a path", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("builds the lookup and job paths from ids only (the scan id is encoded, nothing else is added)", () => {
    expect(researchLookupPath(SCAN)).toBe(`/api/scan/research?scan_id=${SCAN}`);
    expect(researchJobPath(JOB)).toBe(`/api/scan/research/${JOB}`);
    expect(researchLookupPath("a&b=c")).toBe("/api/scan/research?scan_id=a%26b%3Dc");
  });

  it("a request that never answers ends in a ResearchTimeout at the ceiling and cancels the fetch; the caller's own abort is NOT a timeout", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_u, init) => { seen = init?.signal as AbortSignal; return new Promise<Response>(() => undefined); }); // ignores the abort on purpose
    const pending = researchRequest("/api/scan/research/x", "tok", new AbortController().signal);
    const caught = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RESEARCH_REQUEST_TIMEOUT_MS - 1);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await caught;
    expect(error).toBeInstanceOf(ResearchTimeout);
    expect((error as Error).message).toBe("timeout");
    expect(seen?.aborted).toBe(true);

    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation((_u, init) => new Promise<Response>((_r, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); }));
    const left = researchRequest("/api/scan/research/x", "tok", controller.signal).catch((e: unknown) => e);
    controller.abort();
    const aborted = await left;
    expect(aborted).not.toBeInstanceOf(ResearchTimeout);
    expect((aborted as Error).name).toBe("AbortError");
  });

  it("a body that stalls after the headers is cut at the ceiling too", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream({ start() { /* never enqueues, never closes */ } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
    const caught = researchRequest("/api/scan/research/x", "tok", new AbortController().signal).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RESEARCH_REQUEST_TIMEOUT_MS);
    expect(await caught).toBeInstanceOf(ResearchTimeout);
  });

  it("a token read that hangs is a ResearchTimeout as well, and the timer is cleared when the request finishes in time", async () => {
    vi.useFakeTimers();
    const hung = vi.fn(() => new Promise<string | null>(() => undefined));
    const caught = researchWithCurrentToken("/api/scan/research/x", hung, new AbortController().signal, "owner-1").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RESEARCH_REQUEST_TIMEOUT_MS);
    expect(await caught).toBeInstanceOf(ResearchTimeout);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    const done = await researchWithCurrentToken("/api/scan/research/x", async () => "tok", new AbortController().signal, "owner-1");
    expect(done.json.status).toBe("ok");
    expect(vi.getTimerCount()).toBe(0); // nothing is left ticking
  });

  it("the automatic retry waits are finite, increasing and bounded: a transient failure is never retried for ever", () => {
    expect(RESEARCH_RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(3);
    expect([...RESEARCH_RETRY_DELAYS_MS]).toEqual([...RESEARCH_RETRY_DELAYS_MS].sort((a, b) => a - b));
    expect(Math.max(...RESEARCH_RETRY_DELAYS_MS)).toBeLessThanOrEqual(60_000);
    expect(Math.min(...RESEARCH_RETRY_DELAYS_MS)).toBeGreaterThanOrEqual(1000);
  });
});

describe("live research owner client: what this page remembers", () => {
  it("remembers a job id per (owner, scan) in memory only, and forgets it on request or when the owner changes", () => {
    noteResearchOwner("owner-a");
    rememberResearchJob("owner-a", SCAN, JOB);
    expect(knownResearchJob("owner-a", SCAN)).toBe(JOB);
    expect(knownResearchJob("owner-b", SCAN)).toBeNull();
    noteResearchOwner("owner-a");
    expect(knownResearchJob("owner-a", SCAN)).toBe(JOB);
    forgetResearchJob("owner-a", SCAN);
    expect(knownResearchJob("owner-a", SCAN)).toBeNull();
    rememberResearchJob("owner-a", SCAN, JOB);
    noteResearchOwner("owner-b");
    expect(knownResearchJob("owner-a", SCAN)).toBeNull();
    rememberResearchJob("owner-b", SCAN, JOB);
    noteResearchOwner(null);
    expect(knownResearchJob("owner-b", SCAN)).toBeNull();
  });
});
