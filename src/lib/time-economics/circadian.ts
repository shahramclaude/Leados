// LEADOS — src/lib/circadian.ts dependency stand-in (Part 14 contract)
//
// Same honesty note as temporal.ts: the real Part 14 `circadian.ts` was
// not present in this checkout. This stand-in implements a literature-
// grounded energy curve so Part 45's scheduling suggestions and
// fragmentation/recovery analytics have a real (if simplified) model to
// call, and documents its sources so it can be swapped for the canonical
// Part 14 implementation without changing any Part 45 call sites.
//
// Sources (see also MODEL-CARD.md §2):
//  - Schmidt, Collette, Cajochen & Peigneux (2007), "A time to think:
//    circadian rhythms in human cognition", Cognitive Neuropsychology —
//    post-lunch dip + evening secondary peak for cognitive performance.
//  - Horne & Östberg (1976) Morningness-Eveningness Questionnaire —
//    basis for the 3-bucket chronotype model (lark / intermediate / owl).
//  - Monk (2005), "Aging human circadian rhythms" — afternoon trough
//    timing used for the dip center.

export type Chronotype = "lark" | "intermediate" | "owl";

/** Peak-shift, in hours, applied to the intermediate baseline curve. */
const CHRONOTYPE_PEAK_SHIFT_HOURS: Record<Chronotype, number> = {
  lark: -1.5,
  intermediate: 0,
  owl: 2.0,
};

/**
 * Returns a 0..1 "cognitive energy" estimate for a given local hour-of-day
 * (0-23.99) and chronotype. This is a simplified dual-peak model (morning
 * peak, post-lunch dip, smaller evening peak) shifted by chronotype — a
 * deliberately coarse approximation, not a measured biomarker. Treated as
 * a *scheduling heuristic*, never as a claim about an individual's actual
 * alertness.
 */
export function circadianEnergy(hourOfDay: number, chronotype: Chronotype = "intermediate"): number {
  const shift = CHRONOTYPE_PEAK_SHIFT_HOURS[chronotype];
  const h = hourOfDay - shift;

  const morningPeak = gaussian(h, 10, 2.6) * 1.0;
  const dip = gaussian(h, 14.5, 1.4) * 0.55; // post-lunch dip (subtracted)
  const eveningPeak = gaussian(h, 18.5, 2.2) * 0.65;
  const overnightFloor = gaussian(h, 3, 3) * -0.3; // deep trough, clamps near 0 anyway

  const raw = 0.35 + morningPeak - dip + eveningPeak + overnightFloor;
  return clamp01(raw);
}

/** Average circadian energy across a [startMinute,endMinute) local window. */
export function averageEnergyForWindow(
  startMinute: number,
  endMinute: number,
  chronotype: Chronotype = "intermediate",
  sampleEveryMinutes = 15,
): number {
  if (endMinute <= startMinute) return 0;
  let total = 0;
  let n = 0;
  for (let m = startMinute; m < endMinute; m += sampleEveryMinutes) {
    total += circadianEnergy(m / 60, chronotype);
    n += 1;
  }
  return n === 0 ? 0 : total / n;
}

/** Suggests whether a given local time window is "protect-worthy" deep-work time. */
export function isHighEnergyWindow(
  startMinute: number,
  endMinute: number,
  chronotype: Chronotype = "intermediate",
): boolean {
  return averageEnergyForWindow(startMinute, endMinute, chronotype) >= 0.62;
}

function gaussian(x: number, mean: number, stdDev: number): number {
  const exponent = -((x - mean) ** 2) / (2 * stdDev * stdDev);
  return Math.exp(exponent);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
