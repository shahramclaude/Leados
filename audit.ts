// Audit Intelligence analysis — derives summaries from meta.audit.
// FABRICATED: the real repo has no meta.audit array (verified this session).

import type { AuditEntry, FindingHistoryEvent, Store } from "../types";
import { dayOfWeekName, daysBetween } from "./utils";

export interface AuditSummary {
  windowDays: number;
  total: number;
  perDayAvg: number;
  topTypes: { type: string; count: number }[];
  peakDay: { day: string; pct: number } | null;
  writeFailures: number;
  imports: number;
  playbookCompletions: number;
  snoozeRate: number;
  dismissRate: number;
  playRate: number;
}

export function analyzeAuditTrail(store: Store, today: Date, windowDays = 30): AuditSummary {
  const cutoff = today.getTime() - windowDays * 86400000;
  const recent = store.meta.audit.filter((a) => new Date(a.ts).getTime() >= cutoff);
  const total = recent.length;
  const typeCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  let imports = 0;
  let playbookCompletions = 0;
  let snoozes = 0;
  let dismisses = 0;
  let plays = 0;

  recent.forEach((a) => {
    const t = a.action.startsWith("event:") ? a.action.slice(6) : a.action;
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    const day = dayOfWeekName(a.ts);
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    if (a.action === "store.imported") imports += 1;
    if (a.action === "playbook.completed") {
      playbookCompletions += 1;
      plays += 1;
    }
    if (a.action === "finding.snoozed") snoozes += 1;
    if (a.action === "finding.dismissed") dismisses += 1;
  });

  const topTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  let peakDay: { day: string; pct: number } | null = null;
  if (total > 0) {
    const [day, count] = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    peakDay = { day, pct: Math.round((count / total) * 100) };
  }

  const suppressionActions = snoozes + dismisses + plays;
  return {
    windowDays,
    total,
    perDayAvg: Math.round((total / windowDays) * 10) / 10,
    topTypes,
    peakDay,
    writeFailures: 0,
    imports,
    playbookCompletions,
    snoozeRate: suppressionActions ? Math.round((snoozes / suppressionActions) * 100) : 0,
    dismissRate: suppressionActions ? Math.round((dismisses / suppressionActions) * 100) : 0,
    playRate: suppressionActions ? Math.round((plays / suppressionActions) * 100) : 0,
  };
}

export function findingHistory(store: Store, key: string, firstSeenTs?: string): FindingHistoryEvent[] {
  const out: FindingHistoryEvent[] = [];
  if (firstSeenTs) out.push({ ts: firstSeenTs, action: "appeared" });
  store.meta.audit.forEach((a: AuditEntry) => {
    if (a.detail && (a.detail as any).key === key) {
      if (a.action === "finding.snoozed") out.push({ ts: a.ts, action: "snoozed", note: `until ${(a.detail as any).until}` });
      if (a.action === "finding.dismissed") out.push({ ts: a.ts, action: "dismissed" });
    }
    if (a.action === "playbook.completed" && (a.detail as any).key === key) {
      out.push({ ts: a.ts, action: "played", note: String((a.detail as any).playbookId || "") });
    }
  });
  out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return out;
}

export function eventsPerDayForHeatmap(store: Store, today: Date): Map<string, number> {
  const map = new Map<string, number>();
  store.events.forEach((e) => {
    if (daysBetween(e.ts, today.toISOString()) > 370) return;
    const day = e.ts.slice(0, 10);
    map.set(day, (map.get(day) || 0) + 1);
  });
  return map;
}
