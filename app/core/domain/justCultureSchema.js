/**
 * app/core/domain/justCultureSchema.js — the fail-closed loaders of the Just
 * Culture Decision Record (ADR-0218, Schema v172).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs an answer, completes a question the manager did not answer,
 * re-dates an act or moves a review to another line. A row that cannot be read
 * exactly is DROPPED with a counted warning, and the screen prints the count.
 *
 * WHY A DECISION ROW IS REFUSED IF ITS ANSWERS ARE INCOMPLETE. A decision whose
 * questions were never answered is a verdict with no evidence under it. Storing it
 * would let a response appear to follow from answers that do not exist.
 *
 * WHY A MISMATCH IS STORED, NOT REFUSED. A manager may have a reason the questions
 * do not capture. That reason is a human sentence, so it is kept — with the departure
 * stated. What is refused is a mismatch with NO reason, because then the record would
 * hold a response that departs from its evidence without anybody having said why.
 *
 * ANSWERS THAT DO NOT APPLY ARE STORED AS NULL. A question that the path does not
 * ask cannot carry an answer. An answer under a question that was not asked is a
 * row this loader cannot read exactly.
 */

import { dayKey } from '../time.js';
import {
  JC_ACT_KINDS,
  JC_CHOICE_KEYS,
  JC_DEVIATION_KEYS,
  JC_RISK_KEYS,
  JC_RESPONSE_KEYS,
  JC_SUBSTITUTION_KEYS,
  JC_SYSTEM_KEYS,
  JUST_CULTURE_LIMITS as L,
  justCultureExpectation,
} from './justCultureRegistry.js';

/** A real calendar day inside the register's range, or null. */
export function jcDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function jcText(value, max = L.summaryMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * The five answers, validated against the path they imply. Returns the normalised
 * answers (with non-applicable questions as null), or null when the shape is wrong.
 * Completeness is NOT checked here: a stored answer may be a valid record of a
 * decision that was refused elsewhere. `justCultureExpectation` reports what is owed.
 */
export function normalizeJustCultureAnswers(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = {
    deviation: raw.deviation,
    choice: raw.choice === undefined ? null : raw.choice,
    risk: raw.risk === undefined ? null : raw.risk,
    substitution: raw.substitution === undefined ? null : raw.substitution,
    system: raw.system,
  };
  if (!JC_DEVIATION_KEYS.includes(a.deviation)) return null;
  if (!JC_SYSTEM_KEYS.includes(a.system)) return null;
  if (a.deviation !== 'departure') {
    if (a.choice !== null || a.risk !== null || a.substitution !== null) return null;
    return a;
  }
  if (!JC_CHOICE_KEYS.includes(a.choice)) return null;
  if (a.choice === 'intended') {
    if (!JC_RISK_KEYS.includes(a.risk)) return null;
  } else if (a.risk !== null) {
    return null;
  }
  if (!JC_SUBSTITUTION_KEYS.includes(a.substitution)) return null;
  return a;
}

/** A decision or revision row is readable only when every owed question is answered. */
export function justCultureDecisionReadable(answers, response, departureReason, systemAction) {
  if (!answers || justCultureExpectation(answers).pending.length) return { ok: false, why: 'answers-incomplete' };
  if (!JC_RESPONSE_KEYS.includes(response)) return { ok: false, why: 'response-unknown' };
  const expected = justCultureExpectation(answers).response;
  if (response !== expected && jcText(departureReason, L.noteMax).length < L.noteMin) return { ok: false, why: 'mismatch-unexplained' };
  if (answers.system === 'present' && jcText(systemAction, L.noteMax).length < L.noteMin) return { ok: false, why: 'system-action-missing' };
  return { ok: true, why: null };
}

/**
 * Load stored reviews. A review names one person, one deciding manager and the
 * event. Its owner is a declared line, never a guess: a review whose decider is
 * the person, or whose opener is the person, is refused.
 */
export function normalizeJustCultureReviews(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  list.forEach((raw, index) => {
    if (index >= L.reviews) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = jcText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; return; }
    const personId = jcText(raw.personId, L.personIdMax);
    const openedById = jcText(raw.openedById, L.personIdMax);
    const decidingManagerId = jcText(raw.decidingManagerId, L.personIdMax);
    if (!personId || !openedById || !decidingManagerId) { dropped += 1; return; }
    if (decidingManagerId === personId || openedById === personId) { dropped += 1; return; }
    const eventOn = jcDay(raw.eventOn);
    const openedOn = jcDay(raw.openedOn);
    if (!eventOn || !openedOn || eventOn > openedOn) { dropped += 1; return; }
    const eventSummary = jcText(raw.eventSummary, L.summaryMax);
    if (eventSummary.length < L.summaryMin) { dropped += 1; return; }
    const eventRef = jcText(raw.eventRef, L.refMax);
    seen.add(id);
    kept.push({ id, personId, eventOn, openedOn, openedById, decidingManagerId, eventSummary, eventRef });
  });
  if (dropped) warnings.push(`Just Culture reviews: refused ${dropped} unreadable or duplicate review row(s); no review was repaired, re-dated or re-owned.`);
  return kept;
}

/**
 * Load stored acts, append-only, in the order they were written. An act that
 * breaks the sequence (a decision after a withdrawal, a concurrence before any
 * decision, a second concurrence from the same line on the same decision) is refused
 * with the rest of the review's history intact.
 */
export function normalizeJustCultureActs(value, reviews = [], warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const byReview = new Map(reviews.map((review) => [review.id, review]));
  const state = new Map();
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  let dangling = 0;
  list.forEach((raw) => {
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = jcText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; return; }
    const reviewId = jcText(raw.reviewId, 80);
    const review = byReview.get(reviewId);
    if (!review) { dangling += 1; return; }
    if (raw.personId !== review.personId) { dropped += 1; return; }
    const kind = JC_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
    const on = jcDay(raw.on);
    const byId = jcText(raw.byId, L.personIdMax);
    if (!kind || !on || !byId || on < review.openedOn) { dropped += 1; return; }
    const st = state.get(reviewId) || { acts: 0, decisions: 0, withdrawn: false, lastOn: null, concurred: new Set() };
    if (st.withdrawn || st.acts >= L.actsPerReview) { dropped += 1; return; }
    if (st.lastOn && on < st.lastOn) { dropped += 1; return; }
    const note = jcText(raw.note, L.noteMax);
    let answers = null;
    let response = null;
    let departureReason = '';
    let systemAction = '';
    if (kind === 'decided' || kind === 'revised') {
      if ((kind === 'decided') !== (st.decisions === 0)) { dropped += 1; return; }
      answers = normalizeJustCultureAnswers(raw.answers);
      response = JC_RESPONSE_KEYS.includes(raw.response) ? raw.response : null;
      departureReason = jcText(raw.departureReason, L.noteMax);
      systemAction = jcText(raw.systemAction, L.noteMax);
      if (!justCultureDecisionReadable(answers, response, departureReason, systemAction).ok) { dropped += 1; return; }
      if (note.length < L.noteMin) { dropped += 1; return; }
      st.decisions += 1;
      st.concurred = new Set();
    } else if (kind === 'concurred' || kind === 'dissented') {
      if (st.decisions === 0) { dropped += 1; return; }
      if (st.concurred.has(byId)) { dropped += 1; return; }
      if (kind === 'dissented' && note.length < L.noteMin) { dropped += 1; return; }
      st.concurred.add(byId);
    } else {
      // withdrawn
      if (st.decisions > 0 || note.length < L.noteMin) { dropped += 1; return; }
      st.withdrawn = true;
    }
    st.acts += 1;
    st.lastOn = on;
    state.set(reviewId, st);
    seen.add(id);
    kept.push({
      id, reviewId, personId: review.personId, kind, on, byId,
      answers,
      response,
      departureReason: departureReason || '',
      systemAction: systemAction || '',
      note,
    });
  });
  if (dropped || dangling) {
    warnings.push(`Just Culture acts: refused ${dropped} out-of-sequence or unreadable act(s)${dangling ? ` and ${dangling} act(s) naming a review this record does not hold` : ''}; no act was completed, re-dated or re-attributed.`);
  }
  return kept;
}
