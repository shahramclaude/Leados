// src/lib/wargameEngine.ts
// Competitive war-gaming engine.
//
// Exported members referenced elsewhere (exact names):
//   - Move                        (interface, line 12)
//   - RoundScore                  (interface, line 22)
//   - CompetitorProfile           (interface, line 30)
//   - MOVE_CATALOG                (const, line 41)
//   - generateCompetitorProfile   (function, line 79)  — keyword rules
//   - pickLikelyCounterMove       (function, line 112)
//   - scoreWargameRound           (function, line 134)  — "the exact scoring function"
//   - describeMoveOutcome         (function, line 158)

export type MoveAxis = 'market' | 'talent' | 'capital' | 'momentum';

export interface Move {
  id: string;
  name: string;
  axis: MoveAxis;
  /** -100..100 impact this move has on the axis it targets if executed well */
  impact: number;
  description: string;
}

export interface RoundScore {
  market: number;
  talent: number;
  capital: number;
  momentum: number;
}

export interface CompetitorProfile {
  name: string;
  /** 0-1, how often they initiate rather than react */
  aggressiveness: number;
  /** 0-1, willingness to make high-variance bets */
  riskTolerance: number;
  /** 0-1, relative war chest / resourcing vs us */
  resources: number;
  likelyMoves: Move[];
}

export const MOVE_CATALOG: Move[] = [
  { id: 'price_cut', name: 'Aggressive Price Cut', axis: 'market', impact: 22, description: 'undercuts list price to defend/steal share' },
  { id: 'talent_raid', name: 'Targeted Talent Raid', axis: 'talent', impact: 18, description: 'poaches key engineers or AEs with above-market offers' },
  { id: 'feature_leapfrog', name: 'Feature Leapfrog', axis: 'momentum', impact: 20, description: 'ships a headline feature ahead of us to reset the narrative' },
  { id: 'raise_capital', name: 'Opportunistic Capital Raise', axis: 'capital', impact: 25, description: 'raises a war chest to outspend on acquisition' },
  { id: 'bundle_partnership', name: 'Bundle / Channel Partnership', axis: 'market', impact: 15, description: 'locks up distribution via a platform partner' },
  { id: 'fud_campaign', name: 'FUD / Displacement Campaign', axis: 'momentum', impact: 12, description: 'targets our customers directly with comparison content' },
  { id: 'enterprise_push', name: 'Enterprise Segment Push', axis: 'market', impact: 17, description: 'moves upmarket to fight for our largest accounts' },
  { id: 'hold_steady', name: 'Hold Steady', axis: 'momentum', impact: 4, description: 'no material move, continues current roadmap' },
  { id: 'hire_freeze_cut_costs', name: 'Cut Costs / Hiring Freeze', axis: 'capital', impact: 8, description: 'defensive posture to extend their own runway' },
  { id: 'acquire_tuckin', name: 'Tuck-in Acquisition', axis: 'momentum', impact: 19, description: 'buys a smaller player to add capability fast' },
];

const KEYWORD_RULES: Array<{ pattern: RegExp; aggressiveness?: number; riskTolerance?: number; resources?: number }> = [
  { pattern: /price war|undercut|aggressive pricing/i, aggressiveness: 0.25 },
  { pattern: /poach|raid|hiring spree/i, aggressiveness: 0.15, riskTolerance: 0.1 },
  { pattern: /raised|funding round|series [a-e]/i, resources: 0.3 },
  { pattern: /layoffs|hiring freeze|cost cut/i, resources: -0.2, riskTolerance: -0.15 },
  { pattern: /launch|ship|release|feature/i, aggressiveness: 0.1, riskTolerance: 0.1 },
  { pattern: /cautious|slow|conservative/i, aggressiveness: -0.2, riskTolerance: -0.2 },
  { pattern: /acqui(re|sition)/i, resources: 0.15, riskTolerance: 0.1 },
  { pattern: /churn|switching|win-?back/i, aggressiveness: 0.15 },
];

/**
 * generateCompetitorProfile
 * Builds/refreshes a CompetitorProfile by scanning free-text "known data"
 * (e.g. recent competitive intel notes or org event descriptions) for
 * keyword signals, nudging aggressiveness / riskTolerance / resources off
 * a neutral 0.5 baseline, then ranking MOVE_CATALOG into likelyMoves.
 */
export function generateCompetitorProfile(name: string, knownDataText: string): CompetitorProfile {
  let aggressiveness = 0.5;
  let riskTolerance = 0.5;
  let resources = 0.5;

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(knownDataText)) {
      aggressiveness += rule.aggressiveness ?? 0;
      riskTolerance += rule.riskTolerance ?? 0;
      resources += rule.resources ?? 0;
    }
  }
  aggressiveness = clamp01(aggressiveness);
  riskTolerance = clamp01(riskTolerance);
  resources = clamp01(resources);

  const likelyMoves = [...MOVE_CATALOG]
    .sort((a, b) => scoreMoveFit(b, aggressiveness, riskTolerance) - scoreMoveFit(a, aggressiveness, riskTolerance))
    .slice(0, 4);

  return { name, aggressiveness, riskTolerance, resources, likelyMoves };
}

function scoreMoveFit(move: Move, aggressiveness: number, riskTolerance: number): number {
  const riskiness = move.impact / 25; // 0-1ish
  return aggressiveness * (move.impact / 25) + riskTolerance * riskiness;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * pickLikelyCounterMove
 * Given a competitor profile and our move, returns the single most likely
 * counter — the highest-fit move in their likelyMoves list, weighted by
 * aggressiveness/riskTolerance (ties broken toward matching our move's axis).
 */
export function pickLikelyCounterMove(profile: CompetitorProfile, ourMove: Move): Move {
  const scored = profile.likelyMoves.map((m) => ({
    move: m,
    score:
      scoreMoveFit(m, profile.aggressiveness, profile.riskTolerance) +
      (m.axis === ourMove.axis ? 0.35 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.move ?? profile.likelyMoves[0] ?? MOVE_CATALOG[MOVE_CATALOG.length - 2];
}

/**
 * scoreWargameRound
 * The canonical round-scoring function: converts "our move" + "their move"
 * + the competitor's resourcing into a 4-axis RoundScore (0-100 each),
 * representing our relative position after the round plays out.
 */
export function scoreWargameRound(ourMove: Move, theirMove: Move, profile: CompetitorProfile): RoundScore {
  const base: RoundScore = { market: 50, talent: 50, capital: 50, momentum: 50 };

  base[ourMove.axis] += ourMove.impact * 0.6;
  base[theirMove.axis] -= theirMove.impact * (0.5 + profile.resources * 0.3);

  // our move also gives a small cross-axis lift to momentum if it's not the momentum axis
  if (ourMove.axis !== 'momentum') base.momentum += ourMove.impact * 0.15;
  if (theirMove.axis !== 'momentum') base.momentum -= theirMove.impact * 0.1 * profile.aggressiveness;

  (Object.keys(base) as (keyof RoundScore)[]).forEach((k) => {
    base[k] = Math.max(0, Math.min(100, Math.round(base[k])));
  });
  return base;
}

/**
 * describeMoveOutcome
 * Human-readable outcome text for a move, used to compose the board/war-room
 * recommendation copy.
 */
export function describeMoveOutcome(move: Move): string {
  switch (move.axis) {
    case 'market':
      return `strengthens our market position by directly contesting share (${move.description})`;
    case 'talent':
      return `protects our talent base before a competitor can erode it (${move.description})`;
    case 'capital':
      return `improves our capital position relative to competitors (${move.description})`;
    case 'momentum':
    default:
      return `builds narrative momentum ahead of competitive moves (${move.description})`;
  }
}
