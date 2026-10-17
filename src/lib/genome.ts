// genome.ts — a tiny behavioral-ratio heuristic, explicitly NOT a
// psychological assessment. ORIGINAL to this build; reconstructed only from
// the trait NAME and threshold idea in the pasted pt-K brief
// ("DEVELOPER trait: ratio of plans/direct > 0.5 → expressed"), since no
// genome.js source was found in wbweve/Leados's real tree to copy from.
//
// Method: counts two self-reported event "styles" the user logs on the
// Today view (plan vs direct), and reports a ratio-based label. This is
// observation of THIS SESSION'S logged behavior only — tiny sample sizes,
// no validation, no claim of measuring personality or leadership style.

export type GenomeTrait = "DEVELOPER" | "DIRECTOR" | "BALANCED";

export interface GenomeProfile {
  name: GenomeTrait;
  ratio: number; // plans / max(direct,1)
  plans: number;
  directs: number;
  confidence: "low" | "medium"; // always "low" below 10 total samples
  note: string;
}

const THRESHOLD = 0.5;

export function identify(plans: number, directs: number): GenomeProfile {
  const ratio = plans / Math.max(directs, 1);
  const total = plans + directs;
  const confidence: GenomeProfile["confidence"] = total >= 10 ? "medium" : "low";
  let name: GenomeTrait;
  if (ratio > 1 + THRESHOLD) name = "DEVELOPER";
  else if (ratio < 1 - THRESHOLD) name = "DIRECTOR";
  else name = "BALANCED";
  return {
    name,
    ratio: +ratio.toFixed(2),
    plans,
    directs,
    confidence,
    note: "Heuristic behavioral ratio over self-logged entries in this browser only — not a validated instrument.",
  };
}
