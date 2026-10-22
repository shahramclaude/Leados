// src/lib/platform/connectors/seed.ts
//
// Idempotently materializes the registry's connector definitions as DB rows
// (so health/history/config can be tracked per-connector). Safe to call on
// every request; only inserts rows that don't exist yet.
import { db } from "@/db";
import { connectors as connectorsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listConnectorDefinitions } from "./registry";

let seeded = false;

export async function ensureConnectorsSeeded(): Promise<void> {
  if (seeded) return;
  const defs = listConnectorDefinitions();
  for (const def of defs) {
    const [existing] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, def.id));
    if (existing) continue;
    await db.insert(connectorsTable).values({
      id: def.id,
      name: def.displayName,
      kind: def.kind,
      authType: def.authType,
      config: {},
      schemaMap: def.schemaMap,
      rateLimits: def.rateLimits,
      retryPolicy: def.retryPolicy,
      precedenceRank: def.precedenceRank,
      healthState: "unknown",
    });
  }
  seeded = true;
}
