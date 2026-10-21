"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";

export type ThemeId = "light" | "dark" | "hc-light" | "hc-dark";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "hc-light", label: "High contrast (light)" },
  { value: "hc-dark", label: "High contrast (dark)" },
];

const STORAGE_KEY = "leados-theme";

export function applyTheme(theme: ThemeId) {
  if (theme === "light") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

/** ThemeToggle — single theme switcher used in the app shell and the
 * styleguide. Persists to localStorage; falls back to OS preference on
 * first load. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    const initial = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function onChange(value: string) {
    const next = value as ThemeId;
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <Select
      label="Theme"
      hideLabel
      value={theme}
      onChange={onChange}
      options={THEME_OPTIONS}
      className="h-9 w-44 text-[var(--text-sm)]"
    />
  );
}
