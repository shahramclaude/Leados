import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Narrow Vitest config used only by Stryker, restricted to the domain-layer
 * unit tests that mutation testing targets. Keeping this separate from
 * vitest.config.ts keeps `npm test` fast while mutation runs stay scoped to
 * the math engines the standing order requires a mutation gate for.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["src/lib/domain/*.test.ts", "src/lib/hash.test.ts"],
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    testTimeout: 15000,
  },
});
