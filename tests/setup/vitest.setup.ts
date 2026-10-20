import "dotenv/config";

// Deterministic time: freeze nothing globally (domain engines take seeds
// explicitly, per src/lib/domain/prng.ts), but fail fast if DATABASE_URL is
// missing so integration tests give a clear error instead of a timeout.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required to run the test suite (integration tests hit a real, " +
      "ephemeral Postgres instance). See docs/TESTING.md.",
  );
}

process.env.API_TOKEN = process.env.API_TOKEN ?? "leados-dev-token";
