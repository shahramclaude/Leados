import { db } from "@/db";
import { leados_people, leados_events, leados_relationships } from "@/db/schema";
import { analyzeOrgNetwork } from "@/lib/orgNetwork";
import { buildNetworkGraph, pageRank } from "@/lib/orgNetwork";
import type { PersonRecord, RelationshipRecord } from "@/lib/talentEngine";
import type { PersonEvent } from "@/lib/flightRisk";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [peopleRows, eventRows, relationshipRows] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events).where(eq(leados_events.domain, "people")),
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

  const relationships: RelationshipRecord[] = relationshipRows.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    strength: r.strength,
  }));

  const report = analyzeOrgNetwork(roster, relationships, events);
  const graph = buildNetworkGraph(
    roster.filter((p) => !p.archived),
    relationships,
    events
  );
  const ranks = pageRank(graph);

  const nodes = graph.nodes.map((id) => {
    const person = roster.find((p) => p.id === id)!;
    return { id, name: person.name, role: person.role, team: person.team, pageRank: ranks[id] ?? 0 };
  });

  return Response.json({ report, graph: { nodes, edges: graph.edges } });
}
