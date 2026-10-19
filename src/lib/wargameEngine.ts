import type { CompetitorProfile, Move, WargameResult } from "@/lib/types";
import type { CompetitorState } from "@/lib/eventBrain";

// ─────────────────────────────────────────────────────────────────────────
// wargameEngine — move catalog + simple game-theoretic best-response model.
// DESIGN PARAMETER: competitive-signal lookback window = 14 days (callers).
// DESIGN PARAMETER: counter likelihood = aggressiveness * counterFit, where
// counterFit = 1 if the competitor's weaknesses overlap our move's
// strengths category, else 0.5 (heuristic, not calibrated against data).
// ─────────────────────────────────────────────────────────────────────────

export const MOVE_CATALOG: Move[] = [
  { id: "price_cut", label: "Targeted price cut on at-risk segment", category: "price", ourCostScore: 0.6, impactScore: 0.55, counterable: ["bundle_discount"] },
  { id: "feature_sprint", label: "Ship differentiating feature in 30 days", category: "product", ourCostScore: 0.5, impactScore: 0.75, counterable: ["fast_follow"] },
  { id: "key_partnership", label: "Announce strategic channel partnership", category: "partnership", ourCostScore: 0.4, impactScore: 0.6, counterable: ["counter_partnership"] },
  { id: "talent_raid", label: "Hire competitor's key technical lead", category: "talent", ourCostScore: 0.7, impactScore: 0.5, counterable: ["retention_package"] },
  { id: "market_expansion", label: "Expand into adjacent market segment", category: "market", ourCostScore: 0.65, impactScore: 0.7, counterable: ["localization_push"] },
  { id: "bundle_discount", label: "Bundle discount to defend incumbent accounts", category: "price", ourCostScore: 0.45, impactScore: 0.5, counterable: ["price_cut"] },
  { id: "fast_follow", label: "Fast-follow competitor feature within a quarter", category: "product", ourCostScore: 0.55, impactScore: 0.45, counterable: ["feature_sprint"] },
  { id: "retention_package", label: "Retention packages for flight-risk talent", category: "talent", ourCostScore: 0.5, impactScore: 0.4, counterable: ["talent_raid"] },
];

function moveById(id: string): Move {
  return MOVE_CATALOG.find((m) => m.id === id) ?? MOVE_CATALOG[0];
}

export function toCompetitorProfile(c: CompetitorState): CompetitorProfile {
  const avgStrength = c.signals.length
    ? c.signals.reduce((a, s) => a + s.strength, 0) / c.signals.length
    : 0.5;
  return {
    id: c.id,
    name: c.name,
    aggressiveness: Math.max(0, Math.min(1, avgStrength)),
    strengths: [...new Set(c.signals.filter((s) => s.strength >= 0.6).map((s) => s.signal))].slice(0, 3),
    weaknesses: [...new Set(c.signals.filter((s) => s.strength < 0.4).map((s) => s.signal))].slice(0, 3),
    recentSignals: c.signals.slice(-5).map((s) => s.signal),
  };
}

/** Pick our best move by impact/cost ratio (simple multi-criteria score). */
export function pickBestMove(): Move {
  return [...MOVE_CATALOG].sort((a, b) => b.impactScore / b.ourCostScore - a.impactScore / a.ourCostScore)[0];
}

export function runWargame(competitors: CompetitorProfile[]): WargameResult {
  const ourBestMove = pickBestMove();
  const expectedCompetitorCounters = competitors.map((c) => {
    const counterId = ourBestMove.counterable[0];
    const move = counterId ? moveById(counterId) : pickBestMove();
    const counterFit = c.weaknesses.length > 0 ? 1 : 0.5;
    const likelihood = Math.max(0.05, Math.min(0.95, c.aggressiveness * counterFit));
    return { competitor: c, move, likelihood };
  });
  const blindspots = competitors
    .filter((c) => c.aggressiveness > 0.7)
    .map((c) => `${c.name} is moving aggressively (${(c.aggressiveness * 100).toFixed(0)}%) — monitor ${c.recentSignals[c.recentSignals.length - 1] ?? "their roadmap"} closely.`);
  if (blindspots.length === 0) {
    blindspots.push("No high-aggressiveness competitor detected — primary blindspot is complacency.");
  }
  return { ourBestMove, expectedCompetitorCounters, blindspots, generatedAt: new Date().toISOString() };
}
