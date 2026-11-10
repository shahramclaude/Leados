/**
 * app/core/domain/meritStructure.js — As-Of Home-Line Authority Reading for the
 * merit terminal (ADR-0155, Schema v128 unchanged, `#/merit?panel=matrix`).
 *
 * THE DEFECT THIS CLOSES, IN AN OPERATOR'S WORDS. The merit cycle was finalised
 * in November and Sam was paid 2.5%, under Dana's pay right. In February the
 * reorganisation moved Sam's home line to Marcus. In March an auditor opens the
 * November packet. Every matrix surface in the product answers from
 * `person.managerId` — TODAY'S pointer — so the packet says Marcus held the pay
 * right on a decision he had never seen, and nothing anywhere says the answer
 * changed after the fact. The frozen `audit` carries band integrity, the
 * decomposition and the departure predictions, and carried no structure at all.
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 *   1. Reads each person's HOME LINE as of the cycle's effective date from the
 *      dated home-line ledger (ADR-0149), with four states that are never
 *      collapsed: `observed`, `projected`, `presumed-current`, `unrecorded`.
 *   2. Builds ONE as-of state — today's roster with each person's home pointer
 *      replaced by the pointer the record says they had on that day — and hands
 *      it to the SAME `buildMatrix` engine every other matrix module uses. There
 *      is no second hierarchy, no parallel right model and no re-implementation
 *      of line classification.
 *   3. Freezes a compact structure block beside the money at finalisation, so a
 *      past pay decision can prove the structure it was made under even after
 *      the organisation has moved twice.
 *   4. Compares a live reading against that frozen block and reports `identical`
 *      / `drifted` / `unreadable` / `not-frozen` — reporting, never correcting.
 *      The frozen record governs what the decision was made under. The live
 *      reading describes the organisation now. Neither is edited.
 *
 * WHAT IT REFUSES
 * ---------------
 *  - It never projects today's pointer backwards across a day the ledger does
 *    not cover. Records exist for that person and none reaches the day → the
 *    period is UNREADABLE, and every figure depending on it is withheld.
 *  - It never calls a future day `observed`. An open period read over a day
 *    that has not happened is `projected`, and it says so.
 *  - It never treats "no recorded history" as knowledge. It is a PRINTED
 *    PRESUMPTION that today's pointer held on that day — the only reading that
 *    lets an existing workspace's merit page keep working — and it is counted,
 *    named and exported as a presumption on every surface.
 *  - It never settles a contested right, never re-points a stored act, and never
 *    writes. Pure module: no DOM, no storage, no implicit clock.
 *
 * FRAMEWORK BASIS. Bitemporal valid-time vs transaction-time (Snodgrass 1999);
 * evidence sufficiency for frozen decisions (COSO 2013; IIA); disclosure
 * control as the house convention (ADR-0139 / ADR-0126). See
 * `meritStructureRegistry.js` for the declared vocabulary and the reasons.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import { buildStructureLedger, homeLineOn, rosterStatusOn } from './structureHistory.js';
import { periodLinesFor } from './reviewStewardship.js';
import {
  MERIT_STRUCTURE_ENGINE_VERSION,
  MERIT_STRUCTURE_LIMITS,
  MERIT_STRUCTURE_STATES,
  MERIT_STRUCTURE_FREEZE_VERDICTS,
  meritStructureFreezeVerdict,
  meritStructureState,
} from './meritStructureRegistry.js';

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));
const dayOf = (v) => (isDay(v) ? String(v).trim().slice(0, 10) : null);
const nameOf = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

/* --------------------------------------------------------------- the reading */

/**
 * Resolve one person's home line on `day`, with the state that justifies it.
 *
 * The four states and their exact conditions (see the registry for why each one
 * exists):
 *
 *   observed         a recorded period covers the day, and the day is not future
 *   projected        no recorded period covers the day, but one is OPEN and the
 *                    day is in the FUTURE: the current line is presumed to
 *                    continue — a presumption about a day nobody has lived
 *   presumed-current no home-line record exists for this person at all, so
 *                    today's pointer is used and printed as a presumption
 *   unrecorded       records exist for this person and NONE covers the day
 *
 * A person who was not on the roster that day is a FIFTH fact and is returned
 * separately (`not-on-roster`): a joiner who did not exist yet is knowledge, not
 * ignorance, and collapsing the two overstates every denominator.
 */
function resolveHomeLine({ person, day, today, ledger }) {
  const notOnRoster = rosterStatusOn(person, day);
  if (notOnRoster) {
    return {
      state: notOnRoster,
      managerId: null,
      managerName: null,
      recordId: null,
      fromISO: null,
      toISO: null,
      reason: person.status === 'archived'
        ? `Archived on ${dayOf(person.archivedAt) || 'an unrecorded day'}, at or before ${day}.`
        : `Started ${dayOf(person.startDate) || dayOf(person.createdAt) || 'on an unrecorded day'}, after ${day}.`,
    };
  }
  const hasHistory = ledger.byPerson.has(person.id);
  const line = homeLineOn(ledger, person.id, day);
  const future = day > today;

  if (line.state === 'observed') {
    // A CLOSED recorded period that reaches a future day is still the record for
    // that day: somebody declared that this line runs until that end date, and
    // reading the declaration is not extrapolation. An OPEN period has no end,
    // so reading it for a day that has not happened IS extrapolation — the line
    // is presumed to continue, and it is labelled as exactly that.
    const extrapolated = future && !line.record?.toISO;
    return {
      state: extrapolated ? 'projected' : 'observed',
      managerId: line.managerId,
      recordId: line.record?.id || null,
      fromISO: line.record?.fromISO || null,
      toISO: line.record?.toISO || null,
      reason: extrapolated
        ? `The recorded period beginning ${line.record?.fromISO} has no end date, so reaching ${day} (which has not happened yet) is a PRESUMPTION that the current line continues. Nothing about a future day is recorded.`
        : `Recorded from ${line.record?.fromISO}${line.record?.toISO ? ` to ${line.record.toISO}` : ' and still open'}.`,
    };
  }

  if (!hasHistory) {
    // NOT a hole: nothing in this workspace says the line ever changed.
    return {
      state: 'presumed-current',
      managerId: person.managerId || LEADER_ID,
      recordId: null,
      fromISO: null,
      toISO: null,
      reason: 'No home-line record exists for this person at all, so nothing in the record says the line ever changed. Today’s pointer is used as a PRESUMPTION, not as evidence about that day. Recording the move is what turns this into an observation.',
    };
  }

  // Records exist and none reaches the day. This is the whole failure mode.
  const rows = ledger.byPerson.get(person.id) || [];
  const earliest = rows.reduce((min, r) => (!min || r.fromISO < min ? r.fromISO : min), null);
  const latestEnd = rows.reduce((max, r) => (r.toISO && (!max || r.toISO > max) ? r.toISO : max), null);
  return {
    state: 'unrecorded',
    managerId: null,
    recordId: null,
    fromISO: null,
    toISO: null,
    reason: `No recorded home-line period covers ${day}. This person’s records span ${earliest || 'an unrecorded start'}${latestEnd ? ` to at most ${latestEnd}` : ' onward, none of them closed'}, and today’s pointer is not evidence about ${day}.`,
  };
}

/**
 * The whole as-of structure reading.
 *
 * Returns the per-person observations, the substituted AS-OF STATE that the
 * matrix engine will run over, the engine's own defects (refused declarations),
 * and the counts that every surface prints.
 */
export function buildMeritStructure(state = {}, { asOf = null, now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const day = dayOf(asOf);
  const cfg = settings || state?.settings || null;
  const ledger = buildStructureLedger(state);

  if (!day) {
    return emptyStructure({ today, refusals: [{ kind: 'no-effective-date', detail: 'The cycle has no readable effective date, so the day the money takes effect cannot be read and no structure is invented for it.' }] });
  }

  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const roster = new Map(people.map((p) => [p.id, p]));
  const rows = [];
  for (const person of people) {
    const resolved = resolveHomeLine({ person, day, today, ledger });
    const managerId = resolved.managerId;
    const managerName = managerId
      ? (managerId === LEADER_ID
        ? nameOf(cfg?.leaderName, 'You (workspace leader)')
        : nameOf(roster.get(managerId)?.name, managerId))
      : null;
    const meta = resolved.state === 'not-on-roster' ? null : meritStructureState(resolved.state);
    rows.push({
      personId: person.id,
      personName: nameOf(person.name, person.id),
      level: person.level || null,
      state: resolved.state,
      stateLabel: meta?.label || 'Not on the roster on that day',
      tone: meta?.tone || 'neutral',
      blocks: resolved.state === 'unrecorded',
      managerId,
      managerName,
      currentManagerId: person.managerId || LEADER_ID,
      // The supersession flag is the point of the whole module: the record says
      // one manager held the line and today's roster says another.
      superseded: Boolean(managerId && managerId !== (person.managerId || LEADER_ID)),
      recordId: resolved.recordId,
      fromISO: resolved.fromISO,
      toISO: resolved.toISO,
      reason: resolved.reason,
    });
  }
  rows.sort((a, b) => String(a.personName).localeCompare(String(b.personName)) || String(a.personId).localeCompare(String(b.personId)));

  const onRosterRows = rows.filter((r) => r.state !== 'not-on-roster');
  const byState = new Map(MERIT_STRUCTURE_STATES.map((s) => [s.key, 0]));
  for (const row of onRosterRows) byState.set(row.state, (byState.get(row.state) || 0) + 1);

  /* ---- the as-of state the matrix engine runs over ---------------------- */
  //
  // Each person's home pointer is replaced by the pointer the RECORD says they
  // had on the day. A person whose home line is unrecorded is given NO home
  // pointer substitution — they keep today's pointer so the engine can still
  // place them in the graph — but the reading marks them unreadable and no
  // authority figure is claimed for them.
  const substitutions = new Map();
  for (const row of rows) {
    if (row.state === 'observed' || row.state === 'projected' || row.state === 'presumed-current') {
      substitutions.set(row.personId, row.managerId);
    }
  }
  const asOfState = substitutions.size
    ? {
      ...state,
      people: people.map((p) => (substitutions.has(p.id) ? { ...p, managerId: substitutions.get(p.id) } : p)),
    }
    : state;
  // The engine runs at the AS-OF day so a declared line's window is evaluated on
  // that day: a project line that ended in October is not wired in a November
  // structure read that happens to be taken in March.
  const asOfNow = new Date(`${day}T12:00:00.000Z`);
  const asOfMatrix = buildMatrix(asOfState, { now: asOfNow, settings: cfg });
  const matrixToday = buildMatrix(state, { now: at, settings: cfg });

  // The engine's own refusals, counted and printed. An as-of substitution can
  // close a loop that does not exist today (a re-organisation that was later
  // undone), and a refused line is NAMED rather than dropped.
  const defects = [...asOfMatrix.defects];
  const refusedN = defects.length;

  const superseded = rows.filter((r) => r.superseded);
  const rowCap = MERIT_STRUCTURE_LIMITS.rows;
  const shown = rows.slice(0, rowCap);

  const refusals = [];
  if (byState.get('unrecorded')) {
    refusals.push({
      kind: 'unrecorded-home-line',
      detail: `${byState.get('unrecorded')} person(s) have home-line history that does not cover ${day}. Their manager that day was never recorded, so their pay authority and cohort are WITHHELD rather than projected backwards from today’s roster.`,
    });
  }
  if (byState.get('presumed-current')) {
    refusals.push({
      kind: 'presumed-home-line',
      detail: `${byState.get('presumed-current')} person(s) have no recorded home-line history at all, so today’s pointer is used as a PRINTED PRESUMPTION for ${day}. Record a home-line move to turn a presumption into an observation.`,
    });
  }
  if (byState.get('projected')) {
    refusals.push({
      kind: 'projected-home-line',
      detail: `${byState.get('projected')} person(s) have a recorded period that reaches ${day} but ${day} has not happened yet. The current line is presumed to continue, and no future day is reported as observed.`,
    });
  }
  if (refusedN) {
    const counts = new Map();
    for (const d of defects) counts.set(d.defect, (counts.get(d.defect) || 0) + 1);
    refusals.push({
      kind: 'engine-refusal',
      detail: `The matrix engine refused ${refusedN} declaration(s) against the as-of structure (${[...counts.entries()].map(([k, n]) => `${n} ${k}`).join(', ')}). Each is printed with its own reason; none is dropped silently.`,
    });
  }
  if (rows.length > shown.length) {
    refusals.push({
      kind: 'row-cap',
      detail: `${rows.length - shown.length} further person row(s) are past the bounded table of ${rowCap}. They are counted in every total above and merely not rendered here.`,
    });
  }

  const readings = {
    observedN: byState.get('observed') || 0,
    projectedN: byState.get('projected') || 0,
    presumedN: byState.get('presumed-current') || 0,
    unrecordedN: byState.get('unrecorded') || 0,
    notOnRosterN: rows.length - onRosterRows.length,
  };
  const reconcileN = readings.observedN + readings.projectedN + readings.presumedN + readings.unrecordedN + readings.notOnRosterN;
  const reconciles = reconcileN === rows.length;
  // Did the as-of substitute change the graph at all? A workspace with no
  // recorded history substitutes nothing and this is false, which is exactly
  // what makes this module inert on every pre-ADR-0149 workspace.
  const supersedesToday = superseded.length > 0;
  const readable = readings.unrecordedN === 0;

  return {
    engineVersion: MERIT_STRUCTURE_ENGINE_VERSION,
    today,
    asOf: day,
    daysToEffective: daysBetween(today, day),
    isFuture: day > today,
    ledgerCoverageStart: ledger.firstRecordedDay,
    hasLedger: Boolean(ledger.firstRecordedDay),
    rows: shown,
    rowN: rows.length,
    remainderN: rows.length - shown.length,
    stateCounts: onRosterRows.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {}),
    ...readings,
    reconciles,
    reconcilesDetail: reconciles
      ? `${readings.observedN} observed + ${readings.projectedN} projected + ${readings.presumedN} presumed + ${readings.unrecordedN} unrecorded + ${readings.notOnRosterN} not on roster = ${rows.length} roster row(s).`
      : `The states do not reconcile: ${reconcileN} classified against ${rows.length} roster row(s). This reading is NOT trustworthy.`,
    superseded,
    supersededN: superseded.length,
    supersedesToday,
    readable,
    supersessionCouldHideAuthority: supersedesToday,
    defects,
    refusedN,
    refusals,
    // The engine inputs, exposed so the merit parity reader runs the SAME
    // structure rather than re-deriving one.
    asOfState,
    asOfMatrix,
    matrixToday,
    roster,
    ledger,
    conventions: undefined,
    stateMeta: (key) => meritStructureState(key),
    perPerson: new Map(rows.map((r) => [r.personId, r])),
  };
}

function emptyStructure({ today, refusals }) {
  return {
    engineVersion: MERIT_STRUCTURE_ENGINE_VERSION,
    today,
    asOf: null,
    daysToEffective: null,
    isFuture: false,
    ledgerCoverageStart: null,
    hasLedger: false,
    rows: [],
    rowN: 0,
    remainderN: 0,
    stateCounts: {},
    observedN: 0,
    projectedN: 0,
    presumedN: 0,
    unrecordedN: 0,
    notOnRosterN: 0,
    reconciles: true,
    reconcilesDetail: 'There is no day to read, so there is no structure to reconcile.',
    superseded: [],
    supersededN: 0,
    supersedesToday: false,
    readable: false,
    supersessionCouldHideAuthority: false,
    defects: [],
    refusedN: 0,
    refusals,
    asOfState: null,
    asOfMatrix: null,
    matrixToday: null,
    roster: new Map(),
    ledger: null,
    perPerson: new Map(),
  };
}

/* ------------------------------------------------------------------ freezing */

/**
 * The compact structure block that is frozen beside the money.
 *
 * It is deliberately small and deliberately person-level ONLY where the audit is
 * already person-level (the cycle stores `predictions` keyed by `personId`, so a
 * home-line key adds no new disclosure to a record that is never exported with
 * identity). The aggregate figures are frozen too, so a reader can check the
 * frozen cohort split and holder counts without re-deriving anything.
 */
export function buildFrozenStructure(structure, parity) {
  if (!structure || !structure.asOf) return null;
  const rows = [...structure.perPerson.values()].map((row) => ({
    personId: row.personId,
    state: row.state,
    managerId: row.state === 'unrecorded' || row.state === 'not-on-roster' ? null : row.managerId,
  }));
  return {
    version: 1,
    engineVersion: structure.engineVersion,
    asOf: structure.asOf,
    capturedOn: structure.today,
    ledgerCoverageStart: structure.ledgerCoverageStart,
    observedN: structure.observedN,
    projectedN: structure.projectedN,
    presumedN: structure.presumedN,
    unrecordedN: structure.unrecordedN,
    notOnRosterN: structure.notOnRosterN,
    rowN: structure.rowN,
    supersededN: structure.supersededN,
    // The pool as it was read on that day, so the frozen record answers "who
    // held the pay right when the money landed" without recomputation.
    pool: parity ? {
      rowsN: parity.totals?.rowsN ?? 0,
      matrixRowsN: parity.totals?.matrixRowsN ?? 0,
      singleRowsN: parity.totals?.singleRowsN ?? 0,
      clearN: parity.totals?.clearN ?? 0,
      contestedN: parity.totals?.contestedN ?? 0,
      unownedN: parity.totals?.unownedN ?? 0,
      unreadableN: parity.totals?.unreadableN ?? 0,
      matrixMedianBps: parity.cohorts?.matrix?.medianPrinted ? parity.cohorts.matrix.medianBps : null,
      singleMedianBps: parity.cohorts?.['single-line']?.medianPrinted ? parity.cohorts['single-line'].medianBps : null,
      gapBps: parity.gapBps ?? null,
      authorityVerdict: parity.authorityVerdict || null,
      parityVerdict: parity.verdict || null,
    } : null,
    rows,
  };
}

/**
 * Compare a live reading against the frozen block.
 *
 * REPORTING, NEVER CORRECTING. The frozen record is not rewritten to match
 * today, and today's reading is not overwritten by the frozen one. `drifted`
 * names exactly which people moved, which holders changed and which frozen
 * figure is no longer reproduced; `identical` is a claim about reproduction and
 * nothing else.
 */
export function compareFrozenStructure(frozen, structure) {
  const verdict = (key) => {
    const meta = meritStructureFreezeVerdict(key);
    return { key, label: meta?.label || key, tone: meta?.tone || 'neutral', detail: meta?.detail || '' };
  };
  if (!frozen) {
    return {
      ...verdict('not-frozen'),
      frozenAt: null,
      compared: false,
      differences: [],
      differenceN: 0,
      detail: MERIT_STRUCTURE_FREEZE_VERDICTS[0].detail,
    };
  }
  if (!structure || !structure.asOf || !Array.isArray(frozen.rows)) {
    return { ...verdict('unreadable'), frozenAt: frozen.capturedOn || null, compared: false, differences: [], differenceN: 0 };
  }

  const differences = [];
  const live = structure.perPerson;
  const frozenById = new Map(frozen.rows.map((row) => [row.personId, row]));
  for (const [personId, row] of frozenById) {
    const now = live.get(personId);
    if (!now) {
      differences.push({ kind: 'person-not-in-reading', personId, detail: 'A person frozen beside this cycle is no longer in the as-of reading, so their frozen home line cannot be reproduced.' });
      continue;
    }
    const nowManager = now.state === 'unrecorded' || now.state === 'not-on-roster' ? null : now.managerId;
    if ((row.managerId || null) !== (nowManager || null)) {
      differences.push({
        kind: 'home-line-changed',
        personId,
        frozenManagerId: row.managerId || null,
        liveManagerId: nowManager || null,
        detail: `Frozen beside the decision as ${row.managerId || 'unreadable'}; the record now reads ${nowManager || 'unreadable'} for ${frozen.asOf}.`,
      });
      continue;
    }
    if ((row.state || null) !== (now.state || null)) {
      differences.push({
        kind: 'state-changed',
        personId,
        frozenState: row.state || null,
        liveState: now.state || null,
        detail: `Frozen as ${row.state}; the record now reads ${now.state} for ${frozen.asOf}.`,
      });
    }
  }
  for (const [personId] of live) {
    if (!frozenById.has(personId)) {
      differences.push({ kind: 'person-added', personId, detail: 'This person is in the as-of reading but was not frozen beside the cycle.' });
    }
  }

  // The aggregate figures the frozen block carries are compared too: a home line
  // that did not change but a pay authority that did is a different failure and
  // must not be reported as agreement.
  // Only STRUCTURE figures are compared here. The frozen pool figures are a
  // record of the money and belong to the audit, not to this comparison — a
  // pay-row count compared against a roster count would have read as drift on
  // every single cycle, which is exactly the kind of reassuring-looking noise
  // this module exists to refuse.
  const figurePairs = [
    ['rowN', frozen.rowN, structure.rowN],
    ['observedN', frozen.observedN, structure.observedN],
    ['projectedN', frozen.projectedN, structure.projectedN],
    ['presumedN', frozen.presumedN, structure.presumedN],
    ['unrecordedN', frozen.unrecordedN, structure.unrecordedN],
    ['supersededN', frozen.supersededN, structure.supersededN],
  ];
  for (const [key, frozenValue, liveValue] of figurePairs) {
    if (frozenValue !== null && frozenValue !== undefined && frozenValue !== liveValue) {
      differences.push({
        kind: 'figure-not-reproduced',
        figure: key,
        frozenValue,
        liveValue,
        detail: `The frozen ${key} is ${frozenValue}; the reading taken now produces ${liveValue}.`,
      });
    }
  }

  const meta = differences.length ? verdict('drifted') : verdict('identical');
  return {
    ...meta,
    frozenAt: frozen.capturedOn || null,
    frozenAsOf: frozen.asOf || null,
    compared: true,
    differences: differences.slice(0, MERIT_STRUCTURE_LIMITS.findings),
    differenceN: differences.length,
    cappedDifferenceN: Math.max(0, differences.length - MERIT_STRUCTURE_LIMITS.findings),
  };
}

/* ---------------------------------------------------------------- brief text */

/** The identity-reduced sentence set a pack can carry. */
export function meritStructureBriefLines(structure, comparison) {
  if (!structure || !structure.asOf) {
    return ['Structure as of the effective date: not readable — the cycle carries no readable effective date, so no structure is claimed for it.'];
  }
  const lines = [
    `Structure as of ${structure.asOf}: ${structure.readingsLabel || `${structure.observedN} observed, ${structure.projectedN} projected, ${structure.presumedN} presumed, ${structure.unrecordedN} unrecorded, ${structure.notOnRosterN} not on the roster on that day`}.`,
    structure.supersededN
      ? `${structure.supersededN} person(s) have a home line on that day that today’s roster no longer shows: this reading is the record’s answer, not today’s chart.`
      : 'No home line on that day differs from today’s roster.',
    structure.readable
      ? 'Every person in scope has a readable home line for that day.'
      : `${structure.unrecordedN} person(s) have home-line history that does not cover that day; their pay authority and cohort are WITHHELD rather than projected backwards from today.`,
  ];
  if (comparison) {
    lines.push(`Frozen structure versus the record now: ${comparison.label.toLowerCase()}.${comparison.differenceN ? ` ${comparison.differenceN} difference(s) printed.` : ''} ${comparison.detail}`);
  }
  return lines;
}
