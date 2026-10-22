import { NextResponse } from "next/server";
import { db } from "@/db";
import { agendaItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agenda = await db
    .select()
    .from(agendaItems)
    .where(eq(agendaItems.occurrenceId, id))
    .orderBy(asc(agendaItems.rank));
  return NextResponse.json({ occurrenceId: id, agenda });
}
