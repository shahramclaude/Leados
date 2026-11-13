/**
 * app/core/domain/standardWork.js — the pure read model for Leader Standard
 * Work & Tiered Daily Management (ADR-0190, Schema v150, `#/standard-work`).
 *
 * ONE reader. The screen, the CSV, the brief, the nav badge and RULE-LSW-01 all
 * read `buildStandardWork`; none of them computes a state, a rate or a verdict
 * of its own. Nothing here writes.
 *
 * WHAT IT DERIVES
 *  - every calendar slot each declared routine owes inside the window, and its
 *    state: done · done-with-abnormality · missed-with-reason · unrecorded · open;
 *  - adherence with a Wilson 95% interval, withheld below the declared floor;
 *  - the current not-done run and the routine verdict (lapsed · gaps · held · new);
 *  - the NEXT TIER of each routine over the canonical matrix DAG — the manager
 *    of the one line the routine is owed under, or a printed reason there is none;
 *  - the escalation chain of every escalated abnormality, hop by hop;
 *  - finding yield: the exact upper bound on a zero-finding routine's true rate
 *    and a Bonferroni-corrected Fisher exact comparison with its kind;
 *  - structured time per leader against Mann's reference band;
 *  - a span roll-up per leadership node in which a routine is counted ONCE
 *    however many lines reach its owner.
 *
 * WHAT IT REFUSES
 *  - silence read as a stated miss, or either read as done;
 *  - a rate on fewer closed slots than the declared floor (counts are printed);
 *  - a next tier chosen for an owner who holds several lines and named none;
 *  - a span total built by adding span rows — spans nest and, in a matrix,
 *    overlap; the workspace figure is the distinct count.
 */

import { addDays, dayKey, daysBetween, weekStart } from '../time.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixWilson } from './matrix.js';
import {
  STANDARD_WORK_CADENCES,
  STANDARD_WORK_ENGINE_VERSION,
  STANDARD_WORK_ESCALATION_STATES,
  STANDARD_WORK_KINDS,
  STANDARD_WORK_LIMITS,
  STANDARD_WORK_READ_REFUSALS,
  STANDARD_WORK_SLOT_STATES,
  STANDARD_WORK_STRUCTURE_BANDS,
  STANDARD_WORK_STRUCTURE_VERDICTS,
  STANDARD_WORK_TIER_STATES,
  STANDARD_WORK_VERDICTS,
} from './standardWorkRegistry.js';
import {
  normalizeStandardWorkSettings,
  standardWorkOwesSlot,
  standardWorkPreviousSlot,
  standardWorkSlotKeyFor,
  standardWorkSlotRange,
} from './standardWorkSchema.js';

const byKey = (rows) => new Map(rows.map((row) => [row.key, row]));
const KIND = byKey(STANDARD_WORK_KINDS);
const CADENCE = byKey(STANDARD_WORK_CADENCES);
const VERDICT = byKey(STANDARD_WORK_VERDICTS);
const TIER = byKey(STANDARD_WORK_TIER_STATES);
const ESC = byKey(STANDARD_WORK_ESCALATION_STATES);
const SLOT = byKey(STANDARD_WORK_SLOT_STATES);
const STRUCT = byKey(STANDARD_WORK_STRUCTURE_VERDICTS);
const REFUSAL = byKey(STANDARD_WORK_READ_REFUSALS);
const list = (value) => (Array.isArray(value) ? value : []);
const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------- exact maths */

/** ln(n!) by direct summation, memoised. Exact enough for every n this register can hold. */
const LN_FACT = [0];
function lnFact(n) {
  for (let i = LN_FACT.length; i <= n; i += 1) LN_FACT.push(LN_FACT[i - 1] + Math.log(i));
  return LN_FACT[n];
}
const lnChoose = (n, k) => lnFact(n) - lnFact(k) - lnFact(n - k);

/**
 * Two-sided Fisher exact p-value for the 2×2 table [[a, b], [c, d]] by the
 * method of small p-values: the probability, under fixed margins, of every
 * table no more likely than the one observed.
 */
export function standardWorkFisherExact(a, b, c, d) {
  const cells = [a, b, c, d];
  if (cells.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const row1 = a + b;
  const col1 = a + c;
  const total = a + b + c + d;
  if (!total) return null;
  const lnDen = lnChoose(total, col1);
  const prob = (x) => Math.exp(lnChoose(row1, x) + lnChoose(total - row1, col1 - x) - lnDen);
  const observed = prob(a);
  const lo = Math.max(0, col1 - (total - row1));
  const hi = Math.min(row1, col1);
  let p = 0;
  for (let x = lo; x <= hi; x += 1) {
    const px = prob(x);
    if (px <= observed * (1 + 1e-9)) p += px;
  }
  return Math.min(1, p);
}

/** Exact one-sided 95% upper bound on a rate after zero events in n trials (Clopper–Pearson, x = 0), in percent. */
export function standardWorkZeroUpperPct(n) {
  if (!Number.isInteger(n) || n <= 0) return null;
  return round1((1 - Math.pow(0.05, 1 / n)) * 100);
}

function adherence(doneN, closedN, minSlots) {
  if (!closedN) return { pct: null, low: null, high: null, withheld: true, reason: 'No closed slot in the window.' };
  if (closedN < minSlots) {
    return { pct: null, low: null, high: null, withheld: true, reason: `${closedN} closed slot(s) is fewer than the declared floor of ${minSlots}; the counts are printed and the rate is withheld.` };
  }
  const interval = matrixWilson(doneN, closedN);
  return { pct: round1((doneN / closedN) * 100), low: interval.lower, high: interval.upper, withheld: false, reason: null };
}

/* --------------------------------------------------------------- the slots */

/** Every slot key whose period touches [fromDay, today], in calendar order. */
function slotKeysBetween(routine, fromDay, today) {
  const keys = [];
  if (routine.cadence === 'daily') {
    for (let day = fromDay; day <= today; day = addDays(day, 1)) keys.push(day);
  } else if (routine.cadence === 'weekly') {
    for (let day = weekStart(fromDay); day <= today; day = addDays(day, 7)) keys.push(standardWorkSlotKeyFor('weekly', day));
  } else {
    let cursor = `${fromDay.slice(0, 7)}-01`;
    while (cursor <= today) {
      keys.push(cursor.slice(0, 7));
      cursor = addDays(standardWorkSlotRange('monthly', cursor.slice(0, 7)).end, 1);
    }
  }
  return keys;
}

function slotLabel(routine, slotKey, range) {
  if (routine.cadence === 'daily') return slotKey;
  if (routine.cadence === 'weekly') return `${slotKey} (${range.start} → ${range.end})`;
  return slotKey;
}

/* ---------------------------------------------------------------- the read */

export function buildStandardWork(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizeStandardWorkSettings(effective);
  const K = { window: conv.standardWorkWindowDays, minSlots: conv.standardWorkMinSlots, lapseRun: conv.standardWorkLapseRun, tierDays: conv.standardWorkTierDays, weekMinutes: conv.standardWorkWeekMinutes, auto: conv.standardWorkAutoPropagate };
  const today = dayKey(now);
  const windowFrom = addDays(today, -K.window);
  const matrix = buildMatrix(state, { now, settings: effective });
  const chainNodes = matrix.chain?.nodes || new Map();

  const routines = list(state?.standardWorkRoutines);
  const checks = list(state?.standardWorkChecks);
  const acts = list(state?.standardWorkTierActs);
  const checkBySlot = new Map(checks.map((check) => [`${check.routineId}|${check.slotKey}`, check]));
  const actsByCheck = new Map();
  for (const act of acts) {
    if (!actsByCheck.has(act.checkId)) actsByCheck.set(act.checkId, []);
    actsByCheck.get(act.checkId).push(act);
  }

  const formerNames = new Map(list(state?.people).map((person) => [person.id, person.name]));
  const nameOf = (id) => (id ? (matrix.nodes.get(id)?.name || formerNames.get(id) || 'Former colleague') : '—');
  const onRoster = (id) => id === LEADER_ID || matrix.roster.has(id);
  const tierOf = (id) => altitudeRank(matrix.nodes.get(id)?.altitude) || null;
  const linesOf = (id) => (id === LEADER_ID ? [] : list(matrix.linesByPerson.get(id)));
  const lineChoices = (id) => linesOf(id).map((line) => ({
    lineKey: line.role === 'primary' ? 'home' : line.id,
    managerId: line.managerId,
    managerName: nameOf(line.managerId),
    kind: line.kind,
    role: line.role,
  }));

  /* The seat. `actorId` is who a first-person act would be recorded as: the
     declared seat's own node, or the workspace leader for the operator view. */
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
  const inReach = (id) => operator || id === actorId || reach.has(id);

  const refusalCounts = new Map();
  const refuse = (key, n = 1) => refusalCounts.set(key, (refusalCounts.get(key) || 0) + n);

  /* 1. Evaluate every routine once, workspace-wide. Scoping is applied after,
        so a seat's figure is a subset of the same evaluation, never a re-read. */
  const evaluated = routines.map((routine) => {
    const ownerOn = onRoster(routine.ownerId);
    const lines = linesOf(routine.ownerId);
    let tierState;
    let nextTierId = null;
    let lineKind = null;
    if (!ownerOn) tierState = 'off-roster';
    else if (routine.ownerId === LEADER_ID) tierState = 'top-tier';
    else if (routine.lineKey) {
      const line = lines.find((row) => (routine.lineKey === 'home' ? row.role === 'primary' : row.id === routine.lineKey));
      if (line) { tierState = 'named-line'; nextTierId = line.managerId; lineKind = line.kind; } else tierState = 'line-ended';
    } else if (lines.length === 1) { tierState = 'single-line'; nextTierId = lines[0].managerId; lineKind = lines[0].kind; } else tierState = 'ambiguous';

    const slots = [];
    let partialN = 0;
    if (ownerOn && routine.fromDay <= today) {
      const from = routine.fromDay > windowFrom ? routine.fromDay : windowFrom;
      for (const slotKey of slotKeysBetween(routine, from, today)) {
        const range = standardWorkSlotRange(routine.cadence, slotKey);
        if (!range || range.end < windowFrom) continue;
        if (!standardWorkOwesSlot(routine, slotKey)) {
          // A period the routine was only partly in force for is not owed.
          if (routine.cadence !== 'daily' && range.end >= routine.fromDay && (!routine.retiredOn || range.start < routine.retiredOn)) partialN += 1;
          continue;
        }
        const check = checkBySlot.get(`${routine.id}|${slotKey}`) || null;
        const ended = range.end < today;
        const stateKey = check ? check.outcome : (ended ? 'unrecorded' : 'open');
        slots.push({
          slotKey, label: slotLabel(routine, slotKey, range), start: range.start, end: range.end,
          state: stateKey, glyph: SLOT.get(stateKey).glyph, stateLabel: SLOT.get(stateKey).label,
          closed: stateKey !== 'open', late: Boolean(check?.late), checkId: check?.id || null,
        });
      }
    }
    const closed = slots.filter((slot) => slot.closed);
    const n = (key) => closed.filter((slot) => slot.state === key).length;
    const doneN = n('done');
    const abnormalN = n('abnormal');
    const missedN = n('missed');
    const unrecordedN = n('unrecorded');
    let run = 0;
    for (let i = closed.length - 1; i >= 0 && (closed[i].state === 'missed' || closed[i].state === 'unrecorded'); i -= 1) run += 1;
    const verdict = !closed.length ? 'new' : run >= K.lapseRun ? 'lapsed' : (missedN + unrecordedN) ? 'gaps' : 'held';
    const retired = Boolean(routine.retiredOn && routine.retiredOn <= today);

    // What the owner may still record: the current slot, and the one before it
    // (late) while that is still unrecorded. Anything older is closed for good.
    const recordable = [];
    if (ownerOn && !retired && routine.fromDay <= today) {
      const currentKey = standardWorkSlotKeyFor(routine.cadence, today);
      const previousKey = standardWorkPreviousSlot(routine, currentKey);
      for (const [slotKey, late] of [[currentKey, false], [previousKey, true]]) {
        if (!slotKey || !standardWorkOwesSlot(routine, slotKey) || checkBySlot.has(`${routine.id}|${slotKey}`)) continue;
        const range = standardWorkSlotRange(routine.cadence, slotKey);
        if (late ? range.end >= today : (range.start > today || range.end < today)) continue;
        recordable.push({ slotKey, label: slotLabel(routine, slotKey, range), late });
      }
    }

    const yearMinutes = routine.cadence === 'daily' ? routine.minutes * routine.weekdays.length * 52
      : routine.cadence === 'weekly' ? routine.minutes * 52 : routine.minutes * 12;
    return {
      routine, ownerOn, retired, tierState, nextTierId, lineKind, slots, closedN: closed.length, doneN, abnormalN, missedN, unrecordedN,
      openN: slots.length - closed.length, lateN: slots.filter((slot) => slot.late).length, partialN, run, verdict, recordable,
      checksN: doneN + abnormalN, yearMinutes,
    };
  });

  /* 2. Finding yield. Pooled by kind over every live routine in the workspace,
        so the Bonferroni count does not depend on which seat is reading. */
  const live = evaluated.filter((row) => row.ownerOn);
  const byKind = new Map();
  for (const row of live) {
    const pool = byKind.get(row.routine.kind) || { checksN: 0, abnormalN: 0, routinesN: 0 };
    if (row.checksN) { pool.checksN += row.checksN; pool.abnormalN += row.abnormalN; pool.routinesN += 1; }
    byKind.set(row.routine.kind, pool);
  }
  const MIN_Y = STANDARD_WORK_LIMITS.yieldMinChecks;
  const tests = [];
  for (const row of live) {
    const pool = byKind.get(row.routine.kind);
    const rest = { checksN: pool.checksN - row.checksN, abnormalN: pool.abnormalN - row.abnormalN, routinesN: pool.routinesN - (row.checksN ? 1 : 0) };
    row.yield = { checksN: row.checksN, abnormalN: row.abnormalN, zeroUpperPct: row.checksN && !row.abnormalN ? standardWorkZeroUpperPct(row.checksN) : null, tested: false, question: false, p: null, restRatePct: null, restChecksN: null, reason: null };
    if (!row.checksN) continue;
    // Two other routines at least, so a pooled rate never exposes one peer's record.
    if (row.checksN < MIN_Y || rest.checksN < MIN_Y || rest.routinesN < 2) { row.yield.reason = 'yield-thin'; continue; }
    row.yield.tested = true;
    row.yield.restChecksN = rest.checksN;
    row.yield.restRatePct = round1((rest.abnormalN / rest.checksN) * 100);
    row.yield.p = standardWorkFisherExact(row.abnormalN, row.checksN - row.abnormalN, rest.abnormalN, rest.checksN - rest.abnormalN);
    tests.push(row);
  }
  for (const row of tests) {
    const lower = row.abnormalN * (row.yield.restChecksN) < (byKind.get(row.routine.kind).abnormalN - row.abnormalN) * row.checksN;
    row.yield.testsN = tests.length;
    row.yield.adjustedP = Math.min(1, row.yield.p * tests.length);
    row.yield.question = lower && row.yield.adjustedP < STANDARD_WORK_LIMITS.yieldAlpha;
  }

  /* 3. Escalation chains, replayed hop by hop from the stored acts. */
  const evalByRoutine = new Map(evaluated.map((row) => [row.routine.id, row]));
  const escalationsAll = [];
  for (const check of checks) {
    if (check.disposition !== 'escalated') continue;
    const owner = evalByRoutine.get(check.routineId);
    if (!owner) continue;
    const hops = [{ hop: 1, holderId: check.toId, addressedOn: check.recordedOn, fromId: owner.routine.ownerId, act: null, actedOn: null, note: '' }];
    let closedBy = null;
    for (const act of list(actsByCheck.get(check.id))) {
      const current = hops[hops.length - 1];
      current.act = act.act; current.actedOn = act.actedOn; current.note = act.note;
      if (act.act === 'escalated') hops.push({ hop: current.hop + 1, holderId: act.toId, addressedOn: act.actedOn, fromId: act.actorId, act: null, actedOn: null, note: '' });
      else closedBy = act.act;
    }
    const current = hops[hops.length - 1];
    const ageDays = closedBy ? null : daysBetween(current.addressedOn, today);
    const stateKey = closedBy || (!onRoster(current.holderId) ? 'unattributable' : ageDays > K.tierDays ? 'overdue' : 'open');
    escalationsAll.push({
      checkId: check.id, routineId: check.routineId, routineTitle: owner.routine.title, ownerId: owner.routine.ownerId, ownerName: nameOf(owner.routine.ownerId),
      raisedOn: check.recordedOn, finding: check.note, slotKey: check.slotKey,
      state: stateKey, stateLabel: ESC.get(stateKey).label, stateTone: ESC.get(stateKey).tone, open: ESC.get(stateKey).open,
      holderId: closedBy ? null : current.holderId, holderName: closedBy ? null : nameOf(current.holderId), holderTier: closedBy ? null : tierOf(current.holderId),
      hopN: hops.length, ageDays, dueOn: closedBy ? null : addDays(current.addressedOn, K.tierDays),
      closedOn: closedBy ? current.actedOn : null,
      hops: hops.map((hop) => ({ ...hop, holderName: nameOf(hop.holderId), fromName: nameOf(hop.fromId), tier: tierOf(hop.holderId) })),
      holderIds: hops.map((hop) => hop.holderId),
    });
  }

  /* 4. Scope. A seat sees in DETAIL its own routines and the routines owed to
        it as the next tier (plus an unresolved routine of someone it holds a
        line over, so the missing line can be seen and named). Everything else
        inside its reach is counted in the span figure and not listed. */
  const holdsLineOver = (ownerId) => linesOf(ownerId).some((line) => line.managerId === actorId);
  const scoped = evaluated.filter((row) => inReach(row.routine.ownerId));
  const detailed = (row) => operator || row.routine.ownerId === actorId || row.nextTierId === actorId
    || (!TIER.get(row.tierState).resolved && row.tierState !== 'top-tier' && holdsLineOver(row.routine.ownerId));
  const scopedLive = scoped.filter((row) => row.ownerOn);

  const toRow = (row) => {
    const { routine } = row;
    const rate = adherence(row.doneN + row.abnormalN, row.closedN, K.minSlots);
    const isOwner = routine.ownerId === actorId;
    return {
      routineId: routine.id, title: routine.title, standard: routine.standard, kind: routine.kind, kindLabel: KIND.get(routine.kind).label,
      cadence: routine.cadence, cadenceLabel: CADENCE.get(routine.cadence).label, minutes: routine.minutes, weekdays: routine.weekdays,
      ownerId: routine.ownerId, ownerName: nameOf(routine.ownerId), ownerTier: tierOf(routine.ownerId),
      fromDay: routine.fromDay, retired: row.retired, retiredOn: routine.retiredOn, retiredReason: routine.retiredReason,
      tierState: row.tierState, tierStateLabel: TIER.get(row.tierState).label, tierReason: TIER.get(row.tierState).says,
      nextTierId: row.nextTierId, nextTierName: row.nextTierId ? nameOf(row.nextTierId) : null, lineKind: row.lineKind,
      verdict: row.verdict, verdictLabel: VERDICT.get(row.verdict).label, verdictTone: VERDICT.get(row.verdict).tone, verdictReason: VERDICT.get(row.verdict).says,
      closedN: row.closedN, doneN: row.doneN, abnormalN: row.abnormalN, missedN: row.missedN, unrecordedN: row.unrecordedN, openN: row.openN,
      lateN: row.lateN, partialN: row.partialN, run: row.run,
      adherencePct: rate.pct, adherenceLowPct: rate.low, adherenceHighPct: rate.high, adherenceWithheld: rate.withheld, adherenceReason: rate.reason,
      strip: row.slots.slice(-20).map((slot) => ({ slotKey: slot.slotKey, state: slot.state, glyph: slot.glyph, label: `${slot.label}: ${slot.stateLabel}${slot.late ? ' (recorded late)' : ''}` })),
      yield: row.yield || null,
      isOwner,
      canRecord: isOwner && row.recordable.length > 0,
      recordable: isOwner ? row.recordable : [],
      escalateTo: isOwner ? lineChoices(routine.ownerId) : [],
      canRetire: !row.retired && row.ownerOn && (operator || isOwner || row.nextTierId === actorId),
    };
  };

  const order = (a, b) => VERDICT.get(a.verdict).rank - VERDICT.get(b.verdict).rank
    || a.ownerName.localeCompare(b.ownerName) || a.title.localeCompare(b.title) || a.routineId.localeCompare(b.routineId);
  const detailRows = scopedLive.filter(detailed).map(toRow).sort(order);
  const belowTierN = scopedLive.length - detailRows.length;
  if (belowTierN) refuse('below-tier', belowTierN);
  const shownRows = detailRows.slice(0, STANDARD_WORK_LIMITS.rowsShown);
  if (detailRows.length > shownRows.length) refuse('truncated', detailRows.length - shownRows.length);

  /* 5. Totals over the scoped, on-roster routines — each counted once. */
  const sum = (rows, field) => rows.reduce((acc, row) => acc + row[field], 0);
  const totalsOf = (rows) => {
    const closedN = sum(rows, 'closedN');
    const doneN = sum(rows, 'doneN');
    const abnormalN = sum(rows, 'abnormalN');
    const rate = adherence(doneN + abnormalN, closedN, K.minSlots);
    return {
      routinesN: rows.length, closedN, doneN, abnormalN, missedN: sum(rows, 'missedN'), unrecordedN: sum(rows, 'unrecordedN'),
      openN: sum(rows, 'openN'), lateN: sum(rows, 'lateN'),
      adherencePct: rate.pct, adherenceLowPct: rate.low, adherenceHighPct: rate.high, adherenceWithheld: rate.withheld, adherenceReason: rate.reason,
      lapsedN: rows.filter((row) => row.verdict === 'lapsed' && !row.retired).length,
    };
  };
  const base = totalsOf(scopedLive);
  const verdictCounts = Object.fromEntries(STANDARD_WORK_VERDICTS.map((row) => [row.key, scopedLive.filter((r) => r.verdict === row.key).length]));
  const tierStateCounts = Object.fromEntries(STANDARD_WORK_TIER_STATES.map((row) => [row.key, scoped.filter((r) => r.tierState === row.key).length]));
  const tierUnresolvedN = tierStateCounts.ambiguous + tierStateCounts['line-ended'];
  if (tierUnresolvedN) refuse('tier-unresolved', tierUnresolvedN);
  if (tierStateCounts['off-roster']) refuse('off-roster', tierStateCounts['off-roster']);
  const thinN = scopedLive.filter((row) => row.closedN > 0 && row.closedN < K.minSlots).length;
  if (thinN) refuse('thin-slots', thinN);
  const yieldThinN = scopedLive.filter((row) => row.yield?.reason === 'yield-thin').length;
  if (yieldThinN) refuse('yield-thin', yieldThinN);
  if (matrix.defects.length) refuse('matrix-defect', matrix.defects.length);

  /* 6. Escalations in scope: listed for the owner and every hop's holder,
        counted for anyone else whose reach contains the owner. */
  const escScoped = escalationsAll.filter((row) => inReach(row.ownerId) || row.holderIds.includes(actorId));
  const escDetailed = escScoped.filter((row) => operator || row.ownerId === actorId || row.holderIds.includes(actorId));
  const escRank = (row) => STANDARD_WORK_ESCALATION_STATES.findIndex((s) => s.key === row.state);
  const escalations = escDetailed
    .map((row) => ({ ...row, canAct: row.open && row.state !== 'unattributable' && row.holderId === actorId, escalateTo: row.holderId === actorId ? lineChoices(actorId) : [] }))
    .sort((a, b) => escRank(a) - escRank(b) || String(a.raisedOn).localeCompare(String(b.raisedOn)) || a.checkId.localeCompare(b.checkId));
  const escalationCounts = Object.fromEntries(STANDARD_WORK_ESCALATION_STATES.map((row) => [row.key, escScoped.filter((r) => r.state === row.key).length]));
  const closedHops = escScoped.filter((row) => !row.open).map((row) => row.hopN).sort((a, b) => a - b);
  const medianHops = closedHops.length ? (closedHops.length % 2 ? closedHops[(closedHops.length - 1) / 2] : (closedHops[closedHops.length / 2 - 1] + closedHops[closedHops.length / 2]) / 2) : null;

  /* 7. Structured time per leader, against Mann's reference band. */
  const ownerMap = new Map();
  for (const row of scopedLive) {
    if (row.retired || row.routine.fromDay > today) continue;
    const entry = ownerMap.get(row.routine.ownerId) || { ownerId: row.routine.ownerId, routinesN: 0, yearMinutes: 0 };
    entry.routinesN += 1;
    entry.yearMinutes += row.yearMinutes;
    ownerMap.set(row.routine.ownerId, entry);
  }
  const owners = [...ownerMap.values()].filter((entry) => operator || entry.ownerId === actorId || evaluated.some((row) => row.routine.ownerId === entry.ownerId && row.nextTierId === actorId)).map((entry) => {
    const altitude = matrix.nodes.get(entry.ownerId)?.altitude || null;
    const band = altitude ? STANDARD_WORK_STRUCTURE_BANDS[altitude] || null : null;
    const sharePct = round1((entry.yearMinutes / (K.weekMinutes * 52)) * 100);
    const verdict = !band ? 'no-band' : sharePct < band.lowPct ? 'below-band' : sharePct > band.highPct ? 'above-band' : 'in-band';
    return {
      ownerId: entry.ownerId, ownerName: nameOf(entry.ownerId), tier: tierOf(entry.ownerId), altitude,
      routinesN: entry.routinesN, weekMinutes: Math.round(entry.yearMinutes / 52), sharePct,
      bandLowPct: band?.lowPct ?? null, bandHighPct: band?.highPct ?? null, bandBasis: band?.basis || null,
      verdict, verdictLabel: STRUCT.get(verdict).label, verdictTone: STRUCT.get(verdict).tone,
    };
  }).sort((a, b) => (b.tier || 0) - (a.tier || 0) || a.ownerName.localeCompare(b.ownerName));

  /* 8. The span roll-up. One row per leadership node that has routines beneath
        it on ANY line. `descendants` is a set, so a routine whose owner reaches
        the node through two lines is in the span once. */
  const spans = [];
  for (const node of matrix.nodes.values()) {
    if (!node.descendants?.size || !inReach(node.id)) continue;
    const members = live.filter((row) => node.descendants.has(row.routine.ownerId));
    if (!members.length) continue;
    const tree = new Set(chainNodes.get(node.id)?.subtreeIds || []);
    const t = totalsOf(members);
    spans.push({
      nodeId: node.id, name: node.name, tier: tierOf(node.id), isLeader: node.id === LEADER_ID,
      ...t, ownersN: new Set(members.map((row) => row.routine.ownerId)).size,
      viaLineOnlyN: node.id === LEADER_ID ? 0 : members.filter((row) => !tree.has(row.routine.ownerId)).length,
      openEscalationsN: escalationsAll.filter((row) => row.open && node.descendants.has(row.ownerId)).length,
    });
  }
  spans.sort((a, b) => (b.tier || 0) - (a.tier || 0) || a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId));

  /* 9. The claims, kept apart: the figures add up; every figure is complete. */
  const stateSum = base.doneN + base.abnormalN + base.missedN + base.unrecordedN;
  const countsReconcile = stateSum === base.closedN
    && Object.values(verdictCounts).reduce((a, b) => a + b, 0) === scopedLive.length
    && Object.values(tierStateCounts).reduce((a, b) => a + b, 0) === scoped.length
    && Object.values(escalationCounts).reduce((a, b) => a + b, 0) === escScoped.length
    && detailRows.length + belowTierN === scopedLive.length;
  const incomplete = [];
  if (base.adherenceWithheld && base.closedN) incomplete.push(base.adherenceReason);
  if (matrix.defects.length) incomplete.push(`${matrix.defects.length} reporting line(s) were refused by the matrix engine; a span that crosses one is incomplete.`);
  if (detailRows.length > shownRows.length) incomplete.push(`${detailRows.length - shownRows.length} routine row(s) are counted and not listed.`);

  const attentionN = escalationsAll.filter((row) => row.open && row.holderId === actorId).length
    + live.filter((row) => row.verdict === 'lapsed' && !row.retired && (row.routine.ownerId === actorId || row.nextTierId === actorId)).length;

  const report = {
    engineVersion: STANDARD_WORK_ENGINE_VERSION,
    today,
    window: { fromDay: windowFrom, toDay: today, days: K.window },
    conventions: { windowDays: K.window, minSlots: K.minSlots, lapseRun: K.lapseRun, tierDays: K.tierDays, weekMinutes: K.weekMinutes, autoPropagate: K.auto },
    scope: operator ? 'workspace' : 'seat',
    seatId: operator ? null : actorId,
    actorId,
    actorName: nameOf(actorId),
    actorTier: tierOf(actorId),
    actorLines: lineChoices(actorId),
    routines: shownRows,
    owners,
    escalations,
    spans,
    totals: {
      ...base,
      ownersN: new Set(scopedLive.map((row) => row.routine.ownerId)).size,
      detailRowsN: detailRows.length, shownRowsN: shownRows.length, belowTierN,
      verdictCounts, tierStateCounts, tierUnresolvedN, offRosterN: tierStateCounts['off-roster'],
      escalationsN: escScoped.length, escalationCounts,
      escalationsOpenN: escalationCounts.open + escalationCounts.overdue + escalationCounts.unattributable,
      medianHops,
      yieldTestsN: tests.length, yieldQuestionsN: scopedLive.filter((row) => row.yield?.question).length,
      stateSum, attentionN,
    },
    claims: { countsReconcile, figuresComplete: incomplete.length === 0, reasons: incomplete },
    refusals: STANDARD_WORK_READ_REFUSALS.filter((row) => refusalCounts.has(row.key)).map((row) => ({ key: row.key, n: refusalCounts.get(row.key), says: REFUSAL.get(row.key).says })),
    kinds: STANDARD_WORK_KINDS.map((kind) => {
      const rows = scopedLive.filter((row) => row.routine.kind === kind.key);
      return { key: kind.key, label: kind.label, ...totalsOf(rows) };
    }).filter((row) => row.routinesN),
  };
  // The rule needs the workspace evaluation and the graph; neither is printable.
  Object.defineProperty(report, 'internal', { enumerable: false, value: { matrix, evaluated: live, escalations: escalationsAll, nameOf, tierOf } });
  return report;
}

/* ------------------------------------------------------------------ outputs */

export function standardWorkAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  if (!list(state?.standardWorkRoutines).length) return 0;
  try {
    return buildStandardWork(state, { now, settings, seat }).totals.attentionN;
  } catch {
    return 0;
  }
}

const yesNo = (value) => (value ? 'yes' : 'no');
const blank = (value) => (value === null || value === undefined ? '' : value);

/** CSV scope #143: aggregate rows from the SAME report the screen printed. */
export function standardWorkCsvRows(report) {
  const t = report.totals;
  const common = { generated_on: report.today, window_from: report.window.fromDay, window_to: report.window.toDay, engine_version: report.engineVersion };
  const figures = (row) => ({
    routines_n: row.routinesN, closed_slots_n: row.closedN, done_n: row.doneN, abnormal_n: row.abnormalN, missed_n: row.missedN,
    unrecorded_n: row.unrecordedN, open_slots_n: row.openN, late_checks_n: row.lateN,
    adherence_pct: blank(row.adherencePct), adherence_low_pct: blank(row.adherenceLowPct), adherence_high_pct: blank(row.adherenceHighPct),
    adherence_withheld_reason: row.adherenceWithheld ? (row.adherenceReason || '') : '', lapsed_n: row.lapsedN,
  });
  const rows = [{
    row_type: 'workspace', key: report.scope, label: report.scope === 'workspace' ? 'Whole workspace' : 'Declared seat and its reach', ...common, ...figures(t),
    owners_n: t.ownersN, tier_unresolved_n: t.tierUnresolvedN, escalations_n: t.escalationsN, escalations_open_n: t.escalationsOpenN,
    escalations_overdue_n: t.escalationCounts.overdue, contained_n: t.escalationCounts.contained, returned_n: t.escalationCounts.returned,
    median_hops: blank(t.medianHops), yield_questions_n: t.yieldQuestionsN,
    counts_reconcile: yesNo(report.claims.countsReconcile), figures_complete: yesNo(report.claims.figuresComplete), claim_reason: report.claims.reasons.join(' | '),
  }];
  for (const row of STANDARD_WORK_VERDICTS) rows.push({ row_type: 'routine-verdict', key: row.key, label: row.label, ...common, routines_n: t.verdictCounts[row.key] });
  for (const [key, field] of [['done', 'doneN'], ['abnormal', 'abnormalN'], ['missed', 'missedN'], ['unrecorded', 'unrecordedN'], ['open', 'openN']]) {
    rows.push({ row_type: 'slot-state', key, label: SLOT.get(key).label, ...common, [key === 'open' ? 'open_slots_n' : 'closed_slots_n']: t[field] });
  }
  for (const row of STANDARD_WORK_ESCALATION_STATES) rows.push({ row_type: 'escalation-state', key: row.key, label: row.label, ...common, escalations_n: t.escalationCounts[row.key] });
  for (const row of report.kinds) rows.push({ row_type: 'routine-kind', key: row.key, label: row.label, ...common, ...figures(row) });
  return rows;
}

/** A plain-text brief, generated from the report and nothing else. */
export function standardWorkBriefText(report) {
  const t = report.totals;
  const rate = t.adherenceWithheld ? `withheld — ${t.adherenceReason}` : `${t.adherencePct}% (95% Wilson ${t.adherenceLowPct}–${t.adherenceHighPct}%)`;
  const lines = [
    `Leader standard work & tiered daily management — ${report.today}`,
    `Scope: ${report.scope === 'workspace' ? 'whole workspace' : `seat of ${report.actorName} and its reach`} · window ${report.window.fromDay} → ${report.window.toDay} (${report.window.days} days).`,
    `Routines in force: ${t.routinesN} across ${t.ownersN} leader(s). Closed slots: ${t.closedN} = done ${t.doneN} + done with abnormality ${t.abnormalN} + missed with a reason ${t.missedN} + unrecorded ${t.unrecordedN}. Still open: ${t.openN}. Recorded late: ${t.lateN}.`,
    `Adherence: ${rate}.`,
    `Routine verdicts: lapsed ${t.verdictCounts.lapsed} · gaps ${t.verdictCounts.gaps} · held ${t.verdictCounts.held} · no closed slot yet ${t.verdictCounts.new}.`,
    `Next tier: ${t.tierUnresolvedN} routine(s) have no knowable next tier (line not named, or named line ended); ${t.offRosterN} belong to an owner no longer on the roster.`,
    `Escalated abnormalities: ${t.escalationsN} — overdue at tier ${t.escalationCounts.overdue} · with the tier ${t.escalationCounts.open} · holder off roster ${t.escalationCounts.unattributable} · contained ${t.escalationCounts.contained} · returned ${t.escalationCounts.returned}.${t.medianHops === null ? '' : ` Median hops to close: ${t.medianHops}.`}`,
    `Finding-yield questions: ${t.yieldQuestionsN} (of ${t.yieldTestsN} routine(s) with enough checks to compare, Bonferroni-corrected).`,
    `Two claims, apart: the figures add up — ${yesNo(report.claims.countsReconcile)}; every printed figure is complete — ${yesNo(report.claims.figuresComplete)}${report.claims.reasons.length ? ` (${report.claims.reasons.join(' ')})` : ''}.`,
  ];
  for (const row of report.refusals) lines.push(`Refused (${row.n}): ${row.says}`);
  lines.push('Adherence is not performance: a held routine says the leader looked, not that the process is healthy. Nothing here rates a person.');
  return lines.join('\n');
}
