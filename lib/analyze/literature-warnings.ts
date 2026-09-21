/*
 * LITERATURE DISCLOSURE WARNINGS -- model-decided, not computed. Founder
 * 2026-09-16: two things a reader should be told about the LITERATURE BEHIND
 * an ingredient, decided the same way the MLM disclosure is decided -- "by
 * the system prompt" -- rather than by a rule in the scorer:
 *
 *   funding_independence  who funded the trials (industry-dominated, or not)
 *   publication_bias      does the published record look selectively reported
 *
 * Both are DISCLOSURES ABOUT THE EVIDENCE AS A WHOLE, never a claim that any
 * particular result is wrong, and neither is read by any scoring code --
 * `docs/history/` already closed that door once (2026-09-11: "funding and
 * publication bias are clickable disclosure warnings and no longer touch any
 * number"); this module keeps that rule for the live /scan page instead of
 * reopening it as a penalty.
 *
 * SHAPE, deliberately the same as evidence-prior.ts / company.ts: one model
 * call, its own prompt (`prompts/literature_warnings.md`), its own schema
 * (`schemas/literature_warnings.json`), its own cache domain
 * (`LITERATURE_WARNINGS_PROMPT_VERSION`, invariant 3), never throws, and
 * degrades to `unavailable` on its own without costing the evidence score or
 * any other section (invariant 1: only ./llm.ts calls a model).
 *
 * The TYPE and the pure rendering decision (`literatureDisclosures`) live in
 * ./literature-disclosures.ts, which imports neither `node:fs` nor this file,
 * so components/scan-flow.tsx -- a client component -- never pulls a
 * filesystem import into the browser bundle. This file imports and re-exports
 * that type, the same split as business-model.ts / company.ts.
 */
import fs from "node:fs";
import path from "node:path";

import type { Basis } from "./compatibility";
import type {
  FundingIndependence,
  LiteratureWarnings,
  PublicationBias,
} from "./literature-disclosures";
import type { ChatJsonFn } from "./llm";
import { textModel } from "./llm";

export type {
  FundingIndependence,
  LiteratureDisclosure,
  LiteratureWarnings,
  LiteratureWarningStatus,
  PublicationBias,
} from "./literature-disclosures";
export { literatureDisclosures } from "./literature-disclosures";

const ROOT = process.cwd();

/** Bump together with prompts/literature_warnings.md. Its own cache domain (invariant 3).
 * v1.1 (2026-09-16): prompts/literature_warnings.md gained the shared
 * plain-language rule, so each `basis`, the recalled funders/signals strings
 * and the caveats are written in short plain sentences with every figure kept
 * exactly. WORDING ONLY -- the concern/no_concern/unknown contract, the
 * "specific reason required" bar and the disclosure-not-verdict rule are
 * unchanged. */
export const LITERATURE_WARNINGS_PROMPT_VERSION = "literature-warnings-v1.1";

export interface LiteratureWarningsSection {
  status: "ok" | "skipped" | "unavailable";
  basis: Basis;
  reason: string | null;
  data: LiteratureWarnings | null;
  prompt_version: string;
  model: string | null;
  elapsed_s: number | null;
}

export interface LiteratureWarningsInput {
  /** What the label/typed entry says, so an out-of-vocabulary ingredient still works. */
  ingredientText: string;
  formText: string | null;
  /** Context only -- never the subject of either disclosure; see prompts/literature_warnings.md. */
  brand: string | null;
  manufacturer: string | null;
}

export interface LiteratureWarningsDeps {
  chatJson: ChatJsonFn | null;
  timeoutMs: number;
  allowModel: boolean;
}

const UNKNOWN_FUNDING: FundingIndependence = {
  status: "unknown",
  basis: "model did not report a funding-independence assessment",
  confidence: "low",
  notable_funders: [],
};

const UNKNOWN_BIAS: PublicationBias = {
  status: "unknown",
  basis: "model did not report a publication-bias assessment",
  confidence: "low",
  signals: [],
};

function literatureWarningsPrompt(input: LiteratureWarningsInput): string {
  const raw = fs.readFileSync(path.join(ROOT, "prompts", "literature_warnings.md"), "utf8");
  return raw
    .replace("{INGREDIENT}", input.ingredientText)
    .replace("{FORM}", input.formText ?? "(not stated)")
    .replace("{BRAND}", input.brand ?? "(not printed)")
    .replace("{MANUFACTURER}", input.manufacturer ?? "(not printed)");
}

/** Never throws. Returns a section that says why it is empty when it is. */
export async function literatureWarningsSection(
  input: LiteratureWarningsInput,
  deps: LiteratureWarningsDeps,
): Promise<LiteratureWarningsSection> {
  const section: LiteratureWarningsSection = {
    status: "skipped",
    basis: "model_prior",
    reason: null,
    data: null,
    prompt_version: LITERATURE_WARNINGS_PROMPT_VERSION,
    model: null,
    elapsed_s: null,
  };
  if (!deps.allowModel || !deps.chatJson) {
    section.status = "unavailable";
    section.reason = deps.allowModel ? "no model provider configured" : "time budget exhausted before the literature-warnings call";
    return section;
  }
  try {
    const { value, meta } = await deps.chatJson<LiteratureWarnings>({
      purpose: "literature warnings",
      schemaFile: "literature_warnings.json",
      model: textModel(),
      maxTokens: 1024,
      timeoutMs: deps.timeoutMs,
      defaults: {
        funding_independence: UNKNOWN_FUNDING,
        publication_bias: UNKNOWN_BIAS,
        caveats: [],
      },
      messages: [{ role: "user", content: literatureWarningsPrompt(input) }],
    });
    section.status = "ok";
    section.data = value;
    section.model = meta.model;
    section.elapsed_s = meta.elapsed_s;
  } catch (err) {
    section.status = "unavailable";
    section.reason = err instanceof Error ? err.message : String(err);
  }
  return section;
}
