/**
 * app/core/domain/escalationActions.js — reviewed command & read mixin for the
 * Escalation Economy (`#/escalation`, Schema v91, ADR-0085).
 *
 * Mounted on `api` in `app/actions.js` prior to `guardApi(api, store)` so every
 * method is mediated by the central ADR-0080 gateway
 * (`API_RIGHTS['record-escalation']` and `SAFE_READS`). Enforces:
 *   1. Tree-scoped logging and sideways peer isolation under declared seats;
 *   2. Receiver-only settlement: an ancestor may not settle on behalf of the
 *      span that received the item, and the escalator may not settle their own
 *      escalation (the yield metric would be self-reported and worthless);
 *   3. Freeze-then-grade-once for intervention-rate commitments;
 *   4. Explicit human recording of whether the outcome differed — never
 *      inferred from a title, a note or a resolution code; and
 *   5. A declared cost rate per altitude, never an inferred salary.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ALTITUDE_KEYS } from './chainRegistry.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { ancestorSeatIds } from './escalation.js';
import {
  buildEscalationReport,
  escalationBriefText,
  escalationCsvRows,
  owningSeatId,
} from './escalation.js';
import {
  normalizeEscalationCommitment,
  normalizeEscalationRecord,
  normalizeEscalationSettings,
} from './escalationSchema.js';
import {
  DISPOSITIONS,
  ESCALATION_EVENTS,
  ESCALATION_LIMITS,
  ESCALATION_REASONS,
  RESOLUTIONS,
  SOURCE_TYPES,
} from './escalationRegistry.js';

const clean = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`))
  && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v;

export function createEscalationActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const records = () => (Array.isArray(store.state.escalationRecords) ? store.state.escalationRecords : []);
  const commitments = () => (Array.isArray(store.state.escalationCommitments) ? store.state.escalationCommitments : []);
  const findRecord = (id) => records().find((r) => r && r.id === id) || null;
  const findCommitment = (id) => commitments().find((c) => c && c.id === id) || null;

  function resolveOperatingSeat() {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    return { built, seat };
  }

  /**
   * Every write is scoped to the operating seat's subtree. A sideways peer span
   * is invisible; an ancestor may read but may not settle on a receiver's behalf.
   */
  function verifySeatRight(targetPersonId = null, { requireSelf = false } = {}) {
    const { built, seat } = resolveOperatingSeat();
    if (seat.fullAccess) return { error: null, seat, built };
    const right = canAct('record-escalation', seat);
    if (!right.allow) return { error: fail(right.reason, 'scope'), seat, built };
    if (targetPersonId) {
      const inSpan = seat.id === targetPersonId || Boolean(seat.scope?.has(targetPersonId));
      if (!inSpan) {
        return {
          error: fail(
            'This item belongs to a peer or downstream span outside your operating seat. Route a cross-span escalation through the lowest common leader.',
            'scope',
          ),
          seat,
          built,
        };
      }
      if (requireSelf && seat.id !== targetPersonId) {
        return {
          error: fail(
            'Only the span that received this item can settle it. An ancestor settling on a receiver’s behalf would make the escalation yield self-reported and worthless.',
            'scope',
          ),
          seat,
          built,
        };
      }
    }
    return { error: null, seat, built };
  }

  /** One reader, used by every read method — the mixin is `Object.assign`-ed
   *  onto `api` and then wrapped by `guardApi`, so `this` is never the mixin. */
  function readReport() {
    const { seat } = resolveOperatingSeat();
    return buildEscalationReport(store.state, {
      now: clock(),
      settings: settings(),
      seatId: seat?.fullAccess ? null : seat?.id,
    });
  }

  function seatLabel(built, seatId) {
    const seat = built?.byId?.get(seatId) || null;
    return seat?.name || seatId || 'span';
  }

  return {
    escalationRead() {
      return readReport();
    },

    escalationBriefText() {
      return escalationBriefText(readReport());
    },

    escalationCsvRows() {
      return escalationCsvRows(store.state, { now: clock(), settings: settings() });
    },

    escalationStats() {
      const report = readReport();
      return {
        totals: report.totals,
        byAltitude: report.byAltitude,
        calibration: report.calibration,
        attentionCount: report.attentionCount,
      };
    },

    /**
     * Log one decision moment: absorbed where it arose, or escalated upward.
     * The reason vocabulary is the incentive instrument — `cover` and `capacity`
     * are counted as defensive, and the count is the point (Holmström & Milgrom
     * 1991: an unmeasured task starves).
     */
    escalationLog(input = {}) {
      const title = clean(input.title, 180);
      if (title.length < 4) return fail('Give the decision moment a clear title (at least 4 characters).', 'title');
      const disposition = DISPOSITIONS.includes(input.disposition) ? input.disposition : null;
      if (!disposition) return fail('Record whether this was absorbed where it arose or escalated upward.', 'disposition');
      const reasonKey = ESCALATION_REASONS.includes(input.reasonKey) ? input.reasonKey : null;
      if (!reasonKey) return fail('Choose the reason this was escalated — the reason vocabulary is what makes the incentive visible.', 'reasonKey');

      const { error, seat, built } = verifySeatRight(null);
      if (error) return error;
      if (records().length >= ESCALATION_LIMITS.records) {
        return fail(`The escalation ledger is at its ${ESCALATION_LIMITS.records}-record cap.`, 'escalationRecords');
      }

      const fromSeatId = input.fromSeatId && store.state.people?.some((p) => p && p.id === input.fromSeatId)
        ? input.fromSeatId
        : (seat.fullAccess ? 'leader' : seat.id);
      if (!seat.fullAccess && !seat.scope.has(fromSeatId) && seat.id !== fromSeatId) {
        return fail('The originating span is outside your operating seat.', 'fromSeatId');
      }

      let toSeatId = null;
      if (disposition === 'escalated') {
        const raw = typeof input.toSeatId === 'string' ? input.toSeatId.trim() : '';
        if (!raw) return fail('Choose the span this was escalated to.', 'toSeatId');
        const receiver = (store.state.people || []).find((p) => p && p.id === raw && p.status !== 'archived');
        if (!receiver) return fail('The receiving span must be an active person in the roster.', 'toSeatId');
        if (raw === fromSeatId) return fail('An escalated item cannot be escalated to the span it arose in.', 'toSeatId');
        // Escalation is UPWARD by definition, so the receiver is an ANCESTOR of
        // the origin and is therefore never inside the origin's own span: a
        // "receiver inside my scope" rule would refuse every legitimate
        // escalation. The boundary that matters is the ORIGIN. A receiver that
        // is neither in scope nor an ancestor is still refused.
        if (!seat.fullAccess) {
          const ancestors = ancestorSeatIds(built, fromSeatId);
          const reachable = seat.id === raw || seat.scope.has(raw) || ancestors.includes(raw) || raw === LEADER_ID;
          if (!reachable) {
            return fail('The receiving span is neither inside your operating seat nor above the span this arose in. Route a cross-span escalation through the lowest common leader.', 'toSeatId');
          }
        }
        toSeatId = raw;
      }

      const sourceType = SOURCE_TYPES.includes(input.sourceType) ? input.sourceType : null;
      const sourceId = sourceType && typeof input.sourceId === 'string' && input.sourceId.trim()
        ? input.sourceId.trim().slice(0, 80)
        : null;
      const effortHoursRaw = Number(input.effortHours);
      const effortHours = Number.isFinite(effortHoursRaw) && effortHoursRaw >= 0
        ? Math.round(Math.min(2000, effortHoursRaw) * 100) / 100
        : null;

      const nowDate = clock();
      const id = idFactory('esc');
      const raw = normalizeEscalationRecord({
        id,
        title,
        note: clean(input.note, 400),
        disposition,
        fromSeatId,
        toSeatId,
        reasonKey,
        decisionClass: clean(input.decisionClass, 60) || 'general',
        sourceType: sourceId ? sourceType : null,
        sourceId,
        proposedAction: clean(input.proposedAction, 240),
        status: 'open',
        resolution: null,
        outcomeDiffers: null,
        effortHours,
        loggedOn: isDay(input.loggedOn) ? input.loggedOn : dayKey(nowDate),
        decidedOn: null,
        createdAt: nowDate.toISOString(),
        updatedAt: nowDate.toISOString(),
      });
      if (!raw) return fail('The escalation record could not be written as a valid ledger row.', 'escalationRecords');

      store.update(
        (draft) => {
          draft.escalationRecords = Array.isArray(draft.escalationRecords) ? draft.escalationRecords : [];
          draft.escalationRecords.unshift(raw);
        },
        {
          type: ESCALATION_EVENTS.LOGGED,
          entity: 'escalationrecord',
          entityId: id,
          summary: disposition === 'escalated'
            ? `Logged an escalation: "${title}" → ${seatLabel(built, toSeatId)} (${reasonKey}, class "${raw.decisionClass}").`
            : `Logged an absorbed decision: "${title}" decided at ${seatLabel(built, fromSeatId)} (class "${raw.decisionClass}").`,
        },
      );

      return saved({ record: findRecord(id) });
    },

    /** The receiving span records that the item has landed on its desk. */
    escalationReceive(id) {
      const rec = findRecord(id);
      if (!rec) return fail('Escalation record not found.', 'id');
      if (rec.disposition !== 'escalated') return fail('Only an escalated item can be received.', 'id');
      if (rec.status !== 'open') return fail(`Cannot receive an item in status "${rec.status}".`, 'id');
      const { error, built } = verifySeatRight(rec.toSeatId, { requireSelf: false });
      if (error) return error;

      store.update(
        (draft) => {
          const row = (draft.escalationRecords || []).find((r) => r && r.id === id);
          if (row) {
            row.status = 'received';
            row.updatedAt = clock().toISOString();
          }
        },
        {
          type: ESCALATION_EVENTS.RECEIVED,
          entity: 'escalationrecord',
          entityId: id,
          summary: `Escalation received by ${seatLabel(built, rec.toSeatId)}: "${rec.title}".`,
        },
      );
      return saved({ record: findRecord(id) });
    },

    /**
     * Settle the escalation. `outcomeDiffers` is a HUMAN record of whether the
     * answer changed; it is the single input the yield metric rests on and is
     * never inferred from text.
     */
    escalationSettle(id, input = {}) {
      const rec = findRecord(id);
      if (!rec) return fail('Escalation record not found.', 'id');
      if (rec.disposition !== 'escalated') return fail('Only an escalated item can be settled.', 'id');
      if (!['open', 'received'].includes(rec.status)) return fail(`Cannot settle an item in status "${rec.status}".`, 'id');
      const resolution = RESOLUTIONS.includes(input.resolution) ? input.resolution : null;
      if (!resolution) return fail('Record how the receiving span resolved it: endorsed, overruled or returned.', 'resolution');
      if (typeof input.outcomeDiffers !== 'boolean') {
        return fail(
          'Record whether the decision differed from what the escalating level proposed. This is the one input the escalation yield rests on, and it is a human judgement — it is never inferred from a title or a note.',
          'outcomeDiffers',
        );
      }
      // Receiver-only: an ancestor settling for a span would fabricate the yield.
      const { error, built } = verifySeatRight(rec.toSeatId, { requireSelf: true });
      if (error) return error;

      const effortRaw = Number(input.effortHours);
      const effortHours = Number.isFinite(effortRaw) && effortRaw >= 0
        ? Math.round(Math.min(2000, effortRaw) * 100) / 100
        : rec.effortHours;
      const nowDate = clock();
      const settled = {
        ...rec,
        status: 'settled',
        resolution,
        outcomeDiffers: resolution === 'returned' ? null : input.outcomeDiffers,
        effortHours,
        decidedOn: isDay(input.decidedOn) ? input.decidedOn : dayKey(nowDate),
        updatedAt: nowDate.toISOString(),
      };
      const row = normalizeEscalationRecord(settled);
      if (!row) return fail('The settled record would not be a valid ledger row.', 'id');

      store.update(
        (draft) => {
          const list = Array.isArray(draft.escalationRecords) ? draft.escalationRecords : [];
          const idx = list.findIndex((r) => r && r.id === id);
          if (idx >= 0) list[idx] = row;
        },
        {
          type: ESCALATION_EVENTS.SETTLED,
          entity: 'escalationrecord',
          entityId: id,
          summary: `Escalation settled by ${seatLabel(built, rec.toSeatId)} as ${resolution}${
            resolution === 'returned' ? '' : input.outcomeDiffers ? '; the answer changed' : '; the answer did not change'
          }: "${rec.title}".`,
        },
      );
      return saved({ record: findRecord(id) });
    },

    /**
     * Return the monkey downward with the authority to decide (Oncken & Wass
     * 1974). A returned item counts as resolved where it arose for the
     * subsidiarity index.
     */
    escalationReturnDown(id, input = {}) {
      const rec = findRecord(id);
      if (!rec) return fail('Escalation record not found.', 'id');
      if (rec.disposition !== 'escalated') return fail('Only an escalated item can be returned downward.', 'id');
      if (!['open', 'received'].includes(rec.status)) return fail(`Cannot return an item in status "${rec.status}".`, 'id');
      const { error, built } = verifySeatRight(rec.toSeatId, { requireSelf: true });
      if (error) return error;

      const nowDate = clock();
      const row = normalizeEscalationRecord({
        ...rec,
        status: 'returned',
        resolution: 'returned',
        outcomeDiffers: null,
        note: clean(input.note, 400) || rec.note,
        decidedOn: isDay(input.decidedOn) ? input.decidedOn : dayKey(nowDate),
        updatedAt: nowDate.toISOString(),
      });
      if (!row) return fail('The returned record would not be a valid ledger row.', 'id');

      store.update(
        (draft) => {
          const list = Array.isArray(draft.escalationRecords) ? draft.escalationRecords : [];
          const idx = list.findIndex((r) => r && r.id === id);
          if (idx >= 0) list[idx] = row;
        },
        {
          type: ESCALATION_EVENTS.RETURNED,
          entity: 'escalationrecord',
          entityId: id,
          summary: `Returned downward with authority to decide: "${rec.title}" (${seatLabel(built, rec.toSeatId)} → ${seatLabel(built, rec.fromSeatId)}).`,
        },
      );
      return saved({ record: findRecord(id) });
    },

    /**
     * Aghion & Tirole (1997): delegation is only credible when the principal
     * commits to a BOUNDED intervention rate. Declaring one freezes the ceiling
     * and a personal probability, both graded later out of sample.
     */
    escalationDeclareCommitment(input = {}) {
      const spanId = typeof input.spanId === 'string' ? input.spanId.trim() : '';
      if (!spanId) return fail('Choose the span this commitment binds.', 'spanId');
      const person = (store.state.people || []).find((p) => p && p.id === spanId && p.status !== 'archived');
      if (!person) return fail('The committed span must be an active person in the roster.', 'spanId');

      const { error, built } = verifySeatRight(spanId);
      if (error) return error;
      if (commitments().length >= ESCALATION_LIMITS.commitments) {
        return fail(`The commitment ledger is at its ${ESCALATION_LIMITS.commitments}-record cap.`, 'escalationCommitments');
      }

      const rate = Number(input.committedInterventionRatePct);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return fail('Declare the intervention-rate ceiling as a percentage between 0 and 100.', 'committedInterventionRatePct');
      }
      const budget = Number(input.committedEscalationBudget);
      if (!Number.isFinite(budget) || budget < 0) {
        return fail('Declare the escalation budget as a whole number of items (0 or more).', 'committedEscalationBudget');
      }
      const forecast = Number(input.forecastPct);
      if (!Number.isFinite(forecast) || forecast < 0 || forecast > 100) {
        return fail('Give your own probability that this span stays inside the declared budget (0–100).', 'forecastPct');
      }

      const nowDate = clock();
      const conv = normalizeEscalationSettings(settings());
      // Monday-based week-start day key — the same `weekKey` convention the
      // rest of the workspace uses.
      const periodKey = typeof input.periodKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.periodKey)
        ? input.periodKey
        : weekKey(nowDate);
      const decisionClass = clean(input.decisionClass, 60) || '*';
      if (commitments().some((c) => c.spanId === spanId && c.decisionClass === decisionClass && c.periodKey === periodKey)) {
        return fail(`This span already declared a commitment for class "${decisionClass}" in ${periodKey}. Grade that one instead of restating it.`, 'periodKey');
      }
      const altitudeKey = ALTITUDE_KEYS.includes(input.altitudeKey)
        ? input.altitudeKey
        : (built.byId.get(spanId)?.altitudeKey || 'manager');

      const id = idFactory('escc');
      const row = normalizeEscalationCommitment({
        id,
        spanId,
        decisionClass,
        periodKey,
        altitudeKey,
        committedInterventionRatePct: Math.round(rate * 10) / 10,
        committedEscalationBudget: Math.round(budget),
        forecastPct: Math.round(forecast * 10) / 10,
        declaredOn: dayKey(nowDate),
        reviewOn: addDays(dayKey(nowDate), conv.escalationReviewDays),
        status: 'declared',
        note: clean(input.note, 400),
        createdAt: nowDate.toISOString(),
      });
      if (!row) return fail('The commitment could not be written as a valid ledger row.', 'escalationCommitments');

      store.update(
        (draft) => {
          draft.escalationCommitments = Array.isArray(draft.escalationCommitments) ? draft.escalationCommitments : [];
          draft.escalationCommitments.unshift(row);
        },
        {
          type: ESCALATION_EVENTS.COMMITTED,
          entity: 'escalationcommitment',
          entityId: id,
          summary: `${seatLabel(built, spanId)} committed to intervening on at most ${row.committedInterventionRatePct}% of "${decisionClass}" decisions (budget ${row.committedEscalationBudget}) in ${periodKey}.`,
        },
      );
      return saved({ commitment: findCommitment(id) });
    },

    /**
     * Grade once, after `reviewOn`, re-reading the recorded dispositions. A
     * commitment below the evidence floor is refused rather than graded, and
     * grading is one-shot: a re-run cannot move the number.
     */
    escalationGradeCommitment(id) {
      const commitment = findCommitment(id);
      if (!commitment) return fail('Commitment not found.', 'id');
      if (commitment.status === 'graded') return fail('This commitment has already been graded once. Grading is one-shot so the number cannot be re-run until it looks better.', 'id');

      const { error, built } = verifySeatRight(commitment.spanId);
      if (error) return error;

      const conv = normalizeEscalationSettings(settings());
      const today = dayKey(clock());
      if (today < commitment.reviewOn) {
        return fail(`This commitment cannot be graded before its review date (${commitment.reviewOn}).`, 'reviewOn');
      }

      const windowStart = addDays(commitment.declaredOn, 0);
      const subtreeIds = new Set([...(built.byId.get(commitment.spanId)?.descendantSeatIds || [])]);
      const inScope = records().filter((r) => {
        if (!r || !subtreeIds.has(owningSeatId(built, r.fromSeatId))) return false;
        if (r.loggedOn < windowStart || r.loggedOn > today) return false;
        return commitment.decisionClass === '*' || r.decisionClass === commitment.decisionClass;
      });
      const lifted = inScope.filter(
        (r) => r.disposition === 'escalated' && owningSeatId(built, r.toSeatId) === commitment.spanId,
      );

      if (inScope.length < conv.escalationCellFloor) {
        return fail(
          `Refused: only ${inScope.length} decision moment(s) recorded in this span and class since the declaration, below the ${conv.escalationCellFloor}-item floor. A graded commitment computed from that would be noise dressed as evidence.`,
          'escalationRecords',
        );
      }

      const nowDate = clock();
      const row = normalizeEscalationCommitment({
        ...commitment,
        status: 'graded',
        observedInterventionRatePct: Math.round((lifted.length / inScope.length) * 1000) / 10,
        observedEscalationCount: lifted.length,
        observedN: inScope.length,
        gradedOn: dayKey(nowDate),
      });
      if (!row) return fail('The graded commitment would not be a valid ledger row.', 'id');

      store.update(
        (draft) => {
          const list = Array.isArray(draft.escalationCommitments) ? draft.escalationCommitments : [];
          const idx = list.findIndex((c) => c && c.id === id);
          if (idx >= 0) list[idx] = row;
        },
        {
          type: ESCALATION_EVENTS.GRADED,
          entity: 'escalationcommitment',
          entityId: id,
          summary: `Graded commitment for ${seatLabel(built, commitment.spanId)} ("${commitment.decisionClass}", ${commitment.periodKey}): observed ${row.observedInterventionRatePct}% against a declared ${commitment.committedInterventionRatePct}% ceiling, ${row.observedEscalationCount} of a ${commitment.committedEscalationBudget} budget (n=${row.observedN}, Brier ${row.brier}).`,
        },
      );
      return saved({ commitment: findCommitment(id) });
    },

    escalationUpdateSettings(patch = {}) {
      if (!patch || typeof patch !== 'object') return fail('Settings patch must be an object.', 'settings');
      const merged = normalizeEscalationSettings({ ...settings(), ...patch });
      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...merged };
        },
        {
          type: ESCALATION_EVENTS.SCAN,
          entity: 'settings',
          entityId: 'escalation',
          summary: 'Updated Escalation Economy conventions.',
        },
      );
      return saved({ settings: merged });
    },

    /** Explicit scan: always runs, even with automation paused. */
    escalationScan() {
      const { error } = verifySeatRight(null);
      if (error) return error;
      store.update(
        () => {},
        {
          type: ESCALATION_EVENTS.SCAN,
          entity: 'escalation',
          entityId: 'scan',
          summary: 'Explicit Escalation Economy scan (roll-up, queue, yield, authority, monkey return).',
        },
      );
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}
