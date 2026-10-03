"use client";

export type SourceAccessSummaryV2 = { version: "SourceAccessSummaryV2"; summary: { requests: number; errors: number; walls: number; refusals: number; search_snippets: number; fetch_summaries: number; original_documents: 0 }; inventory: Array<{ id: string; evidence_class: "derived_snippet" }>; limitations: string[] };
export type ResearchProvenance = { evidence_status: string; clinically_approved: boolean; human_verified: boolean; affects_score: boolean; runner: string; billing: string; model: string; prompt_version: string; cli_version: string; adapter_version: string; classifier_version: string; source_access_version: "SourceAccessV2" };
export type ResearchResultV2 = { audit: unknown; source_access: SourceAccessSummaryV2; provenance: ResearchProvenance };
export type LiveResearchJob = { id: string; scan_id: string; status: "queued" | "running" | "succeeded" | "failed"; target?: { product?: string; ingredient?: string }; failure_code?: string; result?: ResearchResultV2 };
export type ResearchReply = { status: string; job?: LiveResearchJob };

export async function researchRequest(path: string, token: string, signal: AbortSignal, body?: unknown): Promise<{ response: Response; json: ResearchReply }> {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal });
  let json: ResearchReply = { status: "error" };
  try { json = await response.json() as ResearchReply; } catch { /* expose only a safe generic error */ }
  return { response, json };
}

export async function researchWithCurrentToken(path: string, getToken: (options?: { userId?: string; forceRefresh?: boolean }) => Promise<string | null>, signal: AbortSignal, ownerId: string, body?: unknown) {
  let token = await getToken({ userId: ownerId });
  if (!token) throw new Error("auth");
  let result = await researchRequest(path, token, signal, body);
  if (result.response.status === 401) {
    token = await getToken({ userId: ownerId, forceRefresh: true });
    if (!token) throw new Error("auth");
    result = await researchRequest(path, token, signal, body);
  }
  return result;
}

export const RESEARCH_POLL_MS = 2500;
export function waitForResearch(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}
