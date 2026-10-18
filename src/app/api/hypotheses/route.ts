import { db } from "@/db";
import { leados_hypotheses } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_hypotheses).orderBy(desc(leados_hypotheses.createdAt));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { statement, prediction, testMetric, windowDays, confidence } = await req.json();
  if (!statement || !prediction || !testMetric) {
    return Response.json({ error: "statement, prediction and testMetric required" }, { status: 400 });
  }
  const [row] = await db
    .insert(leados_hypotheses)
    .values({
      statement,
      prediction,
      testMetric,
      windowDays: windowDays ?? 14,
      confidence: confidence ?? 50,
    })
    .returning();
  await logAudit("HYPOTHESIS_ADDED", statement);
  return Response.json(row, { status: 201 });
}
