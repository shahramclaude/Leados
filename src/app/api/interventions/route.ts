import { db } from "@/db";
import { interventions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(interventions).orderBy(desc(interventions.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const [created] = await db
    .insert(interventions)
    .values({
      title,
      category: body.category ?? "leadership",
      description: body.description ?? "",
      impactScore: Number.isFinite(body.impactScore) ? body.impactScore : 50,
      effortScore: Number.isFinite(body.effortScore) ? body.effortScore : 50,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
