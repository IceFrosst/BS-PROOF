import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  // Static export on this repo is memory-bound, not CPU-bound: the default
  // (cores-1 = 9) workers each load the retained-run catalog, and on a 16 GB
  // dev machine with ~5 GB free the workers thrash and pages blow the default
  // 60 s deadline -- measured 2026-08-22 as builds failing on a DIFFERENT page
  // every attempt (the signature of contention, not of a broken page) after
  // three earlier same-day builds passed. Fewer workers finish sooner here and
  // cost little on CI, where 226 mostly-I/O pages do not saturate 4 workers.
  experimental: { cpus: 4 },
  staticPageGenerationTimeout: 180,
  // The analyze-label function reads these at REQUEST time via fs, so they must
  // be traced into its serverless bundle — on Vercel nothing outside the traced
  // set exists at runtime. Static pages read the same files at BUILD time and
  // need no tracing. Scoped to the one route so the rest of the app's functions
  // stay small: run artifacts are ~300 KB each and there are dozens.
  outputFileTracingIncludes: {
    "/api/analyze-label": [
      "./reports/runs/*_dashboard.json",
      "./reports/run_statuses.json",
      "./vocab/form.json",
      "./prompts/label.md",
      "./schemas/label.json",
    ],
    // /api/scan reads everything the label route does plus the compatibility
    // table and the two text prompts with their schemas (lib/analyze/scan.ts).
    "/api/scan": [
      "./reports/runs/*_dashboard.json",
      "./reports/run_statuses.json",
      "./vocab/form.json",
      "./vocab/compatibility.json",
      "./prompts/label.md",
      "./prompts/company.md",
      "./prompts/compatibility.md",
      "./prompts/evidence_prior.md",
      "./schemas/label.json",
      "./schemas/company.json",
      "./schemas/compatibility.json",
      "./schemas/evidence_prior.json",
      "./app/design-lab/ab/audits/*.json",
      "./app/design-lab/ab/audits/plain/*.json",
    ],
  },
};

export default nextConfig;
