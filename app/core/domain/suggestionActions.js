/**
 * app/core/domain/suggestionActions.js — the seat-checked commands of the
 * Frontline Improvement-Suggestion Ledger (ADR-0227).
 *
 * FOUR human acts and a scan, and nothing else: DECLARE a suggestion (the
 * acting seat's own first-person submission), record a TRIAGE decision (a
 * member of the COMPUTED route), claim an EFFECT (the named owner) and CONFIRM
 * it (the submitter or a route member, never the owner). Every figure, state
 * and count is re-derived on read by `suggestionLedger.js`; nothing derived is
 * stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - The suggestion is a FIRST-PERSON act. `submitterId` is the acting seat's
 *    own identity; one person cannot file a suggestion in another's name. The
 *    synthetic workspace leader never speaks for a person, so the undeclared
 *    operator view is refused at every write with a printed reason.
 *  - THE ROUTE IS COMPUTED, NEVER CHOSEN. The decision-makers are the matrix
 *    joint-apex set over the submitter's active lines (ADR-0140): the lowest
 *    seat(s) above every line the submitter holds. A single-chain submitter
 *    routes to their manager; a matrixed submitter routes to the seat above
 *    BOTH lines — never silently to one of two managers. The graph cannot name
 *    one (disconnected, leader-only, or a diamond wider than the declared
 *    route cap) is a REFUSAL with the ambiguity printed, never a guess.
 *  - A triage counts only from a route member, once per member, and only while
 *    the route is still open. An acceptance names one owner on this seat's
 *    reach and one target day; a decline carries its reason and names neither.
 *  - Only the named owner may claim an effect, and only after acceptance.
 *  - Confirmation is an independent key: the submitter or a route member,
 *    never the owner, and only after the claim.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixJointApex, matrixLineScopeFor } from './matrix.js';
import { activeManagersOf } from './dutyMeans.js';
import { LEADER_ID } from './chain.js';
import { buildSuggestionLedger } from './suggestionLedger.js';
import {
  kztDay,
  kztInstant,
  kztText,
  normalizeSuggestionActs,
  normalizeSuggestions,
} from './suggestionSchema.js';
import {
  KZT_DECISIONS,
  KZT_EVENTS,
  KZT_LIMITS as L,
  KZT_RIGHTS,
  KZT_ROUTE,
  KZT_RULE_ID,
} from './suggestionRegistry.js';
import { buildSuggestionReport, suggestionAttentionCount } from './suggestionReport.js';

const REFUSAL = (key) => `suggestion:${key}`;
const NOT_SEATED = 'No seat is resolved. Declare a valid seat before acting; the suggestion ledger is never changed from an unknown operating position.';

export function createSuggestionActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  /**
   * The acting seat and its PERSON. A suggestion is a named person's act: the
   * undeclared operator view and any seat that resolves to no roster person are
   * refused at every write — the kernel drops `leader`-named rows by design,
   * and a write that would vanish on reload is refused now instead.
   */
  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? null : (seat.nodeId || seat.id || null);
    if (!actorId || actorId === LEADER_ID) {
      return fail('A suggestion is a first-person act of a named person. The undeclared operator view cannot speak for one — declare a seat on the Altitude Lens.', null, REFUSAL('no-actor'));
    }
    const person = rows('people').find((row) => row && row.id === actorId) || null;
    if (!person) return fail('This seat is not a person on the roster. A suggestion is filed by a named person, and nothing is filed in their place.', null, REFUSAL('actor-not-on-roster'));
    return { ok: true, seat, at, cfg, actorId, person, today: dayKey(at) };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  /** Reads are SAFE-listed and bypass the gateway's rank check — re-proved here. */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(NOT_SEATED);
    const verdict = canAct(KZT_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  function rosterPerson(id) {
    const key = kztText(id, 120);
    if (!key) return null;
    return rows('people').find((row) => row && row.id === key) || null;
  }

  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  const reach = (seat, id) => Boolean(seat.fullAccess
    || (seat.scope && seat.scope.has(id))
    || (seat.lineScope && seat.lineScope.has(id)));

  /**
   * THE ROUTE — the matrix joint-apex set over the submitter's active lines,
   * computed from the live reporting graph and never accepted from the caller.
   * The synthetic leader and the submitter themselves are never route members.
   */
  function computeRoute(check) {
    const matrix = buildMatrix(store.state, { now: check.at, settings: check.cfg });
    const managers = activeManagersOf(matrix, check.actorId);
    if (!managers.length) {
      return fail('No active reporting line resolves for this person, so the register cannot name who must answer the suggestion. Nothing was saved.', null, REFUSAL('no-lines'));
    }
    const apex = matrixJointApex(matrix, managers);
    const usable = (apex.apexIds || [])
      .filter((id) => typeof id === 'string' && id && id !== LEADER_ID && id !== check.actorId && matrix.nodes.has(id))
      .sort();
    if (!usable.length) {
      return fail('The reporting graph cannot name a decision-maker above every line you hold — the lines share no seat below the workspace leader. The ambiguity is printed rather than resolved by picking one line. Nothing was saved.', null, REFUSAL('no-route'));
    }
    if (usable.length > L.routeMax) {
      return fail(`The joint decision set above your lines is ${usable.length} seats wide; a route carries at most ${L.routeMax}. The register refuses to thin it by choice. Nothing was saved.`, null, REFUSAL('route-too-wide'));
    }
    return { ok: true, routeIds: usable, apex };
  }

  function suggestionContext(check, suggestionId) {
    const key = kztText(suggestionId, 120);
    if (!key) return fail('Name the suggestion.', 'suggestionId', REFUSAL('suggestion-id-missing'));
    const loaded = normalizeSuggestions(rows('suggestions'), []);
    const suggestion = loaded.find((row) => row.id === key) || null;
    if (!suggestion) return fail('That suggestion is not on this register.', 'suggestionId', REFUSAL('unknownSuggestion'));
    return { ok: true, suggestion, loaded };
  }

  const hasAct = (suggestionId, kind, actorId) => normalizeSuggestionActs(rows('suggestionActs'), normalizeSuggestions(rows('suggestions'), []), [])
    .some((act) => act.suggestionId === suggestionId && act.kind === kind && act.actorId === actorId);

  return {
    /**
     * Declare a suggestion. First-person: the acting seat is the submitter.
     * The route is computed from the matrix; a response window is declared
     * (1–30 days) and nothing is invented.
     */
    suggestionDeclare(input = {}) {
      const check = seatFor(KZT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const route = computeRoute(check);
      if (!route.ok) return route;
      const areaRef = kztText(input.areaRef, L.areaMax);
      if (areaRef.length < L.areaMin) return fail(`Name the work area this concerns — at least ${L.areaMin} characters.`, 'areaRef', REFUSAL('area-invalid'));
      const problemText = kztText(input.problemText, L.textMax);
      if (problemText.length < L.textMin) return fail(`Describe the problem you see in at least ${L.textMin} characters — what happens today, and what it costs the work.`, 'problemText', REFUSAL('problem-missing'));
      const proposalText = kztText(input.proposalText, L.textMax);
      if (proposalText.length < L.textMin) return fail(`Describe your proposed fix in at least ${L.textMin} characters — what should change and how it would work.`, 'proposalText', REFUSAL('proposal-missing'));
      const submittedAt = kztInstant(input.submittedAt) || check.at.toISOString();
      if (Date.parse(submittedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A suggestion cannot be dated after the moment it is filed.', 'submittedAt', REFUSAL('submitted-in-future'));
      }
      let responseByAt = kztInstant(input.responseByAt);
      if (!responseByAt) {
        const days = Number(input.responseDays);
        if (!Number.isInteger(days) || days < L.responseMinDays || days > L.responseMaxDays) {
          return fail(`Declare a response window of ${L.responseMinDays} to ${L.responseMaxDays} days.`, 'responseDays', REFUSAL('response-window-invalid'));
        }
        responseByAt = new Date(Date.parse(submittedAt) + days * 86400000).toISOString();
      }
      const windowDays = (Date.parse(responseByAt) - Date.parse(submittedAt)) / 86400000;
      if (!(windowDays >= L.responseMinDays && windowDays <= L.responseMaxDays)) {
        return fail(`The response must be owed between ${L.responseMinDays} and ${L.responseMaxDays} days after filing — a commitment the record can break visibly.`, 'responseByAt', REFUSAL('response-window-invalid'));
      }
      const existing = normalizeSuggestions(rows('suggestions'), []);
      if (existing.length >= L.suggestions) return fail('The suggestion ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('sug');
      const row = {
        id,
        areaRef,
        problemText,
        proposalText,
        submitterId: check.actorId,
        routeIds: route.routeIds,
        submittedAt,
        responseByAt,
      };
      const loaded = normalizeSuggestions([...existing, row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The suggestion could not be stored as a row this register can read back. Nothing was saved.', 'problemText', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.suggestions = Array.isArray(draft.suggestions) ? draft.suggestions : [];
        draft.suggestions.push(stored);
      }, {
        type: KZT_EVENTS.DECLARED,
        entity: 'suggestion',
        entityId: id,
        summary: `Improvement suggestion filed for ${stored.areaRef}; a response is owed by ${stored.responseByAt} from the computed route (${stored.routeIds.length} seat(s)).`.slice(0, 300),
      });
      return saved({ suggestionId: id, routeIds: stored.routeIds });
    },

    /**
     * Triage — a member of the computed route decides. A shared route needs
     * every member to agree; a disagreement is printed by the reader as
     * `triage-split` and nobody decides after it.
     */
    suggestionTriage(input = {}) {
      const check = seatFor(KZT_RIGHTS.TRIAGE);
      if (!check.ok) return check;
      const ctx = suggestionContext(check, input.suggestionId);
      if (!ctx.ok) return ctx;
      const { suggestion } = ctx;
      if (!suggestion.routeIds.includes(check.actorId)) {
        return fail('You are not a member of this suggestion’s decision route — the route is computed from the reporting graph and is not yours to join.', 'suggestionId', REFUSAL('notInRoute'));
      }
      if (hasAct(suggestion.id, 'triage', check.actorId)) {
        return fail('You have already recorded your decision on this suggestion. A second never overwrites the first.', 'suggestionId', REFUSAL('alreadyDecided'));
      }
      const ledger = buildSuggestionLedger(store.state, { now: check.at });
      const row = ledger.rows.find((candidate) => candidate.id === suggestion.id);
      if (row && row.state === 'triage-split') return fail('This route has split — members recorded different decisions. Nobody decides after a split; the split is printed on the register.', 'suggestionId', REFUSAL('routeSplit'));
      if (row && (row.state === 'declined' || row.state === 'accepted-awaiting-claim' || row.state === 'claimed-awaiting-confirmation' || row.state === 'closed-confirmed')) {
        return fail('The route has already settled this suggestion. Nothing more is owed from it.', 'suggestionId', REFUSAL('routeSettled'));
      }
      const decision = KZT_DECISIONS.includes(input.decision) ? input.decision : null;
      if (!decision) return fail('Record “accept” or “decline” — a closed list, so the state counts are counts.', 'decision', REFUSAL('decision-invalid'));
      const reason = kztText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail(`Say why, in at least ${L.textMin} characters — the reason is what makes the decision readable later.`, 'reason', REFUSAL('reason-missing'));
      const decidedAt = kztInstant(input.decidedAt) || check.at.toISOString();
      if (Date.parse(decidedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A decision cannot be dated after the moment it is recorded.', 'decidedAt', REFUSAL('decided-in-future'));
      }
      if (Date.parse(decidedAt) < Date.parse(suggestion.submittedAt)) {
        return fail('A decision cannot predate the suggestion it answers.', 'decidedAt', REFUSAL('beforeSubmission'));
      }
      let ownerId = null;
      let targetDay = null;
      if (decision === 'accept') {
        const owner = rosterPerson(input.ownerId);
        if (!owner) return fail('Name the person who owns the change. The owner is a person this workspace can see, or the acceptance is not recorded.', 'ownerId', REFUSAL('owner-unknown'));
        if (!isActive(owner)) return fail('The named owner is archived on the roster. An archived person cannot own a change.', 'ownerId', REFUSAL('owner-archived'));
        if (!reach(check.seat, owner.id)) {
          return fail('The named owner is neither in this seat’s tree nor on an active Matrix line this seat holds. Name an owner this seat can reach.', 'ownerId', REFUSAL('owner-out-of-reach'));
        }
        ownerId = owner.id;
        targetDay = kztDay(input.targetDay);
        if (!targetDay) return fail('Give a real calendar day the effect is expected by.', 'targetDay', REFUSAL('target-invalid'));
        const spanDays = (Date.parse(`${targetDay}T00:00:00.000Z`) - Date.parse(decidedAt.slice(0, 10))) / 86400000;
        if (!(spanDays >= 0 && spanDays <= L.targetMaxDays)) {
          return fail(`The target day must fall between the decision and ${L.targetMaxDays} days after it.`, 'targetDay', REFUSAL('target-invalid'));
        }
      } else if (input.ownerId !== undefined && input.ownerId !== null && input.ownerId !== '') {
        return fail('A decline names no owner. If somebody owns the change, this is an acceptance.', 'ownerId', REFUSAL('decline-names-owner'));
      } else if (input.targetDay !== undefined && input.targetDay !== null && input.targetDay !== '') {
        return fail('A decline names no target day. If a date is owed, this is an acceptance.', 'targetDay', REFUSAL('decline-names-target'));
      }
      const existingActs = normalizeSuggestionActs(rows('suggestionActs'), normalizeSuggestions(rows('suggestions'), []), []);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('sua');
      const act = decision === 'accept'
        ? { id, suggestionId: suggestion.id, actorId: check.actorId, kind: 'triage', decision, reason, ownerId, targetDay, at: decidedAt }
        : { id, suggestionId: suggestion.id, actorId: check.actorId, kind: 'triage', decision, reason, ownerId: null, targetDay: null, at: decidedAt };
      const loaded = normalizeSuggestionActs([...existingActs, act], normalizeSuggestions(rows('suggestions'), []), []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The decision could not be stored as an act this register can read back. Nothing was saved.', 'reason', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.suggestionActs = Array.isArray(draft.suggestionActs) ? draft.suggestionActs : [];
        draft.suggestionActs.push(stored);
      }, {
        type: KZT_EVENTS.TRIAGE,
        entity: 'suggestion',
        entityId: suggestion.id,
        summary: decision === 'accept'
          ? `Suggestion ${suggestion.id} accepted by a route member; ${ownerId} owns the change by ${targetDay}.`.slice(0, 300)
          : `Suggestion ${suggestion.id} declined by a route member, with a stated reason.`.slice(0, 300),
      });
      return saved({ actId: id, decision });
    },

    /** The named owner's effect claim — and nobody else's. */
    suggestionClaim(input = {}) {
      const check = seatFor(KZT_RIGHTS.CLAIM);
      if (!check.ok) return check;
      const ctx = suggestionContext(check, input.suggestionId);
      if (!ctx.ok) return ctx;
      const { suggestion } = ctx;
      const ledger = buildSuggestionLedger(store.state, { now: check.at });
      const row = ledger.rows.find((candidate) => candidate.id === suggestion.id);
      if (!row || row.state !== 'accepted-awaiting-claim') {
        return fail('No accepted decision awaits a claim on this suggestion. The claim is owed only after the route has accepted and named you.', 'suggestionId', REFUSAL('notAccepted'));
      }
      if (row.ownerId !== check.actorId) {
        return fail('Only the named owner claims the effect. This suggestion names somebody else.', 'suggestionId', REFUSAL('notOwner'));
      }
      if (hasAct(suggestion.id, 'claim', check.actorId)) {
        return fail('An effect claim is already on the record. A second never overwrites the first.', 'suggestionId', REFUSAL('alreadyClaimed'));
      }
      const effectText = kztText(input.effectText, L.textMax);
      if (effectText.length < L.textMin) return fail(`Describe the effect you claim, in at least ${L.textMin} characters — what changed, and how the work shows it.`, 'effectText', REFUSAL('effect-missing'));
      const claimedAt = kztInstant(input.claimedAt) || check.at.toISOString();
      if (Date.parse(claimedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A claim cannot be dated after the moment it is recorded.', 'claimedAt', REFUSAL('claimed-in-future'));
      }
      const existingActs = normalizeSuggestionActs(rows('suggestionActs'), normalizeSuggestions(rows('suggestions'), []), []);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('sua');
      const act = { id, suggestionId: suggestion.id, actorId: check.actorId, kind: 'claim', effectText, claimedAt };
      const loaded = normalizeSuggestionActs([...existingActs, act], normalizeSuggestions(rows('suggestions'), []), []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The claim could not be stored as an act this register can read back. Nothing was saved.', 'effectText', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.suggestionActs = Array.isArray(draft.suggestionActs) ? draft.suggestionActs : [];
        draft.suggestionActs.push(stored);
      }, {
        type: KZT_EVENTS.CLAIM,
        entity: 'suggestion',
        entityId: suggestion.id,
        summary: `An effect is claimed on suggestion ${suggestion.id}; independent confirmation is now owed.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** The independent key: the submitter or a route member, never the owner. */
    suggestionConfirm(input = {}) {
      const check = seatFor(KZT_RIGHTS.CONFIRM);
      if (!check.ok) return check;
      const ctx = suggestionContext(check, input.suggestionId);
      if (!ctx.ok) return ctx;
      const { suggestion } = ctx;
      const ledger = buildSuggestionLedger(store.state, { now: check.at });
      const row = ledger.rows.find((candidate) => candidate.id === suggestion.id);
      if (!row || row.state !== 'claimed-awaiting-confirmation') {
        return fail('Nothing awaits confirmation on this suggestion. Confirmation is owed only after the owner has claimed an effect.', 'suggestionId', REFUSAL('notClaimed'));
      }
      if (row.ownerId === check.actorId) {
        return fail('Confirmation is an independent key. The owner never confirms their own effect.', 'suggestionId', REFUSAL('selfConfirmation'));
      }
      if (check.actorId !== suggestion.submitterId && !suggestion.routeIds.includes(check.actorId)) {
        return fail('Only the submitter or a member of the decision route confirms the effect — the two parties the change was for and agreed by.', 'suggestionId', REFUSAL('notConfirmer'));
      }
      if (hasAct(suggestion.id, 'confirm', check.actorId)) {
        return fail('A confirmation is already on the record. A second never overwrites the first.', 'suggestionId', REFUSAL('alreadyConfirmed'));
      }
      const note = kztText(input.note, L.textMax);
      if (note.length < L.textMin) return fail(`Record what you confirmed, in at least ${L.textMin} characters — what you saw working.`, 'note', REFUSAL('note-missing'));
      const confirmedAt = kztInstant(input.confirmedAt) || check.at.toISOString();
      if (Date.parse(confirmedAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A confirmation cannot be dated after the moment it is recorded.', 'confirmedAt', REFUSAL('confirmed-in-future'));
      }
      const existingActs = normalizeSuggestionActs(rows('suggestionActs'), normalizeSuggestions(rows('suggestions'), []), []);
      if (existingActs.length >= L.acts) return fail('The act ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('sua');
      const act = { id, suggestionId: suggestion.id, actorId: check.actorId, kind: 'confirm', note, at: confirmedAt };
      const loaded = normalizeSuggestionActs([...existingActs, act], normalizeSuggestions(rows('suggestions'), []), []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The confirmation could not be stored as an act this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.suggestionActs = Array.isArray(draft.suggestionActs) ? draft.suggestionActs : [];
        draft.suggestionActs.push(stored);
      }, {
        type: KZT_EVENTS.CONFIRM,
        entity: 'suggestion',
        entityId: suggestion.id,
        summary: `The effect on suggestion ${suggestion.id} is confirmed by someone other than its owner; the record closes.`.slice(0, 300),
      });
      return saved({ actId: id, state: 'closed-confirmed' });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    suggestionScan() {
      const check = seatFor(KZT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: KZT_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${KZT_ROUTE}#${KZT_RULE_ID}`,
        summary: `Improvement-suggestion register scan requested (${KZT_RULE_ID}): overdue responses and targets re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    suggestionReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildSuggestionReport(store.state, { now: check.at, seat: check.seat });
    },

    suggestionAttentionCount() {
      const { seat, at } = readSeat();
      return suggestionAttentionCount(store.state, { now: at, seat });
    },

    /**
     * Dialog support: the route the matrix would compute for this seat's own
     * submission (printed BEFORE filing, so the submitter sees who will owe the
     * answer), and the reachable, active people an acceptance may name as owner.
     */
    suggestionCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const owners = rows('people')
        .filter((row) => row && row.id && isActive(row))
        .filter((row) => check.seat.fullAccess || reach(check.seat, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || row.level || '' }));
      let computedRoute = null;
      let computedRouteReason = null;
      if (!check.seat.fullAccess) {
        const actorId = check.seat.nodeId || check.seat.id || null;
        const route = computeRoute({ ...check, actorId });
        if (route.ok) {
          computedRoute = route.routeIds.map((id) => {
            const person = rosterPerson(id);
            return { id, name: person ? (person.name || id) : id };
          });
        } else {
          computedRouteReason = route.error;
        }
      }
      return { ok: true, owners, computedRoute, computedRouteReason };
    },
  };
}

