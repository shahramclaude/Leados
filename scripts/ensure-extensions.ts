// Ensures the Postgres extensions the hybrid retrieval pipeline needs
// (pg_trgm for trigram similarity) exist. Safe to run repeatedly. Run
// automatically as part of `npm run db:push`.
import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    console.log("[ensure-extensions] pg_trgm ready.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[ensure-extensions] failed:", err);
  process.exit(1);
});
