// src/lib/events/projections/strategy.ts — folds decision.*/okr.* events
// into decisions_projection / okr_projection.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { decisionsProjection, okrProjection } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import type { Projector } from "./types";

const HANDLED = new Set(["decision.logged", "decision.outcome", "okr.set", "okr.progress"]);

export const strategyProjector: Projector = {
  name: "strategy",
  handles: (type) => HANDLED.has(type),
  async reset(tx: DbOrTx) {
    await tx.delete(decisionsProjection);
    await tx.delete(okrProjection);
  },
  async apply(tx: DbOrTx, event: LeadosEvent) {
    if (!event.entityId) return;
    const id = event.entityId;
    const seq = BigInt(event.seq);
    const data = event.data as Record<string, unknown>;

    switch (event.type) {
      case "decision.logged": {
        await tx
          .insert(decisionsProjection)
          .values({
            id,
            title: String(data.title ?? "Untitled decision"),
            owner: String(data.owner ?? "Unassigned"),
            status: "open",
            severity: String(data.severity ?? "medium"),
            dueDate: data.dueDate ? new Date(String(data.dueDate)) : null,
            description: String(data.description ?? ""),
            loggedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .onConflictDoNothing();
        return;
      }
      case "decision.outcome": {
        await tx
          .update(decisionsProjection)
          .set({
            status: String(data.status ?? "decided"),
            outcome: (data.outcome as string | undefined) ?? null,
            decidedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .where(eq(decisionsProjection.id, id));
        return;
      }
      case "okr.set": {
        await tx
          .insert(okrProjection)
          .values({
            id,
            title: String(data.title ?? "Untitled objective"),
            owner: String(data.owner ?? "Unassigned"),
            quarterStart: new Date(String(data.quarterStart ?? event.ts)),
            updatedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .onConflictDoNothing();
        return;
      }
      case "okr.progress": {
        await tx
          .update(okrProjection)
          .set({
            progress: Number(data.progress ?? 0),
            health: String(data.health ?? "on_track"),
            updatedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .where(eq(okrProjection.id, id));
        return;
      }
      default:
        return;
    }
  },
};
