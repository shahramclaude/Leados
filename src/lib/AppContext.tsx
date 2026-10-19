"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOrchestrator, type UseOrchestratorState } from "./useOrchestrator";

const AppContext = createContext<UseOrchestratorState | null>(null);

/**
 * Wraps the whole app (see src/app/layout.tsx). Holds the single
 * OrchestratorResult + liveness state every view and the Shell read from.
 * No view / component should call useOrchestrator() directly — always go
 * through useAppContext() so there is exactly one in-flight fetch loop.
 */
export function AppContextProvider({ children }: { children: ReactNode }) {
  const state = useOrchestrator();
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useAppContext(): UseOrchestratorState {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within <AppContextProvider>");
  }
  return ctx;
}
