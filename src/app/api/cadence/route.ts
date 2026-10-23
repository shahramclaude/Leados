import { db } from "@/db";
import { cadenceItems } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(cadenceItems).orderBy(asc(cadenceItems.nextOccurrence));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const [created] = await db
    .insert(cadenceItems)
    .values({
      title,
      type: body.type ?? "meeting",
      cadence: body.cadence ?? "weekly",
      owner: body.owner ?? "Unassigned",
      nextOccurrence: body.nextOccurrence ? new Date(body.nextOccurrence) : null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
