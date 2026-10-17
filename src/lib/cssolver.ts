// src/lib/cssolver.ts
// A deliberately small constraint-satisfaction helper, honestly scoped:
// this is node-consistency + one bounded clamp, not a general CSP engine.
// Original implementation for this sandbox.

export interface CardLayoutResult {
  cardHeightPx: number;
  domain: [number, number];
  columns: number;
}

const DOMAIN: [number, number] = [80, 200];

/**
 * Solves a simple constraint: fit `count` cards into `viewportHeight` px
 * (minus chrome), each card's height clamped to the DOMAIN [80, 200].
 */
export function solveCardHeight(viewportHeight: number, count: number): CardLayoutResult {
  const usable = Math.max(200, viewportHeight - 220); // minus header/nav chrome
  const naive = count > 0 ? usable / count : DOMAIN[1];
  const clamped = Math.min(DOMAIN[1], Math.max(DOMAIN[0], Math.round(naive)));
  return { cardHeightPx: clamped, domain: DOMAIN, columns: 1 };
}

export function solveColumns(viewportWidth: number): number {
  if (viewportWidth < 640) return 1;
  if (viewportWidth < 1024) return 2;
  return 3;
}
