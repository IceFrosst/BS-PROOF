/*
 * What the 2026-11 merge of main into the v2 line removed stays removed: live
 * research (founder 2026-11-07) and every v14 grading surface (retired
 * 2026-10-15). A guard against a later merge or cherry-pick quietly bringing one
 * back; docs/history/live-research.md and docs/history/v14-scoring-model.md say why.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe("removed in the 2026-11 merge", () => {
  it("no live-research route, library, worker or prompt", () => {
    for (const rel of ["app/api/scan/research", "lib/scan-research", "components/live-result-card.tsx", "components/scan-research-panel.tsx", "pipeline/claude_research_adapter.py", "scripts/pc_research_worker.py", "deploy", "prompts/research_audit_live.md"]) {
      expect(exists(rel), rel).toBe(false);
    }
  });

  it("no v14 grading page or library", () => {
    for (const rel of ["app/runs", "app/tester", "app/design-lab", "app/tests", "app/api/analyze-label", "lib/evidence-ledger", "lib/dashboard", "lib/analyze/product-score.ts", "lib/analyze/scoring.ts", "lib/analyze/dose-effectiveness.ts", "components/label-analyzer.tsx"]) {
      expect(exists(rel), rel).toBe(false);
    }
  });

  it("no app code imports any of them", () => {
    const banned = /scan-research|evidence-ledger|product-score|dose-effectiveness|analyze-label|live-result-card/;
    for (const file of [...sources("app"), ...sources("components"), ...sources("lib")]) {
      expect(fs.readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(new RegExp(`from ["'][^"']*(${banned.source})`));
    }
  });

  it("the app still grades nothing: the validated-grades list is empty", () => {
    const live = JSON.parse(fs.readFileSync(path.join(ROOT, "vocab", "grades_live.json"), "utf8")).live;
    expect(live).toEqual([]);
  });
});
