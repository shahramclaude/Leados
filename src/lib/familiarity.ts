// src/lib/familiarity.ts
// Session-scoped familiarity tracking (client-side UI adaptation — how many
// times a manager has viewed a given finding/card this browser session),
// kept out of the durable store intentionally: resetting a UI-adaptation
// counter should never be able to touch real business events.
//
// WIRED: src/lib/peopleIntelligence.ts cannot call the sessionStorage-backed
// functions below from the server, so it uses the pure `tierFor` +
// `familiarityScoreFromCounts` helpers (no browser APIs) to compute a
// manager's "familiarity" with a given person's record, from the person's
// event volume as a server-safe proxy for session view count.

export type FamiliarityTier = "NOVEL" | "LEARNING" | "FAMILIAR" | "HABITUATED";

const FAMILIARITY_KEY = "leados.familiarity.views.v1";
const FAMILIARITY_NOTIFIED_KEY = "leados.familiarity.notified.v1";

interface FamiliarityStore {
  views: Record<string, number>; // findingId -> view count, this session
}

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readStore(): FamiliarityStore {
  if (!hasSessionStorage()) return { views: {} };
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
  if (!hasSessionStorage()) return;
  sessionStorage.setItem(FAMILIARITY_KEY, JSON.stringify(store));
}

/** Call once per render of a given finding card; returns the tier AFTER incrementing. (Client-only.) */
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
 *
 * Pure function — safe to call on the server.
 */
export function tierFor(sessionViews: number, crossSessionResolvedCount = 0): FamiliarityTier {
  if (sessionViews >= 10 || crossSessionResolvedCount >= 8) return "HABITUATED";
  if (sessionViews >= 3) return "FAMILIAR";
  if (sessionViews >= 1) return "LEARNING";
  return "NOVEL";
}

/** Returns true exactly once per finding per session the first time it reaches a tier beyond NOVEL->LEARNING transition boundary used for the toast. (Client-only.) */
export function shouldNotifyCompaction(findingId: string, tier: FamiliarityTier): boolean {
  if (tier !== "FAMILIAR" && tier !== "HABITUATED") return false;
  if (!hasSessionStorage()) return false;
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
  if (!hasSessionStorage()) return;
  sessionStorage.removeItem(FAMILIARITY_KEY);
  sessionStorage.removeItem(FAMILIARITY_NOTIFIED_KEY);
}

const TIER_SCORE: Record<FamiliarityTier, number> = {
  NOVEL: 10,
  LEARNING: 35,
  FAMILIAR: 65,
  HABITUATED: 90,
};

/**
 * Server-safe numeric familiarity score (0-100) for a person's record.
 * `interactionCount` = number of events logged about this person in the
 * lookback window (proxy for "session views" since there is no real browser
 * session on the server); `resolvedActionItems` maps to the
 * crossSessionResolvedCount parameter of tierFor. Reuses the exact same
 * tier function/thresholds as the client-side familiarity tracker above —
 * own derivation for the interactionCount proxy, cited thresholds from
 * tierFor().
 */
export function familiarityScoreFromCounts(interactionCount: number, resolvedActionItems: number): number {
  const tier = tierFor(interactionCount, resolvedActionItems);
  return TIER_SCORE[tier];
}
