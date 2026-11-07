/**
 * app/core/domain/branchReadingActions.js — the Branch Reading hand-off's
 * commands and seat-scoped reads (ADR-0129, Schema v118).
 *
 *   branchReadingRequest  "Your cell is withheld from my table. Give me your
 *                          own reading." One atomic `store.update`: the ask row,
 *                          one `requests-reading-from` edge to the branch
 *                          leader's person, one `rolls-up-to` edge per span
 *                          above the asker, and the audit event. NO decision is
 *                          opened: asking is not a commitment and the branch has
 *                          not failed at anything.
 *
 *   branchReadingWithdraw  the asker takes the question back, with a reason.
 *
 *   branchReadingPublish   "Here is what my own branch grades today, and here
 *                          are my words." The band is DERIVED from the
 *                          publisher's own register inside this command and
 *                          frozen with the day; it is never an input, so no
 *                          leader can type a reassuring band. One atomic
 *                          `store.update`: the answer row, one
 *                          `answers-reading-ask` edge to the ask, one
 *                          `rolls-up-to` edge per span above the branch.
 *
 *   branchReadingDecline   the branch leader refuses, with words. This too is
 *                          ONE atomic `store.update` and opens NO decision: a
 *                          refusal that escalates itself is not a refusal, and
 *                          the chief still needs to see it rather than a blank.
 *
 *   branchReadingRevoke    the publisher withdraws a reading they gave.
 *                          Append-only; the cell falls back to asked/overdue
 *                          rather than keeping a band nobody stands behind.
 *
 * There is deliberately NO command that publishes on a branch's behalf, none
 * that schedules, chases or reminds, none that lifts the disclosure floor, and
 * none that writes a count downward. The counts stay in the branch's register;
 * the band and the leader's words are the whole disclosure.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildDutyCoverageReport, branchReadingBandFromRows, dutiesForSeat } from './dutyCoverage.js';
import {
  activeAnswerForAsk, deriveReadingState, normalizeBranchReadings, normalizeBranchReadingAsks,
} from './branchReadingSchema.js';
import { normalizeDutyCoverageSettings } from './dutyCoverageSchema.js';
import {
  BRANCH_READING_BAND_LABELS,
  BRANCH_READING_ENGINE_VERSION,
  BRANCH_READING_EVENTS,
  BRANCH_READING_LIMITS,
  BRANCH_READING_REFUSALS,
  BRANCH_READING_RELATIONS,
  BRANCH_READING_STATE_LABELS,
} from './branchReadingRegistry.js';

export function createBranchReadingActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  /** `store.update()` returns the new STATE, so success is read from persistError. */
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(BRANCH_READING_REFUSALS.unresolvedSeat);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const asks = () => (Array.isArray(store.state.branchReadingAsks) ? store.state.branchReadingAsks : []);
  const readings = () => (Array.isArray(store.state.branchReadings) ? store.state.branchReadings : []);
  const conventions = () => normalizeDutyCoverageSettings(settings());

  const ancestorsAbove = (built, seatId) => {
    const out = [];
    let cursor = built.chain.nodes.get(seatId)?.parentId || null;
    let guard = 0;
    while (cursor && guard < 16) {
      out.push(cursor);
      if (cursor === LEADER_ID) break;
      cursor = built.chain.nodes.get(cursor)?.parentId || null;
      guard += 1;
    }
    return out;
  };

  /** The band the acting seat's own register grades into today — the ONLY value a publish can carry. */
  const deriveOwnBand = () => {
    const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
    return branchReadingBandFromRows(report.rows);
  };

  const resolveAsk = (askId) => {
    const id = String(askId || '').trim();
    if (!id) return { ok: false, error: 'Choose the branch reading request this answer is for.', field: 'id' };
    const ask = asks().find((a) => a && a.id === id);
    if (!ask) return { ok: false, error: 'That branch reading request no longer exists in this workspace.' };
    return { ok: true, ask };
  };

  /** Only the branch the ask named may answer it, and only while it is open and unanswered. */
  const answerable = (seat, ask) => {
    if (ask.askedBySeatId === seat.id) {
      return { ok: false, error: 'You asked for this reading. The branch’s own leader answers it — a requester cannot publish, decline or self-answer their own ask.' };
    }
    // No operator bypass: the full-access seat has no register of its own, and a
    // reading published from it would be one seat disclosing another branch's
    // condition. The operator may still WITHDRAW a stale ask and REVOKE a
    // reading that no longer stands — those are the append-only acts, not consent.
    if (ask.targetSeatId !== seat.id) {
      return { ok: false, error: 'This reading was requested of another seat’s branch. Only that branch’s own leader can publish or decline it — the full-access operator view included.' };
    }
    if (ask.status !== 'open') {
      return { ok: false, error: 'That request was withdrawn. A reading nobody is asking for is not a hand-off — the ask must be made again.' };
    }
    if (activeAnswerForAsk(readings(), ask.id)) {
      return { ok: false, error: 'That request has already been answered. Revoke the answer first if the branch’s condition has changed.' };
    }
    return { ok: true };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    /**
     * Both chairs of the hand-off in one seat-scoped read: every ask addressed
     * to the acting seat (they owe an answer) and every ask the acting seat made
     * (they are waiting on one). Nothing outside those two sets is visible, so a
     * peer never learns that a sibling branch was asked.
     */
    branchReadingBoard() {
      const built = buildSeats(store.state, { now: clock(), settings: settings() });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail(BRANCH_READING_REFUSALS.unresolvedSeat);
      const conv = conventions();
      const today = dayKey(clock());
      const band = (() => {
        try { return deriveOwnBand(); } catch { return null; }
      })();
      const all = asks();
      const answers = readings();

      const askedOfMe = all
        .filter((a) => a && a.targetSeatId === seat.id)
        .sort((a, b) => (a.askedAt < b.askedAt ? 1 : a.askedAt > b.askedAt ? -1 : 0))
        .map((ask) => {
          const answer = activeAnswerForAsk(answers, ask.id);
          const derived = deriveReadingState(ask, answer, { today, responseDays: conv.dutyCoverageReadingResponseDays, validDays: conv.dutyCoverageReadingValidDays });
          const asker = built.byId.get(ask.askedBySeatId);
          const open = answerable(seat, ask).ok;
          return {
            id: ask.id,
            askedOn: ask.askedOn,
            note: ask.note,
            askedByLabel: asker?.label || 'A seat above you',
            askedByRank: asker?.rank ?? null,
            state: derived.state,
            stateLabel: BRANCH_READING_STATE_LABELS[derived.state] || derived.state,
            why: derived.why,
            responseBy: derived.responseBy,
            daysLeft: derived.daysLeft ?? null,
            daysPast: derived.daysPast ?? null,
            canAnswer: open,
            // The preview is the publisher's OWN register: counts, band and the
            // sentence the publish will freeze. Above rank 2 the row set is
            // already identity-reduced by the report, and only aggregates leave
            // this seat anyway.
            preview: open && band
              ? {
                band: band.band,
                bandLabel: BRANCH_READING_BAND_LABELS[band.band] || band.band,
                dutiesN: band.dutiesN,
                exposedN: band.exposedN,
                thinN: band.thinN,
                holdingN: band.holdingN,
                why: band.why,
              }
              : null,
            answer: answer
              ? {
                answer: answer.answer,
                band: answer.band,
                bandLabel: answer.band ? (BRANCH_READING_BAND_LABELS[answer.band] || answer.band) : null,
                note: answer.note,
                answeredOn: answer.answeredOn,
                id: answer.id,
              }
              : null,
          };
        });

      const askedOfSpan = all
        .filter((a) => a && (seat.fullAccess || a.askedBySeatId === seat.id))
        .sort((a, b) => (a.askedAt < b.askedAt ? 1 : a.askedAt > b.askedAt ? -1 : 0))
        .map((ask) => {
          const answer = activeAnswerForAsk(answers, ask.id);
          const derived = deriveReadingState(ask, answer, { today, responseDays: conv.dutyCoverageReadingResponseDays, validDays: conv.dutyCoverageReadingValidDays });
          const target = built.byId.get(ask.targetSeatId);
          return {
            id: ask.id,
            targetLabel: target?.label || 'A branch below',
            targetRank: target?.rank ?? null,
            targetSeatId: seat.fullAccess ? ask.targetSeatId : null,
            askedOn: ask.askedOn,
            note: ask.note,
            state: derived.state,
            stateLabel: BRANCH_READING_STATE_LABELS[derived.state] || derived.state,
            why: derived.why,
            responseBy: derived.responseBy,
            canWithdraw: ask.status === 'open' && !answer,
            band: derived.band ?? null,
            bandLabel: derived.band ? (BRANCH_READING_BAND_LABELS[derived.band] || derived.band) : null,
            publishedOn: derived.publishedOn ?? null,
            answeredOn: derived.answeredOn ?? null,
            answerNote: derived.answerNote ?? null,
            answerId: answer?.id || null,
          };
        });

      const count = (rows) => rows.reduce((acc, r) => {
        acc[r.state] = (acc[r.state] || 0) + 1;
        return acc;
      }, {});

      return {
        ok: true,
        seat: {
          id: seat.id,
          label: seat.label,
          rank: seat.rank,
          altitudeKey: seat.altitudeKey,
          fullAccess: Boolean(seat.fullAccess),
        },
        askedOfMe,
        askedOfSpan,
        conventions: {
          dutyCoverageReadingResponseDays: conv.dutyCoverageReadingResponseDays,
          dutyCoverageReadingValidDays: conv.dutyCoverageReadingValidDays,
        },
        summary: {
          askedOfMeN: askedOfMe.length,
          owedN: askedOfMe.filter((a) => a.canAnswer).length,
          askedOfSpanN: askedOfSpan.length,
          ...count(askedOfSpan),
        },
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Ask ONE direct branch's leader for a reading of their own register. */
    branchReadingRequest(input = {}) {
      const check = seatFor('request-branch-reading');
      if (!check.ok) return check;
      const { seat, built } = check;
      if (seat.fullAccess) return fail(BRANCH_READING_REFUSALS.operatorView);
      // Addressed as a table POSITION, because the branch table deliberately
      // carries no node id. The position is the number printed in the label
      // ("Branch 2"), and it resolves here, inside the action, against the
      // acting seat's own direct children — never against a client-supplied seat.
      let targetSeatId = String(input.targetSeatId || '').trim();
      if (!targetSeatId && input.branchPos !== undefined && input.branchPos !== null) {
        const children = seat.childSeatIds.slice().sort((a, b) => a.localeCompare(b));
        const pos = Math.round(Number(input.branchPos));
        targetSeatId = Number.isFinite(pos) && pos >= 1 ? (children[pos - 1] || '') : '';
        if (!targetSeatId) return fail('That branch position is not on this seat’s table.', 'branchPos');
      }
      if (!targetSeatId) return fail('Choose the branch cell to ask.', 'targetSeatId');
      const target = built.byId.get(targetSeatId);
      if (!target) return fail('That branch is not a seat in this roster.', 'targetSeatId');
      // One level down, never two: the reading is answered by the seat that
      // HOLDS the branch's register, so a chief asks the director and the
      // director asks the manager. Skipping a level asks a person who does not
      // hold the numbers to answer for them.
      if (!seat.childSeatIds.includes(targetSeatId)) {
        return fail('A branch reading is requested from a direct branch of this seat, one level down. That seat is not one of them.', 'targetSeatId');
      }
      if (!dutiesForSeat(target).length) {
        return fail('That seat declares no duty line, so there is no register for it to read from.', 'targetSeatId');
      }
      const note = String(input.note || '').trim().slice(0, BRANCH_READING_LIMITS.noteChars);
      if (note.length < BRANCH_READING_LIMITS.minWords) {
        return fail('Say why you need the reading. The branch leader is being asked to disclose something about their own people; a blank ask gives them nothing to weigh.', 'note');
      }
      const existing = asks().filter((a) => a && a.status === 'open' && a.askedBySeatId === seat.id && a.targetSeatId === targetSeatId);
      if (existing.length) {
        return fail(`This branch already carries your open request from ${existing[0].askedOn}. Withdraw it before asking again — a second ask is a duplicate, not a reminder.`, 'targetSeatId');
      }
      if (asks().length >= BRANCH_READING_LIMITS.askCap) {
        return fail(`The ask ledger is at its declared cap of ${BRANCH_READING_LIMITS.askCap} rows. Withdraw an old ask before adding another.`);
      }

      const at = clock();
      const today = dayKey(at);
      const askId = idFactory('branchask');
      store.update((draft) => {
        draft.branchReadingAsks = Array.isArray(draft.branchReadingAsks) ? draft.branchReadingAsks : [];
        draft.branchReadingAsks.unshift({
          id: askId,
          targetSeatId,
          askedBySeatId: seat.id,
          askedOn: today,
          askedAt: at.toISOString(),
          note,
          status: 'open',
          withdrawnOn: null,
          withdrawnAt: null,
          withdrawReason: '',
          version: BRANCH_READING_ENGINE_VERSION,
        });
        ensureEntityLink(draft, {
          sourceType: 'branchask',
          sourceId: askId,
          targetType: 'person',
          targetId: targetSeatId,
          relation: BRANCH_READING_RELATIONS.ASKS,
          ruleId: '',
          summary: `A reading of the ${target.label} branch was requested of its own leader on ${today}.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        // The ask climbs the spans above the ASKER in the same transaction: a
        // chief's question about a branch is a fact their own chain carries.
        for (const ancestor of ancestorsAbove(built, seat.id)) {
          ensureEntityLink(draft, {
            sourceType: 'branchask', sourceId: askId, targetType: 'person', targetId: ancestor,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The branch reading request rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        }
      }, {
        type: BRANCH_READING_EVENTS.REQUEST,
        entity: 'branchask',
        entityId: askId,
        summary: `Branch reading requested: ${seat.label} asked the ${target.label} branch for its own reading. No figure is requested or disclosed; the answer is a band and the leader’s words. Note: ${note.slice(0, 120)}`.slice(0, 300),
      });
      return saved({ id: askId, targetSeatId, askedOn: today });
    },

    /** Take the question back. Append-only, with the reason recorded. */
    branchReadingWithdraw(input = {}) {
      const check = seatFor('request-branch-reading');
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveAsk(input.id);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { ask } = resolved;
      if (ask.askedBySeatId !== seat.id && !seat.fullAccess) {
        return fail('Only the seat that asked for this reading — or the full-access operator — may withdraw the ask.');
      }
      if (ask.status !== 'open') return fail('That request is already withdrawn.');
      if (activeAnswerForAsk(readings(), ask.id)) {
        return fail('That request has been answered. A withdrawal would erase an answer someone gave; revoke the reading instead.');
      }
      const reason = String(input.reason || '').trim().slice(0, BRANCH_READING_LIMITS.reasonChars);
      if (reason.length < BRANCH_READING_LIMITS.minReasonWords) {
        return fail('Record why the question no longer stands. The branch leader is still holding it otherwise.', 'reason');
      }
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.branchReadingAsks || []).find((a) => a && a.id === ask.id);
        if (!live) return;
        live.status = 'withdrawn';
        live.withdrawnOn = today;
        live.withdrawnAt = at.toISOString();
        live.withdrawReason = reason;
      }, {
        type: BRANCH_READING_EVENTS.WITHDRAW,
        entity: 'branchask',
        entityId: ask.id,
        summary: `Branch reading request withdrawn (asked ${ask.askedOn}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id: ask.id, withdrawnOn: today });
    },

    /**
     * Publish the branch's own reading. The band is computed HERE from the
     * acting seat's own register and frozen with the day; `input.band` is
     * ignored on purpose, so no field in any form can set a reassuring band.
     */
    branchReadingPublish(input = {}) {
      const check = seatFor('answer-branch-reading');
      if (!check.ok) return check;
      const { seat, built } = check;
      const resolved = resolveAsk(input.id);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { ask } = resolved;
      if (seat.fullAccess) return fail(BRANCH_READING_REFUSALS.operatorView);
      const verdict = answerable(seat, ask);
      if (!verdict.ok) return fail(verdict.error);
      const note = String(input.note || '').trim().slice(0, BRANCH_READING_LIMITS.noteChars);
      if (note.length < BRANCH_READING_LIMITS.minWords) {
        return fail('Put the reading in your own words. A band alone is a tick; the chief is being handed a statement about your branch and needs to know what it means.', 'note');
      }
      const derived = deriveOwnBand();
      if (!derived || !derived.band) {
        return fail('This seat’s register could not be read, so no band can be derived. A band nobody computed is an invented reading.');
      }
      const at = clock();
      const today = dayKey(at);
      const readingId = idFactory('branchreading');
      const target = built.byId.get(ask.targetSeatId);
      store.update((draft) => {
        draft.branchReadings = Array.isArray(draft.branchReadings) ? draft.branchReadings : [];
        draft.branchReadings.unshift({
          id: readingId,
          askId: ask.id,
          branchSeatId: ask.targetSeatId,
          answeredBySeatId: seat.id,
          answer: 'published',
          // The whole disclosure: the DERIVED band, frozen today. No count is
          // stored here, so no count can leave the branch through this row.
          band: derived.band,
          note,
          answeredOn: today,
          answeredAt: at.toISOString(),
          status: 'active',
          revokedOn: null,
          revokedAt: null,
          revokeReason: '',
          version: BRANCH_READING_ENGINE_VERSION,
        });
        ensureEntityLink(draft, {
          sourceType: 'branchreading',
          sourceId: readingId,
          targetType: 'branchask',
          targetId: ask.id,
          relation: BRANCH_READING_RELATIONS.ANSWERS,
          ruleId: '',
          summary: `The ${target?.label || 'branch'} branch published its own reading (${derived.band}) on ${today}.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        for (const ancestor of ancestorsAbove(built, seat.id)) {
          ensureEntityLink(draft, {
            sourceType: 'branchreading', sourceId: readingId, targetType: 'person', targetId: ancestor,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The published branch reading rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        }
      }, {
        type: BRANCH_READING_EVENTS.PUBLISH,
        entity: 'branchreading',
        entityId: readingId,
        summary: `Branch reading published: the ${target?.label || 'branch'} branch answered a request made ${ask.askedOn} with band “${derived.band}” on ${today}. The counts behind the band stay in the branch’s own register.`.slice(0, 300),
      });
      return saved({ id: readingId, askId: ask.id, band: derived.band, answeredOn: today });
    },

    /** Refuse the request, in words. A legitimate answer; opens no decision. */
    branchReadingDecline(input = {}) {
      const check = seatFor('answer-branch-reading');
      if (!check.ok) return check;
      const { seat, built } = check;
      const resolved = resolveAsk(input.id);
      if (!resolved.ok) return fail(resolved.error, resolved.field);
      const { ask } = resolved;
      if (seat.fullAccess) return fail(BRANCH_READING_REFUSALS.operatorView);
      const verdict = answerable(seat, ask);
      if (!verdict.ok) return fail(verdict.error);
      const reason = String(input.reason || '').trim().slice(0, BRANCH_READING_LIMITS.reasonChars);
      if (reason.length < BRANCH_READING_LIMITS.minReasonWords) {
        return fail('Give the refusal words. A decline is printed to the requesting seat verbatim, and “no” with no reason is the silence this hand-off exists to replace.', 'reason');
      }
      const at = clock();
      const today = dayKey(at);
      const readingId = idFactory('branchreading');
      const target = built.byId.get(ask.targetSeatId);
      store.update((draft) => {
        draft.branchReadings = Array.isArray(draft.branchReadings) ? draft.branchReadings : [];
        draft.branchReadings.unshift({
          id: readingId,
          askId: ask.id,
          branchSeatId: ask.targetSeatId,
          answeredBySeatId: seat.id,
          answer: 'declined',
          band: null,
          note: reason,
          answeredOn: today,
          answeredAt: at.toISOString(),
          status: 'active',
          revokedOn: null,
          revokedAt: null,
          revokeReason: '',
          version: BRANCH_READING_ENGINE_VERSION,
        });
        ensureEntityLink(draft, {
          sourceType: 'branchreading',
          sourceId: readingId,
          targetType: 'branchask',
          targetId: ask.id,
          relation: BRANCH_READING_RELATIONS.ANSWERS,
          ruleId: '',
          summary: `The ${target?.label || 'branch'} branch declined to publish a reading on ${today}, with its reason recorded.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        for (const ancestor of ancestorsAbove(built, seat.id)) {
          ensureEntityLink(draft, {
            sourceType: 'branchreading', sourceId: readingId, targetType: 'person', targetId: ancestor,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The declined branch reading rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        }
      }, {
        type: BRANCH_READING_EVENTS.DECLINE,
        entity: 'branchreading',
        entityId: readingId,
        summary: `Branch reading declined: the ${target?.label || 'branch'} branch refused the request made ${ask.askedOn}, with a reason recorded. No decision was opened — a refusal is an answer.`.slice(0, 300),
      });
      return saved({ id: readingId, askId: ask.id, answer: 'declined', answeredOn: today });
    },

    /** Withdraw a published reading. Append-only; the cell falls back to asked. */
    branchReadingRevoke(input = {}) {
      const check = seatFor('answer-branch-reading');
      if (!check.ok) return check;
      const { seat } = check;
      const readingId = String(input.readingId || input.id || '').trim();
      const row = readings().find((r) => r && r.id === readingId);
      if (!row) return fail('That branch reading no longer exists.');
      if (row.answeredBySeatId !== seat.id && !seat.fullAccess) {
        return fail('Only the seat that published this reading — or the full-access operator — may revoke it.');
      }
      if (row.status !== 'active') return fail('That reading is already revoked.');
      const reason = String(input.reason || '').trim().slice(0, BRANCH_READING_LIMITS.reasonChars);
      if (reason.length < BRANCH_READING_LIMITS.minReasonWords) {
        return fail('Record why the reading no longer stands — the requesting seat is reading it as the branch’s condition.', 'reason');
      }
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.branchReadings || []).find((r) => r && r.id === row.id);
        if (!live) return;
        live.status = 'revoked';
        live.revokedOn = today;
        live.revokedAt = at.toISOString();
        live.revokeReason = reason;
      }, {
        type: BRANCH_READING_EVENTS.REVOKE,
        entity: 'branchreading',
        entityId: row.id,
        summary: `Branch reading revoked (${row.answer}${row.band ? `, ${row.band}` : ''}, answered ${row.answeredOn}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id: row.id, revokedOn: today });
    },
  };
}

/** Re-exported so the register and the gateway can normalise without a second import site. */
export { normalizeBranchReadingAsks, normalizeBranchReadings };
