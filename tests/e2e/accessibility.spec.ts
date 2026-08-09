import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const retainedRunId =
  "20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o";

for (const route of [
  "/",
  "/methodology",
  `/runs/${retainedRunId}`,
  `/runs/${retainedRunId}/outcomes/muscle_strength`,
  "/runs/not-a-real-run",
]) {
  test(`${route} has no automatically detectable accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.locator("main#main-content").waitFor();

    const result = await new AxeBuilder({ page })
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22a",
        "wcag22aa",
      ])
      .analyze();

    expect(
      result.violations,
      result.violations
        .map(
          (violation) =>
            `${violation.id}: ${violation.help}\n${violation.nodes
              .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`)
              .join("\n")}`,
        )
        .join("\n\n"),
    ).toEqual([]);
  });
}
