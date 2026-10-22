// src/lib/design/tokens.ts
//
// Minimal design-system tokens (Part 02 surface) reconstructed for Part 41.
// Defines the three density presets that progressive-density adaptation
// chooses between. These are presentation-only tokens — they never gate
// which facts are shown.

export type DensityMode = "guided" | "standard" | "dense";

export interface DensityTokens {
  label: string;
  description: string;
  spacing: string;
  fontSize: string;
  showNarrative: boolean;
  tableFirst: boolean;
  factsPerScreenHint: number;
}

export const DENSITY_TOKENS: Record<DensityMode, DensityTokens> = {
  guided: {
    label: "Guided",
    description: "Narrative explanations, one idea at a time, plain language.",
    spacing: "space-y-5",
    fontSize: "text-base",
    showNarrative: true,
    tableFirst: false,
    factsPerScreenHint: 3,
  },
  standard: {
    label: "Standard",
    description: "Balanced cards with headline + supporting detail.",
    spacing: "space-y-4",
    fontSize: "text-sm",
    showNarrative: true,
    tableFirst: false,
    factsPerScreenHint: 6,
  },
  dense: {
    label: "Dense",
    description: "Compact tables and fast paths for high-frequency review.",
    spacing: "space-y-1",
    fontSize: "text-xs",
    showNarrative: false,
    tableFirst: true,
    factsPerScreenHint: 20,
  },
};

export const DENSITY_MODES: DensityMode[] = ["guided", "standard", "dense"];

export const COLOR_TOKENS = {
  critical: "#B42318",
  high: "#B54708",
  medium: "#B54708",
  low: "#3538CD",
  info: "#475467",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  border: "#E2E8F0",
  accent: "#4F46E5",
};
