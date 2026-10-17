// a11y.ts — accessibility signal detection via standard matchMedia queries.
// ORIGINAL to this build. Screen-reader usage cannot be reliably detected
// from JS alone (disclosed limitation, same one noted in wbweve/Leados's
// README for its own a11y module) — we use a manual self-report checkbox
// instead of pretending to auto-detect it.

export interface A11ySignals {
  reducedMotion: boolean;
  darkMode: boolean;
  highContrast: boolean;
  screenReaderSelfReport: boolean; // manual, not detected
}

export function detect(screenReaderSelfReport = false): A11ySignals {
  const mq = (q: string) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false);
  return {
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    darkMode: mq("(prefers-color-scheme: dark)"),
    highContrast: mq("(prefers-contrast: more)"),
    screenReaderSelfReport,
  };
}
