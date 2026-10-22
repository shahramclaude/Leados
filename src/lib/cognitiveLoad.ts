// LEADOS Part 14 — per-user daily interrupt budget ("cognitive load" gate).
// Enforces the hard cap B (default 8) on immediate interruptions per local
// calendar day. This module is the ONLY place that increments spend — the
// dispatch gate in notifications.ts calls `trySpend` before ever pushing an
// immediate interrupt, which is what makes "exhausted budget queues to
// digest" an enforced invariant rather than a UI suggestion.
import { db } from "@/db";
import { interruptBudgetLedger } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { dayKeyInTz } from "./temporal";

export const DEFAULT_DAILY_BUDGET = 8;

export interface BudgetStatus {
  dayKey: string;
  spent: number;
  budget: number;
  remaining: number;
  exhausted: boolean;
}

export async function getBudgetStatus(
  userId: string,
  timezone: string,
  at: Date = new Date(),
  budget = DEFAULT_DAILY_BUDGET,
): Promise<BudgetStatus> {
  const dayKey = dayKeyInTz(at, timezone);
  const [row] = await db
    .select()
    .from(interruptBudgetLedger)
    .where(and(eq(interruptBudgetLedger.userId, userId), eq(interruptBudgetLedger.dayKey, dayKey)))
    .limit(1);
  const spent = row?.spent ?? 0;
  const effectiveBudget = row?.budget ?? budget;
  return {
    dayKey,
    spent,
    budget: effectiveBudget,
    remaining: Math.max(0, effectiveBudget - spent),
    exhausted: spent >= effectiveBudget,
  };
}

/**
 * Atomically attempt to spend one unit of the daily interrupt budget.
 * Returns { ok: true, status } if the spend succeeded (caller may deliver
 * immediately), or { ok: false, status } if the budget is exhausted (caller
 * MUST queue to the next digest instead).
 *
 * Implemented as a single upsert + conditional update so concurrent
 * dispatches cannot both "succeed" past the cap (race-safe under Postgres
 * row-level locking via the unique index on (user_id, day_key)).
 */
export async function trySpendBudget(
  userId: string,
  timezone: string,
  at: Date = new Date(),
  budget = DEFAULT_DAILY_BUDGET,
): Promise<{ ok: boolean; status: BudgetStatus }> {
  const dayKey = dayKeyInTz(at, timezone);

  await db
    .insert(interruptBudgetLedger)
    .values({ userId, dayKey, spent: 0, budget })
    .onConflictDoNothing({ target: [interruptBudgetLedger.userId, interruptBudgetLedger.dayKey] });

  const result = await db.execute<{ spent: number; budget: number }>(sql`
    UPDATE interrupt_budget_ledger
    SET spent = spent + 1, updated_at = now()
    WHERE user_id = ${userId} AND day_key = ${dayKey} AND spent < budget
    RETURNING spent, budget
  `);

  const row = result.rows[0];
  if (row) {
    const spent = Number(row.spent);
    const budgetVal = Number(row.budget);
    return {
      ok: true,
      status: { dayKey, spent, budget: budgetVal, remaining: Math.max(0, budgetVal - spent), exhausted: spent >= budgetVal },
    };
  }

  const status = await getBudgetStatus(userId, timezone, at, budget);
  return { ok: false, status };
}
