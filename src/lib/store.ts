// localStorage persistence. New key for this fresh session (no shared
// history with github.com/wbweve/Leados's 'leados-sandbox:v1', or any other
// prior session's key — this workspace began empty, verified above).
import { useCallback, useMemo, useState } from 'react';
import { buildSeedState } from './seed';
import type { AppState, LeadosEvent } from './types';

const KEY = 'leados-federated:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const seeded = buildSeedState();
  localStorage.setItem(KEY, JSON.stringify(seeded));
  return seeded;
}

export function useStore() {
  const [state, setState] = useState<AppState>(() => load());

  const persist = useCallback((next: AppState) => {
    setState(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  const addEvent = useCallback(
    (type: LeadosEvent['type'], data: Record<string, any>) => {
      setState((prev) => {
        const next: AppState = {
          ...prev,
          events: [...prev.events, { id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, ts: new Date().toISOString(), data }],
        };
        localStorage.setItem(KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const reset = useCallback(() => {
    const seeded = buildSeedState();
    persist(seeded);
  }, [persist]);

  return useMemo(() => ({ state, addEvent, reset }), [state, addEvent, reset]);
}
