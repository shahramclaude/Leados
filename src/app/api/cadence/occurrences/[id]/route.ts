import { NextResponse } from "next/server";
import { db } from "@/db";
import { agendaItems, ritualCaptures, ritualOccurrences, rituals } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [occurrence] = await db.select().from(ritualOccurrences).where(eq(ritualOccurrences.id, id)).limit(1);
  if (!occurrence) return NextResponse.json({ error: "occurrence not found" }, { status: 404 });

  const [ritual] = await db.select().from(rituals).where(eq(rituals.id, occurrence.ritualId)).limit(1);
  const agenda = await db
    .select()
    .from(agendaItems)
    .where(eq(agendaItems.occurrenceId, id))
    .orderBy(asc(agendaItems.rank));
  const [capture] = await db.select().from(ritualCaptures).where(eq(ritualCaptures.occurrenceId, id)).limit(1);

  return NextResponse.json({ occurrence, ritual, agenda, capture: capture ?? null });
}
