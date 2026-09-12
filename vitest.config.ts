import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "jsdom",
    // .tsx must be included or component tests never run: the previous glob
    // matched only .test.ts, so a rendering test could be committed, pass code
    // review, and never execute.
    //
    // tests/*.test.ts (top level) carries the Python<->TS scoring-parity suite
    // for lib/analyze — node-side fs work, no DOM, but jsdom tolerates it and
    // one environment keeps the config from forking.
    include: ["tests/dashboard/**/*.test.{ts,tsx}", "tests/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});
