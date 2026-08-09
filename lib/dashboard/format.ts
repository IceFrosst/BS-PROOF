export function humanize(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null, digits = 1): string {
  return value === null ? "Unavailable" : `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number | null, digits = 3): string {
  if (value === null) return "—";
  const formatted = Math.abs(value).toFixed(digits).replace(/\.?0+$/, "");
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

export function formatMoney(value: number | null, currency = "USD"): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatUnknown).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanize(key)}: ${formatUnknown(item)}`)
      .join(" · ");
  }
  return String(value);
}
