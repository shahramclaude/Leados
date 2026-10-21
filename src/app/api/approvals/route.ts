import { db } from "@/db";
import { approvals, objectives } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getApprovals } from "@/lib/queries";
import { findExistingMutation, recordAudit, recordMutation } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rows = await getApprovals({ status: url.searchParams.get("status") ?? undefined });
  return Response.json({ items: rows });
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key");
  const body = (await request.json()) as { id?: string; objectiveId?: string; note?: string };

  if (idempotencyKey) {
    const existing = await findExistingMutation(idempotencyKey);
    if (existing) return Response.json(existing.resultJson, { status: 201 });
  }

  if (!body.objectiveId) {
    return Response.json({ code: "VALIDATION", message: "An objective is required to request approval." }, { status: 422 });
  }
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, body.objectiveId));
  if (!objective) return Response.json({ code: "NOT_FOUND", message: "Objective not found." }, { status: 404 });

  const [row] = await db
    .insert(approvals)
    .values({ id: body.id, objectiveId: body.objectiveId, note: body.note ?? "" })
    .returning();

  await recordAudit("approval", row.id, "created", `Approval requested for "${objective.title}"`);
  if (idempotencyKey) await recordMutation(idempotencyKey, "approval", "applied", row);

  return Response.json(row, { status: 201 });
}
