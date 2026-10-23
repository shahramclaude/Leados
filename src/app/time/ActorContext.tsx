"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone: string;
  chronotype: string;
}

interface ActorContextValue {
  orgId: string | null;
  users: DirectoryUser[];
  actorId: string | null;
  actor: DirectoryUser | null;
  setActorId: (id: string) => void;
  loading: boolean;
}

const ActorContext = createContext<ActorContextValue | null>(null);

const STORAGE_KEY = "leados-te-actor-id";

export function ActorProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [actorId, setActorIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/time-economics/orgs/demo")
      .then((r) => r.json())
      .then((data) => {
        setOrgId(data.org?.id ?? null);
        setUsers(data.users ?? []);
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const validStored = stored && (data.users ?? []).some((u: DirectoryUser) => u.id === stored);
        setActorIdState(validStored ? stored : data.users?.[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const setActorId = useCallback((id: string) => {
    setActorIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const actor = useMemo(() => users.find((u) => u.id === actorId) ?? null, [users, actorId]);

  return (
    <ActorContext.Provider value={{ orgId, users, actorId, actor, setActorId, loading }}>
      {children}
    </ActorContext.Provider>
  );
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error("useActor must be used within ActorProvider");
  return ctx;
}

/** Fetch wrapper that automatically attaches the demo x-user-id auth header. */
export function useActorFetch() {
  const { actorId } = useActor();
  return useCallback(
    async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (actorId) headers.set("x-user-id", actorId);
      if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return fetch(input, { ...init, headers });
    },
    [actorId],
  );
}
