/**
 * app/core/domain/power.js — Coalition & Incentive War Room (Schema v30).
 *
 * A single, pure, deterministic engine that reasons about the political economy
 * of a leadership decision. It fuses three disciplines that no management tool
 * combines today:
 *
 *   1. COOPERATIVE GAME THEORY — exact Banzhaf & Shapley-Shubik power indices,
 *      minimum winning coalitions, Tsebelis veto players, dummy players and
 *      dictator detection over a weighted voting game (Tsebelis 2002;
 *      Shapley-Shubik 1954; Banzhaf 1964; Riker 1962 minimum winning coalitions).
 *   2. NON-COOPERATIVE GAME THEORY — a 2x2 normal-form game between the leader
 *      and one pivotal counterparty: pure & mixed Nash equilibria (Nash 1950),
 *      dominant strategies, Pareto frontier, social welfare and a
 *      price-of-anarchy / coordination-loss measure (Koutsoupias-Papadimitriou
 *      1999; Roughgarden-Tardos 2002).
 *   3. MECHANISM DESIGN — the minimal transfer that makes the leader's target
 *      outcome (Nash-)incentive-compatible (Hurwicz 1960; Myerson 1979;
 *      revelation principle / DSIC), plus an equilibrium robustness margin
 *      that turns flat advice into a confidence-scored recommendation.
 *
 * On top of the mathematics sits a deterministic, blameless influence script
 * (SBI / DESC framing) tailored to the specific game, and an atomic post-commit
 * propagation rule (RULE-PWR-01..06) that fans a single game out into typed
 * graph links, one DACI decision, one blameless coaching delegation, one 1:1
 * talking point and derived telemetry — inside the same store transaction.
 *
 * Guarantees: pure (no DOM/network/wall-clock/storage globals — callers inject
 * `now` and `idFactory`), deterministic, idempotent, loop-safe, privacy-
 * preserving (conflicts/pulses are never read), and transparent (every
 * propagation logs an `automation.propagated` event). All estimates are the
 * leader's own; the engine never invents money, power or certainty.
 */

import { analyzePowerStress, powerStressBrief } from './powerStress.js';
import { dayKey, daysBetween } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
} from './cases.js';

/* ------------------------------------------------------------------ */
/* 0. Version, constants & rule registry                               */
/* ------------------------------------------------------------------ */

export const POWER_ENGINE_VERSION = 'power-2026.10-v2';

export const POWER_MIN_PLAYERS = 2;
export const POWER_MAX_PLAYERS = 8; // exact 2^n and n! enumeration stays small (<= 40,320 perms)
export const POWER_MIN_WEIGHT = 1;
export const POWER_MAX_WEIGHT = 100;
export const POWER_MAX_PAYOFF = 100;
export const POWER_DEFAULT_QUOTA_PCT = 50;
export const POWER_DEFAULT_STALE_DAYS = 14;
export const POWER_DEFAULT_FRAGILE_MARGIN = 0.1; // relative robustness below this is "fragile"
export const POWER_MIN_SAMPLES = 5; // counts-only honesty floor for any future calibration ledger

export const POWER_STATUSES = ['modeling', 'committed', 'settled', 'archived'];
export const POWER_STATUS_LABELS = {
  modeling: 'Modeling',
  committed: 'Strategy committed',
  settled: 'Settled / reviewed',
  archived: 'Archived',
};
export const POWER_STANCES = ['ally', 'neutral', 'opposed'];
export const POWER_STANCE_LABELS = {
  ally: 'Ally (backs the target)',
  neutral: 'Neutral / persuadable',
  opposed: 'Opposed to the target',
};
export const POWER_CONFIDENCE = ['low', 'medium', 'high'];
export const POWER_CONFIDENCE_LABELS = {
  low: 'Low (assumption — verify)',
  medium: 'Medium (partly evidenced)',
  high: 'High (evidenced)',
};
export const POWER_CELLS = ['00', '01', '10', '11']; // 'rc' = leader row r, rival col c
export const POWER_STRATEGY_AXES = {
  leader: ['Strategy A', 'Strategy B'],
  rival: ['Response A', 'Response B'],
};
export const POWER_VERDICTS = [
  'stress-vulnerable', 'coalition-blocked', 'misaligned', 'coordination-risk', 'fragile', 'low-confidence', 'stable',
];
export const POWER_VERDICT_META = {
  'stress-vulnerable': { label: 'Stress-vulnerable strategy', tone: 'warn', severity: 4 },
  'coalition-blocked': { label: 'Coalition blocked', tone: 'bad', severity: 5 },
  misaligned: { label: 'Incentives misaligned', tone: 'warn', severity: 4 },
  'coordination-risk': { label: 'Coordination risk', tone: 'caution', severity: 3 },
  fragile: { label: 'Fragile equilibrium', tone: 'caution', severity: 2 },
  'low-confidence': { label: 'Low-confidence read', tone: 'caution', severity: 2 },
  stable: { label: 'Stable & aligned', tone: 'good', severity: 0 },
};

export const POWER_RULES = Object.freeze([
  {
    id: 'RULE-PWR-01',
    name: 'Typed coalition graph links & derived verdict telemetry',
    framework: 'Typed Cross-Module Relationship Graph (ADR-0002) & Derived Value Sync',
    trigger: 'power.* / stakeholder.* / case.* / decision.* / negotiation.*',
    targetModule: 'links / powerGames.derived',
    description: 'Maintains idempotent typed edges from a power game to its linked stakeholders, people, case, decision, negotiation and goals, and refreshes the derived verdict, confidence band, alignment cost and robustness margin on material drift without overwriting any human estimate.',
  },
  {
    id: 'RULE-PWR-02',
    name: 'Blocked or stress-vulnerable coalition → one DACI strategy decision',
    framework: 'Tsebelis Veto Players & Riker Minimum Winning Coalitions; Intuit DACI',
    trigger: 'power.created / power.updated / power.reanalyzed / stakeholder.*',
    targetModule: 'decisions / links',
    description: 'When an explicit payoff-box or single-opposition stress test fails, or no winning coalition can be formed from non-opposed players (an opposed veto player or an opposed minimum-winning-coalition member blocks the quota), opens one idempotent DACI decision comparing persuasion, proposal redesign, an alternative coalition and explicit delay — which then flows into the decision-tempo engine in the same transaction.',
  },
  {
    id: 'RULE-PWR-03',
    name: 'Misaligned target → one blameless incentive-alignment delegation',
    framework: 'Hurwicz/Myerson Mechanism Design (Incentive Compatibility) & Edmondson Blameless Coaching',
    trigger: 'power.created / power.updated / power.reanalyzed',
    targetModule: 'delegations / people (1:1 talking points) / links',
    description: 'When the target outcome is not a Nash equilibrium and a finite incentive-alignment transfer exists, opens one idempotent, blameless coaching delegation (and a matching 1:1 talking point) to the game owner carrying the deterministic influence script and the exact side-payment needed to make the target incentive-compatible.',
  },
  {
    id: 'RULE-PWR-04',
    name: 'Coordination / fragility / stress failure → estimate-verification 1:1 prompt',
    framework: 'Nash Mixed Equilibrium & Pre-mortem Estimate Verification (Kahneman)',
    trigger: 'power.created / power.updated / power.reanalyzed',
    targetModule: 'people (1:1 talking points) / links',
    description: 'When an explicit stress test needs review, the game has no pure equilibrium or its equilibrium rests on thin payoff margins, queues one idempotent, blameless 1:1 talking point asking the owner to verify the payoff estimates before committing — cleaning it up once confidence is high or estimates are refreshed.',
  },
  {
    id: 'RULE-PWR-05',
    name: 'Settlement learning — record realised outcome without rewriting history',
    framework: 'Closed-Loop Calibration (Deming PDCA) & Append-Only Audit',
    trigger: 'power.settled',
    targetModule: 'powerGames.history / links',
    description: 'Records the realised cell and a short leader note on settlement into append-only history for future calibration, never editing the frozen opening analysis.',
  },
  {
    id: 'RULE-PWR-06',
    name: 'Read-side signals & pause/resume governance',
    framework: 'Confidence-Weighted Signals & One-Click Automation Pause',
    trigger: 'render / insights',
    targetModule: 'insights / today / board pack',
    description: 'Surfaces PWR-01..06 signals from the same pure report, and lets the leader pause all PWR writes with `settings.powerAutoPropagate`, leaving an explicit reanalysis still effective.',
  },
]);

/* ------------------------------------------------------------------ */
/* 1. Numeric helpers — missing stays null, never fabricated zero       */
/* ------------------------------------------------------------------ */

const EPS = 1e-9;

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function num(v, fallback = null) {
  if (isNum(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function round(n, dp = 4) {
  if (!isNum(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function finitePayoff(v) {
  const n = num(v, 0);
  return clamp(n, -POWER_MAX_PAYOFF, POWER_MAX_PAYOFF);
}

/** Coerce a players array into clean integer weights with valid stances. */
export function normalizePlayers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < list.length && out.length < POWER_MAX_PLAYERS; i += 1) {
    const p = list[i];
    if (!p || typeof p !== 'object') continue;
    const name = String(p.name ?? '').trim().slice(0, 80);
    if (!name) continue;
    const w = Math.round(clamp(num(p.weight, 1), POWER_MIN_WEIGHT, POWER_MAX_WEIGHT));
    out.push({
      id: String(p.id ?? `pl${i + 1}`).slice(0, 40),
      name,
      weight: w,
      stance: POWER_STANCES.includes(p.stance) ? p.stance : 'neutral',
      stakeholderId: p.stakeholderId ? String(p.stakeholderId).slice(0, 40) : null,
      personId: p.personId ? String(p.personId).slice(0, 40) : null,
    });
  }
  return out;
}

/** Coerce a 2x2 cell map into nested `cells[r][c] = [leader, rival]`. */
export function normalizeCells(raw) {
  const get = (r, c) => {
    const key = `${r}${c}`;
    const cell = raw && (raw[key] || (Array.isArray(raw) && raw[r] && raw[r][c]));
    if (Array.isArray(cell)) return [finitePayoff(cell[0]), finitePayoff(cell[1])];
    if (cell && typeof cell === 'object') return [finitePayoff(cell.leader), finitePayoff(cell.rival)];
    return [0, 0];
  };
  return [[get(0, 0), get(0, 1)], [get(1, 0), get(1, 1)]];
}

/** The integer vote quota for a given quota percentage (strict-majority default). */
export function quotaFor(players, quotaPct) {
  const total = players.reduce((s, p) => s + p.weight, 0);
  const pct = clamp(num(quotaPct, POWER_DEFAULT_QUOTA_PCT), 1, 100);
  // Smallest integer strictly greater than pct% of total, capped at unanimity.
  const quota = Math.min(total || 1, Math.floor((total * pct) / 100) + 1);
  return { quota, total };
}

/* ------------------------------------------------------------------ */
/* 2. Cooperative game theory — power indices & coalitions             */
/* ------------------------------------------------------------------ */

/**
 * Exact Banzhaf index, veto players, dummy players and dictators.
 * A player is "swing" in a coalition S (S excludes them) when S is losing but
 * S ∪ {i} is winning. Normalized Banzhaf = swings_i / Σ swings. We enumerate
 * all 2^n coalitions once and test each player's swing in O(n·2^n).
 */
export function computeBanzhafIndices(players, quotaPct = POWER_DEFAULT_QUOTA_PCT) {
  const ps = normalizePlayers(players);
  const n = ps.length;
  const { quota, total } = quotaFor(ps, quotaPct);
  const weights = ps.map((p) => p.weight);
  // Precompute subset weight sums.
  const size = 1 << n;
  const subsetWeight = new Float64Array(size);
  for (let mask = 1; mask < size; mask += 1) {
    const lsb = mask & -mask;
    const idx = 31 - Math.clz32(lsb);
    subsetWeight[mask] = subsetWeight[mask ^ lsb] + weights[idx];
  }
  const swings = new Array(n).fill(0);
  for (let mask = 0; mask < size; mask += 1) {
    const w = subsetWeight[mask];
    for (let i = 0; i < n; i += 1) {
      const bit = 1 << i;
      if (mask & bit) continue; // i not in S
      if (w < quota && w + weights[i] >= quota) swings[i] += 1;
    }
  }
  const swingTotal = swings.reduce((a, b) => a + b, 0);
  const absolute = swings.map((s) => s / (2 ** Math.max(0, n - 1)));
  const normalized = swingTotal > 0
    ? swings.map((s) => round(s / swingTotal, 6))
    : swings.map(() => 0);
  const vetoPlayers = [];
  const dictators = [];
  for (let i = 0; i < n; i += 1) {
    if (total - weights[i] < quota) vetoPlayers.push(ps[i].id); // no winning coalition without them
    if (weights[i] >= quota) dictators.push(ps[i].id);
  }
  const dummyPlayers = ps.filter((_, i) => swings[i] === 0).map((p) => p.id);
  return {
    method: 'exact-2^n',
    quota,
    total,
    swings,
    swingTotal,
    absolute: absolute.map((v) => round(v, 6)),
    normalized,
    vetoPlayers,
    dictators,
    dummyPlayers,
  };
}

/**
 * Exact Shapley-Shubik index by enumerating all n! orderings and counting
 * pivotal players. n is capped at POWER_MAX_PLAYERS (8 → 40,320 permutations).
 */
export function computeShapleyShubik(players, quotaPct = POWER_DEFAULT_QUOTA_PCT) {
  const ps = normalizePlayers(players);
  const n = ps.length;
  const { quota } = quotaFor(ps, quotaPct);
  const weights = ps.map((p) => p.weight);
  const pivots = new Array(n).fill(0);
  const perm = Array.from({ length: n }, (_, i) => i);
  let permutations = 0;
  const factorial = (k) => { let f = 1; for (let i = 2; i <= k; i += 1) f *= i; return f; };
  const count = n > 0 ? factorial(n) : 0;
  // Heap's algorithm (iterative) to generate all permutations.
  const c = new Array(n).fill(0);
  const evaluate = () => {
    let running = 0;
    for (let k = 0; k < n; k += 1) {
      running += weights[perm[k]];
      if (running >= quota) { pivots[perm[k]] += 1; break; }
    }
    permutations += 1;
  };
  evaluate();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const swap = i % 2 === 0 ? 0 : c[i];
      const t = perm[swap]; perm[swap] = perm[i]; perm[i] = t;
      evaluate();
      c[i] += 1;
      i = 0;
    } else { c[i] = 0; i += 1; }
  }
  const normalized = count > 0 ? pivots.map((p) => round(p / count, 6)) : ps.map(() => 0);
  return { method: 'exact-n!', permutations, pivots, normalized };
}

/**
 * All minimum winning coalitions (MWC): winning subsets where removing any
 * member makes them losing. Sorted by member count, then least excess weight.
 */
export function minimumWinningCoalitions(players, quotaPct = POWER_DEFAULT_QUOTA_PCT) {
  const ps = normalizePlayers(players);
  const n = ps.length;
  const { quota } = quotaFor(ps, quotaPct);
  const weights = ps.map((p) => p.weight);
  const size = 1 << n;
  const coalitions = [];
  for (let mask = 0; mask < size; mask += 1) {
    let w = 0; let members = 0; const idx = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) { w += weights[i]; members += 1; idx.push(i); }
    }
    if (w < quota || members === 0) continue;
    // Minimal: every member is critical (removing any one drops below quota).
    let minimal = true;
    for (let k = 0; k < idx.length; k += 1) {
      if (w - weights[idx[k]] >= quota) { minimal = false; break; }
    }
    if (!minimal) continue;
    coalitions.push({
      ids: idx.map((k) => ps[k].id),
      names: idx.map((k) => ps[k].name),
      weight: w,
      excess: w - quota,
      size: members,
      opposedCount: idx.filter((k) => ps[k].stance === 'opposed').length,
      hasOpposed: idx.some((k) => ps[k].stance === 'opposed'),
    });
  }
  coalitions.sort((a, b) => a.size - b.size || a.weight - b.weight || a.ids.join().localeCompare(b.ids.join()));
  return coalitions;
}

/**
 * Stance-aware coalition feasibility: can a winning coalition be built only
 * from non-opposed players? Also identifies the cheapest feasible coalition,
 * opposed veto players and nominal allies with zero voting power.
 */
export function analyzeVotingPower(players, quotaPct = POWER_DEFAULT_QUOTA_PCT) {
  const ps = normalizePlayers(players);
  const banzhaf = computeBanzhafIndices(ps, quotaPct);
  const ss = computeShapleyShubik(ps, quotaPct);
  const mwc = minimumWinningCoalitions(ps, quotaPct);

  const { quota, total } = quotaFor(ps, quotaPct);
  const nonOpposedWeight = ps.filter((p) => p.stance !== 'opposed').reduce((s, p) => s + p.weight, 0);
  const coalitionFeasible = nonOpposedWeight >= quota;
  const opposedVetoPlayers = ps
    .filter((p) => p.stance === 'opposed' && banzhaf.vetoPlayers.includes(p.id))
    .map((p) => p.id);
  const feasibleCoalitions = mwc.filter((c) => !c.hasOpposed);
  const cheapestFeasible = feasibleCoalitions[0] || null;
  const decisiveOpposition = ps
    .filter((p) => p.stance === 'opposed')
    .map((p) => ({ id: p.id, name: p.name, power: banzhaf.normalized[ps.indexOf(p)] }))
    .sort((a, b) => (b.power || 0) - (a.power || 0));
  const dummyAllies = ps
    .filter((p) => p.stance === 'ally' && banzhaf.dummyPlayers.includes(p.id))
    .map((p) => p.id);
  // Power concentration (HHI-style, 0..1) over normalized Banzhaf power.
  const powerHhi = banzhaf.normalized.reduce((s, v) => s + v * v, 0);

  return {
    quota,
    total,
    quotaPct: clamp(num(quotaPct, POWER_DEFAULT_QUOTA_PCT), 1, 100),
    banzhaf,
    shapleyShubik: ss,
    minimumWinningCoalitions: mwc,
    coalitionFeasible,
    nonOpposedWeight,
    opposedVetoPlayers,
    decisiveOpposition,
    cheapestFeasible,
    dummyAllies,
    powerHhi: round(powerHhi, 4),
    players: ps.map((p, i) => ({
      ...p,
      banzhaf: banzhaf.normalized[i],
      shapleyShubik: ss.normalized[i],
      swings: banzhaf.swings[i],
      veto: banzhaf.vetoPlayers.includes(p.id),
      dictator: banzhaf.dictators.includes(p.id),
      dummy: banzhaf.dummyPlayers.includes(p.id),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3. Non-cooperative game theory — 2x2 normal-form solution           */
/* ------------------------------------------------------------------ */

/**
 * Solve a 2x2 normal-form game. `cells[r][c] = [leaderPayoff, rivalPayoff]`.
 * Returns pure Nash equilibria, dominant strategies, the (fully) mixed Nash
 * equilibrium when it exists, Pareto-efficient cells and welfare measures.
 */
export function solveNormalForm(cells) {
  const g = normalizeCells(cells);
  const L = (r, c) => g[r][c][0];
  const R = (r, c) => g[r][c][1];
  const ge = (a, b) => a + EPS >= b; // weak best-response with float tolerance

  // Pure Nash equilibria.
  const pureNE = [];
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const leaderNoDev = ge(L(r, c), L(1 - r, c));
      const rivalNoDev = ge(R(r, c), R(r, 1 - c));
      if (leaderNoDev && rivalNoDev) pureNE.push(`${r}${c}`);
    }
  }

  // (Strictly / weakly) dominant strategies.
  const leaderStrict = [0, 1].filter((r) => L(r, 0) > L(1 - r, 0) + EPS && L(r, 1) > L(1 - r, 1) + EPS);
  const rivalStrict = [0, 1].filter((c) => R(0, c) > R(0, 1 - c) + EPS && R(1, c) > R(1, 1 - c) + EPS);
  const dominant = {
    leader: leaderStrict.length ? leaderStrict[0] : null,
    rival: rivalStrict.length ? rivalStrict[0] : null,
    leaderStrict: leaderStrict.length > 0,
    rivalStrict: rivalStrict.length > 0,
  };

  // Fully mixed Nash equilibrium (closed form). q = P(rival plays col0) that
  // makes leader indifferent; p = P(leader plays row0) that makes rival indifferent.
  const denomQ = L(0, 0) - L(0, 1) - L(1, 0) + L(1, 1);
  const denomP = R(0, 0) - R(1, 0) - R(0, 1) + R(1, 1);
  let mixed = null;
  if (Math.abs(denomQ) > EPS && Math.abs(denomP) > EPS) {
    const q = (L(1, 1) - L(0, 1)) / denomQ;
    const p = (R(1, 1) - R(1, 0)) / denomP;
    if (q >= -EPS && q <= 1 + EPS && p >= -EPS && p <= 1 + EPS) {
      const qc = clamp(q, 0, 1); const pc = clamp(p, 0, 1);
      const leaderPayoff = pc * (qc * L(0, 0) + (1 - qc) * L(0, 1))
        + (1 - pc) * (qc * L(1, 0) + (1 - qc) * L(1, 1));
      const rivalPayoff = qc * (pc * R(0, 0) + (1 - pc) * R(1, 0))
        + (1 - qc) * (pc * R(0, 1) + (1 - pc) * R(1, 1));
      mixed = {
        pLeaderRow0: round(pc, 4),
        qRivalCol0: round(qc, 4),
        leaderPayoff: round(leaderPayoff, 4),
        rivalPayoff: round(rivalPayoff, 4),
      };
    }
  }

  // Social welfare & Pareto frontier.
  const welfare = {};
  for (const cell of POWER_CELLS) {
    const r = Number(cell[0]); const c = Number(cell[1]);
    welfare[cell] = L(r, c) + R(r, c);
  }
  const maxWelfare = Math.max(...POWER_CELLS.map((k) => welfare[k]));
  const efficientCells = POWER_CELLS.filter((cell) => {
    const r = Number(cell[0]); const c = Number(cell[1]);
    return !POWER_CELLS.some((other) => {
      const r2 = Number(other[0]); const c2 = Number(other[1]);
      const l2 = L(r2, c2); const r2p = R(r2, c2);
      const l1 = L(r, c); const r1 = R(r, c);
      return (l2 >= l1 - EPS && r2p >= r1 - EPS) && (l2 > l1 + EPS || r2p > r1 + EPS);
    });
  });
  const neWelfare = pureNE.map((k) => welfare[k]);
  const bestNeWelfare = neWelfare.length ? Math.max(...neWelfare) : null;
  const worstNeWelfare = neWelfare.length ? Math.min(...neWelfare) : null;
  const coordinationLoss = bestNeWelfare !== null ? round(maxWelfare - bestNeWelfare, 4) : null;
  const priceOfAnarchy = (worstNeWelfare !== null && worstNeWelfare > EPS)
    ? round(maxWelfare / worstNeWelfare, 4)
    : null;

  return {
    cells: g,
    pureNE,
    hasPureNE: pureNE.length > 0,
    dominant,
    mixed,
    welfare,
    maxWelfare: round(maxWelfare, 4),
    efficientCells,
    bestNeWelfare: bestNeWelfare === null ? null : round(bestNeWelfare, 4),
    worstNeWelfare: worstNeWelfare === null ? null : round(worstNeWelfare, 4),
    coordinationLoss,
    priceOfAnarchy,
    hasConflict: coordinationLoss !== null && coordinationLoss > EPS,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Mechanism design — incentive compatibility by minimal transfer   */
/* ------------------------------------------------------------------ */

/**
 * The minimal side-payment (transferable utility, leader → rival at the target
 * cell) that makes `targetCell` a pure Nash equilibrium.
 *
 *   rival no-deviate: rival(target) + t >= rival(deviation)   → t >= rivalDeficit
 *   leader no-deviate: leader(target) - t >= leader(deviation) → t <= leaderHeadroom
 *
 * Feasible iff rivalDeficit <= leaderHeadroom. This is a Nash-implementation
 * (not a full dominant-strategy/VCG mechanism) — honest about its scope.
 */
export function incentiveAlignment(cells, targetCell = '00') {
  const g = normalizeCells(cells);
  const cell = POWER_CELLS.includes(targetCell) ? targetCell : '00';
  const tr = Number(cell[0]); const tc = Number(cell[1]);
  const L = (r, c) => g[r][c][0];
  const R = (r, c) => g[r][c][1];

  const rivalDeviationPayoff = R(tr, 1 - tc);
  const rivalTargetPayoff = R(tr, tc);
  const leaderDeviationPayoff = L(1 - tr, tc);
  const leaderTargetPayoff = L(tr, tc);

  const rivalDeficit = Math.max(0, rivalDeviationPayoff - rivalTargetPayoff);
  const leaderHeadroom = leaderTargetPayoff - leaderDeviationPayoff; // may be negative
  const alignmentCost = round(rivalDeficit, 4);
  const feasible = rivalDeficit <= leaderHeadroom + EPS;
  const alreadyEquilibrium = rivalDeficit <= EPS && leaderHeadroom >= -EPS;
  const netLeaderPayoff = round(leaderTargetPayoff - rivalDeficit, 4);

  const deviations = [];
  if (rivalDeficit > EPS) {
    deviations.push({
      who: 'rival',
      from: cell,
      to: `${tr}${1 - tc}`,
      gain: round(rivalDeficit, 4),
      fix: 'transfer / concession',
    });
  }
  if (leaderHeadroom < -EPS) {
    deviations.push({
      who: 'leader',
      from: cell,
      to: `${1 - tr}${tc}`,
      gain: round(-leaderHeadroom, 4),
      fix: 'raise the leader’s stake at the target or choose a different target',
    });
  }

  let recommendation;
  if (alreadyEquilibrium) {
    recommendation = 'The target is already incentive-compatible: neither player gains by deviating. No transfer needed — protect it with a credible commitment.';
  } else if (feasible) {
    recommendation = `Offer a concession/transfer worth ≈ ${alignmentCost} utility units (conditional on the target outcome) to the counterparty. That closes their deviation gap and still leaves you ${netLeaderPayoff} — implement it as a written, verifiable commitment.`;
  } else if (leaderHeadroom < -EPS) {
    recommendation = 'Even at zero transfer you would rather deviate from this target, and the counterparty also wants to deviate. Change the payoff structure (add value at the target, create a penalty for defection) or pick a different target outcome.';
  } else {
    recommendation = `The counterparty’s deviation gap (${alignmentCost}) exceeds what you can pay while still preferring the target (${round(leaderHeadroom, 4)}). Reduce their deviation payoff via a credible commitment/relational contract, or choose a cheaper target.`;
  }

  return {
    targetCell: cell,
    rivalTargetPayoff,
    rivalDeviationPayoff,
    leaderTargetPayoff,
    leaderDeviationPayoff,
    rivalDeficit: round(rivalDeficit, 4),
    leaderHeadroom: round(leaderHeadroom, 4),
    alignmentCost,
    netLeaderPayoff,
    feasible,
    alreadyEquilibrium,
    deviations,
    recommendation,
  };
}

/**
 * Equilibrium robustness: the smallest absolute cell-slack (distance to a
 * best-response boundary) across the 2x2 game. A slack of 0 means a weak
 * equilibrium that flips on the tiniest estimate change. Reported relative to
 * the payoff scale so it is comparable across games.
 */
export function equilibriumRobustness(cells) {
  const g = normalizeCells(cells);
  const L = (r, c) => g[r][c][0];
  const R = (r, c) => g[r][c][1];
  let minAbsSlack = Infinity;
  let weakNE = false;
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const leaderSlack = L(r, c) - L(1 - r, c);
      const rivalSlack = R(r, c) - R(r, 1 - c);
      const cellSlack = Math.min(Math.abs(leaderSlack), Math.abs(rivalSlack));
      minAbsSlack = Math.min(minAbsSlack, cellSlack);
      if (Math.abs(leaderSlack) <= EPS || Math.abs(rivalSlack) <= EPS) weakNE = true;
    }
  }
  let payoffScale = 0;
  for (let r = 0; r < 2; r += 1) for (let c = 0; c < 2; c += 1) {
    payoffScale = Math.max(payoffScale, Math.abs(L(r, c)), Math.abs(R(r, c)));
  }
  payoffScale = Math.max(payoffScale, 1);
  const relative = round(minAbsSlack / payoffScale, 4);
  const band = relative >= 0.25 ? 'high' : relative >= 0.1 ? 'medium' : 'low';
  return { minAbsSlack: round(minAbsSlack, 4), payoffScale, relativeRobustness: relative, band, weakNE };
}

/* ------------------------------------------------------------------ */
/* 5. Orchestration — the full report for one game                     */
/* ------------------------------------------------------------------ */

const ESTIMATE_RANK = { low: 0, medium: 1, high: 2 };
const ROBUST_RANK = { low: 0, medium: 1, high: 2 };

/** Combine the leader's declared estimate confidence with equilibrium robustness. */
export function powerConfidence(estimateConfidence, robustnessBand) {
  const e = ESTIMATE_RANK[estimateConfidence] ?? 0;
  const r = ROBUST_RANK[robustnessBand] ?? 0;
  const rank = Math.min(e, r);
  return rank === 2 ? 'high' : rank === 1 ? 'medium' : 'low';
}

/**
 * Full analysis of one power game. Pure: `state` is only read (for linked
 * record names), `now` is injected. Returns everything the view, CSV, signals
 * and propagation rule need.
 */
export function analyzePowerGame(game, state = {}, now = new Date()) {
  const rec = game && typeof game === 'object' ? game : {};
  const players = normalizePlayers(rec.players);
  const voting = analyzeVotingPower(players, rec.quotaPct);
  const game2x2 = solveNormalForm(rec.cells);
  const targetCell = POWER_CELLS.includes(rec.targetCell) ? rec.targetCell : '00';
  const alignment = incentiveAlignment(rec.cells, targetCell);
  const robustness = equilibriumRobustness(rec.cells);
  const stress = analyzePowerStress(game2x2.cells, rec.stressRadius, targetCell, players, voting.quota);
  const estimateConfidence = POWER_CONFIDENCE.includes(rec.estimateConfidence) ? rec.estimateConfidence : 'low';
  const confidenceBand = powerConfidence(estimateConfidence, robustness.band);
  const fragileMargin = clamp(num(rec.settingsFragileMargin, POWER_DEFAULT_FRAGILE_MARGIN), 0.02, 0.5);

  const issues = [];
  if (stress?.needsReview) issues.push('stress-vulnerable');
  if (!voting.coalitionFeasible) {
    issues.push('coalition-blocked');
  }
  if (!alignment.alreadyEquilibrium && alignment.alignmentCost > EPS) {
    issues.push('misaligned');
  }
  if (!game2x2.hasPureNE) {
    issues.push('coordination-risk');
  }
  if (robustness.relativeRobustness < fragileMargin || robustness.weakNE) {
    issues.push('fragile');
  }
  if (confidenceBand === 'low') {
    issues.push('low-confidence');
  }
  const dummyAllyIssue = voting.dummyAllies.length > 0;
  if (dummyAllyIssue) issues.push('dummy-ally');

  // Primary verdict = highest-severity known issue, else stable.
  const ranked = issues
    .filter((k) => POWER_VERDICT_META[k])
    .sort((a, b) => POWER_VERDICT_META[b].severity - POWER_VERDICT_META[a].severity);
  const verdict = ranked.length ? ranked[0] : 'stable';
  const verdictMeta = POWER_VERDICT_META[verdict] || POWER_VERDICT_META.stable;

  const staleDays = clamp(num(rec.settingsStaleDays, POWER_DEFAULT_STALE_DAYS), 1, 365);
  const updatedDay = (rec.updatedAt || rec.createdAt || '').slice(0, 10);
  const ageDays = updatedDay ? (daysBetween(updatedDay, dayKey(now)) ?? 0) : 0;

  const targetIsNE = game2x2.pureNE.includes(targetCell);

  return {
    id: rec.id || null,
    title: rec.title || 'Untitled situation',
    status: rec.status || 'modeling',
    voting,
    game2x2,
    alignment,
    robustness,
    stress,
    targetCell,
    targetIsNE,
    estimateConfidence,
    confidenceBand,
    issues,
    verdict,
    verdictMeta,
    attention: verdict !== 'stable' && rec.status !== 'settled' && rec.status !== 'archived',
    ageDays,
    stale: ageDays >= staleDays && rec.status === 'committed',
    engineVersion: POWER_ENGINE_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Deterministic influence script & board brief                     */
/* ------------------------------------------------------------------ */

/**
 * A blameless, DESC/SBI-framed influence script derived purely from the
 * analysis. This is deterministic template generation, NOT a language model —
 * labelled honestly in the UI. It never invents facts beyond the recorded
 * players, weights, stances and computed numbers.
 */
export function buildInfluenceScript(report, game = {}) {
  const v = report.voting;
  const a = report.alignment;
  const players = v.players;
  const byPower = [...players].sort((x, y) => y.banzhaf - x.banzhaf);
  const opposed = players.filter((p) => p.stance === 'opposed');
  const allies = players.filter((p) => p.stance === 'ally');
  const neutral = players.filter((p) => p.stance === 'neutral');
  const lead = byPower[0];
  const rc = (name) => String(name || 'the stakeholder').trim();

  const lines = [];
  lines.push(`Situation: ${game.title || 'this decision'}. A winning coalition needs ${v.quota} of ${v.total} weighted votes (quota ${v.quotaPct}%).`);

  if (v.coalitionFeasible && v.cheapestFeasible) {
    lines.push(`A minimum winning coalition of allies/neutrals exists: ${v.cheapestFeasible.names.map(rc).join(' + ')} (${v.cheapestFeasible.weight} votes). Sequence these conversations first — they are sufficient to reach quota without the opposition.`);
  } else {
    lines.push(`No winning coalition can be formed from allies and neutrals alone (they hold ${v.nonOpposedWeight} of ${v.quota} needed). At least one opposed stakeholder must be moved, or the proposal/quota must change.`);
    if (opposed.length) lines.push(`The decisive opposition is ${opposed.map((p) => `${rc(p.name)} (${Math.round((p.banzhaf || 0) * 100)}% Banzhaf power)`).join(', ')}. Treat the highest-power opponent as the primary conversation, not the loudest one.`);
  }

  const talkingPoints = players.map((p) => {
    let point;
    if (p.veto) {
      point = p.stance === 'opposed'
        ? `Veto player: without ${rc(p.name)} no coalition wins. Open by acknowledging their specific objection and asking what evidence would change it (DESC — start with their Situation, not your pitch).`
        : `Veto player: ${rc(p.name)} must be inside any winning coalition. Confirm their support explicitly and protect it — don't assume silence is consent.`;
    } else if (p.dummy) {
      point = `${rc(p.name)} has no swing power in any coalition (a dummy player). Keep them informed, but don't spend scarce persuasion capital here — reallocate to a pivotal neutral.`;
    } else if (p.stance === 'neutral') {
      point = `Pivotal neutral: ${rc(p.name)} carries ${Math.round((p.banzhaf || 0) * 100)}% of the voting power. Use SBI: name the specific Behaviour/Impact you want changed and the concrete ask.`;
    } else if (p.stance === 'opposed') {
      point = `Opposed: ${rc(p.name)}. Diagnose the interest behind the position (Fisher-Ury), then look for a value-creating trade that costs you less than their blocking costs you.`;
    } else {
      point = `Ally: ${rc(p.name)}. Lock in a public, specific commitment and a date — allies drift when the ask stays vague.`;
    }
    return { id: p.id, name: p.name, stance: p.stance, powerPct: Math.round((p.banzhaf || 0) * 100), point };
  });

  let ask;
  if (a.alreadyEquilibrium) {
    ask = 'The target is already a Nash equilibrium. Your job is commitment, not persuasion: make your chosen strategy credible and visible so the counterparty has no reason to test a deviation.';
  } else if (a.feasible) {
    ask = `Offer a verifiable concession worth ≈ ${a.alignmentCost} utility units to close the deviation gap. Write down the condition ("if the target happens, you get X") so it is enforceable, not a vague promise.`;
  } else {
    ask = 'A simple transfer cannot make this target self-enforcing. Redesign the payoffs — add value at the target, add a defection cost — or choose a different target before you spend political capital.';
  }

  if (report.stress) {
    ask = report.stress.transferFeasible
      ? `Under your ±${report.stress.radius} utility-unit bounds, a fixed conditional transfer between ${report.stress.minimumTransfer} and ${report.stress.maximumTransfer} units sustains weak Nash. Verify comparable utility and enforceability before offering anything. Confirm coalition commitments separately.`
      : `Do not treat the point-estimate concession as robust: no fixed transfer works across your ±${report.stress.radius} bounds. Verify the four target/deviation payoffs, redesign the proposal, or compare the minimax-regret strategies before committing.`;
  }
  const guardrails = [
    'Blameless: focus on interests and constraints, not personalities. Never use this analysis to coerce or to game a colleague.',
    'Estimates are yours, not measured facts. Label low-confidence payoffs as assumptions and verify them in the 1:1 before acting.',
    'Confidential conflict records and anonymous pulse responses are never read by this engine.',
  ];

  const summary = {
    verdict: report.verdict,
    verdictLabel: report.verdictMeta.label,
    confidenceBand: report.confidenceBand,
  };

  return {
    opening: lines,
    talkingPoints,
    ask,
    fallback: `If the primary coalition still fails at review, escalate a DACI decision (RULE-PWR-02 opens one automatically) comparing persuasion, redesign, an alternative coalition, or an explicit delay — and price the delay in the Decision Tempo terminal.`,
    guardrails,
    summary,
  };
}

/** Board-ready, deterministic brief for one game. */
export function buildPowerBrief(report, game = {}) {
  const v = report.voting;
  const g = report.game2x2;
  const a = report.alignment;
  const out = [];
  out.push(`COALITION & INCENTIVE BRIEF — ${game.title || 'Untitled situation'} (${report.engineVersion})`);
  out.push(`Verdict: ${report.verdictMeta.label} · confidence: ${report.confidenceBand} · status: ${POWER_STATUS_LABELS[report.status] || report.status}.`);
  out.push(`Voting power: ${v.players.length} players, ${v.total} votes, quota ${v.quota} (${v.quotaPct}%). Coalition of allies/neutrals ${v.coalitionFeasible ? 'is feasible' : 'is NOT feasible'} (${v.nonOpposedWeight}/${v.quota} votes).`);
  out.push(`Power leaders (Banzhaf): ${[...v.players].sort((x, y) => y.banzhaf - x.banzhaf).slice(0, 3).map((p) => `${p.name} ${Math.round(p.banzhaf * 100)}%`).join(' · ') || 'n/a'}.`);
  out.push(`Veto players: ${v.players.filter((p) => p.veto).map((p) => p.name).join(', ') || 'none'}. Dummy players: ${v.players.filter((p) => p.dummy).map((p) => p.name).join(', ') || 'none'}.`);
  out.push(`Strategic game (leader vs counterparty): ${g.hasPureNE ? `pure Nash at ${g.pureNE.join(', ')}` : 'no pure Nash (mixed-strategy coordination risk)'}${g.mixed ? ` · mixed NE p=${g.mixed.pLeaderRow0}/q=${g.mixed.qRivalCol0}` : ''}.`);
  out.push(powerStressBrief(report.stress));
  out.push(`Target ${report.targetCell}: ${a.alreadyEquilibrium ? 'already incentive-compatible' : a.feasible ? `alignment transfer ≈ ${a.alignmentCost} utility units` : 'not implementable by a simple transfer'}. Coordination loss ${g.coordinationLoss ?? 'n/a'}; robustness ${report.robustness.relativeRobustness} (${report.robustness.band}).`);
  out.push(`Recommendation: ${buildInfluenceScript(report, game).ask}`);
  out.push(`Confidence caveat: this is a deterministic, assumption-driven model — not a prediction. Verify low-confidence payoffs and the leader's declared confidence before acting.`);
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* 7. Workspace report & read-side signals                             */
/* ------------------------------------------------------------------ */

export function buildPowerReport(state = {}, now = new Date()) {
  const games = Array.isArray(state.powerGames) ? state.powerGames : [];
  const settings = state.settings || {};
  const active = games.filter((g) => g && g.status !== 'archived');
  const rows = active.map((game) => {
    const r = game && typeof game === 'object' ? { ...game } : {};
    r.settingsStaleDays = settings.powerStaleDays;
    r.settingsFragileMargin = settings.powerFragileMargin;
    return { game, analysis: analyzePowerGame(r, state, now) };
  });
  const totals = {
    count: active.length,
    attention: rows.filter((row) => row.analysis.attention).length,
    blocked: rows.filter((row) => row.analysis.verdict === 'coalition-blocked').length,
    misaligned: rows.filter((row) => row.analysis.issues.includes('misaligned')).length,
    coordinationRisk: rows.filter((row) => row.analysis.issues.includes('coordination-risk')).length,
    lowConfidence: rows.filter((row) => row.analysis.confidenceBand === 'low').length,
    stable: rows.filter((row) => row.analysis.verdict === 'stable').length,
  };
  const byVerdict = {};
  for (const v of POWER_VERDICTS) byVerdict[v] = rows.filter((row) => row.analysis.verdict === v).length;
  return { games: rows, totals, byVerdict, engineVersion: POWER_ENGINE_VERSION };
}

/** PWR-01..06 read-side signals (RULE-PWR-06). Write-free. */
export function powerSignals(state = {}, now = new Date()) {
  const report = buildPowerReport(state, now);
  const signals = [];
  for (const { game, analysis } of report.games) {
    if (analysis.status === 'settled' || analysis.status === 'archived') continue;
    const route = `#/power/${game.id}`;
    const push = (ruleId, title, detail, severity, evidence) => {
      signals.push({
        ruleId,
        domain: 'Coalition & power',
        title,
        detail,
        severity,
        confidence: analysis.confidenceBand === 'high' ? 'high' : 'medium',
        evidence,
        action: { label: 'Open war room', route },
      });
    };
    if (analysis.stress?.needsReview) push('PWR-07', `Stress-vulnerable strategy: “${game.title}”`, powerStressBrief(analysis.stress), 4, [`Explicit payoff bound ±${analysis.stress.radius}`, 'Exact box bounds; not probability or statistical confidence']);
    if (analysis.issues.includes('coalition-blocked')) {
      const who = analysis.voting.decisiveOpposition.map((p) => p.name).join(', ') || 'an opposed stakeholder';
      push('PWR-01', `No winning coalition for “${game.title}” without the opposition`,
        `Allies and neutrals hold ${analysis.voting.nonOpposedWeight} of the ${analysis.voting.quota} votes needed. ${analysis.voting.opposedVetoPlayers.length ? 'An opposed veto player blocks every coalition. ' : ''}Move ${who}, redesign the proposal, or change the quota — RULE-PWR-02 opens a DACI decision to choose.`,
        5,
        [`Quota ${analysis.voting.quota}/${analysis.voting.total} (${analysis.voting.quotaPct}%)`, `${analysis.voting.minimumWinningCoalitions.length} minimum winning coalition(s)`, `Decisive opposition: ${who}`]);
    }
    if (analysis.issues.includes('misaligned')) {
      push('PWR-02', `“${game.title}” target is not incentive-compatible`,
        `The counterparty gains ${analysis.alignment.rivalDeficit} utility units by deviating from your target ${analysis.targetCell}. ${analysis.alignment.feasible ? `A verifiable concession of ≈ ${analysis.alignment.alignmentCost} units makes the target a Nash equilibrium.` : 'A simple transfer cannot fix it — redesign the payoffs or choose another target.'}`,
        4,
        [`Alignment cost: ${analysis.alignment.alignmentCost}`, `Leader headroom: ${analysis.alignment.leaderHeadroom}`, `Feasible: ${analysis.alignment.feasible ? 'yes' : 'no'}`]);
    }
    if (analysis.issues.includes('coordination-risk')) {
      push('PWR-03', `“${game.title}” has no stable pure outcome`,
        `The 2x2 game has no pure Nash equilibrium — each side's best move depends on the other's. ${analysis.game2x2.mixed ? `The mixed equilibrium (p=${analysis.game2x2.mixed.pLeaderRow0}, q=${analysis.game2x2.mixed.qRivalCol0}) means rely on a credible focal commitment, not a guess.` : 'Settle on a coordination device or a public commitment before acting.'}`,
        3,
        ['No pure Nash equilibrium', analysis.game2x2.mixed ? `Mixed NE leader/row0 p=${analysis.game2x2.mixed.pLeaderRow0}` : 'No mixed NE in [0,1]']);
    }
    if (analysis.issues.includes('fragile')) {
      push('PWR-04', `“${game.title}” rests on thin payoff margins`,
        `Equilibrium robustness is ${analysis.robustness.relativeRobustness} (${analysis.robustness.band}) — a small change in any estimated payoff could flip the recommended outcome. Verify the numbers in a 1:1 before committing.`,
        2,
        [`Relative robustness: ${analysis.robustness.relativeRobustness}`, `Weak equilibrium: ${analysis.robustness.weakNE ? 'yes' : 'no'}`]);
    }
    if (analysis.issues.includes('dummy-ally')) {
      const names = analysis.voting.players.filter((p) => p.stance === 'ally' && p.dummy).map((p) => p.name).join(', ');
      push('PWR-05', `A counted ally in “${game.title}” has no voting power`,
        `${names} is an ally but is never pivotal in any winning coalition (a dummy player). Keep them informed, but move scarce persuasion effort to a pivotal neutral.`,
        2,
        [`Dummy allies: ${names}`, `Power HHI: ${analysis.voting.powerHhi}`]);
    }
    if (analysis.stale || (analysis.issues.includes('low-confidence') && analysis.confidenceBand === 'low')) {
      push('PWR-06', `“${game.title}” needs a re-read`,
        analysis.stale
          ? `This committed strategy has not been revisited in ${analysis.ageDays} days. Re-run the analysis (a no-op reanalysis still refreshes derived telemetry) so the coalition map reflects current stances.`
          : `Confidence is low (declared ${analysis.estimateConfidence}, robustness ${analysis.robustness.band}). Record better payoff evidence or downgrade the estimate explicitly rather than acting on a confident-looking number.`,
        2,
        [`Age: ${analysis.ageDays} day(s)`, `Confidence: ${analysis.confidenceBand}`, `Estimate: ${analysis.estimateConfidence}`]);
    }
  }
  return signals;
}

/* ------------------------------------------------------------------ */
/* 8. Atomic post-commit propagation (RULE-PWR-01..06)                 */
/* ------------------------------------------------------------------ */

function shouldRunPowerRule(event) {
  if (!event) return false;
  if (Array.isArray(event.rules) && event.rules.includes('power')) return true;
  const type = String(event.type || '');
  // A war-room game's mathematics depends ONLY on its own inline players,
  // weights, payoffs, target and quota — no external record changes those.
  // So the rule runs on its own events, an explicit force scan, or a person
  // archive/restore (which can invalidate an owner 1:1 talking point), and NOT
  // on every unrelated decision/delegation/case write (avoids alert fatigue).
  return (
    type.startsWith('power.') ||
    type === 'person.archived' ||
    type === 'person.restored' ||
    event.force === true
  );
}

function localEnsureGraphLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) || !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) || FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) || !sourceId || !targetId
  ) return { created: false };
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return { created: false };
  draft.links.push({
    id: ctx.idFactory('lnk'), sourceType, sourceId, targetType, targetId, relation,
    ruleId, summary, createdOn: ctx.todayStr, createdAt: ctx.nowIso,
  });
  return { created: true };
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}
function delegationExists(draft, marker) {
  return (draft.delegations || []).some((d) => d && String(d.support || '').includes(marker));
}
function talkingPointExists(draft, personId, marker) {
  const p = (draft.people || []).find((x) => x.id === personId);
  return Boolean(p && (p.talkingPoints || []).some((t) => String(t).includes(marker)));
}
function addTalkingPoint(draft, personId, text, marker) {
  const p = (draft.people || []).find((x) => x.id === personId);
  if (!p || talkingPointExists(draft, personId, marker)) return false;
  p.talkingPoints = [...(Array.isArray(p.talkingPoints) ? p.talkingPoints : []), `${text} ${marker}`].slice(-30);
  return true;
}

/**
 * The generalized post-commit rule. Runs once per store transaction (ADR-0008)
 * and fans a single power game out across modules — decisions, delegations,
 * 1:1 talking points, typed links and derived telemetry — atomically and
 * idempotently. A new DACI decision created here is then visible to the
 * decision-tempo rule that runs after it in the same transaction.
 */
export function powerRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  if (!shouldRunPowerRule(event)) return [];
  const declared = Array.isArray(event.rules) && event.rules.includes('power');
  if (draft.settings?.powerAutoPropagate === false && event.force !== true && !declared) return [];

  draft.powerGames = Array.isArray(draft.powerGames) ? draft.powerGames : [];
  if (!draft.powerGames.length) return [];

  // When the event names one game, the entity-creating rules (RULE-PWR-02/03/04)
  // act on that game only; a workspace-wide force scan has no such id and acts
  // on all games. Derived/link maintenance (RULE-PWR-01) always covers all.
  const powerEventGameId = String(event.type || '').startsWith('power.') && event.entityId ? event.entityId : null;
  const entityScope = powerEventGameId ? new Set([powerEventGameId]) : null;

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    ...ctx,
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const propagations = [];
  const pushProp = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    if (context.logEvent) {
      context.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${ruleId}] ${summary}` });
    }
  };
  const link = (game, targetType, targetId, relation, summary, ruleId = 'RULE-PWR-01') => {
    const r = localEnsureGraphLink(draft, {
      sourceType: 'power', sourceId: game.id, targetType, targetId, relation, ruleId, summary,
    }, context);
    if (r.created) pushProp(ruleId, 'linked', targetType, targetId, summary);
  };

  const settings = draft.settings || {};
  for (const game of draft.powerGames) {
    if (!game || game.autoPropagate === false || game.status === 'archived') continue;
    const inEntityScope = !entityScope || entityScope.has(game.id);

    // RULE-PWR-01 — typed links to every referenced entity that still exists.
    for (const sid of game.linkedStakeholderIds || []) {
      if ((draft.stakeholders || []).some((s) => s.id === sid)) link(game, 'stakeholder', sid, 'involves', `Stakeholder in coalition for “${game.title}”`);
    }
    if (game.linkedCaseId && (draft.cases || []).some((c) => c.id === game.linkedCaseId)) {
      link(game, 'case', game.linkedCaseId, 'stabilises', `Coalition strategy for operational case`);
    }
    if (game.linkedDecisionId && (draft.decisions || []).some((d) => d.id === game.linkedDecisionId)) {
      link(game, 'decision', game.linkedDecisionId, 'decides', `Coalition strategy informs this decision`);
    }
    if (game.linkedNegotiationId && (draft.negotiations || []).some((n) => n.id === game.linkedNegotiationId)) {
      link(game, 'negotiation', game.linkedNegotiationId, 'negotiates', `Incentive alignment negotiated here`);
    }
    for (const gid of game.linkedGoalIds || []) {
      if ((draft.goals || []).some((g) => g.id === gid)) link(game, 'goal', gid, 'impacts-goal', `Coalition outcome impacts this goal`);
    }
    if (game.ownerId && (draft.people || []).some((p) => p.id === game.ownerId)) {
      const r = localEnsureGraphLink(draft, {
        sourceType: 'person', sourceId: game.ownerId, targetType: 'power', targetId: game.id,
        relation: 'involves', ruleId: 'RULE-PWR-01', summary: `Coalition owner`,
      }, context);
      if (r.created) pushProp('RULE-PWR-01', 'linked', 'power', game.id, `Linked coalition owner`);
    }

    // Derived telemetry (RULE-PWR-01). Never overwrite human estimates; refresh
    // the derived snapshot on material verdict/confidence/cost change.
    const enriched = {
      ...game,
      settingsStaleDays: settings.powerStaleDays,
      settingsFragileMargin: settings.powerFragileMargin,
    };
    const analysis = analyzePowerGame(enriched, draft, context.now);
    const script = buildInfluenceScript(analysis, game);
    const nextDerived = {
      verdict: analysis.verdict,
      verdictLabel: analysis.verdictMeta.label,
      confidenceBand: analysis.confidenceBand,
      alignmentCost: analysis.alignment.alignmentCost,
      robustness: analysis.robustness.relativeRobustness,
      stressRadius: analysis.stress?.radius ?? null,
      stressNeedsReview: analysis.stress?.needsReview ?? false,
      coalitionFeasible: analysis.voting.coalitionFeasible,
      targetIsNE: analysis.targetIsNE,
      issues: [...analysis.issues],
      engineVersion: POWER_ENGINE_VERSION,
    };
    const prev = game.derived && typeof game.derived === 'object' ? game.derived : null;
    const changed = !prev
      || prev.verdict !== nextDerived.verdict
      || prev.confidenceBand !== nextDerived.confidenceBand
      || prev.alignmentCost !== nextDerived.alignmentCost
      || prev.robustness !== nextDerived.robustness
      || prev.stressRadius !== nextDerived.stressRadius
      || prev.stressNeedsReview !== nextDerived.stressNeedsReview
      || prev.engineVersion !== nextDerived.engineVersion;
    if (changed) {
      game.derived = nextDerived;
      game.updatedAt = context.nowIso;
      if (prev) {
        game.history = [...(Array.isArray(game.history) ? game.history : []), {
          on: context.todayStr, action: 'derived-refreshed',
          note: `Verdict ${prev.verdict || 'unknown'} → ${nextDerived.verdict}; alignment cost ${prev.alignmentCost ?? '—'} → ${nextDerived.alignmentCost}.`,
        }].slice(-40);
      }
      pushProp('RULE-PWR-01', 'refreshed', 'power', game.id, `Derived verdict “${nextDerived.verdict}” (confidence ${nextDerived.confidenceBand})`);
    }

    // RULE-PWR-02 — blocked coalition → one DACI decision.
    const decMarker = `[RULE-PWR-02:${game.id}]`;
    if (inEntityScope && (analysis.issues.includes('coalition-blocked') || analysis.stress?.needsReview) && game.status !== 'settled' && !decisionExists(draft, decMarker)) {
      const who = analysis.voting.decisiveOpposition.map((p) => p.name).slice(0, 3).join(', ') || 'opposed stakeholder(s)';
      const question = [
        `Coalition strategy for “${game.title}”: allies/neutrals hold ${analysis.voting.nonOpposedWeight} of ${analysis.voting.quota} votes needed.`,
        `Choose how to reach a winning coalition ${decMarker}`,
        analysis.stress?.needsReview ? powerStressBrief(analysis.stress) : '',
      ].join(' ');
      draft.decisions.push({
        id: context.idFactory('dec'),
        title: `Coalition strategy: ${game.title}`.slice(0, 180),
        question: question.slice(0, 2000),
        date: context.todayStr,
        reversibility: 'reversible',
        driver: (draft.settings?.leaderName || '').slice(0, 120),
        approver: '',
        contributors: who.slice(0, 300),
        informed: '',
        options: [
          { id: context.idFactory('dopt'), label: analysis.stress?.needsReview ? 'Verify uncertainty bounds and stakeholder commitments' : `Persuade the pivotal opponent (${who.slice(0, 60)})`, pros: 'Keeps the original proposal intact', cons: 'Depends on changing an opposed interest' },
          { id: context.idFactory('dopt'), label: analysis.stress?.needsReview ? 'Redesign payoffs for a robust transfer interval' : 'Redesign the proposal to remove the objection', pros: 'Removes the blocker at its cause', cons: 'Costs scope or time' },
          { id: context.idFactory('dopt'), label: analysis.stress?.needsReview ? 'Compare minimax-regret strategy and a resilient coalition' : 'Build an alternative minimum winning coalition', pros: 'Routes around a veto', cons: 'Needs a different set of commitments' },
          { id: context.idFactory('dopt'), label: 'Delay & accept the status quo (price the delay in Tempo)', pros: 'Avoids a premature commitment', cons: 'Incurs measurable cost of delay' },
        ],
        chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
        outcome: 'pending', outcomeNotes: '', createdAt: context.nowIso,
      });
      const newDec = draft.decisions[draft.decisions.length - 1];
      link(game, 'decision', newDec.id, 'decides', `DACI coalition-strategy decision ${decMarker}`, 'RULE-PWR-02');
      pushProp('RULE-PWR-02', 'created', 'decision', newDec.id, `Opened DACI coalition decision for “${game.title}” (feeds Decision Tempo)`);
    }

    // RULE-PWR-03 — misaligned target → one blameless alignment delegation.
    const delMarker = `[RULE-PWR-03:${game.id}]`;
    const ownerValid = game.ownerId && (draft.people || []).some((p) => p.id === game.ownerId && p.status !== 'archived');
    if (inEntityScope && analysis.issues.includes('misaligned') && analysis.alignment.alignmentCost > 0
      && ownerValid && !delegationExists(draft, delMarker)) {
      const dueOn = (() => {
        try { const d = new Date(context.now); d.setDate(d.getDate() + 14); return dayKey(d); } catch { return null; }
      })();
      draft.delegations.push({
        id: context.idFactory('delegation'),
        personId: game.ownerId,
        title: `Align incentives for “${game.title}”`.slice(0, 160),
        expectedOutcome: script.ask.slice(0, 600),
        authority: 'recommend',
        support: `${script.opening[0] || ''} Ask: ${script.ask} ${delMarker}`.slice(0, 1200),
        delegatedOn: context.todayStr,
        dueOn,
        status: 'active',
        checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
        createdAt: context.nowIso, updatedAt: context.nowIso,
      });
      const newDel = draft.delegations[draft.delegations.length - 1];
      link(game, 'delegation', newDel.id, 'stabilises', `Incentive-alignment outreach ${delMarker}`, 'RULE-PWR-03');
      pushProp('RULE-PWR-03', 'created', 'delegation', newDel.id, `Opened blameless alignment delegation (transfer ≈ ${analysis.alignment.alignmentCost}) for “${game.title}”`);
      addTalkingPoint(draft, game.ownerId,
        `[War room] Rehearse the incentive-alignment conversation for “${game.title}”: ${script.ask}`, delMarker);
      pushProp('RULE-PWR-03', 'updated', 'person', game.ownerId, `Queued a blameless 1:1 alignment talking point`);
    }

    // RULE-PWR-04 — coordination risk / fragility → estimate-verification prompt.
    const verifyMarker = `[RULE-PWR-04:${game.id}]`;
    const needsVerify = game.status !== 'settled' && (analysis.issues.includes('coordination-risk') || analysis.issues.includes('fragile') || analysis.stress?.needsReview);
    const confident = analysis.confidenceBand === 'high' && !analysis.stress?.needsReview;
    if (ownerValid && inEntityScope) {
      if (needsVerify && !confident && !talkingPointExists(draft, game.ownerId, verifyMarker)) {
        const added = addTalkingPoint(draft, game.ownerId,
          `[War room] Verify the payoff estimates for “${game.title}” before committing — robustness ${analysis.robustness.relativeRobustness} (${analysis.robustness.band}).${analysis.stress ? ` Stress bound ±${analysis.stress.radius}; fixed transfer ${analysis.stress.transferFeasible ? "feasible" : "NOT feasible"}. Confirm the bound and coalition commitments, not an employee rating.` : ""}`, verifyMarker);
        if (added) pushProp('RULE-PWR-04', 'updated', 'person', game.ownerId, `Queued an estimate-verification 1:1 talking point`);
      } else if ((!needsVerify || confident) && talkingPointExists(draft, game.ownerId, verifyMarker)) {
        const p = (draft.people || []).find((x) => x.id === game.ownerId);
        if (p) {
          p.talkingPoints = (p.talkingPoints || []).filter((t) => !String(t).includes(verifyMarker));
          pushProp('RULE-PWR-04', 'updated', 'person', game.ownerId, `Cleared a resolved estimate-verification talking point`);
        }
      }
    }
  }

  // RULE-PWR-05 — settlement learning (append-only history, no history rewrite).
  if (event.type === 'power.settled' && event.entityId) {
    const game = draft.powerGames.find((g) => g.id === event.entityId);
    if (game && game.status === 'settled') {
      const markerNote = 'settlement-recorded';
      if (!(game.history || []).some((h) => h.action === markerNote)) {
        game.history = [...(Array.isArray(game.history) ? game.history : []), {
          on: context.todayStr, action: markerNote,
          note: `Realised outcome ${game.realizedCell || 'unrecorded'} captured for future calibration; opening analysis frozen.`,
        }].slice(-40);
        pushProp('RULE-PWR-05', 'updated', 'power', game.id, `Recorded settlement outcome ${game.realizedCell || 'unrecorded'}`);
      }
    }
  }

  return propagations;
}
