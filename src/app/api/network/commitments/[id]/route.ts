import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commitments } from "@/db/schema";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["open", "in_progress", "closed", "missed"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { status?: Status; evidenceRefs?: string[] }
    | null;

  if (!body?.status || !VALID_STATUSES.includes(body.status)) {
    return Response.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const [existing] = await db.select().from(commitments).where(eq(commitments.id, id)).limit(1);
  if (!existing) {
    return Response.json({ error: "commitment not found" }, { status: 404 });
  }

  // Lifecycle guardrail: cannot "close" a commitment without at least one
  // evidence reference accompanying the closure (promise -> tracked -> closed
  // with evidence, per the standing order).
  if (body.status === "closed") {
    const refs = body.evidenceRefs ?? existing.evidenceRefs;
    if (!refs || refs.length === 0) {
      return Response.json(
        { error: "closing a commitment requires at least one evidence reference" },
        { status: 422 },
      );
    }
  }

  const [updated] = await db
    .update(commitments)
    .set({
      status: body.status,
      evidenceRefs: body.evidenceRefs ?? existing.evidenceRefs,
      closedAt: body.status === "closed" ? new Date() : existing.closedAt,
    })
    .where(eq(commitments.id, id))
    .returning();

  return Response.json({ commitment: updated });
}
