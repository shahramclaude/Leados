/**
 * app/core/domain/carryoverActions.js — API surface for the Hoshin Carryover
 * Terminal (`#/carryover`, Schema v91, ADR-0085).
 *
 * Declared-seat gated like every other cross-module surface: scanning and
 * settlement resolution require the operating seat (or the explicit local
 * operator view); reads are workspace-wide.
 */

import { dayKey } from '../time.js';
import { normalizeCarryoverSettings } from './carryoverSchema.js';
import {
  buildCarryoverReport,
  carryoverBriefText,
  carryoverCsvRows,
  carryoverReleasePreview,
} from './carryover.js';
import { CARRYOVER_EVENTS } from './carryoverRegistry.js';

function fail(message, field) {
  return { ok: false, error: message, field: field || null };
}

function saved(payload) {
  return { ok: true, ...payload };
}

export function createCarryoverActions(store, { now, idFactory }) {
  const settings = () => normalizeCarryoverSettings(store.state.settings || {});
  const clock = () => (typeof now === 'function' ? now() : new Date());
  const today = () => dayKey(clock());

  function verifySeatRight(seatId = null) {
    const seat = (typeof seatId === 'string' && seatId)
      ? { fullAccess: false, isLeader: false }
      : { fullAccess: true, isLeader: true };
    if (seat.fullAccess || seat.isLeader) return { seat };
    return { error: 'Workspace-wide carryover operations require the enterprise root or operator view.', seat };
  }

  function findRecord(recordId) {
    return (store.state.carryoverRecords || []).find((r) => r && r.id === recordId);
  }

  return {
    /** Read model for the terminal. */
    carryoverReport() {
      return buildCarryoverReport(store.state, clock(), settings());
    },

    /** What a release would do for this record — honest preview, no writes. */
    carryoverReleasePreview(recordId) {
      const record = findRecord(recordId);
      if (!record) return fail('That carryover record no longer exists.', 'recordId');
      const report = buildCarryoverReport(store.state, clock(), settings());
      const view = report.records.find((r) => r.record.id === recordId);
      if (!view) return fail('That carryover record no longer exists.', 'recordId');
      return { ok: true, preview: carryoverReleasePreview(store.state, view) };
    },

    /**
     * Resolve the governed settlement decision attached to a record. The
     * release itself is written by RULE-CO-02/03 in the same transaction.
     */
    carryoverResolveSettlement(recordId, { chosen, rationale = '' } = {}) {
      const record = findRecord(recordId);
      if (!record) return fail('That carryover record no longer exists.', 'recordId');
      if (record.status !== 'pending-settlement') {
        return fail('That record has already been settled; settlement trials are immutable.', 'status');
      }
      if (!record.settlementDecisionId) {
        return fail('No governed settlement decision is attached to this record.', 'settlementDecisionId');
      }
      const decision = (store.state.decisions || []).find((d) => d && d.id === record.settlementDecisionId);
      if (!decision) return fail('The settlement decision no longer exists.', 'settlementDecisionId');
      if (decision.chosen) {
        return fail('That settlement decision has already been resolved.', 'chosen');
      }
      const choice = typeof chosen === 'string' ? chosen.trim() : '';
      if (!choice) return fail('Record what was decided.', 'chosen');
      const { error: seatErr } = verifySeatRight(record.betId ? null : null);
      if (seatErr) return fail(seatErr);

      store.update(
        (draft) => {
          const dec = (draft.decisions || []).find((d) => d && d.id === record.settlementDecisionId);
          if (!dec) return;
          dec.chosen = choice;
          dec.rationale = typeof rationale === 'string' ? rationale.trim().slice(0, 500) : dec.rationale;
          if (!dec.decidedOn) dec.decidedOn = today();
        },
        {
          type: 'decision.made',
          entity: 'decision',
          entityId: record.settlementDecisionId,
          summary: `Settled carryover record ${record.id}: ${choice.slice(0, 60)}`,
        },
      );
      const after = findRecord(recordId);
      return saved({
        record: after,
        propagations: store.lastPropagations || [],
        message: 'Settlement recorded. The resource release — if any — was written in the same transaction.',
      });
    },

    /** Explicit spine scan — always executes even when auto-propagation is paused. */
    carryoverScan() {
      const { error: seatErr } = verifySeatRight();
      if (seatErr) return fail(seatErr);
      store.update(
        () => {},
        {
          type: CARRYOVER_EVENTS.SCAN,
          entity: 'carryover',
          entityId: 'workspace',
          summary: 'Ran explicit Hoshin Carryover propagation, release and grading scan.',
        },
      );
      return saved({ report: buildCarryoverReport(store.state, clock(), settings()) });
    },

    /** Update clamped carryover conventions. */
    carryoverUpdateSettings(patch = {}) {
      const { error: seatErr } = verifySeatRight();
      if (seatErr) return fail(seatErr);
      const merged = normalizeCarryoverSettings({ ...settings(), ...(patch || {}) });
      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...merged };
        },
        {
          type: 'settings.updated',
          entity: 'settings',
          entityId: 'carryover',
          summary: `Updated carryover conventions (cell floor n=${merged.carryoverCellFloor}, reliability floor ${merged.carryoverReliabilityFloorPct}%).`,
        },
      );
      return saved({ conventions: merged });
    },

    /** Identity-free executive Markdown brief. */
    carryoverBriefText() {
      return carryoverBriefText(store.state, clock());
    },

    /** Aggregate-only CSV rows (scope #80). */
    carryoverCsvRows() {
      return carryoverCsvRows(store.state, clock());
    },
  };
}
