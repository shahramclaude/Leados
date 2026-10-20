"use client";

// src/components/providers/LocaleProvider.tsx — client-side i18n context.
// The server resolves the initial locale (cookie negotiation happens in
// middleware + layout.tsx); this provider makes `useT()` / `useLocale()`
// available to every client component without prop-drilling, and persists
// locale switches via `/api/locale`.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { dirFor } from "@/i18n/locales";

interface LocaleContextValue {
  locale: string;
  dir: "ltr" | "rtl";
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (next: string) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(normalizeLocale(initialLocale));

  const setLocale = useCallback(async (next: string) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: normalized }),
    });
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      t: createTranslator(locale),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocaleContext must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocaleContext().t;
}
