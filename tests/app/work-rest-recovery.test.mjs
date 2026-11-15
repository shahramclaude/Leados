// ADR-0209 — Cross-Line Work/Rest Recovery Ledger.
//
// The ledger's claims are clock arithmetic and line authority, so the tests are:
//   - every duration is hand-computed elapsed time in whole minutes, including
//     across both clock changes, in a zone the test names;
//   - a person with two reporting lines is ONE person: shifts merge across lines,
//     and the gap two managers made together goes to the seat above both;
//   - a manager cannot roster, amend or attest a line they do not hold;
//   - silence is not rest: `clear` needs every line's attestation;
//   - no limit is built in: an undeclared threshold is never tested;
//   - what the screen prints is what is stored, to the minute.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import {
  buildWorkRest,
  resolveWorkRestOwner,
  workRestAttentionCount,
} from '../../app/core/domain/workRest.js';
import { parseWorkRestDuration } from '../../app/core/domain/workRestActions.js';
import { evaluateWorkRest } from '../../app/core/domain/workRestMath.js';
import { indexWorkRestAsks, workRestRule } from '../../app/core/domain/workRestRules.js';
import {
  WORK_REST_CLOSED_PREFIX,
  WORK_REST_CSV_COLUMNS,
  WORK_REST_CSV_SCOPE,
  WORK_REST_RIGHTS,
  WORK_REST_RULE_ID,
} from '../../app/core/domain/workRestRegistry.js';
import {
  normalizeWorkRestActs,
  normalizeWorkRestPolicies,
  normalizeWorkRestShifts,
  readWorkRestThresholds,
} from '../../app/core/domain/workRestSchema.js';
import {
  formatMinutes,
  instantMinutes,
  resolveShiftEnd,
  resolveWallTime,
  storedOffsetHolds,
} from '../../app/core/domain/workRestTime.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z'; // a Sunday
const AT = '2026-01-01T09:00:00.000Z';
const CPH = 'Europe/Copenhagen';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

/* ------------------------------------------------------------------ fixture */

// Leader (operator) → vera (VP) → dan, eve (directors) → mia (under dan), ned
// (under eve) → lou (lead under mia), kit (lead under ned) → sam, ivy (under
// lou), ike (under kit). One declared matrix line: sam ALSO works for kit on a
// project line — so the lowest seat above both of sam's lines is vera.
const person = (id, managerId, level) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', status: 'active', startDate: AT, createdAt: AT, updatedAt: AT });
const line = (id, personId, managerId, kind = 'project') => ({ id, personId, managerId, kind, shareH: 30, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: AT, note: '' });

function rawFixture(patch = {}, now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'), person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'), person('ned', 'eve', 'manager'),
    person('lou', 'mia', 'lead'), person('kit', 'ned', 'lead'),
    person('sam', 'lou', 'ic'), person('ivy', 'lou', 'ic'), person('ike', 'kit', 'ic'),
  ];
  raw.reportingLines = [line('rl-sam-kit', 'sam', 'kit')];
  return { ...raw, ...patch };
}
const fixture = (patch = {}, now = T0) => normalizeState(rawFixture(patch, now), { now: new Date(now) }).state;

function seed(state = fixture(), startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  const as = (id, run) => { sit(id); try { return run(); } finally { sit(null); } };
  return { store, api, sit, on, as };
}

const ok = (result) => { assert.equal(result?.ok, true, result?.error); return result; };
const refused = (result, pattern, field) => {
  assert.equal(result?.ok, false, 'the act is refused');
  if (pattern) assert.match(result.error, pattern);
  if (field) assert.equal(result.field, field);
  return result;
};
const shift = (personId, lineManagerId, start, end, extra = {}) => ({ personId, lineManagerId, zone: CPH, start, end, source: 'roster', ...extra });
const PLANT = { label: 'Plant agreement 2026', scope: 'people', personIds: ['sam', 'ivy'], source: 'Site collective agreement 2026, clause 7.2', minRestMin: '11', maxSpellMin: '13h' };
const asksOf = (store) => indexWorkRestAsks(store.state).filter((ask) => ask.task);
const openAsksOf = (store) => asksOf(store).filter((ask) => ask.task.status === 'active');
const rowOf = (report, personId) => report.allPeople.find((row) => row.personId === personId);

/** The Sam story: kit keeps him until 22:50 on Monday; lou rosters him 06:00 on Tuesday. */
function samStory() {
  const ctx = seed();
  ctx.as('dan', () => ok(ctx.api.workRestDeclarePolicy(PLANT)));
  const late = ctx.as('kit', () => ok(ctx.api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T14:00', '2026-11-16T22:50'))));
  const early = ctx.as('lou', () => ok(ctx.api.workRestDeclareShift(shift('sam', 'lou', '2026-11-17T06:00', '2026-11-17T14:00', { note: 'Cover for the Tuesday early line, agreed with Sam' }))));
  return { ...ctx, late, early };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

/* ----------------------------------------------------------- 1. clock time */

test('a wall time is resolved against the zone: skipped times are refused, repeated times must say which', () => {
  assert.deepEqual(resolveWallTime(CPH, '2026-07-01T12:00'), { state: 'unique', offsets: [120] });
  // 29 March 2026, 02:00 → 03:00: 02:30 never showed on a Copenhagen clock.
  const skipped = resolveWallTime(CPH, '2026-03-29T02:30');
  assert.equal(skipped.state, 'nonexistent');
  assert.deepEqual(skipped.offsets, []);
  // 25 October 2026, 03:00 → 02:00: 02:30 showed twice, first at +02:00.
  assert.deepEqual(resolveWallTime(CPH, '2026-10-25T02:30'), { state: 'ambiguous', offsets: [120, 60] });
  // A half-hour change is not special-cased: Lord Howe moves by 30 minutes.
  assert.deepEqual(resolveWallTime('Australia/Lord_Howe', '2026-04-05T01:45').offsets, [660, 630]);
  assert.equal(resolveWallTime('Nope/Zone', '2026-07-01T12:00').state, 'bad-zone');

  assert.equal(resolveShiftEnd(CPH, '2026-03-29T02:30').code, 'nonexistent');
  assert.equal(resolveShiftEnd(CPH, '2026-10-25T02:30').code, 'ambiguous');
  assert.equal(resolveShiftEnd(CPH, '2026-10-25T02:30', 'first').offsetMin, 120);
  assert.equal(resolveShiftEnd(CPH, '2026-10-25T02:30', 'second').offsetMin, 60);
  assert.equal(storedOffsetHolds(CPH, '2026-11-16T14:00', 60), true);
  assert.equal(storedOffsetHolds(CPH, '2026-11-16T14:00', 120), false, 'a stale offset is detected, not silently re-timed');
});

test('a duration is elapsed time, never the difference of two clock readings', () => {
  const elapsed = (start, end) => instantMinutes(end, resolveShiftEnd(CPH, end).offsetMin) - instantMinutes(start, resolveShiftEnd(CPH, start).offsetMin);
  // Autumn: the clock says 22:00 → 06:00 (eight hours); nine hours passed.
  assert.equal(elapsed('2026-10-24T22:00', '2026-10-25T06:00'), 540);
  // Spring: the same clock readings; seven hours passed.
  assert.equal(elapsed('2026-03-28T22:00', '2026-03-29T06:00'), 420);
  assert.equal(elapsed('2026-11-16T22:00', '2026-11-17T06:00'), 480);
  assert.equal(formatMinutes(430), '7 h 10 min');
  assert.equal(formatMinutes(540), '9 h');
});

/* --------------------------------------------------------------- 2. kernel */

const EVERYTHING = { from: -100000, to: 100000 };
const none = { minRestMin: null, maxSpellMin: null, longRestMin: null, longRestWithinMin: null, workCapMin: null, workCapWindowMin: null };

test('the kernel merges two lines into one person and proves the short rest neither line can see', () => {
  // Line B until 22:50 (minute 1370), line A from 06:00 next day (minute 1800): 430 minutes off.
  const read = evaluateWorkRest({
    intervals: [{ id: 'b', s: 840, e: 1370, line: 'B' }, { id: 'a', s: 1800, e: 2280, line: 'A' }],
    policy: { ...none, minRestMin: 660, maxSpellMin: 780 }, coverage: [], horizon: { from: 0, to: 4320 },
  });
  assert.equal(read.findings.length, 1);
  const [finding] = read.findings;
  assert.deepEqual([finding.kind, finding.at, finding.measure, finding.limit, finding.excess], ['short-rest', 1800, 430, 660, 230]);
  assert.deepEqual(finding.ids, ['b', 'a']);
  assert.deepEqual([...finding.lines].sort(), ['A', 'B']);
  assert.equal(finding.earliestStart, 2030, '22:50 + 11 h');
  assert.equal(finding.latestEnd, 1140, '06:00 − 11 h');
  assert.equal(read.workMinutes, 1010);
  assert.deepEqual(read.unproven, ['coverage-gap'], 'a conflict is proved; a clearance would not be');
});

test('shifts that touch are one spell, overlapping minutes are counted once, and every limit is tested exactly', () => {
  // 0–480 on one line and 480–900 on another: one 900-minute spell.
  const spell = evaluateWorkRest({ intervals: [{ id: 'a', s: 0, e: 480, line: 'A' }, { id: 'b', s: 480, e: 900, line: 'B' }], policy: { ...none, maxSpellMin: 780 }, horizon: EVERYTHING });
  assert.deepEqual(spell.findings.map((f) => [f.kind, f.at, f.measure, f.excess]), [['long-spell', 780, 900, 120]]);
  assert.deepEqual([...spell.findings[0].lines].sort(), ['A', 'B']);

  // 0–480 and 420–600 overlap for 60 minutes: 600 minutes of work, not 660.
  const double = evaluateWorkRest({ intervals: [{ id: 'a', s: 0, e: 480, line: 'A' }, { id: 'b', s: 420, e: 600, line: 'B' }], policy: null, horizon: EVERYTHING });
  assert.deepEqual(double.findings.map((f) => [f.kind, f.at, f.measure]), [['double-booked', 420, 60]]);
  assert.equal(double.workMinutes, 600);

  // Rolling cap 600 in any 1,440: 0–480 then 720–1200. At minute 840 the last
  // 1,440 minutes hold exactly 480 + 120 = 600; minute 841 is the first over.
  const cap = evaluateWorkRest({ intervals: [{ id: 'a', s: 0, e: 480, line: 'A' }, { id: 'b', s: 720, e: 1200, line: 'A' }], policy: { ...none, workCapMin: 600, workCapWindowMin: 1440 }, horizon: EVERYTHING });
  assert.deepEqual(cap.findings.map((f) => [f.kind, f.at, f.measure, f.excess]), [['work-cap', 841, 960, 360]]);

  // Eight 8-hour days in a row, 16 h off between them. A 36-hour rest must
  // begin within six days (8,640 min) of the previous one. Nothing is known
  // before minute 0, so the kindest anchor is minute 0 itself — and even then
  // the first long rest cannot begin before the last spell ends at 10,560.
  const days = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, s: i * 1440, e: i * 1440 + 480, line: 'A' }));
  const overdue = evaluateWorkRest({ intervals: days, policy: { ...none, longRestMin: 2160, longRestWithinMin: 8640 }, horizon: EVERYTHING });
  assert.deepEqual(overdue.findings.map((f) => [f.kind, f.at, f.excess, f.anchor]), [['long-rest-overdue', 8640, 1920, 'assumed']]);
  assert.ok(overdue.unproven.includes('no-long-rest-on-record'));

  // No policy: nothing but a double-booking is ever tested.
  const untested = evaluateWorkRest({ intervals: days, policy: null, horizon: EVERYTHING });
  assert.deepEqual(untested.findings, []);
  assert.deepEqual(untested.tested, { minRest: false, maxSpell: false, longRest: false, workCap: false });
});

test('unrecorded work never gives rest back: adding a shift cannot lengthen a rest, shorten a spell or lower a total', () => {
  let seedValue = 20261115;
  const random = (n) => { seedValue = (Math.imul(seedValue, 1103515245) + 12345) >>> 0; return seedValue % n; };
  const policy = { ...none, minRestMin: 660 };
  for (let round = 0; round < 300; round += 1) {
    const intervals = Array.from({ length: 2 + random(5) }, (_, i) => { const s = random(9000); return { id: `i${i}`, s, e: s + 60 + random(700), line: i % 2 ? 'A' : 'B' }; });
    const s = random(9000);
    const extra = { id: 'x', s, e: s + 60 + random(700), line: 'C' };
    const before = evaluateWorkRest({ intervals, policy, horizon: EVERYTHING });
    const after = evaluateWorkRest({ intervals: [...intervals, extra], policy, horizon: EVERYTHING });
    assert.ok(after.workMinutes >= before.workMinutes);
    assert.ok(after.longestSpellMinutes >= before.longestSpellMinutes);
    for (const finding of before.findings.filter((f) => f.kind === 'short-rest')) {
      const inside = after.rests.filter((rest) => rest.from >= finding.from && rest.to <= finding.to);
      assert.ok(inside.every((rest) => rest.minutes <= finding.measure), 'the proven-short rest did not get longer');
    }
  }
});

/* --------------------------------------------------------------- 3. schema */

test('v163 is additive, starts empty, seeds no limit and invents no shift', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 162 };
  for (const key of ['workRestShifts', 'workRestActs', 'workRestCoverage', 'workRestPolicies', 'workRestMarkers']) delete old[key];
  old.people = [person('lou', null, 'lead'), person('sam', 'lou', 'ic')];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 172);
  assert.deepEqual(next.applied.at(-1), '170 → 171', '171 → 172');
  for (const key of ['workRestShifts', 'workRestActs', 'workRestCoverage', 'workRestPolicies', 'workRestMarkers']) {
    assert.deepEqual(next.raw[key], [], `${key} starts empty`);
    assert.ok(COLLECTIONS.includes(key), `${key} is a collection`);
  }
  assert.deepEqual([next.raw.settings.workRestBackDays, next.raw.settings.workRestAheadDays, next.raw.settings.workRestAutoPropagate], [28, 14, true]);
  // No setting carries a rest or hours limit: a policy declares it, with its source.
  assert.equal(Object.keys(next.raw.settings).some((key) => key.startsWith('workRest') && /rest(min|hours)|cap|spell|limit/i.test(key.slice(8))), false);
  const report = buildWorkRest(normalizeState(next.raw, { now: new Date(T0) }).state, { now: new Date(T0) });
  assert.equal(report.totals.noRecordN, 2);
  assert.equal(report.totals.clearN, 0, 'an empty record clears nobody');
});

test('a hand-edited file cannot manufacture a shift, an amendment or a limit', () => {
  const good = { id: 's1', personId: 'sam', lineManagerId: 'lou', zone: CPH, start: '2026-11-16T06:00', end: '2026-11-16T14:00', startOffsetMin: 60, endOffsetMin: 60, source: 'roster', note: '', declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' };
  const warnings = [];
  const shifts = normalizeWorkRestShifts([
    good,
    { ...good, id: 's2', end: '2026-11-16T05:00' },            // ends before it starts
    { ...good, id: 's3', startOffsetMin: 61.5 },                 // not a whole minute
    { ...good, id: 's4', zone: 'not a zone!' },                  // not a zone name at all
    { ...good, id: 's6', zone: 'Nope/Zone' },                    // a name this device does not know
    { ...good, id: 's5', end: '2026-11-20T06:01' },              // over 72 hours
    { ...good, id: 's1' },                                       // duplicate id
  ], warnings);
  // A zone this device does not know is KEPT: the stored offsets are the record,
  // so the shift still reads to the minute. Only the door needs the zone's rules.
  assert.deepEqual(shifts.map((row) => row.id), ['s1', 's6']);
  assert.match(warnings.join(' '), /5 work\/rest shift row\(s\) could not be read exactly/);

  const act = (id, extra) => ({ id, shiftId: 's1', kind: 'cancel', actedOn: '2026-11-15', actedAt: T0, actedById: 'lou', via: 'line-holder', reason: 'Line stopped for maintenance', ...extra });
  const acts = normalizeWorkRestActs([
    act('a1'),
    act('a2', { kind: 'actual', start: '2026-11-16T06:10', end: '2026-11-16T14:30', startOffsetMin: 60, endOffsetMin: 60, actedAt: '2026-11-15T13:00:00.000Z' }), // after a cancellation
    act('a3', { shiftId: 'ghost' }),
  ], shifts.slice(0, 1), []);
  assert.deepEqual(acts.map((row) => row.id), ['a1'], 'nothing is recorded after a cancellation, or against a shift that does not exist');

  const policy = (id, extra) => ({ id, label: 'Site rule', scope: 'workspace', personIds: [], source: 'Site handbook section 4', ...none, minRestMin: 660, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'vera', retiredAt: null, retiredById: null, retireReason: '', ...extra });
  const policies = normalizeWorkRestPolicies([
    policy('p1'),
    policy('p2', { source: '' }),                              // no written source
    policy('p3', { minRestMin: 30 }),                          // outside its bounds
    policy('p4', { longRestMin: 2160 }),                       // half a pair
    policy('p5', { minRestMin: null }),                        // declares nothing
  ], []);
  assert.deepEqual(policies.map((row) => row.id), ['p1']);
  assert.equal(readWorkRestThresholds({ workCapMin: 3000, workCapWindowMin: 1440 }).ok, false, 'a cap larger than its window tests nothing');
  assert.deepEqual([parseWorkRestDuration('11'), parseWorkRestDuration('11:30'), parseWorkRestDuration('45m'), parseWorkRestDuration('7d'), parseWorkRestDuration('1.5')], [660, 690, 45, 10080, null]);
});

/* --------------------------------------------------------------- 4. wiring */

test('the ledger is wired to the spine: rights, reads, record policies, CSV scope #151, rule 128, pause reach', () => {
  for (const key of Object.values(WORK_REST_RIGHTS)) assert.ok(ACTION_RIGHTS[key], `${key} is a declared right`);
  assert.equal(ACTION_RIGHTS[WORK_REST_RIGHTS.ROSTER].minRank, 1, 'a frontline lead writes the roster');
  assert.equal(ACTION_RIGHTS[WORK_REST_RIGHTS.POLICY].minRank, 3, 'which limits apply is declared from the director altitude');
  for (const name of ['workRestReport', 'workRestBriefText', 'workRestCsvRows', 'workRestAttentionCount']) assert.ok(SAFE_READS.has(name), name);
  for (const name of ['workRestDeclareShift', 'workRestAmendShift', 'workRestAttestCoverage', 'workRestDeclarePolicy', 'workRestSetConventions']) assert.equal(SAFE_READS.has(name), false, name);
  for (const key of ['workRestShifts', 'workRestActs', 'workRestCoverage', 'workRestPolicies', 'workRestMarkers']) assert.equal(RECORD_POLICIES[key].detailCeiling, 0, `${key} is report-only`);

  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  // The spine grows by one rule per shipped register: 128 at ADR-0209, 129
  // (recusal), 130 (capital rationing), 131 (standard waivers) and 132
  // (speak-up) since.
  assert.equal(ids.length, 134);
  const spot = ids.indexOf('workRestRule');
  assert.ok(spot >= 0, 'RULE-WRR-01 is on the shared spine');
  assert.equal(ids.lastIndexOf('workRestRule'), spot, 'registered exactly once');
  assert.ok(spot < ids.indexOf('seatRule'), 'before the seat roll-up, which reads the finished workspace');
  assert.deepEqual(ids.slice(-2), ['seatRule', 'sealRule']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'rule/contract parity');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === workRestRule);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'workRestMarkers']);
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('workRestAutoPropagate'));
  assert.equal(PAUSE_PERMIT_REACH_RULES.workRestAutoPropagate, 'workRestRules.js');
  assert.ok(fs.readFileSync(path.join(REPO, 'app/core/domain/workRestRules.js'), 'utf8').includes('workRestAutoPropagate === false'), 'the rule names its pause switch literally');

  assert.equal(CSV_EXPORTS.length, 160);
  // The export list is append-only, so this scope keeps its own row and is no
  // longer the last one; the tail pin belongs to the newest register's suite.
  assert.ok(CSV_EXPORTS.some((row) => row.key === WORK_REST_CSV_SCOPE), 'scope #151 is still registered');
});

/* ----------------------------------------------------------------- 5. door */

test('a shift is recorded only by a seat that holds the very line it is worked for', () => {
  const { api, as, store } = seed();
  // kit holds sam on a project line, and may record for THAT line …
  const recorded = as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T14:00', '2026-11-16T22:50'))));
  assert.deepEqual([recorded.via, recorded.minutes], ['line-holder', 530]);
  // … but not for lou's line, however clearly kit can see sam.
  as('kit', () => refused(api.workRestDeclareShift(shift('sam', 'lou', '2026-11-18T06:00', '2026-11-18T14:00')), /does not hold the line of Lou Name/, 'lineManagerId'));
  // ivy is not on any line kit holds.
  as('kit', () => refused(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T06:00', '2026-11-18T14:00'))));
  // A person with two lines: the ledger will not pick one.
  as('lou', () => refused(api.workRestDeclareShift(shift('sam', '', '2026-11-18T06:00', '2026-11-18T14:00')), /reports on 2 lines/, 'lineManagerId'));
  // Nobody rosters their own record.
  as('lou', () => refused(api.workRestDeclareShift(shift('lou', 'mia', '2026-11-18T06:00', '2026-11-18T14:00'))));
  // mia sits above lou's line and records through it; the route is a fact of the act.
  const above = as('mia', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T06:00', '2026-11-18T14:00'))));
  assert.equal(above.via, 'above-line');
  // sam holds no leadership seat at all.
  as('sam', () => refused(api.workRestReport()));
  assert.deepEqual(store.state.workRestShifts.map((row) => [row.personId, row.lineManagerId, row.via, row.declaredById]), [['sam', 'kit', 'line-holder', 'kit'], ['ivy', 'lou', 'above-line', 'mia']]);
});

test('the door resolves clock changes once and stores the offsets; it never guesses', () => {
  const { api, as, store } = seed();
  as('lou', () => refused(api.workRestDeclareShift(shift('ivy', 'lou', '2026-03-29T02:30', '2026-03-29T08:00')), /does not exist in Europe\/Copenhagen/, 'start'));
  as('lou', () => refused(api.workRestDeclareShift(shift('ivy', 'lou', '2026-10-24T22:00', '2026-10-25T02:30')), /occurs twice/, 'endFold'));
  as('lou', () => refused(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-16T06:00', '2026-11-16T14:00', { zone: 'Mars/Olympus' })), /time zone/, 'zone'));
  as('lou', () => refused(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-16T06:00', '2026-11-16T06:03')), /under 5 minutes/, 'end'));
  // The night the clocks went back: 22:00 → the SECOND 02:30 is 5 h 30 min, not 4 h 30 min.
  const night = as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-10-24T22:00', '2026-10-25T02:30', { endFold: 'second', source: 'timeclock' }))));
  assert.equal(night.minutes, 330);
  const first = as('lou', () => ok(api.workRestPreviewShift(shift('ivy', 'lou', '2026-10-24T22:00', '2026-10-25T02:30', { endFold: 'first' }))));
  assert.equal(first.resolved.minutes, 270);
  const stored = store.state.workRestShifts[0];
  assert.deepEqual([stored.start, stored.startOffsetMin, stored.end, stored.endOffsetMin, stored.zone], ['2026-10-24T22:00', 120, '2026-10-25T02:30', 60, CPH]);
});

test('a conflict that can still be prevented is admitted only with the reason in writing; the past is admitted as it is', () => {
  const { api, as, store } = seed();
  as('dan', () => ok(api.workRestDeclarePolicy(PLANT)));
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T14:00', '2026-11-16T22:50'))));
  const preview = as('lou', () => ok(api.workRestPreviewShift(shift('sam', 'lou', '2026-11-17T06:00', '2026-11-17T14:00'))));
  assert.equal(preview.needsReason, true);
  assert.deepEqual(preview.created.map((f) => [f.kind, f.measureMinutes, f.limitMinutes, f.excessMinutes, f.crossLine]), [['short-rest', 430, 660, 230, true]]);
  const blocked = as('lou', () => refused(api.workRestDeclareShift(shift('sam', 'lou', '2026-11-17T06:00', '2026-11-17T14:00')), /7 h 10 min of rest.*3 h 50 min short.*no earlier than 2026-11-17 09:50/s, 'note'));
  assert.equal(blocked.created.length, 1);
  assert.equal(store.state.workRestShifts.length, 1, 'nothing was saved');
  // Moving the start to the minute the ledger named removes the conflict.
  const moved = as('lou', () => ok(api.workRestPreviewShift(shift('sam', 'lou', '2026-11-17T09:50', '2026-11-17T17:50'))));
  assert.deepEqual(moved.created, []);
  // A conflict that already happened is a fact: recorded without a reason, and nobody is asked.
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-12T06:00', '2026-11-12T14:00', { source: 'timeclock' }))));
  const past = as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-12T20:00', '2026-11-13T04:00', { source: 'timeclock' }))));
  assert.deepEqual(past.created.map((f) => [f.kind, f.measureMinutes, f.ahead]), [['short-rest', 360, false]]);
  assert.equal(openAsksOf(store).length, 0, 'the rule does not chase the past');
});

test('amendments are dated acts on top of the rostered row: actual times, or a cancellation with its reason', () => {
  const { api, as, on, store } = seed();
  const planned = as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-16T06:00', '2026-11-16T14:00'))));
  // Actual times cannot be stated for a shift that has not happened.
  as('lou', () => refused(api.workRestAmendShift({ shiftId: planned.shiftId, kind: 'actual', start: '2026-11-16T06:10', end: '2026-11-16T14:30' }), /have not happened yet/, 'start'));
  // kit does not hold lou's line.
  as('kit', () => refused(api.workRestAmendShift({ shiftId: planned.shiftId, kind: 'cancel', reason: 'Not needed after all' })));
  on('2026-11-20');
  let row = rowOf(api.workRestReport().report, 'ivy');
  assert.deepEqual([row.shifts[0].state, row.unconfirmedPastN, row.actualsComplete, row.workMinutes], ['planned', 1, false, 480], 'an ended shift with no actual times is a reading of the plan');
  as('lou', () => ok(api.workRestAmendShift({ shiftId: planned.shiftId, kind: 'actual', start: '2026-11-16T06:10', end: '2026-11-16T14:30' })));
  row = rowOf(api.workRestReport().report, 'ivy');
  assert.deepEqual([row.shifts[0].state, row.shifts[0].amended, row.shifts[0].minutes, row.unconfirmedPastN, row.actualsComplete, row.workMinutes], ['worked', true, 500, 0, true, 500]);
  assert.match(row.shifts[0].rosteredLabel, /2026-11-16 06:00 .* 2026-11-16 14:00/);
  assert.equal(store.state.workRestShifts[0].start, '2026-11-16T06:00', 'the rostered row is never edited');

  const other = as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-23T06:00', '2026-11-23T14:00'))));
  as('lou', () => refused(api.workRestAmendShift({ shiftId: other.shiftId, kind: 'cancel' }), /Write why/, 'reason'));
  as('lou', () => ok(api.workRestAmendShift({ shiftId: other.shiftId, kind: 'cancel', reason: 'Line stopped for maintenance' })));
  as('lou', () => refused(api.workRestAmendShift({ shiftId: other.shiftId, kind: 'cancel', reason: 'Cancelling it a second time' }), /cancelled/));
  row = rowOf(api.workRestReport().report, 'ivy');
  assert.deepEqual([row.shiftsN, row.cancelledN, row.workMinutes], [2, 1, 500], 'a cancelled shift stays on the record and is not work');
});

/* ------------------------------------------------------------ 6. the rule */

test('the gap two managers made together goes to the seat above BOTH lines — once', () => {
  const { store, api, as, late, early } = samStory();
  const asks = openAsksOf(store);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].seatId, 'vera', 'lou → mia → dan and kit → ned → eve meet at vera');
  assert.equal(asks[0].task.personId, 'vera');
  assert.equal(asks[0].task.dueOn, '2026-11-17');
  assert.match(asks[0].task.title, /Rest too short ahead for Sam Name — made by two lines/);
  assert.match(asks[0].task.expectedOutcome, /7 h 10 min of rest/);
  assert.equal(store.state.workRestMarkers.length, 0);

  const report = api.workRestReport().report;
  const sam = rowOf(report, 'sam');
  assert.deepEqual([sam.verdict, sam.linesN, sam.workMinutes, sam.shortestRestMinutes, sam.longestSpellMinutes], ['conflict', 2, 1010, 430, 530]);
  assert.deepEqual(sam.findings.map((f) => [f.kind, f.ahead, f.crossLine, f.owner.state, f.owner.seatId, f.owner.basis]), [['short-rest', true, true, 'seat', 'vera', 'joint-apex']]);
  assert.deepEqual(sam.findings[0].shiftIds, [late.shiftId, early.shiftId]);
  assert.deepEqual(report.linePairs.map((pair) => [pair.aId, pair.bId, pair.peopleN, pair.findingsN, pair.aheadN]), [['kit', 'lou', 1, 1, 1]]);

  // Idempotent: any later write and an explicit scan file nothing new.
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T06:00', '2026-11-18T14:00'))));
  ok(api.workRestScan());
  assert.equal(asksOf(store).length, 1);

  // Self-closing: the line that gave way cancels its shift; the ask closes itself.
  as('lou', () => ok(api.workRestAmendShift({ shiftId: early.shiftId, kind: 'cancel', reason: 'Moved to the late start after the check' })));
  const [closed] = asksOf(store);
  assert.equal(closed.task.status, 'done');
  assert.ok(closed.task.completionNote.startsWith(WORK_REST_CLOSED_PREFIX));
  assert.equal(rowOf(api.workRestReport().report, 'sam').findings.length, 0);
});

test('a conflict inside one line is owed to that line’s holder; one held by the workspace leader files a marker, not an ask', () => {
  const { store, api, as } = seed();
  // lou double-books ivy on lou's own line.
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T06:00', '2026-11-18T14:00'))));
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T13:00', '2026-11-18T21:00', { note: 'Overlap hour for the handover' }))));
  let asks = openAsksOf(store);
  assert.deepEqual(asks.map((ask) => [ask.seatId, ask.task.personId]), [['lou', 'lou']]);
  assert.match(asks[0].task.title, /Double-booked ahead for Ivy Name$/);

  // vera's only line is the workspace leader.
  ok(api.workRestDeclareShift(shift('vera', '', '2026-11-19T08:00', '2026-11-19T16:00')));
  ok(api.workRestDeclareShift(shift('vera', '', '2026-11-19T15:00', '2026-11-19T20:00', { note: 'Board prep overlaps the site visit' })));
  asks = openAsksOf(store);
  assert.equal(asks.length, 1, 'no delegation is filed to the leader');
  assert.equal(store.state.workRestMarkers.length, 1);
  const [marker] = store.state.workRestMarkers;
  assert.equal(marker.ruleId, WORK_REST_RULE_ID);
  for (const name of ['vera', 'Vera', 'ivy', 'lou']) assert.equal(marker.detail.includes(name) || marker.key.includes(name), false, 'the marker is identity-free');
  ok(api.workRestScan());
  assert.equal(store.state.workRestMarkers.length, 1, 'observed once');
  const vera = rowOf(api.workRestReport().report, 'vera');
  assert.deepEqual(vera.findings.map((f) => [f.kind, f.measureMinutes, f.owner.state]), [['double-booked', 60, 'leader-held']]);
});

test('the rule passes with the clock, respects a human answer, and a pause governs every path', () => {
  const story = samStory();
  // vera answers the ask herself: it is not re-filed while the conflict stands.
  story.store.update((draft) => { const task = draft.delegations.find((row) => row.personId === 'vera'); task.status = 'done'; task.completedOn = '2026-11-15'; task.completionNote = 'Agreed with both leads: Sam starts at ten.'; },
    { type: 'delegation.completed', entity: 'delegation', entityId: 'x', summary: 'done' });
  ok(story.api.workRestScan());
  assert.equal(asksOf(story.store).length, 1);
  assert.equal(openAsksOf(story.store).length, 0);

  // The decisive minute passes: an open ask closes; the finding stays on the record as past.
  const passing = samStory();
  assert.equal(openAsksOf(passing.store).length, 1);
  passing.on('2026-11-18');
  ok(passing.api.workRestScan());
  assert.equal(openAsksOf(passing.store).length, 0);
  assert.deepEqual(rowOf(passing.api.workRestReport().report, 'sam').findings.map((f) => [f.kind, f.ahead, f.owner]), [['short-rest', false, null]]);
  assert.equal(workRestAttentionCount(passing.store.state, { now: at('2026-11-18') }), 0);

  // Paused: the conflict is printed and nobody is asked — on a write and on a scan.
  const paused = seed();
  refused(paused.api.workRestSetConventions({ workRestBackDays: 3 }), /whole number from 7 to 183.*Nothing was clamped/s, 'workRestBackDays');
  refused(paused.api.workRestSetConventions({ workRestHurry: true }), /not a declared work\/rest convention/);
  ok(paused.api.workRestSetConventions({ workRestAutoPropagate: false }));
  paused.as('lou', () => ok(paused.api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T06:00', '2026-11-18T14:00'))));
  paused.as('lou', () => ok(paused.api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-18T13:00', '2026-11-18T21:00', { note: 'Overlap hour for the handover' }))));
  ok(paused.api.workRestScan());
  assert.equal(asksOf(paused.store).length, 0);
  assert.equal(paused.api.workRestReport().report.totals.aheadN, 1);
  assert.equal(paused.api.workRestReport().report.automationOn, false);
});

test('two lines with no single seat above them: the conflict is printed and no owner is invented', () => {
  // lou also reports to ned, and kit also reports to mia: mia and ned are both
  // lowest seats above {lou, kit}, and neither sits above the other.
  const state = fixture({ reportingLines: [line('rl-sam-kit', 'sam', 'kit'), line('rl-lou-ned', 'lou', 'ned'), line('rl-kit-mia', 'kit', 'mia')] });
  const matrix = buildMatrix(state, { now: new Date(T0), settings: { ...state.settings, activeSeatId: null } });
  assert.deepEqual(resolveWorkRestOwner(matrix, 'sam', ['lou', 'kit']), { state: 'ambiguous', seatId: null, basis: 'joint-apex' });
  assert.deepEqual(resolveWorkRestOwner(matrix, 'sam', ['lou']), { state: 'seat', seatId: 'lou', basis: 'line-holder' });
  assert.deepEqual(resolveWorkRestOwner(matrix, 'ghost', ['lou']), { state: 'off-roster', seatId: null, basis: null });
});

/* --------------------------------------------------------- 7. the readings */

test('silence is not rest: clear needs a policy, no breach, and EVERY line’s attestation', () => {
  const { api, as } = seed();
  const verdict = (personId) => rowOf(api.workRestReport().report, personId)?.verdict ?? 'no-record';
  assert.equal(verdict('sam'), 'no-record');
  // 16 h between the two shifts: no breach of an 11-hour minimum.
  as('lou', () => ok(api.workRestDeclareShift(shift('sam', 'lou', '2026-11-16T06:00', '2026-11-16T14:00'))));
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T06:00', '2026-11-17T14:00'))));
  assert.equal(verdict('sam'), 'no-policy', 'no limit is assumed for anyone');
  as('mia', () => refused(api.workRestDeclarePolicy(PLANT)));                                              // a manager cannot declare limits
  as('dan', () => refused(api.workRestDeclarePolicy({ ...PLANT, scope: 'workspace', personIds: [] }), /executive altitude/, 'scope'));
  as('dan', () => refused(api.workRestDeclarePolicy({ ...PLANT, source: 'law' }), /where these limits come from/i, 'source'));
  as('dan', () => refused(api.workRestDeclarePolicy({ ...PLANT, minRestMin: '11.5' }), /Nothing was rounded/, 'minRestMin'));
  as('dan', () => refused(api.workRestDeclarePolicy({ ...PLANT, personIds: ['sam', 'ike'] }), /outside this seat/, 'personIds'));
  const declared = as('dan', () => ok(api.workRestDeclarePolicy(PLANT)));
  as('dan', () => refused(api.workRestDeclarePolicy({ ...PLANT, label: 'A second one', personIds: ['sam'] }), /already named by the live policy/, 'personIds'));

  let sam = rowOf(api.workRestReport().report, 'sam');
  assert.deepEqual([sam.verdict, sam.unproven.map((r) => r.key), sam.shortestRestMinutes], ['unproven', ['coverage-gap'], 960]);
  assert.deepEqual(sam.tested, { minRest: true, maxSpell: true, longRest: false, workCap: false });
  assert.equal(sam.thresholds.find((t) => t.key === 'workCap').text, 'not declared — not tested');

  const horizon = api.workRestReport().report.horizon;
  assert.deepEqual([horizon.fromDay, horizon.toDay, horizon.days], ['2026-10-18', '2026-11-29', 43]);
  const cover = { fromDay: horizon.fromDay, toDay: horizon.toDay, complete: true };
  as('lou', () => refused(api.workRestAttestCoverage({ personId: 'sam', lineManagerId: 'lou', ...cover, complete: false }), /Confirm the statement/, 'complete'));
  as('lou', () => refused(api.workRestAttestCoverage({ personId: 'sam', lineManagerId: 'kit', ...cover }), /does not hold the line/));
  as('lou', () => refused(api.workRestAttestCoverage({ personId: 'sam', lineManagerId: 'lou', fromDay: '2026-08-01', toDay: '2026-11-29', complete: true }), /at most 92 days/, 'toDay'));
  const mine = as('lou', () => ok(api.workRestAttestCoverage({ personId: 'sam', lineManagerId: 'lou', ...cover })));
  sam = rowOf(api.workRestReport().report, 'sam');
  assert.equal(sam.verdict, 'unproven', 'one line’s word says nothing about the other line');
  assert.deepEqual(sam.lines.map((l) => [l.managerId, l.complete, l.missingDays]).sort(), [['kit', false, 43], ['lou', true, 0]]);
  as('kit', () => ok(api.workRestAttestCoverage({ personId: 'sam', lineManagerId: 'kit', ...cover })));
  sam = rowOf(api.workRestReport().report, 'sam');
  assert.deepEqual([sam.verdict, sam.coverageComplete, sam.rests.map((r) => [r.minutes, r.state])], ['clear', true, [[960, 'proven']]]);

  as('kit', () => refused(api.workRestWithdrawCoverage({ coverageId: mine.coverageId, reason: 'Not mine to withdraw' })));
  as('lou', () => ok(api.workRestWithdrawCoverage({ coverageId: mine.coverageId, reason: 'A Saturday overtime shift was missing' })));
  assert.equal(verdict('sam'), 'unproven');
  as('dan', () => ok(api.workRestRetirePolicy({ policyId: declared.policyId, reason: 'Superseded by the 2027 agreement' })));
  assert.equal(verdict('sam'), 'no-policy');
});

test('two live policies claiming one person test nothing until one is retired', () => {
  const policy = (id, extra) => ({ id, label: `Rule ${id}`, scope: 'workspace', personIds: [], source: 'Site handbook section 4', ...none, minRestMin: 660, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'vera', retiredAt: null, retiredById: null, retireReason: '', ...extra });
  const { api, as } = seed(fixture({ workRestPolicies: [policy('p1'), policy('p2', { minRestMin: 600 })] }));
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-16T06:00', '2026-11-16T14:00'))));
  as('lou', () => ok(api.workRestDeclareShift(shift('ivy', 'lou', '2026-11-16T20:00', '2026-11-17T04:00'))));
  const report = api.workRestReport().report;
  const ivy = rowOf(report, 'ivy');
  assert.deepEqual([ivy.verdict, ivy.findings.length, ivy.policyState], ['policy-conflict', 0, 'conflict'], 'neither 10 h nor 11 h is chosen');
  assert.ok(report.refusals.some((text) => /claimed by more than one live policy/.test(text)));
  ok(api.workRestRetirePolicy({ policyId: 'p2', reason: 'Duplicate of the site rule' }));
  assert.deepEqual(rowOf(api.workRestReport().report, 'ivy').findings.map((f) => [f.kind, f.measureMinutes]), [['short-rest', 360]]);
});

/* --------------------------------------------------- 8. seats and roll-ups */

test('every seat reads its own reach, a multi-line person is counted once, and the badge is the register', () => {
  const { store, api, sit } = samStory();
  const expected = {
    // seat: [people in reach, outside, conflicts, badge]
    vera: [10, 0, 1, 1], dan: [5, 5, 1, 1], eve: [4, 6, 0, 0], mia: [4, 6, 1, 1], ned: [3, 7, 0, 0], lou: [3, 7, 1, 1], kit: [3, 7, 1, 1],
  };
  for (const [seat, [peopleN, outsideN, conflictN, badge]] of Object.entries(expected)) {
    sit(seat);
    const report = ok(api.workRestReport()).report;
    const t = report.totals;
    assert.deepEqual([t.peopleN, t.outsideN, t.conflictN], [peopleN, outsideN, conflictN], seat);
    assert.equal(t.conflictN + t.policyConflictN + t.noPolicyN + t.unprovenN + t.clearN + t.noRecordN, t.peopleN, `${seat}: the readings add up`);
    assert.deepEqual([report.reconciliation.balances, report.reconciliation.auditClean], [true, true], seat);
    assert.equal(ok(api.workRestAttentionCount()).count, badge, `${seat}: badge`);
    assert.equal(report.allPeople.filter((row) => row.aheadN > 0).length, badge, `${seat}: the badge is the register`);
  }
  // kit sees the hours of lou's shift — that is the point — but not lou's note, and cannot amend it.
  sit('kit');
  const viaKit = rowOf(api.workRestReport().report, 'sam');
  const lous = viaKit.shifts.find((row) => row.lineManagerId === 'lou');
  assert.deepEqual([lous.note, lous.noteWithheld, lous.canAmend, lous.minutes], ['', true, false, 480]);
  assert.equal(viaKit.shifts.find((row) => row.lineManagerId === 'kit').canAmend, true);
  // eve sits above kit but holds no line over sam: sam is counted as not read, never silently dropped.
  sit('eve');
  const viaEve = api.workRestReport().report;
  assert.equal(rowOf(viaEve, 'sam'), undefined);
  assert.deepEqual(viaEve.spans.map((span) => [span.managerId, span.peopleN, span.notReadN]), [['eve', 3, 1], ['ned', 2, 1], ['kit', 1, 1]]);
  // Operator view: sam sits under BOTH lou's and kit's spans and is one person at the top.
  sit(null);
  const all = api.workRestReport().report;
  const span = (id) => all.spans.find((row) => row.managerId === id);
  assert.deepEqual([span('lou').peopleN, span('lou').conflict, span('kit').peopleN, span('kit').conflict], [2, 1, 2, 1]);
  assert.deepEqual([span('vera').peopleN, span('vera').conflict, span('vera').findingsN], [9, 1, 1], 'not 2: one person, two lines');
  assert.equal(all.totals.multiLineN, 1);
  assert.equal(workRestAttentionCount(store.state, { now: new Date(T0) }), 1);
});

/* ------------------------------------------- 9. the screen is the record */

test('what the panel prints is what is stored, to the minute — and the export is the same reader', () => {
  const { store, api } = samStory();
  const independent = (row) => {
    const utc = (wall, offset) => Date.parse(`${wall}:00.000Z`) / 60000 - offset;
    const sign = (offset) => `${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
    const elapsed = utc(row.end, row.endOffsetMin) - utc(row.start, row.startOffsetMin);
    return {
      start: `${row.start.replace('T', ' ')} (UTC${sign(row.startOffsetMin)})`,
      end: `${row.end.replace('T', ' ')} (UTC${sign(row.endOffsetMin)})`,
      elapsed: `${Math.floor(elapsed / 60)} h${elapsed % 60 ? ` ${elapsed % 60} min` : ''}`,
      minutes: elapsed,
    };
  };
  const report = api.workRestReport().report;
  withDom(() => {
    const root = document.getElementById('root');
    const ctx = { api, state: store.state, now: new Date(T0), query: new URLSearchParams('panel=rest'), navigate() {}, refresh() { root.replaceChildren(renderStandardWork(ctx)); } };
    ctx.refresh();
    const text = (testid) => { const node = root.querySelector(`[data-testid="${testid}"]`); assert.ok(node, `${testid} is on the page`); return node.textContent; };
    assert.equal(root.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Work & rest');

    assert.equal(store.state.workRestShifts.length, 2);
    let total = 0;
    for (const stored of store.state.workRestShifts) {
      const want = independent(stored);
      total += want.minutes;
      const cells = [...root.querySelectorAll(`[data-testid="wrr-shift-${stored.id}"] td`)].map((cell) => cell.textContent);
      assert.deepEqual(cells.slice(0, 3), [want.start, want.end, want.elapsed], `shift ${stored.id}`);
    }
    assert.deepEqual([total, report.allPeople[0].workMinutes], [1010, 1010]);
    assert.equal(text('wrr-work-sam'), '16 h 50 min');
    assert.equal(text('wrr-rest-sam'), '7 h 10 min');
    assert.equal(text('wrr-spell-sam'), '8 h 50 min');
    const finding = report.allPeople[0].findings[0];
    assert.ok(text(`wrr-finding-${finding.signature}`).includes(finding.sentence));
    assert.ok(text(`wrr-finding-${finding.signature}`).includes('Owed to Vera Name — the lowest seat above both lines.'));
    assert.match(text('wrr-summary'), /^10 in reach = 1 conflict \+ 0 two policies \+ 0 no policy \+ 0 unproven \+ 0 clear \+ 9 no record\. 1 report on more than one line\./);
    assert.equal(text('wrr-span-vera').startsWith('Vera Name9'), true);

    // The method illustration is a real file, described from what it shows, and labelled as generated.
    const image = root.querySelector('figure img');
    assert.equal(image.getAttribute('src'), './app/assets/work-rest-recovery.jpg');
    assert.ok(image.getAttribute('alt').length > 80);
    assert.match(root.querySelector('figure figcaption').textContent, /AI-generated method illustration, not workspace data/);
    const file = path.join(REPO, 'app/assets/work-rest-recovery.jpg');
    const bytes = fs.readFileSync(file);
    assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xff, 0xd8, 0xff], 'a real JPEG');
    assert.ok(bytes.length > 10000);

    const page = root.textContent;
    for (const junk of ['[object Object]', 'undefined', 'NaN', 'null']) assert.equal(page.includes(junk), false, `the page never prints “${junk}”`);

    // The dialog reads the same door: the second 02:30 must be chosen, and the refusal lands on its field.
    root.querySelector('[data-testid="wrr-shift-open"]').click();
    const modal = document.getElementById('modal-root');
    const fill = (name, value) => { const node = modal.querySelector(`[name="${name}"]`); assert.ok(node, `the dialog has a ${name} field`); node.value = value; };
    fill('personLine', 'ivy|lou'); fill('zone', CPH); fill('start', '2026-10-25T02:30'); fill('end', '2026-10-25T07:00');
    modal.querySelector('[data-testid="wrr-shift-check"]').click();
    assert.match(modal.querySelector('[data-testid="wrr-preview"]').textContent, /occurs twice in Europe\/Copenhagen/);
    fill('startFold', 'second');
    modal.querySelector('[data-testid="wrr-shift-check"]').click();
    assert.match(modal.querySelector('[data-testid="wrr-preview"]').textContent, /Read as 2026-10-25 02:30 \(UTC\+01:00\) → 2026-10-25 07:00 \(UTC\+01:00\) \(4 h 30 min\)/);
    modal.querySelector('[data-testid="wrr-shift-save"]').click();
    assert.equal(store.state.workRestShifts.length, 3);
    assert.deepEqual([store.state.workRestShifts[2].personId, store.state.workRestShifts[2].startOffsetMin], ['ivy', 60]);
    assert.ok(root.querySelector(`[data-testid="wrr-shift-${store.state.workRestShifts[2].id}"]`), 'the page re-read the record');
  });

  const exported = exportWorkspaceCsv(store.state, WORK_REST_CSV_SCOPE, { now: new Date(T0) });
  assert.equal(exported.ok, true, exported.reason);
  const csvText = String(exported.text || exported.csv || '');
  const parsed = parseCsv(csvText);
  const records = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, index) => [header, cells[index] ?? ''])));
  assert.deepEqual(parsed.headers, WORK_REST_CSV_COLUMNS);
  assert.deepEqual(records.map((record) => [record.row_type, record.key]), [['workspace', 'workspace'], ['policy', 'P01'], ['person', 'W01'], ['person', 'W02']]);
  const samRow = records[2];
  assert.deepEqual([samRow.verdict, samRow.lines_n, samRow.work_minutes, samRow.shortest_rest_minutes, samRow.longest_spell_minutes, samRow.short_rest_n, samRow.cross_line_n, samRow.ahead_n],
    ['conflict', '2', '1010', '430', '530', '1', '1', '1']);
  assert.deepEqual([records[1].min_rest_minutes, records[1].max_spell_minutes, records[1].work_cap_minutes], ['660', '780', ''], 'an undeclared limit is blank, never zero');
  assert.deepEqual([records[3].verdict, records[3].shortest_rest_minutes, records[3].claim_reason], ['unproven', '', 'coverage-gap'], 'one spell: no rest to claim');
  for (const leak of ['Sam', 'sam', 'Lou', 'Kit', 'Vera', 'wrs-', 'Plant agreement', 'Cover for', '06:00', '22:50', 'Copenhagen']) assert.equal(csvText.includes(leak), false, `the export never carries “${leak}”`);
});
