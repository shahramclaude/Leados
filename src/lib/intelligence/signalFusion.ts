// src/lib/intelligence/signalFusion.ts
//
// Signal fusion & severity (Part 3 §6): raw signals -> findings -> severity
// (1-5) -> recommended actions, with:
//   - de-duplication: multiple raw signals sharing a rootCauseId become ONE
//     finding (the loudest one), not N separate alarms,
//   - correlation-based suppression: subsequent signals for an already-open
//     root cause are folded in as extra evidence, not new findings,
//   - hysteresis: a finding's *displayed* severity only moves after the raw
//     severity has been consistent for several consecutive evaluations, so
//     it cannot flap 3 -> 4 -> 3 -> 4 across noisy measurements,
//   - interrupt policy: only severity 5 AND an explicit per-domain opt-in
//     may interrupt a human.
import type { Explanation, Finding, Severity } from "./types";

export interface RawSignal {
  id: string;
  /** signals that share a rootCauseId are the SAME underlying problem */
  rootCauseId: string;
  domain: string;
  title: string;
  rawSeverity: Severity;
  explanation: Explanation;
  detectedAt: string;
}

/** Number of consecutive evaluations a new severity must hold before it is
 * allowed to change the *displayed* severity — the hysteresis guardrail
 * against flapping. */
export const HYSTERESIS_CONSECUTIVE_REQUIRED = 2;

interface HysteresisState {
  displayedSeverity: Severity;
  pendingSeverity: Severity | null;
  pendingCount: number;
}

const RECOMMENDED_ACTIONS: Record<string, string[]> = {
  pipeline: [
    "Flag deal owner for a stage-exit review this week.",
    "Suggest a multi-threading play if only one contact is engaged.",
  ],
  retention: [
    "Loop in Customer Success for an executive check-in within 5 business days.",
    "Review open critical tickets for SLA breaches.",
  ],
  forecast: [
    "Review pipeline generation plan with RevOps for the current quarter.",
    "Re-rank commit/best-case categorization for late-stage deals.",
  ],
  default: ["Review the underlying evidence and assign an owner."],
};

export class SignalFusionEngine {
  private hysteresis = new Map<string, HysteresisState>();

  private applyHysteresis(rootCauseId: string, rawSeverity: Severity): Severity {
    const existing = this.hysteresis.get(rootCauseId);
    if (!existing) {
      this.hysteresis.set(rootCauseId, { displayedSeverity: rawSeverity, pendingSeverity: null, pendingCount: 0 });
      return rawSeverity;
    }
    if (rawSeverity === existing.displayedSeverity) {
      existing.pendingSeverity = null;
      existing.pendingCount = 0;
      return existing.displayedSeverity;
    }
    if (rawSeverity === existing.pendingSeverity) {
      existing.pendingCount += 1;
    } else {
      existing.pendingSeverity = rawSeverity;
      existing.pendingCount = 1;
    }
    if (existing.pendingCount >= HYSTERESIS_CONSECUTIVE_REQUIRED) {
      existing.displayedSeverity = rawSeverity;
      existing.pendingSeverity = null;
      existing.pendingCount = 0;
    }
    return existing.displayedSeverity;
  }

  resetRootCause(rootCauseId: string): void {
    this.hysteresis.delete(rootCauseId);
  }

  snapshotState(): Record<string, HysteresisState> {
    return Object.fromEntries(this.hysteresis.entries());
  }

  /** Fuses a batch of raw signals into deduplicated, severity-stable
   * findings with recommended actions and an interrupt eligibility flag.
   * `interruptOptIn` is the per-domain explicit opt-in required for a
   * severity-5 finding to be allowed to interrupt a human. */
  fuse(signals: RawSignal[], interruptOptIn: Record<string, boolean> = {}): Finding[] {
    const groups = new Map<string, RawSignal[]>();
    for (const signal of signals) {
      groups.set(signal.rootCauseId, [...(groups.get(signal.rootCauseId) ?? []), signal]);
    }

    const findings: Finding[] = [];
    for (const [rootCauseId, group] of groups.entries()) {
      // De-duplication: the loudest (highest raw severity) signal becomes
      // the primary finding; the rest are correlation-suppressed and folded
      // in as suppressed evidence so one root cause never produces more
      // than one alarm.
      const sorted = [...group].sort((a, b) => b.rawSeverity - a.rawSeverity);
      const primary = sorted[0];
      const suppressed = sorted.slice(1);

      const displayedSeverity = this.applyHysteresis(rootCauseId, primary.rawSeverity);
      const domain = primary.domain;
      const actions = RECOMMENDED_ACTIONS[domain] ?? RECOMMENDED_ACTIONS.default;
      const interruptEligible = displayedSeverity === 5 && !!interruptOptIn[domain];

      findings.push({
        id: `finding:${rootCauseId}`,
        rootCauseId,
        domain,
        title: primary.title,
        severity: primary.rawSeverity,
        displayedSeverity,
        status: "active",
        explanation: {
          ...primary.explanation,
          caveats: [
            ...primary.explanation.caveats,
            ...(suppressed.length > 0
              ? [`${suppressed.length} correlated signal(s) suppressed as duplicates of the same root cause: ${suppressed.map((s) => s.id).join(", ")}.`]
              : []),
            ...(displayedSeverity !== primary.rawSeverity
              ? [`Hysteresis active: raw severity ${primary.rawSeverity} has not yet persisted for ${HYSTERESIS_CONSECUTIVE_REQUIRED} consecutive evaluations; displaying stable severity ${displayedSeverity}.`]
              : []),
          ],
        },
        recommendedActions: actions,
        suppressedSignalIds: suppressed.map((s) => s.id),
        interruptEligible,
      });
    }
    return findings.sort((a, b) => b.displayedSeverity - a.displayedSeverity);
  }
}

export const globalSignalFusionEngine = new SignalFusionEngine();
