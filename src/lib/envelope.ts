// The write envelope (Part 01). This is the ONLY module allowed to insert
// into the `events` table. Every mutation anywhere in LEADOS — a human
// editing a lead, an agent tool executing (Part 10/11), or an LLM-proposed
// write — must go through `writeWithEnvelope`. Seam audit (Part 22 Phase 0)
// found three write paths that bypassed this in earlier drafts; all three
// are now routed through this function (see src/app/api/**/route.ts).
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { events } from "@/db/schema";
import type { ActorType } from "@/lib/explain";

export interface EnvelopeMeta {
  orgId: number;
  actorType: ActorType;
  actorId: string;
  /** Either a known id (updates) or a resolver run against the mutate() result (inserts). */
  entityId: string | ((result: unknown) => string);
  entityType: string;
  action: string;
  reason: string;
  requestId?: string;
}

export interface WriteWithEnvelopeArgs<T> extends EnvelopeMeta {
  before?: unknown;
  mutate: () => Promise<T>;
  after: (result: T) => unknown;
}

/**
 * Executes `mutate`, then writes an immutable event row describing the
 * mutation. If the event write fails, the whole operation is treated as
 * failed (the caller should run this inside a DB transaction when the
 * underlying mutation itself needs atomicity with the audit row).
 */
export async function writeWithEnvelope<T>(args: WriteWithEnvelopeArgs<T>): Promise<T> {
  const requestId = args.requestId ?? randomUUID();
  const result = await args.mutate();
  const entityId = typeof args.entityId === "function" ? args.entityId(result) : args.entityId;
  await db.insert(events).values({
    orgId: args.orgId,
    actorType: args.actorType,
    actorId: args.actorId,
    entityType: args.entityType,
    entityId,
    action: args.action,
    before: args.before ?? null,
    after: args.after(result) ?? null,
    reason: args.reason,
    requestId,
  });
  return result;
}
