// Vitest config for VerseSignal.
// Tests live next to source files as `*.test.ts` (per project convention).
// Coverage is opt-in via `--coverage`; not enabled by default to keep
// the test loop fast (per motto_v3 §0.4.1, verification depth
// matches risk class; for the hackathon demo, focused tests >
// 100% coverage).

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".venv/**"],
    environment: "node",
    globals: false,
    testTimeout: 5000,
    reporters: process.env.CI ? ["default"] : ["default"],
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
