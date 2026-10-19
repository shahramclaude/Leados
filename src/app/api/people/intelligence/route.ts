// src/app/api/people/intelligence/route.ts
//
// GET /api/people/intelligence — assembles the full PeopleIntelligenceReport
// from the database: person profiles (flight/burnout/performance/potential),
// 9-box placement, succession risk, team chemistry, network anomalies,
// knowledge silo index, and belief-fabric uncertainty flags.

import { db } from "@/db";
import { leadosEvents, oneOnOnes, orgEdges, people } from "@/db/schema";
import { ensureSeedData } from "@/db/seed";
import { buildUncertaintyFlags } from "@/lib/beliefFabric";
import { computeKnowledgeSiloIndex, detectNetworkAnomalies, buildOrgNetworkReport } from "@/lib/orgNetwork";
import {
  buildNineBox,
  buildPersonProfile,
  computeSuccessionRisk,
  computeTeamChemistry,
} from "@/lib/talentEngine";
import type { ConversationSignals } from "@/lib/conversationIntelligence";
import type {
  LeadosEvent,
  LeadosEventType,
  OneOnOneRecord,
  OrgNetworkEdge,
  PersonId,
  PersonProfile,
  PersonRecord,
  PeopleIntelligenceReport,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function toPersonRecord(row: typeof people.$inferSelect): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    team: row.team,
    managerId: row.managerId,
    email: row.email,
    startDate: row.startDate,
    status: (row.status as PersonRecord["status"]) ?? "active",
    skills: row.skills ?? [],
    performanceScore: row.performanceScore,
    promotionReadiness: row.promotionReadiness,
    growthVelocity: row.growthVelocity,
    compensationFlag: row.compensationFlag,
  };
}

function toOneOnOneRecord(row: typeof oneOnOnes.$inferSelect): OneOnOneRecord {
  return {
    id: row.id,
    personId: row.personId,
    managerId: row.managerId,
    date: row.date,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function toLeadosEvent(row: typeof leadosEvents.$inferSelect): LeadosEvent {
  return {
    id: row.id,
    personId: row.personId,
    type: row.type as LeadosEventType,
    psychologicalSafetyIndex: row.psychologicalSafetyIndex,
    payload: row.payload ?? null,
    createdAt: row.createdAt,
  };
}

function toOrgEdge(row: typeof orgEdges.$inferSelect): OrgNetworkEdge {
  return { source: row.sourceId, target: row.targetId, weight: row.weight };
}

export async function GET() {
  try {
    await ensureSeedData();

    const [peopleRows, oneOnOneRows, eventRows, edgeRows] = await Promise.all([
      db.select().from(people),
      db.select().from(oneOnOnes),
      db.select().from(leadosEvents),
      db.select().from(orgEdges),
    ]);

    const peopleRecords: PersonRecord[] = peopleRows.map(toPersonRecord);
    const activePeople = peopleRecords.filter((p) => p.status === "active");
    const oneOnOneRecords: OneOnOneRecord[] = oneOnOneRows.map(toOneOnOneRecord);
    const eventRecords: LeadosEvent[] = eventRows.map(toLeadosEvent);
    const edgeRecords: OrgNetworkEdge[] = edgeRows.map(toOrgEdge);

    const networkReport = buildOrgNetworkReport(activePeople, edgeRecords);
    const centralityByPersonId = new Map<PersonId, number>(
      networkReport.nodes.map((n) => [n.personId, n.centrality])
    );

    const profiles: PersonProfile[] = activePeople.map((person) =>
      buildPersonProfile({
        person,
        events: eventRecords,
        oneOnOnes: oneOnOneRecords,
        centrality: centralityByPersonId.get(person.id) ?? 0,
      })
    );

    const successionRisks = activePeople.map((person) =>
      computeSuccessionRisk(person, activePeople, centralityByPersonId)
    );

    const signalsByPersonId = new Map<PersonId, ConversationSignals[]>(
      profiles.map((p) => [p.id, p.conversationSignals])
    );

    const teamNames = Array.from(new Set(profiles.map((p) => p.team)));
    const teamChemistry = teamNames.map((team) =>
      computeTeamChemistry(
        profiles.filter((p) => p.team === team),
        eventRecords,
        signalsByPersonId,
        edgeRecords
      )
    );

    const nineBox = buildNineBox(profiles);

    // No persisted historical snapshot store exists yet in this schema, so
    // there is no previous OrgNetworkReport to diff against on a cold
    // read — detectNetworkAnomalies is still exercised (returns [] when
    // previousReport is null, which is the documented, intended behavior
    // for a first-ever snapshot) so the wiring is ready once snapshot
    // persistence is added in a future part.
    const networkAnomalies = detectNetworkAnomalies(networkReport, null);

    const knowledgeSiloIndex = computeKnowledgeSiloIndex(activePeople, edgeRecords);

    const evidenceSummaries = activePeople.map((person) => ({
      personId: person.id,
      oneOnOneCount: oneOnOneRecords.filter((o) => o.personId === person.id).length,
      eventCount: eventRecords.filter((e) => e.personId === person.id).length,
    }));
    const uncertaintyFlags = buildUncertaintyFlags(evidenceSummaries);

    // teamHealthScore — UNVERIFIED (original heuristic authored this
    // session): weighted blend of inverse average flight/burnout risk
    // and average team cohesion/psych-safety across all teams.
    const avgFlightRisk = profiles.length > 0 ? profiles.reduce((s, p) => s + p.flightRisk, 0) / profiles.length : 0;
    const avgBurnoutRisk = profiles.length > 0 ? profiles.reduce((s, p) => s + p.burnoutRisk, 0) / profiles.length : 0;
    const avgCohesion =
      teamChemistry.length > 0 ? teamChemistry.reduce((s, t) => s + t.cohesionScore, 0) / teamChemistry.length : 50;
    const avgPsychSafety =
      teamChemistry.length > 0
        ? teamChemistry.reduce((s, t) => s + t.psychologicalSafetyScore, 0) / teamChemistry.length
        : 50;
    const teamHealthScore = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          (1 - avgFlightRisk) * 100 * 0.3 + (1 - avgBurnoutRisk) * 100 * 0.3 + avgCohesion * 0.2 + avgPsychSafety * 0.2
        )
      )
    );

    const report: PeopleIntelligenceReport = {
      teamHealthScore,
      nineBox,
      profiles,
      successionRisks,
      teamChemistry,
      networkAnomalies,
      knowledgeSiloIndex,
      uncertaintyFlags,
      generatedAt: new Date().toISOString(),
    };

    return Response.json(report);
  } catch (error) {
    console.error("GET /api/people/intelligence failed", error);
    return Response.json({ error: "Failed to build people intelligence report" }, { status: 500 });
  }
}
