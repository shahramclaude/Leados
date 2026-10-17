// src/lib/aesthetics.ts
// A fresh implementation of the "computational aesthetics" ideas described in
// the pasted pt-J summary (golden-ratio spacing, density optimization,
// time-of-day chromatic adaptation, a generated stylesheet). This is written
// from scratch for this sandbox; it is NOT a port of any code actually read
// from github.com/wbweve/Leados (this session only grepped a handful of
// constants from that repo's index.html, not its aesthetics logic).

export const PHI = 1.6180339887;

export interface SpacingToken {
  name: string;
  n: number;
  px: number;
}

/** sp1..sp10, each = round(base * PHI^n). Computed, not hand-typed. */
export function spacingScale(base = 4, count = 10): SpacingToken[] {
  const tokens: SpacingToken[] = [];
  for (let n = 1; n <= count; n++) {
    tokens.push({ name: `sp${n}`, n, px: Math.round(base * Math.pow(PHI, n - 1)) });
  }
  return tokens;
}

export type DensityMode = "COMPACT" | "STANDARD" | "COMFORTABLE" | "READING";

export interface DensityResult {
  mode: DensityMode;
  bitsPerPixel: number; // fabricated, disclosed proxy metric
  targetVisible: number; // Miller's-law-inspired target card count
  millerRange: { min: number; max: number };
}

const DENSITY_MULTIPLIER: Record<DensityMode, number> = {
  COMPACT: 0.7,
  STANDARD: 1.0,
  COMFORTABLE: 1.3,
  READING: 1.6,
};

/**
 * Fabricated "bits per finding-card pixel" proxy, disclosed as such.
 * Miller's 7±2 (1956) is a real citation; its applicability to UI card
 * density is NOT independently verified here — it is carried only as an
 * analogy, same disclosure the source project makes about its own figure.
 *
 * NOTE: an earlier version of this kind of function (described, not seen
 * firsthand, in the user-supplied pt-J summary) is reported to compute
 * min using a larger multiplier than max, inverting the range. This
 * implementation deliberately assigns the smaller multiplier to `min`
 * and the larger to `max` so that min <= max always holds.
 */
export function optimizeDensity(mode: DensityMode): DensityResult {
  const mult = DENSITY_MULTIPLIER[mode];
  const bitsPerPixel = Math.round((257 / (900 * mult)) * 1000) / 1000; // 257 bits/finding, fabricated
  const targetVisible = Math.max(3, Math.min(12, Math.round(7 / mult)));
  const millerRange = {
    min: Math.round(targetVisible * 0.55),
    max: Math.round(targetVisible * 1.8),
  };
  return { mode, bitsPerPixel, targetVisible, millerRange };
}

export interface ChromaticAdaptation {
  hour: number;
  kelvinApprox: number;
  hueShiftDeg: number;
  saturate: number;
  filterCss: string;
}

/**
 * Flat hue-rotate/saturate approximation of chromatic adaptation,
 * disclosed as a simplification of the fuller Bradford/D50 transform
 * (not implemented here). At hour 12 (approx. D65 daylight, ~6500K) the
 * shift is defined to be exactly 0deg / saturate(1).
 */
export function chromaticAdaptation(date: Date = new Date()): ChromaticAdaptation {
  const hour = date.getHours() + date.getMinutes() / 60;
  // Simple daylight curve: warm at the edges of the day, neutral at noon.
  const distanceFromNoon = Math.abs(hour - 12);
  const kelvinApprox = Math.round(6500 - distanceFromNoon * 180);
  const hueShiftDeg = Math.round(distanceFromNoon * 1.4);
  const saturate = Math.round((1 - distanceFromNoon * 0.01) * 100) / 100;
  const dir = hour < 12 ? -1 : 1;
  return {
    hour: Math.round(hour * 10) / 10,
    kelvinApprox,
    hueShiftDeg: dir * hueShiftDeg,
    saturate,
    filterCss: `hue-rotate(${dir * hueShiftDeg}deg) saturate(${saturate})`,
  };
}

/** Builds a real <style> text block from the live tokens above. */
export function generateLivingStylesheet(mode: DensityMode): string {
  const spacing = spacingScale();
  const density = optimizeDensity(mode);
  const lines: string[] = [":root {"];
  for (const t of spacing) lines.push(`  --${t.name}: ${t.px}px;`);
  lines.push(`  --density-target-visible: ${density.targetVisible};`);
  lines.push(`  --density-bpp: ${density.bitsPerPixel};`);
  lines.push("}");
  return lines.join("\n");
}

/** WCAG relative luminance + contrast ratio, real public formula. */
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const [rl, gl, bl] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}
