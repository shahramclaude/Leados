import { defineConfig } from "vitest/config";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // MDM/lineage/import tests share the real Postgres instance; run them
    // sequentially to avoid cross-test interference in shared tables.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
