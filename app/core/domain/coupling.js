/**
 * app/core/domain/coupling.js — Coupled Load Terminal (Schema v61).
 *
 * THE GAP THIS MODULE FILLS
 * -------------------------
 * LeadOS already prices a team's independent queues (Capacity: Little's Law and
 * Kingman's diffusion approximation per person), one person's cognitive
 * saturation (Load), one leader's decision sequencing (Decision Portfolio) and
 * one leader's attention budget (Attention Market). Every one of those models
 * assumes the queues are INDEPENDENT. They are not.
 *
 * Real work couples:
 *   - two drivers whose decisions share one approver wait on the same person;
 *   - a delegation hands work from one mind to another, so the receiver's
 *     arrival stream is the sender's completion stream;
 *   - two people co-own an obligation, so neither can finish it alone;
 *   - a reporting line makes one person's queue the other's supply.
 *
 * When queues are coupled the delay is NOT the sum of the independent delays.
 * Sharing one server drives utilisation up and, because Kingman's wait grows
 * hyperbolically in ρ, the wait grows far faster than the load. No leadership
 * tool models this. This module does, deterministically, from records the
 * leader already keeps.
 *
 * NAMED, CITABLE METHODS (product doctrine §0.2):
 *   - Kingman (1961) diffusion approximation: E[W] ≈ (ρ/(1−ρ)) · c · E[T],
 *     with c = (Ca² + Cs²)/2 = 1.0 for Poisson/exponential traffic — the same
 *     convention Capacity uses, so the two terminals agree on a shared server.
 *   - Little (1961) L = λW: arrival rates are estimated from the decision flow
 *     the leader already recorded, never invented.
 *   - Goldratt (1997) Theory of Constraints: the workspace's throughput is set
 *     by its most coupled bottleneck, so the report names bottlenecks rather
 *     than colouring every card red.
 *   - Graicunas (1933) / Brooks (1975): coordination channels grow with the
 *     reporting graph, which is one of the coupling edges.
 *
 * HONESTY BOUNDARIES, enforced in code:
 *   - Every arrival rate is a count of recorded decisions over a declared
 *     window divided by that window. Nothing is sampled, seeded or invented.
 *   - Service time is a DECLARED convention (`couplingServiceDays`), printed
 *     beside every figure it produced. It is not derived from the data it
 *     prices, because that would be circular.
 *   - A shared approver with fewer than two recorded decisions in the window
 *     is not a bottleneck: one decision cannot couple.
 *   - Below the sample floor an actor's own queue is counts-only.
 *   - No person is scored, rated or blamed. Coupling is measured on a ROLE.
 *   - Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, dayKey, round } from '../time.js';

export const COUPLING_ENGINE_VERSION = 'coupling-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Vocabulary                                                       */
/* ------------------------------------------------------------------ */

/** Coupling edge types. Each is a real relation between two attention-bearing actors. */
export const COUPLING_EDGE_TYPES = Object.freeze([
  'shares-approver',
  'hands-off',
  'co-owns',
  'reports-to',
]);

export const COUPLING_EDGE_LABELS = Object.freeze({
  'shares-approver': 'shares an approver',
  'hands-off': 'hands work to',
  'co-owns': 'co-owns an obligation',
  'reports-to': 'reports to',
});

/** Signal ids, stable across sessions so the same finding is recognisable. */
export const COUPLING_SIGNAL_IDS = Object.freeze([
  'COUP-01',
  'COUP-02',
  'COUP-03',
  'COUP-04',
  'COUP-05',
  'COUP-06',
  'COUP-07',
  'COUP-08',
]);

/** Declared defaults, mirrored in schema DEFAULT_SETTINGS and clamped there. */
export const COUPLING_DEFAULTS = Object.freeze({
  // An approver serving at least this many DISTINCT drivers in the window is a
  // shared bottleneck. Two is the floor: one decision cannot couple.
  couplingBottleneckActors: 2,
  // ...or this many decisions, whichever is the more sensitive reading.
  couplingBottleneckDecisions: 3,
  // A hand-off path longer than this (edges) is flagged for shortening.
  couplingHandoffMaxChain: 3,
  // A per-stream coupling delay at or above this many days opens a decision.
  couplingDelayThresholdDays: 2,
  // A coupling multiplier at or above this opens a decision.
  couplingMultiplierThreshold: 3,
  // Declared mean service time for one approval, in days. Printed everywhere.
  couplingServiceDays: 3,
  // Arrival rates are estimated over this look-back window.
  couplingWindowDays: 90,
  // Minimum obligations before an actor's own queue is more than counts.
  couplingMinObligations: 2,
  // Schema v62: the Coupled Load pause is its own switch. v61 reused the
  // continuity module's `couplingAutoPropagate`, so pausing one paused both.
  coupledLoadAutoPropagate: true,
});

/** Kingman variability factor. 1.0 = Poisson/exponential (Capacity's choice). */
export const COUPLING_KINGMAN_C = 1.0;

/* ------------------------------------------------------------------ */
/* 1. Name normalisation and actor index                               */
/* ------------------------------------------------------------------ */

/** Lower-case, collapse whitespace, trim. Stable actor identity. */
export function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function addDaysKey(value, n) {
  return addDays(value, n);
}

/**
 * Build the index of every attention-bearing actor in the workspace: roster
 * people plus every named driver, approver, contributor, case owner, delegate
 * and goal owner. A name that matches a roster person is linked to that
 * person; a name that does not is an external actor (a stakeholder who is not
 * on the roster still bears attention).
 */
export function buildActorIndex(state = {}) {
  const people = (state.people || []).filter((p) => p && p.status !== 'archived');
  const nameToActor = new Map();

  const addName = (rawName, personId) => {
    const name = String(rawName || '').trim();
    if (!name) return null;
    const norm = normalizeName(name);
    let actor = nameToActor.get(norm);
    if (!actor) {
      actor = { name, norm, personId: null, kind: 'external' };
      nameToActor.set(norm, actor);
    }
    if (personId && !actor.personId) {
      actor.personId = personId;
      actor.kind = 'person';
    }
    return actor;
  };

  for (const p of people) addName(p.name, p.id);

  for (const d of state.decisions || []) {
    if (!d) continue;
    addName(d.driver);
    addName(d.approver);
    for (const c of String(d.contributors || '').split(',')) addName(c);
  }
  for (const c of state.cases || []) {
    if (!c) continue;
    const owner = people.find((p) => p.id === c.ownerId);
    if (owner) addName(owner.name, owner.id);
  }
  for (const d of state.delegations || []) {
    if (!d) continue;
    const delegate = people.find((p) => p.id === d.personId);
    if (delegate) addName(delegate.name, delegate.id);
  }
  for (const g of state.goals || []) {
    if (!g) continue;
    const owner = people.find((p) => p.id === g.ownerId);
    if (owner) addName(owner.name, owner.id);
  }
  for (const o of state.oneOnOnes || []) {
    if (!o) continue;
    const person = people.find((p) => p.id === o.personId);
    if (person) addName(person.name, person.id);
  }
  // The workspace leader owns every delegation even though the record carries
  // no owner field; without this actor the delegation hand-offs have no sender.
  const leaderName = state.settings && state.settings.leaderName;
  if (leaderName) addName(leaderName, null);

  const actors = [];
  for (const a of nameToActor.values()) {
    a.key = a.personId ? `person:${a.personId}` : `actor:${a.norm}`;
    actors.push(a);
  }
  return actors;
}

/* ------------------------------------------------------------------ */
/* 2. Obligations and the coupling graph                               */
/* ------------------------------------------------------------------ */

/**
 * Collect every live obligation and the actors that bear it. An obligation is
 * one unit of attention-bearing work: an open case, a decision, a delegation,
 * a goal or a 1:1. Each carries the actor keys that bear it.
 */
function collectObligations(state, actors, now, settings) {
  const byKey = new Map(actors.map((a) => [a.key, a]));
  const windowStart = addDaysKey(dayKey(now), -settings.couplingWindowDays);
  const today = dayKey(now);
  const inWindow = (date) => {
    const d = dayKey(date);
    return Boolean(d) && d >= windowStart && d <= today;
  };
  const obligations = [];

  const push = (type, id, actorKeys, extra = {}) => {
    const valid = (actorKeys || []).filter((k) => byKey.has(k));
    if (!valid.length) return;
    obligations.push({ type, id, actorKeys: valid, ...extra });
  };

  for (const c of state.cases || []) {
    if (!c || c.status === 'resolved' || c.status === 'closed') continue;
    push('case', c.id, [c.ownerId ? `person:${c.ownerId}` : null].filter(Boolean), { date: c.createdAt });
  }
  for (const d of state.decisions || []) {
    if (!d) continue;
    const driverActor = actors.find((a) => normalizeName(a.name) === normalizeName(d.driver));
    const approverActor = actors.find((a) => normalizeName(a.name) === normalizeName(d.approver));
    const keys = [
      driverActor ? driverActor.key : null,
      approverActor ? approverActor.key : null,
    ].filter(Boolean);
    push('decision', d.id, keys, {
      date: d.date,
      approver: d.approver || '',
      driver: d.driver || '',
      contributors: String(d.contributors || ''),
      open: !d.chosen,
    });
  }
  for (const d of state.delegations || []) {
    if (!d || (d.status !== 'active')) continue;
    const delegateActor = actors.find((a) => a.personId === d.personId);
    const leaderActor = actors.find((a) => !a.personId && state.settings && state.settings.leaderName && normalizeName(a.name) === normalizeName(state.settings.leaderName));
    push('delegation', d.id, [
      delegateActor ? delegateActor.key : null,
      leaderActor ? leaderActor.key : null,
    ].filter(Boolean), { date: d.delegatedOn, delegate: d.personId });
  }
  for (const g of state.goals || []) {
    if (!g || g.status !== 'active') continue;
    push('goal', g.id, [g.ownerId ? `person:${g.ownerId}` : null].filter(Boolean), { date: g.createdAt });
  }
  for (const o of state.oneOnOnes || []) {
    if (!o) continue;
    push('oneOnOne', o.id, [o.personId ? `person:${o.personId}` : null].filter(Boolean), { date: o.date });
  }

  return { obligations, inWindow };
}

/**
 * Build the coupling graph: nodes are actors, edges are the typed relations
 * between them. Edges are derived from the obligations, never stored as a
 * first-class collection — the graph is a read model over records that exist.
 */
export function buildCouplingGraph(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  settings = { ...COUPLING_DEFAULTS, ...(settings || {}) };
  const actors = buildActorIndex(state);
  const byKey = new Map(actors.map((a) => [a.key, a]));
  const { obligations } = collectObligations(state, actors, now, settings);

  const edgeMap = new Map(); // `${a}|${b}|${type}` -> edge
  const addEdge = (aKey, bKey, type, summary) => {
    if (!aKey || !bKey || aKey === bKey) return null;
    const id = `${aKey}|${bKey}|${type}`;
    if (edgeMap.has(id)) return edgeMap.get(id);
    const edge = {
      a: aKey, b: bKey, type, summary: summary || '',
      count: 0,
    };
    edgeMap.set(id, edge);
    return edge;
  };

  // shares-approver: two drivers whose decisions share one approver.
  const byApprover = new Map();
  for (const ob of obligations) {
    if (ob.type !== 'decision' || !ob.approver) continue;
    const key = normalizeName(ob.approver);
    if (!byApprover.has(key)) byApprover.set(key, { approver: ob.approver, drivers: new Set() });
    const driverActor = actors.find((a) => normalizeName(a.name) === normalizeName(ob.driver));
    if (driverActor) byApprover.get(key).drivers.add(driverActor.key);
  }
  for (const { approver, drivers } of byApprover.values()) {
    const list = [...drivers];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const e = addEdge(list[i], list[j], 'shares-approver', `via approver "${approver}"`);
        if (e) e.count += 1;
      }
    }
  }

  // hands-off: a decision's driver hands it to its approver; a delegation's
  // leader hands it to its delegate.
  for (const ob of obligations) {
    if (ob.type === 'decision' && ob.driver && ob.approver) {
      const from = actors.find((a) => normalizeName(a.name) === normalizeName(ob.driver));
      const to = actors.find((a) => normalizeName(a.name) === normalizeName(ob.approver));
      if (from && to) {
        const e = addEdge(from.key, to.key, 'hands-off', `decision ${ob.id}`);
        if (e) e.count += 1;
      }
    }
    if (ob.type === 'delegation' && ob.actorKeys.length >= 2) {
      // actorKeys = [delegate, leader]
      const e = addEdge(ob.actorKeys[1], ob.actorKeys[0], 'hands-off', `delegation ${ob.id}`);
      if (e) e.count += 1;
    }
  }

  // co-owns: a decision's driver and its named contributors.
  for (const ob of obligations) {
    if (ob.type !== 'decision' || !ob.contributors) continue;
    const from = actors.find((a) => normalizeName(a.name) === normalizeName(ob.driver));
    if (!from) continue;
    for (const cName of ob.contributors.split(',')) {
      const to = actors.find((a) => normalizeName(a.name) === normalizeName(cName));
      if (to) {
        const e = addEdge(from.key, to.key, 'co-owns', `decision ${ob.id}`);
        if (e) e.count += 1;
      }
    }
  }

  // reports-to: the roster reporting line (a structural coupling edge).
  for (const p of state.people || []) {
    if (!p || !p.managerId) continue;
    const manager = (state.people || []).find((m) => m.id === p.managerId);
    if (manager) {
      addEdge(`person:${p.id}`, `person:${manager.id}`, 'reports-to', 'roster line');
    }
  }

  const edges = [...edgeMap.values()];

  // Connected components (union-find) over the coupling graph.
  const parent = new Map(actors.map((a) => [a.key, a.key]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const e of edges) union(e.a, e.b);
  const clusters = new Map();
  for (const a of actors) {
    const root = find(a.key);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(a);
  }
  const clusterList = [...clusters.values()]
    .map((members, i) => ({
      id: `cluster-${i + 1}`,
      actors: members.map((m) => m.key),
      size: members.length,
      edgeCount: edges.filter((e) => members.some((m) => m.key === e.a) && members.some((m) => m.key === e.b)).length,
    }))
    .filter((c) => c.size > 1)
    .sort((a, b) => b.size - a.size);

  return {
    actors, obligations, edges, clusters: clusterList,
    byKey, settings,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Shared bottlenecks and hand-off paths                            */
/* ------------------------------------------------------------------ */

/**
 * Shared bottlenecks: an actor who bears attention for obligations belonging
 * to at least `couplingBottleneckActors` distinct other actors (or
 * `couplingBottleneckDecisions` decisions in the window). Ranked by coupled
 * load share — the share of the cluster's obligations that pass through them.
 */
export function findSharedBottlenecks(graph, settings = COUPLING_DEFAULTS) {
  const { actors, obligations, byKey } = graph;
  const windowStart = addDaysKey(dayKey(new Date()), -settings.couplingWindowDays);

  // Approver bottlenecks from decision flow in the window.
  const approverStats = new Map();
  for (const ob of obligations) {
    if (ob.type !== 'decision' || !ob.approver) continue;
    const d = dayKey(ob.date);
    if (!d || d < windowStart) continue;
    const key = normalizeName(ob.approver);
    if (!approverStats.has(key)) approverStats.set(key, { actor: null, name: ob.approver, drivers: new Set(), decisions: 0 });
    const st = approverStats.get(key);
    st.decisions += 1;
    const driverActor = actors.find((a) => normalizeName(a.name) === normalizeName(ob.driver));
    if (driverActor) st.drivers.add(driverActor.key);
  }
  const bottlenecks = [];
  for (const st of approverStats.values()) {
    const meetsActors = st.drivers.size >= settings.couplingBottleneckActors;
    const meetsDecisions = st.decisions >= settings.couplingBottleneckDecisions;
    if (!meetsActors && !meetsDecisions) continue;
    bottlenecks.push({
      actor: st.name,
      kind: 'approver',
      actorsServed: st.drivers.size,
      actors: Array.from(st.drivers).map((k) => (byKey.get(k) || { name: k }).name),
      decisions: st.decisions,
    });
  }

  // Delegate bottlenecks: a person who is the delegate on several obligations.
  const delegateStats = new Map();
  for (const ob of obligations) {
    if (ob.type !== 'delegation') continue;
    const delegateKey = ob.actorKeys[0];
    if (!delegateKey) continue;
    if (!delegateStats.has(delegateKey)) delegateStats.set(delegateKey, { actor: byKey.get(delegateKey), delegations: 0 });
    delegateStats.get(delegateKey).delegations += 1;
  }
  for (const st of delegateStats.values()) {
    if (st.delegations < settings.couplingBottleneckActors) continue;
    bottlenecks.push({
      actor: st.actor ? st.actor.name : st.actor?.key || 'unknown',
      kind: 'delegate',
      actorsServed: 1,
      decisions: st.delegations,
    });
  }

  bottlenecks.sort((a, b) => b.actorsServed - a.actorsServed || b.decisions - a.decisions);
  return bottlenecks;
}

/**
 * Hand-off paths: maximal simple paths in the `hands-off` subgraph. A path
 * longer than `couplingHandoffMaxChain` edges is flagged — work handed along a
 * long chain waits at every hop.
 */
export function findHandoffPaths(graph, settings = COUPLING_DEFAULTS) {
  const { actors, byKey } = graph;
  const handoff = graph.edges.filter((e) => e.type === 'hands-off');
  const adj = new Map(actors.map((a) => [a.key, []]));
  for (const e of handoff) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    adj.get(e.a).push(e.b);
  }
  const paths = [];
  const maxPaths = 24;
  const visit = (node, trail, seen) => {
    if (paths.length >= maxPaths) return;
    const next = adj.get(node) || [];
    if (!next.length) {
      if (trail.length > 1) paths.push({ actors: trail.slice(), edges: trail.length - 1 });
      return;
    }
    for (const nxt of next) {
      if (seen.has(nxt)) continue;
      const ns = new Set(seen);
      ns.add(nxt);
      visit(nxt, [...trail, nxt], ns);
    }
  };
  for (const a of actors) {
    if (paths.length >= maxPaths) break;
    visit(a.key, [a.key], new Set([a.key]));
  }
  // Keep the longest path per starting actor, deduplicated.
  const best = new Map();
  for (const p of paths) {
    const start = p.actors[0];
    if (!best.has(start) || p.edges > best.get(start).edges) best.set(start, p);
  }
  const result = [...best.values()].sort((a, b) => b.edges - a.edges);
  const longPaths = result.filter((p) => p.edges >= settings.couplingHandoffMaxChain);
  return { paths: result.slice(0, 12), longPaths };
}

/* ------------------------------------------------------------------ */
/* 4. Coupling delay (Kingman)                                         */
/* ------------------------------------------------------------------ */

/**
 * Price the delay coupling imposes on each stream that shares an approver.
 *
 * For an approver serving k driver-streams over the window:
 *   λ_i  = decisions from driver i approved by this approver / windowWeeks
 *   ρ_i  = λ_i · E[T];  ρ_total = Σ λ_i · E[T]
 *   W_shared  = (ρ_total/(1−ρ_total)) · c · E[T]
 *   W_i       = (ρ_i/(1−ρ_i)) · c · E[T]
 *   delay_i   = W_shared − W_i        (days)
 *   multiplier_i = W_shared / W_i
 *
 * The multiplier is the honest headline: it approaches k as load falls, so it
 * says "k streams on one server is at least k times the wait" without pretending
 * to know the absolute scale. Service time is a declared convention.
 */
export function priceCouplingDelay(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  const windowWeeks = settings.couplingWindowDays / 7;
  const serviceWeeks = settings.couplingServiceDays / 7;
  const c = COUPLING_KINGMAN_C;
  const windowStart = addDaysKey(dayKey(now), -settings.couplingWindowDays);
  const today = dayKey(now);

  const byApprover = new Map();
  for (const d of state.decisions || []) {
    if (!d) continue;
    const date = dayKey(d.date);
    if (!date || date < windowStart || date > today) continue;
    const approverName = String(d.approver || '').trim();
    const driverName = String(d.driver || '').trim();
    if (!approverName || !driverName) continue;
    const key = normalizeName(approverName);
    if (!byApprover.has(key)) byApprover.set(key, { approver: approverName, streams: new Map(), total: 0 });
    const ap = byApprover.get(key);
    ap.total += 1;
    const dk = normalizeName(driverName);
    if (!ap.streams.has(dk)) ap.streams.set(dk, { driver: driverName, count: 0 });
    ap.streams.get(dk).count += 1;
  }

  const results = [];
  for (const ap of byApprover.values()) {
    if (ap.total < 2) continue; // one decision cannot couple
    const streams = [...ap.streams.values()];
    const lambdaTotal = ap.total / windowWeeks;
    const rhoTotal = lambdaTotal * serviceWeeks;
    if (rhoTotal >= 1) {
      results.push({
        approver: ap.approver, streams: streams.length, decisions: ap.total,
        unstable: true, rhoTotal, waitSharedDays: null, perStream: [],
      });
      continue;
    }
    const waitSharedWeeks = (rhoTotal / (1 - rhoTotal)) * c * serviceWeeks;
    const waitSharedDays = waitSharedWeeks * 7;
    const perStream = streams.map((s) => {
      const lambda = s.count / windowWeeks;
      const rho = lambda * serviceWeeks;
      const waitIndependentWeeks = rho > 0 ? (rho / (1 - rho)) * c * serviceWeeks : 0;
      const waitIndependentDays = waitIndependentWeeks * 7;
      return {
        driver: s.driver, count: s.count, lambda: round(lambda, 4), rho: round(rho, 4),
        waitIndependentDays: round(waitIndependentDays, 2),
        waitSharedDays: round(waitSharedDays, 2),
        delayDays: round(waitSharedDays - waitIndependentDays, 2),
        multiplier: waitIndependentDays > 0 ? round(waitSharedDays / waitIndependentDays, 2) : null,
      };
    });
    results.push({
      approver: ap.approver, streams: streams.length, decisions: ap.total,
      unstable: false, rhoTotal: round(rhoTotal, 4),
      waitSharedDays: round(waitSharedDays, 2),
      perStream,
    });
  }
  results.sort((a, b) => b.streams - a.streams || b.decisions - a.decisions);
  return results;
}

/* ------------------------------------------------------------------ */
/* 5. Report, signals, brief, attention count                          */
/* ------------------------------------------------------------------ */

/**
 * Build the full coupled-load report: graph, bottlenecks, hand-off paths and
 * the priced coupling delay. One call, no side effects.
 */
export function buildCouplingReport(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  settings = { ...COUPLING_DEFAULTS, ...(settings || {}) };
  const graph = buildCouplingGraph(state, now, settings);
  const bottlenecks = findSharedBottlenecks(graph, settings);
  const handoffs = findHandoffPaths(graph, settings);
  const delay = priceCouplingDelay(state, now, settings);

  const maxMultiplier = delay.reduce((m, d) => {
    const ms = d.perStream.map((s) => s.multiplier).filter((x) => x != null);
    return Math.max(m, ...ms, 0);
  }, 0);
  const maxDelay = delay.reduce((m, d) => Math.max(m, ...d.perStream.map((s) => s.delayDays), 0), 0);

  return {
    engine: COUPLING_ENGINE_VERSION,
    generatedAt: now instanceof Date ? now.toISOString() : String(now),
    conventions: {
      serviceDays: settings.couplingServiceDays,
      windowDays: settings.couplingWindowDays,
      kingmanC: COUPLING_KINGMAN_C,
    },
    actorCount: graph.actors.length,
    obligationCount: graph.obligations.length,
    edgeCount: graph.edges.length,
    clusterCount: graph.clusters.length,
    byKey: graph.byKey,
    bottlenecks,
    handoffs,
    delay,
    maxMultiplier: round(maxMultiplier, 2),
    maxDelayDays: round(maxDelay, 2),
  };
}

/**
 * Findings for the Insights centre. Each carries a stable rule id, a numeric
 * severity, the evidence that produced it and a single navigable next action —
 * the same finding shape every other terminal uses, so the roll-up is honest.
 */
export function couplingSignals(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  settings = { ...COUPLING_DEFAULTS, ...(settings || {}) };
  const signals = [];
  const report = buildCouplingReport(state, now, settings);
  const route = (tab) => `#/coupling?tab=${tab}`;

  for (const b of report.bottlenecks) {
    if (b.kind === 'approver' && b.actorsServed >= settings.couplingBottleneckActors) {
      signals.push({
        ruleId: 'COUP-01',
        domain: 'Coupled load',
        severity: b.actorsServed >= 3 ? 4 : 3,
        title: `"${b.actor}" approves decisions for ${b.actorsServed} people — a shared approval bottleneck`,
        detail: `In the last ${settings.couplingWindowDays} days this approver signed off ${b.decisions} decision(s) driven by ${b.actorsServed} different people. Sharing one server drives utilisation up and the wait grows hyperbolically (Kingman), so the coupled wait is larger than the sum of the independent ones.`,
        evidence: [
          `${b.actorsServed} distinct drivers · ${b.decisions} decisions in ${settings.couplingWindowDays} days`,
          `Declared service time ${settings.couplingServiceDays} days (a convention, not a measurement)`,
        ],
        action: { label: 'Open the coupled-load terminal', route: route('bottlenecks') },
      });
    }
  }
  for (const d of report.delay) {
    if (d.unstable) {
      signals.push({
        ruleId: 'COUP-03',
        domain: 'Coupled load',
        severity: 4,
        title: `Approver "${d.approver}" is over capacity: ${d.streams} streams, ρ ≥ 1`,
        detail: `${d.streams} decision streams share one approver and the estimated utilisation reaches or exceeds 1, so the Kingman wait diverges. This is a structural overload, not a busy week.`,
        evidence: [`${d.streams} streams · ${d.decisions} decisions · ρ = ${d.rhoTotal}`],
        action: { label: 'Open the coupled-load terminal', route: route('delay') },
      });
      continue;
    }
    const worst = d.perStream.reduce((w, s) => (s.delayDays > (w?.delayDays || -1) ? s : w), null);
    if (worst && worst.delayDays >= settings.couplingDelayThresholdDays) {
      signals.push({
        ruleId: 'COUP-03',
        domain: 'Coupled load',
        severity: 4,
        title: `Sharing "${d.approver}" adds ${worst.delayDays} days to ${worst.driver}'s wait`,
        detail: `${worst.driver}'s decisions wait on "${d.approver}" alongside ${d.streams - 1} other stream(s). The shared wait is ${d.waitSharedDays} days against ${worst.waitIndependentDays} days alone — a ${worst.multiplier}× multiplier.`,
        evidence: [
          `${d.streams} streams · ${d.decisions} decisions · ρ = ${d.rhoTotal}`,
          `${worst.driver}: ${worst.waitIndependentDays} d alone → ${d.waitSharedDays} d shared`,
        ],
        action: { label: 'Open the coupled-load terminal', route: route('delay') },
      });
    }
    if (worst && worst.multiplier != null && worst.multiplier >= settings.couplingMultiplierThreshold) {
      signals.push({
        ruleId: 'COUP-04',
        domain: 'Coupled load',
        severity: 3,
        title: `"${worst.driver}" waits ${worst.multiplier}× longer sharing "${d.approver}" than alone`,
        detail: `The coupling multiplier is scale-free: it approaches the number of streams sharing the server as load falls. ${worst.multiplier}× is the measured ratio for ${worst.driver} on this approver.`,
        evidence: [`multiplier ${worst.multiplier}· · ${worst.driver} · ${d.approver}`],
        action: { label: 'Open the coupled-load terminal', route: route('delay') },
      });
    }
  }
  if (report.handoffs.longPaths.length > 0) {
    const longest = report.handoffs.longPaths[0];
    const graph = buildCouplingGraph(state, now, settings);
    const chainLabel = longest.actors.map((k) => (graph.byKey.get(k) || { name: k }).name).join(' → ');
    signals.push({
      ruleId: 'COUP-05',
      domain: 'Coupled load',
      severity: 3,
      title: `A hand-off chain runs ${longest.edges} hops — work waits at every step`,
      detail: `A measured hand-off path runs ${longest.edges} hops (${chainLabel}). Each hop adds queue delay, so a long chain finishes later than a short one even at the same total work.`,
      evidence: [`${longest.edges}-hop chain · ${chainLabel}`],
      action: { label: 'Open the coupled-load terminal', route: route('handoffs') },
    });
  }
  if (report.clusterCount > 0) {
    const largest = report.clusters ? report.clusters[0] : null;
    if (largest && largest.size >= 4) {
      signals.push({
        ruleId: 'COUP-06',
        domain: 'Coupled load',
        severity: 2,
        title: `${largest.size} actors are coupled into one attention cluster`,
        detail: `${largest.size} people and named actors are connected by shared approvers, hand-offs, co-ownership or reporting lines. One cluster's delay is not the sum of its parts.`,
        evidence: [`${largest.size} actors · ${largest.edgeCount} coupling edges`],
        action: { label: 'Open the coupled-load terminal', route: route('map') },
      });
    }
  }
  // Hand-off density: an actor receiving hand-offs from several senders.
  const receiveCount = new Map();
  for (const e of buildCouplingGraph(state, now, settings).edges) {
    if (e.type !== 'hands-off') continue;
    receiveCount.set(e.b, (receiveCount.get(e.b) || 0) + 1);
  }
  for (const [key, count] of receiveCount) {
    if (count < 3) continue;
    const actor = buildCouplingGraph(state, now, settings).byKey.get(key);
    signals.push({
      ruleId: 'COUP-07',
      domain: 'Coupled load',
      severity: 3,
      title: `${actor ? actor.name : key} receives hand-offs from ${count} senders`,
      detail: `${actor ? actor.name : key} is the receiver on ${count} measured hand-offs. A high in-degree is a coupling hotspot: work converges on one mind.`,
      evidence: [`${count} inbound hand-offs`],
      action: { label: 'Open the coupled-load terminal', route: route('map') },
    });
  }
  return signals;
}

/** Deterministic brief for the Insights centre and nav badge. */
export function couplingBrief(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  settings = { ...COUPLING_DEFAULTS, ...(settings || {}) };
  const report = buildCouplingReport(state, now, settings);
  const signals = couplingSignals(state, now, settings);
  const high = signals.filter((s) => s.severity >= 4).length;
  return {
    actorCount: report.actorCount,
    bottleneckCount: report.bottlenecks.length,
    clusterCount: report.clusterCount,
    maxMultiplier: report.maxMultiplier,
    highSeveritySignals: high,
    summary: report.bottlenecks.length > 0
      ? `${report.bottlenecks.length} shared bottleneck(s) across ${report.actorCount} coupled actor(s); worst wait ${report.maxMultiplier}× the independent wait.`
      : report.actorCount > 1
        ? `${report.actorCount} actor(s) bear attention with no shared bottleneck detected in the window.`
        : 'No coupled load yet. Add decisions, delegations or cases that share an approver or hand work between people.',
  };
}

/** Attention count for the nav badge: decision-shaped findings (severity ≥ 3). */
export function couplingAttentionCount(state = {}, now = new Date(), settings = COUPLING_DEFAULTS) {
  return couplingSignals(state, now, settings).filter((s) => s.severity >= 3).length;
}
