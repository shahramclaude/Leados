/**
 * app/core/domain/dutyAbsenceActions.js — the Dated Absence Plan's commands
 * (ADR-0122, Schema v115).
 *
 * One read and three writes, all human, all dated:
 *
 *   dutyAbsencePlan       "What happens to my duty lines during THIS window?"
 *                         A pure read: the per-duty window plan, the seat's
 *                         own declared absence (if any) and the dated roll-up
 *                         of every absence in the span. Planning a window is
 *                         NOT a write — the plan is derived from the declared
 *                         covers and absences, so a leader can grade a future
 *                         week before declaring anything.
 *
 *   dutyAbsenceDeclare    "I will not be here from X to Y, and here is why."
 *                         One atomic `store.update`: the absence row, one
 *                         `declares-absence-of` edge to the seat, one governed
 *                         decision naming what stops during the window, and
 *                         one `rolls-up-to` edge per leadership ancestor.
 *                         Nothing else is touched.
 *
 *   dutyAbsenceRevoke     "This absence no longer holds, and here is why."
 *                         Append-only: the row is marked revoked with its day
 *                         and reason and never deleted.
 *
 *   dutyAbsenceScan       an explicit re-derivation, logged as an event.
 *
 * There is deliberately NO command that schedules an absence for someone else
 * and none that stores an availability verdict: availability is a function of
 * two declared windows and is re-derived on every read.
 */

import { dayKey, addDays } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { harvestWork, LEADER_ID } from './chain.js';
import {
  absenceWindowPlan, absenceConcurrency, dutyAbsenceRollup, buildDutyCoverageReport,
} from './dutyCoverage.js';
import {
  activeAbsenceFor, parseAbsenceWindow, overlaps,
} from './dutyAbsenceSchema.js';
import {
  DUTY_ABSENCE_ENGINE_VERSION,
  DUTY_ABSENCE_EVENTS,
  DUTY_ABSENCE_LIMITS,
  DUTY_ABSENCE_RELATION,
} from './dutyAbsenceRegistry.js';

export function createDutyAbsenceActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  /** `store.update()` returns the new STATE, so success is read from persistError. */
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before planning an absence.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const plans = () => (Array.isArray(store.state.absencePlans) ? store.state.absencePlans : []);

  return {
    /* ---------------------------------------------------------------- reads */

    /**
     * The window plan for the acting seat. `window` is optional: without it the
     * seat's own active absence is graded; with a probe window (`{from, to}`)
     * the plan grades a week the seat has not declared yet — a pure read.
     */
    dutyAbsencePlan(input = {}) {
      const check = seatFor('declare-duty-absence');
      if (!check.ok) return check;
      const { seat, built } = check;
      const probe = parseAbsenceWindow(input.window);
      const own = activeAbsenceFor(plans(), seat.id);
      const window = probe || (own ? { from: own.from, to: own.to } : null);
      const items = harvestWork(store.state, built.chain, { now: clock(), settings: settings() });
      const rollup = dutyAbsenceRollup(store.state, built, seat, { now: clock(), settings: settings(), items });
      if (!window) {
        return { ok: true, window: null, plan: null, own, rollup };
      }
      const plan = absenceWindowPlan(store.state, built, seat, window, { now: clock(), settings: settings(), items });
      return { ok: true, window, plan, own: own ? { id: own.id, from: own.from, to: own.to, reason: own.reason, declaredOn: own.declaredOn } : null, rollup };
    },

    /* --------------------------------------------------------------- writes */

    /**
     * Declare a dated absence for the acting seat. The window must be valid
     * (inclusive ISO days, bounded span), the reason is required — a bare
     * window with no words is not a reviewed declaration — and a seat may not
     * declare a second active absence overlapping one it already holds. The
     * governed decision opened in the same transaction names what stops during
     * the window, computed from the plan BEFORE the write, so the exposure is
     * on the record verbatim.
     */
    dutyAbsenceDeclare(input = {}) {
      const check = seatFor('declare-duty-absence');
      if (!check.ok) return check;
      const { seat, built } = check;
      const window = parseAbsenceWindow({ from: input.from, to: input.to });
      if (!window) {
        return fail('Declare the absence as two ISO dates (from, to), with from not after to and a window of at most ' + `${DUTY_ABSENCE_LIMITS.maxSpanDays} days.`, 'window');
      }
      const reason = String(input.reason || '').trim().slice(0, DUTY_ABSENCE_LIMITS.reasonChars);
      if (reason.length < 8) {
        return fail('Record why the seat will not be there — the next person to read this plan needs the words, not a date range.', 'reason');
      }
      const clash = plans().find((r) => r && r.seatId === seat.id && r.status === 'active' && overlaps(r, window));
      if (clash) {
        return fail(`This seat already holds an active absence ${clash.from} → ${clash.to}. Revoke it (or let it pass) before declaring another overlapping window; the register grades one absence per seat at a time.`, 'window');
      }
      const note = String(input.note || '').trim().slice(0, DUTY_ABSENCE_LIMITS.noteChars);

      const items = harvestWork(store.state, built.chain, { now: clock(), settings: settings() });
      const plan = absenceWindowPlan(store.state, built, seat, window, { now: clock(), settings: settings(), items });
      const exposed = plan.summary.exposedN;
      const exposedOpen = plan.summary.exposedOpenN;
      const exercise = plan.summary.exercise || { validCoversN: 0, staleCoversN: 0, missingCoversN: 0, futureCoversN: 0, lateCoversN: 0, thinLinesN: 0 };
      const exerciseLine = `Pre-window exercise: ${exercise.validCoversN} available cover(s) have duty-specific evidence recorded by today inside ${plan.exerciseWindow.from} → ${plan.exerciseWindow.to}; ${exercise.staleCoversN} stale, ${exercise.missingCoversN} missing, ${exercise.futureCoversN} future-dated, ${exercise.lateCoversN} after cutoff. ${exercise.thinLinesN} duty line(s) read thin.`;

      const at = clock();
      const today = dayKey(at);
      const rowId = idFactory('absence');
      const decisionId = idFactory('dec');
      const windowText = `${window.from} → ${window.to}`;
      const exposureLine = exposed
        ? `${exposed} of ${plan.summary.dutiesN} duty line(s) this seat holds have NO available cover during ${windowText}` + (exposedOpen ? ` — ${exposedOpen} of them carry open work.` : '.')
        : `Every duty line this seat holds has an available cover during ${windowText}.`;

      const row = {
        id: rowId,
        seatId: seat.id,
        from: window.from,
        to: window.to,
        reason,
        note,
        decisionId,
        declaredBySeatId: seat.fullAccess ? null : seat.id,
        declaredOn: today,
        declaredAt: at.toISOString(),
        status: 'active',
        revokedOn: null,
        revokedAt: null,
        revokeReason: '',
        version: DUTY_ABSENCE_ENGINE_VERSION,
      };
      // ADR-0123: what does THIS declaration change about the span's overlap?
      // Graded against a hypothetical state (the row is not written yet) so the
      // governed decision opened below records the concurrency the declaration
      // creates — on the record, at the moment it is created.
      const concurrency = absenceConcurrency(
        { ...store.state, absencePlans: [row, ...plans()] },
        built,
        seat,
        { now: clock(), settings: settings(), items },
      );
      const worst = concurrency.windows
        .slice()
        .sort((a, b) => b.count - a.count || b.exposedOpenN - a.exposedOpenN || (a.from < b.from ? -1 : 1))[0] || null;
      const concurrencyLine = worst
        ? `Concurrency: this window overlaps ${worst.count - 1} other declared absence(s) in this span. On ${worst.from} → ${worst.to}, ${worst.count} seat(s) are absent at once, ${worst.exposedN} duty line(s) have no available cover on those shared dates (${worst.exposedOpenN} carrying open work), and ${worst.singleCovers.length} declared cover(s) would be the only answerable person for two or more absent seats.`
        : `Concurrency: ${concurrency.refused || 'no other declared absence in this span shares a date with this window.'} The overlap is graded from the declared windows on every read, never stored.`;
      // ADR-0124: the governed decision opened by this declaration records the
      // capacity of the covers who would answer on the shared dates, from the
      // SAME hypothetical-state read as the overlap itself.
      const capacityLine = worst
        ? `Cover capacity: ${worst.capacity.gradedN} available cover(s) graded on the shared dates against a like-for-like revealed envelope of up to ${worst.capacity.envelopeN} open work item(s) among ${worst.capacity.envelopeSeatsN} comparable seat(s); ${worst.capacity.overEnvelopeN} would carry more than that peak (largest ${worst.capacity.maxCombinedN}), ${worst.capacity.refusedN} refused. ${worst.capacity.refusal || 'The union counts each open item once, including work already inside the cover’s own span; no capacity verdict is stored.'}`
        : 'Cover capacity: no shared date range was graded, so no cover load is claimed.';
      const loadedSingleCovers = worst
        ? worst.singleCovers.filter((c) => c.capacity && c.capacity.band === 'over-envelope').length
        : 0;

      store.update((draft) => {
        draft.absencePlans = Array.isArray(draft.absencePlans) ? draft.absencePlans : [];
        draft.absencePlans.unshift(row);
        // The graph, not a second table: the plan DECLARES THE ABSENCE OF the
        // seat that will not be at it. Same spine as every other declaration.
        ensureEntityLink(draft, {
          sourceType: 'absenceplan',
          sourceId: rowId,
          targetType: 'person',
          targetId: seat.id,
          relation: DUTY_ABSENCE_RELATION,
          ruleId: '',
          summary: `A human declared this seat absent ${window.from} → ${window.to}.`,
        }, { idFactory, todayStr: today, nowIso: at.toISOString() });

        const driver = String(draft.settings?.leaderName || '').slice(0, 120);
        const decision = {
          id: decisionId,
          title: `If ${seat.name} is absent ${windowText}, what stops?`,
          question: [
            `${seat.name} (${seat.label}) declared an absence ${windowText}: ${reason}`,
            exposureLine,
            concurrencyLine,
            capacityLine,
            exerciseLine,
            'What remains open is whether every exposed duty line has a declared, available stand-in on those dates. The register derives availability from the declared windows and exercise from duty-specific records dated before the absence starts; this decision records the exposure the absence creates and asks the seat to close it before the window opens, not after.',
          ].join(' '),
          date: today,
          reversibility: 'reversible',
          driver,
          approver: driver,
          contributors: '',
          informed: '',
          options: [
            { id: idFactory('opt'), label: 'Declare a cover for every exposed duty line before the window opens', pros: 'The plan reads covered on those dates: a named person is answerable and the workspace has seen them work inside the span.', cons: `${exposed} duty line(s) need a declaration each; a declaration nobody exercises still reads thin.` },
            { id: idFactory('opt'), label: 'Declare the absence with a shorter or shifted window', pros: 'Fewer exposed dates; the register grades exactly the days that remain.', cons: 'The reason on the record must change with the dates, or the declaration and the plan disagree.' },
            { id: idFactory('opt'), label: 'Accept the exposure and record the delay each exposed line will take', pros: 'Honest when the absence is short and the work can wait.', cons: `${exposedOpen} open item(s) sit in the exposed lines; the register keeps printing the exposure until a human declares cover or the window passes.` },
          ],
          chosen: '',
          rationale: `ADR-0122: the seat holder declared a dated absence (${windowText}). The plan, availability and cascade are DERIVED from the declared covers and absence windows; this decision records the exposure the absence creates and asks the seat to close it before the window opens.`,
          reviewOn: addDays(window.to, 7),
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          decidedOn: null,
          createdAt: at.toISOString(),
        };
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift(decision);
        // The decision climbs every leadership ancestor of the absent seat in
        // the same transaction — the dated roll-up, not a second system.
        let cursor = seat.id;
        let guard = 0;
        while (cursor && cursor !== LEADER_ID && guard < 16) {
          const target = cursor;
          ensureEntityLink(draft, {
            sourceType: 'decision', sourceId: decisionId, targetType: 'person', targetId: target,
            relation: 'rolls-up-to', ruleId: '',
            summary: 'The dated absence plan rolls up to this leadership span.',
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
          cursor = built.chain.nodes.get(cursor)?.parentId || null;
          guard += 1;
        }
      }, {
        type: DUTY_ABSENCE_EVENTS.DECLARE,
        entity: 'absenceplan',
        entityId: rowId,
        summary: `Absence declared: ${seat.label} absent ${windowText}. ${exposed} of ${plan.summary.dutiesN} duty line(s) exposed. Pre-window exercise: ${exercise.validCoversN} valid cover(s), ${exercise.thinLinesN} thin line(s). ${concurrency.windows.length ? `${concurrency.windows.length} concurrent window(s), ${concurrency.summary.exposedOpenN} open uncovered, ${concurrency.summary.singleCoverN} single-cover point(s).` : 'No concurrent window.'} Cover capacity: ${concurrency.coverLoad.gradedN} graded, ${concurrency.coverLoad.overEnvelopeN} over envelope.`.slice(0, 300),
      });
      return saved({
        id: rowId,
        decisionId,
        window,
        summary: plan.summary,
        exerciseWindow: plan.exerciseWindow,
        exercise: plan.summary.exercise,
        concurrency: {
          windowsN: concurrency.windows.length,
          maxConcurrent: concurrency.summary.maxConcurrent,
          exposedOpenN: concurrency.summary.exposedOpenN,
          singleCoverN: concurrency.summary.singleCoverN,
          coverExercise: concurrency.coverExercise,
          coverLoad: {
            gradedN: concurrency.coverLoad.gradedN,
            overEnvelopeN: concurrency.coverLoad.overEnvelopeN,
            refusedN: concurrency.coverLoad.refusedN,
            envelopeN: concurrency.coverLoad.envelopeN,
            maxCombinedN: concurrency.coverLoad.maxCombinedN,
          },
        },
      });
    },

    /** Withdraw a declared absence, with the reason recorded. Append-only. */
    dutyAbsenceRevoke(input = {}) {
      const check = seatFor('declare-duty-absence');
      if (!check.ok) return check;
      const { seat } = check;
      const id = String(input.id || '').trim();
      const row = plans().find((r) => r && r.id === id);
      if (!row) return fail('That declared absence no longer exists.');
      if (!seat.fullAccess && row.declaredBySeatId !== seat.id && row.seatId !== seat.id) {
        return fail('Only the seat that declared this absence may revoke it.');
      }
      if (row.status !== 'active') return fail('That absence is already revoked.');
      const reason = String(input.reason || '').trim().slice(0, DUTY_ABSENCE_LIMITS.reasonChars);
      if (reason.length < 6) {
        return fail('Record why the absence no longer holds — the next person to read this plan needs to know.', 'reason');
      }
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const live = (draft.absencePlans || []).find((r) => r && r.id === id);
        if (!live) return;
        live.status = 'revoked';
        live.revokedOn = today;
        live.revokedAt = at.toISOString();
        live.revokeReason = reason;
      }, {
        type: DUTY_ABSENCE_EVENTS.REVOKE,
        entity: 'absenceplan',
        entityId: id,
        summary: `Absence revoked (${row.seatId}, ${row.from} → ${row.to}) with a reason: ${reason.slice(0, 140)}`.slice(0, 300),
      });
      return saved({ id, revokedOn: today });
    },

    /** Explicit scan: re-derive every active absence plan and log what it sees. */
    dutyAbsenceScan() {
      const check = seatFor('declare-duty-absence');
      if (!check.ok) return check;
      const { seat, built } = check;
      const items = harvestWork(store.state, built.chain, { now: clock(), settings: settings() });
      const rollup = dutyAbsenceRollup(store.state, built, seat, { now: clock(), settings: settings(), items });
      const report = buildDutyCoverageReport(store.state, { now: clock(), settings: settings() });
      const conc = report.absences.concurrency;
      store.update(() => {}, {
        type: DUTY_ABSENCE_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: `Absence plans re-derived: ${report.absences.own ? 1 : 0} own, ${rollup.rows.length} in span, ${report.absences.exposedOpenN} open uncovered. Pre-window exercise: ${report.absences.exercise?.validLinesN ?? 0} valid line(s), ${report.absences.exercise?.thinLinesN ?? 0} thin. Concurrency: ${conc.refused ? 'refused' : `${conc.summary.windowsN} window(s), max ${conc.summary.maxConcurrent} seats, ${conc.summary.singleCoverN} single-cover point(s)`}. Cover capacity: ${conc.coverLoad.gradedN} graded, ${conc.coverLoad.overEnvelopeN} over envelope. Nothing was scheduled.`.slice(0, 300),
      });
      return saved({
        exposedOpenN: report.absences.exposedOpenN,
        inSpanN: rollup.rows.length,
        exercise: report.absences.exercise,
        concurrency: {
          windowsN: conc.summary.windowsN,
          maxConcurrent: conc.summary.maxConcurrent,
          singleCoverN: conc.summary.singleCoverN,
          refused: conc.refused,
          coverExercise: conc.coverExercise,
          coverLoad: {
            gradedN: conc.coverLoad.gradedN,
            overEnvelopeN: conc.coverLoad.overEnvelopeN,
            refusedN: conc.coverLoad.refusedN,
            envelopeN: conc.coverLoad.envelopeN,
            refusal: conc.coverLoad.refusal,
          },
        },
      });
    },
  };
}
