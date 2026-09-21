/*
 * MLM / DIRECT-SELLING DISCLOSURE — pure, browser-safe (no fs/path, no
 * model boundary). Split out of company.ts (which imports node:fs to read
 * prompts/company.md) so components/scan-flow.tsx — a client component — can
 * import the rendering decision without pulling a server-only module and its
 * filesystem import into the browser bundle.
 *
 * The field itself lives in the company MODEL PROFILE
 * (`CompanyProfile.business_model`, schemas/company.json,
 * prompts/company.md): a conservative, model-recalled read of whether a
 * company is structured as MLM / direct-selling. `confirmed_mlm` and
 * `suspected_mlm` are never a legal judgement and never a claim about the
 * PRODUCT — a lawful, common distribution structure is a completely separate
 * question from whether the ingredient works, and this field must never be
 * read by scoring code (pinned by tests/company-business-model.test.ts).
 */

export type BusinessModelStatus = "confirmed_mlm" | "suspected_mlm" | "no_evidence" | "unknown";

export interface BusinessModel {
  status: BusinessModelStatus;
  basis: string;
  confidence: "high" | "medium" | "low";
}

export interface BusinessModelDisclosure {
  tone: "warning";
  title: string;
  body: string;
}

/**
 * Turns a `business_model` read into what the UI shows. `confirmed_mlm` /
 * `suspected_mlm` get the yellow disclosure warning (same visual language as
 * the app's other model-knowledge disclosures — see `.scan-warning` in
 * globals.css), titled "MLM / direct-selling business model", never "pyramid
 * scheme" and never an accusation of illegality. `no_evidence`, `unknown` and
 * an absent field render NOTHING (founder 2026-09-16: "only show the mlm if
 * confirmed or suspected") -- a warning that appears on every company would
 * stop reading as a warning.
 */
export function businessModelDisclosure(model: BusinessModel | null | undefined): BusinessModelDisclosure | null {
  const status = model?.status ?? "unknown";
  const basis = model?.basis?.trim();
  const confidence = model?.confidence ?? "low";

  if (status === "confirmed_mlm" || status === "suspected_mlm") {
    const verb = status === "confirmed_mlm" ? "is" : "may be";
    return {
      tone: "warning",
      title: "MLM / direct-selling business model",
      body:
        `Model knowledge — unverified. This company ${verb} organised as an MLM, short for multi-level ` +
        "marketing and also called direct selling. It signs up distributors who can earn money from the sales " +
        `of the people they recruit, not only from what they sell themselves. ${basis ? `${basis} ` : ""}(model confidence: ${confidence}). ` +
        "That is a way of selling, not a legal judgement, and it says nothing about whether the product works. " +
        "It does not affect the evidence score.",
    };
  }
  return null;
}
