/**
 * src/lib/seed.ts — ensures the Postgres-backed event log has baseline
 * data the first time any API route runs, so the cockpit/intelligence
 * views are never empty on a fresh database.
 */

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { buildBaselineDataset } from "./seedData";
import { hasData } from "./store";

let seeding: Promise<void> | null = null;

export async function seedIfEmpty(): Promise<void> {
  if (await hasData()) return;
  const dataset = buildBaselineDataset(new Date());
  if (dataset.length === 0) return;
  await db.insert(eventsTable).values(
    dataset.map((e) => ({
      eventId: e.id,
      ts: new Date(e.ts),
      type: e.type,
      data: e.data,
      seeded: true,
    }))
  );
}

/** Concurrency-safe wrapper — multiple simultaneous API requests on a
 * cold database will only trigger one seed pass. */
export async function ensureBaselineData(): Promise<void> {
  if (!seeding) {
    seeding = seedIfEmpty().finally(() => {
      seeding = null;
    });
  }
  await seeding;
}
