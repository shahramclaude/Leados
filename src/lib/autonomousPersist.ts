// ─────────────────────────────────────────────────────────────────────────
// Thin, side-effecting wrapper around the pure `runAutonomousCycle`. Kept
// out of autonomousRunner.ts so that module stays a pure function library —
// this file is where the cycle's results actually get written to Postgres
// and fanned out over the live event bus.
// ─────────────────────────────────────────────────────────────────────────
import { inArray } from "drizzle-orm";
import type { db as DbInstance } from "@/db";
import { leados_autonomous_runs, leados_notifications, leados_work_queue } from "@/db/schema";
import { runAutonomousCycle } from "./autonomousRunner";
import { publishStreamEvent } from "./eventBus";
import type { AutonomousRunResult } from "./types";

type DbClient = typeof DbInstance;

export interface PersistedAutonomousRun extends AutonomousRunResult {
  persisted: {
    workItemsCreated: number;
    workItemsResolved: number;
    notificationsCreated: number;
  };
}

export async function persistAutonomousRun(db: DbClient, today: Date = new Date()): Promise<PersistedAutonomousRun> {
  const result = await runAutonomousCycle(db, today);

  const createdWorkItems = result.newWorkItems.length
    ? await db
        .insert(leados_work_queue)
        .values(
          result.newWorkItems.map((item) => ({
            title: item.title,
            steps: item.steps,
            status: "pending" as const,
            domain: item.domain,
            findingKey: item.findingKey,
            source: item.source,
            priority: item.priority,
            dueAt: item.dueAt,
            suggestedAction: item.suggestedAction ?? null,
          })),
        )
        .returning()
    : [];

  if (result.staleWorkItemIds.length) {
    await db
      .update(leados_work_queue)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(inArray(leados_work_queue.id, result.staleWorkItemIds));
  }

  const createdNotifications = result.notifications.length
    ? await db
        .insert(leados_notifications)
        .values(
          result.notifications.map((n) => ({
            type: n.type,
            severity: n.severity,
            title: n.title,
            body: n.body,
            entityType: n.entityType ?? null,
            entityId: n.entityId ?? null,
          })),
        )
        .returning()
    : [];

  await db.insert(leados_autonomous_runs).values({
    ranAt: new Date(result.runAt),
    findingsCount: result.counts.findings,
    actionsTaken: createdWorkItems.length + result.staleWorkItemIds.length,
    escalations: result.counts.escalations,
    durationMs: result.durationMs,
    snapshot: {
      findings: result.findings,
      summary: result.summary,
      counts: result.counts,
    },
  });

  for (const f of result.newFindings) {
    publishStreamEvent({ type: "finding", action: "new", payload: f });
  }
  for (const f of result.resolvedFindings) {
    publishStreamEvent({ type: "finding", action: "resolved", payload: f });
  }
  for (const row of createdWorkItems) {
    publishStreamEvent({ type: "work_item", action: "created", payload: row });
  }
  if (result.staleWorkItemIds.length) {
    publishStreamEvent({ type: "work_item", action: "resolved", payload: { ids: result.staleWorkItemIds } });
  }
  for (const row of createdNotifications) {
    publishStreamEvent({ type: "notification", action: "new", payload: row });
  }
  publishStreamEvent({ type: "run", action: "completed", payload: { summary: result.summary, ranAt: result.runAt } });

  return {
    ...result,
    persisted: {
      workItemsCreated: createdWorkItems.length,
      workItemsResolved: result.staleWorkItemIds.length,
      notificationsCreated: createdNotifications.length,
    },
  };
}
