/**
 * src/lib/platform/env.ts
 *
 * Single source of truth for server-side environment configuration.
 *
 * LEADOS fails fast at boot when a required variable is missing or
 * malformed instead of throwing a confusing error deep inside a database
 * driver or third-party SDK. Every required variable is documented in
 * `docs/CONFIG.md` — keep that table and this schema in sync.
 */
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({
      error: () =>
        "DATABASE_URL is required (see docs/CONFIG.md). Example: postgresql://postgres:postgres@127.0.0.1:5432/app_db",
    })
    .min(1, "DATABASE_URL must not be empty (see docs/CONFIG.md)"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      [
        "LEADOS failed to start because the environment is misconfigured.",
        "The following problems were found:",
        issues,
        "See docs/CONFIG.md for the full list of required variables.",
      ].join("\n"),
    );
  }

  return parsed.data;
}

const globalForEnv = globalThis as typeof globalThis & { __leadosEnv?: Env };

export const env = globalForEnv.__leadosEnv ?? loadEnv();

if (process.env.NODE_ENV !== "production") {
  globalForEnv.__leadosEnv = env;
}
