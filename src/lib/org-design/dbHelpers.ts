// Shared DB-backed helpers that glue the pure engines in this folder to the
// Drizzle schema. Keeping this thin layer separate from the pure math makes
// the math unit-testable without a database (see scripts/verify.ts).

import { db } from "@/db";
import {
  humanImpactEntries,
  orgEdges,
  orgPeople,
  orgUnits,
  simulationRuns,
  structuralMoves,
  supportPlans,
  twinModelParameters,
} from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { buildHumanImpactLedger, summarizeHumanImpact, assertHumanImpactComplete, type PersonLike, type SupportPlanLike } from "./humanImpact";
import { currentModelCard } from "./modelCard";
import {
  DEFAULT_TWIN_PARAMS,
  applyStructuralMove,
  predictDeliveryImpact,
  predictNetworkImpact,
  type GraphState,
  type MovePayload,
  type TwinParams,
  type TwinUnit,
} from "./twinEngine";
import type { DisruptionClass } from "./types";

export async function loadGraph(): Promise<GraphState> {
  const units = await db.select().from(orgUnits);
  const edges = await db.select().from(orgEdges);
  return {
    units: units.map(
      (u): TwinUnit => ({
        id: u.id,
        name: u.name,
        parentId: u.parentId ?? null,
        headcount: u.headcount,
        cycleTimeDays: u.cycleTimeDays,
        capacityUnits: u.capacityUnits,
      }),
    ),
    edges: edges.map((e) => ({ fromUnitId: e.fromUnitId, toUnitId: e.toUnitId, weight: e.weight })),
  };
}

export async function loadTwinParams(): Promise<{ version: number; params: TwinParams }> {
  const [latest] = await db.select().from(twinModelParameters).orderBy(desc(twinModelParameters.version)).limit(1);
  if (!latest) return { version: 0, params: DEFAULT_TWIN_PARAMS };
  return { version: latest.version, params: latest.params as TwinParams };
}

/** Unit ids referenced directly in the move request (before synthetic split ids are minted). */
export function originalAffectedUnitIds(move: MovePayload): number[] {
  switch (move.type) {
    case "merge":
      return move.unitIds;
    case "split":
      return [move.unitId];
    case "reporting_line_change":
      return [move.unitId, ...(move.newParentId != null ? [move.newParentId] : [])];
    case "centralize":
      return move.unitIds;
    case "decentralize":
      return [move.hubUnitId];
  }
}

export function primaryUnitIdFor(move: MovePayload): number | null {
  switch (move.type) {
    case "merge":
      return move.unitIds[0] ?? null;
    case "split":
      return move.unitId;
    case "reporting_line_change":
      return null;
    case "centralize":
      return move.hubUnitId;
    case "decentralize":
      return move.hubUnitId;
  }
}

export async function runStructuralSimulation(args: { move: MovePayload; label: string; createdBy: string; description: string }) {
  const graph = await loadGraph();
  const { version: paramsVersion, params } = await loadTwinParams();
  const { graph: afterGraph, affectedUnitIds: graphAffectedIds } = applyStructuralMove(graph, args.move);

  const humanAffectedUnitIds = originalAffectedUnitIds(args.move);
  const primaryUnitId = primaryUnitIdFor(args.move);

  const affectedTwinUnits = afterGraph.units.filter((u) => graphAffectedIds.includes(u.id));
  const deliveryImpact = predictDeliveryImpact(params, args.move.type, affectedTwinUnits.length ? affectedTwinUnits : graph.units);

  const peopleRows = await db.select().from(orgPeople);
  const graphPeople = peopleRows.map((p) => ({ id: p.id, name: p.name, unitId: p.unitId, uniqueSkill: p.uniqueSkill }));
  const networkImpact = predictNetworkImpact(
    params,
    { units: graph.units, edges: graph.edges },
    { units: afterGraph.units, edges: afterGraph.edges },
    graphPeople,
    humanAffectedUnitIds,
  );

  const supportPlanRows = await db.select().from(supportPlans);
  const plans: SupportPlanLike[] = supportPlanRows.map((p) => ({ id: p.id, name: p.name, appliesTo: inferAppliesTo(p.name) }));

  const personLikes: PersonLike[] = peopleRows.map((p) => ({ id: p.id, name: p.name, unitId: p.unitId, isManager: p.isManager, tenureMonths: p.tenureMonths }));
  const ledgerEntries = buildHumanImpactLedger(args.move.type, humanAffectedUnitIds, primaryUnitId, personLikes, plans);
  const humanImpactSummary = summarizeHumanImpact(ledgerEntries);

  const peopleAffectedCount = peopleRows.filter((p) => humanAffectedUnitIds.includes(p.unitId)).length;
  assertHumanImpactComplete(peopleAffectedCount, humanImpactSummary); // throws if incomplete — never bypassed

  const modelCard = await currentModelCard();

  const [moveRow] = await db
    .insert(structuralMoves)
    .values({ type: args.move.type, description: args.description, payload: args.move, createdBy: args.createdBy })
    .returning();

  const [runRow] = await db
    .insert(simulationRuns)
    .values({
      kind: "structural_move",
      moveId: moveRow.id,
      label: args.label,
      status: "completed",
      deliveryImpact,
      networkImpact,
      humanImpactSummary,
      modelParamsVersion: paramsVersion,
      modelCard,
    })
    .returning();

  if (ledgerEntries.length > 0) {
    await db.insert(humanImpactEntries).values(
      ledgerEntries.map((e) => ({
        simulationRunId: runRow.id,
        personId: e.personId,
        unitId: e.unitId,
        roleChangeType: e.roleChangeType,
        disruptionClass: e.disruptionClass,
        supportPlanId: e.supportPlanId,
        rationale: e.rationale,
      })),
    );
  }

  return { move: moveRow, run: runRow, deliveryImpact, networkImpact, humanImpactSummary, ledgerEntries, modelCard };
}

function inferAppliesTo(planName: string): DisruptionClass[] {
  if (planName.includes("Redundancy")) return ["severe", "high"];
  if (planName.includes("Manager")) return ["moderate", "high"];
  if (planName.includes("Relocation")) return ["moderate", "high"];
  return ["low", "moderate"];
}

export async function getSimulationRun(id: number) {
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id));
  if (!run) return null;
  const entries = await db.select().from(humanImpactEntries).where(eq(humanImpactEntries.simulationRunId, id));
  const peopleRows = entries.length ? await db.select().from(orgPeople).where(inArray(orgPeople.id, entries.map((e) => e.personId))) : [];
  const peopleById = new Map(peopleRows.map((p) => [p.id, p]));
  return {
    run,
    entries: entries.map((e) => ({ ...e, personName: peopleById.get(e.personId)?.name ?? `Person #${e.personId}` })),
  };
}
