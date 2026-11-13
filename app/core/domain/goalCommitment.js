/**
 * app/core/domain/goalCommitment.js — the pure read model for the Cross-Line
 * Goal Commitment Conflict register (ADR-0193 + ADR-0194, Schema v154,
 * `#/matrix?panel=commitments`, CSV scope #145).
 *
 * ONE reader. The panel, the CSV, the brief, the nav badge and `RULE-GCC-01`
 * all read `buildGoalCommitments`; none of them computes an overlap, a verdict,
 * a peak day or a rate of its own. Nothing here writes.
 *
 * WHAT IT DERIVES
 *  - per declaration, its standing: live · no-line · superseded · released ·
 *    goal-closed · owner-moved · owner-off-roster · line-ended · holder-moved ·
 *    line-defective (ten states, never collapsed into "inactive");
 *  - per PAIR of live commitments on one owner, the exact inclusive overlap in
 *    whole days and one of six mutually exclusive verdicts;
 *  - the measure claim on a colliding pair: opposed · aligned ·
 *    different-measure · undeclared — from declared keys only, plus the target
 *    magnitude claim for aligned targets: divergent · within-floor · unit-mismatch
 *    · undeclared, in exact scaled integer arithmetic;
 *  - the capacity sweep: the exact day of maximum concurrent declared effort,
 *    the integer sum on it, and the person-level and per-line verdicts, which
 *    are a SEPARATE claim from any pair;
 *  - per live goal of a multi-line owner, whether a line was ever named for it;
 *  - the attribution rate with its Wilson interval, withheld below the floor;
 *  - per-holder and per-joint-apex roll-ups in which a conflict is counted ONCE
 *    however many lines reach the apex.
 *
 * WHAT IT REFUSES
 *  - a home-line guess: a goal with no declared line is `unattributed`, counted,
 *    and never charged to `person.managerId`;
 *  - a rate below the declared floor (counts only);
 *  - a per-line capacity reading where the line declared no share;
 *  - a window repair: a window past the goal's own due date is printed as a
 *    contradiction, never clamped to it;
 *  - a measure, target value, target unit, or unit conversion read out of a
 *    goal's title, description or key results;
 *  - a person name outside the seat's visible population (the id is printed).
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixWilson } from './matrix.js';
import { shareHToDisplay } from './matrixSchema.js';
import {
  GOAL_COMMITMENT_ATTRIBUTION_BY_KEY,
  GOAL_COMMITMENT_CAPACITY_BY_KEY,
  GOAL_COMMITMENT_ENGINE_VERSION,
  GOAL_COMMITMENT_FRAMEWORKS,
  GOAL_COMMITMENT_HOME_LINE,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_MAGNITUDE_BY_KEY,
  GOAL_COMMITMENT_MEASURE_BY_KEY,
  GOAL_COMMITMENT_METHOD,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_OWNER_VERDICTS,
  GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY,
  GOAL_COMMITMENT_PAIR_VERDICTS,
  GOAL_COMMITMENT_PAIR_VERDICT_BY_KEY,
  GOAL_COMMITMENT_PERSON_BASIS_H,
  GOAL_COMMITMENT_REFUSAL_BY_KEY,
  GOAL_COMMITMENT_SETTING_KEYS,
  GOAL_COMMITMENT_STATE_BY_KEY,
} from './goalCommitmentRegistry.js';
import {
  goalCommitmentInclusiveDays,
  goalCommitmentOverlapDays,
  goalCommitmentTargetParts,
  normalizeGoalCommitmentSettings,
} from './goalCommitmentSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);
const round1 = (n) => Math.round(n * 10) / 10;
const PAIR_RANK = new Map(GOAL_COMMITMENT_PAIR_VERDICTS.map((row) => [row.key, row.rank]));
/** The pair verdicts that involve two DIFFERENT reporting lines. */
const CROSS_LINE_PAIRS = new Set(['compatible', 'date-overlap', 'magnitude-conflict', 'target-conflict']);

/* --------------------------------------------------------------- the graph */

function nameLookup(state, matrix) {
  const former = new Map(list(state?.people).map((person) => [person.id, person.name]));
  return (id) => (id ? (matrix.nodes.get(id)?.name || former.get(id) || 'Former colleague') : '—');
}

const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

/**
 * Which matrix-engine refusals are CURRENT, as opposed to a historical edge that
 * has since been dated out. A commitment naming a line the graph refuses today
 * is withheld; one naming a line that was merely defective last year is not.
 */
function currentDefects(state, matrix) {
  const rawById = new Map(list(state.reportingLines)
    .filter((row) => row?.id).map((row) => [row.id, row]));
  const lineIds = new Set();
  const homePeople = new Set();
  for (const defect of matrix.defects) {
    if (!defect.lineId) {
      // A malformed home edge is current by definition: it is `person.managerId`.
      if (defect.personId) homePeople.add(defect.personId);
      continue;
    }
    const row = rawById.get(defect.lineId);
    // A missing source row cannot be proved historical, so it is treated as current.
    if (!row) { lineIds.add(defect.lineId); continue; }
    if (validDay(row.fromISO) && row.fromISO > matrix.today) continue;
    if (validDay(row.toISO) && row.toISO < matrix.today) continue;
    lineIds.add(defect.lineId);
  }
  return { lineIds, homePeople };
}

/* ------------------------------------------------------------- measure claim */

/**
 * The measure claim on a pair, from DECLARED keys only. `undeclared` and
 * `different-measure` are both honest absences and are printed apart: "neither
 * line said what it moves" is not the same fact as "the two lines named
 * different things".
 */
export function goalCommitmentMeasureClaim(a, b) {
  if (!a.measureKey || !b.measureKey) return 'undeclared';
  if (a.measureKey !== b.measureKey) return 'different-measure';
  // Directions come from a closed three-value set, so "not equal" IS opposed:
  // one line holding a measure steady while the other moves it is a
  // contradiction, not a difference of degree.
  return a.direction === b.direction ? 'aligned' : 'opposed';
}

/**
 * Exact relative divergence of two canonical decimal targets. Both are scaled
 * to one common power of ten, so no JavaScript float can turn a threshold edge
 * into a false conflict or false agreement. The numerator is absolute distance;
 * the denominator is the larger declared magnitude. Two zero targets are exact
 * agreement; zero against a positive target is 100% divergent. Values never
 * appear in the aggregate export or upward brief.
 */
export function goalCommitmentMagnitudeClaim(a, b, { crossLine = true, overlapDays = 1, measureClaim = null, divergencePct = 10 } = {}) {
  // An explicit no-line declaration has no second reporting-line principal.
  // It remains in the person's capacity sweep, but it cannot be a magnitude
  // comparison or a cross-line escalation candidate.
  const namedLines = a.lineKey !== GOAL_COMMITMENT_NO_LINE && b.lineKey !== GOAL_COMMITMENT_NO_LINE;
  const applicable = namedLines && crossLine && overlapDays > 0 && (measureClaim || goalCommitmentMeasureClaim(a, b)) === 'aligned';
  if (!applicable) return { key: 'not-applicable', delta: null, basis: null, divergencePct: null };
  const aValue = goalCommitmentTargetParts(a.targetValue || '');
  const bValue = goalCommitmentTargetParts(b.targetValue || '');
  const aUnit = String(a.targetUnit || '');
  const bUnit = String(b.targetUnit || '');
  if (!aValue || !bValue || !aUnit || !bUnit) return { key: 'undeclared', delta: null, basis: null, divergencePct: null };
  if (aUnit !== bUnit) return { key: 'unit-mismatch', delta: null, basis: null, divergencePct: null };
  const scale = Math.max(aValue.scale, bValue.scale);
  const scaleA = 10n ** BigInt(scale - aValue.scale);
  const scaleB = 10n ** BigInt(scale - bValue.scale);
  const aScaled = (aValue.whole * (10n ** BigInt(aValue.scale)) + aValue.fraction) * scaleA;
  const bScaled = (bValue.whole * (10n ** BigInt(bValue.scale)) + bValue.fraction) * scaleB;
  const delta = aScaled >= bScaled ? aScaled - bScaled : bScaled - aScaled;
  const basis = aScaled >= bScaled ? aScaled : bScaled;
  const threshold = BigInt(divergencePct) * basis;
  // Percentage comparison is `delta / basis >= pct / 100`, cross-multiplied
  // exactly. `basis === 0` only means both values are zero, hence agreement.
  const divergent = basis !== 0n && (delta * 100n >= threshold);
  const pct = basis === 0n ? 0 : Number((delta * 10000n) / basis) / 100;
  return {
    key: divergent ? 'divergent' : 'within-floor',
    delta: delta.toString(),
    basis: basis.toString(),
    scale,
    divergencePct: pct,
  };
}

/**
 * One pair verdict. Exhaustive and mutually exclusive, checked in this order:
 * a `no-line` commitment has no second principal at all, so it is settled before
 * the same-line test can misread two `no-line` rows as one line.
 */
export function goalCommitmentPairVerdict(a, b, overlapDays, { divergencePct = 10 } = {}) {
  if (a.lineKey === GOAL_COMMITMENT_NO_LINE || b.lineKey === GOAL_COMMITMENT_NO_LINE) return 'single-principal';
  if (a.lineKey === b.lineKey) return 'same-line';
  if (overlapDays <= 0) return 'compatible';
  const measureClaim = goalCommitmentMeasureClaim(a, b);
  if (measureClaim === 'opposed') return 'target-conflict';
  const magnitude = goalCommitmentMagnitudeClaim(a, b, { crossLine: true, overlapDays, measureClaim, divergencePct });
  return magnitude.key === 'divergent' ? 'magnitude-conflict' : 'date-overlap';
}

/* ---------------------------------------------------------- capacity sweep */

/**
 * The exact day of maximum concurrent declared effort, over a bounded set of
 * live commitments and a bounded horizon.
 *
 * A commitment's declared effort is CONSTANT across its window — it is a share
 * of the person, not a schedule — so the sum over days is a step function whose
 * maximum is attained at some window's first day. Testing exactly those days is
 * therefore an exact sweep, not a sampling, and it costs O(n²) on a set that is
 * bounded by the declarations one person can carry.
 *
 * Ties resolve to the EARLIEST day, and the covering rows are sorted by id, so
 * two reads of one record always print the same peak.
 */
export function goalCommitmentPeak(rows, today, horizonEnd) {
  const effective = [];
  let elapsedN = 0;
  let beyondHorizonN = 0;
  for (const row of rows) {
    if (row.windowTo < today) { elapsedN += 1; continue; }
    if (row.windowFrom > horizonEnd) { beyondHorizonN += 1; continue; }
    effective.push({
      ...row,
      effFrom: row.windowFrom > today ? row.windowFrom : today,
      effTo: row.windowTo < horizonEnd ? row.windowTo : horizonEnd,
    });
  }
  const base = { peakDay: null, peakSumH: null, peakCommitments: [], effectiveN: effective.length, elapsedN, beyondHorizonN };
  if (!effective.length) return base;
  const starts = [...new Set(effective.map((row) => row.effFrom))].sort();
  let best = null;
  for (const day of starts) {
    const covering = effective
      .filter((row) => row.effFrom <= day && day <= row.effTo)
      .map((row) => ({ id: row.id, lineKey: row.lineKey, effortShareH: row.effortShareH }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const sum = covering.reduce((total, row) => total + row.effortShareH, 0);
    if (!best || sum > best.peakSumH) best = { peakDay: day, peakSumH: sum, peakCommitments: covering };
  }
  return { ...base, ...best };
}

/* ---------------------------------------------------------------- the read */

export function buildGoalCommitments(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizeGoalCommitmentSettings(effective);
  const K = {
    askDueDays: conv[GOAL_COMMITMENT_SETTING_KEYS.askDueDays],
    horizonDays: conv[GOAL_COMMITMENT_SETTING_KEYS.horizonDays],
    minOverlapDays: conv[GOAL_COMMITMENT_SETTING_KEYS.minOverlapDays],
    minGoals: conv[GOAL_COMMITMENT_SETTING_KEYS.minGoals],
    magnitudeDivergencePct: conv[GOAL_COMMITMENT_SETTING_KEYS.magnitudeDivergencePct],
    auto: conv[GOAL_COMMITMENT_SETTING_KEYS.autoPropagate],
  };
  const today = dayKey(now);
  const horizonEnd = addDays(today, K.horizonDays);
  const matrix = buildMatrix(state, { now, settings: effective });
  const nameOfRaw = nameLookup(state, matrix);
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
  const inReach = (id) => operator || id === actorId || reach.has(id);
  const detailLevel = operator ? 'full' : (seat.detailLevel || 'span');
  const personName = (id) => (detailLevel !== 'full' && !inReach(id) ? id : nameOfRaw(id));

  const refusalCounts = new Map();
  const refuse = (key, n = 1) => refusalCounts.set(key, (refusalCounts.get(key) || 0) + n);

  const defective = currentDefects(state, matrix);
  const goals = list(state?.goals);
  const goalById = new Map(goals.filter((goal) => goal?.id).map((goal) => [goal.id, goal]));
  const liveGoals = goals.filter((goal) => goal?.id && goal.status === 'active');

  /* The declared share of each of a person's active lines, read from the ONE
     allocation resolver so this register never keeps a second idea of a share. */
  const declaredShareOf = (personId, lineKey) => {
    const lines = matrix.linesByPerson.get(personId) || [];
    const line = lines.find((row) => (lineKey === GOAL_COMMITMENT_HOME_LINE
      ? row.role === 'primary'
      : row.id === lineKey));
    if (!line) return null;
    return Number.isInteger(line.shareH) ? line.shareH : null;
  };

  /* ------------------------------------------------------- commitment rows */

  const commitments = list(state?.goalCommitments);
  const commitmentRows = commitments.map((row) => {
    const goal = goalById.get(row.goalId) || null;
    const ownerOnRoster = matrix.roster.has(row.ownerId);
    const lines = matrix.linesByPerson.get(row.ownerId) || [];
    const activeLines = lines.filter((line) => line.active !== false);
    const named = row.lineKey === GOAL_COMMITMENT_NO_LINE
      ? null
      : activeLines.find((line) => (row.lineKey === GOAL_COMMITMENT_HOME_LINE ? line.role === 'primary' : line.id === row.lineKey)) || null;

    let commitmentState = 'live';
    if (row.releasedOn) commitmentState = 'released';
    else if (row.supersededOn) commitmentState = 'superseded';
    else if (!goal || goal.status !== 'active') commitmentState = 'goal-closed';
    else if (goal.ownerId !== row.ownerId) commitmentState = 'owner-moved';
    else if (row.ownerId === LEADER_ID) commitmentState = 'owner-off-roster';
    else if (!ownerOnRoster) commitmentState = 'owner-off-roster';
    else if (row.lineKey === GOAL_COMMITMENT_NO_LINE) commitmentState = 'no-line';
    else if (defective.lineIds.has(row.lineKey) || (row.lineKey === GOAL_COMMITMENT_HOME_LINE && defective.homePeople.has(row.ownerId))) commitmentState = 'line-defective';
    else if (!named) commitmentState = 'line-ended';
    else if (named.managerId !== row.holderId) commitmentState = 'holder-moved';

    const comparable = GOAL_COMMITMENT_STATE_BY_KEY[commitmentState].comparable;
    const flags = [];
    if (comparable) {
      if (!goal?.dueDate) { flags.push('goal-undated'); refuse('goal-undated'); }
      else if (row.windowTo > goal.dueDate) { flags.push('window-beyond-goal-due'); refuse('window-beyond-goal-due'); }
      const createdDay = goal?.createdAt ? dayKey(goal.createdAt) : null;
      if (createdDay && row.windowFrom < createdDay) { flags.push('window-before-goal'); refuse('window-before-goal'); }
      if (row.windowFrom > horizonEnd) { flags.push('beyond-horizon'); refuse('beyond-horizon'); }
    }
    if (commitmentState === 'line-ended' || commitmentState === 'holder-moved') refuse('line-unreachable');
    if (commitmentState === 'owner-moved') refuse('owner-moved');
    if (commitmentState === 'owner-off-roster') refuse('owner-off-roster');
    if (commitmentState === 'line-defective') refuse('line-defective');

    return {
      commitmentId: row.id,
      goalId: row.goalId,
      goalTitle: goal?.title ? String(goal.title).slice(0, 200) : '(a goal no longer on the record)',
      goalStatus: goal?.status || 'missing',
      goalDueDate: goal?.dueDate || null,
      ownerId: row.ownerId,
      ownerName: personName(row.ownerId),
      lineKey: row.lineKey,
      lineLabel: row.lineKey === GOAL_COMMITMENT_NO_LINE
        ? 'no reporting line'
        : row.lineKey === GOAL_COMMITMENT_HOME_LINE
          ? 'home line'
          : (named?.kind || 'declared line'),
      holderId: row.holderId,
      holderName: row.holderId ? personName(row.holderId) : '—',
      windowFrom: row.windowFrom,
      windowTo: row.windowTo,
      windowDays: goalCommitmentInclusiveDays(row.windowFrom, row.windowTo),
      effortShareH: row.effortShareH,
      effortDisplay: shareHToDisplay(row.effortShareH),
      measureKey: row.measureKey || '',
      direction: row.direction,
      targetValue: row.targetValue || '',
      targetUnit: row.targetUnit || '',
      note: row.note || '',
      state: commitmentState,
      stateLabel: GOAL_COMMITMENT_STATE_BY_KEY[commitmentState].label,
      stateTone: GOAL_COMMITMENT_STATE_BY_KEY[commitmentState].tone,
      stateSays: GOAL_COMMITMENT_STATE_BY_KEY[commitmentState].says,
      comparable,
      closed: GOAL_COMMITMENT_STATE_BY_KEY[commitmentState].closed,
      flags,
      supersededById: row.supersededById,
      supersededOn: row.supersededOn,
      supersededReason: row.supersededReason,
      releasedOn: row.releasedOn,
      releasedReason: row.releasedReason,
      declaredById: row.declaredById,
      declaredByName: row.declaredById ? personName(row.declaredById) : 'the operator view',
      declaredOn: row.declaredOn,
    };
  });

  // A `no-line` declaration is not comparable *as a second principal*, but
  // it is a live declaration of person capacity and of goal attribution. Keep
  // that distinction here rather than converting it into a guessed home line.
  const liveRows = commitmentRows.filter((row) => row.comparable || row.state === 'no-line');
  const comparableRows = liveRows.filter((row) => row.lineKey !== GOAL_COMMITMENT_NO_LINE);
  const rowsByOwner = new Map();
  for (const row of liveRows) {
    if (!rowsByOwner.has(row.ownerId)) rowsByOwner.set(row.ownerId, []);
    rowsByOwner.get(row.ownerId).push(row);
  }
  // Every declaration per owner, comparable or not, so a person's closed and
  // unreachable history is counted on their row rather than vanishing from it.
  const allRowsByOwner = new Map();
  for (const row of commitmentRows) {
    if (!allRowsByOwner.has(row.ownerId)) allRowsByOwner.set(row.ownerId, []);
    allRowsByOwner.get(row.ownerId).push(row);
  }

  /* ------------------------------------------------------- goal attribution */

  const activeLinesOf = (personId) => (matrix.linesByPerson.get(personId) || []).filter((line) => line.active !== false);
  const goalsByOwner = new Map();
  const attributionRows = [];
  for (const goal of liveGoals) {
    const ownerId = goal.ownerId || null;
    let attributionState = 'declared';
    if (!ownerId) attributionState = 'ownerless';
    else if (ownerId === LEADER_ID) attributionState = 'leader-owned';
    else if (!matrix.roster.has(ownerId)) attributionState = 'off-roster';
    else if (activeLinesOf(ownerId).length < 2) attributionState = 'single-line';
    else {
      // Goal attribution asks whether a NAMED reporting line was declared. An
      // explicit `no-line` statement still consumes capacity, but it cannot turn
      // into a named principal or make a goal read attributed by absence.
      const declared = comparableRows.some((row) => row.ownerId === ownerId && row.goalId === goal.id);
      attributionState = declared ? 'declared' : 'unattributed';
      if (!declared) refuse('unattributed-goal');
    }
    attributionRows.push({ goalId: goal.id, goalTitle: String(goal.title || '').slice(0, 200), ownerId, ownerName: ownerId ? personName(ownerId) : '—', state: attributionState });
    if (ownerId) {
      if (!goalsByOwner.has(ownerId)) goalsByOwner.set(ownerId, []);
      goalsByOwner.get(ownerId).push(attributionRows.at(-1));
    }
  }

  /* ------------------------------------------------------------ owner rows */

  const ownerIds = [...new Set([
    ...[...rowsByOwner.keys()],
    ...attributionRows.filter((row) => row.ownerId && row.state !== 'off-roster' && row.state !== 'leader-owned' && row.state !== 'ownerless').map((row) => row.ownerId),
  ])].filter((id) => id && id !== LEADER_ID && matrix.roster.has(id));

  const ownerRows = ownerIds.map((personId) => {
    const activeLines = activeLinesOf(personId);
    const linesN = activeLines.length;
    const myCommitments = (rowsByOwner.get(personId) || [])
      .slice()
      .sort((a, b) => a.windowFrom.localeCompare(b.windowFrom) || a.windowTo.localeCompare(b.windowTo) || a.commitmentId.localeCompare(b.commitmentId));
    const liveN = myCommitments.length;
    const namedLiveN = myCommitments.filter((row) => row.lineKey !== GOAL_COMMITMENT_NO_LINE).length;
    const myGoals = goalsByOwner.get(personId) || [];

    /* Pairs: every unordered pair of live commitments, computed in full and
       truncated only for display so the total is never the truncated total. */
    const pairs = [];
    for (let i = 0; i < liveN; i += 1) {
      for (let j = i + 1; j < liveN; j += 1) {
        const a = myCommitments[i];
        const b = myCommitments[j];
        const overlapDays = goalCommitmentOverlapDays(a.windowFrom, a.windowTo, b.windowFrom, b.windowTo);
        const overlapFrom = a.windowFrom > b.windowFrom ? a.windowFrom : b.windowFrom;
        const overlapTo = a.windowTo < b.windowTo ? a.windowTo : b.windowTo;
        const measureClaim = goalCommitmentMeasureClaim(a, b);
        const magnitude = goalCommitmentMagnitudeClaim(a, b, { crossLine: a.lineKey !== b.lineKey, overlapDays, measureClaim, divergencePct: K.magnitudeDivergencePct });
        const verdict = goalCommitmentPairVerdict(a, b, overlapDays, { divergencePct: K.magnitudeDivergencePct });
        if (magnitude.key === 'undeclared') refuse('magnitude-undeclared');
        if (magnitude.key === 'unit-mismatch') refuse('magnitude-unit-mismatch');
        pairs.push({
          pairKey: `${a.commitmentId}|${b.commitmentId}`,
          aId: a.commitmentId, bId: b.commitmentId,
          aGoalTitle: a.goalTitle, bGoalTitle: b.goalTitle,
          aLineLabel: a.lineLabel, bLineLabel: b.lineLabel,
          aHolderId: a.holderId, bHolderId: b.holderId,
          aHolderName: a.holderName, bHolderName: b.holderName,
          aDirection: a.direction, bDirection: b.direction,
          aTargetValue: a.targetValue || '', bTargetValue: b.targetValue || '',
          aTargetUnit: a.targetUnit || '', bTargetUnit: b.targetUnit || '',
          measureKey: a.measureKey && a.measureKey === b.measureKey ? a.measureKey : '',
          targetUnit: magnitude.key === 'unit-mismatch' ? '' : (a.targetUnit && a.targetUnit === b.targetUnit ? a.targetUnit : ''),
          magnitudeClaim: magnitude.key,
          magnitudeClaimLabel: GOAL_COMMITMENT_MAGNITUDE_BY_KEY[magnitude.key].label,
          magnitudeClaimTone: GOAL_COMMITMENT_MAGNITUDE_BY_KEY[magnitude.key].tone,
          magnitudeDivergencePct: magnitude.divergencePct,
          magnitudeDelta: magnitude.delta,
          magnitudeBasis: magnitude.basis,
          magnitudeScale: magnitude.scale ?? null,
          verdict,
          verdictLabel: GOAL_COMMITMENT_PAIR_VERDICT_BY_KEY[verdict].label,
          verdictTone: GOAL_COMMITMENT_PAIR_VERDICT_BY_KEY[verdict].tone,
          verdictSays: GOAL_COMMITMENT_PAIR_VERDICT_BY_KEY[verdict].says,
          verdictRank: PAIR_RANK.get(verdict),
          crossLine: CROSS_LINE_PAIRS.has(verdict),
          overlapDays,
          overlapFrom: overlapDays > 0 ? overlapFrom : null,
          overlapTo: overlapDays > 0 ? overlapTo : null,
          measureClaim,
          measureClaimLabel: GOAL_COMMITMENT_MEASURE_BY_KEY[measureClaim].label,
          measureClaimTone: GOAL_COMMITMENT_MEASURE_BY_KEY[measureClaim].tone,
        });
      }
    }
    pairs.sort((a, b) => b.verdictRank - a.verdictRank || b.overlapDays - a.overlapDays || a.pairKey.localeCompare(b.pairKey));
    const pairsExpectedN = (liveN * (liveN - 1)) / 2;

    /* Capacity: the person-level sweep over every live commitment, then one
       sweep per named line against that line's OWN declared share. */
    const personPeak = goalCommitmentPeak(myCommitments.map((row) => ({
      id: row.commitmentId, lineKey: row.lineKey, effortShareH: row.effortShareH, windowFrom: row.windowFrom, windowTo: row.windowTo,
    })), today, horizonEnd);
    const personVerdict = personPeak.effectiveN === 0
      ? 'unmeasurable'
      : personPeak.peakSumH > GOAL_COMMITMENT_PERSON_BASIS_H ? 'overcommit' : 'fits';
    const lineKeys = [...new Set(myCommitments.filter((row) => row.lineKey !== GOAL_COMMITMENT_NO_LINE).map((row) => row.lineKey))].sort();
    const lineRows = lineKeys.map((lineKey) => {
      const rows = myCommitments.filter((row) => row.lineKey === lineKey);
      const peak = goalCommitmentPeak(rows.map((row) => ({
        id: row.commitmentId, lineKey: row.lineKey, effortShareH: row.effortShareH, windowFrom: row.windowFrom, windowTo: row.windowTo,
      })), today, horizonEnd);
      const declaredShareH = declaredShareOf(personId, lineKey);
      const holderId = rows[0]?.holderId || null;
      let verdict = 'unmeasurable';
      if (peak.effectiveN === 0) verdict = 'unmeasurable';
      else if (declaredShareH === null) { verdict = 'share-undeclared'; refuse('share-undeclared'); }
      else verdict = peak.peakSumH > declaredShareH ? 'overcommit' : 'fits';
      return {
        lineKey,
        lineLabel: rows[0]?.lineLabel || lineKey,
        holderId,
        holderName: holderId ? personName(holderId) : '—',
        declaredShareH,
        declaredShareDisplay: shareHToDisplay(declaredShareH),
        peakDay: peak.peakDay,
        peakSumH: peak.peakSumH,
        peakDisplay: shareHToDisplay(peak.peakSumH),
        overByH: verdict === 'overcommit' && declaredShareH !== null ? peak.peakSumH - declaredShareH : null,
        commitmentsN: rows.length,
        verdict,
        verdictLabel: GOAL_COMMITMENT_CAPACITY_BY_KEY[verdict].label,
        verdictTone: verdict === 'overcommit' ? 'bad' : verdict === 'share-undeclared' ? 'warn' : verdict === 'fits' ? 'good' : 'neutral',
        verdictSays: GOAL_COMMITMENT_CAPACITY_BY_KEY[verdict].says,
      };
    });

    const capacity = {
      basisH: GOAL_COMMITMENT_PERSON_BASIS_H,
      basisDisplay: shareHToDisplay(GOAL_COMMITMENT_PERSON_BASIS_H),
      verdict: personVerdict,
      verdictLabel: GOAL_COMMITMENT_CAPACITY_BY_KEY[personVerdict].label,
      verdictTone: personVerdict === 'overcommit' ? 'bad' : personVerdict === 'fits' ? 'good' : 'neutral',
      verdictSays: GOAL_COMMITMENT_CAPACITY_BY_KEY[personVerdict].says,
      peakDay: personPeak.peakDay,
      peakSumH: personPeak.peakSumH,
      peakDisplay: shareHToDisplay(personPeak.peakSumH),
      overByH: personVerdict === 'overcommit' ? personPeak.peakSumH - GOAL_COMMITMENT_PERSON_BASIS_H : null,
      overByDisplay: personVerdict === 'overcommit' ? shareHToDisplay(personPeak.peakSumH - GOAL_COMMITMENT_PERSON_BASIS_H) : null,
      peakCommitments: personPeak.peakCommitments,
      effectiveN: personPeak.effectiveN,
      elapsedN: personPeak.elapsedN,
      beyondHorizonN: personPeak.beyondHorizonN,
      lines: lineRows,
    };

    /* Goal attribution for this person, and the exact counts that must add up. */
    const attributionCounts = Object.create(null);
    for (const goal of myGoals) attributionCounts[goal.state] = (attributionCounts[goal.state] || 0) + 1;
    const comparableGoalN = (attributionCounts.declared || 0) + (attributionCounts.unattributed || 0);

    /* Owner verdict. Two states sit BELOW every comparison and say the register
       could not compare anything — "no conflict found" and "nothing declared to
       compare" are different facts and must never print the same word. */
    const worstPair = pairs.reduce((worst, pair) => (PAIR_RANK.get(pair.verdict) > (worst ? PAIR_RANK.get(worst.verdict) : -1) ? pair : worst), null);
    let verdict = 'compatible';
    if (linesN < 2) verdict = 'inert';
    else if (namedLiveN === 0) verdict = 'undeclared';
    else if (worstPair && worstPair.verdict === 'target-conflict') verdict = 'target-conflict';
    else if (worstPair && worstPair.verdict === 'magnitude-conflict') verdict = 'magnitude-conflict';
    else if (personVerdict === 'overcommit' || lineRows.some((row) => row.verdict === 'overcommit')) verdict = 'capacity-overcommit';
    else if (worstPair && worstPair.verdict === 'date-overlap') verdict = 'date-overlap';

    /* The holders a conflict belongs to: for a target/magnitude conflict the
       two named lines' holders; for a whole-person overcommit every named holder
       carrying the peak. An explicit no-line contribution has no holder, so it
       deliberately leaves the owner row without a partial apex. */
    const capacityHasNoLineAtPeak = personVerdict === 'overcommit'
      && personPeak.peakCommitments.some((row) => row.lineKey === GOAL_COMMITMENT_NO_LINE);
    const conflictHolderIds = (() => {
      if ((verdict === 'target-conflict' || verdict === 'magnitude-conflict') && worstPair) {
        return [worstPair.aHolderId, worstPair.bHolderId].filter(Boolean);
      }
      if (verdict === 'capacity-overcommit') {
        // Person capacity is one condition. When any contribution at its peak
        // is explicit no-line, the remaining named lines are not its complete
        // accountable set and must not appear as a guessed joint apex.
        if (capacityHasNoLineAtPeak) return [];
        const ids = new Set();
        if (personVerdict === 'overcommit') {
          for (const row of personPeak.peakCommitments) {
            const source = myCommitments.find((c) => c.commitmentId === row.id);
            if (source?.holderId) ids.add(source.holderId);
          }
        }
        for (const line of lineRows) {
          if (line.verdict === 'overcommit' && line.holderId) ids.add(line.holderId);
        }
        return [...ids].sort();
      }
      return [];
    })();
    const apex = conflictHolderIds.length
      ? matrixJointApex(matrix, conflictHolderIds)
      : {
        apexIds: [],
        apexId: null,
        unique: false,
        ambiguous: false,
        disconnected: false,
        isLeaderOnly: false,
        unattributed: capacityHasNoLineAtPeak,
      };

    const pairsReconcile = pairs.length === pairsExpectedN;
    const goalsReconcile = Object.values(attributionCounts).reduce((sum, n) => sum + n, 0) === myGoals.length;

    return {
      personId,
      personName: personName(personId),
      altitude: matrix.nodes.get(personId)?.altitude || null,
      linesN,
      verdict,
      verdictLabel: GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY[verdict].label,
      verdictTone: GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY[verdict].tone,
      verdictSays: GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY[verdict].says,
      verdictRank: GOAL_COMMITMENT_OWNER_VERDICT_BY_KEY[verdict].rank,
      commitments: myCommitments,
      liveN,
      namedLiveN,
      closedN: (allRowsByOwner.get(personId) || []).filter((row) => row.closed).length,
      unreachableN: (allRowsByOwner.get(personId) || []).filter((row) => !row.comparable && !row.closed).length,
      pairs,
      pairsN: pairs.length,
      pairsExpectedN,
      pairsShownN: Math.min(pairs.length, GOAL_COMMITMENT_LIMITS.pairRowsShown),
      pairsOmittedN: Math.max(0, pairs.length - GOAL_COMMITMENT_LIMITS.pairRowsShown),
      targetConflictN: pairs.filter((pair) => pair.verdict === 'target-conflict').length,
      magnitudeConflictN: pairs.filter((pair) => pair.verdict === 'magnitude-conflict').length,
      magnitudeUndeclaredN: pairs.filter((pair) => pair.magnitudeClaim === 'undeclared').length,
      magnitudeUnitMismatchN: pairs.filter((pair) => pair.magnitudeClaim === 'unit-mismatch').length,
      dateOverlapN: pairs.filter((pair) => pair.verdict === 'date-overlap').length,
      capacity,
      goals: {
        rows: myGoals,
        goalN: myGoals.length,
        comparableN: comparableGoalN,
        declaredN: attributionCounts.declared || 0,
        unattributedN: attributionCounts.unattributed || 0,
        singleLineN: attributionCounts['single-line'] || 0,
        counts: attributionCounts,
      },
      conflictHolderIds,
      apex: {
        ...apex,
        apexName: apex.unique
          ? personName(apex.apexId)
          : (apex.unattributed
            ? 'no complete named-holder set (explicit no-line declaration)'
            : (apex.disconnected ? 'no joint apex (the lines are disconnected)' : 'ambiguous — several joint apexes')),
        apexLabel: apex.unique
          ? (apex.isLeaderOnly ? 'the workspace leader' : personName(apex.apexId))
          : (apex.unattributed
            ? 'no complete named-holder set (explicit no-line declaration)'
            : (apex.disconnected ? 'no joint apex (disconnected)' : 'ambiguous — several joint apexes')),
      },
      pairsReconcile,
      goalsReconcile,
      countsReconcile: pairsReconcile && goalsReconcile,
      countsReason: !pairsReconcile
        ? `${pairs.length} pair row(s) were built where ${pairsExpectedN} unordered pair(s) of ${liveN} live commitment(s) exist.`
        : !goalsReconcile
          ? 'This person’s goal attribution counts do not add up to the live goals they own.'
          : '',
    };
  });

  ownerRows.sort((a, b) => b.verdictRank - a.verdictRank
    || b.targetConflictN - a.targetConflictN
    || b.magnitudeConflictN - a.magnitudeConflictN
    || b.dateOverlapN - a.dateOverlapN
    || a.personName.localeCompare(b.personName)
    || a.personId.localeCompare(b.personId));

  const ownersShown = ownerRows.slice(0, GOAL_COMMITMENT_LIMITS.ownerRowsShown);
  const ownersOmittedN = ownerRows.length - ownersShown.length;
  if (ownersOmittedN) refuse('truncated', ownersOmittedN);
  const commitmentsShown = commitmentRows.slice(0, GOAL_COMMITMENT_LIMITS.commitmentRowsShown);
  const commitmentsOmittedN = commitmentRows.length - commitmentsShown.length;
  if (commitmentsOmittedN) refuse('truncated', commitmentsOmittedN);

  /* ------------------------------------------------------------- the totals */

  const stateCounts = Object.create(null);
  for (const row of commitmentRows) stateCounts[row.state] = (stateCounts[row.state] || 0) + 1;
  const ownerVerdictCounts = Object.create(null);
  for (const row of ownerRows) ownerVerdictCounts[row.verdict] = (ownerVerdictCounts[row.verdict] || 0) + 1;
  const pairVerdictCounts = Object.create(null);
  let pairsN = 0;
  for (const row of ownerRows) {
    for (const pair of row.pairs) {
      pairsN += 1;
      pairVerdictCounts[pair.verdict] = (pairVerdictCounts[pair.verdict] || 0) + 1;
    }
  }
  const attributionCounts = Object.create(null);
  for (const row of attributionRows) attributionCounts[row.state] = (attributionCounts[row.state] || 0) + 1;

  const comparableGoalN = (attributionCounts.declared || 0) + (attributionCounts.unattributed || 0);
  const attributionRate = comparableGoalN >= K.minGoals
    ? (() => {
      const interval = matrixWilson(attributionCounts.declared || 0, comparableGoalN);
      return {
        pct: round1(((attributionCounts.declared || 0) / comparableGoalN) * 100),
        low: interval.lower,
        high: interval.upper,
        withheld: false,
        reason: null,
      };
    })()
    : {
      pct: null, low: null, high: null, withheld: true,
      reason: `${comparableGoalN} comparable goal(s) is fewer than the declared floor of ${K.minGoals}; the attribution counts are printed and no rate is claimed.`,
    };
  if (attributionRate.withheld) refuse('below-floor');

  /* The register-wide peak: the largest person-level peak sum, and that person's
     peak day. Ties resolve to the earliest day, then the person id, so two reads
     of one record export the same two cells. */
  const peaked = ownerRows
    .filter((row) => row.capacity.peakSumH !== null)
    .sort((a, b) => b.capacity.peakSumH - a.capacity.peakSumH
      || a.capacity.peakDay.localeCompare(b.capacity.peakDay)
      || a.personId.localeCompare(b.personId))[0] || null;

  const stateSum = Object.values(stateCounts).reduce((sum, n) => sum + n, 0);
  const ownerSum = Object.values(ownerVerdictCounts).reduce((sum, n) => sum + n, 0);
  const pairSum = Object.values(pairVerdictCounts).reduce((sum, n) => sum + n, 0);
  const attributionSum = Object.values(attributionCounts).reduce((sum, n) => sum + n, 0);
  const rowsReconcile = ownerRows.every((row) => row.countsReconcile);
  const countsReconcile = rowsReconcile
    && stateSum === commitmentRows.length
    && ownerSum === ownerRows.length
    && pairSum === pairsN
    && attributionSum === attributionRows.length;

  if (matrix.defects.length) refuse('matrix-defect', matrix.defects.length);
  const figuresComplete = countsReconcile
    && matrix.defects.length === 0
    && ownersOmittedN === 0
    && commitmentsOmittedN === 0
    && ownerRows.every((row) => row.pairsOmittedN === 0);
  const claimReason = figuresComplete
    ? null
    : !countsReconcile
      ? !rowsReconcile
        ? `At least one person’s pair rows or goal attribution counts do not add up: ${ownerRows.find((row) => !row.countsReconcile)?.countsReason || 'the printed rows are not the computed rows.'}`
        : 'A register-level count does not equal the sum of the rows printed under it.'
      : matrix.defects.length
        ? `${matrix.defects.length} reporting line(s) were refused by the matrix engine; every comparison that crosses one is withheld rather than computed over a partial graph.`
        : `${ownersOmittedN + commitmentsOmittedN} row(s) exceed this screen’s display cap and are counted, not shown.`;

  /* Roll-ups: every printed cross-line conflict belongs to BOTH named-line
     holders and exactly one resolved joint-apex row. A magnitude conflict is
     not folded into the old opposed-direction count; the two are separately
     visible while `conflictsN` remains their checkable sum. A single-line share
     excess stays on its holder and never becomes an apex overcommit. */
  const holderMap = new Map();
  const apexMap = new Map();
  const emptyHolder = (holderId) => ({
    holderId,
    holderName: personName(holderId),
    declaredN: 0,
    targetConflictN: 0,
    magnitudeConflictN: 0,
    conflictsN: 0,
    overcommitsN: 0,
    people: new Set(),
  });
  const holderFor = (holderId) => {
    if (!holderMap.has(holderId)) holderMap.set(holderId, emptyHolder(holderId));
    return holderMap.get(holderId);
  };
  const apexFor = (holderIds) => {
    const ids = [...new Set(holderIds.filter(Boolean))].sort();
    if (!ids.length) return null;
    const apex = matrixJointApex(matrix, ids);
    // An unresolved holder set is not secretly the same apex as another one.
    // Keeping its deterministic source-set key preserves the refusal boundary
    // while a unique apex aggregates every finding that reaches that one seat.
    const apexKey = apex.unique
      ? `seat:${apex.apexId}`
      : `${apex.disconnected ? 'disconnected' : 'ambiguous'}:${ids.join('|')}`;
    if (!apexMap.has(apexKey)) {
      apexMap.set(apexKey, {
        apexKey,
        apexId: apex.unique ? apex.apexId : null,
        apexName: apex.unique
          ? (apex.isLeaderOnly ? 'the workspace leader' : personName(apex.apexId))
          : (apex.disconnected ? 'no joint apex (disconnected)' : 'ambiguous — several joint apexes'),
        unique: apex.unique,
        ambiguous: apex.ambiguous,
        disconnected: apex.disconnected,
        isLeaderOnly: apex.isLeaderOnly,
        targetConflictN: 0,
        magnitudeConflictN: 0,
        conflictsN: 0,
        overcommitsN: 0,
        people: new Set(),
      });
    }
    return apexMap.get(apexKey);
  };

  for (const row of ownerRows) {
    for (const commitment of row.commitments) {
      if (!commitment.holderId) continue;
      const holder = holderFor(commitment.holderId);
      holder.declaredN += 1;
      holder.people.add(row.personId);
    }

    for (const pair of row.pairs) {
      const countKey = pair.verdict === 'target-conflict'
        ? 'targetConflictN'
        : pair.verdict === 'magnitude-conflict'
          ? 'magnitudeConflictN'
          : null;
      if (!countKey) continue;
      const holderIds = [...new Set([pair.aHolderId, pair.bHolderId].filter(Boolean))].sort();
      for (const holderId of holderIds) {
        const holder = holderFor(holderId);
        holder[countKey] += 1;
        holder.conflictsN += 1;
        holder.people.add(row.personId);
      }
      const apex = apexFor(holderIds);
      if (apex) {
        apex[countKey] += 1;
        apex.conflictsN += 1;
        apex.people.add(row.personId);
      }
    }

    // A person's whole-capacity overcommit is a joint-apex condition only when
    // every peak declaration has a named holder. An explicit no-line declaration
    // still contributes to the exact arithmetic, but no partial named subset is
    // converted into a false complete apex or roll-up owner.
    if (row.capacity.verdict === 'overcommit') {
      const peakSources = row.capacity.peakCommitments
        .map((entry) => row.commitments.find((commitment) => commitment.commitmentId === entry.id) || null);
      const capacityHasNoLine = peakSources.some((commitment) => commitment?.lineKey === GOAL_COMMITMENT_NO_LINE);
      const holderIds = [...new Set(peakSources.map((commitment) => commitment?.holderId).filter(Boolean))].sort();
      // A no-line declaration remains fully charged in capacity arithmetic, but
      // it has no holder. Do not turn the remaining named holder(s) into a false
      // complete apex for a condition the rule must instead observe by marker.
      if (!capacityHasNoLine) {
        const apex = apexFor(holderIds);
        if (apex) {
          apex.overcommitsN += 1;
          apex.people.add(row.personId);
        }
      }
    }

    // This is deliberately separate from the joint-apex capacity condition:
    // one line above its own share is still visible on the holder's roll-up,
    // even when a whole-person overcommit suppresses the duplicate automation.
    for (const line of row.capacity.lines) {
      if (line.verdict !== 'overcommit' || !line.holderId) continue;
      const holder = holderFor(line.holderId);
      holder.overcommitsN += 1;
      holder.people.add(row.personId);
    }
  }

  const refusals = [...refusalCounts.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      reason: GOAL_COMMITMENT_REFUSAL_BY_KEY[key]?.says || 'A read was withheld.',
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const totals = {
    commitmentsN: commitmentRows.length,
    liveN: stateCounts.live || 0,
    noLineN: stateCounts['no-line'] || 0,
    closedN: (stateCounts.released || 0) + (stateCounts.superseded || 0) + (stateCounts['goal-closed'] || 0),
    unreachableN: (stateCounts['owner-moved'] || 0) + (stateCounts['owner-off-roster'] || 0)
      + (stateCounts['line-ended'] || 0) + (stateCounts['holder-moved'] || 0) + (stateCounts['line-defective'] || 0),
    ownersN: ownerRows.length,
    ownersComparedN: ownerRows.filter((row) => row.verdict !== 'inert' && row.verdict !== 'undeclared').length,
    ownersInertN: ownerVerdictCounts.inert || 0,
    ownersUndeclaredN: ownerVerdictCounts.undeclared || 0,
    pairsN,
    pairsCrossLineN: ownerRows.reduce((sum, row) => sum + row.pairs.filter((pair) => pair.crossLine).length, 0),
    targetConflictN: pairVerdictCounts['target-conflict'] || 0,
    magnitudeConflictN: pairVerdictCounts['magnitude-conflict'] || 0,
    magnitudeUndeclaredN: ownerRows.reduce((sum, row) => sum + row.magnitudeUndeclaredN, 0),
    magnitudeUnitMismatchN: ownerRows.reduce((sum, row) => sum + row.magnitudeUnitMismatchN, 0),
    dateOverlapN: pairVerdictCounts['date-overlap'] || 0,
    compatibleN: pairVerdictCounts.compatible || 0,
    sameLineN: pairVerdictCounts['same-line'] || 0,
    singlePrincipalN: pairVerdictCounts['single-principal'] || 0,
    capacityOvercommitN: ownerRows.filter((row) => row.capacity.verdict === 'overcommit').length,
    capacityFitsN: ownerRows.filter((row) => row.capacity.verdict === 'fits').length,
    capacityUnmeasurableN: ownerRows.filter((row) => row.capacity.verdict === 'unmeasurable').length,
    lineShareUndeclaredN: ownerRows.reduce((sum, row) => sum + row.capacity.lines.filter((line) => line.verdict === 'share-undeclared').length, 0),
    lineOvercommitN: ownerRows.reduce((sum, row) => sum + row.capacity.lines.filter((line) => line.verdict === 'overcommit').length, 0),
    peakSumH: peaked ? peaked.capacity.peakSumH : null,
    peakDay: peaked ? peaked.capacity.peakDay : null,
    goalsComparableN: comparableGoalN,
    goalsDeclaredN: attributionCounts.declared || 0,
    goalsUnattributedN: attributionCounts.unattributed || 0,
    stateCounts,
    ownerVerdictCounts,
    pairVerdictCounts,
    attributionCounts,
  };

  const board = {
    ...totals,
    attributionPct: attributionRate.pct,
    attributionLowPct: attributionRate.low,
    attributionHighPct: attributionRate.high,
    attributionWithheld: attributionRate.withheld,
    attributionWithheldReason: attributionRate.reason,
    countsReconcile,
    figuresComplete,
    claimReason,
    matrixDefectsN: matrix.defects.length,
    refusalsN: refusals.reduce((sum, row) => sum + row.count, 0),
    attentionN: totals.targetConflictN + totals.magnitudeConflictN + totals.capacityOvercommitN,
    ownersShownN: ownersShown.length,
    ownersOmittedN,
    commitmentsShownN: commitmentsShown.length,
    commitmentsOmittedN,
    detailLevel,
  };

  const conventions = [
    { key: 'horizonDays', label: 'Capacity horizon', value: K.horizonDays, detail: `The capacity sweep reads ${K.horizonDays} day(s) ahead of ${today}, to ${horizonEnd}. A live commitment entirely beyond it is counted and printed as beyond the horizon, never swept.` },
    { key: 'minOverlapDays', label: 'Collision ask threshold', value: K.minOverlapDays, detail: `A colliding pair is PRINTED at one overlapping day, and becomes an ask to the lines’ joint apex at ${K.minOverlapDays} or more. The reader reports; the rule acts on the declared threshold.` },
    { key: 'minGoals', label: 'Attribution floor', value: K.minGoals, detail: `Fewer than ${K.minGoals} comparable goals prints the attribution counts only; no rate is claimed.` },
    { key: 'magnitudeDivergencePct', label: 'Magnitude conflict floor', value: K.magnitudeDivergencePct, detail: `Two aligned target magnitudes with the same declared unit conflict when their exact absolute difference is at least ${K.magnitudeDivergencePct}% of the larger declared value. Missing magnitudes and unit mismatches are refusals, never alignment.` },
    { key: 'askDueDays', label: 'Follow-up ask window', value: K.askDueDays, detail: `A conflict or an overcommit files an ask due within ${K.askDueDays} day(s).` },
  ];

  return {
    engineVersion: GOAL_COMMITMENT_ENGINE_VERSION,
    generatedOn: today,
    today,
    horizonEnd,
    seat: { operator, actorId, detailLevel },
    settings: conv,
    conventions,
    frameworks: GOAL_COMMITMENT_FRAMEWORKS.map((row) => ({ key: row.key, label: row.label, detail: row.says })),
    method: [
      GOAL_COMMITMENT_METHOD.unit,
      GOAL_COMMITMENT_METHOD.firstPerson,
      GOAL_COMMITMENT_METHOD.pair,
      GOAL_COMMITMENT_METHOD.measure,
      GOAL_COMMITMENT_METHOD.magnitude,
      GOAL_COMMITMENT_METHOD.capacity,
      GOAL_COMMITMENT_METHOD.attribution,
      GOAL_COMMITMENT_METHOD.escalation,
      GOAL_COMMITMENT_METHOD.notSaid,
    ],
    board,
    owners: ownersShown,
    commitments: commitmentsShown,
    rollups: {
      holders: [...holderMap.values()]
        .map((row) => ({ ...row, peopleN: row.people.size, people: undefined }))
        .sort((a, b) => b.conflictsN - a.conflictsN || b.overcommitsN - a.overcommitsN || b.declaredN - a.declaredN || a.holderName.localeCompare(b.holderName)),
      apexes: [...apexMap.values()]
        .map((row) => ({ ...row, peopleN: row.people.size, people: undefined }))
        .sort((a, b) => b.conflictsN - a.conflictsN || b.overcommitsN - a.overcommitsN || String(a.apexKey).localeCompare(String(b.apexKey))),
    },
    refusals,
    internal: { matrix, nameOf: personName, today, horizonEnd, allOwners: ownerRows, allCommitments: commitmentRows, allAttribution: attributionRows, conventions: K },
  };
}

/* ------------------------------------------------------------------- prose */

export function goalCommitmentBriefText(report) {
  const b = report.board;
  const attribution = b.attributionWithheld
    ? `The attribution rate is withheld: ${b.attributionWithheldReason}`
    : `${b.goalsDeclaredN} of ${b.goalsComparableN} comparable goal(s) name a line (${b.attributionPct}%, 95% CI ${b.attributionLowPct}–${b.attributionHighPct}%); ${b.goalsUnattributedN} name none and are NOT charged to the home line.`;
  const peak = b.peakSumH === null
    ? 'No live commitment falls inside the declared horizon, so there is no peak to measure.'
    : `The largest concurrent declared effort on the record is ${shareHToDisplay(b.peakSumH)} of one person on ${b.peakDay}, against a basis of ${shareHToDisplay(GOAL_COMMITMENT_PERSON_BASIS_H)}.`;
  return [
    `Cross-line goal commitments, ${report.generatedOn}: ${b.commitmentsN} declaration(s) on the record — ${b.liveN} live, ${b.noLineN} owed under no line, ${b.closedN} closed, ${b.unreachableN} unreachable because the line ended, its holder changed, the goal was re-assigned or closed, or the owner left the roster.`,
    `${b.ownersN} person(s) carry a comparison: ${b.ownersComparedN} across two or more lines, ${b.ownersInertN} on one line only, ${b.ownersUndeclaredN} with nothing declared under a named line.`,
    `${b.pairsN} pair(s) of live commitments were compared — ${b.targetConflictN} name the same measure in opposite directions, ${b.magnitudeConflictN} name incompatible magnitudes in the same unit and direction, ${b.magnitudeUndeclaredN} aligned measure pair(s) omit a target magnitude, ${b.magnitudeUnitMismatchN} use mismatched units, ${b.dateOverlapN} collide on dates only, ${b.compatibleN} do not collide, ${b.sameLineN} belong to one line’s own sequencing and ${b.singlePrincipalN} involve a commitment owed under no line.`,
    `${b.capacityOvercommitN} person(s) are overcommitted at their exact peak day and ${b.lineOvercommitN} line reading(s) exceed that line’s own declared share (${b.lineShareUndeclaredN} refused for want of one). ${peak}`,
    attribution,
    b.figuresComplete
      ? 'Counts reconcile and the printed figures are the computed figures.'
      : `The figures are NOT complete: ${b.claimReason}`,
    'Nobody is scored, no line is ranked above another, no measure is inferred from a goal’s text, and a goal with no declared line is never charged to the home line.',
  ].join(' ');
}

/* --------------------------------------------------------------------- CSV */

export function goalCommitmentCsvRows(report) {
  const b = report.board;
  const base = {
    generated_on: report.generatedOn,
    commitments_n: b.commitmentsN,
    live_n: b.liveN,
    closed_n: b.closedN,
    unreachable_n: b.unreachableN,
    no_line_n: b.noLineN,
    owners_n: b.ownersN,
    owners_compared_n: b.ownersComparedN,
    owners_inert_n: b.ownersInertN,
    owners_undeclared_n: b.ownersUndeclaredN,
    pairs_n: b.pairsN,
    pairs_cross_line_n: b.pairsCrossLineN,
    target_conflict_n: b.targetConflictN,
    magnitude_conflict_n: b.magnitudeConflictN,
    magnitude_undeclared_n: b.magnitudeUndeclaredN,
    magnitude_unit_mismatch_n: b.magnitudeUnitMismatchN,
    date_overlap_n: b.dateOverlapN,
    compatible_n: b.compatibleN,
    same_line_n: b.sameLineN,
    single_principal_n: b.singlePrincipalN,
    capacity_overcommit_n: b.capacityOvercommitN,
    capacity_fits_n: b.capacityFitsN,
    capacity_unmeasurable_n: b.capacityUnmeasurableN,
    line_share_undeclared_n: b.lineShareUndeclaredN,
    // A withheld figure exports BLANK with its reason, never zero.
    peak_sum_h: b.peakSumH,
    peak_day: b.peakDay,
    capacity_basis_h: GOAL_COMMITMENT_PERSON_BASIS_H,
    goals_comparable_n: b.goalsComparableN,
    goals_declared_n: b.goalsDeclaredN,
    goals_unattributed_n: b.goalsUnattributedN,
    attribution_pct: b.attributionPct,
    attribution_low_pct: b.attributionLowPct,
    attribution_high_pct: b.attributionHighPct,
    attribution_withheld_reason: b.attributionWithheldReason,
    horizon_days: report.settings[GOAL_COMMITMENT_SETTING_KEYS.horizonDays],
    min_overlap_days: report.settings[GOAL_COMMITMENT_SETTING_KEYS.minOverlapDays],
    min_goals: report.settings[GOAL_COMMITMENT_SETTING_KEYS.minGoals],
    magnitude_divergence_pct: report.settings[GOAL_COMMITMENT_SETTING_KEYS.magnitudeDivergencePct],
    ask_due_days: report.settings[GOAL_COMMITMENT_SETTING_KEYS.askDueDays],
    counts_reconcile: b.countsReconcile,
    figures_complete: b.figuresComplete,
    claim_reason: b.claimReason,
    engine_version: report.engineVersion,
  };
  const rows = [{ ...base, row_type: 'workspace', key: 'workspace', label: 'Workspace summary' }];
  for (const verdict of GOAL_COMMITMENT_OWNER_VERDICTS) {
    rows.push({ ...base, row_type: 'owner-verdict', key: verdict.key, label: verdict.label, owners_n: b.ownerVerdictCounts[verdict.key] || 0 });
  }
  for (const verdict of GOAL_COMMITMENT_PAIR_VERDICTS) {
    rows.push({ ...base, row_type: 'pair-verdict', key: verdict.key, label: verdict.label, pairs_n: b.pairVerdictCounts[verdict.key] || 0 });
  }
  for (const state of Object.keys(GOAL_COMMITMENT_STATE_BY_KEY)) {
    rows.push({ ...base, row_type: 'commitment-state', key: state, label: GOAL_COMMITMENT_STATE_BY_KEY[state].label, commitments_n: b.stateCounts[state] || 0 });
  }
  for (const verdict of Object.keys(GOAL_COMMITMENT_CAPACITY_BY_KEY)) {
    rows.push({ ...base, row_type: 'capacity-verdict', key: verdict, label: GOAL_COMMITMENT_CAPACITY_BY_KEY[verdict].label, capacity_overcommit_n: b.capacityOvercommitN, line_share_undeclared_n: b.lineShareUndeclaredN });
  }
  for (const state of Object.keys(GOAL_COMMITMENT_ATTRIBUTION_BY_KEY)) {
    rows.push({ ...base, row_type: 'attribution', key: state, label: GOAL_COMMITMENT_ATTRIBUTION_BY_KEY[state].label, goals_comparable_n: b.attributionCounts[state] || 0 });
  }
  for (const refusal of report.refusals) {
    rows.push({ ...base, row_type: 'refusal', key: refusal.key, label: refusal.reason, unreachable_n: refusal.count });
  }
  return rows;
}
