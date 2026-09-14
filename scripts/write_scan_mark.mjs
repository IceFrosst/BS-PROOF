#!/usr/bin/env node
/*
 * Derive public/scan-mark.svg from public/pwa-icon.svg.
 *
 * The /scan page (pure white since 2026-09-15) shows the same green-frame,
 * white-bottle, blue-pixel artwork the installed app icon uses, but on a white
 * ground rather than the icon's ink square. Two things change and nothing else:
 *
 *   1. the full-bleed #0B0F14 background rect is dropped, so the mark is
 *      transparent and sits on whatever the page paints;
 *   2. the bottle body, which is white, gets a thin ink outline so it still
 *      reads as a bottle on white. In the icon it is white-on-ink and needs none.
 *
 * Deterministic: same input, same output, byte for byte. tests/scan-manual.test.ts
 * regenerates in memory and compares to the committed file, so the mark cannot
 * drift from the icon without this script being re-run.
 *
 *   node scripts/write_scan_mark.mjs          # write public/scan-mark.svg
 *   node scripts/write_scan_mark.mjs --check  # exit 1 if the committed file differs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ICON = join(ROOT, "public", "pwa-icon.svg");
export const MARK = join(ROOT, "public", "scan-mark.svg");

const BACKGROUND = '<rect width="512" height="512" fill="#0B0F14"/>';
const BOTTLE_STROKE_BEFORE = 'fill="#FFFFFF" stroke="none" stroke-width="8"';
const BOTTLE_STROKE_AFTER = 'fill="#FFFFFF" stroke="#0B0F14" stroke-width="8"';

export function deriveScanMark(iconSvg) {
  if (!iconSvg.includes(BACKGROUND)) throw new Error("pwa-icon.svg: background rect not found; the generator needs updating");
  if (!iconSvg.includes(BOTTLE_STROKE_BEFORE)) throw new Error("pwa-icon.svg: bottle path not found; the generator needs updating");
  return iconSvg
    .replace(BACKGROUND, "")
    .replace(BOTTLE_STROKE_BEFORE, BOTTLE_STROKE_AFTER)
    .replace('aria-label="BS Proof supplement scanner mark"', 'aria-label="BS Proof scanner mark on a transparent ground"')
    .replace(/\n\s*\n/g, "\n");
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const derived = deriveScanMark(readFileSync(ICON, "utf8"));
  if (process.argv.includes("--check")) {
    const committed = readFileSync(MARK, "utf8");
    if (committed !== derived) {
      console.error("public/scan-mark.svg is out of date; run node scripts/write_scan_mark.mjs");
      process.exit(1);
    }
    console.log("public/scan-mark.svg is up to date");
  } else {
    writeFileSync(MARK, derived, "utf8");
    console.log(`wrote ${MARK}`);
  }
}
