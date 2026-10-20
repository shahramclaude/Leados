import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["pending", "approved", "rejected", "scheduled"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) {
    return Response.json({ error: "Invalid decision id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
    return Response.json({ error: "A valid status is required." }, { status: 400 });
  }

  const [updated] = await db
    .update(decisions)
    .set({ status: body.status, decidedAt: body.status === "pending" ? null : new Date() })
    .where(eq(decisions.id, decisionId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Decision not found.", errorId: `dec-${decisionId}-404` }, { status: 404 });
  }

  return Response.json({ decision: updated });
}
