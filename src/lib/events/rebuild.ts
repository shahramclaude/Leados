// src/lib/events/rebuild.ts
//
// `rebuildProjections()` — the proof that projections are truly derived
// data. Drops every projection table's rows and replays the entire event
// log, in seq order, through the exact same projector code the live write
// path uses. Must be idempotent: running it twice in a row produces byte
// -identical projection tables (verified in docs/DATA.md "Verification").

import { asc, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { rowToEvent } from "./eventStore";
import { applyEventToProjections, PROJECTORS } from "./projections";

export interface RebuildReport {
  eventsProcessed: number;
  projectorsReset: string[];
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

const BATCH_SIZE = 500;

export async function rebuildProjections(): Promise<RebuildReport> {
  const startedAt = new Date();

  const report = await db.transaction(async (tx) => {
    for (const projector of PROJECTORS) {
      await projector.reset(tx);
    }
    // Reset checkpoints after projector resets, inside the same transaction,
    // so a crash mid-rebuild never leaves checkpoints pointing past empty
    // projection tables.
    await tx.execute(sql`DELETE FROM projection_checkpoints`);

    let processed = 0;
    let lastSeq: bigint | null = null;
    // Keyset-paginate through the entire event log so a rebuild never has
    // to materialize millions of rows in memory at once.
    for (;;) {
      const page = await tx
        .select()
        .from(events)
        .where(lastSeq === null ? undefined : gt(events.seq, lastSeq))
        .orderBy(asc(events.seq))
        .limit(BATCH_SIZE);

      if (page.length === 0) break;

      for (const row of page) {
        const event = rowToEvent(row);
        await applyEventToProjections(tx, event);
        processed += 1;
        lastSeq = row.seq;
      }

      if (page.length < BATCH_SIZE) break;
    }

    return { eventsProcessed: processed };
  });

  const finishedAt = new Date();
  return {
    eventsProcessed: report.eventsProcessed,
    projectorsReset: PROJECTORS.map((p) => p.name),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}
