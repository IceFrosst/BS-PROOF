/*
 * The dose arithmetic the scan still runs, pinned to the Python originals:
 * lib/analyze/vocab.ts elementalDoseRangeMg (pipeline/vocab.py
 * elemental_dose_range_mg) and lib/analyze/grade-v2.ts doseMatchFor
 * (pipeline/dose.py dose_match_for). tests/test_vocab_goldens.py checks the
 * same golden file against Python, so the two sides cannot drift apart.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { doseMatchFor, type DoseBand } from "@/lib/analyze/grade-v2";
import { elementalDoseRangeMg } from "@/lib/analyze/vocab";

type Case = { args: unknown[]; expect: unknown };
const golden = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "golden_vocab_parity.json"), "utf8"),
) as { elemental: Case[]; dose_match: Case[] };

describe("elemental dose conversion parity", () => {
  it.each(golden.elemental.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [ingredient, form, dose] = c.args as [string, string, number | null];
    expect(elementalDoseRangeMg(ingredient, form, dose)).toEqual(c.expect);
  });
});

describe("dose_match_for parity", () => {
  it.each(golden.dose_match.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [low, high, band] = c.args as [number | null, number | null, DoseBand];
    expect(doseMatchFor(low, high, band)).toBe(c.expect);
  });
});
