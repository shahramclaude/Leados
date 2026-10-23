import { db } from "@/db";
import { riskItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(riskItems).orderBy(desc(riskItems.createdAt));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title and owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(riskItems)
    .values({
      title: body.title,
      category: body.category ?? "operational",
      likelihood: body.likelihood ?? 3,
      impact: body.impact ?? 3,
      status: body.status ?? "open",
      owner: body.owner,
      mitigation: body.mitigation ?? null,
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
