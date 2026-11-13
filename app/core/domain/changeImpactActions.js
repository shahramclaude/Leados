/**
 * app/core/domain/changeImpactActions.js — dated request and first-person
 * response commands for Matrix Change-Impact Line Review (ADR-0185).
 *
 * No generic Changes route is widened: every read is compiled under the active
 * seat, requests are limited to people in the seat's tree or declared Matrix
 * line, and a response must come from the manager named on that frozen line.
 */

import { dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { isChangeOpen } from './changes.js';
import { canonicalJson } from './sealCrypto.js';
import { changeImpactDay } from './changeImpactSchema.js';
import {
  buildChangeImpactReviewReport,
  changeImpactBriefText,
  changeImpactCsvRows,
  changeImpactSnapshot,
} from './changeImpact.js';
import { CHANGE_IMPACT_EVENTS, CHANGE_IMPACT_LIMITS, CHANGE_IMPACT_RIGHTS } from './changeImpactRegistry.js';

const MIN_TEXT = CHANGE_IMPACT_LIMITS.reasonMin;

export function createChangeImpactActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before requesting or responding to a line review.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built, at, settings: cfg };
  }

  const changes = () => (Array.isArray(store.state.changes) ? store.state.changes : []);
  const requests = () => (Array.isArray(store.state.changeImpactRequests) ? store.state.changeImpactRequests : []);
  const responses = () => (Array.isArray(store.state.changeImpactResponses) ? store.state.changeImpactResponses : []);

  function reaches(seat, personId) {
    return Boolean(seat.fullAccess || seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId));
  }

  function latestFor(changeId, personId, lineKey) {
    return requests()
      .filter((row) => row.changeId === changeId && row.personId === personId && row.lineKey === lineKey)
      .sort((a, b) => String(b.requestedOn || '').localeCompare(String(a.requestedOn || ''))
        || String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''))
        || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
  }

  function activeResponse(requestId) {
    return responses().find((row) => row.requestId === requestId) || null;
  }

  function alreadyCurrent(snapshot, prior, today) {
    if (!prior || canonicalJson(prior.snapshot) !== canonicalJson(snapshot)) return false;
    const response = activeResponse(prior.id);
    if (!response) return today <= prior.dueOn;
    if (response.outcome === 'declined') return false;
    return Boolean(response.validThrough && today <= response.validThrough);
  }

  function reportForSeat(seat, at, cfg) {
    return buildChangeImpactReviewReport(store.state, {
      now: at,
      settings: cfg,
      seat,
    });
  }

  return {
    /* ---------------------------------------------------------------- reads */

    changeImpactReviewBoard() {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: reportForSeat(check.seat, check.at, check.settings) };
    },

    changeImpactReviewCandidates() {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, candidates: report.candidates };
    },

    changeImpactReviewBriefText() {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, text: changeImpactBriefText(report), report };
    },

    changeImpactReviewCsvRows() {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, rows: changeImpactCsvRows(report) };
    },

    changeImpactReviewAttentionCount() {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, count: report.totals.attentionN };
    },

    /* --------------------------------------------------------------- writes */

    changeImpactReviewRequest(input = {}) {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.REQUEST);
      if (!check.ok) return check;
      const { seat, at } = check;
      const changeId = String(input.changeId || '').trim();
      const personId = String(input.personId || '').trim();
      const change = changes().find((row) => row && row.id === changeId) || null;
      if (!change) return fail('That change no longer exists.', 'changeId');
      if (!isChangeOpen(change)) {
        return fail('A line-review request can only be issued for an open change (proposed, active or stabilising).', 'changeId');
      }
      if (seat.id === personId) {
        return fail('A person cannot request line review for their own change impact. Ask a manager who reaches the person.', 'personId');
      }
      if (!reaches(seat, personId)) {
        return fail('That impacted person is outside your reporting span and declared Matrix lines. A request cannot cross into a peer span.', 'personId');
      }
      const impact = (Array.isArray(change.impacts) ? change.impacts : [])
        .find((row) => row && row.personId === personId) || null;
      if (!impact) return fail('That change does not have a current impact row for this person.', 'personId');
      const matrix = buildMatrix(store.state, { now: at, settings: check.settings });
      const frozen = changeImpactSnapshot(store.state, change, impact, matrix);
      if (!frozen.ok) return fail(frozen.reason, 'personId');

      const today = dayKey(at);
      const dueOn = changeImpactDay(input.dueOn);
      if (!dueOn) return fail('Choose an explicit request due date. LeadOS never invents a deadline.', 'dueOn');
      const dueDays = daysBetween(today, dueOn);
      const [minDue, maxDue] = CHANGE_IMPACT_LIMITS.requestDueDays;
      if (dueDays === null || dueDays < minDue || dueDays > maxDue) {
        return fail(`The due date must be from today through ${maxDue} days from today.`, 'dueOn');
      }
      const prompt = typeof input.prompt === 'string'
        ? input.prompt.trim().slice(0, CHANGE_IMPACT_LIMITS.promptMax)
        : '';
      const requestedLineKey = String(input.lineKey || '').trim();
      const targetLines = requestedLineKey
        ? frozen.lines.filter((line) => line.lineKey === requestedLineKey)
        : frozen.lines.filter((line) => seat.fullAccess || line.managerId !== seat.id);
      if (requestedLineKey && !targetLines.length) {
        return fail('That line is not in the current frozen Matrix line set for this impact.', 'lineKey');
      }
      if (requestedLineKey && !seat.fullAccess && targetLines[0]?.managerId === seat.id) {
        return fail('A line holder cannot request another seat to review their own line. Select a different active line.', 'lineKey');
      }
      if (!targetLines.length) {
        return fail('There is no other active line to ask. The line holder cannot ask another seat to answer for their own line.', 'personId');
      }

      const toCreate = [];
      let skippedN = 0;
      for (const line of targetLines) {
        if (!seat.fullAccess && line.managerId === seat.id) {
          skippedN += 1;
          continue;
        }
        const prior = latestFor(change.id, personId, line.lineKey);
        if (alreadyCurrent(frozen.snapshot, prior, today)) {
          skippedN += 1;
          continue;
        }
        toCreate.push(line);
      }
      if (!toCreate.length) {
        return fail('Every selected line already has an unanswered request inside its due window or a still-valid reviewed response. No duplicate request was added.');
      }
      if (requests().length + toCreate.length > CHANGE_IMPACT_LIMITS.requests) {
        return fail(`The dated request ledger reached its ${CHANGE_IMPACT_LIMITS.requests}-row cap. Export the workspace before adding another request.`);
      }

      const created = toCreate.map((line) => ({
        id: idFactory('cir'),
        changeId: change.id,
        personId,
        lineKey: line.lineKey,
        managerId: line.managerId,
        requestedOn: today,
        requestedAt: at.toISOString(),
        requestedBySeatId: seat.fullAccess ? '__operator__' : seat.id,
        dueOn,
        prompt,
        snapshot: JSON.parse(JSON.stringify(frozen.snapshot)),
      }));
      store.update((draft) => {
        draft.changeImpactRequests = Array.isArray(draft.changeImpactRequests) ? draft.changeImpactRequests : [];
        draft.changeImpactRequests.push(...created);
      }, {
        type: CHANGE_IMPACT_EVENTS.REQUESTED,
        entity: 'change',
        entityId: change.id,
        summary: `Matrix line-impact review requested for ${created.length} line(s), due ${dueOn}.`,
      });
      return saved({
        requestIds: created.map((row) => row.id),
        requestedN: created.length,
        skippedN,
        changeId: change.id,
        personId,
        dueOn,
      });
    },

    changeImpactReviewRespond(input = {}) {
      const check = seatFor(CHANGE_IMPACT_RIGHTS.RESPOND);
      if (!check.ok) return check;
      const { seat, at } = check;
      const requestId = String(input.requestId || '').trim();
      const request = requests().find((row) => row && row.id === requestId) || null;
      if (!request) return fail('That dated line-review request no longer exists.', 'requestId');
      const change = changes().find((row) => row && row.id === request.changeId) || null;
      if (!isChangeOpen(change)) {
        return fail('The change is closed. The existing request stays as history; no new response can be counted as current.', 'requestId');
      }
      if (seat.fullAccess) {
        return fail('A workspace operator is not a first-person line holder. Select the active seat named on this Matrix line before responding.', 'requestId');
      }
      if (seat.id !== request.managerId) {
        return fail('Only the manager named on this requested line can respond. A peer or the impacted person cannot answer for somebody else’s line.', 'requestId');
      }
      const latest = latestFor(request.changeId, request.personId, request.lineKey);
      if (latest?.id !== request.id) {
        return fail('This request has been superseded by a later request for the same change impact and line. Its history remains, but only the latest request can be answered.', 'requestId');
      }
      if (activeResponse(request.id)) {
        return fail('This line request already has its one dated response. It is append-only; issue a new request when a refresh is due.', 'requestId');
      }

      const matrix = buildMatrix(store.state, { now: at, settings: check.settings });
      const current = changeImpactSnapshot(store.state, change,
        (Array.isArray(change.impacts) ? change.impacts : []).find((impact) => impact?.id === request.snapshot?.impact?.id && impact.personId === request.personId),
        matrix);
      if (!current.ok || canonicalJson(current.snapshot) !== canonicalJson(request.snapshot)) {
        return fail(current.ok
          ? 'The material change, impact detail or active Matrix line set changed after this request. The response would be stale; issue a new request against the current snapshot.'
          : `${current.reason} The response would be unverifiable; resolve the line state and issue a fresh request.`, 'requestId');
      }
      const targetLine = current.lines.find((line) => line.lineKey === request.lineKey);
      if (!targetLine || targetLine.managerId !== request.managerId) {
        return fail('The requested line no longer resolves to this manager. The old request remains history; no response was recorded.', 'requestId');
      }

      const outcome = input.outcome === 'declined' ? 'declined' : input.outcome === 'reviewed' ? 'reviewed' : null;
      if (!outcome) return fail('Choose “reviewed” or “declined”; an empty answer is not a line response.', 'outcome');
      const today = dayKey(at);
      let validThrough = null;
      let basis = '';
      let reason = '';
      if (outcome === 'reviewed') {
        validThrough = changeImpactDay(input.validThrough);
        if (!validThrough) return fail('Choose an explicit valid-through date for this review. LeadOS never invents an expiry.', 'validThrough');
        const termDays = daysBetween(today, validThrough);
        const [minTerm, maxTerm] = CHANGE_IMPACT_LIMITS.responseTermDays;
        if (termDays === null || termDays < minTerm || termDays > maxTerm) {
          return fail(`The response must be valid from tomorrow through ${maxTerm} days from today.`, 'validThrough');
        }
        basis = String(input.basis || '').trim().slice(0, CHANGE_IMPACT_LIMITS.reasonMax);
        if (basis.length < MIN_TEXT) return fail(`Record what this line reviewed (at least ${MIN_TEXT} characters).`, 'basis');
      } else {
        reason = String(input.reason || '').trim().slice(0, CHANGE_IMPACT_LIMITS.reasonMax);
        if (reason.length < MIN_TEXT) return fail(`State why this line declines to review (at least ${MIN_TEXT} characters).`, 'reason');
      }
      if (responses().length >= CHANGE_IMPACT_LIMITS.responses) {
        return fail(`The dated response ledger reached its ${CHANGE_IMPACT_LIMITS.responses}-row cap. Export the workspace before adding another response.`);
      }

      const response = {
        id: idFactory('cir-res'),
        requestId: request.id,
        changeId: request.changeId,
        personId: request.personId,
        lineKey: request.lineKey,
        managerId: request.managerId,
        outcome,
        respondedOn: today,
        respondedAt: at.toISOString(),
        responderSeatId: seat.id,
        via: 'seat',
        validThrough,
        basis,
        reason,
      };
      store.update((draft) => {
        draft.changeImpactResponses = Array.isArray(draft.changeImpactResponses) ? draft.changeImpactResponses : [];
        draft.changeImpactResponses.push(response);
      }, {
        type: CHANGE_IMPACT_EVENTS.RESPONDED,
        entity: 'change',
        entityId: request.changeId,
        summary: `A Matrix line-impact review response was recorded (${outcome}).`,
      });
      return saved({
        id: response.id,
        requestId: request.id,
        changeId: request.changeId,
        personId: request.personId,
        lineKey: request.lineKey,
        outcome,
        respondedOn: today,
        validThrough,
        late: today > request.dueOn,
      });
    },
  };
}
