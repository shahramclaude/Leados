import { z } from "zod";

/**
 * Centralized, fail-fast environment validation. Importing this module
 * anywhere guarantees the process will refuse to boot with missing or
 * malformed secrets rather than silently running with an insecure default.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters (use a random base64 secret)"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid/missing environment configuration: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "development") === "production";
}
