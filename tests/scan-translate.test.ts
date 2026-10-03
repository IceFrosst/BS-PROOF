// @vitest-environment node
/*
 * Display translation (EN -> LT) through the one model boundary, with ZERO live
 * model calls: every model answer here is a fake `chatJson`.
 *
 * Pinned:
 *   - a translation is accepted only if every number token and every quoted span
 *     of the source survives unchanged; otherwise that item is null (keep English)
 *   - a misaligned answer (wrong length) is trusted for nothing
 *   - results are cached under the prompt version, so a repeated string costs no call
 *   - the model is asked through llm.ts only (no fetch, no other boundary)
 *   - the prompt file states the rules the guard enforces
 *   - POST /api/scan/translate sits behind the same Google gate as /api/scan and
 *     refuses bad bodies before any model work
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatJsonFn } from "@/lib/analyze/llm";
import {
  TRANSLATE_MAX_ITEMS,
  TRANSLATE_PROMPT_VERSION,
  clearTranslationCache,
  guardTranslation,
  translateTexts,
} from "@/lib/analyze/translate";
import { FAKE_KEY, FAKE_URL, FakeSupabase, USER_A, googleUser } from "./helpers/fake-supabase";

const ROOT = process.cwd();

function fakeChat(answer: (texts: string[]) => string[] | Error) {
  const calls: string[][] = [];
  const fn = (async (request: { messages: Array<{ role: string; content: string }>; schemaFile: string }) => {
    expect(request.schemaFile).toBe("translate.json");
    const user = request.messages.find((m) => m.role === "user");
    const texts = (JSON.parse(String(user?.content)) as { texts: string[] }).texts;
    calls.push(texts);
    const result = answer(texts);
    if (result instanceof Error) throw result;
    return { value: { translations: result }, meta: { model: "fake-text", text: "", backend: "fake", elapsed_s: 0, input_tokens: null, output_tokens: null, finish_reason: "stop" } };
  }) as unknown as ChatJsonFn;
  return { fn, calls };
}

beforeEach(() => clearTranslationCache());

describe("guardTranslation", () => {
  it("accepts a faithful translation and trims it", () => {
    expect(guardTranslation("Egger's test was significant (p = 0.048).", "  Eggerio testas buvo reikšmingas (p = 0.048). ")).toBe("Eggerio testas buvo reikšmingas (p = 0.048).");
  });

  it.each([
    ["a changed decimal", "CI 2.39-4.81 kg", "PI 2,39-4,81 kg"],
    ["a dropped number", "Dose 5 g for 12 weeks", "Dozė 5 g"],
    ["an added number", "Dose 5 g", "Dozė 5 g 7 dienas"],
    ["a rounded dose", "4,000 mg per day", "4000 mg per dieną"],
    ["a changed identifier", "PMID 12345678", "PMID 12345679"],
  ])("rejects %s", (_name, source, translated) => {
    expect(guardTranslation(source, translated)).toBeNull();
  });

  it("requires quoted source text to be copied verbatim", () => {
    const source = 'The authors wrote "no significant difference was observed" in 2019.';
    expect(guardTranslation(source, 'Autoriai 2019 m. rašė "no significant difference was observed".')).not.toBeNull();
    expect(guardTranslation(source, 'Autoriai 2019 m. rašė „reikšmingo skirtumo nepastebėta“.')).toBeNull();
    expect(guardTranslation('Quote “abc def” here', 'Citata „abc def“ čia')).not.toBeNull();
  });

  it("rejects non-strings, empties and absurd lengths", () => {
    expect(guardTranslation("Hello there", undefined)).toBeNull();
    expect(guardTranslation("Hello there", "   ")).toBeNull();
    expect(guardTranslation("Hi", "x".repeat(500))).toBeNull();
  });
});

describe("translateTexts", () => {
  it("returns guarded translations, nulls for rejected items, and asks the model once", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => (t.includes("0.5") ? t.replace("0.5", "0,5") : `LT ${t}`)));
    const out = await translateTexts(["Takes 5 g daily.", "Effect 0.5 kg."], { chatJson: fn, timeoutMs: 1000 });
    expect(out.status).toBe("ok");
    expect(out.translations).toEqual(["LT Takes 5 g daily.", null]);
    expect(out.prompt_version).toBe(TRANSLATE_PROMPT_VERSION);
    expect(out.model).toBe("fake-text");
    expect(calls).toHaveLength(1);
  });

  it("trusts nothing from an answer of the wrong length", async () => {
    const { fn } = fakeChat((texts) => texts.slice(1).map((t) => `LT ${t}`));
    const out = await translateTexts(["One.", "Two."], { chatJson: fn, timeoutMs: 1000 });
    expect(out.translations).toEqual([null, null]);
  });

  it("caches per prompt version: the second request makes no model call", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => `LT ${t}`));
    await translateTexts(["Same sentence."], { chatJson: fn, timeoutMs: 1000 });
    const again = await translateTexts(["Same sentence.", "New sentence."], { chatJson: fn, timeoutMs: 1000 });
    expect(again.translations).toEqual(["LT Same sentence.", "LT New sentence."]);
    expect(calls).toEqual([["Same sentence."], ["New sentence."]]);
  });

  it("degrades to 'keep English' when no provider is configured or the model fails", async () => {
    const none = await translateTexts(["Hello."], { chatJson: null, timeoutMs: 1000 });
    expect(none).toMatchObject({ status: "unavailable", translations: [null], reason: "no model provider configured" });
    const failing = fakeChat(() => new Error("boom"));
    const failed = await translateTexts(["Hello."], { chatJson: failing.fn, timeoutMs: 1000 });
    expect(failed).toMatchObject({ status: "unavailable", translations: [null] });
  });
});

describe("prompt and boundary", () => {
  it("prompts/translate.md states the rules the guard enforces", () => {
    const prompt = fs.readFileSync(path.join(ROOT, "prompts", "translate.md"), "utf8");
    expect(prompt).toContain("Copy every number exactly");
    expect(prompt).toContain("decimal POINT");
    expect(prompt).toContain("Quoted text stays original");
    expect(prompt).toContain("Do not change the meaning");
    expect(prompt).toContain("Product names, brand names");
    expect(prompt).toContain("never feeds a score");
    expect(TRANSLATE_PROMPT_VERSION).toMatch(/^translate-lt-v\d+\.\d+$/);
  });

  it("the translator reaches a model only through lib/analyze/llm.ts", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib", "analyze", "translate.ts"), "utf8");
    expect(source).toContain('from "./llm"');
    expect(source).not.toMatch(/\bfetch\(|chat\/completions|api\.deepseek/);
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", "translate.json"), "utf8"));
    expect(schema.properties.translations.maxItems).toBe(TRANSLATE_MAX_ITEMS);
  });
});

describe("POST /api/scan/translate", () => {
  const ENV = ["DEEPSEEK_API_KEY", "VISION_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH"] as const;
  const saved = { ...process.env };
  const originalFetch = global.fetch;
  let fake: FakeSupabase;
  const translateSpy = vi.fn();

  beforeEach(() => {
    for (const key of ENV) delete process.env[key];
    fake = new FakeSupabase();
    fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
    global.fetch = fake.fetch;
    translateSpy.mockReset();
    vi.resetModules();
    vi.doMock("@/lib/analyze/translate", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/analyze/translate")>();
      return { ...actual, translateTexts: translateSpy };
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.doUnmock("@/lib/analyze/translate");
    for (const key of ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const post = async (body: unknown, headers: Record<string, string> = {}, raw?: string) => {
    const { POST } = await import("@/app/api/scan/translate/route");
    return POST(new Request("http://test/api/scan/translate", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) }));
  };

  it("refuses an anonymous caller where Google sign-in is required, before the body is read or a model is called", async () => {
    process.env.SCAN_REQUIRE_AUTH = "1";
    process.env.SUPABASE_URL = FAKE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    process.env.DEEPSEEK_API_KEY = "k";
    const res = await post({ lang: "lt", texts: ["Hello"] });
    expect(res.status).toBe(401);
    expect(translateSpy).not.toHaveBeenCalled();
    const bad = await post(null, { authorization: "Bearer not-a-real-token" }, "not json");
    expect(bad.status).toBe(401);
  });

  it("answers a signed-in Google user and returns the model translator's guarded answer", async () => {
    process.env.SCAN_REQUIRE_AUTH = "1";
    process.env.SUPABASE_URL = FAKE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    process.env.DEEPSEEK_API_KEY = "k";
    translateSpy.mockResolvedValue({ status: "ok", translations: ["Labas", null], prompt_version: "translate-lt-v1.0", model: "m", reason: null });
    const res = await post({ lang: "lt", texts: ["Hello", "Dose 5 g"] }, { authorization: "Bearer tok-a" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", translations: ["Labas", null], prompt_version: "translate-lt-v1.0" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy.mock.calls[0][0]).toEqual(["Hello", "Dose 5 g"]);
  });

  it.each([
    ["not json", undefined, "{{", 400],
    ["another language", { lang: "de", texts: ["x"] }, undefined, 400],
    ["no texts", { lang: "lt", texts: [] }, undefined, 400],
    ["too many", { lang: "lt", texts: Array.from({ length: TRANSLATE_MAX_ITEMS + 1 }, () => "x") }, undefined, 400],
    ["a non-string", { lang: "lt", texts: [1] }, undefined, 400],
    ["an oversize item", { lang: "lt", texts: ["x".repeat(4001)] }, undefined, 400],
    ["too much in total", { lang: "lt", texts: Array.from({ length: 12 }, () => "x".repeat(3000)) }, undefined, 413],
  ])("rejects %s before any model work", async (_name, body, raw, status) => {
    process.env.DEEPSEEK_API_KEY = "k";
    const res = await post(body, {}, raw);
    expect(res.status).toBe(status);
    expect(translateSpy).not.toHaveBeenCalled();
  });

  it("says translator_unavailable (503) when no model provider is configured", async () => {
    const res = await post({ lang: "lt", texts: ["Hello"] });
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("translator_unavailable");
    expect(translateSpy).not.toHaveBeenCalled();
  });
});
