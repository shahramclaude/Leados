import { db } from "@/db";
import { financialPlanLines, financialEvents } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { buildVarianceReport, type PlanLine } from "@/lib/financeEngine";
import type { FinancialEventRecord } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const month = searchParams.get("month") ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const planRows = await db.select().from(financialPlanLines);
    const actualRows = await db.select().from(financialEvents);

    const plan: PlanLine[] = planRows.map((p) => ({ periodMonth: p.periodMonth, domain: p.domain, team: p.team, category: p.category, type: p.type as PlanLine["type"], plannedAmount: p.plannedAmount }));
    const actuals: FinancialEventRecord[] = actualRows.map((a) => ({ date: a.date, type: a.type as FinancialEventRecord["type"], domain: a.domain, team: a.team, amount: a.amount, category: a.category, description: a.description }));

    const report = buildVarianceReport(plan, actuals, month);
    return Response.json(report);
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
