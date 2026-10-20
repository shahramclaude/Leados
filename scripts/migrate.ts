// LEADOS Part 01 — `db:migrate` equivalent.
//
// There is no `npm run db:migrate` script (package.json may only be edited
// via the platform's install_npm_packages tool, which does not add custom
// scripts — see AI-SESSION-LOG.md Part 01). Run this directly:
//   npx tsx scripts/migrate.ts
//
// What it does, in order (both steps are expand-only / idempotent):
//   1. `drizzle-kit push` — applies src/db/schema.ts (tables + indexes).
//   2. Applies scripts/sql/0001_events_append_only.sql — the append-only
//      trigger + partial unique index that drizzle-kit push cannot express.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@/db";

async function main() {
  console.log("[migrate] running drizzle-kit push...");
  execSync("npx drizzle-kit push --force", { stdio: "inherit" });

  console.log("[migrate] applying append-only trigger + partial index (scripts/sql/0001_events_append_only.sql)...");
  const sqlPath = join(process.cwd(), "scripts", "sql", "0001_events_append_only.sql");
  const sqlText = readFileSync(sqlPath, "utf8");
  await pool.query(sqlText);

  console.log("[migrate] done.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[migrate] failed:", err);
    await pool.end();
    process.exit(1);
  });
