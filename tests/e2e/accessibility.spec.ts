import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/* Every public route ("/" is the waitlist, /scan the product, /methodology the
 * explainer) plus the 404 page. The /runs archive was removed 2026-10-15. */
const ROUTES = ["/", "/scan", "/methodology", "/not-a-real-page"];

/* axe is CPU-heavy; a timeout here reads as an accessibility failure, which is
 * the wrong alarm, so give the scans room (measured 2026-08-24). */
test.describe.configure({ timeout: 120_000 });

for (const route of ROUTES) {
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
