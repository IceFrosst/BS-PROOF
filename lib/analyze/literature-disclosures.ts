/*
 * FUNDING & INDEPENDENCE / PUBLICATION BIAS DISCLOSURES — pure, browser-safe
 * (no fs/path, no model boundary). Split out of literature-warnings.ts (which
 * imports node:fs to read prompts/literature_warnings.md) so
 * components/scan-flow.tsx -- a client component -- can import the rendering
 * decision without pulling a server-only filesystem import into the browser
 * bundle. Same split as lib/analyze/business-model.ts / company.ts.
 *
 * The fields themselves live in the literature-warnings MODEL SECTION
 * (schemas/literature_warnings.json, prompts/literature_warnings.md): a
 * model-recalled, conservative read of two things a model can honestly know
 * about the published trials behind ONE ingredient -- who funded them, and
 * whether the published record looks selectively reported. `unknown` is the
 * default whenever the model is not sure; `concern` requires a specific,
 * widely-reported reason, never "nothing comes to mind". A concern is a
 * DISCLOSURE about the literature as a whole, never a claim that a result is
 * wrong, and it must never be read by scoring code.
 */

export type LiteratureWarningStatus = "concern" | "no_concern" | "unknown";

export interface FundingIndependence {
  status: LiteratureWarningStatus;
  basis: string;
  confidence: "high" | "medium" | "low";
  /** Industry funders / trade bodies commonly behind this ingredient's trials. Empty when none recalled. */
  notable_funders?: string[];
}

export interface PublicationBias {
  status: LiteratureWarningStatus;
  basis: string;
  confidence: "high" | "medium" | "low";
  /** e.g. "Egger's test significant in a 2025 meta-analysis of strength outcomes". Empty when none recalled. */
  signals?: string[];
}

export interface LiteratureWarnings {
  funding_independence: FundingIndependence;
  publication_bias: PublicationBias;
  caveats?: string[];
}

export interface LiteratureDisclosure {
  tone: "warning";
  title: string;
  body: string;
}

/**
 * Turns a `literature_warnings` read into what the UI shows. ONLY "concern"
 * renders anything for each topic -- "no_concern", "unknown" and an absent
 * field render NOTHING, the same founder rule as the MLM disclosure
 * (`businessModelDisclosure`): a warning shown on every product would stop
 * reading as a warning. The two topics are independent -- a product can show
 * one, both, or neither -- and each explicitly says it does not affect the
 * evidence score.
 */
export function literatureDisclosures(data: LiteratureWarnings | null | undefined): LiteratureDisclosure[] {
  const out: LiteratureDisclosure[] = [];

  const funding = data?.funding_independence;
  if (funding?.status === "concern") {
    const basis = funding.basis?.trim();
    const funders = (funding.notable_funders ?? []).filter((f) => f && f.trim());
    out.push({
      tone: "warning",
      title: "Funding & independence",
      body:
        "Model knowledge — unverified. This is about who paid for the trials behind this ingredient. " +
        `${basis || "The model remembers a funding pattern here that is worth telling you about."} ` +
        `${funders.length ? `Funders often named: ${funders.join(", ")}. ` : ""}` +
        `(model confidence: ${funding.confidence}). ` +
        "Saying who paid is not saying the results are wrong, and it does not affect the evidence score.",
    });
  }

  const bias = data?.publication_bias;
  if (bias?.status === "concern") {
    const basis = bias.basis?.trim();
    const signals = (bias.signals ?? []).filter((s) => s && s.trim());
    out.push({
      tone: "warning",
      title: "Publication bias",
      body:
        "Model knowledge — unverified. Publication bias means studies that found something are more likely to " +
        "get published than studies that found nothing. That can make an ingredient look better than it is. " +
        `${basis || "The model remembers a pattern in the published record here that is worth telling you about."} ` +
        `${signals.length ? `Signs of it: ${signals.join("; ")}. ` : ""}` +
        `(model confidence: ${bias.confidence}). ` +
        "This describes the published record. It is not a claim that the results are wrong, and it does not " +
        "affect the evidence score.",
    });
  }

  return out;
}
