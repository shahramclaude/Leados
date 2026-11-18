// ADR-0252 — the inspected object is a decision reference, not a person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { parseCsv, serializeCsv } from '../../app/core/csv.js';
import { LOOKBACK_LIMITS as L, instrumentReceipt, readInstrumentEvidence, traceInstrumentUses } from '../../app/core/domain/instrumentLookback.js';
import { normalizeInstrumentLookbacks } from '../../app/core/domain/instrumentLookbackSchema.js';
import { parseInstrumentUses, USE_HEADERS } from '../../app/core/domain/instrumentUseExtract.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import { planRelease } from '../../app/core/domain/differencing.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { renderInstrumentLookback } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const AT = NOW.toISOString();
const START = '2026-11-02T08:00:00.000Z';
const TODAY = AT.slice(0, 10);
const timing = { checkOn: TODAY, capturedOn: TODAY };
const logUse = (useRef, instrumentRef, usedOn, decisionRef) => ({ useRef, instrumentRef, usedOn, decisionRef });
const basis = {
  instrumentRef: 'G-17', goodOn: '2026-11-10', goodRef: 'LAB-71#prior', failedOn: '2026-11-16', failureRef: 'LAB-92#as-found',
  sourceRef: 'MES line union / v1', coverage: 'attested', expectedUses: 6,
};
const uses = [
  logUse('u1', 'G-17', '2026-11-10', 'J|100'), logUse('u1', 'G-17', '2026-11-10', 'J|100'),
  logUse('u2', 'G-17', '2026-11-16', 'J|100'), logUse('u3', 'G-17', '2026-11-14', 'R,200'),
  logUse('u4', 'OTHER-GAUGE', null, 'OTHER-LINE'), logUse('u5', 'G-17', '2026-11-09', 'BEFORE-WINDOW'),
  logUse('u6', 'G-17', '2026-11-17', 'AFTER-FAILURE'),
];
const evidence = (patch = {}) => ({ ...basis, uses: structuredClone(uses), ...patch });
const parent = { id: 'abnormal', outcome: 'abnormal', recordedOn: TODAY, recordedAt: AT, recordedById: 'kim' };
const paper = (patch = {}) => ({ ...evidence(), id: 'paper-1', checkId: parent.id, recordedAt: AT, recordedById: 'kim', ...patch });

function fixture(matrix = true) {
  const s = createEmptyState(AT);
  s.settings.activeSeatId = 'kim';
  const person = (id, managerId, level) => ({ id, managerId, level, name: `Seat ${id}`, role: level, status: 'active', createdAt: START, updatedAt: START });
  s.people = [person('ada', null, 'vp'), person('ann', 'ada', 'director'), person('bob', 'ada', 'manager'),
    person('kim', 'ann', 'manager'), person('crew', 'kim', 'ic'), person('peer', 'ann', 'lead'), person('crew2', 'peer', 'ic')];
  if (matrix) s.reportingLines = [{ id: 'rl-project', personId: 'kim', managerId: 'bob', kind: 'project', fromISO: '2026-11-02', declaredAt: START, status: 'active' }];
  s.standardWorkRoutines = [{ id: 'routine', title: 'Instrument check at receiving', ownerId: 'kim', lineKey: matrix ? 'rl-project' : null,
    standard: 'Verify the reference before using the gauge for acceptance.', kind: 'process-confirmation', cadence: 'daily',
    weekdays: [1, 2, 3, 4, 5], minutes: 10, fromDay: '2026-11-16', declaredAt: START, declaredById: 'kim' }];
  return s;
}

function open(storage, idFactory) {
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}
function workspace(matrix = true) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(fixture(matrix))]]);
  let seq = 0, blocked = false;
  const storage = { getItem: (k) => data.get(k) ?? null, removeItem: (k) => data.delete(k), setItem: (k, v) => {
    if (blocked) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    data.set(k, String(v));
  } };
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const { store, api } = open(storage, idFactory);
  const result = api.standardWorkRecordCheck({ routineId: 'routine', outcome: 'abnormal', note: 'The as-found measurement failed its documented limit.',
    disposition: 'escalated', toId: matrix ? 'bob' : 'ann' });
  assert.equal(result.ok, true, result.error);
  return { store, api, checkId: result.checkId, reload: () => open(storage, idFactory), bytes: () => data.get(STORAGE_KEY),
    sit: (id) => store.update((draft) => { draft.settings.activeSeatId = id; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'Seat change' }),
    block: () => { blocked = true; } };
}

test('look-back: the migration adds an empty ledger, not failures inferred from abnormal notes', () => {
  const s = fixture(); s.schemaVersion = 204; delete s.instrumentLookbacks;
  const { raw, applied } = migrate(s);
  assert.deepEqual(applied, ['204 → 205', '205 → 206']); assert.deepEqual(raw.instrumentLookbacks, []);
  assert.deepEqual(raw.standardWorkRoutines, s.standardWorkRoutines);
});

test('look-back: CSV/TSV permits reordered headers, quotes, commas, empty cells and an explicit empty extract', () => {
  const p = parseInstrumentUses('\uFEFFdecision_ref,used_on,instrument_ref,use_ref\r\n"R,\"\"2\"\"",,G-17,u1\r\n');
  assert.deepEqual(p, { ok: true, uses: [logUse('u1', 'G-17', '', 'R,"2"')] });
  assert.deepEqual(parseInstrumentUses(`${USE_HEADERS.join('\t')}\nu1\t\t\t`).uses, [logUse('u1', '', '', '')]);
  assert.deepEqual(parseInstrumentUses(USE_HEADERS.join(',')).uses, []);
  for (const text of ['', 'use_ref,used_on,used_on,decision_ref', ...['a,b,c', 'a,b,c,d,e', 'a,b,c,"unclosed', 'a,b,c,"x"suffix', 'a,b,c,d"', 'a,b,c,d\n\n'].map((line) => `${USE_HEADERS.join(',')}\n${line}`), 'x'.repeat(L.text + 1)]) {
    assert.equal(parseInstrumentUses(text).ok, false, 'an invalid extract is never partially accepted');
  }
});

test('look-back: inclusive day boundaries, distinct decisions, exclusions and source multiplicities reconcile independently', () => {
  const input = evidence(), before = structuredClone(input);
  const read = readInstrumentEvidence(input, timing); assert.equal(read.ok, true, read.error);
  const t = traceInstrumentUses(read.evidence);
  assert.deepEqual(t.counts, { matched: 3, possible: 0, before: 1, after: 1, other: 1 });
  assert.deepEqual([t.sourceRows, t.distinctUses, t.duplicateRows, t.recorded, t.unlinked, t.balances, t.decisionTotal], [7, 6, 1, 2, 0, true, 2]);
  assert.deepEqual(t.decisions, [{ decisionRef: 'J|100', matched: 2, possible: 0 }, { decisionRef: 'R,200', matched: 1, possible: 0 }]);
  assert.equal(t.rows[0].copies, 2);
  assert.deepEqual(traceInstrumentUses(readInstrumentEvidence(evidence({ uses: [...uses].reverse() }), timing).evidence), t);
  assert.deepEqual(input, before);
});

test('look-back: an independent completion oracle checks every instrument/date combination, including an unknown lower bound', () => {
  const instruments = ['G-17', 'OTHER'];
  const days = ['2026-11-09', basis.goodOn, '2026-11-12', basis.failedOn, '2026-11-17'];
  for (const goodOn of [basis.goodOn, null]) for (const instrument of [...instruments, null]) for (const date of [...days, null]) {
    const read = readInstrumentEvidence(evidence({ goodOn, goodRef: goodOn ? basis.goodRef : null, expectedUses: 1, uses: [logUse('__proto__', instrument, date, 'D|1')] }), timing);
    assert.equal(read.ok, true);
    const t = traceInstrumentUses(read.evidence);
    const possibilities = (instrument ? [instrument] : instruments).flatMap((g) => (date ? [date] : days).flatMap((d) =>
      (goodOn ? [goodOn] : ['2026-11-01', basis.failedOn]).map((start) => g === 'G-17' && d >= start && d <= basis.failedOn)));
    // With no start, even a same-day use cannot establish a bounded window.
    const expected = possibilities.every(Boolean) && goodOn ? 'matched' : possibilities.some(Boolean) ? 'possible' : 'outside';
    assert.equal(['matched', 'possible'].includes(t.rows[0].placement) ? t.rows[0].placement : 'outside', expected, JSON.stringify({ goodOn, instrument, date }));
  }
});

test('look-back: no evidence, missing decision, uncertain placement, control mismatch and supported zero are different outcomes', () => {
  for (const [patch, reason] of [
    [{ coverage: 'partial' }, /not attested/], [{ expectedUses: null }, /No independent/], [{ expectedUses: 0 }, /control is 0/],
    [{ goodOn: null, goodRef: null }, /last-good/], [{ uses: [logUse('u', 'G-17', basis.goodOn, null)], expectedUses: 1 }, /lack an inspection/],
    [{ uses: [logUse('u', null, basis.goodOn, 'D')], expectedUses: 1 }, /cannot be placed/],
  ]) {
    const t = traceInstrumentUses(readInstrumentEvidence(evidence(patch), timing).evidence);
    assert.equal(t.balances, true); assert.equal(t.decisionTotal, null); assert.match(t.reasons.join(' '), reason);
  }
  const unknown = traceInstrumentUses(evidence({ coverage: 'partial', uses: [], expectedUses: null }));
  const zero = traceInstrumentUses(evidence({ uses: [], expectedUses: 0 }));
  assert.deepEqual([zero.decisionTotal, unknown.decisionTotal, unknown.recorded], [0, null, 0]);
});

test('look-back: same-day/as-left references, impossible dates, fractional controls and conflicting IDs are refused, never repaired', () => {
  for (const patch of [{ goodOn: basis.failedOn }, { goodOn: '2026-11-17' }, { goodRef: basis.failureRef }, { goodOn: null },
    { failedOn: '2026-02-30' }, { failedOn: '2026-11-19' }, { failedOn: `${basis.failedOn}x` }, { expectedUses: 0.5 }, { expectedUses: '6' },
    { instrumentRef: 'G-17 ' }, { sourceRef: 's'.repeat(121) }, { coverage: true }, { uses: [logUse('', 'G-17', null, null)] },
    { uses: [logUse('U', 'G-17', '2026-11-19', null)] }, { uses: [logUse('U', true, null, null)] }, { uses: [logUse('U', null, null, 'dirty\nref')] },
    { uses: Array(L.rows + 1).fill(uses[0]) }]) assert.equal(readInstrumentEvidence(evidence(patch), timing).ok, false, JSON.stringify(Object.keys(patch)));
  const conflict = [uses[0], { ...uses[0], decisionRef: 'DIFFERENT' }];
  for (const rows of [conflict, [...conflict].reverse()]) assert.match(readInstrumentEvidence(evidence({ uses: rows }), timing).error, /conflicts with data row 1/);
});

test('look-back: loader preserves evidence exactly twice; forged verdicts disappear, colliding IDs/source versions lose all copies', () => {
  const original = paper(), warnings = [];
  const load = (rows) => normalizeInstrumentLookbacks(rows, [parent], AT, warnings);
  assert.deepEqual(load(load([{ ...original, decisionTotal: 999 }])), [original]);
  assert.deepEqual(warnings, []);
  for (const wrong of [{ checkId: 'missing' }, { recordedById: 'someone-else' }, { recordedAt: '2026-11-18T13:00:00.000Z' },
    { uses: [uses[0], { ...uses[0], usedOn: '2026-02-30' }] }]) {
    assert.deepEqual(load([paper(wrong)]), []); assert.match(warnings.at(-1), /1 entire workpaper/);
  }
  for (const other of [{ id: 'different-id' }, { sourceRef: 'different-source' }]) {
    assert.deepEqual(load([original, paper(other)]), []); assert.match(warnings.at(-1), /2 entire workpaper/);
  }
  assert.deepEqual(load(Array(L.papers + 1).fill(original)), []); assert.match(warnings.at(-1), /No partial ledger/);
  const full = Array.from({ length: 4 }, (_, i) => paper({ id: `p${i}`, sourceRef: `v${i}`, uses: Array(1600).fill(uses[0]) }));
  assert.deepEqual(load(full), []); assert.match(warnings.at(-1), /6400 source rows/);
});

test('look-back: single-chain and matrix reads follow actual tier acts; two paths count one paper; other source rows never travel with the worklist', async () => {
  for (const matrix of [false, true]) {
    const w = workspace(matrix);
    const input = { ...evidence(), checkId: w.checkId };
    const rec = await w.api.instrumentLookbackRecord(input);
    assert.equal(rec.saved, true, rec.error); assert.equal(w.api.instrumentLookbackRead(rec.id).access, 'source');
    const tier = matrix ? 'bob' : 'ann';
    w.sit(tier);
    const read = w.api.instrumentLookbackRead(rec.id);
    assert.deepEqual([read.access, read.trace.rows.length, read.withheldRows, read.trace.decisionTotal], ['worklist', 3, 3, 2]);
    for (const leak of ['OTHER-LINE', 'AFTER-FAILURE', 'BEFORE-WINDOW', 'OTHER-GAUGE']) assert.ok(!JSON.stringify(read).includes(leak));
    assert.equal((await w.api.instrumentLookbackRecord(input)).ok, false, 'a manager cannot file evidence for the recorder');
    const other = safeSeatContext(w.store.state, NOW);
    assert.deepEqual(scopedViewState(w.store.state, other, { now: NOW }).instrumentLookbacks, []);
    assert.equal(workspaceRouteVerdict('instrument-lookback', other.seat, { state: w.store.state, built: other.built, now: NOW }).detail, true);
    if (matrix) {
      w.sit('ann'); assert.equal(w.api.instrumentLookbackIndex().countOnly, 1); assert.equal(w.api.instrumentLookbackRead(rec.id).ok, false);
    }
    w.sit('ada'); const top = w.api.instrumentLookbackIndex();
    assert.deepEqual([top.inScope, top.supported, top.countOnly, top.entries.length], [1, 1, 1, 0]);
    w.sit('peer'); assert.equal(w.api.instrumentLookbackIndex().inScope, 0); assert.equal(w.api.instrumentLookbackRead(rec.id).ok, false);
    const generic = planRelease({ state: w.store.state, now: NOW, route: 'instrument-lookback', seatId: 'peer' });
    assert.equal(generic.ok, false); assert.match(generic.error, /No aggregate read model/, 'generic publication cannot enumerate unscoped source rows');
    w.sit(tier); const escalated = w.api.standardWorkTierAct({ checkId: w.checkId, act: 'escalated', toId: 'ada', note: 'The next tier must coordinate the quality review.' });
    assert.equal(escalated.ok, true, escalated.error);
    w.sit('ada'); assert.equal(w.api.instrumentLookbackRead(rec.id).access, 'worklist', 'explicit next hop, not inferred from rank');
    const closed = w.api.standardWorkTierAct({ checkId: w.checkId, act: 'contained', note: 'The gauge has been held for the quality investigation.' });
    assert.equal(closed.ok, true, closed.error); assert.equal(w.api.instrumentLookbackRead(rec.id).trace.decisionTotal, 2, 'tier closure never clears the worklist');
    w.sit(null); assert.equal(w.api.instrumentLookbackRead(rec.id).access, 'source'); assert.equal((await w.api.instrumentLookbackRecord(input)).ok, false);
    w.sit('missing-seat'); assert.equal(w.api.instrumentLookbackIndex().ok, false); assert.equal(w.api.instrumentLookbackRead(rec.id).ok, false);
  }
});

test('look-back: persisted partial extract → reload → exact guarded worklist, every DOM receipt cell and serialized CSV; no derived writeback', async () => {
  const w = workspace();
  const input = { ...evidence({ coverage: 'partial', expectedUses: null, uses: [...uses, logUse('u7', null, basis.goodOn, 'J|100'), logUse('u8', 'G-17', null, null)] }), checkId: w.checkId };
  const rec = await w.api.instrumentLookbackRecord(input); assert.ok(rec.saved, rec.error);
  const bytes = w.bytes(), raw = JSON.parse(bytes), saved = raw.instrumentLookbacks[0];
  assert.deepEqual(saved, { ...input, id: rec.id, recordedById: 'kim', recordedAt: AT });
  const audit = raw.events.filter((e) => e.type === 'standardWork.instrument-traced');
  assert.equal(audit.length, 1); assert.ok(!JSON.stringify(audit).includes('G-17'));
  const reload = w.reload(); assert.deepEqual(reload.store.state.instrumentLookbacks, [saved]);
  assert.deepEqual(reload.store.state.standardWorkChecks, raw.standardWorkChecks);
  const { trace } = reload.api.instrumentLookbackRead(rec.id);
  assert.deepEqual([trace.sourceRows, trace.distinctUses, trace.duplicateRows, trace.counts.possible, trace.unlinked, trace.recorded, trace.decisionTotal], [9, 8, 1, 2, 1, 2, null]);
  const dom = new JSDOM('<!doctype html><body></body>');
  const old = { document: globalThis.document, Node: globalThis.Node };
  try {
    globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
    const node = renderInstrumentLookback({ api: reload.api, query: new URLSearchParams({ paper: rec.id }) });
    const cells = (caption) => [...node.querySelectorAll(`table[aria-label="${caption}"] tbody tr`)].map((r) => [...r.cells].map((c) => c.textContent));
    const receipt = instrumentReceipt(trace);
    assert.deepEqual(cells('Instrument look-back receipt'), receipt.map((r) => [r.measure, String(r.value ?? 'Withheld'), r.reason]));
    assert.deepEqual(cells('Inspection and release decisions'), [['J|100', '2', '1'], ['R,200', '1', '0']]);
    assert.deepEqual(node.querySelector('img').getAttribute('src'), './app/assets/instrument-lookback.jpg');
    const csv = serializeCsv(['measure', 'value', 'reason'], receipt);
    assert.deepEqual(parseCsv(csv).rows, receipt.map((r) => [r.measure, String(r.value ?? ''), r.reason]));
    for (const token of ['J|100', 'G-17', 'u7', basis.sourceRef, basis.goodOn]) assert.ok(!csv.includes(token));
  } finally { Object.assign(globalThis, old); dom.window.close(); }
  assert.equal(w.bytes(), bytes, 'reading a trace never saves the calculation');
});

test('look-back: refused writes change nothing; subsequent extract versions coexist; quota errors are not saved receipts', async () => {
  const w = workspace(), input = { ...evidence(), checkId: w.checkId };
  const rec = await w.api.instrumentLookbackRecord(input); assert.equal(rec.saved, true, rec.error);
  const bytes = w.bytes();
  for (const patch of [{}, { checkId: 'unreadable' }, { sourceRef: 'v2', expectedUses: -1 }]) assert.equal((await w.api.instrumentLookbackRecord({ ...input, ...patch })).ok, false);
  assert.equal(w.bytes(), bytes);
  const v2 = await w.api.instrumentLookbackRecord({ ...input, id: rec.id, sourceRef: 'v2', recordedById: 'ada', recordedAt: START, decisionTotal: 500, coverage: 'partial' });
  const latest = w.store.state.instrumentLookbacks.at(-1);
  assert.deepEqual([latest.id !== rec.id, latest.recordedById, latest.recordedAt, latest.decisionTotal], [true, 'kim', AT, undefined]);
  assert.equal(v2.saved, true); assert.deepEqual([w.api.instrumentLookbackIndex().supported, w.api.instrumentLookbackIndex().withheld], [1, 1]);
  w.block(); const unsaved = await w.api.instrumentLookbackRecord({ ...input, sourceRef: 'v3' });
  assert.equal(unsaved.saved, false); assert.match(unsaved.warning, /Could not save/);
  assert.equal(w.store.state.instrumentLookbacks.length, 3); assert.equal(w.reload().store.state.instrumentLookbacks.length, 2);
});

test('look-back: the public reader surfaces a whole-paper refusal rather than a clean zero on a corrupt import', () => {
  const raw = fixture(); raw.instrumentLookbacks = [paper()];
  const normalized = normalizeState(raw, { now: NOW });
  assert.deepEqual(normalized.state.instrumentLookbacks, []); assert.ok(normalized.warnings.some((s) => /1 entire workpaper/.test(s)));
  const { api } = open({ getItem: () => JSON.stringify(raw) }, (p) => `${p}-test`);
  assert.match(api.instrumentLookbackIndex().warnings[0], /readable workpapers only/);
});
