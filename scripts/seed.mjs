// Executes scripts/seed.sql against DATABASE_URL. Pure Node + `pg`, no
// reliance on a `psql` binary being present on PATH, so `npm run db:seed`
// works the same in CI, in the sandbox, and on a contributor's laptop.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to run db:seed. See docs/CONFIG.md.");
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, "seed.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Seeded database from ${path.relative(process.cwd(), sqlPath)}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("db:seed failed:", error);
  process.exit(1);
});
