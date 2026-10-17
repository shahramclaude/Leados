// src/lib/familiarity.ts
// Session-scoped familiarity tracking, intentionally kept out of the
// durable localStorage store (same separation-of-concerns reasoning the
// upstream repo's README states for its own familiarity keys — resetting
// a UI-adaptation counter should never be able to touch real business
// events). Implementation is original to this sandbox.

import { FAMILIARITY_KEY, FAMILIARITY_NOTIFIED_KEY } from "./core";

export type FamiliarityTier = "NOVEL" | "LEARNING" | "FAMILIAR" | "HABITUATED";

interface FamiliarityStore {
  views: Record<string, number>; // findingId -> view count, this session
}

function readStore(): FamiliarityStore {
  try {
    const raw = sessionStorage.getItem(FAMILIARITY_KEY);
    if (!raw) return { views: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.views !== "object") return { views: {} };
    return parsed;
  } catch {
    return { views: {} };
  }
}

function writeStore(store: FamiliarityStore) {
  sessionStorage.setItem(FAMILIARITY_KEY, JSON.stringify(store));
}

/** Call once per render of a given finding card; returns the tier AFTER incrementing. */
export function registerView(findingId: string, crossSessionResolvedCount = 0): FamiliarityTier {
  const store = readStore();
  store.views[findingId] = (store.views[findingId] || 0) + 1;
  writeStore(store);
  return tierFor(store.views[findingId], crossSessionResolvedCount);
}

export function currentViews(findingId: string): number {
  return readStore().views[findingId] || 0;
}

/**
 * Tier thresholds (this build's own rule, disclosed):
 *  NOVEL:      0 session views
 *  LEARNING:   1-2 session views
 *  FAMILIAR:   3-9 session views (and < habituation threshold)
 *  HABITUATED: 10+ session views OR 8+ cross-session resolutions of this finding
 */
export function tierFor(sessionViews: number, crossSessionResolvedCount = 0): FamiliarityTier {
  if (sessionViews >= 10 || crossSessionResolvedCount >= 8) return "HABITUATED";
  if (sessionViews >= 3) return "FAMILIAR";
  if (sessionViews >= 1) return "LEARNING";
  return "NOVEL";
}

/** Returns true exactly once per finding per session the first time it reaches a tier beyond NOVEL->LEARNING transition boundary used for the toast. */
export function shouldNotifyCompaction(findingId: string, tier: FamiliarityTier): boolean {
  if (tier !== "FAMILIAR" && tier !== "HABITUATED") return false;
  try {
    const raw = sessionStorage.getItem(FAMILIARITY_NOTIFIED_KEY);
    const notified: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    if (notified[findingId]) return false;
    notified[findingId] = true;
    sessionStorage.setItem(FAMILIARITY_NOTIFIED_KEY, JSON.stringify(notified));
    return true;
  } catch {
    return false;
  }
}

export function resetFamiliarity() {
  sessionStorage.removeItem(FAMILIARITY_KEY);
  sessionStorage.removeItem(FAMILIARITY_NOTIFIED_KEY);
}
