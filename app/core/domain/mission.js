/**
 * Mission Control read model (ADR-0080). Pure, scoped and additive.
 * Frameworks: Jaques' time-span of discretion; FMEA severity as a triage input;
 * PDCA / assumption-based planning through existing Action Bundles; primary and
 * complementary small-cell suppression. No person is scored or ranked.
 */
import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canSee, recordPeople } from './seat.js';
import { harvestWork, responsibleNodeId, LEADER_ID } from './chain.js';
import { bundleExecution, executionSummary, executionOwnerNodeId } from './execution.js';
import { SIGNAL_SOURCES } from './chainRegistry.js';
import { fingerprint } from './actionBundles.js';
import { BUNDLE_ADAPTERS } from './actionBundleRegistry.js';
import { MISSION_DISCLOSURE, MISSION_LIMITS, MISSION_VERSION, missionProfile } from './missionRegistry.js';
import { normalizeMissionSettings } from './missionSchema.js';
import { capturesForSeat } from './missionCapture.js';
import { discoverMergeCandidates } from './missionCaptureMerge.js';
// ADR-0107: the Outcome Learning Loop is another dimension of the SAME
// vertical partition, not a second roll-up engine.
import { buildOutcomeReport } from './outcomeLearning.js';

export const exact = (n) => ({ lower: n, upper: n });
export function displayBound(b) {
  if (!b || b.lower === null || b.upper === null) return 'Withheld';
  return b.lower === b.upper ? String(b.lower) : `${b.lower}–${b.upper}`;
}
const sumBounds = (rows, key) => rows.reduce((a, r) => ({ lower: a.lower + r[key].lower, upper: a.upper + r[key].upper }), exact(0));
const metrics = (rows) => ({ open: exact(rows.length), overdue: exact(rows.filter((r) => r.overdueDays > 0).length), horizonDebt: exact(rows.filter((r) => r.requiredRank > r.ownerRank).length) });

/** Nearest selected ancestor partitions work exactly once, including LCA work. */
export function itemsInScope(items, seat) {
  return items.filter((item) => item.ownerNodeId === seat.id || seat.scope.has(item.ownerNodeId));
}
function childPartition(items, seat, built, floor, detail) {
  const groups = seat.childSeatIds.map((id) => {
    const child = built.byId.get(id);
    return { key: id, label: child?.label ? `${child.label} span` : 'Child span', seatId: id, rows: items.filter((i) => i.ownerNodeId === id || child?.scope.has(i.ownerNodeId)) };
  });
  groups.push({ key: '__direct__', label: 'Work owned at this altitude', seatId: null, rows: items.filter((i) => i.ownerNodeId === seat.id) });
  // At individual-detail altitudes, exact work counts are operational facts,
  // not a population statistic. Above them, never publish a small cell.
  const suppressed = new Set(detail ? [] : groups.filter((g) => g.rows.length < floor).map((g) => g.key));
  let secondary = null;
  if (!detail && suppressed.size === 1) {
    const candidate = groups.filter((g) => !suppressed.has(g.key)).sort((a, b) => a.rows.length - b.rows.length || a.key.localeCompare(b.key))[0];
    if (candidate) { suppressed.add(candidate.key); secondary = candidate.key; }
  }
  const cells = groups.map((g) => {
    const m = metrics(g.rows); const hidden = suppressed.has(g.key);
    return { key: g.key, label: g.label, seatId: g.seatId,
      open: hidden ? { lower: 0, upper: g.key === secondary ? g.rows.length : floor - 1 } : m.open,
      overdue: hidden ? { lower: 0, upper: g.key === secondary ? m.overdue.upper : floor - 1 } : m.overdue,
      horizonDebt: hidden ? { lower: 0, upper: g.key === secondary ? m.horizonDebt.upper : floor - 1 } : m.horizonDebt,
      suppressed: hidden, secondary: g.key === secondary,
      reason: hidden ? (g.key === secondary ? 'Complementary suppression: this second cell prevents subtracting the other visible cells from a parent total.' : `Small-cell suppression: fewer than ${floor} observations. Exact count and rate withheld.`) : '' };
  });
  // Never publish an exact parent total when a child is hidden. This closes
  // parent-minus-siblings differencing as well as sibling-only differencing.
  return { cells, totals: { open: sumBounds(cells, 'open'), overdue: sumBounds(cells, 'overdue'), horizonDebt: sumBounds(cells, 'horizonDebt') }, suppressedN: suppressed.size, secondary };
}

/**
 * A conservative, hierarchical disclosure envelope. This is not a claim of
 * differential privacy: changing one record can change a bound. It protects
 * exact small-cell counts within this release, not every auxiliary-data attack.
 */
export function suppressHierarchy(items, seat, built, { floor = 5, detail = false } = {}) {
  const rows = itemsInScope(items, seat);
  const partition = childPartition(rows, seat, built, floor, detail);
  const sources = SIGNAL_SOURCES.map((source) => {
    const count = rows.filter((r) => r.type === source.key).length;
    const hidden = !detail && count > 0 && count < floor;
    return { key: source.key, label: source.label, count: hidden ? { lower: 0, upper: floor - 1 } : exact(count), suppressed: hidden };
  }).filter((s) => s.count.upper > 0);
  // Source totals also need a complement: a single hidden source could be
  // recovered from an exact total and all the other source counts.
  if (sources.some((s) => s.suppressed)) {
    const exactTotal = rows.length;
    partition.totals.open = { lower: Math.min(...sources.map((s) => s.count.lower)), upper: Math.max(partition.totals.open.upper, exactTotal) };
    for (const source of sources) {
      if (!source.suppressed) source.count = { lower: 0, upper: source.count.upper };
    }
  }
  return { ...partition, sources, exactInternal: metrics(rows), floor,
    method: detail ? 'Exact operational counts inside the permitted individual-detail span.' : 'Primary + complementary suppression; interval parent totals prevent simple differencing. Not differential privacy.' };
}

function triage(item, horizon) {
  const agePressure = Math.min(2, item.ageDays / Math.max(1, horizon));
  const score = Math.round((item.severity / 3) * 35 + agePressure * 20 + (item.overdueDays > 0 ? 25 : 0) + (item.requiredRank > item.ownerRank ? 20 : 0));
  const reasons = [item.overdueDays > 0 ? `${item.overdueDays}d past a recorded date` : null,
    item.requiredRank > item.ownerRank ? 'Older than its owner’s decision horizon' : null,
    item.severity >= 3 ? 'Highest recorded severity band' : null].filter(Boolean);
  return { ...item, triageScore: Math.min(100, score), reasons };
}

function safeItem(item, rank) {
  const detail = rank <= 2;
  return { id: item.entityId, type: item.type, label: item.typeLabel,
    title: detail ? item.title : item.typeLabel, route: detail ? item.route : '#/mission?panel=hierarchy',
    ageDays: item.ageDays, dueOn: detail ? item.dueOn : null, overdueDays: item.overdueDays,
    ownerNodeId: item.ownerNodeId, requiredRank: item.requiredRank, triageScore: item.triageScore,
    reasons: item.reasons, detail, sensitive: item.sensitive };
}
function sourceRecord(state, item) {
  const source = SIGNAL_SOURCES.find((s) => s.key === item.type);
  return source?.collection ? (state[source.collection] || []).find((r) => r.id === item.entityId) : null;
}

export function buildMission(state, { now = new Date(), seatId = null } = {}) {
  const built = buildSeats(state, { now, settings: state.settings });
  const acting = activeSeat(built);
  let seat = acting;
  if (seatId && seatId !== acting.id) {
    const target = built.byId.get(seatId);
    if (!target) return { ok: false, error: 'That span is not a leadership seat in this roster.' };
    let ancestor = false; let cursor = acting.parentId; let guard = 0;
    while (cursor && guard < 64) { if (cursor === seatId) { ancestor = true; break; } cursor = built.chain.nodes.get(cursor)?.parentId || null; guard += 1; }
    if (!acting.fullAccess && !acting.descendantSeatIds.includes(seatId) && !ancestor) return { ok: false, error: 'That span is outside the operating seat. Drill-up/down is allowed; sideways access is not.' };
    seat = target;
  }
  if (seat.readOnly) return { ok: false, error: 'Declare a valid operating seat before reading work.' };
  const rank = seat.rank || 5;
  const profile = missionProfile(rank);
  // Individual detail follows the ACTING seat, and only downward/own span.
  // Drilling up never grants peer detail; drilling down never grants a senior
  // seat the junior altitude's individual-detail ceiling.
  const detail = acting.fullAccess || (acting.rank <= 2 && (seat.id === acting.id || acting.descendantSeatIds.includes(seat.id)));
  const all = harvestWork(state, built.chain, { now, settings: state.settings });
  const scoped = itemsInScope(all, seat);
  // Ownership is the sole partition key. An LCA-owned cross-team item belongs
  // to the common leader, never once to every child mentioned by the item.
  const fullHierarchy = suppressHierarchy(all, seat, built, { floor: normalizeMissionSettings(state.settings).missionCellFloor, detail });
  // Exact internal counts are never returned above the individual-detail boundary.
  const hierarchy = { ...fullHierarchy };
  if (!detail) delete hierarchy.exactInternal;
  const queue = scoped.map((i) => triage(i, seat.horizonDays || profile.reviewDays)).sort((a, b) => b.triageScore - a.triageScore || b.ageDays - a.ageDays || String(a.entityId).localeCompare(String(b.entityId)))
    .slice(0, MISSION_LIMITS.queue).map((i) => safeItem(i, detail ? rank : 3));
  const eligibleCases = (state.cases || []).filter((c) => ['open', 'mitigating', 'monitoring'].includes(c.status) && scoped.some((i) => i.type === 'case' && i.entityId === c.id && (detail ? canSee(c, 'cases', acting, built).allow === 'full' : seat.id === acting.id && i.ownerNodeId === acting.id && !i.sensitive)))
    .map((c) => ({ id: c.id, title: c.title, ownerId: c.ownerId, reviewOn: c.reviewOn, currency: c.financial?.currency || 'USD', mitigationCost: c.financial?.mitigationCost || 0 }));
  const owners = (state.people || []).filter((p) => p.status !== 'archived' && seat.scope.has(p.id) && (detail || built.nodeIndex.has(p.id)))
    .map((p) => ({ id: p.id, name: detail || built.nodeIndex.has(p.id) ? p.name : 'Team member', role: p.role }));
  const budgets = acting.rank >= 4 && rank >= 4 ? (state.budgets || []).filter((b) => b.status === 'active' && (b.ownerId ? seat.scope.has(b.ownerId) : seat.isLeader))
    .map((b) => ({ id: b.id, label: b.label || b.name || 'Budget envelope', currency: b.currency, ownerId: b.ownerId })) : [];
  const bundles = (state.actionBundles || []).filter((b) => {
    const c = (state.cases || []).find((r) => r.id === b.sourceId);
    if (!c || canSee(c, 'cases', acting, built).allow === 'denied') return false;
    // A resolved case leaves the OPEN-work harvest, but its execution loop must
    // remain visible until the evidence closes it. Ownership, not open status,
    // is the scope key for bundles (same LCA partition as the chain).
    const ownerNodeId = executionOwnerNodeId(c, built);
    return ownerNodeId === seat.id || seat.scope.has(ownerNodeId);
  }).map((b) => ({ id: b.id, name: detail ? b.name : 'Cross-module intervention', status: b.status, reviewOn: b.reviewOn,
    sourceId: b.sourceId, commands: b.commands.map((c) => ({ kind: c.kind, title: detail ? c.title : c.kind })),
    preview: b.preview, actual: b.actual, outputsN: b.outputs?.length || 0, baseRevision: b.baseRevision, evaluatedAt: b.evaluatedAt,
    stale: ['draft', 'rehearsed'].includes(b.status) && (b.baseRevision !== state.meta?.revision || b.evaluatedAt?.slice(0, 10) !== dayKey(now)),
    due: b.status === 'committed' && b.reviewOn <= dayKey(now), executionState: b.status === 'committed' ? bundleExecution(state, b, now)?.state || null : null }));
  // ADR-0106: execution loops roll up on the SAME ownership partition as work.
  // Senior seats receive suppression-safe bounds, never a loop title or proof id.
  const executionRows = (state.actionBundles || []).filter((b) => bundles.some((x) => x.id === b.id)).map((b) => ({ bundle: b, execution: bundleExecution(state, b, now) })).filter((r) => r.execution);
  const loopItems = executionRows.map(({ bundle, execution }) => {
    const source = (state.cases || []).find((c) => c.id === bundle.sourceId);
    const ownerNodeId = executionOwnerNodeId(source, built);
    const opened = bundle.committedAt?.slice(0, 10) || dayKey(now);
    return { type: 'execution-loop', entityId: bundle.id, ownerNodeId, ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(opened)) / 86400000)),
      overdueDays: execution.state !== 'closed' && bundle.reviewOn < dayKey(now) ? Math.max(0, Math.floor((now.getTime() - Date.parse(bundle.reviewOn)) / 86400000)) : 0,
      requiredRank: seat.rank, ownerRank: seat.rank, sensitive: false };
  });
  const executionHierarchy = suppressHierarchy(loopItems, seat, built, { floor: normalizeMissionSettings(state.settings).missionCellFloor, detail });
  const execution = { detail, summary: detail ? executionSummary(executionRows.map((r) => r.execution)) : null, hierarchy: executionHierarchy,
    loops: detail ? executionRows.map(({ bundle, execution }) => ({ id: bundle.id, name: bundle.name, reviewOn: bundle.reviewOn, sourceId: bundle.sourceId, ...execution })) : [],
    method: executionHierarchy.method };
  const briefs = acting.rank >= 4 ? (state.missionBriefs || []).filter((b) => b.seatId === seat.id || seat.scope.has(b.seatId)) : [];
  const outcome = buildOutcomeReport(state, { now, seatId: seat.id, settings: state.settings });
  return { ok: true, version: MISSION_VERSION, seat: { id: seat.id, name: seat.name, label: seat.label, rank, altitudeKey: seat.altitudeKey,
    horizonDays: seat.horizonDays, parentId: built.byId.has(seat.parentId) ? seat.parentId : null, isLeader: seat.isLeader },
    captures: seat.id === acting.id ? capturesForSeat(state, acting.id, { now }) : [],
    mergeCandidates: seat.id === acting.id ? discoverMergeCandidates(state, acting, built, { now }) : [],
    actingSeatId: acting.id, enforced: !acting.fullAccess, profile, hierarchy, execution, queue, owners, eligibleCases, budgets, bundles, briefs, outcome,
    revision: state.meta?.revision || 0, unassigned: scoped.filter((i) => !i.people.length).length,
    observedPeople: seat.scopeN, disclosure: MISSION_DISCLOSURE,
    limitations: [MISSION_DISCLOSURE.aggregate, MISSION_DISCLOSURE.brief, MISSION_DISCLOSURE.local],
    generatedAt: now.toISOString(), reviewOn: addDays(dayKey(now), profile.reviewDays),
  };
}

/** Proposed commands are rank-filtered before they reach the existing registry. */
export function missionCommandKinds(rank) { return missionProfile(rank).commands; }
export function validateMissionCommands(commands, rank) {
  const allowed = missionCommandKinds(rank);
  return commands.every((c) => allowed.includes(c.kind) && BUNDLE_ADAPTERS[c.kind])
    ? { ok: true } : { ok: false, error: 'This intervention contains an action outside the operating altitude’s duties.' };
}

export function missionBriefSnapshot(state, mission, now = new Date()) {
  const h = mission.hierarchy;
  const commitments = new Map();
  for (const b of state.budgets || []) {
    if (!mission.budgets.some((r) => r.id === b.id)) continue;
    const row = commitments.get(b.currency) || { currency: b.currency, committed: 0, actual: 0 };
    for (const line of b.lines || []) {
      if (['planned', 'committed'].includes(line.status)) row.committed += line.committedAmount || 0;
      if (line.status === 'spent') row.actual += line.actualAmount || 0;
    }
    commitments.set(row.currency, row);
  }
  const snapshot = { seatId: mission.seat.id, rank: mission.seat.rank, altitude: mission.seat.altitudeKey,
    createdAt: now.toISOString(), reviewOn: addDays(dayKey(now), mission.profile.reviewDays), sourceRevision: state.meta.revision,
    cellFloor: h.floor, open: h.totals.open, overdue: h.totals.overdue, horizonDebt: h.totals.horizonDebt,
    cells: h.cells.map((c) => ({ key: c.key, label: c.label, seatId: c.seatId, open: c.open, overdue: c.overdue, horizonDebt: c.horizonDebt, suppressed: c.suppressed, reason: c.reason })),
    sources: h.sources.map((s) => ({ key: s.key, label: s.label, count: s.count })),
    observedPeople: mission.observedPeople, unassigned: mission.unassigned,
    commitments: [...commitments.values()], limitations: mission.limitations };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}
export function missionBriefText(brief) {
  return [
    '# LeadOS · Enterprise mission brief', `Frozen: ${brief.createdAt}`, `Scope: ${brief.altitude} / ${brief.seatId}`, `Next review: ${brief.reviewOn}`,
    `Source revision: ${brief.sourceRevision} · Evidence fingerprint: ${brief.fingerprint}`, '',
    '## Recorded position', `- Open work: ${displayBound(brief.open)}`, `- Past a recorded date: ${displayBound(brief.overdue)}`, `- Beyond the owner’s horizon: ${displayBound(brief.horizonDebt)}`,
    '', '## Span composition', ...brief.cells.map((c) => `- ${c.label}: ${displayBound(c.open)} open; ${displayBound(c.overdue)} overdue${c.suppressed ? ' (withheld)' : ''}`),
    '', '## Work sources', ...brief.sources.map((s) => `- ${s.label}: ${displayBound(s.count)}`),
    '', '## Financial commitments (not a valuation)', ...(brief.commitments.length ? brief.commitments.map((m) => `- ${m.currency}: ${m.committed.toLocaleString('en-US')} open commitments; ${m.actual.toLocaleString('en-US')} recorded actuals. Currencies are not converted.`) : ['No eligible active budget envelope. No financial exposure is inferred.']),
    '', '## Decision required', 'Review the bounded work and choose whether to maintain, revise or stop the current commitments. This brief does not choose on your behalf.',
    '', '## Evidence and limits', ...brief.limitations.map((s) => `- ${s}`),
  ].join('\n');
}
export function missionAttentionCount(state, now = new Date()) {
  const r = buildMission(state, { now });
  return r.ok ? r.bundles.filter((b) => b.stale || b.due).length : 0;
}
