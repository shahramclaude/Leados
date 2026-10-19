import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/platform/env";
import * as schema from "@/db/schema";

// `env` throws a descriptive, fail-fast error at import time if
// DATABASE_URL (or any other required variable) is missing or invalid.
// See src/lib/platform/env.ts and docs/CONFIG.md.

const globalForDb = globalThis as typeof globalThis & {
  __leadosPool?: Pool;
};

export const pool =
  globalForDb.__leadosPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.__leadosPool = pool;
}

export const db = drizzle(pool, { schema });
