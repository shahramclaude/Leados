// Ecosystem-graph math (Part 31 twin extension): cohesion, choke points,
// bus factor. Pure functions over a plain graph so they can be unit-tested
// without the database.

export type GraphUnit = { id: number; name: string };
export type GraphEdge = { fromUnitId: number; toUnitId: number; weight: number };
export type GraphPerson = { id: number; name: string; unitId: number; uniqueSkill: boolean };

export function cohesionIndex(units: GraphUnit[], edges: GraphEdge[]): number {
  const n = units.length;
  if (n < 2) return 1;
  const maxEdges = (n * (n - 1)) / 2;
  const unitIds = new Set(units.map((u) => u.id));
  const relevant = edges.filter((e) => unitIds.has(e.fromUnitId) && unitIds.has(e.toUnitId));
  const totalWeight = relevant.reduce((sum, e) => sum + e.weight, 0);
  const density = relevant.length / maxEdges;
  const avgWeight = relevant.length > 0 ? totalWeight / relevant.length : 0;
  // Normalise avgWeight (assume typical weights 0..5) into 0..1 and blend with density.
  const normalisedWeight = Math.min(1, avgWeight / 5);
  return Math.max(0, Math.min(1, 0.5 * density + 0.5 * normalisedWeight));
}

export type ChokePoint = { unitId: number; unitName: string; reason: string };

/**
 * A unit is flagged as a choke point if removing it would disconnect the
 * remaining graph into more than one component, or if its share of total
 * edge weight touching the graph exceeds a dominance threshold.
 */
export function findChokePoints(units: GraphUnit[], edges: GraphEdge[]): ChokePoint[] {
  const chokePoints: ChokePoint[] = [];
  const totalWeight = edges.reduce((s, e) => s + e.weight, 0) || 1;

  for (const unit of units) {
    const touching = edges.filter((e) => e.fromUnitId === unit.id || e.toUnitId === unit.id);
    const touchingWeight = touching.reduce((s, e) => s + e.weight, 0);
    const dominance = touchingWeight / totalWeight;

    const remainingUnits = units.filter((u) => u.id !== unit.id);
    const remainingEdges = edges.filter((e) => e.fromUnitId !== unit.id && e.toUnitId !== unit.id);
    const componentsAfterRemoval = countComponents(remainingUnits, remainingEdges);

    if (componentsAfterRemoval > 1 && remainingUnits.length > 1) {
      chokePoints.push({
        unitId: unit.id,
        unitName: unit.name,
        reason: `Removing ${unit.name} splits the remaining ${remainingUnits.length} units into ${componentsAfterRemoval} disconnected groups.`,
      });
    } else if (dominance > 0.4 && units.length > 2) {
      chokePoints.push({
        unitId: unit.id,
        unitName: unit.name,
        reason: `${unit.name} carries ${(dominance * 100).toFixed(0)}% of total collaboration weight — single point of coordination failure.`,
      });
    }
  }
  return chokePoints;
}

function countComponents(units: GraphUnit[], edges: GraphEdge[]): number {
  const adjacency = new Map<number, number[]>();
  for (const u of units) adjacency.set(u.id, []);
  for (const e of edges) {
    if (adjacency.has(e.fromUnitId) && adjacency.has(e.toUnitId)) {
      adjacency.get(e.fromUnitId)!.push(e.toUnitId);
      adjacency.get(e.toUnitId)!.push(e.fromUnitId);
    }
  }
  const visited = new Set<number>();
  let components = 0;
  for (const u of units) {
    if (visited.has(u.id)) continue;
    components++;
    const stack = [u.id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of adjacency.get(cur) ?? []) {
        if (!visited.has(next)) stack.push(next);
      }
    }
  }
  return components;
}

/**
 * Bus factor heuristic: count of people flagged as holding unique skills
 * within the affected units. This is deliberately conservative — it is a
 * proxy for concentration risk, not a certified business-continuity metric
 * (see model card known limits).
 */
export function busFactor(people: GraphPerson[], affectedUnitIds: number[]): number {
  const affected = new Set(affectedUnitIds);
  return people.filter((p) => affected.has(p.unitId) && p.uniqueSkill).length;
}
