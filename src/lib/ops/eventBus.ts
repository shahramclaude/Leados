// Append-only event bus: every domain event is written to `event_log` and
// fanned out to the `outbox` for any topic with subscribers, inside the same
// transaction (transactional-outbox pattern — no dual-write hole between
// "event recorded" and "notification will eventually be sent").
import { db } from "@/db";
import { eventLog, outbox } from "@/db/schema";
import { getContext } from "@/lib/obs/context";
import { withDbSpan } from "@/lib/obs/tracing";
import { logger } from "@/lib/obs/logger";

export interface PublishOptions {
  actor?: string;
  /** Outbox topics that should also receive this event (e.g. "notify"). */
  notify?: string[];
}

export async function publishEvent(eventType: string, payload: Record<string, unknown>, options: PublishOptions = {}) {
  const ctx = getContext();
  return withDbSpan(`eventLog.append(${eventType})`, async () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(eventLog)
        .values({
          eventType,
          payload,
          actor: options.actor ?? "system",
          correlationId: ctx.correlationId,
        })
        .returning();

      for (const topic of options.notify ?? []) {
        await tx.insert(outbox).values({
          topic,
          payload: { eventType, eventId: row.id, eventSeq: row.seq, ...payload },
          correlationId: ctx.correlationId,
        });
      }

      logger.info("event.published", { eventType, eventSeq: row.seq, notify: options.notify ?? [] });
      return row;
    }),
  );
}
