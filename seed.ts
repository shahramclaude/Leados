// Fabricated demo event log — clearly labeled, shaped to exercise every
// automation capability in the pt-D brief. See AI-SESSION-LOG.md §2 for the
// event-type provenance table (which of these exist in the real events.js
// registry vs are brief-authored demo-only types).

import type { LeadEvent, Person, Settings, Store } from "./types";

const DAY = 86400000;

// Anchor "today" for the whole demo so the build is reproducible. The app
// still works from the live clock (see automation/time.ts) — this constant
// only seeds historical data relative to a fixed point, the same discipline
// the real health.js uses for its own FIXED fixture epoch (verified: FIXED
// = 2026-02-16T12:00:00.000Z in the real health.js, a different value used
// for a different purpose — ours is a seed anchor, not a test fixture).
export const SEED_ANCHOR = Date.UTC(2026, 9, 13); // 2026-10-13 (a Tuesday)

export const PEOPLE: Person[] = [
  { id: "p-ana", name: "Ana Rodrigues", role: "Eng Manager", reportsTo: "me", cadenceDays: 14 },
  { id: "p-bruno", name: "Bruno Alves", role: "Staff Engineer", reportsTo: "me", cadenceDays: 14 },
  { id: "p-dan", name: "Dan Osei", role: "Director, Ops", reportsTo: "me", cadenceDays: 30 },
  { id: "p-carla", name: "Carla Nunes", role: "Product Lead", reportsTo: "me", cadenceDays: 14 },
  { id: "p-felix", name: "Felix Grant", role: "Sales Lead", reportsTo: "me", cadenceDays: 21 },
  { id: "p-ghost", name: "Priya Shah (departed)", role: "Former PM", reportsTo: "me", archived: true },
];

const SETTINGS: Settings = {
  oneOnOneCadenceDays: 14,
  skipCadenceDefaultDays: 30,
  boardNarrativeReviewDays: 7,
  backupReminderDays: 30,
  staleFindingWindowDays: 180,
};

let seq = 0;
function ev(daysAgo: number, type: string, payload: Record<string, unknown>, atMs?: number): LeadEvent {
  seq += 1;
  const at = atMs ?? SEED_ANCHOR - daysAgo * DAY;
  return { id: "e-" + String(seq).padStart(5, "0"), seq, at, type, payload };
}

// NOTE ON VOCABULARY: types below marked [brief] are named exactly as the
// pt-D brief names them (oneonone.logged, pulse.recorded, etc.) and were
// verified ABSENT from the real events.js registry (92 types, checked
// exhaustively — see AI-SESSION-LOG.md §2). Types marked [real] are the
// literal event-type strings confirmed present in the real registry.
export function seedEvents(): LeadEvent[] {
  seq = 0;
  const events: LeadEvent[] = [
    ev(400, "settings.changed", { key: "oneOnOneCadenceDays", value: 14 }), // [real pattern: settings.changed exists]
    // ---- Ana: cadence drift candidate — she's actually met every ~21d, setting says 14d
    ev(63, "oneonone.logged", { personId: "p-ana", notes: "Roadmap risk on auth migration; Ana owns the spike." }), // [brief]
    ev(42, "oneonone.logged", { personId: "p-ana", notes: "Spike done; migration plan drafted. Ana flagged team bandwidth." }), // [brief]
    ev(63 - 21, "pulse.recorded", { personId: "p-ana", load: 4, mood: 3 }), // [brief]
    ev(21, "oneonone.logged", { personId: "p-ana", notes: "Bandwidth tight — discussed hiring req. Commitment: I follow up with Finance on headcount." }), // [brief]
    ev(21, "commitment.made", { toPersonId: "p-ana", text: "Follow up with Finance on headcount approval", reviewByDaysOut: 10 }), // [brief]
    ev(14, "pulse.recorded", { personId: "p-ana", load: 4, mood: 3 }), // [brief]
    ev(14, "goal.progress", { personId: "p-ana", goal: "Ship auth migration", pct: 70 }), // [brief]
    ev(0, "sl.assessment", { personId: "p-ana", task: "auth migration", d: 3 }), // [brief] SL = situational leadership
    // ---- Bruno: healthy 14d cadence, feedback balance warning
    ev(28, "oneonone.logged", { personId: "p-bruno", notes: "Mentoring juniors well." }),
    ev(14, "oneonone.logged", { personId: "p-bruno", notes: "On track." }),
    ev(10, "feedback.given", { personId: "p-bruno", tone: "critical", topic: "code review turnaround" }), // [brief]
    ev(9, "feedback.given", { personId: "p-bruno", tone: "critical", topic: "meeting punctuality" }), // [brief]
    ev(2, "pulse.recorded", { personId: "p-bruno", load: 3, mood: 4 }),
    // ---- Dan: skip-level overdue (30d setting, last one 61d ago -> R8-style finding)
    ev(61, "oneonone.logged", { personId: "p-dan", notes: "Skip-level: ops headcount plan reviewed.", skip: true }),
    // ---- Carla: duplicate-log accident (same type/person within 60s)
    ev(16, "oneonone.logged", { personId: "p-carla", notes: "Sprint review retro follow-up." }, SEED_ANCHOR - 16 * DAY + 5000),
    ev(16, "oneonone.logged", { personId: "p-carla", notes: "Sprint review retro follow-up (dup accidental re-click)." }, SEED_ANCHOR - 16 * DAY + 32000),
    ev(7, "sprint.review", { team: "Product", sprintId: "s-41", met: 5, missed: 1 }), // [brief]
    ev(7, "sprint.retro.action", { team: "Product", action: "Reduce WIP limit to 3" }), // [brief]
    ev(7, "sprint.started", { team: "Product", sprintId: "s-42", goals: 6 }), // [brief]
    // ---- Felix: event referencing an archived person (stale reference)
    ev(200, "oneonone.logged", { personId: "p-ghost", notes: "1:1 before Priya's departure." }),
    ev(190, "hr.attrition.logged", { personId: "p-ghost", reason: "External offer" }), // [real]
    ev(190, "key.dependency.logged", { personId: "p-ghost", process: "Vendor contract renewals" }), // [brief]
    // ---- Felix sales / crisis thread
    ev(45, "oneonone.logged", { personId: "p-felix", notes: "Pipeline review." }),
    ev(5, "crisis.detected", { type: "Outage", severity: 4, team: "Platform" }), // [brief]
    ev(5, "war.room.opened", { crisisRef: "Outage", team: "Platform" }), // [brief]
    ev(5, "incident.comms.sent", { crisisRef: "Outage", channel: "status page" }), // [brief]
    // ---- Finance / board thread
    ev(95, "fin.unit.logged", { period: "2026-Q2", currency: "USD" }), // [brief] (closest real: fin.kpi.logged)
    ev(35, "fin.forecast.logged", { period: "2026-Q3", revenue: 420000, cost: 310000, margin: 0.26, confidence: 0.6 }), // [real]
    ev(30, "strategy.okr.set", { objective: "Expand EU footprint", period: "2026-Q4" }), // [real]
    ev(8, "exec.kpi.reviewed", { period: "2026-Q3" }), // [real]
    ev(2, "exec.board.meeting", { scheduledInDays: 5 }), // [real]
    // ---- Cold data: something older than 730 days
    ev(760, "note.added", { domain: "legal", text: "Archived note from a prior reorg." }, SEED_ANCHOR - 760 * DAY), // [real]
  ];
  return events.sort((a, b) => a.seq - b.seq);
}

export function freshStore(): Store {
  const events = seedEvents();
  return {
    schemaVersion: 1,
    lineage: "pt-D-demo", // deliberately NOT the real app's "pt"/v5 lineage — this is a standalone demo
    createdAt: SEED_ANCHOR - 400 * DAY,
    idSeq: events.length,
    people: PEOPLE.map((p) => ({ ...p })),
    events,
    settings: { ...SETTINGS },
    audit: [
      { id: "a-00001", at: SEED_ANCHOR - 40 * DAY, action: "export", message: "Data exported to JSON (manual backup)." },
    ],
    suppressed: [
      { key: "R-SKIP:p-ghost", reason: "dismissed", at: SEED_ANCHOR - 150 * DAY, entityAlive: false },
      { key: "R-CADENCE:p-dan", reason: "snoozed", at: SEED_ANCHOR - 3 * DAY, entityAlive: true },
    ],
    maintenanceRanAt: null,
  };
}

export const STORAGE_KEY = "leados-ptd-demo:data";
