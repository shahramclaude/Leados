// src/lib/orchestrator.ts
//
// People Intelligence orchestrator: loads the live roster/event/1:1/
// relationship state from Postgres, seeds a demo dataset on first run, and
// drives the canonical engine in src/lib/peopleIntelligence.ts. This is the
// pipeline referenced by the task brief — it calls runPeopleIntelligence()
// (which in turn calls fastOrgDynamics() from orgODE.ts, NOT the expensive
// RK4 simulation) on every pass.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events as eventsTable, oneOnOnes as oneOnOnesTable, people as peopleTable, relationships as relationshipsTable } from "@/db/schema";
import {
  runPeopleIntelligence,
  type LeadosEvent,
  type OneOnOne,
  type Person,
  type PeopleIntelligenceReport,
} from "@/lib/peopleIntelligence";
import type { RelationshipRecord } from "@/lib/talentEngine";

const SEED_PEOPLE = [
  { name: "Maya Chen", role: "VP Engineering", team: "Engineering", level: "VP", compensationBand: "L7", skills: ["systems design", "mentoring", "platform strategy"], okrScore: 82, tenureOffsetDays: 920, promotionOffsetDays: 880 },
  { name: "Diego Alvarez", role: "Staff Engineer", team: "Engineering", level: "Staff", compensationBand: "L6", skills: ["distributed systems", "on-call", "mentoring", "rust"], okrScore: 88, tenureOffsetDays: 760, promotionOffsetDays: 760 },
  { name: "Priya Narayanan", role: "Head of Product", team: "Product", level: "Director", compensationBand: "L7", skills: ["roadmap", "pricing", "research"], okrScore: 74, tenureOffsetDays: 540, promotionOffsetDays: 540 },
  { name: "Jordan Lee", role: "Sales Director", team: "Revenue", level: "Director", compensationBand: "L6", skills: ["enterprise sales", "forecasting"], okrScore: 69, tenureOffsetDays: 430, promotionOffsetDays: 90 },
  { name: "Ola Fagbemi", role: "Customer Success Lead", team: "Customer", level: "Lead", compensationBand: "L5", skills: ["onboarding", "renewals"], okrScore: 90, tenureOffsetDays: 300, promotionOffsetDays: 300 },
  { name: "Sam Whitfield", role: "Finance Manager", team: "Finance", level: "Manager", compensationBand: "L5", skills: ["fp&a", "budgeting"], okrScore: 71, tenureOffsetDays: 650, promotionOffsetDays: 650 },
];

function daysAgo(now: number, days: number): Date {
  return new Date(now - days * 86_400_000);
}

async function ensureSeeded(): Promise<void> {
  const [{ count: peopleCount }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(peopleTable)) as { count: number }[];

  if (peopleCount > 0) return;

  const now = Date.now();
  const insertedPeople = await db
    .insert(peopleTable)
    .values(
      SEED_PEOPLE.map((p) => ({
        name: p.name,
        role: p.role,
        team: p.team,
        level: p.level,
        compensationBand: p.compensationBand,
        skills: p.skills,
        okrScore: p.okrScore,
        tenureStart: daysAgo(now, p.tenureOffsetDays),
        lastPromotedAt: daysAgo(now, p.promotionOffsetDays),
        managerId: null as number | null,
      }))
    )
    .returning();

  // Maya manages everyone else, for a non-trivial org graph.
  const manager = insertedPeople.find((p) => p.name === "Maya Chen");
  if (manager) {
    const others = insertedPeople.filter((p) => p.id !== manager.id);
    for (const o of others) {
      await db.update(peopleTable).set({ managerId: manager.id }).where(eq(peopleTable.id, o.id));
    }
    await db.insert(relationshipsTable).values(
      others.map((o) => ({ fromId: o.id, toId: manager.id, type: "reports_to", strength: 0.8 }))
    );
    // A couple of collaboration edges so the network isn't a pure star.
    if (others.length >= 2) {
      await db.insert(relationshipsTable).values([
        { fromId: others[0].id, toId: others[1].id, type: "collaborates", strength: 0.6 },
      ]);
    }
  }

  // Synthetic event history per person — enough signal diversity to exercise
  // every branch of flightRisk.ts / performance.ts / peopleIntelligence.ts.
  const eventRows: (typeof eventsTable.$inferInsert)[] = [];
  const oneOnOneRows: (typeof oneOnOnesTable.$inferInsert)[] = [];

  insertedPeople.forEach((p, idx) => {
    const profile = SEED_PEOPLE[idx];
    const moodBase = [4.2, 3.8, 6.5, 5.5, 7.8, 7.2][idx % 6];
    const cadenceDays = [26, 34, 10, 12, 7, 9][idx % 6];
    const conflicts = [2, 3, 0, 1, 0, 0][idx % 6];

    // Pulses, roughly weekly over the last 60 days.
    for (let w = 0; w < 9; w++) {
      eventRows.push({
        type: "pulse.mood.logged",
        domain: "people",
        personId: p.id,
        title: "Pulse check",
        description: "",
        data: { mood: Math.max(1, Math.min(10, moodBase + (Math.random() - 0.5) * 1.5 - w * 0.08)), load: 5 + (idx % 3) * 1.5 },
        occurredAt: daysAgo(now, w * 7 + 2),
      });
    }

    // 1:1s — cadence varies per person, feeding both events + the oneOnOnes table.
    const oneOnOneCount = Math.max(1, Math.floor(90 / cadenceDays));
    for (let i = 0; i < oneOnOneCount; i++) {
      const occurredAt = daysAgo(now, i * cadenceDays + 3);
      const substantive = idx % 2 === 0 ? i % 2 === 0 : true;
      eventRows.push({
        type: "oneonone.logged",
        domain: "people",
        personId: p.id,
        title: "1:1",
        description: "",
        data: {},
        occurredAt,
      });
      oneOnOneRows.push({
        personId: p.id,
        occurredAt,
        notes: substantive
          ? `Discussed current priorities, blockers on the roadmap, and career growth goals for ${p.name}. Agreed on next steps and follow-ups.`
          : "Quick sync, no major updates.",
        actionItems: i === 0 ? [{ id: `${p.id}-ai-${i}`, title: "Share updated growth plan draft", resolved: false }] : [],
      });
    }

    // Action items logged/resolved as their own events (QualityScorer reads these).
    if (oneOnOneCount > 0) {
      eventRows.push({
        type: "action_item.logged",
        domain: "people",
        personId: p.id,
        title: "Action item",
        description: "",
        data: { title: "Share updated growth plan draft" },
        occurredAt: daysAgo(now, 2),
      });
      if (idx % 2 === 0) {
        eventRows.push({
          type: "action_item.resolved",
          domain: "people",
          personId: p.id,
          title: "Action item resolved",
          description: "",
          data: { title: "Finalize Q2 OKRs" },
          occurredAt: daysAgo(now, 20),
        });
      }
    }

    for (let c = 0; c < conflicts; c++) {
      eventRows.push({
        type: "conflict.logged",
        domain: "people",
        personId: p.id,
        title: "Conflict logged",
        description: "",
        data: {},
        occurredAt: daysAgo(now, 10 + c * 15),
      });
    }

    const feedbackPositive = idx % 3 !== 1;
    for (let f = 0; f < 4; f++) {
      eventRows.push({
        type: "feedback.logged",
        domain: "people",
        personId: p.id,
        title: "Feedback",
        description: "",
        data: { polarity: feedbackPositive || f < 2 ? "positive" : "negative" },
        occurredAt: daysAgo(now, f * 20 + 5),
      });
    }

    if (idx % 2 === 0) {
      eventRows.push({
        type: "growth_plan.opened",
        domain: "people",
        personId: p.id,
        title: "Growth plan opened",
        description: "",
        data: {},
        occurredAt: daysAgo(now, 120),
      });
    }

    if (idx === 1) {
      // Diego: high performer, overdue promotion -> promotion stagnation driver.
      for (let a = 0; a < 10; a++) {
        eventRows.push({ type: "activity.after_hours", domain: "people", personId: p.id, title: "After hours", description: "", data: {}, occurredAt: daysAgo(now, a * 2) });
      }
    }

    eventRows.push({
      type: "milestone.delivered",
      domain: "people",
      personId: p.id,
      title: "Milestone delivered",
      description: "",
      data: {},
      occurredAt: daysAgo(now, 15),
    });
    eventRows.push({
      type: "skill.acquired",
      domain: "people",
      personId: p.id,
      title: "Skill acquired",
      description: "",
      data: {},
      occurredAt: daysAgo(now, 45),
    });
  });

  if (eventRows.length) await db.insert(eventsTable).values(eventRows);
  if (oneOnOneRows.length) await db.insert(oneOnOnesTable).values(oneOnOneRows);
}

async function loadState() {
  const [peopleRows, eventRows, oneOnOneRows, relationshipRows] = await Promise.all([
    db.select().from(peopleTable).orderBy(peopleTable.name),
    db.select().from(eventsTable).orderBy(desc(eventsTable.occurredAt)),
    db.select().from(oneOnOnesTable).orderBy(desc(oneOnOnesTable.occurredAt)),
    db.select().from(relationshipsTable),
  ]);

  const people: Person[] = peopleRows.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    team: p.team,
    managerId: p.managerId,
    level: p.level,
    tenureStart: p.tenureStart,
    lastPromotedAt: p.lastPromotedAt,
    compensationBand: p.compensationBand,
    skills: p.skills,
    okrScore: p.okrScore,
    archived: p.archived,
  }));

  const events: LeadosEvent[] = eventRows.map((e) => ({
    id: e.id,
    type: e.type,
    domain: e.domain,
    personId: e.personId,
    data: e.data,
    occurredAt: e.occurredAt,
  }));

  const oneOnOnes: OneOnOne[] = oneOnOneRows.map((o) => ({
    id: o.id,
    personId: o.personId,
    occurredAt: o.occurredAt,
    notes: o.notes,
    actionItems: o.actionItems,
  }));

  const relationships: RelationshipRecord[] = relationshipRows.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    strength: r.strength,
  }));

  return { people, events, oneOnOnes, relationships };
}

/** Runs the full people-intelligence pipeline against live DB state. */
export async function runOrchestrator(): Promise<PeopleIntelligenceReport> {
  await ensureSeeded();
  const { people, events, oneOnOnes, relationships } = await loadState();
  const now = new Date();
  // Canonical call site: runPeopleIntelligence() internally invokes
  // fastOrgDynamics() from orgODE.ts — the full RK4 simulation
  // (orgODE.orgODE.integrate) is intentionally never called here.
  return runPeopleIntelligence(people, events, oneOnOnes, now, relationships);
}

export async function getPersonContext(personId: number) {
  await ensureSeeded();
  const { people, events, oneOnOnes, relationships } = await loadState();
  const person = people.find((p) => p.id === personId) ?? null;
  return { person, people, events, oneOnOnes, relationships };
}

export async function recentEventsForPerson(personId: number, limit = 5) {
  return db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.personId, personId)))
    .orderBy(desc(eventsTable.occurredAt))
    .limit(limit);
}
