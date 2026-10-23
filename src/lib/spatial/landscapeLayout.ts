/**
 * Scenario-landscape layout: x/y = the two driver variables (position —
 * strongest channel, Cleveland–McGill rank 0-1), height (y in world space
 * after projection, i.e. a true 3rd position axis) = twin-modeled outcome
 * magnitude. This is NOT a depth encoding — it is a genuine third position
 * axis, which is why magnitude is allowed here (see encodingValidator rule:
 * magnitude may use position3d).
 */
import type { SceneNode } from "@/types/spatial";

export interface LandscapeExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export function layoutScenarioLandscape(nodes: SceneNode[]): { nodes: SceneNode[]; extent: LandscapeExtent } {
  const demand = nodes.map((n) => Number(n.fields.demandDriver));
  const cost = nodes.map((n) => Number(n.fields.costDriver));
  const outcome = nodes.map((n) => n.magnitude);

  const span = 180;
  const minD = Math.min(...demand);
  const maxD = Math.max(...demand);
  const minC = Math.min(...cost);
  const maxC = Math.max(...cost);
  const minO = Math.min(...outcome);
  const maxO = Math.max(...outcome);

  const placed = nodes.map((n, i) => {
    const x = ((demand[i] - minD) / Math.max(1e-6, maxD - minD) - 0.5) * span;
    const z = ((cost[i] - minC) / Math.max(1e-6, maxC - minC) - 0.5) * span;
    const y = ((outcome[i] - minO) / Math.max(1e-6, maxO - minO) - 0.5) * span * 0.6;
    return { ...n, position: { x, y, z } };
  });

  return {
    nodes: placed,
    extent: { minX: minD, maxX: maxD, minZ: minC, maxZ: maxC, minY: minO, maxY: maxO },
  };
}
