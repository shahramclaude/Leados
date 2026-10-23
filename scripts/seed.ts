// LEADOS — Part 56: `npm run db:seed` — (re)seeds the accountability tables.
import "./lib/loadEnv";
import { seedDatabase } from "../src/lib/accountability/seed";
import { pool } from "../src/db";

async function main() {
  const summary = await seedDatabase();
  console.log("=== LEADOS Part 56 — Database Seed ===");
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await pool.end();
  process.exit(1);
});
