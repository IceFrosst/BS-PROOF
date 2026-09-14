/*
 * The transport's request shape. Pure unit tests against a stubbed fetch --
 * no key, no network, no model call.
 *
 * What they pin is the 2026-09-14 failure: DeepSeek runs thinking mode by
 * default and bills it against the same max_tokens as the answer, so a label
 * read came back empty with finish_reason "length". Every call this app makes
 * is a one-shot pure function (invariant 2), so thinking is switched OFF at
 * the transport -- and dropped again if a provider rejects the field.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelCallError, chat } from "../lib/analyze/llm";

const KEY = "DEEPSEEK_API_KEY";
const previous = process.env[KEY];

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const ANSWER = { choices: [{ finish_reason: "stop", message: { content: "{}" } }] };

function bodyOf(call: [string, RequestInit]): Record<string, unknown> {
  return JSON.parse(String(call[1].body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (previous === undefined) delete process.env[KEY];
  else process.env[KEY] = previous;
});

describe("chat request body", () => {
  it("disables thinking by default", async () => {
    process.env[KEY] = "test-key";
    const fetchMock = vi.fn(async () => ok(ANSWER));
    vi.stubGlobal("fetch", fetchMock);

    await chat({ purpose: "label read", messages: [{ role: "user", content: "hi" }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock.mock.calls[0] as never);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.temperature).toBe(0);
  });

  it("keeps thinking when a caller asks for it", async () => {
    process.env[KEY] = "test-key";
    const fetchMock = vi.fn(async () => ok(ANSWER));
    vi.stubGlobal("fetch", fetchMock);

    await chat({ purpose: "label read", thinking: "enabled", messages: [{ role: "user", content: "hi" }] });

    expect(bodyOf(fetchMock.mock.calls[0] as never).thinking).toBeUndefined();
  });

  it("retries once without the optional fields when the provider 400s", async () => {
    process.env[KEY] = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unknown field: thinking", { status: 400 }))
      .mockResolvedValueOnce(ok(ANSWER));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chat({
      purpose: "compatibility",
      jsonMode: true,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = bodyOf(fetchMock.mock.calls[1] as never);
    expect(retry.thinking).toBeUndefined();
    expect(retry.response_format).toBeUndefined();
  });

  it("names chain-of-thought when the answer came back empty at the cap", async () => {
    process.env[KEY] = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ok({ choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "thinking..." } }] }),
      ),
    );

    await expect(
      chat({ purpose: "label read", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/reasoning_content/);
    await expect(
      chat({ purpose: "label read", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(ModelCallError);
  });
});
