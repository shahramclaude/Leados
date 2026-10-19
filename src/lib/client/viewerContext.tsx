"use client";

// Demo viewer switcher. LEADOS doesn't have a real SSO integration yet (see
// src/lib/platform/auth.ts), so the browser demo lets you switch between a
// handful of seeded personas to *see* server-side privacy scoping behave
// differently for different viewers against the exact same data — that's
// the point of this screen, not a real authentication system.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface DemoPersona {
  id: number;
  role: "self" | "manager" | "hr" | "exec" | "peer";
  label: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  { id: 3, role: "self", label: "Dana Kim — viewing their own profile (self)" },
  { id: 2, role: "manager", label: "Priya Shah — Dana's manager" },
  { id: 6, role: "hr", label: "Jordan Rivera — HR Business Partner" },
  { id: 1, role: "exec", label: "Alex Chen — VP Engineering (exec)" },
  { id: 4, role: "peer", label: "Sam Okafor — coworker (peer)" },
];

interface ViewerContextValue {
  persona: DemoPersona;
  setPersonaId: (id: number) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

const STORAGE_KEY = "leados.demoPersona";

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaIdState] = useState<number>(DEMO_PERSONAS[0].id);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setPersonaIdState(Number(stored));
  }, []);

  const setPersonaId = (id: number) => {
    setPersonaIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, String(id));
  };

  const persona = useMemo(
    () => DEMO_PERSONAS.find((p) => p.id === personaId) ?? DEMO_PERSONAS[0],
    [personaId],
  );

  return <ViewerContext.Provider value={{ persona, setPersonaId }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within a ViewerProvider");
  return ctx;
}

/** Appends the active demo persona as viewerId/viewerRole query params to a path. */
export function withViewerParams(path: string, persona: DemoPersona): string {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("viewerId", String(persona.id));
  url.searchParams.set("viewerRole", persona.role);
  return url.pathname + "?" + url.searchParams.toString();
}
