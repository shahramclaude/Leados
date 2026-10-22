// Central environment helpers. Nothing else in src/lib should read
// `process.env.NODE_ENV` or a secret directly — go through here so there is
// exactly one place that enforces "no insecure default in production".
import "server-only";

export const isProduction = process.env.NODE_ENV === "production";

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret-change-me";

/**
 * Session signing secret(s). The *first* entry is used to sign new tokens;
 * all entries are tried when verifying, so a secret can be rotated by
 * prepending a new one and keeping the old one for one deployment cycle
 * (see docs/RUNBOOKS.md "Credential leak -> rotate & revoke").
 */
export function getSessionSecrets(): string[] {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.trim().length === 0) {
    if (isProduction) {
      throw new Error(
        "SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32",
      );
    }
    return [DEV_FALLBACK_SECRET];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
