/**
 * app/core/domain/prospectiveRules.js — RULE-PIC-01..04 on the shared
 * post-commit spine (ADR-0094, Schema v97).
 *
 *  RULE-PIC-01 DECLARE. A frozen pre-registration becomes a first-class graph
 *    node: one governed DACI decision (the approved operational work, kept
 *    SEPARATE from the frozen numeric assumptions), one owned dated outcome
 *    task, one `pre-registers` edge to that decision, and one `rolls-up-to` edge
 *    to EVERY leadership ancestor of the declaring seat — all in the SAME atomic
 *    transaction as the declaration. Cross-module automation and cross-altitude
 *    roll-up are one write, not two systems.
 *
 *  RULE-PIC-02 GRADE. On an explicit scan, each due contract resolves its
 *    frozen cohort from records OTHER modules already own. A resolvable cohort
 *    gets exactly ONE immutable grade, a `grades-outcome` provenance edge and a
 *    vertical fan-out. An unresolvable cohort is REFUSED with a printed reason
 *    and owes one owned reconciliation task — never scored as a miss, never a
 *    silent no-op.
 *
 *  RULE-PIC-03 CALIBRATE. A cell (altitude × instrument) whose sequential
 *    Brier skill is below the declared floor, with enough evidence to publish,
 *    opens exactly ONE governed calibration decision per ISO week at the
 *    altitude that can change the practice. The engine never adjusts a declared
 *    probability and never rates a person.
 *
 *  RULE-PIC-04 OVERDUE. A due contract that still has no grade after the review
 *    window opens ONE governed outcome-integrity decision per ISO week. Waiting
 *    is never a silent dismissal.
 *
 * All four are bounded, marker-idempotent and pausable via
 * `prospectiveAutoPropagate`; an explicit `prospective.scan` always runs.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import {
  brierFor,
  buildProspectiveCells,
  prospectiveHash,
  prospectiveBaseRate,
  prospectiveWeekKey,
  resolveOutcome,
} from './prospective.js';
import { prospectiveConventions } from './prospectiveSchema.js';
import {
  PROSPECTIVE_ENGINE_VERSION,
  PROSPECTIVE_EVENTS,
  PROSPECTIVE_INSTRUMENT_BY_KEY,
  PROSPECTIVE_LIMITS,
  PROSPECTIVE_RULE_IDS,
  PROSPECTIVE_TRIGGER_PREFIX,
} from './prospectiveRegistry.js';

const markerId = (kind, key) => `pic-${kind}-${prospectiveHash(String(key)).slice(0, 10)}`;

function markersOf(draft) {
  return Array.isArray(draft.prospectiveMarkers) ? draft.prospectiveMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.prospectiveMarkers)) draft.prospectiveMarkers = [];
  if (draft.prospectiveMarkers.some((row) => row?.id === marker.id)) return false;
  draft.prospectiveMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.prospectiveMarkers.length > PROSPECTIVE_LIMITS.markers) {
    draft.prospectiveMarkers.splice(0, draft.prospectiveMarkers.length - PROSPECTIVE_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: String(summary).slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId || '',
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  }
}

/** Every leadership ancestor of a declared seat, excluding the synthetic root. */
function ancestorsAbove(built, seatId) {
  if (!seatId || !built.byId.has(seatId)) return [];
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== 'leader' && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

/** Roll-up targets: the declaring seat's ancestors, or the whole declared tree
 * for an undeclared workspace-wide contract. No synthetic node is ever linked. */
function rollupTargets(draft, ctx, contract, built) {
  const targets = new Set();
  if (contract.scopeSeatId && built.byId.has(contract.scopeSeatId) && contract.scopeSeatId !== 'leader') {
    for (const ancestorId of ancestorsAbove(built, contract.scopeSeatId)) targets.add(ancestorId);
  } else {
    for (const seat of built.seats) {
      if (seat.id !== 'leader' && seat.rank >= 2) targets.add(seat.id);
    }
  }
  const peopleIds = new Set((Array.isArray(draft.people) ? draft.people : []).map((p) => p && p.id));
  return [...targets].filter((id) => peopleIds.has(id)).slice(0, PROSPECTIVE_LIMITS.cohortCap);
}

function fanOut(draft, ctx, built, nodeType, nodeId, contract, ruleId, label) {
  let links = 0;
  for (const seatId of rollupTargets(draft, ctx, contract, built)) {
    if (addLink(draft, ctx, nodeType, nodeId, 'person', seatId, 'rolls-up-to', ruleId,
      `${label} rolls up to this leadership span in the same transaction.`)) links += 1;
  }
  return links;
}

function ownerFor(draft, built, contract) {
  if (contract.scopeSeatId && built.byId.has(contract.scopeSeatId) && contract.scopeSeatId !== 'leader') return contract.scopeSeatId;
  const candidate = (Array.isArray(draft.people) ? draft.people : []).find((p) => p && p.status === 'active' && built.byId.has(p.id));
  return candidate ? candidate.id : 'leader';
}

function pushDecision(draft, ctx, { title, question, driver, approver, rationale, reviewOn, ruleId }) {
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  if (draft.decisions.length >= 5000) return null;
  const decision = {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(driver).slice(0, 120),
    approver: String(approver).slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Keep the current practice', pros: 'No new process cost.', cons: 'The measured miscalibration persists.' },
      { id: ctx.idFactory('opt'), label: 'Change the practice and re-declare', pros: 'Creates a new, out-of-sample cohort to grade.', cons: 'Costs one cycle before the change can be judged.' },
      { id: ctx.idFactory('opt'), label: 'Record why the cell is not comparable', pros: 'Names a structural reason instead of a false score.', cons: 'An exemption is not evidence.' },
    ],
    chosen: '',
    rationale: String(rationale).slice(0, 900),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
  draft.decisions.push(decision);
  return decision;
}

function pushTask(draft, ctx, { title, expectedOutcome, personId, dueOn, ruleId }) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  if (draft.delegations.length >= 8000) return null;
  const task = {
    id: ctx.idFactory('dlg'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `Opened by ${ruleId} on the shared post-commit spine. This is owned work, not a rating of the owner.`,
    delegatedOn: dayKey(ctx.now),
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
  draft.delegations.push(task);
  return task;
}

/* ------------------------------------------------------- RULE-PIC-01: declare */

function declareRule(draft, ctx, built, out, conventions) {
  const contracts = Array.isArray(draft.prospectiveContracts) ? draft.prospectiveContracts : [];
  const contract = contracts.find((row) => row?.id === ctx.event.entityId) || null;
  if (!contract) return 0;
  const id = markerId('declared', contract.id);
  if (markersOf(draft).some((row) => row?.id === id)) return 0;
  const instrument = PROSPECTIVE_INSTRUMENT_BY_KEY[contract.instrumentKey];
  const ownerId = ownerFor(draft, built, contract);
  const decision = pushDecision(draft, ctx, {
    title: `Approve the work behind this pre-registered bet (${instrument ? instrument.label : contract.instrumentKey})`,
    question: [
      `A bet was pre-registered on ${contract.declaredOn}: with ${contract.probabilityPct}% probability, at least ${contract.thresholdPct}% of a frozen cohort of ${contract.cohortN} ${instrument ? instrument.unit : 'record(s)'} will reach ${instrument ? instrument.terminalLabel : 'its terminal state'} by ${contract.horizonOn}.`,
      'The assumptions are frozen in the contract ledger and are NOT editable here. Decide the operational work: what will actually be done, by whom, and what would make you stop.',
      'A grade later says only whether the declared threshold was reached. It is not a causal claim and not a rating of a person.',
    ].join(' '),
    driver: 'Prospective intervention contract',
    approver: `${contract.altitudeKey || 'declaring'} span owner`,
    rationale: `[${PROSPECTIVE_RULE_IDS.declared}] Governed operational work for a frozen pre-registration. Opened by the engine; resolved only by a human. The numeric assumptions stay in the contract ledger, never in this decision.`,
    reviewOn: contract.horizonOn,
    ruleId: PROSPECTIVE_RULE_IDS.declared,
  });
  const task = pushTask(draft, ctx, {
    title: `Record the outcome evidence for this frozen cohort by ${addDays(contract.horizonOn, conventions.prospectiveReviewDays)}`,
    expectedOutcome: 'A dated, observable terminal record for every member of the frozen cohort. If a member cannot be resolved, record why: the grade is refused, never assumed.',
    personId: ownerId,
    dueOn: addDays(contract.horizonOn, conventions.prospectiveReviewDays),
    ruleId: PROSPECTIVE_RULE_IDS.declared,
  });
  let links = 0;
  if (decision && addLink(draft, ctx, 'prospectivecontract', contract.id, 'decision', decision.id,
    'pre-registers', PROSPECTIVE_RULE_IDS.declared,
    'This frozen bet pre-registers the governed operational work; the assumptions are not copied into the decision.')) links += 1;
  if (task && addLink(draft, ctx, 'prospectivecontract', contract.id, 'delegation', task.id,
    'tracks-followup', PROSPECTIVE_RULE_IDS.declared,
    'The owned, dated outcome-evidence work owed by this frozen contract.')) links += 1;
  const vertical = fanOut(draft, ctx, built, 'prospectivecontract', contract.id, contract,
    PROSPECTIVE_RULE_IDS.declared, 'A frozen pre-registration of work in this span');
  addMarker(draft, ctx, {
    id, kind: 'declared', contractId: contract.id, gradeId: null, cellKey: null,
    decisionId: decision ? decision.id : null, taskId: task ? task.id : null,
    weekKey: null,
    note: `Frozen cohort of ${contract.cohortN}; ${links} typed work edge(s) and ${vertical} vertical roll-up edge(s) written.`,
  });
  note(ctx, out, PROSPECTIVE_RULE_IDS.declared, 'created', 'prospectivecontract', contract.id,
    `One governed decision, one owned outcome task and ${vertical} vertical roll-up edge(s) created in the same atomic transaction.`);
  return 1;
}

/* --------------------------------------------------------- RULE-PIC-02: grade */

function inScanScope(draft, ctx, built, contract) {
  if (ctx.event.entity === 'workspace' || ctx.event.entityId === 'all') return true;
  const seatId = ctx.event.entityId;
  if (!seatId || !built.byId.has(seatId)) return true;
  if (contract.scopeSeatId === seatId) return true;
  const seat = built.byId.get(seatId);
  return Boolean(contract.scopeSeatId && seat.scope.has(contract.scopeSeatId));
}

function gradeRule(draft, ctx, built, out, conventions) {
  const contracts = Array.isArray(draft.prospectiveContracts) ? draft.prospectiveContracts : [];
  const grades = Array.isArray(draft.prospectiveGrades) ? draft.prospectiveGrades : [];
  const graded = new Set(grades.map((g) => g && g.contractId));
  const today = dayKey(ctx.now);
  const due = contracts.filter((c) => c && !graded.has(c.id) && today >= c.horizonOn && inScanScope(draft, ctx, built, c));
  const capped = due.slice(0, PROSPECTIVE_LIMITS.gradesPerScan);
  let written = 0;
  for (const contract of capped) {
    const gradeMarker = markerId('graded', contract.id);
    if (markersOf(draft).some((row) => row?.id === gradeMarker)) continue;
    const result = resolveOutcome(draft, contract, { now: ctx.now, reviewDays: conventions.prospectiveReviewDays });
    if (!result.ok) {
      const refusalId = markerId('ungradable', `${contract.id}|${prospectiveWeekKey(ctx.now)}`);
      if (markersOf(draft).some((row) => row?.id === refusalId)) continue;
      const task = pushTask(draft, ctx, {
        title: `Reconcile the unobservable cohort for a frozen contract (${contract.instrumentKey})`,
        expectedOutcome: `A dated terminal record for the ${contract.cohortN} frozen member(s), or a written reason a member cannot be resolved. ${result.reason}`,
        personId: ownerFor(draft, built, contract),
        dueOn: addDays(today, 7),
        ruleId: PROSPECTIVE_RULE_IDS.grade,
      });
      addMarker(draft, ctx, {
        id: refusalId, kind: 'ungradable', contractId: contract.id, gradeId: null, cellKey: null,
        decisionId: null, taskId: task ? task.id : null, weekKey: prospectiveWeekKey(ctx.now),
        note: `Grade refused: ${result.reason}`.slice(0, PROSPECTIVE_LIMITS.noteMax),
      });
      note(ctx, out, PROSPECTIVE_RULE_IDS.grade, 'refused', 'prospectivecontract', contract.id,
        `Outcome refused and one owned reconciliation task opened. ${result.reason}`);
      continue;
    }
    const base = prospectiveBaseRate(draft.prospectiveGrades || [], contract, {
      priorFloor: Math.max(2, Math.min(conventions.prospectiveCellFloor, 5)),
      outcome: result.outcome,
    });
    const grade = {
      id: ctx.idFactory('pgrade'),
      contractId: contract.id,
      gradedOn: today,
      declaredOn: contract.declaredOn,
      horizonOn: contract.horizonOn,
      scopeSeatId: contract.scopeSeatId,
      altitudeKey: contract.altitudeKey,
      rank: contract.rank,
      instrumentKey: contract.instrumentKey,
      probabilityPct: contract.probabilityPct,
      thresholdPct: contract.thresholdPct,
      cohortN: contract.cohortN,
      observedN: result.observedN,
      reachedN: result.reachedN,
      observedPct: result.observedPct,
      outcome: result.outcome,
      brier: brierFor(contract.probabilityPct, result.outcome),
      baseRatePct: base.baseRatePct,
      referenceBrier: base.referenceBrier,
      late: result.late,
      engineVersion: PROSPECTIVE_ENGINE_VERSION,
      createdAt: ctx.now.toISOString(),
    };
    if (!Array.isArray(draft.prospectiveGrades)) draft.prospectiveGrades = [];
    draft.prospectiveGrades.push(grade);
    let links = 0;
    if (addLink(draft, ctx, 'prospectivegrade', grade.id, 'prospectivecontract', contract.id,
      'grades-outcome', PROSPECTIVE_RULE_IDS.grade,
      `Once-only Brier grade of the frozen ${contract.cohortN}-record cohort; no causality is asserted.`)) links += 1;
    const vertical = fanOut(draft, ctx, built, 'prospectivegrade', grade.id, contract,
      PROSPECTIVE_RULE_IDS.grade, 'An out-of-sample grade of one pre-registered bet');
    addMarker(draft, ctx, {
      id: gradeMarker, kind: 'graded', contractId: contract.id, gradeId: grade.id, cellKey: null,
      decisionId: null, taskId: null, weekKey: null,
      note: `Observed ${result.reachedN}/${result.observedN}; outcome ${result.outcome}; Brier ${grade.brier}; ${links + vertical} typed edge(s).`,
    });
    written += 1;
    note(ctx, out, PROSPECTIVE_RULE_IDS.grade, 'created', 'prospectivegrade', grade.id,
      `Graded once from ${result.reachedN}/${result.observedN} frozen records (Brier ${grade.brier}); ${vertical} vertical roll-up edge(s).`);
  }
  if (due.length > capped.length) {
    note(ctx, out, PROSPECTIVE_RULE_IDS.grade, 'bounded', 'prospectivecontract', null,
      `${due.length} contract(s) were due and ${capped.length} were graded in this commit; the rest are carried to the next scan.`);
  }
  return written;
}

/* --------------------------------------------------- RULE-PIC-03: calibrate */

function calibrationRule(draft, ctx, built, out, conventions) {
  const contracts = Array.isArray(draft.prospectiveContracts) ? draft.prospectiveContracts : [];
  const grades = Array.isArray(draft.prospectiveGrades) ? draft.prospectiveGrades : [];
  const week = prospectiveWeekKey(ctx.now);
  // The chief/exec read model publishes cells; the rank-5 ceiling keeps the
  // governance decision at the altitude that can actually change a practice.
  const cells = buildProspectiveCells(contracts, grades, { conventions, rank: 5 });
  const breaching = cells.filter((cell) => !cell.refused && !cell.suppressed
    && cell.skillPct !== null && cell.skillPct < conventions.prospectiveSkillFloorPct)
    .slice(0, PROSPECTIVE_LIMITS.decisionsPerScan);
  let opened = 0;
  for (const cell of breaching) {
    const id = markerId('calibration', `${cell.key}|${week}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const sample = contracts.find((c) => c && (c.altitudeKey || 'unknown') === cell.altitudeKey && c.instrumentKey === cell.instrumentKey);
    const decision = pushDecision(draft, ctx, {
      title: `Calibration below the declared floor: ${cell.altitudeKey} / ${cell.instrumentKey}`,
      question: [
        `Over ${cell.gradedN} graded pre-registered bets in this cell, mean Brier is ${cell.meanBrier} against a strictly-prior base-rate reference of ${cell.meanReferenceBrier}: Brier skill ${cell.skillPct}%, below the declared floor of ${conventions.prospectiveSkillFloorPct}%.`,
        `Wilson 95% interval for the realised-threshold rate: ${cell.lowPct}–${cell.highPct}%.`,
        'Decide whether the practice, the instrument or the declared horizons should change. The engine never adjusts a declared probability and never rates a person.',
      ].join(' '),
      driver: 'Prospective calibration ledger',
      approver: 'Director-or-above span owner',
      rationale: `[${PROSPECTIVE_RULE_IDS.calibration}] Cell ${cell.key} graded out of sample below the declared skill floor. One governed decision per cell per ISO week. No person is named or scored.`,
      reviewOn: addDays(dayKey(ctx.now), 14),
      ruleId: PROSPECTIVE_RULE_IDS.calibration,
    });
    if (!decision) continue;
    const vertical = sample
      ? fanOut(draft, ctx, built, 'decision', decision.id, sample, PROSPECTIVE_RULE_IDS.calibration, 'A governed calibration finding')
      : 0;
    addMarker(draft, ctx, {
      id, kind: 'calibration', contractId: null, gradeId: null, cellKey: cell.key,
      decisionId: decision.id, taskId: null, weekKey: week,
      note: `Skill ${cell.skillPct}% below floor ${conventions.prospectiveSkillFloorPct}%; ${vertical} vertical edge(s).`,
    });
    opened += 1;
    note(ctx, out, PROSPECTIVE_RULE_IDS.calibration, 'created', 'decision', decision.id,
      `Opened one governed calibration decision for a cell below the reliability floor (skill ${cell.skillPct}%).`);
  }
  return opened;
}

/* ------------------------------------------------------ RULE-PIC-04: overdue */

function overdueRule(draft, ctx, built, out, conventions) {
  const contracts = Array.isArray(draft.prospectiveContracts) ? draft.prospectiveContracts : [];
  const graded = new Set((Array.isArray(draft.prospectiveGrades) ? draft.prospectiveGrades : []).map((g) => g && g.contractId));
  const today = dayKey(ctx.now);
  const overdue = contracts.filter((c) => c && !graded.has(c.id)
    && today > addDays(c.horizonOn, conventions.prospectiveReviewDays)
    && inScanScope(draft, ctx, built, c));
  if (!overdue.length) return 0;
  const week = prospectiveWeekKey(ctx.now);
  const id = markerId('overdue', week);
  if (markersOf(draft).some((row) => row?.id === id)) return 0;
  const decision = pushDecision(draft, ctx, {
    title: `${overdue.length} pre-registered bet(s) are past the outcome review window`,
    question: [
      `${overdue.length} frozen contract(s) passed their horizon plus the ${conventions.prospectiveReviewDays}-day review window without a grade.`,
      'A contract that cannot be resolved owes a written reason; it is never scored as a miss and never silently dismissed.',
      'Decide whether to repair the dated evidence, narrow the instrument, or record why these cohorts cannot be judged.',
    ].join(' '),
    driver: 'Prospective outcome integrity',
    approver: 'Director-or-above span owner',
    rationale: `[${PROSPECTIVE_RULE_IDS.overdue}] One governed outcome-integrity decision per ISO week for overdue ungraded cohorts. Waiting is never a silent dismissal.`,
    reviewOn: addDays(today, 14),
    ruleId: PROSPECTIVE_RULE_IDS.overdue,
  });
  if (!decision) return 0;
  addMarker(draft, ctx, {
    id, kind: 'overdue', contractId: null, gradeId: null, cellKey: null,
    decisionId: decision.id, taskId: null, weekKey: week,
    note: `${overdue.length} contract(s) past the review window; one governed decision opened.`,
  });
  note(ctx, out, PROSPECTIVE_RULE_IDS.overdue, 'created', 'decision', decision.id,
    `${overdue.length} overdue ungraded contract(s) opened one governed outcome-integrity decision.`);
  return 1;
}

export function prospectiveRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === PROSPECTIVE_EVENTS.SCAN;
  const own = event.type.startsWith(PROSPECTIVE_TRIGGER_PREFIX);
  if (!explicit && !own) return [];
  const conventions = prospectiveConventions(ctx.settings || draft.settings || {});
  if (!explicit && conventions.prospectiveAutoPropagate === false) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const out = [];
  if (event.type === PROSPECTIVE_EVENTS.DECLARED) declareRule(draft, runCtx, built, out, conventions);
  if (explicit) {
    gradeRule(draft, runCtx, built, out, conventions);
    calibrationRule(draft, runCtx, built, out, conventions);
    overdueRule(draft, runCtx, built, out, conventions);
  }
  return out;
}

export const PROSPECTIVE_SECONDARY_EVENTS = Object.freeze([
  PROSPECTIVE_EVENTS.SCAN, PROSPECTIVE_EVENTS.CONVENTIONS,
]);
