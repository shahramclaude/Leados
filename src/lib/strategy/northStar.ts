// North Star: company-level outcome metrics and coverage analysis — what
// fraction of active initiatives ultimately roll up (via contributes_to) to
// a north-star-aligned objective within a bounded number of hops.
import { buildGraph } from "./alignmentEngine";
import type { InitiativeNode, ObjectiveLinkEdge, ObjectiveNode } from "./strategyModels";

export interface NorthStarMetricInput {
  id: string;
  name: string;
  unit: string;
  currentValue: number;
  targetValue: number;
  observedAt: string;
}

export function northStarProgress(metric: NorthStarMetricInput): number {
  if (metric.targetValue === 0) return metric.currentValue >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, metric.currentValue / metric.targetValue));
}

const MAX_HOPS = 6;

/** Does this objective eventually reach a north-star-aligned objective via contributes_to, within MAX_HOPS? */
export function reachesNorthStar(
  objectiveId: string,
  objectives: ObjectiveNode[],
  links: ObjectiveLinkEdge[],
): boolean {
  const graph = buildGraph(objectives, links);
  const outMap = graph.outByType.get("contributes_to") ?? new Map();
  let cursor: string | null = objectiveId;
  const seen = new Set<string>();
  for (let hop = 0; hop <= MAX_HOPS && cursor; hop++) {
    const currentId: string = cursor;
    const obj = graph.objectivesById.get(currentId);
    if (!obj) return false;
    if (obj.isNorthStarAligned) return true;
    if (seen.has(currentId)) return false; // cycle guard
    seen.add(currentId);
    const edges: ObjectiveLinkEdge[] = outMap.get(currentId) ?? [];
    cursor = edges.length > 0 ? edges[0].toObjectiveId : null;
  }
  return false;
}

export interface NorthStarCoverage {
  totalInitiatives: number;
  coveredInitiatives: number;
  coverageRatio: number; // 0..1
  uncoveredInitiativeIds: string[];
}

export function northStarCoverage(
  initiatives: InitiativeNode[],
  objectives: ObjectiveNode[],
  links: ObjectiveLinkEdge[],
): NorthStarCoverage {
  const active = initiatives.filter((i) => i.status !== "cancelled");
  const uncovered: string[] = [];
  let covered = 0;
  for (const init of active) {
    if (reachesNorthStar(init.objectiveId, objectives, links)) {
      covered += 1;
    } else {
      uncovered.push(init.id);
    }
  }
  return {
    totalInitiatives: active.length,
    coveredInitiatives: covered,
    coverageRatio: active.length > 0 ? covered / active.length : 0,
    uncoveredInitiativeIds: uncovered,
  };
}
