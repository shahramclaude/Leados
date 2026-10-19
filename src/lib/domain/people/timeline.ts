// Projects raw person-scoped events into a human-readable timeline, and
// supports reconstructing an "as of" snapshot of role/manager/compa-ratio
// history by replaying events up to a cutoff.

import type { TimelineEntry } from "../types";

export interface RawPersonEvent {
  id: number;
  type: string;
  occurredAt: Date | string;
  payload: unknown;
}

function summarize(type: string, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  switch (type) {
    case "person.hired":
      return `Hired as ${p.title ?? "unknown title"}.`;
    case "person.role_changed":
      return `Role changed from ${p.fromTitle} to ${p.toTitle}.`;
    case "person.manager_changed":
      return "Reporting line changed.";
    case "person.compensation_reviewed":
      return `Compensation reviewed (compa-ratio ${p.compaRatio}).`;
    case "person.skill_evidenced":
      return `New evidence recorded for skill "${p.skill}" (level ${p.level}).`;
    case "person.growth_conversation_held":
      return `Growth conversation held${Array.isArray(p.topics) && p.topics.length ? `: ${(p.topics as string[]).join(", ")}` : ""}.`;
    case "oneonone.scheduled":
      return "1:1 scheduled.";
    case "oneonone.completed":
      return `1:1 completed with ${p.commitmentCount ?? 0} commitment(s).`;
    case "oneonone.commitment_resolved":
      return `Commitment marked ${p.status}.`;
    case "growth.milestone_completed":
      return `Growth milestone completed for skill "${p.skill}".`;
    case "consent.recorded":
      return `Consent ${p.granted ? "granted" : "withdrawn"} for "${p.scope}".`;
    default:
      return type;
  }
}

export function buildTimeline(events: RawPersonEvent[]): TimelineEntry[] {
  return events
    .map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: new Date(e.occurredAt).toISOString(),
      summary: summarize(e.type, e.payload),
      payload: e.payload,
    }))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

export interface AsOfSnapshot {
  asOf: string;
  title: string | null;
  managerId: number | null;
  compaRatio: number | null;
}

/** Replays events up to (and including) `cutoff` to reconstruct historical state. */
export function reconstructAsOf(events: RawPersonEvent[], cutoff: Date): AsOfSnapshot {
  const ordered = [...events]
    .filter((e) => new Date(e.occurredAt).getTime() <= cutoff.getTime())
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  let title: string | null = null;
  let managerId: number | null = null;
  let compaRatio: number | null = null;

  for (const e of ordered) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "person.hired") {
      title = (p.title as string) ?? title;
      managerId = (p.managerId as number | null) ?? managerId;
    } else if (e.type === "person.role_changed") {
      title = (p.toTitle as string) ?? title;
    } else if (e.type === "person.manager_changed") {
      managerId = (p.toManagerId as number | null) ?? managerId;
    } else if (e.type === "person.compensation_reviewed") {
      compaRatio = (p.compaRatio as number) ?? compaRatio;
    }
  }

  return { asOf: cutoff.toISOString(), title, managerId, compaRatio };
}
