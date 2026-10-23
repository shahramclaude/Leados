// Proactive draft engine: detect moments → draft the intervention → queue it,
// respecting Part 14's interrupt budget (batch aggressively, escalate only on
// real stakes). Every draft is T1 by default: queued, never sent, until a
// human taps approve (or the action class has been promoted AND the specific
// person has granted auto-send — see autonomyKernel.ts).

import type { BudgetState } from "./interruptBudget";
import { canInterruptNow } from "./interruptBudget";
import type { DraftType, Stakes, TriggerType } from "./types";

export type DetectableCommitment = {
  id: string;
  promisorId: string;
  promiseeId: string;
  content: string;
  dueAt: Date;
  status: string;
};

export type DetectableDecision = {
  id: string;
  title: string;
  ownerId: string;
  status: string;
  lastActivityAt: Date;
};

export type DetectableMeeting = {
  id: string;
  title: string;
  ownerId: string;
  actionItemCount: number;
  occurredAt: Date;
};

export type DetectableMetric = {
  metricKey: string;
  ownerId: string;
  value: number;
  target: number;
};

export type DetectableDelegation = {
  id: string;
  delegatorId: string;
  delegateId: string;
  task: string;
  status: string;
  createdAt: Date;
  lastCheckinAt: Date | null;
};

export type DraftCandidate = {
  triggerType: TriggerType;
  surfaceRef: Record<string, unknown>;
  draftType: DraftType;
  targetPersonId: string;
  draftContent: string;
  whyThis: string;
  whyNow: string;
  stakes: Stakes;
  actionClassKey: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function detectDeadlineSlipping(commitments: DetectableCommitment[], now: Date): DraftCandidate[] {
  const out: DraftCandidate[] = [];
  for (const c of commitments) {
    if (c.status !== "open") continue;
    const hoursToDue = (c.dueAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursToDue > 48) continue; // not yet a moment
    const overdue = hoursToDue < 0;
    const stakes: Stakes = overdue ? "critical" : hoursToDue < 24 ? "elevated" : "normal";
    out.push({
      triggerType: "deadline_slipping",
      surfaceRef: { commitmentId: c.id },
      draftType: "nudge",
      targetPersonId: c.promisorId,
      draftContent: overdue
        ? `Reminder: "${c.content}" was due ${c.dueAt.toDateString()} and is still open. Mark it kept, renegotiate the date, or flag a blocker.`
        : `Heads up: "${c.content}" is due ${c.dueAt.toDateString()}. Anything you need to hit it?`,
      whyThis: `This commitment's own due date is ${overdue ? "in the past" : "within 48 hours"} and it is still status=open.`,
      whyNow: overdue ? "Already overdue — surfacing immediately rather than batching." : "Due within 48 hours — early enough to still act.",
      stakes,
      actionClassKey: "nudge.commitment_due",
    });
  }
  return out;
}

export function detectDecisionStagnating(decisions: DetectableDecision[], now: Date, staleDays = 7): DraftCandidate[] {
  const out: DraftCandidate[] = [];
  for (const d of decisions) {
    if (d.status === "decided") continue;
    const ageDays = (now.getTime() - d.lastActivityAt.getTime()) / DAY_MS;
    if (ageDays < staleDays) continue;
    out.push({
      triggerType: "decision_stagnating",
      surfaceRef: { decisionId: d.id },
      draftType: "agenda_item",
      targetPersonId: d.ownerId,
      draftContent: `Add "${d.title}" to the next meeting agenda — it has had no activity for ${Math.floor(ageDays)} days.`,
      whyThis: `Decision '${d.title}' has status='${d.status}' with no recorded activity.`,
      whyNow: `${Math.floor(ageDays)} days of inactivity crossed the ${staleDays}-day stagnation threshold.`,
      stakes: ageDays > staleDays * 2 ? "elevated" : "normal",
      actionClassKey: "agenda.decision_stagnating",
    });
  }
  return out;
}

export function detectMeetingNoActions(meetings: DetectableMeeting[]): DraftCandidate[] {
  const out: DraftCandidate[] = [];
  for (const m of meetings) {
    if (m.actionItemCount > 0) continue;
    out.push({
      triggerType: "meeting_no_actions",
      surfaceRef: { meetingId: m.id },
      draftType: "task",
      targetPersonId: m.ownerId,
      draftContent: `"${m.title}" produced zero action items. Capture at least one next step and owner, or explicitly park it.`,
      whyThis: "Meeting artifact has an empty action-item list.",
      whyNow: "Detected right after compilation, before the thread goes cold.",
      stakes: "normal",
      actionClassKey: "task.meeting_no_actions",
    });
  }
  return out;
}

export function detectMetricDrifting(metrics: DetectableMetric[], toleranceRatio = 0.1): DraftCandidate[] {
  const out: DraftCandidate[] = [];
  for (const m of metrics) {
    const drift = Math.abs(m.value - m.target) / Math.max(1e-6, Math.abs(m.target));
    if (drift <= toleranceRatio) continue;
    out.push({
      triggerType: "metric_drifting",
      surfaceRef: { metricKey: m.metricKey },
      draftType: "email",
      targetPersonId: m.ownerId,
      draftContent: `"${m.metricKey}" is at ${m.value} vs target ${m.target} (${(drift * 100).toFixed(0)}% drift). Worth a look this week.`,
      whyThis: `Drift of ${(drift * 100).toFixed(0)}% exceeds the ${(toleranceRatio * 100).toFixed(0)}% tolerance band.`,
      whyNow: "Caught on the latest reading before it compounds further.",
      stakes: drift > toleranceRatio * 3 ? "elevated" : "normal",
      actionClassKey: "email.metric_drifting",
    });
  }
  return out;
}

export function detectDelegationUnchecked(delegations: DetectableDelegation[], now: Date, staleDays = 3): DraftCandidate[] {
  const out: DraftCandidate[] = [];
  for (const d of delegations) {
    if (d.status !== "accepted") continue;
    const lastTouch = d.lastCheckinAt ?? d.createdAt;
    const ageDays = (now.getTime() - lastTouch.getTime()) / DAY_MS;
    if (ageDays < staleDays) continue;
    out.push({
      triggerType: "delegation_unchecked",
      surfaceRef: { delegationId: d.id },
      draftType: "nudge",
      // Addressed to the DELEGATOR, not the delegate — see escalationGuard.ts.
      targetPersonId: d.delegatorId,
      draftContent: `You delegated "${d.task}" ${Math.floor(ageDays)} days ago with no check-in since. Send a quick status check?`,
      whyThis: "Delegated-without-checking is a known failure mode: accepted work with no check-in recorded.",
      whyNow: `${Math.floor(ageDays)} days since last check-in crossed the ${staleDays}-day threshold.`,
      stakes: ageDays > staleDays * 2 ? "elevated" : "normal",
      actionClassKey: "nudge.delegation_checkin",
    });
  }
  return out;
}

export function detectAllMoments(input: {
  commitments: DetectableCommitment[];
  decisions: DetectableDecision[];
  meetings: DetectableMeeting[];
  metrics: DetectableMetric[];
  delegations: DetectableDelegation[];
  now: Date;
}): DraftCandidate[] {
  return [
    ...detectDeadlineSlipping(input.commitments, input.now),
    ...detectDecisionStagnating(input.decisions, input.now),
    ...detectMeetingNoActions(input.meetings),
    ...detectMetricDrifting(input.metrics),
    ...detectDelegationUnchecked(input.delegations, input.now),
  ];
}

// ---------------------------------------------------------------------------
// Batching / nag-guard: turn many low-stakes candidates for the same person
// into one digest, respecting the daily interrupt budget.
// ---------------------------------------------------------------------------

export type QueuedDraft = DraftCandidate & {
  batchedCount: number;
  queuePosition: "immediate" | "batched";
  budgetReason: string;
};

export function queueWithBudget(
  candidates: DraftCandidate[],
  budgetByPerson: Map<string, BudgetState>,
  now: Date,
): QueuedDraft[] {
  const byPerson = new Map<string, DraftCandidate[]>();
  for (const c of candidates) {
    const list = byPerson.get(c.targetPersonId) ?? [];
    list.push(c);
    byPerson.set(c.targetPersonId, list);
  }

  const out: QueuedDraft[] = [];
  for (const [personId, items] of byPerson) {
    const budget = budgetByPerson.get(personId) ?? {
      personId,
      date: now.toISOString().slice(0, 10),
      cap: 5,
      used: 0,
      quietHoursStart: 19,
      quietHoursEnd: 8,
    };
    const critical = items.filter((i) => i.stakes === "critical");
    const nonCritical = items.filter((i) => i.stakes !== "critical");

    // Critical items always get their own slot, bypassing budget.
    for (const c of critical) {
      out.push({ ...c, batchedCount: 1, queuePosition: "immediate", budgetReason: "critical stakes bypass budget" });
    }

    // Non-critical items: use remaining budget for individual slots, then
    // fold the rest into a single digest draft — this is the nag-guard.
    let remainingSlots = Math.max(0, budget.cap - budget.used);
    for (const c of nonCritical) {
      const check = canInterruptNow(budget, now, c.stakes);
      if (check.allow && remainingSlots > 0) {
        out.push({ ...c, batchedCount: 1, queuePosition: "immediate", budgetReason: check.reason });
        remainingSlots--;
      } else {
        out.push({ ...c, batchedCount: 1, queuePosition: "batched", budgetReason: check.allow ? "budget slots exhausted — batched" : check.reason });
      }
    }

    const toDigest = out.filter((o) => o.targetPersonId === personId && o.queuePosition === "batched" && o.stakes !== "critical");
    if (toDigest.length > 1) {
      // collapse into a single digest entry
      for (const d of toDigest) {
        const idx = out.indexOf(d);
        if (idx >= 0) out.splice(idx, 1);
      }
      out.push({
        triggerType: toDigest[0].triggerType,
        surfaceRef: { digestOf: toDigest.map((d) => d.surfaceRef) },
        draftType: "digest",
        targetPersonId: personId,
        draftContent: `You have ${toDigest.length} lower-priority items queued: ${toDigest.map((d) => `"${d.draftContent}"`).join(" | ")}`,
        whyThis: "Multiple non-critical items for the same person were batched instead of sent individually.",
        whyNow: "Daily interrupt budget reached for individual items — grouped into one digest to avoid nagging.",
        stakes: "normal",
        actionClassKey: "digest.batched_nudges",
        batchedCount: toDigest.length,
        queuePosition: "batched",
        budgetReason: `collapsed ${toDigest.length} items into one digest`,
      });
    }
  }
  return out;
}
