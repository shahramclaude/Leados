/** ADR-0259 — one append-only workpaper per test, guarded against the live matrix. */
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  CASH_COVENANT_LIMITS as L, CASH_COVENANT_METHOD as METHOD, cashCovenantFailure as fail,
  cashCovenantId, cashCovenantStewards, cashVersionExists, readCashCovenantLedger, readCashCovenantRevision,
} from './cashCovenantSchema.js';

const READ = 'read-cash-covenant';
const RECORD = 'record-cash-covenant';
const RECORD_REASON = 'Declare a director or VP seat in the Altitude Lens to record evidence. CEO and local operator views may review only.';
const unavailable = () => fail('This test or revision is missing or not readable from this seat.');

const metadata = (revision, i) => ({ number: i + 1, versionRef: revision.versionRef, recordedAt: revision.recordedAt });

export function createCashCovenantActions(store, { now, idFactory }) {
  function context(right) {
    const at = now();
    const stamp = at.toISOString();
    const state = store.state;
    const matrix = buildMatrix(state, { now: at });
    const built = buildSeats(state, { now: at, lineScope: matrixLineScope(matrix).byManager });
    const seat = activeSeat(built);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    if (right === RECORD && seat.fullAccess) return fail(RECORD_REASON);
    const ledger = readCashCovenantLedger(state.cashCovenantTests, stamp);
    if (!ledger.ok) return ledger;
    const eligibleId = (id) => cashCovenantId(id) && built.nodeIndex.has(id) && matrix.roster.has(id)
      && (id === seat.nodeId || matrix.nodes.get(id)?.ancestors.has(seat.nodeId));
    // All named lines must be reachable. Multiple paths to one steward never
    // duplicate a person or authorize the seat that holds just one steward.
    const canRead = (entry) => seat.fullAccess || entry.series.stewardIds.every(eligibleId);
    const person = (id) => ({ id, name: matrix.nodes.get(id)?.name ?? null });
    const mayRecord = !seat.fullAccess && canAct(RECORD, seat).allow && !store.writeBlockReason;
    return { ok: true, seat, stamp, ledger, canRead, mayRecord, eligibleId, person, roster: matrix.roster };
  }

  function prepare(input, committing = false) {
    const check = context(RECORD);
    if (!check.ok) return check;
    if (store.writeBlockReason) return fail(store.writeBlockReason);
    if (committing && input?.expectedSeatId !== check.seat.nodeId) return fail('The recording seat has changed. Review the workpaper again from the current seat.');
    const prior = input?.prior ?? null;
    const entries = check.ledger.entries;
    let entry = null;
    let stewardIds;
    if (prior !== null) {
      entry = entries.find((r) => r.series.id === prior.testId);
      if (!entry || !check.canRead(entry)) return unavailable();
      if (entry.series.revisions.at(-1).versionRef !== prior.versionRef) {
        return fail('The revision you reviewed is no longer the latest recorded version. Reopen the test and preview your correction against that version.');
      }
      if (entry.series.revisions.length >= L.revisions) return fail(`This test already has ${L.revisions} revisions. No history was replaced.`);
      if (input.stewardIds != null) return fail('A correction cannot change the declared stewards.');
      stewardIds = entry.series.stewardIds;
    } else {
      stewardIds = cashCovenantStewards(input?.stewardIds);
      if (!stewardIds || !stewardIds.every(check.eligibleId)) {
        return fail(`Choose 1–${L.stewards} distinct leadership stewards, all within this seat’s active home or additional reporting reach.`, 'stewardIds');
      }
      if (entries.length >= L.tests) return fail(`This workspace already holds ${L.tests} tests. No workpaper was replaced.`);
    }
    const read = readCashCovenantRevision({
      text: input.text, cutoffAt: input.cutoffAt, versionRef: input.versionRef,
      supersedes: entry?.series.revisions.at(-1).versionRef ?? null,
      correctionReason: input.correctionReason ?? null, recordedAt: check.stamp, recordedById: check.seat.nodeId,
    }, check.stamp);
    if (!read.ok) return read;
    if (entry && read.key !== entry.key) return fail('A correction must keep the same facility, contractual test date and currency. Open a separate test for a different perimeter.', 'text');
    if (entry && cashVersionExists(entry.series.revisions, read.revision.versionRef)) return fail('Use a new version reference. A recorded version cannot be reused.', 'versionRef');
    if (!entry && entries.some((r) => r.key === read.key)) {
      return fail('Cannot open a second test for this facility, date and currency. Reopen the test if it is in your reach, or consult Treasury.');
    }
    if (check.ledger.bytes + read.bytes > L.ledger) return fail('The cash covenant ledger has reached its 512 KiB evidence limit. No prior evidence was removed.');
    return { ...read, check, stewardIds, entry };
  }

  return {
    cashCovenantIndex() {
      const check = context(READ);
      if (!check.ok) return check;
      const tests = check.ledger.entries.filter(check.canRead).map(({ series, reports }) => {
        const { terms, result } = reports.at(-1);
        return { id: series.id, facility: terms.facility, testDate: terms.testDate, currency: terms.currency,
          latestNumber: reports.length, recordedAt: series.revisions.at(-1).recordedAt, reading: result?.reading ?? null };
      }).sort((a, b) => b.testDate.localeCompare(a.testDate) || a.facility.localeCompare(b.facility) || a.currency.localeCompare(b.currency));
      const candidates = check.mayRecord ? [...check.roster.keys()].filter(check.eligibleId).map(check.person)
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id)) : [];
      return { ok: true, tests, mayRecord: check.mayRecord, candidates, recordReason: RECORD_REASON, persistError: store.persistError };
    },
    cashCovenantRead(testId, number = null) {
      const check = context(READ);
      if (!check.ok) return check;
      const entry = check.ledger.entries.find((r) => r.series.id === testId);
      if (!entry || !check.canRead(entry)) return unavailable();
      const { series, reports } = entry;
      const latestNumber = series.revisions.length;
      const i = number === null ? latestNumber - 1 : series.revisions.findIndex((_, j) => String(j + 1) === number);
      if (i < 0) return unavailable();
      const { cutoffAt, versionRef, supersedes, correctionReason, recordedAt, recordedById } = series.revisions[i];
      const recorder = check.seat.fullAccess || check.seat.nodeId === recordedById || check.eligibleId(recordedById) ? check.person(recordedById) : null;
      return { ok: true, testId, report: reports[i], revision: { number: i + 1, cutoffAt, versionRef, supersedes, correctionReason, recordedAt }, recorder,
        stewards: series.stewardIds.map(check.person), history: series.revisions.map(metadata), latestNumber,
        mayCorrect: check.mayRecord && i + 1 === latestNumber && latestNumber < L.revisions };
    },
    cashCovenantPreview(input) {
      const plan = prepare(input);
      if (!plan.ok) return plan;
      const { cutoffAt, versionRef, supersedes, correctionReason, text } = plan.revision;
      const latestNumber = plan.entry?.series.revisions.length ?? 0;
      return { ok: true, report: plan.report, revision: { number: latestNumber + 1, cutoffAt, versionRef, supersedes, correctionReason },
        stewards: plan.stewardIds.map(plan.check.person), recorder: plan.check.person(plan.check.seat.nodeId),
        submission: { cutoffAt, versionRef, correctionReason, text, expectedSeatId: plan.check.seat.nodeId,
          stewardIds: plan.entry ? null : plan.stewardIds, prior: plan.entry ? { testId: plan.entry.series.id, versionRef: supersedes } : null } };
    },
    async cashCovenantRecord(input) {
      const plan = prepare(input, true);
      if (!plan.ok) return plan;
      const testId = plan.entry?.series.id ?? idFactory('cash-test');
      const number = (plan.entry?.series.revisions.length ?? 0) + 1;
      if (!cashCovenantId(testId) || (!plan.entry && plan.check.ledger.entries.some((r) => r.series.id === testId))) {
        return fail('A distinct workpaper ID could not be issued. Nothing was overwritten.');
      }
      store.update((draft) => {
        if (plan.entry) draft.cashCovenantTests.find((r) => r.id === testId).revisions.push(plan.revision);
        else draft.cashCovenantTests.push({ id: testId, method: METHOD, stewardIds: plan.stewardIds, revisions: [plan.revision] });
      }, { type: plan.entry ? 'cashCovenant.corrected' : 'cashCovenant.recorded', entity: 'cashCovenantTest', entityId: testId,
        summary: 'Recorded a dated cash covenant evidence revision. No compliance certificate or authority was recorded.' });
      if (store.isEncrypted) await store.flush();
      return { ok: true, testId, number, saved: !store.persistError, warning: store.persistError || null };
    },
  };
}
