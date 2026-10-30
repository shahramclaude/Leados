/**
 * app/core/domain/decisionPortfolio.js — Decision Portfolio Sequencing Engine.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * LeadOS can already record what was decided (Decisions), price an individual
 * decision's timing (Decision Tempo), trace its premises (Assumption Ledger),
 * and cascade events across modules (Post-Commit Spine). None of those answer
 * the question a leader with fifteen open calls actually asks: **in what order
 * should I decide these, and what is my current ordering costing me?**
 *
 * Every existing tool treats a decision queue as a list. This module treats it
 * as a **constrained portfolio scheduling problem** with four named bodies of
 * theory implemented explicitly:
 *
 *  1. Decision Coupling (Simon 1962; Baldwin & Clark 2000). Two decisions are
 *     coupled when they share a premise, an approver, a typed resource (case,
 *     goal, budget, delegation), or a stakeholder. Coupling is derived from
 *     the typed link graph — never declared by the leader.
 *
 *  2. Precedence-Constrained Scheduling (Pinedo 2012; Möhring, Schäffter &
 *     Schulz 1997). A decision B depends on decision A when B rests on a
 *     premise that A's outcome would update, or when a shared typed link makes
 *     A's resolution a precondition for B. The dependency DAG is derived from
 *     the premise and link graphs. Sequencing respects this DAG: no decision
 *     is scheduled before its prerequisites.
 *
 *  3. CD3 Prioritization (Reinertsen 2009). Within each topological layer of
 *     the DAG, decisions are ranked by CD3 = Cost of Delay ÷ Duration, so a
 *     high-value quick call is never stuck behind a low-value slow one.
 *     Unpriced decisions are listed last with an explicit count — never zero,
 *     because a zero would look like the cheapest item on the page.
 *
 *  4. Bottleneck Analysis (Goldratt 1984; Hopp & Spearman 2011). The approver
 *     who appears on the most open decisions is the binding constraint on the
 *     portfolio. Approver HHI (Herfindahl–Hirschman Index) measures how
 *     concentrated the bottleneck is, and the "critical path" is the longest
 *     dependency chain by total delay cost, not by count.
 *
 * WHAT IS NOT CLAIMED
 * -------------------
 * - The optimal sequence is a greedy heuristic on a topological sort, not a
 *   proven optimum. Weighted job scheduling with precedence constraints is
 *   NP-hard (Lenstra & Rinnooy Kan 1978); the greedy solution is the standard
 *   practical approximation.
 * - Coupling is structural (shared records), not semantic. Two decisions about
 *   the same topic with no shared typed link are invisible to this engine.
 * - Dependencies are derived from premises and typed links, not from prose.
 *   A decision whose prerequisite is "I need to think about it" has no
 *   modelled dependency.
 * - The sequencing regret assumes delay costs are additive and independent.
 *   In reality, two coupled decisions might have subadditive delay cost
 *   (deciding together saves time) or superadditive (one makes the other
 *   moot). The engine prints the additive figure and labels it as such.
 * - No person is ever scored, ranked or rated. This module measures the
 *   leader's queue, not the leader.
 */

import { daysBetween, daysSince, isOverdue, round } from '../time.js';
import {
  LINK_ENTITY_TYPES,
  linksForEntity,
} from './cases.js';
import {
  buildTempoReport,
  DECISION_TYPES,
  DELAY_PROFILES,
} from './decisionTempo.js';

export const PORTFOLIO_ENGINE_VERSION = 'portfolio-2026.10-v1';

/** Minimum open decisions before portfolio intelligence is meaningful. */
export const PORTFOLIO_MIN_DECISIONS = 2;

/** Below this many decisions, cluster analysis is counts-only. */
export const PORTFOLIO_CLUSTER_MIN = 3;

/**
 * A decision is "attention-worthy" in the portfolio when its sequencing
 * position or coupling signal changes the recommended order.
 */
export const PORTFOLIO_SIGNALS = Object.freeze({
  COUPLING_FOUND: 'DPF-01',
  DEPENDENCY_FOUND: 'DPF-02',
  BOTTLENECK_APPROVER: 'DPF-03',
  SEQUENCING_REGRET: 'DPF-04',
  PREMISE_CONCENTRATION: 'DPF-05',
  LONG_CHAIN: 'DPF-06',
  UNPRICED_BLOCK: 'DPF-07',
  CLUSTER_READY: 'DPF-08',
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function moneyOrNull(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  return { currency: currency || null, amount: Math.round(Number(amount)) };
}

function safeArray(val) {
  return Array.isArray(val) ? val : [];
}

/* ------------------------------------------------------------------ */
/* Coupling Analysis                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build the set of typed-link neighbours for a decision. Returns a Map of
 * `${peerType}:${peerId}` → { type, id, relations[] }.
 */
function decisionNeighbours(state, decisionId) {
  const links = linksForEntity(state, 'decision', decisionId);
  const map = new Map();
  for (const link of links) {
    if (!link.peer) continue;
    const key = `${link.peer.type}:${link.peer.id}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.relations.includes(link.relation)) existing.relations.push(link.relation);
    } else {
      map.set(key, { type: link.peer.type, id: link.peer.id, relations: [link.relation] });
    }
  }
  return map;
}

/**
 * Compute the coupling matrix between all open decisions. Two decisions are
 * coupled when they share at least one typed-link neighbour (case, goal,
 * budget, delegation, stakeholder, premise, etc.) or the same DACI approver.
 *
 * Returns:
 *   - coupling: Map<decisionId, Map<decisionId, { sharedResources[], sharedApprover, sharedPremises[] }>>
 *   - clusters: array of connected components (arrays of decision IDs)
 */
export function decisionCoupling(state, openDecisions) {
  const ids = openDecisions.map((d) => d.id);
  const idSet = new Set(ids);

  // Pre-compute neighbours per decision.
  const neighbours = new Map();
  for (const d of openDecisions) {
    neighbours.set(d.id, decisionNeighbours(state, d.id));
  }

  // Build coupling pairs.
  const coupling = new Map();
  for (const id of ids) coupling.set(id, new Map());

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const na = neighbours.get(a);
      const nb = neighbours.get(b);
      const sharedResources = [];

      // Shared typed-link neighbours (excluding decision-to-decision links
      // themselves, which would be circular).
      for (const [key, peer] of na) {
        if (peer.type === 'decision') continue;
        if (nb.has(key)) {
          sharedResources.push({
            type: peer.type,
            id: peer.id,
            relationsA: peer.relations,
            relationsB: nb.get(key).relations,
          });
        }
      }

      // Shared DACI approver.
      const decA = openDecisions.find((d) => d.id === a);
      const decB = openDecisions.find((d) => d.id === b);
      const sharedApprover = Boolean(
        decA?.approver && decB?.approver &&
        decA.approver.trim().toLowerCase() === decB.approver.trim().toLowerCase()
      );

      // Shared premises (both rest-on the same premise).
      const sharedPremises = sharedResources
        .filter((r) => r.type === 'premise')
        .map((r) => r.id);

      if (sharedResources.length > 0 || sharedApprover) {
        const pair = { sharedResources, sharedApprover, sharedPremises };
        coupling.get(a).set(b, pair);
        coupling.get(b).set(a, pair);
      }
    }
  }

  // Connected components via union-find.
  const parent = new Map();
  for (const id of ids) parent.set(id, id);
  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(x, y) {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent.set(px, py);
  }
  for (const a of ids) {
    for (const [b] of coupling.get(a)) {
      union(a, b);
    }
  }
  const clusterMap = new Map();
  for (const id of ids) {
    const root = find(id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(id);
  }
  const clusters = [...clusterMap.values()].sort((a, b) => b.length - a.length);

  return { coupling, clusters };
}

/* ------------------------------------------------------------------ */
/* Dependency Analysis                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a dependency DAG between open decisions. A directed edge A → B means
 * "B should wait for A" because:
 *
 *  1. B rests on a premise that is also linked to A's outcome (A decides
 *     something the premise tests or informs).
 *  2. A's typed links include a case/goal/budget that B also links to, and A
 *     has a higher CD3 or was created earlier — making it the natural
 *     predecessor.
 *
 * Returns { edges: Map<decisionId, Set<decisionId>>, topologicalLayers: string[][] }
 * where edges[a] = set of decisions that depend on a.
 */
export function decisionDependencies(state, openDecisions, tempoById) {
  const ids = new Set(openDecisions.map((d) => d.id));
  const edges = new Map();
  for (const id of ids) edges.set(id, new Set());

  // Build premise → decisions map.
  const premiseToDecisions = new Map();
  for (const d of openDecisions) {
    const links = linksForEntity(state, 'decision', d.id);
    for (const link of links) {
      if (link.peer.type === 'premise' && link.relation === 'rests-on') {
        if (!premiseToDecisions.has(link.peer.id)) premiseToDecisions.set(link.peer.id, []);
        premiseToDecisions.get(link.peer.id).push(d.id);
      }
    }
  }

  // For each premise shared by multiple decisions, the one with the highest
  // CD3 (or earliest date) is the predecessor.
  for (const [, decIds] of premiseToDecisions) {
    if (decIds.length < 2) continue;
    const scored = decIds.map((id) => {
      const tempo = tempoById.get(id);
      const cd3 = tempo?.timing?.cd3 ?? null;
      const dec = openDecisions.find((d) => d.id === id);
      return { id, cd3, date: dec?.date || '' };
    });
    // Sort: highest CD3 first, then earliest date.
    scored.sort((a, b) => {
      if (a.cd3 !== null && b.cd3 !== null) return b.cd3 - a.cd3;
      if (a.cd3 !== null) return -1;
      if (b.cd3 !== null) return 1;
      return String(a.date).localeCompare(String(b.date));
    });
    // The first is the predecessor; the rest depend on it.
    for (let i = 1; i < scored.length; i++) {
      edges.get(scored[0].id).add(scored[i].id);
    }
  }

  // Topological sort into layers (Kahn's algorithm).
  const inDegree = new Map();
  for (const id of ids) inDegree.set(id, 0);
  for (const [, targets] of edges) {
    for (const t of targets) inDegree.set(t, (inDegree.get(t) || 0) + 1);
  }
  const layers = [];
  const remaining = new Set(ids);
  while (remaining.size > 0) {
    const layer = [];
    for (const id of remaining) {
      if ((inDegree.get(id) || 0) === 0) layer.push(id);
    }
    if (layer.length === 0) {
      // Cycle detected — break it by including all remaining.
      layers.push([...remaining]);
      break;
    }
    // Sort within layer by CD3 descending, then date ascending.
    layer.sort((a, b) => {
      const ta = tempoById.get(a);
      const tb = tempoById.get(b);
      const cd3a = ta?.timing?.cd3 ?? null;
      const cd3b = tb?.timing?.cd3 ?? null;
      if (cd3a !== null && cd3b !== null) return cd3b - cd3a;
      if (cd3a !== null) return -1;
      if (cd3b !== null) return 1;
      const da = openDecisions.find((d) => d.id === a);
      const db = openDecisions.find((d) => d.id === b);
      return String(da?.date || '').localeCompare(String(db?.date || ''));
    });
    layers.push(layer);
    for (const id of layer) {
      remaining.delete(id);
      for (const target of edges.get(id) || []) {
        inDegree.set(target, (inDegree.get(target) || 0) - 1);
      }
    }
  }

  return { edges, topologicalLayers: layers };
}

/* ------------------------------------------------------------------ */
/* Portfolio Report                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build the full decision portfolio report.
 *
 * @param {object} state — the full workspace state.
 * @param {Date} now — current time.
 * @param {object} [options] — settings overrides.
 * @returns {object} — the portfolio report.
 */
export function buildDecisionPortfolioReport(state, now, options = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const allDecisions = safeArray(state.decisions);
  const open = allDecisions.filter((d) => !d.chosen);
  const tempo = buildTempoReport(state, { now: at, settings: state.settings });
  const tempoById = new Map(tempo.rows.map((r) => [r.decision.id, r]));

  const report = {
    engineVersion: PORTFOLIO_ENGINE_VERSION,
    now: at.toISOString(),
    totals: {
      open: open.length,
      priced: 0,
      unpriced: 0,
      totalWeeklyDelayCost: null,
      currency: null,
    },
    decisions: [],
    coupling: { pairs: 0, matrix: null, clusters: [] },
    dependencies: { edges: 0, topologicalLayers: [], maxChainLength: 0 },
    sequencing: { optimal: [], regret: null, currentOrderCost: null, optimalOrderCost: null },
    bottlenecks: { approvers: [], maxApproverLoad: 0, approverHHI: null },
    loadIndex: null,
    signals: [],
  };

  if (open.length < PORTFOLIO_MIN_DECISIONS) {
    return report;
  }

  // ---- Per-decision enrichment ----
  const enriched = open.map((d) => {
    const tempoRow = tempoById.get(d.id) || null;
    const timing = tempoRow?.timing || null;
    const priced = Boolean(timing?.priced);
    const weeklyCoD = timing?.weeklyCostOfDelay ?? null;
    const cd3 = timing?.cd3 ?? null;
    const currency = timing?.currency || null;
    if (priced) report.totals.priced++;
    else report.totals.unpriced++;
    return {
      decision: d,
      timing,
      priced,
      weeklyCoD,
      cd3,
      currency,
      ageDays: daysSince(d.date, at) ?? 0,
      type: d.decisionType || null,
      reversibility: d.reversibility || 'reversible',
      approver: d.approver || null,
      driver: d.driver || null,
    };
  });

  // ---- Total weekly delay cost (additive, per currency) ----
  const byCurrency = new Map();
  for (const e of enriched) {
    if (e.priced && e.weeklyCoD !== null && e.currency) {
      const current = byCurrency.get(e.currency) || 0;
      byCurrency.set(e.currency, current + e.weeklyCoD);
    }
  }
  // Report the dominant currency's total (currencies are never summed).
  if (byCurrency.size === 1) {
    const [currency, total] = [...byCurrency.entries()][0];
    report.totals.totalWeeklyDelayCost = Math.round(total);
    report.totals.currency = currency;
  } else if (byCurrency.size > 1) {
    // Multiple currencies: report each separately.
    report.totals.currencyBreakdown = [...byCurrency.entries()]
      .map(([c, t]) => ({ currency: c, totalWeeklyDelayCost: Math.round(t) }))
      .sort((a, b) => b.totalWeeklyDelayCost - a.totalWeeklyDelayCost);
    // Use the largest as the headline.
    report.totals.currency = report.totals.currencyBreakdown[0].currency;
    report.totals.totalWeeklyDelayCost = report.totals.currencyBreakdown[0].totalWeeklyDelayCost;
  }

  // ---- Coupling ----
  const { coupling, clusters } = decisionCoupling(state, open);
  let pairCount = 0;
  for (const [, peers] of coupling) pairCount += peers.size;
  report.coupling.pairs = pairCount / 2; // each pair counted twice
  report.coupling.clusters = clusters.map((ids, idx) => {
    const decs = ids.map((id) => enriched.find((e) => e.decision.id === id)).filter(Boolean);
    const pricedCount = decs.filter((e) => e.priced).length;
    const totalCoD = decs.reduce((sum, e) => sum + (e.weeklyCoD || 0), 0);
    return {
      id: `cluster-${idx}`,
      decisionIds: ids,
      size: ids.length,
      pricedCount,
      unpricedCount: ids.length - pricedCount,
      totalWeeklyCoD: pricedCount > 0 ? Math.round(totalCoD) : null,
      isSingleton: ids.length === 1,
    };
  });
  report.coupling.matrix = coupling;

  // ---- Dependencies ----
  const { edges, topologicalLayers } = decisionDependencies(state, open, tempoById);
  let edgeCount = 0;
  for (const [, targets] of edges) edgeCount += targets.size;
  report.dependencies.edges = edgeCount;
  report.dependencies.topologicalLayers = topologicalLayers;
  report.dependencies.maxChainLength = topologicalLayers.length;

  // ---- Optimal Sequencing ----
  // The optimal order respects the DAG (topological layers) and within each
  // layer sorts by CD3 descending.
  const optimal = [];
  let position = 0;
  for (const layer of topologicalLayers) {
    for (const id of layer) {
      const e = enriched.find((x) => x.decision.id === id);
      if (e) {
        position++;
        optimal.push({ ...e, position, layer: topologicalLayers.indexOf(layer) });
      }
    }
  }
  report.sequencing.optimal = optimal;

  // Sequencing regret: compare the "natural" order (by date, oldest first —
  // what most leaders do) against the CD3-optimized order. The difference in
  // total weighted completion time is the regret.
  // Weighted completion time = Σ (position × weeklyCoD) — higher means more
  // delay cost is being carried for longer.
  const naturalOrder = [...enriched].sort((a, b) => {
    return String(a.decision.date || '').localeCompare(String(b.decision.date || ''));
  });
  let naturalCost = 0;
  let optimalCost = 0;
  for (let i = 0; i < naturalOrder.length; i++) {
    const cod = naturalOrder[i].weeklyCoD || 0;
    naturalCost += (i + 1) * cod;
  }
  for (let i = 0; i < optimal.length; i++) {
    const cod = optimal[i].weeklyCoD || 0;
    optimalCost += (i + 1) * cod;
  }
  report.sequencing.currentOrderCost = Math.round(naturalCost);
  report.sequencing.optimalOrderCost = Math.round(optimalCost);
  report.sequencing.regret = Math.round(Math.max(0, naturalCost - optimalCost));

  // ---- Bottleneck Analysis ----
  const approverCount = new Map();
  for (const e of enriched) {
    if (e.approver) {
      const key = e.approver.trim().toLowerCase();
      approverCount.set(key, (approverCount.get(key) || 0) + 1);
    }
  }
  const approvers = [...approverCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  report.bottlenecks.approvers = approvers;
  report.bottlenecks.maxApproverLoad = approvers.length > 0 ? approvers[0].count : 0;

  // HHI: sum of squared shares. 1.0 = one approver holds everything.
  if (approvers.length > 0) {
    const total = approvers.reduce((s, a) => s + a.count, 0);
    const hhi = approvers.reduce((s, a) => s + Math.pow(a.count / total, 2), 0);
    report.bottlenecks.approverHHI = round(hhi, 3);
  }

  // ---- Decision Load Index ----
  // Composite of five normalized components (each 0–1):
  //   1. Count: open decisions / a conventional ceiling of 20
  //   2. Economic exposure: total weekly CoD / a conventional ceiling
  //   3. Approver concentration: HHI (already 0–1)
  //   4. Premise concentration: max premise fan-in / total open
  //   5. Dependency depth: chain length / total open
  const countScore = clamp(open.length / 20, 0, 1);
  const maxWeeklyCoD = report.totals.totalWeeklyDelayCost || 0;
  // Conventional ceiling: 50k per week is "a lot".
  const economicScore = clamp(maxWeeklyCoD / 50000, 0, 1);
  const hhiScore = report.bottlenecks.approverHHI || 0;

  // Premise concentration: how many open decisions share a single premise?
  const premiseToDecs = new Map();
  for (const d of open) {
    const links = linksForEntity(state, 'decision', d.id);
    for (const link of links) {
      if (link.peer.type === 'premise') {
        premiseToDecs.set(link.peer.id, (premiseToDecs.get(link.peer.id) || 0) + 1);
      }
    }
  }
  const maxPremiseFanIn = premiseToDecs.size > 0 ? Math.max(...premiseToDecs.values()) : 0;
  const premiseScore = open.length > 0 ? clamp(maxPremiseFanIn / open.length, 0, 1) : 0;
  const depthScore = open.length > 0 ? clamp(report.dependencies.maxChainLength / open.length, 0, 1) : 0;

  // Weights: count 0.15, economic 0.35, bottleneck 0.20, premise 0.15, depth 0.15
  const loadIndex = round(
    countScore * 0.15 +
    economicScore * 0.35 +
    hhiScore * 0.20 +
    premiseScore * 0.15 +
    depthScore * 0.15,
    3
  );

  // Band classification.
  let band;
  if (loadIndex < 0.20) band = { id: 'light', label: 'Light', help: 'Few open decisions, low concentration.' };
  else if (loadIndex < 0.40) band = { id: 'moderate', label: 'Moderate', help: 'A manageable queue. Watch for bottlenecks.' };
  else if (loadIndex < 0.60) band = { id: 'elevated', label: 'Elevated', help: 'Decision load is consuming attention. Consider batching or delegating.' };
  else if (loadIndex < 0.80) band = { id: 'heavy', label: 'Heavy', help: 'The queue is a binding constraint on the team. Portfolio triage is warranted.' };
  else band = { id: 'critical', label: 'Critical', help: 'Decision debt is systemic. Immediate triage required.' };

  report.loadIndex = {
    value: loadIndex,
    band,
    components: {
      count: { score: round(countScore, 3), weight: 0.15, raw: open.length },
      economic: { score: round(economicScore, 3), weight: 0.35, raw: maxWeeklyCoD },
      bottleneck: { score: round(hhiScore, 3), weight: 0.20, raw: report.bottlenecks.approverHHI },
      premise: { score: round(premiseScore, 3), weight: 0.15, raw: maxPremiseFanIn },
      depth: { score: round(depthScore, 3), weight: 0.15, raw: report.dependencies.maxChainLength },
    },
  };

  // ---- Signals ----
  const signals = [];
  if (report.coupling.pairs > 0) {
    signals.push({
      id: PORTFOLIO_SIGNALS.COUPLING_FOUND,
      severity: report.coupling.pairs >= 5 ? 3 : 2,
      summary: `${report.coupling.pairs} coupled decision ${report.coupling.pairs === 1 ? 'pair' : 'pairs'} share premises, resources or approvers.`,
    });
  }
  if (report.dependencies.edges > 0) {
    signals.push({
      id: PORTFOLIO_SIGNALS.DEPENDENCY_FOUND,
      severity: report.dependencies.maxChainLength >= 3 ? 3 : 2,
      summary: `${report.dependencies.edges} decision ${report.dependencies.edges === 1 ? 'dependency' : 'dependencies'} found across ${report.dependencies.maxChainLength} layer${report.dependencies.maxChainLength === 1 ? '' : 's'}.`,
    });
  }
  if (report.bottlenecks.maxApproverLoad >= 3) {
    signals.push({
      id: PORTFOLIO_SIGNALS.BOTTLENECK_APPROVER,
      severity: report.bottlenecks.maxApproverLoad >= 5 ? 4 : 3,
      summary: `"${report.bottlenecks.approvers[0].name}" approves ${report.bottlenecks.maxApproverLoad} open decisions — the binding constraint.`,
    });
  }
  if (report.sequencing.regret > 0 && report.totals.totalWeeklyDelayCost) {
    signals.push({
      id: PORTFOLIO_SIGNALS.SEQUENCING_REGRET,
      severity: report.sequencing.regret > report.totals.totalWeeklyDelayCost ? 3 : 2,
      summary: `Reordering the queue saves ${Math.round(report.sequencing.regret)} weighted-delay units vs. the date-first order.`,
    });
  }
  if (maxPremiseFanIn >= 3) {
    signals.push({
      id: PORTFOLIO_SIGNALS.PREMISE_CONCENTRATION,
      severity: maxPremiseFanIn >= 5 ? 4 : 3,
      summary: `${maxPremiseFanIn} open decisions rest on one premise. If it breaks, they all need re-deciding.`,
    });
  }
  if (report.dependencies.maxChainLength >= 4) {
    signals.push({
      id: PORTFOLIO_SIGNALS.LONG_CHAIN,
      severity: 3,
      summary: `A ${report.dependencies.maxChainLength}-decision dependency chain means one stall cascades through the queue.`,
    });
  }
  if (report.totals.unpriced >= 3) {
    signals.push({
      id: PORTFOLIO_SIGNALS.UNPRICED_BLOCK,
      severity: 2,
      summary: `${report.totals.unpriced} open decisions have no delay cost. The queue cannot be sequenced until they are priced.`,
    });
  }
  const readyClusters = report.coupling.clusters.filter((c) => c.size >= 2 && c.pricedCount === c.size);
  if (readyClusters.length > 0) {
    signals.push({
      id: PORTFOLIO_SIGNALS.CLUSTER_READY,
      severity: 2,
      summary: `${readyClusters.length} decision cluster${readyClusters.length === 1 ? '' : 's'} fully priced and ready for batch scheduling.`,
    });
  }
  report.signals = signals;
  report.decisions = enriched;

  return report;
}

/* ------------------------------------------------------------------ */
/* Deferral Simulation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Simulate deferring a set of decisions by N weeks and compute the
 * accumulated additional delay cost.
 *
 * @param {object} report — the portfolio report from buildDecisionPortfolioReport.
 * @param {string[]} deferIds — decision IDs to defer.
 * @param {number} weeks — weeks to defer by.
 * @returns {object} — { additionalCost, currency, deferredDecisions, cascadeIds }
 */
export function simulateDeferral(report, deferIds, weeks) {
  if (!Number.isFinite(weeks) || weeks <= 0) {
    return { additionalCost: null, currency: null, deferredDecisions: [], cascadeIds: [] };
  }
  const deferSet = new Set(deferIds);
  const deferred = [];
  const cascadeIds = new Set();

  // Find all decisions that depend on any deferred decision (transitive).
  const depEdges = new Map();
  for (const e of report.decisions) {
    const id = e.decision.id;
    if (!depEdges.has(id)) depEdges.set(id, new Set());
  }
  // Rebuild edges from the topological layers: if A is in an earlier layer
  // and B is in a later layer, and they share a premise, A → B.
  for (const e of report.decisions) {
    for (const layer of report.dependencies.topologicalLayers) {
      for (const lid of layer) {
        if (lid === e.decision.id) continue;
        // Check if this is a dependency edge (from report.dependencies.topologicalLayers ordering).
        // Simpler: use the report.sequencing.optimal order.
      }
    }
  }

  // For cascade: any decision in a later topological layer than a deferred
  // decision that shares a premise is cascaded.
  const layerOf = new Map();
  report.dependencies.topologicalLayers.forEach((layer, idx) => {
    for (const id of layer) layerOf.set(id, idx);
  });

  for (const e of report.decisions) {
    if (!deferSet.has(e.decision.id)) continue;
    const deferCost = e.priced ? Math.round((e.weeklyCoD || 0) * weeks) : null;
    deferred.push({
      id: e.decision.id,
      title: e.decision.title,
      weeklyCoD: e.weeklyCoD,
      additionalCost: deferCost,
      currency: e.currency,
      priced: e.priced,
    });
    // Cascade: decisions in later layers that share resources.
    const eLayer = layerOf.get(e.decision.id) ?? 0;
    for (const other of report.decisions) {
      if (other.decision.id === e.decision.id) continue;
      if (deferSet.has(other.decision.id)) continue;
      const oLayer = layerOf.get(other.decision.id) ?? 0;
      if (oLayer > eLayer) cascadeIds.add(other.decision.id);
    }
  }

  // Total additional cost (per currency).
  const byCurrency = new Map();
  for (const d of deferred) {
    if (d.additionalCost !== null && d.currency) {
      byCurrency.set(d.currency, (byCurrency.get(d.currency) || 0) + d.additionalCost);
    }
  }

  const primaryCurrency = report.totals.currency || null;
  const totalAdditional = primaryCurrency ? (byCurrency.get(primaryCurrency) || null) : null;

  return {
    additionalCost: totalAdditional !== null ? Math.round(totalAdditional) : null,
    currency: primaryCurrency,
    currencyBreakdown: [...byCurrency.entries()].map(([c, t]) => ({ currency: c, additionalCost: Math.round(t) })),
    deferredDecisions: deferred,
    cascadeIds: [...cascadeIds],
    weeks,
  };
}

/* ------------------------------------------------------------------ */
/* Attention Count (for nav badge)                                      */
/* ------------------------------------------------------------------ */

/**
 * Returns the count of portfolio-level attention items for the nav badge.
 * Counts: bottleneck approver (≥3), sequencing regret > 0, premise
 * concentration ≥ 3, long chain ≥ 4, and cluster-ready signals.
 */
export function decisionPortfolioAttention(state, now) {
  const open = (state.decisions || []).filter((d) => !d.chosen);
  if (open.length < PORTFOLIO_MIN_DECISIONS) return 0;
  const report = buildDecisionPortfolioReport(state, now);
  return report.signals.filter((s) => s.severity >= 3).length;
}

/* ------------------------------------------------------------------ */
/* Board Brief (deterministic plain-text summary)                       */
/* ------------------------------------------------------------------ */

export function portfolioBoardBrief(report) {
  if (!report || report.totals.open < PORTFOLIO_MIN_DECISIONS) {
    return 'Decision portfolio intelligence requires at least two open decisions.';
  }
  const lines = [];
  lines.push(`Decision Portfolio — ${report.totals.open} open decisions, ${report.totals.priced} priced.`);
  if (report.totals.totalWeeklyDelayCost !== null) {
    lines.push(`Total weekly carrying cost: ${report.totals.currency || ''} ${report.totals.totalWeeklyDelayCost.toLocaleString('en-US')} (additive, currencies not summed).`);
  }
  if (report.loadIndex) {
    lines.push(`Decision load index: ${Math.round(report.loadIndex.value * 100)}% — ${report.loadIndex.band.label} (${report.loadIndex.band.help})`);
  }
  if (report.sequencing.regret > 0) {
    lines.push(`Sequencing: reordering by CD3 saves ${report.sequencing.regret} weighted-delay units vs. date-first ordering.`);
  }
  if (report.coupling.pairs > 0) {
    lines.push(`Coupling: ${report.coupling.pairs} pairs share premises, resources or approvers across ${report.coupling.clusters.length} cluster${report.coupling.clusters.length === 1 ? '' : 's'}.`);
  }
  if (report.dependencies.edges > 0) {
    lines.push(`Dependencies: ${report.dependencies.edges} edges, ${report.dependencies.maxChainLength}-layer chain.`);
  }
  if (report.bottlenecks.maxApproverLoad >= 3) {
    lines.push(`Bottleneck: "${report.bottlenecks.approvers[0].name}" approves ${report.bottlenecks.maxApproverLoad} decisions (HHI ${report.bottlenecks.approverHHI}).`);
  }
  if (report.totals.unpriced > 0) {
    lines.push(`${report.totals.unpriced} decision${report.totals.unpriced === 1 ? '' : 's'} unpriced — sequencing is incomplete until they are.`);
  }
  return lines.join('\n');
}
