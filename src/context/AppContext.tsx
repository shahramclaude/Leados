"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CockpitData } from "@/lib/clientTypes";

type AppContextValue = {
  data: CockpitData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/cockpit")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(body.error ?? `Request failed with ${res.status}`);
        }
        return res.json() as Promise<CockpitData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load cockpit data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const value = useMemo(() => ({ data, loading, error, refresh }), [data, loading, error, refresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppData(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppData must be used within an AppProvider");
  return ctx;
}
