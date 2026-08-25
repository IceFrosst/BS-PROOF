/*
 * Email normalisation and validation for the waitlist. Pure functions, no I/O,
 * so the rules are unit-testable without a database.
 *
 * The bar here is deliberately LOW. This runs at a conference stand: someone
 * scans a QR code, types their address on a phone, and walks away. Rejecting a
 * real address costs a lead we can never recover; accepting a typo costs one
 * bounced email. Those are not symmetric, so this only refuses input that
 * cannot be an address at all, and never tries to be clever about which
 * providers exist.
 */

/** The longest address RFC 5321 allows. Anything beyond this is not a typo. */
const MAX_LENGTH = 254;
/** The local part (before the @) has its own, shorter, limit. */
const MAX_LOCAL = 64;

export type EmailProblem =
  | "empty"
  | "too_long"
  | "no_at"
  | "multiple_at"
  | "empty_local"
  | "local_too_long"
  | "bad_domain"
  | "has_whitespace";

export interface EmailCheck {
  ok: boolean;
  /** Normalised form, safe to store. Only set when ok. */
  email?: string;
  problem?: EmailProblem;
  /** What to show the person, in their terms — never a regex or a code. */
  message?: string;
}

const MESSAGES: Record<EmailProblem, string> = {
  empty: "Enter an email address.",
  too_long: "That address is too long to be valid.",
  no_at: "That address is missing an @.",
  multiple_at: "That address has more than one @.",
  empty_local: "There is nothing before the @.",
  local_too_long: "The part before the @ is too long.",
  bad_domain: "The part after the @ does not look like a domain.",
  has_whitespace: "That address contains a space.",
};

function fail(problem: EmailProblem): EmailCheck {
  return { ok: false, problem, message: MESSAGES[problem] };
}

/**
 * Normalise for storage and comparison: trim, strip a stray mailto:, lowercase.
 *
 * Lowercasing the DOMAIN is always safe (DNS is case-insensitive). Lowercasing
 * the local part technically is not — RFC 5321 lets a server treat it as
 * case-sensitive — but no mainstream provider does, and storing
 * `Name@x.com` and `name@x.com` as two different people is a worse error at a
 * conference stand than the theoretical one. This is also what makes the
 * unique index on the column meaningful.
 *
 * What it deliberately does NOT do is canonicalise Gmail-style dots or +tags.
 * Those rules are provider-specific, and applying them to a provider that does
 * not share them silently rewrites somebody's real address.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().replace(/^mailto:/i, "").trim().toLowerCase();
}

export function checkEmail(raw: unknown): EmailCheck {
  if (typeof raw !== "string") return fail("empty");
  const email = normaliseEmail(raw);

  if (!email) return fail("empty");
  if (email.length > MAX_LENGTH) return fail("too_long");
  if (/\s/.test(email)) return fail("has_whitespace");

  const at = email.split("@");
  if (at.length === 1) return fail("no_at");
  if (at.length > 2) return fail("multiple_at");

  const [local, domain] = at;
  if (!local) return fail("empty_local");
  if (local.length > MAX_LOCAL) return fail("local_too_long");

  // A domain needs a dot with something either side, and cannot start or end
  // with a dot or hyphen. That is the whole test: no TLD allow-list, because
  // new TLDs appear constantly and a stale list rejects real addresses.
  const domainOk =
    domain.length > 0 &&
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".") &&
    !domain.startsWith("-") &&
    !domain.endsWith("-") &&
    !domain.includes("..") &&
    /^[a-z0-9.-]+$/.test(domain) &&
    /\.[a-z]{2,}$/.test(domain);
  if (!domainOk) return fail("bad_domain");

  return { ok: true, email };
}
