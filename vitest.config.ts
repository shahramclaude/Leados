import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/contract/**/*.test.ts"],
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    // Integration/contract tests share one Postgres instance and truncate
    // tables between tests (see tests/setup/db.ts) — run those files
    // sequentially so truncation from one file can't race another.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/domain/**/*.ts", "src/lib/app/**/*.ts", "src/lib/platform/**/*.ts"],
      exclude: ["src/lib/**/*.d.ts", "src/lib/openapi/**"],
      thresholds: {
        // Domain layer is pure, deterministic, and cheap to test exhaustively
        // (property-based) — held to the highest bar.
        "src/lib/domain/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
        // App layer orchestrates domain + repositories; covered by
        // integration tests hitting real Postgres — slightly lower bar to
        // account for defensive branches that are hard to trigger (e.g.
        // generic catch-alls).
        "src/lib/app/**": { statements: 85, branches: 75, functions: 85, lines: 85 },
        // Platform layer is mostly thin DB/HTTP plumbing exercised
        // indirectly through the app-layer integration tests.
        "src/lib/platform/**": { statements: 70, branches: 60, functions: 70, lines: 70 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
