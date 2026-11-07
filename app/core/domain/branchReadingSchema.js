/**
 * app/core/domain/branchReadingSchema.js — fail-closed normalizers for the
 * Branch Reading hand-off (ADR-0129, Schema v118).
 *
 * WHAT IS STORED, AND WHAT MUST NEVER BE
 * --------------------------------------
 * A `branchReadingAsks` row stores exactly the chief's act and its provenance:
 *   targetSeatId    the branch leader the reading was requested OF (one level
 *                   down from the requesting seat — never a person further in),
 *   askedBySeatId   the seat whose own table withholds the cell,
 *   askedOn/askedAt the day and instant the ask was made,
 *   note            the asker's own words (why the reading is needed),
 *   status          open | withdrawn, with the withdrawal day and reason.
 *
 * A `branchReadings` row stores exactly the branch leader's ANSWER:
 *   askId             the ask it answers,
 *   branchSeatId      the branch the reading is about (must be the ask's target),
 *   answeredBySeatId  the person who answered (must be the ask's target — a
 *                     third party cannot publish on a branch's behalf),
 *   answer            published | declined,
 *   band              the DERIVED band, frozen on the day, present only on a
 *                     publish and only from the declared vocabulary,
 *   note              the answerer's own words, verbatim and clamped,
 *   status            active | revoked, with the revocation day and reason.
 *
 * What it never stores: a count, a rate, a percentage, a per-duty figure, the
 * derived asked / overdue / published / lapsed state, a reminder that was sent,
 * or a copy of another module's record. The band is the whole disclosure and
 * the counts behind it stay in the branch's own register, which the chief
 * cannot read at cell granularity — that is the point of the hand-off.
 *
 * A malformed row is DROPPED with a printed warning, never repaired into a
 * plausible-looking reading: an invented disclosure is a disclosure nobody
 * authorised, and a forged one is worse than a blank.
 */

import {
  BRANCH_READING_ANSWERS,
  BRANCH_READING_ASK_STATUSES,
  BRANCH_READING_BANDS,
  BRANCH_READING_ENGINE_VERSION,
  BRANCH_READING_LIMITS,
} from './branchReadingRegistry.js';
import { addDays, dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.trim()) ? value.trim() : null;
}

function stamp(value) {
  const s = text(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function versionOf(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : BRANCH_READING_ENGINE_VERSION;
}

/**
 * The ask ledger. An ask addressed to its own author, or to a person who is no
 * longer on the roster, is corruption rather than a request: dropped with a
 * printed warning, because a reading about nobody is not a hand-off.
 */
export function normalizeBranchReadingAsks(value, people = null, warnings = []) {
  if (!Array.isArray(value)) return [];
  const known = Array.isArray(people) && people.length
    ? new Set(people.filter((p) => p && typeof p.id === 'string').map((p) => p.id))
    : null;
  const seen = new Set();
  const out = [];
  const openPerTarget = new Map();
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Branch reading: dropped a malformed ask row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const targetSeatId = id(raw.targetSeatId);
    const askedBySeatId = id(raw.askedBySeatId);
    const askedOn = day(raw.askedOn);
    const askedAt = stamp(raw.askedAt);
    const status = BRANCH_READING_ASK_STATUSES.includes(raw.status) ? raw.status : null;
    if (!rowId || !targetSeatId || !askedBySeatId || !askedOn || !askedAt || !status) {
      warnings.push('Branch reading: dropped an incomplete ask row; no request was inferred.');
      continue;
    }
    if (targetSeatId === askedBySeatId) {
      warnings.push('Branch reading: dropped an ask a seat addressed to itself. A reading is about a branch below the asking seat.');
      continue;
    }
    // The workspace leader is a SYNTHETIC seat derived from the settings, not a
    // row in `people`, so it is always a legitimate asker and target. Any other
    // id must exist on the roster: a request about a seat nobody holds is a
    // request about nothing.
    const onRoster = (seatId) => seatId === LEADER_ID || !known || known.has(seatId);
    if (!onRoster(targetSeatId) || !onRoster(askedBySeatId)) {
      warnings.push('Branch reading: dropped an ask naming a seat that is not on this roster.');
      continue;
    }
    if (seen.has(rowId)) {
      warnings.push('Branch reading: dropped a duplicate ask id.');
      continue;
    }
    seen.add(rowId);
    if (status === 'open') {
      // One open ask per branch per requesting seat. A second open ask is a
      // duplicate micro-instruction, not a new question: the first is withdrawn.
      const key = `${askedBySeatId}|${targetSeatId}`;
      if (openPerTarget.has(key)) {
        warnings.push('Branch reading: dropped a second open ask for one branch from the same seat. Withdraw the first instead of stacking asks.');
        continue;
      }
      openPerTarget.set(key, rowId);
    }
    if (out.length >= BRANCH_READING_LIMITS.askCap) {
      warnings.push('Branch reading: ask ledger cap reached; additional asks were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      targetSeatId,
      askedBySeatId,
      askedOn,
      askedAt,
      note: text(raw.note, BRANCH_READING_LIMITS.noteChars),
      status,
      withdrawnOn: day(raw.withdrawnOn),
      withdrawnAt: stamp(raw.withdrawnAt),
      withdrawReason: text(raw.withdrawReason, BRANCH_READING_LIMITS.reasonChars),
      version: versionOf(raw.version),
    });
  }
  return out;
}

/**
 * The answer ledger. Four structural corruptions are refused at load:
 *   - an answer whose ask does not exist (an orphan is not an answer);
 *   - an answer given by anyone other than the branch the ask named — one
 *     person cannot publish a reading for another's branch, and the schema is
 *     the only place that can see both ledgers at once;
 *   - an answer dated before the ask it answers (nothing was asked then, so
 *     nothing could have been answered);
 *   - a published reading with no band, a band outside the declared vocabulary,
 *     or a decline carrying a band — a disclosure and a refusal are different
 *     acts and neither may borrow the other's shape.
 */
export function normalizeBranchReadings(value, asks = [], warnings = []) {
  if (!Array.isArray(value)) return [];
  const askById = new Map(
    (Array.isArray(asks) ? asks : [])
      .filter((a) => a && typeof a.id === 'string')
      .map((a) => [a.id, a]),
  );
  const activePerAsk = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) {
      warnings.push('Branch reading: dropped a malformed answer row (not an object).');
      continue;
    }
    const rowId = id(raw.id);
    const askId = id(raw.askId);
    const branchSeatId = id(raw.branchSeatId);
    const answeredBySeatId = id(raw.answeredBySeatId);
    const answer = BRANCH_READING_ANSWERS.includes(raw.answer) ? raw.answer : null;
    const answeredOn = day(raw.answeredOn);
    const answeredAt = stamp(raw.answeredAt);
    const status = raw.status === 'active' || raw.status === 'revoked' ? raw.status : null;
    const band = raw.band === null || raw.band === undefined ? null : raw.band;
    const note = text(raw.note, BRANCH_READING_LIMITS.noteChars);
    if (!rowId || !askId || !branchSeatId || !answeredBySeatId || !answer || !answeredOn || !answeredAt || !status) {
      warnings.push('Branch reading: dropped an incomplete answer row; no reading was inferred.');
      continue;
    }
    if (note.length < BRANCH_READING_LIMITS.minWords) {
      warnings.push('Branch reading: dropped a wordless answer. A band with no words is a tick, not a reading.');
      continue;
    }
    if (answer === 'published' && !BRANCH_READING_BANDS.includes(band)) {
      warnings.push('Branch reading: dropped a published reading whose band is not in the declared vocabulary.');
      continue;
    }
    if (answer === 'declined' && band !== null) {
      warnings.push('Branch reading: dropped a refusal carrying a band. A decline states no condition of the branch.');
      continue;
    }
    const ask = askById.get(askId);
    if (ask) {
      if (ask.targetSeatId !== answeredBySeatId || ask.targetSeatId !== branchSeatId) {
        warnings.push('Branch reading: dropped an answer given for a branch it was not asked about. A reading is published by the branch’s own leader.');
        continue;
      }
      if (answeredOn < ask.askedOn) {
        warnings.push('Branch reading: dropped an answer dated before the ask it answers.');
        continue;
      }
    } else {
      warnings.push('Branch reading: dropped an answer whose ask no longer exists.');
      continue;
    }
    if (status === 'active') {
      if (activePerAsk.has(askId)) {
        warnings.push('Branch reading: dropped a second active answer for one ask. Revoke the first instead of stacking disclosures.');
        continue;
      }
      activePerAsk.add(askId);
    }
    if (out.length >= BRANCH_READING_LIMITS.readingCap) {
      warnings.push('Branch reading: answer ledger cap reached; additional readings were not loaded.');
      break;
    }
    out.push({
      id: rowId,
      askId,
      branchSeatId,
      answeredBySeatId,
      answer,
      band: answer === 'published' ? band : null,
      note,
      answeredOn,
      answeredAt,
      status,
      revokedOn: day(raw.revokedOn),
      revokedAt: stamp(raw.revokedAt),
      revokeReason: text(raw.revokeReason, BRANCH_READING_LIMITS.reasonChars),
      version: versionOf(raw.version),
    });
  }
  return out;
}

/** The active answer for one ask, or null. Latest wins by answered instant. */
export function activeAnswerForAsk(readings, askId) {
  if (!Array.isArray(readings)) return null;
  const rows = readings.filter((r) => r && r.askId === askId && r.status === 'active');
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => (a.answeredAt < b.answeredAt ? 1 : a.answeredAt > b.answeredAt ? -1 : 0))[0];
}

/** The latest ask one seat made about one branch, or null. Latest by asked instant. */
export function latestAskFor(asks, askedBySeatId, targetSeatId) {
  if (!Array.isArray(asks)) return null;
  const rows = asks.filter((a) => a && a.askedBySeatId === askedBySeatId && a.targetSeatId === targetSeatId);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => (a.askedAt < b.askedAt ? 1 : a.askedAt > b.askedAt ? -1 : 0))[0];
}

/**
 * DERIVE the state of one ask — never stored.
 *
 * `asked` / `overdue` are a clock over the phrase "answer by"; `published` /
 * `lapsed` are a clock over the validity of a disclosure that was actually
 * made; `declined` and `withdrawn` are terminal until someone asks again. A
 * REVOKED answer is deliberately invisible here: a disclosure its own publisher
 * withdrew is not a disclosure, and the cell falls back to asked or overdue
 * rather than keeping a band nobody still stands behind.
 */
export function deriveReadingState(ask, answer, { today, responseDays, validDays } = {}) {
  const at = dayKey(today);
  if (!ask) {
    return {
      state: 'not-asked',
      why: 'No reading has been requested from this branch. The cell is withheld, so the table prints no figure for it — and silence is not a clean bill of health.',
    };
  }
  const base = { askedOn: ask.askedOn, askNote: ask.note, responseBy: addDays(ask.askedOn, responseDays) };
  if (ask.status === 'withdrawn') {
    return {
      ...base,
      state: 'withdrawn',
      why: `The request was withdrawn on ${ask.withdrawnOn || 'an unrecorded day'}${ask.withdrawReason ? `: ${ask.withdrawReason}` : '.'}`,
    };
  }
  const live = answer && answer.status === 'active' ? answer : null;
  if (live && live.answer === 'declined') {
    return {
      ...base,
      state: 'declined',
      answeredOn: live.answeredOn,
      answerNote: live.note,
      why: `Declined by the branch’s own leader on ${live.answeredOn}: ${live.note}`,
    };
  }
  if (live && live.answer === 'published') {
    const age = daysBetween(live.answeredOn, at);
    if (age > validDays) {
      return {
        ...base,
        state: 'lapsed',
        publishedOn: live.answeredOn,
        band: live.band,
        ageDays: age,
        answerNote: live.note,
        why: `The reading published on ${live.answeredOn} (${live.band}) is ${age} day(s) old and past the declared ${validDays}-day validity. A reading about July is not a reading about September — ask again.`,
      };
    }
    return {
      ...base,
      state: 'published',
      publishedOn: live.answeredOn,
      band: live.band,
      ageDays: age,
      validUntil: addDays(live.answeredOn, validDays),
      answerNote: live.note,
      why: `The branch’s own leader published this reading on ${live.answeredOn}; it is valid until ${addDays(live.answeredOn, validDays)}.`,
    };
  }
  const past = daysBetween(base.responseBy, at);
  if (past > 0) {
    return {
      ...base,
      state: 'overdue',
      daysPast: past,
      why: `Asked on ${ask.askedOn}; the declared response window closed on ${base.responseBy}, ${past} day(s) ago, with no answer recorded.`,
    };
  }
  return {
    ...base,
    state: 'asked',
    daysLeft: Math.max(0, -past),
    why: `Asked on ${ask.askedOn}; an answer is expected by ${base.responseBy}. An ask inside its window is a normal Monday, not a finding.`,
  };
}
