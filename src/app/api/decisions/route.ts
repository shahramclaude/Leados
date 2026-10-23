import { NextResponse } from "next/server";
import { db } from "@/db";
import { decisionEvents, decisions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  return NextResponse.json({ decisions: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "A decision title is required." }, { status: 400 });
  }

  const dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const [created] = await db
    .insert(decisions)
    .values({
      title: body.title.trim(),
      description: typeof body.description === "string" ? body.description : "",
      owner: typeof body.owner === "string" && body.owner.trim() ? body.owner.trim() : "Unassigned",
      impact: ["low", "medium", "high", "critical"].includes(body.impact) ? body.impact : "medium",
      status: "proposed",
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
    })
    .returning();

  await db.insert(decisionEvents).values({
    decisionId: created.id,
    eventType: "created",
    actor: typeof body.owner === "string" && body.owner.trim() ? body.owner.trim() : "System",
    payload: { title: created.title, impact: created.impact },
  });

  return NextResponse.json({ decision: created }, { status: 201 });
}
