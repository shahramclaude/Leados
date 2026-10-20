// Drops every LEADOS table (in dependency order) so `npm run db:push` can
// recreate a clean schema from src/db/schema.ts. Used for local development
// resets only — never run this against a production DATABASE_URL.
import "dotenv/config";
import { Client } from "pg";

const TABLES_IN_DROP_ORDER = ["event_log", "leaders", "organizations"];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required to run db:reset. See docs/CONFIG.md.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const table of TABLES_IN_DROP_ORDER) {
      await client.query(`drop table if exists ${table} cascade;`);
      console.log(`Dropped ${table} (if it existed)`);
    }
  } finally {
    await client.end();
  }

  console.log("Reset complete. Run `npm run db:push` to recreate the schema, then `npm run db:seed`.");
}

main().catch((error) => {
  console.error("db:reset failed:", error);
  process.exit(1);
});
