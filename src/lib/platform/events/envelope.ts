import { z } from "zod";
import { createHash } from "node:crypto";
import { ActorSchema } from "../orgContext";

// The event envelope is immutable and bi-temporal: `occurredAt` (business
// time, caller-asserted) and `recordedAt` (system time, server-assigned) are
// always both preserved — never collapsed into a single timestamp.

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  orgId: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  actor: ActorSchema,
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(1),
  payload: z.unknown(),
  prevHash: z.string().nullable(),
  hash: z.string(),
  seq: z.number().int().nonnegative(),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

/** The subset of the envelope the caller supplies before hash/seq are known. */
export const NewEventInputSchema = EventEnvelopeSchema.omit({
  hash: true,
  seq: true,
  prevHash: true,
  recordedAt: true,
});
export type NewEventInput = z.infer<typeof NewEventInputSchema>;

/**
 * Canonical JSON (sorted keys, stable) so the hash is independent of key
 * insertion order — required for the hash chain to be reproducible.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Computes the chained hash for one event given the previous hash. */
export function computeEventHash(prevHash: string | null, input: {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  orgId: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  recordedAt: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  payload: unknown;
  seq: number;
}): string {
  const material = canonicalJson({ prevHash, ...input });
  return createHash("sha256").update(material).digest("hex");
}
