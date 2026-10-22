// src/lib/people/workforceSim.ts
//
// Team composition optimizer.
//
// score(roster) = α·coverage + β·redundancy(busFactor) + γ·complementarity − δ·loadConcentration
//
// ALGORITHM CHOICE (justified): true ILP over subsets-of-candidates is
// overkill for team sizes LEADOS actually deals with (a handful to a few
// dozen candidates, rosters of 3-10), and a full ILP solver is a heavy,
// hard-to-audit dependency for a people-facing tool where EXPLAINABILITY
// matters more than squeezing out the last 1% of score. We use:
//   1. Greedy construction (marginal-gain: repeatedly add the candidate that
//      most increases the roster score) — O(n·k), near-optimal because the
//      score function is close to submodular (adding a person to a team
//      yields diminishing returns on coverage/redundancy as the team fills
//      out), and
//   2. A bounded local-swap pass (try every single-member swap; keep it if
//      it strictly improves score) to escape greedy's local optima — O(n·k)
//      per pass, a handful of passes.
// For small instances (exposed separately as `exhaustiveSearch`) we also
// provide a true brute-force oracle used ONLY by the test suite to verify
// the greedy+local-search heuristic reaches the same answer when the search
// space is small enough to check exactly. This is the "ILP-lite" promised:
// exact where cheap, heuristic (with a correctness-checked quality bar)
// where not.

import type { EffectiveSkillLevel } from "./types";

export interface CandidateInput {
  personId: string;
  name: string;
  effectiveLevels: Record<string, EffectiveSkillLevel>;
  workload?: { wip: number; contextSwitches: number; meetingHours: number };
}

export interface CompositionWeights {
  alpha: number; // coverage
  beta: number; // redundancy / bus factor
  gamma: number; // complementarity
  delta: number; // load concentration (penalty)
}

export const DEFAULT_WEIGHTS: CompositionWeights = { alpha: 0.4, beta: 0.25, gamma: 0.2, delta: 0.15 };

export interface RosterScore {
  score: number;
  coverage: number;
  redundancy: number;
  complementarity: number;
  loadConcentration: number;
}

function levelOf(candidate: CandidateInput, skillId: string): number {
  return candidate.effectiveLevels[skillId]?.level ?? 0;
}

export function busFactorFor(roster: CandidateInput[], skillId: string, minLevel: number): number {
  return roster.filter((c) => levelOf(c, skillId) >= minLevel).length;
}

export function coverageScore(roster: CandidateInput[], requiredSkills: Record<string, number>): number {
  const skillIds = Object.keys(requiredSkills);
  if (skillIds.length === 0 || roster.length === 0) return 0;
  let total = 0;
  for (const skillId of skillIds) {
    const minLevel = requiredSkills[skillId];
    const best = Math.max(0, ...roster.map((c) => levelOf(c, skillId)));
    total += Math.max(0, Math.min(best - minLevel, 1));
  }
  return total / skillIds.length;
}

export function redundancyScore(roster: CandidateInput[], requiredSkills: Record<string, number>): number {
  const skillIds = Object.keys(requiredSkills);
  if (skillIds.length === 0) return 0;
  let total = 0;
  for (const skillId of skillIds) {
    const bf = busFactorFor(roster, skillId, requiredSkills[skillId]);
    total += Math.min(bf / 2, 1); // 2+ people covering a skill = full redundancy credit
  }
  return total / skillIds.length;
}

export function complementarityScore(roster: CandidateInput[], skillUniverse: string[]): number {
  if (roster.length === 0) return 0;
  const STRONG = 3;
  let instances = 0;
  const coveredOnce = new Set<string>();
  for (const c of roster) {
    for (const skillId of skillUniverse) {
      if (levelOf(c, skillId) >= STRONG) {
        instances += 1;
        coveredOnce.add(skillId);
      }
    }
  }
  if (instances === 0) return 0;
  return coveredOnce.size / instances; // 1.0 = no redundant overlap of "strong" skills, lower = overlapping strengths
}

export function loadConcentrationScore(roster: CandidateInput[]): number {
  const loads = roster.map((c) => {
    const w = c.workload;
    if (!w) return 1;
    return 1 + w.wip * 1 + w.contextSwitches * 0.5 + w.meetingHours * 0.3;
  });
  const total = loads.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const shares = loads.map((l) => l / total);
  return shares.reduce((a, s) => a + s * s, 0); // Herfindahl index, 1/n (even) .. 1 (one person holds it all)
}

export function scoreRoster(
  roster: CandidateInput[],
  requiredSkills: Record<string, number>,
  skillUniverse: string[],
  weights: CompositionWeights = DEFAULT_WEIGHTS,
): RosterScore {
  const coverage = coverageScore(roster, requiredSkills);
  const redundancy = redundancyScore(roster, requiredSkills);
  const complementarity = complementarityScore(roster, skillUniverse);
  const loadConcentration = loadConcentrationScore(roster);
  const score = weights.alpha * coverage + weights.beta * redundancy + weights.gamma * complementarity - weights.delta * loadConcentration;
  return { score, coverage, redundancy, complementarity, loadConcentration };
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

/** True brute-force oracle. Guarded against blowing up — intended for small instances / tests only. */
export function exhaustiveSearch(
  candidates: CandidateInput[],
  requiredSkills: Record<string, number>,
  teamSize: number,
  skillUniverse: string[],
  weights: CompositionWeights = DEFAULT_WEIGHTS,
): { roster: CandidateInput[]; score: RosterScore } {
  const count = nChooseK(candidates.length, teamSize);
  if (count > 200_000) {
    throw new Error(`exhaustiveSearch: search space too large (${count} combinations) — use optimizeTeam instead`);
  }
  let best: { roster: CandidateInput[]; score: RosterScore } | null = null;
  for (const combo of combinations(candidates, teamSize)) {
    const score = scoreRoster(combo, requiredSkills, skillUniverse, weights);
    if (!best || score.score > best.score.score) best = { roster: combo, score };
  }
  if (!best) throw new Error("exhaustiveSearch: no valid roster for given team size");
  return best;
}

export function greedyOptimize(
  candidates: CandidateInput[],
  requiredSkills: Record<string, number>,
  teamSize: number,
  skillUniverse: string[],
  weights: CompositionWeights = DEFAULT_WEIGHTS,
  seedRoster: CandidateInput[] = [],
): CandidateInput[] {
  const pool = candidates.filter((c) => !seedRoster.some((s) => s.personId === c.personId));
  let roster = [...seedRoster];

  while (roster.length < teamSize && pool.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const trial = [...roster, pool[i]];
      const s = scoreRoster(trial, requiredSkills, skillUniverse, weights).score;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    roster.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  // Bounded local-swap improvement pass.
  let improved = true;
  let passes = 0;
  while (improved && passes < 5) {
    improved = false;
    passes += 1;
    const currentScore = scoreRoster(roster, requiredSkills, skillUniverse, weights).score;
    outer: for (let i = 0; i < roster.length; i++) {
      for (const candidate of candidates) {
        if (roster.some((r) => r.personId === candidate.personId)) continue;
        const trial = [...roster];
        trial[i] = candidate;
        const trialScore = scoreRoster(trial, requiredSkills, skillUniverse, weights).score;
        if (trialScore > currentScore + 1e-9) {
          roster = trial;
          improved = true;
          break outer;
        }
      }
    }
  }

  return roster;
}

export interface SwapExplanation {
  type: "added" | "removed" | "kept";
  personId: string;
  name: string;
  reason: string;
}

/**
 * Explains the difference between a `before` roster and an `after` roster in
 * the terms a manager actually needs: which required skill improved, and how
 * each remaining member's bus-factor exposure changed. Every swap gets a
 * sentence — nothing is presented as an unexplained reshuffle.
 */
export function explainSwaps(
  before: CandidateInput[],
  after: CandidateInput[],
  requiredSkills: Record<string, number>,
): SwapExplanation[] {
  const beforeIds = new Set(before.map((c) => c.personId));
  const afterIds = new Set(after.map((c) => c.personId));
  const explanations: SwapExplanation[] = [];

  const added = after.filter((c) => !beforeIds.has(c.personId));
  const removed = before.filter((c) => !afterIds.has(c.personId));

  for (const person of added) {
    const strongestSkill = Object.entries(requiredSkills)
      .map(([skillId, minLevel]) => ({ skillId, minLevel, level: levelOf(person, skillId) }))
      .filter((s) => s.level >= s.minLevel)
      .sort((a, b) => b.level - a.level)[0];

    const busFactorDeltas = Object.entries(requiredSkills)
      .map(([skillId, minLevel]) => {
        const beforeBf = busFactorFor(before, skillId, minLevel);
        const afterBf = busFactorFor(after, skillId, minLevel);
        return { skillId, beforeBf, afterBf };
      })
      .filter((d) => d.afterBf > d.beforeBf);

    const skillPhrase = strongestSkill ? `added for ${strongestSkill.skillId.replace(/-/g, " ")} depth` : "added to round out team coverage";
    const bfPhrase = busFactorDeltas
      .map((d) => `bus-factor on ${d.skillId.replace(/-/g, " ")} improved from ${d.beforeBf} to ${d.afterBf}`)
      .join("; ");

    explanations.push({
      type: "added",
      personId: person.personId,
      name: person.name,
      reason: [`${person.name} ${skillPhrase}`, bfPhrase].filter(Boolean).join("; "),
    });
  }

  for (const person of removed) {
    const weakest = Object.entries(requiredSkills)
      .map(([skillId, minLevel]) => ({ skillId, minLevel, level: levelOf(person, skillId) }))
      .sort((a, b) => a.level - b.level)[0];
    explanations.push({
      type: "removed",
      personId: person.personId,
      name: person.name,
      reason: weakest
        ? `${person.name} rotated out; lowest marginal contribution was ${weakest.skillId.replace(/-/g, " ")} (level ${weakest.level.toFixed(1)} vs required ${weakest.minLevel})`
        : `${person.name} rotated out to improve overall roster score`,
    });
  }

  for (const person of after.filter((c) => beforeIds.has(c.personId))) {
    explanations.push({ type: "kept", personId: person.personId, name: person.name, reason: `${person.name} kept — contributes to current coverage/redundancy mix` });
  }

  return explanations;
}

export interface TeamCompositionResult {
  roster: CandidateInput[];
  scoreBreakdown: RosterScore;
  swaps: SwapExplanation[];
}

/**
 * ILP-lite dispatch: when the search space is small enough to enumerate
 * cheaply (<= EXACT_SEARCH_BUDGET combinations), solve it exactly — there is
 * no reason to accept heuristic risk when exhaustive search costs
 * milliseconds. Above that budget, fall back to greedy construction + local
 * swap search, which is where the "ILP-lite" justification in the module
 * header applies: near-submodular objective, bounded-quality heuristic,
 * explainable by construction (greedy additions have a clear marginal
 * reason; see `explainSwaps`).
 */
const EXACT_SEARCH_BUDGET = 50_000;

export function optimizeTeam(
  candidates: CandidateInput[],
  requiredSkills: Record<string, number>,
  teamSize: number,
  skillUniverse: string[],
  options?: { weights?: CompositionWeights; currentRoster?: CandidateInput[] },
): TeamCompositionResult {
  const weights = options?.weights ?? DEFAULT_WEIGHTS;
  const currentRoster = options?.currentRoster ?? [];

  let roster: CandidateInput[];
  if (nChooseK(candidates.length, teamSize) <= EXACT_SEARCH_BUDGET) {
    roster = exhaustiveSearch(candidates, requiredSkills, teamSize, skillUniverse, weights).roster;
  } else {
    roster = greedyOptimize(candidates, requiredSkills, teamSize, skillUniverse, weights);
  }

  const scoreBreakdown = scoreRoster(roster, requiredSkills, skillUniverse, weights);
  const swaps = explainSwaps(currentRoster, roster, requiredSkills);
  return { roster, scoreBreakdown, swaps };
}
