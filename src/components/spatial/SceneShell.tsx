import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SceneDescriptor } from "@/types/spatial";
import { buildSemanticEquivalent } from "@/lib/spatial/semanticEquivalent";
import { EncodingLegend } from "./EncodingLegend";
import { SceneTableView } from "./SceneTableView";
import { SceneDescription } from "./SceneDescription";
import { ViewSwitcher, type ViewMode } from "./ViewSwitcher";
import { useSpatialUrlState } from "@/lib/spatial/urlState";

export function SceneShell({
  scene,
  render3d,
  render2d,
  tour,
  extraPanel,
}: {
  scene: SceneDescriptor;
  render3d: (selectedId: string | null, onSelect: (id: string | null) => void) => ReactNode;
  render2d: (selectedId: string | null, onSelect: (id: string | null) => void) => ReactNode;
  tour?: ReactNode;
  extraPanel?: ReactNode;
}) {
  const [urlState, updateUrl] = useSpatialUrlState();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const defaultView: ViewMode = scene.threeDPrimary && !isMobile ? "3d" : "2d";
  const [view, setView] = useState<ViewMode>(urlState.scene === scene.id ? urlState.view : defaultView);
  const [selectedId, setSelectedId] = useState<string | null>(urlState.scene === scene.id ? urlState.selected : null);

  useEffect(() => {
    updateUrl({ scene: scene.id, view, selected: selectedId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, view, selectedId]);

  const equivalent = useMemo(() => buildSemanticEquivalent(scene), [scene]);
  const selectedNode = scene.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{scene.title}</h2>
            <p className="text-sm text-slate-500">{scene.summary}</p>
          </div>
          <ViewSwitcher value={view} onChange={setView} threeDPrimary={scene.threeDPrimary} />
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Spatial verdict: </span>
          {scene.spatialJustification}
        </p>
      </div>

      {tour}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          {view === "3d" && render3d(selectedId, setSelectedId)}
          {view === "2d" && <div className="rounded-xl border border-slate-200 bg-white p-2" style={{ minHeight: 420 }}>{render2d(selectedId, setSelectedId)}</div>}
          {view === "table" && <SceneTableView equivalent={equivalent} onSelect={setSelectedId} />}
          {view === "description" && <SceneDescription equivalent={equivalent} />}
        </div>
        <div className="space-y-4">
          <EncodingLegend encodings={scene.encodings} />
          {selectedNode ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
              <h4 className="font-semibold text-blue-900">{selectedNode.label}</h4>
              <dl className="mt-2 space-y-1 text-xs text-blue-800">
                <div className="flex justify-between"><dt>Category</dt><dd>{selectedNode.category}</dd></div>
                <div className="flex justify-between"><dt>Magnitude</dt><dd>{selectedNode.magnitude}</dd></div>
                {Object.entries(selectedNode.fields).map(([k, v]) => (
                  <div className="flex justify-between gap-4" key={k}>
                    <dt className="truncate">{k}</dt>
                    <dd className="truncate text-right">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {extraPanel}
        </div>
      </div>
    </div>
  );
}
