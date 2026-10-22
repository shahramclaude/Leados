// LEADOS Part 14 — interrupt policy state machine.
//
// State machine (per interrupt attempt):
//
//   ┌────────────┐   muted for class     ┌────────────┐
//   │  INCOMING  ├──────────────────────▶│ SUPPRESSED │
//   └─────┬──────┘                       │  (mute)    │
//         │ not muted                    └────────────┘
//         ▼
//   focus mode on & class not allow-listed
//         ├───────────────────────────────▶ SUPPRESSED (focus)
//         │ else
//         ▼
//   severity === 5  OR user opted in to immediate for this class?
//         │ yes                                   │ no
//         ▼                                       ▼
//   in quiet hours?                          QUEUED_DIGEST (policy)
//     │ yes            │ no
//     ▼                ▼
//   QUEUED_DIGEST   budget has room?
//   (quiet hours)     │ yes          │ no
//                      ▼              ▼
//                  IMMEDIATE     QUEUED_DIGEST
//                                (budget exhausted)
//
// This module is pure decision logic — it does not write notifications or
// touch the event bus. `src/lib/notifications.ts` is the single gate that
// calls `decideInterrupt` and then acts on the verdict, which is what makes
// "every interruption passes through one gate" true and testable.
import { checkQuietHours } from "./circadian";
import { getBudgetStatus, trySpendBudget } from "./cognitiveLoad";
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type NotificationClass = "alert" | "action" | "info" | "digest";

export interface InterruptRequest {
  userId: string;
  timezone: string;
  class: NotificationClass;
  severity: number; // 1..5
  focusModeEnabled: boolean;
  focusAllowedClasses: string[];
  budget?: number;
}

export type InterruptVerdict =
  | { outcome: "immediate"; reason: string }
  | { outcome: "queued_digest"; reason: string }
  | { outcome: "suppressed_mute"; reason: string }
  | { outcome: "suppressed_focus"; reason: string };

export async function decideInterrupt(req: InterruptRequest, at: Date = new Date()): Promise<InterruptVerdict> {
  const [pref] = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.userId, req.userId), eq(notificationPrefs.class, req.class)))
    .limit(1);

  if (pref?.muted) {
    return { outcome: "suppressed_mute", reason: `class "${req.class}" is muted: ${pref.muteReason || "no reason given"}` };
  }

  if (req.focusModeEnabled && !req.focusAllowedClasses.includes(req.class)) {
    return { outcome: "suppressed_focus", reason: `focus mode is on and "${req.class}" is not in your allow-list` };
  }

  const optedIn = pref?.optedInImmediate ?? false;
  const qualifiesForImmediate = req.severity >= 5 || optedIn;

  if (!qualifiesForImmediate) {
    return {
      outcome: "queued_digest",
      reason: `severity ${req.severity} and not opted-in to immediate delivery for "${req.class}" — queued to next digest`,
    };
  }

  const quiet = await checkQuietHours(req.userId, at);
  if (quiet.inQuietHours) {
    return {
      outcome: "queued_digest",
      reason: `quiet hours active (${quiet.config.timezone}) — queued to next digest, ends in ${quiet.minutesUntilEnd}m`,
    };
  }

  const spend = await trySpendBudget(req.userId, req.timezone, at, req.budget);
  if (!spend.ok) {
    return {
      outcome: "queued_digest",
      reason: `daily interrupt budget exhausted (${spend.status.spent}/${spend.status.budget} used) — queued to next digest`,
    };
  }

  return {
    outcome: "immediate",
    reason:
      req.severity >= 5
        ? `severity 5 always interrupts immediately (budget ${spend.status.spent}/${spend.status.budget})`
        : `opted-in to immediate delivery for "${req.class}" (budget ${spend.status.spent}/${spend.status.budget})`,
  };
}

export async function currentBudgetStatus(userId: string, timezone: string, budget?: number) {
  return getBudgetStatus(userId, timezone, new Date(), budget);
}
