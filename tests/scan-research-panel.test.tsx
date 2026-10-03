// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ledgerFromAudit, score } from "@/lib/evidence-ledger";
import { retainedAuditForProduct } from "@/lib/evidence-ledger/retained-audits";
import { ScanResearchPanel } from "@/components/scan-research-panel";

const base = retainedAuditForProduct({ ingredient: "creatine", form: "creatine_monohydrate", compoundDoseMg: 4000, servingsPerDay: 1, isMultiIngredient: false, actives: [{ name: "Creatine Monohydrate", compoundDoseMg: 4000 }], otherActives: [] })!.audit;
const audit = structuredClone(base);
audit.meta.model = "claude-sonnet-5-5"; audit.meta.prompt = "live-research-v0.2";
audit.could_not_access = ["Full paper unavailable"];
audit.outcomes = audit.outcomes.slice(0, 1).map((outcome) => ({ ...outcome, sentence: "Experimental model statement", strongest_study: "Model study note", strongest_doubt: "Model doubt", inventory: [{ ...outcome.inventory[0], id: "PMID:123456", access: "snippet" as const }] }));
const result = {
  audit,
  source_access: { version: "SourceAccessSummaryV2" as const, summary: { requests: 3, errors: 0, walls: 0, refusals: 0, search_snippets: 2, fetch_summaries: 1, original_documents: 0 as const }, inventory: [{ id: "PMID:123456", evidence_class: "derived_snippet" as const }], limitations: ["Snippets and summaries are not original papers."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV2" as const }
};
const job = (status: "queued" | "running" | "succeeded" | "failed", extra: object = {}) => ({ id: "job-1", scan_id: "saved-1", status, ...(status === "succeeded" ? { result } : {}), ...(status === "failed" ? { failure_code: "worker_failed" } : {}), ...extra });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let root: Root, host: HTMLDivElement;
const token = vi.fn(async () => "owner-token");
function mount(props: { scanId?: string | null; ownerId?: string | null; enabled?: boolean; lang?: "en" | "lt" } = {}) {
  act(() => root.render(createElement(ScanResearchPanel, { scanId: "saved-1", ownerId: "owner-1", lang: "en", getAccessToken: token, ...props })));
}
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); token.mockClear(); token.mockResolvedValue("owner-token"); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("live research panel", () => {
  it("automatically enqueues stored run ID and renders real queued→running→succeeded V2 result without affecting retained score", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ status: "ok", job: job("queued") })).mockResolvedValueOnce(response({ status: "ok", job: job("running") })).mockResolvedValueOnce(response({ status: "ok", job: job("succeeded") }));
    vi.stubGlobal("fetch", fetchMock);
    mount(); await settle();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/scan/research");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ scan_id: "saved-1" });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(host.textContent).toContain("PMID:123456: derived_snippet");
    expect(host.textContent).toContain("Full paper unavailable");
    expect(host.textContent).toContain("claude-sonnet-5-5");
    expect(host.textContent).toContain("does not change the retained scan score");
    expect(host.textContent).toContain("Changes scan score: no");
    for (const label of ["requests: 3", "errors: 0", "walls: 0", "refusals: 0", "search snippets: 2", "fetch summaries: 1", "original documents: 0"]) expect(host.textContent).toContain(label);
    const expected = score(ledgerFromAudit(audit.outcomes[0]));
    expect(host.textContent).toContain(`${expected.headline ?? "not scored"}/100`);
    expect(host.textContent).toContain(audit.outcomes[0].ledger.effective_daily_range);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(token).toHaveBeenCalledWith({ userId: "owner-1" });
  });
  it("never posts without a stored scan ID, disabled or unsaved", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    mount({ scanId: null }); await settle(); expect(host.textContent).toContain("no verified saved run ID");
    mount({ scanId: null, enabled: false }); await settle(); expect(host.textContent).toContain("Live research is off");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles failed without a useless rerun and displays safe failure code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: "ok", job: job("failed") })));
    mount(); await settle(); expect(host.textContent).toContain("worker_failed"); expect(host.querySelector("button")).toBeNull();
  });
  it.each([
    [503, "research_disabled", "Live research is off"], [503, "research_unavailable", "temporarily unavailable"], [429, "research_busy", "worker is busy"], [422, "scan_not_researchable", "not eligible"], [401, "unauthorized", "Sign in"]
  ])("shows honest API state for %s %s", async (status, code, phrase) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: code }, status)));
    mount(); await settle(); expect(host.textContent).toContain(phrase);
  });
  it("fails safely for missing server provenance and when no bearer token is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: "ok", job: { ...job("succeeded"), result: { ...result, provenance: null } } })));
    mount(); await settle(); expect(host.textContent).toContain("Research status could not be loaded"); expect(host.textContent).not.toContain("Research audit returned"); expect(host.querySelector("[data-testid=research-audit]")).toBeNull();
    act(() => root.unmount()); root = createRoot(host);
    token.mockResolvedValue(null); vi.stubGlobal("fetch", vi.fn());
    mount(); await settle(); expect(host.textContent).toContain("Sign in to view"); expect(fetch).not.toHaveBeenCalled();
  });
  it("shows LT verdict labels and notes that model prose is untranslated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status: "ok", job: job("succeeded") })));
    mount({ lang: "lt" }); await settle();
    expect(host.textContent).toContain("rodomas anglų kalba (neišverstas)");
    expect(host.textContent).toContain("Šis auditas nekeičia išsaugoto skenavimo balo.");
    expect(host.textContent).toContain("Keičia skenavimo balą: ne");
    expect(host.textContent).toContain("užklausos: 3");
    expect(host.textContent).toContain("klaidos: 0");
    expect(host.textContent).toContain("prieigos blokavimai: 0");
    expect(host.textContent).toContain("atsisakymai: 0");
    expect(host.textContent).toContain("paieškos ištraukos: 2");
    expect(host.textContent).toContain("gautų puslapių santraukos: 1");
    expect(host.textContent).toContain("originalūs dokumentai: 0");
    expect(host.textContent).not.toContain("does not change the retained scan score");
    expect(host.textContent).not.toContain("search snippets");
    expect(host.textContent).not.toContain(": yes");
    expect(host.textContent).not.toContain(": no");
    expect(host.textContent).not.toContain("Small benefit");
    expect(host.textContent).not.toContain("Moderate");
  });
  it("owner-bound token request and unmount abort polling without stale output", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(response({ status: "ok", job: job("queued") })); vi.stubGlobal("fetch", fetchMock);
    mount(); await settle(); expect(token).toHaveBeenCalledWith({ userId: "owner-1" });
    act(() => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(host.textContent).toBe("");
  });
  it("owner change aborts the prior request and never renders its late result", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce((_url: string, init: RequestInit) => new Promise<Response>((r) => { resolve = r; init.signal?.addEventListener("abort", () => {}); }));
    vi.stubGlobal("fetch", fetchMock);
    mount({ ownerId: "owner-old" }); await settle();
    const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    mount({ ownerId: "owner-new" }); await settle();
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolve(response({ status: "ok", job: job("succeeded") })));
    expect(token).toHaveBeenCalledWith({ userId: "owner-old" }); expect(token).toHaveBeenCalledWith({ userId: "owner-new" });
    expect(host.textContent).not.toContain("PMID:123456");
  });
});
