// src/lib/events/projections/execution.ts — folds project.*/milestone.*/
// blocker.* events into the execution_* projection tables.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { blockersProjection, milestonesProjection, projectsProjection } from "@/db/schema";
import type { LeadosEvent } from "../eventStore";
import type { Projector } from "./types";

const HANDLED = new Set([
  "project.created",
  "project.updated",
  "project.completed",
  "milestone.created",
  "milestone.completed",
  "milestone.overdue",
  "blocker.raised",
  "blocker.resolved",
]);

export const executionProjector: Projector = {
  name: "execution",
  handles: (type) => HANDLED.has(type),
  async reset(tx: DbOrTx) {
    await tx.delete(blockersProjection);
    await tx.delete(milestonesProjection);
    await tx.delete(projectsProjection);
  },
  async apply(tx: DbOrTx, event: LeadosEvent) {
    if (!event.entityId) return;
    const id = event.entityId;
    const seq = BigInt(event.seq);
    const data = event.data as Record<string, unknown>;

    switch (event.type) {
      case "project.created": {
        await tx
          .insert(projectsProjection)
          .values({
            id,
            title: String(data.title ?? "Untitled project"),
            domain: String(data.domain ?? "execution"),
            owner: String(data.owner ?? "Unassigned"),
            status: "backlog",
            confidence: Number(data.confidence ?? 0.5),
            durationDays: Number(data.durationDays ?? 30),
            createdAt: new Date(event.ts),
            updatedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .onConflictDoNothing();
        return;
      }
      case "project.updated": {
        const patch: Partial<typeof projectsProjection.$inferInsert> = {
          updatedAt: new Date(event.ts),
          lastEventSeq: seq,
        };
        if (typeof data.status === "string") patch.status = data.status;
        if (typeof data.confidence === "number") patch.confidence = data.confidence;
        await tx.update(projectsProjection).set(patch).where(eq(projectsProjection.id, id));
        return;
      }
      case "project.completed": {
        await tx
          .update(projectsProjection)
          .set({ status: "done", completedAt: new Date(event.ts), updatedAt: new Date(event.ts), lastEventSeq: seq })
          .where(eq(projectsProjection.id, id));
        return;
      }
      case "milestone.created": {
        await tx
          .insert(milestonesProjection)
          .values({
            id,
            projectId: String(data.projectId ?? ""),
            title: String(data.title ?? "Untitled milestone"),
            dueDate: new Date(String(data.dueDate ?? event.ts)),
            lastEventSeq: seq,
          })
          .onConflictDoNothing();
        return;
      }
      case "milestone.completed": {
        await tx
          .update(milestonesProjection)
          .set({ completed: true, completedAt: new Date(event.ts), lastEventSeq: seq })
          .where(eq(milestonesProjection.id, id));
        return;
      }
      case "milestone.overdue": {
        await tx.update(milestonesProjection).set({ overdue: true, lastEventSeq: seq }).where(eq(milestonesProjection.id, id));
        return;
      }
      case "blocker.raised": {
        await tx
          .insert(blockersProjection)
          .values({
            id,
            projectId: String(data.projectId ?? ""),
            severity: String(data.severity ?? "medium"),
            description: String(data.description ?? ""),
            raisedAt: new Date(event.ts),
            lastEventSeq: seq,
          })
          .onConflictDoNothing();
        return;
      }
      case "blocker.resolved": {
        await tx
          .update(blockersProjection)
          .set({ resolved: true, resolvedAt: new Date(event.ts), lastEventSeq: seq })
          .where(eq(blockersProjection.id, id));
        return;
      }
      default:
        return;
    }
  },
};
