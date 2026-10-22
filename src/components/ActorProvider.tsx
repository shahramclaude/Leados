"use client";

// LEADOS Part 14 — ActorProvider
// Fetches the current demo actor ({orgId, userId, role, timezone}) once and
// provides it to the tree, plus a role switcher so the demo can show
// role-scoped topic delivery live (switch to "manager" and watch the stream
// scope change).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface Actor {
  orgId: string;
  userId: string;
  role: string;
  timezone: string;
}

interface ActorContextValue {
  actor: Actor | null;
  loading: boolean;
  switchRole: (role: "manager" | "analyst") => void;
}

const ActorContext = createContext<ActorContextValue>({ actor: null, loading: true, switchRole: () => {} });

export function useActor() {
  return useContext(ActorContext);
}

export function ActorProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [role, setRole] = useState<"manager" | "analyst">("analyst");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/me?role=${role}`)
      .then((r) => r.json())
      .then((data: Actor) => {
        if (!cancelled) setActor(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const switchRole = useCallback((next: "manager" | "analyst") => setRole(next), []);

  return <ActorContext.Provider value={{ actor, loading, switchRole }}>{children}</ActorContext.Provider>;
}
