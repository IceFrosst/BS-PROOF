// @vitest-environment node
/*
 * Display translation (EN -> LT) through the one model boundary, with ZERO live
 * model calls: every model answer here is a fake `chatJson`.
 *
 * Pinned:
 *   - a translation is accepted only if every number token and every quoted span
 *     of the source survives unchanged; otherwise that item is null (keep English)
 *   - SIGNS, comparators, % and units are part of a number: dropping a minus,
 *     flipping < / >, mg -> g or losing a % is refused, however the rest reads
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
  TRANSLATE_MAX_BODY_BYTES,
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

describe("guardTranslation: sign, comparator, percent and unit are part of the number", () => {
  // [source, a faithful translation that must be ACCEPTED]
  const faithful: Array<[string, string]> = [
    ["SMD −0.31 (95% CI −0.52 to −0.10) in 12 trials.", "SMD −0.31 (95% PI −0.52 iki −0.10) 12 tyrimų."],
    ["SMD -0.31 (95% CI -0.52 to -0.10)", "SMD −0.31 (95 % PI −0.52 iki −0.10)"], // hyphen-minus <-> U+2212, spaced percent
    ["Effect was p<0.05 and I² = 73%.", "Poveikis buvo p < 0.05, o I² = 73 %."],
    ["Intakes of 10 mg/day (up to 1,000 mg) were used.", "Naudota 10 mg/dieną (iki 1,000 mg)."],
    ["Taken 5 mg, 2 weeks, in 2019.", "Vartota 5 mg, 2 savaites, 2019 m."],
    ["Dose 5-10 g/kg, BMI 25 kg/m².", "Dozė 5–10 g/kg, KMI 25 kg/m²."], // en dash for the range hyphen
    ["Blood pressure fell by 4 mmHg (≥ 5 considered clinical).", "Kraujospūdis sumažėjo 4 mmHg (≥5 laikoma kliniškai reikšminga)."],
    ["Vitamin D3 at 25 µg (1,000 IU) and 2.5 mL.", "Vitaminas D3 po 25 μg (1,000 IU) ir 2.5 ml."], // µ/μ, mL/ml
    ["Mean ±SD 4.2 ±1.1, n=24, ~50%, ≈3 kg", "Vidurkis ±SD 4.2 ±1.1, n = 24, ~50 %, ≈3 kg"],
  ];
  it.each(faithful)("accepts a faithful rendering: %s", (source, translated) => {
    expect(guardTranslation(source, translated)).toBe(translated);
  });

  // [name, source, a rendering that changes only the sign / comparator / % / unit]
  const refused: Array<[string, string, string]> = [
    ["a dropped minus (U+2212)", "SMD −0.31 (95% CI −0.52 to −0.10)", "SMD 0.31 (95% PI 0.52 iki 0.10)"],
    ["one dropped minus", "SMD −0.31 (95% CI −0.52 to −0.10)", "SMD −0.31 (95% PI 0.52 iki −0.10)"],
    ["a dropped hyphen-minus", "Change -4.5 points", "Pokytis 4.5 balo"],
    ["a minus turned into a plus", "Change −4.5 points", "Pokytis +4.5 balo"],
    ["a sign swapped between two numbers", "from −0.31 to 0.10", "nuo 0.31 iki −0.10"],
    ["a dropped plus", "Change +4.5 points", "Pokytis 4.5 balo"],
    ["a flipped comparator (< to >)", "p<0.05", "p>0.05"],
    ["a flipped comparator (> to <)", "Over 18 and >65 years excluded", "Virš 18 ir <65 metų neįtraukta"],
    ["a flipped comparator with spaces", "p < 0.05", "p > 0.05"],
    ["≤ turned into ≥", "ratio ≤1.2", "santykis ≥1.2"],
    ["≤ turned into <", "ratio ≤1.2", "santykis <1.2"],
    ["<= turned into >=", "ratio <=1.2", "santykis >=1.2"],
    ["a dropped comparator", "p<0.05", "p 0.05"],
    ["an added comparator", "n=24", "n<24"],
    ["= turned into <", "p=0.048", "p<0.048"],
    ["≈ dropped", "about ≈3 kg", "apie 3 kg"],
    ["± dropped", "4.2 ±1.1", "4.2 1.1"],
    ["mg turned into g", "10 mg", "10 g"],
    ["g turned into mg", "10 g daily", "10 mg per dieną"],
    ["mg turned into mcg", "400 mg", "400 mcg"],
    ["µg turned into mg", "25 µg", "25 mg"],
    ["a dropped unit", "Dose 10 mg", "Dozė 10"],
    ["a unit spelled out", "Dose 10 mg", "Dozė 10 miligramų"],
    ["mL turned into L", "2.5 mL", "2.5 l"],
    ["IU turned into mg", "1,000 IU", "1,000 mg"],
    ["a unit moved onto another number", "5 mg and 10 g", "5 g ir 10 mg"],
    ["kg/m² turned into kg", "BMI 25 kg/m²", "KMI 25 kg"],
    ["a dropped percent", "95% CI 0.12 to 0.55", "95 PI 0.12 iki 0.55"],
    ["a percent added", "Reduced by 20", "Sumažėjo 20 %"],
    ["a percent turned into a unit", "I² = 73%", "I² = 73 mg"],
    ["a range hyphen dropped", "Dose 5-10 g", "Dozė 5 10 g"],
    ["°C dropped", "stored at 25°C", "laikoma 25"],
  ];
  it.each(refused)("refuses %s", (_name, source, translated) => {
    expect(guardTranslation(source, translated)).toBeNull();
  });

  it("every single-token mutation of a signed/compared/united sentence is refused, and an unmutated copy is not", () => {
    const sources = [
      "Pooled SMD −0.31 (95% CI −0.52 to −0.10), I² = 73%, p<0.05, 4,000 mg/day for 12 weeks (≥ 5 kg gained).",
      "Change +4.5 mmHg, ≤1.2 ratio, 25 µg, 2.5 mL, ±0.3, ≈50%, 25°C.",
    ];
    // each swap changes exactly one attached sign/comparator/percent/unit
    const swaps: Array<[RegExp, string]> = [
      [/−/g, ""], [/−/, "+"], [/\+/, ""], [/p</, "p>"], [/≥ /, "≤ "], [/≤/, "≥"], [/±/, ""], [/≈/, ""],
      [/%/, ""], [/ mg/, " g"], [/ kg/, " mg"], [/ µg/, " mg"], [/ mL/, " L"], [/ mmHg/, " mm"], [/°C/, ""],
    ];
    for (const source of sources) {
      expect(guardTranslation(source, source)).toBe(source);
      let hit = 0;
      for (const [pattern, replacement] of swaps) {
        const mutated = source.replace(pattern, replacement);
        if (mutated === source) continue;
        hit += 1;
        expect(guardTranslation(source, mutated), `${pattern} -> "${replacement}"`).toBeNull();
      }
      expect(hit).toBeGreaterThanOrEqual(6);
    }
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

  it("reuses cache only within the same caller scope", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => `LT ${t}`));
    await translateTexts(["Same sentence."], { chatJson: fn, timeoutMs: 1000 }, "user-a");
    const sameUser = await translateTexts(["Same sentence.", "New sentence."], { chatJson: fn, timeoutMs: 1000 }, "user-a");
    expect(sameUser.translations).toEqual(["LT Same sentence.", "LT New sentence."]);
    expect(calls).toEqual([["Same sentence."], ["New sentence."]]);
  });

  it("does not let one caller poison another caller's translation", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => `${calls.length === 1 ? "A" : "B"} ${t}`));
    await translateTexts(["Shared sentence."], { chatJson: fn, timeoutMs: 1000 }, "user-a");
    const fromB = await translateTexts(["Shared sentence."], { chatJson: fn, timeoutMs: 1000 }, "user-b");
    expect(fromB.translations).toEqual(["B Shared sentence."]);
    expect(calls).toEqual([["Shared sentence."], ["Shared sentence."]]);
  });

  it("never caches a translation rejected by the guard", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => calls.length === 1 ? t.replace("5", "6") : `LT ${t}`));
    const first = await translateTexts(["Dose 5 g"], { chatJson: fn, timeoutMs: 1000 }, "user-a");
    const second = await translateTexts(["Dose 5 g"], { chatJson: fn, timeoutMs: 1000 }, "user-a");
    expect(first.translations).toEqual([null]);
    expect(second.translations).toEqual(["LT Dose 5 g"]);
    expect(calls).toEqual([["Dose 5 g"], ["Dose 5 g"]]);
  });

  it("bypasses reusable cache without a caller scope", async () => {
    const { fn, calls } = fakeChat((texts) => texts.map((t) => `${calls.length === 1 ? "first" : "second"} ${t}`));
    const first = await translateTexts(["Anonymous sentence."], { chatJson: fn, timeoutMs: 1000 });
    const second = await translateTexts(["Anonymous sentence."], { chatJson: fn, timeoutMs: 1000 });
    expect(first.translations).toEqual(["first Anonymous sentence."]);
    expect(second.translations).toEqual(["second Anonymous sentence."]);
    expect(calls).toHaveLength(2);
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
  const ENV = ["LABEL_ANALYZER_ENABLED", "DEEPSEEK_API_KEY", "VISION_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCAN_REQUIRE_AUTH"] as const;
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

  it("does not create an anonymous shared scope or accept one from the request body", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    translateSpy.mockResolvedValue({ status: "ok", translations: ["Labas"], prompt_version: "translate-lt-v1.0", model: "m", reason: null });
    const res = await post({ lang: "lt", texts: ["Hello"], cacheScope: "attacker" });
    expect(res.status).toBe(200);
    expect(translateSpy.mock.calls[0][2]).toBeUndefined();
  });

  it("answers a signed-in Google user and returns the model translator's guarded answer", async () => {
    process.env.SCAN_REQUIRE_AUTH = "1";
    process.env.SUPABASE_URL = FAKE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    process.env.DEEPSEEK_API_KEY = "k";
    translateSpy.mockResolvedValue({ status: "ok", translations: ["Labas", null], prompt_version: "translate-lt-v1.0", model: "m", reason: null });
    const res = await post({ lang: "lt", texts: ["Hello", "Dose 5 g"], cacheScope: "attacker" }, { authorization: "Bearer tok-a" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", translations: ["Labas", null], prompt_version: "translate-lt-v1.0" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy.mock.calls[0][0]).toEqual(["Hello", "Dose 5 g"]);
    expect(translateSpy.mock.calls[0][2]).toBe(USER_A);
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

  it("honours the LABEL_ANALYZER_ENABLED=0 kill switch like every model-spending scan route (503, no model work)", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    process.env.LABEL_ANALYZER_ENABLED = "0";
    try {
      const res = await post({ lang: "lt", texts: ["Hello"] });
      expect(res.status).toBe(503);
      expect((await res.json()).status).toBe("translator_unavailable");
      expect(translateSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.LABEL_ANALYZER_ENABLED;
    }
  });

  it("the kill switch does not open an anonymous path: the Google gate still answers first", async () => {
    process.env.SCAN_REQUIRE_AUTH = "1";
    process.env.SUPABASE_URL = FAKE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    process.env.DEEPSEEK_API_KEY = "k";
    process.env.LABEL_ANALYZER_ENABLED = "0";
    try {
      expect((await post({ lang: "lt", texts: ["Hello"] })).status).toBe(401);
    } finally {
      delete process.env.LABEL_ANALYZER_ENABLED;
    }
  });

  /** A request whose body is a stream of `chunks` with NO content-length (chunked / lying sender). */
  const streamed = async (chunks: string[], headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/scan/translate/route");
    const enc = new TextEncoder();
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= chunks.length) return controller.close();
        controller.enqueue(enc.encode(chunks[pulled++]));
      },
    });
    const request = new Request("http://test/api/scan/translate", { method: "POST", headers: { "content-type": "application/json", ...headers }, body, duplex: "half" } as RequestInit);
    const res = await POST(request);
    return { res, pulled };
  };

  it("caps the BODY in bytes while reading it, with no content-length at all, before parsing or any model work", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    const chunk = "x".repeat(32 * 1024);
    const { res, pulled } = await streamed(Array.from({ length: 40 }, () => chunk));
    expect(res.status).toBe(413);
    expect(translateSpy).not.toHaveBeenCalled();
    // it stopped reading near the cap instead of buffering all 1.3 MB
    expect(pulled * chunk.length).toBeLessThan(TRANSLATE_MAX_BODY_BYTES + 3 * chunk.length);
  });

  it("refuses a declared oversize body at once, and a body that lies about a small content-length", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    const declared = await post({ lang: "lt", texts: ["Hello"] }, { "content-length": String(TRANSLATE_MAX_BODY_BYTES + 1) });
    expect(declared.status).toBe(413);
    const lying = await streamed(["x".repeat(TRANSLATE_MAX_BODY_BYTES + 10)], { "content-length": "20" });
    expect(lying.res.status).toBe(413);
    expect(translateSpy).not.toHaveBeenCalled();
  });

  it("a streamed body within the cap is parsed and answered normally (multi-byte text counted in bytes)", async () => {
    process.env.DEEPSEEK_API_KEY = "k";
    translateSpy.mockResolvedValue({ status: "ok", translations: ["Labas"], prompt_version: "translate-lt-v1.0", model: "m", reason: null });
    const json = JSON.stringify({ lang: "lt", texts: ["Hello ąčęėįšųūž"] });
    const { res } = await streamed([json.slice(0, 10), json.slice(10)]);
    expect(res.status).toBe(200);
    expect(translateSpy.mock.calls[0][0]).toEqual(["Hello ąčęėįšųūž"]);
  });
});
