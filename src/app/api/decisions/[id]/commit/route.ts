import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisionEvents, decisions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TRANSITIONS: Record<string, string[]> = {
  proposed: ["under_review", "archived"],
  under_review: ["committed", "proposed", "archived"],
  committed: ["archived"],
  archived: [],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);

  if (!Number.isInteger(decisionId)) {
    return NextResponse.json({ error: "Invalid decision id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const nextStatus = body?.status;
  const validStatuses = ["proposed", "under_review", "committed", "archived"];

  if (!validStatuses.includes(nextStatus)) {
    return NextResponse.json({ error: "A valid target status is required." }, { status: 400 });
  }

  const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId));

  if (!existing) {
    return NextResponse.json({ error: "Decision not found." }, { status: 404 });
  }

  const allowed = TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      { error: `Cannot move decision from '${existing.status}' to '${nextStatus}'.` },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(decisions)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
      committedAt: nextStatus === "committed" ? new Date() : existing.committedAt,
    })
    .where(eq(decisions.id, decisionId))
    .returning();

  await db.insert(decisionEvents).values({
    decisionId,
    eventType: "status_changed",
    actor: typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "System",
    payload: { from: existing.status, to: nextStatus, note: typeof body?.note === "string" ? body.note : undefined },
  });

  return NextResponse.json({ decision: updated });
}
