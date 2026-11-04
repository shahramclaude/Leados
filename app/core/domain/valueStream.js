/**
 * Pure Value Stream Exchange read models: peer SLA health, Critical Path
 * Method, cross-altitude roll-up and aggregate-only export/brief projections.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats } from './seat.js';
import { ALTITUDES, altitudeRank } from './chainRegistry.js';
import { LEADER_ID } from './chain.js';
import { normalizeValueStreamSettings } from './valueStreamSchema.js';
import {
  VALUE_STREAM_ACTIVE_STATUSES,
  VALUE_STREAM_ALTITUDE_PLAYBOOK,
  VALUE_STREAM_ENGINE_VERSION,
} from './valueStreamRegistry.js';

const r1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;

/** SLA comparison is explicit about direction; unknown actuals stay unknown. */
export function valueStreamTargetMet(contract) {
  if (!contract || contract.actual === null || contract.actual === undefined || contract.target === null) return null;
  return contract.direction === 'at-most' ? contract.actual <= contract.target : contract.actual >= contract.target;
}
export function valueStreamServiceState(contract, today = dayKey(new Date())) {
  if (!contract) return 'unknown';
  if (contract.status === 'settled') return contract.settlementOutcome;
  if (contract.status === 'withdrawn') return 'withdrawn';
  const met = valueStreamTargetMet(contract);
  if (met === null) return 'unmeasured';
  if (met) return 'met';
  if (contract.status === 'agreed' && contract.dueOn && contract.dueOn < today) return 'breached';
  return contract.status === 'agreed' ? 'open' : 'negotiating';
}

/**
 * Kelley–Walker Critical Path Method over supplier→consumer edges. Longest
 * lead-time path, zero/nonzero slack and downstream blast radius are exact on
 * a DAG. Cyclic hand-offs refuse a critical-path number instead of looping or
 * printing a confident fiction.
 */
export function buildValueStreamNetwork(input = []) {
  const edges = (Array.isArray(input) ? input : []).filter((e) => e && e.id && e.supplierSeatId && e.consumerSeatId
    && e.supplierSeatId !== e.consumerSeatId && Number.isFinite(Number(e.leadTimeDays)) && Number(e.leadTimeDays) > 0)
    .map((e) => ({ ...e, leadTimeDays: Number(e.leadTimeDays) }));
  const nodes = [...new Set(edges.flatMap((e) => [e.supplierSeatId, e.consumerSeatId]))].sort();
  const outgoing = new Map(nodes.map((n) => [n, []]));
  const incoming = new Map(nodes.map((n) => [n, []]));
  for (const edge of edges) {
    outgoing.get(edge.supplierSeatId).push(edge);
    incoming.get(edge.consumerSeatId).push(edge);
  }
  const indegree = new Map(nodes.map((n) => [n, incoming.get(n).length]));
  const queue = nodes.filter((n) => indegree.get(n) === 0).sort();
  const topo = [];
  while (queue.length) {
    const node = queue.shift(); topo.push(node);
    for (const edge of outgoing.get(node).slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const next = edge.consumerSeatId;
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) { queue.push(next); queue.sort(); }
    }
  }
  const cycleDetected = topo.length !== nodes.length;
  const downstream = new Map();
  for (const edge of edges) {
    const seenEdges = new Set(); const seenNodes = new Set(); const stack = [edge.consumerSeatId];
    while (stack.length) {
      const node = stack.shift();
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);
      for (const next of outgoing.get(node) || []) {
        if (!seenEdges.has(next.id)) { seenEdges.add(next.id); stack.push(next.consumerSeatId); }
      }
    }
    downstream.set(edge.id, [...seenEdges].sort());
  }
  if (cycleDetected) {
    return {
      nodes: nodes.map((id) => ({ id })), cycleDetected, criticalPathDays: null,
      criticalPathContractIds: [], refusal: 'A supplier–consumer cycle was detected; critical path and slack are [UNVERIFIED] until the cycle is resolved.',
      edges: edges.map((e) => ({ ...e, slackDays: null, downstreamContractIds: downstream.get(e.id) || [] })),
    };
  }
  const earliest = new Map(nodes.map((n) => [n, 0]));
  const predecessor = new Map();
  for (const node of topo) {
    for (const edge of outgoing.get(node).slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const candidate = earliest.get(node) + edge.leadTimeDays;
      if (candidate > earliest.get(edge.consumerSeatId)) {
        earliest.set(edge.consumerSeatId, candidate);
        predecessor.set(edge.consumerSeatId, edge);
      }
    }
  }
  const criticalPathDays = nodes.length ? Math.max(...earliest.values()) : 0;
  const end = nodes.filter((n) => earliest.get(n) === criticalPathDays).sort()[0] || null;
  const criticalPathContractIds = [];
  let cursor = end; const guard = new Set();
  while (cursor && predecessor.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor); const edge = predecessor.get(cursor);
    criticalPathContractIds.unshift(edge.id); cursor = edge.supplierSeatId;
  }
  const longestFrom = new Map(nodes.map((n) => [n, 0]));
  for (const node of [...topo].reverse()) {
    let longest = 0;
    for (const edge of outgoing.get(node)) longest = Math.max(longest, edge.leadTimeDays + longestFrom.get(edge.consumerSeatId));
    longestFrom.set(node, longest);
  }
  return {
    nodes: nodes.map((id) => ({ id })), cycleDetected, criticalPathDays, criticalPathContractIds, refusal: null,
    edges: edges.map((e) => ({
      ...e,
      earliestStartDays: earliest.get(e.supplierSeatId),
      slackDays: r1(criticalPathDays - (earliest.get(e.supplierSeatId) + e.leadTimeDays + longestFrom.get(e.consumerSeatId))),
      downstreamContractIds: downstream.get(e.id) || [],
    })),
  };
}

function ancestorIds(built, start) {
  const out = []; const seen = new Set(); let cursor = start; let guard = 0;
  while (cursor && cursor !== LEADER_ID && !seen.has(cursor) && guard++ < 64) {
    out.push(cursor); seen.add(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
  }
  return out;
}

/**
 * Build one report from the same contracts for every altitude. Party/LCA
 * membership is the explicit sideways exception; ordinary subtree scope and
 * executive small-cell suppression remain fail-closed.
 */
export function buildValueStreamReport(state = {}, { now = new Date(), settings = null } = {}) {
  const today = dayKey(now);
  const conv = normalizeValueStreamSettings(settings || state.settings || {});
  const built = buildSeats(state, { now, settings: state.settings || {} });
  const seat = activeSeat(built);
  const scoped = !seat.fullAccess;
  const people = new Map((state.people || []).map((p) => [p.id, p]));
  const all = Array.isArray(state.valueStreamContracts) ? state.valueStreamContracts : [];
  const inSubtree = (c) => !scoped || (!seat.readOnly && [c.supplierSeatId, c.consumerSeatId].every((id) => id === seat.id || seat.scope.has(id)));
  const exactParty = (c) => scoped && !seat.readOnly && [c.supplierSeatId, c.consumerSeatId, c.mediatorSeatId].includes(seat.id);
  // Party/LCA membership is an explicit reviewed exception to sideways
  // isolation; it must be included BEFORE the full/aggregate projection.
  const aggregateContracts = all.filter((c) => inSubtree(c) || exactParty(c));
  const fullContracts = !scoped ? all : aggregateContracts.filter((c) => exactParty(c) || seat.rank <= 3);
  const fullIds = new Set(fullContracts.map((c) => c.id));
  const detailWithheld = scoped && seat.rank >= 4 && fullContracts.length < aggregateContracts.length;
  const label = (id, allowName = true) => {
    if (id === LEADER_ID) return 'Enterprise root';
    const node = built.byId.get(id); const person = people.get(id);
    if (!allowName || (scoped && seat.rank >= 4 && !exactParty({ supplierSeatId: id, consumerSeatId: id, mediatorSeatId: seat.id }))) {
      return node ? `${node.shortLabel} span` : 'Withheld span';
    }
    return person ? `${person.name}${person.role ? ` · ${person.role}` : ''}` : (node?.name || id);
  };
  const contracts = fullContracts.map((c) => ({
    ...c,
    serviceState: valueStreamServiceState(c, today), targetMet: valueStreamTargetMet(c),
    supplierLabel: label(c.supplierSeatId), consumerLabel: label(c.consumerSeatId), mediatorLabel: label(c.mediatorSeatId),
    rounds: (state.valueStreamRounds || []).filter((r) => r.contractId === c.id)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.createdAt.localeCompare(b.createdAt)),
  }));
  const activeAnalysis = aggregateContracts.filter((c) => VALUE_STREAM_ACTIVE_STATUSES.includes(c.status));
  const agreedAnalysis = aggregateContracts.filter((c) => c.status === 'agreed');
  const rawNetwork = buildValueStreamNetwork(agreedAnalysis);
  const network = {
    ...rawNetwork,
    nodes: rawNetwork.nodes.map((n) => ({ ...n, label: detailWithheld ? 'Aggregate span' : label(n.id) })),
    edges: rawNetwork.edges.map((e) => ({
      ...e, supplierLabel: detailWithheld ? 'Aggregate supplier' : label(e.supplierSeatId),
      consumerLabel: detailWithheld ? 'Aggregate consumer' : label(e.consumerSeatId),
      serviceState: valueStreamServiceState(e, today),
    })),
  };
  if (detailWithheld && agreedAnalysis.length < conv.valueStreamCellFloor) {
    network.criticalPathDays = null; network.criticalPathContractIds = [];
    network.refusal = `Critical path withheld below the aggregate cell floor n=${conv.valueStreamCellFloor}; no small-cell route is exposed.`;
    network.edges = [];
  } else if (detailWithheld) {
    network.criticalPathContractIds = [];
    network.edges = network.edges.map((e) => ({ ...e, id: null, supplierSeatId: null, consumerSeatId: null, downstreamContractIds: [] }));
  }

  const rollMap = new Map();
  for (const c of aggregateContracts) {
    const targets = new Set([...ancestorIds(built, c.supplierSeatId), ...ancestorIds(built, c.consumerSeatId), c.mediatorSeatId]);
    for (const id of targets) {
      if (!id || (scoped && id !== seat.id && !seat.scope.has(id) && !ancestorIds(built, seat.id).includes(id))) continue;
      if (!rollMap.has(id)) rollMap.set(id, new Set());
      rollMap.get(id).add(c.id);
    }
  }
  let spanRollup = [...rollMap.entries()].map(([id, ids]) => {
    const rows = aggregateContracts.filter((c) => ids.has(c.id));
    const node = built.byId.get(id);
    return {
      seatId: id, label: label(id, !detailWithheld), altitudeKey: node?.altitudeKey || null,
      rank: node?.rank || altitudeRank(node?.altitudeKey), contractCount: rows.length,
      activeCount: rows.filter((c) => VALUE_STREAM_ACTIVE_STATUSES.includes(c.status)).length,
      breachedCount: rows.filter((c) => valueStreamServiceState(c, today) === 'breached').length,
      effortDays: r1(rows.reduce((s, c) => s + (c.effortDays || 0), 0)),
    };
  }).sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
  if (detailWithheld) {
    spanRollup = spanRollup.map((row) => {
      const small = row.contractCount > 0 && row.contractCount < conv.valueStreamCellFloor;
      return { ...row, seatId: null, label: row.altitudeKey ? `${row.altitudeKey} aggregate` : 'Aggregate span',
        contractCount: small ? null : row.contractCount, activeCount: small ? null : row.activeCount,
        breachedCount: small ? null : row.breachedCount, effortDays: small ? null : row.effortDays, withheld: small };
    });
  }
  const active = activeAnalysis.length;
  const openNegotiations = activeAnalysis.filter((c) => ['proposed', 'countered'].includes(c.status)).length;
  const breached = activeAnalysis.filter((c) => valueStreamServiceState(c, today) === 'breached').length;
  const suppress = detailWithheld && [active, openNegotiations, breached].some((n) => n > 0 && n < conv.valueStreamCellFloor);
  const totals = {
    active: suppress ? null : active,
    openNegotiations: suppress ? null : openNegotiations,
    breached: suppress ? null : breached,
    settled: suppress ? null : aggregateContracts.filter((c) => c.status === 'settled').length,
  };
  const relatedSeatIds = (r) => [r.createdBySeatId, r.mediatorSeatId, r.targetSeatId,
    ...r.sourceLines.map((line) => state.catchballPacts?.find((p) => p.id === line.sourcePactId)?.toSeatId)].filter(Boolean);
  const reallocations = (state.valueStreamReallocations || []).filter((r) => !scoped || (!seat.readOnly
    && ([r.createdBySeatId, r.mediatorSeatId].includes(seat.id) || (seat.rank <= 3 && relatedSeatIds(r).every((id) => id === seat.id || seat.scope.has(id))))));
  const withheldCount = Math.max(0, aggregateContracts.length - fullContracts.length);
  return {
    engineVersion: VALUE_STREAM_ENGINE_VERSION, today, conventions: conv,
    seat: { id: seat.id, label: seat.label, shortLabel: seat.shortLabel, altitudeKey: seat.altitudeKey,
      rank: seat.rank, horizonDays: seat.horizonDays, fullAccess: seat.fullAccess, readOnly: Boolean(seat.readOnly) },
    playbook: VALUE_STREAM_ALTITUDE_PLAYBOOK, scoped, detailWithheld,
    disclosureMode: !scoped ? 'operator' : detailWithheld ? 'aggregate' : seat.rank === 3 ? 'unit' : 'party',
    contracts, fullContractIds: [...fullIds], network, spanRollup, totals, reallocations,
    withheldCount: detailWithheld ? null : withheldCount,
    withheldReason: detailWithheld ? `Executive roll-up: item bodies and cells below n=${conv.valueStreamCellFloor} are withheld. Exact terms remain available to the two parties and their named LCA mediator.` : null,
  };
}

/** Aggregate-only CSV rows; no title, person name, note, or small-cell count. */
export function valueStreamCsvRows(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildValueStreamReport(state, { now, settings });
  const floor = report.conventions.valueStreamCellFloor;
  const safe = (n) => Number.isFinite(n) && n >= floor ? n : null;
  const rows = [{
    row_kind: 'workspace', altitude: report.seat.altitudeKey || 'operator', status: report.disclosureMode,
    contract_n: report.detailWithheld ? null : safe(report.contracts.length),
    active_n: report.totals.active, breached_n: report.totals.breached,
    effort_days: report.detailWithheld ? null : r1(report.contracts.reduce((s, c) => s + (c.effortDays || 0), 0)),
    lead_time_days: null, critical_path_days: report.network.criticalPathDays,
    released_effort_days: null, released_budget_amount: null, currency: null,
    cell_floor: floor, verdict: report.network.refusal || (report.detailWithheld ? 'aggregate;small-cells-withheld' : 'evaluated'),
  }];
  for (const alt of ALTITUDES) {
    const cells = report.spanRollup.filter((r) => r.altitudeKey === alt.key);
    const n = cells.reduce((s, r) => s + (r.contractCount || 0), 0);
    rows.push({
      row_kind: 'altitude', altitude: alt.key, status: 'aggregate',
      contract_n: safe(n), active_n: safe(cells.reduce((s, r) => s + (r.activeCount || 0), 0)),
      breached_n: safe(cells.reduce((s, r) => s + (r.breachedCount || 0), 0)),
      effort_days: n >= floor ? r1(cells.reduce((s, r) => s + (r.effortDays || 0), 0)) : null,
      lead_time_days: null, critical_path_days: null,
      released_effort_days: null, released_budget_amount: null, currency: null,
      cell_floor: floor, verdict: n < floor ? 'withheld-below-floor' : 'evaluated',
    });
  }
  const reallocationN = report.reallocations.length;
  rows.push({
    row_kind: 'carryover', altitude: 'all', status: 'committed-receipts',
    contract_n: null, active_n: null, breached_n: null, effort_days: null, lead_time_days: null,
    critical_path_days: null,
    released_effort_days: reallocationN >= floor ? r1(report.reallocations.reduce((s, r) => s + r.releasedEffortDays, 0)) : null,
    released_budget_amount: reallocationN >= floor ? r1(report.reallocations.reduce((s, r) => s + r.releasedBudgetAmount, 0)) : null,
    currency: reallocationN >= floor && new Set(report.reallocations.map((r) => r.currency)).size === 1 ? report.reallocations[0]?.currency || null : null,
    cell_floor: floor, verdict: reallocationN < floor ? 'withheld-below-floor' : `${reallocationN} receipt(s);actual-spend-unchanged`,
  });
  return rows;
}

export function valueStreamAttentionCount(state = {}, now = new Date(), settings = null) {
  if (!Array.isArray(state?.valueStreamContracts) || !state.valueStreamContracts.length) return 0;
  const r = buildValueStreamReport(state, { now, settings });
  // Suppressed small cells do not become a reverse-engineerable badge count.
  return (r.totals.breached || 0) + (r.totals.openNegotiations || 0);
}

export function valueStreamBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildValueStreamReport(state, { now, settings });
  const n = (v) => v === null || v === undefined ? '[UNVERIFIED / WITHHELD]' : v;
  return [
    '# Value Stream Exchange — identity-free operating brief',
    '',
    `- Altitude: ${r.seat.label}; disclosure: ${r.disclosureMode}.`,
    `- Active supplier–customer contracts: ${n(r.totals.active)}; open negotiations: ${n(r.totals.openNegotiations)}; overdue SLA breaches: ${n(r.totals.breached)}.`,
    `- Agreed-network critical path: ${n(r.network.criticalPathDays)} day(s). ${r.network.refusal || 'CPM slack is calculated on the directed acyclic supplier→consumer graph.'}`,
    `- Committed carryover receipts in this scope: ${r.detailWithheld ? '[WITHHELD]' : r.reallocations.length}. Receipts release unspent committed authority, preserve settled grades and actual spend, and create proposed—not accepted—receiving pacts.`,
    '',
    'Boundary: local browser seats are disclosure/workflow boundaries, not authenticated multi-user security. No person is rated or ranked by this brief.',
  ].join('\n');
}
