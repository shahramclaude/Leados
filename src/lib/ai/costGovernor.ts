// =============================================================================
// LEADOS — Part 11: cost governance
// =============================================================================
// Per-feature, per-user monthly budgets. Every generation checks budget BEFORE
// calling a paid model tier, and every completed generation (including the
// free composer tier, logged at $0) is metered afterward. The composer tier
// is exempt from budget blocking — it must always remain available as the
// safe, free fallback so a budget cap can never fully deny service.
// =============================================================================

import { db } from "@/db";
import { llmBudgets, llmUsageLog } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { ModelProviderId, ModelTier } from "./types";

function userIdFilter(userId: number | null) {
  return userId === null ? isNull(llmBudgets.userId) : eq(llmBudgets.userId, userId);
}

const DEFAULT_BUDGET_CENTS: Record<string, number> = {
  briefing: 50, // $0.50/user/month
  ask: 200, // $2.00/user/month
  insight: 100, // $1.00/user/month
  narrative: 50,
};

export function currentPeriodKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BudgetStatus {
  allowed: boolean;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
}

async function ensureBudgetRow(orgId: number, userId: number | null, feature: string, periodKey: string) {
  const existing = await db
    .select()
    .from(llmBudgets)
    .where(and(eq(llmBudgets.orgId, orgId), eq(llmBudgets.feature, feature), eq(llmBudgets.periodKey, periodKey), userIdFilter(userId)));
  if (existing.length > 0) return existing[0];
  const [row] = await db
    .insert(llmBudgets)
    .values({
      orgId,
      userId,
      feature,
      periodKey,
      budgetCents: DEFAULT_BUDGET_CENTS[feature] ?? 100,
      spentCents: 0,
    })
    .returning();
  return row;
}

export async function getBudgetStatus(orgId: number, userId: number | null, feature: string): Promise<BudgetStatus> {
  const periodKey = currentPeriodKey();
  const row = await ensureBudgetRow(orgId, userId, feature, periodKey);
  return {
    allowed: row.spentCents < row.budgetCents,
    budgetCents: row.budgetCents,
    spentCents: row.spentCents,
    remainingCents: Math.max(0, row.budgetCents - row.spentCents),
  };
}

/** Returns true if there is enough budget headroom to attempt a paid tier at the given estimated cost. */
export async function canAfford(orgId: number, userId: number | null, feature: string, estimatedCostCents: number): Promise<boolean> {
  const status = await getBudgetStatus(orgId, userId, feature);
  return status.remainingCents >= estimatedCostCents;
}

export interface MeterParams {
  orgId: number;
  userId: number | null;
  feature: string;
  taskId?: string;
  modelCardId: string;
  provider: ModelProviderId;
  tier: ModelTier;
  promptTokens: number;
  completionTokens: number;
  costCents: number;
  cacheHit: boolean;
  degraded: boolean;
  groundingHash: string;
}

export async function meterUsage(params: MeterParams): Promise<void> {
  const periodKey = currentPeriodKey();
  await db.insert(llmUsageLog).values({
    orgId: params.orgId,
    userId: params.userId,
    feature: params.feature,
    taskId: params.taskId,
    modelCardId: params.modelCardId,
    provider: params.provider,
    tier: params.tier,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    costCents: params.costCents.toFixed(4),
    cacheHit: params.cacheHit,
    degraded: params.degraded,
    groundingHash: params.groundingHash,
  });

  if (params.costCents > 0) {
    await ensureBudgetRow(params.orgId, params.userId, params.feature, periodKey);
    // Read-modify-write increment (acceptable at this volume; a SQL `+=` can be
    // swapped in later via `sql` once write concurrency requires it).
    const rows = await db
      .select()
      .from(llmBudgets)
      .where(and(eq(llmBudgets.orgId, params.orgId), eq(llmBudgets.feature, params.feature), eq(llmBudgets.periodKey, periodKey), userIdFilter(params.userId)));
    const row = rows[0];
    if (row) {
      await db
        .update(llmBudgets)
        .set({ spentCents: row.spentCents + Math.ceil(params.costCents), updatedAt: new Date() })
        .where(eq(llmBudgets.id, row.id));
    }
  }
}
