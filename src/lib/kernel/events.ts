// src/lib/kernel/events.ts
//
// Append-only audit trail for the knowledge-systems kernel seam (Part 07
// stand-in — see schema.ts `auditEvents` comment for why a minimal stand-in
// was built instead of vendoring the upstream kernel's full self-improve
// event sourcing system, which belongs to a different part's mandate).
// Every capability invocation (playbook run, nightly memory consolidation,
// hypothesis auto-resolution) appends one of these rows. Nothing here is
// ever mutated or deleted.
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId } from "./ids";

export type Actor = { kind: "human" | "kernel" | "system"; name: string };

export async function appendAuditEvent(input: {
  type: string;
  actor: Actor;
  correlationId?: string;
  payload?: Record<string, unknown>;
}) {
  const correlationId = input.correlationId ?? newId("evt");
  const [row] = await db
    .insert(auditEvents)
    .values({
      type: input.type,
      actorKind: input.actor.kind,
      actorName: input.actor.name,
      correlationId,
      payload: input.payload ?? {},
    })
    .returning();
  return row;
}

export async function listAuditEvents(opts: { type?: string; limit?: number } = {}) {
  const limit = opts.limit ?? 100;
  const rows = opts.type
    ? await db.select().from(auditEvents).where(eq(auditEvents.type, opts.type)).orderBy(desc(auditEvents.createdAt)).limit(limit)
    : await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
  return rows;
}
