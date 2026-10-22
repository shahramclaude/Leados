// Compute budgets (Part 18), covering all agent/LLM compute (Part 06).
// Every agent-run must check-and-consume budget atomically BEFORE the tool
// executes; if the budget is exhausted the run is denied regardless of tier.
import { db } from "@/db";
import { budgets } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  reason: string;
}

/**
 * Ensures a budget row exists for the org/period, then attempts to atomically
 * reserve `costUnits`. Returns allowed=false (without consuming) if the
 * reservation would exceed the limit.
 */
export async function checkAndConsumeBudget(
  orgId: number,
  costUnits: number,
  period: string = currentPeriod(),
): Promise<BudgetCheckResult> {
  await db
    .insert(budgets)
    .values({ orgId, period, limitUnits: "100", usedUnits: "0" })
    .onConflictDoNothing({ target: [budgets.orgId, budgets.period] });

  const updated = await db
    .update(budgets)
    .set({ usedUnits: sql`${budgets.usedUnits} + ${costUnits}`, updatedAt: new Date() })
    .where(
      and(
        eq(budgets.orgId, orgId),
        eq(budgets.period, period),
        sql`${budgets.usedUnits} + ${costUnits} <= ${budgets.limitUnits}`,
      ),
    )
    .returning();

  if (updated.length > 0) {
    const row = updated[0];
    return {
      allowed: true,
      remaining: Number(row.limitUnits) - Number(row.usedUnits),
      limit: Number(row.limitUnits),
      used: Number(row.usedUnits),
      reason: "reserved",
    };
  }

  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, orgId), eq(budgets.period, period)));

  return {
    allowed: false,
    remaining: row ? Number(row.limitUnits) - Number(row.usedUnits) : 0,
    limit: row ? Number(row.limitUnits) : 0,
    used: row ? Number(row.usedUnits) : 0,
    reason: "budget exhausted for period",
  };
}

export async function getBudget(orgId: number, period: string = currentPeriod()) {
  await db
    .insert(budgets)
    .values({ orgId, period, limitUnits: "100", usedUnits: "0" })
    .onConflictDoNothing({ target: [budgets.orgId, budgets.period] });
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, orgId), eq(budgets.period, period)));
  return row;
}
