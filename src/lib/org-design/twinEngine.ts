// Structural-move twin engine (Part 06 extension).
//
// Pure, deterministic functions: given the org graph and a structural move,
// predict delivery impact (capacity/cycle-time, Part 28 lineage) and network
// impact (Part 31 lineage). All outputs are Explain<T> — value + interval +
// confidence + assumptions — never a bare number. Error margins are declared
// in the model card, not invented per-call.

import { cohesionIndex, findChokePoints, busFactor, type GraphEdge, type GraphPerson, type GraphUnit } from "./network";
import { explainNumber, type DeliveryImpact, type NetworkImpact, type StructuralMoveType } from "./types";

export type TwinUnit = GraphUnit & {
  parentId: number | null;
  headcount: number;
  cycleTimeDays: number;
  capacityUnits: number;
};

export type TwinParams = {
  capacityCoefficients: Record<StructuralMoveType, number>;
  cycleTimeCoefficients: Record<StructuralMoveType, number>;
  cohesionErrorMargin: number;
  capacityErrorFraction: number;
  cycleTimeErrorFraction: number;
};

export const DEFAULT_TWIN_PARAMS: TwinParams = {
  capacityCoefficients: {
    merge: -3.2, // short-run capacity dip from integration overhead
    split: 2.4, // short-run capacity gain from parallelism
    reporting_line_change: -1.1,
    centralize: -2.0,
    decentralize: 1.6,
  },
  cycleTimeCoefficients: {
    merge: 2.6, // days slower during integration
    split: -1.8, // faster, smaller units
    reporting_line_change: 0.8,
    centralize: 1.4,
    decentralize: -1.2,
  },
  cohesionErrorMargin: 0.15,
  capacityErrorFraction: 0.35,
  cycleTimeErrorFraction: 0.4,
};

export type MovePayload =
  | { type: "merge"; unitIds: number[] }
  | { type: "split"; unitId: number; intoCount: number }
  | { type: "reporting_line_change"; unitId: number; newParentId: number | null }
  | { type: "centralize"; unitIds: number[]; hubUnitId: number }
  | { type: "decentralize"; hubUnitId: number };

export type GraphState = {
  units: TwinUnit[];
  edges: GraphEdge[];
};

/** Applies a structural move to a graph snapshot, returning the new graph and affected unit ids. */
export function applyStructuralMove(graph: GraphState, move: MovePayload): { graph: GraphState; affectedUnitIds: number[] } {
  const units = graph.units.map((u) => ({ ...u }));
  let edges = graph.edges.map((e) => ({ ...e }));

  switch (move.type) {
    case "merge": {
      const [targetId, ...rest] = move.unitIds;
      const target = units.find((u) => u.id === targetId);
      if (!target) return { graph, affectedUnitIds: [] };
      for (const id of rest) {
        const u = units.find((x) => x.id === id);
        if (!u) continue;
        target.headcount += u.headcount;
        target.capacityUnits += u.capacityUnits;
        target.cycleTimeDays = (target.cycleTimeDays + u.cycleTimeDays) / 2;
      }
      const removedIds = new Set(rest);
      edges = edges
        .filter((e) => !(removedIds.has(e.fromUnitId) && removedIds.has(e.toUnitId)))
        .map((e) => ({
          ...e,
          fromUnitId: removedIds.has(e.fromUnitId) ? targetId : e.fromUnitId,
          toUnitId: removedIds.has(e.toUnitId) ? targetId : e.toUnitId,
        }))
        .filter((e) => e.fromUnitId !== e.toUnitId);
      const remainingUnits = units.filter((u) => !removedIds.has(u.id));
      return { graph: { units: remainingUnits, edges }, affectedUnitIds: move.unitIds };
    }
    case "split": {
      const source = units.find((u) => u.id === move.unitId);
      if (!source) return { graph, affectedUnitIds: [] };
      const newUnits: TwinUnit[] = [];
      const newIds: number[] = [];
      for (let i = 0; i < move.intoCount; i++) {
        const newId = source.id * 1000 + i + 1;
        newIds.push(newId);
        newUnits.push({
          ...source,
          id: newId,
          name: `${source.name} (split ${i + 1})`,
          headcount: Math.round(source.headcount / move.intoCount),
          capacityUnits: source.capacityUnits / move.intoCount,
        });
      }
      const remainingUnits = units.filter((u) => u.id !== source.id).concat(newUnits);
      const splitEdges = edges
        .filter((e) => e.fromUnitId === source.id || e.toUnitId === source.id)
        .flatMap((e) =>
          newIds.map((nid) => ({
            fromUnitId: e.fromUnitId === source.id ? nid : e.fromUnitId,
            toUnitId: e.toUnitId === source.id ? nid : e.toUnitId,
            weight: e.weight / move.intoCount,
          })),
        );
      const untouchedEdges = edges.filter((e) => e.fromUnitId !== source.id && e.toUnitId !== source.id);
      return { graph: { units: remainingUnits, edges: [...untouchedEdges, ...splitEdges] }, affectedUnitIds: [source.id, ...newIds] };
    }
    case "reporting_line_change": {
      const unit = units.find((u) => u.id === move.unitId);
      if (!unit) return { graph, affectedUnitIds: [] };
      const oldParentId = unit.parentId;
      unit.parentId = move.newParentId;
      let nextEdges = edges.map((e) => {
        if (oldParentId != null && ((e.fromUnitId === unit.id && e.toUnitId === oldParentId) || (e.toUnitId === unit.id && e.fromUnitId === oldParentId))) {
          return { ...e, weight: Math.max(0.2, e.weight * 0.4) };
        }
        return e;
      });
      if (move.newParentId != null) {
        const exists = nextEdges.find(
          (e) => (e.fromUnitId === unit.id && e.toUnitId === move.newParentId) || (e.toUnitId === unit.id && e.fromUnitId === move.newParentId),
        );
        if (exists) {
          exists.weight += 1.5;
        } else {
          nextEdges = [...nextEdges, { fromUnitId: unit.id, toUnitId: move.newParentId, weight: 1.5 }];
        }
      }
      const affected = [unit.id, oldParentId, move.newParentId].filter((x): x is number => x != null);
      return { graph: { units, edges: nextEdges }, affectedUnitIds: affected };
    }
    case "centralize": {
      const hub = units.find((u) => u.id === move.hubUnitId);
      if (!hub) return { graph, affectedUnitIds: [] };
      const peers = new Set(move.unitIds.filter((id) => id !== move.hubUnitId));
      let nextEdges = edges.filter((e) => !(peers.has(e.fromUnitId) && peers.has(e.toUnitId)));
      for (const peerId of peers) {
        const peerEdges = edges.filter((e) => (e.fromUnitId === peerId && peers.has(e.toUnitId)) || (e.toUnitId === peerId && peers.has(e.fromUnitId)));
        const weightToHub = 1 + peerEdges.reduce((s, e) => s + e.weight, 0) * 0.5;
        const existing = nextEdges.find((e) => (e.fromUnitId === peerId && e.toUnitId === hub.id) || (e.toUnitId === peerId && e.fromUnitId === hub.id));
        if (existing) existing.weight += weightToHub;
        else nextEdges.push({ fromUnitId: peerId, toUnitId: hub.id, weight: weightToHub });
      }
      return { graph: { units, edges: nextEdges }, affectedUnitIds: [...peers, hub.id] };
    }
    case "decentralize": {
      const hub = units.find((u) => u.id === move.hubUnitId);
      if (!hub) return { graph, affectedUnitIds: [] };
      const hubEdges = edges.filter((e) => e.fromUnitId === hub.id || e.toUnitId === hub.id);
      const peers = Array.from(new Set(hubEdges.map((e) => (e.fromUnitId === hub.id ? e.toUnitId : e.fromUnitId))));
      let nextEdges = edges.map((e) => (e.fromUnitId === hub.id || e.toUnitId === hub.id ? { ...e, weight: Math.max(0.2, e.weight * 0.3) } : e));
      for (let i = 0; i < peers.length; i++) {
        for (let j = i + 1; j < peers.length; j++) {
          const a = peers[i];
          const b = peers[j];
          const existing = nextEdges.find((e) => (e.fromUnitId === a && e.toUnitId === b) || (e.fromUnitId === b && e.toUnitId === a));
          if (existing) existing.weight += 0.8;
          else nextEdges.push({ fromUnitId: a, toUnitId: b, weight: 0.8 });
        }
      }
      return { graph: { units, edges: nextEdges }, affectedUnitIds: [hub.id, ...peers] };
    }
  }
}

export function predictDeliveryImpact(params: TwinParams, type: StructuralMoveType, affectedUnits: TwinUnit[]): DeliveryImpact {
  const totalHeadcount = affectedUnits.reduce((s, u) => s + u.headcount, 0);
  const avgCycleTime = affectedUnits.length ? affectedUnits.reduce((s, u) => s + u.cycleTimeDays, 0) / affectedUnits.length : 10;

  const capacityValue = params.capacityCoefficients[type] * Math.log2(1 + totalHeadcount / 10);
  const cycleTimeValue = params.cycleTimeCoefficients[type] * (avgCycleTime / 10);

  const capacityHalfWidth = Math.max(0.5, Math.abs(capacityValue) * params.capacityErrorFraction);
  const cycleHalfWidth = Math.max(0.3, Math.abs(cycleTimeValue) * params.cycleTimeErrorFraction);

  return {
    capacityChangePct: explainNumber({
      value: round2(capacityValue),
      low: round2(capacityValue - capacityHalfWidth),
      high: round2(capacityValue + capacityHalfWidth),
      confidence: 0.55,
      assumptions: [
        `Total headcount affected: ${totalHeadcount}`,
        "Logarithmic scaling assumes diminishing marginal disruption per additional person.",
        "Calibrated on a small, partly synthetic seed set — see model card.",
      ],
      rationale: `${type} moves historically shift short-run capacity by ${params.capacityCoefficients[type]} pct-points per log2-unit of headcount affected.`,
      method: "twin-engine-v1:capacity",
    }),
    cycleTimeChangeDays: explainNumber({
      value: round2(cycleTimeValue),
      low: round2(cycleTimeValue - cycleHalfWidth),
      high: round2(cycleTimeValue + cycleHalfWidth),
      confidence: 0.5,
      assumptions: [
        `Average pre-move cycle time of affected units: ${avgCycleTime.toFixed(1)} days`,
        "Assumes no parallel mitigation (e.g. temporary dual-running) is applied.",
      ],
      rationale: `${type} moves historically shift cycle time proportionally to existing cycle-time baseline.`,
      method: "twin-engine-v1:cycle-time",
    }),
  };
}

export function predictNetworkImpact(
  params: TwinParams,
  before: { units: GraphUnit[]; edges: GraphEdge[] },
  after: { units: GraphUnit[]; edges: GraphEdge[] },
  people: GraphPerson[],
  affectedUnitIds: number[],
): NetworkImpact {
  const cohesionBefore = cohesionIndex(before.units, before.edges);
  const cohesionAfter = cohesionIndex(after.units, after.edges);
  const delta = cohesionAfter - cohesionBefore;

  const chokePoints = findChokePoints(after.units, after.edges);
  const bf = busFactor(people, affectedUnitIds);

  return {
    cohesion: explainNumber({
      value: round3(delta),
      low: round3(delta - params.cohesionErrorMargin),
      high: round3(delta + params.cohesionErrorMargin),
      confidence: 0.5,
      assumptions: [
        "Cohesion is computed only from declared collaboration edges — informal networks are invisible to the twin.",
        `Graph size before/after: ${before.units.length}/${after.units.length} units.`,
      ],
      rationale: "Cohesion = blend of edge density and normalised average edge weight across the affected sub-graph.",
      method: "twin-engine-v1:cohesion",
    }),
    chokePoints,
    busFactor: explainNumber({
      value: bf,
      low: Math.max(0, bf - 1),
      high: bf + 1,
      confidence: 0.45,
      assumptions: [
        "Bus factor counts only people explicitly flagged as holding a unique skill — undeclared tacit knowledge is not visible to the twin.",
      ],
      rationale: "Count of unique-skill holders inside the affected units after the move.",
      method: "twin-engine-v1:bus-factor",
    }),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
