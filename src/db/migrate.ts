// src/db/migrate.ts
//
// Programmatic migration runner used by `npm run db:migrate`. Applies every
// SQL file in ./drizzle that hasn't been applied yet (tracked in Postgres
// table `__drizzle_migrations`, per drizzle.config.json). Never hand-edit a
// migration that has already shipped — generate a new one instead
// (`npm run db:generate`). See docs/DATA.md "Migration workflow".

import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

async function main() {
  console.log("[db:migrate] applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db:migrate] done.");
  await pool.end();
}

main().catch((err) => {
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});
