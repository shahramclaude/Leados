import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import importPlugin from "eslint-plugin-import";

// LEADOS architecture law, enforced mechanically (see ARCHITECTURE.md):
//
//   src/app/**          (routes/UI)
//      -> src/lib/app/**        (use-cases/orchestration)
//         -> src/lib/domain/**  (pure engines, ZERO I/O)
//            -> src/lib/platform/** (db, events, storage, clock, randomness)
//
// `src/lib/domain/**` must never import from `platform`, `app` (either the
// use-case layer or the Next.js app), or `@/db` directly — it must stay
// pure and testable without a database.
//
// `src/lib/platform/**` must never import from `src/lib/app/**` or
// `src/app/**` — the lowest layer cannot depend on anything above it.
const architectureBoundaries = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { import: importPlugin },
  rules: {
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          {
            target: "./src/lib/domain",
            from: "./src/lib/platform",
            message:
              "Domain engines must be pure: no imports from src/lib/platform. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/domain",
            from: "./src/lib/app",
            message:
              "Domain engines must be pure: no imports from src/lib/app. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/domain",
            from: "./src/app",
            message:
              "Domain engines must be pure: no imports from src/app. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/domain",
            from: "./src/db",
            message:
              "Domain engines must be pure: no direct database imports. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/platform",
            from: "./src/lib/app",
            message:
              "Platform is the lowest layer and must not depend on src/lib/app. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/platform",
            from: "./src/app",
            message:
              "Platform is the lowest layer and must not depend on src/app. See ARCHITECTURE.md.",
          },
          {
            target: "./src/lib/platform/repositories",
            from: "./src/lib/platform",
            except: ["./repositories"],
            message:
              "Repositories should only depend on @/db and their own peers, not other platform modules.",
          },
          {
            target: ["./src/lib/app", "./src/lib/domain"],
            from: "./src/db",
            except: ["./schema.ts"],
            message:
              "Only the repository layer (src/lib/platform/repositories) may import the Drizzle client @/db. See ARCHITECTURE.md.",
          },
        ],
      },
    ],
  },
};

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  architectureBoundaries,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
