/**
 * TypeScript mirror of src/design/tokens.css for code that needs token
 * *values* (chart math, canvas drawing, the design-audit script, tests) and
 * not just CSS variables. Keep the semantic structure identical to the CSS
 * file — the two are verified together by `npm run design:check`.
 *
 * Nothing here is a hard-coded "off-token" color as far as the audit script
 * is concerned: this file IS the token source for JS consumers, referenced
 * through `var(--...)` in CSS and through these named exports in TS/TSX.
 */

export const DOMAIN_IDS = [
  "strategy",
  "people",
  "finance",
  "operations",
  "risk",
  "knowledge",
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

export interface DomainMeta {
  id: DomainId;
  label: string;
  hue: number;
  description: string;
  cssVar: string;
}

/** Fixed categorical order — chosen so adjacent legend entries are the most
 * CVD-distinguishable pairs (see scripts/colorblind-sim.mjs). Do not reorder
 * without re-running the simulation. */
export const DOMAIN_META: Record<DomainId, DomainMeta> = {
  strategy: {
    id: "strategy",
    label: "Strategy",
    hue: 280,
    description: "Direction, bets, portfolio choices.",
    cssVar: "--domain-strategy-solid",
  },
  people: {
    id: "people",
    label: "People",
    hue: 260,
    description: "Org, talent, culture, capability.",
    cssVar: "--domain-people-solid",
  },
  finance: {
    id: "finance",
    label: "Finance",
    hue: 160,
    description: "Capital, unit economics, runway.",
    cssVar: "--domain-finance-solid",
  },
  operations: {
    id: "operations",
    label: "Operations",
    hue: 100,
    description: "Delivery, process, throughput.",
    cssVar: "--domain-operations-solid",
  },
  risk: {
    id: "risk",
    label: "Risk",
    hue: 0,
    description: "Exposure, compliance, continuity.",
    cssVar: "--domain-risk-solid",
  },
  knowledge: {
    id: "knowledge",
    label: "Knowledge",
    hue: 120,
    description: "Evidence, research, institutional memory.",
    cssVar: "--domain-knowledge-solid",
  },
};

/** Order used by <CategoricalLegend> and chart series color assignment. */
export const CATEGORICAL_ORDER: DomainId[] = [
  "strategy",
  "people",
  "finance",
  "operations",
  "risk",
  "knowledge",
];

export const SEMANTIC_IDS = ["success", "warn", "danger", "info"] as const;
export type SemanticId = (typeof SEMANTIC_IDS)[number];

export const CONFIDENCE_LEVELS = [
  {
    id: "observed",
    index: 1,
    label: "Observed",
    glyph: "●●●●●",
    description: "Directly measured from source-of-record data.",
    cssVar: "--confidence-1-observed",
  },
  {
    id: "corroborated",
    index: 2,
    label: "Corroborated",
    glyph: "●●●●○",
    description: "Multiple independent signals agree.",
    cssVar: "--confidence-2-corroborated",
  },
  {
    id: "modeled",
    index: 3,
    label: "Modeled",
    glyph: "●●●○○",
    description: "Derived by a validated model from observed inputs.",
    cssVar: "--confidence-3-modeled",
  },
  {
    id: "estimated",
    index: 4,
    label: "Estimated",
    glyph: "●●○○○",
    description: "Single weak signal or short history.",
    cssVar: "--confidence-4-estimated",
  },
  {
    id: "assumed",
    index: 5,
    label: "Assumed",
    glyph: "●○○○○",
    description: "No direct signal; analyst or default assumption.",
    cssVar: "--confidence-5-assumed",
  },
] as const;

export type ConfidenceLevelId = (typeof CONFIDENCE_LEVELS)[number]["id"];

export const SEQUENTIAL_RAMP = [
  "--chart-seq-1",
  "--chart-seq-2",
  "--chart-seq-3",
  "--chart-seq-4",
  "--chart-seq-5",
  "--chart-seq-6",
  "--chart-seq-7",
] as const;

export const DIVERGING_RAMP = [
  "--chart-div-neg-3",
  "--chart-div-neg-2",
  "--chart-div-neg-1",
  "--chart-div-mid",
  "--chart-div-pos-1",
  "--chart-div-pos-2",
  "--chart-div-pos-3",
] as const;

/** 4px grid. */
export const SPACE = {
  0: "var(--space-0)",
  1: "var(--space-1)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
  20: "var(--space-20)",
  24: "var(--space-24)",
} as const;

/** Modular scale, ratio 1.25 (major third), base 14px. */
export const TYPE_SCALE = {
  xs: "var(--text-xs)",
  sm: "var(--text-sm)",
  base: "var(--text-base)",
  md: "var(--text-md)",
  lg: "var(--text-lg)",
  xl: "var(--text-xl)",
  "2xl": "var(--text-2xl)",
  "3xl": "var(--text-3xl)",
} as const;

export const MOTION = {
  fast: "var(--motion-fast)",
  base: "var(--motion-base)",
  slow: "var(--motion-slow)",
  easeStandard: "var(--motion-ease-standard)",
} as const;

/** APCA contrast floors by usage class. Cited against the Myndex APCA
 * guidance tiers; see docs/DESIGN-SYSTEM.md §2.1 for the full rationale and
 * which WCAG 2.2 clause backs each exemption. */
export const APCA_FLOORS = {
  body: 90,
  large: 75,
  ui: 45,
} as const;

/** WCAG 2.2 AA floor kept as a hard backstop under the APCA target. */
export const WCAG_AA_FLOORS = {
  body: 4.5,
  large: 3,
  ui: 3,
} as const;
