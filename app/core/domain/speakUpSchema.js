/**
 * app/core/domain/speakUpSchema.js — the fail-closed loaders of the Speak-Up
 * Concern Routing & Impartiality Register (ADR-0215, Schema v169).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a value, clamps a window or guesses a category: a row
 * that cannot be read exactly is DROPPED with a COUNTED warning, and the panel
 * prints the count. The alternative — a plausible default — would put a concern
 * on the register that nobody raised, or move the day a promise was made.
 *
 * WHY THE WINDOWS ARE COPIED ONTO THE ROW. `ackDays`, `feedbackDays` and
 * `watchDays` are stored on the concern on the day it is raised, not read from
 * the conventions at render time. A convention changed six months later must
 * never rewrite the promise that was made to that reporter, and the reader
 * prints both numbers when they disagree.
 *
 * A concern that names no reporter is a legitimate row, not a malformed one: the
 * statutory regimes this register implements all permit an anonymous report. It
 * is stored with `raisedById: null` and the reader then tests impartiality
 * against the subject alone.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  SPEAK_UP_BOUNDS,
  SPEAK_UP_CATEGORY_KEYS,
  SPEAK_UP_DEFAULTS,
  SPEAK_UP_LIMITS,
  SPEAK_UP_OUTCOME_KEYS,
  SPEAK_UP_ROUTE_KEYS,
  SPEAK_UP_SETTING_KEYS,
  SPEAK_UP_STATE_KEYS,
  SPEAK_UP_SUBJECT_KEYS,
  SPEAK_UP_WATCH_KEYS,
} from './speakUpRegistry.js';

const L = SPEAK_UP_LIMITS;

/** A real calendar day inside the register's range, or null. */
export function speakUpDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Whole days from one day key to another, or null when either is unreadable. */
export function speakUpDaysBetween(from, to) {
  if (!from || !to) return null;
  const n = daysBetween(`${from}T00:00:00.000Z`, `${to}T00:00:00.000Z`);
  return Number.isInteger(n) ? n : null;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function speakUpText(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A person id this record could hold, or null. */
export function speakUpPersonId(value) {
  const id = speakUpText(value, L.personIdMax);
  return id ? id : null;
}

function intInRange(value, [min, max], fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/**
 * The declared windows. A value outside its bounds falls back to the documented
 * default — never to zero and never to the bound it missed (a clamp would let a
 * typo silently shorten the promise).
 */
export function normalizeSpeakUpSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = SPEAK_UP_SETTING_KEYS;
  return {
    [key.ackDays]: intInRange(source[key.ackDays], SPEAK_UP_BOUNDS.ackDays, SPEAK_UP_DEFAULTS.ackDays),
    [key.feedbackDays]: intInRange(source[key.feedbackDays], SPEAK_UP_BOUNDS.feedbackDays, SPEAK_UP_DEFAULTS.feedbackDays),
    [key.watchDays]: intInRange(source[key.watchDays], SPEAK_UP_BOUNDS.watchDays, SPEAK_UP_DEFAULTS.watchDays),
    [key.autoPropagate]: source[key.autoPropagate] === undefined ? SPEAK_UP_DEFAULTS.autoPropagate : Boolean(source[key.autoPropagate]),
  };
}

/** The same conventions, read out by their short names for every consumer. */
export function readSpeakUpSettings({ settings = null } = {}) {
  const raw = normalizeSpeakUpSettings(settings || {});
  return {
    ackDays: raw[SPEAK_UP_SETTING_KEYS.ackDays],
    feedbackDays: raw[SPEAK_UP_SETTING_KEYS.feedbackDays],
    watchDays: raw[SPEAK_UP_SETTING_KEYS.watchDays],
    autoPropagate: raw[SPEAK_UP_SETTING_KEYS.autoPropagate],
  };
}

/* ----------------------------------------------------------------- concerns */

const ROUTE_SET = new Set(SPEAK_UP_ROUTE_KEYS);
const CATEGORY_SET = new Set(SPEAK_UP_CATEGORY_KEYS);
const SUBJECT_SET = new Set(SPEAK_UP_SUBJECT_KEYS);
const ACT_KINDS = new Set(['acknowledged', 'outcome', 'watch', 'closed', 'withdrawn']);

/**
 * Load stored concerns. A row that cannot be read exactly is dropped and
 * counted; a row is never repaired, and no field is defaulted into existence.
 */
export function normalizeConcernReports(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = speakUpText(raw.id, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const raisedOn = speakUpDay(raw.raisedOn);
    if (!raisedOn) { dropped += 1; continue; }
    const categoryKey = speakUpText(raw.categoryKey, 40);
    if (!CATEGORY_SET.has(categoryKey)) { dropped += 1; continue; }
    const subjectKind = speakUpText(raw.subjectKind, 20);
    if (!SUBJECT_SET.has(subjectKind)) { dropped += 1; continue; }
    const routeKey = speakUpText(raw.routeKey, 40);
    if (!ROUTE_SET.has(routeKey)) { dropped += 1; continue; }
    const summary = speakUpText(raw.summary, L.summaryMax);
    if (summary.length < L.summaryMin) { dropped += 1; continue; }
    const subjectPersonId = subjectKind === 'person' ? speakUpPersonId(raw.subjectPersonId) : null;
    if (subjectKind === 'person' && !subjectPersonId) { dropped += 1; continue; }
    const subjectLabel = subjectKind === 'practice' ? speakUpText(raw.subjectLabel, L.labelMax) : '';
    if (subjectKind === 'practice' && subjectLabel.length < L.labelMin) { dropped += 1; continue; }
    const receiverId = routeKey === 'internal-person' ? speakUpPersonId(raw.receiverId) : null;
    if (routeKey === 'internal-person' && !receiverId) { dropped += 1; continue; }
    const externalLabel = routeKey === 'external-declared' ? speakUpText(raw.externalLabel, L.externalLabelMax) : '';
    if (routeKey === 'external-declared' && externalLabel.length < L.labelMin) { dropped += 1; continue; }
    const raisedById = raw.raisedById === null || raw.raisedById === undefined ? null : speakUpPersonId(raw.raisedById);
    if (raw.raisedById !== null && raw.raisedById !== undefined && !raisedById) { dropped += 1; continue; }
    // No person is ever their own subject on a person concern.
    if (subjectKind === 'person' && raisedById && subjectPersonId === raisedById) { dropped += 1; continue; }
    const channelBasis = speakUpText(raw.channelBasis, L.basisMax);
    if (channelBasis.length < L.basisMin) { dropped += 1; continue; }
    seen.add(id);
    kept.push({
      id,
      raisedOn,
      raisedById,
      subjectKind,
      subjectPersonId: subjectKind === 'person' ? subjectPersonId : null,
      subjectLabel,
      categoryKey,
      routeKey,
      receiverId,
      externalLabel,
      channelBasis,
      summary,
      ackDays: intInRange(raw.ackDays, SPEAK_UP_BOUNDS.ackDays, SPEAK_UP_DEFAULTS.ackDays),
      feedbackDays: intInRange(raw.feedbackDays, SPEAK_UP_BOUNDS.feedbackDays, SPEAK_UP_DEFAULTS.feedbackDays),
      watchDays: intInRange(raw.watchDays, SPEAK_UP_BOUNDS.watchDays, SPEAK_UP_DEFAULTS.watchDays),
    });
  }
  if (dropped) {
    warnings.push(`Speak-up concerns: refused ${dropped} malformed or duplicate concern row(s); no concern was repaired, re-dated or given a receiver it did not record.`);
  }
  return kept;
}

/**
 * Load stored acts. An act must name a surviving concern and carry the field its
 * kind owns — an acknowledgement with no day, an outcome with no outcome key and
 * a watch with no verdict are dropped and counted, never completed.
 */
export function normalizeConcernActs(value, reports = [], warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const reportIds = new Set((Array.isArray(reports) ? reports : []).map((row) => row.id));
  const kept = [];
  const seen = new Set();
  const perReport = new Map();
  let dropped = 0;
  let dangling = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const id = speakUpText(raw.id, 80);
    const reportId = speakUpText(raw.reportId, 80);
    const kind = speakUpText(raw.kind, 20);
    const on = speakUpDay(raw.on);
    const byId = speakUpPersonId(raw.byId);
    if (!id || seen.has(id) || !reportId || !ACT_KINDS.has(kind) || !on || !byId) { dropped += 1; continue; }
    if (!reportIds.has(reportId)) { dangling += 1; continue; }
    const used = perReport.get(reportId) || 0;
    if (used >= L.actsPerReport) { dropped += 1; continue; }
    const outcomeKey = kind === 'outcome' ? speakUpText(raw.outcomeKey, 40) : null;
    if (kind === 'outcome' && !SPEAK_UP_OUTCOME_KEYS.includes(outcomeKey)) { dropped += 1; continue; }
    const verdictKey = kind === 'watch' ? speakUpText(raw.verdictKey, 40) : null;
    if (kind === 'watch' && !SPEAK_UP_WATCH_KEYS.includes(verdictKey)) { dropped += 1; continue; }
    const note = speakUpText(raw.note, L.noteMax);
    if (note.length < L.noteMin) { dropped += 1; continue; }
    seen.add(id);
    perReport.set(reportId, used + 1);
    kept.push({ id, reportId, kind, byId, on, outcomeKey, verdictKey, note });
  }
  if (dropped || dangling) {
    warnings.push(`Speak-up acts: refused ${dropped} malformed act(s)${dangling ? ` and ${dangling} act(s) naming a concern this record does not hold` : ''}; no act was completed, re-dated or re-attributed.`);
  }
  return kept;
}

/** Markers are identity-free observations. Only the shape is enforced. */
export function normalizeConcernMarkers(value) {
  const list = Array.isArray(value) ? value : [];
  return list.filter((row) => row && typeof row === 'object' && speakUpText(row.id, 80) && speakUpText(row.kind, 60))
    .map((row) => ({
      id: speakUpText(row.id, 80),
      kind: speakUpText(row.kind, 60),
      on: speakUpDay(row.on) || L.dayMin,
      count: Number.isSafeInteger(row.count) && row.count > 0 ? row.count : 1,
    }));
}

/* -------------------------------------------------------------- ask wiring */

/** A deterministic signature so one condition files one ask. */
export function speakUpSignature(kind, subject) {
  return `sup1:${kind}:${speakUpText(subject, 160)}`;
}

/**
 * The ask's text. Deliberately OPAQUE: no party, no category, no summary, no
 * date of the concern. A delegation is readable by seats above the receiver, so
 * an ask that described the concern would leak to exactly the people the route
 * was chosen to avoid. The receiver knows which register to open, and nobody
 * else learns anything from the spine.
 */
export function speakUpAskSummary(signature) {
  return `[RULE-SUP-01] A dated act is owed on an open register reference; open the speak-up register to record it. (${speakUpText(signature, 160)})`;
}

/** Read a signature back off a link summary, or null. */
export function parseSpeakUpAskSummary(summary) {
  const text = String(summary || '');
  const match = text.match(/\(sup1:[^)]+\)\s*$/);
  if (!match) return null;
  const signature = match[0].slice(1, -1);
  const parts = signature.split(':');
  if (parts.length < 3 || parts[0] !== 'sup1') return null;
  return { signature, kind: parts[1], subject: parts.slice(2).join(':') };
}

export const reportIsWithdrawn = (report, acts = []) => Boolean(report)
  && (acts || []).some((act) => act.reportId === report.id && act.kind === 'withdrawn');

export const firstActOfKind = (acts, reportId, kind) => (acts || [])
  .filter((act) => act.reportId === reportId && act.kind === kind)
  .sort((a, b) => (a.on === b.on ? String(a.id).localeCompare(String(b.id)) : a.on.localeCompare(b.on)))[0] || null;

/** The state vocabulary this loader can produce, re-exported for tests. */
export const SPEAK_UP_LOADABLE_STATES = Object.freeze([...SPEAK_UP_STATE_KEYS]);
