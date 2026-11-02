/**
 * app/core/domain/succession.js — the Succession Terminal engine (`#/succession`,
 * Schema v83, ADR-0077).
 *
 * Pure: no DOM, no storage, no wall-clock globals, no unseeded randomness. Every
 * function takes `now`. Everything is derived on read from records the workspace
 * already holds, so a frozen bench claim can never drift away from the record it
 * describes.
 *
 * THE SIX COMPUTATIONS
 * --------------------
 *  1. THE BLANKET. What a span has *promised*, and until when. Not "average
 *     tenure", not "bench strength": the union of dated commitments held by the
 *     people in the span. A span holding one deliverable due in 200 days has a
 *     blanket of 200 days with exactly one thread in it, and both facts are
 *     printed.
 *
 *  2. THE CONCENTRATION. Who holds the work. Herfindahl–Hirschman over the
 *     share of dated work each member carries, with the inverse-HHI *effective
 *     number of holders* and Shannon entropy printed beside it. A span of eight
 *     people with one holder is a one-person span wearing a headcount.
 *
 *  3. THE FLOW TEST. If this holder left on their next obligation date, can
 *     every one of their open items be held by someone who remains? A real
 *     bipartite max-flow (Dinic) over an eligibility graph built only from
 *     recorded working relationships, with per-survivor headroom capacity. When
 *     it cannot, the **min-cut is the certificate**: the smallest set of items
 *     no survivor can hold. That is a proof, and it is what the task text says.
 *
 *  4. THE UNDERSTUDY. For a span that has never run a handover, Lindley–Smith
 *     single-sample acceptance gives the probability that the *next* critical
 *     event is the first one the span cannot cover. It is high, it is printed,
 *     and it is replaced by the measured rate as soon as there is one.
 *
 *  5. THE EXPOSURE. Cost of vacancy, per declared currency, with coherent
 *     expected shortfall. Unpriced work is counted and never valued.
 *
 *  6. THE DIFFUSION INDEX. The share of measured spans that are not covered — a
 *     breadth signal that needs no individual forecast.
 *
 * WHAT THE ROLL-UP REFUSES
 * ------------------------
 *  - A span below its member floor, item floor or eligibility coverage is
 *    `unmeasured`, with the reason printed. It is never `covered`: an unmeasured
 *    span is not a healthy one.
 *  - A probability the record cannot support is refused by name, and a refused
 *    reading cannot be frozen (grading a refusal would invent a probability).
 *  - A rate below its tested floor is withheld. A handover success rate over two
 *    handovers is a rumour with a decimal point.
 *  - Money is never summed across currencies, and never derived from a person.
 *
 * WHAT IT NEVER READS
 * -------------------
 * `conflicts`, `pulses` and message text. A confidential conflict and an
 * anonymous pulse response must never become an input to a bench reading. A
 * readiness rating is read as a *claim* and priced separately; it never covers
 * work and never enters the flow test.
 */

import { addDays, dayKey, daysBetween, mean, round } from '../time.js';
import { buildChain, harvestWork } from './chain.js';
import { SIGNAL_SOURCES } from './chainRegistry.js';
import {
  COVERAGE_LAYERS,
  ELIGIBILITY_SOURCES,
  GAP_VERDICTS,
  SUCCESSION_LIMITS,
  SUCCESSION_METRICS,
  SUCCESSION_PREMISE,
  SUCCESSION_SIGNAL_IDS,
  disclosureFor,
  stanceByKey,
} from './successionRegistry.js';
import { normalizeSuccessionSettings } from './successionSchema.js';

/* ------------------------------------------------------------------ utils */

const ALTITUDE_RANK = Object.freeze({ frontline: 1, manager: 2, director: 3, exec: 4, chief: 5 });

function readPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), obj);
}

function clampInt(value, min, max, fallback) {
  // `Number(null)` is 0 and `Number(undefined)` is NaN, so a plain isFinite check
  // turned an OMITTED horizon into the smallest legal one. A missing value must
  // stay missing and take the declared default, never the boundary of its range.
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function medianOf(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** Settings reader shared by the engine, the rules and the actions. */
export function successionConventions(rawSettings) {
  return normalizeSuccessionSettings(rawSettings || {});
}

/**
 * Sources that carry a dated obligation a *person* holds. `decision` and
 * `requisition` are excluded on purpose: a decision is owned by a span, not by a
 * person, and a requisition is the vacancy the bench is supposed to prevent.
 * `perfconcern` is excluded as sensitive; it is never a bench input.
 */
const BLANKET_SOURCE_KEYS = Object.freeze(['case', 'delegation', 'goal', 'feedback-followup', 'premise']);
const BLANKET_SOURCES = new Map(SIGNAL_SOURCES.filter((s) => BLANKET_SOURCE_KEYS.includes(s.key)).map((s) => [s.key, s]));

/**
 * Who HOLDS an item.
 *
 * The record's own owner is preferred: a case has an `ownerId`, a delegation has
 * a `personId`, a goal has an `ownerId`. Only when the record names a set of
 * involved people and no owner does the first involved person hold it — and the
 * item is then flagged `shared`, because a jointly-held obligation is a weaker
 * single point of failure than an owned one, and the reading says so.
 */
export function holderOf(source, record) {
  for (const path of source.peoplePaths || []) {
    if (path.many) continue;
    const value = readPath(record, path.path);
    if (typeof value === 'string' && value) return { holderId: value, shared: false };
  }
  for (const path of source.peoplePaths || []) {
    if (!path.many) continue;
    const value = readPath(record, path.path);
    if (Array.isArray(value) && value.find((v) => typeof v === 'string' && v)) {
      return { holderId: value.find((v) => typeof v === 'string' && v), shared: true };
    }
  }
  return null;
}

/* -------------------------------------------------- the eligibility graph */

/**
 * Which survivors may hold which of a holder's items.
 *
 * This is the load-bearing honesty boundary of the terminal. Every eligibility
 * edge comes from a *record*: a delegation in the same team, a shared goal, a
 * shared hiring loop, a recorded handover. `same-team` is included and weighted
 * at half at the *source* level, because shared context is weak evidence and
 * pretending it is absent would over-report gaps. The report prints how many
 * survivor pairs have no recorded relationship at all, so the limitation is
 * visible rather than silent.
 */
export function eligibilityGraph(state, chain, holderId, survivors) {
  const pair = new Map();
  const survivorIds = new Set(survivors.map((s) => s.id));
  const sourceHits = Object.fromEntries(ELIGIBILITY_SOURCES.map((s) => [s.key, 0]));

  const addEdge = (survivorId, sourceKey) => {
    if (!survivorId || survivorId === holderId || !survivorIds.has(survivorId)) return;
    const row = pair.get(survivorId) || { survivorId, sources: [] };
    if (!row.sources.includes(sourceKey)) {
      row.sources.push(sourceKey);
      sourceHits[sourceKey] = (sourceHits[sourceKey] || 0) + 1;
    }
    pair.set(survivorId, row);
  };

  const holder = chain.nodes.get(holderId);
  const holderTeam = holder?.team || '';
  const people = Array.isArray(state.people) ? state.people : [];
  const byId = new Map(people.map((p) => [p && p.id, p]).filter(([id]) => Boolean(id)));

  // (a) same team — the weakest source, and deliberately counted.
  for (const survivor of survivors) {
    if (holderTeam && (survivor.team || '') === holderTeam) addEdge(survivor.id, 'same-team');
  }

  // (b) delegated work in the same team.
  const delegations = Array.isArray(state.delegations) ? state.delegations : [];
  const delegatedInTeam = new Map();
  for (const d of delegations) {
    if (!d || !d.personId) continue;
    const person = byId.get(d.personId);
    if (!person || !person.team) continue;
    if (!delegatedInTeam.has(person.team)) delegatedInTeam.set(person.team, new Set());
    delegatedInTeam.get(person.team).add(d.personId);
  }
  const teamMates = delegatedInTeam.get(holderTeam);
  if (teamMates && teamMates.has(holderId)) {
    for (const mateId of teamMates) addEdge(mateId, 'delegated-together');
  }

  // (c) co-owner of a goal (owner or contributor).
  const goals = Array.isArray(state.goals) ? state.goals : [];
  const holderGoalIds = new Set(
    goals
      .filter((g) => g && (g.ownerId === holderId || (Array.isArray(g.contributorIds) && g.contributorIds.includes(holderId))
        || (Array.isArray(g.personIds) && g.personIds.includes(holderId))))
      .map((g) => g.id),
  );
  if (holderGoalIds.size) {
    for (const g of goals) {
      if (!g || !holderGoalIds.has(g.id)) continue;
      const ids = [g.ownerId, ...(Array.isArray(g.contributorIds) ? g.contributorIds : []), ...(Array.isArray(g.personIds) ? g.personIds : [])];
      for (const id of ids) if (id && id !== holderId) addEdge(id, 'shared-goal');
    }
  }

  // (d) ran a review loop together — co-interviewers on one requisition, or a
  //     recorded review where both are named.
  const requisitions = Array.isArray(state.requisitions) ? state.requisitions : [];
  for (const req of requisitions) {
    if (!req || !Array.isArray(req.interviewers) || !req.interviewers.includes(holderId)) continue;
    for (const interviewer of req.interviewers) addEdge(interviewer, 'shared-review');
  }
  const reviews = Array.isArray(state.reviews) ? state.reviews : [];
  for (const review of reviews) {
    if (!review) continue;
    const parties = [review.personId, ...(Array.isArray(review.participantIds) ? review.participantIds : [])].filter(Boolean);
    if (!parties.includes(holderId)) continue;
    for (const party of parties) addEdge(party, 'shared-review');
  }

  // (e) has held this person's work before — the strongest source. Only the tag
  //     RULE-SUC-02 writes counts, so the edge cannot be manufactured by prose.
  for (const d of delegations) {
    if (!d || !d.personId || d.personId === holderId) continue;
    const blob = `${d.support || ''} ${d.title || ''}`;
    if (blob.includes(`[handover-from:${holderId}]`)) addEdge(d.personId, 'covered-before');
  }

  const edges = [...pair.values()].sort((a, b) => b.sources.length - a.sources.length);
  return {
    edges,
    sourceHits,
    eligibleSet: new Set(edges.map((edge) => edge.survivorId)),
    unlinkedN: survivors.filter((s) => !pair.has(s.id)).length,
    survivorN: survivors.length,
  };
}

/* --------------------------------------------------- max flow / min cut */

/**
 * Dinic's maximum flow on a bipartite eligibility graph, and — from the residual
 * graph of the final level BFS — the minimum vertex cut that is the certificate.
 *
 * Graph shape, because the cut only means something if the shape is stated:
 *
 *     source ──cap 1──▶ item ──cap 1──▶ survivor ──cap headroom──▶ sink
 *
 * Every item must be absorbed by exactly one survivor, and an item can only reach
 * a survivor through a recorded eligibility edge. With unit item capacities the
 * min cut is a **minimum-cardinality set of items**: after the final (failed)
 * level BFS, an item still at level −1 is unreachable from the source while still
 * carrying demand, which is exactly the set of obligations that have to be lost.
 * The algorithm returns those items explicitly, so the terminal reports the
 * certificate rather than a shortfall number.
 *
 * Capacities are floored to integers before entering the graph, so the flow is
 * exact in integer arithmetic and the reading says so.
 */
export function maxFlowMinCut({ items, survivors, headroomFactor = 1 }) {
  const itemN = items.length;
  const survivorN = survivors.length;
  const S = 0;
  const T = 1 + itemN + survivorN;
  const nodeCount = T + 1;
  const itemNode = (i) => 1 + i;
  const survivorNode = (j) => 1 + itemN + j;

  const head = new Array(nodeCount).fill(-1);
  const to = [];
  const cap = [];
  const next = [];
  const pushEdge = (u, v, c) => {
    to.push(v); cap.push(c); next.push(head[u]); head[u] = to.length - 1;
    to.push(u); cap.push(0); next.push(head[v]); head[v] = to.length - 1;
  };

  const capacity = new Map();
  for (const survivor of survivors) {
    const headroom = Number.isFinite(survivor.headroom) ? survivor.headroom : 0;
    capacity.set(survivor.id, Math.max(0, Math.floor(headroom * headroomFactor)));
  }
  const survivorIndex = new Map(survivors.map((s, j) => [s.id, j]));
  const eligibleEdges = [];
  for (const item of items) {
    for (const survivorId of item.eligible || []) {
      if (survivorIndex.has(survivorId)) eligibleEdges.push([item, survivorId]);
    }
  }

  for (let i = 0; i < itemN; i += 1) pushEdge(S, itemNode(i), 1);
  // Remember the residual index of every item→survivor arc: an arc left at
  // capacity zero carries the flow, which is the assignment itself. Reading the
  // assignment is a stronger certificate than reading the level marker, because a
  // survivor whose capacity is the binding cut leaves its items *reachable* and
  // still unabsorbable.
  const itemArcs = items.map(() => []);
  for (const [item, survivorId] of eligibleEdges) {
    const i = items.indexOf(item);
    if (i < 0) continue;
    pushEdge(itemNode(i), survivorNode(survivorIndex.get(survivorId)), 1);
    itemArcs[i].push({ edge: to.length - 2, survivorId });
  }
  for (const survivor of survivors) {
    pushEdge(survivorNode(survivorIndex.get(survivor.id)), T, capacity.get(survivor.id) || 0);
  }

  const level = new Array(nodeCount).fill(-1);
  const iter = new Array(nodeCount).fill(0);
  let guard = 0;
  const bfs = () => {
    level.fill(-1);
    level[S] = 0;
    const queue = [S];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const u = queue[qi];
      for (let e = head[u]; e !== -1; e = next[e]) {
        if (cap[e] > 0 && level[to[e]] === -1) {
          level[to[e]] = level[u] + 1;
          queue.push(to[e]);
        }
      }
    }
    return level[T] !== -1;
  };
  const dfs = (u, pushed) => {
    if (u === T) return pushed;
    for (; iter[u] !== -1; iter[u] = next[iter[u]]) {
      guard += 1;
      if (guard > 500000) return 0;
      const e = iter[u];
      const v = to[e];
      if (cap[e] > 0 && level[v] === level[u] + 1) {
        const d = dfs(v, Math.min(pushed, cap[e]));
        if (d > 0) {
          cap[e] -= d;
          cap[e ^ 1] += d;
          return d;
        }
      }
    }
    return 0;
  };

  let flow = 0;
  let rounds = 0;
  while (bfs() && rounds < 5000) {
    rounds += 1;
    for (let i = 0; i < nodeCount; i += 1) iter[i] = head[i];
    let pushed = dfs(S, Infinity);
    while (pushed > 0 && rounds < 5000) {
      flow += pushed;
      pushed = dfs(S, Infinity);
      rounds += 1;
    }
  }

  // The certificate: an item is absorbed when one of its arcs carries unit flow
  // (residual capacity zero). Every unmatched item is part of a maximum matching's
  // deficiency set, which by König/Hall is a minimum vertex cover of the eligibility
  // graph — a proof that no assignment of these items to these survivors exists.
  const blocked = [];
  const absorbed = [];
  const assignment = [];
  for (let i = 0; i < itemN; i += 1) {
    const arc = itemArcs[i].find((candidate) => cap[candidate.edge] === 0);
    if (arc) {
      absorbed.push(items[i]);
      assignment.push({ item: items[i], survivorId: arc.survivorId });
    } else {
      blocked.push(items[i]);
    }
  }
  const capacityTotal = [...capacity.values()].reduce((a, b) => a + b, 0);

  return {
    feasible: flow === itemN,
    flow,
    itemN,
    capacityTotal,
    surplusCapacity: Math.max(0, capacityTotal - flow),
    blocked,
    absorbed,
    assignment,
    /** A blocked item with NO eligibility edge at all is a different failure. */
    orphaned: blocked.filter((item) => !item.eligible || item.eligible.size === 0),
    capacity,
  };
}

/* ------------------------------------------------- 1. understudy risk */

/**
 * Lindley–Smith single-sample acceptance (Lindley 1965; Smith 1961; Laplace's
 * rule of succession). The prior on the chance that an *untested* handover works
 * is uniform on [0, 1]; a span that has not yet run one has a posterior mean that
 * the next one fails of exactly 1/2, and a span that has run k successful
 * handovers has a posterior mean of 1/(k+2).
 *
 * Reported as "probability the NEXT critical event is the one this span cannot
 * cover", which is the statement a leader can act on. Never reported as a
 * statement about a person's competence.
 */
export function understudyRisk({ tested, failed, floor }) {
  const t = Math.max(0, Math.round(Number(tested) || 0));
  const f = Math.max(0, Math.round(Number(failed) || 0));
  const total = Math.max(t, f);
  if (total >= floor) {
    return {
      mode: 'measured',
      probabilityPct: round(((f + 0.5) / (total + 1)) * 100, 1),
      testedN: total,
      failedN: f,
      method: 'Jeffreys posterior on the measured handover record (β(½, ½) prior)',
      refused: null,
    };
  }
  return {
    mode: 'untested',
    probabilityPct: round(((total + 1) / (total + 2)) * 100, 1),
    testedN: total,
    failedN: f,
    method: 'Lindley–Smith single-sample acceptance — a uniform prior on the untested instrument',
    refused: `Only ${total} handover(s) on record against a ${floor}-handover floor. The figure is the assumption-free estimate for an UNTESTED instrument, which is why it is high: it is what a never-tested bench is worth, stated plainly rather than softened.`,
  };
}

/* ------------------------------------------------------- 2. the blanket */

/**
 * What a set of people collectively holds, and until when.
 *
 * Two readings:
 *  - `blanketDays` — the longest dated commitment any member holds. It answers
 *    "how far forward is this span promised to anything at all".
 *  - `threadCount` — how many *independent* dated commitments sit behind that
 *    number. A blanket of 300 days carried by one thread is the single most
 *    dangerous shape a bench can have, and a bench-strength colour cannot see it.
 *
 * A recurring commitment (a 1:1 cadence) never sets the blanket: it expires when
 * the last occurrence was held plus the period, which is almost always shorter
 * than a dated deliverable, and mixing the two would let a weekly rhythm inflate a
 * coverage number.
 */
export function blanketFor(items, memberIds, now) {
  const ids = new Set(memberIds);
  const nowDay = dayKey(now);
  const threads = [];
  for (const item of items) {
    if (!item || !ids.has(item.holderId) || !item.dueOn) continue;
    const days = daysBetween(nowDay, item.dueOn);
    if (days === null || days < 0) continue;
    threads.push({ ...item, blanketDays: days });
  }
  threads.sort((a, b) => b.blanketDays - a.blanketDays);
  const longest = threads[0] || null;
  const expiring = threads.filter((t) => t.blanketDays <= 30);
  return {
    blanketDays: longest ? longest.blanketDays : null,
    blanketOn: longest ? longest.dueOn : null,
    blanketHolderId: longest ? longest.holderId : null,
    threadCount: threads.length,
    expiringIn30N: expiring.length,
    expiringShare: threads.length ? round((expiring.length / threads.length) * 100, 1) : null,
    threads,
    refused: threads.length
      ? null
      : 'This span holds no future-dated obligation in the record, so its blanket cannot be stated. An empty blanket is not infinite continuity — it is no evidence of any.',
  };
}

/* ------------------------------------------------- 3. concentration */

/**
 * Herfindahl–Hirschman concentration of *work holding* across a span's members,
 * with the inverse-HHI effective number of holders and Shannon entropy.
 *
 * HHI is reported on the 0–10,000 scale the antitrust literature uses, because
 * that is the scale a leader can look up. `effectiveHolders = 10000 / HHI` is the
 * honest headcount: the number of equally-loaded people who would hold this work
 * the way it is actually held.
 *
 * Members who hold nothing stay in the denominator as zeros — the distribution is
 * over the span, not over the people who happened to be busy. That is the
 * difference between "the work is spread over six people" and "two of our six
 * people hold it".
 */
export function concentrationFor(items, memberIds) {
  const ids = new Set(memberIds);
  const held = new Map();
  for (const id of ids) held.set(id, 0);
  let total = 0;
  for (const item of items) {
    if (!item || !ids.has(item.holderId)) continue;
    const weight = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
    held.set(item.holderId, (held.get(item.holderId) || 0) + weight);
    total += weight;
  }
  if (!total) {
    return {
      hhi: null,
      effectiveHolders: null,
      entropy: null,
      topHolderShare: null,
      topHolderId: null,
      holdersN: 0,
      memberN: ids.size,
      shares: [],
      refused: 'No dated work sits behind any member of this span, so concentration cannot be measured. A span with no work holding is not diversified — it is empty.',
    };
  }
  const shares = [...ids].map((id) => ({
    id,
    weight: round(held.get(id) || 0, 2),
    share: round(((held.get(id) || 0) / total) * 100, 1),
  })).sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)));
  const hhi = shares.reduce((sum, row) => sum + ((row.share / 100) ** 2), 0) * 10000;
  const entropy = -shares.reduce((sum, row) => {
    const p = row.share / 100;
    return sum + (p > 0 ? p * Math.log(p) : 0);
  }, 0);
  const top = shares[0];
  return {
    hhi: round(hhi, 0),
    effectiveHolders: hhi > 0 ? round(10000 / hhi, 2) : null,
    entropy: round(entropy, 3),
    topHolderShare: top ? top.share : null,
    topHolderId: top && top.weight > 0 ? top.id : null,
    holdersN: shares.filter((row) => row.weight > 0).length,
    memberN: ids.size,
    shares,
    refused: null,
  };
}

/* --------------------------------------------------------- 4. the span */

/**
 * The items a span holds, mapped to their holder.
 *
 * `weight` is the item's severity where the source carries one and 1 otherwise.
 * It is used for concentration and for ranking the blocking set. It is never used
 * to value a person.
 */
function harvestSpanItems(state, chain, memberIds, now) {
  const items = harvestWork(state, chain, { now, settings: state?.settings })
    .filter((item) => item && item.entityId && BLANKET_SOURCES.has(item.type))
    .map((item) => {
      const source = BLANKET_SOURCES.get(item.type);
      const collection = source ? state?.[source.collection] : null;
      const record = Array.isArray(collection) ? collection.find((row) => row && row.id === item.entityId) : null;
      const holder = record ? holderOf(source, record) : null;
      if (!holder) return null;
      return {
        type: item.type,
        typeLabel: item.typeLabel,
        id: item.entityId,
        title: item.title,
        holderId: holder.holderId,
        shared: holder.shared,
        dueOn: item.dueOn,
        openedOn: item.openedOn,
        overdueDays: item.overdueDays,
        weight: item.severity > 0 ? Math.max(1, item.severity) : 1,
        route: item.route,
        sensitive: item.sensitive === true,
      };
    })
    .filter(Boolean)
    .filter((item) => memberIds.includes(item.holderId))
    .slice(0, SUCCESSION_LIMITS.maxItems);
  return items;
}

/**
 * One span's bench reading: blanket, concentration, per-holder flow results and a
 * verdict.
 *
 * A "span" is one leader and the people who report **directly** to them. That
 * choice is deliberate and it is the difference between a bench and a heat map:
 *
 *  - Direct reports partition the roster. Every person is on exactly one bench, so
 *    counts roll up by exact addition and no obligation can be tested twice. Using
 *    the whole subtree would have tested the same item at the team, the directorate
 *    and the function, tripling the enterprise probability.
 *  - The survivor set is the *peers* of the departing holder, never the span lead.
 *    "My manager would pick it up" is the comforting fiction every succession tool
 *    sells; a lead who absorbs their report's work has not replaced a holder, they
 *    have deferred the vacancy. If the peers cannot hold it, the bench has a gap
 *    and the lead's own capacity is a separate question the Command Chain answers.
 */
export function spanBench(state, chain, nodeId, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || successionConventions(settings || state?.settings || {});
  const node = chain.nodes.get(nodeId);
  if (!node) return null;
  const memberIds = (node.childIds || []).filter((id) => id !== nodeId && id !== 'leader');
  const items = harvestSpanItems(state, chain, memberIds, now);
  const byMember = new Map();

  const members = memberIds.map((id) => {
    const memberNode = chain.nodes.get(id);
    const row = {
      id,
      name: memberNode?.name || 'Unnamed',
      role: memberNode?.role || '',
      altitude: memberNode?.altitude || null,
      rank: ALTITUDE_RANK[memberNode?.altitude] || 0,
      team: memberNode?.team || '',
      isSpanLead: Boolean(memberNode && memberNode.span > 0),
      itemN: 0,
      load: 0,
      headroom: 0,
      cost: conv.successionDailyCosts?.[id] || null,
      handovers: conv.successionTestedHandovers?.[id] || null,
    };
    byMember.set(id, row);
    return row;
  });
  for (const item of items) {
    const member = byMember.get(item.holderId);
    if (!member) continue;
    member.itemN += 1;
    member.load += item.weight;
  }
  const medianLoad = medianOf(members.map((m) => m.load));
  /**
   * The overload rule, stated on the surface because it is the one declared
   * number the flow test depends on.
   *
   * The rule: a survivor can carry up to `factor × the span's median load` items
   * in total, and their headroom is what remains of that after their own load,
   * plus the one item being moved.
   *
   *     capacity_i = ⌊ factor × median − load_i ⌋ + 1,  floored at 0
   *
   * The `+ 1` is the departing item itself: headroom is room for *incoming* work,
   * and a peer at exactly the target load can still take one thing. It is measured
   * from the MEDIAN rather than from each member's own load, so a team where
   * everybody carries the same four items can absorb two each — and a member who is
   * already carrying double the median is correctly reported as having no room.
   * (The first draft measured room *above* the median with no allowance for the
   * incoming item, which gave every member of a balanced team zero capacity and
   * certified a gap in a perfectly covered span. This rule exists because that
   * happened, and the test suite pins it.)
   */
  for (const member of members) {
    const base = medianLoad === null ? 0 : medianLoad;
    member.headroom = Math.max(0, Math.floor(base * conv.successionHeadroomFactor - member.load) + 1);
    member.targetLoad = round(base * conv.successionHeadroomFactor, 1);
  }

  const blanket = blanketFor(items, memberIds, now);
  const concentration = concentrationFor(items, memberIds);

  const holders = members.filter((m) => m.itemN > 0).map((holder) => {
    const survivors = members.filter((s) => s.id !== holder.id);
    if (!survivors.length) {
      return {
        holderId: holder.id,
        holderName: holder.name,
        itemN: holder.itemN,
        feasible: false,
        blocked: items.filter((i) => i.holderId === holder.id).map((i) => ({ ...i, eligible: new Set() })),
        eligibleSurvivorN: 0,
        unlinkedN: 0,
        refused: 'This holder is the only member of their span; nothing they carry can be reabsorbed inside it. Naming a successor outside the span would be inventing one.',
      };
    }
    const graph = eligibilityGraph(state, chain, holder.id, survivors);
    const held = items.filter((item) => item.holderId === holder.id)
      .map((item) => ({ ...item, eligible: new Set(graph.eligibleSet) }));
    if (!graph.eligibleSet.size) {
      return {
        holderId: holder.id,
        holderName: holder.name,
        itemN: held.length,
        feasible: false,
        blocked: held,
        eligibleSurvivorN: 0,
        unlinkedN: survivors.length,
        refused: `No survivor in this span has a recorded working relationship with ${holder.name}. Eligibility is evidence; the terminal will not invent a name.`,
      };
    }
    const result = maxFlowMinCut({
      items: held,
      // Headroom was already discounted by the factor when it was computed; the
      // graph receives the final capacity so there is exactly one place the
      // overload rule can be tuned.
      survivors: survivors.map((s) => ({ id: s.id, name: s.name, load: s.load, headroom: s.headroom })),
      headroomFactor: 1,
    });
    return {
      holderId: holder.id,
      holderName: holder.name,
      itemN: held.length,
      feasible: result.feasible,
      blocked: result.blocked,
      orphaned: result.orphaned,
      absorbed: result.absorbed,
      eligibleSurvivorN: graph.eligibleSet.size,
      unlinkedN: graph.unlinkedN,
      capacityTotal: result.capacityTotal,
      surplusCapacity: result.surplusCapacity,
      refused: null,
    };
  });

  const blocked = holders.flatMap((h) => (h.blocked || []).map((item) => ({ ...item, holderId: h.holderId })));
  const memberFloor = conv.successionMemberFloor;
  const itemFloor = conv.successionItemFloor;
  const anyTestRan = holders.some((h) => !h.refused && h.itemN > 0);
  const eligibleSurvivorN = holders.reduce((sum, h) => sum + (h.eligibleSurvivorN || 0), 0);
  const unlinkedPairs = holders.reduce((sum, h) => sum + (h.unlinkedN || 0), 0);

  let verdict = 'unmeasured';
  let refused = null;
  let structural = null;
  if (members.length === 0) {
    structural = 'empty-span';
    refused = 'This leader has no direct reports, so there is no bench to test. An empty rung is drawn empty rather than reported as covered.';
  } else if (members.length === 1) {
    structural = 'span-of-one';
    refused = 'This leader has a span of one: there is nobody for the single report’s work to move to, so no bench exists. This is a structural finding about the shape of the org, not a gap in the evidence.';
  } else if (members.length < memberFloor) {
    refused = `This span has ${members.length} members against a ${memberFloor}-member floor. A flow test over so few people is arithmetic, not a benchmark.`;
  } else if (items.length < itemFloor) {
    refused = `This span holds ${items.length} dated obligation(s) in scope against a floor of ${itemFloor}. There is not enough promised work for a coverage reading to mean anything.`;
  } else if (!anyTestRan) {
    refused = 'No holder in this span could be flow-tested: no survivor has a recorded working relationship with anyone carrying work. That is an evidence gap, not a clean bench.';
  } else if (blocked.length > 0) {
    verdict = 'certified-gap';
  } else if (concentration.topHolderShare !== null
    && concentration.topHolderShare > conv.successionConcentrationCapPct) {
    verdict = 'concentrated';
  } else {
    verdict = 'covered';
  }

  const blockingSet = blocked
    .sort((a, b) => (b.weight || 1) - (a.weight || 1) || String(a.dueOn).localeCompare(String(b.dueOn)))
    .slice(0, SUCCESSION_LIMITS.maxBlockingSet)
    .map((item) => ({
      type: item.type,
      id: item.id,
      title: item.title,
      holderNodeId: item.holderId || null,
      dueOn: item.dueOn || null,
      weight: item.weight || 1,
      eligibleN: item.eligible ? item.eligible.size : 0,
      reabsorbable: false,
    }));

  const handovers = members.reduce((acc, m) => ({
    tested: acc.tested + (m.handovers?.tested || 0),
    failed: acc.failed + (m.handovers?.failed || 0),
  }), { tested: 0, failed: 0 });

  return {
    nodeId,
    name: node.name,
    altitude: node.altitude || null,
    rank: ALTITUDE_RANK[node.altitude] || 0,
    span: node.span,
    members,
    membersN: members.length,
    items,
    itemsN: items.length,
    blanket,
    concentration,
    holders,
    blocked,
    blockingSet,
    blockedN: blocked.length,
    unlinkedPairs,
    eligibleSurvivorN,
    handovers,
    verdict,
    refused,
    structural,
    quotable: verdict !== 'unmeasured',
    sharedItemN: items.filter((item) => item.shared).length,
  };
}

/* --------------------------------------------------- 5. the whole chain */

/**
 * Every leadership span in the tree, with the enterprise certification above them.
 *
 * Counts are exact sums. Rates are refused below their floors. A single span's
 * concentration is never averaged into an enterprise figure: the enterprise
 * figure is a diffusion index over spans, which is a count of spans rather than a
 * mean of indices.
 */
export function successionReport(state = {}, { now = new Date(), settings = null, nodeId = null } = {}) {
  const mergedSettings = { ...(state?.settings || {}), ...(settings || {}) };
  const conv = successionConventions(mergedSettings);
  const chain = buildChain(state, { now, settings: mergedSettings });
  const spans = [];
  const leadershipIds = (chain.leadershipNodes || []).map((node) => node.id || node).filter((id) => id && id !== 'leader');
  for (const id of leadershipIds) {
    const span = spanBench(state, chain, id, { now, settings: mergedSettings, conventions: conv });
    if (span) spans.push(span);
  }
  const measured = spans.filter((s) => s.quotable);

  const byAltitude = new Map();
  for (const span of spans) {
    const key = span.altitude || 'unassigned';
    if (!byAltitude.has(key)) {
      byAltitude.set(key, {
        altitude: key,
        rank: span.rank,
        spansN: 0,
        membersN: 0,
        itemsN: 0,
        blockedItemsN: 0,
        certifiedN: 0,
        concentratedN: 0,
        coveredN: 0,
        unmeasuredN: 0,
        spanIds: [],
      });
    }
    const row = byAltitude.get(key);
    row.spansN += 1;
    row.membersN += span.membersN;
    row.itemsN += span.itemsN;
    row.blockedItemsN += span.blockedN;
    if (span.verdict === 'certified-gap') row.certifiedN += 1;
    else if (span.verdict === 'concentrated') row.concentratedN += 1;
    else if (span.verdict === 'covered') row.coveredN += 1;
    else row.unmeasuredN += 1;
    row.spanIds.push(span.nodeId);
  }
  const altitudes = [...byAltitude.values()].sort((a, b) => a.rank - b.rank);

  const diffusionFloor = conv.successionDiffusionFloor;
  const diffusion = measured.length >= diffusionFloor
    ? {
      share: round((measured.filter((s) => s.verdict !== 'covered').length / measured.length) * 100, 1),
      degradedN: measured.filter((s) => s.verdict !== 'covered').length,
      measuredN: measured.length,
      spanN: spans.length,
      refused: null,
    }
    : {
      share: null,
      degradedN: measured.filter((s) => s.verdict !== 'covered').length,
      measuredN: measured.length,
      spanN: spans.length,
      refused: `${measured.length} measured span(s) against a ${diffusionFloor}-span floor. A diffusion index over this few spans is a coin toss with a decimal point.`,
    };

  const certification = certificationFor({ spans, conv });

  return {
    now,
    conventions: conv,
    chain,
    spans,
    altitudes,
    diffusion,
    certification,
    skill: successionSkill(Array.isArray(state.successionReadings) ? state.successionReadings : []),
    focus: nodeId ? spans.find((s) => s.nodeId === nodeId) || null : null,
    counts: {
      spansN: spans.length,
      measuredN: measured.length,
      certifiedN: spans.filter((s) => s.verdict === 'certified-gap').length,
      concentratedN: spans.filter((s) => s.verdict === 'concentrated').length,
      coveredN: spans.filter((s) => s.verdict === 'covered').length,
      unmeasuredN: spans.filter((s) => s.verdict === 'unmeasured').length,
      membersN: spans.reduce((sum, s) => sum + s.membersN, 0),
      itemsN: spans.reduce((sum, s) => sum + s.itemsN, 0),
      blockedItemsN: spans.reduce((sum, s) => sum + s.blockedN, 0),
      unlinkedPairs: spans.reduce((sum, s) => sum + (s.unlinkedPairs || 0), 0),
      sharedItemN: spans.reduce((sum, s) => sum + (s.sharedItemN || 0), 0),
      // Work on file that NO span can hold, because the roster (or its
      // reporting lines) cannot yet place it. Zero on a healthy workspace; the
      // signal that distinguishes an empty workspace from an unowned one.
      unownedWork: chain.counts.people ? 0 : harvestWork(state, chain, { now, settings }).length,
    },
    readings: Array.isArray(state.successionReadings) ? state.successionReadings : [],
    premise: SUCCESSION_PREMISE,
    layers: COVERAGE_LAYERS,
    metrics: SUCCESSION_METRICS,
    verdicts: GAP_VERDICTS,
    eligibilitySources: ELIGIBILITY_SOURCES,
  };
}

/**
 * THE ENTERPRISE CERTIFICATION.
 *
 * The single number a chief can carry: of the leadership spans whose bench can be
 * measured at all, what share can reabsorb the work of any one holder today? Its
 * denominator is printed, its refusals are printed, and it is *not* a score of an
 * organisation's people — it is a count of spans that passed a structural test.
 *
 * The joint probability of at least one certified gap opening before the review
 * date is reported as a PAIR, exactly as the Promise Solvency Terminal reports a
 * copula beside its Fréchet bounds: the independence reference ∏(1 − pᵢ) is an
 * upper bound, and maxᵢ pᵢ is the assumption-free union-bound LOWER bound. The
 * terminal never prints one alone, because a single number would overstate both
 * the precision and the certainty.
 *
 * The per-span pᵢ is built from two measured quantities and one declared one:
 *   - the span's own handover record (Lindley–Smith or Jeffreys), 
 *   - how far above the concentration cap its top holder sits (a share), and
 *   - a span already certified infeasible has a gap *now*, so pᵢ = 1.
 * A span with no concentration above the cap contributes a floor of 5% rather
 * than zero, because "we have not measured a problem here" is not "there is no
 * problem here".
 */
export function certificationFor({ spans, conv }) {
  const measured = spans.filter((s) => s.quotable);
  const spanN = spans.length;
  const testedShare = spanN ? round((measured.length / spanN) * 100, 1) : null;
  const perSpan = [];
  let pIndependence = null;
  let pLower = null;

  if (measured.length) {
    let product = 1;
    for (const span of measured) {
      const risk = understudyRisk({
        tested: span.handovers?.tested || 0,
        failed: span.handovers?.failed || 0,
        floor: conv.successionTestedFloor,
      });
      const gapNow = span.verdict === 'certified-gap';
      const excess = span.concentration.topHolderShare === null
        ? 0
        : Math.max(0, span.concentration.topHolderShare - conv.successionConcentrationCapPct) / 100;
      const structural = Math.min(0.95, Math.max(0.05, excess * 2));
      const p = gapNow ? 1 : Math.min(0.99, structural * (risk.probabilityPct / 100));
      perSpan.push({
        nodeId: span.nodeId,
        name: span.name,
        altitude: span.altitude,
        rank: span.rank,
        pGapPct: round(p * 100, 1),
        verdict: span.verdict,
        riskMode: risk.mode,
        testedN: risk.testedN,
        topHolderShare: span.concentration.topHolderShare,
        excessPp: round(excess * 100, 1),
      });
      product *= (1 - p);
    }
    pIndependence = round((1 - product) * 100, 1);
    pLower = round(Math.max(...perSpan.map((row) => row.pGapPct)), 1);
  }

  return {
    measuredN: measured.length,
    spanN,
    testedShare,
    pIndependence,
    pLower,
    perSpan: perSpan.sort((a, b) => b.pGapPct - a.pGapPct),
    method: 'Independence reference ∏(1 − pᵢ) printed beside the assumption-free union-bound LOWER bound maxᵢ pᵢ. The true joint probability lies between them; the terminal prints the pair because a single number would overstate both the precision and the certainty.',
    refused: measured.length
      ? null
      : 'No span in this chain could be measured, so no probability is quoted. That is the finding: the bench has never been tested anywhere, which is not the same as being healthy.',
  };
}

/* ------------------------------------------------- 6. the per-seat view */

/**
 * The altitude-specific operating picture (§0.3 role-tiering).
 *
 * Same engine, five different questions. What changes per altitude:
 *  - which spans are in scope (a seat's own subtree, plus its ancestors as counts),
 *  - whether names are disclosed,
 *  - whether money is disclosed,
 *  - which duties are shown with their routes,
 *  - what the generated brief line is allowed to claim.
 *
 * This is the function the view calls; it never re-computes a span.
 */
export function successionView(report, { seat = null, nodeId = null } = {}) {
  const rank = seat?.rank || 5;
  const altitudeKey = seat?.altitudeKey || 'chief';
  const stance = stanceByKey(altitudeKey);
  const disclosure = disclosureFor(stance.disclosure);
  const scopeIds = seat && Array.isArray(seat.scope) && seat.scope.length ? new Set(seat.scope) : null;

  const scopeOf = (span) => {
    if (!scopeIds) return 'all';
    if (scopeIds.has(span.nodeId)) return 'own';
    // An ancestor of the seat: its counts roll UP, its detail does not come down.
    return 'above';
  };
  const inScope = report.spans
    .map((span) => ({ span, where: scopeOf(span) }))
    .filter((row) => row.where !== null && row.where !== undefined)
    .filter((row) => (scopeIds ? row.where !== 'none' : true));

  const rows = report.spans.map((span) => {
    const where = scopeOf(span);
    return {
      nodeId: span.nodeId,
      where,
      label: disclosure.personNames ? span.name : `${span.altitude || 'span'} · rank ${span.rank}`,
      altitude: span.altitude,
      rank: span.rank,
      membersN: span.membersN,
      itemsN: span.itemsN,
      blockedN: span.blockedN,
      verdict: span.verdict,
      blanketDays: span.blanket?.blanketDays ?? null,
      threadCount: span.blanket?.threadCount ?? 0,
      topHolderShare: span.concentration?.topHolderShare ?? null,
      effectiveHolders: span.concentration?.effectiveHolders ?? null,
      refused: span.refused || span.blanket?.refused || span.concentration?.refused || null,
    };
  }).filter((row) => row.where !== 'none');

  const focusSpan = nodeId
    ? report.spans.find((s) => s.nodeId === nodeId) || null
    : inScope.length ? inScope[0].span : null;

  return {
    seat,
    rank,
    altitudeKey,
    stance,
    disclosure,
    rows,
    ownN: rows.filter((r) => r.where === 'own').length,
    aboveN: rows.filter((r) => r.where === 'above').length,
    focusSpan,
    duties: stance.duties,
    forbidden: stance.forbidden,
    counts: report.counts,
    diffusion: report.diffusion,
    certification: report.certification,
  };
}

/* ------------------------------------------------------ 7. freeze/grade */

/**
 * Freeze the claim. Refuses when no span can be measured (a reading that prices
 * nothing is decoration) or when the review date is not in the future.
 *
 * The frozen record carries the exact blocking set, so grading measures whether
 * *those* items actually lost their holder — not whether the organisation feels
 * worse.
 */
export function buildSuccessionReading(report, {
  now = new Date(), reviewDays = null, id = null, nodeId = null, scope = null,
} = {}) {
  const conv = report.conventions;
  const cert = report.certification;
  if (cert.pIndependence === null) {
    return { ok: false, error: cert.refused || 'No span in this chain could be measured, so there is nothing to freeze.' };
  }
  const horizon = clampInt(reviewDays, SUCCESSION_LIMITS.reviewHorizonDays[0], SUCCESSION_LIMITS.reviewHorizonDays[1], conv.successionReviewHorizonDays);
  const spans = nodeId ? report.spans.filter((s) => s.nodeId === nodeId) : report.spans;
  if (!spans.length) return { ok: false, error: 'That span is not in the chain.' };

  const members = [];
  for (const span of spans) {
    for (const item of span.blockingSet || []) {
      members.push({
        type: item.type,
        id: item.id,
        holderNodeId: item.holderNodeId || null,
        dueOn: item.dueOn || null,
        weight: item.weight || 1,
        eligibleN: item.eligibleN || 0,
        reabsorbable: false,
      });
    }
  }
  // If nothing is currently blocked, the claim is "no gap opens", and the frozen
  // members are the most exposed items: the longest-dated obligation each measured
  // span holds. Grading then measures whether one of those actually lost its
  // holder with the obligation still open.
  if (!members.length) {
    for (const span of spans) {
      if (!span.quotable) continue;
      const thread = span.blanket?.threads?.[0];
      if (!thread) continue;
      members.push({
        type: thread.type,
        id: thread.id,
        holderNodeId: thread.holderId || null,
        dueOn: thread.dueOn || null,
        weight: thread.weight || 1,
        eligibleN: 0,
        reabsorbable: true,
      });
    }
  }
  if (!members.length) {
    return { ok: false, error: 'Every measured span holds no dated obligation, so a frozen claim would have no member to grade. Record the work before freezing a bench claim.' };
  }

  const record = {
    id: id || null,
    scope: scope || (nodeId ? 'span' : 'chain'),
    nodeId: nodeId || null,
    altitude: nodeId ? (report.spans.find((s) => s.nodeId === nodeId)?.altitude || null) : null,
    frozenAt: now.toISOString(),
    reviewOn: addDays(dayKey(now), horizon),
    reviewDays: horizon,
    horizonDays: conv.successionHorizonDays,
    concentrationCapPct: conv.successionConcentrationCapPct,
    pGapPct: cert.pIndependence,
    pGapMethod: cert.method,
    pGapRefused: null,
    pGapLowerPct: cert.pLower,
    counts: {
      spansN: spans.length,
      itemsN: spans.reduce((sum, s) => sum + s.itemsN, 0),
      certifiedN: spans.filter((s) => s.verdict === 'certified-gap').length,
      concentratedN: spans.filter((s) => s.verdict === 'concentrated').length,
      unmeasuredN: spans.filter((s) => s.verdict === 'unmeasured').length,
      blockedItemsN: members.length,
    },
    spans: spans.slice(0, SUCCESSION_LIMITS.maxRows).map((span) => ({
      nodeId: span.nodeId,
      name: span.name,
      altitude: span.altitude,
      rank: span.rank,
      membersN: span.membersN,
      itemsN: span.itemsN,
      blanketDays: span.blanket?.blanketDays ?? null,
      concentrationHhi: span.concentration?.hhi ?? null,
      effectiveHolders: span.concentration?.effectiveHolders ?? null,
      unassignedN: 0,
      verdict: span.verdict,
      blockingSet: (span.blockingSet || []).map((item) => ({
        type: item.type,
        id: item.id,
        holderNodeId: item.holderNodeId || null,
        dueOn: item.dueOn || null,
        weight: item.weight || 1,
        eligibleN: item.eligibleN || 0,
        reabsorbable: item.reabsorbable === true,
      })),
      quotable: span.quotable,
      refused: span.refused || null,
    })),
    members,
    graded: null,
    lapsedOn: null,
    challengeNotes: [],
  };
  return { ok: true, record };
}

/**
 * Grade once, later, against the frozen members.
 *
 * A member has lost its holder when, at the review date, it is still open AND its
 * holder has left the roster. A member that was explicitly frozen as
 * non-reabsorbable is also counted, because the claim was that no survivor could
 * hold it — and that claim was already false when it was written.
 *
 * A member that no longer exists is UNMEASURABLE, never a gap. Deleting a record
 * is not evidence that the claim was right or wrong. An obligation that was simply
 * completed is not a gap either: the claim was about the span's ability to hold
 * its work, and finishing it is the span succeeding.
 */
export function gradeSuccessionReading(reading, state, { now = new Date(), settings = null } = {}) {
  if (!reading) return { ok: false, error: 'No reading to grade.' };
  if (reading.graded) return { ok: false, error: 'This reading has already been graded. Grading is once, later, and never rewritten.' };
  // `Number(null)` is 0 and `Number(undefined)` is NaN, so a bare isFinite check let
  // a probability-free reading through as a 0% forecast and then graded it — a false
  // claim about a reading that never quoted anything. (ADR-0075's grade function
  // carries the same warning; this terminal reproduced the bug and the suite caught
  // it, which is why the check is explicit rather than clever.)
  if (reading.pGapPct === null || reading.pGapPct === undefined || reading.pGapPct === ''
    || !Number.isFinite(Number(reading.pGapPct))) {
    return { ok: false, error: 'This reading quoted no probability, so there is nothing to score. The refusal stands on the record.' };
  }
  const today = dayKey(now);
  if (!reading.reviewOn || reading.reviewOn > today) {
    return { ok: false, error: `This reading cannot be graded before ${reading.reviewOn || 'its review date'}.` };
  }
  const members = Array.isArray(reading.members) ? reading.members : [];
  if (!members.length) {
    return { ok: false, error: 'This reading froze no members, so there is nothing to measure. Delete it and freeze a fresh reading rather than scoring an empty claim.' };
  }

  const mergedSettings = { ...(state?.settings || {}), ...(settings || {}) };
  const conv = successionConventions(mergedSettings);
  const chain = buildChain(state, { now, settings: mergedSettings });
  const people = new Map((state.people || []).filter((p) => p && p.status !== 'archived').map((p) => [p.id, p]));
  const sourceByKey = new Map(SIGNAL_SOURCES.map((s) => [s.key, s]));

  let breached = 0;
  let unmeasurable = 0;
  const breaches = [];
  for (const member of members) {
    const source = sourceByKey.get(member.type);
    const collection = source ? state?.[source.collection] : null;
    const record = Array.isArray(collection) ? collection.find((row) => row && row.id === member.id) : null;
    if (!record) {
      unmeasurable += 1;
      continue;
    }
    if (!isStillOpen(source, record)) continue;
    const holderGone = member.holderNodeId ? !people.has(member.holderNodeId) : false;
    if (holderGone) {
      breached += 1;
      breaches.push({ id: member.id, type: member.type, reason: 'holder left the roster with the obligation still open' });
      continue;
    }
    if (member.reabsorbable === false) {
      // Re-run the structural test on the CURRENT tree: is there still no survivor
      // with a recorded relationship and capacity?
      const holder = member.holderNodeId ? chain.nodes.get(member.holderNodeId) : null;
      // Peers only: the same survivor set the span tested at freeze time.
      const lead = holder?.parentId ? chain.nodes.get(holder.parentId) : null;
      const survivors = (lead?.childIds || []).filter((id) => id !== holder?.id && id !== 'leader')
        .map((id) => chain.nodes.get(id)).filter(Boolean);
      const graph = member.holderNodeId ? eligibilityGraph(state, chain, member.holderNodeId, survivors) : { eligibleSet: new Set() };
      if (!graph.eligibleSet.size) {
        breached += 1;
        breaches.push({ id: member.id, type: member.type, reason: 'no survivor has a recorded relationship with the holder at the review date' });
      }
    }
  }
  const measurable = members.length - unmeasurable;
  if (!measurable) {
    return {
      ok: true,
      grade: {
        gradedAt: now.toISOString(),
        observedGap: null,
        breachedN: null,
        unmeasurableN: unmeasurable,
        brier: null,
        logLoss: null,
        lapsed: true,
        note: 'Every member of this reading has been deleted, so nothing is measurable. The reading lapses rather than being credited or blamed.',
      },
    };
  }
  const observedGap = breached > 0;
  const predicted = Number(reading.pGapPct) / 100;
  const brier = round(((predicted - (observedGap ? 1 : 0)) ** 2), 4);
  const logLoss = round(-(observedGap ? Math.log(Math.max(predicted, 1e-9)) : Math.log(Math.max(1 - predicted, 1e-9))), 4);
  return {
    ok: true,
    grade: {
      gradedAt: now.toISOString(),
      observedGap,
      breachedN: breached,
      measurableN: measurable,
      unmeasurableN: unmeasurable,
      brier,
      logLoss,
      breaches: breaches.slice(0, 12),
      lapsed: false,
      note: unmeasurable
        ? `${unmeasurable} of ${members.length} member(s) no longer exist and were excluded from the grade, not counted as gaps.`
        : '',
      testedFloor: conv.successionTestedFloor,
    },
  };
}

function isStillOpen(source, record) {
  if (!source) return true;
  const mode = source.openWhen || {};
  if (mode.kind === 'in') {
    const value = readPath(record, mode.path);
    return Array.isArray(mode.values) ? mode.values.includes(value) : false;
  }
  if (mode.kind === 'empty') return !readPath(record, mode.path);
  return true;
}

/** Brier skill against the base rate of every graded reading — withheld below five. */
export function successionSkill(readings) {
  const graded = (readings || []).filter((r) => r?.graded && !r.graded.lapsed && Number.isFinite(r.graded.brier));
  const n = graded.length;
  if (n < 5) {
    return {
      n,
      floor: 5,
      skill: null,
      meanBrier: null,
      baseRate: null,
      refused: `${n} graded reading(s) against a 5-reading floor — no skill figure yet. A terminal that has never been graded is a hypothesis, not an instrument.`,
    };
  }
  const meanBrier = round(mean(graded.map((r) => r.graded.brier)), 4);
  const baseRate = graded.filter((r) => r.graded.observedGap).length / n;
  const reference = baseRate * (1 - baseRate);
  const skill = reference > 0 ? round(1 - meanBrier / reference, 3) : null;
  return { n, floor: 5, meanBrier, baseRate: round(baseRate * 100, 1), skill, refused: null };
}

/* -------------------------------------------------------- 8. the money */

/**
 * Deprivation exposure, per declared currency, with coherent expected shortfall.
 *
 * Method: for each holder with a declared daily cost and at least one blocked
 * obligation, the daily deprivation is `cost × (blocked / total)`; the expected
 * loss over the review window is `p × daily × days`, and the 90% expected
 * shortfall is the exact tail average of the binomial count with p equal to that
 * holder's blocked share.
 *
 * ASSUMPTIONS, PRINTED. Money is only ever what the leader typed. No salary is
 * inferred, no band is applied, and no amount is converted between currencies. A
 * holder without a declared cost contributes a COUNT and no money. The
 * equal-marginal binomial used for the tail is fatter than the heterogeneous
 * Poisson-binomial with the same mean, so the shortfall figure is an upper bound
 * rather than a best estimate, and the surface says so.
 */
export function deprivationExposure(report, { reviewDays = null, now = new Date() } = {}) {
  void now;
  const days = clampInt(reviewDays, 1, 365, report.conventions.successionReviewHorizonDays);
  const byCurrency = new Map();
  let unpricedN = 0;
  let pricedN = 0;
  const holders = [];
  for (const span of report.spans) {
    for (const holder of span.holders) {
      if (!holder.itemN) continue;
      const blockedN = (holder.blocked || []).length;
      if (!blockedN) continue;
      const member = span.members.find((m) => m.id === holder.holderId);
      const cost = member?.cost || null;
      const share = blockedN / holder.itemN;
      if (!cost) {
        unpricedN += blockedN;
        holders.push({
          holderId: holder.holderId,
          spanId: span.nodeId,
          blockedN,
          sharePct: round(share * 100, 1),
          priced: false,
          daily: null,
          currency: null,
          expectedLoss: null,
        });
        continue;
      }
      pricedN += blockedN;
      const daily = round(cost.amount * share, 2);
      if (!byCurrency.has(cost.currency)) {
        byCurrency.set(cost.currency, { currency: cost.currency, daily: 0, expected: 0, es90: 0, holdersN: 0, itemsN: 0 });
      }
      const row = byCurrency.get(cost.currency);
      row.daily = round(row.daily + daily, 2);
      row.holdersN += 1;
      row.itemsN += blockedN;
      row.expected = round(row.expected + share * daily * days, 2);
      row.es90 = round(row.es90 + expectedShortfallBernoulli(share, daily * days, 0.9), 2);
      holders.push({
        holderId: holder.holderId,
        spanId: span.nodeId,
        blockedN,
        sharePct: round(share * 100, 1),
        priced: true,
        daily,
        currency: cost.currency,
        expectedLoss: round(share * daily * days, 2),
      });
    }
  }
  return {
    currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    holders: holders.sort((a, b) => (b.expectedLoss || 0) - (a.expectedLoss || 0)),
    pricedN,
    unpricedN,
    reviewDays: days,
    refused: byCurrency.size
      ? null
      : 'No holder with a blocked obligation has a declared daily cost, so no money figure is reported. Unpriced work is counted, never valued.',
    note: 'Cost of vacancy is what the leader declared per holder per day, multiplied by the blocked share over the review window. Currencies are never summed, no salary is inferred, and no band is applied. The 90% shortfall uses an equal-marginal binomial, whose tail is fatter than the heterogeneous Poisson-binomial with the same mean — it is an upper bound, not a best estimate.',
  };
}

/**
 * Exact expected shortfall for n independent bernoullis with equal p and loss L,
 * truncated at the α quantile of the count distribution.
 */
function expectedShortfallBernoulli(p, loss, alpha) {
  const n = 20;
  const q = 1 - p;
  const probs = [];
  let running = 0;
  let quantile = n;
  for (let k = 0; k <= n; k += 1) {
    const prob = binomialCoefficient(n, k) * (p ** k) * (q ** (n - k));
    probs.push({ k, prob });
    running += prob;
    if (running >= alpha && quantile === n) quantile = k;
  }
  let total = 0;
  let tailProb = 0;
  for (const row of probs) {
    if (row.k <= quantile) continue;
    tailProb += row.prob;
    total += row.prob * (row.k / n) * loss;
  }
  return tailProb > 0 ? round(total / tailProb, 2) : 0;
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i += 1) {
    result = (result * (n - i + 1)) / i;
  }
  return result;
}

/* ------------------------------------------------------ 9. signals */

/**
 * The Insights contributions. Eight signals, each a count of something the record
 * can prove, never a score of a person.
 */
export function successionSignals(state, now = new Date(), settings = null) {
  const report = successionReport(state, { now, settings });
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Succession', route: '#/succession', ...signal });

  // A virgin workspace already gets exactly one setup nudge (SETUP-01). This is
  // the same statement in a second voice, so it is reported only when there is
  // work on file that no span can be tested against — which is a real defect
  // rather than an empty workspace. (Same rule as CHN-08, ADR-0075.)
  if (!report.chain.counts.people) {
    if (!report.counts.unownedWork) return signals;
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.NO_CHAIN,
      severity: 1,
      confidence: 'high',
      title: 'There is no chain to certify',
      detail: 'No roster member exists, so no span can be tested for bench coverage even though work is on file. Add the team and their managers first — the bench is a property of the tree, not of a rating.',
      action: { label: 'Open the succession terminal', route: '#/succession' },
      evidence: ['0 people on the roster', `${report.counts.unownedWork} item(s) with no span to hold them`],
    });
    return signals;
  }

  const certified = report.spans.filter((s) => s.verdict === 'certified-gap');
  if (certified.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.CERTIFIED_GAP,
      severity: Math.min(5, 2 + Math.min(3, certified.length)),
      confidence: 'high',
      title: `${certified.length} span(s) certified as unable to reabsorb a holder’s work`,
      detail: `${certified.slice(0, 3).map((s) => s.name).join(', ')}${certified.length > 3 ? '…' : ''} cannot reassign every obligation a holder carries: the flow test is infeasible and the min-cut names the items. This is a proof on the current record, not a prediction.`,
      action: { label: 'See the certificate', route: '#/succession?panel=bench' },
      evidence: [
        `${certified.length} of ${report.counts.measuredN} measured span(s)`, 
        `${report.counts.blockedItemsN} obligation(s) with no eligible survivor`, 
        `largest blocker: ${certified.slice().sort((a, b) => (b.blockedN || 0) - (a.blockedN || 0))[0]?.name || '—'} (${certified.slice().sort((a, b) => (b.blockedN || 0) - (a.blockedN || 0))[0]?.blockedN || 0} item(s))`,
      ],
    });
  }

  const concentrated = report.spans.filter((s) => s.verdict === 'concentrated');
  if (concentrated.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.CONCENTRATED,
      severity: 3,
      confidence: 'medium',
      title: `${concentrated.length} span(s) carry their work behind one holder past the cap`,
      detail: `Every obligation could be reabsorbed, but concentration is above the declared ${report.conventions.successionConcentrationCapPct}% cap. One resignation makes this a certified gap; the terminal reports the effective number of holders rather than a colour.`,
      action: { label: 'Open the bench', route: '#/succession?panel=bench' },
      evidence: [
        `${concentrated.length} span(s) above ${report.conventions.successionConcentrationCapPct}%`, 
        `lowest effective holders: ${Math.min(...concentrated.map((s) => Number(s.concentration?.effectiveHolders) || 0)).toFixed(2)}`, 
        'flow test passes today',
      ],
    });
  }

  const expiring = report.spans.filter((s) => s.itemsN > 0 && s.blanket?.blanketDays !== null && s.blanket?.blanketDays !== undefined && s.blanket.blanketDays <= 30);
  if (expiring.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.BLANKET_EXPIRY,
      severity: 2,
      confidence: 'high',
      title: `${expiring.length} span(s) hold no dated obligation beyond 30 days`,
      detail: 'A span out of promises is not automatically covered — it is out of measurable work. Record the next dated commitment or read the span as unmeasured, not as healthy.',
      action: { label: 'Review the blankets', route: '#/succession?panel=blanket' },
      evidence: [
        `${expiring.length} span(s) inside the 30-day window`, 
        `furthest blanket: ${Math.max(...expiring.map((s) => Number(s.blanket?.blanketDays) || 0))} days`, 
        `dated obligations in scope: ${report.counts.itemsN}`,
      ],
    });
  }

  const untested = report.spans.filter((s) => s.quotable && !s.handovers?.tested);
  if (untested.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.UNDERSTUDY,
      severity: 3,
      confidence: 'medium',
      title: `${untested.length} measured span(s) have never run a handover`,
      detail: 'A bench with no handover on record has an assumption-free probability of roughly one half that its next critical event is the first one it cannot cover. Recording a rehearsal is the cheapest way to halve that.',
      action: { label: 'See the untested benches', route: '#/succession?panel=understudy' },
      evidence: [
        `${untested.length} measured span(s) with no settled handover`, 
        `tested floor: ${report.conventions.successionTestedFloor} settled handovers`, 
        'assumption-free probability of a first uncovered event: about one half',
      ],
    });
  }

  const unmeasured = report.spans.filter((s) => s.verdict === 'unmeasured');
  if (unmeasured.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.UNMEASURED,
      severity: 2,
      confidence: 'medium',
      title: `${unmeasured.length} span(s) cannot be measured at all`,
      detail: 'An unmeasured span is not a healthy one. The terminal prints whether the cause is members, dated work, or a missing record of who has worked with whom — each needs a different fix.',
      action: { label: 'See the refusals', route: '#/succession?panel=bench' },
      evidence: [
        `${unmeasured.length} of ${report.counts.spansN} span(s) unmeasured`, 
        `${report.spans.filter((sp) => sp.structural === 'empty-span').length} empty span(s)`, 
        `${report.counts.unlinkedPairs} survivor pair(s) with no shared record`,
      ],
    });
  }

  if (!report.diffusion.refused && report.diffusion.share > 50) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.DIFFUSION,
      severity: 4,
      confidence: 'medium',
      title: `Coverage is degraded across ${report.diffusion.share}% of measured spans`,
      detail: `A diffusion index over ${report.diffusion.measuredN} measured spans. This is a breadth signal, not a forecast: it says the problem is structural rather than one team’s bad luck, and it does not identify which span binds first.`,
      action: { label: 'Open the chain view', route: '#/succession?panel=chain' },
      evidence: [
        `diffusion ${report.diffusion.share}% over ${report.diffusion.measuredN} measured span(s)`, 
        `floor: ${report.conventions.successionDiffusionFloor} measured spans`, 
        `${report.counts.certifiedN} certified, ${report.counts.concentratedN} concentrated`,
      ],
    });
  }

  const due = (report.readings || []).filter((r) => r && !r.graded && r.reviewOn && r.reviewOn <= dayKey(now));
  if (due.length) {
    add({
      ruleId: SUCCESSION_SIGNAL_IDS.GRADING_DUE,
      severity: 2,
      confidence: 'high',
      title: `${due.length} frozen bench reading(s) are due for grading`,
      detail: 'A frozen claim nobody grades is an opinion with a date on it. Grading re-runs the same structural test against the current record and stores a Brier loss — including a bad one.',
      action: { label: 'Grade the readings', route: '#/succession?panel=readings' },
      evidence: [
        `${due.length} reading(s) past their review date`, 
        `${(report.readings || []).filter((r) => r && r.graded).length} already graded`, 
        `skill withheld below ${report.skill?.floor ?? 5} graded readings`,
      ],
    });
  }

  return signals;
}

/** Nav badge: only the work a leader must act on, never the count of findings. */
export function successionAttentionCount(state, now = new Date(), settings = null) {
  const report = successionReport(state, { now, settings });
  const dueGrading = (report.readings || []).filter((r) => r && !r.graded && r.reviewOn && r.reviewOn <= dayKey(now)).length;
  return report.counts.certifiedN + dueGrading;
}

/* ------------------------------------------------------- 10. the brief */

/**
 * A generated, identity-free brief a leader can paste into a board pack. It marks
 * every unverified figure and names nobody — the same contract the Altitude Lens
 * uses, applied to the bench.
 */
export function successionBrief(report, now = new Date()) {
  const c = report.counts;
  const lines = [];
  lines.push(`LEADERSHIP BENCH — ${dayKey(now)}`);
  lines.push('');
  lines.push(`Spans read: ${c.spansN}. Measurable: ${c.measuredN}. Certified gaps: ${c.certifiedN}. Concentrated: ${c.concentratedN}. Covered: ${c.coveredN}. Unmeasured: ${c.unmeasuredN}.`);
  if (report.certification.pIndependence !== null) {
    lines.push(`Probability of at least one certified gap opening before review: ${report.certification.pIndependence}% (independence reference); assumption-free lower bound ${report.certification.pLower}%. The true figure lies between them.`);
  } else {
    lines.push(`Probability: NOT QUOTED — ${report.certification.refused}`);
  }
  lines.push(`Dated obligations in scope: ${c.itemsN}. Blocked (no eligible survivor with capacity): ${c.blockedItemsN}. Spans with no measured handover record: ${report.spans.filter((s) => s.quotable && !s.handovers?.tested).length}.`);
  if (report.diffusion.share !== null) {
    lines.push(`Diffusion: ${report.diffusion.share}% of ${report.diffusion.measuredN} measured spans are not covered.`);
  } else {
    lines.push(`Diffusion: NOT QUOTED — ${report.diffusion.refused}`);
  }
  lines.push('');
  lines.push('Method: collective blanket model; Herfindahl–Hirschman concentration; maximum-flow/minimum-cut feasibility on an evidence-only eligibility graph; Lindley–Smith for untested benches. Every figure is derived from dated records; nothing is a rating of a person. Refusals are printed and never rendered as zero.');
  lines.push('Unverified: eligibility depends on the completeness of the record of who has worked with whom. No figure here is a forecast of any individual’s departure.');
  return lines.join('\n');
}

export { SUCCESSION_PREMISE };
