import { describe, expect, it } from "vitest";

import { metadata as rootMetadata } from "@/app/layout";
import { metadata as scanMetadata } from "@/app/scan/page";
import vercel from "@/vercel.json";

// GSI's button was HTTP 400 with no Referer and HTTP 200 when given only the
// canonical HTTPS origin. Keep that exception narrow: never unsafe-url or a
// path-bearing policy, and never a site-wide hosting-header relaxation.
describe("Google sign-in referrer scope", () => {
  it("allows only the origin on the scan/history document", () => {
    expect(scanMetadata.referrer).toBe("strict-origin");
  });

  it("restores no-referrer as inherited metadata outside scan", () => {
    expect(rootMetadata.referrer).toBe("no-referrer");
  });

  it("preserves the restrictive hosting headers for all other requests", () => {
    const global = vercel.headers.find((rule) => rule.source === "/(.*)");
    expect(global?.headers).toEqual(expect.arrayContaining([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ]));
    expect(vercel.headers).toHaveLength(1);
  });
});
