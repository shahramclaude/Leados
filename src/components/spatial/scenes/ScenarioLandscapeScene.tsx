import type { SceneDescriptor, SceneNode } from "@/types/spatial";
import { SceneCanvas } from "../SceneCanvas";
import { ParallelCoordinates } from "../charts/ParallelCoordinates";
import { SceneShell } from "../SceneShell";

const FAMILY_COLOR: Record<string, string> = {
  baseline: "#2563eb",
  "high-growth": "#16a34a",
  "constrained-supply": "#d97706",
  "regulatory-shock": "#dc2626",
};

export function ScenarioLandscapeScene({ scene }: { scene: SceneDescriptor }) {
  const colorFor = (n: SceneNode) => FAMILY_COLOR[n.category] ?? "#64748b";
  const radiusFor = (n: SceneNode) => 3 + Number(n.fields.confidence) * 6;

  return (
    <SceneShell
      scene={scene}
      render3d={(selectedId, onSelect) => (
        <SceneCanvas
          nodes={scene.nodes}
          colorFor={colorFor}
          radiusFor={radiusFor}
          selectedId={selectedId}
          onSelect={onSelect}
          ariaLabel="Scenario comparison landscape, 3D"
        />
      )}
      render2d={(selectedId, onSelect) => (
        <ParallelCoordinates nodes={scene.nodes} colorFor={colorFor} selectedId={selectedId} onSelect={onSelect} />
      )}
      extraPanel={
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Reading the landscape</p>
          <p className="mt-1">x = demand driver, depth-axis = cost driver, height = twin-modeled outcome ($M). All three are true position axes — none of this is a depth illusion standing in for a number.</p>
        </div>
      }
    />
  );
}
