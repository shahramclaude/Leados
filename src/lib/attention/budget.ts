// Daily interrupt budget with visible spend. Each user gets a fixed number
// of "may break focus" interrupts per day (resets at local midnight); once
// spent, everything else is routed to the digest regardless of severity
// (unless it is a severity-5 opt-in override — see attention.ts).

import { db } from "@/db";
import { attentionBudget } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { dateKey } from "./temporal";

export const DEFAULT_DAILY_BUDGET = 6;

export interface BudgetState {
  date: string;
  budget: number;
  used: number;
  remaining: number;
}

async function ensureRow(userId: string, date: string) {
  const existing = await db
    .select()
    .from(attentionBudget)
    .where(and(eq(attentionBudget.userId, userId), eq(attentionBudget.date, date)))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(attentionBudget)
    .values({ userId, date, budget: DEFAULT_DAILY_BUDGET, used: 0 })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const retry = await db
    .select()
    .from(attentionBudget)
    .where(and(eq(attentionBudget.userId, userId), eq(attentionBudget.date, date)))
    .limit(1);
  return retry[0];
}

export async function getBudgetState(userId: string, now: Date = new Date(), timezone = "UTC"): Promise<BudgetState> {
  const date = dateKey(now, timezone);
  const row = await ensureRow(userId, date);
  return {
    date,
    budget: row.budget,
    used: row.used,
    remaining: Math.max(0, row.budget - row.used),
  };
}

export async function hasBudgetRemaining(userId: string, now: Date = new Date(), timezone = "UTC"): Promise<boolean> {
  const state = await getBudgetState(userId, now, timezone);
  return state.remaining > 0;
}

/** Atomically spends one unit of budget. Returns the updated state. */
export async function spendBudget(userId: string, now: Date = new Date(), timezone = "UTC"): Promise<BudgetState> {
  const date = dateKey(now, timezone);
  await ensureRow(userId, date);
  return incrementBudget(userId, date);
}

async function incrementBudget(userId: string, date: string): Promise<BudgetState> {
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(sql`
    update attention_budget
    set used = used + 1, updated_at = now()
    where user_id = ${userId} and date = ${date}
    returning budget, used
  `);
  const row = (rows as unknown as { rows: Array<{ budget: number; used: number }> }).rows[0];
  return {
    date,
    budget: row.budget,
    used: row.used,
    remaining: Math.max(0, row.budget - row.used),
  };
}
