/**
 * Ecosystem / dependency graph data source.
 *
 * NOTE on provenance (honesty rule): Part 31's ecosystem graph module was not
 * present in this working tree at the time this part was built (greenfield
 * checkout). This file defines the SAME shape Part 31's export is documented
 * to produce (nodes with `category`/`dependencyCount`, weighted edges) and
 * generates a deterministic synthetic instance so the spatial layer has a
 * real, non-trivial structure to render and test against. Swap this module's
 * `buildEcosystemGraph()` body for a direct import from Part 31 when that
 * module lands in the tree — the consuming components never need to change
 * because they only depend on `SceneNode` / `SceneEdge`.
 */
import type { SceneEdge, SceneNode } from "@/types/spatial";

const CATEGORIES = ["core-platform", "data-pipeline", "ui-surface", "integration", "ml-service"] as const;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EcosystemGraph {
  nodes: SceneNode[];
  edges: SceneEdge[];
}

/** Builds a deterministic synthetic ecosystem graph of `count` services. */
export function buildEcosystemGraph(count = 64): EcosystemGraph {
  const rand = mulberry32(42);
  const nodes: SceneNode[] = [];
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const dependencyCount = Math.floor(rand() * 40) + 1;
    nodes.push({
      id: `svc-${i}`,
      label: `${category}-${i}`,
      position: { x: 0, y: 0, z: 0 }, // filled in by the force-layout engine at render time
      magnitude: dependencyCount,
      category,
      fields: {
        dependencyCount,
        owningTeam: `team-${(i % 9) + 1}`,
        criticality: ["low", "medium", "high", "critical"][Math.floor(rand() * 4)],
      },
    });
  }

  const edges: SceneEdge[] = [];
  let edgeId = 0;
  for (let i = 0; i < count; i++) {
    const outDegree = Math.floor(rand() * 4);
    for (let k = 0; k < outDegree; k++) {
      const target = Math.floor(rand() * count);
      if (target === i) continue;
      edges.push({
        id: `edge-${edgeId++}`,
        source: nodes[i].id,
        target: nodes[target].id,
        weight: Math.round(rand() * 10) / 10,
        kind: rand() > 0.85 ? "critical-path" : "standard",
      });
    }
  }

  return { nodes, edges };
}
