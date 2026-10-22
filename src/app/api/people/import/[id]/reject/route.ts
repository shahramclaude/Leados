import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

type Params = { id: string };

export const POST = secureRoute<Params>({
  method: "POST",
  path: "/api/people/import/:id/reject",
  handler: async ({ request, session, params }) => {
    const s = session as SessionUser;
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, params.id), eq(importBatches.orgId, s.orgId)));
    if (!batch) return jsonError(404, "NOT_FOUND", "Import batch not found");
    if (batch.status !== "pending") return jsonError(409, "ALREADY_DECIDED", "This batch has already been decided");

    await db
      .update(importBatches)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: s.userId })
      .where(eq(importBatches.id, batch.id));

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.import.reject",
      resourceType: "import_batch",
      resourceId: batch.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });

    return NextResponse.json({ ok: true });
  },
});
