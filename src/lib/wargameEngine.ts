// src/lib/wargameEngine.ts
//
// BOOTSTRAP NOTE: see scenarioEngine.ts — legacy standalone stub, not wired
// into the Part-1 belief-coupled orchestrator.

export interface WargameResult {
  move: string;
  counterMove: string;
}

export function runWargame(): WargameResult[] {
  return [{ move: "competitor-price-cut", counterMove: "bundle-discount" }];
}
