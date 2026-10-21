import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**", "reports/**"]),
  {
    // Determinism convention (Part 15, standing order C): domain engines must
    // derive randomness/time from prng.ts/clock.ts, never from the global
    // Math.random / Date.now / `new Date()`, so simulations and mutation
    // tests stay reproducible. Backed by a redundant runtime convention test
    // in tests/convention/no-nondeterminism.test.ts.
    files: ["src/lib/domain/**/*.ts"],
    ignores: ["src/lib/domain/**/*.test.ts", "src/lib/domain/prng.ts", "src/lib/domain/clock.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use a seeded Prng from src/lib/domain/prng.ts instead of Math.random()." },
        { object: "Date", property: "now", message: "Use an injected Clock from src/lib/domain/clock.ts instead of Date.now()." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "Use an injected Clock from src/lib/domain/clock.ts instead of `new Date()`.",
        },
      ],
    },
  },
]);
