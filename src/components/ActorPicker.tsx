"use client";

import { useEffect, useState, createContext, useContext } from "react";

export interface PersonOption {
  id: number;
  name: string;
  role: string;
}

interface ActorState {
  personId: number | null;
  role: string | null;
}

const ActorContext = createContext<{
  actor: ActorState;
  setActor: (a: ActorState) => void;
  people: PersonOption[];
}>({ actor: { personId: null, role: null }, setActor: () => {}, people: [] });

export function useActor() {
  return useContext(ActorContext);
}

export function actorHeaders(actor: ActorState): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (actor.personId != null) headers["x-actor-id"] = String(actor.personId);
  if (actor.role) headers["x-actor-role"] = actor.role;
  return headers;
}

const STORAGE_KEY = "leados.part46.actor";

export function ActorProvider({ children }: { children: React.ReactNode }) {
  const [actor, setActorState] = useState<ActorState>({ personId: null, role: null });
  const [people, setPeople] = useState<PersonOption[]>([]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      try {
        setActorState(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => setPeople(data.people ?? []))
      .catch(() => setPeople([]));
  }, []);

  function setActor(a: ActorState) {
    setActorState(a);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  }

  return <ActorContext.Provider value={{ actor, setActor, people }}>{children}</ActorContext.Provider>;
}

export function ActorPickerBar() {
  const { actor, setActor, people } = useActor();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-semibold">Acting as:</span>
      <select
        className="rounded-md border border-amber-300 bg-white px-2 py-1"
        value={actor.personId ?? ""}
        onChange={(e) => {
          const p = people.find((p) => p.id === Number(e.target.value));
          setActor(p ? { personId: p.id, role: p.role } : { personId: null, role: null });
        }}
      >
        <option value="">— select a person —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.role})
          </option>
        ))}
      </select>
      {actor.personId != null && (
        <span className="text-xs text-amber-700">
          Requests will send <code>x-actor-id: {actor.personId}</code> / <code>x-actor-role: {actor.role}</code>
        </span>
      )}
      <span className="text-xs text-amber-700">
        (Demo-only impersonation switch — a real deployment derives this from an authenticated session.)
      </span>
    </div>
  );
}
