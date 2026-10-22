// PATCH /api/cadence/occurrences/:id/agenda/reorder — human drag-reorder of
// the synthesized agenda. The synthesizer's severity-based rank is advisory,
// not sacred: a human can resequence it for the actual meeting, and that
// resequencing is just a normal field update (no separate "approval" step),
// because reordering evidence-linked items is not the same risk class as
// editing their evidence.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agendaItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ReorderBody {
  order: string[]; // agendaItem ids, in the new desired rank order (1-based)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as ReorderBody;
  if (!Array.isArray(body.order) || body.order.length === 0) {
    return NextResponse.json({ error: "order must be a non-empty array of agenda item ids" }, { status: 400 });
  }

  for (let i = 0; i < body.order.length; i++) {
    await db
      .update(agendaItems)
      .set({ rank: i + 1 })
      .where(and(eq(agendaItems.id, body.order[i]), eq(agendaItems.occurrenceId, id)));
  }

  const updated = await db.select().from(agendaItems).where(eq(agendaItems.occurrenceId, id));
  return NextResponse.json({ occurrenceId: id, agenda: updated.sort((a, b) => a.rank - b.rank) });
}
