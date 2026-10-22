import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setupEnv.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Security/tenancy tests share one Postgres instance and truncate
    // between cases — running them in parallel workers would race on the
    // same rows, so this suite runs sequentially (see tests/helpers.ts
    // resetDb()). Small test count makes this fast in practice.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
