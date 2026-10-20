/**
 * wargame.ts — Part 06 section F: core multi-actor competitive simulation.
 *
 * A round-based game: in each round, actors move SEQUENTIALLY in a fixed
 * turn order and each actor observes the actions already taken by other
 * actors earlier in the same round (not just previous rounds) before
 * choosing its own action — this is the "sequential moves with observed
 * actions" requirement. A stochastic market/environment shock is drawn
 * once per round from the seeded RNG. Deterministic per seed: same seed +
 * same actor strategy assignment => bit-identical trajectory.
 */
import type { Rng } from "@/lib/prng";
import { createRng } from "@/lib/prng";

export type ActionKind = "aggressive" | "defensive" | "invest" | "hold";

export interface WargameAction {
  actorId: string;
  kind: ActionKind;
  magnitude: number; // 0..1, strategy-specific intensity
}

export interface ActorState {
  id: string;
  name: string;
  strategyName: StrategyName;
  marketShare: number; // 0..1, sums to 1 across actors
  cash: number;
  score: number;
}

export interface StrategyContext {
  self: ActorState;
  others: ActorState[];
  round: number;
  actionsThisRoundSoFar: WargameAction[];
  actionsHistory: WargameAction[][]; // one array per past round
  rng: Rng;
}

export type Strategy = (ctx: StrategyContext) => WargameAction;

export type StrategyName = "aggressive" | "defensive" | "titForTat" | "random" | "investor";

export const STRATEGIES: Record<StrategyName, Strategy> = {
  aggressive: ({ self }) => ({ actorId: self.id, kind: "aggressive", magnitude: 0.8 }),
  defensive: ({ self }) => ({ actorId: self.id, kind: "defensive", magnitude: 0.6 }),
  investor: ({ self }) => ({ actorId: self.id, kind: "invest", magnitude: 0.7 }),
  random: ({ self, rng }) => {
    const kinds: ActionKind[] = ["aggressive", "defensive", "invest", "hold"];
    return { actorId: self.id, kind: rng.pick(kinds), magnitude: rng.next() };
  },
  titForTat: ({ self, actionsThisRoundSoFar, actionsHistory }) => {
    // Mirror the most aggressive action observed so far this round; if none
    // yet, mirror the opponent's action from the previous round; default
    // to defensive on round 1 with nothing observed.
    const observedThisRound = actionsThisRoundSoFar.find((a) => a.kind === "aggressive");
    if (observedThisRound) return { actorId: self.id, kind: "aggressive", magnitude: observedThisRound.magnitude };
    const lastRound = actionsHistory[actionsHistory.length - 1];
    const lastAggressive = lastRound?.find((a) => a.actorId !== self.id && a.kind === "aggressive");
    if (lastAggressive) return { actorId: self.id, kind: "aggressive", magnitude: lastAggressive.magnitude };
    return { actorId: self.id, kind: "defensive", magnitude: 0.5 };
  },
};

export interface WargameSpec {
  actors: Array<{ id: string; name: string; strategyName: StrategyName }>;
  rounds: number;
  shockProbability: number; // probability of a market shock each round
  shockMagnitude: number; // max fractional market-size swing from a shock
  seed: string | number;
}

export interface RoundRecord {
  round: number;
  shock: number; // multiplicative market-size factor applied this round (1 = no shock)
  actions: WargameAction[];
  marketShareAfter: Record<string, number>;
  scoreAfter: Record<string, number>;
}

export interface WargameRunResult {
  rounds: RoundRecord[];
  finalScores: Record<string, number>;
  finalMarketShare: Record<string, number>;
  winnerActorId: string;
  assumptions: {
    payoffModel: "linear-share-transfer-v1";
    shockProbability: number;
    shockMagnitude: number;
  };
}

/** Payoff/market-dynamics step for one round, given this round's actions. */
function applyRound(states: Map<string, ActorState>, actions: WargameAction[], shock: number): void {
  const actorIds = [...states.keys()];
  // Aggressive actions take market share from others proportional to
  // magnitude; invest grows the actor's own long-run score at a cash cost;
  // defensive protects cash and share; hold does nothing.
  let totalAggression = 0;
  for (const a of actions) if (a.kind === "aggressive") totalAggression += a.magnitude;

  for (const a of actions) {
    const self = states.get(a.actorId)!;
    if (a.kind === "aggressive") {
      const shareGain = Math.min(0.15, 0.1 * a.magnitude) * shock;
      let remainingToTake = shareGain;
      for (const otherId of actorIds) {
        if (otherId === a.actorId) continue;
        const other = states.get(otherId)!;
        const take = Math.min(other.marketShare * 0.3, remainingToTake / Math.max(1, actorIds.length - 1));
        other.marketShare -= take;
        self.marketShare += take;
        remainingToTake -= take;
      }
      self.cash -= 5 * a.magnitude; // price war erodes margin
      self.score += self.marketShare * 10 * shock;
    } else if (a.kind === "defensive") {
      self.cash += 3 * a.magnitude;
      self.score += self.marketShare * 8 * shock;
    } else if (a.kind === "invest") {
      self.cash -= 4 * a.magnitude;
      self.score += self.marketShare * 9 * shock + 2 * a.magnitude; // long-run payoff bump
    } else {
      self.score += self.marketShare * 7 * shock;
    }
  }

  // Renormalize market shares to sum to 1 (numerical drift guard).
  const total = [...states.values()].reduce((s, a) => s + a.marketShare, 0);
  if (total > 0) for (const a of states.values()) a.marketShare = Math.max(0, a.marketShare / total);
}

export function runWargame(spec: WargameSpec): WargameRunResult {
  const rng = createRng(spec.seed);
  const states = new Map<string, ActorState>();
  const n = spec.actors.length;
  for (const a of spec.actors) {
    states.set(a.id, { id: a.id, name: a.name, strategyName: a.strategyName, marketShare: 1 / n, cash: 100, score: 0 });
  }

  const actionsHistory: WargameAction[][] = [];
  const rounds: RoundRecord[] = [];

  for (let round = 0; round < spec.rounds; round++) {
    const shockRng = rng.substream(`shock#${round}`);
    const shockOccurs = shockRng.bool(spec.shockProbability);
    const shock = shockOccurs ? 1 + (shockRng.next() * 2 - 1) * spec.shockMagnitude : 1;

    const actionsThisRound: WargameAction[] = [];
    for (const actorSpec of spec.actors) {
      const self = states.get(actorSpec.id)!;
      const others = spec.actors.filter((o) => o.id !== actorSpec.id).map((o) => states.get(o.id)!);
      const strategy = STRATEGIES[actorSpec.strategyName];
      const actionRng = rng.substream(`actor:${actorSpec.id}:round:${round}`);
      const action = strategy({ self, others, round, actionsThisRoundSoFar: actionsThisRound, actionsHistory, rng: actionRng });
      actionsThisRound.push(action);
    }

    applyRound(states, actionsThisRound, shock);
    actionsHistory.push(actionsThisRound);

    rounds.push({
      round,
      shock,
      actions: actionsThisRound,
      marketShareAfter: Object.fromEntries([...states.values()].map((s) => [s.id, s.marketShare])),
      scoreAfter: Object.fromEntries([...states.values()].map((s) => [s.id, s.score])),
    });
  }

  const finalScores = Object.fromEntries([...states.values()].map((s) => [s.id, s.score]));
  const finalMarketShare = Object.fromEntries([...states.values()].map((s) => [s.id, s.marketShare]));
  const winnerActorId = Object.entries(finalScores).sort((a, b) => b[1] - a[1])[0][0];

  return {
    rounds,
    finalScores,
    finalMarketShare,
    winnerActorId,
    assumptions: {
      payoffModel: "linear-share-transfer-v1",
      shockProbability: spec.shockProbability,
      shockMagnitude: spec.shockMagnitude,
    },
  };
}
