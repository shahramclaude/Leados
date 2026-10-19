// src/lib/events/projections/finance.ts — folds finance.snapshot events
// into finance_snapshots_projection.
import type { DbOrTx } from "@/db";
import { financeSnapshotsProjection } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import type { Projector } from "./types";

export const financeProjector: Projector = {
  name: "finance",
  handles: (type) => type === "finance.snapshot",
  async reset(tx: DbOrTx) {
    await tx.delete(financeSnapshotsProjection);
  },
  async apply(tx: DbOrTx, event: LeadosEvent) {
    const data = event.data as Record<string, unknown>;
    await tx
      .insert(financeSnapshotsProjection)
      .values({
        id: event.id,
        ts: new Date(event.ts),
        cash: Number(data.cash ?? 0),
        mrr: Number(data.mrr ?? 0),
        burn: Number(data.burn ?? 0),
        runwayMonths: Number(data.runwayMonths ?? 0),
        raw: data,
      })
      .onConflictDoNothing();
  },
};
