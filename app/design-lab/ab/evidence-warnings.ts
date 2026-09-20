import type { AuditFile, Ledger } from "./ledger";

export interface EvidenceWarning {
  id: "funding" | "publication";
  title: string;
  status: string;
  explanation: string;
  reported: string[];
}

/**
 * Warning state never enters score().
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
      id: "funding", title: "Funding & independence", status: "Funding / one-lab flag reported",
      explanation: "Funding can create conflicts of interest, but does not by itself establish that a result is wrong. The older audit combines industry funding and single-lab evidence in one flag; it does not identify which applies. No Evidence deduction or cap is applied.",
      // Bare 'author' matched ordinary commentary; independence wording only.
      reported: prose.filter((s) => /\b(fund(ing|ed|er|ers)?|sponsor(s|ed|ship)?|industry|conflicts?[ -]of[ -]interest|one lab|single lab|co-?authors? of)\b/i.test(s)),
    });
  }
  if (o.ledger.checklist.publication_bias === "concern") {
    out.push({
      id: "publication", title: "Publication bias", status: "Concern reported",
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
