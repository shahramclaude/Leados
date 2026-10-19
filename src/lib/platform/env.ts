// Fail-fast environment validation. Import this from anything that needs an
// env var so a missing value produces one clear error at the call site
// instead of a cryptic failure three layers down.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
};
