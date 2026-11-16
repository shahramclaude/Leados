/**
 * app/core/domain/mgrHandoverActions.js — seat-checked human acts for ADR-0225.
 *
 * A handover is completed only by dated first-person keys: the outgoing
 * manager's portfolio brief, the successor's own acceptance, the governor's
 * release of the outgoing authority, and the successor's dispute. No API
 * transfers an obligation, records a key on another person's behalf, or
 * resolves a dispute automatically.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildMgrHandover,
  mgrHandoverMatrix,
  resolveMgrHandoverApex,
} from './mgrHandover.js';
import {
  normalizeMgrHandoverActs,
  normalizeMgrHandovers,
  mhhDay,
  mhhInstant,
  mhhText,
} from './mgrHandoverSchema.js';
import {
  MHH_EVENTS,
  MHH_LIMITS as L,
  MHH_PORTFOLIO_KEYS,
  MHH_REASON_KEYS,
  MHH_REFUSALS,
  MHH_RIGHTS,
  MHH_ROUTE,
} from './mgrHandoverRegistry.js';

const REFUSAL = (key) => `mgrHandover:${key}`;

export function createMgrHandoverActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const list = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function resolveSeat(right) {
    const at = clock();
    const cfg = settings();
    try {
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
      const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail(MHH_REFUSALS.notSeated);
      const rightResult = canAct(right, seat);
      if (!rightResult.allow) return fail(rightResult.reason);
      const actorId = seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
      return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
    } catch {
      return fail('The operating seat and Matrix lines could not be resolved. No managerial-handover act was accepted.', null, REFUSAL('seat-unreadable'));
    }
  }

  function readCheck() {
    const at = clock();
    const cfg = settings();
    try {
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
      const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
      const seat = activeSeat(built);
      if (seat.readOnly) return fail(MHH_REFUSALS.notSeated);
      const permission = canAct(MHH_RIGHTS.READ, seat);
      return permission.allow ? { ok: true, at, cfg, seat, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null) }
        : fail(permission.reason);
    } catch {
      return fail('The operating seat and Matrix lines could not be resolved. The managerial-handover reader is withheld.', null, REFUSAL('seat-unreadable'));
    }
  }

  function activePerson(id) {
    return list('people').find((person) => person && person.id === id && person.status !== 'archived') || null;
  }

  function reachable(check, id) {
    return Boolean(check.seat.fullAccess || check.seat.scope?.has?.(id) || check.seat.lineScope?.has?.(id) || check.actorId === id);
  }

  function firstPerson(check, claimedActorId = null, field = 'actorId', identityAttested = false) {
    if (check.seat.fullAccess && identityAttested !== true) {
      return fail('Confirm that you are the selected person and are recording your own act. This local assertion is not authentication.', 'identityAttested', REFUSAL('identity-attestation-required'));
    }
    const actorId = check.seat.fullAccess ? mhhText(claimedActorId, 120) : check.actorId;
    if (!actorId || actorId === 'leader' || !activePerson(actorId)) {
      return fail('A first-person act needs an active roster person. The synthetic workspace operator cannot hold a managerial key.', field, REFUSAL('actor-not-a-person'));
    }
    if (!check.seat.fullAccess && claimedActorId && claimedActorId !== actorId) {
      return fail('A declared leadership seat cannot act as another person. Switch to that person’s valid seat or use the configured identity flow.', field, REFUSAL('actor-seat-mismatch'));
    }
    check.actorId = actorId;
    return null;
  }

  function handoverContext(handoverId, check) {
    const key = mhhText(handoverId, 120);
    if (!key) return fail('Name the managerial handover.', 'handoverId', REFUSAL('handover-id-missing'));
    const handovers = normalizeMgrHandovers(list('mgrHandovers'), []);
    const handover = handovers.find((row) => row.id === key) || null;
    if (!handover) return fail(MHH_REFUSALS.notFound, 'handoverId', REFUSAL('handover-not-found'));
    const acts = normalizeMgrHandoverActs(list('mgrHandoverActs'), handovers, []);
    const report = buildMgrHandover(store.state, { now: check.at, settings: check.cfg, seat: null, includeAll: true });
    const row = report.handoversAll.find((candidate) => candidate.id === key) || null;
    if (!row) return fail(MHH_REFUSALS.notFound, 'handoverId', REFUSAL('handover-unreadable'));
    return { handover, acts: acts.filter((act) => act.handoverId === key), row, handovers };
  }

  function currentMatrix(check) {
    try { return mgrHandoverMatrix(store.state, check.at, check.cfg); } catch { return null; }
  }

  function aboveOrSelf(matrix, actorId, subjectId) {
    if (!matrix || !matrix.nodes?.has(actorId) || !matrix.nodes?.has(subjectId)) return false;
    return subjectId === actorId || Boolean(matrix.nodes.get(subjectId)?.ancestors?.has(actorId));
  }

  function addAct(handover, row, eventType, summary) {
    if (list('mgrHandoverActs').some((act) => act?.id === row.id)) return fail('The generated act identifier already exists. Nothing was saved; retry after the identifier source is repaired.', null, REFUSAL('act-id-collision'));
    if (list('mgrHandoverActs').length >= L.acts) return fail('The act ledger is full. Nothing was saved; raise an operations-system support issue.', null, REFUSAL('act-ledger-full'));
    const handovers = normalizeMgrHandovers(list('mgrHandovers'), []);
    const loaded = normalizeMgrHandoverActs([...list('mgrHandoverActs'), row], handovers, []);
    const stored = loaded.find((candidate) => candidate.id === row.id) || null;
    if (!stored || stored.handoverId !== handover.id) return fail('The act cannot be stored as a row this register will read back. Nothing was saved.', null, REFUSAL('act-unreadable'));
    store.update((draft) => {
      draft.mgrHandoverActs = Array.isArray(draft.mgrHandoverActs) ? draft.mgrHandoverActs : [];
      draft.mgrHandoverActs.push(stored);
    }, {
      type: eventType,
      entity: 'mgrHandover',
      entityId: handover.id,
      summary,
    });
    return saved({ handoverId: handover.id, actId: row.id });
  }

  function makeAct(kind, handoverId, actorId, atIso, fields) {
    const id = typeof idFactory === 'function' ? idFactory('mhh') : `mhh-act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, handoverId, actorId, kind, at: atIso, ...fields };
  }

  function releasedCheck(row) {
    if (row.state === 'released') return fail(MHH_REFUSALS.released, 'handoverId', REFUSAL('already-released'));
    return null;
  }

  function integrityFailure(row) {
    if (row.invalidActN > 0 || row.invalidStoredActN > 0) {
      return fail('The stored act stream contains a malformed, unreadable or role-invalid act. No further brief, acceptance, release or dispute is accepted. This release has no in-register repair action; use the supported data-recovery process.', 'handoverId', REFUSAL('act-integrity'));
    }
    return null;
  }

  return {
    /** Declare a transition: who leaves, who succeeds, who governs it, by when. */
    mgrHandoverDeclare(input = {}) {
      const check = resolveSeat(MHH_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const roleRef = mhhText(input.roleRef, L.roleRefMax);
      if (roleRef.length < L.roleRefMin) return fail(`Name the role being transitioned (at least ${L.roleRefMin} characters).`, 'roleRef', REFUSAL('role-ref-invalid'));
      const departingManagerId = mhhText(input.departingManagerId, 120);
      if (!departingManagerId || departingManagerId === 'leader' || !activePerson(departingManagerId)) {
        return fail('Name the outgoing manager as an active roster person. The synthetic workspace operator cannot leave a role.', 'departingManagerId', REFUSAL('departing-invalid'));
      }
      if (!reachable(check, departingManagerId)) return fail('The outgoing manager is outside the operating seat’s declared span and Matrix lines.', 'departingManagerId', REFUSAL('departing-out-of-span'));
      const successorId = mhhText(input.successorId, 120);
      if (!successorId || successorId === 'leader' || successorId === departingManagerId || !activePerson(successorId)) {
        return fail('Name the successor as a different active roster person. The synthetic workspace operator cannot hold a role.', 'successorId', REFUSAL('successor-invalid'));
      }
      if (!reachable(check, successorId)) return fail('The successor is outside the operating seat’s declared span and Matrix lines.', 'successorId', REFUSAL('successor-out-of-span'));
      const declaredById = mhhText(input.declaredById, 120);
      if (!declaredById || declaredById === 'leader' || declaredById === departingManagerId || declaredById === successorId
        || !activePerson(declaredById)) {
        return fail('Name the declaring governor as a distinct active roster person. The synthetic workspace operator cannot govern a transition.', 'declaredById', REFUSAL('governor-invalid'));
      }
      if (!reachable(check, declaredById)) return fail('The declaring governor is outside the operating seat’s declared span and Matrix lines.', 'declaredById', REFUSAL('governor-out-of-span'));
      const declaredOn = mhhDay(input.declaredOn || check.today);
      if (!declaredOn) return fail('The declaration date is not a readable day.', 'declaredOn', REFUSAL('declared-on-invalid'));
      const plannedEffectiveOn = mhhDay(input.plannedEffectiveOn);
      if (!plannedEffectiveOn || plannedEffectiveOn < declaredOn) {
        return fail('The planned effective date must be a readable day on or after the declaration date.', 'plannedEffectiveOn', REFUSAL('effective-on-invalid'));
      }
      const scopeKeys = [...new Set((Array.isArray(input.scopeKeys) ? input.scopeKeys : [])
        .map((raw) => mhhText(raw, 40)).filter((key) => MHH_PORTFOLIO_KEYS.includes(key)))].sort();
      if (scopeKeys.length < L.scopeMin || scopeKeys.length > L.scopeMax) {
        return fail(`Declare at least ${L.scopeMin} portfolio category to transfer (up to ${L.scopeMax}).`, 'scopeKeys', REFUSAL('scope-invalid'));
      }
      const reasonKind = MHH_REASON_KEYS.includes(input.reasonKind) ? input.reasonKind : null;
      if (!reasonKind) return fail('Choose one declared reason kind for the transition; the system never infers one from prose.', 'reasonKind', REFUSAL('reason-invalid'));
      const id = typeof idFactory === 'function' ? idFactory('mhh') : `mhh-${Date.now()}`;
      const handover = {
        id,
        roleRef,
        departingManagerId,
        successorId,
        declaredById,
        declaredOn,
        plannedEffectiveOn,
        scopeKeys,
        reasonKind,
        note: mhhText(input.note, L.noteMax),
      };
      const handovers = normalizeMgrHandovers([...list('mgrHandovers'), handover], []);
      const stored = handovers.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The handover cannot be stored as a row this register will read back. Nothing was saved.', null, REFUSAL('handover-unreadable'));
      store.update((draft) => {
        draft.mgrHandovers = Array.isArray(draft.mgrHandovers) ? draft.mgrHandovers : [];
        draft.mgrHandovers.push(stored);
      }, {
        type: MHH_EVENTS.DECLARED,
        entity: 'mgrHandover',
        entityId: id,
        summary: `A managerial handover was declared for ${roleRef}: ${departingManagerId} to ${successorId}, effective ${plannedEffectiveOn}.`,
      });
      return saved({ handoverId: id });
    },

    /** The outgoing manager's first-person portfolio brief (or a manager above them). */
    mgrHandoverBrief(input = {}) {
      const check = resolveSeat(MHH_RIGHTS.BRIEF);
      if (!check.ok) return check;
      const ctx = handoverContext(input.handoverId, check);
      if (!ctx.ok) return ctx;
      const { handover, row } = ctx;
      const released = releasedCheck(row);
      if (released) return released;
      const integrity = integrityFailure(row);
      if (integrity) return integrity;
      if (row.hasBrief) return fail('This handover already carries the outgoing manager’s portfolio brief. A brief is recorded once; declare a new transition for a revised handover.', 'handoverId', REFUSAL('brief-exists'));
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      const matrix = currentMatrix(check);
      const above = check.seat.fullAccess
        ? aboveOrSelf(matrix, check.actorId, handover.departingManagerId)
        : aboveOrSelf(matrix, check.actorId, handover.departingManagerId);
      if (!above) return fail('Only the outgoing manager — or a manager strictly above them on a live line — may record the portfolio brief.', 'actorId', REFUSAL('brief-actor-invalid'));
      const portfolioCount = input.portfolioCount;
      if (!Number.isInteger(portfolioCount) || portfolioCount < 0 || portfolioCount > L.handovers) {
        return fail('State the number of portfolio items you hold as a whole number.', 'portfolioCount', REFUSAL('portfolio-count-invalid'));
      }
      const briefText = mhhText(input.briefText, L.textMax);
      if (briefText.length < L.briefMin) return fail(`Describe the portfolio you are handing over in at least ${L.briefMin} characters.`, 'briefText', REFUSAL('brief-text-missing'));
      const evidenceText = mhhText(input.evidenceText, L.textMax);
      if (evidenceText.length < L.evidenceMin) return fail(`State the evidence you checked before briefing in at least ${L.evidenceMin} characters.`, 'evidenceText', REFUSAL('evidence-missing'));
      const act = makeAct('portfolio-brief', handover.id, check.actorId, check.at.toISOString(), {
        portfolioCount,
        briefText,
        openItemsText: mhhText(input.openItemsText, L.textMax),
        evidenceText,
      });
      return addAct(handover, act, MHH_EVENTS.BRIEFED, `A portfolio brief was recorded for managerial handover ${handover.id} by ${check.actorId}.`);
    },

    /** The successor's own first-person acceptance of the transferred portfolio. */
    mgrHandoverAccept(input = {}) {
      const check = resolveSeat(MHH_RIGHTS.ACCEPT);
      if (!check.ok) return check;
      const ctx = handoverContext(input.handoverId, check);
      if (!ctx.ok) return ctx;
      const { handover, row } = ctx;
      const released = releasedCheck(row);
      if (released) return released;
      const integrity = integrityFailure(row);
      if (integrity) return integrity;
      if (!row.hasBrief) return fail('The successor acceptance requires the outgoing portfolio brief to exist first. The two keys are recorded in order; nobody records them out of sequence.', 'handoverId', REFUSAL('accept-before-brief'));
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      if (check.actorId !== handover.successorId) {
        return fail('Only the named successor may record the acceptance. A manager above the successor cannot take this key for them.', 'actorId', REFUSAL('accept-actor-invalid'));
      }
      const acceptedCount = input.acceptedCount;
      if (!Number.isInteger(acceptedCount) || acceptedCount < 0 || acceptedCount > L.handovers) {
        return fail('State the number of portfolio items you accept as a whole number.', 'acceptedCount', REFUSAL('accepted-count-invalid'));
      }
      if (acceptedCount > row.portfolioTotal) {
        return fail(`The register reads ${row.portfolioTotal} portfolio item(s) on this transition; an acceptance above the read total cannot be recorded. If the portfolio was revised, record it in a new handover.`, 'acceptedCount', REFUSAL('accept-exceeds-portfolio'));
      }
      const act = makeAct('acceptance', handover.id, check.actorId, check.at.toISOString(), {
        acceptedCount,
        note: mhhText(input.note, L.noteMax),
      });
      return addAct(handover, act, MHH_EVENTS.ACCEPTED, `A successor acceptance was recorded for managerial handover ${handover.id} by ${check.actorId}.`);
    },

    /** The governor's release of the outgoing manager's authority. */
    mgrHandoverRelease(input = {}) {
      const check = resolveSeat(MHH_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const ctx = handoverContext(input.handoverId, check);
      if (!ctx.ok) return ctx;
      const { handover, row } = ctx;
      const released = releasedCheck(row);
      if (released) return released;
      const integrity = integrityFailure(row);
      if (integrity) return integrity;
      if (!row.hasBrief) return fail('The release requires the outgoing portfolio brief to exist first.', 'handoverId', REFUSAL('release-before-brief'));
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      const matrix = currentMatrix(check);
      const aboveGovernor = aboveOrSelf(matrix, check.actorId, handover.declaredById);
      if (!aboveGovernor) return fail('Only the declaring governor — or a manager strictly above them on a live line — may release the outgoing authority.', 'actorId', REFUSAL('release-actor-invalid'));
      const note = mhhText(input.note, L.noteMax);
      // A release filed after a dispute (no acceptance on the record) is a
      // settlement by the governor and must carry its own stated ground.
      if (row.hasDispute && !row.hasAcceptance && note.length < L.textMin) {
        return fail(`This handover is disputed and carries no acceptance; a governor settlement must state its ground in at least ${L.textMin} characters.`, 'note', REFUSAL('release-dispute-reason-missing'));
      }
      if (!row.hasAcceptance && !row.hasDispute) {
        return fail('The release requires the successor acceptance — or a recorded dispute — before the outgoing authority can be released.', 'handoverId', REFUSAL('release-keys-missing'));
      }
      const act = makeAct('release', handover.id, check.actorId, check.at.toISOString(), { note });
      return addAct(handover, act, MHH_EVENTS.RELEASED, `The outgoing authority was released for managerial handover ${handover.id} by ${check.actorId}.`);
    },

    /** The successor's own first-person dispute, with a stated ground. */
    mgrHandoverDispute(input = {}) {
      const check = resolveSeat(MHH_RIGHTS.DISPUTE);
      if (!check.ok) return check;
      const ctx = handoverContext(input.handoverId, check);
      if (!ctx.ok) return ctx;
      const { handover, row } = ctx;
      const released = releasedCheck(row);
      if (released) return released;
      const integrity = integrityFailure(row);
      if (integrity) return integrity;
      if (!row.hasBrief) return fail('The dispute requires the outgoing portfolio brief to exist first.', 'handoverId', REFUSAL('dispute-before-brief'));
      const actorError = firstPerson(check, input.actorId, 'actorId', input.identityAttested);
      if (actorError) return actorError;
      if (check.actorId !== handover.successorId) {
        return fail('Only the named successor may dispute the handover. A manager above the successor cannot dispute it for them.', 'actorId', REFUSAL('dispute-actor-invalid'));
      }
      const reasonText = mhhText(input.reasonText, L.textMax);
      if (reasonText.length < L.textMin) return fail(`State the ground of the dispute in at least ${L.textMin} characters.`, 'reasonText', REFUSAL('dispute-reason-missing'));
      const act = makeAct('dispute', handover.id, check.actorId, check.at.toISOString(), { reasonText });
      return addAct(handover, act, MHH_EVENTS.DISPUTED, `A successor dispute was recorded for managerial handover ${handover.id} by ${check.actorId}.`);
    },

    /** Explicitly run the same governed rule as a commit. */
    mgrHandoverScan() {
      const check = resolveSeat(MHH_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: MHH_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${MHH_ROUTE}#${MHH_EVENTS.SCANNED}`,
        summary: 'Managerial-handover scan requested: owed briefs, acceptances, releases and dispute reviews were re-read from the record.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* -------------------------------------------------------------- reads */
    mgrHandoverReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildMgrHandover(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    mgrHandoverAttentionCount() {
      const check = readCheck();
      if (!check.ok) return 0;
      return buildMgrHandover(store.state, { now: check.at, settings: check.cfg, seat: check.seat }).attention;
    },

    mgrHandoverCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildMgrHandover(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, people: report.peopleOptions };
    },
  };
}
