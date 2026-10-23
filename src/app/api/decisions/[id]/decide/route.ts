import { db } from "@/db";
import { decisions } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { appendAuditEvent } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [existing] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, id), eq(decisions.orgId, DEFAULT_ORG_ID)));
  if (!existing) {
    return Response.json({ code: "not_found", detail: "Decision not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(decisions)
    .set({ status: "decided", decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(decisions.id, id))
    .returning();

  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: "decision.decided",
    entityType: "decision",
    entityId: id,
    metadata: { chosenAlternativeId: body?.chosenAlternativeId ?? null },
  });

  return Response.json({ item: updated });
}
