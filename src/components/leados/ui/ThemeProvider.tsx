"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DensityName, ThemeName } from "./tokens";

type ThemePreference = ThemeName | "system";

type ThemeContextValue = {
  theme: ThemeName;
  preference: ThemePreference;
  density: DensityName;
  setPreference: (pref: ThemePreference) => void;
  setDensity: (density: DensityName) => void;
  reducedMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "leados.theme";
const DENSITY_KEY = "leados.density";

function resolveSystemTheme(): ThemeName {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Inline, synchronous bootstrap script — runs before paint to avoid a
 * flash of the wrong theme. Reads localStorage only (no network, no
 * randomness), so it is deterministic for the styleguide/visual-regression
 * target. */
export function ThemeBootstrapScript() {
  const code = `(function(){try{
    var t = localStorage.getItem('${THEME_KEY}') || 'system';
    var resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', resolved);
    var d = localStorage.getItem('${DENSITY_KEY}') || 'comfortable';
    document.documentElement.setAttribute('data-density', d);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('reduce-motion');
    }
  }catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [density, setDensityState] = useState<DensityName>("comfortable");
  const [systemTheme, setSystemTheme] = useState<ThemeName>("light");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const storedTheme = (window.localStorage.getItem(THEME_KEY) as ThemePreference | null) ?? "system";
    const storedDensity = (window.localStorage.getItem(DENSITY_KEY) as DensityName | null) ?? "comfortable";
    setPreferenceState(storedTheme);
    setDensityState(storedDensity);
    setSystemTheme(resolveSystemTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMediaChange = () => setSystemTheme(media.matches ? "dark" : "light");
    const onMotionChange = () => setReducedMotion(motionMedia.matches);
    onMotionChange();
    media.addEventListener("change", onMediaChange);
    motionMedia.addEventListener("change", onMotionChange);
    return () => {
      media.removeEventListener("change", onMediaChange);
      motionMedia.removeEventListener("change", onMotionChange);
    };
  }, []);

  const theme: ThemeName = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    window.localStorage.setItem(THEME_KEY, pref);
  }, []);

  const setDensity = useCallback((d: DensityName) => {
    setDensityState(d);
    window.localStorage.setItem(DENSITY_KEY, d);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, density, setPreference, setDensity, reducedMotion }),
    [theme, preference, density, setPreference, setDensity, reducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
