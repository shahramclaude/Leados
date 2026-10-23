import { db } from "@/db";
import { esgMetrics } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(esgMetrics).orderBy(desc(esgMetrics.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const metric = typeof body.metric === "string" ? body.metric.trim() : "";
  if (!metric) return Response.json({ error: "metric is required" }, { status: 400 });

  const [created] = await db
    .insert(esgMetrics)
    .values({
      metric,
      pillar: body.pillar ?? "environmental",
      value: body.value ?? "",
      unit: body.unit ?? "",
      target: body.target ?? "",
      period: body.period ?? "",
    })
    .returning();

  return Response.json(created, { status: 201 });
}
