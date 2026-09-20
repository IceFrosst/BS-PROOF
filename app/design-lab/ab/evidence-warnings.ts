import { businessModelDisclosure, type BusinessModel } from "@/lib/analyze/business-model";
import type { AuditFile, Ledger } from "./ledger";

export type EvidenceWarningId =
  | "multi_ingredient_product"
  | "servings_not_stated"
  | "mlm"
  | "no_human_controlled_trial"
  | "funding"
  | "publication";

export interface EvidenceWarning {
  id: EvidenceWarningId;
  /**
   * `product` warnings are about the tub in your hand and are identical on
   * every outcome; `outcome` warnings are about the evidence behind ONE row.
   * The view prints product rows first, which is also the order below.
   */
  scope: "product" | "outcome";
  title: string;
  status: string;
  explanation: string;
  /** Sentences quoted from the retained audit prose. Only the two literature warnings have any. */
  reported: string[];
  /** True when `reported` is a quote set from the retained AI audit, so the view stamps it as such. */
  auditQuoted: boolean;
  /** Extra provenance line for a declared (fictional) sample fact. */
  note?: string;
}

/**
 * Product-level facts a scenario may DECLARE about itself. Every field is
 * optional and absent means unknown, so a scenario that says nothing renders
 * nothing: none of this is inferred from an audit, because the three retained
 * audits (creatine, vitamin D, magnesium) are single-ingredient products with
 * a stated daily dose and no known MLM seller, and printing any of these three
 * warnings on them would be inventing a fact about a real brand.
 */
export interface ProductDeclarations {
  /** The product doses more than one active ingredient. */
  multiIngredient?: boolean;
  /** The label does not state servings per day, so a daily dose cannot be computed. */
  servingsNotStated?: boolean;
  /** Seller business model, same field and same semantics as the production company profile. */
  businessModel?: BusinessModel | null;
  /** Printed on each declared warning; use it to say whose facts these are. */
  note?: string;
}

/**
 * The three product-level warnings, in display order.
 *
 * WORDING IS COPIED VERBATIM from the shipped `/scan` surface so the two
 * surfaces cannot drift: the first two are the `multi_ingredient_product` and
 * `servings_not_stated` caveat texts in `lib/analyze/scan.ts` (label branch),
 * and the MLM row is built by the production `businessModelDisclosure()`
 * itself, so its title and body are the same bytes `/scan` shows. None of
 * these three touches score() — the first two are label facts and MLM is a
 * disclosure that by construction never changes a number.
 */
export function productWarnings(d: ProductDeclarations | undefined | null): EvidenceWarning[] {
  const out: EvidenceWarning[] = [];
  const note = d?.note?.trim() || undefined;
  if (d?.multiIngredient) {
    out.push({
      id: "multi_ingredient_product", scope: "product", title: "More than one active ingredient",
      status: "Evidence is about one ingredient",
      // lib/analyze/scan.ts caveat `multi_ingredient_product`, with the
      // ingredient slot filled generically: no sample here names one.
      explanation: "This product doses more than one active. The evidence score is about this ingredient on its own, which is not the same question as this blend.",
      reported: [], auditQuoted: false, note,
    });
  }
  if (d?.servingsNotStated) {
    out.push({
      id: "servings_not_stated", scope: "product", title: "Servings per day not stated",
      status: "Daily dose not computed",
      // lib/analyze/scan.ts caveat `servings_not_stated`, label (not typed) branch.
      explanation: "Servings per day are not printed, so the per-serving dose was scored. Your daily dose may be higher.",
      reported: [], auditQuoted: false, note,
    });
  }
  const mlm = businessModelDisclosure(d?.businessModel);
  if (mlm) {
    out.push({
      id: "mlm", scope: "product", title: mlm.title,
      // "never changes the score" is stated in full in the body below.
      status: "Disclosure only",
      explanation: mlm.body,
      reported: [], auditQuoted: false, note,
    });
  }
  return out;
}

/**
 * Outcome-level warning derived from the ledger itself, not from a
 * declaration: the same `gates.rctCount === 0` condition that makes
 * `score()` push "No human controlled trial" and cap certainty at 0 (which
 * also leaves `headline` null, i.e. "Not scored"). It therefore fires on real
 * audit outcomes too, and that is correct — it is read off the run's own
 * counted trials. Unlike MLM this is a CAP, not a disclosure.
 */
export function gateWarnings(l: Ledger | undefined | null): EvidenceWarning[] {
  if (!l || l.gates.rctCount !== 0) return [];
  return [{
    id: "no_human_controlled_trial", scope: "outcome", title: "No human controlled trial",
    status: "Caps the score",
    explanation: "No randomised human trial was found for this outcome, so the rubric caps certainty at zero and shows no outcome score. This one is a cap, not a disclosure. Missing evidence is not proof the product fails.",
    reported: [], auditQuoted: false,
  }];
}

/**
 * The two literature warnings. Funding and publication-bias state never
 * enters score().
 *
 * ONLY AN ACTUAL CONCERN IS BUILT (founder decision 2026-09-16). A funding
 * warning exists only when the audit's industry / one-lab flag fired, and a
 * publication-bias warning only when the checklist recorded `concern`.
 * `unknown`, `supported` and a not-assessed pass produce NOTHING, so an
 * outcome with no real concern shows no warnings block at all: a warning
 * printed on every outcome stops reading as a warning. The filter is on the
 * STATUS here, at the source — never on the title in the view.
 *
 * The silence is not a clean bill of health, and the card never claims it is:
 * an absent warning means "this run recorded no concern", which the Evidence
 * row already says in words ("Unknown checklist entries are not verified
 * passes", see evidenceDetail below).
 */
export function auditWarnings(o: AuditFile["outcomes"][number]): EvidenceWarning[] {
  const prose = Object.values(o.detail?.evidence ?? {});
  const out: EvidenceWarning[] = [];
  if (o.ledger.gates.allPositiveIndustryOrOneLab) {
    out.push({
      id: "funding", scope: "outcome", auditQuoted: true, title: "Funding & independence", status: "Funding / one-lab flag reported",
      explanation: "Funding can create conflicts of interest, but does not by itself establish that a result is wrong. The older audit combines industry funding and single-lab evidence in one flag; it does not identify which applies. No Evidence deduction or cap is applied.",
      // Bare 'author' matched ordinary commentary; independence wording only.
      reported: prose.filter((s) => /\b(fund(ing|ed|er|ers)?|sponsor(s|ed|ship)?|industry|conflicts?[ -]of[ -]interest|one lab|single lab|co-?authors? of)\b/i.test(s)),
    });
  }
  if (o.ledger.checklist.publication_bias === "concern") {
    out.push({
      id: "publication", scope: "outcome", auditQuoted: true, title: "Publication bias", status: "Concern reported",
      explanation: "Positive results may be more likely to be published, making a literature look more favourable. A test finding no bias does not prove its absence. This warning does not reduce Evidence or the outcome score.",
      reported: prose.filter((s) => /publication|funnel|egger|trim.and.fill/i.test(s)),
    });
  }
  return out;
}

/* researchWarnings() was deleted 2026-09-16 with the same decision. The
 * effect-only research pass GRADES NEITHER TOPIC — it recorded each source's
 * funding sentence and its method limits as prose — so every row it produced
 * was a "not assessed" placeholder, which must now render nothing. Nothing is
 * lost: the per-source funding disclosure is still a line in the Effect row
 * ("Funding — disclosure only, never a score penalty") and any publication /
 * Egger note is still printed under "Method limits". */

/** Current scoring rationale, instead of displaying stale audit penalties as live rules. */
export function evidenceDetail(l: Ledger, found: string, move: string, auditMissing = "") {
  const concerns = Object.entries(l.checklist)
    .filter(([k, v]) => k !== "publication_bias" && v === "concern")
    .map(([k]) => k.replaceAll("_", " "));
  // The audit's own limitations (harm estimates, heterogeneity, an Expression of
  // Concern, tiny pooled samples) were never authorised for removal: only the
  // funding and publication-bias DEDUCTIONS were. Keep that prose, then label the
  // current rule separately so old text is not read as a live scoring rule.
  const prior = auditMissing.trim() && auditMissing.trim() !== "\u2014" ? `${auditMissing.trim()} ` : "";
  return {
    found,
    missing: `${prior}Current rubric: ${concerns.length ? `scored concerns ${concerns.join(", ")} (one point each).` : "no concerns deducted in the four scored checklist domains."} Trial-count, size/duration and surrogate caps still apply. Funding and publication bias are separate clickable warnings, never deductions. Unknown checklist entries are not verified passes.`,
    move,
  };
}
