import { NextResponse } from "next/server";
import { db } from "@/db";
import { events as eventsTable, hypotheses as hypothesesTable } from "@/db/schema";
import { updateAllHypotheses } from "@/lib/hypothesis";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, events] = await Promise.all([
    db.select().from(hypothesesTable),
    db.select().from(eventsTable),
  ]);
  const updates = updateAllHypotheses(rows, events, new Date());
  const merged = rows.map((row) => ({ ...row, inference: updates.find((u) => u.id === row.id) }));
  return NextResponse.json({ hypotheses: merged });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { statement, priorProbability } = body as Record<string, unknown>;
  if (!statement) {
    return NextResponse.json({ error: "statement is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(hypothesesTable)
    .values({
      statement: String(statement),
      priorProbability: priorProbability !== undefined ? String(priorProbability) : "0.5",
      posteriorProbability: priorProbability !== undefined ? String(priorProbability) : "0.5",
    })
    .returning();
  return NextResponse.json({ hypothesis: created }, { status: 201 });
}
