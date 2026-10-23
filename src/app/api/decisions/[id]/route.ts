import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisionEvents, decisions } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);

  if (!Number.isInteger(decisionId)) {
    return NextResponse.json({ error: "Invalid decision id." }, { status: 400 });
  }

  const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));

  if (!decision) {
    return NextResponse.json({ error: "Decision not found." }, { status: 404 });
  }

  const events = await db
    .select()
    .from(decisionEvents)
    .where(eq(decisionEvents.decisionId, decisionId))
    .orderBy(asc(decisionEvents.createdAt));

  return NextResponse.json({ decision, events });
}
