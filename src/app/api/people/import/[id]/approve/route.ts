import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { importBatches, people } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { importRowSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

type Params = { id: string };

export const POST = secureRoute<Params>({
  method: "POST",
  path: "/api/people/import/:id/approve",
  handler: async ({ request, session, params }) => {
    const s = session as SessionUser;
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, params.id), eq(importBatches.orgId, s.orgId)));
    if (!batch) return jsonError(404, "NOT_FOUND", "Import batch not found");
    if (batch.status !== "pending") return jsonError(409, "ALREADY_DECIDED", "This batch has already been decided");

    const rawRows = Array.isArray(batch.rows) ? batch.rows : [];
    const accepted: Array<{ firstName: string; lastName: string; email?: string; notes?: string }> = [];
    const rejected: Array<{ row: unknown; reason: string }> = [];

    for (const row of rawRows) {
      const parsed = importRowSchema.safeParse(row);
      if (parsed.success) accepted.push(parsed.data);
      else rejected.push({ row, reason: parsed.error.message });
    }

    if (accepted.length > 0) {
      await db.insert(people).values(accepted.map((row) => ({ orgId: s.orgId, ...row })));
    }

    await db
      .update(importBatches)
      .set({ status: "approved", decidedAt: new Date(), decidedBy: s.userId, rejectedRows: rejected })
      .where(eq(importBatches.id, batch.id));

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.import.approve",
      resourceType: "import_batch",
      resourceId: batch.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { acceptedCount: accepted.length, rejectedCount: rejected.length },
    });

    return NextResponse.json({ accepted: accepted.length, rejected: rejected.length });
  },
});
