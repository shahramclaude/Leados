import { db } from "@/db";
import { boardItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(boardItems).orderBy(desc(boardItems.meetingDate));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title and owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(boardItems)
    .values({
      title: body.title,
      type: body.type ?? "pack",
      status: body.status ?? "draft",
      owner: body.owner,
      summary: body.summary ?? null,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
