// Auto-Archive and Data Hygiene — pt-D brief §"Auto-Archive and Data Hygiene".
// Entirely read-only analysis; no deletion path exists anywhere in this module.

import type { Store } from "./types";
import { daysBetween, fmt } from "./time";

const COLD_DAYS = 730;
const GAP_DAYS = 14;

export interface HygieneReport {
  orphanedEvents: { count: number; events: Store["events"] };
  coldData: { count: number; estimatedBytes: number; events: Store["events"] };
  coverageGaps: { startAt: number; endAt: number; days: number }[];
  settingDrift: { key: string; current: number; default: number; basis: string }[];
}

const SETTING_DEFAULTS: Record<string, { value: number; basis: string }> = {
  oneOnOneCadenceDays: { value: 14, basis: "14d is a common 1:1 cadence — adjust to match your actual practice." },
  skipCadenceDefaultDays: { value: 30, basis: "30d is a common skip-level cadence." },
  boardNarrativeReviewDays: { value: 7, basis: "One week ahead of a board meeting is a common prep window." },
  backupReminderDays: { value: 30, basis: "30 days without an export is a common recovery-point threshold." },
  staleFindingWindowDays: { value: 180, basis: "180d (longest calibration window) bounds which findings thin data can support." },
};

export function dataHygiene(P: Store, today: number): HygieneReport {
  const archivedIds = new Set(P.people.filter((p) => p.archived).map((p) => p.id));
  const orphanedEvents = P.events.filter((e) => typeof e.payload["personId"] === "string" && archivedIds.has(e.payload["personId"] as string));

  const coldEvents = P.events.filter((e) => daysBetween(e.at, today) > COLD_DAYS);
  const estimatedBytes = coldEvents.reduce((sum, e) => sum + JSON.stringify(e).length, 0);

  const sorted = [...P.events].sort((a, b) => a.at - b.at);
  const gaps: { startAt: number; endAt: number; days: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = daysBetween(sorted[i - 1].at, sorted[i].at);
    if (gapDays > GAP_DAYS) gaps.push({ startAt: sorted[i - 1].at, endAt: sorted[i].at, days: gapDays });
  }

  const settingDrift = Object.entries(SETTING_DEFAULTS)
    .filter(([key, def]) => P.settings[key] === def.value)
    .map(([key, def]) => ({ key, current: P.settings[key], default: def.value, basis: def.basis }));

  return {
    orphanedEvents: { count: orphanedEvents.length, events: orphanedEvents },
    coldData: { count: coldEvents.length, estimatedBytes, events: coldEvents },
    coverageGaps: gaps,
    settingDrift,
  };
}

export function exportEventsAsJSON(events: Store["events"], filename: string) {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fmtDate(ms: number) {
  return fmt(ms);
}
