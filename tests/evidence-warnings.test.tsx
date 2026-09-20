import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AbPrototype from "@/app/design-lab/ab/prototype";
import { score, ledgerFromAudit, type AuditFile } from "@/app/design-lab/ab/ledger";
import { auditWarnings, evidenceDetail } from "@/app/design-lab/ab/evidence-warnings";
import { outcomeKey } from "@/app/design-lab/ab/effect-presentation";
import creatine from "@/app/design-lab/ab/audits/creatine.json";
import vitaminD from "@/app/design-lab/ab/audits/vitamin-d.json";
import magnesium from "@/app/design-lab/ab/audits/magnesium.json";

const audits = [creatine, vitaminD, magnesium] as unknown as AuditFile[];
const byName = (a: AuditFile, name: string) => {
  const o = a.outcomes.find((x) => x.name === name);
  if (!o) throw new Error(`no outcome ${name}`);
  return o;
};
describe("test-site disclosure-only policy", () => {
  it("funding and publication-bias state cannot change any scored field, in any retained outcome", () => {
    for (const audit of audits) for (const o of audit.outcomes) {
      const l = ledgerFromAudit(o);
      const baseline = score(l);
      for (const publication_bias of ["concern", "supported", "unknown"] as const) {
        for (const allPositiveIndustryOrOneLab of [true, false]) {
          expect(score({ ...l, checklist: { ...l.checklist, publication_bias }, gates: { ...l.gates, allPositiveIndustryOrOneLab } })).toEqual(baseline);
        }
      }
    }
  });
  it("still deducts methodological concerns and preserves non-funding caps", () => {
    const l = ledgerFromAudit(audits[0].outcomes[0]);
    const large = { ...l, gates: { ...l.gates, largestRctN: 300, longestRctWeeks: 12, surrogate: false } };
    expect(score({ ...large, checklist: { ...large.checklist, risk_of_bias: "concern" } }).certainty).toBe(score(large).certainty - 1);
    expect(score({ ...large, gates: { ...large.gates, rctCount: 1 } }).certainty).toBe(1);
    expect(score({ ...large, gates: { ...large.gates, rctCount: 0 } }).headline).toBeNull();
    expect(score(l).certainty).toBe(2); // small-RCT cap, not funding
  });
  it("keeps concerns and incomplete funding evidence visible as warnings", () => {
    const o = audits[0].outcomes[0];
    const w = auditWarnings(o);
    expect(w[0].reported.join(" ")).toContain("industry sponsorship");
    expect(w[0].status).toContain("unknown");
    expect(w[1].status).toBe("Concern reported");
    expect(w[1].reported.join(" ")).toContain("Egger");
    expect(evidenceDetail(ledgerFromAudit(o), "found", "move").missing).not.toContain("publication bias (one point");
  });
  it("public page offers six real fixtures, no fictional picker or fake research interaction", () => {
    const html = renderToStaticMarkup(<AbPrototype publicTest />);
    expect(html).toContain("SUPPLEMENT TEST SITE");
    expect(html).toContain("not human-verified");
    expect(html).toContain("not a live research service");
    expect(html).not.toContain("Fictional test ledgers");
    expect(html).not.toContain("PHOTO PLACEMENT");
    expect((html.match(/aria-pressed="(?:true|false)"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
  it("keeps the audit's own Evidence limitations, including harm estimates, on the public card", () => {
    const o = byName(audits[1], "Fractures with calcium, frail 70+");
    const d = evidenceDetail(ledgerFromAudit(o), "f", "m", o.detail.evidence.missing);
    expect(d.missing).toContain("nephrolithiasis RR 1.17");
    expect(d.missing).toContain("Funding and publication bias are separate clickable warnings");
    expect(d.missing).not.toMatch(/publication[^.]*one point/i);
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "vitaminD", outcome: outcomeKey(o.name, o.population), open: "evidence" }} />);
    expect(html).toContain("nephrolithiasis RR 1.17");
  });

  it("carries every retained audit's limitations prose into the rendered Evidence row", () => {
    for (const [product, audit, name, needle] of [
      ["vitaminD", audits[1], "Treating depression", "heterogeneity is 88%"],
      ["magnesium", audits[2], "Falling asleep faster, age 55+", "rests on 55 people"],
      ["creatine", audits[0], "Sprint power without lifting", "interaction p = 0.022"],
    ] as const) {
      const o = byName(audit, name);
      const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product, outcome: outcomeKey(o.name, o.population), open: "evidence" }} />);
      expect(html, `${product} / ${name}`).toContain(needle);
    }
  });

  it("funding warning quotes independence disclosures only, not any sentence containing 'author'", () => {
    const lean = auditWarnings(byName(audits[0], "Lean mass (part is water)"))[0].reported.join(" ");
    expect(lean).toContain("industry sponsorship");
    expect(lean).toContain("conflict-of-interest");
    expect(auditWarnings(byName(audits[2], "Sleep quality (poor sleepers)"))[0].reported.join(" ")).toContain("co-author of the exact-form trial");
    expect(auditWarnings(byName(audits[2], "Constipation relief"))[0].reported.join(" ")).not.toContain("first of its kind");
  });

  it("survives an audit outcome with no evidence detail instead of blanking the page", () => {
    const partial = { ...byName(audits[0], "Lean mass (part is water)"), detail: {} } as unknown as AuditFile["outcomes"][number];
    expect(() => auditWarnings(partial)).not.toThrow();
    expect(auditWarnings(partial).every((w) => w.reported.length === 0)).toBe(true);
  });

  it("public card names the model and run date, like the lab page does", () => {
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine" }} />);
    expect(html).toContain(audits[0].meta.model);
    expect(html).toContain("not human-verified");
  });

  it("warnings use native keyboard-operable details with no nested buttons", () => {
    const o = audits[0].outcomes[0];
    const html = renderToStaticMarkup(<AbPrototype publicTest initial={{ product: "creatine", outcome: `${o.name}||${o.population}` }} />);
    expect(html).toContain('<details class="ab-warnings"><summary><span>⚠ 2 evidence warnings</span>');
    expect(html).toContain('data-warning="funding"');
    expect(html).toContain('data-warning="publication"');
    expect(html).toContain("disclosure only, no score penalty");
    expect(html).not.toContain("Nothing here was recomputed");
  });
});
