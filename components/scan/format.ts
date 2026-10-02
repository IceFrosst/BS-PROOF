/* Pure formatting helpers for the /scan result. No React, no state. */

export type NullableNumber = number | null;

/*
 * ONE ramp, two usages. Hue is the score (0 red -> 60 amber -> 100 green) and
 * saturation follows evidence coverage, so a weak signal looks deliberately
 * washed. `usage: "text"` keeps the SAME hue and only darkens it: the fill
 * lightness that reads well as a 10px bar fails WCAG 1.4.3 as 22-40px type
 * (measured: amber `#c68f2f` on white is 2.84:1). This is not a second ramp --
 * the hue, and therefore the meaning, is identical.
 */
export function scoreSignalColor(score: NullableNumber, signal: NullableNumber, usage: "fill" | "text" = "fill"): string {
  if (score === null || score === undefined) return "var(--sp-mute)";
  const value = Math.max(0, Math.min(100, score));
  const strength = Math.max(0, Math.min(1, signal ?? 0));
  const hue = value <= 60 ? (value / 60) * 42 : 42 + ((value - 60) / 40) * 98;
  const saturation = usage === "text" ? 48 + strength * 32 : 32 + strength * 48;
  const lightness = usage === "text" ? 30 - strength * 4 : 54 - strength * 10;
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

export function mg(value: NullableNumber): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2).replace(/\.?0+$/, "")} g` : `${Math.round(value)} mg`;
}

export function words(value: string): string {
  return value.replace(/_/g, " ");
}

export function populationLine(pop: Record<string, string | null> | null | undefined): string | null {
  if (!pop) return null;
  const ages: Record<string, string> = { adult: "adults", older_adult: "older adults", adolescent: "adolescents", child: "children", infant: "infants" };
  const sexes: Record<string, string> = { mixed: "men and women", male: "men", female: "women" };
  const parts = [pop.health_status && pop.health_status !== "unknown" ? words(pop.health_status) : null, pop.age_band ? ages[pop.age_band] ?? words(pop.age_band) : null].filter(Boolean) as string[];
  if (pop.sex && pop.sex !== "unknown") parts.push(sexes[pop.sex] ?? words(pop.sex));
  if (pop.deficiency_status && pop.deficiency_status !== "unknown") parts.push(`${words(pop.deficiency_status)} at baseline`);
  if (pop.pregnancy && pop.pregnancy !== "unknown" && pop.pregnancy !== "not_pregnant") parts.push(words(pop.pregnancy));
  return parts.length ? parts.join(", ") : pop.id ? words(pop.id) : null;
}

/** One deterministic, shared ID format for every outcome tab and its panel label. */
export function tabId(key: string): string {
  const safe = key.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `sc-tab-${safe || "outcome"}-${Math.abs(hash).toString(36)}`;
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

export function auditSourceHref(id: string): string | null {
  const doi = id.match(/10\.\d{4,9}\/[^^\s,;]+/i)?.[0];
  if (doi) return `https://doi.org/${doi.replace(/[.)]+$/, "")}`;
  const pmid = id.match(/PMID[: ]+(\d+)/i)?.[1];
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  const pmc = id.match(/\b(PMC\d+)\b/i)?.[1];
  return pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : null;
}
