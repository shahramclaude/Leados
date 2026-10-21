// institutionalMemory.ts — distilled "what we learned" notes, each one
// required to carry evidenceRefs back to the events/docs it was derived
// from. Distillation here is deterministic (keyword/recency based) rather
// than model-generated prose, because institutional memory is exactly the
// kind of claim where a confident-sounding hallucination is most costly —
// see adversarial self-review §1 in the delivery notes. If a model-written
// version is wanted later, it must still go through the same
// checkFaithfulness gate as synthesis.ts before being stored.
import { db } from "@/db";
import { memoryNotes, entities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { EvidenceRefRow } from "@/db/schema";
import { getRecentEvents } from "@/lib/narrativeIntel";

export async function createMemoryNote(input: {
  entityId?: string | null;
  title: string;
  body: string;
  evidenceRefs: EvidenceRefRow[];
  confidence?: number;
}) {
  if (input.evidenceRefs.length === 0) {
    throw new Error("Institutional memory notes require at least one evidenceRef — refusing to store an unsourced claim.");
  }
  const [row] = await db
    .insert(memoryNotes)
    .values({
      entityId: input.entityId ?? null,
      title: input.title,
      body: input.body,
      evidenceRefs: input.evidenceRefs,
      confidence: (input.confidence ?? 0.6).toFixed(3),
    })
    .returning();
  return row;
}

export async function listMemoryNotes(entityId?: string) {
  const rows = await db.select().from(memoryNotes).orderBy(desc(memoryNotes.createdAt));
  return entityId ? rows.filter((r) => r.entityId === entityId) : rows;
}

const IMPACTFUL_EVENT_TYPES = new Set(["risk_flagged", "decision", "status_change"]);

/** Deterministically distills a memory note for an entity from its most impactful recent events. */
export async function distillMemoryFromEntity(entityId: string, lookbackDays = 90) {
  const [entity] = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1);
  if (!entity) throw new Error("Entity not found");

  const recent = await getRecentEvents(lookbackDays, entityId);
  const impactful = recent.filter((e) => IMPACTFUL_EVENT_TYPES.has(e.type)).slice(0, 5);
  if (impactful.length === 0) return null;

  const body = impactful.map((e) => `${e.occurredAt.slice(0, 10)}: [${e.type}] ${e.summary}`).join("\n");
  const evidenceRefs: EvidenceRefRow[] = impactful.map((e) => ({
    kind: "event",
    id: e.id,
    timestamp: e.occurredAt,
    label: e.summary.slice(0, 80),
  }));

  return createMemoryNote({
    entityId,
    title: `What we know: ${entity.name}`,
    body,
    evidenceRefs,
    confidence: Math.min(0.9, 0.5 + impactful.length * 0.08),
  });
}
