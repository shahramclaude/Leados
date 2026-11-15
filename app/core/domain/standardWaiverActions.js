/**
 * app/core/domain/standardWaiverActions.js — the seat-checked commands of the
 * Temporary Standard Waiver Register (ADR-0212, Schema v166).
 *
 * FIVE human acts and nothing else: REQUEST a departure, ANSWER a request
 * (grant or refuse), DECIDE that the standard is back in force, REVOKE an
 * authority before its last day, and set the conventions. Plus the scan.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - The request is the OWNER's own act. Nobody asks for someone else's
 *    standard to be set aside on their behalf.
 *  - The answer belongs to the holder of the very line the routine is owed
 *    under. Not an ancestor, not a peer, not the person asking. Where that line
 *    has ended, or the owner is the workspace leader, the register refuses with
 *    the sentence that says nobody can authorise it rather than substituting a
 *    manager who no longer holds the line.
 *  - A grant may NARROW the window that was asked for and may never widen it.
 *    Authority is over what was asked and nothing more.
 *  - A renewal must continue a GRANTED waiver of the same routine owed by the
 *    same person and start no later than the day after it ends. A gap of two
 *    days is a new departure and must be asked for as one.
 *  - A closing decision is checkable: "the routine was retired" is refused
 *    unless the routine's own retirement is on the record on or before that
 *    day.
 *  - A window that starts in the past is refused. A waiver is a permission, not
 *    a pardon: authorising a departure that already happened would let a
 *    workspace paper over its own record.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildStandardWaivers,
  standardWaiverAttentionCount as countAttention,
  standardWaiverAuthority,
  standardWaiverBriefText,
  standardWaiverCsvRows,
  standardWaiverNameOf,
} from './standardWaiver.js';
import {
  STANDARD_WAIVER_BOUNDS,
  STANDARD_WAIVER_ENGINE_VERSION,
  STANDARD_WAIVER_EVENTS,
  STANDARD_WAIVER_KIND_KEYS,
  STANDARD_WAIVER_LIMITS,
  STANDARD_WAIVER_PANEL,
  STANDARD_WAIVER_RIGHTS,
  STANDARD_WAIVER_ROUTE,
  STANDARD_WAIVER_RULE_ID,
  STANDARD_WAIVER_SETTING_KEYS,
  STANDARD_WAIVER_SETTING_LABELS,
  STANDARD_WAIVER_DECISION_KEYS,
} from './standardWaiverRegistry.js';
import {
  closingDecision,
  firstAnswer,
  normalizeStandardWaiverSettings,
  standardWaiverDay,
  standardWaiverDaysBetween,
  standardWaiverWindowDays,
} from './standardWaiverSchema.js';

const L = STANDARD_WAIVER_LIMITS;

export function createStandardWaiverActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on standard waivers.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildStandardWaivers(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  function matrixNow(at, cfg) {
    try {
      return buildMatrix(store.state, { now: at, settings: { ...cfg, activeSeatId: null } });
    } catch {
      return null;
    }
  }

  const routineOf = (routineId) => rows('standardWorkRoutines').find((row) => row && row.id === routineId) || null;

  /** The request as the record stands, with its first answer and its decision. */
  function requestContext(requestId) {
    const request = rows('standardWaiverRequests').find((row) => row && row.id === requestId) || null;
    if (!request) return null;
    const answers = rows('standardWaiverGrants').filter((row) => row && row.requestId === requestId);
    const answer = firstAnswer(answers, requestId);
    const decision = closingDecision(rows('standardWaiverDecisions'), requestId);
    return { request, answers, answer, decision, grant: answer && answer.decision === 'granted' ? answer : null };
  }

  /** The holder of the line this routine is owed under, as the matrix reads today. */
  function authorityOf(check, routine) {
    const matrix = matrixNow(check.at, check.cfg);
    if (!matrix) {
      return {
        state: 'unresolved', managerId: null, lineId: null, lineLabel: '',
        says: 'The reporting graph could not be read, so no line holder can be named and no departure can be authorised.',
      };
    }
    return standardWaiverAuthority(matrix, routine);
  }

  /** The unit of the register: a routine must exist and must still be a standard. */
  function liveRoutine(routineId) {
    const routine = routineOf(routineId);
    if (!routine) return fail('No routine on the standard-work board has that id, so there is no written standard to depart from.', 'routineId');
    if (routine.retiredOn) return fail(`That routine was retired on ${routine.retiredOn}. There is no live standard to set aside; a departure from a retired routine is not a departure.`, 'routineId');
    return { ok: true, routine };
  }

  /**
   * Every granted window of one routine that still stands: not revoked, and not
   * closed by a restoration that ended it earlier. Two authorities whose windows
   * OVERLAP would leave one departure with two answerable authorisers, so the
   * door refuses the second one by name rather than printing both.
   */
  function liveWindows(routineId, today) {
    const requests = rows('standardWaiverRequests').filter((row) => row && row.routineId === routineId);
    const grants = rows('standardWaiverGrants');
    const decisions = rows('standardWaiverDecisions');
    const out = [];
    for (const request of requests) {
      const answer = firstAnswer(grants, request.id);
      if (!answer || answer.decision !== 'granted' || answer.revoked) continue;
      const decision = closingDecision(decisions, request.id);
      const end = decision && decision.kind === 'restored' && decision.decidedOn <= answer.to ? addDays(decision.decidedOn, -1) : answer.to;
      if (!end || end < answer.from) continue;
      out.push({ requestId: request.id, from: answer.from, to: end });
    }
    return out;
  }

  /** Is any granted authority covering `today` for this routine? */
  function coveredToday(routineId, today) {
    const requests = rows('standardWaiverRequests').filter((row) => row && row.routineId === routineId);
    const grants = rows('standardWaiverGrants');
    const decisions = rows('standardWaiverDecisions');
    for (const request of requests) {
      const answer = firstAnswer(grants, request.id);
      if (!answer || answer.decision !== 'granted' || answer.revoked) continue;
      if (!(answer.from <= today && today <= answer.to)) continue;
      const decision = closingDecision(decisions, request.id);
      if (decision && decision.kind === 'restored' && decision.decidedOn <= today) continue;
      return true;
    }
    return false;
  }

  /** The window a request or grant may name, or a refusal naming the field. */
  function readWindow({ from, to }, today, conv, requested = null, field = 'from') {
    const fromDay = standardWaiverDay(from);
    const toDay = standardWaiverDay(to);
    if (!fromDay || !toDay || toDay < fromDay) return fail('Name a first and a last day, with the last day on or after the first. A waiver is a bounded window, not an open-ended permission.', field);
    if (fromDay < today) return fail(`The window starts on ${fromDay}, before today. A waiver authorises a departure before it happens; one dated backwards is a pardon, not a permission.`, field);
    const days = standardWaiverWindowDays(fromDay, toDay);
    // The conventions object is keyed by its DECLARED setting names, not by
    // camelCase labels: reading `conv.maxDays` here silently compared the window
    // against `undefined` and let a two-month departure through. Caught by the
    // suite, fixed at the reader's own key.
    const maxDays = conv[STANDARD_WAIVER_SETTING_KEYS.maxDays];
    if (days > maxDays) return fail(`That window is ${days} day(s). The declared maximum is ${maxDays}; a departure that needs longer is a change of standard, and that is a different decision.`, field);
    if (requested) {
      if (fromDay < requested.from || toDay > requested.to) {
        return fail('A grant may narrow the window that was asked for; it may never widen it. Authority is granted over what was asked and nothing more.', field);
      }
    }
    return { ok: true, from: fromDay, to: toDay, days };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    standardWaiverReport() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    standardWaiverBriefText() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: standardWaiverBriefText(report), report };
    },

    standardWaiverCsvRows() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: standardWaiverCsvRows(read(check)) };
    },

    standardWaiverAttentionCount() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: countAttention(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * What this seat may do, from the record: the routines it owes a standard
     * for, the requests it may answer as line holder, and the ones it may close.
     * Every list is narrowed by the same authority the action re-proves.
     */
    standardWaiverCandidates() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.READ);
      if (!check.ok) return check;
      const conv = normalizeStandardWaiverSettings(check.cfg);
      const matrix = matrixNow(check.at, check.cfg);
      const nameOf = (personId) => standardWaiverNameOf(store.state, matrix, personId);
      const canRequest = canAct(STANDARD_WAIVER_RIGHTS.REQUEST, check.seat).allow === true;
      const canAnswer = canAct(STANDARD_WAIVER_RIGHTS.AUTHORISE, check.seat).allow === true;
      const canDecide = canAct(STANDARD_WAIVER_RIGHTS.DECIDE, check.seat).allow === true;
      const own = rows('standardWorkRoutines').filter((routine) => routine && routine.ownerId === check.actorId && !routine.retiredOn).map((routine) => {
        const authority = matrix
          ? standardWaiverAuthority(matrix, routine)
          : { state: 'unresolved', managerId: null, lineLabel: '', says: 'The reporting graph could not be read, so no line holder can be named.' };
        return {
          routineId: routine.id,
          title: routine.title,
          cadence: routine.cadence,
          kind: routine.kind,
          standard: routine.standard,
          lineKey: routine.lineKey,
          lineLabel: authority.lineLabel,
          authorityState: authority.state,
          authoritySays: authority.says,
          managerId: authority.managerId,
          managerName: authority.managerId ? nameOf(authority.managerId) : '—',
          canAsk: canRequest && ['seat', 'leader-holder'].includes(authority.state),
          coveredToday: coveredToday(routine.id, check.today),
        };
      });
      const requests = rows('standardWaiverRequests');
      const grants = rows('standardWaiverGrants');
      const decisions = rows('standardWaiverDecisions');
      const open = [];
      const closable = [];
      for (const request of requests) {
        const routine = routineOf(request.routineId);
        if (!routine) continue;
        const authority = matrix ? standardWaiverAuthority(matrix, routine) : null;
        const answer = firstAnswer(grants, request.id);
        const decision = closingDecision(decisions, request.id);
        const isHolder = Boolean(authority && authority.managerId && authority.managerId === check.actorId);
        if (!answer && isHolder && canAnswer) {
          open.push({
            requestId: request.id, routineId: routine.id, routineTitle: routine.title,
            ownerId: request.ownerId, ownerName: nameOf(request.ownerId),
            kind: request.kind, reason: request.reason, safeguard: request.safeguard,
            from: request.from, to: request.to, askedOn: standardWaiverDay(request.at),
            lineLabel: authority.lineLabel,
          });
        }
        const grantedAnswer = answer && answer.decision === 'granted' ? answer : null;
        const mine = request.ownerId === check.actorId || (grantedAnswer && grantedAnswer.authoriserId === check.actorId) || isHolder;
        if (grantedAnswer && !decision && mine && canDecide) {
          closable.push({
            requestId: request.id, routineId: routine.id, routineTitle: routine.title,
            ownerId: request.ownerId, ownerName: nameOf(request.ownerId),
            grantFrom: grantedAnswer.from, grantTo: grantedAnswer.to,
            authoriserId: grantedAnswer.authoriserId, authoriserName: nameOf(grantedAnswer.authoriserId),
            revoked: grantedAnswer.revoked,
            canRevoke: canAnswer && !grantedAnswer.revoked && check.today <= grantedAnswer.to,
            canDecide: !grantedAnswer.revoked && check.today >= grantedAnswer.from,
            routineRetiredOn: routine.retiredOn,
          });
        }
      }
      return {
        ok: true,
        today: check.today,
        actorId: check.actorId,
        actorName: nameOf(check.actorId),
        conv: {
          defaultDays: conv[STANDARD_WAIVER_SETTING_KEYS.defaultDays],
          maxDays: conv[STANDARD_WAIVER_SETTING_KEYS.maxDays],
          renewalReviewAfter: conv[STANDARD_WAIVER_SETTING_KEYS.renewalReviewAfter],
        },
        kinds: STANDARD_WAIVER_KIND_KEYS,
        decisionKinds: STANDARD_WAIVER_DECISION_KEYS,
        routines: own,
        awaitable: open,
        closable,
        renewalOptions: requests
          .filter((request) => {
            const answer = firstAnswer(grants, request.id);
            const decision = closingDecision(decisions, request.id);
            return answer && answer.decision === 'granted' && !answer.revoked && !decision
              && request.ownerId === check.actorId
              && addDays(answer.to, 1) >= check.today;
          })
          .map((request) => ({ requestId: request.id, routineId: request.routineId, endsOn: firstAnswer(grants, request.id).to })),
      };
    },

    /* ---------------------------------------------------------------- acts */

    standardWaiverRequest(input = {}) {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.REQUEST);
      if (!check.ok) return check;
      const conv = normalizeStandardWaiverSettings(check.cfg);
      const routineId = text(input.routineId, L.routineIdMax);
      const live = liveRoutine(routineId);
      if (!live.ok) return live;
      const routine = live.routine;
      // First person only. A manager who wants a departure is asking the owner
      // to ask for it, not writing the request in the owner's name.
      if (routine.ownerId !== check.actorId) {
        return fail('A waiver is requested by the person who owes the standard. Nobody can ask for someone else’s standard to be set aside on their behalf — ask them to record it.', 'routineId');
      }
      const kind = text(input.kind, 40);
      if (!STANDARD_WAIVER_KIND_KEYS.includes(kind)) return fail('Choose the kind of departure this is. The kind is counted, never inferred from your text.', 'kind');
      const reason = text(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) return fail(`Write why the standard cannot be done as written (at least ${L.reasonMin} characters). A departure is authorised by a reason a reader six months later can act on.`, 'reason');
      const safeguard = text(input.safeguard, L.safeguardMax);
      if (safeguard.length < L.safeguardMin) return fail(`Say what stands in for the standard while it is set aside (at least ${L.safeguardMin} characters). A departure with no safeguard is an unmonitored gap.`, 'safeguard');
      const window = readWindow(input, check.today, conv, null, 'from');
      if (!window.ok) return window;
      if (coveredToday(routineId, check.today)) {
        return fail('A live grant already covers today for this routine. Two live authorities for one departure would leave nobody answerable for it.', 'routineId');
      }
      const clash = liveWindows(routineId, check.today).find((live) => window.from <= live.to && live.from <= window.to);
      if (clash) {
        return fail(`A standing authority already covers ${clash.from}–${clash.to} for this routine. Two live authorities for one departure would leave nobody answerable for it: narrow this request to a window after ${clash.to}, or wait until that one ends.`, 'from');
      }
      const duplicate = rows('standardWaiverRequests').some((row) => row && row.routineId === routineId
        && row.ownerId === check.actorId && row.from === window.from && row.to === window.to);
      if (duplicate) return fail('An identical request for this routine is already on the record. Asking twice does not strengthen it.', 'from');
      if (rows('standardWaiverRequests').length >= L.requests) return fail('The register is at its declared cap. It is exported before more rows are written, because a register that silently drops a waiver is worse than one that refuses the next.', 'routineId');
      const renewal = text(input.renewsRequestId, L.idMax);
      let renewsRequestId = null;
      if (renewal) {
        const context = requestContext(renewal);
        if (!context) return fail('The request this would continue is not on the register.', 'renewsRequestId');
        if (!context.grant) return fail('A renewal must continue a request that was actually granted; this one was not.', 'renewsRequestId');
        if (context.request.routineId !== routineId || context.request.ownerId !== check.actorId) return fail('A renewal must continue a waiver of the same routine owed by the same person.', 'renewsRequestId');
        if (context.decision) return fail('That waiver already ended with a decision. A decision closes a chain; anything after it is a new departure, asked for as one.', 'renewsRequestId');
        const gap = standardWaiverDaysBetween(context.grant.to, window.from);
        if (gap === null || gap < 0 || gap > 1) {
          return fail(`A renewal must start no later than the day after the previous window ends (${context.grant.to}). A gap of two days means the standard was back in force — ask for a new departure instead.`, 'from');
        }
        renewsRequestId = renewal;
      }
      const at = clock();
      const id = idFactory('swq');
      store.update((draft) => {
        const list = Array.isArray(draft.standardWaiverRequests) ? draft.standardWaiverRequests : (draft.standardWaiverRequests = []);
        list.unshift({
          id,
          routineId,
          ownerId: check.actorId,
          kind,
          reason,
          safeguard,
          from: window.from,
          to: window.to,
          renewsRequestId,
          at: at.toISOString(),
          requestedOn: check.today,
        });
      }, {
        type: STANDARD_WAIVER_EVENTS.REQUESTED,
        entity: 'standardWaiver',
        entityId: id,
        summary: `Standard waiver requested for a ${routine.cadence} routine, ${window.from}–${window.to} (${kind}); awaiting the line holder.`.slice(0, 300),
      });
      return saved({ requestId: id, from: window.from, to: window.to });
    },

    /**
     * The line holder's answer. Granting writes the AUTHORITY: the window (never
     * wider than the request), the written basis, and — when it continues a
     * previous waiver — the link that makes the chain countable.
     */
    standardWaiverAnswer(input = {}) {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.AUTHORISE);
      if (!check.ok) return check;
      const conv = normalizeStandardWaiverSettings(check.cfg);
      const requestId = text(input.requestId, L.idMax);
      const context = requestContext(requestId);
      if (!context) return fail('No request with that id is on the register.', 'requestId');
      if (context.answer) return fail('The line holder has already granted or refused this request. One request, one answer.', 'requestId');
      const routine = routineOf(context.request.routineId);
      if (!routine) return fail('The routine this request names is no longer on the record.', 'requestId');
      const authority = authorityOf(check, routine);
      if (authority.state === 'no-authority' || authority.state === 'line-ended' || authority.state === 'line-unknown' || authority.state === 'owner-off-roster' || authority.state === 'unresolved') {
        return fail(`${authority.says} The request stays on the record unanswered, and the standard stays exactly as written.`, 'requestId');
      }
      // The requester's own answer is refused FIRST and by its own name: a
      // manager who owes the routine is the one person whose yes must never
      // count, whatever line they happen to hold.
      if (context.request.ownerId === check.actorId) {
        return fail('The acting seat is the person who owes the standard. A waiver authorised by the person it excuses is not an authorisation.', 'requestId');
      }
      if (authority.managerId !== check.actorId) {
        return fail('Only the holder of the line this routine is owed under may answer a request to depart from it. Nobody above or beside that line is substituted.', 'requestId');
      }
      const decision = text(input.decision, 20);
      if (decision !== 'granted' && decision !== 'refused') return fail('Answer with “granted” or “refused”.', 'decision');
      const basis = text(input.basis, L.basisMax);
      if (basis.length < L.basisMin) return fail(`Write the basis of this answer (at least ${L.basisMin} characters). An authorisation and a refusal are both decisions somebody will have to answer for.`, 'basis');
      let window = null;
      if (decision === 'granted') {
        const asked = { from: context.request.from, to: context.request.to };
        const narrowed = input.from || input.to
          ? { from: input.from || asked.from, to: input.to || asked.to }
          : asked;
        const read = readWindow(narrowed, check.today, conv, asked, 'from');
        if (!read.ok) return read;
        window = read;
        // One departure, one authority. A window that overlaps a standing grant
        // is refused by name, with the dates, rather than printed beside it.
        const clash = liveWindows(routine.id, check.today).find((live) => window.from <= live.to && live.from <= window.to);
        if (clash) {
          return fail(`Authority already stands for ${clash.from}–${clash.to} on this routine. Granting an overlapping window would leave one departure with two answerable authorisers; narrow this grant to start after ${clash.to}, or wait until that authority ends.`, 'from');
        }
        // A renewal link is an authority judgement: the authoriser confirms that
        // this window continues the previous one rather than restarting it.
        const renewalId = text(input.renewsRequestId, L.idMax) || text(context.request.renewsRequestId, L.idMax);
        if (renewalId) {
          const previous = requestContext(renewalId);
          if (!previous || !previous.grant) return fail('The waiver this would continue was never granted. A renewal cannot create authority out of nothing.', 'renewsRequestId');
          if (previous.request.routineId !== routine.id || previous.request.ownerId !== context.request.ownerId) return fail('A renewal must continue a waiver of the SAME routine owed by the SAME person.', 'renewsRequestId');
          if (previous.decision) return fail('That waiver already ended with a decision. A decision closes a chain; anything after it is a new departure.', 'renewsRequestId');
          const gap = standardWaiverDaysBetween(previous.grant.to, window.from);
          if (gap === null || gap < 0 || gap > 1) {
            return fail(`A renewal must start no later than the day after the previous window ends (${previous.grant.to}). A gap of two days means the standard was back in force: that is a new departure.`, 'from');
          }
          context.renewalOf = renewalId;
        }
      }
      const at = clock();
      const id = idFactory('swg');
      store.update((draft) => {
        const list = Array.isArray(draft.standardWaiverGrants) ? draft.standardWaiverGrants : (draft.standardWaiverGrants = []);
        list.push({
          id,
          requestId,
          authoriserId: check.actorId,
          decision,
          basis,
          from: window ? window.from : null,
          to: window ? window.to : null,
          renewedFrom: decision === 'granted' ? (context.renewalOf || null) : null,
          at: at.toISOString(),
          answeredOn: check.today,
          revoked: false,
          revokedOn: null,
          revokedById: null,
          revokedReason: null,
        });
      }, {
        type: decision === 'granted' ? STANDARD_WAIVER_EVENTS.GRANTED : STANDARD_WAIVER_EVENTS.REFUSED,
        entity: 'standardWaiver',
        entityId: requestId,
        summary: decision === 'granted'
          ? `Standard waiver granted ${window.from}–${window.to} by the line holder, with a written basis and a safeguard.`
          : 'Standard waiver refused by the line holder, with a written basis. The standard stands as written.',
      });
      return saved({ requestId, grantId: id, decision });
    },

    /**
     * The closing decision. The owner says the standard is back in force, and
     * the day it was; or that the routine was retired — which the register
     * checks against the routine's own retirement before it writes the claim.
     */
    standardWaiverDecide(input = {}) {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const requestId = text(input.requestId, L.idMax);
      const context = requestContext(requestId);
      if (!context) return fail('No request with that id is on the register.', 'requestId');
      if (!context.grant) return fail('This request was never granted, so there is no authority to close.', 'requestId');
      if (context.decision) return fail('A closing decision is already recorded against this waiver. A second one would rewrite history rather than close it.', 'requestId');
      if (context.grant.revoked) return fail('That authority was revoked. A revoked waiver is closed by the revocation, not by a restoration.', 'requestId');
      if (context.request.ownerId !== check.actorId && context.grant.authoriserId !== check.actorId) {
        return fail('This act belongs to the person who owes the standard or the line holder who authorised it. Nobody else closes a departure.', 'requestId');
      }
      const kind = text(input.kind, 30);
      if (!STANDARD_WAIVER_DECISION_KEYS.includes(kind)) return fail('Say which decision this is: the standard is back in force, or the routine was retired.', 'kind');
      const decidedOn = standardWaiverDay(input.decidedOn) || check.today;
      if (decidedOn > check.today) return fail('A decision dated after today would report the standard back in force in a future nobody has lived through.', 'decidedOn');
      if (decidedOn < context.grant.from) return fail(`The departure began on ${context.grant.from}. A standard cannot be restored before it was suspended.`, 'decidedOn');
      const basis = text(input.basis, L.basisMax);
      if (basis.length < L.basisMin) return fail(`Write the basis of this decision (at least ${L.basisMin} characters).`, 'basis');
      if (kind === 'ended-with-routine') {
        const routine = routineOf(context.request.routineId);
        if (!routine || !routine.retiredOn || routine.retiredOn > decidedOn) {
          return fail('The routine is not retired on that day. The register refuses a claim about the record that the record contradicts; record the retirement first, or close with the standard restored.', 'kind');
        }
      }
      const at = clock();
      const id = idFactory('swd');
      store.update((draft) => {
        const list = Array.isArray(draft.standardWaiverDecisions) ? draft.standardWaiverDecisions : (draft.standardWaiverDecisions = []);
        list.push({ id, requestId, kind, decidedById: check.actorId, decidedOn, basis, at: at.toISOString() });
      }, {
        type: STANDARD_WAIVER_EVENTS.DECIDED,
        entity: 'standardWaiver',
        entityId: requestId,
        summary: kind === 'restored'
          ? `Standard restored on ${decidedOn}: the written standard is back in force.`
          : `Departure closed on ${decidedOn}: the routine itself was retired.`,
      });
      return saved({ requestId, decisionId: id, kind });
    },

    /** Withdraw an authority before its last day. The grant row keeps the day. */
    standardWaiverRevoke(input = {}) {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.AUTHORISE);
      if (!check.ok) return check;
      const requestId = text(input.requestId, L.idMax);
      const context = requestContext(requestId);
      if (!context) return fail('No request with that id is on the register.', 'requestId');
      if (!context.grant) return fail('This request was never granted, so there is no authority to revoke.', 'requestId');
      if (context.decision) return fail('A closing decision is already recorded against this waiver.', 'requestId');
      if (context.grant.revoked) return fail(`That authority was already revoked on ${context.grant.revokedOn}.`, 'requestId');
      if (check.today > context.grant.to) return fail(`The window ended on ${context.grant.to}. A window that already ended is closed by a decision, not withdrawn.`, 'requestId');
      if (context.grant.authoriserId !== check.actorId) return fail('Only the seat that granted this authority — or the operator view acting as the workspace leader — may revoke it.', 'requestId');
      const reason = text(input.reason, L.basisMax);
      if (reason.length < L.basisMin) return fail(`Write why the authority is withdrawn (at least ${L.basisMin} characters). A revocation without a reason is a deletion wearing a date.`, 'reason');
      store.update((draft) => {
        const target = (Array.isArray(draft.standardWaiverGrants) ? draft.standardWaiverGrants : [])
          .find((row) => row && row.id === context.grant.id);
        if (target) {
          target.revoked = true;
          target.revokedOn = check.today;
          target.revokedById = check.actorId;
          target.revokedReason = reason;
        }
      }, {
        type: STANDARD_WAIVER_EVENTS.REVOKED,
        entity: 'standardWaiver',
        entityId: requestId,
        summary: `Standard waiver revoked on ${check.today}: the standard is back in force from that day.`,
      });
      return saved({ requestId });
    },

    /** Re-run RULE-TSW-01 on the shared spine. A pause still governs. */
    standardWaiverScan() {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: STANDARD_WAIVER_EVENTS.SCAN,
        entity: 'workspace',
        entityId: `${STANDARD_WAIVER_ROUTE}#${STANDARD_WAIVER_RULE_ID}`,
        summary: `Standard-waiver scan requested (${STANDARD_WAIVER_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === STANDARD_WAIVER_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    standardWaiverSetConventions(patch = {}) {
      const check = seatFor(STANDARD_WAIVER_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Standard-waiver conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(STANDARD_WAIVER_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one standard-waiver convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared standard-waiver convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${STANDARD_WAIVER_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = STANDARD_WAIVER_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${STANDARD_WAIVER_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeStandardWaiverSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; }, {
        type: STANDARD_WAIVER_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: `${STANDARD_WAIVER_ROUTE}?panel=${STANDARD_WAIVER_PANEL}`,
        summary: `Standard-waiver conventions set: default ${next.standardWaiverDefaultDays} d, maximum ${next.standardWaiverMaxDays} d, review after ${next.standardWaiverRenewalReviewAfter} renewals.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}

export const STANDARD_WAIVER_ACTION_ENGINE_VERSION = STANDARD_WAIVER_ENGINE_VERSION;
