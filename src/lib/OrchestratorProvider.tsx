"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOrchestrator, type UseOrchestratorState } from "@/lib/useOrchestrator";

const OrchestratorContext = createContext<UseOrchestratorState | null>(null);

/**
 * Mounted once in `src/app/layout.tsx` so the SSE connection to
 * `/api/events/stream` is shared across every route/view instead of each
 * view opening its own EventSource.
 */
export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const state = useOrchestrator();
  return <OrchestratorContext.Provider value={state}>{children}</OrchestratorContext.Provider>;
}

export function useOrchestratorContext(): UseOrchestratorState {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) {
    throw new Error("useOrchestratorContext must be used within an OrchestratorProvider");
  }
  return ctx;
}
