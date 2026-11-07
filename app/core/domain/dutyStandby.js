/**
 * app/core/domain/dutyStandby.js — the pure engine for Cover acknowledgement
 * (ADR-0127, Schema v116, `#/standby`).
 *
 * ONE QUESTION, ASKED FROM BOTH SIDES
 * ----------------------------------
 * ADR-0121's register is written from the HOLDER's chair: "if I am not here, who
 * answers for this duty?" ADR-0127 adds the chair that was missing:
 *
 *     as the person who would answer — "what have I been asked to stand behind,
 *     for which dates, and have I said yes?"
 *     as the person who asked — "of the covers I have named in my span, who has
 *     answered, who has refused, and who has not answered at all?"
 *
 * The second question is the director's. It is not decoration: a named cover who
 * has not answered is a duty one absence away from stopping, and until this
 * module existed the register could not tell that person apart from one who had
 * said yes.
 *
 * WHAT IS DERIVED, AND WHY IT MUST BE
 * -----------------------------------
 * For every active declared cover:
 *
 *   askedOn      the day of the declaration (ADR-0121's row) — the ask happened
 *                whether or not anyone recorded a telling, so the clock starts
 *                there and nowhere else;
 *   askWindow    the bounded window the cover is being asked about. If the duty
 *                holder has a dated absence (ADR-0122), it is exactly that
 *                window — the ask is about the dates that are actually empty. If
 *                they do not, it is `[today, today + dutyStandbyWindowDays]`,
 *                because "be my stand-in, indefinitely" is not an ask anyone can
 *                answer honestly;
 *   answer       the active acknowledgement (ADR-0127 row), if any;
 *   state        accepted | declined | lapsed | overdue | awaiting — a function
 *                of the answer, the askWindow, the declared response deadline and
 *                today. NOT a stored field, here or anywhere else.
 *
 * `lapsed` is the state that makes the module honest about time: a cover who said
 * yes to 5–9 July has not said yes to a leave week moved to September. The
 * register will not quietly extend someone else's consent, and it will not read a
 * stale yes as readiness.
 *
 * REFUSALS ARE PRINTED, NOT ZEROED
 * --------------------------------
 * "Nobody is waiting for an answer" and "this register cannot see who is waiting"
 * are different claims. A span with no declared cover refuses to grade standby; a
 * seat holding no duty line says so; a cover who cannot see the row's span is not
 * counted rather than assumed silent.
 *
 * Pure module: no storage, no DOM, no clock beyond the injected `now`.
 */

import { activeSeat, buildSeats } from './seat.js';
import { harvestWork } from './chain.js';
import { addDays, dayKey, daysBetween } from '../time.js';
import { activeAbsenceFor, parseAbsenceWindow } from './dutyAbsenceSchema.js';
import { dutyReading, dutiesForSeat } from './dutyCoverage.js';
import {
  activeAnswerFor,
  normalizeDutyStandbySettings,
} from './dutyStandbySchema.js';
import {
  DUTY_STANDBY_BOUNDS,
  DUTY_STANDBY_DEFAULTS,
  DUTY_STANDBY_LIMITS,
  DUTY_STANDBY_PREMISE,
  DUTY_STANDBY_REFUSALS,
} from './dutyStandbyRegistry.js';

const round1 = (n) => Math.round(n * 10) / 10;

/** The two declared conventions, clamped, resolved against the workspace settings. */
export function dutyStandbyConventions(settings = {}) {
  return normalizeDutyStandbySettings(settings, DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS);
}

/**
 * The window a cover is being asked about, derived — never stored.
 *
 * A holder's declared absence is the exact ask: the dates the seat will not be
 * there. Without one, the ask is a bounded forward window, because an answer has
 * to be about something a person can look at in a calendar.
 */
export function askWindowFor(state, seat, { now = new Date(), settings = null } = {}) {
  const conv = dutyStandbyConventions(settings || state?.settings || {});
  const absence = activeAbsenceFor(state?.absencePlans, seat?.id);
  if (absence) {
    const window = parseAbsenceWindow(absence);
    if (window) {
      return {
        from: window.from,
        to: window.to,
        days: (daysBetween(window.from, window.to) ?? 0) + 1,
        basis: 'declared-absence',
        absenceId: absence.id,
        reason: absence.reason || '',
      };
    }
  }
  const today = dayKey(now);
  return {
    from: today,
    to: addDays(today, conv.dutyStandbyWindowDays),
    days: conv.dutyStandbyWindowDays + 1,
    basis: 'rolling-window',
    absenceId: null,
    reason: '',
  };
}

/**
 * Grade ONE declared cover row against its acknowledgement and its ask window.
 *
 * `namesVisible` is not consulted here: the caller has already decided what it may
 * put on screen. This function returns the cover id either way, because the
 * DERIVED reading needs the id to key the answer; the redaction seam nulls it.
 */
function gradeCover({ row, answer, askWindow, today, responseDays }) {
  const askedOn = row.declaredOn;
  const askedAgeDays = daysBetween(askedOn, today);
  const deadlineOn = addDays(askedOn, responseDays);
  const deadlinePassed = deadlineOn ? deadlineOn < today : false;

  if (!answer) {
    const state = deadlinePassed ? 'overdue' : 'awaiting';
    return {
      state,
      answeredOn: null,
      answeredAt: null,
      answerNote: null,
      answerWindow: null,
      deadlineOn,
      askedAgeDays,
      dayAfterDeadline: deadlinePassed ? daysBetween(deadlineOn, today) : null,
      stateReason: deadlinePassed
        ? `Declared ${askedOn}; the declared response deadline of ${responseDays} day(s) passed on ${deadlineOn} and the named cover has not answered. The register prints “overdue”, not “covered”: a duty nobody agreed to stand behind is a duty one absence away from stopping.`
        : `Declared ${askedOn}; the named cover has not answered yet. The declared response deadline is ${deadlineOn} (${responseDays} day(s) after the declaration).`,
    };
  }

  const answerWindow = { from: answer.windowFrom, to: answer.windowTo };
  const coversAsk = answerWindow.from <= askWindow.from && answerWindow.to >= askWindow.to;
  const sameWindow = answerWindow.from === askWindow.from && answerWindow.to === askWindow.to;
  const answerText = `${answer.windowFrom} → ${answer.windowTo}`;

  if (answer.answer === 'declined') {
    return {
      state: 'declined',
      answeredOn: answer.answeredOn,
      answeredAt: answer.answeredAt,
      answerNote: answer.note || '',
      answerWindow,
      deadlineOn,
      askedAgeDays,
      dayAfterDeadline: null,
      stateReason: `The named cover declined on ${answer.answeredOn} for ${answerText}${answer.note ? `: “${answer.note}”` : '.'} A refusal is a recorded answer, and the governed decision opened with it names what stops unless another cover is declared.`,
    };
  }

  // accepted
  if (coversAsk) {
    return {
      state: 'accepted',
      answeredOn: answer.answeredOn,
      answeredAt: answer.answeredAt,
      answerNote: answer.note || '',
      answerWindow,
      deadlineOn,
      askedAgeDays,
      dayAfterDeadline: null,
      stateReason: sameWindow
        ? `The named cover accepted on ${answer.answeredOn} for exactly this window (${answerText}).`
        : `The named cover accepted on ${answer.answeredOn} for ${answerText}, which contains the ask window ${askWindow.from} → ${askWindow.to}.`,
    };
  }
  return {
    state: 'lapsed',
    answeredOn: answer.answeredOn,
    answeredAt: answer.answeredAt,
    answerNote: answer.note || '',
    answerWindow,
    deadlineOn,
    askedAgeDays,
    dayAfterDeadline: null,
    stateReason: `The named cover accepted on ${answer.answeredOn} for ${answerText}, which does NOT cover the ask window ${askWindow.from} → ${askWindow.to}. The answer has lapsed: consent does not move because the dates moved, so this needs re-asking rather than being read as readiness.`,
  };
}

/** Rank the states so a summary can print the worst one first without inventing a score. */
const STATE_SEVERITY = Object.freeze({ declined: 0, overdue: 1, lapsed: 2, awaiting: 3, accepted: 4 });
export function standbySeverity(state) {
  return STATE_SEVERITY[state] ?? 9;
}
export const STANDBY_STATE_LABELS = Object.freeze({
  accepted: 'accepted',
  declined: 'declined',
  lapsed: 'answer lapsed',
  overdue: 'overdue — no answer',
  awaiting: 'awaiting answer',
});

/**
 * Every declared cover in one seat's OUTGOING scope: the seat's own duty lines and
 * every declared duty line below it. This is the director/manager chair — "of the
 * covers I have named, who has answered?" — and it is deliberately built from the
 * same duty rows the register already grades, so the two screens cannot disagree.
 */
export function standbyAsks(state, built, seat, { now = new Date(), settings = null, items = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = dutyStandbyConventions(effective);
  const today = dayKey(now);
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const answers = Array.isArray(state?.dutyStandbyAnswers) ? state.dutyStandbyAnswers : [];

  const scopedSeats = seat.fullAccess
    ? built.seats.filter((s) => !s.isLeader)
    : [seat, ...built.seats.filter((s) => !s.isLeader && s.id !== seat.id && seat.scope.has(s.id))];

  const rows = [];
  for (const holder of scopedSeats) {
    for (const duty of dutiesForSeat(holder)) {
      const reading = dutyReading(state, built, holder, duty, {
        now, settings: effective, items: allItems,
      });
      if (!reading.covers.length) continue;
      const askWindow = askWindowFor(state, holder, { now, settings: effective });
      for (const cover of reading.covers) {
        // A revoked cover (or one whose person left the tree) is not an open ask;
        // the reading keeps it because the register prints ineligible covers, and
        // this board prints them with their state rather than hiding them.
        const answer = activeAnswerFor(answers, cover.id);
        const graded = gradeCover({
          row: cover, answer, askWindow, today, responseDays: conv.dutyStandbyResponseDays,
        });
        rows.push({
          dutyId: reading.dutyId,
          dutyKey: reading.key,
          dutyLabel: reading.label,
          openN: reading.openN,
          holderSeatId: holder.id,
          holderLabel: holder.label,
          holderRank: holder.rank,
          coverRowId: cover.id,
          coverSeatId: cover.coverId,
          coverName: cover.name,
          coverLabel: cover.label,
          coverRank: cover.rank,
          coverEligible: cover.eligible,
          coverExercised: cover.exercised,
          askedOn: cover.declaredOn,
          askWindow,
          answer: answer ? {
            id: answer.id,
            answer: answer.answer,
            note: answer.note,
            from: answer.windowFrom,
            to: answer.windowTo,
            answeredOn: answer.answeredOn,
            decisionId: answer.decisionId,
          } : null,
          ...graded,
        });
      }
    }
  }

  // Ordering: worst state first, then the oldest ask, then a stable tiebreak. A
  // director reads the top of this list on a Monday morning.
  rows.sort((a, b) => standbySeverity(a.state) - standbySeverity(b.state)
    || String(a.askedOn).localeCompare(String(b.askedOn))
    || String(a.dutyLabel).localeCompare(String(b.dutyLabel))
    || String(a.coverLabel).localeCompare(String(b.coverLabel)));

  const count = (s) => rows.filter((r) => r.state === s).length;
  const open = rows.filter((r) => r.state !== 'accepted');
  return {
    engineVersion: 'duty-standby-2026.11-v1',
    premise: DUTY_STANDBY_PREMISE,
    conventions: conv,
    today,
    askBasis: rows.length ? rows[0].askWindow.basis : null,
    rows: rows.slice(0, DUTY_STANDBY_LIMITS.rowCap),
    deferredN: Math.max(0, rows.length - DUTY_STANDBY_LIMITS.rowCap),
    allRowsN: rows.length,
    summary: {
      coversN: rows.length,
      acceptedN: count('accepted'),
      declinedN: count('declined'),
      lapsedN: count('lapsed'),
      overdueN: count('overdue'),
      awaitingN: count('awaiting'),
      openN: open.length,
      // The only rate this module prints, and it is about the REGISTER — the
      // share of declared covers whose named person has said yes to the ask in
      // front of them. It is never a statement about a person.
      acknowledgedPct: rows.length ? round1((count('accepted') / rows.length) * 100) : null,
      openOpenWorkN: open.reduce((sum, r) => sum + r.openN, 0),
      refusedOpenWorkN: rows.filter((r) => r.state === 'declined').reduce((sum, r) => sum + r.openN, 0),
    },
    refusal: rows.length ? null : DUTY_STANDBY_REFUSALS.noCovers,
  };
}

/**
 * The OTHER chair: what this seat has been asked to stand behind, and whether it
 * has answered. This is the surface the product never had, and it is the half
 * that makes the acknowledgement real rather than a compliance field.
 *
 * Only covers whose named person is the ACTING seat appear here. A manager cannot
 * answer on behalf of the director they named; a director cannot see another
 * director's inbox. An unresolved read-only seat refuses outright.
 */
export function standbyForCover(state, built, seat, { now = new Date(), settings = null, items = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = dutyStandbyConventions(effective);
  const today = dayKey(now);
  if (seat.readOnly) {
    return {
      engineVersion: 'duty-standby-2026.11-v1',
      premise: DUTY_STANDBY_PREMISE,
      conventions: conv,
      today,
      rows: [],
      summary: { assignedN: 0, acceptedN: 0, declinedN: 0, lapsedN: 0, overdueN: 0, awaitingN: 0, openN: 0 },
      refusal: DUTY_STANDBY_REFUSALS.unresolvedSeat,
    };
  }
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const answers = Array.isArray(state?.dutyStandbyAnswers) ? state.dutyStandbyAnswers : [];
  const rows = [];
  // Walk the duty lines that could possibly name this seat, then keep only the
  // rows where the acting seat IS the cover. A cover is only ever an in-span
  // descendant or an ancestor (ADR-0121's candidate rule), so this is exactly the
  // acting seat's own scope — never a peer branch. Reusing the one derivation
  // keeps the two chairs from disagreeing about the same row.
  const holders = seat.fullAccess
    ? built.seats.filter((s) => !s.isLeader)
    : built.seats.filter((s) => !s.isLeader && (s.id === seat.id || seat.scope.has(s.id)));
  for (const holder of holders) {
    for (const duty of dutiesForSeat(holder)) {
      const reading = dutyReading(state, built, holder, duty, { now, settings: effective, items: allItems });
      for (const cover of reading.covers) {
        if (cover.coverId !== seat.id) continue;
        const askWindow = askWindowFor(state, holder, { now, settings: effective });
        const answer = activeAnswerFor(answers, cover.id);
        const graded = gradeCover({
          row: cover, answer, askWindow, today, responseDays: conv.dutyStandbyResponseDays,
        });
        rows.push({
          dutyId: reading.dutyId,
          dutyKey: reading.key,
          dutyLabel: reading.label,
          dutyQuestion: reading.question,
          openN: reading.openN,
          holderSeatId: holder.id,
          holderLabel: holder.label,
          holderName: holder.name,
          holderRank: holder.rank,
          coverRowId: cover.id,
          coverLabel: cover.label,
          coverRank: cover.rank,
          coverEligible: cover.eligible,
          askedOn: cover.declaredOn,
          declaredBy: cover.declaredBySeatId,
          askWindow,
          answer: answer ? {
            id: answer.id,
            answer: answer.answer,
            note: answer.note,
            from: answer.windowFrom,
            to: answer.windowTo,
            answeredOn: answer.answeredOn,
            decisionId: answer.decisionId,
          } : null,
          ...graded,
        });
      }
    }
  }
  rows.sort((a, b) => standbySeverity(a.state) - standbySeverity(b.state)
    || String(a.askedOn).localeCompare(String(b.askedOn))
    || String(a.dutyLabel).localeCompare(String(b.dutyLabel)));
  const count = (s) => rows.filter((r) => r.state === s).length;
  return {
    engineVersion: 'duty-standby-2026.11-v1',
    premise: DUTY_STANDBY_PREMISE,
    conventions: conv,
    today,
    rows,
    addedWorkN: rows.reduce((sum, r) => sum + r.openN, 0),
    summary: {
      assignedN: rows.length,
      acceptedN: count('accepted'),
      declinedN: count('declined'),
      lapsedN: count('lapsed'),
      overdueN: count('overdue'),
      awaitingN: count('awaiting'),
      openN: rows.filter((r) => r.state !== 'accepted').length,
    },
    refusal: rows.length ? null
      : (dutiesForSeat(seat).length
        ? 'No duty line in this span names this seat as a declared cover. When someone does, the ask appears here with the dates it is about.'
        : DUTY_STANDBY_REFUSALS.noDuties),
  };
}

/**
 * The counts-only line the upward brief carries. Identity-free by construction:
 * no seat id, no person name, no duty label, no note text.
 */
export function standbyBriefLines(board) {
  if (!board || !board.summary.coversN) return [];
  const s = board.summary;
  return [
    `Cover acknowledgement: ${s.coversN} declared cover(s) in this span — ${s.acceptedN} accepted, ${s.declinedN} declined, ${s.lapsedN} lapsed, ${s.overdueN} overdue with no answer, ${s.awaitingN} still awaiting. ${s.openOpenWorkN} open work item(s) sit behind a cover who has not accepted the ask in front of them.${s.acknowledgedPct !== null ? ` Acknowledged ${s.acknowledgedPct}% — this measures the REGISTER (the named person said yes to this window), not any person's willingness.` : ''}`,
    '  · A declared cover is an ask, not an answer. Nothing here chases anyone: the register names who has not answered and opens a governed decision when a cover refuses.',
  ];
}

/**
 * Counts-only exposure for the roll-up at every altitude — the same shape the seat
 * digest already consumes, so the badge and the brief cannot disagree about how
 * many answers are outstanding.
 */
export function dutyStandbyAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const effective = settings || state?.settings || null;
    const built = buildSeats(state, { now, settings: effective });
    const seat = activeSeat(built);
    if (seat.readOnly) return 0;
    const board = standbyAsks(state, built, seat, { now, settings: effective });
    // Only the states that are actually actionable this week: a refusal and an
    // unanswered ask past its deadline. "Awaiting" inside the deadline is a
    // normal Monday, and counting it as attention is how a badge becomes noise.
    return board.summary.declinedN + board.summary.overdueN;
  } catch {
    return 0;
  }
}

/* --------------------------------------------------------------- helpers used by the view */

/** Duty lines whose only declared covers have REFUSED — the concrete exposure a director acts on. */
export function refusedOnlyDuties(board) {
  if (!board || !board.rows?.length) return [];
  const byDuty = new Map();
  for (const row of board.rows) {
    if (!byDuty.has(row.dutyId)) byDuty.set(row.dutyId, []);
    byDuty.get(row.dutyId).push(row);
  }
  const out = [];
  for (const [dutyId, rows] of byDuty) {
    const live = rows.filter((r) => r.coverEligible !== false);
    if (!live.length) continue;
    if (live.every((r) => r.state === 'declined')) {
      out.push({
        dutyId,
        dutyLabel: rows[0].dutyLabel,
        holderLabel: rows[0].holderLabel,
        holderSeatId: rows[0].holderSeatId,
        openN: rows[0].openN,
        coversN: live.length,
        askWindow: rows[0].askWindow,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ export */

/**
 * The board as an EXPORT sees it: built under the active seat exactly the way
 * the screen builds it, so the file and the screen cannot disagree about who has
 * answered. Identities are dropped AT CONSTRUCTION — no name, no seat id, no duty
 * label and no note text ever reaches `standbyCsvRows`.
 */
export function standbyExportBoard(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const built = buildSeats(state, { now, settings: effective });
  const seat = activeSeat(built);
  if (seat.readOnly) {
    return {
      scope: 'read-only', altitude: '', today: dayKey(now), rows: [], refusedOnly: [],
      summary: { coversN: 0, acceptedN: 0, declinedN: 0, lapsedN: 0, overdueN: 0, awaitingN: 0, acknowledgedPct: null },
      refusal: DUTY_STANDBY_REFUSALS.unresolvedSeat,
    };
  }
  const board = standbyAsks(state, built, seat, { now, settings: effective });
  return {
    scope: seat.fullAccess ? 'operator' : `rank-${seat.rank}`,
    altitude: seat.altitudeKey || '',
    today: board.today,
    askBasis: board.askBasis,
    rows: board.rows,
    refusedOnly: refusedOnlyDuties(board),
    summary: board.summary,
    refusal: board.refusal,
  };
}

/**
 * Aggregate-only CSV rows. Three row kinds:
 *   standby       one per declared cover in scope (ranks, dates, derived state)
 *   standby-gap   one per duty line whose ONLY live declared covers declined
 *   standby-summary one board row
 *
 * A row that is not `accepted` exports BLANK rate columns. Zero would read as "no
 * cover is acknowledged anywhere", which is a different and much stronger claim
 * than "this one has not answered yet".
 */
export function standbyCsvRows(board) {
  if (!board) return [];
  const rows = [];
  const age = (day, today) => (day && today ? daysBetween(day, today) : '');
  for (const row of board.rows || []) {
    rows.push({
      row_kind: 'standby',
      scope: board.scope,
      altitude: board.altitude,
      standby_state: row.state,
      holder_rank: row.holderRank ?? '',
      cover_rank: row.coverRank ?? '',
      cover_eligible: row.coverEligible ? 'yes' : 'no',
      asserted_from: row.askWindow?.from || '',
      asserted_to: row.askWindow?.to || '',
      ask_basis: row.askWindow?.basis || '',
      asked_on: row.askedOn || '',
      days_since_asked: age(row.askedOn, board.today),
      response_deadline_on: row.deadlineOn || '',
      days_past_deadline: row.dayAfterDeadline === null || row.dayAfterDeadline === undefined ? '' : row.dayAfterDeadline,
      answered_on: row.answeredOn || '',
      answer_window_from: row.answerWindow?.from || '',
      answer_window_to: row.answerWindow?.to || '',
      answer_age_days: age(row.answeredOn, board.today),
      open_n: row.openN,
      covers_n: 1,
      rate_acknowledged_pct: row.state === 'accepted' ? 100 : '',
      refused_reason: row.state === 'accepted' ? '' : String(row.stateReason || '').slice(0, 200),
    });
  }
  for (const gap of board.refusedOnly || []) {
    rows.push({
      row_kind: 'standby-gap',
      scope: board.scope,
      altitude: board.altitude,
      standby_state: 'refused-only',
      holder_rank: '',
      cover_rank: '',
      cover_eligible: '',
      asserted_from: gap.askWindow?.from || '',
      asserted_to: gap.askWindow?.to || '',
      ask_basis: gap.askWindow?.basis || '',
      asked_on: '',
      days_since_asked: '',
      response_deadline_on: '',
      days_past_deadline: '',
      answered_on: '',
      answer_window_from: '',
      answer_window_to: '',
      answer_age_days: '',
      open_n: gap.openN,
      covers_n: gap.coversN,
      rate_acknowledged_pct: '',
      refused_reason: `Every eligible declared cover for this duty line declined for ${gap.askWindow?.from} → ${gap.askWindow?.to}. ${gap.openN} open item(s) have nobody answerable on those dates.`,
    });
  }
  const s = board.summary || {};
  rows.push({
    row_kind: 'standby-summary',
    scope: board.scope,
    altitude: board.altitude,
    standby_state: '',
    holder_rank: '',
    cover_rank: '',
    cover_eligible: '',
    asserted_from: '',
    asserted_to: '',
    ask_basis: board.askBasis || '',
    asked_on: '',
    days_since_asked: '',
    response_deadline_on: '',
    days_past_deadline: '',
    answered_on: '',
    answer_window_from: '',
    answer_window_to: '',
    answer_age_days: '',
    open_n: s.openOpenWorkN ?? '',
    covers_n: s.coversN ?? 0,
    rate_acknowledged_pct: s.acknowledgedPct === null || s.acknowledgedPct === undefined ? '' : s.acknowledgedPct,
    refused_reason: board.refusal ? String(board.refusal).slice(0, 200) : '',
  });
  return rows;
}
