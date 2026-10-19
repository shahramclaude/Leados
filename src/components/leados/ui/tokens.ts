/**
 * LEADOS design tokens — JS/TS mirror of the CSS custom properties defined in
 * `src/app/globals.css`. Components should prefer Tailwind utility classes
 * (which are generated from those same CSS variables via `@theme inline`),
 * but anything that needs a token value in JS (SVG charts, inline styles,
 * animation timing, sort orders) must read it from here — never hard-code a
 * hex/px value in a component.
 */

export const colorVar = {
  surfaceSunken: "var(--surface-sunken)",
  surface: "var(--surface)",
  surfaceRaised: "var(--surface-raised)",
  surfaceOverlay: "var(--surface-overlay)",
  borderSubtle: "var(--border-subtle)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  textDisabled: "var(--text-disabled)",
  textInverse: "var(--text-inverse)",
  accent: "var(--accent)",
  accentHover: "var(--accent-hover)",
  accentActive: "var(--accent-active)",
  accentSubtle: "var(--accent-subtle)",
  accentSubtleText: "var(--accent-subtle-text)",
  onAccent: "var(--on-accent)",
  focusRing: "var(--focus-ring)",
  scrim: "var(--scrim)",
} as const;

export type Severity = "critical" | "warning" | "caution" | "good" | "info" | "neutral";

/** Severity ordering used for sorting attention queues (highest first). */
export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "caution", "info", "good", "neutral"];

export const severityVar: Record<Severity, { fg: string; subtle: string }> = {
  critical: { fg: "var(--severity-critical)", subtle: "var(--severity-critical-subtle)" },
  warning: { fg: "var(--severity-warning)", subtle: "var(--severity-warning-subtle)" },
  caution: { fg: "var(--severity-caution)", subtle: "var(--severity-caution-subtle)" },
  good: { fg: "var(--severity-good)", subtle: "var(--severity-good-subtle)" },
  info: { fg: "var(--severity-info)", subtle: "var(--severity-info-subtle)" },
  neutral: { fg: "var(--severity-neutral)", subtle: "var(--severity-neutral-subtle)" },
};

export const severityLabel: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  caution: "Caution",
  good: "On track",
  info: "Informational",
  neutral: "Neutral",
};

/** Categorical chart palette — six hues, color-blind safe at AA on both themes. */
export const chartPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export const chartVar = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  band: "var(--chart-band)",
};

export const radius = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
};

export const shadow = {
  xs: "var(--shadow-xs)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
};

/** Motion durations in raw ms (for JS-driven animation / stagger math). */
export const motionMs = {
  instant: 80,
  fast: 120,
  base: 160,
  slow: 200,
  slower: 320,
};

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0.2, 1)",
  accelerate: "cubic-bezier(0.4, 0, 1, 1)",
};

/** 4px base spacing scale, mirrors Tailwind's default `--spacing` multiplier. */
export const space = (n: number) => `${n * 0.25}rem`;

export const typeScale = [
  "caption",
  "body-sm",
  "body",
  "body-lg",
  "h4",
  "h3",
  "h2",
  "h1",
  "display",
] as const;

export type TypeScaleToken = (typeof typeScale)[number];

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
