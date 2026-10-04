// @vitest-environment node
/*
 * ResearchJobV1 target derivation, and the static (text-level) safety properties of
 * docs/research-jobs.sql (applied BY HAND, ONCE, to a Supabase project shared
 * with other apps). The text checks here are only a tripwire: the file's BEHAVIOUR
 * is proven by executing it in tests/research-jobs-sql-exec.test.ts (PGlite, with a
 * mutation suite). Also pins that no model client is reachable from the queue code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildResearchTarget, type ResearchTargetV1 } from "@/lib/scan-research/target";
import { liveResearchEnabled } from "@/lib/scan-research/contract";
import { plainJsonProblem } from "@/lib/scan-research/result";

const photo = (label: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schema_version: "ScanAnalysisV1",
  status: "scored",
  source: "photo",
  label,
  ...extra,
});

describe("buildResearchTarget", () => {
  it("reads a photo label as printed, keeps exact numbers, and leaves unknowns null (no servings or weight inferred)", () => {
    const out = buildResearchTarget(
      photo(
        {
          ingredient_vocab_id: "vitamin_d",
          ingredient_label_text: "Vitamin D3\u0000\n(cholecalciferol)",
          form_vocab_id: null,
          compound_dose_mg: 0.025,
          printed_elemental_dose_mg: 0.02,
          dose_unit_as_printed: "mcg",
          servings_per_day: null,
          is_multi_ingredient: true,
          other_actives: ["Vitamin K2"],
          actives: [
            { name: "Vitamin D3", compound_dose_mg: 0.025, printed_elemental_dose_mg: 0.015, dose_unit_as_printed: "mcg", form_text: null },
            { name: "Vitamin K2", compound_dose_mg: "0.1", dose_unit_as_printed: null, form_text: "MK-7" },
          ],
          brand: "Acme",
          product_name: null,
          // not part of a job: never forwarded
          warnings_printed: ["x"],
          evidence_spans: ["secret span"],
          _meta: { model: "m" },
        },
        {
          product: {
            elemental_dose_mg: { low: 0.025, high: 0.025, basis: "as printed" },
            scored_dose_mg: 0.025,
            scored_dose_basis: "per_serving",
          },
        },
      ),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const t = out.target;
    expect(t.fact_basis).toBe("label");
    expect(t.ingredient).toEqual({ vocab_id: "vitamin_d", label: "Vitamin D3 (cholecalciferol)" });
    expect(t.dose.compound_per_serving_mg).toBe(0.025);
    expect(t.dose.printed_elemental_per_serving_mg).toBe(0.02); // unchanged, no conversion
    expect(t.dose.daily_elemental_mg).toBeNull(); // per_serving basis is not a daily figure
    expect(t.servings_per_day).toBeNull();
    expect(t.is_multi_ingredient).toBe(true);
    expect(t.actives).toEqual([
      { name: "Vitamin D3", compound_per_serving_mg: 0.025, printed_elemental_per_serving_mg: 0.015, unit_as_printed: "mcg", form_text: null },
      { name: "Vitamin K2", compound_per_serving_mg: null, printed_elemental_per_serving_mg: null, unit_as_printed: null, form_text: "MK-7" }, // a string "0.1" is not coerced
    ]);
    expect(t.handling.component_evidence_is_not_blend_efficacy).toBe(true);
    expect(JSON.stringify(t)).not.toMatch(/secret span|warnings_printed|_meta/);
  });

  it("reads the producer field printed_elemental_dose_mg (top level and per active) into the contract key, unconverted", () => {
    const out = buildResearchTarget(
      photo({
        ingredient_vocab_id: "magnesium",
        ingredient_label_text: "Magnesium",
        compound_dose_mg: null,
        printed_elemental_dose_mg: 200,
        dose_unit_as_printed: "mg",
        servings_per_day: null,
        is_multi_ingredient: false,
        other_actives: [],
        actives: [{ name: "Magnesium (as magnesium glycinate)", compound_dose_mg: null, printed_elemental_dose_mg: 200, dose_unit_as_printed: "mg", form_text: "glycinate" }],
        // a contract-named key on the producer side is NOT the producer field: ignored
        printed_elemental_per_serving_mg: 999,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.target.dose.printed_elemental_per_serving_mg).toBe(200);
    expect(out.target.dose.compound_per_serving_mg).toBeNull(); // no compound figure is made up from the elemental one
    expect(out.target.dose.elemental_per_serving_mg).toBeNull();
    expect(out.target.actives).toEqual([
      { name: "Magnesium (as magnesium glycinate)", compound_per_serving_mg: null, printed_elemental_per_serving_mg: 200, unit_as_printed: "mg", form_text: "glycinate" },
    ]);
    expect(Object.keys(out.target.dose)).toContain("printed_elemental_per_serving_mg");
    expect(JSON.stringify(out.target)).not.toContain("printed_elemental_dose_mg");
    expect(JSON.stringify(out.target)).not.toContain("999");
  });

  it("an absent, legacy, mistyped or negative elemental figure is null; a typed entry never carries one", () => {
    const base = { ingredient_vocab_id: "magnesium", compound_dose_mg: 200, servings_per_day: null };
    for (const bad of [undefined, null, "200", -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = buildResearchTarget(photo({ ...base, printed_elemental_dose_mg: bad, actives: [{ name: "Magnesium", compound_dose_mg: 200, printed_elemental_dose_mg: bad }] }));
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(out.target.dose.printed_elemental_per_serving_mg, String(bad)).toBeNull();
      expect(out.target.actives?.[0].printed_elemental_per_serving_mg, String(bad)).toBeNull();
    }
    const legacy = buildResearchTarget(photo({ ...base, actives: [{ name: "Magnesium", compound_dose_mg: 200 }] }));
    expect(legacy.ok && legacy.target.dose.printed_elemental_per_serving_mg).toBeNull();
    expect(legacy.ok && legacy.target.dose.compound_per_serving_mg).toBe(200); // compound figure is not converted
    const manual = buildResearchTarget({
      schema_version: "ScanAnalysisV1",
      status: "scored",
      source: "manual",
      input: { ingredient: "magnesium", ingredient_label: "Magnesium", form: null, form_label: null, dose_per_serving: { value: 200, unit: "mg", mg: 200, printed_elemental_dose_mg: 150, printed_elemental_per_serving_mg: 150 }, servings_per_day: 1 },
    });
    expect(manual.ok && manual.target.dose.printed_elemental_per_serving_mg).toBeNull();
    expect(manual.ok && manual.target.dose.compound_per_serving_mg).toBe(200);
  });

  it("passes an explicit daily regimen through only when the scan scored on one", () => {
    const out = buildResearchTarget(
      photo(
        { ingredient_vocab_id: "magnesium", ingredient_label_text: "Magnesium", compound_dose_mg: 200, servings_per_day: 2 },
        { product: { elemental_dose_mg: { low: 28, high: 28, basis: "t" }, scored_dose_mg: 56, scored_dose_basis: "daily" } },
      ),
    );
    expect(out.ok && out.target.servings_per_day).toBe(2);
    expect(out.ok && out.target.dose.daily_elemental_mg).toBe(56);
  });

  it("non-finite, negative or mistyped numbers become null, never a coerced value", () => {
    const out = buildResearchTarget(
      photo({ ingredient_vocab_id: "x", compound_dose_mg: Number.POSITIVE_INFINITY, servings_per_day: -1, is_multi_ingredient: "yes" }),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.target.dose.compound_per_serving_mg).toBeNull();
      expect(out.target.servings_per_day).toBeNull();
      expect(out.target.is_multi_ingredient).toBeNull();
    }
  });

  it("a typed entry says nothing about other actives: unknown, not 'single ingredient'", () => {
    const out = buildResearchTarget({
      schema_version: "ScanAnalysisV1",
      status: "scored",
      source: "manual",
      input: { ingredient: "creatine", ingredient_label: "Creatine", form: "creatine_monohydrate", form_label: "Creatine monohydrate", dose_per_serving: null, servings_per_day: 1 },
    });
    expect(out.ok && out.target.is_multi_ingredient).toBeNull();
    expect(out.ok && out.target.actives).toBeNull();
    expect(out.ok && out.target.servings_per_day).toBe(1);
  });

  it("refuses scans with no supplement identity", () => {
    for (const analysis of [
      null,
      "x",
      { status: "label_unreadable", source: "photo", label: {} },
      { status: "not_a_supplement_label", source: "photo", label: { ingredient_vocab_id: "x" } },
      { status: "scored", source: "photo", label: { ingredient_vocab_id: null, ingredient_label_text: null } },
      { status: "scored", source: "photo" },
      { status: "scored", source: "other", label: { ingredient_vocab_id: "x" } },
    ]) {
      expect(buildResearchTarget(analysis).ok, JSON.stringify(analysis)).toBe(false);
    }
  });
});

describe("shared TS/Python target fixture", () => {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "research-target-v1.json"), "utf8")) as {
    cases: Array<{ name: string; analysis: unknown; target: unknown; daily_known: boolean; blend: boolean }>;
  };

  it("every fixture target is exactly what buildResearchTarget derives from its saved scan (the Python worker contract tests run on these)", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(7);
    for (const c of fixture.cases) expect(buildResearchTarget(c.analysis), c.name).toEqual({ ok: true, target: c.target });
  });

  it("the fixture's daily_known / blend flags follow only what the scan itself recorded (nothing is defaulted)", () => {
    for (const c of fixture.cases) {
      const t = (buildResearchTarget(c.analysis) as { ok: true; target: ResearchTargetV1 }).target;
      const daily = typeof t.servings_per_day === "number" || typeof t.dose.daily_elemental_mg === "number";
      const blend = t.is_multi_ingredient === true || (t.actives?.length ?? 0) > 1 || (t.other_actives?.length ?? 0) > 0;
      expect({ name: c.name, daily, blend }).toEqual({ name: c.name, daily: c.daily_known, blend: c.blend });
    }
  });
});

describe("misc contract helpers", () => {
  it("SCAN_LIVE_RESEARCH_ENABLED is off unless explicitly on", () => {
    expect(liveResearchEnabled({})).toBe(false);
    for (const v of ["", "0", "false", "off", "enabled", "tru", " 2 "]) expect(liveResearchEnabled({ SCAN_LIVE_RESEARCH_ENABLED: v }), v).toBe(false);
    for (const v of ["1", "true", "ON", " yes "]) expect(liveResearchEnabled({ SCAN_LIVE_RESEARCH_ENABLED: v }), v).toBe(true);
  });

  it("plainJsonProblem rejects non-finite numbers, NUL, and runaway depth", () => {
    expect(plainJsonProblem({ a: [1, 2, { b: "ok" }] })).toBeNull();
    expect(plainJsonProblem({ a: NaN })).toMatch(/finite/);
    expect(plainJsonProblem({ a: Infinity })).toMatch(/finite/);
    expect(plainJsonProblem({ a: "x\u0000" })).toMatch(/NUL/);
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(plainJsonProblem(deep)).toMatch(/deeply/);
  });
});

const RAW = readFileSync(join(process.cwd(), "docs", "research-jobs.sql"), "utf8");
/** Comments removed, string literals kept (the guard and the trigger carry their messages in literals). */
const WITH_LITERALS = RAW.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").toLowerCase();
const CODE = RAW.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").replace(/'(?:[^']|'')*'/g, "''").toLowerCase();

describe("docs/research-jobs.sql on a shared Supabase project", () => {
  it("is additive and touches only its own objects", () => {
    for (const forbidden of [/\bdrop\s/, /\bdelete\s+from\b/, /\btruncate\b/, /create\s+extension/, /create\s+(?:or\s+replace\s+)?policy/, /create\s+role/, /\balter\s+role\b/, /\bauth\./, /storage\./, /\bscan_runs\b/, /\bscan_users\b/, /alter\s+default\s+privileges/]) {
      expect(CODE, String(forbidden)).not.toMatch(forbidden);
    }
    for (const m of CODE.matchAll(/(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table|on\s+table|create\s+index(?:\s+if\s+not\s+exists)?\s+\w+\s+on|insert\s+into|update|from)\s+(public\.\w+)/g)) {
      expect(m[1], m[0]).toBe("public.bsproof_research_jobs");
    }
    for (const m of CODE.matchAll(/create\s+or\s+replace\s+function\s+(public\.\w+)/g)) expect(m[1]).toMatch(/^public\.bsproof_research_/);
  });

  it("guards against adopting foreign objects before creating anything", () => {
    expect(CODE.indexOf("$guard$")).toBeGreaterThan(-1);
    expect(CODE.indexOf("$guard$")).toBeLessThan(CODE.indexOf("create table"));
    expect(WITH_LITERALS).toContain("did not create it");
  });

  it("is private: RLS on, no policy, every table privilege revoked, even from service_role", () => {
    expect(CODE).toMatch(/alter table public\.bsproof_research_jobs enable row level security/);
    expect(CODE).toMatch(/revoke all on table public\.bsproof_research_jobs from public, anon, authenticated, service_role/);
    expect(CODE).not.toMatch(/grant\s+(?:all|select|insert|update|delete)\b/);
  });

  it("every API function is SECURITY DEFINER with a pinned search_path and EXECUTE only for service_role", () => {
    const fns = ["enqueue", "get", "claim", "heartbeat", "complete", "fail"];
    for (const f of fns) {
      const name = `public.bsproof_research_${f}`;
      const def = new RegExp(`create or replace function ${name}\\([^)]*\\)[\\s\\S]*?\\$fn\\$;?`).exec(CODE)?.[0] ?? "";
      expect(def, f).toMatch(/security definer/);
      expect(def, f).toMatch(/set search_path = pg_catalog, pg_temp\b/);
      expect(def, f).not.toMatch(/set search_path = pg_catalog, public/);
      expect(CODE, f).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(CODE, f).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
    expect(CODE).toMatch(/create or replace function public\.bsproof_research_view[\s\S]*?stable[\s\S]*?set search_path = pg_catalog/);
    expect(WITH_LITERALS).toContain("index % already exists outside bs-proof research jobs");
    expect(WITH_LITERALS).toContain("trigger % already exists on another relation");
    expect([...CODE.matchAll(/grant execute on function/g)]).toHaveLength(fns.length);
    for (const to of CODE.matchAll(/grant execute on function [^;]*? to (\w+);/g)) expect(to[1]).toBe("service_role");
  });

  it("complete rejects a missing or different SourceAccessSummaryV2 version (null cannot bypass the check)", () => {
    const complete = /create or replace function public\.bsproof_research_complete\([^)]*\)[\s\S]*?comment on function/.exec(WITH_LITERALS)?.[0] ?? "";
    expect(complete).toMatch(/\(p_result->'source_access'->>'version'\) is distinct from 'sourceaccesssummaryv2'/);
    expect(complete).not.toMatch(/->>'version'\s*<>/);
  });

  it("claims atomically, hashes lease tokens, and makes completion a compare-and-set", () => {
    expect(CODE).toMatch(/for update skip locked/);
    expect(CODE).toMatch(/sha256\(convert_to\(token/);
    expect(CODE).not.toMatch(/^\s+lease_token\s+text/m); // only a hash column exists
    expect(CODE).toMatch(/unique \(owner_id, scan_id\)/);
    expect(CODE).toMatch(/lease_expires_at > now\(\)/);
    expect(WITH_LITERALS).toMatch(/identity and target are immutable/);
    expect(WITH_LITERALS).toMatch(/a finished job is final/);
  });
});

describe("no model is reachable from the queue code", () => {
  const dirs = ["lib/scan-research", "app/api/scan/research"];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) files.push(p);
    }
  };
  dirs.forEach((d) => walk(join(process.cwd(), d)));

  it("imports no analyzer/model module and calls no model host", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
      for (const i of imports) expect(i, f).not.toMatch(/lib\/analyze|llm|vision|anthropic|openai|deepseek|grok/i);
      expect(src, f).not.toMatch(/api\.deepseek|api\.anthropic|api\.openai|generativelanguage/i);
    }
  });
});
