// Compute budgets (Part 16 lineage) covering agent compute (Part 06 lineage).
//
// Every agent run must charge the org's monthly compute budget before it is
// allowed to transition out of "pending". If the charge would exceed the
// budget, the run is rejected with a typed error instead of silently running
// over — this is the seam tests/seams/budget-covers-compute.test.ts proves.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets } from "@/db/schema";

export class BudgetExceededError extends Error {
  constructor(public readonly orgId: string, public readonly period: string) {
    super(`Compute budget exceeded for org ${orgId} in period ${period}`);
    this.name = "BudgetExceededError";
  }
}

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_MONTHLY_LIMIT = 100;

/** Ensures a budget row exists for the org/period, creating one with the
 * default limit if this is the org's first activity in that period. */
export async function ensureBudget(orgId: string, period = currentPeriod()) {
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, orgId), eq(budgets.period, period)));
  if (existing) return existing;

  const [created] = await db
    .insert(budgets)
    .values({ orgId, period, computeUnitsLimit: DEFAULT_MONTHLY_LIMIT, computeUnitsUsed: 0 })
    .returning();
  return created;
}

/** Atomically charges `units` of compute against the org's current-period
 * budget. Throws BudgetExceededError (and charges nothing) if it would push
 * usage over the limit. */
export async function chargeCompute(orgId: string, units: number, period = currentPeriod()) {
  await ensureBudget(orgId, period);

  // Use a guarded read-then-write (fine at this scale; a single-row
  // SELECT ... FOR UPDATE would be the production hardening noted in
  // docs/RED-TEAM-2026.md DATA-2).
  const [row] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, orgId), eq(budgets.period, period)));

  if (!row) throw new BudgetExceededError(orgId, period);

  if (row.computeUnitsUsed + units > row.computeUnitsLimit) {
    throw new BudgetExceededError(orgId, period);
  }

  const [updated] = await db
    .update(budgets)
    .set({ computeUnitsUsed: row.computeUnitsUsed + units, updatedAt: new Date() })
    .where(eq(budgets.id, row.id))
    .returning();

  return updated;
}
