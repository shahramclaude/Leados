import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(initiatives).orderBy(desc(initiatives.createdAt));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title and owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(initiatives)
    .values({
      title: body.title,
      objective: body.objective ?? null,
      status: body.status ?? "planned",
      progress: body.progress ?? 0,
      owner: body.owner,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
