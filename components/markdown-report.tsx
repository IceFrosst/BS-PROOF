import { renderSafeMarkdown } from "@/lib/dashboard/markdown";

export function MarkdownReport({ markdown, label }: { markdown: string | null; label: string }) {
  if (!markdown) return <p className="empty-state">{label} is unavailable for this run.</p>;
  return (
    <div
      className="markdown-report"
      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(markdown) }}
    />
  );
}
