import { NextResponse } from "next/server";
import { db } from "@/db";
import { signals } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signalId = Number(id);

  if (!Number.isInteger(signalId)) {
    return NextResponse.json({ error: "Invalid signal id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const validStatuses = ["active", "acknowledged", "resolved"];

  if (!body || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "A valid status is required." }, { status: 400 });
  }

  const [updated] = await db
    .update(signals)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(signals.id, signalId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Signal not found." }, { status: 404 });
  }

  return NextResponse.json({ signal: updated });
}
