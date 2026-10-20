// Fail-fast environment access: one clear error at boot instead of a
// cryptic failure three layers down.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** The bearer token external API callers must present for mutating `/api/*` routes. */
export function getApiToken(): string {
  return process.env.API_TOKEN ?? "leados-dev-token";
}
