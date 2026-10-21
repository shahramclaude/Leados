// scripts/ensure-extensions.ts — enables the Postgres extensions the
// retrieval stack needs (pg_trgm for fuzzy similarity, pgcrypto for
// gen_random_uuid()). Idempotent; safe to run every deploy.
import "dotenv/config";
import { pool } from "../src/db";

async function main() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  console.log("Extensions ensured: pg_trgm, pgcrypto");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
