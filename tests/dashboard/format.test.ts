import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSigned,
  formatUnknown,
  humanize,
} from "@/lib/dashboard/format";

/**
 * These are the last functions between a null in the artifact and a number on
 * the page. The property under test is not "the string looks nice": it is that
 * a value the pipeline never measured can never be rendered as a measurement,
 * and that a measured zero is never rendered as a missing value.
 */
describe("format", () => {
  describe("formatNumber", () => {
    it("renders an unmeasured count as unavailable and a measured zero as zero", () => {
      expect(formatNumber(null)).toBe("Unavailable");
      expect(formatNumber(0)).toBe("0");
      expect(formatNumber(null)).not.toBe(formatNumber(0));
    });

    it("keeps integer counts exact and rounds only where asked", () => {
      expect(formatNumber(797)).toBe("797");
      expect(formatNumber(113.6, 1)).toBe("113.6");
      expect(formatNumber(1234.5678, 2)).toBe("1,234.57");
    });
  });

  describe("formatPercent", () => {
    it('separates "not tested" from "tested, and the coverage was zero"', () => {
      expect(formatPercent(null)).toBe("Unavailable");
      expect(formatPercent(0)).toBe("0.0%");
      expect(formatPercent(null)).not.toBe(formatPercent(0));
    });

    it("renders coverage across the full arc range", () => {
      expect(formatPercent(0.483)).toBe("48.3%");
      expect(formatPercent(1)).toBe("100.0%");
      expect(formatPercent(0.5, 0)).toBe("50%");
    });
  });

  describe("formatSigned", () => {
    it("separates a missing verdict from a measured verdict of zero", () => {
      expect(formatSigned(null)).toBe("—");
      expect(formatSigned(0)).toBe("0");
      expect(formatSigned(null)).not.toBe(formatSigned(0));
    });

    it("keeps the direction of the verdict visible", () => {
      expect(formatSigned(0.6)).toBe("+0.6");
      // U+2212 minus, not a hyphen: the sign is the message.
      expect(formatSigned(-0.7)).toBe("−0.7");
      expect(formatSigned(0.462)).toBe("+0.462");
      expect(formatSigned(0.4)).toBe("+0.4");
    });

    it("strips only fractional trailing zeros, never digits of the magnitude", () => {
      // The outcome detail page renders the internal signed score with
      // digits = 0. A signed score of -20 must not be shown as -2.
      expect(formatSigned(-20, 0)).toBe("−20");
      expect(formatSigned(10, 0)).toBe("+10");
      expect(formatSigned(100, 0)).toBe("+100");
      expect(formatSigned(7, 0)).toBe("+7");
      expect(formatSigned(0, 0)).toBe("0");
    });
  });

  describe("formatMoney", () => {
    it("never renders an unrecorded price as free", () => {
      expect(formatMoney(null)).toBe("Unavailable");
      expect(formatMoney(0)).toBe("$0.00");
      expect(formatMoney(null)).not.toBe(formatMoney(0));
    });

    it("formats recorded amounts in the run's currency", () => {
      expect(formatMoney(8.75)).toBe("$8.75");
      expect(formatMoney(1.5, "EUR")).toBe("€1.50");
    });
  });

  describe("humanize", () => {
    it("labels an absent value rather than inventing an empty one", () => {
      expect(humanize(null)).toBe("Unavailable");
      expect(humanize(undefined)).toBe("Unavailable");
      expect(humanize("")).toBe("Unavailable");
    });

    it("turns vocabulary ids and run modes into prose", () => {
      expect(humanize("creatine_monohydrate")).toBe("Creatine Monohydrate");
      expect(humanize("grok-sr-ft-per-o")).toBe("Grok Sr Ft Per O");
      expect(humanize("partial")).toBe("Partial");
    });
  });

  describe("formatDate", () => {
    it("labels a missing timestamp instead of substituting today", () => {
      expect(formatDate(null)).toBe("Date unavailable");
    });

    it("passes an unparseable timestamp through rather than guessing", () => {
      expect(formatDate("not-a-date")).toBe("not-a-date");
    });

    it("reads run timestamps in UTC so the run day never shifts by locale", () => {
      const formatted = formatDate("2026-08-07T23:30:00Z");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("Aug");
      expect(formatted).toContain("07");
    });
  });

  describe("formatUnknown", () => {
    it("treats absent audit fields as unavailable but keeps a real zero", () => {
      expect(formatUnknown(null)).toBe("Unavailable");
      expect(formatUnknown(undefined)).toBe("Unavailable");
      expect(formatUnknown("")).toBe("Unavailable");
      expect(formatUnknown(0)).toBe("0");
    });

    it("renders retained structures without collapsing their fields", () => {
      expect(formatUnknown(["a", "b"])).toBe("a, b");
      expect(formatUnknown({ low_mg: 3000, high_mg: 5000 })).toBe(
        "Low Mg: 3000 · High Mg: 5000",
      );
      expect(formatUnknown({ dose: null })).toBe("Dose: Unavailable");
    });
  });
});
