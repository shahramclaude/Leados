import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AppStateValue {
  crisisMode: boolean;
  setCrisisMode: (v: boolean) => void;
  attentionBudget: number; // remaining "interruption units" today
  maxAttentionBudget: number;
  spendAttention: (cost: number) => boolean; // returns true if spend succeeded
}

const AppStateContext = createContext<AppStateValue | null>(null);

const MAX_BUDGET = 6;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [crisisMode, setCrisisMode] = useState(false);
  const [attentionBudget, setAttentionBudget] = useState(MAX_BUDGET);

  const spendAttention = (cost: number) => {
    let ok = false;
    setAttentionBudget((prev) => {
      if (prev - cost < 0) {
        ok = false;
        return prev;
      }
      ok = true;
      return prev - cost;
    });
    return ok;
  };

  const value = useMemo(
    () => ({ crisisMode, setCrisisMode, attentionBudget, maxAttentionBudget: MAX_BUDGET, spendAttention }),
    [crisisMode, attentionBudget]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
