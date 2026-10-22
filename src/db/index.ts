import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

// Exported as `let` (not `const`) so the test fixture
// (`tests/fixtures/db.ts`) can swap in a transaction-scoped client via
// `__setDbForTests`. Thanks to ES module live bindings, every module that
// did `import { db } from "@/db"` automatically observes the swap — no
// dependency-injection plumbing needed in route handlers.
export let db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

/** TEST-ONLY: swap the active db client (see tests/fixtures/db.ts). */
export function __setDbForTests(next: NodePgDatabase<typeof schema>): void {
  db = next;
}
