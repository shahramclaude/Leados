// =============================================================================
// institutionalMemory.ts — decaying memory lifecycle
// =============================================================================
// Retention model: R(t) = e^(-t/S)
//   t = days since lastReactivatedAt
//   S = strength (days), per-memory, seeded from a per-class base and
//       increased every time the memory is reactivated (read, cited,
//       linked from a new decision, etc).
//
// Reactivation: S' = S + delta * recency
//   recency = R(t) evaluated at the moment of reactivation — i.e. catching
//   a memory while it is still well-retained reinforces it more than
//   reactivating something that had already decayed close to zero. This
//   mirrors spaced-repetition "desirable difficulty": reinforcing a fading
//   memory barely nudges strength, reinforcing a fresh one compounds fast
//   because it signals an actively-relied-upon record.
//
// NOTHING IS EVER DELETED. Decay only changes the *computed, derived*
// retention value and (below a visibility threshold) the `archived` flag,
// which hides a memory from default list views but never removes the row.
// =============================================================================

import { db } from "@/db";
import { memories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type MemoryClass = "decision" | "status" | "risk" | "metric" | "lesson";
export type MemoryRow = InferSelectModel<typeof memories>;

/** Base strength (days) per memory class — decisions & lessons decay slowly,
 * status updates decay fast. These are the *seed* values; actual strength
 * grows via reactivation over the memory's life. */
export const BASE_STRENGTH_DAYS: Record<MemoryClass, number> = {
  decision: 180,
  lesson: 220,
  risk: 60,
  metric: 30,
  status: 7,
};

/** Reactivation increment (days) per class — how much a single reactivation
 * can add at maximum (when recency factor = 1, i.e. memory still fresh). */
export const REACTIVATION_DELTA_DAYS: Record<MemoryClass, number> = {
  decision: 45,
  lesson: 60,
  risk: 20,
  metric: 10,
  status: 3,
};

/** Below this retention value, a memory is flagged `archived` (hidden by
 * default, but never deleted and still queryable/reactivatable). */
export const ARCHIVE_THRESHOLD = 0.05;

/** Pure function: exponential retention R(t) = e^(-t/S). */
export function retention(ageDays: number, strengthDays: number): number {
  if (strengthDays <= 0) return 0;
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / strengthDays);
}

export function ageInDays(since: Date, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
}

/** Pure function: compute the new strength after a reactivation event. */
export function reactivatedStrength(
  currentStrengthDays: number,
  ageDaysAtReactivation: number,
  deltaDays: number,
): number {
  const recency = retention(ageDaysAtReactivation, currentStrengthDays);
  return currentStrengthDays + deltaDays * recency;
}

export interface MemoryWithRetention extends MemoryRow {
  ageDays: number;
  retention: number;
}

export function decorateWithRetention(row: MemoryRow, now: Date = new Date()): MemoryWithRetention {
  const t = ageInDays(row.lastReactivatedAt, now);
  return {
    ...row,
    ageDays: Number(t.toFixed(2)),
    retention: Number(retention(t, Number(row.strength)).toFixed(4)),
  };
}

export interface RecordMemoryInput {
  class: MemoryClass;
  title: string;
  content: string;
  entityId?: string | null;
  relatedEntityIds?: string[];
  provenanceSource: string;
  sourceType: string;
}

export async function recordMemory(input: RecordMemoryInput) {
  const [row] = await db
    .insert(memories)
    .values({
      class: input.class,
      title: input.title,
      content: input.content,
      entityId: input.entityId ?? null,
      relatedEntityIds: input.relatedEntityIds ?? [],
      strength: BASE_STRENGTH_DAYS[input.class].toString(),
      provenanceSource: input.provenanceSource,
      sourceType: input.sourceType,
    })
    .returning();
  return row;
}

export async function listMemories(opts?: {
  class?: MemoryClass;
  includeArchived?: boolean;
  entityId?: string;
}) {
  const rows = await db
    .select()
    .from(memories)
    .where(
      opts?.entityId
        ? eq(memories.entityId, opts.entityId)
        : opts?.class
          ? eq(memories.class, opts.class)
          : undefined,
    )
    .orderBy(sql`${memories.lastReactivatedAt} desc`);

  const filtered = opts?.includeArchived ? rows : rows.filter((r) => !r.archived);
  return filtered.map((r) => decorateWithRetention(r));
}

export async function getMemory(id: string) {
  const [row] = await db.select().from(memories).where(eq(memories.id, id));
  return row ? decorateWithRetention(row) : null;
}

/** Reactivate a memory: strengthens it per the formula above, always
 * un-archives it (a reactivated memory is, by definition, not stale). */
export async function reactivateMemory(id: string, now: Date = new Date()) {
  const [row] = await db.select().from(memories).where(eq(memories.id, id));
  if (!row) return null;

  const ageDays = ageInDays(row.lastReactivatedAt, now);
  const memoryClass = row.class as MemoryClass;
  const newStrength = reactivatedStrength(
    Number(row.strength),
    ageDays,
    REACTIVATION_DELTA_DAYS[memoryClass],
  );

  const [updated] = await db
    .update(memories)
    .set({
      strength: newStrength.toString(),
      lastReactivatedAt: now,
      reactivationCount: row.reactivationCount + 1,
      archived: false,
    })
    .where(eq(memories.id, id))
    .returning();

  return decorateWithRetention(updated);
}

/**
 * Nightly decay pass: NEVER deletes or mutates `strength`. Only recomputes
 * retention and flips `archived` for records that have decayed below the
 * visibility threshold (and un-flips any that got reactivated and are back
 * above it, though reactivateMemory already does that eagerly).
 * Returns counts for the audit log (consolidationRuns).
 */
export async function decayPass(now: Date = new Date()) {
  const rows = await db.select().from(memories);
  let decayedCount = 0;
  let unarchivedCount = 0;

  for (const row of rows) {
    const t = ageInDays(row.lastReactivatedAt, now);
    const r = retention(t, Number(row.strength));
    const shouldArchive = r < ARCHIVE_THRESHOLD;
    if (shouldArchive && !row.archived) {
      await db.update(memories).set({ archived: true }).where(eq(memories.id, row.id));
      decayedCount++;
    } else if (!shouldArchive && row.archived) {
      await db.update(memories).set({ archived: false }).where(eq(memories.id, row.id));
      unarchivedCount++;
    }
  }

  return { scanned: rows.length, decayedCount, unarchivedCount };
}
