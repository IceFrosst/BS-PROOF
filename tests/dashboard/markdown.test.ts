import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/lib/dashboard/markdown";

describe("renderSafeMarkdown", () => {
  it("preserves report structure while removing executable HTML", () => {
    const markdown = `
# Full report

**Safe evidence** with [PubMed](https://pubmed.ncbi.nlm.nih.gov/123/).

| Outcome | Score |
|---|---:|
| Strength | 22 |

<script>window.__dashboardPwned = true</script>
<img src=x onerror="window.__dashboardPwned = true">
<iframe src="https://evil.example"></iframe>
[unsafe](javascript:alert(1))
`;
    const html = renderSafeMarkdown(markdown);

    expect(html).toContain("Full report");
    expect(html).toContain("Safe evidence");
    expect(html).toContain("<table");
    const host = document.createElement("div");
    host.innerHTML = html;
    // The embedded report is a DOCUMENT INSIDE the run page, which already
    // owns the page's <h1>. Its headings are demoted one level so a page
    // never ships two competing <h1> titles. No h1 must survive here.
    expect(host.querySelector("h1")).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("Full report");
    expect(host.querySelector('a[href^="https://pubmed.ncbi.nlm.nih.gov/"]')).not.toBeNull();
    expect(host.querySelector("script, iframe, img")).toBeNull();
    expect(host.querySelector('[onerror], [onclick], a[href^="javascript:"]')).toBeNull();
    expect((window as typeof window & { __dashboardPwned?: boolean }).__dashboardPwned).toBeUndefined();
  });

  it("does not preserve arbitrary event handlers or unsafe URL schemes", () => {
    const html = renderSafeMarkdown(
      '<a href="data:text/html,boom" onclick="boom()">bad</a>\n\nNormal text',
    );
    expect(html).toContain("Normal text");
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector("[onclick], a[href^='data:']")).toBeNull();
  });
});
