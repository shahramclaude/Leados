"use client";

// Demo actor switcher context. Stands in for real session/SSO auth so the
// privacy/visibility rules enforced in accessControl.ts can be demonstrated
// interactively (self vs manager vs HR vs executive views of the same data).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface DemoActor {
  id: string;
  name: string;
  globalRole: "employee" | "manager" | "hr" | "executive";
}

interface ActorContextValue {
  actors: DemoActor[];
  currentActorId: string | null;
  currentActor: DemoActor | null;
  setCurrentActorId: (id: string) => void;
  loading: boolean;
}

const ActorContext = createContext<ActorContextValue | null>(null);

const STORAGE_KEY = "leados.demoActorId";

export function ActorProvider({ children }: { children: ReactNode }) {
  const [actors, setActors] = useState<DemoActor[]>([]);
  const [currentActorId, setCurrentActorIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/demo/actors")
      .then((r) => r.json())
      .then((data: { actors: DemoActor[] }) => {
        setActors(data.actors);
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const initial = stored && data.actors.some((a) => a.id === stored) ? stored : data.actors[0]?.id ?? null;
        setCurrentActorIdState(initial);
      })
      .finally(() => setLoading(false));
  }, []);

  const setCurrentActorId = (id: string) => {
    setCurrentActorIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  };

  const currentActor = useMemo(() => actors.find((a) => a.id === currentActorId) ?? null, [actors, currentActorId]);

  return (
    <ActorContext.Provider value={{ actors, currentActorId, currentActor, setCurrentActorId, loading }}>
      {children}
    </ActorContext.Provider>
  );
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error("useActor must be used within ActorProvider");
  return ctx;
}

/** Fetch wrapper that attaches the demo x-actor-id header. */
export async function actorFetch(actorId: string | null, input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (actorId) headers.set("x-actor-id", actorId);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}
