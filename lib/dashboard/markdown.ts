import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

const marked = new Marked({
  async: false,
  gfm: true,
  breaks: false,
});

marked.use({
  renderer: {
    html() {
      return "";
    },
  },
});

/** Render repository Markdown with authored HTML treated as inert text. */
export function renderSafeMarkdown(markdown: string): string {
  const rendered = String(marked.parse(markdown));
  return sanitizeHtml(rendered, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "a", "strong", "em", "del", "blockquote",
      "ul", "ol", "li", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "br",
    ],
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
      // DEMOTE THE EMBEDDED REPORT'S HEADINGS BY ONE LEVEL.
      // The run page already owns the page's <h1> (the ingredient name). The
      // retained report is a DOCUMENT INSIDE that page, and its own "# BS-PROOF
      // summary report" was emitting a second <h1>, so every run page shipped
      // two. That is a real document-outline defect, not just a Playwright
      // strict-mode annoyance: assistive tech reads two competing page titles.
      // h4 has nowhere to go and stays put rather than being silently dropped.
      h1: () => ({ tagName: "h2", attribs: {} }),
      h2: () => ({ tagName: "h3", attribs: {} }),
      h3: () => ({ tagName: "h4", attribs: {} }),
    },
    allowedAttributes: {
      a: ["href", "rel"],
      code: ["class"],
    },
  });
}
