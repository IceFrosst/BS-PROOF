/* Pure formatting helpers for the /scan result. No React, no state. */

export type NullableNumber = number | null;

export function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

export function words(value: string): string {
  return value.replace(/_/g, " ");
}

/* A short lede for a notice: its first sentence, minus the "Model knowledge —
 * unverified." prefix every model disclosure carries (the badge says that). */
export function firstSentence(body: string): string {
  const stripped = body.replace(/^Model knowledge — unverified\.\s*/, "");
  const m = stripped.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : stripped).trim();
}

export function severityLabel(kind: string, severity: string): string {
  const k = words(kind);
  return severity === "high" ? `${k}, high` : severity === "moderate" ? `${k}, moderate` : k;
}

