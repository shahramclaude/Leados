// scripts/test-optimizer.ts  ->  `npm run test:optimizer`
//
// Correctness of the team-composition optimizer and the role-fit math as
// pure functions: brute-force comparison on small instances, plus property
// tests (permutation symmetry, monotonicity in skill level).

import { fit, namedGaps } from "../src/lib/people/roleSkillMap";
import type { Role } from "../src/lib/people/types";
import {
  exhaustiveSearch,
  greedyOptimize,
  optimizeTeam,
  scoreRoster,
  type CandidateInput,
} from "../src/lib/people/workforceSim";
import { rngFor } from "../src/lib/shared/prng";
import { assert, assertClose, assertEqual, test, runAll } from "./lib/testKit";

const SKILL_UNIVERSE = ["skill-a", "skill-b", "skill-c", "skill-d"];

function makeCandidate(id: string, levels: Record<string, number>, workload?: CandidateInput["workload"]): CandidateInput {
  const effectiveLevels: CandidateInput["effectiveLevels"] = {};
  for (const [skillId, level] of Object.entries(levels)) {
    effectiveLevels[skillId] = { skillId, level, confidence: 0.8, evidenceCount: 1, staleness: "fresh", inferred: false, lastEvidenceAt: null };
  }
  return { personId: id, name: id, effectiveLevels, workload };
}

function randomCandidate(id: string, rand: () => number): CandidateInput {
  const levels: Record<string, number> = {};
  for (const s of SKILL_UNIVERSE) levels[s] = Math.round(rand() * 5);
  const workload = { wip: Math.round(rand() * 6), contextSwitches: Math.round(rand() * 8), meetingHours: Math.round(rand() * 5) };
  return makeCandidate(id, levels, workload);
}

// --- Brute-force correctness on small instances -----------------------------
// `optimizeTeam` is ILP-lite: below EXACT_SEARCH_BUDGET combinations it runs
// exact search, so on these small instances it is BY CONSTRUCTION identical
// to brute force — we verify that against an independently-invoked
// `exhaustiveSearch` oracle (same scoring function, separate enumeration
// call) so this isn't a tautology, it's checking the dispatch threshold
// actually routes these sizes to the exact path and that the exact path is
// wired correctly end-to-end (required skills, weights, roster shape).
test("optimizeTeam matches brute-force optimum exactly on small instances", () => {
  const requiredSkills = { "skill-a": 3, "skill-b": 2 };
  for (let trial = 0; trial < 25; trial++) {
    const rand = rngFor(`optimizer-correctness-${trial}`);
    const candidates = Array.from({ length: 7 }, (_, i) => randomCandidate(`c${i}`, rand));
    const teamSize = 3;

    const result = optimizeTeam(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);
    const oracle = exhaustiveSearch(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);

    assertClose(result.scoreBreakdown.score, oracle.score.score, 1e-9, `trial ${trial}: optimizeTeam score ${result.scoreBreakdown.score} should equal brute-force optimum ${oracle.score.score}`);
    assertEqual(result.roster.length, oracle.roster.length, "roster sizes should match");
  }
});

test("optimizeTeam matches brute force across varied team sizes", () => {
  const requiredSkills = { "skill-c": 2, "skill-d": 4 };
  for (const teamSize of [1, 2, 4]) {
    for (let trial = 0; trial < 8; trial++) {
      const rand = rngFor(`optimizer-teamsize-${teamSize}-${trial}`);
      const candidates = Array.from({ length: 6 }, (_, i) => randomCandidate(`t${i}`, rand));
      const result = optimizeTeam(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);
      const oracle = exhaustiveSearch(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);
      assertClose(result.scoreBreakdown.score, oracle.score.score, 1e-9, `teamSize ${teamSize} trial ${trial}: optimizeTeam vs brute force`);
    }
  }
});

// --- Heuristic quality bound for the greedy path (used above EXACT_SEARCH_BUDGET) ---
// `greedyOptimize` is a heuristic and is NOT claimed to always find the exact
// optimum (that claim would be false and is exactly the kind of overclaim
// this project's honesty rules forbid). What we DO claim, and test, is a
// quality bound: on these small instances (where we can compute the true
// optimum for comparison) greedy+local-search gets within 10% of optimal.
test("greedyOptimize heuristic stays within 10% of the brute-force optimum", () => {
  const requiredSkills = { "skill-a": 3, "skill-b": 2 };
  for (let trial = 0; trial < 25; trial++) {
    const rand = rngFor(`optimizer-correctness-${trial}`);
    const candidates = Array.from({ length: 7 }, (_, i) => randomCandidate(`c${i}`, rand));
    const teamSize = 3;
    const greedyRoster = greedyOptimize(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);
    const greedyScore = scoreRoster(greedyRoster, requiredSkills, SKILL_UNIVERSE).score;
    const oracle = exhaustiveSearch(candidates, requiredSkills, teamSize, SKILL_UNIVERSE);
    const optimal = oracle.score.score;
    const ratio = optimal === 0 ? 1 : greedyScore / optimal;
    assert(ratio >= 0.9 || Math.abs(greedyScore - optimal) < 0.02, `trial ${trial}: greedy ${greedyScore} should be within 10% of optimal ${optimal} (ratio ${ratio})`);
  }
});

// --- Property: roster scoring is order-invariant (symmetry) ----------------
test("scoreRoster is invariant to the order of the roster array (symmetry)", () => {
  const requiredSkills = { "skill-a": 2, "skill-b": 2 };
  const rand = rngFor("symmetry-check");
  const candidates = Array.from({ length: 5 }, (_, i) => randomCandidate(`s${i}`, rand));
  const scoreOriginal = scoreRoster(candidates, requiredSkills, SKILL_UNIVERSE).score;
  const reversed = [...candidates].reverse();
  const scoreReversed = scoreRoster(reversed, requiredSkills, SKILL_UNIVERSE).score;
  const shuffled = [candidates[2], candidates[0], candidates[4], candidates[1], candidates[3]];
  const scoreShuffled = scoreRoster(shuffled, requiredSkills, SKILL_UNIVERSE).score;
  assertClose(scoreOriginal, scoreReversed, 1e-9, "reversed roster should score identically");
  assertClose(scoreOriginal, scoreShuffled, 1e-9, "shuffled roster should score identically");
});

// --- Property: demographic-parity-style symmetry is covered in test-fairness.ts;
// here we check swap-explanation symmetry: explaining A-for-B is the mirror of B-for-A.
test("busFactor counts are symmetric under roster reordering", () => {
  const rand = rngFor("busfactor-symmetry");
  const candidates = Array.from({ length: 4 }, (_, i) => randomCandidate(`b${i}`, rand));
  const order1 = scoreRoster(candidates, { "skill-a": 3 }, SKILL_UNIVERSE).redundancy;
  const order2 = scoreRoster([...candidates].reverse(), { "skill-a": 3 }, SKILL_UNIVERSE).redundancy;
  assertClose(order1, order2, 1e-9, "redundancy score should not depend on roster order");
});

// --- Property: fit() is monotonic non-decreasing in a person's skill level ---
test("fit() is monotonic non-decreasing as a core skill's level increases", () => {
  const role: Role = { id: "r", name: "Role", coreSkills: { "skill-a": 3, "skill-b": 2 }, complementarySkills: {}, adjacencyRoles: [] };
  let previous = -Infinity;
  for (let level = 0; level <= 5; level += 0.5) {
    const effectiveLevels = {
      "skill-a": { skillId: "skill-a", level, confidence: 1, evidenceCount: 1, staleness: "fresh" as const, inferred: false, lastEvidenceAt: null },
      "skill-b": { skillId: "skill-b", level: 2, confidence: 1, evidenceCount: 1, staleness: "fresh" as const, inferred: false, lastEvidenceAt: null },
    };
    const f = fit(effectiveLevels, role);
    assert(f >= previous - 1e-9, `fit should not decrease as skill-a level rises: level=${level} fit=${f} previous=${previous}`);
    previous = f;
  }
});

test("fit() is monotonic non-increasing as a role's required minLevel increases", () => {
  let previous = Infinity;
  for (let minLevel = 1; minLevel <= 5; minLevel++) {
    const role: Role = { id: "r", name: "Role", coreSkills: { "skill-a": minLevel as 1 | 2 | 3 | 4 | 5 }, complementarySkills: {}, adjacencyRoles: [] };
    const effectiveLevels = { "skill-a": { skillId: "skill-a", level: 3, confidence: 1, evidenceCount: 1, staleness: "fresh" as const, inferred: false, lastEvidenceAt: null } };
    const f = fit(effectiveLevels, role);
    assert(f <= previous + 1e-9, `fit should not increase as the required minLevel rises: minLevel=${minLevel} fit=${f} previous=${previous}`);
    previous = f;
  }
});

// --- Property: named gaps shrink (monotonic) as level rises, and disappear at the bar
test("namedGaps delta is monotonic non-increasing as current level rises, and empty once level meets the bar", () => {
  const role: Role = { id: "r", name: "Role", coreSkills: { "skill-a": 4 }, complementarySkills: {}, adjacencyRoles: [] };
  let previousDelta = Infinity;
  for (let level = 0; level <= 5; level += 0.5) {
    const effectiveLevels = { "skill-a": { skillId: "skill-a", level, confidence: 1, evidenceCount: 1, staleness: "fresh" as const, inferred: false, lastEvidenceAt: null } };
    const gaps = namedGaps(effectiveLevels, role);
    const delta = gaps.find((g) => g.skillId === "skill-a")?.delta ?? 0;
    assert(delta <= previousDelta + 1e-9, `gap delta should not grow as level rises: level=${level} delta=${delta} previousDelta=${previousDelta}`);
    if (level >= 4) assert(gaps.length === 0, `no gap should remain once level (${level}) meets the required bar (4)`);
    previousDelta = delta;
  }
});

// --- exhaustiveSearch guard --------------------------------------------------
test("exhaustiveSearch refuses to run on a search space that is too large", () => {
  const rand = rngFor("too-big");
  const candidates = Array.from({ length: 30 }, (_, i) => randomCandidate(`big${i}`, rand));
  let threw = false;
  try {
    exhaustiveSearch(candidates, { "skill-a": 2 }, 15, SKILL_UNIVERSE);
  } catch {
    threw = true;
  }
  assert(threw, "exhaustiveSearch must refuse combinatorially huge inputs rather than hang");
});

runAll("test:optimizer").then((code) => process.exit(code));
