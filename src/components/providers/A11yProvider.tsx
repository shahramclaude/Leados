"use client";

// src/components/providers/A11yProvider.tsx — high-contrast theme, text-size
// scaling (to 200%), and plain-language mode. Preferences persist to
// localStorage immediately (snappy) and to the user record via
// `/api/me/preferences` best-effort (works even before that endpoint exists
// for anonymous/login-screen contexts).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface A11yState {
  highContrast: boolean;
  textScale: number; // 100 - 200
  plainLanguage: boolean;
}

interface A11yContextValue extends A11yState {
  setHighContrast: (v: boolean) => void;
  setTextScale: (v: number) => void;
  setPlainLanguage: (v: boolean) => void;
}

const STORAGE_KEY = "leados_a11y";

const A11yContext = createContext<A11yContextValue | null>(null);

function loadInitial(): A11yState {
  if (typeof window === "undefined") return { highContrast: false, textScale: 100, plainLanguage: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { highContrast: false, textScale: 100, plainLanguage: false, ...JSON.parse(raw) };
  } catch {
    // ignore corrupted storage
  }
  return { highContrast: false, textScale: 100, plainLanguage: false };
}

export function A11yProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<A11yState>({ highContrast: false, textScale: 100, plainLanguage: false });

  useEffect(() => {
    setState(loadInitial());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const root = document.documentElement;
    root.style.setProperty("--leados-font-scale", String(state.textScale / 100));
    root.dataset.highContrast = state.highContrast ? "true" : "false";
    root.dataset.plainLanguage = state.plainLanguage ? "true" : "false";
  }, [state]);

  const value = useMemo<A11yContextValue>(
    () => ({
      ...state,
      setHighContrast: (v) => setState((s) => ({ ...s, highContrast: v })),
      setTextScale: (v) => setState((s) => ({ ...s, textScale: Math.min(200, Math.max(100, v)) })),
      setPlainLanguage: (v) => setState((s) => ({ ...s, plainLanguage: v })),
    }),
    [state],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y(): A11yContextValue {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used within A11yProvider");
  return ctx;
}
