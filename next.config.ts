import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
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
    ],
  },
};

export default nextConfig;
