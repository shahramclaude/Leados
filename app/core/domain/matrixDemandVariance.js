/** app/core/domain/matrixDemandVariance.js — Matrix Demand-Variance Early Warning reader (ADR-0173, Schema v137 unchanged, `#/matrix?panel=demand-variance`).

Pure read model over open decisions (the queue), declared reporting lines and
dated share timelines. It answers, per reporting line and per window:

  how much age-weighted demand is queued on this line,
  against what the line has declared it can carry,
  and what refuses to be attributed at all.

It is pure: no DOM, no storage, no wall clock beyond the injected `now`.
No figure is stored: every ceiling and every total is re-derived on read from
the persisted declarations and the open queue.
 */

import { dayKey, daysBetween, round } from '../time.js';
import { buildMatrix } from './matrix.js';
import { linksForEntity } from './cases.js';
import { lineCeiling, periodWindow, quarterWindow } from './lineIntake.js';
import {
  DEMAND_VARIANCE_ENGINE_VERSION,
  DEMAND_VARIANCE_VERDICTS,
  DEMAND_VARIANCE_BOUNDS,
  DEMAND_VARIANCE_CSV_COLUMNS,
  HUNDREDTHS_PER_PERSON_DAY,
} from './matrixDemandVarianceRegistry.js';

const demandVarianceVerdict = (key) =>
  DEMAND_VARIANCE_VERDICTS.find((v) => v.key === key) || DEMAND_VARIANCE_VERDICTS[0];

const LEADER_ID = 'ceo';

/* -------------------------------------------------------------- day helpers */

function dayOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v ? v : null;
}

function daysIn(from, to) {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

function lineOverlapsWindow(row, window) {
  const from = dayOf(row.fromISO);
  if (!from) return false;
  const end = dayOf(row.toISO) || window.to;
  return from <= window.to && end >= window.from;
}

/* -------------------------------------------------------------- names */

function splitParticipants(value) {
  return String(value || '')
    .split(/[,;&]|\band\b/i)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Resolve a decision's free-text name to exactly one roster person. */
function resolvePerson(roster, name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  let match = null;
  let count = 0;
  for (const person of roster.values()) {
    if (String(person.name || '').trim().toLowerCase() === target) {
      match = person;
      count += 1;
    }
  }
  return count === 1 ? match : null;
}

/**
 * Each person's active managers in the window: the roster home line (current
 * manager) plus every declared additional line whose window overlaps the
 * requested period. A person on more than one active manager is genuinely
 * cross-line and their demand cannot be assigned to one line.
 */
function personManagers(state, window, matrix) {
  const map = new Map();
  const ensure = (personId) => { if (!map.has(personId)) map.set(personId, new Set()); return map.get(personId); };
  for (const [personId, person] of matrix.roster) {
    ensure(personId).add(person.rawManagerId || LEADER_ID);
  }
  for (const row of Array.isArray(state.reportingLines) ? state.reportingLines : []) {
    if (!row || !row.personId || !row.managerId) continue;
    if (!lineOverlapsWindow(row, window)) continue;
    ensure(row.personId).add(row.managerId);
  }
  return map;
}

/**
 * Attribute one open decision to exactly one line, or refuse it.
 *
 * `unassigned` — nobody named. `unresolvable` — a named party is not on the
 * roster, or matches several people. `ambiguous-line` — a named person sits on
 * more than one active line, or the decision names people on different lines.
 * Never folds into one manager, never splits a decision.
 */
function attributeDecisionResolved(decision, resolvedPersons, personManagersMap) {
  if (resolvedPersons.length === 0) {
    return { state: 'unassigned', reason: 'No driver, approver, contributor or informed party is named on this decision.' };
  }
  const lines = new Set(); // 'personId::managerId'
  for (const person of resolvedPersons) {
    const managers = personManagersMap.get(person.id);
    if (!managers || managers.size === 0) {
      return { state: 'unassigned', reason: `${person.name} is on no active reporting line in this window.` };
    }
    if (managers.size > 1) {
      return { state: 'ambiguous-line', reason: `${person.name} is on ${managers.size} active line(s) in this window; the demand cannot be assigned to one line.` };
    }
    for (const managerId of managers) lines.add(`${person.id}::${managerId}`);
  }
  if (lines.size !== 1) {
    return { state: 'ambiguous-line', reason: 'The decision names people on more than one line; no single line owns it.' };
  }
  const [personId, managerId] = [...lines][0].split('::');
  return { state: 'attributed', personId, managerId };
}

/* -------------------------------------------------------------- the reader */

/**
 * The demand-variance report for one window (default: the calendar quarter
 * containing `now`).
 *
 * `visiblePersonIds` scopes which line rows are printed; demand attributed to
 * a person outside the seat is counted as `outsideSeatN` and withheld, never
 * dropped or reassigned. Pass `null` for the full matrix.
 */
export function buildMatrixDemandVariance(state = {}, { periodKey = null, now = new Date(), settings = null, visiblePersonIds = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const window = periodKey ? periodWindow(periodKey) : quarterWindow(today);
  if (!window) {
    return {
      engine: DEMAND_VARIANCE_ENGINE_VERSION, today,
      window: null, lines: [], decisions: [], refusals: [], bottlenecks: [],
      board: {
        periodKey: null, periodFrom: null, periodTo: null, windowDays: null,
        decisionsN: 0, attributedN: 0, unassignedN: 0, ambiguousN: 0, unresolvableN: 0, outsideSeatN: 0,
        linesN: 0, withinCeilingN: 0, atCeilingN: 0, overCeilingN: 0, ceilingUnprovableN: 0, noDemandN: 0,
        demandH: 0, ceilingH: null, varianceH: null, figuresComplete: true, countsReconcile: true,
        flow: null,
        kingman: { withheld: true, reason: 'The period is unreadable, so no flow figure can be priced.' },
        refusalReason: 'The period is not a readable calendar quarter (YYYY-QN).',
      },
    };
  }
  const windowDays = daysIn(window.from, window.to);
  if (!windowDays || windowDays > DEMAND_VARIANCE_BOUNDS.maxWindowDays) {
    return {
      engine: DEMAND_VARIANCE_ENGINE_VERSION, today,
      window, lines: [], decisions: [], refusals: [], bottlenecks: [],
      board: {
        periodKey: window.periodKey, periodFrom: window.from, periodTo: window.to, windowDays: null,
        decisionsN: 0, attributedN: 0, unassignedN: 0, ambiguousN: 0, unresolvableN: 0, outsideSeatN: 0,
        linesN: 0, withinCeilingN: 0, atCeilingN: 0, overCeilingN: 0, ceilingUnprovableN: 0, noDemandN: 0,
        demandH: 0, ceilingH: null, varianceH: null, figuresComplete: true, countsReconcile: true,
        flow: null,
        kingman: { withheld: true, reason: 'The window is unreadable or beyond the declared bound.' },
        refusalReason: 'The window is unreadable or beyond the declared bound.',
      },
    };
  }
  const cfg = settings || state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const roster = matrix.roster;
  const managers = personManagers(state, window, matrix);

  const openDecisions = (Array.isArray(state.decisions) ? state.decisions : [])
    .filter((d) => d && !d.chosen)
    .filter((d) => {
      const day = dayOf(d.date);
      return day && day >= window.from && day <= window.to;
    });

  const visible = visiblePersonIds === null ? null : new Set(visiblePersonIds);
  const lineMap = new Map(); // 'personId::managerId' -> accumulated demand for one line
  const refusals = [];
  const bottlenecks = [];
  let attributedN = 0, unassignedN = 0, ambiguousN = 0, unresolvableN = 0, outsideSeatN = 0;
  let demandH = 0;

  for (const decision of openDecisions) {
    const day = dayOf(decision.date);
    const ageDays = Math.max(0, daysBetween(day, today) ?? 0);
    const resolved = [];
    let unresolvableName = null;
    for (const name of [
      ...splitParticipants(decision.driver),
      ...splitParticipants(decision.approver),
      ...splitParticipants(decision.contributors),
      ...splitParticipants(decision.informed),
    ]) {
      const person = resolvePerson(roster, name);
      if (!person) { unresolvableName = name; break; }
      resolved.push(person);
    }
    if (unresolvableName) {
      unresolvableN += 1;
      refusals.push({ class: 'unresolvable', decisionId: decision.id, title: decision.title, date: decision.date, ageDays, reason: `The name “${unresolvableName}” is not on the roster, or matches several people, so this decision cannot be traced to a person.` });
      continue;
    }
    const attribution = attributeDecisionResolved(decision, resolved, managers);
    if (attribution.state !== 'attributed') {
      if (attribution.state === 'unassigned') unassignedN += 1;
      else ambiguousN += 1;
      refusals.push({ class: attribution.state, decisionId: decision.id, title: decision.title, date: decision.date, ageDays, reason: attribution.reason });
      continue;
    }
    const { personId, managerId } = attribution;
    if (visible && !visible.has(personId)) {
      outsideSeatN += 1;
      refusals.push({ class: 'outside-seat', decisionId: decision.id, title: decision.title, date: decision.date, ageDays, reason: `The line this decision is attributable to is outside this seat's scope; counted, not shown.` });
      continue;
    }
    attributedN += 1;
    demandH += ageDays * HUNDREDTHS_PER_PERSON_DAY;

    const key = `${personId}::${managerId}`;
    let line = lineMap.get(key);
    if (!line) {
      const person = roster.get(personId);
      const manager = roster.get(managerId) || matrix.nodes.get(managerId);
      line = {
        personId, managerId,
        personName: person ? person.name : personId,
        managerName: manager ? manager.name : managerId,
        kind: null,
        shareH: null,
        demandN: 0,
        demandDays: 0,
        demandH: 0,
        decisions: [],
      };
      lineMap.set(key, line);
    }
    line.demandN += 1;
    line.demandDays += ageDays;
    line.demandH += ageDays * HUNDREDTHS_PER_PERSON_DAY;
    line.decisions.push({ id: decision.id, title: decision.title, date: decision.date, ageDays });

    // Bottleneck: dated dependencies this open decision is waiting on.
    for (const link of linksForEntity(state, 'decision', decision.id)) {
      const peer = link.peer || {};
      const peerRaw = peer.raw || {};
      if (peer.type === 'dependency' || peer.type === 'case') {
        const peerDay = dayOf(peerRaw.date || peerRaw.createdOn || peerRaw.openedOn);
        const peerAge = peerDay ? Math.max(0, daysBetween(peerDay, today) ?? 0) : null;
        bottlenecks.push({
          decisionId: decision.id, decisionTitle: decision.title, decisionAgeDays: ageDays,
          dependsOn: peer.type, dependsOnId: peer.id, dependsOnTitle: peer.title || peer.id,
          dependsOnAgeDays: peerAge,
          relation: link.relation,
        });
      }
    }
  }

  // Price each accumulated line's ceiling exactly once, from its own dated
  // share timeline. A line's ceiling is never recomputed per decision.
  const lines = [];
  for (const line of lineMap.values()) {
    const ceiling = lineCeiling(state, line.personId, line.managerId, window.periodKey, { now: at, matrix });
    const ceilingH = ceiling.state === 'computed' ? ceiling.ceilingH : null;
    const varianceH = ceilingH !== null ? line.demandH - ceilingH : null;
    let verdict;
    if (ceiling.state !== 'computed') verdict = 'ceiling-unprovable';
    else if (line.demandH === 0) verdict = 'no-demand';
    else if (line.demandH > ceilingH) verdict = 'over-ceiling';
    else if (line.demandH === ceilingH) verdict = 'at-ceiling';
    else verdict = 'within-ceiling';
    lines.push({
      ...line,
      ceiling,
      ceilingH,
      varianceH,
      verdict,
      verdictLabel: demandVarianceVerdict(verdict).label,
      verdictTone: demandVarianceVerdict(verdict).tone,
    });
  }

  lines.sort((a, b) => {
    const ra = demandVarianceVerdict(a.verdict).rank;
    const rb = demandVarianceVerdict(b.verdict).rank;
    if (ra !== rb) return ra - rb;
    return String(a.personName).localeCompare(String(b.personName));
  });

  const ceilingLines = lines.filter((l) => l.demandH > 0);
  const figuresComplete = ceilingLines.every((l) => l.ceilingH !== null);
  const rowDemandH = lines.reduce((acc, l) => acc + l.demandH, 0);
  const rowAttributedN = lines.reduce((acc, l) => acc + l.demandN, 0);
  const countsReconcile =
    (rowAttributedN === attributedN) &&
    (attributedN + unassignedN + ambiguousN + unresolvableN + outsideSeatN === openDecisions.length) &&
    (rowDemandH === demandH);

  const verdictCount = (key) => lines.filter((l) => l.verdict === key).length;

  // Flow observation: Little's Law L = λ × W over the window. Refused below the
  // decision floor; Kingman's approximation is refused outright because the
  // workspace records no service-time distribution for decisions.
  const arrivalsN = (Array.isArray(state.decisions) ? state.decisions : [])
    .filter((d) => d && d.date)
    .filter((d) => {
      const day = dayOf(d.date);
      return day && day >= window.from && day <= window.to;
    }).length;
  const lambdaPerDay = windowDays ? round(arrivalsN / windowDays, 4) : null;
  const meanAgeDays = attributedN ? round(demandH / HUNDREDTHS_PER_PERSON_DAY / attributedN, 2) : null;
  const flow = (openDecisions.length >= DEMAND_VARIANCE_BOUNDS.minDecisionsForFlow && lambdaPerDay !== null && meanAgeDays !== null)
    ? { lambdaPerDay, meanAgeDays, impliedWip: round(lambdaPerDay * meanAgeDays, 2), withheld: false }
    : { lambdaPerDay, meanAgeDays, impliedWip: null, withheld: true, reason: `Fewer than ${DEMAND_VARIANCE_BOUNDS.minDecisionsForFlow} open decisions in the window; Little's Law is not run below the floor.` };

  const board = {
    periodKey: window.periodKey,
    periodFrom: window.from,
    periodTo: window.to,
    windowDays,
    decisionsN: openDecisions.length,
    attributedN,
    unassignedN,
    ambiguousN,
    unresolvableN,
    outsideSeatN,
    linesN: lines.length,
    withinCeilingN: verdictCount('within-ceiling'),
    atCeilingN: verdictCount('at-ceiling'),
    overCeilingN: verdictCount('over-ceiling'),
    ceilingUnprovableN: verdictCount('ceiling-unprovable'),
    noDemandN: verdictCount('no-demand'),
    demandH,
    ceilingH: figuresComplete ? lines.reduce((acc, l) => acc + (l.ceilingH || 0), 0) : null,
    varianceH: figuresComplete ? round(lines.reduce((acc, l) => acc + (l.varianceH || 0), 0), 2) : null,
    figuresComplete,
    countsReconcile,
    flow,
    kingman: {
      withheld: true,
      reason: "The workspace records no service-time distribution for decisions, so Kingman's queueing estimate would be invented and is refused. It is run only where arrival and service variation are evidenced.",
    },
    refusalReason: null,
  };

  return {
    engine: DEMAND_VARIANCE_ENGINE_VERSION,
    today,
    window,
    lines,
    decisions: openDecisions.map((d) => ({ id: d.id, title: d.title, date: d.date, ageDays: Math.max(0, daysBetween(dayOf(d.date), today) ?? 0) })),
    refusals,
    bottlenecks,
    board,
    verdictKeys: DEMAND_VARIANCE_VERDICTS.map((v) => v.key),
  };
}

const pd = (hundredths) => (hundredths === null || hundredths === undefined ? '—' : (hundredths / 100).toFixed(2));

/** One identity-free brief paragraph for the board pack. */
export function matrixDemandVarianceBriefText(report) {
  const b = report?.board;
  if (!b) return 'The demand-variance reading could not be built.';
  const parts = [
    `Demand-variance early warning for ${b.periodKey || 'an unreadable period'}: ${b.decisionsN} open decision(s) in the window, ${b.attributedN} attributed to a declared line, ${b.unassignedN} unassigned, ${b.ambiguousN} spanning more than one line, ${b.unresolvableN} not traceable to a roster person.`,
    `${b.linesN} line(s) carry attributable demand: ${b.withinCeilingN} within ceiling, ${b.atCeilingN} at ceiling, ${b.overCeilingN} over ceiling, ${b.ceilingUnprovableN} with no provable ceiling.`,
    `Age-weighted demand totals ${pd(b.demandH)} person-days${b.ceilingH === null ? '' : ` against a declared ceiling of ${pd(b.ceilingH)} — variance ${pd(b.varianceH)}`}.`,
    b.figuresComplete ? 'Every ceiling was priced.' : 'Not every ceiling was priced; the unprovable lines are printed with their reasons.',
    b.countsReconcile ? 'The counts reconcile.' : 'The counts do NOT reconcile; the discrepancy is printed, not smoothed.',
  ];
  return parts.join(' ');
}

/** Aggregate-only export: one workspace row, no identity, no free text. */
export function matrixDemandVarianceCsvRows(report) {
  const b = report?.board;
  const base = Object.fromEntries(DEMAND_VARIANCE_CSV_COLUMNS.map((k) => [k, '']));
  if (!b) {
    return [{ ...base, scope: 'workspace', figures_complete: 'false', counts_reconcile: 'false', refusal_reason: 'The demand-variance reading could not be built.' }];
  }
  const flow = b.flow || {};
  return [{
    ...base,
    scope: 'workspace',
    period_key: b.periodKey || '',
    period_from: b.periodFrom || '',
    period_to: b.periodTo || '',
    window_days: String(b.windowDays || ''),
    decisions_n: String(b.decisionsN),
    attributed_n: String(b.attributedN),
    unassigned_n: String(b.unassignedN),
    ambiguous_line_n: String(b.ambiguousN),
    unresolvable_n: String(b.unresolvableN),
    lines_n: String(b.linesN),
    within_ceiling_n: String(b.withinCeilingN),
    at_ceiling_n: String(b.atCeilingN),
    over_ceiling_n: String(b.overCeilingN),
    ceiling_unprovable_n: String(b.ceilingUnprovableN),
    no_demand_n: String(b.noDemandN),
    demand_days: b.figuresComplete ? String(b.demandH) : '',
    ceiling_days_h: b.ceilingH !== null ? String(b.ceilingH) : '',
    variance_days_h: b.varianceH !== null ? String(b.varianceH) : '',
    figures_complete: b.figuresComplete ? 'true' : 'false',
    counts_reconcile: b.countsReconcile ? 'true' : 'false',
    flow_lambda_per_day: flow.withheld ? '' : String(flow.lambdaPerDay),
    flow_mean_age_days: flow.withheld ? '' : String(flow.meanAgeDays),
    flow_implied_wip: flow.withheld ? '' : String(flow.impliedWip),
    flow_withheld: String(!!flow.withheld),
    refusal_reason: b.refusalReason || '',
  }];
}
