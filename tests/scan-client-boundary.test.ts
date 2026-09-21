import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ENTRY = join(ROOT, "components", "scan-flow.tsx");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const FORBIDDEN_PATH = /(?:retained-audits|app[\\/]design-lab[\\/]ab[\\/]audits)/;
const FORBIDDEN_IMPORT = /^\\s*import\\s+(?!type\\b)[\\s\\S]*?\\sfrom\\s+["']node:(?:fs|path)["'];?/m;

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(ROOT, specifier.slice(2)) : resolve(dirname(from), specifier);
  for (const candidate of [base, ...EXTENSIONS.map((ext) => `${base}${ext}`), ...EXTENSIONS.map((ext) => join(base, `index${ext}`))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function runtimeImports(source: string): string[] {
  // `ScanAnalysis` is intentionally a type-only import. Following that edge
  // would report the server-side producer as a client dependency even though
  // TypeScript erases it from the bundle.
  return [...source.matchAll(/^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm)].map((m) => m[1]);
}

describe("scan client boundary", () => {
  it("cannot reach retained-audits, filesystem imports, or the audit directory", () => {
    const queue = [ENTRY];
    const seen = new Set<string>();
    const reached: string[] = [];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      expect(file).not.toMatch(FORBIDDEN_PATH);
      expect(source, file).not.toMatch(FORBIDDEN_IMPORT);
      reached.push(file);
      for (const specifier of runtimeImports(source)) {
        const child = resolveImport(file, specifier);
        if (child) queue.push(child);
      }
    }
    expect(reached).toContain(ENTRY);
    expect(reached.some((file) => FORBIDDEN_PATH.test(file))).toBe(false);
  });
});
