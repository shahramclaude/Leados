/**
 * app/core/domain/standardRevision.js — the pure reader of the Standard-Work
 * Revision Register (ADR-0237, Schema v192).
 *
 * Every figure here is computed from two ledgers — `standardRevisions` and
 * `standardRevisionBriefs` — plus the routines they name. Nothing is stored
 * as a state, a verdict, a percentage or a total. The reader does not write,
 * does not trust the loader alone (it re-checks each chain before printing a
 * line of it), and withholds a whole routine rather than print a chain it
 * cannot vouch for.
 *
 * Two claims are kept apart on purpose:
 *   - `countsReconcile`: the printed partitions add up to the rows they were
 *     counted from (states, verdicts and briefee states each sum to their
 *     total);
 *   - `figuresComplete`: the reading covers the whole record the seat may see
 *     — nothing outside reach, nothing withheld, no briefing dated in the
 *     future that was not counted.
 * A reading can reconcile and still be incomplete for a seat; the panel prints
 * both facts and never merges them into one reassuring word.
 */

import { dayKey } from '../time.js';
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import {
  STANDARD_REVISION_BRIEF_STATE_BY_KEY,
  STANDARD_REVISION_BRIEF_STATE_KEYS,
  STANDARD_REVISION_ENGINE_VERSION,
  STANDARD_REVISION_ADR,
  STANDARD_REVISION_FRAMEWORKS,
  STANDARD_REVISION_LIMITS,
  STANDARD_REVISION_METHOD,
  STANDARD_REVISION_STATE_BY_KEY,
  STANDARD_REVISION_STATE_KEYS,
  STANDARD_REVISION_VERDICT_BY_KEY,
  STANDARD_REVISION_VERDICT_KEYS,
} from './standardRevisionRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** Whole-number percentage, floored: a coverage figure must never overstate. */
export function standardRevisionPct(part, whole) {
  if (!whole) return null;
  return Math.floor((100 * part) / whole);
}

function countInto(keys, rows, pick) {
  const out = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) out[pick(row)] += 1;
  return out;
}

/**
 * The reading for one seat (or the whole workspace when `seat` is null or a
 * full-access operator). `now` is the clock the register reads against.
 */
export function buildStandardRevisions(state, { now = new Date(), settings = null, seat = null } = {}) {
  const today = dayKey(now);
  const effective = settings || state?.settings || {};
  const matrix = buildMatrix(state, { now, settings: effective });
  const formerNames = new Map(list(state?.people).map((person) => [person.id, person.name]));
  const nameOf = (id) => (id ? (matrix.nodes.get(id)?.name || formerNames.get(id) || 'Former colleague') : '—');

  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
  const inReach = (id) => operator || id === actorId || reach.has(id);

  const routines = list(state?.standardWorkRoutines);
  const routineById = new Map(routines.map((row) => [row.id, row]));
  const revisions = list(state?.standardRevisions);
  const briefs = list(state?.standardRevisionBriefs);
  const briefByPair = new Map(briefs.map((row) => [`${row.revisionId}|${row.personId}`, row]));
  const futureBriefN = briefs.filter((row) => row.briefedOn > today).length;

  const byRoutine = new Map();
  for (const rev of revisions) {
    if (!byRoutine.has(rev.routineId)) byRoutine.set(rev.routineId, []);
    byRoutine.get(rev.routineId).push(rev);
  }
  for (const chain of byRoutine.values()) chain.sort((a, b) => a.revisionNo - b.revisionNo);

  const incomplete = [];
  let outsideReachN = 0;
  let withheldRoutinesN = 0;
  let withheldRevisionsN = 0;
  const routineRows = [];
  const revisionRows = [];

  for (const [routineId, chain] of byRoutine) {
    const routine = routineById.get(routineId);
    if (!routine) {
      // A revision that names no routine cannot be placed on a line. Withheld.
      withheldRoutinesN += 1;
      withheldRevisionsN += chain.length;
      continue;
    }
    if (!inReach(routine.ownerId)) { outsideReachN += chain.length; continue; }

    // Re-check the chain before printing a line of it. The loader is the first
    // gate; this is the second, so a corrupted file cannot print a fact the
    // record does not support.
    let prior = routine.standard;
    let chainOk = true;
    chain.forEach((rev, index) => {
      if (rev.revisionNo !== index + 1 || rev.priorStandard !== prior) chainOk = false;
      prior = rev.standard;
    });
    if (!chainOk) {
      withheldRoutinesN += 1;
      withheldRevisionsN += chain.length;
      continue;
    }

    const lapsedOf = (rev) => Boolean(routine.retiredOn && routine.retiredOn <= rev.effectiveOn);
    const inForce = [...chain].reverse().find((rev) => !lapsedOf(rev) && rev.effectiveOn <= today) || null;
    const inForceText = inForce ? inForce.standard : routine.standard;
    const ownerName = nameOf(routine.ownerId);

    chain.forEach((rev, index) => {
      const lapsed = lapsedOf(rev);
      const laterInForce = chain.slice(index + 1).some((later) => !lapsedOf(later) && later.effectiveOn <= today);
      const state = lapsed ? 'lapsed' : rev.effectiveOn > today ? 'pending' : laterInForce ? 'superseded' : 'in-force';

      const briefees = rev.briefeeIds.map((personId) => {
        const row = briefByPair.get(`${rev.id}|${personId}`);
        const onRecord = row && row.briefedOn <= today ? row : null;
        let briefState;
        if (lapsed) briefState = 'not-owed';
        else if (onRecord) briefState = onRecord.briefedOn <= rev.effectiveOn ? 'briefed-before' : 'briefed-after';
        else briefState = today < rev.effectiveOn ? 'due' : 'overdue';
        const visible = inReach(personId);
        return {
          personId,
          name: visible ? nameOf(personId) : null,
          visible,
          state: briefState,
          label: STANDARD_REVISION_BRIEF_STATE_BY_KEY[briefState].label,
          briefedOn: onRecord && visible ? onRecord.briefedOn : null,
        };
      });
      const briefCounts = countInto(STANDARD_REVISION_BRIEF_STATE_KEYS, briefees, (row) => row.state);
      const owedN = briefees.length - briefCounts['not-owed'];
      const briefedN = briefCounts['briefed-before'] + briefCounts['briefed-after'];

      let verdict;
      if (lapsed) verdict = 'not-owed';
      else if (state === 'pending') verdict = briefCounts.due === 0 ? 'ready' : 'briefing-due';
      else if (briefCounts.overdue > 0) verdict = 'briefing-overdue';
      else if (briefCounts['briefed-after'] > 0) verdict = 'briefed-late';
      else verdict = 'briefed-in-time';

      revisionRows.push({
        revisionId: rev.id,
        routineId: routine.id,
        routineTitle: routine.title,
        ownerId: routine.ownerId,
        ownerName,
        revisionNo: rev.revisionNo,
        priorRevisionNo: rev.priorRevisionNo,
        approverId: rev.approverId,
        approverName: nameOf(rev.approverId),
        approvedOn: rev.approvedOn,
        effectiveOn: rev.effectiveOn,
        changedStep: rev.changedStep,
        basis: rev.basis,
        priorStandard: rev.priorStandard,
        standard: rev.standard,
        state,
        stateLabel: STANDARD_REVISION_STATE_BY_KEY[state].label,
        verdict,
        verdictLabel: STANDARD_REVISION_VERDICT_BY_KEY[verdict].label,
        verdictTone: STANDARD_REVISION_VERDICT_BY_KEY[verdict].tone,
        briefees,
        briefeesN: briefees.length,
        owedN,
        briefedN,
        briefCounts,
        coveragePct: standardRevisionPct(briefedN, owedN),
      });
    });

    routineRows.push({
      routineId: routine.id,
      title: routine.title,
      ownerId: routine.ownerId,
      ownerName,
      retired: Boolean(routine.retiredOn),
      declaredStandard: routine.standard,
      inForceStandard: inForceText,
      inForceRevisionNo: inForce ? inForce.revisionNo : 0,
      /** The routine record still carries its declared text; the panel says so when they differ. */
      inForceDiffers: inForceText !== routine.standard,
      revisionsN: chain.length,
      pendingN: chain.filter((rev) => !lapsedOf(rev) && rev.effectiveOn > today).length,
    });
  }

  revisionRows.sort((a, b) => a.routineTitle.localeCompare(b.routineTitle) || a.revisionNo - b.revisionNo);
  routineRows.sort((a, b) => a.title.localeCompare(b.title));

  const stateCounts = countInto(STANDARD_REVISION_STATE_KEYS, revisionRows, (row) => row.state);
  const verdictCounts = countInto(STANDARD_REVISION_VERDICT_KEYS, revisionRows, (row) => row.verdict);
  const allBriefees = revisionRows.flatMap((row) => row.briefees);
  const briefCounts = countInto(STANDARD_REVISION_BRIEF_STATE_KEYS, allBriefees, (row) => row.state);
  const owedN = allBriefees.length - briefCounts['not-owed'];
  const briefedN = briefCounts['briefed-before'] + briefCounts['briefed-after'];

  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const countsReconcile = sum(stateCounts) === revisionRows.length
    && sum(verdictCounts) === revisionRows.length
    && sum(briefCounts) === allBriefees.length;
  const chainBreaks = withheldRoutinesN;

  if (outsideReachN) incomplete.push(`${outsideReachN} revision(s) belong to routines outside this seat’s reach. They are not counted and not listed.`);
  if (withheldRoutinesN) incomplete.push(`${withheldRoutinesN} routine(s) carry a revision chain this reading cannot vouch for (${withheldRevisionsN} revision(s)). They are withheld, not printed.`);
  if (futureBriefN) incomplete.push(`${futureBriefN} briefing(s) are dated after today and are not counted as briefed.`);

  const shown = revisionRows.slice(0, STANDARD_REVISION_LIMITS.rowsShown);
  if (revisionRows.length > shown.length) incomplete.push(`${revisionRows.length - shown.length} revision row(s) are counted and not listed.`);

  return {
    engineVersion: STANDARD_REVISION_ENGINE_VERSION,
    adr: STANDARD_REVISION_ADR,
    today,
    scope: operator ? 'workspace' : 'seat',
    seatId: operator ? null : actorId,
    actorId,
    actorName: nameOf(actorId),
    routines: routineRows,
    revisions: shown,
    totals: {
      routinesN: routineRows.length,
      revisionsN: revisionRows.length,
      listedN: shown.length,
      pendingN: stateCounts.pending,
      inForceN: stateCounts['in-force'],
      supersededN: stateCounts.superseded,
      lapsedN: stateCounts.lapsed,
      verdictCounts,
      briefeesN: allBriefees.length,
      owedN,
      briefedN,
      briefedBeforeN: briefCounts['briefed-before'],
      briefedAfterN: briefCounts['briefed-after'],
      dueN: briefCounts.due,
      overdueN: briefCounts.overdue,
      notOwedN: briefCounts['not-owed'],
      coveragePct: standardRevisionPct(briefedN, owedN),
      outsideReachN,
      withheldRoutinesN,
      withheldRevisionsN,
      futureBriefN,
      countsReconcile,
      chainBreaks,
      auditClean: countsReconcile && chainBreaks === 0,
      figuresComplete: outsideReachN === 0 && withheldRoutinesN === 0 && futureBriefN === 0,
    },
    incomplete,
    method: STANDARD_REVISION_METHOD,
    frameworks: STANDARD_REVISION_FRAMEWORKS,
  };
}
