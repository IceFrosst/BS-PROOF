/*
 * Score a PRODUCT (ingredient + form + dose) against retained runs, at request
 * time, in the serverless runtime. Port of pipeline/product_score.py — same
 * refusals, same recompute discipline, same shape of answer.
 *
 * WHAT IS RECOMPUTED AND WHAT IS NOT (SCORING_MODEL v12): the dose term is the
 * product's closeness to the range where benefit occurred — a property of the
 * tub, so it is recomputed here per upload. Effect verdict, form strength and
 * confidence come from the retained artifact UNCHANGED. No formula is invented
 * here; composite/doseFactorFor are the pinned ports in ./scoring.
 *
 * THE REFUSALS ARE THE DESIGN, not error handling:
 *   form_not_scored      this form has no run — another form's arc would answer
 *                        a different question at full confidence
 *   not_scored           no usable run for the ingredient at all
 *   recompute_refused    the artifact predates arcs.form.strength; inverting it
 *                        out of the rounded composite invents +/-0.005 precision
 *   invalid runs, demo   never answer — run_statuses marks them, and the demo
 *                        fixture is additionally caught by name
 */
import fs from "node:fs";
import path from "node:path";

import { composite, doseFactorFor, doseMatchFor, verdictLabel, type DoseBand } from "./scoring";

const ROOT = process.cwd();
const RUNS_DIR = path.join(ROOT, "reports", "runs");
const STATUSES = path.join(ROOT, "reports", "run_statuses.json");

const UNUSABLE_STATUSES = new Set(["invalid"]);

type Json = Record<string, unknown>;

function readJson(filePath: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Json;
  } catch {
    return null;
  }
}

function statuses(): Json {
  return readJson(STATUSES) ?? {};
}

function statusFor(runId: string, all: Json): Json {
  const runs = (all.runs ?? {}) as Json;
  const entry = runs[runId];
  if (entry && typeof entry === "object") return entry as Json;
  const fallback = all.default;
  return fallback && typeof fallback === "object" ? (fallback as Json) : { status: "experimental" };
}

/** Every retained dashboard artifact, newest first. */
function artifacts(): Array<Json & { _path: string }> {
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(RUNS_DIR)
      .filter((n) => n.endsWith("_dashboard.json"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
  const out: Array<Json & { _path: string }> = [];
  for (const name of names) {
    const data = readJson(path.join(RUNS_DIR, name));
    if (data && Array.isArray(data.ecu_rows) && data.ecu_rows.length) {
      out.push({ ...data, _path: name });
    }
  }
  return out;
}

/** A synthetic fixture must never answer a product question. */
function isDemo(artifact: Json): boolean {
  const run = (artifact.run ?? {}) as Json;
  const product = (artifact.product ?? {}) as Json;
  return (
    String(run.mode ?? "").startsWith("demo") ||
    String(product.ingredient ?? "").startsWith("demo") ||
    String(product.form ?? "").startsWith("demo")
  );
}

export interface AvailableProduct {
  ingredient: string;
  form: string;
  run_id: string;
  status: string | null;
  public_claims_allowed: boolean;
}

export function availableProducts(): AvailableProduct[] {
  const all = statuses();
  const seen = new Map<string, AvailableProduct>();
  for (const art of artifacts()) {
    if (isDemo(art)) continue;
    const runId = String(((art.run ?? {}) as Json).id ?? "");
    const status = statusFor(runId, all);
    if (UNUSABLE_STATUSES.has(String(status.status ?? "").toLowerCase())) continue;
    const product = (art.product ?? {}) as Json;
    const ing = product.ingredient;
    const form = product.form;
    if (!ing || !form) continue;
    const key = `${String(ing)}|${String(form)}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      ingredient: String(ing),
      form: String(form),
      run_id: runId,
      status: (status.status as string) ?? null,
      public_claims_allowed: Boolean(status.public_claims_allowed),
    });
  }
  return [...seen.values()].sort((a, b) =>
    `${a.ingredient}|${a.form}`.localeCompare(`${b.ingredient}|${b.form}`),
  );
}

function pickArtifact(ingredient: string, form: string): { art: Json | null; status: Json } {
  const all = statuses();
  for (const art of artifacts()) {
    if (isDemo(art)) continue;
    const product = (art.product ?? {}) as Json;
    if (String(product.ingredient) !== ingredient || String(product.form) !== form) continue;
    const runId = String(((art.run ?? {}) as Json).id ?? "");
    const status = statusFor(runId, all);
    if (UNUSABLE_STATUSES.has(String(status.status ?? "").toLowerCase())) continue;
    return { art, status };
  }
  return { art: null, status: {} };
}

/** The range of doses at which benefit was OBSERVED — the v12 yardstick. */
function benefitRange(row: Json): DoseBand & { basis?: string | null } {
  const rng = row.dose_range_mg as Json | undefined;
  if (rng && typeof rng === "object" && rng.low !== null && rng.low !== undefined) {
    return {
      low: rng.low as number,
      high: (rng.high as number | null) ?? null,
      basis: (rng.basis as string | null) ?? null,
    };
  }
  const d = (row.dose ?? {}) as Json;
  return {
    low: (d.low as number | null) ?? null,
    high: (d.high as number | null) ?? null,
    basis: (d.basis as string | null) ?? null,
  };
}

export function scoreProduct(ingredient: string, form: string, doseMg: number | null): Json {
  const { art, status } = pickArtifact(ingredient, form);
  if (art === null) {
    const others = availableProducts().filter((p) => p.ingredient === ingredient);
    if (others.length) {
      return {
        status: "form_not_scored",
        ingredient,
        form,
        scored_forms: others.map((p) => p.form),
      };
    }
    return { status: "not_scored", ingredient, form };
  }

  const run = (art.run ?? {}) as Json;
  const product = (art.product ?? {}) as Json;
  const rows: Json[] = [];
  const refused: Json[] = [];

  for (const rawUnknown of (art.ecu_rows as unknown[]) ?? []) {
    const raw = (rawUnknown ?? {}) as Json;
    const arcs = (raw.arcs ?? {}) as Json;
    const formArc = (arcs.form ?? {}) as Json;
    const effectArc = (arcs.effect ?? {}) as Json;
    const doseArc = (arcs.dose ?? {}) as Json;
    const components = (raw.components ?? {}) as Json;
    const effectD = (effectArc.verdict as number | null) ?? null;
    const c = (components.c as number | null) ?? null;
    const strength = (formArc.strength as number | null) ?? null;

    if (raw.composite === null || raw.composite === undefined || effectD === null || c === null) {
      refused.push({ outcome: raw.outcome_vocab_id, reason: "gated_in_run" });
      continue;
    }
    if (strength === null) {
      refused.push({ outcome: raw.outcome_vocab_id, reason: "artifact_predates_form_strength" });
      continue;
    }

    const band = benefitRange(raw);
    const closeness = doseFactorFor(doseMg, doseMg, band);
    const match = doseMatchFor(doseMg, doseMg, band);
    const comp = composite(effectD, strength, closeness, c);
    const verdict = verdictLabel(comp, c, effectD, strength === null || closeness === null);

    rows.push({
      outcome: raw.outcome_vocab_id,
      outcome_label: ((raw.outcome ?? {}) as Json).label ?? null,
      polarity: ((raw.outcome ?? {}) as Json).polarity ?? null,
      composite: comp,
      verdict,
      n_primaries: ((raw.evidence ?? {}) as Json).n_primaries ?? null,
      arcs: {
        effect: { verdict: effectD, coverage: effectArc.coverage ?? null },
        form: {
          verdict: formArc.verdict ?? null,
          coverage: formArc.coverage ?? null,
          strength,
          basis: formArc.basis ?? null,
        },
        dose: {
          verdict: doseArc.verdict ?? null,
          coverage: doseArc.coverage ?? null,
          closeness,
          product_match: match,
        },
        evidence: { coverage: c, is_quantity: true },
      },
      benefit_dose_range_mg: band,
      null_dose_range_mg: ((raw.dose ?? {}) as Json).null_range ?? null,
      run_composite: raw.composite,
      run_dose_closeness: doseArc.closeness ?? null,
    });
  }

  rows.sort((a, b) => {
    const av = a.composite as number | null;
    const bv = b.composite as number | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });

  return {
    status: rows.length ? "scored" : "recompute_refused",
    ingredient,
    form,
    dose_mg: doseMg,
    rows,
    refused,
    population: product.population ?? null,
    run: {
      id: run.id ?? null,
      scoring_model: run.scoring_model ?? null,
      prompt_version: run.prompt_version ?? null,
      generated_at: run.generated_at ?? null,
      provider: run.provider ?? null,
      scored_product_dose_mg: ((product.dose ?? {}) as Json).low_mg ?? null,
    },
    validity: {
      status: status.status ?? null,
      public_claims_allowed: Boolean(status.public_claims_allowed),
      limitations: (status.limitations as unknown[]) ?? [],
      note: status.note ?? null,
    },
  };
}
