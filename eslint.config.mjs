import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // Part 58 determinism contract: agent planning/policy/critic/execution
    // logic must read time only through the injected Clock (clock.ts), never
    // directly, so that replay is byte-identical. See clock.ts for the full
    // rationale and the second enforcement layer (no-bare-clock.test.ts).
    files: ["src/lib/agent/**/*.ts"],
    ignores: ["src/lib/agent/clock.ts", "src/lib/agent/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Use Clock.nowMs() instead of Date.now() in agent kernel logic (determinism contract).",
        },
        {
          selector: "NewExpression[callee.name='Date']:not([arguments.0])",
          message: "Use Clock.nowIso() instead of `new Date()` in agent kernel logic (determinism contract).",
        },
      ],
    },
  },
]);
