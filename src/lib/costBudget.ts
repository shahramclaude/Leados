// Section A: org-level cost budget with hard stop. One open period at a
// time ("default" org). Spend is derived from the model_calls audit trail
// so it can never drift from reality by being a separately-maintained
// counter — recomputed on read, cheap at LEADOS's volume.
import { db } from "@/db";
import { costBudgets, modelCalls } from "@/db/schema";
import { and, gte, lte, sql, desc, eq } from "drizzle-orm";

const DEFAULT_MONTHLY_BUDGET_USD = Number(process.env.LEADOS_MONTHLY_BUDGET_USD ?? "25");

export async function getOrCreateCurrentBudget() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [existing] = await db
    .select()
    .from(costBudgets)
    .where(and(eq(costBudgets.orgId, "default"), lte(costBudgets.periodStart, now), gte(costBudgets.periodEnd, now)))
    .orderBy(desc(costBudgets.createdAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(costBudgets)
    .values({
      orgId: "default",
      periodStart,
      periodEnd,
      budgetUsd: DEFAULT_MONTHLY_BUDGET_USD.toFixed(2),
      spentUsd: "0",
      hardStop: true,
    })
    .returning();
  return created;
}

export async function getOrgBudgetStatus() {
  const budget = await getOrCreateCurrentBudget();
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${modelCalls.costUsd}), 0)` })
    .from(modelCalls)
    .where(and(gte(modelCalls.createdAt, budget.periodStart), lte(modelCalls.createdAt, budget.periodEnd)));

  const spentUsd = Number(total);
  return {
    orgId: budget.orgId,
    periodStart: budget.periodStart,
    periodEnd: budget.periodEnd,
    budgetUsd: Number(budget.budgetUsd),
    spentUsd,
    remainingUsd: Math.max(0, Number(budget.budgetUsd) - spentUsd),
    hardStop: budget.hardStop,
    utilizationPct: Number(budget.budgetUsd) > 0 ? (spentUsd / Number(budget.budgetUsd)) * 100 : 0,
  };
}
