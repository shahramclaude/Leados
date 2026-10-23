/**
 * Scenario ensemble data source (Part 24's scenario ensemble) feeding the
 * scenario-comparison "explorable landscape" scene, and Part 06's digital
 * twin outputs used as the landscape's outcome surface.
 *
 * Provenance note (honesty rule): Parts 06/24 outputs were not present in
 * this working tree. This module declares the documented shape (scenario x
 * two driver axes x an outcome distribution from the twin) and generates a
 * deterministic synthetic ensemble. Replace `buildScenarioEnsemble()` with a
 * direct import once those parts land — downstream components are shape-only
 * consumers (`SceneNode[]`).
 */
import type { SceneNode } from "@/types/spatial";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILIES = ["baseline", "high-growth", "constrained-supply", "regulatory-shock"] as const;

/** Builds a deterministic synthetic scenario ensemble.
 * x = demand driver, y = cost driver, magnitude = twin-modeled outcome (e.g. margin impact, $M).
 */
export function buildScenarioEnsemble(count = 48): SceneNode[] {
  const rand = mulberry32(7);
  const nodes: SceneNode[] = [];
  for (let i = 0; i < count; i++) {
    const family = FAMILIES[i % FAMILIES.length];
    const demand = rand() * 100;
    const cost = rand() * 100;
    // Twin-modeled outcome: a smooth-ish function of the two drivers plus family bias and noise.
    const familyBias = { baseline: 0, "high-growth": 18, "constrained-supply": -14, "regulatory-shock": -24 }[family];
    const outcome = Math.round((demand * 0.6 - cost * 0.4 + familyBias + (rand() - 0.5) * 10) * 10) / 10;
    nodes.push({
      id: `scn-${i}`,
      label: `${family} #${i}`,
      position: { x: 0, y: 0, z: 0 },
      magnitude: outcome,
      category: family,
      fields: {
        demandDriver: Math.round(demand * 10) / 10,
        costDriver: Math.round(cost * 10) / 10,
        twinOutcomeUsdM: outcome,
        confidence: Math.round((0.5 + rand() * 0.5) * 100) / 100,
      },
    });
  }
  return nodes;
}
