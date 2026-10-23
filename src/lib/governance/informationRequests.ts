// Directors' information rights: request -> response tracking ->
// completeness metrics. A director's statutory right to information from
// management is modelled as a tracked workflow, not a side-channel email.

import { db } from "@/db";
import { informationRequests } from "@/db/schema";
import { eq, isNull, lt, and } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";

export async function raiseInformationRequest(params: {
  requesterId: number;
  subject: string;
  requestText: string;
  targetTier?: string;
  dueInDays?: number;
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (params.dueInDays ?? 10));

  const [row] = await db
    .insert(informationRequests)
    .values({
      requesterId: params.requesterId,
      subject: params.subject,
      requestText: params.requestText,
      targetTier: params.targetTier ?? "management",
      dueDate,
    })
    .returning();

  await appendAuditEntry({
    actorId: params.requesterId,
    action: "information_request.raised",
    entityType: "information_request",
    entityId: row.id,
    payload: { subject: params.subject },
  });

  return row;
}

export async function respondToRequest(params: {
  requestId: number;
  responseText: string;
  respondedBy: number;
}) {
  const [row] = await db
    .update(informationRequests)
    .set({
      status: "responded",
      responseText: params.responseText,
      respondedBy: params.respondedBy,
      respondedAt: new Date(),
    })
    .where(eq(informationRequests.id, params.requestId))
    .returning();

  await appendAuditEntry({
    actorId: params.respondedBy,
    action: "information_request.responded",
    entityType: "information_request",
    entityId: params.requestId,
  });

  return row;
}

export async function closeRequest(requestId: number, closedBy: number) {
  const [row] = await db
    .update(informationRequests)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(informationRequests.id, requestId))
    .returning();

  await appendAuditEntry({
    actorId: closedBy,
    action: "information_request.closed",
    entityType: "information_request",
    entityId: requestId,
  });

  return row;
}

export async function markOverdueRequests(now: Date = new Date()) {
  const overdue = await db
    .select()
    .from(informationRequests)
    .where(and(eq(informationRequests.status, "open"), lt(informationRequests.dueDate, now)));

  for (const req of overdue) {
    await db
      .update(informationRequests)
      .set({ status: "overdue" })
      .where(eq(informationRequests.id, req.id));
  }
  return overdue;
}

/** Completeness metrics: closure rate and median response time in days. */
export async function informationRequestMetrics() {
  const all = await db.select().from(informationRequests);
  const closedOrResponded = all.filter(
    (r) => r.status === "closed" || r.status === "responded",
  );
  const responseTimes = closedOrResponded
    .filter((r) => r.respondedAt)
    .map((r) => (r.respondedAt!.getTime() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000));
  responseTimes.sort((a, b) => a - b);
  const median =
    responseTimes.length === 0
      ? 0
      : responseTimes.length % 2 === 1
        ? responseTimes[(responseTimes.length - 1) / 2]
        : (responseTimes[responseTimes.length / 2 - 1] + responseTimes[responseTimes.length / 2]) / 2;

  return {
    total: all.length,
    open: all.filter((r) => r.status === "open").length,
    overdue: all.filter((r) => r.status === "overdue").length,
    responded: all.filter((r) => r.status === "responded").length,
    closed: all.filter((r) => r.status === "closed").length,
    closureRate: all.length > 0 ? all.filter((r) => r.status === "closed").length / all.length : 0,
    medianResponseDays: Math.round(median * 10) / 10,
  };
}

export async function listRequests() {
  return db.select().from(informationRequests);
}
