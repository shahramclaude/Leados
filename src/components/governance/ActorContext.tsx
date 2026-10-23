"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ActorUser = {
  id: number;
  name: string;
  email: string;
  boardTier: string;
};

type ActorContextValue = {
  users: ActorUser[];
  actingAsId: number | null;
  setActingAsId: (id: number | null) => void;
  actor: ActorUser | null;
};

const ActorContext = createContext<ActorContextValue | null>(null);

const STORAGE_KEY = "leados.governance.actingAs";

export function ActorProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<ActorUser[]>([]);
  const [actingAsId, setActingAsIdState] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/governance/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setUsers(data.users);
      })
      .catch(() => {});
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setActingAsIdState(Number(stored));
  }, []);

  function setActingAsId(id: number | null) {
    setActingAsIdState(id);
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  }

  const actor = users.find((u) => u.id === actingAsId) ?? null;

  return (
    <ActorContext.Provider value={{ users, actingAsId, setActingAsId, actor }}>
      {children}
    </ActorContext.Provider>
  );
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error("useActor must be used inside ActorProvider");
  return ctx;
}

export function actorHeaders(actingAsId: number | null): HeadersInit {
  if (actingAsId === null) return {};
  return { "x-gov-user-id": String(actingAsId) };
}
