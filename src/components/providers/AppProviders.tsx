"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, localeDirection, type Locale } from "@/lib/i18n";
import { TEXT_SCALE_STEPS, type TextScale } from "@/lib/a11y";

export type AppPrefs = {
  locale: Locale;
  accentColor: string;
  terminology: Record<string, string>;
  highContrast: boolean;
  textScale: TextScale;
  plainLanguage: boolean;
};

type AppContextValue = AppPrefs & {
  setHighContrast: (value: boolean) => void;
  setTextScale: (value: TextScale) => void;
  setPlainLanguage: (value: boolean) => void;
  term: (key: "people" | "finance" | "strategy", fallback: string) => string;
};

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "leados.a11y-prefs";

function loadStoredPrefs(): Partial<Pick<AppPrefs, "highContrast" | "textScale" | "plainLanguage">> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function AppProviders({
  initial,
  children,
}: {
  initial: { locale: Locale; accentColor: string; terminology: Record<string, string>; highContrastDefault: boolean; plainLanguageDefault: boolean };
  children: ReactNode;
}) {
  const stored = loadStoredPrefs();
  const [highContrast, setHighContrast] = useState<boolean>(stored.highContrast ?? initial.highContrastDefault);
  const [textScale, setTextScale] = useState<TextScale>(stored.textScale ?? 100);
  const [plainLanguage, setPlainLanguage] = useState<boolean>(stored.plainLanguage ?? initial.plainLanguageDefault);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ highContrast, textScale, plainLanguage }));
  }, [highContrast, textScale, plainLanguage]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.contrast = highContrast ? "high" : "normal";
    html.style.setProperty("--text-scale", String(textScale / 100));
    html.style.setProperty("--accent", initial.accentColor);
    html.lang = initial.locale;
    html.dir = localeDirection(initial.locale);
  }, [highContrast, textScale, initial.accentColor, initial.locale]);

  const term = useCallback(
    (key: "people" | "finance" | "strategy", fallback: string) => initial.terminology[key] || fallback,
    [initial.terminology],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      locale: initial.locale,
      accentColor: initial.accentColor,
      terminology: initial.terminology,
      highContrast,
      textScale,
      plainLanguage,
      setHighContrast,
      setTextScale,
      setPlainLanguage,
      term,
    }),
    [initial.locale, initial.accentColor, initial.terminology, highContrast, textScale, plainLanguage, term],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    // Safe default so components can render in isolation/tests.
    return {
      locale: DEFAULT_LOCALE,
      accentColor: "#2563eb",
      terminology: {},
      highContrast: false,
      textScale: 100,
      plainLanguage: false,
      setHighContrast: () => {},
      setTextScale: () => {},
      setPlainLanguage: () => {},
      term: (_key, fallback) => fallback,
    };
  }
  return ctx;
}

export { TEXT_SCALE_STEPS };
