// compound_intel — compound intelligence effect detection.
//
// PROVENANCE: the pasted "pt-P" brief names `js/compound_intel.js`, "compound
// intelligence effect detection." Not found anywhere in github.com/wbweve/Leados
// this session. The formula below is an original, disclosed heuristic — it is
// NOT a citation of a peer-reviewed "compound intelligence" metric (no such
// standard metric is claimed to exist).
//
// Heuristic: given N named intelligence-dimension signals (each 0-100) drawn
// from the platform's other modules, two dimensions "compound" when BOTH are
// independently strong (>= STRONG_THRESHOLD): the combined effect is modeled
// as exceeding the naive average of the two, via a multiplicative synergy
// term. Symmetrically, one very weak dimension (<= WEAK_THRESHOLD) paired
// with a strong one is flagged as "compound fragility" — a single weak link
// suppressing an otherwise-strong pair, modeled as a drag term.

import { round1 } from "./prng";

export interface IntelSignal {
  key: string;
  label: string;
  value: number; // 0-100
}

export interface CompoundPair {
  a: string;
  b: string;
  aValue: number;
  bValue: number;
  type: "compounding" | "fragility" | "neutral";
  effect: number; // signed index; positive = net-positive compounding, negative = fragility drag
  note: string;
}

const STRONG_THRESHOLD = 68;
const WEAK_THRESHOLD = 35;
const SYNERGY_WEIGHT = 0.35;
const DRAG_WEIGHT = 0.4;

export function detectCompoundEffects(signals: IntelSignal[]): {
  pairs: CompoundPair[];
  compoundingCount: number;
  fragilityCount: number;
  netCompoundIndex: number;
} {
  const pairs: CompoundPair[] = [];

  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i];
      const b = signals[j];
      const bothStrong = a.value >= STRONG_THRESHOLD && b.value >= STRONG_THRESHOLD;
      const oneWeakOneStrong =
        (a.value <= WEAK_THRESHOLD && b.value >= STRONG_THRESHOLD) ||
        (b.value <= WEAK_THRESHOLD && a.value >= STRONG_THRESHOLD);

      if (bothStrong) {
        const synergy = ((a.value / 100) * (b.value / 100)) * 100 * SYNERGY_WEIGHT;
        pairs.push({
          a: a.label,
          b: b.label,
          aValue: a.value,
          bValue: b.value,
          type: "compounding",
          effect: round1(synergy),
          note: `${a.label} and ${b.label} are both strong — gains in either are likely reinforcing the other, not just adding to it.`,
        });
      } else if (oneWeakOneStrong) {
        const weakVal = Math.min(a.value, b.value);
        const strongVal = Math.max(a.value, b.value);
        const drag = ((strongVal - weakVal) / 100) * 100 * DRAG_WEIGHT * -1;
        pairs.push({
          a: a.label,
          b: b.label,
          aValue: a.value,
          bValue: b.value,
          type: "fragility",
          effect: round1(drag),
          note: `${a.value <= WEAK_THRESHOLD ? a.label : b.label} is weak enough to be capping the value the organization gets from ${strongVal === a.value ? a.label : b.label}.`,
        });
      } else {
        pairs.push({
          a: a.label,
          b: b.label,
          aValue: a.value,
          bValue: b.value,
          type: "neutral",
          effect: 0,
          note: "No strong compounding or fragility interaction detected at current thresholds.",
        });
      }
    }
  }

  const compoundingCount = pairs.filter((p) => p.type === "compounding").length;
  const fragilityCount = pairs.filter((p) => p.type === "fragility").length;
  const netCompoundIndex = round1(pairs.reduce((sum, p) => sum + p.effect, 0));

  return {
    pairs: pairs.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)),
    compoundingCount,
    fragilityCount,
    netCompoundIndex,
  };
}
