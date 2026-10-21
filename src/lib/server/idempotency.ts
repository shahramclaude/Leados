import { db } from "@/db";
import { auditLog, mutationLog } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Server-side idempotency: when the offline queue replays a mutation after
// reconnect, the same `idempotency-key` header may arrive twice (e.g. the
// client sent it, got no response because the tab closed, then replays it
// again after reload). We record every applied/conflicted mutation keyed by
// that header and return the original result on replay instead of
// double-applying it.
// ---------------------------------------------------------------------------

export async function findExistingMutation(idempotencyKey: string) {
  const rows = await db.select().from(mutationLog).where(eq(mutationLog.idempotencyKey, idempotencyKey));
  return rows[0] ?? null;
}

export async function recordMutation(
  idempotencyKey: string,
  entityType: string,
  status: "applied" | "conflict" | "failed",
  resultJson: unknown,
) {
  await db.insert(mutationLog).values({ idempotencyKey, entityType, status, resultJson: resultJson as object });
}

export async function recordAudit(
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
  actorName = "You",
) {
  await db.insert(auditLog).values({ entityType, entityId, action, actorName, summary });
}
