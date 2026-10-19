// src/app/api/people/one-on-ones/route.ts
//
// POST /api/people/one-on-ones — used by the "Log 1:1" capture modal in
// src/views/PeopleIntelligenceView.tsx to append a new 1:1 note for a
// person. The person's current managerId is attached automatically.

import { db } from "@/db";
import { oneOnOnes, people } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { personId?: number; date?: string; notes?: string };
    const personId = Number(body.personId);
    const notes = (body.notes ?? "").trim();
    const date = body.date && body.date.length > 0 ? body.date : new Date().toISOString().slice(0, 10);

    if (!Number.isFinite(personId) || notes.length === 0) {
      return Response.json({ error: "personId and notes are required" }, { status: 400 });
    }

    const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
    if (!person) {
      return Response.json({ error: "Person not found" }, { status: 404 });
    }

    const [inserted] = await db
      .insert(oneOnOnes)
      .values({ personId, managerId: person.managerId ?? null, date, notes })
      .returning();

    return Response.json({ oneOnOne: inserted }, { status: 201 });
  } catch (error) {
    console.error("POST /api/people/one-on-ones failed", error);
    return Response.json({ error: "Failed to log 1:1" }, { status: 500 });
  }
}
