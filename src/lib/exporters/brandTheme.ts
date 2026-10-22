// =============================================================================
// Part 32 — brand theming seam (Part 15).
// =============================================================================
// Real repo status check (docs/DESIGN-SYSTEM.md): "Status: stub. There is no
// formal design system... No dark mode." Part 15's brand-theming system does
// not exist yet in the repository. Rather than invent one wholesale under a
// different part's name, this is a minimal, swappable theme object — exactly
// the shape a real Part 15 "BrandTheme" would need to slot into the export
// engine — ledgered here as a seam, not presented as a finished design system.
export interface BrandTheme {
  name: string;
  primaryHex: string;
  accentHex: string;
  inkHex: string;
  paperHex: string;
  fontFamily: string;
  logoMark: string; // short text/emoji mark, avoids an asset dependency
}

export const DEFAULT_BRAND_THEME: BrandTheme = {
  name: "LEADOS Default",
  primaryHex: "#4338CA", // indigo-700
  accentHex: "#7C3AED", // violet-600
  inkHex: "#1E293B", // slate-800
  paperHex: "#FFFFFF",
  fontFamily: "helvetica",
  logoMark: "◆ LEADOS",
};

export const MONOCHROME_THEME: BrandTheme = {
  name: "Monochrome / Print-safe",
  primaryHex: "#0F172A",
  accentHex: "#334155",
  inkHex: "#0F172A",
  paperHex: "#FFFFFF",
  fontFamily: "helvetica",
  logoMark: "LEADOS",
};

export const BRAND_THEMES: BrandTheme[] = [DEFAULT_BRAND_THEME, MONOCHROME_THEME];
