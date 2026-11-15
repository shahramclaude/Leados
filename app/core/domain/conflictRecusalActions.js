/**
 * app/core/domain/conflictRecusalActions.js — the seat-checked commands of the
 * Decision-Maker Conflict-of-Interest & Recusal Ledger (ADR-0210, Schema v164).
 *
 * FOUR human acts, and nothing else: DECLARE an interest, WITHDRAW one, RECORD
 * a standing response to it (recuse / mitigate / determine), and DECLARE a rule
 * saying which relationship kinds are reportable. Plus the conventions and the
 * scan. No act blocks a decision, edits an approver, revokes a right or moves
 * one person into another's place.
 *
 * THE DOOR IS THE PRODUCT.
 *  - An interest is declared WHOLE or not at all: the person who holds the
 *    stake, the relationship, the record it touches, the day it became known,
 *    and where the knowledge came from. A record id nobody can open is refused
 *    at the door rather than being printed as an unreadable row later.
 *  - A PERSON DECLARES THEIR OWN INTEREST, or a seat above them records a
 *    disclosure they received. The route is stored, printed and never upgraded:
 *    a manager's note about a subordinate is not that subordinate's own filing.
 *  - NOBODY DECIDES THEIR OWN INTEREST. A recusal, a mitigation or a
 *    determination is refused to the person who holds the interest, refused to
 *    anybody the interest's person cannot be reached from, and refused to the
 *    very hand it is meant to clear.
 *  - A recusal is checked the moment it is recorded: if the record still names
 *    that person as its approver, the act is ADMITTED (the truth is on the
 *    record) and the register prints `ineffective`. Refusing it would push the
 *    disclosure back into silence, which is the failure this ledger exists to
 *    end.
 *  - A mitigation must name the control that stands in, in writing, because a
 *    mitigation is nothing but the specificity of its control and the standing
 *    of its authoriser.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildConflictRecusal,
  conflictRecusalAttentionCount,
  conflictRecusalBriefText,
  conflictRecusalCsvRows,
} from './conflictRecusal.js';
import {
  CONFLICT_DIRECTION_KEYS,
  CONFLICT_RECUSAL_EVENTS,
  CONFLICT_RECUSAL_HREF,
  CONFLICT_RECUSAL_LIMITS,
  CONFLICT_RECUSAL_RIGHTS,
  CONFLICT_RECUSAL_SETTING_KEYS,
  CONFLICT_RECUSAL_SETTING_LABELS,
  CONFLICT_RECUSAL_BOUNDS,
  CONFLICT_RELATIONSHIP_KEYS,
  CONFLICT_RELATIONSHIP_BY_KEY,
  CONFLICT_SOURCE_KEYS,
  CONFLICT_STANDING_KIND_KEYS,
  CONFLICT_STANDING_KIND_BY_KEY,
  CONFLICT_SUBJECT_BY_KEY,
  CONFLICT_SUBJECT_KEYS,
} from './conflictRecusalRegistry.js';
import {
  conflictDay,
  conflictReason,
  conflictTitle,
  normalizeConflictInterests,
  normalizeConflictNoneDeclarations,
  normalizeConflictRecusalSettings,
  normalizeConflictRules,
  normalizeConflictStandings,
} from './conflictRecusalSchema.js';

const L = CONFLICT_RECUSAL_LIMITS;

export function createConflictRecusalActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on a conflict of interest.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildConflictRecusal(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: the route that carries the obligation, or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }
  const activePerson = (personId) => (Array.isArray(store.state.people) ? store.state.people : [])
    .find((person) => person && person.id === personId && person.status !== 'archived') || null;

  /** The record an interest names, read from the collection that actually holds it. */
  const RECORD_COLLECTIONS = {
    decision: 'decisions',
    'investment-case': 'investmentCases',
    requisition: 'requisitions',
    budget: 'budgets',
  };
  function recordFor(subjectType, subjectId) {
    const key = RECORD_COLLECTIONS[subjectType];
    if (!key) return null;
    return rows(key).find((row) => row && row.id === subjectId) || null;
  }

  /**
   * Read a typed draft into the stored shape — the SAME reading the preview and
   * the declaration use, so what a dialog showed is what gets saved.
   */
  function readDraft(check, input = {}) {
    const personId = text(input.personId, 120);
    if (!personId) return fail('Name the person who holds the interest. An interest belongs to a person, not to an opinion about one.', 'personId');
    const person = activePerson(personId);
    if (!person) return fail('The person holding the interest is not on the active roster.', 'personId');
    const via = reachOf(check, personId);
    if (check.actorId !== personId && !via) {
      return fail('This person sits outside this seat’s reporting tree and declared lines. An interest is declared by the person themselves, or recorded by a seat that can reach them.', 'personId');
    }
    const subjectType = CONFLICT_SUBJECT_KEYS.includes(input.subjectType) ? input.subjectType : null;
    if (!subjectType) return fail('Say what the interest touches: a logged decision, an investment case, a hiring requisition or a budget envelope.', 'subjectType');
    const subjectId = text(input.subjectId, 120);
    if (!subjectId) return fail(`Name the ${CONFLICT_SUBJECT_BY_KEY[subjectType].label.toLowerCase()} the interest touches.`, 'subjectId');
    if (!recordFor(subjectType, subjectId)) {
      return fail('That record is not on the workspace, so an interest cannot be attached to it. An interest naming a record nobody can open is the one thing this register will not print.', 'subjectId');
    }
    const relationship = CONFLICT_RELATIONSHIP_KEYS.includes(input.relationship) ? input.relationship : null;
    if (!relationship) return fail('Choose the relationship that creates the interest. It is a closed list — a type nobody declared is not guessed at.', 'relationship');
    const direction = input.direction === undefined || input.direction === ''
      ? CONFLICT_RELATIONSHIP_BY_KEY[relationship].defaultDirection
      : (CONFLICT_DIRECTION_KEYS.includes(input.direction) ? input.direction : null);
    if (!direction) return fail('The direction of the stake is held, sought or structural — one of those three, or left to the relationship’s own default.', 'direction');
    const becameKnownOn = input.becameKnownOn ? conflictDay(input.becameKnownOn) : check.today;
    if (!becameKnownOn) return fail('The day the interest became known is not a real calendar day.', 'becameKnownOn');
    if (becameKnownOn > check.today) return fail('An interest cannot become known in the future.', 'becameKnownOn');
    const note = String(input.note ?? '').trim();
    if (note && !conflictReason(note)) return fail(`A note on the interest must be at least ${L.reasonMin} characters if you write one.`, 'note');
    const source = check.seat.fullAccess ? 'operator' : (check.actorId === personId ? 'self' : 'seat-recorded');
    if (!CONFLICT_SOURCE_KEYS.includes(source)) return fail('The route of this declaration could not be read.');
    const relatedToId = input.relatedToId ? text(input.relatedToId, 120) : null;
    if (relatedToId && !activePerson(relatedToId)) return fail('The other person named in the interest is not on the active roster.', 'relatedToId');
    return {
      ok: true,
      draft: {
        personId, subjectType, subjectId, relationship, direction, relatedToId,
        becameKnownOn, declaredOn: check.today, declaredById: check.actorId, source,
        note: note.slice(0, L.reasonMax),
      },
      personName: text(person.name, 120),
      route: source,
    };
  }

  const assertInterest = (interestId) => {
    const interests = normalizeConflictInterests(store.state.conflictInterests, []);
    const record = interests.find((row) => row.id === interestId) || null;
    if (!record) return fail('That interest is not on the record.', 'interestId');
    return { ok: true, record, interests };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    conflictRecusalReport() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    conflictRecusalBriefText() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: conflictRecusalBriefText(report), report };
    },

    conflictRecusalCsvRows() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: conflictRecusalCsvRows(read(check)) };
    },

    /** What this seat owes: interests with no standing response, whose owner is this seat. */
    conflictRecusalAttentionCount() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: conflictRecusalAttentionCount(store.state, { now: check.at, personId: check.seat.fullAccess ? null : check.actorId }) };
    },

    /** Candidates for the declare dialog: the records and the people this seat may attach an interest to. */
    conflictRecusalCandidates() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const candidates = {};
      for (const key of CONFLICT_SUBJECT_KEYS) {
        const collection = RECORD_COLLECTIONS[key];
        candidates[key] = rows(collection)
          .filter((row) => row && typeof row.id === 'string')
          .slice(0, 200)
          .map((row) => ({
            id: row.id,
            label: text(row.title || row.name || row.role || row.id, 160),
            day: row.date || row.baseOn || row.openedOn || row.startsOn || null,
          }));
      }
      const people = rows('people')
        .filter((person) => person && person.status !== 'archived' && reachOf(check, person.id))
        .slice(0, 500)
        .map((person) => ({ id: person.id, label: text(person.name, 120), altitude: person.altitude || null }));
      return { ok: true, candidates: { records: candidates, people } };
    },

    /* --------------------------------------------------------------- writes */

    /** Declare one interest. Whole or not at all. */
    conflictRecusalDeclareInterest(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const draft = readDraft(check, input);
      if (!draft.ok) return draft;
      const interest = {
        ...draft.draft,
        id: idFactory('cin'),
        declaredAt: check.at.toISOString(),
        withdrawnOn: null,
        withdrawnById: null,
        withdrawalReason: '',
      };
      store.update(
        (state) => {
          state.conflictInterests = Array.isArray(state.conflictInterests) ? state.conflictInterests : [];
          if (state.conflictInterests.length >= L.interests) return;
          state.conflictInterests.push(interest);
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.INTEREST_DECLARED,
          entity: 'conflictInterest',
          entityId: interest.id,
          summary: `Declared a ${CONFLICT_RELATIONSHIP_BY_KEY[interest.relationship].label.toLowerCase()} concerning a ${CONFLICT_SUBJECT_BY_KEY[interest.subjectType].label.toLowerCase()}, recorded as ${interest.source}.`.slice(0, 300),
        },
      );
      return saved({ interestId: interest.id, route: interest.source });
    },

    /** Withdraw one interest. A dated act by the person, or by the seat that recorded it. */
    conflictRecusalWithdrawInterest(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const found = assertInterest(input.interestId);
      if (!found.ok) return found;
      const { record } = found;
      if (record.withdrawnOn) return fail('That interest was already withdrawn.', 'interestId');
      const mine = check.actorId === record.personId || check.actorId === record.declaredById;
      if (!mine && !reachOf(check, record.personId)) {
        return fail('An interest is withdrawn by the person who declared it, or by a seat that can reach them. Nobody else may clear another person’s disclosure.', 'interestId');
      }
      const reason = conflictReason(input.reason);
      if (!reason) return fail(`Say why the interest no longer stands — ${L.reasonMin} characters or more. A withdrawal with no reason is a deletion with a friendlier name.`, 'reason');
      store.update(
        (state) => {
          const target = (state.conflictInterests || []).find((row) => row && row.id === record.id);
          if (!target) return;
          target.withdrawnOn = check.today;
          target.withdrawnById = check.actorId;
          target.withdrawalReason = reason;
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.INTEREST_WITHDRAWN,
          entity: 'conflictInterest',
          entityId: record.id,
          summary: `Interest withdrawn on ${check.today}: ${reason.slice(0, 180)}`.slice(0, 300),
        },
      );
      return saved({ interestId: record.id });
    },

    /**
     * Record the standing response to an interest: recuse, mitigate, determine,
     * or supersede an earlier row. NEVER the person who holds the interest.
     */
    conflictRecusalRecordStanding(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const found = assertInterest(input.interestId);
      if (!found.ok) return found;
      const { record, interests } = found;
      if (record.withdrawnOn) return fail('That interest was withdrawn. There is nothing left to respond to.', 'interestId');
      const kind = CONFLICT_STANDING_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail('Choose the response: stand back, stay with a named control, a written determination, or a replacement of an earlier response.', 'kind');
      if (check.actorId === record.personId) {
        return fail('You hold this interest. The response to it is recorded by a seat above you — a hand does not clear its own conflict.', 'kind');
      }
      const via = reachOf(check, record.personId);
      if (!via) {
        return fail('The person holding this interest sits outside this seat’s reporting tree and declared lines, so this seat holds no standing to respond to it.', 'kind');
      }
      const reason = conflictReason(input.reason);
      if (!reason) return fail(`Say what you are deciding and why — ${L.reasonMin} characters or more. A response with no reason cannot be reviewed by anyone.`, 'reason');
      const spec = CONFLICT_STANDING_KIND_BY_KEY[kind];
      const control = text(input.control, L.reasonMax);
      if (spec.needsControl && control.length < L.reasonMin) {
        return fail(`A ${spec.label.toLowerCase()} must name, in writing, the control that stands in — ${L.reasonMin} characters or more. The control is the whole of the mitigation; without it the record says only that somebody was comfortable.`, 'control');
      }
      const standings = normalizeConflictStandings(store.state.conflictStandings, interests, []);
      const mine = standings.filter((row) => row.interestId === record.id);
      if (mine.length >= L.standingsPerInterest) {
        return fail(`This interest already carries ${L.standingsPerInterest} responses, which is the limit. Superseding an earlier response does not need a new row beyond it — retire the interest and declare it again if the situation changed.`, 'kind');
      }
      const live = mine.filter((row) => !mine.some((other) => other.supersedesId === row.id));
      const supersedesId = kind === 'supersede'
        ? (text(input.supersedesId, 120) || live[live.length - 1]?.id || '')
        : '';
      if (kind === 'supersede') {
        const target = standings.find((row) => row.id === supersedesId && row.interestId === record.id) || null;
        if (!target) return fail('A supersession must name an earlier response to this same interest.', 'supersedesId');
      }
      const standing = {
        id: idFactory('cst'),
        interestId: record.id,
        kind,
        authorityId: check.actorId,
        recordedOn: check.today,
        recordedAt: check.at.toISOString(),
        recordedById: check.actorId,
        reason,
        control: spec.needsControl ? control : '',
        supersedesId: kind === 'supersede' ? supersedesId : null,
      };
      store.update(
        (state) => {
          state.conflictStandings = Array.isArray(state.conflictStandings) ? state.conflictStandings : [];
          state.conflictStandings.push(standing);
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.STANDING_RECORDED,
          entity: 'conflictStanding',
          entityId: standing.id,
          summary: `Recorded a ${spec.label.toLowerCase()} against a declared interest on ${check.today}: ${reason.slice(0, 170)}`.slice(0, 300),
        },
      );
      /* Re-read through the SAME engine the panel uses, so the act reports the
         verdict the record now prints — not an intention. */
      const after = buildConflictRecusal(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      const row = after.rows.find((entry) => entry.interestId === record.id) || null;
      return saved({ standingId: standing.id, verdict: row?.verdict || null, verdictReason: row?.verdictReason || null });
    },

    /**
     * Declare NO reportable interest in one record — the first-person statement
     * that turns "nobody looked" into "asked, and clear". First person only: the
     * person the statement is about is the person making it.
     */
    conflictRecusalDeclareNoInterest(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const subjectType = CONFLICT_SUBJECT_KEYS.includes(input.subjectType) ? input.subjectType : null;
      if (!subjectType) return fail('Say which record you are declaring clear: a logged decision, an investment case, a hiring requisition or a budget envelope.', 'subjectType');
      const subjectId = text(input.subjectId, 120);
      if (!subjectId) return fail(`Name the ${CONFLICT_SUBJECT_BY_KEY[subjectType].label.toLowerCase()} you are declaring clear of any reportable interest.`, 'subjectId');
      if (!recordFor(subjectType, subjectId)) return fail('That record is not on the workspace. A declaration of no interest against a record nobody can open protects nobody.', 'subjectId');
      // First person. A seat may not declare somebody else clear — that is a
      // disclosure, which is a different act with a different route and a
      // different meaning.
      if (check.seat.fullAccess) {
        return fail('A declaration of no interest is first person: it belongs to the person who signs the record. The operator view holds no person and cannot make one on anybody’s behalf.', 'personId');
      }
      const personId = check.actorId;
      const person = activePerson(personId);
      if (!person) return fail('The declared seat has no active roster person, so a first-person declaration cannot be made from it.');
      // THE POSITION MUST EXIST. A declaration of no interest is a statement about
      // ONE record where this person is the hand that signs it or the person who
      // owns it. Declaring yourself clear of a record you do not hold is not a
      // weaker statement — it is a statement about nothing, and it would let a
      // record read covered while its actual signer was never asked once.
      const coverage = read(check).coverageRows
        .find((row) => row.personId === personId && row.subjectType === subjectType && row.subjectId === subjectId) || null;
      if (!coverage) {
        return fail(`You are not read against that ${CONFLICT_SUBJECT_BY_KEY[subjectType].label.toLowerCase()}: you are neither the hand that signs it nor the person who owns it. A declaration of no interest is about a position you actually hold.`, 'subjectId');
      }
      const relationships = Array.isArray(input.relationships)
        ? [...new Set(input.relationships.filter((key) => CONFLICT_RELATIONSHIP_KEYS.includes(key)))].sort()
        : [];
      if (!relationships.length) return fail('Name the relationship kinds this declaration covers. A declaration covering nothing asks nothing.', 'relationships');
      const note = String(input.note ?? '').trim();
      if (note && !conflictReason(note)) return fail(`A note must be at least ${L.reasonMin} characters if you write one.`, 'note');
      const declaration = {
        id: idFactory('cnd'),
        personId,
        subjectType,
        subjectId,
        relationships,
        note: note.slice(0, L.reasonMax),
        declaredOn: check.today,
        declaredAt: check.at.toISOString(),
        declaredById: personId,
        withdrawnOn: null,
        withdrawnById: null,
      };
      store.update(
        (state) => {
          state.conflictNoneDeclarations = Array.isArray(state.conflictNoneDeclarations) ? state.conflictNoneDeclarations : [];
          if (state.conflictNoneDeclarations.length >= L.declarations) return;
          state.conflictNoneDeclarations.push(declaration);
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.NONE_DECLARED,
          entity: 'conflictNoneDeclaration',
          entityId: declaration.id,
          summary: `Declared no reportable interest in a ${CONFLICT_SUBJECT_BY_KEY[subjectType].label.toLowerCase()}, covering ${relationships.length} relationship kind(s).`.slice(0, 300),
        },
      );
      /* Report the verdict the register NOW prints, not an intention. */
      const after = buildConflictRecusal(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      const row = after.coverageRows.find((entry) => entry.coverageKey.startsWith(`${subjectType}:${subjectId}|${personId}|`)) || null;
      return saved({ declarationId: declaration.id, verdict: row?.verdict || null, unasked: row?.coverage?.unaskedKinds || [] });
    },

    /** Withdraw a no-interest declaration. First person, dated, with a reason. */
    conflictRecusalWithdrawNoInterest(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const declarations = normalizeConflictNoneDeclarations(store.state.conflictNoneDeclarations, []);
      const target = declarations.find((row) => row.id === text(input.declarationId, 120)) || null;
      if (!target) return fail('That declaration is not on the record.', 'declarationId');
      if (target.withdrawnOn) return fail('That declaration was already withdrawn.', 'declarationId');
      if (!check.seat.fullAccess && check.actorId !== target.personId) {
        return fail('A declaration of no interest is withdrawn by the person who made it. Nobody clears or re-opens somebody else’s word.', 'declarationId');
      }
      if (check.seat.fullAccess) return fail('The operator view holds no person and cannot withdraw a first-person declaration.', 'declarationId');
      const reason = conflictReason(input.reason);
      if (!reason) return fail(`Say why — ${L.reasonMin} characters or more. A withdrawal with no reason is a deletion with a friendlier name.`, 'reason');
      store.update(
        (state) => {
          const row = (state.conflictNoneDeclarations || []).find((entry) => entry && entry.id === target.id);
          if (!row) return;
          row.withdrawnOn = check.today;
          row.withdrawnById = check.actorId;
          row.withdrawalReason = reason;
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.NONE_WITHDRAWN,
          entity: 'conflictNoneDeclaration',
          entityId: target.id,
          summary: `No-interest declaration withdrawn on ${check.today}: ${reason.slice(0, 180)}`.slice(0, 300),
        },
      );
      return saved({ declarationId: target.id });
    },

    /** The record a seat could declare itself clear on, with what still needs asking. */
    conflictRecusalNoInterestCandidates() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = read(check);
      const mine = report.coverageRows
        .filter((row) => !check.seat.fullAccess && row.personId === check.actorId)
        .map((row) => ({
          personId: row.personId,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          recordTitle: row.recordTitle,
          recordDay: row.recordDay,
          verdict: row.verdict,
          verdictReason: row.verdictReason,
          positions: row.positions,
          reportableKinds: row.coverage.reportableKinds,
          unaskedKinds: row.coverage.unaskedKinds || [],
        }));
      return { ok: true, candidates: mine };
    },

    /** Declare a rule: which relationship kinds are reportable, from what altitude. */
    conflictRecusalDeclareRule(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const relationships = Array.isArray(input.relationships)
        ? [...new Set(input.relationships.filter((key) => CONFLICT_RELATIONSHIP_KEYS.includes(key)))].sort()
        : [];
      if (!relationships.length) return fail('Choose at least one relationship kind this rule makes reportable. A rule that covers nothing asks nobody anything.', 'relationships');
      if (relationships.length > L.kindsPerRule) return fail(`A rule covers at most ${L.kindsPerRule} relationship kinds.`, 'relationships');
      const minRank = Number.isInteger(input.minRank) ? input.minRank : null;
      if (!minRank || minRank < 1 || minRank > 6) return fail('Say the altitude the rule reaches down to, as a rank from 1 to 6.', 'minRank');
      const effectiveFrom = conflictDay(input.effectiveFrom) || check.today;
      const source = text(input.sourceNote, L.sourceMax);
      if (source.length < L.sourceMin) return fail(`Name the source of the rule — the policy, code or board minute it comes from — ${L.sourceMin} characters or more. A rule nobody can trace is a preference.`, 'sourceNote');
      const rule = {
        id: idFactory('cru'),
        relationships,
        minRank,
        effectiveFrom,
        retiredOn: null,
        sourceNote: source,
        declaredOn: check.today,
        declaredAt: check.at.toISOString(),
        declaredById: check.actorId,
      };
      store.update(
        (state) => {
          state.conflictRules = Array.isArray(state.conflictRules) ? state.conflictRules : [];
          if (state.conflictRules.length >= L.rules) return;
          state.conflictRules.push(rule);
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.RULE_DECLARED,
          entity: 'conflictRule',
          entityId: rule.id,
          summary: `Declared a reportable-conflict rule covering ${relationships.length} relationship kind(s) from rank ${minRank}, effective ${effectiveFrom}.`.slice(0, 300),
        },
      );
      return saved({ ruleId: rule.id });
    },

    /** Retire a rule from a stated day. Nothing is erased; coverage stops there. */
    conflictRecusalRetireRule(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const rules = normalizeConflictRules(store.state.conflictRules, []);
      const rule = rules.find((row) => row.id === text(input.ruleId, 120)) || null;
      if (!rule) return fail('That rule is not on the record.', 'ruleId');
      if (rule.retiredOn) return fail('That rule is already retired.', 'ruleId');
      const on = conflictDay(input.retiredOn) || check.today;
      if (on < rule.effectiveFrom) return fail('A rule cannot be retired before it took effect.', 'retiredOn');
      store.update(
        (state) => {
          const target = (state.conflictRules || []).find((row) => row && row.id === rule.id);
          if (!target) return;
          target.retiredOn = on;
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.RULE_RETIRED,
          entity: 'conflictRule',
          entityId: rule.id,
          summary: `Reportable-conflict rule retired from ${on}. Everything it covered before that day stays as it was read.`.slice(0, 300),
        },
      );
      return saved({ ruleId: rule.id, retiredOn: on });
    },

    /** The declared conventions. A pause is one of them. */
    conflictRecusalSetConventions(input = {}) {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const next = normalizeConflictRecusalSettings({ ...store.state.settings, ...input });
      store.update(
        (state) => {
          state.settings = { ...(state.settings || {}), ...next };
        },
        {
          type: CONFLICT_RECUSAL_EVENTS.CONVENTIONS,
          entity: 'settings',
          entityId: 'conflictRecusal',
          summary: `Conflict/recusal conventions: ${L.backDays ? '' : ''}${CONFLICT_RECUSAL_SETTING_LABELS.backDays} ${next[CONFLICT_RECUSAL_SETTING_KEYS.backDays]}; ${CONFLICT_RECUSAL_SETTING_LABELS.lateDays} ${next[CONFLICT_RECUSAL_SETTING_KEYS.lateDays]}; automation ${next[CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate] ? 'on' : 'paused'}.`.slice(0, 300),
        },
      );
      return saved({ settings: next });
    },

    /** Run the shared post-commit spine — the same one every other module uses. */
    conflictRecusalScan() {
      const check = seatFor(CONFLICT_RECUSAL_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(
        () => {},
        {
          type: CONFLICT_RECUSAL_EVENTS.SCAN,
          entity: 'settings',
          entityId: 'conflictRecusal',
          summary: 'Conflict/recusal register scanned: every declared interest is read against the record it names.',
        },
      );
      const after = buildConflictRecusal(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return saved({ report: after, propagations: store.lastPropagations || [] });
    },
  };
}

/** Exported for the panel's own copy of the rules — one vocabulary, no second list. */
export const CONFLICT_RECUSAL_BOUNDS_VIEW = CONFLICT_RECUSAL_BOUNDS;
