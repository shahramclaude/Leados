import { db } from "@/db";
import { leados_people, leados_events, leados_person_snapshots, leados_relationships } from "@/db/schema";
import { computePersonProfile, type PersonRecord, type PersonSnapshotRecord } from "@/lib/talentEngine";
import type { PersonEvent } from "@/lib/flightRisk";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function toPersonRecord(row: typeof leados_people.$inferSelect): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    team: row.team,
    managerId: row.managerId,
    level: row.level,
    tenureStart: row.tenureStart,
    lastPromotedAt: row.lastPromotedAt,
    compensationBand: row.compensationBand,
    skills: row.skills,
    okrScore: row.okrScore,
    archived: row.archived,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("archived") === "true";

  const [peopleRows, eventRows, snapshotRows] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events).where(eq(leados_events.domain, "people")),
    db.select().from(leados_person_snapshots),
  ]);

  const today = new Date();
  const events: PersonEvent[] = eventRows.map((e) => ({
    id: e.id,
    type: e.type,
    domain: e.domain,
    personId: e.personId,
    data: e.data,
    occurredAt: e.occurredAt,
  }));
  const snapshots: PersonSnapshotRecord[] = snapshotRows.map((s) => ({
    id: s.id,
    personId: s.personId,
    snapshotAt: s.snapshotAt,
    healthScore: s.healthScore,
    flightRisk: s.flightRisk,
    performanceScore: s.performanceScore,
    burnoutIndex: s.burnoutIndex,
    morale: s.morale,
    data: s.data,
  }));

  const people = (includeArchived ? peopleRows : peopleRows.filter((p) => !p.archived)).map((row) => {
    const person = toPersonRecord(row);
    const profile = computePersonProfile(person, events, snapshots, today);
    return { ...row, profile };
  });

  return Response.json(people);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, role, team, managerId, level, tenureStart, compensationBand, skills, okrScore } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(leados_people)
    .values({
      name: name.trim(),
      role: typeof role === "string" ? role : "",
      team: typeof team === "string" ? team : "",
      managerId: typeof managerId === "number" ? managerId : null,
      level: typeof level === "string" ? level : "",
      tenureStart: typeof tenureStart === "string" ? tenureStart : new Date().toISOString().slice(0, 10),
      compensationBand: typeof compensationBand === "string" ? compensationBand : "",
      skills: Array.isArray(skills) ? skills : [],
      okrScore: typeof okrScore === "number" ? okrScore : null,
    })
    .returning();

  // Seed an initial relationship edge if a manager was specified.
  if (created.managerId) {
    await db.insert(leados_relationships).values({
      fromId: created.id,
      toId: created.managerId,
      type: "reports_to",
      strength: 0.9,
    });
  }

  return Response.json(created, { status: 201 });
}
