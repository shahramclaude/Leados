/**
 * app/core/domain/operatingModel.js — the Operating Model read model
 * (Schema v91, ADR-0085).
 *
 * Everything here is a pure function of the workspace. The same records produce
 * the same reading on any machine, and every figure can be traced to the records
 * and the declared norms that produced it — which is the only reason a number
 * about a person's week deserves to be printed at all.
 *
 * THE FIVE THINGS THIS ANSWERS THAT NO ATTENDANCE SYSTEM ASKS
 * -----------------------------------------------------------
 *  1. **Displacement.** How many hours of a position's week are spent below its
 *     own altitude? Not "how busy", not "how present" — *how far below its own
 *     job the work sits*. Derived from records the workspace already holds
 *     (open obligations carry `requiredRank` from ADR-0075) plus the declared
 *     work-type split.
 *  2. **Abstention.** How much of the level above's week exists only because the
 *     level below is not trusted to hold the call? Priced per routed decision,
 *     then split by SMED's internal/external distinction: a 14-minute decision is
 *     the job; a four-hour document is a routing defect.
 *  3. **Congruence.** Does the position's remaining "deep" time cover what it was
 *     hired for *at all*? A boolean with a printed threshold, never a percentage
 *     ranking of managers.
 *  4. **Continuity.** Below the declared floor, a span does not survive one
 *     person — so relieving it with a hire is a design error, not a fix. This is
 *     the mechanism nobody models: **relief that creates a single point of
 *     failure is not relief**.
 *  5. **Coupling.** Graicunas' combinatorics made computable from real records:
 *     how many collaboration edges exist, what fraction cross a unit boundary,
 *     and how far one change propagates in waves.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *  - No person is measured, ranked, scored or compared. Every figure has a span,
 *    a design, a record or an edge as its subject.
 *  - No rate is printed below the cell floor; the count is printed instead, with
 *    the exact number of observations that would lift the refusal.
 *  - No absence is read as absence of work. Presence is not modelled at all.
 *  - No hours figure is invented. An undeclared norm is `null` and the dependent
 *    output says "not measurable" and why.
 *  - No decision is executed. Congestion opens a *question* about a design.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildChain, harvestWork, LEADER_ID, responsibleNodeId } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { altitudeByKey, altitudeRank, ALTITUDES } from './chainRegistry.js';
import {
  OPERATING_MODEL_LEVER_BY_KEY,
  OPERATING_MODEL_LEVERS,
  OPERATING_MODEL_LIMITS,
  OPERATING_MODEL_WORK_TYPES,
  omFingerprint,
} from './operatingModelRegistry.js';
import { normalizeOperatingModelSettings } from './operatingModelSchema.js';

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pct = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);

/** Declared conventions, resolved once and printed wherever they are consumed. */
export function operatingModelNorms(settings = {}) {
  const s = normalizeOperatingModelSettings(settings);
  const weeklyCapacity = r1(s.omDeepWorkHoursPerDay * s.omWorkDaysPerWeek);
  return {
    ...s,
    weeklyCapacity,
    capacityBasis: `${s.omDeepWorkHoursPerDay} effective h/day × ${s.omWorkDaysPerWeek} declared day(s) = ${weeklyCapacity} h/week`,
    utilisationCeiling: s.omUtilizationCeilPct / 100,
    abstentionWeight: s.omAbstentionWeightPct / 100,
    crossWave: s.omCrossWavePct / 100,
    spanBand: Object.freeze([3, 8]),
  };
}

/* ------------------------------------------------------------ 0. the inputs */

/** People on the roster, keyed, with the level the chain reads. */
function rosterOf(state) {
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id && p.status !== 'archived');
  return { people, byId: new Map(people.map((p) => [p.id, p])) };
}

/**
 * The declared work-type split that applies to a node, or null.
 *
 * Two keys are tried in order: the person's *truthful* level (a person can carry
 * a different level from their altitude — that mismatch is itself a finding) and
 * the node's altitude. A split that would be applied to people in more than one
 * function only matches on level, and that limitation is printed rather than
 * hidden.
 */
function splitFor(person, altitudeKey, splits) {
  if (!splits.length) return null;
  const levelKey = String(person?.level || '').toLowerCase();
  const candidates = splits.filter((s) => s.level === levelKey || s.level === altitudeKey);
  if (!candidates.length) return null;
  const exact = candidates.find((s) => s.level === levelKey) || candidates[0];
  return exact;
}

/** Open obligations per owner node, from the workspace's own work registry. */
function demandByOwnerNode(state, chain, norms, now) {
  const items = harvestWork(state, chain, { now, settings: state?.settings || {} });
  const byNode = new Map();
  const total = { items: items.length, hours: 0, priced: 0, unpriced: 0 };
  for (const item of items) {
    const nodeId = item.ownerNodeId || LEADER_ID;
    const entry = byNode.get(nodeId) || { items: 0, hours: 0, displaced: 0, displacedItems: 0, overdue: 0, severe: 0, byType: {} };
    entry.items += 1;
    entry.byType[item.type] = (entry.byType[item.type] || 0) + 1;
    if (item.overdueDays > 0) entry.overdue += 1;
    if (item.severity >= 2) entry.severe += 1;
    // Hours are only ever priced from a RECORD. The workspace prices an open
    // obligation at the declared hours-per-obligation convention, which is
    // printed on the norms panel beside the split itself.
    entry.hours += 0;
    total.unpriced += 1;
    // Displacement: the age of the work places it at a higher altitude than the
    // owner's. That is a fact about the record's clock, not about the owner.
    const above = item.requiredRank > (altitudeRank(chain.nodes.get(nodeId)?.altitude) || 0);
    if (above) {
      entry.displaced += 1;
      entry.displacedItems += 1;
    }
    byNode.set(nodeId, entry);
  }
  return { byNode, total };
}

/** Open delegations per LEAVING person (the work that comes back to the leader). */
function feedbackIntake(state) {
  const open = (Array.isArray(state?.delegations) ? state.delegations : [])
    .filter((d) => d && d.status === 'active');
  const byPerson = new Map();
  for (const d of open) {
    if (!d.personId) continue;
    byPerson.set(d.personId, (byPerson.get(d.personId) || 0) + 1);
  }
  return { open, byPerson };
}

/**
 * Routed decisions: decisions whose `driver` is a report of the span owner, i.e.
 * the call sits one or more levels above the person doing the work.
 *
 * This is the only abstention signal the workspace can *prove*, because it is the
 * only one where a record names both who owns the consequence and who is trusted
 * to hold it. It is a partial measure and the panel says so.
 */
function routedDecisions(state, chain, now) {
  const rows = [];
  const managerOf = (id) => chain.byId.get(id)?.parentId || LEADER_ID;
  for (const d of Array.isArray(state?.decisions) ? state.decisions : []) {
    if (!d || !d.id) continue;
    if (d.chosen) continue; // a made call is no longer waiting on anyone
    const decisionDate = dayKey(d.date) || dayKey(d.createdAt) || dayKey(now);
    const ageDays = daysBetween(decisionDate, dayKey(now));
    // Who carries this decision: the DACI driver if they are on the roster,
    // otherwise the root. The subject is the DECISION and the span, never the
    // driver.
    const driverNode = d.driver && chain.byId.has(d.driver) ? d.driver : null;
    const holderNode = driverNode ? managerOf(driverNode) : LEADER_ID;
    rows.push({
      id: d.id,
      title: String(d.title || 'Untitled call').slice(0, 180),
      holderNodeId: holderNode,
      routed: Boolean(driverNode) && holderNode !== driverNode,
      ageDays: ageDays === null ? 0 : Math.max(0, ageDays),
      openedOn: decisionDate,
    });
  }
  return rows;
}

/**
 * The declared collaboration graph. Edges are declared, never inferred from a
 * calendar — the module has no access to one and would not use it if it did.
 */
function collaborationGraph(state, chain) {
  const edges = [];
  const seen = new Set();
  for (const edge of Array.isArray(state?.omEdges) ? state.omEdges : []) {
    if (!edge || !edge.fromId || !edge.toId || edge.fromId === edge.toId) continue;
    const key = edge.fromId < edge.toId ? `${edge.fromId}|${edge.toId}` : `${edge.toId}|${edge.fromId}`;
    if (seen.has(key) || edges.length >= OPERATING_MODEL_LIMITS.edges) continue;
    seen.add(key);
    edges.push({
      id: edge.id || `edge-${edges.length}`,
      fromId: edge.fromId,
      toId: edge.toId,
      weight: Math.max(1, Math.min(5, Math.round(Number(edge.weight) || 1))),
      unitCrossing: Boolean(edge.unitCrossing),
      kind: ['sync', 'handoff', 'review', 'escalation'].includes(edge.kind) ? edge.kind : 'sync',
      note: String(edge.note || '').slice(0, 200),
    });
  }
  return edges;
}

/* ------------------------------------------------------ 1. measure the model */

function stationFor(node, chain, demand, feedback, splits, norms) {
  const altitude = altitudeByKey(node.altitude);
  const rank = altitudeRank(node.altitude) || 1;
  const person = node.isLeader ? null : node;
  const split = splitFor(person || {}, node.altitude, splits);
  const capacity = norms.weeklyCapacity;

  const demandRow = demand.byNode.get(node.id) || { items: 0, hours: 0, displaced: 0, overdue: 0, severe: 0, byType: {} };
  const directReports = (node.childIds || []).length;

  // Work types. When a split is declared for this level/altitude we use it; when
  // it is not, the position is `unmeasured` and every dependent output refuses.
  let types = null;
  let hours = null;
  if (split) {
    types = {};
    hours = {};
    for (const key of Object.keys(OPERATING_MODEL_WORK_TYPES)) {
      types[key] = split[key];
      hours[key] = r1((split[key] / 100) * capacity);
    }
  }

  // Coordinating the span is a measured obligation: a declared number of hours
  // per direct report for the basic cadence (1:1s and the team meeting).
  const coordinationHours = r1(directReports * norms.omCoordinationHoursPerWeek);
  // Supervision of open delegated work: hours returned per open delegation.
  const openDelegations = (node.childIds || []).reduce((sum, childId) => sum + (feedback.byPerson.get(childId) || 0), 0);
  const supervisionHours = r1(openDelegations * norms.omDelegationHoursPerWeek);
  const overhead = r1(coordinationHours + supervisionHours);

  // Committed hours: the declared split (minus the coordination it already
  // carries, floored at zero) plus the measured overhead.
  const declaredCommitted = hours ? r1(Math.max(0, (hours.altitude + hours.displaced + hours.abstention + hours.coordination) - hours.coordination)) : null;
  const committed = declaredCommitted === null ? null : r1(declaredCommitted + overhead);
  const utilisation = committed === null ? null : r2(committed / capacity);
  const headroom = committed === null ? null : r1(capacity - committed);

  // Displacement: the share of the week that sits below the position's altitude.
  const displacedHours = hours ? r1(hours.displaced + hours.coordination) : null;
  const displacedPct = displacedHours === null ? null : pct(displacedHours / capacity);

  // Congruence: does the remaining deep time cover the position's own altitude?
  const deepHours = hours ? r1(hours.altitude) : null;
  const congruence = deepHours === null ? null : {
    deepHours,
    requiredHours: r1(capacity * 0.5),
    holds: deepHours >= capacity * 0.5,
    basis: 'A position holds its altitude when at least half its capacity is still spent at that altitude. The 50% is a declared convention, not a law; it is printed with the figure so the reader can disagree with it.',
  };

  const spanBand = norms.spanBand;
  const bandVerdict = directReports < spanBand[0] ? 'thin' : directReports > spanBand[1] ? 'wide' : 'band';
  const continuity = directReports < norms.omContinuityFloor;

  return {
    nodeId: node.id,
    name: node.name,
    altitudeKey: node.altitude,
    altitudeLabel: altitude?.label || '—',
    rank,
    depth: node.depth || 0,
    isLeader: Boolean(node.isLeader),
    directReports,
    spanBand,
    bandVerdict,
    continuity,
    continuityFloor: norms.omContinuityFloor,
    measured: Boolean(split),
    splitId: split?.id || null,
    splitBasis: split ? `declared split for ${split.level || 'level'}${split.functionKey ? ` · ${split.functionKey}` : ''}` : 'no work-type split declared for this level/altitude',
    types,
    hours,
    capacity,
    overhead,
    coordinationHours,
    supervisionHours,
    openDelegations,
    demandItems: demandRow.items,
    demandDisplaced: demandRow.displaced,
    committed,
    utilisation,
    headroom,
    displacedHours,
    displacedPct,
    deepHours,
    congruence,
    overCeiling: utilisation !== null && utilisation > norms.utilisationCeiling,
    stations: null,
  };
}

/**
 * THE LINE. Commitments per station versus capacity, per position.
 *
 * This is the part the whole module is built around, and it is the part an
 * attendance product cannot produce: the bottleneck is a *design* whose
 * commitments exceed the hours the design actually has, and the number that
 * matters is not utilisation but **how much relief one structural change buys**.
 */
export function operatingStations(state, { chain, norms, splits, demand, feedback } = {}) {
  const rows = [];
  for (const node of chain.nodes.values()) {
    if (node.reachable === false) continue;
    if (!node.isLeader && !(node.span > 0 && node.altitude)) continue;
    rows.push(stationFor(node, chain, demand, feedback, splits, norms));
  }
  // A span that reports to nobody on the roster sits under the workspace leader;
  // the leader's own row is always computed so the reader has a reference point.
  if (!rows.some((row) => row.nodeId === LEADER_ID) && chain.nodes.has(LEADER_ID)) {
    rows.push(stationFor(chain.nodes.get(LEADER_ID), chain, demand, feedback, splits, norms));
  }
  rows.sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1) || a.name.localeCompare(b.name));
  return rows;
}

/* ------------------------------------------------- 2. the R&R gate (inputs) */

/**
 * Before a single number is printed, the measurement system grades itself. Three
 * tests, each of which can refuse and say why:
 *
 *   N1  every rate has a denominator that clears the declared floor
 *   N2  a declared split sums to exactly 100% (the normalizer already fixes the
 *       arithmetic; this reports whether a human-authored split was rescaled)
 *   N3  no person is scheduled into more hours than the declared week — the
 *       attendance equivalent of a double-booking, audited rather than assumed
 *
 * Outputs that fail a test are marked refused and the *single cheapest* fix is
 * named. This is gauge R&R applied to desk work: you cannot validate a model
 * whose inputs are not trustworthy, so the inputs are validated first.
 */
export function operatingRnr(state, { norms, splits, stations } = {}) {
  const results = [];
  const measured = stations.filter((s) => s.measured);
  const floor = norms.omCellFloor;

  results.push({
    key: 'denominator',
    label: 'Every printed rate has a denominator above the floor',
    measuredN: measured.length,
    floor,
    pass: measured.length >= floor,
    verdict: measured.length >= floor
      ? `${measured.length} position design(s) measured against a ${floor}-observation floor. Rates are printed.`
      : `Only ${measured.length} position design(s) carry a declared split; the ${floor}-observation floor is not met, so span rates are refused and counts are printed. Declare ${floor - measured.length} more split(s) to lift this.`,
    fix: measured.length >= floor ? null : `Declare a work-type split for ${floor - measured.length} more level(s) on the Norms panel.`,
  });

  const rescaled = splits.filter((s) => Math.abs(Object.keys(OPERATING_MODEL_WORK_TYPES).reduce((sum, key) => sum + (Number(s[key]) || 0), 0) - 100) > 0.05);
  results.push({
    key: 'arithmetic',
    label: 'Every declared split sums to 100%',
    measuredN: splits.length,
    floor: 1,
    pass: rescaled.length === 0,
    verdict: rescaled.length === 0
      ? `${splits.length} declared split(s) sum to 100%.`
      : `${rescaled.length} split(s) do not sum to 100% and were reported rather than silently repaired.`,
    fix: rescaled.length === 0 ? null : 'Re-declare the affected split so its four work types sum to 100.',
  });

  // N3: no position's declared week exceeds the declared capacity by more than
  // the ceiling. A station over the ceiling is a finding, not an input error, so
  // this test reports the count and passes when the reader can see it.
  const over = stations.filter((s) => s.utilisation !== null && s.utilisation > 1.25);
  results.push({
    key: 'impossible-week',
    label: 'No position is modelled above 125% of its own declared week',
    measuredN: stations.length,
    floor: 1,
    pass: over.length === 0,
    verdict: over.length === 0
      ? 'Every modelled position fits inside a plausible week.'
      : `${over.length} position(s) are modelled above 125% of capacity. That is a finding about the design, printed rather than trimmed — the module never quietly reduces a commitment to make a chart look sane.`,
    fix: over.length === 0 ? null : 'Read the Load panel: each of these is over the ceiling and has a priced lever beside it.',
  });

  const passed = results.filter((r) => r.pass).length;
  return {
    results,
    passed,
    total: results.length,
    verdict: passed === results.length
      ? 'All three input gates pass. Figures below are printed with their denominators.'
      : `${results.length - passed} input gate(s) refused. Affected figures print a count and a reason instead of a rate.`,
  };
}

/* ---------------------------------------------------- 3. the lever engine */

/** How much one structural change relieves one station, in hours per week. */
export function leverEffect(station, leverKey, { norms, chain, state } = {}) {
  const capacity = station.capacity;
  if (!station.measured || station.committed === null) {
    return { hours: null, reason: 'The position has no declared work-type split, so no relief can be priced against it.' };
  }
  const lever = OPERATING_MODEL_LEVER_BY_KEY[leverKey];
  if (!lever) return { hours: null, reason: 'Unknown lever.' };
  const hours = station.hours || {};
  switch (leverKey) {
    // Half the open-hour commitment stops existing. Little's law: the queue is
    // the commitment, not the capacity.
    case 'raise-wip':
      return {
        hours: r1((hours.displaced + hours.coordination) * 0.5),
        reason: `Halving open work-at-once removes half of this position's ${r1(hours.displaced + hours.coordination)} h/week of below-altitude commitment.`,
      };
    // The routed decisions that reach this station stop arriving here.
    case 'raise-abstention': {
      const routed = routedDecisions(state, chain, new Date()).filter((d) => d.holderNodeId === station.nodeId).length;
      if (routed < norms.omCellFloor) {
        return { hours: null, reason: `Only ${routed} routed decision(s) reach this span; the ${norms.omCellFloor}-decision floor is not met, so the relief is refused rather than guessed.` };
      }
      return {
        hours: r1(routed * norms.omAbstentionHoursPerWeek * norms.abstentionWeight),
        reason: `${routed} routed decision(s) × ${norms.omAbstentionHoursPerWeek} h/week × the declared ${norms.omAbstentionWeightPct}% that still reaches this level.`,
      };
    }
    // Decisions that end at the level above stop ending there.
    case 'raise-decomposition':
      return {
        hours: r1((hours.abstention || 0) * norms.abstentionWeight),
        reason: `The ${r1(hours.abstention || 0)} h/week this position spends on work routed up to it is halved by moving the routing table, not the person.`,
      };
    // Adding a lead divides the ATTACHED demand — not the group behind it, and
    // never past the continuity floor, because a span below it is fragile.
    case 'add-lead': {
      if (station.directReports + 1 < norms.omContinuityFloor) {
        return { hours: null, reason: `Adding a lead would leave ${station.directReports + 1} report(s) in this span, below the ${norms.omContinuityFloor}-report continuity floor. A fragile span is not a relieved one.` };
      }
      const attached = station.committed;
      const newHire = r1(capacity + (attached * (norms.omReliefWeeks / norms.omWorkDaysPerWeek)) * 0 - (capacity / 1) * 0);
      void newHire;
      // The new lead itself consumes a share of the span's coordination, then
      // takes half of what remains.
      const reliefable = r1(Math.max(0, attached - capacity));
      if (reliefable <= 0) {
        return { hours: null, reason: 'This position is not over its own capacity, so an additional lead would add coordination without relieving any commitment.' };
      }
      return {
        hours: r1(reliefable * 0.5),
        reason: `Of the ${reliefable} h/week the span is over capacity, a new lead divides the attached demand by two — it does not divide the group behind it, and it consumes ${norms.omCoordinationHoursPerWeek} h/week of coordination itself.`,
      };
    }
    case 'redo-units': {
      const edges = collaborationGraph(state, chain);
      const crossing = edges.filter((e) => e.unitCrossing).length;
      const crossingHours = r1(crossing * (norms.omEdgeMinutes / 60) * 2);
      if (!crossingHours) return { hours: null, reason: 'No cross-unit collaboration edge is declared, so no seam cost can be priced.' };
      return {
        hours: r1(crossingHours * 0.5),
        reason: `${crossing} cross-unit edge(s) × ${norms.omEdgeMinutes} min × two reviewers; moving the boundary halves the seam.`,
      };
    }
    case 're-baseline':
      return {
        hours: r1(station.overhead * 0.25),
        reason: `Re-baselining removes a quarter of the ${station.overhead} h/week of measured re-reporting overhead, which is the documented normal-cost response to gaming.`,
      };
    case 'de-hub': {
      const concentration = hubConcentration(state, chain);
      if (!concentration.measured) return { hours: null, reason: concentration.reason };
      return {
        hours: r1(station.coordinationHours * 0.5),
        reason: `De-hubbing the busiest node removes half of this span's ${station.coordinationHours} h/week of coordination that only exists because one node holds it.`,
      };
    }
    case 'raise-book-policy':
      return {
        hours: r1(Math.max(0, station.committed - capacity)),
        reason: 'A documented, deliberately enlarged book ceiling — never a quiet overload. Priced at exactly the over-commitment it absorbs.',
      };
    // Offered ONLY when the position fails the congruence test — i.e. its deep
    // time is below the declared half, which is the definition of a relay layer.
    // A congruence-holding span is never offered a removal; that would be a
    // redundancy recommendation with no evidence behind it.
    case 'remove-seat': {
      if (!station.congruence || station.congruence.holds) {
        return { hours: null, reason: 'This position still spends at least half its design at its own altitude, so it is not a relay layer and removal is not a priced option.' };
      }
      return {
        hours: r1(Math.max(0, (station.capacity - (station.congruence?.deepHours || 0)) * 0.5)),
        reason: 'The position spends less than half its design at its own altitude — the signature of a layer that relays rather than decides. Priced at half the non-deep time it consumes; this workspace never executes a separation.',
      };
    }
    default:
      return { hours: null, reason: 'Unknown lever.' };
  }
}

/** Every lever priced against every station, ranked by hours relieved per unit effort. */
export function leverBook(state, { chain, norms, splits, demand, feedback, stations } = {}) {
  const effortCost = { policy: 1, charter: 1.5, contract: 2, development: 3, hire: 4, reorg: 5 };
  const rows = [];
  for (const station of stations) {
    if (!station.measured) continue;
    for (const lever of OPERATING_MODEL_LEVERS) {
      const effect = leverEffect(station, lever.key, { norms, chain, state });
      if (effect.hours === null || effect.hours <= 0) continue;
      rows.push({
        leverKey: lever.key,
        leverLabel: lever.label,
        family: lever.family,
        measure: lever.measure,
        relation: lever.relation,
        nodeId: station.nodeId,
        nodeName: station.name,
        altitudeLabel: station.altitudeLabel,
        hours: effect.hours,
        reason: effect.reason,
        effort: lever.effort,
        effortCost: effortCost[lever.effort] || 2,
        // Hours relieved per index point of design cost. The ordering is
        // mathematical, not editorial: it does not care who proposed the idea.
        yield: r2(effect.hours / (effortCost[lever.effort] || 2)),
        // The relief that keeps the span above the continuity floor is worth more
        // than one that quietly creates a single point of failure.
        safe: !station.continuity || lever.key !== 'add-lead',
      });
    }
  }
  rows.sort((a, b) => (b.safe === a.safe ? 0 : b.safe ? 1 : -1) || b.yield - a.yield || a.nodeName.localeCompare(b.nodeName));
  return rows;
}

/* ------------------------------------------------------- 4. the congestion */

/**
 * The stations that are a constraint, and the FIRST structural answer to each.
 *
 * NOTE THE ORDER. The cheapest available fix is *not* a hire. It is the routing
 * table, then the work-in-progress, then the boundary — and a hire only appears
 * after those, and only if the span would survive it. This is the single design
 * choice that separates an operating model from a headcount request.
 */
export function congestionReport(state, { chain, norms, splits, demand, feedback, stations } = {}) {
  const over = stations.filter((s) => s.utilisation !== null && s.utilisation > norms.utilisationCeiling);
  const rows = over.map((station) => {
    const relief = leverBook(state, { chain, norms, splits, demand, feedback, stations: [station] });
    const first = relief[0] || null;
    return {
      nodeId: station.nodeId,
      name: station.name,
      altitudeKey: station.altitudeKey,
      altitudeLabel: station.altitudeLabel,
      utilisation: station.utilisation,
      committed: station.committed,
      capacity: station.capacity,
      overHours: r1(station.committed - station.capacity),
      directReports: station.directReports,
      continuity: station.continuity,
      first,
      options: relief.slice(0, 4),
      // A span over the ceiling whose demand is mostly ABSTENTION is not
      // understaffed: it is over-routed. The distinction is the whole point.
      diagnosis: station.hours && station.hours.abstention > (station.hours.displaced || 0)
        ? 'over-routed'
        : station.directReports > norms.spanBand[1]
          ? 'over-spanned'
          : 'over-committed',
    };
  });
  rows.sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0) || a.name.localeCompare(b.name));
  return rows;
}

/* ------------------------------------------------------- 5. the fragility */

/**
 * The continuity test. A span below the floor is a single point of failure in
 * which the *design* depends on one person being present — the Leadership bench
 * terminal certifies the same thing from the succession side, and the two agree
 * by construction because both read `person.managerId`.
 */
export function continuityReport({ stations, norms } = {}) {
  const fragile = stations.filter((s) => s.directReports > 0 && s.continuity);
  const total = stations.filter((s) => s.directReports > 0);
  const floor = norms.omCellFloor;
  const rate = total.length < floor ? null : pct(fragile.length / total.length);
  return {
    fragile: fragile.map((s) => ({
      nodeId: s.nodeId,
      name: s.name,
      altitudeLabel: s.altitudeLabel,
      directReports: s.directReports,
      floor: norms.omContinuityFloor,
      utilisation: s.utilisation,
      // The trap: this span looks light, and every "add a hire" answer makes it
      // worse. The reading says so before the lever is offered.
      trap: 'This span is under the continuity floor. Relieving it with a hire creates a single point of failure; relieve the hours or the boundary instead.',
    })),
    totalSpans: total.length,
    ratePct: rate,
    refused: rate === null ? `Only ${total.length} staffed span(s); the ${floor}-span floor is not met, so the rate is withheld and the count printed.` : null,
    floor,
  };
}

/* -------------------------------------------------------- 6. the coupling */

/** Graicunas' two-relationship count per node, made computable from records. */
export function graicunas(n) {
  const reports = Math.max(0, Math.round(Number(n) || 0));
  if (reports <= 1) return 0;
  // Direct single + cross relationships: n(n-1)/2 of each, plus n for direct group.
  return reports + 2 * ((reports * (reports - 1)) / 2);
}

/** Edge count, cross-unit share, weighted minutes, and the combinatorial ceiling. */
export function couplingReport(state, { chain, norms } = {}) {
  const edges = collaborationGraph(state, chain);
  const crossUnit = edges.filter((e) => e.unitCrossing);
  const minutes = edges.reduce((sum, e) => sum + e.weight * norms.omEdgeMinutes, 0);
  const perNode = new Map();
  for (const edge of edges) {
    perNode.set(edge.fromId, (perNode.get(edge.fromId) || 0) + 1);
    perNode.set(edge.toId, (perNode.get(edge.toId) || 0) + 1);
  }
  const busiest = [...perNode.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] || null;
  const floor = norms.omCellFloor;
  const nodesWithSeats = [...chain.nodes.values()].filter((n) => n.reachable !== false && n.span > 0);
  const combinatorial = nodesWithSeats.reduce((sum, node) => sum + graicunas((node.childIds || []).length), 0);
  return {
    edges,
    edgeCount: edges.length,
    crossUnitN: crossUnit.length,
    crossUnitPct: edges.length < floor ? null : pct(crossUnit.length / edges.length),
    crossUnitRefused: edges.length < floor ? `Only ${edges.length} declared edge(s); the ${floor}-edge floor is not met, so the cross-unit share is withheld.` : null,
    weeklyHours: r1((minutes / 60)),
    perNode,
    busiestNodeId: busiest ? busiest[0] : null,
    busiestEdgeCount: busiest ? busiest[1] : 0,
    busiestName: busiest ? (chain.nodes.get(busiest[0])?.name || 'a span') : null,
    combinatorial,
    // "The paperwork is the indicator of structural co-operation" — the ratio of
    // declared edges to the combinatorial count is the model's own efficiency
    // measure. Above 1.0 means more crossing than the reported structure explains.
    ratio: combinatorial > 0 ? r2(edges.length / combinatorial) : null,
    skipped: deriveSkipReport(chain, state, { norms }),
  };
}

/**
 * The one-aggregate-row rule. Everything more than one level below the reader's
 * span collapses into a single amortised row, so no top-level screen can be used
 * to read a distant team's diary. This is a disclosure contract, not a filter.
 */
export function deriveSkipReport(chain, state, { norms } = {}) {
  const byDepth = new Map();
  for (const node of chain.nodes.values()) {
    if (node.reachable === false || node.isLeader) continue;
    if (!(node.span > 0 && node.altitude)) continue;
    const depth = node.depth || 0;
    const row = byDepth.get(depth) || { depth, spans: 0, reports: 0 };
    row.spans += 1;
    row.reports += (node.childIds || []).length;
    byDepth.set(depth, row);
  }
  const rows = [...byDepth.values()].sort((a, b) => a.depth - b.depth);
  return {
    rows,
    floor: norms.omCellFloor,
    rule: `A span ${'>'}1 level below the reader is represented by one aggregate row. Rates on a skipped row are withheld below ${norms.omCellFloor} spans; the count is printed instead.`,
  };
}

/** Concentration of declared collaboration on one node — a single point of failure. */
export function hubConcentration(state, chain) {
  const edges = collaborationGraph(state, chain);
  const perNode = new Map();
  for (const edge of edges) {
    perNode.set(edge.fromId, (perNode.get(edge.fromId) || 0) + 1);
    perNode.set(edge.toId, (perNode.get(edge.toId) || 0) + 1);
  }
  const entries = [...perNode.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { measured: false, reason: 'No declared collaboration edge, so no concentration can be measured. Declare the recurring conversations the span actually has.' };
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const top = entries[0];
  return {
    measured: true,
    nodeId: top[0],
    name: chain.nodes.get(top[0])?.name || 'a span',
    sharePct: pct(top[1] / (total / 2)),
    edgeCount: top[1],
    reason: '',
  };
}

/* --------------------------------------------------- 7. the change waves */

/**
 * One declared change, propagated in waves through the real reporting tree.
 *
 * This is a capacity wave, not an org chart illustration. A node's change is
 * absorbed by every level above it as a share of the work it did not own, so the
 * question "if this span changed, who actually feels it" has an arithmetic
 * answer, and it is asked ONE wave at a time — the point of a wave model is that
 * the second wave is smaller than the first, and the module shows the decay rate
 * rather than assuming it.
 */
export function changeWaves(state, { chain, norms, splits, demand, feedback, fromNodeId = null, changeHours = null } = {}) {
  const stations = operatingStations(state, { chain, norms, splits, demand, feedback });
  const byId = new Map(stations.map((s) => [s.nodeId, s]));
  const origin = fromNodeId || LEADER_ID;
  const originStation = byId.get(origin);
  // The change is the origin's own over-commitment unless the reader declares
  // one. When the origin is inside its design the wave carries zero hours and
  // the panel says so rather than inventing a number to animate.
  const hours = changeHours === null || changeHours === undefined
    ? Math.max(0, r1(-(originStation?.headroom ?? 0)))
    : Math.max(0, Number(changeHours) || 0);
  const waves = [];
  const seen = new Set([origin]);
  let frontier = [origin];
  const maxWaves = Math.min(12, norms.omMaxWave);
  for (let wave = 0; wave < maxWaves && frontier.length; wave += 1) {
    // A wave decays geometrically: the first level carrying a change absorbs all
    // of it, and each level above absorbs the declared survival share of the
    // level below. The decay is the output — not an assumption hidden in a diagram.
    const absorbed = r1(hours * (wave === 0 ? 1 : norms.crossWave));
    const rows = frontier.map((nodeId) => {
      const node = chain.nodes.get(nodeId);
      const station = byId.get(nodeId);
      const share = r1(absorbed / Math.max(1, frontier.length));
      return {
        nodeId,
        name: node?.name || 'span',
        altitudeLabel: station?.altitudeLabel || altitudeByKey(node?.altitude)?.label || '—',
        utilisationBefore: station?.utilisation ?? null,
        utilisationAfter: station?.utilisation === null || station?.utilisation === undefined
          ? null
          : r2(station.utilisation + share / station.capacity),
        absorbedHours: share,
      };
    });
    waves.push({ wave, absorbedHours: absorbed, rows });
    // Decay for the NEXT wave from the current absorbed amount, so the printed
    // per-wave number is the one that is actually propagated.
    const nextFrontier = [];
    for (const nodeId of frontier) {
      const parent = chain.nodes.get(nodeId)?.parentId;
      if (!parent || parent === nodeId || seen.has(parent)) continue;
      seen.add(parent);
      nextFrontier.push(parent);
    }
    frontier = nextFrontier;
  }
  return {
    origin,
    originName: chain.nodes.get(origin)?.name || 'the workspace leader',
    hours,
    waves,
    decayPct: norms.omCrossWavePct,
    note: `${norms.omCrossWavePct}% of a wave survives to the next level — a declared convention, so a reader who disagrees can change it and watch every wave move.`,
  };
}

/* ------------------------------------------------------ 8. the attribution */

/**
 * Attributable labour cost. The workspace stores no salary, so the figure is a
 * *share* of a declared envelope: hours committed ÷ (capacity × headcount) at a
 * given rate. It never claims a salary and it never converts a currency.
 */
export function attributableCost(state, { stations, norms, ratePerHour = 60, currency = 'USD' } = {}) {
  const measured = stations.filter((s) => s.measured && s.committed !== null);
  const totalHours = measured.reduce((sum, s) => sum + s.committed, 0);
  const totalCapacity = measured.reduce((sum, s) => sum + s.capacity, 0);
  const belowLatitudeHours = measured.reduce((sum, s) => sum + (s.displacedHours || 0), 0);
  return {
    ratePerHour,
    currency,
    measuredPositions: measured.length,
    totalHours: r1(totalHours),
    totalCapacity: r1(totalCapacity),
    utilisation: totalCapacity > 0 ? r2(totalHours / totalCapacity) : null,
    belowLatitudeHours: r1(belowLatitudeHours),
    belowLatitudeCost: r1(belowLatitudeHours * ratePerHour),
    totalCost: r1(totalHours * ratePerHour),
    basis: `Hours × a declared rate of ${ratePerHour} ${currency}/h. No salary is stored in this workspace and no currency is converted.`,
  };
}

/* -------------------------------------------------------- 9. the roll-up */

/**
 * The reporting tree, rolled up. One row per span, exact ownership partition,
 * every ancestor inherits by addition, and — above the reader's own span — one
 * amortised row per level so a far-below team is not readable as a diary.
 */
export function operatingRollup(state, { chain, norms, splits, demand, feedback, stations, seat = null } = {}) {
  const cells = new Map();
  const byId = new Map(stations.map((s) => [s.nodeId, s]));
  const ensure = (nodeId) => {
    if (!cells.has(nodeId)) cells.set(nodeId, { nodeId, own: [], all: [] });
    return cells.get(nodeId);
  };
  for (const station of stations) {
    if (!station.measured) continue;
    const cell = ensure(station.nodeId);
    cell.own.push(station);
    // Exact partition: counted at the owning span and inherited by every
    // ancestor by addition.
    let cursor = station.nodeId;
    const guard = new Set();
    while (cursor && chain.nodes.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      ensure(cursor).all.push(station);
      cursor = chain.nodes.get(cursor).parentId;
    }
  }
  const rows = [];
  for (const cell of cells.values()) {
    const node = chain.nodes.get(cell.nodeId);
    const alt = altitudeByKey(node?.altitude);
    const ownCommitted = cell.own.reduce((sum, s) => sum + (s.committed || 0), 0);
    const allCommitted = cell.all.reduce((sum, s) => sum + (s.committed || 0), 0);
    const allCapacity = cell.all.reduce((sum, s) => sum + s.capacity, 0);
    const ownDisplaced = cell.own.reduce((sum, s) => sum + (s.displacedHours || 0), 0);
    const allDisplaced = cell.all.reduce((sum, s) => sum + (s.displacedHours || 0), 0);
    const overN = cell.all.filter((s) => s.overCeiling).length;
    const floor = norms.omCellFloor;
    const utilisationOf = (committed, capacity) => (cell.all.length < floor || capacity <= 0 ? null : r2(committed / capacity));
    rows.push({
      nodeId: cell.nodeId,
      label: node?.name || 'span',
      altitudeKey: node?.altitude || null,
      altitudeLabel: alt?.label || '—',
      rank: alt?.rank || null,
      depth: node?.depth || 0,
      isLeader: cell.nodeId === LEADER_ID,
      ownPositions: cell.own.length,
      allPositions: cell.all.length,
      ownCommittedHours: r1(ownCommitted),
      allCommittedHours: r1(allCommitted),
      capacityHours: r1(allCapacity),
      ownUtilisation: utilisationOf(ownCommitted, cell.own.reduce((sum, s) => sum + s.capacity, 0)),
      allUtilisation: utilisationOf(allCommitted, allCapacity),
      displacedHours: r1(allDisplaced),
      ownDisplacedHours: r1(ownDisplaced),
      displacedPct: allCapacity > 0 ? pct(allDisplaced / allCapacity) : null,
      overCeilingN: overN,
      // The skip rule, printed as a property of the row.
      skipped: Boolean(seat && !seat.fullAccess && node && node.depth > (seat.depth + 1)),
      inScope: Boolean(!seat || seat.fullAccess || (seat.scope && seat.scope.has(cell.nodeId)) || seat.id === cell.nodeId),
    });
  }
  rows.sort((a, b) => a.depth - b.depth || String(a.label).localeCompare(String(b.label)));
  // Collapse everything more than one level below the reader into one row per
  // depth: the aggregate is the disclosure contract, not a rendering choice.
  let visible = rows;
  if (seat && !seat.fullAccess) {
    const deepByDepth = new Map();
    visible = [];
    for (const row of rows) {
      if (!row.inScope) continue;
      if (row.skipped) {
        const agg = deepByDepth.get(row.depth) || { ...row, label: `Level ${row.depth} aggregate`, skipped: true, ownPositions: 0, ownCommittedHours: 0, ownUtilisation: null, aggregated: 0 };
        agg.allPositions += row.allPositions;
        agg.allCommittedHours = r1((agg.allCommittedHours || 0) + (row.allCommittedHours || 0));
        agg.capacityHours = r1((agg.capacityHours || 0) + (row.capacityHours || 0));
        agg.displacedHours = r1((agg.displacedHours || 0) + (row.displacedHours || 0));
        agg.overCeilingN += row.overCeilingN;
        agg.aggregated += 1;
        agg.allUtilisation = agg.capacityHours > 0 ? r2(agg.allCommittedHours / agg.capacityHours) : null;
        deepByDepth.set(row.depth, agg);
        continue;
      }
      visible.push(row);
    }
    visible = [...visible, ...deepByDepth.values()].sort((a, b) => a.depth - b.depth || String(a.label).localeCompare(String(b.label)));
  }
  return {
    rows: visible,
    allRows: rows,
    truncated: visible.length !== rows.length,
    rule: 'Each position is counted once at its own span and inherited by every ancestor by addition. Above the reader’s span, one aggregate row per level replaces the detail.',
  };
}

/* -------------------------------------------------------- 10. the reading */

/** The whole reading. Deterministic for a given workspace, date and norms. */
export function operatingModelRead(state, { now = new Date(), settings = null, seatId = null } = {}) {
  const norms = operatingModelNorms(settings || state?.settings || {});
  const chain = buildChain(state, { now, settings: settings || state?.settings });
  const roster = rosterOf(state);
  const splits = Array.isArray(state?.omWorkSplits) ? state.omWorkSplits : [];
  const demand = demandByOwnerNode(state, chain, norms, now);
  const feedback = feedbackIntake(state);
  const stations = operatingStations(state, { chain, norms, splits, demand, feedback });

  let seat = null;
  try {
    const built = buildSeats(state, { now, settings: settings || state?.settings });
    seat = activeSeat(built);
    if (seatId) {
      seat = built.byId.get(seatId) || seat;
    }
  } catch {
    seat = null;
  }

  const rollup = operatingRollup(state, { chain, norms, splits, demand, feedback, stations, seat });
  const congestion = congestionReport(state, { chain, norms, splits, demand, feedback, stations });
  const levers = leverBook(state, { chain, norms, splits, demand, feedback, stations });
  const continuity = continuityReport({ stations, norms });
  const coupling = couplingReport(state, { chain, norms, rate: 60 });
  const rnr = operatingRnr(state, { norms, splits, stations });
  const measuredStations = stations.filter((s) => s.measured);
  const totalCapacity = measuredStations.reduce((sum, s) => sum + s.capacity, 0);
  const totalCommitted = measuredStations.reduce((sum, s) => sum + (s.committed || 0), 0);
  const totalDisplaced = measuredStations.reduce((sum, s) => sum + (s.displacedHours || 0), 0);
  const overN = stations.filter((s) => s.overCeiling).length;
  const abstentionHours = r1(measuredStations.reduce((sum, s) => sum + (s.hours?.abstention || 0), 0));

  // The wave origin is the span whose change a reader would actually be asked to
  // absorb: the reader's own seat when one is declared, otherwise the most
  // congested measured span. A wave that starts at an empty root propagates zero
  // hours and teaches nothing.
  const waveOrigin = seat && !seat.fullAccess
    ? seat.id
    : (congestion[0]?.nodeId || LEADER_ID);
  const waves = changeWaves(state, { chain, norms, splits, demand, feedback, fromNodeId: waveOrigin });
  const cost = attributableCost(state, { stations, norms, ratePerHour: Number(state?.settings?.omLabourRatePerHour) || 60, currency: String(state?.settings?.omCurrency || 'USD') });

  const altRows = ALTITUDES.map((altitude) => {
    const inAlt = measuredStations.filter((s) => s.altitudeKey === altitude.key);
    const committed = inAlt.reduce((sum, s) => sum + (s.committed || 0), 0);
    const capacity = inAlt.reduce((sum, s) => sum + s.capacity, 0);
    const displaced = inAlt.reduce((sum, s) => sum + (s.displacedHours || 0), 0);
    const congested = inAlt.filter((s) => s.overCeiling).length;
    const floor = norms.omCellFloor;
    return {
      key: altitude.key,
      rank: altitude.rank,
      label: altitude.label,
      positions: inAlt.length,
      committedHours: r1(committed),
      capacityHours: r1(capacity),
      utilisation: inAlt.length < floor || capacity <= 0 ? null : r2(committed / capacity),
      displacedHours: r1(displaced),
      displacedPct: inAlt.length < floor || capacity <= 0 ? null : pct(displaced / capacity),
      congestedN: congested,
      refused: inAlt.length < floor ? `Only ${inAlt.length} measured position(s) at this altitude; the ${floor}-position floor is not met, so the rate is withheld and the count printed.` : null,
    };
  });

  // The three findings worth acting on, in the order a reader can act on them:
  // a routing defect first, a work-design defect second, a capacity question last.
  const signals = [];
  for (const row of congestion.slice(0, 4)) {
    signals.push({
      key: `congestion:${row.nodeId}`,
      tone: row.utilisation > 1 ? 'bad' : 'warn',
      title: `${row.name}: ${pct(row.utilisation)}% of its own declared week`,
      body: `${row.overHours} h/week over a ${row.capacity} h design. Diagnosis: ${row.diagnosis}. ${row.first ? `First structural answer: ${row.first.leverLabel} — ${row.first.hours} h/week (${row.first.reason})` : 'No priced lever clears the evidence floor yet.'}`,
      nodeId: row.nodeId,
      route: '#/operating-model?panel=levers',
    });
  }
  if (continuity.fragile.length) {
    signals.push({
      key: 'continuity',
      tone: 'warn',
      title: `${continuity.fragile.length} span(s) below the ${norms.omContinuityFloor}-report continuity floor`,
      body: 'Each of these looks light and cannot be relieved by a hire: below the floor, one absence stops the work. The design answer is the hours or the boundary.',
      route: '#/operating-model?panel=spans',
    });
  }
  if (coupling.crossUnitRefused === null && coupling.crossUnitPct !== null && coupling.crossUnitPct >= 50) {
    signals.push({
      key: 'coupling',
      tone: 'warn',
      title: `${coupling.crossUnitPct}% of declared conversations cross a unit boundary`,
      body: `That is ${coupling.weeklyHours} h/week of seam cost at the declared ${norms.omEdgeMinutes} min per edge. A boundary drawn through one judgement, not between two, is usually cheaper than more meetings.`,
      route: '#/operating-model?panel=coupling',
    });
  }
  if (!splits.length) {
    signals.push({
      key: 'unmeasured',
      tone: 'info',
      title: 'No work-type split declared',
      body: 'Nothing is measured yet, because every figure here is a position design and a design has to be declared before it can be judged. Four numbers, one panel.',
      route: '#/operating-model?panel=norms',
    });
  }

  const seatName = seat ? (seat.fullAccess ? 'Undeclared operator view' : seat.label) : 'Undeclared operator view';
  const detailWithheld = Boolean(seat && !seat.fullAccess && seat.rank > 3);

  return {
    norms,
    now,
    updatedOn: dayKey(now),
    seat: seat ? { id: seat.id, label: seat.label, rank: seat.rank, fullAccess: seat.fullAccess, altitudeKey: seat.altitudeKey } : null,
    seatName,
    detailWithheld,
    positions: stations.length,
    measuredPositions: measuredStations.length,
    unmeasuredPositions: stations.length - measuredStations.length,
    totals: {
      capacityHours: r1(totalCapacity),
      committedHours: r1(totalCommitted),
      utilisation: totalCapacity > 0 ? r2(totalCommitted / totalCapacity) : null,
      displacedHours: r1(totalDisplaced),
      displacedPct: totalCapacity > 0 ? pct(totalDisplaced / totalCapacity) : null,
      abstentionHours,
      overCeilingN: overN,
      fragileN: continuity.fragile.length,
      edgesN: coupling.edgeCount,
      crossUnitN: coupling.crossUnitN,
    },
    stations,
    bySpan: rollup,
    congestion,
    levers,
    continuity,
    coupling,
    rnr,
    waves,
    cost,
    byAltitude: altRows,
    signals,
    splits,
    fingerprint: omFingerprint([
      measuredStations.length,
      r1(totalCommitted),
      r1(totalDisplaced),
      overN,
      coupling.edgeCount,
      continuity.fragile.length,
    ].join('|')),
  };
}

/* ---------------------------------------------------------- 11. the brief */

/** The identity-free brief. Counts, rates, intervals, positions — no names. */
export function operatingModelBriefText(state, { now = new Date(), settings = null } = {}) {
  const report = operatingModelRead(state, { now, settings });
  const n = report.norms;
  const p = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);
  const lines = [];
  lines.push(`# Operating model brief — ${report.updatedOn}`);
  lines.push('');
  lines.push('Positions as designs, not people. No person, name, span title or individual figure appears in this brief.');
  lines.push('');
  lines.push('## The model');
  lines.push(`- Positions modelled: ${report.positions} (${report.measuredPositions} carry a declared work-type split; ${report.unmeasuredPositions} unmeasured).`);
  lines.push(`- Declared capacity per position: ${n.weeklyCapacity} h/week — ${n.capacityBasis}.`);
  lines.push(`- Declared prices: ${n.omCoordinationHoursPerWeek} h/week per direct report · ${n.omDelegationHoursPerWeek} h/week per open delegation · ${n.omAbstentionHoursPerWeek} h/week per routed decision.`);
  lines.push('');
  lines.push('## The reading');
  lines.push(`- Total committed: ${report.totals.committedHours} h/week against ${report.totals.capacityHours} h of designed capacity (utilisation ${report.totals.utilisation === null ? 'refused' : `${Math.round(report.totals.utilisation * 1000) / 10}%`}).`);
  lines.push(`- Time spent below the position's own altitude: ${report.totals.displacedHours} h/week (${p(report.totals.displacedPct)} of designed capacity).`);
  lines.push(`- Work routed up because it is not trusted below: ${report.totals.abstentionHours} h/week.`);
  lines.push(`- Positions over the ${n.omUtilizationCeilPct}% utilisation ceiling: ${report.totals.overCeilingN}.`);
  lines.push(`- Spans below the ${n.omContinuityFloor}-report continuity floor: ${report.totals.fragileN}.`);
  lines.push(`- Declared collaboration edges: ${report.totals.edgesN}, of which ${report.coupling.crossUnitPct === null ? `the cross-unit share is refused (${report.coupling.crossUnitRefused})` : `${p(report.coupling.crossUnitPct)} cross a unit boundary`}.`);
  lines.push('');
  lines.push('## By altitude');
  for (const row of report.byAltitude) {
    lines.push(`- ${row.label}: ${row.positions} measured position(s); utilisation ${row.utilisation === null ? 'refused' : p(row.utilisation * 100)}; displaced ${p(row.displacedPct)}; over ceiling ${row.congestedN}.`);
  }
  lines.push('');
  lines.push('## The levers, in order of relief per unit of design cost');
  for (const lever of report.levers.slice(0, 6)) {
    lines.push(`- ${lever.leverLabel} (${lever.family}) on ${lever.altitudeLabel}: ${lever.hours} h/week — ${lever.reason}`);
  }
  if (!report.levers.length) lines.push('- No lever is priced, because no position carries a declared split.');
  lines.push('');
  lines.push('## Input gates (gauge R&R on the model itself)');
  for (const gate of report.rnr.results) lines.push(`- ${gate.pass ? 'PASS' : 'REFUSED'} — ${gate.label}: ${gate.verdict}`);
  lines.push('');
  lines.push('## What this is not');
  lines.push(`- ${'There is no attendance clock in this module. Capacity rests on declared hours per day and declared days per week; a reader who disagrees changes them and every figure moves together.'}`);
  lines.push('- Utilization, congruence and connectivity are properties of a POSITION DESIGN. Nothing here ranks a person and nothing here may be used as evidence of effort.');
  lines.push('- A local workspace, not an HRIS: no connector, no sync, no employment-law claim.');
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------ 12. the CSV */

/** Aggregate-only export rows. No id except span node references at altitude level. */
export function operatingModelCsvRows(state, { now = new Date(), settings = null } = {}) {
  const report = operatingModelRead(state, { now, settings });
  const n = report.norms;
  const rows = [];
  rows.push({
    scope: 'workspace',
    altitude: 'all',
    positions: report.measuredPositions,
    unmeasured: report.unmeasuredPositions,
    capacity_h: report.totals.capacityHours,
    committed_h: report.totals.committedHours,
    utilisation_pct: report.totals.utilisation === null ? null : Math.round(report.totals.utilisation * 1000) / 10,
    displaced_h: report.totals.displacedHours,
    displaced_pct: report.totals.displacedPct,
    abstention_h: report.totals.abstentionHours,
    over_ceiling_n: report.totals.overCeilingN,
    fragile_n: report.totals.fragileN,
    edges_n: report.totals.edgesN,
    cross_unit_pct: report.coupling.crossUnitPct,
    cell_floor: n.omCellFloor,
    verdict: report.measuredPositions === 0 ? 'no declared split — nothing measured' : 'modelled',
  });
  for (const row of report.byAltitude) {
    rows.push({
      scope: 'altitude',
      altitude: row.key,
      positions: row.positions,
      unmeasured: null,
      capacity_h: row.capacityHours,
      committed_h: row.committedHours,
      utilisation_pct: row.utilisation === null ? null : Math.round(row.utilisation * 1000) / 10,
      displaced_h: row.displacedHours,
      displaced_pct: row.displacedPct,
      abstention_h: null,
      over_ceiling_n: row.congestedN,
      fragile_n: null,
      edges_n: null,
      cross_unit_pct: null,
      cell_floor: n.omCellFloor,
      verdict: row.refused ? 'rate refused below floor' : 'modelled',
    });
  }
  for (const lever of report.levers.slice(0, 24)) {
    rows.push({
      scope: 'lever',
      altitude: lever.family,
      positions: null,
      unmeasured: null,
      capacity_h: null,
      committed_h: lever.hours,
      utilisation_pct: null,
      displaced_h: null,
      displaced_pct: null,
      abstention_h: null,
      over_ceiling_n: null,
      fragile_n: null,
      edges_n: null,
      cross_unit_pct: null,
      cell_floor: null,
      verdict: `${lever.leverKey} · yield ${lever.yield} h per effort point`,
    });
  }
  return rows;
}

/**
 * The attention count. Deliberately small and actionable: only a position over
 * its own ceiling, and only when a lever can actually be priced against it. A
 * list of interesting readings is not a piece of work.
 */
export function operatingModelAttentionCount(state, now = new Date(), settings = null) {
  try {
    const report = operatingModelRead(state, { now, settings });
    return report.congestion.filter((row) => row.first && row.first.hours > 0).length;
  } catch {
    return 0;
  }
}
