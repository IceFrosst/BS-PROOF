import { afterEach, describe, expect, it, vi } from "vitest";

import { endpoint, textModel, visionModel } from "@/lib/analyze/llm";

// A copied .env.example sets every variable to "" -- that must mean "use the
// default", not "send the request to an empty URL" (seen 2026-10-03:
// "could not reach the model API: TypeError: Failed to parse URL from").
describe("blank model-transport env vars fall back to the defaults", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the DeepSeek endpoint and default models when the vars are blank", () => {
    vi.stubEnv("MODEL_API_URL", "");
    vi.stubEnv("VISION_API_URL", "  ");
    vi.stubEnv("LABEL_MODEL", "");
    vi.stubEnv("TEXT_MODEL", "");
    expect(endpoint()).toBe("https://api.deepseek.com/chat/completions");
    expect(visionModel()).toBe("deepseek-flash");
    expect(textModel()).toBe("deepseek-chat");
  });

  it("still honours a value that is actually set", () => {
    vi.stubEnv("MODEL_API_URL", "");
    vi.stubEnv("VISION_API_URL", "https://example.test/v1/chat/completions");
    vi.stubEnv("LABEL_MODEL", "some-vision-model");
    expect(endpoint()).toBe("https://example.test/v1/chat/completions");
    expect(visionModel()).toBe("some-vision-model");
  });
});
