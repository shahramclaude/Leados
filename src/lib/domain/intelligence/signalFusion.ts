/**
 * signalFusion.ts — Part 04-E. One pipeline: raw signals → deduplicated
 * findings → severity (1-5) → recommended actions. Pure functions only;
 * callers own persistence of the `Finding` map across evaluation cycles
 * (see `src/components/intelligence/useIntelligenceDemo.ts` for the sandbox
 * caller, or a platform repository in the real Next.js app).
 */

import type { EvidenceRef, Finding, RawSignal, Severity, SeverityHistoryEntry } from "./types";

// ---------------------------------------------------------------------------
// Severity state machine with hysteresis
// ---------------------------------------------------------------------------

/**
 * Thresholds to ESCALATE to level L (score >= upThreshold[L], applied
 * immediately — escalation does not need to persist because missing an
 * early warning is worse than a one-cycle false escalation) and to
 * DE-escalate below level L (score < downThreshold[L] for
 * `CONSECUTIVE_DOWN_EVALS` consecutive evaluations — de-escalation is
 * deliberately slower so findings never flap, standing order E). The sev5
 * numbers (0.92 up / 0.85 down) are given verbatim in the standing order;
 * the lower bands use the same 7-9pt gap scaled down, documented here so
 * future tuning changes one table, not call sites.
 */
export const SEVERITY_LADDER: Record<Exclude<Severity, 1>, { up: number; down: number }> = {
  2: { up: 0.3, down: 0.2 },
  3: { up: 0.55, down: 0.45 },
  4: { up: 0.75, down: 0.65 },
  5: { up: 0.92, down: 0.85 },
};

export const CONSECUTIVE_DOWN_EVALS = 2;

export type SeverityState = { level: Severity; belowStreak: number };

/**
 * One evaluation step of the severity state machine.
 * - Escalate at most one level per call when score clears the next level's
 *   `up` threshold (re-called repeatedly it will climb further, but never
 *   skips the hysteresis bookkeeping of intermediate levels).
 * - De-escalate one level only after `belowStreak` reaches
 *   CONSECUTIVE_DOWN_EVALS consecutive evaluations below the CURRENT level's
 *   `down` threshold; any evaluation back at/above that threshold resets the
 *   streak to 0. This is what prevents oscillation on a noisy score hovering
 *   near a boundary (property-tested in `signalFusion.test.ts`).
 */
export function stepSeverity(prev: SeverityState, score: number): SeverityState {
  const nextLevelUp = (prev.level + 1) as Severity;
  if (nextLevelUp <= 5 && score >= SEVERITY_LADDER[nextLevelUp as Exclude<Severity, 1>].up) {
    return { level: nextLevelUp, belowStreak: 0 };
  }
  if (prev.level > 1) {
    const downThreshold = SEVERITY_LADDER[prev.level as Exclude<Severity, 1>].down;
    if (score < downThreshold) {
      const streak = prev.belowStreak + 1;
      if (streak >= CONSECUTIVE_DOWN_EVALS) {
        return { level: (prev.level - 1) as Severity, belowStreak: 0 };
      }
      return { level: prev.level, belowStreak: streak };
    }
  }
  return { level: prev.level, belowStreak: 0 };
}

// ---------------------------------------------------------------------------
// Correlation-based suppression (one root cause = one finding)
// ---------------------------------------------------------------------------

export function groupByRootCause(signals: RawSignal[]): Map<string, RawSignal[]> {
  const groups = new Map<string, RawSignal[]>();
  for (const s of signals) {
    const arr = groups.get(s.rootCauseKey) ?? [];
    arr.push(s);
    groups.set(s.rootCauseKey, arr);
  }
  return groups;
}

export const RECOMMENDED_ACTIONS: Record<Severity, string[]> = {
  1: ["Monitor — no action required"],
  2: ["Add to weekly review"],
  3: ["Assign an owner", "Review within 48h"],
  4: ["Escalate to domain lead", "Review within 24h"],
  5: ["Escalate immediately", "Trigger incident review"],
};

/**
 * Interrupt policy (standing order E): only severity 5 AND an explicit
 * opt-in may interrupt a user — enforcement of the interrupt itself is
 * Part 12's job; this module only *declares* the policy on the Finding so
 * Part 12 has something authoritative to read.
 */
export function interruptPolicyFor(severity: Severity): Finding["interruptPolicy"] {
  return { mayInterrupt: severity === 5, requiresOptIn: true };
}

/**
 * Full fusion pipeline for one evaluation cycle. `priorFindings` is keyed by
 * `rootCauseKey` so state (severity level + belowStreak + history) persists
 * across cycles — this is what makes the hysteresis state machine
 * meaningful rather than being recomputed from scratch every call.
 */
export function fuseSignals(
  priorFindings: Map<string, Finding>,
  signals: RawSignal[],
  asOf: string,
): Finding[] {
  const groups = groupByRootCause(signals);
  const findings: Finding[] = [];

  for (const [rootCauseKey, group] of groups) {
    // the representative signal is the strongest score in the group —
    // "one root cause = one finding"; others still contribute evidence.
    const sorted = [...group].sort((a, b) => b.score - a.score);
    const rep = sorted[0];
    const combinedEvidence: EvidenceRef[] = group.flatMap((s) => s.evidence);

    const prior = priorFindings.get(rootCauseKey);
    const prevState: SeverityState = prior
      ? { level: prior.severity, belowStreak: prior.belowStreak }
      : { level: 1, belowStreak: 0 };

    const nextState = stepSeverity(prevState, rep.score);
    const historyEntry: SeverityHistoryEntry = { at: asOf, score: rep.score, level: nextState.level };
    const history = [...(prior?.history ?? []), historyEntry].slice(-200);

    const finding: Finding = {
      id: prior?.id ?? `finding_${rootCauseKey}`,
      rootCauseKey,
      parentId: null,
      severity: nextState.level,
      belowStreak: nextState.belowStreak,
      score: rep.score,
      history,
      recommendedActions: RECOMMENDED_ACTIONS[nextState.level],
      interruptPolicy: interruptPolicyFor(nextState.level),
      evidence: combinedEvidence,
      updatedAt: asOf,
    };
    findings.push(finding);

    // child findings: the non-representative signals in the group link to
    // the parent instead of becoming independent findings — this IS the
    // de-duplication / suppression requirement.
    sorted.slice(1).forEach((child, i) => {
      findings.push({
        id: `${finding.id}__child_${i}`,
        rootCauseKey,
        parentId: finding.id,
        severity: nextState.level,
        belowStreak: nextState.belowStreak,
        score: child.score,
        history: [],
        recommendedActions: [],
        interruptPolicy: interruptPolicyFor(nextState.level),
        evidence: child.evidence,
        updatedAt: asOf,
      });
    });
  }

  return findings;
}
