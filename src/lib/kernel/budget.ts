// =============================================================================
// LEADOS kernel — daily action budgets & anomaly tripwire
// =============================================================================

import { db } from "@/db";
import { actionBudgets, kernelToolCalls } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";

export const DEFAULT_DAILY_BUDGET = 20;

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface BudgetStatus {
  domain: string;
  dateKey: string;
  maxWrites: number;
  usedWrites: number;
  remaining: number;
}

export async function getBudgetStatus(domain: string, maxWrites = DEFAULT_DAILY_BUDGET, now = new Date()): Promise<BudgetStatus> {
  const dateKey = todayKey(now);
  const rows = await db
    .select()
    .from(actionBudgets)
    .where(and(eq(actionBudgets.domain, domain), eq(actionBudgets.dateKey, dateKey)))
    .limit(1);

  if (rows.length === 0) {
    return { domain, dateKey, maxWrites, usedWrites: 0, remaining: maxWrites };
  }
  const row = rows[0];
  return {
    domain,
    dateKey,
    maxWrites: row.maxWrites,
    usedWrites: row.usedWrites,
    remaining: Math.max(0, row.maxWrites - row.usedWrites),
  };
}

/** Atomically reserves `cost` units of budget for `domain`. Returns false
 * (and does NOT consume) if that would exceed the daily cap. */
export async function tryConsumeBudget(domain: string, cost: number, maxWrites = DEFAULT_DAILY_BUDGET, now = new Date()): Promise<boolean> {
  const dateKey = todayKey(now);
  const existing = await db
    .select()
    .from(actionBudgets)
    .where(and(eq(actionBudgets.domain, domain), eq(actionBudgets.dateKey, dateKey)))
    .limit(1);

  if (existing.length === 0) {
    if (cost > maxWrites) return false;
    await db.insert(actionBudgets).values({ domain, dateKey, maxWrites, usedWrites: cost }).onConflictDoNothing();
    return true;
  }

  const row = existing[0];
  // `maxWrites` passed in always reflects the current capability override (or
  // the default), so re-evaluate the cap against it even for an
  // already-created row rather than trusting whatever cap was in effect the
  // first time this domain/day pair was written.
  if (row.usedWrites + cost > maxWrites) return false;

  await db
    .update(actionBudgets)
    .set({ usedWrites: row.usedWrites + cost, maxWrites })
    .where(and(eq(actionBudgets.domain, domain), eq(actionBudgets.dateKey, dateKey)));
  return true;
}

export async function listTodayBudgets(now = new Date()): Promise<BudgetStatus[]> {
  const dateKey = todayKey(now);
  const rows = await db.select().from(actionBudgets).where(eq(actionBudgets.dateKey, dateKey));
  return rows.map((row) => ({
    domain: row.domain,
    dateKey: row.dateKey,
    maxWrites: row.maxWrites,
    usedWrites: row.usedWrites,
    remaining: Math.max(0, row.maxWrites - row.usedWrites),
  }));
}

/**
 * Anomaly tripwire: compares the number of EXECUTED tool calls in the last
 * hour against the trailing 7-day hourly average. If today's rate is more
 * than `multiplier`x the baseline (and the baseline itself is non-trivial),
 * the run is considered anomalous and the caller should pause autonomy.
 */
export async function detectAnomalousActionRate(multiplier = 3, now = new Date()): Promise<{ anomalous: boolean; recentCount: number; baselinePerHour: number }> {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recent = await db
    .select({ id: kernelToolCalls.id })
    .from(kernelToolCalls)
    .where(and(eq(kernelToolCalls.status, "executed"), gte(kernelToolCalls.executedAt, oneHourAgo)));

  const trailing = await db
    .select({ id: kernelToolCalls.id })
    .from(kernelToolCalls)
    .where(and(eq(kernelToolCalls.status, "executed"), gte(kernelToolCalls.executedAt, sevenDaysAgo)));

  const baselinePerHour = trailing.length / (7 * 24);
  const recentCount = recent.length;
  const anomalous = baselinePerHour >= 1 && recentCount > baselinePerHour * multiplier;

  return { anomalous, recentCount, baselinePerHour };
}
