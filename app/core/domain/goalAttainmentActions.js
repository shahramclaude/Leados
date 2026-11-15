/**
 * app/core/domain/goalAttainmentActions.js — the seat-checked commands of the
 * Goal Attainment Period Close & Restatement Register (ADR-0206, Schema v160).
 *
 * THREE human acts and nothing else: CLOSE a declared, already-ended period onto
 * the record; ACKNOWLEDGE one exact restatement of it in writing; and set the
 * conventions / run the scan. No act edits a goal, a check-in, a due date, an
 * owner, a span or a previously closed figure.
 *
 * THE DOOR IS THE PRODUCT.
 *  - A period is closed only AFTER it has ended. Closing the quarter you are
 *    standing in freezes a figure that is still moving, which is the opposite of
 *    a period close.
 *  - Two closing acts may not report the same days. A period is closed once; a
 *    period that a later reader disagrees with is restated and acknowledged, not
 *    re-closed over the top of the original.
 *  - A close is REFUSED WHOLE when a goal due inside the period belongs to
 *    somebody whose home line on the period's last day is not recorded. An
 *    aggregate over the placeable part would read as complete and be wrong; the
 *    refusal names the count and what to record, and prints no figure.
 *  - A period with nothing due inside it reports nothing, so it is refused
 *    rather than closed onto an empty page.
 *  - An acknowledgement is accepted ONLY against the restatement that is live
 *    right now, re-derived at the door. If the record moved again between the
 *    reader and the button, the act is refused and the new fingerprint is
 *    printed — an acknowledgement of a stale signature would be a signature on a
 *    figure nobody has seen.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildGoalAttainment,
  deriveGoalAttainmentPeriod,
  goalAttainmentBriefText,
  goalAttainmentCsvRows,
  readGoalAttainmentClosure,
} from './goalAttainment.js';
import {
  GOAL_ATTAINMENT_ENGINE_VERSION,
  GOAL_ATTAINMENT_BOUNDS,
  GOAL_ATTAINMENT_EVENTS,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_RIGHTS,
  GOAL_ATTAINMENT_ROUTE,
  GOAL_ATTAINMENT_RULE_ID,
  GOAL_ATTAINMENT_SETTING_KEYS,
  GOAL_ATTAINMENT_SETTING_LABELS,
} from './goalAttainmentRegistry.js';
import {
  goalAttainmentDay,
  goalAttainmentInclusiveDays,
  goalAttainmentLabel,
  goalAttainmentOverlaps,
  goalAttainmentReason,
  normalizeGoalAttainmentClosures,
  normalizeGoalAttainmentNotes,
  normalizeGoalAttainmentSettings,
} from './goalAttainmentSchema.js';

export function createGoalAttainmentActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or closing a goal-attainment period.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildGoalAttainment(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
  /** The whole-workspace evaluation: what the door checks an act against. */
  const whole = (check) => buildGoalAttainment(store.state, { now: check.at, settings: check.cfg, seat: null });

  return {
    /* ---------------------------------------------------------------- reads */

    matrixGoalAttainmentReport() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    matrixGoalAttainmentBriefText() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: goalAttainmentBriefText(report), report };
    },

    matrixGoalAttainmentCsvRows() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: goalAttainmentCsvRows(read(check)) };
    },

    matrixGoalAttainmentAttentionCount() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: read(check).attentionN };
    },

    /**
     * What could be closed next. Calendar months of due dates, each marked with
     * whether a closing act already covers any of its days — the READER's own
     * grouping, never a fiscal calendar the workspace invented. A period is the
     * leader's own declaration; this is a prompt, not a prescription.
     */
    matrixGoalAttainmentCandidates() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.CLOSE);
      if (!check.ok) return check;
      const closures = normalizeGoalAttainmentClosures(store.state.goalAttainmentClosures, []);
      const today = check.today;
      const rowsOut = closures;
      const monthKey = (day) => String(day).slice(0, 7);
      const goals = Array.isArray(store.state.goals) ? store.state.goals : [];
      const byMonth = new Map();
      let undatedN = 0;
      for (const goal of goals) {
        if (!goal || typeof goal !== 'object') continue;
        const due = goalAttainmentDay(String(goal.dueDate || '').slice(0, 10));
        if (!due) { undatedN += 1; continue; }
        const key = monthKey(due);
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(due);
      }
      const months = [];
      for (const [key, days] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const monthStart = `${key}-01`;
        const lastMonthDay = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);
        const covering = rowsOut.find((closure) => goalAttainmentOverlaps(closure.periodFrom, closure.periodTo, monthStart, lastMonthDay)) || null;
        months.push({
          month: key,
          periodFrom: monthStart,
          periodTo: lastMonthDay,
          goalsN: days.length,
          lastDueOn: days.slice().sort().at(-1) || null,
          ended: lastMonthDay < today,
          coveredByClosureId: covering?.id || null,
          closeable: !covering && lastMonthDay < today,
        });
      }
      return {
        ok: true,
        actorId: check.actorId,
        today,
        months,
        undatedN,
        closuresN: rowsOut.length,
        periodMaxDays: GOAL_ATTAINMENT_LIMITS.periodMaxDays,
        bounds: { labelMin: GOAL_ATTAINMENT_LIMITS.labelMin, labelMax: GOAL_ATTAINMENT_LIMITS.labelMax, noteMax: GOAL_ATTAINMENT_LIMITS.reasonMax },
      };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * Close one declared, already-ended period. The frozen payload is derived
     * HERE, from the same function the reader uses, so what is stored is exactly
     * what the panel would have printed at the moment of the act.
     */
    matrixGoalAttainmentClose(input = {}) {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.CLOSE);
      if (!check.ok) return check;
      if (rows('goalAttainmentClosures').length >= GOAL_ATTAINMENT_LIMITS.closures) {
        return fail(`The attainment closure ledger reached its ${GOAL_ATTAINMENT_LIMITS.closures}-row cap. Export the workspace before closing another period.`);
      }
      const label = goalAttainmentLabel(input.label);
      if (!label) return fail(`Name the period you are closing (${GOAL_ATTAINMENT_LIMITS.labelMin}–${GOAL_ATTAINMENT_LIMITS.labelMax} characters) — “Q3 FY26 close”, not a sentence.`, 'label');
      const periodFrom = goalAttainmentDay(input.periodFrom);
      const periodTo = goalAttainmentDay(input.periodTo);
      if (!input.periodFrom || !periodFrom) return fail('The period’s first day is not a real calendar day.', 'periodFrom');
      if (!input.periodTo || !periodTo) return fail('The period’s last day is not a real calendar day.', 'periodTo');
      if (periodTo < periodFrom) return fail('The period ends before it starts. Both ends are inclusive.', 'periodTo');
      const days = goalAttainmentInclusiveDays(periodFrom, periodTo);
      if (days > GOAL_ATTAINMENT_LIMITS.periodMaxDays) {
        return fail(`A closing act may report at most ${GOAL_ATTAINMENT_LIMITS.periodMaxDays} inclusive days. ${days} were supplied — that is a strategy horizon, not a period report.`, 'periodTo');
      }
      // A period is closed ONCE, after it has ended. Closing the quarter you are
      // standing in freezes a figure that is still moving.
      if (!(periodTo < check.today)) {
        return fail(`The period ends on ${periodTo} and today is ${check.today}. A period is closed after it has ended: closing a period still in progress freezes a figure that is still moving.`, 'periodTo');
      }
      const closingNote = input.note === undefined || input.note === null || String(input.note).trim() === '' ? '' : goalAttainmentReason(input.note);
      if (String(input.note || '').trim() && !closingNote) {
        return fail(`A written note on the close must be at least ${GOAL_ATTAINMENT_LIMITS.reasonMin} characters. Nothing was saved.`, 'note');
      }
      const existing = normalizeGoalAttainmentClosures(store.state.goalAttainmentClosures, []);
      const overlap = existing.find((closure) => goalAttainmentOverlaps(closure.periodFrom, closure.periodTo, periodFrom, periodTo));
      if (overlap) {
        return fail(`The days ${periodFrom} to ${periodTo} overlap a period already closed on ${overlap.closedOn} (${overlap.periodFrom} to ${overlap.periodTo}). A period is closed once: restate it in writing instead of closing a second report over the same days.`, 'periodFrom');
      }
      const derived = deriveGoalAttainmentPeriod(store.state, { from: periodFrom, to: periodTo });
      if (!derived.ok) return fail(derived.reason || 'The period could not be derived from the record.');
      if (derived.unproven.length) {
        return fail(`${derived.unproven.length} goal(s) due inside this period belong to somebody whose home line on ${periodTo} is not on the recorded structure. Record the structure for that day (Structure history), or choose a period the record covers — nothing was saved, because a report over the placeable part would read as complete and be wrong.`);
      }
      if (derived.goalsN === 0) {
        return fail(`No goal falls due between ${periodFrom} and ${periodTo}, so there is nothing to close. A closing act over an empty period would report a figure nobody reported.`);
      }
      const closure = {
        id: idFactory('gac'),
        label,
        periodFrom,
        periodTo,
        closedOn: check.today,
        closedAt: check.at.toISOString(),
        closedById: check.actorId,
        note: closingNote,
        entries: derived.entries,
        buckets: derived.buckets,
        goalsN: derived.goalsN,
        spansN: derived.spansN,
        ownerlessN: derived.ownerlessN,
        multiLineN: derived.multiLineN,
        engineVersion: GOAL_ATTAINMENT_ENGINE_VERSION,
      };
      store.update((draft) => {
        draft.goalAttainmentClosures = Array.isArray(draft.goalAttainmentClosures) ? draft.goalAttainmentClosures : [];
        draft.goalAttainmentClosures.push(closure);
      }, {
        type: GOAL_ATTAINMENT_EVENTS.CLOSED,
        entity: 'goalAttainmentClosure',
        entityId: closure.id,
        summary: `Closed “${label}” (${periodFrom} to ${periodTo}) on ${check.today}: ${derived.goalsN} goal(s) due, ${derived.spansN} span slice(s), ${derived.buckets.achieved} completed, ${derived.buckets['on-track']} on track, ${derived.buckets['at-risk']} at risk, ${derived.buckets['off-track']} off track, ${derived.buckets['no-checkin']} never checked in, ${derived.buckets.dropped} dropped${derived.ownerlessN ? `, ${derived.ownerlessN} ownerless` : ''}.`.slice(0, 300),
      });
      const reading = readGoalAttainmentClosure(store.state, normalizeGoalAttainmentClosures(rows('goalAttainmentClosures'), []).find((row) => row.id === closure.id) || closure, { settings: settings(), notes: normalizeGoalAttainmentNotes(rows('goalAttainmentNotes'), null, []) });
      return saved({ closureId: closure.id, goalsN: derived.goalsN, spansN: derived.spansN, buckets: derived.buckets, verdict: reading.verdict });
    },

    /**
     * Acknowledge ONE exact restatement in writing. The signature is re-derived
     * at the door: an acknowledgement of a fingerprint that has since moved is
     * refused and the live fingerprint is printed, because a signature on a
     * figure nobody has seen is worse than no signature.
     */
    matrixGoalAttainmentAcknowledge(input = {}) {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.CLOSE);
      if (!check.ok) return check;
      if (rows('goalAttainmentNotes').length >= GOAL_ATTAINMENT_LIMITS.notes) {
        return fail(`The acknowledgement ledger reached its ${GOAL_ATTAINMENT_LIMITS.notes}-row cap. Export the workspace before acknowledging another restatement.`);
      }
      const closureId = text(input.closureId, 120);
      if (!closureId) return fail('Name the closed period this acknowledgement is about.', 'closureId');
      const closure = normalizeGoalAttainmentClosures(store.state.goalAttainmentClosures, []).find((row) => row.id === closureId) || null;
      if (!closure) return fail('That closed period is not on the record.', 'closureId');
      const reason = goalAttainmentReason(input.reason);
      if (!reason) return fail(`Write what you are accepting and why (at least ${GOAL_ATTAINMENT_LIMITS.reasonMin} characters). The original figures stay printed beside it; the acknowledgement is what makes the restated basis the accepted period fact.`, 'reason');
      const notes = normalizeGoalAttainmentNotes(store.state.goalAttainmentNotes, null, []);
      const reading = readGoalAttainmentClosure(store.state, closure, { settings: settings(), notes });
      if (reading.verdict === 'faithful') return fail('This period reproduces its reported figures exactly right now, so there is nothing to acknowledge. Nothing was saved.', 'closureId');
      if (reading.verdict === 'unprovable') return fail(`This period cannot be re-derived right now: ${reading.reasons.join(' ')} Restore the record it needs before acknowledging a restatement nobody can see. Nothing was saved.`, 'closureId');
      if (reading.verdict === 'acknowledged') return fail(`This exact restatement is already acknowledged on ${reading.acknowledgingNote?.actedOn}. A further acknowledgement would only duplicate one decision.`, 'closureId');
      const signature = reading.signature;
      if (text(input.signature, 40) && text(input.signature, 40) !== signature) {
        return fail(`The restatement moved between the screen and this act: the live fingerprint is now ${signature}. Re-read the period and acknowledge the restatement that is actually on the record — nothing was saved.`, 'signature');
      }
      if (notes.some((note) => note.closureId === closureId && note.signature === signature)) {
        return fail('That exact restatement is already acknowledged. Nothing was saved.', 'closureId');
      }
      const note = {
        id: idFactory('gan'),
        closureId,
        signature,
        reason,
        actedById: check.actorId,
        actedOn: check.today,
        actedAt: check.at.toISOString(),
      };
      store.update((draft) => {
        draft.goalAttainmentNotes = Array.isArray(draft.goalAttainmentNotes) ? draft.goalAttainmentNotes : [];
        draft.goalAttainmentNotes.push(note);
      }, {
        type: GOAL_ATTAINMENT_EVENTS.ACKNOWLEDGED,
        entity: 'goalAttainmentClosure',
        entityId: closureId,
        summary: `Restatement ${signature} of “${String(closure.label || '').slice(0, 60)}” acknowledged on ${check.today}: ${String(reason).slice(0, 160)}`.slice(0, 300),
      });
      return saved({ noteId: note.id, closureId, signature, actedOn: check.today });
    },

    /** Re-run RULE-GAR-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    matrixGoalAttainmentScan() {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: GOAL_ATTAINMENT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: GOAL_ATTAINMENT_ROUTE,
        summary: `Goal-attainment restatement scan requested (${GOAL_ATTAINMENT_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === GOAL_ATTAINMENT_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    matrixGoalAttainmentSetConventions(patch = {}) {
      const check = seatFor(GOAL_ATTAINMENT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Goal-attainment conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(GOAL_ATTAINMENT_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one goal-attainment convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared goal-attainment convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${GOAL_ATTAINMENT_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = GOAL_ATTAINMENT_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${GOAL_ATTAINMENT_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeGoalAttainmentSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; }, {
        type: GOAL_ATTAINMENT_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: GOAL_ATTAINMENT_ROUTE,
        summary: `Goal-attainment conventions set: ask window ${next.goalAttainmentAskDueDays} d, automation ${next.goalAttainmentAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
