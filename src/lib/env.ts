// Centralised, validated environment access. Nothing in this codebase should
// read `process.env.X` directly outside this module (enforced by code
// review / grep in CI — see scripts/check-route-registry.mjs companion
// checks) so that a missing secret fails fast at boot instead of silently
// producing an insecure default in production.
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Session signing secret (HS256). In production this MUST come from a
  // secret manager / orchestrator-injected env var, never from a committed
  // file. docs/SECURITY.md documents rotation.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .optional(),
  // Comma-separated list of "old" secrets still accepted for verification
  // during a rotation window, newest-first excluded (current secret is
  // SESSION_SECRET itself). Allows zero-downtime secret rotation.
  SESSION_SECRET_PREVIOUS: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

const globalForEnv = globalThis as typeof globalThis & { __leadosEnv?: Env };
export const env = globalForEnv.__leadosEnv ?? loadEnv();
if (process.env.NODE_ENV !== "production") {
  globalForEnv.__leadosEnv = env;
}

const DEV_ONLY_FALLBACK_SECRET = "dev-insecure-session-secret-change-me-0123456789";

/** Current + previous signing secrets, current first. Never logged. */
export function getSessionSecrets(): string[] {
  const current =
    env.SESSION_SECRET ??
    (env.NODE_ENV === "production"
      ? (() => {
          throw new Error("SESSION_SECRET is required in production");
        })()
      : DEV_ONLY_FALLBACK_SECRET);
  const previous = (env.SESSION_SECRET_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [current, ...previous];
}

export const isProduction = env.NODE_ENV === "production";
