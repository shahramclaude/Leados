/**
 * Semantic-equivalent generator: scene -> { 2D chart spec, data table, text
 * description }. Every scene MUST pass through this so the "every 3D view
 * has an equivalent 2D/table view" rule is test-enforced rather than
 * aspirational (see scripts/verify.ts coverage table).
 */
import type { SceneDescriptor, SemanticEquivalent } from "@/types/spatial";

function describeDistribution(values: number[], unit: string): string {
  if (values.length === 0) return "No data points.";
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${values.length} items; ${unit} ranges from ${min.toFixed(1)} to ${max.toFixed(1)}, averaging ${mean.toFixed(1)}.`;
}

export function buildSemanticEquivalent(scene: SceneDescriptor): SemanticEquivalent {
  const columns = ["id", "label", "category", "magnitude", ...Object.keys(scene.nodes[0]?.fields ?? {})];
  const rows = scene.nodes.map((n) => [n.id, n.label, n.category, n.magnitude, ...Object.values(n.fields)]);

  const magnitudeValues = scene.nodes.map((n) => n.magnitude);
  const byCategory = new Map<string, number>();
  for (const n of scene.nodes) byCategory.set(n.category, (byCategory.get(n.category) ?? 0) + 1);
  const categorySummary = Array.from(byCategory.entries())
    .map(([cat, count]) => `${cat} (${count})`)
    .join(", ");

  let chart2dKind: SemanticEquivalent["chart2d"]["kind"];
  let chart2dDescription: string;
  if (scene.id === "ecosystem") {
    chart2dKind = "network";
    chart2dDescription = "Flat force-directed node-link diagram using the same layout, projected without perspective.";
  } else if (scene.id === "scenario-landscape") {
    chart2dKind = "parallel-coordinates";
    chart2dDescription = "Parallel-coordinates chart: one axis per driver plus the outcome, one polyline per scenario.";
  } else {
    chart2dKind = "icicle";
    chart2dDescription = "2D icicle partition: y = hierarchy depth, x-width = share of headcount.";
  }

  const description = `${scene.title}. ${scene.summary} Contains ${scene.nodes.length} elements across categories: ${categorySummary}. ${describeDistribution(magnitudeValues, "magnitude")}`;

  return {
    sceneId: scene.id,
    chart2d: { kind: chart2dKind, description: chart2dDescription },
    table: { columns, rows },
    description,
  };
}
