/**
 * URL-state sync for spatial scenes, per Part 03's bundle/state discipline
 * ("selection sync with the rest of the product... URL state per Part 03").
 * Pure encode/decode functions kept framework-free and test-friendly; the
 * hook wrapper lives alongside for component use.
 */
import { useCallback, useEffect, useState } from "react";

export interface SpatialUrlState {
  scene: string;
  selected: string | null;
  view: "3d" | "2d" | "table" | "description";
}

const DEFAULTS: SpatialUrlState = { scene: "ecosystem", selected: null, view: "3d" };

export function encodeUrlState(state: SpatialUrlState): string {
  const params = new URLSearchParams();
  params.set("scene", state.scene);
  params.set("view", state.view);
  if (state.selected) params.set("selected", state.selected);
  return `?${params.toString()}`;
}

export function decodeUrlState(search: string): SpatialUrlState {
  const params = new URLSearchParams(search);
  return {
    scene: params.get("scene") ?? DEFAULTS.scene,
    selected: params.get("selected"),
    view: (params.get("view") as SpatialUrlState["view"]) ?? DEFAULTS.view,
  };
}

export function useSpatialUrlState() {
  const [state, setState] = useState<SpatialUrlState>(() =>
    typeof window !== "undefined" ? decodeUrlState(window.location.search) : DEFAULTS
  );

  useEffect(() => {
    const url = `${window.location.pathname}${encodeUrlState(state)}`;
    window.history.replaceState(null, "", url);
  }, [state]);

  const update = useCallback((partial: Partial<SpatialUrlState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  return [state, update] as const;
}
