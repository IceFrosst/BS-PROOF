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
    },
    allowedAttributes: {
      a: ["href", "rel"],
      code: ["class"],
    },
  });
}
