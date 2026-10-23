import { useState } from "react";
import type { OrgNode } from "@/data/orgHierarchy";
import type { SceneDescriptor, SceneNode } from "@/types/spatial";
import { SceneCanvas } from "../SceneCanvas";
import { Icicle2D } from "../charts/Icicle2D";
import { SceneShell } from "../SceneShell";

const DIVISION_COLOR: Record<string, string> = {
  Platform: "#2563eb",
  Growth: "#16a34a",
  Operations: "#d97706",
  Research: "#7c3aed",
};

/** Org structure: 2D icicle is PRIMARY (see Phase 0 verdict). A 3D extrusion
 * is offered behind an explicit toggle and labeled decorative — it adds no
 * data beyond the icicle, it only separates divisions into visual planes. */
export function OrgStructureScene({ scene, orgRoot }: { scene: SceneDescriptor; orgRoot: OrgNode }) {
  const [show3dExtra, setShow3dExtra] = useState(false);
  const colorFor = (n: SceneNode) => DIVISION_COLOR[n.category] ?? "#64748b";
  const radiusFor = (n: SceneNode) => Math.max(2, Math.sqrt(n.magnitude));

  const extrudedNodes: SceneNode[] = scene.nodes.map((n) => {
    const divisionIndex = Object.keys(DIVISION_COLOR).indexOf(n.category);
    return { ...n, position: { x: n.position.x, y: (n.magnitude % 20) - 10, z: divisionIndex * 50 } };
  });

  return (
    <SceneShell
      scene={scene}
      render3d={(selectedId, onSelect) =>
        show3dExtra ? (
          <SceneCanvas
            nodes={extrudedNodes}
            colorFor={colorFor}
            radiusFor={radiusFor}
            selectedId={selectedId}
            onSelect={onSelect}
            ariaLabel="Decorative 3D extrusion of the org hierarchy — no additional data beyond the 2D icicle"
          />
        ) : (
          <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            <p>2D icicle is the primary, information-complete view for this tree (Phase 0 verdict).</p>
            <button
              type="button"
              onClick={() => setShow3dExtra(true)}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Show decorative 3D extrusion anyway
            </button>
          </div>
        )
      }
      render2d={(selectedId, onSelect) => <Icicle2D root={orgRoot} selectedId={selectedId} onSelect={onSelect} />}
      extraPanel={
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">Why 3D is secondary here</p>
          <p className="mt-1">Depth/plane separation of divisions in the extrusion view carries no quantitative information not already in the 2D icicle's position + length channels. It is explicitly flagged "decorative" in the Encoding Legend.</p>
        </div>
      }
    />
  );
}
