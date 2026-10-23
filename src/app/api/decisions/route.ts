import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title and owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(decisions)
    .values({
      title: body.title,
      description: body.description ?? null,
      owner: body.owner,
      rationale: body.rationale ?? null,
      impact: body.impact ?? null,
      status: body.status ?? "proposed",
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
