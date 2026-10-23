/**
 * Single lazy-loaded entry point for the entire spatial layer. App.tsx only
 * imports this module (via React.lazy) when the user navigates to a spatial
 * route, so the projection math, layout engines, canvas renderer and scene
 * data never ship to visitors who stay on Overview/Methodology.
 */
import { useMemo } from "react";
import { buildSceneRegistry } from "@/lib/spatial/sceneRegistry";
import { buildOrgHierarchy } from "@/data/orgHierarchy";
import { EcosystemScene } from "./scenes/EcosystemScene";
import { ScenarioLandscapeScene } from "./scenes/ScenarioLandscapeScene";
import { OrgStructureScene } from "./scenes/OrgStructureScene";
import { AccessibilityPanel } from "./AccessibilityPanel";

export type SpatialRouteId = "ecosystem" | "scenario-landscape" | "org-structure";

export default function SpatialRoutes({ route }: { route: SpatialRouteId }) {
  const registry = useMemo(() => buildSceneRegistry(), []);
  const orgRoot = useMemo(() => buildOrgHierarchy(), []);

  const scene = registry.find((s) => s.id === route);
  if (!scene) return null;

  return (
    <div className="space-y-4">
      <AccessibilityPanel />
      {route === "ecosystem" && <EcosystemScene scene={scene} showTour />}
      {route === "scenario-landscape" && <ScenarioLandscapeScene scene={scene} />}
      {route === "org-structure" && <OrgStructureScene scene={scene} orgRoot={orgRoot} />}
    </div>
  );
}
