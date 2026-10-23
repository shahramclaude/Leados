/**
 * Central scene registry — the single source of truth the verification
 * script and the app both read from, so "coverage" claims are mechanically
 * true rather than asserted separately in two places.
 */
import { buildEcosystemGraph } from "@/data/ecosystemGraph";
import { buildScenarioEnsemble } from "@/data/scenarioEnsemble";
import { buildOrgHierarchy, flattenOrg } from "@/data/orgHierarchy";
import { layoutEcosystem3d } from "./forceLayout";
import { layoutScenarioLandscape } from "./landscapeLayout";
import type { SceneDescriptor, SpatialEncoding } from "@/types/spatial";
import { PERCEPTUAL_RANKING } from "@/types/spatial";

function ecosystemEncodings(): SpatialEncoding[] {
  return [
    { dimension: "position3d", dataField: "forceLayoutPosition", scaleType: "linear", fieldKind: "identity", perceptualRanking: PERCEPTUAL_RANKING["position-nonaligned-scale"], note: "Layout position encodes graph topology only, not a measured quantity." },
    { dimension: "size", dataField: "dependencyCount", scaleType: "sqrt", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING.area, note: "Node radius ~ sqrt(dependencyCount) so area scales linearly with the value." },
    { dimension: "color", dataField: "category", scaleType: "categorical", fieldKind: "categorical", perceptualRanking: PERCEPTUAL_RANKING["color-categorical"] },
    { dimension: "depth", dataField: "criticality", scaleType: "ordinal", fieldKind: "ordinal", perceptualRanking: PERCEPTUAL_RANKING.depth, note: "Camera-distance fog groups criticality tiers into rough front/back bands — ordinal grouping cue only, not a precise value." },
  ];
}

function landscapeEncodings(): SpatialEncoding[] {
  return [
    { dimension: "position3d", dataField: "demandDriver", scaleType: "linear", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING["position-nonaligned-scale"] },
    { dimension: "position3d", dataField: "costDriver", scaleType: "linear", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING["position-nonaligned-scale"] },
    { dimension: "position3d", dataField: "twinOutcomeUsdM", scaleType: "linear", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING["position-nonaligned-scale"], note: "Height is a true third position axis, not a depth cue — magnitude is permitted here." },
    { dimension: "color", dataField: "family", scaleType: "categorical", fieldKind: "categorical", perceptualRanking: PERCEPTUAL_RANKING["color-categorical"] },
    { dimension: "size", dataField: "confidence", scaleType: "linear", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING.area, note: "Marker size ~ confidence; decorative weighting, cross-checked against the table's exact value." },
  ];
}

function orgEncodings(): SpatialEncoding[] {
  return [
    { dimension: "position3d", dataField: "depth", scaleType: "ordinal", fieldKind: "ordinal", perceptualRanking: PERCEPTUAL_RANKING["position-nonaligned-scale"] },
    { dimension: "size", dataField: "headcount", scaleType: "linear", fieldKind: "magnitude", perceptualRanking: PERCEPTUAL_RANKING.area, note: "Rect width = share of parent headcount (length encoding in the 2D icicle)." },
    { dimension: "color", dataField: "division", scaleType: "categorical", fieldKind: "categorical", perceptualRanking: PERCEPTUAL_RANKING["color-categorical"] },
    { dimension: "depth", dataField: "division", scaleType: "categorical", fieldKind: "categorical", perceptualRanking: PERCEPTUAL_RANKING.depth, decorative: true, note: "Optional 3D extrusion view separates divisions into front/back planes purely for visual variety — adds no information beyond the 2D icicle. Off by default." },
  ];
}

export function buildSceneRegistry(): SceneDescriptor[] {
  const eco = buildEcosystemGraph(64);
  const ecoLaidOut = layoutEcosystem3d(eco.nodes, eco.edges);

  const scenarios = buildScenarioEnsemble(48);
  const { nodes: scenarioNodes } = layoutScenarioLandscape(scenarios);

  const org = buildOrgHierarchy();
  const flat = flattenOrg(org);
  const orgNodes = flat
    .filter((f) => f.node.children === undefined || f.node.children.length === 0)
    .map((f) => ({
      id: f.node.id,
      label: f.node.name,
      position: { x: f.depth * 40, y: 0, z: 0 },
      magnitude: f.headcount,
      category: f.path[1] ?? "root",
      fields: { depth: f.depth, path: f.path.join(" / "), headcount: f.headcount },
    }));

  return [
    {
      id: "ecosystem",
      title: "Ecosystem & Dependency Space",
      summary: "Every service in the platform and the dependency edges between them.",
      spatialJustification:
        "At 64 nodes / ~110 edges, a flat 2D force layout produces heavy edge-crossing ambiguity around hub nodes. Orbiting in 3D separates overlapping edges into distinguishable shells. Verdict: 3D helps (Phase 0).",
      encodings: ecosystemEncodings(),
      nodes: ecoLaidOut,
      edges: eco.edges,
      threeDPrimary: true,
    },
    {
      id: "scenario-landscape",
      title: "Scenario Comparison Landscape",
      summary: "48 twin-modeled scenarios positioned by two drivers with outcome as a third axis.",
      spatialJustification:
        "Three genuinely continuous quantitative axes (demand, cost, outcome) is the textbook case where a 2D projection must sacrifice one axis to color/size. 3D position keeps all three on strong position channels. Verdict: 3D helps, WITH a mandatory parallel-coordinates fallback for exact reading (Phase 0).",
      encodings: landscapeEncodings(),
      nodes: scenarioNodes,
      threeDPrimary: true,
    },
    {
      id: "org-structure",
      title: "Org Structure Space",
      summary: `${org.children?.length ?? 0} divisions, ${flat.length} total nodes in the hierarchy.`,
      spatialJustification:
        "A strict tree's two meaningful quantities (depth, sibling share) are already top-rank 2D channels (position, length) in an icicle. No measured user-study benefit for 3D here. Verdict: 2D icicle is PRIMARY; 3D extrusion is offered but explicitly marked decorative (Phase 0).",
      encodings: orgEncodings(),
      nodes: orgNodes,
      threeDPrimary: false,
    },
  ];
}
