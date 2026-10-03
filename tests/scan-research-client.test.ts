import { describe, expect, it, vi } from "vitest";
import { researchWithCurrentToken, waitForResearch } from "@/lib/scan-research/client";

describe("live research owner client", () => {
  it("refreshes the bearer once after a 401 and retries the same request", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("expired").mockResolvedValueOnce("fresh");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 401 })).mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    const result = await researchWithCurrentToken("/api/scan/research", getToken, new AbortController().signal, "owner-1", { scan_id: "saved-id" });
    expect(result.response.status).toBe(200);
    expect(getToken).toHaveBeenNthCalledWith(1, { userId: "owner-1" });
    expect(getToken).toHaveBeenNthCalledWith(2, { userId: "owner-1", forceRefresh: true });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer expired" });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer fresh" });
    fetchMock.mockRestore();
  });
  it("cancels a pending poll wait on owner departure", async () => {
    const controller = new AbortController();
    const pending = waitForResearch(60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
