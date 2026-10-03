import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
// Every client entry the /scan and /tester routes mount: the workspace (tabs), the
// scan flow, the History tab and the /tester label analyzer all ship to the
// browser and must stay clear of the server-only retained-audit data and of
// node:fs / node:path.
const ENTRIES = [
  join(ROOT, "components", "scan-workspace.tsx"),
  join(ROOT, "components", "scan-flow.tsx"),
  join(ROOT, "components", "history-tab.tsx"),
  join(ROOT, "components", "label-analyzer.tsx"),
];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const FORBIDDEN_PATH = /(?:retained-audits|app[\\/]design-lab[\\/]ab[\\/]audits)/;
// A module specifier that is the filesystem or path module, in any spelling.
const FORBIDDEN_SPECIFIER = /^(?:node:)?(?:fs|path)(?:\/promises)?$/;

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(ROOT, specifier.slice(2)) : resolve(dirname(from), specifier);
  for (const candidate of [base, ...EXTENSIONS.map((ext) => `${base}${ext}`), ...EXTENSIONS.map((ext) => join(base, `index${ext}`))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Every module a file pulls in at RUNTIME: static `import ... from`, `export ...
 * from`, side-effect `import "x"`, dynamic `import("x")` and `require("x")`.
 * Type-only imports/exports are skipped on purpose -- `ScanAnalysis` is
 * intentionally a type-only import, and following that edge would report the
 * server-side producer as a client dependency even though TypeScript erases it
 * from the bundle.
 *
 * (The first version of this guard wrote its regex literal with doubled
 * backslashes, `\\s`, which means "a backslash then s" and therefore matched
 * nothing: the node:fs/node:path check never fired. `forbiddenSpecifiers` below
 * is pinned by a self-test that feeds it real offenders.)
 */
function runtimeSpecifiers(source: string): string[] {
  const found: string[] = [];
  // `[^'";]*?` keeps one match inside one statement, so a type-only import of
  // node:fs after an unrelated runtime import is not misread as a runtime one.
  for (const m of source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?\sfrom\s+["']([^"']+)["']/gm)) found.push(m[1]);
  for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) found.push(m[1]);
  for (const m of source.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push(m[1]);
  return found;
}

function forbiddenSpecifiers(source: string): string[] {
  return runtimeSpecifiers(source).filter((specifier) => FORBIDDEN_SPECIFIER.test(specifier));
}

describe("scan client boundary", () => {
  it("cannot reach retained-audits, filesystem imports, or the audit directory", () => {
    const queue = [...ENTRIES];
    const seen = new Set<string>();
    const reached: string[] = [];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      expect(file).not.toMatch(FORBIDDEN_PATH);
      expect(forbiddenSpecifiers(source), file).toEqual([]);
      reached.push(file);
      for (const specifier of runtimeSpecifiers(source)) {
        const child = resolveImport(file, specifier);
        if (child) queue.push(child);
      }
    }
    for (const entry of ENTRIES) expect(reached).toContain(entry);
    expect(reached.some((file) => FORBIDDEN_PATH.test(file))).toBe(false);
  });

  it("the node:fs / node:path check actually fires on real offenders (it once matched nothing)", () => {
    const offenders = [
      'import fs from "node:fs";',
      "import { readFileSync } from 'fs';",
      'import * as p from "node:path";',
      'import { join,\n  resolve } from "node:path"',
      'export { join } from "node:path";',
      'export * from "fs/promises";',
      'import "node:fs";',
      'const fs = await import("node:fs");',
      'const p = require("path");',
      'import { type Stats, statSync } from "node:fs";',
    ];
    for (const source of offenders) expect(forbiddenSpecifiers(source), source).toHaveLength(1);
  });

  it("...and leaves type-only imports and unrelated modules alone, even next to each other", () => {
    const clean = [
      'import type { Stats } from "node:fs";',
      'import type { ParsedPath } from "node:path"',
      'export type { Stats } from "node:fs";',
      'import { useState } from "react";\nimport type { Stats } from "node:fs";\nimport { x } from "./path-helper";',
      'import pathLike from "./path";',
      'import { fsa } from "@/lib/fs-adapter";',
      'import { join } from "node:url";',
    ];
    for (const source of clean) expect(forbiddenSpecifiers(source), source).toEqual([]);
  });
});
