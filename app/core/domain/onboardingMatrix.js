/**
 * app/core/domain/onboardingMatrix.js — Matrix Onboarding Completeness
 * (ADR-0150, Schema v125, `RULE-ONB-01`, `#/onboarding?panel=matrix`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. On Monday Sam joins the team. Dana is her
 * functional manager and owns the 30-60-90 plan; Priya holds 40% of her for a
 * project that starts the same week. The plan names role clarity, a buddy, the
 * stakeholders to meet, an early win and three check-ins — all of it written by one
 * line about one job. Nothing in the workspace records that Priya's line has any
 * onboarding obligation at all. A project manager has never said, in writing, what
 * Sam owes that project or who she must meet on it, and Sam has never been told.
 * The plan nevertheless reads as the whole story, and a completed plan reads as a
 * completed onboarding of a person who has two managers.
 *
 * THE SECOND FAILURE. `onboardingSummary` counts PLANS. In a matrix one person can
 * hold two concurrent 30-60-90 plans — one per line — so the workspace reads two
 * plans as though the person had been onboarded twice, or as though either plan
 * described the whole job. Both readings are wrong and both are silent.
 *
 * WHAT THIS MODULE IS. One bounded read model over the EXISTING 30-60-90
 * machinery: for one person's onboarding window, which lines were in force, what
 * each line actually committed to in writing, whose word it was, whether the person
 * acknowledged it, and — printed separately, never collapsed — whether the plan
 * itself is healthy.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 *  - Never a share. `matrix.personAllocation` is the only place an allocation is
 *    computed; a brief carries none and this module invents none.
 *  - Never a score. No row is about the joiner's capability; every row is about a
 *    LINE's statement or a PLAN's scaffolding.
 *  - Never silence as agreement: an unbriefed line reads `unbriefed`, an
 *    unacknowledged brief reads `briefed`.
 *  - Never "complete" from one plan: `planComplete` and `crossLineComplete` are
 *    two figures and are printed as two.
 *  - Never a synthetic completion date, a projected past or an inferred owner.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildMatrix } from './matrix.js';
import { onboardingHealth, planKind } from './onboarding.js';
import { activePeople } from './people.js';
import { normalizeOnboardingMatrixSettings } from './onboardingMatrixSchema.js';
import { periodLinesFor, stewardshipLineKey } from './reviewStewardship.js';
import {
  ONBOARDING_MATRIX_ENGINE_VERSION,
  ONBOARDING_MATRIX_LIMITS,
  ONBOARDING_MATRIX_SETTLED_STATES,
  ONBOARDING_MATRIX_STATES,
  ONBOARDING_MATRIX_STATE_LABELS,
  ONBOARDING_MATRIX_STATE_TONES,
  ONBOARDING_MATRIX_VERDICTS,
  ONBOARDING_MATRIX_WINDOW_DAYS,
  onboardingMatrixVerdict,
} from './onboardingMatrixRegistry.js';

/* ------------------------------------------------------------ small helpers */

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * The stable id for a line inside one onboarding case. It is deliberately the SAME
 * shape the matrix engine's other line-scoped readers use (`home:<personId>` for
 * the home line, the declaration id for a declared one), so one line is one row
 * in every module that reasons about it.
 */
export function onboardingLineKey(line, personId = null) {
  return stewardshipLineKey(line, personId);
}

/** Every active plan for a person. Order does not matter; the counts dedupe. */
function activePlansFor(state, personId) {
  return (Array.isArray(state?.onboarding) ? state.onboarding : [])
    .filter((plan) => plan && plan.personId === personId && plan.status === 'active');
}

/**
 * Group the stored briefs by (plan, line), newest first.
 *
 * A RE-BRIEF IS A NEW ROW, so the effective statement is the most recently
 * declared one and every earlier row is superseded history. Ordering is by
 * `declaredOn` and then by row id, deterministically, so a printed state cannot
 * depend on array order in the file.
 */
export function briefsByLine(briefs) {
  const map = new Map();
  const order = new Map();
  const list = Array.isArray(briefs) ? briefs : [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || !row.lineKey) continue;
    const key = `${row.planId}|${row.lineKey}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    order.set(row, i);
  }
  for (const rows of map.values()) {
    // Newest statement first: by the day it was declared, and — when two briefs
    // were declared on the SAME day — by the order the store recorded them, which
    // is the only truthful tie-break available. A re-brief written this afternoon
    // is the current statement even though the morning's row carries the same date.
    rows.sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn))
      || (order.get(b) ?? 0) - (order.get(a) ?? 0));
  }
  return map;
}

/* ------------------------------------------------------------ the read model */

function emptyCase(state, conv, today) {
  return {
    engineVersion: ONBOARDING_MATRIX_ENGINE_VERSION,
    planId: null,
    personId: null,
    personName: null,
    kind: null,
    planStatus: null,
    startDate: null,
    windowEnd: null,
    isMatrix: false,
    hasPlan: false,
    verdict: 'single-line',
    verdictLabel: onboardingMatrixVerdict('single-line')?.label || 'Single line',
    verdictTone: 'neutral',
    verdictDetail: onboardingMatrixVerdict('single-line')?.detail || '',
    crossLineComplete: false,
    crossLineSettled: false,
    planComplete: false,
    lines: [],
    windowLines: [],
    secondaryLines: [],
    outOfWindowLines: [],
    duplicatePlanIds: [],
    planScaffolding: null,
    totals: {
      lineN: 0, windowLineN: 0, secondaryWindowN: 0,
      acknowledgedN: 0, briefedN: 0, acknowledgementOverdueN: 0,
      declinedN: 0, unbriefedN: 0, awaitingBriefN: 0, presumedN: 0,
      excludedN: 0, settledN: 0, briefRowN: 0, supersededBriefN: 0,
    },
    presumption: null,
    refusals: [],
    conventions: conv,
    today,
  };
}

/**
 * Resolve one line's onboarding state.
 *
 * Precedence is explicit and declared here so the panel, the rule and the CSV
 * cannot disagree: exclusion beats everything (a line outside the window has no
 * state at all), then a stored decline, then an acknowledgement, then the brief
 * windows, then the home-line presumption, then the two waiting states.
 */
function resolveLineState({ line, brief, today, briefDueOn, conv }) {
  if (!line.inWindow) {
    return {
      state: ONBOARDING_MATRIX_STATES.excluded,
      overdue: false,
      overdueDays: null,
      ackDueOn: null,
      ackOverdue: false,
      ackOverdueDays: null,
    };
  }
  if (brief && brief.outcome === 'declined') {
    return {
      state: ONBOARDING_MATRIX_STATES.declined,
      overdue: false,
      overdueDays: null,
      ackDueOn: null,
      ackOverdue: false,
      ackOverdueDays: null,
    };
  }
  if (brief && brief.outcome === 'brief') {
    const ackDueOn = addDays(brief.declaredOn, conv.onboardingAcknowledgeDays);
    if (brief.acknowledgedOn) {
      return {
        state: ONBOARDING_MATRIX_STATES.acknowledged,
        overdue: false,
        overdueDays: null,
        ackDueOn,
        ackOverdue: false,
        ackOverdueDays: null,
      };
    }
    const ackOverdue = Boolean(ackDueOn && today > ackDueOn);
    return {
      state: ackOverdue ? ONBOARDING_MATRIX_STATES.acknowledgementOverdue : ONBOARDING_MATRIX_STATES.briefed,
      overdue: false,
      overdueDays: null,
      ackDueOn,
      ackOverdue,
      ackOverdueDays: ackOverdue ? Math.max(0, daysBetween(ackDueOn, today) ?? 0) : null,
    };
  }
  // No brief at all.
  if (line.role === 'primary') {
    // The home line with no brief: the 30-60-90 plan itself carries that line's
    // obligations (role clarity, buddy, early win, check-ins), so this is NOT the
    // same gap as a project line that said nothing. It is a PRESUMPTION, printed
    // as one, never upgraded to evidence and never counted as a settled line —
    // and it is read before the brief-window test on purpose: a home manager is
    // not chased for a second copy of the plan they already wrote.
    return {
      state: ONBOARDING_MATRIX_STATES.presumed,
      overdue: false,
      overdueDays: null,
      ackDueOn: null,
      ackOverdue: false,
      ackOverdueDays: null,
    };
  }
  if (briefDueOn && today > briefDueOn) {
    return {
      state: ONBOARDING_MATRIX_STATES.unbriefed,
      overdue: true,
      overdueDays: Math.max(0, daysBetween(briefDueOn, today) ?? 0),
      ackDueOn: null,
      ackOverdue: false,
      ackOverdueDays: null,
    };
  }
  return {
    state: ONBOARDING_MATRIX_STATES.awaitingBrief,
    overdue: false,
    overdueDays: null,
    ackDueOn: null,
    ackOverdue: false,
    ackOverdueDays: null,
  };
}

/**
 * Build the whole read model for ONE onboarding plan.
 *
 * Returns a case whose `isMatrix` is false — and whose totals are all zero — when
 * the person sat on one line for the window. That is how the module stays inert in
 * a single-chain workspace: nothing is added, and the panel says so in words
 * rather than printing a reassuring zero.
 */
export function buildOnboardingMatrixCase(state, plan, { now = new Date(), settings = null } = {}) {
  const conv = normalizeOnboardingMatrixSettings(settings || state?.settings || {});
  const today = dayKey(now);
  const base = emptyCase(state, conv, today);
  if (!plan || !plan.personId) return base;

  const person = (Array.isArray(state?.people) ? state.people : []).find((p) => p && p.id === plan.personId) || null;
  const startDate = dayOf(plan.startDate);
  const windowEnd = startDate ? addDays(startDate, ONBOARDING_MATRIX_WINDOW_DAYS) : null;
  const briefDueOn = startDate ? addDays(startDate, conv.onboardingBriefDays) : null;

  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  const all = startDate
    ? periodLinesFor(matrix, plan.personId, startDate, windowEnd, state)
    : [];
  const activePlans = activePlansFor(state, plan.personId);
  const planIds = new Set(activePlans.map((p) => p.id));
  // Duplicate plans are same-kind and same-person: a new-hire plan and a role
  // transition plan answer different questions and are not duplicates.
  const kind = planKind(plan);
  const duplicatePlanIds = activePlans
    .filter((p) => p.id !== plan.id && planKind(p) === kind)
    .map((p) => p.id);

  const stored = (Array.isArray(state?.onboardingLineBriefs) ? state.onboardingLineBriefs : [])
    .filter((row) => row && row.personId === plan.personId && planIds.has(row.planId));
  const byLine = briefsByLine(stored);

  const rows = all.map((line) => {
    // `periodLinesFor` returns the line's STABLE KEY (not its raw id) plus
    // `inPeriod`. Both are read from the row it produced, never re-derived: the
    // key is what a stored brief points at, and re-deriving it from a field the
    // row does not carry is how two modules come to disagree about one line.
    const key = String(line.key || onboardingLineKey(line, plan.personId));
    const inWindow = Boolean(line.inPeriod);
    const history = byLine.get(`${plan.id}|${key}`) || [];
    const brief = history[0] || null;
    const supersededN = Math.max(0, history.length - 1);
    const resolved = resolveLineState({ line: { ...line, inWindow }, brief, today, briefDueOn, conv });
    return {
      key,
      role: line.role,
      kind: line.kind,
      managerId: line.managerId,
      managerName: line.managerName,
      managerAltitude: line.managerAltitude || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
      fromISO: line.fromISO,
      toISO: line.toISO,
      inWindow,
      reason: line.reason || '',
      state: resolved.state,
      stateLabel: ONBOARDING_MATRIX_STATE_LABELS[resolved.state],
      stateTone: ONBOARDING_MATRIX_STATE_TONES[resolved.state],
      settled: ONBOARDING_MATRIX_SETTLED_STATES.includes(resolved.state),
      briefDueOn,
      overdue: resolved.overdue,
      overdueDays: resolved.overdueDays,
      ackDueOn: resolved.ackDueOn,
      ackOverdue: resolved.ackOverdue,
      ackOverdueDays: resolved.ackOverdueDays,
      supersededBriefN: supersededN,
      brief: brief
        ? {
            id: brief.id,
            outcome: brief.outcome,
            declaredOn: brief.declaredOn,
            declaredBySeatId: brief.declaredBySeatId,
            declaredSource: brief.declaredSource || 'manager',
            managerId: brief.managerId,
            scope: brief.scope,
            firstWork: brief.firstWork,
            stakeholders: [...(brief.stakeholders || [])],
            stakeholdersN: (brief.stakeholders || []).length,
            domains: [...(brief.domains || [])],
            decisionRight: brief.decisionRight || '',
            criteria: brief.criteria || '',
            reason: brief.reason,
            acknowledgedOn: brief.acknowledgedOn,
            acknowledgedBySeatId: brief.acknowledgedBySeatId,
            acknowledgementSource: brief.acknowledgementSource || 'person',
            acknowledgement: brief.acknowledgement,
          }
        : null,
    };
  });

  rows.sort((a, b) => {
    if (a.role === 'primary' && b.role !== 'primary') return -1;
    if (b.role === 'primary' && a.role !== 'primary') return 1;
    return String(a.managerName).localeCompare(String(b.managerName)) || String(a.key).localeCompare(String(b.key));
  });

  const windowRows = rows.filter((l) => l.inWindow);
  const outOfWindow = rows.filter((l) => !l.inWindow);
  const secondaryWindow = windowRows.filter((l) => l.role !== 'primary');
  // MATRIX FOR THIS PERSON when more than one line was in force in the window, OR
  // when any declared line names them at all (even a future one) — "this person
  // has a second manager next quarter" is already a fact the plan must not ignore.
  const isMatrix = windowRows.length > 1 || rows.some((l) => l.role !== 'primary');

  const countOf = (stateKey) => windowRows.filter((l) => l.state === stateKey).length;
  const settledN = windowRows.filter((l) => l.settled).length;
  const presumedN = countOf(ONBOARDING_MATRIX_STATES.presumed);
  const unbriefedN = countOf(ONBOARDING_MATRIX_STATES.unbriefed);
  const awaitingBriefN = countOf(ONBOARDING_MATRIX_STATES.awaitingBrief);
  const ackOverdueN = countOf(ONBOARDING_MATRIX_STATES.acknowledgementOverdue);
  const briefedN = countOf(ONBOARDING_MATRIX_STATES.briefed);
  const acknowledgedN = countOf(ONBOARDING_MATRIX_STATES.acknowledged);
  const declinedN = countOf(ONBOARDING_MATRIX_STATES.declined);

  /* ---------------------------------------------------------- the verdict */
  // Precedence is DECLARED in the registry; this selects, and nothing else does.
  let verdict;
  if (duplicatePlanIds.length) verdict = 'duplicate-plans';
  else if (unbriefedN) verdict = 'unbriefed-line';
  else if (ackOverdueN) verdict = 'acknowledgement-overdue';
  else if (awaitingBriefN) verdict = 'awaiting-brief';
  else if (briefedN) verdict = 'unacknowledged';
  else if (declinedN) verdict = 'settled-with-declines';
  else if (!isMatrix) verdict = 'single-line';
  else verdict = 'complete';

  // A single-line person is `single-line` regardless of brief history: there is no
  // second line to reconcile, and a declined-or-decided home line changes nothing
  // the ordinary 30-60-90 screen does not already show.
  if (!isMatrix && !duplicatePlanIds.length) verdict = 'single-line';

  const meta = onboardingMatrixVerdict(verdict);

  /* ------------------------------------------------------ plan scaffolding */
  // Printed SEPARATELY from line coverage, under its own heading, because
  // "the plan is healthy" and "every line onboarded this person" are different
  // claims. This is the only place `onboardingHealth` is consulted.
  const health = onboardingHealth(plan, state, now, settings || state?.settings || {});
  const planScaffolding = {
    statusTone: health.statusTone,
    statusLabel: health.statusLabel,
    dayNumber: health.dayNumber,
    phase: health.phase,
    checkpointN: (plan.checkpoints || []).length,
    checkpointOpenN: health.checkpointStats?.open ?? 0,
    checkpointOverdueN: health.checkpointStats?.overdue ?? 0,
    checkpointDoneN: health.checkpointStats?.done ?? 0,
    stakeholderN: health.stakeholderStats?.total ?? 0,
    stakeholderMetN: health.stakeholderStats?.met ?? 0,
    scaffoldingGapN: (health.scaffoldingGaps || []).length,
    gapKeys: (health.scaffoldingGaps || []).map((g) => g.key),
    readyToGraduate: Boolean(health.readyToGraduate),
    // The plan's OWN completion is one claim. It is never used to derive coverage.
    planComplete: plan.status === 'completed',
  };

  const refusals = [];
  if (outOfWindow.length) {
    refusals.push({
      kind: 'line-outside-window',
      lineKeys: outOfWindow.map((l) => l.key),
      detail: `${outOfWindow.length} declared line(s) on this person do not overlap the onboarding window and were EXCLUDED rather than counted. A line that did not exist in the 90 days cannot have onboarded anybody into them.`,
    });
  }
  if (presumedN) {
    refusals.push({
      kind: 'home-line-presumed',
      lineKeys: windowRows.filter((l) => l.state === ONBOARDING_MATRIX_STATES.presumed).map((l) => l.key),
      detail: 'The home line carries no line brief. Its obligations are PRESUMED to be the 30-60-90 plan itself — a presumption, printed as one, and never counted as a settled line or as evidence that anybody stated the job.',
    });
  }
  if (declinedN) {
    refusals.push({
      kind: 'line-declined-onboarding',
      lineKeys: windowRows.filter((l) => l.state === ONBOARDING_MATRIX_STATES.declined).map((l) => l.key),
      detail: `${declinedN} line(s) stated in writing that this person carries no onboarding obligation there yet, with a reason. That is a dated human answer, not coverage — and it is never counted as one.`,
    });
  }
  if (duplicatePlanIds.length) {
    refusals.push({
      kind: 'duplicate-plans',
      planIds: [plan.id, ...duplicatePlanIds],
      detail: `${duplicatePlanIds.length + 1} concurrent ${kind} plans cover this person. The workspace's plan counts therefore overstate how many people are being onboarded; this case is ONE person, counted once.`,
    });
  }
  if (plan.status === 'completed' && !['complete', 'settled-with-declines', 'single-line'].includes(verdict)) {
    refusals.push({
      kind: 'plan-complete-but-not-cross-line',
      planIds: [plan.id],
      detail: 'The plan is marked completed. That is one plan’s completion and NOT a claim that every line onboarded this person: the lines above are still open, and the two claims are printed separately on purpose.',
    });
  }

  return {
    ...base,
    planId: plan.id,
    personId: plan.personId,
    personName: person?.name || plan.personId,
    kind,
    planStatus: plan.status,
    startDate,
    windowEnd,
    isMatrix,
    hasPlan: true,
    verdict,
    verdictLabel: meta?.label || verdict,
    verdictTone: meta?.tone || 'neutral',
    verdictDetail: meta?.detail || '',
    // TWO DIFFERENT CLAIMS. `crossLineComplete` means every line in force wrote
    // what it expects AND the person acknowledged it. A line that DECLINED is
    // settled but the onboarding did not happen there, so it is `crossLineSettled`
    // — a weaker word — and never `complete`.
    crossLineComplete: verdict === 'complete',
    crossLineSettled: verdict === 'complete' || verdict === 'settled-with-declines',
    planComplete: plan.status === 'completed',
    lines: rows,
    windowLines: windowRows,
    secondaryLines: secondaryWindow,
    outOfWindowLines: outOfWindow,
    duplicatePlanIds: duplicatePlanIds.sort(),
    planScaffolding,
    totals: {
      lineN: rows.length,
      windowLineN: windowRows.length,
      secondaryWindowN: secondaryWindow.length,
      acknowledgedN,
      briefedN,
      acknowledgementOverdueN: ackOverdueN,
      declinedN,
      unbriefedN,
      awaitingBriefN,
      presumedN,
      excludedN: outOfWindow.length,
      settledN,
      briefRowN: stored.length,
      supersededBriefN: rows.reduce((acc, l) => acc + l.supersededBriefN, 0),
    },
    presumption: presumedN
      ? {
          homeLineCarriedByPlan: true,
          reason: 'The home line has no written brief. Its onboarding obligations are presumed to be the 30-60-90 plan’s own scaffolding; the presumption is named on the case and is never counted as a settled line.',
        }
      : null,
    refusals,
  };
}

/**
 * A MATRIX PERSON WITH NO PLAN AT ALL. Two managers each believe the other is
 * onboarding them; the workspace holds no plan, so `onboardingSummary` cannot see
 * the person and the ordinary "joiners without a plan" check only looks at people
 * inside `onboardingDays` of their start date. This case is derived — nothing is
 * stored, and no plan is invented to make a count come out.
 */
export function buildUnplannedCase(state, person, { now = new Date(), settings = null } = {}) {
  const conv = normalizeOnboardingMatrixSettings(settings || state?.settings || {});
  const today = dayKey(now);
  const base = emptyCase(state, conv, today);
  if (!person || !person.id) return base;
  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  const lines = periodLinesFor(matrix, person.id, today, today, state);
  const windowRows = lines.filter((l) => l.inPeriod).map((line) => ({
    key: onboardingLineKey(line, person.id),
    role: line.role,
    kind: line.kind,
    managerId: line.managerId,
    managerName: line.managerName,
    managerAltitude: line.managerAltitude || null,
    shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    fromISO: line.fromISO,
    toISO: line.toISO,
    inWindow: true,
    reason: '',
    // No plan means no window and no due date: nothing can be late, so the lines
    // are printed as awaiting a brief rather than as overdue. The FINDING is the
    // missing plan, and it is its own verdict.
    state: ONBOARDING_MATRIX_STATES.awaitingBrief,
    stateLabel: ONBOARDING_MATRIX_STATE_LABELS[ONBOARDING_MATRIX_STATES.awaitingBrief],
    stateTone: ONBOARDING_MATRIX_STATE_TONES[ONBOARDING_MATRIX_STATES.awaitingBrief],
    settled: false,
    briefDueOn: null,
    overdue: false,
    overdueDays: null,
    ackDueOn: null,
    ackOverdue: false,
    ackOverdueDays: null,
    supersededBriefN: 0,
    brief: null,
  }));
  const isMatrix = windowRows.length > 1;
  const meta = onboardingMatrixVerdict('unplanned-matrix');
  return {
    ...base,
    planId: null,
    personId: person.id,
    personName: person.name || person.id,
    kind: null,
    planStatus: null,
    startDate: dayOf(person.startDate),
    windowEnd: dayOf(person.startDate) ? addDays(person.startDate, ONBOARDING_MATRIX_WINDOW_DAYS) : null,
    isMatrix,
    hasPlan: false,
    verdict: isMatrix ? 'unplanned-matrix' : 'single-line',
    verdictLabel: isMatrix ? (meta?.label || 'No plan') : (onboardingMatrixVerdict('single-line')?.label || 'Single line'),
    verdictTone: isMatrix ? (meta?.tone || 'bad') : 'neutral',
    verdictDetail: isMatrix ? (meta?.detail || '') : (onboardingMatrixVerdict('single-line')?.detail || ''),
    crossLineComplete: false,
    crossLineSettled: false,
    planComplete: false,
    lines: windowRows,
    windowLines: windowRows,
    secondaryLines: windowRows.filter((l) => l.role !== 'primary'),
    outOfWindowLines: [],
    duplicatePlanIds: [],
    planScaffolding: null,
    totals: {
      lineN: windowRows.length,
      windowLineN: windowRows.length,
      secondaryWindowN: windowRows.filter((l) => l.role !== 'primary').length,
      acknowledgedN: 0,
      briefedN: 0,
      acknowledgementOverdueN: 0,
      declinedN: 0,
      unbriefedN: 0,
      awaitingBriefN: windowRows.length,
      presumedN: 0,
      excludedN: 0,
      settledN: 0,
      briefRowN: 0,
      supersededBriefN: 0,
    },
    presumption: null,
    refusals: [{
      kind: 'no-plan',
      personId: person.id,
      detail: 'This person sits on more than one reporting line and holds no active 30-60-90 plan. No line has recorded an onboarding obligation for them, and no plan exists for this module to reconcile.',
    }],
  };
}

/**
 * Every onboarding case in the workspace, worst first — the director's and the
 * VP's reading. ONE ROW PER PERSON: a person with two plans is one case with the
 * duplicate named on it, never two rows.
 */
export function buildOnboardingMatrix(state, { now = new Date(), settings = null, limit = ONBOARDING_MATRIX_LIMITS.board } = {}) {
  const conv = normalizeOnboardingMatrixSettings(settings || state?.settings || {});
  const today = dayKey(now);
  const order = new Map(ONBOARDING_MATRIX_VERDICTS.map((v) => [v.key, v.severity]));
  const openSet = new Set(ONBOARDING_MATRIX_VERDICTS.filter((v) => v.open).map((v) => v.key));
  const plans = Array.isArray(state?.onboarding) ? state.onboarding : [];
  const people = activePeople(state);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const cases = [];
  const seenPeople = new Set();
  const duplicatePlanRows = [];
  for (const plan of plans) {
    if (!plan || !plan.id || plan.status !== 'active') continue;
    if (!peopleById.has(plan.personId)) continue;
    const built = buildOnboardingMatrixCase(state, plan, { now, settings });
    if (!built.isMatrix) continue;
    if (seenPeople.has(plan.personId)) {
      // The SECOND active plan for the same person is not a second case: the
      // person is counted once and the duplicate is named on the first case.
      duplicatePlanRows.push({ personId: plan.personId, planId: plan.id });
      const first = cases.find((c) => c.personId === plan.personId);
      if (first && !first.duplicatePlanIds.includes(plan.id)) {
        first.duplicatePlanIds.push(plan.id);
        first.duplicatePlanIds.sort();
      }
      continue;
    }
    seenPeople.add(plan.personId);
    cases.push(built);
  }
  // A matrix person with no active plan at all. Derived here, at the board level,
  // because "there is no plan" cannot be found by walking plans.
  for (const person of people) {
    if (seenPeople.has(person.id)) continue;
    if (activePlansFor(state, person.id).length) continue;
    const built = buildUnplannedCase(state, person, { now, settings });
    if (!built.isMatrix) continue;
    seenPeople.add(person.id);
    cases.push(built);
  }

  cases.sort((a, b) => (order.get(a.verdict) ?? 9) - (order.get(b.verdict) ?? 9)
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.planId || '').localeCompare(String(b.planId || '')));

  const open = cases.filter((c) => openSet.has(c.verdict));
  const byVerdict = new Map(ONBOARDING_MATRIX_VERDICTS.map((v) => [v.key, 0]));
  for (const c of cases) byVerdict.set(c.verdict, (byVerdict.get(c.verdict) || 0) + 1);
  const sum = (picker) => cases.reduce((acc, c) => acc + picker(c), 0);
  const activePlanCount = plans.filter((p) => p && p.status === 'active' && peopleById.has(p.personId)).length;
  const matrixPeopleN = new Set(cases.map((c) => c.personId)).size;

  return {
    engineVersion: ONBOARDING_MATRIX_ENGINE_VERSION,
    conventions: conv,
    today,
    cases,
    shown: cases.slice(0, limit),
    truncatedN: Math.max(0, cases.length - limit),
    caseN: cases.length,
    // A count of DISTINCT PEOPLE, never of plan-line pairs — the double-count the
    // Matrix Leadership Mandate forbids.
    peopleN: matrixPeopleN,
    openN: open.length,
    completeN: cases.filter((c) => c.verdict === 'complete').length,
    settledWithDeclinesN: cases.filter((c) => c.verdict === 'settled-with-declines').length,
    duplicateCaseN: cases.filter((c) => c.duplicatePlanIds.length).length,
    duplicatePlanRowsN: duplicatePlanRows.length,
    unplannedN: cases.filter((c) => c.verdict === 'unplanned-matrix').length,
    // Every plan in the workspace, and how many of them the matrix reading needed.
    // "how many plans exist" and "how many people sit on more than one line" are
    // different questions, and the difference is printed rather than hidden inside
    // a single total.
    activePlanN: activePlanCount,
    singleLinePlanN: Math.max(0, activePlanCount - cases.filter((c) => c.hasPlan).length),
    lineN: sum((c) => c.totals.windowLineN),
    acknowledgedLinesN: sum((c) => c.totals.acknowledgedN),
    briefedLinesN: sum((c) => c.totals.briefedN),
    acknowledgementOverdueLinesN: sum((c) => c.totals.acknowledgementOverdueN),
    declinedLinesN: sum((c) => c.totals.declinedN),
    unbriefedLinesN: sum((c) => c.totals.unbriefedN),
    awaitingBriefLinesN: sum((c) => c.totals.awaitingBriefN),
    presumedLinesN: sum((c) => c.totals.presumedN),
    excludedLinesN: sum((c) => c.totals.excludedN),
    byVerdict: ONBOARDING_MATRIX_VERDICTS.map((v) => ({ key: v.key, label: v.label, n: byVerdict.get(v.key) || 0 })),
    duplicatePlanRows,
  };
}

/** Attention badge: matrix onboarding cases with an outstanding step. */
export function onboardingMatrixAttentionCount(state, { now = new Date(), settings = null } = {}) {
  return buildOnboardingMatrix(state, { now, settings, limit: 0 }).openN;
}

/**
 * The identity-free brief a VP can put in a pack. Every figure is stated
 * separately because each is a different fact, and the two completion claims are
 * never merged into one reassuring word.
 */
export function onboardingMatrixBriefText(state, { now = new Date(), settings = null } = {}) {
  const board = buildOnboardingMatrix(state, { now, settings, limit: 0 });
  if (!board.caseN) {
    return `Matrix onboarding completeness — ${board.today}: no person in this workspace sits on more than one reporting line while onboarding. There is nothing to reconcile, which is a different claim than “every line onboarded everybody”.`;
  }
  const lines = [
    `Matrix onboarding completeness — ${board.today}.`,
    `${board.peopleN} person(s) sit on more than one reporting line during their onboarding window; ${board.completeN + board.settledWithDeclinesN} case(s) are settled across their lines and ${board.openN} carry an outstanding step.`,
    `Lines across those cases: ${board.acknowledgedLinesN} briefed and acknowledged by the person, ${board.briefedLinesN} briefed and awaiting acknowledgement, ${board.acknowledgementOverdueLinesN} briefed with acknowledgement overdue, ${board.declinedLinesN} declined with a stated reason, ${board.unbriefedLinesN} never briefed past the declared window, ${board.awaitingBriefLinesN} still inside it, and ${board.presumedLinesN} home line(s) carried by the plan as a printed presumption.`,
    `${board.duplicateCaseN} case(s) hold more than one concurrent plan for the same person, and ${board.unplannedN} multi-line person(s) hold no active plan at all.`,
    'A completed 30-60-90 plan is NOT reported as cross-line completion: the plan’s own health and every line’s onboarding are separate claims, and no line share of a person is ever derived here.',
  ];
  if (board.singleLinePlanN) lines.push(`${board.singleLinePlanN} further 30-60-90 plan(s) are single-chain and are unaffected by this reading.`);
  return lines.join(' ');
}

/**
 * Aggregate-only export. ONE row per case × line, carrying the line's role, kind
 * and derived state plus its dates and counts — and NO person name, NO manager
 * name, NO manager id, NO brief text and NO stakeholder name. A brief is a
 * manager's words about a person; the export carries the FACT that it exists and
 * was acknowledged, never the words.
 */
export function onboardingMatrixCsvRows(state, { now = new Date(), settings = null } = {}) {
  const board = buildOnboardingMatrix(state, { now, settings, limit: Number.MAX_SAFE_INTEGER });
  const rows = [];
  for (const c of board.cases) {
    for (const line of c.lines) {
      rows.push({
        case_ref: c.planId || `unplanned:${c.personId}`,
        plan_state: c.hasPlan ? (c.planComplete ? 'completed' : 'active') : 'none',
        plan_kind: c.kind || '',
        start_on: c.startDate || '',
        window_end_on: c.windowEnd || '',
        verdict: c.verdict,
        is_matrix: c.isMatrix ? 'yes' : 'no',
        duplicate_plan_n: c.duplicatePlanIds.length,
        cross_line_complete: c.crossLineComplete ? 'yes' : 'no',
        cross_line_settled: c.crossLineSettled ? 'yes' : 'no',
        line_role: line.role,
        line_kind: line.kind,
        in_window: line.inWindow ? 'yes' : 'no',
        exclusion_reason: line.inWindow ? '' : line.reason,
        from_on: line.fromISO || '',
        to_on: line.toISO || '',
        line_state: line.state,
        settled: line.settled ? 'yes' : 'no',
        brief_due_on: line.briefDueOn || '',
        brief_overdue: line.overdue ? 'yes' : 'no',
        brief_overdue_days: line.overdueDays ?? '',
        brief_declared_on: line.brief?.declaredOn || '',
        brief_outcome: line.brief?.outcome || '',
        brief_scope_chars: line.brief?.scope ? line.brief.scope.length : '',
        brief_first_work_chars: line.brief?.firstWork ? line.brief.firstWork.length : '',
        brief_stakeholders_n: line.brief ? line.brief.stakeholdersN : '',
        superseded_brief_n: line.supersededBriefN,
        acknowledgement_due_on: line.ackDueOn || '',
        acknowledged_on: line.brief?.acknowledgedOn || '',
        acknowledgement_overdue: line.ackOverdue ? 'yes' : 'no',
        acknowledgement_overdue_days: line.ackOverdueDays ?? '',
        decline_reason_chars: line.brief?.reason ? line.brief.reason.length : '',
      });
    }
  }
  return rows;
}

export const ONBOARDING_MATRIX_CSV_COLUMNS = Object.freeze([
  'case_ref', 'plan_state', 'plan_kind', 'start_on', 'window_end_on', 'verdict', 'is_matrix',
  'duplicate_plan_n', 'cross_line_complete', 'cross_line_settled', 'line_role', 'line_kind', 'in_window', 'exclusion_reason',
  'from_on', 'to_on', 'line_state', 'settled', 'brief_due_on', 'brief_overdue', 'brief_overdue_days',
  'brief_declared_on', 'brief_outcome', 'brief_scope_chars', 'brief_first_work_chars',
  'brief_stakeholders_n', 'superseded_brief_n', 'acknowledgement_due_on', 'acknowledged_on',
  'acknowledgement_overdue', 'acknowledgement_overdue_days', 'decline_reason_chars',
]);
