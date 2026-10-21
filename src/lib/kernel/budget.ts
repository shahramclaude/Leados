// Daily action budgets per (domain, capability), plus circuit breakers.
import { db } from "@/db";
import { kernelBudgets, kernelCircuitBreakers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newId, todayKey } from "./ids";

export const DEFAULT_DAILY_BUDGET = 25;
export const CIRCUIT_BREAKER_THRESHOLD = 3; // consecutive failures before trip

/** Atomically checks and, if allowed, consumes `cost` units of today's budget
 * for (domain, capability). Returns whether consumption succeeded. */
export async function tryConsumeBudget(domain: string, capability: string, cost: number): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const day = todayKey();
  const [existing] = await db
    .select()
    .from(kernelBudgets)
    .where(and(eq(kernelBudgets.domain, domain), eq(kernelBudgets.capability, capability), eq(kernelBudgets.day, day)))
    .limit(1);

  if (!existing) {
    const limit = DEFAULT_DAILY_BUDGET;
    if (cost > limit) return { ok: false, remaining: limit, limit };
    await db.insert(kernelBudgets).values({
      id: newId("budget"),
      domain,
      capability,
      day,
      limitAmount: limit,
      consumed: cost,
    });
    return { ok: true, remaining: limit - cost, limit };
  }

  if (existing.consumed + cost > existing.limitAmount) {
    return { ok: false, remaining: existing.limitAmount - existing.consumed, limit: existing.limitAmount };
  }
  await db
    .update(kernelBudgets)
    .set({ consumed: existing.consumed + cost, updatedAt: new Date() })
    .where(eq(kernelBudgets.id, existing.id));
  return { ok: true, remaining: existing.limitAmount - existing.consumed - cost, limit: existing.limitAmount };
}

export async function peekBudget(domain: string, capability: string): Promise<{ remaining: number; limit: number }> {
  const day = todayKey();
  const [existing] = await db
    .select()
    .from(kernelBudgets)
    .where(and(eq(kernelBudgets.domain, domain), eq(kernelBudgets.capability, capability), eq(kernelBudgets.day, day)))
    .limit(1);
  if (!existing) return { remaining: DEFAULT_DAILY_BUDGET, limit: DEFAULT_DAILY_BUDGET };
  return { remaining: existing.limitAmount - existing.consumed, limit: existing.limitAmount };
}

export async function setDailyBudget(domain: string, capability: string, limit: number): Promise<void> {
  const day = todayKey();
  await db
    .insert(kernelBudgets)
    .values({ id: newId("budget"), domain, capability, day, limitAmount: limit, consumed: 0 })
    .onConflictDoUpdate({
      target: [kernelBudgets.domain, kernelBudgets.capability, kernelBudgets.day],
      set: { limitAmount: limit },
    });
}

/** Records a step outcome against the circuit breaker for a capability.
 * After CIRCUIT_BREAKER_THRESHOLD consecutive failures, trips (callers
 * should set the capability's enforcement mode to "manual" on trip). */
export async function recordCircuitOutcome(capability: string, success: boolean): Promise<{ tripped: boolean; consecutiveFailures: number }> {
  const [existing] = await db
    .select()
    .from(kernelCircuitBreakers)
    .where(eq(kernelCircuitBreakers.capability, capability))
    .limit(1);

  if (success) {
    await db
      .insert(kernelCircuitBreakers)
      .values({ capability, consecutiveFailures: 0, trippedAt: null })
      .onConflictDoUpdate({ target: kernelCircuitBreakers.capability, set: { consecutiveFailures: 0, trippedAt: null, updatedAt: new Date() } });
    return { tripped: false, consecutiveFailures: 0 };
  }

  const next = (existing?.consecutiveFailures ?? 0) + 1;
  const tripped = next >= CIRCUIT_BREAKER_THRESHOLD;
  await db
    .insert(kernelCircuitBreakers)
    .values({ capability, consecutiveFailures: next, trippedAt: tripped ? new Date() : null })
    .onConflictDoUpdate({
      target: kernelCircuitBreakers.capability,
      set: { consecutiveFailures: next, trippedAt: tripped ? new Date() : null, updatedAt: new Date() },
    });
  return { tripped, consecutiveFailures: next };
}

export function backoffWithJitter(attempt: number, baseMs = 200, maxMs = 5000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}
