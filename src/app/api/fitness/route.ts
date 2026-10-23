import { db } from "@/db";
import { fitnessMetrics } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(fitnessMetrics).orderBy(desc(fitnessMetrics.measuredAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const dimension = typeof body.dimension === "string" ? body.dimension.trim() : "";
  if (!dimension) return Response.json({ error: "dimension is required" }, { status: 400 });

  const [created] = await db
    .insert(fitnessMetrics)
    .values({
      dimension,
      score: Number.isFinite(body.score) ? body.score : 50,
      trend: body.trend ?? "stable",
      notes: body.notes ?? "",
    })
    .returning();

  return Response.json(created, { status: 201 });
}
