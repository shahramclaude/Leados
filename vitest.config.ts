import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: [
      "src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/convention/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "tests/visual/**", "node_modules/**", ".next/**"],
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    // Integration/contract specs hit the same Postgres pool via transaction
    // rollback — run them sequentially within a file but allow files to run
    // in parallel worker pools since each opens its own pooled connection.
    coverage: {
      provider: "v8", // justified in docs/TESTING.md
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["src/lib/domain/*.test.ts", "**/*.d.ts"],
      thresholds: {
        // Layer-specific thresholds declared in docs/TESTING.md.
        lines: 80,
        statements: 80,
        branches: 70,
        functions: 80,
      },
    },
  },
});
