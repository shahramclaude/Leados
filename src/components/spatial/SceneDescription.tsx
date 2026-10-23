import type { SemanticEquivalent } from "@/types/spatial";

export function SceneDescription({ equivalent }: { equivalent: SemanticEquivalent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Plain-language description</h3>
      <p>{equivalent.description}</p>
      <p className="mt-2 text-slate-500">
        2D chart equivalent: <strong>{equivalent.chart2d.kind}</strong> — {equivalent.chart2d.description}
      </p>
    </div>
  );
}
