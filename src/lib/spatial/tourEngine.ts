/**
 * Guided-tour engine: narrative annotations stepping through scene nodes
 * (Part 32's storytelling pattern). Pure state-transition functions +
 * a thin React hook wrapper — reduced-motion users get instant camera
 * cuts instead of animated flythroughs (no tweening math needed in state).
 */
import { useCallback, useMemo, useState } from "react";
import type { TourStep } from "@/types/spatial";

export interface TourState {
  stepIndex: number;
  playing: boolean;
}

export function useTour(steps: TourStep[]) {
  const [state, setState] = useState<TourState>({ stepIndex: 0, playing: false });

  const step = steps[Math.min(state.stepIndex, steps.length - 1)];

  const next = useCallback(() => {
    setState((s) => ({ ...s, stepIndex: Math.min(s.stepIndex + 1, steps.length - 1) }));
  }, [steps.length]);

  const prev = useCallback(() => {
    setState((s) => ({ ...s, stepIndex: Math.max(s.stepIndex - 1, 0) }));
  }, []);

  const goTo = useCallback((i: number) => {
    setState((s) => ({ ...s, stepIndex: Math.max(0, Math.min(i, steps.length - 1)) }));
  }, [steps.length]);

  const togglePlay = useCallback(() => setState((s) => ({ ...s, playing: !s.playing })), []);

  const atEnd = state.stepIndex >= steps.length - 1;

  return useMemo(
    () => ({ step, stepIndex: state.stepIndex, playing: state.playing, atEnd, next, prev, goTo, togglePlay, total: steps.length }),
    [step, state.stepIndex, state.playing, atEnd, next, prev, goTo, togglePlay, steps.length]
  );
}

export function buildEcosystemTour(topNodeIds: string[]): TourStep[] {
  return [
    {
      id: "intro",
      title: "Welcome to the ecosystem space",
      narration: "This scene shows every service and its dependency edges. Edge crossings that are ambiguous in a flat 2D layout separate out as you orbit in 3D.",
      focusNodeIds: [],
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
    {
      id: "hub",
      title: "Highest-connectivity service",
      narration: `${topNodeIds[0] ?? "This node"} has the most dependency edges. In 3D, its cluster of neighbors separates into visible shells instead of overlapping lines.`,
      focusNodeIds: topNodeIds.slice(0, 1),
      cameraTarget: { x: 40, y: 0, z: 40 },
    },
    {
      id: "critical-path",
      title: "Critical-path edges",
      narration: "Edges marked critical-path are highlighted in amber. These are the dependencies most likely to cause cascading failure.",
      focusNodeIds: topNodeIds.slice(0, 3),
      cameraTarget: { x: -30, y: 20, z: 10 },
    },
    {
      id: "wrap",
      title: "Table and description always available",
      narration: "Every claim made spatially here is also available as a sortable table and a plain-language summary — switch views any time with the tabs above.",
      focusNodeIds: [],
      cameraTarget: { x: 0, y: 0, z: 0 },
    },
  ];
}
