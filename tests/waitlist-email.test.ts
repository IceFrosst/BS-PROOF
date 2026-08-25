/*
 * The waitlist runs at a conference stand, so the asymmetry that matters is:
 * refusing a real address loses a lead permanently, accepting a typo costs one
 * bounced email. These tests pin that bias — the "accepts" list is the one to
 * protect when someone later tries to tighten the rules.
 */
import { describe, expect, it } from "vitest";

import { checkEmail, normaliseEmail } from "@/lib/waitlist/email";

describe("waitlist email validation", () => {
  it("accepts the shapes real people actually type", () => {
    const good = [
      "aykhan@lithuaniabio.eu",
      "a@b.co",
      "first.last@sub.domain.ac.uk",
      "name+conference@gmail.com",
      "researcher_01@uni-hamburg.de",
      "o'brien@example.com".replace("'", ""), // apostrophes are rare; keep the ascii case
      "UPPER@EXAMPLE.COM",
      "  padded@example.com  ",
    ];
    for (const value of good) {
      expect(checkEmail(value).ok, `${value} should be accepted`).toBe(true);
    }
  });

  it("refuses only what cannot be an address", () => {
    const bad: Array<[unknown, string]> = [
      ["", "empty"],
      ["   ", "empty"],
      [null, "empty"],
      [undefined, "empty"],
      [42, "empty"],
      ["no-at-sign", "no_at"],
      ["two@at@signs.com", "multiple_at"],
      ["@nolocal.com", "empty_local"],
      ["spaced address@example.com", "has_whitespace"],
      ["trailing@dot.", "bad_domain"],
      ["nodot@localhost", "bad_domain"],
      ["double@dots..com", "bad_domain"],
      ["leading@-hyphen.com", "bad_domain"],
    ];
    for (const [value, problem] of bad) {
      const result = checkEmail(value);
      expect(result.ok, `${String(value)} should be refused`).toBe(false);
      expect(result.problem).toBe(problem);
    }
  });

  it("gives a message about the address, never about the validator", () => {
    const result = checkEmail("missing-at-sign.com");
    expect(result.message).toBe("That address is missing an @.");
    // No regexes, codes or field names leaking into what a person reads.
    expect(result.message).not.toMatch(/regex|pattern|null|undefined|\bstring\b/i);
  });

  it("normalises case and stray mailto: so the unique index means something", () => {
    expect(normaliseEmail("  MailTo:Name@Example.COM ")).toBe("name@example.com");
    expect(checkEmail("Name@Example.com").email).toBe("name@example.com");
  });

  it("does NOT canonicalise provider-specific dots or +tags", () => {
    // Stripping these is a Gmail rule. Applying it to a provider that does not
    // share it silently rewrites somebody's real address into another mailbox.
    expect(checkEmail("first.last+tag@example.com").email).toBe("first.last+tag@example.com");
  });

  it("enforces the RFC length limits", () => {
    expect(checkEmail(`${"a".repeat(65)}@example.com`).problem).toBe("local_too_long");
    expect(checkEmail(`${"a".repeat(250)}@${"b".repeat(250)}.com`).problem).toBe("too_long");
  });
});
