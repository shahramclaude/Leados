import { db } from "@/db";
import { leados_hypotheses } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_hypotheses).orderBy(desc(leados_hypotheses.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { statement, prediction, testMetric, windowDays } = body ?? {};
    if (!statement) return Response.json({ error: "statement is required" }, { status: 400 });
    const [row] = await db
      .insert(leados_hypotheses)
      .values({
        statement,
        prediction: prediction ?? "",
        testMetric: testMetric ?? "",
        windowDays: windowDays ?? 14,
      })
      .returning();
    await logAudit("HYPOTHESIS_CREATED", statement);
    return Response.json(row, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "failed to create hypothesis" }, { status: 500 });
  }
}
