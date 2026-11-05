/**
 * app/core/domain/spanCalibrationActions.js — commands and scoped adapters for
 * the Discretion Calibrator (ADR-0100).
 *
 * Reads are pure adapters and are safe under a declared seat. The writes are:
 *
 *   freeze          measure the record and freeze one calibration reading
 *   grade           grade a due reading once (also happens on scan)
 *   adopt           put a calibrated ladder in force — a dated, append-only
 *                   declaration naming the reading that justified it
 *   restore         return to the declared ladder, also dated and append-only
 *   set conventions the coverage promise, floors and bands, clamped
 *   scan            re-measure and let the spine open its bounded work
 *
 * Neither of these changes a horizon without a human: `adopt` and `restore` are
 * the only two writes that touch the ladder, both are declared commands, and
 * both are recorded with the before table, the after table and the reading that
 * justified the move. Freezing a reading changes nothing about routing.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  adoptableLadder,
  buildSpanCalibrationReport,
  buildSpanReading,
  gradeSpanReading,
  spanCalibrationAttentionCount,
  spanCalibrationBriefText,
  spanCalibrationCsvRows,
  spanCalibrationSignals,
} from './spanCalibration.js';
import {
  normalizeAdoptedHorizons,
  normalizeSpanCalibrationSettings,
  spanCalibrationConventions,
} from './spanCalibrationSchema.js';
import { SPAN_EVENTS, SPAN_LIMITS, SPAN_DEFAULTS } from './spanCalibrationRegistry.js';
import { ALTITUDES } from './chainRegistry.js';

const DECLARED = Object.freeze(ALTITUDES.reduce((acc, altitude) => {
  acc[altitude.key] = altitude.horizonDays;
  return acc;
}, {}));

export function createSpanCalibrationActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildSpanCalibrationReport(store.state, { now: clock(), settings: settings() });

  const seatFor = (right) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the ladder.' };
    }
    const verdict = canAct(right, seat);
    return verdict.allow ? { ok: true, seat } : { ok: false, error: verdict.reason };
  };

  return {
    spanCalibrationReport() {
      return report();
    },

    spanCalibrationSignals() {
      return spanCalibrationSignals(store.state, clock(), settings());
    },

    spanCalibrationBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: spanCalibrationBriefText(current) } : current;
    },

    spanCalibrationCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return {
        ok: true,
        rows: spanCalibrationCsvRows(current),
        summary: { rungs: current.rungs.length, measurable: current.totals.measurableRungs, items: current.totals.itemsN },
      };
    },

    spanCalibrationAttentionCount() {
      return spanCalibrationAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    spanCalibrationConventions() {
      return spanCalibrationConventions(settings());
    },

    spanCalibrationFreeze() {
      const right = seatFor('calibrate-span');
      if (!right.ok) return fail(right.error);
      const nowValue = clock();
      const today = dayKey(nowValue);
      const existing = (store.state.spanReadings || []).find((row) => row && row.frozenOn === today);
      if (existing) return saved({ id: existing.id, existing: true, report: report() });
      if ((store.state.spanReadings || []).length >= SPAN_LIMITS.readings) {
        return fail(`The calibration ledger is full at ${SPAN_LIMITS.readings} readings. Export the brief before freezing another.`);
      }
      const built = buildSpanReading(store.state, { id: idFactory('spc'), now: nowValue, settings: settings() });
      if (!built.ok) return fail(built.error);
      store.update((draft) => {
        draft.spanReadings = Array.isArray(draft.spanReadings) ? draft.spanReadings : [];
        draft.spanReadings.unshift(built.reading);
      }, {
        type: SPAN_EVENTS.FROZEN,
        entity: 'spanreading',
        entityId: built.reading.id,
        summary: `Froze a span calibration (${built.reading.rungs.filter((rung) => rung.verdict !== 'insufficient').length} measurable rung(s)); registration and any falsified-rung decision handled by the spine`,
      });
      return saved({ id: built.reading.id, existing: false, reading: built.reading, report: report() });
    },

    spanCalibrationGrade({ readingId } = {}) {
      const right = seatFor('calibrate-span');
      if (!right.ok) return fail(right.error);
      const readings = store.state.spanReadings || [];
      const reading = readingId ? readings.find((row) => row && row.id === readingId) : readings[0];
      if (!reading) return fail('No calibration reading to grade.', 'readingId');
      const result = gradeSpanReading(reading, store.state, { now: clock(), settings: settings() });
      if (!result.ok) return fail(result.error, 'readingId');
      store.update((draft) => {
        const target = (draft.spanReadings || []).find((row) => row && row.id === reading.id);
        if (!target || target.gradedAt) return;
        target.gradedAt = result.grade.gradedOn;
        target.grade = result.grade;
      }, {
        type: 'spancalibration.graded',
        entity: 'spanreading',
        entityId: reading.id,
        summary: `Graded a frozen span calibration once (${result.grade.rungsScoredN} rung(s), mean Brier ${result.grade.meanBrier})`,
      });
      return saved({ id: reading.id, grade: result.grade, report: report() });
    },

    /**
     * Adopt a frozen reading's ladder. Recorded three ways: the append-only
     * `spanAdoptions` ledger (with the prior table), the settings the chain reads,
     * and an event. `supersedesId` points at the adoption this one replaces, so
     * the whole ladder history is a chain rather than a mutable field.
     */
    spanCalibrationAdopt({ readingId, note = '' } = {}) {
      const right = seatFor('adopt-ladder');
      if (!right.ok) return fail(right.error);
      if (!right.seat.fullAccess) {
        return fail('Only the workspace leader may declare a ladder in force: the ladder prices every span’s escalation clock.');
      }
      const readings = store.state.spanReadings || [];
      const reading = readingId ? readings.find((row) => row && row.id === readingId) : readings[0];
      if (!reading) return fail('Freeze a calibration reading first; an adoption must name the reading that justified it.', 'readingId');
      const conventions = spanCalibrationConventions(settings());
      const table = adoptableLadder(reading, ALTITUDES, conventions);
      if (!table) return fail('This reading carries no proposed ladder to adopt.', 'readingId');
      const current = settings();
      const priorTable = normalizeAdoptedHorizons(current.chainAdoptedHorizons, DECLARED);
      const next = table.reduce((acc, row) => { acc[row.key] = row.days; return acc; }, {});
      const previous = (store.state.spanAdoptions || [])[0] || null;
      const adoption = {
        id: idFactory('spanadopt'),
        adoptedOn: dayKey(clock()),
        readingId: reading.id,
        action: 'adopt',
        source: 'measured',
        table: table.map((row) => ({ key: row.key, days: row.days })),
        priorTable: priorTable
          ? ALTITUDES.map((altitude) => ({ key: altitude.key, days: priorTable[altitude.key] }))
          : ALTITUDES.map((altitude) => ({ key: altitude.key, days: altitude.horizonDays })),
        note: String(note || '').slice(0, 300),
        bySeatId: right.seat.id || null,
        supersedesId: previous?.id || null,
        createdAt: clock().toISOString(),
      };
      store.update((draft) => {
        draft.spanAdoptions = Array.isArray(draft.spanAdoptions) ? draft.spanAdoptions : [];
        draft.spanAdoptions.unshift(adoption);
        if (!draft.settings) draft.settings = {};
        draft.settings.chainAdoptedHorizons = next;
        draft.settings.chainAdoptedOn = adoption.adoptedOn;
        draft.settings.chainAdoptedReadingId = reading.id;
      }, {
        type: SPAN_EVENTS.ADOPTED,
        entity: 'spanadoption',
        entityId: adoption.id,
        summary: `Adopted a calibrated leadership ladder from reading ${reading.id}: ${table.map((row) => `${row.key} ${row.days}d`).join(' / ')}`,
      });
      return saved({ id: adoption.id, adoption, report: report() });
    },

    /** Return to the declared ladder. Dated, append-only, and never a silent reset. */
    spanCalibrationRestoreLadder({ note = '' } = {}) {
      const right = seatFor('adopt-ladder');
      if (!right.ok) return fail(right.error);
      if (!right.seat.fullAccess) {
        return fail('Only the workspace leader may change the ladder in force.');
      }
      const current = settings();
      const priorTable = normalizeAdoptedHorizons(current.chainAdoptedHorizons, DECLARED);
      if (!priorTable) return fail('The declared ladder is already in force; there is nothing to restore.');
      const adoption = {
        id: idFactory('spanadopt'),
        adoptedOn: dayKey(clock()),
        readingId: null,
        action: 'restore',
        source: 'declared',
        table: ALTITUDES.map((altitude) => ({ key: altitude.key, days: altitude.horizonDays })),
        priorTable: ALTITUDES.map((altitude) => ({ key: altitude.key, days: priorTable[altitude.key] })),
        note: String(note || '').slice(0, 300),
        bySeatId: right.seat.id || null,
        supersedesId: (store.state.spanAdoptions || [])[0]?.id || null,
        createdAt: clock().toISOString(),
      };
      store.update((draft) => {
        draft.spanAdoptions = Array.isArray(draft.spanAdoptions) ? draft.spanAdoptions : [];
        draft.spanAdoptions.unshift(adoption);
        if (!draft.settings) draft.settings = {};
        delete draft.settings.chainAdoptedHorizons;
        draft.settings.chainAdoptedOn = null;
        draft.settings.chainAdoptedReadingId = null;
      }, {
        type: SPAN_EVENTS.ADOPTED,
        entity: 'spanadoption',
        entityId: adoption.id,
        summary: 'Restored the declared leadership ladder; the adopted table is kept in the append-only ledger',
      });
      return saved({ id: adoption.id, adoption, report: report() });
    },

    spanCalibrationSetConventions(patch = {}) {
      const right = seatFor('calibrate-span');
      if (!right.ok) return fail(right.error);
      const before = normalizeSpanCalibrationSettings(settings());
      const merged = normalizeSpanCalibrationSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [], report: report() });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: SPAN_EVENTS.SCAN,
        entity: 'spancalibration',
        entityId: 'conventions',
        summary: `Changed calibration conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: report() });
    },

    spanCalibrationScan() {
      const right = seatFor('calibrate-span');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: SPAN_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'spancalibration',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-measured the ladder against the record, graded any due reading, and opened the bounded work the spine owns',
      });
      return saved({ report: report() });
    },

    /** What the settings look like right now, for the conventions panel. */
    spanCalibrationSettings() {
      return { ...SPAN_DEFAULTS, ...normalizeSpanCalibrationSettings(settings()), declared: { ...DECLARED } };
    },
  };
}
