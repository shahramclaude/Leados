import { db } from "@/db";
import { leados_people, leados_events, leados_person_snapshots } from "@/db/schema";
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

/** POST /api/people/:id/snapshot — compute the current profile and persist a weekly snapshot row. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const [personRow] = await db.select().from(leados_people).where(eq(leados_people.id, personId));
  if (!personRow) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const [eventRows, snapshotRows] = await Promise.all([
    db.select().from(leados_events).where(eq(leados_events.personId, personId)),
    db.select().from(leados_person_snapshots).where(eq(leados_person_snapshots.personId, personId)),
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

  const today = new Date();
  const person = toPersonRecord(personRow);
  const profile = computePersonProfile(person, events, snapshots, today);

  const morale = profile.flightRisk.signal.meanMood !== null ? profile.flightRisk.signal.meanMood * 10 : 60;
  const healthScore = Math.round(
    profile.performanceScore * 0.35 +
      profile.engagementScore * 0.25 +
      Math.max(0, 100 - profile.flightRisk.score) * 0.25 +
      Math.max(0, 100 - profile.burnoutIndex) * 0.15
  );

  const [created] = await db
    .insert(leados_person_snapshots)
    .values({
      personId,
      healthScore,
      flightRisk: profile.flightRisk.score,
      performanceScore: profile.performanceScore,
      burnoutIndex: profile.burnoutIndex,
      morale: Math.round(morale),
      data: {
        okrScore: person.okrScore ?? profile.performanceScore,
        engagementScore: profile.engagementScore,
        growthVelocity: profile.growthVelocity,
        promotionReadiness: profile.promotionReadiness,
      },
    })
    .returning();

  return Response.json(created, { status: 201 });
}
