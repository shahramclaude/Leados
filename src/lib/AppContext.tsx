import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppState } from "./types";
import { loadState, saveState, resetState } from "./store";

interface AppContextValue {
  state: AppState;
  setState: (updater: (prev: AppState) => AppState) => void;
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const setState = (updater: (prev: AppState) => AppState) => setStateRaw((prev) => updater(prev));
  const reset = () => setStateRaw(resetState());

  return <AppContext.Provider value={{ state, setState, reset }}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
