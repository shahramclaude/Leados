"use client";

// Applies the `theme`/`density` preferences (read through the one
// `usePreferences` hook) to the document root. This is the single place
// that touches `document.documentElement` for preferences, so no component
// reaches for `localStorage` directly.
import { useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";

export function ThemeApplier() {
  const [{ theme, density }] = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.density = density;
  }, [theme, density]);

  return null;
}
