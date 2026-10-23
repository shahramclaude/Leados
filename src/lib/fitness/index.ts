/**
 * STAND-IN for Part 39's fitness engine. Not present in this repository
 * snapshot (confirmed via grep before writing). Part 51 needs a contextFit
 * function: given an intervention's applicableContexts/preconditions and an
 * org's actual context, return a 0..1 fit score, with hard preconditions
 * producing an exact 0. Replace with the real Part 39 engine when it lands.
 */

import type { Context, Intervention } from "@/lib/recommender/types";

function matchesPartial(context: Context, matcher: Record<string, string[]>): boolean {
  return Object.entries(matcher).every(([key, allowed]) => {
    const actual = context[key];
    return actual !== undefined && allowed.includes(actual);
  });
}

function violatesPrecondition(
  context: Context,
  rule: { key: string; in?: string[]; notIn?: string[] },
): boolean {
  const actual = context[rule.key];
  if (rule.in && (actual === undefined || !rule.in.includes(actual))) return true;
  if (rule.notIn && actual !== undefined && rule.notIn.includes(actual)) return true;
  return false;
}

export interface FitResult {
  fit: number; // 0..1
  hardFail: boolean;
  matchedContexts: number;
}

export function contextFit(intervention: Intervention, context: Context): FitResult {
  for (const rule of intervention.preconditions) {
    if (violatesPrecondition(context, rule)) {
      return { fit: 0, hardFail: true, matchedContexts: 0 };
    }
  }

  if (intervention.applicableContexts.length === 0) {
    return { fit: 0.5, hardFail: false, matchedContexts: 0 };
  }

  const matched = intervention.applicableContexts.filter((m) => matchesPartial(context, m)).length;
  const fit = matched / intervention.applicableContexts.length;
  // Floor at 0.15 rather than 0 for "no matcher hit" so genuinely novel /
  // serendipitous plays are still rankable (just heavily down-weighted) —
  // true exclusions only happen via hard preconditions above.
  return { fit: matched > 0 ? fit : 0.15, hardFail: false, matchedContexts: matched };
}
