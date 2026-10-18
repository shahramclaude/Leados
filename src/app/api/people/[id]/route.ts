import { db } from "@/db";
import { leados_people, leados_events, leados_person_snapshots, leados_relationships } from "@/db/schema";
import {
  computePersonProfile,
  buildSuccessionMap,
  computeKeyPersonConcentration,
  type PersonRecord,
  type PersonSnapshotRecord,
  type RelationshipRecord,
} from "@/lib/talentEngine";
import { analyzeOrgNetwork } from "@/lib/orgNetwork";
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

async function loadContext() {
  const [peopleRows, eventRows, snapshotRows, relationshipRows] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events).where(eq(leados_events.domain, "people")),
    db.select().from(leados_person_snapshots),
    db.select().from(leados_relationships),
  ]);

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
  const relationships: RelationshipRecord[] = relationshipRows.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    strength: r.strength,
  }));

  return { peopleRows, events, snapshots, relationships };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const { peopleRows, events, snapshots, relationships } = await loadContext();
  const personRow = peopleRows.find((p) => p.id === personId);
  if (!personRow) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const today = new Date();
  const roster = peopleRows.map(toPersonRecord);
  const profiles = roster.map((p) => computePersonProfile(p, events, snapshots, today));
  const profile = profiles.find((p) => p.id === personId)!;

  const personSnapshots = snapshots
    .filter((s) => s.personId === personId)
    .sort((a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime())
    .slice(-12);

  const keyPersonRisks = computeKeyPersonConcentration(profiles, relationships);
  const keyPersonEntry = keyPersonRisks.find((k) => k.personId === personId) ?? null;

  const successionMap = buildSuccessionMap(profiles, relationships, roster);
  const successionEntries = successionMap.filter(
    (s) => s.incumbent?.id === personId || s.readyNow.includes(personId) || s.readyIn1Year.includes(personId) || s.readyIn2Years.includes(personId)
  );

  const network = analyzeOrgNetwork(roster, relationships, events);

  const oneOnOnes = events
    .filter((e) => e.personId === personId && e.type === "oneonone.logged")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 10)
    .map((e) => ({ occurredAt: e.occurredAt, notes: (e.data as Record<string, unknown>).notes ?? "" }));

  const suggestedActions = profile.suggestedActions.slice(0, 3);

  return Response.json({
    person: personRow,
    profile,
    snapshots: personSnapshots,
    suggestedActions,
    keyPersonRisk: keyPersonEntry,
    successionEntries,
    networkStanding: {
      isInfluencer: network.influencers.some((i) => i.id === personId),
      isBroker: network.brokers.some((b) => b.id === personId),
      isIsolated: network.isolated.some((i) => i.id === personId),
      influenceScore: network.influencers.find((i) => i.id === personId)?.score ?? null,
      brokerScore: network.brokers.find((b) => b.id === personId)?.score ?? null,
    },
    oneOnOneHistory: oneOnOnes,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  for (const key of [
    "name",
    "role",
    "team",
    "managerId",
    "level",
    "tenureStart",
    "lastPromotedAt",
    "compensationBand",
    "skills",
    "okrScore",
    "archived",
  ]) {
    if (key in (body ?? {})) allowed[key] = body[key];
  }

  if (Object.keys(allowed).length === 0) {
    return Response.json({ error: "no updatable fields provided" }, { status: 400 });
  }

  const [updated] = await db.update(leados_people).set(allowed).where(eq(leados_people.id, personId)).returning();
  if (!updated) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const [archived] = await db
    .update(leados_people)
    .set({ archived: true })
    .where(eq(leados_people.id, personId))
    .returning();
  if (!archived) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(archived);
}
