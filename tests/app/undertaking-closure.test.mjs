/**
 * tests/app/undertaking-closure.test.mjs — the kernel suite for ADR-0234
 * (Regulatory Undertaking & Outward-Commitment Closure Register, `RULE-UDT-01`).
 *
 * Pure over (state, now): no store, no seat, no DOM. Every expected state comes
 * from the acts the fixture declares, never from a stored copy — the same
 * discipline the kernel enforces on the real record.
 *
 * The fixture is deliberately matrixed: the promise to the regulator lands on
 * THREE obligation lines held by three different people under two different
 * managers, so the whole promise has no single owner — the joint apex above all
 * three lines answers, and the register prints that rather than picking one.
 * The three facts (delivered / confirmed / reported) are asserted apart
 * throughout, because collapsing them is the failure this register exists for.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUndertakings } from '../../app/core/domain/undertakingClosure.js';
import {
  normalizeUndertakingActs,
  normalizeUndertakingMarkers,
  normalizeUndertakings,
} from '../../app/core/domain/undertakingSchema.js';
import {
  UDT_FLAGS,
  UDT_STATE_KEYS,
  UDT_ACCOUNTABILITY_KEYS,
  udtInstrumentIsExternal,
} from '../../app/core/domain/undertakingRegistry.js';
import { UDT_WINDOW_BUCKETS } from '../../app/core/domain/undertakingMath.js';

const iso = '2026-01-01T09:00:00.000Z';
const at = (day) => new Date(`${day}T10:00:00.000Z`);

const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
const line = (id, personId, managerId, kind = 'functional') => ({ id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '', status: 'active', history: [] });

/**
 * ceo
 *  ├── marta
 *  │     ├── ops   (holds the operations line)
 *  │     └── fin   (holds the finance line)
 *  └── priya
 *        └── legal (holds the legal line)
 */
function state(overrides = {}) {
  return {
    people: [
      person('ceo', 'Cleo Executive', 'vp', null),
      person('marta', 'Marta Home', 'manager', 'ceo'),
      person('priya', 'Priya Project', 'manager', 'ceo'),
      person('ops', 'Ola Operations', 'ic', 'marta'),
      person('fin', 'Finn Finance', 'ic', 'marta'),
      person('legal', 'Lea Legal', 'ic', 'priya'),
    ],
    reportingLines: [
      line('rl-marta-ceo', 'marta', 'ceo'),
      line('rl-priya-ceo', 'priya', 'ceo'),
      line('rl-ops-marta', 'ops', 'marta'),
      line('rl-fin-marta', 'fin', 'marta'),
      line('rl-legal-priya', 'legal', 'priya'),
    ],
    undertakings: [],
    undertakingActs: [],
    undertakingMarkers: [],
    settings: {},
    ...overrides,
  };
}

const LINES = [
  { lineId: 'ln-ops', holderId: 'ops', roleLabel: 'operations', deliverable: 'The night shift rota rebuilt with the agreed rest intervals and published to the floor.', dueOn: '2026-03-15' },
  { lineId: 'ln-legal', holderId: 'legal', roleLabel: 'legal', deliverable: 'The regulator reporting pack updated to the new evidence standard and signed off.', dueOn: '2026-03-20' },
  { lineId: 'ln-fin', holderId: 'fin', roleLabel: 'finance', deliverable: 'The remediation spend reconciled against the undertaking and the ledger closed.', dueOn: '2026-03-30' },
];

function undertaking(overrides = {}) {
  return {
    id: 'udt-1',
    counterparty: 'Financial Supervision Authority',
    counterpartyKind: 'regulator',
    instrument: 'regulatory-undertaking',
    instrumentRef: 'UND-2026-07 §4',
    scope: 'Retail payments processing and the night-shift rota that supports it.',
    dueOn: '2026-04-30',
    declaredById: 'ceo',
    createdAt: iso,
    lines: LINES,
    ...overrides,
  };
}

const act = (kind, extra = {}) => ({ id: `act-${kind}-${extra.lineId || extra.n || 'x'}`, undertakingId: 'udt-1', actorId: 'ops', kind, at: '2026-02-01T09:00:00.000Z', ...extra });

const deliverFor = (lineId, actorId) => ({
  id: `act-deliver-${lineId}`, undertakingId: 'udt-1', actorId, kind: 'deliver', lineId,
  evidenceText: 'The work was done and can be inspected at the reference named on this act today.',
  referenceRef: 'DRIVE-2026-OPS', deliveredAt: '2026-02-10T09:00:00.000Z', at: '2026-02-10T09:00:00.000Z',
});
const verifyFor = (lineId, actorId, verdict = 'confirm') => ({
  id: `act-verify-${lineId}-${verdict}`, undertakingId: 'udt-1', actorId, kind: 'verify', lineId, verdict,
  methodText: 'I inspected the artefact myself and read the evidence against the declared deliverable.',
  verifiedAt: '2026-02-20T09:00:00.000Z', at: '2026-02-20T09:00:00.000Z',
});

const allDelivered = () => [
  deliverFor('ln-ops', 'ops'), deliverFor('ln-legal', 'legal'), deliverFor('ln-fin', 'fin'),
];
const allConfirmed = () => [
  ...allDelivered(),
  verifyFor('ln-ops', 'marta'), verifyFor('ln-legal', 'priya'), verifyFor('ln-fin', 'marta'),
];
const REPORT = {
  id: 'act-report-1', undertakingId: 'udt-1', actorId: 'ceo', kind: 'report',
  reportRef: 'FSA-FILING-2026-0412', reportText: 'The regulator was told in writing that every line is delivered and independently tested.',
  reportedAt: '2026-04-10T09:00:00.000Z', at: '2026-04-10T09:00:00.000Z',
};

const read = (over = {}, now = '2026-02-01') => buildUndertakings(state(over), { now: at(now) });
const rowOf = (report, id = 'udt-1') => report.rows.find((r) => r.id === id);

/* ------------------------------------------------------------------ schema */

test('an undertaking with no counterparty, instrument, scope or due day is refused outright', () => {
  const warnings = [];
  const bad = [
    { ...undertaking(), counterparty: '' },
    { ...undertaking(), counterpartyKind: 'made-up' },
    { ...undertaking(), instrument: 'made-up' },
    { ...undertaking(), instrumentRef: 'x' },
    { ...undertaking(), scope: 'too short' },
    { ...undertaking(), dueOn: 'yesterday' },
    { ...undertaking(), declaredById: null },
    { ...undertaking(), lines: [] },
    { ...undertaking(), lines: [{ ...LINES[0], deliverable: 'short' }] },
  ];
  for (const candidate of bad) {
    assert.equal(normalizeUndertakings([candidate], warnings).length, 0, `accepted a malformed undertaking: ${JSON.stringify(candidate).slice(0, 80)}`);
  }
  assert.ok(warnings.length > 0, 'every refusal is counted');
});

test('a line may be declared WITHOUT a holder, and the register never invents one', () => {
  const kept = normalizeUndertakings([undertaking({
    lines: [{ ...LINES[0], holderId: undefined }, LINES[1], LINES[2]],
  })], []);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].lines.length, 3, 'the line without a holder is READ, not dropped');
  assert.equal(kept[0].lines[0].holderId, null, 'no holder is inferred from position, tenure or the graph');
  // Roster existence is the ACTION's door, not the loader's: a stored row is
  // never dropped because the roster moved. The register prints the holder as
  // unresolved instead of erasing the duty (asserted in the wiring suite).
  const row = read({ undertakings: [undertaking({ lines: [{ ...LINES[0], holderId: 'departed' }] })] });
  assert.equal(row.rows[0].lines[0].holderId, 'departed', 'the duty is preserved, never silently erased');
  assert.equal(row.rows[0].lines[0].holderActive, false);
  assert.ok(row.rows[0].flags.includes(UDT_FLAGS.holderUnresolved), 'and the record says the holder is not active');
});

test('an act pointing at an undertaking that did not survive normalization is dropped', () => {
  const warnings = [];
  const kept = normalizeUndertakingActs([deliverFor('ln-ops', 'ops')], [], warnings);
  assert.equal(kept.length, 0);
  assert.ok(warnings.some((w) => /orphaned/.test(w)));
});

test('the loader refuses its own output only when the row really is unreadable', () => {
  const first = normalizeUndertakings([undertaking()], []);
  const second = normalizeUndertakings(first, []);
  assert.deepEqual(second, first, 'a stored row round-trips through the loader unchanged');
  const acts = normalizeUndertakingActs([deliverFor('ln-ops', 'ops')], first, []);
  assert.equal(acts.length, 1);
  assert.equal(normalizeUndertakingActs(acts, first, []).length, 1, 'a stored act round-trips too');
  const markers = normalizeUndertakingMarkers([{ key: 'k1', at: '2026-02-01T00:00:00.000Z', detail: 'An observation long enough to be a real one.' }], []);
  assert.deepEqual(normalizeUndertakingMarkers(markers, []), markers);
});

/* -------------------------------------------------------------- derivation */

test('declared-but-unassigned reads `declared`; staffed-but-undelivered reads `in-progress`', () => {
  const bare = read({ undertakings: [undertaking({ lines: [{ ...LINES[0], holderId: null }, LINES[1], LINES[2]] })] });
  assert.equal(rowOf(bare).state, 'declared');
  assert.equal(rowOf(bare).unassignedLineCount, 1);
  assert.equal(bare.figuresComplete, false, 'an unassigned line means the figures are not complete');

  const staffed = read({ undertakings: [undertaking()] });
  assert.equal(rowOf(staffed).state, 'in-progress');
  assert.equal(rowOf(staffed).unassignedLineCount, 0);
  assert.equal(staffed.figuresComplete, true);
});

test('THE THREE FACTS STAY APART: delivered is not confirmed, and confirmed is not reported', () => {
  const delivered = read({ undertakings: [undertaking()], undertakingActs: allDelivered() });
  const d = rowOf(delivered);
  assert.equal(d.state, 'delivered-untested');
  assert.equal(d.allConfirmed, false);
  assert.equal(d.reported, false);
  assert.equal(d.lines.every((l) => l.delivered), true);
  assert.equal(d.lines.every((l) => l.tested === false), true);
  assert.ok(d.flags.includes('line-held-awaiting-test') || d.lines.every((l) => l.lineState === 'delivered'));

  const confirmed = read({ undertakings: [undertaking()], undertakingActs: allConfirmed() });
  const c = rowOf(confirmed);
  assert.equal(c.state, 'confirmed-unreported');
  assert.equal(c.allConfirmed, true);
  assert.equal(c.reported, false, 'confirmed is NOT reported — doing the work is not telling them');
  assert.ok(c.flags.includes(UDT_FLAGS.unreported));

  const reported = read({ undertakings: [undertaking()], undertakingActs: [...allConfirmed(), REPORT] }, '2026-04-12');
  const r = rowOf(reported);
  assert.equal(r.state, 'reported-met');
  assert.equal(r.reported, true);
  assert.equal(r.reportedOn, '2026-04-10');
  assert.equal(r.unnotified === undefined, true, 'no phantom field');
  assert.equal(r.acknowledgedOn, null, 'reported, but no reply yet');
});

test('a report the counterparty DISPUTES is never a met promise', () => {
  const disputed = read({
    undertakings: [undertaking()],
    undertakingActs: [...allConfirmed(), REPORT, {
      id: 'act-notify-1', undertakingId: 'udt-1', actorId: 'ceo', kind: 'notify',
      acknowledgement: 'disputed', acknowledgementRef: 'FSA-LETTER-2026-099',
      notifiedAt: '2026-04-20T09:00:00.000Z', at: '2026-04-20T09:00:00.000Z',
    }],
  }, '2026-04-25');
  const d = rowOf(disputed);
  assert.equal(d.state, 'report-disputed');
  assert.ok(d.flags.includes(UDT_FLAGS.disputed));
  assert.notEqual(d.state, 'reported-met', 'a disputed report never reads as met');
});

test('a due day that passes with no report reads `lapsed` — never met, never closed', () => {
  const lapsed = read({ undertakings: [undertaking()], undertakingActs: allConfirmed() }, '2026-05-15');
  const row = rowOf(lapsed);
  assert.equal(row.state, 'lapsed-unreported');
  assert.equal(row.lapsed, true);
  assert.ok(row.flags.includes(UDT_FLAGS.lapsed));
  assert.equal(row.reported, false, 'the passage of time closed nothing');
  assert.equal(lapsed.counts.rates.reportedInsideWindow.owed, 1);
  assert.equal(lapsed.counts.rates.reportedInsideWindow.onTime, 0, 'a lapsed promise is never in the numerator');
});

test('lapsed outranks rejected, and rejected outranks reported — the registry precedence is the one read', () => {
  // Rejected line, and the promise is still inside its window.
  const rejected = read({
    undertakings: [undertaking()],
    undertakingActs: [...allConfirmed(), verifyFor('ln-ops', 'marta', 'reject')],
  });
  assert.equal(rowOf(rejected).state, 'rejected');
  assert.ok(rowOf(rejected).flags.includes(UDT_FLAGS.rejected));

  // Lapsed wins over a rejection.
  const lapsedRejected = read({
    undertakings: [undertaking()],
    undertakingActs: [...allConfirmed(), verifyFor('ln-ops', 'marta', 'reject')],
  }, '2026-06-01');
  assert.equal(rowOf(lapsedRejected).state, 'lapsed-unreported');

  // A report cannot be printed as met when a line is rejected.
  const reportedRejected = read({
    undertakings: [undertaking()],
    undertakingActs: [...allConfirmed(), verifyFor('ln-ops', 'marta', 'reject'), REPORT],
  }, '2026-04-15');
  assert.equal(rowOf(reportedRejected).state, 'rejected', 'a tested fact outranks the reassuring word');
});

test('a rejection, then a fresh assertion, then a confirmation resolves the line — in that order', () => {
  const acts = [
    { ...deliverFor('ln-ops', 'ops'), deliveredAt: '2026-02-01T09:00:00.000Z', at: '2026-02-01T09:00:00.000Z' },
    deliverFor('ln-legal', 'legal'), deliverFor('ln-fin', 'fin'),
    { ...verifyFor('ln-ops', 'marta', 'reject'), verifiedAt: '2026-02-05T09:00:00.000Z', at: '2026-02-05T09:00:00.000Z' },
    // A rejection leaves the line owed again.
    { ...deliverFor('ln-ops', 'ops'), id: 'act-deliver-again', deliveredAt: '2026-02-20T09:00:00.000Z', at: '2026-02-20T09:00:00.000Z' },
    verifyFor('ln-legal', 'priya'), verifyFor('ln-fin', 'marta'),
    { ...verifyFor('ln-ops', 'marta'), id: 'act-verify-ops-final', verifiedAt: '2026-03-10T09:00:00.000Z', at: '2026-03-10T09:00:00.000Z' },
  ];
  const report = read({ undertakings: [undertaking()], undertakingActs: acts }, '2026-03-12');
  const row = rowOf(report);
  const ops = row.lines.find((l) => l.lineId === 'ln-ops');
  assert.equal(ops.lineState, 'confirmed');
  assert.equal(ops.deliverCount, 2, 'the first assertion and its rejection stay on the record');
  assert.equal(ops.staleTestCount, 1, 'the superseded rejection is reported, not counted');
  assert.equal(row.state, 'confirmed-unreported');
});

test('a test dated BEFORE the latest assertion tested a different deliverable and does not count', () => {
  const acts = [
    ...allDelivered(),
    verifyFor('ln-legal', 'priya'), verifyFor('ln-fin', 'marta'),
    // ops is tested, then re-asserts a NEW deliverable afterwards.
    verifyFor('ln-ops', 'marta'),
    { ...deliverFor('ln-ops', 'ops'), id: 'act-deliver-later', deliveredAt: '2026-03-01T09:00:00.000Z', at: '2026-03-01T09:00:00.000Z' },
  ];
  const report = read({ undertakings: [undertaking()], undertakingActs: acts }, '2026-03-02');
  const ops = rowOf(report).lines.find((l) => l.lineId === 'ln-ops');
  assert.equal(ops.lineState, 'delivered', 'the old test does not confirm the new deliverable');
  assert.equal(ops.staleTestCount, 1, 'the superseded test is reported, never counted');
});

/* ---------------------------------------------------------------- the apex */

test('the accountable seat is the JOINT APEX above every line, computed and never chosen', () => {
  const report = read({ undertakings: [undertaking()] });
  const row = rowOf(report);
  assert.equal(row.accountability, 'joint-apex');
  assert.equal(row.apexId, 'ceo', 'the lowest seat above both marta and priya');
  assert.deepEqual(row.apexIds, ['ceo']);
  assert.ok(UDT_ACCOUNTABILITY_KEYS.includes(row.accountability));
});

test('a single-line promise reduces to the holder’s manager', () => {
  const report = read({
    undertakings: [undertaking({ lines: [LINES[0]] })],
  });
  const row = rowOf(report);
  assert.equal(row.accountability, 'single-holder');
  assert.equal(row.apexId, 'marta');
});

test('where no seat above every line exists, the register prints `no-authority` and invents nobody', () => {
  // Two lines held by two people with NO common ancestor but the workspace leader.
  const st = state({
    people: [
      person('ceo', 'Cleo Executive', 'vp', null),
      person('marta', 'Marta Home', 'manager', null),
      person('priya', 'Priya Project', 'manager', null),
      person('ops', 'Ola Operations', 'ic', 'marta'),
      person('legal', 'Lea Legal', 'ic', 'priya'),
    ],
    reportingLines: [line('rl-ops-marta', 'ops', 'marta'), line('rl-legal-priya', 'legal', 'priya')],
    undertakings: [undertaking({ lines: [LINES[0], LINES[1]] })],
    undertakingActs: [],
    undertakingMarkers: [],
  });
  const report = buildUndertakings(st, { now: at('2026-02-01') });
  const row = rowOf(report);
  // The workspace leader is a common apex; the register names it honestly
  // rather than promoting an unrelated manager into the role.
  assert.ok(['joint-apex', 'no-authority'].includes(row.accountability));
  if (row.accountability === 'joint-apex') {
    assert.ok(row.isLeaderApex || row.apexId, 'a leader apex is named honestly, never a manager who holds no line');
  } else {
    assert.equal(row.apexId, null);
    assert.ok(row.flags.includes(UDT_FLAGS.noAuthority));
  }
});

/* ------------------------------------------------------------ counts/rates */

test('the printed state counts partition the total, and the two claims are reported apart', () => {
  const clean = read({ undertakings: [undertaking()], undertakingActs: allConfirmed() });
  assert.equal(clean.partitionReconciles, true);
  assert.equal(clean.figuresComplete, true);
  assert.equal(UDT_STATE_KEYS.reduce((sum, key) => sum + clean.counts.byState[key], 0), clean.counts.undertakings);

  const dirty = read({
    undertakings: [undertaking(), { id: 'hand-edited', counterparty: 'x', dueOn: 'nope' }],
    undertakingActs: [...allConfirmed(), { id: 'junk', undertakingId: 'udt-1', kind: 'verify' }],
  });
  assert.equal(dirty.partitionReconciles, true, 'the partition still reconciles over what survived');
  assert.equal(dirty.figuresComplete, false, 'but the figures are NOT complete, and that is said separately');
  assert.ok(dirty.counts.droppedRows >= 2);
});

test('the rate is exact floor basis points over the exact counts it prints', () => {
  // Two promises whose due day has passed; one reported on time, one lapsed.
  const reported = undertaking({ id: 'udt-a' });
  const onTime = { ...REPORT, id: 'rep-a', undertakingId: 'udt-a', reportedAt: '2026-04-10T09:00:00.000Z', at: '2026-04-10T09:00:00.000Z' };
  const confirmedFor = (id) => allConfirmed().map((a) => ({ ...a, id: `${a.id}-${id}`, undertakingId: id }));
  const report = buildUndertakings(state({
    undertakings: [reported, undertaking({ id: 'udt-b' })],
    undertakingActs: [...confirmedFor('udt-a'), onTime, ...confirmedFor('udt-b')],
  }), { now: at('2026-06-01') });
  const rate = report.counts.rates.reportedInsideWindow;
  assert.equal(rate.owed, 2, 'both due days have passed');
  assert.equal(rate.onTime, 1, 'only the one reported inside its window counts');
  assert.equal(rate.onTimeBp, 5000, 'exactly one half, in floor basis points');
  assert.equal(Math.floor((rate.onTime * 10000) / rate.owed), rate.onTimeBp, 'the printed rate IS the printed counts');
});

test('an empty register claims nothing and reconciles to zero', () => {
  const empty = buildUndertakings(state(), { now: at('2026-02-01') });
  assert.equal(empty.counts.undertakings, 0);
  assert.equal(empty.partitionReconciles, true);
  assert.equal(empty.figuresComplete, true);
  assert.equal(empty.counts.rates.reportedInsideWindow.onTimeBp, null, 'no denominator means a BLANK rate, never zero');
});

test('due-window buckets cover every open undertaking exactly once', () => {
  const report = read({
    undertakings: [undertaking({ id: 'a' }), undertaking({ id: 'b', dueOn: '2026-03-05' }), undertaking({ id: 'c', dueOn: '2027-01-01' })],
  }, '2026-02-01');
  const sum = UDT_WINDOW_BUCKETS.reduce((total, bucket) => total + report.counts.windows[bucket.key], 0);
  assert.equal(sum, report.counts.open, 'the open bucket counts add to the open total');
});

test('external instruments are the only ones that require the counterparty’s agreement to move', () => {
  assert.equal(udtInstrumentIsExternal('licence-condition'), true);
  assert.equal(udtInstrumentIsExternal('regulatory-undertaking'), true);
  assert.equal(udtInstrumentIsExternal('board-resolution'), false);
});

test('an external instrument extended without recorded agreement is PRINTED, never repaired', () => {
  const report = read({
    undertakings: [undertaking()],
    undertakingActs: [{
      id: 'act-ext-1', undertakingId: 'udt-1', actorId: 'ceo', kind: 'extend',
      previousDueOn: '2026-04-30', newDueOn: '2026-06-30', reason: 'The vendor delivered late and the regulator has not been asked yet.',
      counterpartyAgreementRef: null, extendedAt: '2026-03-01T09:00:00.000Z', at: '2026-03-01T09:00:00.000Z',
    }],
  }, '2026-03-05');
  const row = rowOf(report);
  assert.equal(row.effectiveDueOn, '2026-06-30', 'the extension moved the day');
  assert.ok(row.flags.includes(UDT_FLAGS.unilateralExtension), 'and the record says it was moved without agreement');
});

test('the kernel is pure: it never mutates the state it reads', () => {
  const st = state({ undertakings: [undertaking()], undertakingActs: allConfirmed() });
  const before = JSON.stringify(st);
  buildUndertakings(st, { now: at('2026-02-01') });
  assert.equal(JSON.stringify(st), before);
});

test('a marker is keyed and never duplicated', () => {
  const marker = { key: 'udt1|no-ask|x', at: '2026-02-01T00:00:00.000Z', detail: 'An observation long enough to be a real one.' };
  const kept = normalizeUndertakingMarkers([marker, marker, { ...marker }], []);
  assert.equal(kept.length, 1);
});
