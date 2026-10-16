// Backup Automation Reminder — pt-D brief §"Backup Automation Reminder".

import type { Finding, Store } from "./types";
import { daysBetween, fmt } from "./time";

export function backupStatus(P: Store, today: number): Finding | null {
  const exports = P.audit.filter((a) => a.action === "export").sort((a, b) => b.at - a.at);
  const last = exports[0];
  const threshold = P.settings["backupReminderDays"] ?? 30;
  if (P.events.length <= 100) return null;
  if (last && daysBetween(last.at, today) <= threshold) return null;
  const sinceDays = last ? daysBetween(last.at, today) : Infinity;
  return {
    key: "AUTO:BACKUP",
    rule: "AUTO",
    sev: 1,
    conf: "high",
    title: `⚙ SYSTEM REMINDER — no export in ${sinceDays === Infinity ? "∞ (never)" : sinceDays + " days"}`,
    basis: `Your last export was ${last ? fmt(last.at) : "never"}. With ${P.events.length} events logged, this is your recovery point in case of browser storage loss.`,
    play: null,
    system: true,
  };
}
