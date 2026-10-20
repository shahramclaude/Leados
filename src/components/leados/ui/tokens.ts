/**
 * LEADOS token registry.
 *
 * This file is the typed mirror of the CSS custom properties defined in
 * `src/app/globals.css`. It exists so that:
 *  1. Components can reference token *names* instead of raw values
 *     (`surface("raised")` -> `var(--surface-raised)`), which keeps
 *     `npm run check:tokens` able to prove zero hard-coded colors/spacing.
 *  2. `/styleguide` can enumerate every token programmatically instead of
 *     hand-maintaining a list that drifts from the CSS.
 *
 * Three layers, per the design system brief:
 *  - PRIMITIVE: raw scales (color ramps, 4px space grid, type scale, radii,
 *    elevation, motion durations/easing). Never referenced directly by
 *    product components — only by semantic tokens below and by the
 *    styleguide's "primitive" tab.
 *  - SEMANTIC: role-based tokens (surface, text, border, accent, severity,
 *    status, focus). This is what components use.
 *  - COMPONENT: a small number of component-specific dimensions that don't
 *    fit a generic semantic name (card padding, table row height, control
 *    heights).
 */

export const THEMES = ["light", "dark", "hc"] as const;
export type ThemeName = (typeof THEMES)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type DensityName = (typeof DENSITIES)[number];

export const PRIMITIVE_SPACE = [
  "space-0", "space-1", "space-2", "space-3", "space-4", "space-5", "space-6",
  "space-8", "space-10", "space-12", "space-16", "space-20", "space-24",
] as const;

export const PRIMITIVE_TYPE = [
  "text-xs", "text-sm", "text-base", "text-md", "text-lg", "text-xl", "text-2xl", "text-3xl",
] as const;

export const PRIMITIVE_RADII = ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full"] as const;
export const PRIMITIVE_ELEVATION = ["shadow-sm", "shadow-md", "shadow-lg"] as const;
export const PRIMITIVE_MOTION = ["duration-fast", "duration-base", "duration-slow"] as const;

export const PRIMITIVE_RAMPS = ["gray", "blue", "green", "amber", "red", "violet"] as const;
export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export const SEMANTIC_SURFACE = ["base", "raised", "overlay", "sunken"] as const;
export const SEMANTIC_TEXT = ["primary", "secondary", "muted", "inverse"] as const;
export const SEMANTIC_BORDER = ["subtle", "strong"] as const;
export const SEMANTIC_ACCENT = ["default", "hover", "subtle"] as const;
export const SEMANTIC_STATUS = ["success", "warning", "danger", "info"] as const;
export const SEVERITY_LEVELS = [1, 2, 3, 4, 5] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** Severity must never be color-only: every level carries a shape + label. */
export const SEVERITY_META: Record<SeverityLevel, { label: string; shape: string; var: string }> = {
  1: { label: "Nominal", shape: "●", var: "--severity-1" },
  2: { label: "Watch", shape: "▲", var: "--severity-2" },
  3: { label: "Elevated", shape: "■", var: "--severity-3" },
  4: { label: "High", shape: "◆", var: "--severity-4" },
  5: { label: "Critical", shape: "✕", var: "--severity-5" },
};

export const STATUS_META: Record<(typeof SEMANTIC_STATUS)[number], { label: string; shape: string }> = {
  success: { label: "Success", shape: "✓" },
  warning: { label: "Warning", shape: "▲" },
  danger: { label: "Danger", shape: "✕" },
  info: { label: "Info", shape: "ⓘ" },
};

export function cssvar(name: string): string {
  return `var(--${name})`;
}

export function surface(role: (typeof SEMANTIC_SURFACE)[number]): string {
  return cssvar(`surface-${role}`);
}

export function text(role: (typeof SEMANTIC_TEXT)[number]): string {
  return cssvar(`text-${role}`);
}

export function severityVar(level: SeverityLevel): string {
  return cssvar(SEVERITY_META[level].var.replace("--", ""));
}

/** Component tokens — dimensions that are product-specific, not role-based. */
export const COMPONENT_TOKENS = [
  "card-padding",
  "control-height-sm",
  "control-height-md",
  "control-height-lg",
  "table-row-height",
  "table-header-height",
] as const;
