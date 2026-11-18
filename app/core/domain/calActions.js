/**
 * app/core/domain/calActions.js — the seat-checked commands of the Performance
 * Calibration Decision Register (ADR-0261).
 *
 * THREE human acts and a scan: RECORD a session (the cycle, title, scope,
 * status, opened day, declared distribution, responsible hands), RECORD a
 * decision (the session, person, review, proposed and calibrated ratings, the
 * written rationale), CLOSE a session (the closed day) — re-declare the
 * conventions — plus the explicit scan. Every distribution, kappa, bias ratio
 * and state is re-derived on read by `cal.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A SESSION carries the cycle, title, scope, status, opened day and one to
 *    four responsible hands. A status this register does not carry is refused:
 *    the kind is the verdict.
 *  - A DECISION carries the proposed and calibrated ratings from the closed
 *    vocabulary and the written rationale. A decision with no rationale is
 *    refused — a calibration nobody justified is an overwrite, not a decision.
 *  - The proposed rating must match the review's manager rating at decision
 *    time. A decision that misstates the proposal is refused.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, writes a
 * distribution, computes kappa, asserts a bias verdict, averages two divergent
 * proposals, overwrites a proposed rating, or scores a person on worth.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildCalibration, calAttentionCount } from './cal.js';
import {
  CAL_EVENTS,
  CAL_LIMITS as L,
  CAL_RATING_BY_KEY,
  CAL_REFUSALS,
  CAL_RIGHTS,
  CAL_ROUTE,
  CAL_SESSION_STATUS_BY_KEY,
  CAL_SETTING_KEYS,
} from './calRegistry.js';
import {
  normalizeCalDecisions,
  normalizeCalSessions,
  normalizeCalSettings,
  calDayKey,
  calHolders,
  calInstant,
} from './calSchema.js';

const REFUSAL = (key) => `performance-calibration:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createCalActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function actingSeat() {
    try {
      const seats = buildSeats(store.state, { now: clock() });
      return activeSeat(seats, store.state?.actingSeatId || null) || seats?.[0] || null;
    } catch {
      return null;
    }
  }

  function canManage() {
    const seat = actingSeat();
    if (!seat) return false;
    try {
      return canAct(seat, CAL_RIGHTS.MANAGE) || canAct(seat, CAL_RIGHTS.READ);
    } catch {
      return false;
    }
  }

  function canRead() {
    const seat = actingSeat();
    if (!seat) return false;
    try {
      return canAct(seat, CAL_RIGHTS.READ) || canAct(seat, CAL_RIGHTS.MANAGE);
    } catch {
      return false;
    }
  }

  function recordSession(input = {}) {
    if (!canManage()) return fail('That seat cannot manage calibration sessions.', 'session', REFUSAL('no-right'));
    const sessionId = text(input.sessionId || input.id, L.idMax) || idFactory();
    const cycle = text(input.cycle, L.cycleMax);
    const title = text(input.title, L.titleMax);
    const scope = text(input.scope, L.scopeMax);
    const status = text(input.status) || 'open';
    const openedOn = calDayKey(input.openedOn) || dayKey(clock());
    const closedOn = input.closedOn ? calDayKey(input.closedOn) : null;
    const declaredDistribution = text(input.declaredDistribution, L.distributionMax);
    const holders = calHolders(input.holders || input.responsibleHands);
    const createdBy = text(input.createdBy, L.idMax) || actingSeat()?.id || 'leader';
    const createdAt = calInstant(input.createdAt) || clock().toISOString();
    if (!cycle || !title || !CAL_SESSION_STATUS_BY_KEY[status] || !openedOn || holders.length < L.holdersMin) {
      return fail('A session needs a cycle, title, a known status, an opened day and at least one responsible hand.', 'session', REFUSAL('bad-session'));
    }
    if (status === 'closed' && !closedOn) return fail('A closed session needs a closed day.', 'closedOn', REFUSAL('bad-session'));
    if (status === 'open' && closedOn) return fail('An open session cannot carry a closed day.', 'closedOn', REFUSAL('bad-session'));
    if (openedOn > dayKey(clock())) return fail('The opened day cannot be in the future.', 'openedOn', REFUSAL('future-day'));
    const existing = rows('calSessions');
    if (existing.some((s) => s.sessionId === sessionId)) return fail('A session with that reference already exists.', 'sessionId', REFUSAL('duplicate-session'));
    const candidate = { sessionId, cycle, title, scope, status, openedOn, closedOn, declaredDistribution, holders, createdBy, createdAt };
    const warnings = [];
    const loaded = normalizeCalSessions([...existing, candidate], warnings);
    const stored = loaded.find((s) => s.sessionId === sessionId);
    if (!stored) return fail('That session could not be recorded as written.', 'session', REFUSAL('bad-session'));
    store.state.calSessions = loaded;
    store.state.settings = { ...settings(), ...normalizeCalSettings(settings()) };
    store.commit?.(CAL_EVENTS.SESSION_RECORDED, { sessionId });
    return { ok: true, session: stored };
  }

  function recordDecision(input = {}) {
    if (!canManage()) return fail('That seat cannot record calibration decisions.', 'decision', REFUSAL('no-right'));
    const decisionId = text(input.decisionId || input.id, L.idMax) || idFactory();
    const sessionId = text(input.sessionId, L.idMax);
    const personId = text(input.personId, L.idMax);
    const reviewId = text(input.reviewId, L.idMax);
    const proposedRating = text(input.proposedRating);
    const calibratedRating = text(input.calibratedRating);
    const rationale = text(input.rationale, L.rationaleMax);
    const decidedBy = text(input.decidedBy, L.idMax) || actingSeat()?.id || 'leader';
    const decidedOn = calDayKey(input.decidedOn) || dayKey(clock());
    const decidedAt = calInstant(input.decidedAt) || clock().toISOString();
    if (!sessionId || !personId || !reviewId || !CAL_RATING_BY_KEY[proposedRating] || !CAL_RATING_BY_KEY[calibratedRating]) {
      return fail('A decision needs a session, person, review and both ratings from the closed vocabulary.', 'decision', REFUSAL('bad-rating'));
    }
    if (!rationale) return fail('A calibration decision needs a written rationale. A calibration nobody justified is an overwrite, not a decision.', 'rationale', REFUSAL('missing-rationale'));
    if (decidedOn > dayKey(clock())) return fail('The decided day cannot be in the future.', 'decidedOn', REFUSAL('future-day'));
    const sessions = normalizeCalSessions(rows('calSessions'), []);
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return fail('That session is not on the register.', 'sessionId', REFUSAL('unknown-session'));
    if (session.status === 'closed') return fail('That session is closed. A closed session takes no new decisions.', 'sessionId', REFUSAL('closed-session'));
    const people = rows('people');
    if (personId && !people.some((p) => p.id === personId) && personId !== 'leader') {
      // Allow off-roster persons as orphans (printed, never dropped) — but
      // the review must exist for the proposed rating to be verified.
    }
    const reviews = rows('reviews');
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return fail('That review is not on the record.', 'reviewId', REFUSAL('unknown-review'));
    if (review.personId !== personId) return fail('That review does not belong to that person.', 'reviewId', REFUSAL('unknown-review'));
    if (review.manager?.rating !== proposedRating) {
      return fail(`The proposed rating must match the review's manager rating (${review.manager?.rating || 'none'}). A decision that misstates the proposal is refused.`, 'proposedRating', REFUSAL('bad-rating'));
    }
    const existing = rows('calDecisions');
    if (existing.some((d) => d.sessionId === sessionId && d.personId === personId)) {
      return fail('A decision for that person in that session already exists.', 'personId', REFUSAL('duplicate-decision'));
    }
    const candidate = { decisionId, sessionId, personId, reviewId, proposedRating, calibratedRating, rationale, decidedBy, decidedOn, decidedAt };
    const warnings = [];
    const loaded = normalizeCalDecisions([...existing, candidate], sessions, warnings);
    const stored = loaded.find((d) => d.decisionId === decisionId);
    if (!stored) return fail('That decision could not be recorded as written.', 'decision', REFUSAL('bad-decision'));
    store.state.calDecisions = loaded;
    store.commit?.(CAL_EVENTS.DECISION_RECORDED, { decisionId, sessionId, personId });
    return { ok: true, decision: stored };
  }

  function closeSession(input = {}) {
    if (!canManage()) return fail('That seat cannot close calibration sessions.', 'session', REFUSAL('no-right'));
    const sessionId = text(input.sessionId, L.idMax);
    const closedOn = calDayKey(input.closedOn) || dayKey(clock());
    if (!sessionId) return fail('A session reference is needed.', 'sessionId', REFUSAL('bad-session'));
    const sessions = normalizeCalSessions(rows('calSessions'), []);
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return fail('That session is not on the register.', 'sessionId', REFUSAL('unknown-session'));
    if (session.status === 'closed') return fail('That session is already closed.', 'sessionId', REFUSAL('closed-session'));
    if (closedOn > dayKey(clock())) return fail('The closed day cannot be in the future.', 'closedOn', REFUSAL('future-day'));
    const updated = sessions.map((s) => (s.sessionId === sessionId ? { ...s, status: 'closed', closedOn } : s));
    const warnings = [];
    store.state.calSessions = normalizeCalSessions(updated, warnings);
    store.commit?.(CAL_EVENTS.SESSION_CLOSED, { sessionId, closedOn });
    return { ok: true, sessionId, closedOn };
  }

  function setConventions(input = {}) {
    if (!canManage()) return fail('That seat cannot set calibration conventions.', 'conventions', REFUSAL('no-right'));
    const next = { ...settings() };
    if (input.autoPropagate !== undefined) next[CAL_SETTING_KEYS.autoPropagate] = Boolean(input.autoPropagate);
    if (input.privacyFloor !== undefined) next[CAL_SETTING_KEYS.privacyFloor] = input.privacyFloor;
    if (input.warnHorizonDays !== undefined) next[CAL_SETTING_KEYS.warnHorizonDays] = input.warnHorizonDays;
    store.state.settings = { ...next, ...normalizeCalSettings(next) };
    store.commit?.(CAL_EVENTS.CONVENTIONS_SET, {});
    return { ok: true, settings: normalizeCalSettings(store.state.settings) };
  }

  function scanCalibration() {
    if (!canRead()) return fail('That seat cannot scan calibration.', 'scan', REFUSAL('no-right'));
    const report = buildCalibration(store.state, { now: clock(), settings: settings() });
    store.commit?.(CAL_EVENTS.SCANNED, { sessions: report.sessions.length });
    return { ok: true, report };
  }

  return {
    recordCalSession: recordSession,
    recordCalDecision: recordDecision,
    closeCalSession: closeSession,
    setCalConventions: setConventions,
    scanCalibration,
    calAttentionCount: () => calAttentionCount(store.state, { now: clock(), settings: settings() }),
  };
}
