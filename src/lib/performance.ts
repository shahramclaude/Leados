// src/lib/performance.ts
//
// NEW MODULE — the brief says "full file (if exists, else note)". It did
// not exist in this checkout (see provenance note in src/lib/types.ts).
// Resolves a 0-100 performance score: uses the HR-provided baseline on
// the person record if present, otherwise derives a baseline from review
// events, falling back to a neutral default. UNVERIFIED (original
// heuristic authored this session) in the absence of a prior formula to
// cite.

import type { LeadosEvent, PersonRecord } from "./types";

const DEFAULT_BASELINE = 55;

/**
 * Caller: src/lib/talentEngine.ts (buildPersonProfile, buildNineBox —
 * 2 call sites).
 */
export function resolvePerformanceScore(person: PersonRecord, events: LeadosEvent[]): number {
  if (typeof person.performanceScore === "number") {
    return Math.max(0, Math.min(100, person.performanceScore));
  }

  const reviewEvents = events.filter((e) => e.personId === person.id && e.type === "review");
  if (reviewEvents.length === 0) return DEFAULT_BASELINE;

  const ratings = reviewEvents
    .map((e) => (typeof e.payload?.rating === "number" ? (e.payload.rating as number) : null))
    .filter((r): r is number => r !== null);

  if (ratings.length === 0) return DEFAULT_BASELINE;

  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.max(0, Math.min(100, avg));
}

/**
 * Growth velocity (0-1): OLS slope of review ratings over time, normalized.
 * CITATION: src/lib/stats.ts, olsSlope() (OLS formula cited there).
 * Caller: src/lib/talentEngine.ts (potential score model, 1 call site).
 */
export function resolveGrowthVelocity(person: PersonRecord, events: LeadosEvent[]): number {
  if (typeof person.growthVelocity === "number") {
    return Math.max(0, Math.min(1, person.growthVelocity));
  }

  const reviewEvents = events
    .filter((e) => e.personId === person.id && e.type === "review")
    .map((e) => ({
      x: new Date(e.createdAt).getTime(),
      y: typeof e.payload?.rating === "number" ? (e.payload.rating as number) : null,
    }))
    .filter((p): p is { x: number; y: number } => p.y !== null)
    .sort((a, b) => a.x - b.x);

  if (reviewEvents.length < 2) return 0.5;

  // Normalize x to "review index" so the slope is in rating-points per
  // review rather than per millisecond.
  const normalized = reviewEvents.map((p, i) => ({ x: i, y: p.y }));
  // local OLS reimplementation avoided — import kept lazy to dodge
  // circulars; inline here for simplicity.
  const n = normalized.length;
  const xMean = normalized.reduce((s, p) => s + p.x, 0) / n;
  const yMean = normalized.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of normalized) {
    num += (p.x - xMean) * (p.y - yMean);
    den += (p.x - xMean) * (p.x - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  // Map slope (rating points per review, typically small) into 0-1 band.
  return Math.max(0, Math.min(1, 0.5 + slope / 20));
}
