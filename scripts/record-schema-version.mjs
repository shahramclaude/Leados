// Run after `drizzle-kit push` (see "db:migrate" in package.json) to record
// which schema version is now live in the database. The composite health
// check (src/lib/health/checks.ts -> checkSchemaVersion) compares this
// value against src/db/schemaVersion.json at request time, so a deploy that
// changed the schema but forgot to run this script shows up as a "fail"
// on /api/health instead of silently drifting.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const schemaVersionPath = fileURLToPath(new URL("../src/db/schemaVersion.json", import.meta.url));
const { version } = JSON.parse(readFileSync(schemaVersionPath, "utf8"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to record the schema version.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();
  await client.query(
    `insert into system_meta (key, value, updated_at)
     values ('schema_version', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [version],
  );
  console.log(`Recorded schema_version=${version} in system_meta.`);
}

main()
  .catch((error) => {
    console.error("Failed to record schema version:", error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
