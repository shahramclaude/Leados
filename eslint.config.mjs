import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  // Per ADR-0007, quarantined legacy Next/Vite TypeScript trees are excluded so `npm run lint`
  // deterministically lints the canonical zero-build app (`app/**`), scripts (`scripts/*.mjs`), and tests (`tests/app/*.mjs`).
  ...nextCoreWebVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/**",
    "deprecated/**",
    "public/**",
    "stryker.config.mjs",
    "**/*.ts",
    "**/*.tsx",
  ]),
]);
