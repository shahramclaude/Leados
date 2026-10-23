// Part 14 (stub — source file not present in this snapshot): Attention Budget.
//
// Contract implemented here: each person has a daily interrupt cap and quiet
// hours. Proactive drafts always get *queued* (T1 default), but whether they
// are surfaced as an immediate, individual item vs. folded into a batched
// digest depends on this budget — this is the anti-nagging guard.

import type { Stakes } from "./types";

export type BudgetState = {
  personId: string;
  date: string; // YYYY-MM-DD
  cap: number;
  used: number;
  quietHoursStart: number; // 24h
  quietHoursEnd: number;
};

export function isQuietHours(hourLocal: number, state: BudgetState): boolean {
  const { quietHoursStart, quietHoursEnd } = state;
  if (quietHoursStart === quietHoursEnd) return false;
  if (quietHoursStart < quietHoursEnd) {
    return hourLocal >= quietHoursStart && hourLocal < quietHoursEnd;
  }
  // wraps midnight, e.g. 19 -> 8
  return hourLocal >= quietHoursStart || hourLocal < quietHoursEnd;
}

/**
 * Decides whether an item may interrupt *now* as a standalone, individual
 * item, or must be queued/batched instead. Only `critical` stakes bypass
 * quiet hours and the daily cap — everything else respects both.
 */
export function canInterruptNow(
  state: BudgetState,
  now: Date,
  stakes: Stakes,
): { allow: boolean; reason: string } {
  const hour = now.getHours();
  const quiet = isQuietHours(hour, state);
  if (stakes === "critical") {
    return { allow: true, reason: "critical stakes bypass quiet hours and daily cap" };
  }
  if (quiet) {
    return { allow: false, reason: `quiet hours (${state.quietHoursStart}:00-${state.quietHoursEnd}:00) — batched for later` };
  }
  if (state.used >= state.cap) {
    return { allow: false, reason: `daily interrupt cap reached (${state.used}/${state.cap}) — batched into digest` };
  }
  return { allow: true, reason: `within budget (${state.used}/${state.cap}) and outside quiet hours` };
}

/** Default budget for a person who has no record yet. */
export function defaultBudget(personId: string, date: string): BudgetState {
  return { personId, date, cap: 5, used: 0, quietHoursStart: 19, quietHoursEnd: 8 };
}
