import { db } from "@/db";
import { cadenceItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(cadenceItems).orderBy(asc(cadenceItems.nextOccurrence));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title and owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(cadenceItems)
    .values({
      title: body.title,
      type: body.type ?? "meeting",
      frequency: body.frequency ?? "weekly",
      owner: body.owner,
      nextOccurrence: body.nextOccurrence ? new Date(body.nextOccurrence) : null,
      status: body.status ?? "active",
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
