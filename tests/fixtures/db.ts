import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@/db/schema";
import { __setDbForTests } from "@/db";

/**
 * Transaction-rollback DB fixture.
 *
 * Every integration test runs inside its own Postgres transaction that is
 * ALWAYS rolled back at the end — regardless of pass/fail — so tests never
 * leak state into each other and never require manual cleanup/truncation.
 * The fixture swaps `@/db`'s pool-backed `db` client for a client bound to
 * the open transaction via a module-level override used by
 * `withTransactionalDb`.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for tests");
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export type TxDb = NodePgDatabase<typeof schema>;

/**
 * Runs `fn` with a database handle scoped to a single transaction that is
 * rolled back afterwards. Returns whatever `fn` returns.
 */
export async function withTransactionalDb<T>(
  fn: (db: TxDb, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client, { schema });
    try {
      return await fn(txDb, client);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
}

/**
 * Integration-test convenience: opens a transaction, points the app's
 * singleton `@/db` client at it (so route handlers under test transparently
 * use it), runs `fn`, then rolls back and restores the original client.
 */
export async function withAppDbInTransaction<T>(
  fn: (db: TxDb) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client, { schema });
    __setDbForTests(txDb);
    try {
      return await fn(txDb);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
