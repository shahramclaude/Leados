export type A11yPrefs = {
  highContrast: boolean;
  textScale: number; // 1 = 100%, 2 = 200%
  plainLanguage: boolean;
  reduceMotion: boolean;
};

export const A11Y_COOKIE = "LEADOS_A11Y";

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  highContrast: false,
  textScale: 1,
  plainLanguage: false,
  reduceMotion: false,
};

export function parseA11yCookie(raw: string | undefined | null): A11yPrefs {
  if (!raw) return DEFAULT_A11Y_PREFS;
  try {
    const parsed = JSON.parse(raw);
    return {
      highContrast: !!parsed.highContrast,
      textScale: typeof parsed.textScale === "number" ? Math.min(2, Math.max(1, parsed.textScale)) : 1,
      plainLanguage: !!parsed.plainLanguage,
      reduceMotion: !!parsed.reduceMotion,
    };
  } catch {
    return DEFAULT_A11Y_PREFS;
  }
}
