/**
 * app/core/domain/speakUpActions.js — the seat-checked commands of the Speak-Up
 * Concern Routing & Impartiality Register (ADR-0215, Schema v169).
 *
 * SEVEN human acts and nothing else: RAISE a concern, ACKNOWLEDGE it, record an
 * OUTCOME, record the retaliation WATCH, CLOSE it, WITHDRAW it, and set the
 * conventions. The rule that chases a clock is `RULE-SUP-01`, not this file.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - The route is RE-PROVED at the moment of writing, not trusted from the form.
 *    A receiver who holds either party, on the home line or on any declared line,
 *    is refused with the relationship that disqualified them. The screen's
 *    candidate list is a convenience; this function is the control.
 *  - `none-available` may only be recorded when the graph has been walked and no
 *    seat qualifies. Asking to record it while a qualifying seat exists is
 *    refused, so the finding can never be used to skip a route that exists.
 *  - Nobody files somebody else's concern in their name. A named reporter must be
 *    the acting seat's own person or a person that seat holds, and the action
 *    stores which of the two it was.
 *  - Answering belongs to the named receiver ALONE, re-proved against the live
 *    graph on every act: acknowledgment, outcome, watch and close.
 *  - The retaliation check is never conducted by the subject of the concern, and
 *    it is only recorded INSIDE the window it reports on. A check typed after the
 *    window would tell a reader something about a period nobody watched.
 *  - A window cannot start in the future and nothing is backdated into existence:
 *    the day of an act must be on or after the day the act it follows happened.
 *
 * Every write stores the row its own loader returns, so the record is identical
 * before and after a reload, and nothing derived is stored.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildSpeakUpReport,
  impartialityVerdict,
  speakUpAttentionCount,
  speakUpBriefText,
  speakUpCandidates,
  speakUpCsvRows,
} from './speakUp.js';
import {
  SPEAK_UP_BOUNDS,
  SPEAK_UP_CATEGORY_KEYS,
  SPEAK_UP_DEFAULTS,
  SPEAK_UP_EVENTS,
  SPEAK_UP_LIMITS,
  SPEAK_UP_OUTCOME_KEYS,
  SPEAK_UP_RIGHTS,
  SPEAK_UP_ROUTE_KEYS,
  SPEAK_UP_ROUTE,
  SPEAK_UP_RULE_ID,
  SPEAK_UP_SETTING_KEYS,
  SPEAK_UP_SETTING_LABELS,
  SPEAK_UP_SUBJECT_KEYS,
  SPEAK_UP_WATCH_KEYS,
} from './speakUpRegistry.js';
import {
  firstActOfKind,
  normalizeConcernActs,
  normalizeConcernReports,
  normalizeSpeakUpSettings,
  readSpeakUpSettings,
  speakUpDay,
  speakUpDaysBetween,
  speakUpPersonId,
  speakUpText,
} from './speakUpSchema.js';

const L = SPEAK_UP_LIMITS;
const REFUSAL = (key) => `speakUp:${  key}`;

export function createSpeakUpActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before raising or answering a concern.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildSpeakUpReport(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: 'operator', 'home-line', 'declared-line', or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }

  function matrixOf(cfg, at) {
    try {
      return buildMatrix(store.state, { now: at, settings: { ...cfg, activeSeatId: null } });
    } catch {
      return null;
    }
  }

  const activePerson = (id) => rows('people').find((person) => person && person.id === id && person.status !== 'archived') || null;

  /** One concern, read back through the loader — the writer never trusts its own input. */
  const storedReport = (id) => normalizeConcernReports(rows('concernReports'), []).find((row) => row.id === id) || null;
  const storedActs = (reports) => normalizeConcernActs(rows('concernActs'), reports, []);

  /** Prove a write may land on this concern, then hand back the row and its acts. */
  function answerContext(input, { allowOperator = false } = {}) {
    const reportId = speakUpText(input?.reportId, 80);
    if (!reportId) return fail('Name the concern this act belongs to.', 'reportId');
    const reports = normalizeConcernReports(rows('concernReports'), []);
    const report = reports.find((row) => row.id === reportId) || null;
    if (!report) return fail('That concern is not on this record. Nothing was saved.', 'reportId');
    const check = seatFor(SPEAK_UP_RIGHTS.ANSWER);
    if (!check.ok) return check;
    if (report.routeKey !== 'internal-person') {
      return fail('This concern was routed externally or has no internal route; there is no receiver to act on it. Record the referral, not a handling act.', 'reportId');
    }
    const isReceiver = check.seat.fullAccess ? allowOperator : check.actorId === report.receiverId;
    if (!isReceiver) {
      return fail(`Only the named receiver may act on this concern. ${check.seat.fullAccess ? 'The operator view is not the receiver here either — a receiver was named, and the register does not substitute one.' : 'You are not the receiver it was routed to.'} Nothing was saved.`, 'reportId', REFUSAL('not-the-receiver'));
    }
    // The receiver's impartiality is re-proved at the moment of the act.
    const matrix = matrixOf(check.cfg, check.at);
    const verdict = impartialityVerdict(matrix, {
      receiverId: report.receiverId,
      subjectPersonId: report.subjectKind === 'person' ? report.subjectPersonId : null,
      reporterId: report.raisedById || null,
    });
    return { ok: true, check, report, acts: storedActs(reports), matrix, verdict };
  }

  const actDay = (input, check, floor, field = 'on') => {
    const day = input?.on ? speakUpDay(input.on) : check.today;
    if (!day) return { error: fail('State the day of the act as a real calendar day (YYYY-MM-DD).', field) };
    if (day > check.today) return { error: fail(`The act is dated ${day}, after today (${check.today}). Nothing is recorded ahead of the record.`, field, REFUSAL('future-dated')) };
    if (floor && day < floor) return { error: fail(`The act is dated ${day}, before the ${floor} it follows. Nothing was saved.`, field) };
    return { day };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    speakUpReport() {
      const check = seatFor(SPEAK_UP_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    speakUpBriefText() {
      const check = seatFor(SPEAK_UP_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, text: speakUpBriefText(read(check)) };
    },

    speakUpCsvRows() {
      const check = seatFor(SPEAK_UP_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: speakUpCsvRows(read(check)) };
    },

    speakUpAttentionCount() {
      const check = seatFor(SPEAK_UP_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: speakUpAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * Who could hear a concern about this subject, and why the others could not.
     * A READ: the write re-proves the very same test, so a stale dialog cannot
     * route a concern to a receiver the graph has since disqualified.
     */
    speakUpCandidates(input = {}) {
      const check = seatFor(SPEAK_UP_RIGHTS.READ);
      if (!check.ok) return check;
      const subjectKind = SPEAK_UP_SUBJECT_KEYS.includes(speakUpText(input.subjectKind, 20)) ? speakUpText(input.subjectKind, 20) : 'practice';
      const subjectPersonId = subjectKind === 'person' ? speakUpPersonId(input.subjectPersonId) : null;
      const reporterId = input.unnamed ? null : (speakUpPersonId(input.raisedById) || check.actorId);
      const matrix = matrixOf(check.cfg, check.at);
      const board = speakUpCandidates(matrix, { subjectPersonId, reporterId });
      const named = board.candidates
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.id === LEADER_ID ? (speakUpText(check.cfg?.leaderName, 120) || 'Workspace leader') : (activePerson(candidate.id)?.name || candidate.id),
          roles: candidate.roles,
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return {
        ok: true,
        today: check.today,
        candidates: named,
        excluded: board.excluded,
        excludedN: board.excludedN,
        noRoute: named.length === 0,
        canRaise: canAct(SPEAK_UP_RIGHTS.RAISE, check.seat).allow === true,
        canGovern: canAct(SPEAK_UP_RIGHTS.GOVERN, check.seat).allow === true,
        self: check.seat.fullAccess ? null : (activePerson(check.actorId)?.name || check.actorId),
        people: rows('people')
          .filter((person) => person && person.id && person.status !== 'archived')
          .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id) }))
          .filter((person) => person.via)
          .sort((a, b) => a.name.localeCompare(b.name)),
        settings: readSpeakUpSettings({ settings: check.cfg }),
        limits: L,
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Raise one dated concern. The route is proved here, not in the form. */
    speakUpRaiseConcern(input = {}) {
      const check = seatFor(SPEAK_UP_RIGHTS.RAISE);
      if (!check.ok) return check;
      if (rows('concernReports').length >= L.reports) {
        return fail(`The concern register reached its ${L.reports}-row cap. Export the workspace before raising another concern.`);
      }

      const unnamed = input.unnamed === true;
      let raisedById = null;
      let raisedVia = 'unnamed';
      if (!unnamed) {
        const stated = speakUpPersonId(input.raisedById) || check.actorId;
        const person = stated === LEADER_ID ? { id: LEADER_ID } : activePerson(stated);
        if (!person) return fail('The reporter must be a person this roster holds, or the workspace leader. A concern about somebody who is not in the record cannot be routed.', 'raisedById');
        const via = reachOf(check, stated);
        if (!via) {
          return fail('A named raise must come from your own seat, or from a person your seat holds. Nobody files somebody else’s concern in their name.', 'raisedById', REFUSAL('unauthored-raise'));
        }
        raisedById = stated;
        raisedVia = via;
      }

      const subjectKind = speakUpText(input.subjectKind, 20);
      if (!SPEAK_UP_SUBJECT_KEYS.includes(subjectKind)) return fail('State whether the concern is about a person or about a practice. It is never guessed from the text.', 'subjectKind', REFUSAL('unknown-category'));
      const subjectPersonId = subjectKind === 'person' ? speakUpPersonId(input.subjectPersonId) : null;
      const subjectLabel = subjectKind === 'practice' ? speakUpText(input.subjectLabel, L.labelMax) : '';
      if (subjectKind === 'person') {
        if (!subjectPersonId) return fail('Name the person the concern is about.', 'subjectPersonId');
        if (subjectPersonId !== LEADER_ID && !activePerson(subjectPersonId)) {
          return fail('The named subject is not on the active roster. A concern about somebody this record does not hold cannot be routed.', 'subjectPersonId', REFUSAL('not-on-roster'));
        }
        if (raisedById && subjectPersonId === raisedById) {
          return fail('A person cannot raise a concern about themselves. If the concern is about a practice, raise it as a practice.', 'subjectPersonId', REFUSAL('subject-is-reporter'));
        }
      } else if (subjectLabel.length < L.labelMin) {
        return fail('Name the practice the concern is about, in at least a few words.', 'subjectLabel');
      }

      const categoryKey = speakUpText(input.categoryKey, 40);
      if (!SPEAK_UP_CATEGORY_KEYS.includes(categoryKey)) {
        return fail('Choose a category from the register’s list. It is never inferred from the text of the concern.', 'categoryKey', REFUSAL('unknown-category'));
      }
      const summary = speakUpText(input.summary, L.summaryMax);
      if (summary.length < L.summaryMin) {
        return fail(`Write a summary a receiver can act on — at least ${L.summaryMin} characters.`, 'summary', REFUSAL('summary-too-short'));
      }
      const channelBasis = speakUpText(input.channelBasis, L.basisMax);
      if (channelBasis.length < L.basisMin) {
        return fail('State why this route was chosen, in writing. The reason is part of the record.', 'channelBasis');
      }

      const routeKey = speakUpText(input.routeKey, 40);
      if (!SPEAK_UP_ROUTE_KEYS.includes(routeKey)) return fail('Choose a route from the register’s list.', 'routeKey', REFUSAL('unknown-route'));

      const raisedOn = input.raisedOn ? speakUpDay(input.raisedOn) : check.today;
      if (!raisedOn) return fail('State the day the concern was raised as a real calendar day (YYYY-MM-DD).', 'raisedOn');
      if (raisedOn > check.today) return fail(`The concern is dated ${raisedOn}, after today (${check.today}). A record of something that has not happened is not a record.`, 'raisedOn', REFUSAL('future-dated'));
      if (raisedById && raisedById !== LEADER_ID) {
        const person = activePerson(raisedById);
        const start = person?.startDate ? dayKey(person.startDate) : null;
        if (start && raisedOn < start) {
          return fail(`The concern is dated ${raisedOn}, before the reporter joined the roster (${start}). Nothing was saved.`, 'raisedOn', REFUSAL('backdated-before-roster'));
        }
      }

      const matrix = matrixOf(check.cfg, check.at);
      const board = speakUpCandidates(matrix, { subjectPersonId, reporterId: raisedById });

      let receiverId = null;
      let externalLabel = '';
      let storedRoute = routeKey;
      let receiverState = 'none';

      if (routeKey === 'internal-person') {
        receiverId = speakUpPersonId(input.receiverId);
        if (!receiverId) return fail('An internal route names exactly one receiver. A concern routed to “the team” has no owner and no clock.', 'receiverId', REFUSAL('receiver-required'));
        if (receiverId !== LEADER_ID && !activePerson(receiverId)) {
          return fail('The named receiver is not a person this record holds.', 'receiverId', REFUSAL('receiver-not-on-roster'));
        }
        if (receiverId === LEADER_ID && !matrix?.nodes?.has(LEADER_ID)) {
          return fail('The named receiver is not a seat on this reporting graph.', 'receiverId', REFUSAL('receiver-not-on-roster'));
        }
        const verdict = impartialityVerdict(matrix, { receiverId, subjectPersonId: subjectKind === 'person' ? subjectPersonId : null, reporterId: raisedById });
        if (!verdict.impartial) {
          const why = {
            'receiver-is-subject': 'A person named as the subject of a concern cannot be its receiver.',
            'receiver-is-reporter': 'A reporter cannot receive their own concern.',
            'receiver-reports-to-subject': 'The named receiver reports to the subject on at least one line. They answer to the person the concern is about, so they cannot adjudge it.',
            'receiver-reports-to-reporter': 'The named receiver reports to the reporter on at least one line.',
            'receiver-not-on-roster': 'The named receiver is not a seat on this reporting graph.',
          }[verdict.reason] || 'The named receiver is not impartial for this concern.';
          return fail(`${why} Nothing was saved — choose a receiver the graph proves impartial, or record that none exists.`, 'receiverId', REFUSAL(verdict.reason));
        }
        receiverState = verdict.impartial ? 'impartial' : 'refused';
      } else if (routeKey === 'external-declared') {
        externalLabel = speakUpText(input.externalLabel, L.externalLabelMax);
        if (externalLabel.length < L.labelMin) {
          return fail('Name the external channel the concern was referred to. “Somebody else” is not a channel.', 'externalLabel', REFUSAL('external-label-required'));
        }
        receiverState = 'external';
      } else {
        // none-available: only when the graph, tested NOW, holds no qualifying seat.
        if (board.candidates.length > 0) {
          return fail(`No impartial route may only be recorded when none exists. This record holds ${board.candidates.length} seat(s) that could hear this concern; name one of them.`, 'routeKey', REFUSAL('route-not-available'));
        }
        receiverState = 'none';
      }

      const conv = readSpeakUpSettings({ settings: check.cfg });
      const id = idFactory('sup');
      const row = {
        id,
        raisedOn,
        raisedById,
        subjectKind,
        subjectPersonId: subjectKind === 'person' ? subjectPersonId : null,
        subjectLabel,
        categoryKey,
        routeKey: storedRoute,
        receiverId,
        externalLabel,
        channelBasis,
        summary,
        ackDays: conv.ackDays,
        feedbackDays: conv.feedbackDays,
        watchDays: conv.watchDays,
      };
      // Store the row its own loader returns — the writer never trusts its input.
      const loaded = normalizeConcernReports([row], [])[0];
      if (!loaded) return fail('The concern could not be stored as a row this register can read back. Nothing was saved.');

      store.update((draft) => {
        draft.concernReports = Array.isArray(draft.concernReports) ? draft.concernReports : [];
        draft.concernReports.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.CONCERN_RAISED,
        entity: 'concernReport',
        entityId: id,
        summary: `Concern raised on ${raisedOn}: ${categoryKey}, ${storedRoute}${receiverState === 'none' ? ' (no impartial route existed)' : ''}.`.slice(0, 300),
      });

      return saved({
        reportId: id,
        receiverState,
        candidatesN: board.candidates.length,
        excluded: board.excluded,
        raisedVia,
      });
    },

    /** The receiver acknowledges receipt. The first clock, and the one that is owed in days. */
    speakUpAcknowledge(input = {}) {
      const context = answerContext(input);
      if (!context.ok) return context;
      const { check, report, acts } = context;
      if (firstActOfKind(acts, report.id, 'acknowledged')) {
        return fail('This concern has already been acknowledged. A second acknowledgement is a correction to the record, not a second clock.', 'reportId', REFUSAL('already-acknowledged'));
      }
      const day = actDay(input, check, report.raisedOn);
      if (day.error) return day.error;
      const note = speakUpText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record what the acknowledgement said, in at least a sentence. An acknowledgement with no record is a receipt nobody can audit.', 'note');
      const id = idFactory('supact');
      const act = { id, reportId: report.id, kind: 'acknowledged', byId: check.actorId, on: day.day, outcomeKey: null, verdictKey: null, note };
      const loaded = normalizeConcernActs([act], [report], [])[0];
      if (!loaded) return fail('The acknowledgement could not be stored as an act this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.concernActs = Array.isArray(draft.concernActs) ? draft.concernActs : [];
        draft.concernActs.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.ACKNOWLEDGED,
        entity: 'concernReport',
        entityId: report.id,
        summary: `Concern acknowledged on ${day.day}.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** Record the outcome. One per concern; it never overwrites the acknowledgement. */
    speakUpRecordOutcome(input = {}) {
      const context = answerContext(input);
      if (!context.ok) return context;
      const { check, report, acts } = context;
      const ack = firstActOfKind(acts, report.id, 'acknowledged');
      if (!ack) return fail('An outcome cannot be recorded before the concern was acknowledged. If nothing has been done, the register says so by leaving the clock running.', 'reportId', REFUSAL('outcome-before-ack'));
      if (firstActOfKind(acts, report.id, 'outcome')) {
        return fail('This concern already carries an outcome. A later determination is recorded by closing and re-raising, never by overwriting the first.', 'reportId', REFUSAL('outcome-once'));
      }
      const outcomeKey = speakUpText(input.outcomeKey, 40);
      if (!SPEAK_UP_OUTCOME_KEYS.includes(outcomeKey)) return fail('Choose an outcome from the register’s list.', 'outcomeKey', REFUSAL('unknown-outcome'));
      const day = actDay(input, check, ack.on);
      if (day.error) return day.error;
      const note = speakUpText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record what was determined, in at least a sentence. “Handled” is not an outcome.', 'note');
      const id = idFactory('supact');
      const act = { id, reportId: report.id, kind: 'outcome', byId: check.actorId, on: day.day, outcomeKey, verdictKey: null, note };
      const loaded = normalizeConcernActs([act], [report], [])[0];
      if (!loaded) return fail('The outcome could not be stored as an act this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.concernActs = Array.isArray(draft.concernActs) ? draft.concernActs : [];
        draft.concernActs.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.OUTCOME,
        entity: 'concernReport',
        entityId: report.id,
        summary: `Concern outcome recorded on ${day.day}: ${outcomeKey}.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** The dated anti-retaliation check. Inside the window, by somebody who is not the subject. */
    speakUpRecordWatch(input = {}) {
      const context = answerContext(input);
      if (!context.ok) return context;
      const { check, report, acts } = context;
      const outcome = firstActOfKind(acts, report.id, 'outcome');
      if (!outcome) return fail('A retaliation check cannot happen before there is an outcome to check against.', 'reportId', REFUSAL('watch-before-outcome'));
      if (firstActOfKind(acts, report.id, 'watch')) {
        return fail('This concern already carries a retaliation check. A second verdict would let a bad one be overwritten.', 'reportId', REFUSAL('watch-once'));
      }
      if (report.subjectKind === 'person' && check.actorId === report.subjectPersonId) {
        return fail('The subject of a concern never conducts the retaliation check about it.', 'reportId', REFUSAL('watch-by-subject'));
      }
      const verdictKey = speakUpText(input.verdictKey, 40);
      if (!SPEAK_UP_WATCH_KEYS.includes(verdictKey)) return fail('Choose a retaliation-check verdict from the register’s list.', 'verdictKey');
      const day = actDay(input, check, outcome.on);
      if (day.error) return day.error;
      const watchWindow = Number.isInteger(report.watchDays) ? report.watchDays : SPEAK_UP_DEFAULTS.watchDays;
      const lastDay = addDays(outcome.on, watchWindow);
      if (day.day > lastDay) {
        return fail(`The declared watch window closed on ${lastDay}. A check recorded after it says nothing about the window it names, so it is refused rather than filed late.`, 'on', REFUSAL('watch-outside-window'));
      }
      const note = speakUpText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record what was checked, in at least a sentence.', 'note');
      const id = idFactory('supact');
      const act = { id, reportId: report.id, kind: 'watch', byId: check.actorId, on: day.day, outcomeKey: null, verdictKey, note };
      const loaded = normalizeConcernActs([act], [report], [])[0];
      if (!loaded) return fail('The retaliation check could not be stored as an act this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.concernActs = Array.isArray(draft.concernActs) ? draft.concernActs : [];
        draft.concernActs.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.WATCH,
        entity: 'concernReport',
        entityId: report.id,
        summary: `Retaliation check recorded on ${day.day}: ${verdictKey}.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** Close a concern. Only after an outcome, and closing changes nothing already recorded. */
    speakUpCloseConcern(input = {}) {
      const context = answerContext(input);
      if (!context.ok) return context;
      const { check, report, acts } = context;
      const outcome = firstActOfKind(acts, report.id, 'outcome');
      if (!outcome) return fail('A concern is closed only after an outcome. Closing an open concern would end a duty without discharging it.', 'reportId', REFUSAL('close-before-outcome'));
      if (firstActOfKind(acts, report.id, 'closed')) return fail('This concern is already closed.', 'reportId');
      const day = actDay(input, check, outcome.on);
      if (day.error) return day.error;
      const note = speakUpText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record why the concern is closed, in at least a sentence.', 'note');
      const id = idFactory('supact');
      const act = { id, reportId: report.id, kind: 'closed', byId: check.actorId, on: day.day, outcomeKey: null, verdictKey: null, note };
      const loaded = normalizeConcernActs([act], [report], [])[0];
      if (!loaded) return fail('The closure could not be stored as an act this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.concernActs = Array.isArray(draft.concernActs) ? draft.concernActs : [];
        draft.concernActs.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.CLOSED,
        entity: 'concernReport',
        entityId: report.id,
        summary: `Concern closed on ${day.day}.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** The reporter — or the operator on an unnamed record — ends the concern. */
    speakUpWithdrawConcern(input = {}) {
      const reportId = speakUpText(input?.reportId, 80);
      if (!reportId) return fail('Name the concern to withdraw.', 'reportId');
      const reports = normalizeConcernReports(rows('concernReports'), []);
      const report = reports.find((row) => row.id === reportId) || null;
      if (!report) return fail('That concern is not on this record. Nothing was saved.', 'reportId');
      const check = seatFor(SPEAK_UP_RIGHTS.RAISE);
      if (!check.ok) return check;
      const isReporter = Boolean(report.raisedById) && check.actorId === report.raisedById;
      const operatorOnUnnamed = check.seat.fullAccess && !report.raisedById;
      if (!isReporter && !operatorOnUnnamed) {
        return fail('Only the reporter may withdraw a concern. A manager withdrawing somebody else’s concern is the exact act this register exists to prevent.', 'reportId', REFUSAL('withdraw-not-reporter'));
      }
      const acts = storedActs(reports);
      if (firstActOfKind(acts, report.id, 'withdrawn')) return fail('This concern is already withdrawn.', 'reportId');
      const day = actDay(input, check, report.raisedOn);
      if (day.error) return day.error;
      const note = speakUpText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record why the concern is withdrawn, in at least a sentence.', 'note');
      const id = idFactory('supact');
      const act = { id, reportId: report.id, kind: 'withdrawn', byId: check.actorId, on: day.day, outcomeKey: null, verdictKey: null, note };
      const loaded = normalizeConcernActs([act], [report], [])[0];
      if (!loaded) return fail('The withdrawal could not be stored as an act this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.concernActs = Array.isArray(draft.concernActs) ? draft.concernActs : [];
        draft.concernActs.push(loaded);
      }, {
        type: SPEAK_UP_EVENTS.CONCERN_WITHDRAWN,
        entity: 'concernReport',
        entityId: report.id,
        summary: `Concern withdrawn by its reporter on ${day.day}.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** Ask the register to re-evaluate its clocks now (the rule is what files asks). */
    speakUpScan() {
      const check = seatFor(SPEAK_UP_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: SPEAK_UP_EVENTS.SCAN,
        entity: 'workspace',
        entityId: `${SPEAK_UP_ROUTE}#${SPEAK_UP_RULE_ID}`,
        summary: `Speak-up register scan requested (${SPEAK_UP_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === SPEAK_UP_RULE_ID) });
    },

    /** Set the declared windows. A value outside its bounds is REFUSED, never clamped. */
    speakUpSetConventions(patch = {}) {
      const check = seatFor(SPEAK_UP_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Speak-up conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(SPEAK_UP_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared speak-up convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail('The automation switch takes true or false. Nothing was saved.', key);
          continue;
        }
        const [min, max] = SPEAK_UP_BOUNDS[name];
        if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
          return fail(`${SPEAK_UP_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key, REFUSAL('convention-out-of-bounds'));
        }
      }
      const next = normalizeSpeakUpSettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: SPEAK_UP_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'speakUp',
        summary: `Speak-up conventions set: ${keys.map((key) => `${key}=${patch[key]}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: readSpeakUpSettings({ settings: { ...settings(), ...next } }) });
    },
  };
}
