/*
 * COMPANY BACKGROUND. Three sources, kept visibly apart because they carry
 * different weights of truth:
 *
 *   label      certifications, manufacturer, country AS PRINTED -- claims the
 *              product makes about itself.                       basis "label"
 *   registry   FDA enforcement reports (recalls) for the recalling firm, from
 *              openFDA. A public record with dates.               basis "registry"
 *   model      a DeepSeek profile of the company from its training data --
 *              founded, HQ, ownership, testing programme, reported regulatory
 *              history. Shown under a "model knowledge — unverified" badge and
 *              cross-checked: a recall the model asserts that the registry
 *              does not hold is marked uncorroborated.           basis "model_prior"
 *
 * Nothing here enters a score. A company's history qualifies a product; it is
 * not evidence about whether the ingredient works.
 *
 * openFDA needs no key at 240 requests/minute per IP; dietary supplements are
 * regulated as food, so the endpoint is /food/enforcement. FDA warning letters
 * have no API and are NOT queried -- the model may recall one, and it is shown
 * as model knowledge only.
 */
import fs from "node:fs";
import path from "node:path";

import type { Basis } from "./compatibility";
import type { ChatJsonFn } from "./llm";
import { textModel } from "./llm";

const ROOT = process.cwd();

/** Bump together with prompts/company.md. Its own cache domain (invariant 3). */
export const COMPANY_PROMPT_VERSION = "company-v1.0";

const OPENFDA = "https://api.fda.gov/food/enforcement.json";

export interface RecallRow {
  recall_number: string | null;
  initiated: string | null;
  classification: string | null;
  status: string | null;
  reason: string | null;
  product: string | null;
  firm: string | null;
  basis: Basis;
  source: { title: string; url: string };
}

export interface RegistrySection {
  status: "ok" | "no_matches" | "unavailable" | "skipped_no_brand";
  queried: string[];
  recalls: RecallRow[];
  reason: string | null;
  source: string;
  note: string;
}

export interface CompanyProfile {
  brand: string;
  known: boolean;
  summary: string;
  founded_year: number | null;
  headquarters_country: string | null;
  parent_company: string | null;
  ownership_type: "private" | "public" | "subsidiary" | "unknown";
  third_party_testing: { program: string | null; status: "documented" | "claimed" | "unknown" };
  transparency: { coa_published: "yes" | "no" | "unknown" };
  regulatory_history: Array<{
    kind: "fda_warning_letter" | "recall" | "class_action" | "ftc_action" | "other";
    year: number | null;
    summary: string;
    confidence: "high" | "medium" | "low";
    /** Added by us: does openFDA hold a recall for this firm at all? */
    registry_corroborated?: boolean | null;
  }>;
  reputation_notes: string[];
  confidence: "high" | "medium" | "low";
  caveats: string[];
}

export interface CompanySection {
  status: "ok" | "no_brand_on_label";
  basis_used: Basis[];
  brand: string | null;
  manufacturer: string | null;
  country_of_origin: string | null;
  certifications_printed: Array<{ text: string; basis: Basis; note: string }>;
  registry: RegistrySection;
  profile: {
    status: "ok" | "skipped" | "unavailable";
    reason: string | null;
    data: CompanyProfile | null;
    basis: Basis;
    prompt_version: string;
    model: string | null;
    elapsed_s: number | null;
  };
}

export interface CompanyInput {
  brand: string | null;
  manufacturer: string | null;
  product_name: string | null;
  certifications: string[];
  country_of_origin: string | null;
}

export interface CompanyDeps {
  chatJson: ChatJsonFn | null;
  fetch: typeof fetch;
  timeoutMs: number;
  allowModel: boolean;
}

function fdaDate(raw: unknown): string | null {
  const s = String(raw ?? "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

function clip(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

async function openFdaQuery(fetchFn: typeof fetch, field: string, term: string, timeoutMs: number): Promise<RecallRow[]> {
  const search = `${field}:"${term.replace(/"/g, "")}"`;
  const url = `${OPENFDA}?${new URLSearchParams({ search, limit: "10" }).toString()}`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) return []; // openFDA's "no matches" is a 404 with an error body
  if (!res.ok) throw new Error(`openFDA ${res.status}`);
  const page = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (page.results ?? []).map((r) => ({
    recall_number: clip(r.recall_number, 40),
    initiated: fdaDate(r.recall_initiation_date),
    classification: clip(r.classification, 20),
    status: clip(r.status, 40),
    reason: clip(r.reason_for_recall, 300),
    product: clip(r.product_description, 200),
    firm: clip(r.recalling_firm, 120),
    basis: "registry" as Basis,
    source: { title: "FDA enforcement reports (openFDA)", url },
  }));
}

/** Recalls for the brand and, when printed, the manufacturer. Never throws. */
export async function registryRecalls(input: CompanyInput, deps: CompanyDeps): Promise<RegistrySection> {
  const names = [...new Set([input.brand, input.manufacturer].filter((x): x is string => Boolean(x && x.trim())))];
  const base = {
    source: "openFDA food enforcement reports",
    note:
      "Dietary supplements are regulated as food, so recalls appear in FDA's food enforcement reports. " +
      "No match means no recall is on file under this exact firm name — not that the company has a clean history.",
  };
  if (!names.length) return { status: "skipped_no_brand", queried: [], recalls: [], reason: null, ...base };
  try {
    const batches = await Promise.all(
      names.flatMap((n) => [
        openFdaQuery(deps.fetch, "recalling_firm", n, deps.timeoutMs),
        openFdaQuery(deps.fetch, "product_description", n, deps.timeoutMs),
      ]),
    );
    const seen = new Set<string>();
    const recalls: RecallRow[] = [];
    for (const row of batches.flat()) {
      const key = row.recall_number ?? `${row.firm}|${row.initiated}|${row.product}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recalls.push(row);
    }
    recalls.sort((a, b) => (b.initiated ?? "").localeCompare(a.initiated ?? ""));
    return { status: recalls.length ? "ok" : "no_matches", queried: names, recalls, reason: null, ...base };
  } catch (err) {
    return { status: "unavailable", queried: names, recalls: [], reason: err instanceof Error ? err.message : String(err), ...base };
  }
}

function companyPrompt(input: CompanyInput): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "company.md"), "utf8");
  return raw
    .replace("{BRAND}", input.brand ?? "(not printed)")
    .replace("{MANUFACTURER}", input.manufacturer ?? "(not printed)")
    .replace("{PRODUCT}", input.product_name ?? "(not printed)");
}

/** Label facts + registry + model profile, each labelled with its basis. Never throws. */
export async function companySection(input: CompanyInput, deps: CompanyDeps): Promise<CompanySection> {
  const certifications = input.certifications.map((text) => ({
    text,
    basis: "label" as Basis,
    note: "As printed on the label. A seal is a claim until the certifier's registry confirms it.",
  }));
  const section: CompanySection = {
    status: input.brand || input.manufacturer ? "ok" : "no_brand_on_label",
    basis_used: certifications.length || input.manufacturer || input.country_of_origin ? ["label"] : [],
    brand: input.brand,
    manufacturer: input.manufacturer,
    country_of_origin: input.country_of_origin,
    certifications_printed: certifications,
    registry: { status: "skipped_no_brand", queried: [], recalls: [], reason: null, source: "openFDA food enforcement reports", note: "" },
    profile: {
      status: "skipped",
      reason: input.brand ? null : "no brand printed on the label",
      data: null,
      basis: "model_prior",
      prompt_version: COMPANY_PROMPT_VERSION,
      model: null,
      elapsed_s: null,
    },
  };
  if (section.status === "no_brand_on_label") return section;

  const registryPromise = registryRecalls(input, deps);
  const profilePromise = (async () => {
    if (!input.brand) return null;
    if (!deps.allowModel || !deps.chatJson) {
      section.profile.status = "unavailable";
      section.profile.reason = deps.allowModel ? "no model provider configured" : "time budget exhausted before the company call";
      return null;
    }
    try {
      const { value, meta } = await deps.chatJson<CompanyProfile>({
        purpose: "company profile",
        schemaFile: "company.json",
        model: textModel(),
        maxTokens: 2048,
        timeoutMs: deps.timeoutMs,
        defaults: {
          founded_year: null,
          headquarters_country: null,
          parent_company: null,
          ownership_type: "unknown",
          third_party_testing: { program: null, status: "unknown" },
          transparency: { coa_published: "unknown" },
          regulatory_history: [],
          reputation_notes: [],
          caveats: [],
        },
        messages: [{ role: "user", content: companyPrompt(input) }],
      });
      section.profile.status = "ok";
      section.profile.model = meta.model;
      section.profile.elapsed_s = meta.elapsed_s;
      return value;
    } catch (err) {
      section.profile.status = "unavailable";
      section.profile.reason = err instanceof Error ? err.message : String(err);
      return null;
    }
  })();

  const [registry, profile] = await Promise.all([registryPromise, profilePromise]);
  section.registry = registry;
  if (registry.recalls.length) section.basis_used.push("registry");
  if (profile) {
    // Cross-check the one field that is a factual claim about a named company.
    const registryKnown = registry.status === "ok" || registry.status === "no_matches";
    profile.regulatory_history = profile.regulatory_history.map((item) => ({
      ...item,
      registry_corroborated:
        item.kind === "recall" ? (registryKnown ? registry.recalls.length > 0 : null) : null,
    }));
    section.profile.data = profile;
    section.basis_used.push("model_prior");
  }
  section.basis_used = [...new Set(section.basis_used)];
  return section;
}
