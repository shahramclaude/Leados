import { db } from "@/db";
import { decisions, decisionEvents } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(decisions)
    .values({
      title,
      description: body.description ?? "",
      category: body.category ?? "strategic",
      owner: body.owner ?? "Unassigned",
      impact: body.impact ?? "medium",
      confidence: Number.isFinite(body.confidence) ? body.confidence : 50,
    })
    .returning();

  await db.insert(decisionEvents).values({
    decisionId: created.id,
    type: "created",
    payload: `Decision "${created.title}" proposed by ${created.owner}.`,
  });

  return Response.json(created, { status: 201 });
}
