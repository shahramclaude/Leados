/**
 * app/core/domain/conflictRecusal.js — the read engine of the Decision-Maker
 * Conflict-of-Interest & Recusal Ledger (ADR-0210, Schema v164).
 *
 * Pure. Nothing here writes, stores a verdict or caches a derived figure: every
 * reading is re-derived from the declared rows plus the record they name, so a
 * corrected approver, an amended record or a superseding standing changes the
 * reading the verbatim way the record actually changed.
 *
 * THE JOIN, AND WHY IT IS NARROW. An interest names ONE record
 * (`subjectType` + `subjectId`). The person holding the stake is read against
 * that record in exactly three positions — the hand that SIGNS it, the person
 * who OWNS it, and a declared LINE held over the person the record is about.
 * Nothing else in a record's text ever joins. A free-text name resolves to a
 * roster person only by exact match; an ambiguous or unknown name resolves to
 * nobody and is counted, because attaching a named person's stake to the wrong
 * record is the one error this ledger cannot make.
 *
 * THE COVERAGE RULE, WHICH IS THE POINT. `clean` is not "we found nothing".
 * `clean` is "every relationship kind a live rule declares reportable WAS ASKED
 * of this person for this record, and nothing was declared". Where no rule is
 * live the reading is `unsearched` — the question was never put — and the
 * register says so instead of printing a reassuring word. Collapsing those two
 * is the exact failure the seven-verdict model exists to prevent.
 *
 * RECUSAL EFFECTIVENESS IS CHECKED AGAINST THE RECORD, NOT THE DECLARATION. A
 * recusal is a composition control: it protects only if the hand leaves. So a
 * recused person still resolving as the record's signer reads `ineffective`,
 * whatever the declaration says.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildNameIndex, resolveParticipant, splitParticipants } from './rightsConcordance.js';
import {
  CONFLICT_DIRECTION_BY_KEY,
  CONFLICT_POSITION_BY_KEY,
  CONFLICT_RELATIONSHIP_BY_KEY,
  CONFLICT_RECUSAL_ENGINE_VERSION,
  CONFLICT_RECUSAL_SETTING_KEYS,

  CONFLICT_SOURCE_BY_KEY,
  CONFLICT_STANDING_KINDS,
  CONFLICT_STANDING_KIND_BY_KEY,
  CONFLICT_SUBJECT_BY_KEY,
  CONFLICT_SUBJECT_KEYS,
  CONFLICT_VERDICT_BY_KEY,
  CONFLICT_VERDICT_KEYS,
} from './conflictRecusalRegistry.js';
import {
  conflictDay,
  normalizeConflictInterests,
  normalizeConflictNoneDeclarations,
  normalizeConflictRules,
  normalizeConflictStandings,
  readConflictRecusalSettings,
} from './conflictRecusalSchema.js';

const text = (value, max = 400) => String(value ?? '').trim().slice(0, max);

/** Days between two `YYYY-MM-DD` keys, b − a. Pure integer arithmetic on the keys. */
export function conflictDayDiff(a, b) {
  const da = Date.parse(`${a}T00:00:00.000Z`);
  const db = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((db - da) / 86400000);
}

export function conflictDayShift(day, delta) {
  const base = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(base)) return null;
  return new Date(base + delta * 86400000).toISOString().slice(0, 10);
}

/* --------------------------------------------------- the record's own fields */

/**
 * How each subject kind names its own signer, its own owner and its own day.
 * Kept as one table so the reader and the door cannot drift: a subject kind the
 * table does not carry cannot be declared at all.
 *
 *  - `signerNames`  free-text names of the hand that signs (the DACI approver).
 *  - `signerIds`    stored person ids of the hand that signs (a case's
 *                   ratification acts — decision control, ADR-0208).
 *  - `ownerIds`     stored person ids of the record's owner.
 *  - `subjectPersonIds` the people the record is ABOUT, so a declared line over
 *                   them can be read. `null` means the record names no subject
 *                   person and a `line` position is never inferred.
 */
export const CONFLICT_SUBJECT_READERS = Object.freeze({
  decision: Object.freeze({
    collection: 'decisions',
    dayField: 'date',
    signerNames: (row) => splitParticipants(row.approver),
    signerIds: () => [],
    ownerIds: () => [],
    subjectPersonIds: () => null,
  }),
  'investment-case': Object.freeze({
    collection: 'investmentCases',
    dayField: 'baseOn',
    signerNames: () => [],
    signerIds: (row, acts) => acts
      .filter((act) => act && act.caseId === row.id && (act.kind === 'approve' || act.kind === 'refuse'))
      .map((act) => act.actedById),
    ownerIds: (row) => (text(row.ownerId, 120) ? [text(row.ownerId, 120)] : []),
    subjectPersonIds: (row) => (text(row.ownerId, 120) ? [text(row.ownerId, 120)] : []),
  }),
  requisition: Object.freeze({
    collection: 'requisitions',
    dayField: 'openedOn',
    // A requisition has no stored hiring-manager field; its interviewers are the
    // people who hold the role's selection. The register reads them as the
    // record's own named hands and nothing else.
    signerNames: () => [],
    signerIds: (row) => (Array.isArray(row.interviewers) ? row.interviewers : []),
    ownerIds: () => [],
    subjectPersonIds: (row) => (row.filledPersonId ? [row.filledPersonId] : []),
  }),
  budget: Object.freeze({
    collection: 'budgets',
    dayField: 'startsOn',
    signerNames: () => [],
    signerIds: () => [],
    ownerIds: (row) => (text(row.ownerId, 120) ? [text(row.ownerId, 120)] : []),
    subjectPersonIds: () => null,
  }),
});

/** A record's own day — the day a later declaration is measured late against. */
export function conflictRecordDay(subjectType, record) {
  const reader = CONFLICT_SUBJECT_READERS[subjectType];
  if (!reader || !record) return null;
  return conflictDay(record[reader.dayField]) || conflictDay(record.date) || conflictDay(record.createdOn) || null;
}

/** A human label for the record, for the panel only. Never exported. */
function conflictRecordLabel(subjectType, record) {
  if (!record) return null;
  if (subjectType === 'decision') return text(record.title, 160) || null;
  if (subjectType === 'investment-case') return text(record.title, 160) || null;
  if (subjectType === 'requisition') return text(record.title, 160) || null;
  if (subjectType === 'budget') return text(record.name, 160) || null;
  return null;
}

/* ------------------------------------------------------------- the settings */

/**
 * The relationship kinds a live rule makes reportable for a person at an
 * altitude, as of a day. A retired rule covers nothing from its retirement day;
 * a rule not yet effective covers nothing.
 */
function reportableKindsFor(rules, { rank, asOf }) {
  const covered = new Set();
  const ruleIds = [];
  for (const rule of rules) {
    if (rule.retiredOn && rule.retiredOn <= asOf) continue;
    if (rule.effectiveFrom > asOf) continue;
    if (rank < rule.minRank) continue;
    for (const kind of rule.relationships) covered.add(kind);
    ruleIds.push(rule.id);
  }
  return { kinds: [...covered].sort(), rules: ruleIds.sort() };
}

/* ---------------------------------------------------------------- the join */

/**
 * ONE reading for one declared interest. This row is what the register prints
 * and what every count is a count of — never a count of persons, never a count
 * of records.
 */
function readInterest(interest, ctx) {
  const { records, acts, standings, personById, nameIndex, matrix, rules, asOf, lateDays } = ctx;
  const subject = CONFLICT_SUBJECT_BY_KEY[interest.subjectType];
  const record = records.get(`${interest.subjectType}:${interest.subjectId}`) || null;
  const holder = personById.get(interest.personId) || null;

  const row = {
    interestId: interest.id,
    personId: interest.personId,
    personName: text(holder?.name, 120) || null,
    holderAltitude: holder?.altitude || null,
    relationship: interest.relationship,
    relationshipLabel: CONFLICT_RELATIONSHIP_BY_KEY[interest.relationship]?.label || interest.relationship,
    relationshipSays: CONFLICT_RELATIONSHIP_BY_KEY[interest.relationship]?.says || '',
    direction: interest.direction,
    directionLabel: CONFLICT_DIRECTION_BY_KEY[interest.direction]?.label || interest.direction,
    subjectType: interest.subjectType,
    subjectLabel: subject?.label || interest.subjectType,
    subjectId: interest.subjectId,
    recordTitle: conflictRecordLabel(interest.subjectType, record),
    recordDay: record ? conflictRecordDay(interest.subjectType, record) : null,
    becameKnownOn: interest.becameKnownOn,
    declaredOn: interest.declaredOn,
    source: interest.source,
    sourceLabel: CONFLICT_SOURCE_BY_KEY[interest.source]?.label || interest.source,
    selfDeclared: interest.source === 'self',
    note: interest.note,
    withdrawnOn: interest.withdrawnOn,
    withdrawalReason: interest.withdrawalReason,
    recordMissing: !record,
    positions: [],
    standing: null,
    standingChain: [],
    verdict: 'withdrawn',
    verdictLabel: '',
    verdictTone: 'neutral',
    verdictReason: '',
    coverage: { reportableKinds: [], reportableKindsN: 0, coveredByRule: false, rulesN: 0 },
    late: false,
    lateDays: 0,
    owner: { state: 'ambiguous', seatId: null, basis: 'no-record' },
    dueOn: null,
  };

  /* The standing chain. The LIVE standing is the most recent one that nothing
   * else supersedes — and the chain is printed whole, earliest first, because a
   * superseded recusal is history a reader is entitled to see. */
  const chain = standings
    .filter((entry) => entry.interestId === interest.id)
    .sort((a, b) => (a.recordedOn < b.recordedOn ? -1 : a.recordedOn > b.recordedOn ? 1 : a.id < b.id ? -1 : 1));
  const supersededIds = new Set(chain.map((entry) => entry.supersedesId).filter(Boolean));
  const live = [...chain].reverse().find((entry) => !supersededIds.has(entry.id)) || null;
  const authorityName = (authorityId) => text(personById.get(authorityId)?.name, 120) || (authorityId === LEADER_ID ? 'Workspace leader' : null);
  row.standingChain = chain.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    kindLabel: CONFLICT_STANDING_KIND_BY_KEY[entry.kind]?.label || entry.kind,
    authorityId: entry.authorityId,
    authorityName: authorityName(entry.authorityId),
    recordedOn: entry.recordedOn,
    reason: entry.reason,
    control: entry.control,
    supersedesId: entry.supersedesId,
    superseded: supersededIds.has(entry.id),
  }));
  row.standing = live ? {
    id: live.id,
    kind: live.kind,
    kindLabel: CONFLICT_STANDING_KIND_BY_KEY[live.kind]?.label || live.kind,
    authorityId: live.authorityId,
    authorityName: authorityName(live.authorityId),
    recordedOn: live.recordedOn,
    reason: live.reason,
    control: live.control,
  } : null;

  const holderRank = holder ? altitudeRank(holder.altitude) || 1 : 0;
  const coverage = reportableKindsFor(rules, { rank: holderRank, asOf });
  row.coverage = {
    reportableKinds: coverage.kinds,
    reportableKindsN: coverage.kinds.length,
    coveredByRule: coverage.kinds.includes(interest.relationship),
    rulesN: coverage.rules.length,
  };

  const setVerdict = (key, reason) => {
    row.verdict = key;
    row.verdictLabel = CONFLICT_VERDICT_BY_KEY[key]?.label || key;
    row.verdictTone = CONFLICT_VERDICT_BY_KEY[key]?.tone || 'neutral';
    row.verdictReason = reason;
  };

  /* 1. A withdrawn interest is withdrawn. Its own dated act outranks everything. */
  if (interest.withdrawnOn) {
    setVerdict('withdrawn', `Withdrawn on ${interest.withdrawnOn} by a dated act${interest.withdrawalReason ? `: ${interest.withdrawalReason}` : '.'} The row stays on the record.`);
    row.owner = { state: 'off-roster', seatId: null, basis: 'withdrawn' };
    return row;
  }

  /* 2. A record the workspace no longer holds cannot carry a position. */
  if (!record) {
    setVerdict('unsearched', `The ${String(subject?.label || 'record').toLowerCase()} this interest names is not on the record any more, so no position can be read against it. The interest is kept and nothing is inferred.`);
    row.owner = { state: 'off-roster', seatId: null, basis: 'record-missing' };
    return row;
  }

  /* 3. The three positions, read from the record's OWN stored fields. */
  const reader = CONFLICT_SUBJECT_READERS[interest.subjectType];
  const positions = new Set();
  for (const rawName of reader.signerNames(record) || []) {
    const resolved = resolveParticipant(nameIndex, rawName);
    if (resolved.resolved && resolved.personId === interest.personId) positions.add('approver');
  }
  for (const signerId of reader.signerIds(record, acts) || []) {
    if (text(signerId, 120) === interest.personId) positions.add('approver');
  }
  for (const ownerId of reader.ownerIds(record) || []) {
    if (text(ownerId, 120) === interest.personId) positions.add('owner');
  }
  // A declared LINE held over the record's subject, read on the ONE matrix graph.
  // Only `reporting-line` interests qualify: the register never invents a line
  // position for a financial stake the structure does not create.
  const subjects = reader.subjectPersonIds(record);
  if (interest.relationship === 'reporting-line' && subjects && matrix) {
    for (const subjectId of subjects) {
      if (matrixLineHolds(matrix, interest.personId, subjectId)) positions.add('line');
    }
  }
  row.positions = [...positions].sort();

  /* 4. Lateness. A late disclosure is still a disclosure, printed with its days. */
  if (row.recordDay && interest.declaredOn) {
    const gap = conflictDayDiff(row.recordDay, interest.declaredOn);
    if (gap !== null && gap > lateDays) {
      row.late = true;
      row.lateDays = gap;
    }
  }

  /* 5. The verdict, in the ONE order the registry declares. */
  if (live) {
    if (live.kind === 'recuse') {
      const stillSigns = row.positions.includes('approver');
      if (stillSigns) {
        setVerdict('ineffective', `A recusal was recorded on ${live.recordedOn}, and this person is still the record’s approver. Standing back on paper while the signature stays with the same hand is printed as ineffective, not as handled.`);
      } else {
        setVerdict('determined', `Recused on ${live.recordedOn} by ${authorityName(live.authorityId) || 'a named authoriser'}, and the record no longer names this person as its approver. The withdrawal took the hand off.`);
      }
    } else if (live.kind === 'mitigate') {
      setVerdict('mitigated', `Mitigated on ${live.recordedOn} by ${authorityName(live.authorityId) || 'a named authoriser'}: ${live.control} That control is its authoriser’s claim and is not printed as independence.`);
    } else {
      setVerdict('determined', `Determined no conflict on ${live.recordedOn} by ${authorityName(live.authorityId) || 'a named authoriser'}: ${live.reason}`);
    }
  } else if (row.positions.length) {
    setVerdict('undisclosed', `This person holds the interest and sits on the record as ${row.positions.map((key) => CONFLICT_POSITION_BY_KEY[key]?.label || key).join(' and ')}. No recusal, mitigation or written determination is on the record.`);
  } else {
    /* Declared, and the holder does not sit on the record. The interest is real;
     * it does not reach THIS record's independence — and the register says which
     * of the three positions it checked rather than implying a search it did not
     * run. Whether the kind was reportable is printed on the same row. */
    setVerdict('determined', `Declared on ${interest.declaredOn}, and this person does not appear on the record as its approver, its owner or a declared line over its subject. The interest does not reach this record, and the register says which of those three it checked.`);
  }

  /* 6. WHO OWES THE HANDLING — never the hand that holds the interest. */
  row.owner = readOwner({ interest, holder, personById, matrix });
  if (row.owner.state === 'seat') {
    // A dated ask, bounded: the seat above owes an answer, not an eternity.
    row.dueOn = conflictDayShift(row.declaredOn, 30) || null;
  }
  return row;
}

/** Does `managerId` hold a declared reporting line over `personId`, on the one graph? */
function matrixLineHolds(matrix, managerId, personId) {
  const node = matrix?.nodes?.get(personId);
  if (!node) return false;
  return (node.managerIds || []).includes(managerId);
}

/**
 * WHO OWES THE HANDLING. Never the person who holds the interest: the hand
 * cannot clear itself. The seat above them on the matrix graph —
 *   - one line  → that line's holder;
 *   - several   → the lowest seat above ALL of them (`matrixJointApex`), never
 *                 one of them chosen on the other's behalf;
 *   - no apex   → `ambiguous`, named and left alone;
 *   - only the leader → `leader-held`, printed on the leader's own board.
 */
function readOwner({ interest, holder, personById, matrix }) {
  if (!holder) return { state: 'off-roster', seatId: null, basis: 'person-off-roster' };
  if (!matrix || !matrix.nodes.has(interest.personId)) return { state: 'ambiguous', seatId: null, basis: 'no-graph-node' };
  const node = matrix.nodes.get(interest.personId);
  const managers = [...new Set((node.managerIds || []).filter(Boolean))];
  if (!managers.length) {
    return { state: interest.personId === LEADER_ID ? 'self' : 'ambiguous', seatId: null, basis: 'no-manager' };
  }
  if (managers.length === 1) {
    const only = managers[0];
    if (only === LEADER_ID) return { state: 'leader-held', seatId: null, basis: 'single-line' };
    if (!matrix.roster.has(only)) return { state: 'off-roster', seatId: null, basis: 'manager-off-roster' };
    if (only === interest.personId) return { state: 'self', seatId: null, basis: 'single-line' };
    return { state: 'seat', seatId: only, basis: 'single-line' };
  }
  const apex = matrixJointApex(matrix, managers);
  if (!apex.apexId) return { state: 'ambiguous', seatId: null, basis: apex.ambiguous ? 'shared-no-apex' : 'disconnected' };
  if (apex.apexId === interest.personId) return { state: 'self', seatId: null, basis: 'joint-apex' };
  if (apex.isLeaderOnly) return { state: 'leader-held', seatId: null, basis: 'joint-apex' };
  if (!matrix.roster.has(apex.apexId)) return { state: 'off-roster', seatId: null, basis: 'joint-apex' };
  return { state: 'seat', seatId: apex.apexId, basis: 'joint-apex' };
}

/* ------------------------------------------------------- the coverage universe */

/**
 * THE POSITIONS NOBODY DECLARED ANYTHING ABOUT — which is most of them.
 *
 * The verdicts above are read from DECLARED interests, and that is exactly the
 * hole this function closes: if only declared interests were read, a workspace
 * with no declarations at all would print nothing, and nothing reads
 * reassuringly. So the register also asks, of every record inside the horizon,
 * the two questions the governance codes actually ask of a signer — *who signs
 * this, and who owns it* — and requires a dated answer from each.
 *
 * A position reads:
 *   - `clean`      a first-person no-interest declaration covers EVERY kind a
 *                  live rule makes reportable at that person's altitude;
 *   - `unsearched` no such declaration covers them. It names the kinds still
 *                  unasked and NEVER implies they might be clear;
 *   - `withdrawn`  the declaration was withdrawn by a dated act.
 * A position whose person holds a DECLARED interest is left to the declared
 * reading above — one position, one verdict, never two.
 */
function coveragePositions({ records, noneDeclarations, rules, matrix, personById, nameIndex, acts, asOf, holdersOf }) {
  const out = [];
  const seen = new Set();
  const liveRules = rules.filter((rule) => rule.effectiveFrom <= asOf && !(rule.retiredOn && rule.retiredOn <= asOf));
  for (const [key, record] of records) {
    const [subjectType, subjectId] = key.split(':');
    const reader = CONFLICT_SUBJECT_READERS[subjectType];
    if (!reader) continue;
    const day = conflictRecordDay(subjectType, record);
    // Outside the horizon: not read, and counted by the caller as out of scope.
    if (!day || day > asOf) continue;
    /* The positions: the hand that signs, and the owner. Read from the record's
     * OWN stored fields — the same two readers the declared join uses. */
    const positions = [];
    for (const rawName of reader.signerNames(record) || []) {
      const resolved = resolveParticipant(nameIndex, rawName);
      if (resolved.resolved) positions.push({ personId: resolved.personId, position: 'approver' });
    }
    for (const signerId of reader.signerIds(record, acts) || []) {
      const id = text(signerId, 120);
      if (id) positions.push({ personId: id, position: 'approver' });
    }
    for (const ownerId of reader.ownerIds(record) || []) {
      const id = text(ownerId, 120);
      if (id) positions.push({ personId: id, position: 'owner' });
    }
    for (const entry of positions) {
      const slot = `${key}|${entry.personId}|${entry.position}`;
      if (seen.has(slot)) continue;
      // A declared interest that ACTUALLY SITS ON THIS POSITION already reads it.
      // The test is positional, not "somebody declared something about this
      // record": an interest that does not reach the approver's seat must never
      // hide the fact that the approver was never asked. Getting this wrong is
      // how an unasked signer silently disappears from a governance register.
      if (holdersOf.has(slot)) continue;
      seen.add(slot);
      const holder = personById.get(entry.personId) || null;
      if (!holder) continue;
      const rank = altitudeRank(holder.altitude) || 1;
      const kinds = [...new Set(liveRules.filter((rule) => rank >= rule.minRank).flatMap((rule) => rule.relationships))].sort();
      const declarations = noneDeclarations
        .filter((row) => !row.withdrawnOn && row.personId === entry.personId && row.subjectType === subjectType && row.subjectId === subjectId)
        .sort((a, b) => (a.declaredOn < b.declaredOn ? 1 : -1));
      const newest = declarations[0] || null;
      const covered = newest ? kinds.filter((kind) => newest.relationships.includes(kind)) : [];
      const unasked = kinds.filter((kind) => !covered.includes(kind));
      const withdrawnOn = noneDeclarations
        .filter((row) => row.withdrawnOn && row.personId === entry.personId && row.subjectType === subjectType && row.subjectId === subjectId)
        .map((row) => row.withdrawnOn)
        .sort()
        .pop() || null;
      let verdict = 'unsearched';
      let verdictReason = '';
      if (!kinds.length) {
        verdictReason = 'No live rule makes any relationship kind reportable at this person’s altitude, so nobody was asked and nothing is concluded. Declare a rule to make an answer possible.';
      } else if (newest && !unasked.length) {
        verdict = 'clean';
        verdictReason = `Declared clear on ${newest.declaredOn}: a first-person statement that covers all ${kinds.length} relationship kind(s) the live rules make reportable at this altitude. It is not a finding that nothing exists — it is a dated statement that this person holds nothing reportable, on the record where they may be checked.`;
      } else if (newest) {
        verdictReason = `A no-interest declaration of ${newest.declaredOn} covers ${covered.length} of the ${kinds.length} reportable kind(s); ${unasked.length} were never asked (${unasked.join(', ')}). No conclusion is drawn about those.`;
      } else if (withdrawnOn) {
        verdict = 'withdrawn';
        verdictReason = `A no-interest declaration was withdrawn on ${withdrawnOn}. The position is unasked again until somebody declares afresh.`;
      } else {
        verdictReason = `No dated no-interest declaration covers this position, and ${kinds.length} kind(s) are reportable at this altitude (${kinds.join(', ')}). Nobody was asked — that is not the same fact as nothing there.`;
      }
      out.push({
        interestId: null,
        coverageKey: slot,
        personId: entry.personId,
        personName: text(holder.name, 120) || null,
        holderAltitude: holder.altitude || null,
        relationship: null,
        relationshipLabel: '—',
        relationshipSays: '',
        direction: null,
        directionLabel: '—',
        subjectType,
        subjectLabel: CONFLICT_SUBJECT_BY_KEY[subjectType]?.label || subjectType,
        subjectId,
        recordTitle: conflictRecordLabel(subjectType, record),
        recordDay: day,
        becameKnownOn: null,
        declaredOn: newest?.declaredOn || null,
        source: newest ? 'self' : null,
        sourceLabel: newest ? 'Declared by the person themselves' : '—',
        selfDeclared: Boolean(newest),
        note: newest?.note || '',
        withdrawnOn,
        withdrawalReason: '',
        recordMissing: false,
        positions: [entry.position],
        standing: null,
        standingChain: [],
        verdict,
        verdictLabel: CONFLICT_VERDICT_BY_KEY[verdict]?.label || verdict,
        verdictTone: CONFLICT_VERDICT_BY_KEY[verdict]?.tone || 'neutral',
        verdictReason,
        coverage: { reportableKinds: kinds, reportableKindsN: kinds.length, coveredByRule: Boolean(newest), unaskedKinds: unasked, rulesN: liveRules.length },
        late: false,
        lateDays: 0,
        owner: readOwner({ interest: { personId: entry.personId }, holder, personById, matrix }),
        dueOn: null,
        isCoverage: true,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the report */

const BLANK = (value) => (value === null || value === undefined ? '' : value);

/**
 * The whole reading. `seat` is the declared seat, or null for the
 * identity-free export. Two claims are kept apart throughout: what the verdicts
 * SAY (`balances`) and whether the printed figures are the computed figures
 * (`auditClean`) — never one reassuring word for both.
 */
export function buildConflictRecusal(state, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const effective = settings || state?.settings || {};
  // The conventions object is keyed by the STORED setting names (Schema v164),
  // the same names the dialog writes and the loader clamps — one vocabulary.
  const rawConv = readConflictRecusalSettings({ settings: effective });
  const conventions = {
    backDays: rawConv[CONFLICT_RECUSAL_SETTING_KEYS.backDays],
    lateDays: rawConv[CONFLICT_RECUSAL_SETTING_KEYS.lateDays],
    autoPropagate: rawConv[CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate],
  };

  const interests = normalizeConflictInterests(state?.conflictInterests, []);
  const standings = normalizeConflictStandings(state?.conflictStandings, interests, []);
  const rules = normalizeConflictRules(state?.conflictRules, []);

  /* The record universe and the acts a signing act may live in — read once. */
  const records = new Map();
  for (const kind of CONFLICT_SUBJECT_KEYS) {
    const reader = CONFLICT_SUBJECT_READERS[kind];
    const rows = Array.isArray(state?.[reader.collection]) ? state[reader.collection] : [];
    for (const raw of rows) {
      if (!raw || typeof raw.id !== 'string') continue;
      records.set(`${kind}:${raw.id}`, raw);
    }
  }
  const acts = Array.isArray(state?.investmentCaseActs) ? state.investmentCaseActs : [];

  const personById = new Map((Array.isArray(state?.people) ? state.people : [])
    .filter((person) => person && person.status !== 'archived' && typeof person.id === 'string')
    .map((person) => [person.id, person]));
  personById.set(LEADER_ID, { id: LEADER_ID, name: text(state?.settings?.leaderName, 120) || 'Workspace leader', altitude: 'chief' });
  const nameIndex = buildNameIndex(state);

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...effective, activeSeatId: null } });
  } catch {
    matrix = null;
  }

  const rulesSorted = [...rules].sort((a, b) => (a.id < b.id ? -1 : 1));
  const horizonFrom = conflictDayShift(today, -conventions.backDays) || today;

  const noneDeclarations = normalizeConflictNoneDeclarations(state?.conflictNoneDeclarations, []);

  const rows = [];
  let outOfHorizon = 0;
  for (const interest of interests) {
    // Declared history inside the horizon. A row outside it is COUNTED, never hidden.
    if (interest.declaredOn < horizonFrom) { outOfHorizon += 1; continue; }
    rows.push(readInterest(interest, {
      records, acts, standings, personById, nameIndex, matrix,
      rules: rulesSorted, asOf: today, lateDays: conventions.lateDays,
    }));
  }

  /* The coverage universe: every position on every record inside the horizon
   * that no declared interest already reads. This is what makes an EMPTY
   * register print its emptiness instead of printing nothing. */
  const holdersOf = new Set();
  for (const row of rows) {
    for (const position of row.positions) holdersOf.add(`${row.subjectType}:${row.subjectId}|${row.personId}|${position}`);
  }
  const coverageRows = coveragePositions({
    records, noneDeclarations, rules: rulesSorted, matrix, personById, nameIndex, acts,
    asOf: today, holdersOf,
  });

  const counts = Object.fromEntries(CONFLICT_VERDICT_KEYS.map((key) => [key, 0]));
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] || 0) + 1;
  const counted = CONFLICT_VERDICT_KEYS.reduce((sum, key) => sum + (counts[key] || 0), 0);

  const positions = { approver: 0, owner: 0, line: 0 };
  for (const row of rows) for (const key of row.positions) positions[key] = (positions[key] || 0) + 1;

  const directionCounts = Object.fromEntries(Object.keys(CONFLICT_DIRECTION_BY_KEY).map((key) => [key, 0]));
  for (const row of rows) directionCounts[row.direction] = (directionCounts[row.direction] || 0) + 1;
  const relationshipCounts = {};
  for (const row of rows) relationshipCounts[row.relationship] = (relationshipCounts[row.relationship] || 0) + 1;
  const standingCounts = Object.fromEntries(CONFLICT_STANDING_KINDS.map((entry) => [entry.key, 0]));
  for (const row of rows) if (row.standing) standingCounts[row.standing.kind] = (standingCounts[row.standing.kind] || 0) + 1;

  const reportableKinds = [...new Set(rulesSorted.filter((rule) => !(rule.retiredOn && rule.retiredOn <= today) && rule.effectiveFrom <= today).flatMap((rule) => rule.relationships))].sort();

  const report = {
    generatedOn: today,
    asOf: today,
    horizonFrom,
    backDays: conventions.backDays,
    lateDays: conventions.lateDays,
    engineVersion: CONFLICT_RECUSAL_ENGINE_VERSION,
    rows,
    coverageRows,
    allRows: [...rows, ...coverageRows],
    rowsN: rows.length,
    coverageRowsN: coverageRows.length,
    interestsN: interests.length,
    declarationsN: noneDeclarations.length,
    outOfHorizon,
    standingsN: standings.length,
    rulesN: rulesSorted.length,
    rules: rulesSorted,
    reportableKinds,
    relationshipCounts,
    standingCounts,
    directionCounts,
    counts,
    recordsN: new Set(rows.filter((row) => !row.recordMissing).map((row) => `${row.subjectType}:${row.subjectId}`)).size,
    positions,
    lateN: rows.filter((row) => row.late).length,
    crossLineN: matrix
      ? rows.filter((row) => (matrix.nodes.get(row.personId)?.managerIds || []).length > 1).length
      : 0,
    peopleN: new Set(rows.map((row) => row.personId)).size,
    seat: seat ? { rank: seat.rank, label: seat.label } : null,
    withheldN: 0,
  };

  /* Verdict tallies over EVERY row the register prints — declared interests and
   * coverage positions together — because a count that silently excluded the
   * coverage universe would report an empty register as a clean one. */
  const allCounts = Object.fromEntries(CONFLICT_VERDICT_KEYS.map((key) => [key, 0]));
  for (const row of report.allRows) allCounts[row.verdict] = (allCounts[row.verdict] || 0) + 1;
  report.allCounts = allCounts;
  report.declaredCounts = counts;

  /* The Bulletproof Reliability contract: two claims, stated separately. */
  report.balances = counted === rows.length
    && CONFLICT_VERDICT_KEYS.reduce((sum, key) => sum + (allCounts[key] || 0), 0) === report.allRows.length;
  report.auditClean = report.balances && positions.approver + positions.owner + positions.line >= counts.undisclosed;
  if (!report.balances) {
    report.claimReason = 'The verdict counts do not add up to the interests read. No total on this page may be relied on.';
  } else if (!report.auditClean) {
    report.claimReason = 'The verdicts add up, but an interest reads as undisclosed on a position the register cannot name. Printed and not certified.';
  } else {
    report.claimReason = null;
  }

  /* Seat projection: a person outside the seat's tree and declared lines is
   * COUNTED and its detail WITHHELD — never silently dropped. */
  if (seat && !seat.fullAccess) {
    const scope = seat.scope instanceof Set ? seat.scope : new Set();
    const lineScope = seat.lineScope instanceof Set ? seat.lineScope : new Set();
    report.rows = rows.map((row) => {
      if (scope.has(row.personId) || lineScope.has(row.personId)) return row;
      return {
        ...row,
        personName: null,
        recordTitle: null,
        note: '',
        standing: row.standing ? { ...row.standing, reason: '', control: '', authorityName: null } : null,
        standingChain: row.standingChain.map((entry) => ({ ...entry, reason: '', control: '', authorityName: null })),
        withheld: true,
        withheldReason: 'This person sits outside this seat’s reporting tree and declared lines. The interest is counted; its detail is withheld.',
      };
    });
    report.withheldN = report.rows.filter((row) => row.withheld).length;
  }

  return report;
}

/**
 * THE BADGE COUNT — deliberately cheap, and deliberately NOT the full reading.
 *
 * This runs on every route, so it never builds the reporting graph and never
 * reads a record: it counts declared interests that are in force and carry no
 * standing response at all, plus the person's own declarations if a person id is
 * given. That is a count of DECLARED work owed, which is exactly what a badge
 * should be. It cannot tell `undisclosed` from `determined` — and it says so by
 * being a count only, never a verdict: opening the register is what reads the
 * record.
 */
export function conflictRecusalAttentionCount(state, { now = new Date(), personId = null } = {}) {
  const interests = normalizeConflictInterests(state?.conflictInterests, []);
  const standings = normalizeConflictStandings(state?.conflictStandings, interests, []);
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const conventions = readConflictRecusalSettings(state);
  const horizonFrom = conflictDayShift(today, -conventions[CONFLICT_RECUSAL_SETTING_KEYS.backDays]) || today;
  const answered = new Set(standings.map((row) => row.interestId));
  let owed = 0;
  let mine = 0;
  for (const interest of interests) {
    if (interest.withdrawnOn) continue;
    if (interest.declaredOn < horizonFrom) continue;
    if (personId && interest.personId === personId) mine += 1;
    if (!answered.has(interest.id)) owed += 1;
  }
  return owed + mine;
}

/* ---------------------------------------------------------------- the brief */

/** An identity-free brief: counts, verdicts and method. No name, id or text. */
export function conflictRecusalBriefText(report) {
  const lines = [];
  lines.push(`Decision-maker conflict-of-interest & recusal register — ${report.asOf} (${report.engineVersion})`);
  lines.push('');
  lines.push(`Declared interests read: ${report.rowsN} (${report.outOfHorizon} outside the ${report.backDays}-day horizon)`);
  lines.push(`Positions read for coverage — the hands that sign or own a record inside the horizon: ${report.coverageRowsN}`);
  lines.push(`Records touched: ${report.recordsN} · people holding a declared interest: ${report.peopleN}`);
  lines.push(`Reportable relationship kinds under live rules: ${report.reportableKinds.length ? report.reportableKinds.join(', ') : 'NONE DECLARED — every reading is unsearched'}`);
  lines.push('');
  lines.push(`Verdicts over every position printed (${report.allRows.length} total), worst first:`);
  for (const key of CONFLICT_VERDICT_KEYS) {
    lines.push(`  ${String(report.allCounts[key] || 0).padStart(4)}  ${CONFLICT_VERDICT_BY_KEY[key].label}`);
  }
  lines.push(`  of which from a DECLARED interest: ${report.rowsN} · from a coverage position nobody declared anything about: ${report.coverageRowsN}`);
  lines.push('');
  lines.push(`Late declarations: ${report.lateN} · within the declared latency: ${report.rowsN - report.lateN}`);
  lines.push(`Positions: hand that signs ${report.positions.approver} · owner ${report.positions.owner} · declared line ${report.positions.line}`);
  lines.push(`People holding more than one reporting line: ${report.crossLineN}`);
  lines.push('');
  lines.push(`Standing records on file: ${report.standingsN} (recuse ${report.standingCounts.recuse} · mitigate ${report.standingCounts.mitigate} · determined ${report.standingCounts['no-conflict']} · superseded ${report.standingCounts.supersede})`);
  lines.push('');
  lines.push(`Verdicts reconcile with the interests read: ${report.balances ? 'YES' : 'NO'} · audit identities reconcile: ${report.auditClean ? 'YES' : 'NO'}`);
  if (report.claimReason) lines.push(report.claimReason);
  lines.push('');
  lines.push('No person, manager, record id, title, reason or control text is in this brief. A mitigation is its authoriser’s claim, never proof of independence. "Unsearched" is not "clean": where nobody was asked, no conclusion is drawn.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------- CSV */

/**
 * CSV scope #152. One workspace row, one row per live rule and one row per
 * person under an opaque positional code. Identity-free: no person, manager,
 * record id, title, reason or control text. A figure that cannot be claimed is
 * BLANK with its reason — never a zero.
 */
export function conflictRecusalCsvRows(report) {
  const shared = {
    generated_on: report.generatedOn,
    as_of: report.asOf,
    balances: report.balances ? 'YES' : 'NO',
    audit_clean: report.auditClean ? 'YES' : 'NO',
    claim_reason: BLANK(report.claimReason),
    engine_version: report.engineVersion,
  };
  const rows = [{
    ...shared,
    row_type: 'workspace',
    key: 'workspace',
    people_n: report.peopleN,
    interests_n: report.rowsN,
    standings_n: report.standingsN,
    rules_n: report.rulesN,
    records_n: report.recordsN,
    undisclosed_n: report.allCounts.undisclosed,
    ineffective_n: report.allCounts.ineffective,
    mitigated_n: report.allCounts.mitigated,
    determined_n: report.allCounts.determined,
    unsearched_n: report.allCounts.unsearched,
    clean_n: report.allCounts.clean,
    withdrawn_n: report.allCounts.withdrawn,
    positions_n: report.allRows.length,
    declarations_n: report.declarationsN,
    verdicts_reconcile: report.balances ? 'YES' : 'NO',
    reportable_kinds_n: report.reportableKinds.length,
    late_n: report.lateN,
    on_time_n: report.rowsN - report.lateN,
    structural_n: report.directionCounts.structural,
    sought_n: report.directionCounts.sought,
    held_n: report.directionCounts.held,
    records_with_interest_n: report.recordsN,
    approver_position_n: report.positions.approver,
    owner_position_n: report.positions.owner,
    line_position_n: report.positions.line,
    cross_line_n: report.crossLineN,
    back_days: report.backDays,
    late_days: report.lateDays,
    interest_kinds: Object.keys(report.relationshipCounts).sort().join('+'),
    standing_kinds: CONFLICT_STANDING_KINDS.filter((entry) => report.standingCounts[entry.key]).map((entry) => entry.key).join('+'),
    rule_covered: report.reportableKinds.length ? 'YES' : 'NO',
  }];

  /* One row per live rule: which kinds it makes reportable and from which rank. */
  report.rules.forEach((rule, index) => {
    rows.push({
      ...shared,
      row_type: 'rule',
      key: `rule-${index + 1}`,
      reportable_kinds_n: rule.relationships.length,
      interest_kinds: rule.relationships.join('+'),
    });
  });

  /* One row per person under an opaque positional code — no name, ever. */
  const byPerson = new Map();
  for (const row of report.allRows) {
    if (!byPerson.has(row.personId)) byPerson.set(row.personId, []);
    byPerson.get(row.personId).push(row);
  }
  const ordered = [...byPerson.keys()].sort();
  ordered.forEach((personId, index) => {
    const rowsFor = byPerson.get(personId);
    const tally = Object.fromEntries(CONFLICT_VERDICT_KEYS.map((key) => [key, 0]));
    for (const row of rowsFor) tally[row.verdict] += 1;
    const coverage = rowsFor[0]?.coverage || { reportableKindsN: 0 };
    rows.push({
      ...shared,
      row_type: 'person',
      key: `person-${String(index + 1).padStart(3, '0')}`,
      interests_n: rowsFor.length,
      undisclosed_n: tally.undisclosed,
      ineffective_n: tally.ineffective,
      mitigated_n: tally.mitigated,
      determined_n: tally.determined,
      unsearched_n: tally.unsearched,
      clean_n: tally.clean,
      withdrawn_n: tally.withdrawn,
      reportable_kinds_n: coverage.reportableKindsN,
      late_n: rowsFor.filter((row) => row.late).length,
      on_time_n: rowsFor.filter((row) => !row.late).length,
      structural_n: rowsFor.filter((row) => row.direction === 'structural').length,
      sought_n: rowsFor.filter((row) => row.direction === 'sought').length,
      held_n: rowsFor.filter((row) => row.direction === 'held').length,
      cross_line_n: rowsFor.some((row) => row.owner.basis === 'joint-apex') ? 1 : 0,
    });
  });

  return rows;
}
