import { humanize } from "@/lib/dashboard/format";

interface StatusBadgeProps {
  status: string;
  testId?: string;
}

export function StatusBadge({ status, testId }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const tone = normalized === "validated"
    ? "positive"
    : normalized === "invalid"
      ? "danger"
      : "warning";
  return (
    <span className={`status-badge status-${tone}`} data-testid={testId}>
      <span aria-hidden="true" />{humanize(status)}
    </span>
  );
}
