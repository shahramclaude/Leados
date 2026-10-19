// src/db/schemaVersion.ts
//
// Boot-time schema version check. The `schema_version` table records every
// migration applied to the database (one row per migration, inserted by
// src/db/migrate.ts right after drizzle applies the corresponding SQL
// file). The app refuses to serve traffic if the database's latest applied
// version is older than CURRENT_SCHEMA_VERSION — this turns "forgot to run
// db:migrate on a fresh clone" into a loud, immediate error instead of
// confusing runtime failures deep in a query.

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { schemaVersion } from "@/db/schema";

// Bump this whenever a new migration changes the shape of the truth
// engine (events, projections, or bitemporal tables). Keep in lockstep
// with the `description` passed to recordMigration() in the newest
// migration's companion seed step — see docs/DATA.md "Migration workflow".
export const CURRENT_SCHEMA_VERSION = 2;

export interface SchemaVersionStatus {
  ok: boolean;
  currentVersion: number;
  expectedVersion: number;
  appliedAt: string | null;
  description: string | null;
}

export async function checkSchemaVersion(): Promise<SchemaVersionStatus> {
  try {
    const [row] = await db
      .select()
      .from(schemaVersion)
      .orderBy(desc(schemaVersion.version))
      .limit(1);

    const currentVersion = row?.version ?? 0;
    return {
      ok: currentVersion >= CURRENT_SCHEMA_VERSION,
      currentVersion,
      expectedVersion: CURRENT_SCHEMA_VERSION,
      appliedAt: row?.appliedAt ? new Date(row.appliedAt).toISOString() : null,
      description: row?.description ?? null,
    };
  } catch {
    // Table doesn't exist yet — database has never been migrated.
    return {
      ok: false,
      currentVersion: 0,
      expectedVersion: CURRENT_SCHEMA_VERSION,
      appliedAt: null,
      description: null,
    };
  }
}

export async function assertSchemaVersion(): Promise<void> {
  const status = await checkSchemaVersion();
  if (!status.ok) {
    throw new Error(
      `LEADOS database schema is out of date (found version ${status.currentVersion}, ` +
        `need ${status.expectedVersion}). Run "npm run db:migrate" against DATABASE_URL ` +
        `before starting the app. See docs/DATA.md.`,
    );
  }
}
