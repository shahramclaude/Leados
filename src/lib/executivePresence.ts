// executive_presence — executive presence measurement.
//
// PROVENANCE: pasted "pt-O" brief names `js/executive_presence.js`. Not found
// in github.com/wbweve/Leados this session. The three-factor structure
// (Gravitas / Communication / Appearance) is modeled on the real, citable
// "executive presence" construct popularized by Sylvia Ann Hewlett / Center
// for Talent Innovation research (gravitas weighted heaviest in that work) —
// the weighting below follows that reported emphasis; the scoring math and
// UI are original to this delivery, not a reproduction of any proprietary
// assessment instrument.

import type { ExecutivePresenceInputs } from "./types";
import { round1 } from "./prng";

export interface ExecutivePresenceResult {
  gravitas: number;
  communication: number;
  appearance: number;
  composite: number;
  band: "Developing" | "Credible" | "Commanding" | "Magnetic";
  weakestFactor: "gravitas" | "communication" | "appearance";
}

// Disclosed weighting, following the commonly-reported emphasis in the
// Hewlett/CTI framework (gravitas > communication > appearance).
const WEIGHTS = { gravitas: 0.5, communication: 0.3, appearance: 0.2 };

function bandFor(score: number): ExecutivePresenceResult["band"] {
  if (score >= 82) return "Magnetic";
  if (score >= 65) return "Commanding";
  if (score >= 45) return "Credible";
  return "Developing";
}

export function computeExecutivePresence(input: ExecutivePresenceInputs): ExecutivePresenceResult {
  const composite = round1(
    input.gravitas * WEIGHTS.gravitas + input.communication * WEIGHTS.communication + input.appearance * WEIGHTS.appearance
  );
  const entries = Object.entries(input) as [keyof ExecutivePresenceInputs, number][];
  const weakest = entries.sort((a, b) => a[1] - b[1])[0][0];

  return {
    gravitas: input.gravitas,
    communication: input.communication,
    appearance: input.appearance,
    composite,
    band: bandFor(composite),
    weakestFactor: weakest,
  };
}

export function executivePresenceSignal(input: ExecutivePresenceInputs): number {
  return computeExecutivePresence(input).composite;
}
