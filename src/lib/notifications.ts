// Notification creation pipeline: dedup ("one root cause = one
// notification"), attention-policy routing (interrupt vs digest vs
// suppressed), durable event emission, and an explainable decision log.
//
// Dedup is enforced atomically at the database level via a partial unique
// index on (user_id, dedup_key) WHERE status <> 'archived' (see
// src/db/schema.ts). We upsert against that exact index so concurrent
// "alarm storm" calls for the same root cause always collapse into a single
// row instead of racing into duplicates.

import { db } from "@/db";
import { attentionDecisions, notifications } from "@/db/schema";
import { sql } from "drizzle-orm";
import { publishEvent, type RealtimeEventType } from "@/lib/eventBus";
import { evaluateAttention } from "@/lib/attention/attention";

export interface CreateNotificationInput {
  userId: string;
  type: RealtimeEventType;
  domain: string;
  severity: number; // 1-5
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  dedupKey: string;
}

export interface CreateNotificationResult {
  notification: typeof notifications.$inferSelect;
  deduped: boolean;
  decision: Awaited<ReturnType<typeof evaluateAttention>>;
}

export async function createNotification(input: CreateNotificationInput): Promise<CreateNotificationResult> {
  const decision = await evaluateAttention({
    userId: input.userId,
    domain: input.domain,
    severity: input.severity,
  });

  const id = crypto.randomUUID();

  const result = await db.execute(sql`
    insert into notifications (
      id, user_id, type, domain, severity, title, body,
      entity_type, entity_id, dedup_key, status, delivery,
      delivered_channels, reason, occurrence_count
    )
    values (
      ${id}, ${input.userId}, ${input.type}, ${input.domain}, ${input.severity}, ${input.title}, ${input.body},
      ${input.entityType ?? null}, ${input.entityId ?? null}, ${input.dedupKey}, 'unread', ${decision.decision},
      ${sql`'["in_app"]'::jsonb`}, ${decision.reason}, 1
    )
    on conflict (user_id, dedup_key) where status <> 'archived'
    do update set
      occurrence_count = notifications.occurrence_count + 1,
      severity = greatest(notifications.severity, excluded.severity),
      body = excluded.body,
      delivery = excluded.delivery,
      reason = excluded.reason,
      updated_at = now(),
      last_occurrence_at = now()
    returning *, (xmax = 0) as inserted
  `);

  const row = (result as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  const inserted = row.inserted === true;

  const notification: typeof notifications.$inferSelect = {
    id: row.id as string,
    userId: row.user_id as string,
    eventId: (row.event_id as number | null) ?? null,
    type: row.type as string,
    domain: row.domain as string,
    severity: row.severity as number,
    title: row.title as string,
    body: row.body as string,
    entityType: (row.entity_type as string | null) ?? null,
    entityId: (row.entity_id as string | null) ?? null,
    dedupKey: row.dedup_key as string,
    status: row.status as string,
    delivery: row.delivery as string,
    deliveredChannels: row.delivered_channels as string[],
    reason: row.reason as string,
    occurrenceCount: row.occurrence_count as number,
    digestBatchId: (row.digest_batch_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    lastOccurrenceAt: new Date(row.last_occurrence_at as string),
  };

  await db.insert(attentionDecisions).values({
    userId: input.userId,
    notificationId: notification.id,
    decision: decision.decision,
    severity: input.severity,
    cognitiveLoad: decision.cognitiveLoad,
    fatigue: decision.fatigue,
    reason: decision.reason,
  });

  await publishEvent({
    userId: input.userId,
    type: "notification.created",
    domain: input.domain,
    severity: input.severity,
    entityType: input.entityType,
    entityId: input.entityId,
    dedupKey: input.dedupKey,
    payload: {
      notificationId: notification.id,
      title: notification.title,
      body: notification.body,
      delivery: notification.delivery,
      reason: notification.reason,
      occurrenceCount: notification.occurrenceCount,
      deduped: !inserted,
    },
  });

  return { notification, deduped: !inserted, decision };
}
