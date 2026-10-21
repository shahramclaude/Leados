// Part 01 (minimal, reconstructed) — transactional outbox.
//
// Rows are written by `appendEvent({ notify })`. `drainOutbox` is the single
// place that would fan these out to a real transport; Part 12 (notifications)
// is the intended consumer. For now this is a documented seam: draining marks
// rows sent and returns them so API routes / the unified inbox can surface
// them without needing a real message broker in this sandbox.
import { db } from "@/db";
import { kernelOutbox } from "@/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";

export type OutboxRow = typeof kernelOutbox.$inferSelect;

export async function listPendingOutbox(limit = 100): Promise<OutboxRow[]> {
  return db
    .select()
    .from(kernelOutbox)
    .where(and(eq(kernelOutbox.status, "pending"), lte(kernelOutbox.availableAt, new Date())))
    .orderBy(asc(kernelOutbox.availableAt))
    .limit(limit);
}

export async function drainOutbox(limit = 100): Promise<OutboxRow[]> {
  const pending = await listPendingOutbox(limit);
  for (const row of pending) {
    await db
      .update(kernelOutbox)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(kernelOutbox.id, row.id));
  }
  return pending;
}
