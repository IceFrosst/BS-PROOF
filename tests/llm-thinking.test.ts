/*
 * 2026-09-22: the label read switches DeepSeek's default thinking mode OFF.
 * The current `deepseek-flash` model (which also serves the retired
 * `deepseek-v4-flash-vision-exp` id) thinks by default and its reasoning counts
 * against max_tokens; a busy label spent all 8192 tokens in reasoning_content
 * and returned no content. These tests pin the request shape with a fake fetch
 * -- zero model calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chat, supportsThinkingToggle } from "@/lib/analyze/llm";

type Body = Record<string, unknown>;

const ENV_KEYS = ["DEEPSEEK_API_KEY", "VISION_API_KEY", "GEMINI_API_KEY", "MODEL_API_URL", "VISION_API_URL"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function okResponse(content: string | null, extra: Body = {}): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: content ? "stop" : "length", message: { content, ...extra } }],
      usage: { prompt_tokens: 10, completion_tokens: 8192 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function captureFetch(responses: Response[]): { bodies: Body[] } {
  const bodies: Body[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Body);
      const next = responses.shift();
      if (!next) throw new Error("unexpected extra request");
      return next;
    }),
  );
  return { bodies };
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DEEPSEEK_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("DeepSeek thinking switch", () => {
  it("is offered only for DeepSeek's own endpoint", () => {
    expect(supportsThinkingToggle("https://api.deepseek.com/chat/completions")).toBe(true);
    expect(supportsThinkingToggle("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")).toBe(false);
    expect(supportsThinkingToggle("not a url")).toBe(false);
  });

  it("sends thinking: disabled to DeepSeek when the caller asks", async () => {
    const { bodies } = captureFetch([okResponse('{"ok":true}')]);
    await chat({ purpose: "label read", messages: [{ role: "user", content: "x" }], jsonMode: true, disableThinking: true });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
  });

  it("leaves other providers' requests unchanged", async () => {
    process.env.MODEL_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const { bodies } = captureFetch([okResponse('{"ok":true}')]);
    await chat({ purpose: "label read", messages: [{ role: "user", content: "x" }], disableThinking: true });
    expect(bodies[0]).not.toHaveProperty("thinking");
  });

  it("does not touch thinking for callers that did not ask", async () => {
    const { bodies } = captureFetch([okResponse('{"ok":true}')]);
    await chat({ purpose: "company", messages: [{ role: "user", content: "x" }] });
    expect(bodies[0]).not.toHaveProperty("thinking");
  });

  it("retries once without the optional parameters when the endpoint answers 400", async () => {
    const { bodies } = captureFetch([new Response("bad param", { status: 400 }), okResponse('{"ok":true}')]);
    await chat({ purpose: "label read", messages: [{ role: "user", content: "x" }], jsonMode: true, disableThinking: true });
    expect(bodies).toHaveLength(2);
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    expect(bodies[1]).not.toHaveProperty("thinking");
    expect(bodies[1]).not.toHaveProperty("response_format");
  });

  it("names the token budget in the empty-content error", async () => {
    captureFetch([okResponse(null, { reasoning_content: "long thoughts" })]);
    await expect(
      chat({ purpose: "label read", maxTokens: 8192, messages: [{ role: "user", content: "x" }], disableThinking: true }),
    ).rejects.toThrow("8192 of 8192 output tokens used; thinking disabled");
  });
});
