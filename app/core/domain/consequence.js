/**
 * Consequence Lab (Schema v67, ADR-0056) — the cost and adjacency of ONE
 * unmade decision. Pure, local, deterministic; reads the existing typed graph,
 * censoring-aware survival curve and declared/derived delay prices. A graph
 * path is an association, NOT a causal path. Related costs are printed as
 * conditional ceilings, never added to the decision's expected cost.
 *
 * The main mathematical advance on the Cost of Waiting Terminal is the area
 * under the conditional Kaplan–Meier curve:
 *
 * E[weeks outstanding during next h weeks | open today]
 *   = (1/7) integral[0, 7h] S(age+t)/S(age) dt.
 *
 * The old endpoint-only price × h × P(still open at h) is a LOWER bound on
 * this area, not the expected carrying cost. We show both with an explicit
 * full-wait upper bound. The exact step integral is withheld below the class
 * evidence floors or beyond the last recorded observation; no invented tail.
 *
 * The reading freezes only a prospective still-open forecast and a bounded
 * aggregate adjacency snapshot. At review it is Brier-scored against an
 * observed decision date. Neither the graph nor the cost establishes that
 * deciding the root would have resolved any linked item.
 */

import { dayKey, round } from '../time.js';
import { resolveLinkedEntity, SYSTEM_GENERATED_LINK_RELATIONS } from './cases.js';
import { evaluatePremiseCore } from './premises.js';
import { waitCostReport } from './waitCost.js';
import { stillOpenProbability } from './waitCost.js';

export const CONSEQUENCE_ENGINE_VERSION = 'consequence-2026.10-v1';
export const CONSEQUENCE_DEFAULTS = Object.freeze({
  consequenceAutoPropagate: true,
  consequenceTriageWeekly: 1000,
  consequenceMaxLinks: 12,
  consequenceReviewCap: 60,
  consequenceMinExits: 3,
});
export const CONSEQUENCE_HORIZONS = Object.freeze([1, 2, 4]);
export const CONSEQUENCE_SIGNAL_IDS = Object.freeze({
  DUE: 'CSQ-01',
  MISS: 'CSQ-02',
  BASELINE: 'CSQ-03',
  ORPHAN: 'CSQ-04',
});

const GRAPH_TYPES = new Set([
  'case', 'decision', 'delegation', 'goal', 'portfolio', 'budget', 'premise',
  'dependency', 'stakeholder', 'change', 'negotiation', 'strategy', 'voi',
]);
// A person, candidate or feedback record is not an operational relay. These
// types never enter this graph: the terminal cannot turn private people data
// into a rank or let a person's many unrelated records cross-connect.
const RELAY_TYPES = new Set(['case', 'decision', 'delegation', 'goal', 'portfolio', 'budget', 'premise', 'dependency', 'change', 'negotiation', 'strategy', 'voi']);
const EXCLUDED_RELATIONS = new Set([
  ...SYSTEM_GENERATED_LINK_RELATIONS,
  'couples', 'shares-approver', 'forecasts', 'corroborates', 'scores', 'calibrates',
]);
const MAX_NODES = 64;
const MAX_GRAPH_EDGES = 2000;
const keyOf = (type, id) => `${type}:${id}`;
const isOpen = (decision) => Boolean(decision) && !String(decision.chosen || '').trim();

export function consequenceConventions(settings = {}) {
  const s = { ...CONSEQUENCE_DEFAULTS, ...settings };
  const clamp = (value, lo, hi, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
  };
  return {
    autoPropagate: s.consequenceAutoPropagate !== false,
    triageWeekly: clamp(s.consequenceTriageWeekly, 0, 1e12, 1000),
    maxLinks: clamp(s.consequenceMaxLinks, 1, 24, 12),
    reviewCap: clamp(s.consequenceReviewCap, 5, 60, 60),
    minExits: clamp(s.consequenceMinExits, 2, 20, 3),
  };
}

/**
 * Two-hop breadth-first traversal of *existing* typed, valid operational
 * edges. Paths remain directed in the evidence but traversal is symmetric:
 * links express a recorded relationship, not that the root causes its peer.
 * Stable ordering and a hard cap prevent import-size graphs blocking the UI.
 */
export function decisionBlastRadius(state, decisionId) {
  const root = resolveLinkedEntity(state, 'decision', decisionId);
  const empty = { nodes: [], direct: [], secondOrder: [], bridges: [], invalidEdges: 0, truncated: false, inspectedEdges: 0 };
  if (!root) return empty;
  const adjacency = new Map();
  let invalidEdges = 0;
  let inspectedEdges = 0;
  const links = Array.isArray(state?.links) ? state.links : [];
  for (const link of links) {
    if (inspectedEdges >= MAX_GRAPH_EDGES) break;
    inspectedEdges++;
    if (!link || !GRAPH_TYPES.has(link.sourceType) || !GRAPH_TYPES.has(link.targetType)
        || EXCLUDED_RELATIONS.has(link.relation) || !link.sourceId || !link.targetId) continue;
    // Index IDs first; resolve a record only when a root-reachable edge is
    // traversed. Resolving every edge in an import-size workspace would cost
    // O(all links × collection length) on the main thread, even when almost
    // none belong to this decision.
    const a = keyOf(link.sourceType, link.sourceId);
    const b = keyOf(link.targetType, link.targetId);
    if (a === b) continue;
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ key: b, relation: link.relation, direction: 'outgoing', type: link.targetType, id: link.targetId });
    adjacency.get(b).push({ key: a, relation: link.relation, direction: 'incoming', type: link.sourceType, id: link.sourceId });
  }
  for (const entries of adjacency.values()) {
    entries.sort((a, b) => a.key.localeCompare(b.key) || a.relation.localeCompare(b.relation));
  }
  const rootKey = keyOf('decision', decisionId);
  const visited = new Set([rootKey]);
  const queue = [{ key: rootKey, depth: 0, path: [] }];
  const nodes = [];
  let truncated = links.length > MAX_GRAPH_EDGES;
  while (queue.length) {
    const from = queue.shift();
    if (from.depth >= 2 || (from.depth > 0 && !RELAY_TYPES.has(from.key.split(':')[0]))) continue;
    for (const edge of adjacency.get(from.key) || []) {
      if (visited.has(edge.key)) continue;
      if (nodes.length >= MAX_NODES) { truncated = true; break; }
      const peer = resolveLinkedEntity(state, edge.type, edge.id);
      if (!peer) { invalidEdges++; continue; }
      visited.add(edge.key);
      const path = [...from.path, { relation: edge.relation, direction: edge.direction, type: peer.type, id: peer.id }];
      const node = { type: peer.type, id: peer.id, title: peer.title,
        route: peer.route, status: peer.status, raw: peer.raw,
        depth: from.depth + 1, path };
      nodes.push(node);
      queue.push({ key: edge.key, depth: node.depth, path });
    }
    if (truncated && nodes.length >= MAX_NODES) break;
  }
  const direct = nodes.filter((node) => node.depth === 1);
  const secondOrder = nodes.filter((node) => node.depth === 2);
  const bridges = direct.map((node) => ({
    type: node.type, id: node.id, title: node.title, route: node.route,
    secondOrder: secondOrder.filter((other) => other.path[0].type === node.type && other.path[0].id === node.id).length,
  })).filter((b) => b.secondOrder > 0).sort((a, b) => b.secondOrder - a.secondOrder || a.id.localeCompare(b.id));
  return { nodes, direct, secondOrder, bridges, invalidEdges, truncated, inspectedEdges };
}

/**
 * Exact area under the stepwise *conditional* KM curve. Assumes an item open
 * today and the class's observed exit pattern continues. No extra database
 * query, no sampling and no fractional-relaxation approximation. The endpoint
 * price×h×P(open at h) is a lower bound on expected carrying cost, because
 * S(t) is nonincreasing. Fails closed if evidence or tail is insufficient.
 */
export function integrateConditionalSurvival(curve, ageDays, horizonDays, minAtRisk = 4, minExits = 3) {
  if (!curve?.steps?.length || typeof curve.survivalAt !== 'function') {
    return { available: false, reason: 'no dated exits for this class' };
  }
  if (!Number.isFinite(ageDays) || ageDays < 0 || !Number.isInteger(horizonDays)
      || horizonDays < 1 || horizonDays > 182) {
    return { available: false, reason: 'a dated start and a horizon of 1–182 days are required' };
  }
  if (curve.events < minExits) {
    return { available: false, reason: `${curve.events} recorded exit(s), below the ${minExits}-exit floor` };
  }
  const endpoint = stillOpenProbability(curve, ageDays, horizonDays, minAtRisk);
  if (!endpoint.available) return { available: false, reason: endpoint.reason, atRisk: endpoint.atRisk ?? null };
  if (endpoint.beyondEvidence) {
    return { available: false, reason: endpoint.reason, atRisk: endpoint.atRisk ?? null, beyondEvidence: true };
  }
  const base = curve.survivalAt(ageDays);
  const boundaries = [ageDays,
    ...curve.steps.filter((step) => step.events > 0 && step.time > ageDays && step.time < ageDays + horizonDays).map((step) => step.time),
    ageDays + horizonDays];
  let areaDays = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    areaDays += (boundaries[i + 1] - boundaries[i]) * curve.survivalAt(boundaries[i]) / base;
  }
  const expectedWeeks = areaDays / 7;
  const fullWeeks = horizonDays / 7;
  return {
    available: true,
    probability: endpoint.probability,
    probabilityPct: endpoint.probabilityPct,
    atRisk: endpoint.atRisk,
    exits: curve.events,
    expectedWeeks: round(expectedWeeks, 4),
    // Retain full precision for money arithmetic; 4dp is only a display value.
    expectedWeeksRaw: expectedWeeks,
    endpointLowerWeeks: round(fullWeeks * endpoint.probability, 4),
    endpointLowerWeeksRaw: fullWeeks * endpoint.probability,
    fullWeeks: round(fullWeeks, 4),
    // Invariant asserted by test: endpoint lower <= area <= full wait.
    boundHolds: expectedWeeks + 1e-9 >= fullWeeks * endpoint.probability && expectedWeeks <= fullWeeks + 1e-9,
  };
}

function relatedPriceBuckets(graph, wait, rootId, weeks) {
  const relatedKeys = new Set(graph.nodes.map((node) => keyOf(node.type, node.id)));
  const byCurrency = new Map();
  let unpriced = 0;
  let priced = 0;
  for (const row of wait.rows) {
    if (row.item.sourceType === 'decision' && row.item.sourceId === rootId) continue;
    if (!relatedKeys.has(keyOf(row.item.sourceType, row.item.sourceId))) continue;
    if (!row.price.priced) { unpriced++; continue; }
    priced++;
    const cur = row.price.currency;
    if (!byCurrency.has(cur)) byCurrency.set(cur, { currency: cur, items: 0, weekly: 0, fullWaitCeiling: 0 });
    const b = byCurrency.get(cur);
    b.items++;
    b.weekly = round(b.weekly + row.price.weeklyAmount, 2);
    b.fullWaitCeiling = round(b.weekly * weeks, 2);
  }
  return { buckets: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)), priced, unpriced };
}

function readFootprint(state, graph, now) {
  const premises = graph.nodes.filter((n) => n.type === 'premise').map((n) => ({
    id: n.id, title: n.title, route: n.route, depth: n.depth,
    reading: evaluatePremiseCore(n.raw, { now, settings: state.settings || {} }),
  }));
  const fragile = premises.filter((p) => ['breached', 'watch'].includes(p.reading.status));
  const dependencies = graph.nodes.filter((n) => n.type === 'dependency').map((n) => ({
    id: n.id, title: n.title, route: n.route, depth: n.depth,
    // A missing TTS is unknown, NOT zero survival time. Number(null) is 0;
    // coercing it would manufacture a continuity shortfall.
    tts: n.raw?.ttsDays != null && n.raw.ttsDays !== '' && Number.isFinite(Number(n.raw.ttsDays)) ? Number(n.raw.ttsDays) : null,
    ttr: n.raw?.ttrDays != null && n.raw.ttrDays !== '' && Number.isFinite(Number(n.raw.ttrDays)) ? Number(n.raw.ttrDays) : null,
  }));
  const shortfalls = dependencies.filter((d) => d.tts !== null && d.ttr !== null && d.ttr > d.tts);
  // No stakeholder stance or veto state is copied into a frozen reading or an
  // automation event: redacted exports must not recover those assessments.
  const stakeholders = graph.nodes.filter((n) => n.type === 'stakeholder');
  const coupled = graph.nodes.filter((n) => n.type === 'decision' && isOpen(n.raw));
  const directTypes = [...new Set(graph.direct.map((n) => n.type))];
  const secondTypes = [...new Set(graph.secondOrder.map((n) => n.type))];
  return { premises, fragile, dependencies, shortfalls, stakeholderCount: stakeholders.length,
    coupled, directTypes, secondTypes };
}

function costScenario(row, weeks, minExits, minAtRisk) {
  const price = row?.price || null;
  const days = weeks * 7;
  const area = row ? integrateConditionalSurvival(row.klass?.curve, row.item?.elapsedDays, days, minAtRisk, minExits)
    : { available: false, reason: 'the decision has no dated start' };
  const ceiling = price?.priced ? round(price.weeklyAmount * weeks, 2) : null;
  return {
    weeks, area,
    price: price?.priced ? { weeklyAmount: price.weeklyAmount, currency: price.currency, source: price.source } : null,
    // The ceiling is NOT an estimate and does not require a survival curve.
    fullWaitCeiling: ceiling,
    expectedCost: ceiling !== null && area.available ? round(price.weeklyAmount * area.expectedWeeksRaw, 2) : null,
    endpointLowerCost: ceiling !== null && area.available ? round(price.weeklyAmount * area.endpointLowerWeeksRaw, 2) : null,
    reason: !price?.priced ? 'unpriced — not zero' : area.available ? '' : area.reason,
  };
}

/** One decision's live reading, or a safe null when no open decision exists. */
export function consequenceForDecision(state, decisionId, now = new Date(), settings = {}, wait = null) {
  const decision = (state?.decisions || []).find((d) => d && d.id === decisionId);
  if (!decision || !isOpen(decision)) return null;
  const w = wait || waitCostReport(state, now, settings);
  const graph = decisionBlastRadius(state, decisionId);
  const footprint = readFootprint(state, graph, now);
  const row = w.rows.find((r) => r.item.kind === 'decision' && r.item.sourceId === decisionId) || null;
  const conventions = consequenceConventions(settings);
  const horizons = CONSEQUENCE_HORIZONS.map((weeks) => ({
    ...costScenario(row, weeks, conventions.minExits, w.conventions.minAtRisk),
    related: relatedPriceBuckets(graph, w, decisionId, weeks),
  }));
  return { decision, graph, footprint, row, horizons, conventions, selected: horizons[1] };
}

export function consequenceReport(state, now = new Date(), settings = {}, focusId = null) {
  const wait = waitCostReport(state, now, settings);
  const candidates = wait.rows.filter((row) => row.item.kind === 'decision')
    .map((row) => ({ id: row.item.sourceId, title: row.item.title, elapsedDays: row.item.elapsedDays,
      price: row.price, overdue: row.overdue,
      route: `#/decisions?decision=${encodeURIComponent(row.item.sourceId)}` }));
  // Land on the first priced call whose two-week forecast can actually be
  // read, not on a larger but unsupported price. The queue itself remains in
  // Cost-of-Waiting rank order; a deep link always overrides this default.
  const conventions = consequenceConventions(settings);
  const supported = wait.rows.find((r) => r.item.kind === 'decision' && r.price.priced
    && integrateConditionalSurvival(r.klass?.curve, r.item?.elapsedDays, 14,
      wait.conventions.minAtRisk, conventions.minExits).available);
  const id = candidates.find((c) => c.id === focusId)?.id || supported?.item.sourceId || candidates[0]?.id || null;
  return {
    candidates, focusId: id,
    focused: id ? consequenceForDecision(state, id, now, settings, wait) : null,
    readings: (state?.consequenceReadings || []),
    calibration: consequenceCalibration(state),
    conventions: consequenceConventions(settings),
    today: dayKey(now),
  };
}

/** Freeze only a probability supported by dated class evidence, never a guess. */
export function buildConsequenceReading(focused, horizonWeeks, now, id) {
  const scenario = focused?.horizons.find((s) => s.weeks === horizonWeeks);
  if (!scenario?.area.available || !scenario.area.boundHolds) return null;
  const review = new Date(now.getTime());
  review.setUTCDate(review.getUTCDate() + horizonWeeks * 7);
  const graph = focused.graph;
  return {
    id,
    decisionId: focused.decision.id,
    frozenAt: now.toISOString(),
    horizonWeeks,
    reviewOn: dayKey(review),
    predictedStillOpenPct: scenario.area.probabilityPct,
    price: scenario.price,
    expectedCost: scenario.expectedCost,
    fullWaitCeiling: scenario.fullWaitCeiling,
    graphSnapshot: {
      direct: graph.direct.length,
      secondOrder: graph.secondOrder.length,
      invalidEdges: graph.invalidEdges,
      truncated: graph.truncated,
      relatedPriced: scenario.related.priced,
      fragilePremises: focused.footprint.fragile.length,
    },
    targets: graph.direct.slice(0, focused.conventions.maxLinks)
      .map((n) => ({ type: n.type, id: n.id })),
    graded: null,
  };
}

export function gradeConsequenceReading(reading, state, now = new Date()) {
  if (!reading) return { ok: false, reason: 'Reading not found.' };
  if (reading.graded) return { ok: false, reason: 'A frozen prediction can only be scored once.' };
  if (!Number.isFinite(reading.predictedStillOpenPct)) return { ok: false, reason: 'The reading froze no supportable probability, so there is nothing to grade.' };
  if (dayKey(now) < reading.reviewOn) return { ok: false, reason: `Wait until the review date (${reading.reviewOn}) to score what happened.` };
  const decision = (state?.decisions || []).find((d) => d && d.id === reading.decisionId);
  if (!decision) return { ok: false, reason: 'The original decision is missing; no outcome can be inferred.' };
  if (String(decision.chosen || '').trim() && !decision.decidedOn) {
    return { ok: false, reason: 'This decision has a chosen option but no dated decision; its timing cannot be graded.' };
  }
  if (decision.decidedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(decision.decidedOn)
    || Number.isNaN(Date.parse(`${decision.decidedOn}T00:00:00Z`))
    || new Date(`${decision.decidedOn}T00:00:00Z`).toISOString().slice(0, 10) !== decision.decidedOn
    || decision.decidedOn < reading.frozenAt.slice(0, 10) || !String(decision.chosen || '').trim())) {
    return { ok: false, reason: 'The recorded decision date is invalid, predates the frozen reading, or has no chosen option.' };
  }
  const stillOpen = !decision.decidedOn || decision.decidedOn > reading.reviewOn;
  const p = reading.predictedStillOpenPct / 100;
  return { ok: true, gradedAt: now.toISOString(), stillOpen,
    decisionDate: decision.decidedOn || null,
    brier: round((p - Number(stillOpen)) ** 2, 4) };
}

/** Skill is withheld below five graded forecasts, as in the Survival ledger. */
export function consequenceCalibration(state) {
  const stillVerifiable = new Set((state?.decisions || []).map((d) => d?.id).filter(Boolean));
  const grades = (state?.consequenceReadings || [])
    .filter((r) => r?.graded && stillVerifiable.has(r.decisionId)
      && typeof r.predictedStillOpenPct === 'number' && Number.isFinite(r.graded.brier));
  const n = grades.length;
  if (n < 5) return { n, available: false, reason: `Only ${n} scored reading(s); five are needed for a calibration comparison.` };
  const rate = grades.filter((r) => r.graded.stillOpen).length / n;
  const brier = grades.reduce((sum, r) => sum + r.graded.brier, 0) / n;
  const baseline = grades.reduce((sum, r) => sum + (Number(r.graded.stillOpen) - rate) ** 2, 0) / n;
  return { n, available: true, brier: round(brier, 4), baselineBrier: round(baseline, 4),
    skill: baseline > 0 ? round(1 - brier / baseline, 3) : null,
    baseRatePct: round(rate * 100, 1),
    reason: baseline === 0 ? 'Every outcome was the same; no Brier skill can be defined against a zero baseline.' : '' };
}

export function consequenceSignals(state, now = new Date()) {
  const today = dayKey(now);
  const readings = state?.consequenceReadings || [];
  const liveIds = new Set((state?.decisions || []).map((d) => d?.id).filter(Boolean));
  const due = readings.filter((r) => r && liveIds.has(r.decisionId) && !r.graded && r.reviewOn <= today);
  const orphans = readings.filter((r) => r && !liveIds.has(r.decisionId));
  const misses = readings.filter((r) => liveIds.has(r?.decisionId) && r?.graded?.brier > 0.49);
  const calibration = consequenceCalibration(state);
  const signals = [];
  if (due.length) signals.push({
    ruleId: CONSEQUENCE_SIGNAL_IDS.DUE, domain: 'Decision consequences', severity: 3,
    title: `${due.length} frozen decision-future prediction(s) are due for grading`,
    detail: 'The decision dates already in the workspace settle whether each call was still open at its declared horizon. Grade them once, without backdating.',
    evidence: [`${due.length} due / ${readings.length} frozen reading(s)`],
    action: { label: 'Grade the predictions', route: '#/consequences?panel=readings' },
  });
  if (orphans.length) signals.push({
    ruleId: CONSEQUENCE_SIGNAL_IDS.ORPHAN, domain: 'Decision consequences', severity: 2,
    title: `${orphans.length} frozen decision-future reading(s) lost their source record`,
    detail: 'A missing original decision is not an outcome. Ungraded readings can be removed; graded history is retained but withheld from calibration.',
    evidence: [`${orphans.length} orphaned reading(s)`],
    action: { label: 'Inspect frozen readings', route: '#/consequences?panel=readings' },
  });
  if (misses.length) signals.push({
    ruleId: CONSEQUENCE_SIGNAL_IDS.MISS, domain: 'Decision consequences', severity: 3,
    title: `${misses.length} decision-future forecast(s) missed materially`,
    detail: 'A Brier term above 0.49 means the forecast assigned under 30% to the outcome that actually happened. Review the process, not the person.',
    evidence: [`${misses.length} Brier term(s) > 0.49`],
    action: { label: 'Inspect the frozen readings', route: '#/consequences?panel=readings' },
  });
  if (calibration.available && calibration.skill !== null && calibration.skill < 0) signals.push({
    ruleId: CONSEQUENCE_SIGNAL_IDS.BASELINE, domain: 'Decision consequences', severity: 4,
    title: 'Decision-future predictions lost to the base rate',
    detail: 'Across scored readings, the frozen probabilities scored worse than always using this workspace’s observed open-at-horizon rate. Revisit the class model before using it to justify a wait.',
    evidence: [`n=${calibration.n} · Brier ${calibration.brier} vs base-rate ${calibration.baselineBrier}`],
    action: { label: 'Review the method', route: '#/consequences?panel=method' },
  });
  return signals;
}

export function consequenceAttentionCount(state, now = new Date()) {
  return consequenceSignals(state, now).filter((s) => s.severity >= 3).length;
}

/** Board-ready; intentionally identity-free and no unredacted source prose. */
export function consequenceBrief(focused, now = new Date()) {
  if (!focused) return 'CONSEQUENCE LAB — No open decision is selected.';
  const { graph, footprint, selected, row } = focused;
  const price = row?.price?.priced ? `${row.price.currency} ${row.price.weeklyAmount.toFixed(2)}/week` : 'unpriced (not zero)';
  const simulation = selected.area.available
    ? `The two-week conditional KM area is ${selected.area.expectedWeeks} expected outstanding week(s) vs ${selected.area.endpointLowerWeeks} as the endpoint lower bound; P(still open) = ${selected.area.probabilityPct}% with ${selected.area.atRisk} at risk. Expected priced wait: ${selected.expectedCost === null ? 'unpriced' : `${row.price.currency} ${selected.expectedCost.toFixed(2)}`}.`
    : `The two-week forecast is withheld: ${selected.reason}. The full-wait ceiling is ${selected.fullWaitCeiling === null ? 'unpriced' : `${row.price.currency} ${selected.fullWaitCeiling.toFixed(2)}`}, NOT a forecast.`;
  const buckets = selected.related.buckets.map((b) => `${b.currency} ${b.fullWaitCeiling.toFixed(2)} across ${b.items} related priced item(s)`).join(' · ') || 'none priced';
  return [
    `DECISION CONSEQUENCES · ${dayKey(now)} · model ${CONSEQUENCE_ENGINE_VERSION}`,
    'Not a causal forecast: a typed link is an association. Decision-maker retains the call.',
    `Weekly root delay price: ${price}.`,
    simulation,
    `Recorded adjacency: ${graph.direct.length} first-order and ${graph.secondOrder.length} second-order operational record(s); ${graph.invalidEdges} dangling edge(s) excluded${graph.truncated ? '; the map hit its safety cap' : ''}.`,
    `Watch/breached assumptions: ${footprint.fragile.length}. Dependencies with TTR > TTS: ${footprint.shortfalls.length}. Other open decisions in the two-hop map: ${footprint.coupled.length}.`,
    `Conditional FULL-BLOCK ceiling if all related work waited two weeks: ${buckets}. This is a sensitivity, not an expected consequence; do not add it to root cost or sum currencies.`,
    'Method: exact area under conditional Kaplan–Meier S(age+t)/S(age) over observed support; Reinertsen linear declared/derived weekly price; bounded two-hop typed graph with people and confidential records excluded. Refuses a probability below the evidence floor or beyond the last observation.',
  ].join('\n');
}
