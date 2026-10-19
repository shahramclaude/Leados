// src/lib/events/projections/index.ts
//
// Dispatches a single event to every projector that cares about it, and
// keeps `projection_checkpoints` in sync so rebuildProjections() can
// report progress and prove it reproduces the current state.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { projectionCheckpoints } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import { executionProjector } from "./execution";
import { financeProjector } from "./finance";
import { peopleProjector } from "./people";
import { strategyProjector } from "./strategy";
import { systemProjector } from "./system";
import type { Projector } from "./types";

export const PROJECTORS: Projector[] = [
  peopleProjector,
  executionProjector,
  strategyProjector,
  financeProjector,
  systemProjector,
];

async function bumpCheckpoint(tx: DbOrTx, projectorName: string, seq: bigint) {
  await tx
    .insert(projectionCheckpoints)
    .values({ projectionName: projectorName, lastSeq: seq, eventCount: sql`1` })
    .onConflictDoUpdate({
      target: projectionCheckpoints.projectionName,
      set: {
        lastSeq: seq,
        eventCount: sql`${projectionCheckpoints.eventCount} + 1`,
        rebuiltAt: sql`now()`,
      },
    });
}

export async function applyEventToProjections(tx: DbOrTx, event: LeadosEvent): Promise<void> {
  const seq = BigInt(event.seq);
  for (const projector of PROJECTORS) {
    if (!projector.handles(event.type)) continue;
    await projector.apply(tx, event);
    await bumpCheckpoint(tx, projector.name, seq);
  }
}

export type { Projector } from "./types";
