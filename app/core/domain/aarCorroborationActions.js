/**
 * app/core/domain/aarCorroborationActions.js — dated request, first-person
 * answer and line-adoption commands for Cross-Line After-Action Corroboration &
 * Lesson-Adoption Parity (ADR-0188, Schema v149).
 *
 * No generic Learning route is widened: every read is compiled under the active
 * seat, a request is limited to holders the seat reaches, an answer must come
 * from the manager named on the requested line, and an adoption must come from
 * the holder of a line the lesson actually touches. Nothing here edits a review.
 */

import { dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { canonicalJson } from './sealCrypto.js';
import { aarCorroborationDay } from './aarCorroborationSchema.js';
import {
  aarCorroborationSnapshot,
  aarCorroborationBriefText,
  aarCorroborationCsvRows,
  buildAarCorroborationReport,
} from './aarCorroboration.js';
import {
  AAR_CORROBORATION_EVENTS,
  AAR_CORROBORATION_LIMITS,
  AAR_CORROBORATION_OUTCOME_KEYS,
  AAR_CORROBORATION_RIGHTS,
} from './aarCorroborationRegistry.js';

const MIN_TEXT = AAR_CORROBORATION_LIMITS.reasonMin;

export function createAarCorroborationActions(store, { now, idFactory }) {
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
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before requesting, answering or adopting.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built, at, settings: cfg };
  }

  const retros = () => (Array.isArray(store.state.retros) ? store.state.retros : []);
  const requests = () => (Array.isArray(store.state.aarCorroborationRequests) ? store.state.aarCorroborationRequests : []);
  const responses = () => (Array.isArray(store.state.aarCorroborationResponses) ? store.state.aarCorroborationResponses : []);
  const adoptions = () => (Array.isArray(store.state.aarAdoptions) ? store.state.aarAdoptions : []);

  function reaches(seat, personId) {
    return Boolean(seat.fullAccess || seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId));
  }

  function latestFor(reviewId, lessonId, holderId) {
    return requests()
      .filter((row) => row.reviewId === reviewId
        && (row.lessonId || null) === (lessonId || null)
        && row.holderId === holderId)
      .sort((a, b) => String(b.requestedOn || '').localeCompare(String(a.requestedOn || ''))
        || String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''))
        || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
  }

  function answerFor(requestId) {
    return responses().find((row) => row.requestId === requestId) || null;
  }

  function reportForSeat(seat, at, cfg) {
    return buildAarCorroborationReport(store.state, { now: at, settings: cfg, seat });
  }

  /** The live line holders of a held review, read from the ONE matrix engine. */
  function liveHolders(at, cfg, retro) {
    const matrix = buildMatrix(store.state, { now: at, settings: cfg });
    const frozen = aarCorroborationSnapshot(store.state, retro, { matrix });
    return { matrix, frozen };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    aarCorroborationReport() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: reportForSeat(check.seat, check.at, check.settings) };
    },

    aarCorroborationBriefText() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, text: aarCorroborationBriefText(report), report };
    },

    aarCorroborationCsvRows() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, rows: aarCorroborationCsvRows(report) };
    },

    aarCorroborationAttentionCount() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.READ);
      if (!check.ok) return check;
      const report = reportForSeat(check.seat, check.at, check.settings);
      return { ok: true, count: report.totals.attentionN };
    },

    /**
     * The holders this seat may ask, for one held review. A holder the seat
     * itself occupies is excluded: a line cannot be asked to corroborate its own
     * account.
     */
    aarCorroborationCandidates() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.REQUEST);
      if (!check.ok) return check;
      const { seat, at, settings: cfg } = check;
      const out = [];
      for (const retro of retros()) {
        if (!retro || retro.status !== 'held') continue;
        const participantIds = Array.isArray(retro.participants) ? retro.participants : [];
        if (!participantIds.some((personId) => reaches(seat, personId))) continue;
        const { frozen } = liveHolders(at, cfg, retro);
        if (!frozen.ok) {
          out.push({
            reviewId: retro.id,
            subjectLabel: retro.subjectLabel,
            heldOn: retro.heldOn,
            ok: false,
            reason: frozen.reason,
            holders: [],
          });
          continue;
        }
        const byHolder = new Map();
        for (const line of frozen.lines) {
          if (!byHolder.has(line.managerId)) {
            byHolder.set(line.managerId, { holderId: line.managerId, holderName: line.managerName, people: new Set(), kinds: new Set() });
          }
          byHolder.get(line.managerId).people.add(line.personId);
          if (line.kind) byHolder.get(line.managerId).kinds.add(line.kind);
        }
        const holders = [...byHolder.values()]
          .map((row) => {
            const request = latestFor(retro.id, null, row.holderId);
            const answer = request ? answerFor(request.id) : null;
            return {
              holderId: row.holderId,
              holderName: row.holderName,
              personN: row.people.size,
              kinds: [...row.kinds].sort(),
              requestId: request?.id || null,
              dueOn: request?.dueOn || null,
              answered: Boolean(answer),
              self: !seat.fullAccess && seat.id === row.holderId,
              reachable: seat.fullAccess || reaches(seat, row.holderId) || [...row.people].some((personId) => reaches(seat, personId)),
            };
          })
          .filter((row) => row.reachable && !row.self)
          .sort((a, b) => a.holderId.localeCompare(b.holderId));
        const lessons = (Array.isArray(retro.lessons) ? retro.lessons : []).map((lesson) => ({
          lessonId: lesson.id,
          text: String(lesson.text || '').slice(0, 600),
          class: lesson.class,
          state: lesson.state,
        }));
        out.push({
          reviewId: retro.id,
          subjectLabel: retro.subjectLabel,
          heldOn: retro.heldOn,
          ok: true,
          reason: null,
          holders,
          lessons,
          requestableN: holders.filter((row) => !row.answered).length,
        });
      }
      return { ok: true, candidates: out };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * Ask ONE line holder, or every holder the seat may ask, to answer for a
     * held review. The due date is always the human's; LeadOS never invents one.
     */
    aarCorroborationRequest(input = {}) {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.REQUEST);
      if (!check.ok) return check;
      const { seat, at, settings: cfg } = check;
      const reviewId = String(input.reviewId || '').trim();
      const retro = retros().find((row) => row && row.id === reviewId) || null;
      if (!retro) return fail('That after-action review no longer exists in this workspace.', 'reviewId');
      if (retro.status !== 'held') {
        return fail('Only a held review can be corroborated; a draft or a skipped review has no account to answer for.', 'reviewId');
      }
      const lessonId = input.lessonId ? String(input.lessonId).trim() : null;
      if (lessonId && !(Array.isArray(retro.lessons) ? retro.lessons : []).some((lesson) => lesson?.id === lessonId)) {
        return fail('That lesson is not part of this review.', 'lessonId');
      }
      const participantIds = Array.isArray(retro.participants) ? retro.participants : [];
      if (!participantIds.some((personId) => reaches(seat, personId))) {
        return fail('That review sits outside your span and declared Matrix lines. A request cannot cross into a peer span.', 'reviewId');
      }
      const { frozen } = liveHolders(at, cfg, retro);
      if (!frozen.ok) {
        if (frozen.singleLine) {
          return fail('Every participant of this review sits on one active line. There is no second line to ask, and the register will not manufacture one.', 'reviewId');
        }
        return fail(frozen.reason, 'reviewId');
      }

      const today = dayKey(at);
      const dueOn = aarCorroborationDay(input.dueOn);
      if (!dueOn) return fail('Choose an explicit request due date. LeadOS never invents a deadline.', 'dueOn');
      const dueDays = daysBetween(today, dueOn);
      const [minDue, maxDue] = AAR_CORROBORATION_LIMITS.requestDueDays;
      if (dueDays === null || dueDays < minDue || dueDays > maxDue) {
        return fail(`The due date must be from today through ${maxDue} days from today.`, 'dueOn');
      }

      const byHolder = new Map();
      for (const line of frozen.lines) {
        if (!byHolder.has(line.managerId)) byHolder.set(line.managerId, { managerId: line.managerId, managerName: line.managerName, people: [] });
        byHolder.get(line.managerId).people.push(line.personId);
      }
      const requestedHolder = input.holderId ? String(input.holderId).trim() : null;
      const targets = requestedHolder
        ? [byHolder.get(requestedHolder)].filter(Boolean)
        : [...byHolder.values()];
      if (requestedHolder && !targets.length) {
        return fail('That manager does not hold a line over any participant of this review.', 'holderId');
      }
      if (!seat.fullAccess) {
        const askable = targets.filter((row) => row.managerId !== seat.id);
        if (!askable.length) {
          return fail('The only line this request could ask is one you hold. A line holder cannot ask themself to answer for their own account.', 'holderId');
        }
      }

      const prompt = typeof input.prompt === 'string'
        ? input.prompt.trim().slice(0, AAR_CORROBORATION_LIMITS.promptMax)
        : '';
      const toCreate = [];
      let skippedN = 0;
      for (const target of targets) {
        if (!seat.fullAccess && target.managerId === seat.id) { skippedN += 1; continue; }
        const prior = latestFor(retro.id, lessonId, target.managerId);
        if (prior) {
          const answer = answerFor(prior.id);
          const stillOpen = !answer && today <= prior.dueOn;
          const stillCurrent = answer && answer.validThrough && today <= answer.validThrough
            && canonicalJson(aarCorroborationSnapshot(store.state, retro, { matrix: buildMatrix(store.state, { now: at, settings: cfg }), lessonId, holderId: target.managerId }).snapshot || {}) === canonicalJson(prior.snapshot);
          if (stillOpen || stillCurrent) { skippedN += 1; continue; }
        }
        toCreate.push({ target, personId: [...new Set(target.people)].sort()[0] });
      }
      if (!toCreate.length) {
        return fail('Every selected holder already has a live request or a still-current answer. No duplicate request was added.');
      }
      if (requests().length + toCreate.length > AAR_CORROBORATION_LIMITS.requests) {
        return fail(`The dated request ledger reached its ${AAR_CORROBORATION_LIMITS.requests}-row cap. Export the workspace before adding another request.`);
      }

      const matrix = buildMatrix(store.state, { now: at, settings: cfg });
      const created = [];
      for (const { target, personId } of toCreate) {
        const snapshotResult = aarCorroborationSnapshot(store.state, retro, { matrix, lessonId, holderId: target.managerId });
        if (!snapshotResult.ok) {
          return fail(snapshotResult.reason, 'holderId');
        }
        created.push({
          id: idFactory('aac'),
          reviewId: retro.id,
          lessonId,
          personId,
          holderId: target.managerId,
          requestedOn: today,
          requestedAt: at.toISOString(),
          requestedBySeatId: seat.fullAccess ? '__operator__' : seat.id,
          dueOn,
          prompt,
          snapshot: JSON.parse(JSON.stringify(snapshotResult.snapshot)),
        });
      }
      store.update((draft) => {
        draft.aarCorroborationRequests = Array.isArray(draft.aarCorroborationRequests) ? draft.aarCorroborationRequests : [];
        draft.aarCorroborationRequests.push(...created);
      }, {
        type: AAR_CORROBORATION_EVENTS.REQUESTED,
        entity: 'learning',
        entityId: retro.id,
        summary: `Cross-line AAR corroboration requested from ${created.length} line holder(s), due ${dueOn}.`,
      });
      return saved({
        requestIds: created.map((row) => row.id),
        requestedN: created.length,
        skippedN,
        reviewId: retro.id,
        dueOn,
      });
    },

    /**
     * One first-person answer from the holder named on the request. Append-only:
     * a refresh is a new request against the current snapshot, never an edit.
     */
    aarCorroborationRespond(input = {}) {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.RESPOND);
      if (!check.ok) return check;
      const { seat, at, settings: cfg } = check;
      const requestId = String(input.requestId || '').trim();
      const request = requests().find((row) => row && row.id === requestId) || null;
      if (!request) return fail('That dated corroboration request no longer exists.', 'requestId');
      if (seat.fullAccess) {
        return fail('A workspace operator is not a first-person line holder. Select the active seat named on this line before answering.', 'requestId');
      }
      if (seat.id !== request.holderId) {
        return fail('Only the manager named on the requested line can answer. A peer, a reviewer or the person cannot answer for somebody else’s line.', 'requestId');
      }
      const latest = latestFor(request.reviewId, request.lessonId, request.holderId);
      if (latest?.id !== request.id) {
        return fail('A later request is the current obligation. This one stays as history and cannot be answered.', 'requestId');
      }
      if (answerFor(request.id)) {
        return fail('This request already has its one dated answer. It is append-only; issue a new request when a refresh is due.', 'requestId');
      }

      const retro = retros().find((row) => row && row.id === request.reviewId) || null;
      if (!retro || retro.status !== 'held') {
        return fail('The review is no longer held. The existing request stays as history; no answer can be counted as current.', 'requestId');
      }
      const matrix = buildMatrix(store.state, { now: at, settings: cfg });
      const live = aarCorroborationSnapshot(store.state, retro, {
        matrix,
        lessonId: request.lessonId || null,
        holderId: request.holderId,
      });
      if (!live.ok || canonicalJson(live.snapshot) !== canonicalJson(request.snapshot)) {
        return fail(live.ok
          ? 'The review’s account, its participants or their lines changed after this request. The answer would be stale; issue a new request against the current snapshot.'
          : `${live.reason} The answer would be unverifiable; resolve the line state and issue a fresh request.`, 'requestId');
      }

      const kind = input.kind === 'observation' ? 'observation' : 'corroboration';
      const outcome = AAR_CORROBORATION_OUTCOME_KEYS.includes(input.outcome) ? input.outcome : null;
      if (!outcome) return fail('Choose one of the four declared outcomes. An empty answer is not a corroboration.', 'outcome');
      const today = dayKey(at);
      const reason = String(input.reason || '').trim().slice(0, AAR_CORROBORATION_LIMITS.reasonMax);
      const note = String(input.note || '').trim().slice(0, AAR_CORROBORATION_LIMITS.noteMax);
      let validThrough = null;
      if (kind === 'corroboration') {
        validThrough = aarCorroborationDay(input.validThrough);
        if (!validThrough) return fail('Choose an explicit valid-through date for this answer. LeadOS never invents an expiry.', 'validThrough');
        const termDays = daysBetween(today, validThrough);
        const [minTerm, maxTerm] = AAR_CORROBORATION_LIMITS.responseTermDays;
        if (termDays === null || termDays < minTerm || termDays > maxTerm) {
          return fail(`The answer must be valid from tomorrow through ${maxTerm} days from today.`, 'validThrough');
        }
      }
      if ((outcome === 'disputed' || outcome === 'declined') && reason.length < MIN_TEXT) {
        return fail(`Record why (at least ${MIN_TEXT} characters). A dispute or a decline is a reasoned act, not a checkbox.`, 'reason');
      }
      if (outcome === 'partly' && note.length < MIN_TEXT) {
        return fail(`Say which half you support (at least ${MIN_TEXT} characters).`, 'note');
      }
      if (responses().length >= AAR_CORROBORATION_LIMITS.responses) {
        return fail(`The dated answer ledger reached its ${AAR_CORROBORATION_LIMITS.responses}-row cap. Export the workspace before adding another answer.`);
      }

      const response = {
        id: idFactory('aac-res'),
        requestId: request.id,
        reviewId: request.reviewId,
        lessonId: request.lessonId,
        personId: request.personId,
        holderId: request.holderId,
        kind,
        outcome,
        respondedOn: today,
        respondedAt: at.toISOString(),
        responderSeatId: seat.id,
        validThrough: kind === 'corroboration' ? validThrough : null,
        reason: (outcome === 'disputed' || outcome === 'declined') ? reason : '',
        note: (outcome === 'partly' || outcome === 'corroborated') ? note : '',
      };
      store.update((draft) => {
        draft.aarCorroborationResponses = Array.isArray(draft.aarCorroborationResponses) ? draft.aarCorroborationResponses : [];
        draft.aarCorroborationResponses.push(response);
      }, {
        type: AAR_CORROBORATION_EVENTS.RESPONDED,
        entity: 'learning',
        entityId: request.reviewId,
        summary: `A cross-line AAR corroboration answer was recorded (${kind}: ${outcome}).`,
      });
      return saved({
        id: response.id,
        requestId: request.id,
        reviewId: request.reviewId,
        holderId: request.holderId,
        kind,
        outcome,
        respondedOn: today,
        validThrough,
        late: today > request.dueOn,
      });
    },

    /**
     * A line's dated adoption of one lesson, or its reasoned refusal. This is a
     * statement about the LINE's accountability; it never rewrites the review's
     * own lesson state.
     */
    aarLessonAdopt(input = {}) {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.ADOPT);
      if (!check.ok) return check;
      const { seat, at, settings: cfg } = check;
      const reviewId = String(input.reviewId || '').trim();
      const lessonId = String(input.lessonId || '').trim();
      const retro = retros().find((row) => row && row.id === reviewId) || null;
      if (!retro) return fail('That after-action review no longer exists.', 'reviewId');
      const lesson = (Array.isArray(retro.lessons) ? retro.lessons : []).find((row) => row && row.id === lessonId) || null;
      if (!lesson) return fail('That lesson is not part of this review.', 'lessonId');
      if (seat.fullAccess) {
        return fail('A workspace operator is not a first-person line holder and cannot adopt on a line’s behalf.', 'reviewId');
      }

      const matrix = buildMatrix(store.state, { now: at, settings: cfg });
      const report = buildAarCorroborationReport(store.state, { now: at, settings: cfg, detailLevel: 'full' });
      const lessonRow = (report.lessons || []).find((row) => row.reviewId === reviewId && row.lessonId === lessonId) || null;
      if (!lessonRow) return fail('That lesson could not be read against the live line set.', 'lessonId');
      const holderRow = (lessonRow.lines || []).find((line) => line.managerId === seat.id) || null;
      if (!holderRow) {
        return fail('That line is not one this lesson touches, so adopting it here would be a claim about work your line does not carry.', 'lessonId');
      }
      const outcome = input.outcome === 'refused' ? 'refused' : input.outcome === 'adopted' ? 'adopted' : null;
      if (!outcome) return fail('Choose “adopted” or “refused”. An empty answer is not an adoption act.', 'outcome');
      const note = String(input.note || '').trim().slice(0, AAR_CORROBORATION_LIMITS.noteMax);
      if (note.length < MIN_TEXT) {
        return fail(`Record what your line changed, or why it will not adopt (at least ${MIN_TEXT} characters).`, 'note');
      }
      const adoptedOn = aarCorroborationDay(input.adoptedOn) || dayKey(at);
      const today = dayKey(at);
      if (adoptedOn > today) return fail('An adoption is dated today or earlier; LeadOS does not date a claim in the future.', 'adoptedOn');
      if (adoptions().length >= AAR_CORROBORATION_LIMITS.adoptions) {
        return fail(`The adoption ledger reached its ${AAR_CORROBORATION_LIMITS.adoptions}-row cap. Export the workspace before recording another adoption.`);
      }
      const already = adoptions().find((row) => row.reviewId === reviewId && row.lessonId === lessonId && row.holderId === seat.id) || null;
      if (already) {
        return fail('Your line already recorded an adoption act for this lesson. The record is append-only.', 'lessonId');
      }
      void matrix;

      const adoption = {
        id: idFactory('aac-adopt'),
        reviewId,
        lessonId,
        holderId: seat.id,
        outcome,
        adoptedOn,
        adoptedAt: at.toISOString(),
        adoptedBySeatId: seat.id,
        note,
      };
      store.update((draft) => {
        draft.aarAdoptions = Array.isArray(draft.aarAdoptions) ? draft.aarAdoptions : [];
        draft.aarAdoptions.push(adoption);
      }, {
        type: AAR_CORROBORATION_EVENTS.ADOPTED,
        entity: 'learning',
        entityId: reviewId,
        summary: `A line recorded a lesson adoption act (${outcome}).`,
      });
      return saved({ id: adoption.id, reviewId, lessonId, holderId: seat.id, outcome, adoptedOn });
    },

    /** Explicit retry of the shared-spine rule, for an operator whose commit was capped. */
    aarCorroborationScan() {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const { seat, at, settings: cfg } = check;
      const report = reportForSeat(seat, at, cfg);
      store.update((draft) => {
        // The event is what the rule listens for; the mutator itself changes no
        // record, so a scan is a pure read plus one governed event.
        void draft;
      }, {
        type: AAR_CORROBORATION_EVENTS.SCAN,
        entity: 'learning',
        entityId: 'workspace',
        summary: 'Cross-line AAR corroboration scan requested.',
      });
      return saved({ report });
    },

    aarCorroborationSetConventions(input = {}) {
      const check = seatFor(AAR_CORROBORATION_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const patch = {};
      const K = ['aarCorroborationDueDays', 'aarCorroborationMinLines', 'aarCorroborationAdoptWarnDays', 'aarCorroborationAutoPropagate'];
      for (const key of K) {
        if (input && Object.hasOwn(input, key)) patch[key] = input[key];
      }
      if (!Object.keys(patch).length) return fail('No declared corroboration convention was supplied.');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...patch };
      }, {
        type: AAR_CORROBORATION_EVENTS.CONVENTIONS,
        entity: 'learning',
        entityId: 'workspace',
        summary: 'Cross-line AAR corroboration conventions updated.',
      });
      return saved({ conventions: patch });
    },
  };
}
