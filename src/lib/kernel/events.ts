// Part 01 (minimal, reconstructed) — append-only event envelope.
//
// Every observation, tool call, decision and outcome produced by the kernel
// is appended here. `correlationId` is always the runId, so a run's full
// history (and therefore its replay/resume state) is exactly
// `listEvents(runId)` ordered by `seq`. Nothing in the kernel ever mutates
// or deletes a row in this table.
import { db } from "@/db";
import { kernelEvents, kernelOutbox } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { newId } from "./ids";
import type { Actor } from "./types";

export interface AppendEventInput {
  type: string;
  actor: Actor;
  correlationId: string;
  causationId?: string | null;
  payload: unknown;
  policyVersion?: string | null;
  /** If true, also drops a row in the outbox for downstream notification fan-out. */
  notify?: { topic: string };
}

export type KernelEventRow = typeof kernelEvents.$inferSelect;

export async function appendEvent(input: AppendEventInput): Promise<KernelEventRow> {
  const id = newId("evt");
  const [row] = await db
    .insert(kernelEvents)
    .values({
      id,
      type: input.type,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      payload: input.payload as object,
      policyVersion: input.policyVersion ?? null,
    })
    .returning();

  if (input.notify) {
    await db.insert(kernelOutbox).values({
      id: newId("obx"),
      eventId: id,
      topic: input.notify.topic,
      payload: { eventId: id, type: input.type, correlationId: input.correlationId, payload: input.payload },
    });
  }

  return row;
}

export async function listEvents(correlationId: string): Promise<KernelEventRow[]> {
  return db
    .select()
    .from(kernelEvents)
    .where(eq(kernelEvents.correlationId, correlationId))
    .orderBy(asc(kernelEvents.seq));
}

export async function listAllEvents(limit = 500): Promise<KernelEventRow[]> {
  return db.select().from(kernelEvents).orderBy(asc(kernelEvents.seq)).limit(limit);
}
