// Dead-letter queue for steps that exhaust retries. Human review UI reads
// this table directly (see src/app/scheduler/dead-letter or the API route);
// resolving a dead letter re-proposes the owning work item.
import { db } from "@/db";
import { kernelDeadLetters } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";

export async function sendToDeadLetter(params: { runId: string; stepId: string; reason: string; payload: unknown }) {
  const id = newId("dlq");
  const [row] = await db
    .insert(kernelDeadLetters)
    .values({ id, runId: params.runId, stepId: params.stepId, reason: params.reason, payload: params.payload as object })
    .returning();

  await appendEvent({
    type: "dead_letter.created",
    actor: { kind: "system", id: "kernel" },
    correlationId: params.runId,
    causationId: params.stepId,
    payload: row,
    notify: { topic: "dead_letter" },
  });

  return row;
}

export async function listDeadLetters() {
  return db.select().from(kernelDeadLetters).where(eq(kernelDeadLetters.resolved, false)).orderBy(desc(kernelDeadLetters.createdAt));
}

export async function resolveDeadLetter(id: string) {
  const [row] = await db.update(kernelDeadLetters).set({ resolved: true }).where(eq(kernelDeadLetters.id, id)).returning();
  return row;
}
