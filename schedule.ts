// Intelligent Scheduling Suggestions — pt-D brief §"Intelligent Scheduling Suggestions".

import type { Finding, Store } from "./types";
import { addDays, daysBetween, startOfWeek } from "./time";
import { cadenceFindingFor } from "./prefill";

export interface ScheduleItem {
  day: string; // Mon..Fri
  label: string;
  detail: string;
  findingKey: string;
  playId: string | null;
  personId?: string | null;
  score: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function collectCadenceFindings(P: Store, today: number): Finding[] {
  const findings: Finding[] = [];
  P.people
    .filter((p) => !p.archived)
    .forEach((p) => {
      const f = cadenceFindingFor(p, P, today);
      if (f) findings.push(f);
    });
  // skip-level style: last oneonone with skip:true
  P.people
    .filter((p) => !p.archived)
    .forEach((p) => {
      const skipLogs = P.events
        .filter((e) => e.type === "oneonone.logged" && e.payload["personId"] === p.id && e.payload["skip"] === true)
        .sort((a, b) => b.at - a.at);
      if (skipLogs.length === 0) return;
      const gap = daysBetween(skipLogs[0].at, today);
      if (gap > 30) {
        findings.push({
          key: `R8:skip:${p.id}`,
          rule: "R8",
          sev: 3,
          conf: "high",
          title: `Skip-level with ${p.name} is ${gap - 30}d overdue (${gap}d since last)`,
          basis: `oneonone.logged skip=true, ${gap}d ago`,
          personId: p.id,
          play: "skiplevel",
        });
      }
    });
  return findings.sort((a, b) => b.sev - a.sev);
}

export function suggestSchedule(P: Store, today: number): ScheduleItem[] {
  const findings = collectCadenceFindings(P, today);
  const items: ScheduleItem[] = [];
  const usedDays = new Set<string>();

  findings.forEach((f, i) => {
    const day = DAYS[i % DAYS.length];
    // conflict detection: don't stack 2 heavy (sev>=3) things same day
    let chosenDay = day;
    if (f.sev >= 3 && usedDays.has(day)) {
      const alt = DAYS.find((d) => !usedDays.has(d));
      if (alt) chosenDay = alt;
    }
    usedDays.add(chosenDay);
    items.push({
      day: chosenDay,
      label: f.title.split(" is ")[0] || f.title,
      detail: f.title,
      findingKey: f.key,
      playId: f.play ?? null,
      personId: f.personId ?? null,
      score: f.sev,
    });
  });

  // Fixed weekly rituals, lower priority, fill remaining days
  const rituals = [
    { label: "Sprint review", detail: "Close last week's sprint.", playId: "SPRINT_CLOSE_BUNDLE" },
    { label: "Customer interview", detail: "Checking in on customer-facing cadence.", playId: null },
    { label: "Weekly reflection + commitment review", detail: "Review open commitments before the week closes.", playId: null },
  ];
  rituals.forEach((r, i) => {
    const day = DAYS[(DAYS.length - 1 - i + DAYS.length) % DAYS.length];
    items.push({ day, label: r.label, detail: r.detail, findingKey: `RITUAL:${r.label}`, playId: r.playId, score: 0.5 });
  });

  return items.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || b.score - a.score);
}

export function isMondayMorning(today: number): boolean {
  return startOfWeek(today) === startOfWeek(today) && new Date(today).getUTCDay() === 1;
}

export function weekLabel(today: number): string {
  const start = startOfWeek(today);
  return `week of ${new Date(start).toISOString().slice(0, 10)}`;
}

export function dayDate(today: number, day: string): number {
  const start = startOfWeek(today);
  const idx = DAYS.indexOf(day);
  return addDays(start, idx);
}
