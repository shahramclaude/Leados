import { useMemo } from "react";
import type { SceneDescriptor, SceneNode } from "@/types/spatial";
import { SceneCanvas } from "../SceneCanvas";
import { NetworkChart2D } from "../charts/NetworkChart2D";
import { SceneShell } from "../SceneShell";
import { TourControls } from "../TourControls";
import { buildEcosystemTour, useTour } from "@/lib/spatial/tourEngine";

const CATEGORY_COLOR: Record<string, string> = {
  "core-platform": "#2563eb",
  "data-pipeline": "#16a34a",
  "ui-surface": "#db2777",
  integration: "#d97706",
  "ml-service": "#7c3aed",
};

export function EcosystemScene({ scene, showTour }: { scene: SceneDescriptor; showTour: boolean }) {
  const colorFor = (n: SceneNode) => CATEGORY_COLOR[n.category] ?? "#64748b";
  const radiusFor = (n: SceneNode) => Math.max(3, Math.sqrt(n.magnitude) * 1.6);

  const topNodeIds = useMemo(
    () => [...scene.nodes].sort((a, b) => b.magnitude - a.magnitude).slice(0, 3).map((n) => n.id),
    [scene.nodes]
  );
  const tourSteps = useMemo(() => buildEcosystemTour(topNodeIds), [topNodeIds]);
  const tour = useTour(tourSteps);

  return (
    <SceneShell
      scene={scene}
      tour={
        showTour ? <TourControls tour={tour} /> : undefined
      }
      render3d={(selectedId, onSelect) => (
        <SceneCanvas
          nodes={scene.nodes}
          edges={scene.edges}
          colorFor={colorFor}
          radiusFor={radiusFor}
          selectedId={selectedId}
          onSelect={onSelect}
          ariaLabel="Ecosystem dependency graph, 3D"
          tourCameraTarget={showTour ? tour.step.cameraTarget : null}
        />
      )}
      render2d={(selectedId, onSelect) => (
        <NetworkChart2D nodes={scene.nodes} edges={scene.edges ?? []} colorFor={colorFor} selectedId={selectedId} onSelect={onSelect} />
      )}
    />
  );
}
