import type { AuditFile, Ledger } from "./ledger";
import type { EffectOutcome, EffectResearchFile } from "./effect-contract";
import { sourcesFor } from "./effect-presentation";

export interface EvidenceWarning {
  id: "funding" | "publication";
  title: string;
  status: string;
  explanation: string;
  reported: string[];
}

/** Warning state never enters score(). Unknown is not a clean bill of health. */
export function auditWarnings(o: AuditFile["outcomes"][number]): EvidenceWarning[] {
  const prose = Object.values(o.detail?.evidence ?? {});
  return [
    {
      id: "funding", title: "Funding & independence",
      status: o.ledger.gates.allPositiveIndustryOrOneLab ? "Funding / one-lab flag reported" : "Funding completeness unknown",
      explanation: "Funding can create conflicts of interest, but does not by itself establish that a result is wrong. The older audit combines industry funding and single-lab evidence in one flag; it does not identify which applies. No Evidence deduction or cap is applied.",
      // Bare 'author' matched ordinary commentary; independence wording only.
      reported: prose.filter((s) => /\b(fund(ing|ed|er|ers)?|sponsor(s|ed|ship)?|industry|conflicts?[ -]of[ -]interest|one lab|single lab|co-?authors? of)\b/i.test(s)),
    },
    {
      id: "publication", title: "Publication bias",
      status: o.ledger.checklist.publication_bias === "concern" ? "Concern reported" : o.ledger.checklist.publication_bias === "supported" ? "No concern recorded by audit" : "Not established",
      explanation: "Positive results may be more likely to be published, making a literature look more favourable. A test finding no bias does not prove its absence. This warning does not reduce Evidence or the outcome score.",
      reported: prose.filter((s) => /publication|funnel|egger|trim.and.fill/i.test(s)),
    },
  ];
}

export function researchWarnings(file: EffectResearchFile, outcome: EffectOutcome): EvidenceWarning[] {
  const sources = sourcesFor(file, outcome);
  return [
    {
      id: "funding", title: "Funding & independence", status: "Source disclosures",
      explanation: "Funding is a disclosure, not a score penalty. A review's funding does not establish the funding of every included trial. Evidence was not scored in this effect-only pass.",
      reported: sources.map((s) => `${s.label}: ${s.funding}`),
    },
    {
      id: "publication", title: "Publication bias", status: "Check source notes",
      explanation: "No publication-bias deduction is applied. No detected bias is not proof of absence; missing information remains unknown. Evidence was not scored in this pass.",
      reported: sources.flatMap((s) => [...s.methods_strengths, ...s.methods_limits].filter((p) => /publication|funnel|egger/i.test(p)).map((p) => `${s.label}: ${p}`)),
    },
  ];
}

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
