import { db } from "@/db";
import { leados_hypotheses } from "@/db/schema";
import { desc, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const open = await db
    .select()
    .from(leados_hypotheses)
    .where(isNull(leados_hypotheses.result))
    .orderBy(desc(leados_hypotheses.created_at));
  return Response.json(open);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [h] = await db
    .insert(leados_hypotheses)
    .values({
      statement: body.statement,
      source: body.source ?? "manual",
      prediction: body.prediction,
      test_metric: body.test_metric,
      test_window_days: body.test_window_days ?? 30,
      confidence: body.confidence ?? 0.5,
      auto_generated: body.auto_generated ?? false,
    })
    .returning();
  return Response.json(h, { status: 201 });
}
