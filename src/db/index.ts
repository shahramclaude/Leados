import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
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

export type Database = NodePgDatabase<typeof schema>;

/** Process-wide pool-backed db client, used outside of the test transaction context. */
export const db: Database = drizzle(pool, { schema });

/**
 * Transaction-rollback test fixture support.
 *
 * Integration tests call `withTestTransaction` to open a real Postgres
 * transaction against the ephemeral/seeded test database, bind a drizzle
 * instance to that single connection, and make it the implicit db for the
 * duration of the callback via AsyncLocalStorage. Every route handler reads
 * the "current" db through `getDb()` instead of importing `db` directly, so
 * application code under test transparently runs inside the test's
 * transaction and never needs to know it is being tested. The transaction is
 * rolled back unconditionally once the callback settles, so tests never leak
 * state into one another or require manual cleanup/truncation.
 *
 * See docs/TESTING.md for the full rationale.
 */
const dbContext = new AsyncLocalStorage<Database>();

export function getDb(): Database {
  return dbContext.getStore() ?? db;
}

export async function withTestTransaction<T>(
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = drizzle(client, { schema });
    try {
      return await dbContext.run(tx, () => fn(tx));
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
}
