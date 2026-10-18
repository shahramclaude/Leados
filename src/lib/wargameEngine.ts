// src/lib/wargameEngine.ts
//
// LEADOS War Game Engine — Part 8: competitive simulation.
//
// Models a multi-round exchange: each round we choose a move (derived from
// free-text strategy input), every competitor profile picks its most likely
// counter-move (deterministic given the same inputs, so re-running a saved
// war game reproduces the same rounds), and the round is scored across four
// axes: market share, talent, capital, momentum. Afterward we analyze the
// rounds for blindspots — competitor moves we didn't rate as likely, or
// rounds where we lost by more than our own model expected.
//
// Pure, dependency-free, no DB calls.

import { clamp, hashSeed, mulberry32 } from "./monteCarlo";

export interface CompetitorProfile {
  name: string;
  aggressiveness: number; // 0-1
  riskTolerance: number; // 0-1
  capitalConstraint: number; // 0-1, 1 = highly constrained
  likelyMoves: string[];
  weaknesses: string[];
}

export interface KnownCompetitorData {
  fundingStage?: string;
  marketPosition?: string;
  recentMoves?: string[];
  notes?: string;
  aggressiveness?: number;
  riskTolerance?: number;
  capitalConstraint?: number;
}

export const MOVE_CATALOG = [
  "price_cut",
  "feature_launch",
  "talent_poach",
  "market_expansion",
  "partnership",
  "acquisition",
  "marketing_blitz",
  "customer_lockin",
  "cost_cutting",
  "pivot",
  "defensive_bundling",
  "do_nothing",
] as const;

export type Move = (typeof MOVE_CATALOG)[number];

const MOVE_LABELS: Record<Move, string> = {
  price_cut: "Price cut",
  feature_launch: "Feature / product launch",
  talent_poach: "Talent poaching",
  market_expansion: "Market expansion",
  partnership: "Strategic partnership",
  acquisition: "Acquisition",
  marketing_blitz: "Marketing blitz",
  customer_lockin: "Customer lock-in / loyalty push",
  cost_cutting: "Cost cutting",
  pivot: "Strategic pivot",
  defensive_bundling: "Defensive bundling",
  do_nothing: "Hold position",
};

// ---------------------------------------------------------------------------
// Competitor profile generation
// ---------------------------------------------------------------------------

const KEYWORD_RULES: { pattern: RegExp; field: "aggressiveness" | "riskTolerance" | "capitalConstraint"; delta: number }[] = [
  { pattern: /aggressiv|land.?grab|blitz|undercut|price war/i, field: "aggressiveness", delta: 0.25 },
  { pattern: /cautious|conservative|slow|bureaucra|legacy/i, field: "aggressiveness", delta: -0.2 },
  { pattern: /well.?funded|raised|series [a-e]|ipo|flush with cash|deep pockets/i, field: "capitalConstraint", delta: -0.3 },
  { pattern: /layoff|struggl|bootstrapp|runway|cash.?strapped|down round/i, field: "capitalConstraint", delta: 0.3 },
  { pattern: /bold|risk.?taking|experiment|bet big/i, field: "riskTolerance", delta: 0.25 },
  { pattern: /risk.?averse|incremental|cautious/i, field: "riskTolerance", delta: -0.2 },
  { pattern: /market leader|dominant|incumbent/i, field: "aggressiveness", delta: 0.1 },
  { pattern: /challenger|upstart|scrappy/i, field: "aggressiveness", delta: 0.2 },
];

export function generateCompetitorProfile(name: string, knownData: KnownCompetitorData = {}): CompetitorProfile {
  const text = [knownData.notes, knownData.marketPosition, knownData.fundingStage, ...(knownData.recentMoves ?? [])]
    .filter(Boolean)
    .join(" . ");

  let aggressiveness = knownData.aggressiveness ?? 0.5;
  let riskTolerance = knownData.riskTolerance ?? 0.5;
  let capitalConstraint = knownData.capitalConstraint ?? 0.5;

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      if (rule.field === "aggressiveness" && knownData.aggressiveness === undefined) aggressiveness += rule.delta;
      if (rule.field === "riskTolerance" && knownData.riskTolerance === undefined) riskTolerance += rule.delta;
      if (rule.field === "capitalConstraint" && knownData.capitalConstraint === undefined) capitalConstraint += rule.delta;
    }
  }

  aggressiveness = clamp(aggressiveness, 0, 1);
  riskTolerance = clamp(riskTolerance, 0, 1);
  capitalConstraint = clamp(capitalConstraint, 0, 1);

  const likelyMoves: Move[] = [];
  if (aggressiveness > 0.6 && capitalConstraint < 0.5) likelyMoves.push("price_cut", "marketing_blitz");
  if (aggressiveness > 0.5) likelyMoves.push("talent_poach", "market_expansion");
  if (riskTolerance > 0.6) likelyMoves.push("acquisition", "pivot");
  if (capitalConstraint > 0.6) likelyMoves.push("cost_cutting", "defensive_bundling");
  if (riskTolerance < 0.4 && aggressiveness < 0.4) likelyMoves.push("customer_lockin", "do_nothing");
  if (aggressiveness > 0.4 && riskTolerance > 0.4) likelyMoves.push("feature_launch", "partnership");
  if (likelyMoves.length === 0) likelyMoves.push("feature_launch", "customer_lockin", "do_nothing");

  const weaknesses: string[] = [];
  if (capitalConstraint > 0.6) weaknesses.push("Limited capital runway — vulnerable to a sustained price or spend war");
  if (aggressiveness > 0.7) weaknesses.push("Overextension risk — rapid moves strain execution and culture");
  if (riskTolerance < 0.3) weaknesses.push("Slow decision cycles — unlikely to respond quickly to fast moves");
  if (riskTolerance > 0.7) weaknesses.push("Pattern of bold bets — exploitable if a bet visibly fails publicly");
  if (aggressiveness < 0.3) weaknesses.push("Passive market posture — cedes ground to faster movers");
  if (weaknesses.length === 0) weaknesses.push("No distinctive weakness identified from available signals — treat as a balanced competitor");

  return {
    name,
    aggressiveness: Math.round(aggressiveness * 100) / 100,
    riskTolerance: Math.round(riskTolerance * 100) / 100,
    capitalConstraint: Math.round(capitalConstraint * 100) / 100,
    likelyMoves: Array.from(new Set(likelyMoves)).map((m) => MOVE_LABELS[m]),
    weaknesses,
  };
}

// ---------------------------------------------------------------------------
// Our move selection (parsed from free-text strategy)
// ---------------------------------------------------------------------------

const STRATEGY_KEYWORD_MOVES: { pattern: RegExp; move: Move }[] = [
  { pattern: /price|discount|undercut/i, move: "price_cut" },
  { pattern: /hire|talent|recruit|poach/i, move: "talent_poach" },
  { pattern: /product|feature|launch|ship/i, move: "feature_launch" },
  { pattern: /expand|new market|geograph|international/i, move: "market_expansion" },
  { pattern: /partner|alliance|ecosystem|channel/i, move: "partnership" },
  { pattern: /acqui|buy|m&a/i, move: "acquisition" },
  { pattern: /marketing|brand|campaign|pr\b/i, move: "marketing_blitz" },
  { pattern: /retain|loyalty|lock.?in|renewal/i, move: "customer_lockin" },
  { pattern: /cut cost|efficien|reduce spend|layoff/i, move: "cost_cutting" },
  { pattern: /pivot|reposition|new model/i, move: "pivot" },
  { pattern: /bundle|platform|suite/i, move: "defensive_bundling" },
];

const DEFAULT_OPENING: Move[] = [
  "market_expansion",
  "feature_launch",
  "talent_poach",
  "partnership",
  "customer_lockin",
  "marketing_blitz",
];

function deriveOurMoveSequence(ourStrategy: string, rounds: number): { move: Move; rationale: string }[] {
  const matched: Move[] = [];
  for (const rule of STRATEGY_KEYWORD_MOVES) {
    if (rule.pattern.test(ourStrategy)) matched.push(rule.move);
  }
  const pool = matched.length > 0 ? matched : DEFAULT_OPENING;
  const sequence: { move: Move; rationale: string }[] = [];
  for (let i = 0; i < rounds; i++) {
    const move = pool[i % pool.length];
    sequence.push({
      move,
      rationale:
        matched.length > 0
          ? `Derived from stated strategy emphasis on "${MOVE_LABELS[move].toLowerCase()}".`
          : `Default opening sequence — strategy text did not clearly signal round ${i + 1}'s priority.`,
    });
  }
  return sequence;
}

// ---------------------------------------------------------------------------
// Competitor response selection (deterministic pseudo-random given seed)
// ---------------------------------------------------------------------------

const COUNTER_MATRIX: Partial<Record<Move, Move[]>> = {
  price_cut: ["price_cut", "defensive_bundling", "cost_cutting"],
  feature_launch: ["feature_launch", "partnership", "marketing_blitz"],
  talent_poach: ["talent_poach", "customer_lockin", "cost_cutting"],
  market_expansion: ["market_expansion", "price_cut", "marketing_blitz"],
  partnership: ["partnership", "acquisition", "feature_launch"],
  acquisition: ["acquisition", "defensive_bundling", "marketing_blitz"],
  marketing_blitz: ["marketing_blitz", "price_cut", "customer_lockin"],
  customer_lockin: ["defensive_bundling", "feature_launch", "price_cut"],
  cost_cutting: ["defensive_bundling", "do_nothing", "customer_lockin"],
  pivot: ["feature_launch", "acquisition", "do_nothing"],
  defensive_bundling: ["defensive_bundling", "feature_launch", "price_cut"],
  do_nothing: ["do_nothing", "customer_lockin"],
};

function chooseCompetitorMove(
  ourMove: Move,
  profile: CompetitorProfile,
  round: number,
): { move: Move; rationale: string } {
  const rand = mulberry32(hashSeed(`${profile.name}:${ourMove}:${round}`));
  const candidates = COUNTER_MATRIX[ourMove] ?? ["do_nothing"];

  // Weight candidates by profile fit.
  const weighted = candidates.map((move) => {
    let weight = 1;
    if (move === "price_cut") weight *= profile.capitalConstraint > 0.6 ? 0.3 : 1 + profile.aggressiveness;
    if (move === "cost_cutting" || move === "defensive_bundling") weight *= profile.capitalConstraint > 0.5 ? 1.6 : 0.8;
    if (move === "acquisition" || move === "pivot") weight *= profile.riskTolerance > 0.5 ? 1.5 : 0.5;
    if (move === "talent_poach" || move === "marketing_blitz") weight *= 0.6 + profile.aggressiveness;
    if (move === "do_nothing") weight *= 1.6 - profile.aggressiveness;
    return { move, weight: Math.max(0.05, weight) };
  });

  const total = weighted.reduce((a, w) => a + w.weight, 0);
  let roll = rand() * total;
  let chosen = weighted[0].move;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) {
      chosen = w.move;
      break;
    }
  }

  const rationale = `${profile.name} (aggressiveness ${(profile.aggressiveness * 100).toFixed(0)}%, capital constraint ${(profile.capitalConstraint * 100).toFixed(0)}%) most plausibly answers "${MOVE_LABELS[ourMove]}" with "${MOVE_LABELS[chosen]}".`;

  return { move: chosen, rationale };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface OutcomeAxes {
  marketShare: number;
  talent: number;
  capital: number;
  momentum: number;
}

function zeroAxes(): OutcomeAxes {
  return { marketShare: 0, talent: 0, capital: 0, momentum: 0 };
}

function addAxes(a: OutcomeAxes, b: OutcomeAxes): OutcomeAxes {
  return {
    marketShare: a.marketShare + b.marketShare,
    talent: a.talent + b.talent,
    capital: a.capital + b.capital,
    momentum: a.momentum + b.momentum,
  };
}

function axesTotal(a: OutcomeAxes): number {
  return a.marketShare + a.talent + a.capital + a.momentum;
}

/** Base impact of a move on the mover's own four axes, before competitive adjustment. */
const MOVE_BASE_IMPACT: Record<Move, OutcomeAxes> = {
  price_cut: { marketShare: 6, talent: 0, capital: -5, momentum: 2 },
  feature_launch: { marketShare: 3, talent: 1, capital: -2, momentum: 5 },
  talent_poach: { marketShare: 1, talent: 6, capital: -3, momentum: 2 },
  market_expansion: { marketShare: 5, talent: 0, capital: -4, momentum: 3 },
  partnership: { marketShare: 3, talent: 1, capital: -1, momentum: 3 },
  acquisition: { marketShare: 7, talent: 3, capital: -8, momentum: 4 },
  marketing_blitz: { marketShare: 4, talent: 0, capital: -4, momentum: 4 },
  customer_lockin: { marketShare: 2, talent: 0, capital: -1, momentum: 2 },
  cost_cutting: { marketShare: -1, talent: -2, capital: 6, momentum: -1 },
  pivot: { marketShare: -2, talent: -1, capital: -2, momentum: 1 },
  defensive_bundling: { marketShare: 2, talent: 0, capital: -2, momentum: 1 },
  do_nothing: { marketShare: 0, talent: 0, capital: 1, momentum: -1 },
};

function scoreExchange(ourMove: Move, competitorMove: Move): { ours: OutcomeAxes; theirs: OutcomeAxes } {
  const ours = { ...MOVE_BASE_IMPACT[ourMove] };
  const theirs = { ...MOVE_BASE_IMPACT[competitorMove] };

  // Direct counters reduce the mover's gain and transfer momentum/share to the responder.
  const sameMove = ourMove === competitorMove;
  if (sameMove) {
    ours.marketShare *= 0.5;
    theirs.marketShare *= 0.5;
    ours.momentum -= 1;
    theirs.momentum -= 1;
  }

  if (competitorMove === "defensive_bundling" && (ourMove === "price_cut" || ourMove === "feature_launch")) {
    ours.marketShare *= 0.6;
    ours.momentum *= 0.7;
  }
  if (competitorMove === "customer_lockin" && ourMove === "price_cut") {
    ours.marketShare *= 0.7;
  }
  if (competitorMove === "talent_poach" && ourMove === "talent_poach") {
    ours.talent *= 0.5;
    theirs.talent *= 0.5;
  }
  if (competitorMove === "do_nothing") {
    ours.momentum += 1;
    ours.marketShare *= 1.1;
  }

  const round2 = (a: OutcomeAxes): OutcomeAxes => ({
    marketShare: Math.round(a.marketShare * 10) / 10,
    talent: Math.round(a.talent * 10) / 10,
    capital: Math.round(a.capital * 10) / 10,
    momentum: Math.round(a.momentum * 10) / 10,
  });

  return { ours: round2(ours), theirs: round2(theirs) };
}

// ---------------------------------------------------------------------------
// Round / result types
// ---------------------------------------------------------------------------

export interface CompetitorRoundMove {
  competitor: string;
  move: string;
  rationale: string;
  outcome: OutcomeAxes;
}

export interface WargameRound {
  round: number;
  ourMove: string;
  ourRationale: string;
  ourOutcome: OutcomeAxes;
  competitorResponses: CompetitorRoundMove[];
  narrative: string;
}

export interface Blindspot {
  round: number;
  competitor: string;
  move: string;
  kind: "unconsidered_move" | "outcome_miss";
  description: string;
  severity: "low" | "medium" | "high";
}

export interface WargameResult {
  context: string;
  ourStrategy: string;
  rounds: WargameRound[];
  ourOutcome: OutcomeAxes & { total: number };
  competitorOutcomes: Record<string, OutcomeAxes & { total: number }>;
  keyInsights: string[];
  blindspots: Blindspot[];
}

export function runWargame(
  context: string,
  ourStrategy: string,
  competitorProfiles: CompetitorProfile[],
  rounds = 5,
): WargameResult {
  const moveSequence = deriveOurMoveSequence(ourStrategy, rounds);

  const roundResults: WargameRound[] = [];
  let ourCumulative = zeroAxes();
  const competitorCumulative: Record<string, OutcomeAxes> = Object.fromEntries(
    competitorProfiles.map((p) => [p.name, zeroAxes()]),
  );

  for (let i = 0; i < rounds; i++) {
    const round = i + 1;
    const { move: ourMove, rationale: ourRationale } = moveSequence[i];

    let ourRoundOutcome = zeroAxes();
    const competitorResponses: CompetitorRoundMove[] = [];

    for (const profile of competitorProfiles) {
      const { move: theirMove, rationale } = chooseCompetitorMove(ourMove, profile, round);
      const { ours, theirs } = scoreExchange(ourMove, theirMove);
      ourRoundOutcome = addAxes(ourRoundOutcome, {
        marketShare: ours.marketShare / competitorProfiles.length,
        talent: ours.talent / competitorProfiles.length,
        capital: ours.capital / competitorProfiles.length,
        momentum: ours.momentum / competitorProfiles.length,
      });
      competitorCumulative[profile.name] = addAxes(competitorCumulative[profile.name], theirs);
      competitorResponses.push({ competitor: profile.name, move: MOVE_LABELS[theirMove], rationale, outcome: theirs });
    }

    ourCumulative = addAxes(ourCumulative, ourRoundOutcome);

    const net = axesTotal(ourRoundOutcome);
    const narrative =
      net > 3
        ? `Round ${round}: "${MOVE_LABELS[ourMove]}" lands well — net advantage to us this round.`
        : net < -3
        ? `Round ${round}: "${MOVE_LABELS[ourMove]}" is effectively countered — net disadvantage this round.`
        : `Round ${round}: "${MOVE_LABELS[ourMove]}" produces a roughly even exchange.`;

    roundResults.push({
      round,
      ourMove: MOVE_LABELS[ourMove],
      ourRationale,
      ourOutcome: {
        marketShare: Math.round(ourRoundOutcome.marketShare * 10) / 10,
        talent: Math.round(ourRoundOutcome.talent * 10) / 10,
        capital: Math.round(ourRoundOutcome.capital * 10) / 10,
        momentum: Math.round(ourRoundOutcome.momentum * 10) / 10,
      },
      competitorResponses,
      narrative,
    });
  }

  const insights = buildKeyInsights(roundResults, competitorProfiles);
  const blindspots = identifyBlindspotsFromWargame(roundResults, competitorProfiles);

  const finishAxes = (a: OutcomeAxes) => ({ ...a, total: Math.round(axesTotal(a) * 10) / 10 });

  return {
    context,
    ourStrategy,
    rounds: roundResults,
    ourOutcome: finishAxes(ourCumulative),
    competitorOutcomes: Object.fromEntries(
      Object.entries(competitorCumulative).map(([name, axes]) => [name, finishAxes(axes)]),
    ),
    keyInsights: insights,
    blindspots,
  };
}

function buildKeyInsights(rounds: WargameRound[], profiles: CompetitorProfile[]): string[] {
  const insights: string[] = [];

  const priceRounds = rounds.filter((r) => r.ourMove === MOVE_LABELS.price_cut);
  if (priceRounds.length > 0) {
    const avgNet = priceRounds.reduce((s, r) => s + axesTotal(r.ourOutcome), 0) / priceRounds.length;
    insights.push(
      avgNet < 2
        ? "Price competition is a losing axis here — competitors match or out-wait price cuts; avoid leading with price."
        : "Price moves land favorably when competitors are capital-constrained — a credible lever early in the game.",
    );
  }

  const talentRounds = rounds.filter((r) => r.ourMove === MOVE_LABELS.talent_poach);
  if (talentRounds.length > 0) {
    insights.push("Talent poaching produces fast momentum/talent gains but invites tit-for-tat counter-poaching — pair it with retention defenses.");
  }

  const matchedCount = rounds.filter((r) => r.competitorResponses.some((c) => c.move === r.ourMove)).length;
  if (matchedCount >= Math.ceil(rounds.length / 2)) {
    insights.push("Competitors mirror our moves more than half the time — differentiated, hard-to-copy moves (ecosystem lock-in, M&A) will outperform imitable ones.");
  }

  const constrained = profiles.filter((p) => p.capitalConstraint > 0.6);
  if (constrained.length > 0) {
    insights.push(`${constrained.map((p) => p.name).join(", ")} ${constrained.length > 1 ? "are" : "is"} capital-constrained — sustained spend-intensive pressure (marketing, price) is likely to force a defensive, not offensive, response.`);
  }

  const aggressive = profiles.filter((p) => p.aggressiveness > 0.65);
  if (aggressive.length > 0) {
    insights.push(`${aggressive.map((p) => p.name).join(", ")} ${aggressive.length > 1 ? "are" : "is"} highly aggressive — expect fast retaliation; build buffer into capital/talent plans before poking this competitor.`);
  }

  const momentumTrend = rounds.map((r) => r.ourOutcome.momentum);
  const trendingDown = momentumTrend.length > 2 && momentumTrend[momentumTrend.length - 1] < momentumTrend[0];
  if (trendingDown) {
    insights.push("Our momentum trends downward across rounds — the current sequence of moves loses steam; consider inserting a differentiated move (partnership or acquisition) mid-sequence.");
  }

  if (insights.length === 0) {
    insights.push("Exchanges are broadly even across rounds — no single axis dominates; sustained execution advantage will decide the outcome, not any one move.");
  }

  return insights;
}

export function identifyBlindspotsFromWargame(
  rounds: WargameRound[],
  profiles: CompetitorProfile[] = [],
): Blindspot[] {
  const blindspots: Blindspot[] = [];
  const profileByName = Object.fromEntries(profiles.map((p) => [p.name, p]));

  for (const round of rounds) {
    const net = axesTotal(round.ourOutcome);

    for (const response of round.competitorResponses) {
      const profile = profileByName[response.competitor];
      const consideredMoves = profile?.likelyMoves ?? [];
      if (profile && consideredMoves.length > 0 && !consideredMoves.includes(response.move)) {
        blindspots.push({
          round: round.round,
          competitor: response.competitor,
          move: response.move,
          kind: "unconsidered_move",
          description: `${response.competitor} chose "${response.move}" in round ${round.round}, a move outside its top profiled likely-moves (${consideredMoves.join(", ")}). Update the profile.`,
          severity: "medium",
        });
      }
    }

    if (net < -6) {
      const worstResponder = [...round.competitorResponses].sort((a, b) => axesTotal(b.outcome) - axesTotal(a.outcome))[0];
      blindspots.push({
        round: round.round,
        competitor: worstResponder?.competitor ?? "unknown",
        move: worstResponder?.move ?? round.ourMove,
        kind: "outcome_miss",
        description: `Round ${round.round} ("${round.ourMove}") lost by more than modeled: net outcome ${net.toFixed(1)}. The response from ${worstResponder?.competitor ?? "the field"} was more effective than the base model anticipated.`,
        severity: net < -10 ? "high" : "medium",
      });
    }
  }

  return blindspots;
}
