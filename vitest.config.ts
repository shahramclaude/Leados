import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    // Default environment is "node" (correct for domain/route tests, which
    // are the majority). UI component tests opt into jsdom per-file via a
    // `// @vitest-environment jsdom` docblock comment instead of a global
    // glob match (environmentMatchGlobs was removed in Vitest 5).
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/contract/**/*.test.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    testTimeout: 15_000,
    hookTimeout: 20_000,
    // Integration tests share one Postgres instance and must not run
    // concurrently against overlapping transactions on the same pool.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx", // presentational shells, covered by e2e/visual instead
        "src/app/globals.css",
      ],
      thresholds: {
        // Domain math engines: the highest bar. Property-based tests are
        // expected to exercise nearly every branch.
        "src/lib/domain/**": { lines: 85, statements: 85, branches: 80, functions: 85 },
        // Route handlers: integration-tested per family (happy/auth-fail/
        // validation-fail/pagination/tenancy).
        "src/app/api/**": { lines: 70, statements: 70, branches: 65, functions: 70 },
        // Interactive UI components (command palette, theme toggle, offline
        // queue) — presentational JSX pages are excluded above and covered
        // by Playwright e2e/visual instead (see docs/TESTING.md).
        "src/components/**": { lines: 60, statements: 60, branches: 50, functions: 60 },
      },
    },
  },
});
