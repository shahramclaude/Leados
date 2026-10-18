import { db } from "@/db";
import { leados_people, leados_events, leados_person_snapshots, leados_relationships } from "@/db/schema";
import {
  computePersonProfile,
  buildSuccessionMap,
  computeKeyPersonConcentration,
  identifyHighPotentials,
  type PersonRecord,
  type PersonSnapshotRecord,
  type RelationshipRecord,
} from "@/lib/talentEngine";
import type { PersonEvent } from "@/lib/flightRisk";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [peopleRows, eventRows, snapshotRows, relationshipRows] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events).where(eq(leados_events.domain, "people")),
    db.select().from(leados_person_snapshots),
    db.select().from(leados_relationships),
  ]);

  const roster: PersonRecord[] = peopleRows.map((p) => ({
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

  const today = new Date();
  const profiles = roster.map((p) => computePersonProfile(p, events, snapshots, today));

  const successionMap = buildSuccessionMap(profiles, relationships, roster);
  const keyPersonRisks = computeKeyPersonConcentration(profiles, relationships);
  const highPotentials = identifyHighPotentials(profiles);

  return Response.json({ successionMap, keyPersonRisks, highPotentials });
}
