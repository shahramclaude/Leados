/**
 * LEADOS design tokens — typed JS/TS access to the CSS custom properties
 * declared in `src/app/globals.css`. Components must import from here (or
 * use the Tailwind utilities mapped in `@theme inline`) instead of writing
 * raw hex/px values. `scripts/check-tokens.js` enforces this at verify time.
 */

export type Theme = "light" | "dark" | "hc" | "system";
export type ResolvedTheme = "light" | "dark" | "hc";
export type Density = "comfortable" | "compact";

export const THEME_STORAGE_KEY = "leados:theme";
export const DENSITY_STORAGE_KEY = "leados:density";

export const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "hc", label: "High contrast" },
];

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/** Severity scale used consistently across badges, charts, tables (1 = lowest). */
export const SEVERITY_LEVELS = [1, 2, 3, 4, 5] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

/** Color + shape + label so severity is never color-only (colorblind-safe). */
export const SEVERITY_META: Record<
  Severity,
  { label: string; shape: "circle" | "triangle" | "diamond" | "square" | "star"; color: string; bg: string }
> = {
  1: { label: "Low", shape: "circle", color: "var(--severity-1)", bg: "var(--severity-1-bg)" },
  2: { label: "Minor", shape: "triangle", color: "var(--severity-2)", bg: "var(--severity-2-bg)" },
  3: { label: "Moderate", shape: "diamond", color: "var(--severity-3)", bg: "var(--severity-3-bg)" },
  4: { label: "High", shape: "square", color: "var(--severity-4)", bg: "var(--severity-4-bg)" },
  5: { label: "Critical", shape: "star", color: "var(--severity-5)", bg: "var(--severity-5-bg)" },
};

export type Status = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_META: Record<Status, { label: string; color: string; bg: string; glyph: string }> = {
  success: { label: "Success", color: "var(--status-success)", bg: "var(--status-success-bg)", glyph: "✓" },
  warning: { label: "Warning", color: "var(--status-warning)", bg: "var(--status-warning-bg)", glyph: "!" },
  danger: { label: "Danger", color: "var(--status-danger)", bg: "var(--status-danger-bg)", glyph: "✕" },
  info: { label: "Info", color: "var(--status-info)", bg: "var(--status-info-bg)", glyph: "i" },
  neutral: { label: "Neutral", color: "var(--status-neutral)", bg: "var(--status-neutral-bg)", glyph: "•" },
};

/** Colorblind-safe, 5-step categorical chart sequence (paired with dash/shape in chart marks). */
export const CHART_SERIES = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
] as const;

export const CHART_DASH_PATTERNS = ["0", "6 4", "2 3", "8 3 2 3", "1 3"] as const;

export const MOTION = {
  fast: 120,
  base: 180,
  slow: 240,
  stagger: 40,
  easeStandard: "cubic-bezier(0.2, 0, 0, 1)",
  easeEntrance: "cubic-bezier(0.1, 0.9, 0.2, 1)",
  easeExit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export function cssVar(name: string): string {
  return `var(--${name})`;
}
