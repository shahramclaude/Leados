// ADR-0226 — Night-Work & In-Shift Break Reading.
//
// The reading's claims are clock arithmetic against declared numbers and line
// authority, so the tests are:
//   - night minutes are wall-clock coverage inside the DECLARED night window,
//     read from the stored wall times alone — never a rating of a person;
//   - a night is a UTC calendar day carrying night minutes; the streak is the
//     longest run over every line of one person, shifts merged and counted once;
//   - a break subtracts from a spell to yield continuous-work stretches, and a
//     missing break record refuses the clearance instead of scoring the person;
//   - a break is recorded only by a seat that holds the very line it is worked
//     for, and only inside that shift;
//   - no limit is built in: a policy with no written source, a window that is
//     not a range, or no limit at all is dropped and nothing is assumed;
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
  buildWorkNight,
  evaluateWorkNight,
  readWorkNightRecord,
  workNightAttentionCount,
  workNightConditions,
  workNightHorizon,
} from '../../app/core/domain/workNight.js';
import {
  continuousSegments,
  fatigueIndex,
  longestConsecutiveRun,
  nightMinutesOfShift,
  nightShareOver,
  nightSharePct,
  nightWindowSet,
} from '../../app/core/domain/workNightMath.js';
import { indexWorkNightAsks, workNightRule } from '../../app/core/domain/workNightRules.js';
import { parseWorkNightDuration } from '../../app/core/domain/workNightActions.js';
import {
  WORK_NIGHT_CSV_COLUMNS,
  WORK_NIGHT_CSV_SCOPE,
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_RIGHTS,
  WORK_NIGHT_RULE_ID,
} from '../../app/core/domain/workNightRegistry.js';
import {
  breakInsideShift,
  normalizeWorkNightBreaks,
  normalizeWorkNightMarkers,
  normalizeWorkNightPolicies,
  normalizeWorkNightSettings,
  readNightWindow,
  readWorkNightThresholds,
  workNightAskSummary,
  parseWorkNightAskSummary,
  workNightSignature,
} from '../../app/core/domain/workNightSchema.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z'; // a Sunday
const AT = '2026-01-01T09:00:00.000Z';
const CPH = 'Europe/Copenhagen';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const DAY = 1440;

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

const shift = (personId, lineManagerId, start, end, extra = {}) => ({ personId, lineManagerId, zone: CPH, start, end, source: 'roster', ...extra });
const ok = (result) => { assert.equal(result?.ok, true, result?.error); return result; };
const refused = (result, pattern, field) => {
  assert.equal(result?.ok, false, 'the act is refused');
  if (pattern) assert.match(result.error, pattern);
  if (field) assert.equal(result.field, field);
  return result;
};
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

/* ---------------------------------------------------------------- 1. kernel */

test('a wall time resolves against the zone: night minutes are the minutes inside the declared window', () => {
  // A shift 22:00 → 06:00 with a declared window 1320 → 360 carries 480 night
  // minutes — the whole shift, read from the wall clock alone.
  const window = nightWindowSet(1320, 360);
  const read = nightMinutesOfShift({ effStart: '2026-11-16T22:00', effEnd: '2026-11-17T06:00' }, window);
  assert.deepEqual([read.minutes, read.coverage], [480, 480]);
  assert.equal(nightSharePct(read.minutes, read.coverage), 100);
  // A day shift carries no night minutes.
  const day = nightMinutesOfShift({ effStart: '2026-11-16T06:00', effEnd: '2026-11-16T14:00' }, window);
  assert.deepEqual([day.minutes, day.coverage], [0, 480]);
  assert.equal(nightSharePct(day.minutes, day.coverage), 0);
  // The share limit is exact integer arithmetic: 60 of 480 over 10% is a breach
  // (60 × 100 = 6000 > 480 × 10 = 4800), 48 of 480 is not (4800 = 4800).
  assert.equal(nightShareOver(60, 480, 10), true);
  assert.equal(nightShareOver(48, 480, 10), false);
  // A window that wraps (22:00 → 06:00 = 120 + 360 minutes) and a window that
  // does not (01:00 → 22:00 = 1260 minutes) are read the same way.
  assert.equal(nightWindowSet(1320, 360).length, 480);
  assert.equal(nightWindowSet(60, 1320).length, 1260);
});

test('the kernel merges two lines into one person and proves the night the line alone cannot see', () => {
  // sam works for lou (06:00 → 14:00, no night) and for kit on a project line
  // (22:00 → 02:00, all night). The reading is ONE person across both lines:
  // the night minutes come from the project shift, and the share is over the
  // merged spell.
  const evaluation = evaluateWorkNight({
    intervals: [
      { id: 's1', s: 0, e: 480, line: 'lou', breaks: [], effStart: '2026-11-16T06:00', effEnd: '2026-11-16T14:00', effStartOffsetMin: 60, effEndOffsetMin: 60 },
      { id: 's2', s: 1320, e: 1560, line: 'kit', breaks: [], effStart: '2026-11-16T22:00', effEnd: '2026-11-17T02:00', effStartOffsetMin: 60, effEndOffsetMin: 60 },
    ],
    policy: { nightFromMin: 1320, nightToMin: 360, nightMaxSharePct: 50 },
    coverage: [],
    horizon: { from: -20 * DAY, to: 20 * DAY },
  });
  const byId = new Map(evaluation.shiftReadings.map((row) => [row.id, row]));
  assert.equal(byId.get('s1').nightMinutes, 0);
  assert.equal(byId.get('s2').nightMinutes, 240);
  assert.equal(byId.get('s2').shareOver, true, 'the project shift alone breaches the declared share');
  assert.equal(evaluation.findings.length, 1);
  assert.equal(evaluation.findings[0].kind, 'night-share-breach');
  assert.deepEqual(evaluation.findings[0].lines, ['kit']);
  // The streak is the longest run of consecutive UTC days with night work.
  // The project shift crosses midnight, so its night minutes fall on two
  // consecutive UTC days.
  assert.equal(evaluation.streak, 2);
});

test('the streak is the longest consecutive run across every line, counted once', () => {
  // Night on days 3, 4, 5, 6, 7 (contiguous) and an isolated night on day 20.
  const nightDays = [3, 4, 5, 6, 7, 20];
  assert.equal(longestConsecutiveRun(nightDays), 5);
  // A gap breaks the run.
  assert.equal(longestConsecutiveRun([1, 2, 3, 10, 11]), 3);
  assert.equal(longestConsecutiveRun([]), 0);
  // With the streak limit at 4, the breach is proved at the start of the fifth
  // night's first shift. Each shift carries six night minutes-of-day
  // (00:00 -> 06:00) inside the declared window 00:00 -> 12:00, on its own UTC
  // day.
  const nightShift = (day) => ({ id: `n${day}`, s: day * DAY, e: day * DAY + 360, line: 'lou', breaks: [], effStart: '2026-11-16T00:00', effEnd: '2026-11-16T06:00', effStartOffsetMin: 0, effEndOffsetMin: 0 });
  const evaluation = evaluateWorkNight({
    intervals: [3, 4, 5, 6, 7].map(nightShift),
    policy: { nightFromMin: 0, nightToMin: 720, nightMaxConsecutiveNights: 4 },
    coverage: [],
    horizon: { from: -20 * DAY, to: 20 * DAY },
  });
  assert.equal(evaluation.streak, 5);
  assert.equal(evaluation.findings.length, 1);
  assert.equal(evaluation.findings[0].kind, 'night-streak-breach');
  assert.equal(evaluation.findings[0].at, 7 * DAY, 'the decisive minute is the start of the first shift on the fifth night');
});

test('a break subtracts from a spell to yield continuous stretches; a missing record is unproven, never a breach', () => {
  // One spell of 600 minutes with a 60-minute break at 240: two stretches,
  // 240 and 300, longest 300.
  const segs = continuousSegments({ s: 0, e: 600 }, [{ from: 240, to: 300 }]);
  assert.deepEqual(segs.segments.map((s) => [s.from, s.to, s.minutes]), [[0, 240, 240], [300, 600, 300]]);
  assert.equal(segs.longest, 300);
  // No break record: the longest stretch is the whole spell, and the declared
  // break-after limit is tested — the missing record is unproven, not a breach
  // of the person.
  const noBreak = continuousSegments({ s: 0, e: 600 }, []);
  assert.equal(noBreak.longest, 600);
  const evaluation = evaluateWorkNight({
    intervals: [{ id: 's1', s: 0, e: 600, line: 'lou', breaks: [], effStart: '2026-11-16T00:00', effEnd: '2026-11-16T10:00', effStartOffsetMin: 0, effEndOffsetMin: 0 }],
    policy: { nightFromMin: 0, nightToMin: 720, breakAfterMin: 300 },
    coverage: [{ from: -20 * DAY, to: 20 * DAY }],
    horizon: { from: -20 * DAY, to: 20 * DAY },
  });
  assert.equal(evaluation.findings.length, 0, 'absence of a break record is never read as a breach');
  assert.deepEqual(evaluation.unproven, ['break-record-missing']);
  assert.equal(evaluation.missingBreaks.length, 1);
  assert.deepEqual(evaluation.missingBreaks[0], { shiftIds: ['s1'], from: 0, to: 600, minutes: 600, limit: 300, excess: 300 });
});

test('the fatigue index is a transparent declared-convention score over the declared factors', () => {
  // Each factor is capped at 1 and the index is the largest of them, scaled to
  // 100. The factors themselves are printed; nothing is stored.
  const index = fatigueIndex([
    { key: 'a', ratio: 0.5 },
    { key: 'b', ratio: 1.2 },
    { key: 'c', ratio: 0.25 },
  ]);
  assert.equal(index.index, 100, 'a factor at 1.2 is capped at 1');
  // The factors are printed as declared; the cap is applied to the index.
  assert.deepEqual(index.factors.map((f) => [f.key, f.ratio]), [['a', 0.5], ['b', 1.2], ['c', 0.25]]);
  const noFactors = fatigueIndex([]);
  assert.equal(noFactors, null, 'no declared factor means no index at all');
});

test('a shift whose two stored offsets disagree is refused for the night reading, never re-timed', () => {
  // A shift across a clock change carries two different UTC offsets. Which
  // wall-clock minutes it actually contained cannot be resolved, so its night
  // minutes are refused (counted), and the reading says why.
  const state = fixture();
  state.workRestShifts = [{
    id: 's1', personId: 'sam', lineManagerId: 'lou', zone: CPH,
    start: '2026-10-24T22:00', end: '2026-10-25T03:00',
    startOffsetMin: 120, endOffsetMin: 60, effStart: '2026-10-24T22:00', effEnd: '2026-10-25T03:00',
    minutes: 300, cancelled: false, confirmed: false, amended: false, state: 'rostered',
    source: 'roster', note: '', declaredOn: '2026-10-20', declaredAt: AT, declaredById: 'lou', via: 'line-holder',
  }];
  const report = buildWorkNight(state, { now: new Date(T0), settings: state.settings, seat: null });
  const sam = report.people.find((row) => row.personId === 'sam');
  assert.equal(sam.shifts[0].nightUnreadable, true);
  assert.equal(sam.shifts[0].nightMinutes, 0, 'the night minutes are refused, not guessed');
  assert.equal(report.totals.dstUnreadableN, 1);
});

/* --------------------------------------------------------------------- 2. schema */

test('v181 is additive, starts empty, seeds no limit and invents no break', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 180 };
  for (const key of ['workBreaks', 'workNightPolicies', 'workNightMarkers']) delete old[key];
  old.people = [person('lou', null, 'lead'), person('sam', 'lou', 'ic')];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 181);
  assert.deepEqual(next.applied.at(-1), '180 → 181');
  for (const key of ['workBreaks', 'workNightPolicies', 'workNightMarkers']) {
    assert.deepEqual(next.raw[key], [], `${key} starts empty`);
    assert.ok(COLLECTIONS.includes(key), `${key} is a collection`);
  }
  assert.deepEqual(next.raw.settings.workNightAutoPropagate, true);
  // No setting carries a night window or limit: a policy declares it, with a source.
  assert.deepEqual(Object.keys(next.raw.settings).filter((key) => key.startsWith('workNight') && key !== 'workNightAutoPropagate'), [], 'no night window or limit is seeded as a setting');
  const report = buildWorkNight(normalizeState(next.raw, { now: new Date(T0) }).state, { now: new Date(T0) });
  assert.equal(report.people.length, 0, 'an empty record prints nobody with a shift');
});

test('a hand-edited file cannot manufacture a break, a policy or a limit', () => {
  const shiftRow = { id: 's1', personId: 'sam', lineManagerId: 'lou', zone: CPH, start: '2026-11-16T06:00', end: '2026-11-16T14:00', startOffsetMin: 60, endOffsetMin: 60, effStart: '2026-11-16T06:00', effEnd: '2026-11-16T14:00', minutes: 480, cancelled: false, confirmed: false, amended: false, state: 'rostered', source: 'roster', note: '', declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' };
  const warnings = [];
  const breaks = normalizeWorkNightBreaks([
    { id: 'b1', shiftId: 's1', personId: 'sam', lineManagerId: 'lou', start: '2026-11-16T10:00', end: '2026-11-16T10:30', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' },
    { id: 'b2', shiftId: 's1', personId: 'sam', lineManagerId: 'lou', start: '2026-11-16T03:00', end: '2026-11-16T03:30', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' }, // outside the shift
    { id: 'b3', shiftId: 'ghost', personId: 'sam', lineManagerId: 'lou', start: '2026-11-16T10:00', end: '2026-11-16T10:30', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' }, // no such shift
    { id: 'b4', shiftId: 's1', personId: 'ivy', lineManagerId: 'lou', start: '2026-11-16T10:00', end: '2026-11-16T10:30', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' }, // wrong person
    { id: 'b5', shiftId: 's1', personId: 'sam', lineManagerId: 'lou', start: '2026-11-16T14:00', end: '2026-11-16T14:30', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'lou', via: 'line-holder' }, // not inside the shift
  ], [shiftRow], [], warnings);
  assert.deepEqual(breaks.map((row) => row.id), ['b1']);
  assert.match(warnings.join(' '), /4 night-work break row\(s\) could not be read exactly/);

  const policy = (id, extra) => ({ id, label: 'Site night rule', scope: 'workspace', personIds: [], source: 'Site handbook section 4', nightFromMin: 1320, nightToMin: 360, nightMaxSharePct: 50, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'vera', retiredAt: null, retiredById: null, retireReason: '', ...extra });
  const policies = normalizeWorkNightPolicies([
    policy('p1'),
    policy('p2', { source: '' }), // no written source
    policy('p3', { nightFromMin: 360, nightToMin: 360 }), // a window that is not a range
    policy('p4', { nightMaxSharePct: 200 }), // outside its bounds
    policy('p5', { nightMaxSharePct: null, nightMaxConsecutiveNights: null, breakAfterMin: null, breakMinMin: null }), // no limit at all
  ], warnings);
  assert.deepEqual(policies.map((row) => row.id), ['p1']);
  assert.match(warnings.join(' '), /4 night-work policy row\(s\) could not be read exactly/);

  const window = readNightWindow({ nightFromMin: 1320, nightToMin: 1320 });
  assert.equal(window.ok, false);
  assert.equal(window.field, 'nightToMin');
  assert.equal(readWorkNightThresholds({ nightFromMin: 1320, nightToMin: 360, nightMaxSharePct: 50 }).ok, true);
  assert.equal(readWorkNightThresholds({ nightFromMin: 1320, nightToMin: 360 }).ok, false, 'a policy that declares no limit tests nothing');

  const markers = normalizeWorkNightMarkers([
    { key: 'm1', at: T0, ruleId: WORK_NIGHT_RULE_ID, kind: 'work-night', detail: 'x' },
    { key: 'm1', at: T0, ruleId: WORK_NIGHT_RULE_ID, kind: 'work-night', detail: 'y' }, // duplicate
    { at: T0, ruleId: WORK_NIGHT_RULE_ID }, // no key
  ], warnings);
  assert.deepEqual(markers.map((row) => row.key), ['m1']);

  // The settings read: the automation switch is the only thing this module owns.
  assert.deepEqual(normalizeWorkNightSettings({ workNightAutoPropagate: false }), { workNightAutoPropagate: false });
  assert.deepEqual(normalizeWorkNightSettings({}), { workNightAutoPropagate: true });
  // Breaks must lie inside their shift, read from the wall clock alone.
  assert.equal(breakInsideShift({ start: '2026-11-16T10:00', end: '2026-11-16T10:30' }, shiftRow), true);
  assert.equal(breakInsideShift({ start: '2026-11-16T03:00', end: '2026-11-16T03:30' }, shiftRow), false);
  // The ask summary is an opaque signature, never the person.
  const sig = workNightSignature({ personId: 'sam', kind: 'night-share-breach', at: 0, ids: ['s1'] });
  assert.match(sig, /^wnr1:[0-9a-f]{16}$/);
  assert.equal(workNightAskSummary(sig), `Night-work breach: ${sig}`);
  assert.deepEqual(parseWorkNightAskSummary(`Night-work breach: ${sig}`), { signature: sig });
  assert.equal(parseWorkNightAskSummary('not an ask'), null);
  assert.deepEqual([parseWorkNightDuration('11'), parseWorkNightDuration('11:30'), parseWorkNightDuration('45m'), parseWorkNightDuration('7d'), parseWorkNightDuration('1.5')], [660, 690, 45, 10080, null]);
});

/* --------------------------------------------------------------------- 3. wiring */

test('the reading is wired to the spine: rights, reads, record policies, CSV scope #168, rule, pause reach', () => {
  for (const key of Object.values(WORK_NIGHT_RIGHTS)) assert.ok(ACTION_RIGHTS[key], `${key} is a declared right`);
  assert.equal(ACTION_RIGHTS[WORK_NIGHT_RIGHTS.ROSTER].minRank, 1, 'a frontline lead records a break');
  assert.equal(ACTION_RIGHTS[WORK_NIGHT_RIGHTS.POLICY].minRank, 3, 'which night limits apply is declared from the director altitude');
  for (const name of ['workNightReport', 'workNightBriefText', 'workNightCsvRows', 'workNightAttentionCount']) assert.ok(SAFE_READS.has(name), name);
  for (const name of ['workNightRecordBreak', 'workNightDeclarePolicy', 'workNightScan']) assert.equal(SAFE_READS.has(name), false, name);
  for (const key of ['workBreaks', 'workNightPolicies', 'workNightMarkers']) assert.equal(RECORD_POLICIES[key].detailCeiling, 0, `${key} is report-only`);

  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  assert.equal(ids.length, 142);
  const spot = ids.indexOf('workNightRule');
  assert.ok(spot >= 0, 'RULE-WNR-01 is on the shared spine');
  assert.equal(ids.lastIndexOf('workNightRule'), spot, 'registered exactly once');
  assert.ok(spot < ids.indexOf('seatRule'), 'before the seat roll-up, which reads the finished workspace');
  assert.deepEqual(ids.slice(-2), ['seatRule', 'sealRule']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'rule/contract parity');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === workNightRule);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'workNightMarkers']);
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('workNightAutoPropagate'));
  assert.equal(PAUSE_PERMIT_REACH_RULES.workNightAutoPropagate, 'workNightRules.js');
  assert.ok(fs.readFileSync(path.join(REPO, 'app/core/domain/workNightRules.js'), 'utf8').includes('workNightAutoPropagate === false'), 'the rule names its pause switch literally');

  assert.equal(CSV_EXPORTS.length, 169);
  assert.ok(CSV_EXPORTS.some((row) => row.key === WORK_NIGHT_CSV_SCOPE), 'scope #168 is registered');
});

/* ----------------------------------------------------------------------- 4. door */

test('a break is recorded only by a seat that holds the very line it is worked for', () => {
  const { api, as, store } = seed();
  // kit holds sam on a project line, and may record a break on THAT line …
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T22:00', '2026-11-17T02:00'))));
  const recorded = as('kit', () => ok(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'kit', shiftId: store.state.workRestShifts[0].id,
    zone: CPH, start: '2026-11-16T23:00', end: '2026-11-17T00:30', note: 'Late-night relief',
  })));
  assert.deepEqual([recorded.via, recorded.minutes, recorded.cleared], ['line-holder', 90, []], 'no missing-break refusal was cleared by this break');
  // … but not for lou's line, however clearly kit can see sam.
  as('kit', () => refused(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'lou', shiftId: store.state.workRestShifts[0].id,
    zone: CPH, start: '2026-11-16T23:00', end: '2026-11-17T00:30',
  }), /does not hold the line of Lou Name/, 'lineManagerId'));
  // A break outside the shift is refused, never trimmed.
  as('kit', () => refused(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'kit', shiftId: store.state.workRestShifts[0].id,
    zone: CPH, start: '2026-11-16T18:00', end: '2026-11-16T19:00',
  }), /does not lie inside the shift/, 'end'));
  // The stored row is the declared act, with the offsets the door resolved.
  const stored = store.state.workBreaks[0];
  assert.deepEqual([stored.personId, stored.lineManagerId, stored.via, stored.declaredById], ['sam', 'kit', 'line-holder', 'kit']);
  assert.deepEqual([stored.start, stored.end], ['2026-11-16T23:00', '2026-11-17T00:30']);
  assert.equal(readWorkNightRecord(store.state).breaks[0].minutes, 90, 'the reader re-derives the minutes on read');
});

test('a break shorter than the declared minimum is refused at the door; the loader drops it too', () => {
  const { api, as, store } = seed();
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T22:00', '2026-11-17T02:00'))));
  // Declare a workspace policy whose minimum break is 30 minutes.
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50, breakMinMin: 30,
  })));
  as('kit', () => refused(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'kit', shiftId: store.state.workRestShifts[0].id,
    zone: CPH, start: '2026-11-16T23:00', end: '2026-11-16T23:10',
  }), /requires every recorded break to be at least 30 min/, 'end'));
  assert.equal(store.state.workBreaks.length, 0, 'a refused break is not stored');
  // A hand-edited file cannot slip the same break past the loader.
  const warnings = [];
  const breakRow = { id: 'b1', shiftId: store.state.workRestShifts[0].id, personId: 'sam', lineManagerId: 'kit', start: '2026-11-16T23:00', end: '2026-11-16T23:10', startOffsetMin: 60, endOffsetMin: 60, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'kit', via: 'line-holder' };
  assert.deepEqual(normalizeWorkNightBreaks([breakRow], readWorkNightRecord(store.state).shifts, readWorkNightRecord(store.state).policies, warnings), []);
  assert.match(warnings.join(' '), /could not be read exactly/);
  // A break at the minimum passes the door.
  const okBreak = as('kit', () => ok(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'kit', shiftId: store.state.workRestShifts[0].id,
    zone: CPH, start: '2026-11-16T23:00', end: '2026-11-16T23:30',
  })));
  assert.equal(okBreak.minutes, 30);
});

test('a policy with no written source is refused at the door, and no limit is assumed in its place', () => {
  const { api, as } = seed();
  as('vera', () => refused(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: '',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  }), /Write where these limits come from/, 'source'));
  // A window that is not a range is refused.
  as('vera', () => refused(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '06:00', nightToMin: '06:00', nightMaxSharePct: 50,
  }), /The night window/, 'nightToMin'));
  // A limit outside its bounds is refused.
  as('vera', () => refused(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 200,
  }), /night-share maximum/, 'nightMaxSharePct'));
  // A policy declaring no limit is refused.
  as('vera', () => refused(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00',
  }), /no limit|declares no limit|tests nothing/i, null));
  // A workspace policy declares its window and limits exactly as typed.
  const declared = as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50, nightMaxConsecutiveNights: 4,
  })));
  assert.deepEqual([declared.thresholds.nightFromMin, declared.thresholds.nightToMin, declared.thresholds.nightMaxSharePct], [1320, 360, 50]);
});

/* ------------------------------------------------------------------------ 5. rule */

test('the rule asks the holder of the line for a provable breach that is still ahead', () => {
  const { store, api, as, on } = seed();
  // vera declares a policy: night is 22:00 → 06:00, share capped at 50%.
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  // kit records a shift for sam on the project line that is ALL night, in the
  // future: the decisive minute is ahead, so the breach is still preventable.
  on('2026-11-15');
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T22:00', '2026-11-18T02:00'))));
  const before = workNightConditions(store.state, { now: at('2026-11-15'), matrix: buildMatrix(store.state, { now: at('2026-11-15'), settings: { activeSeatId: null } }) });
  assert.equal(before.length, 1);
  assert.equal(before[0].condition, 'night-breach-ahead');
  assert.deepEqual(before[0].lineIds, ['kit']);
  assert.equal(before[0].owner.state, 'seat');
  assert.equal(before[0].owner.seatId, 'kit');

  // The rule files ONE bounded ask for the line holder.
  const effects = workNightRule(store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` });
  assert.ok(effects.some((e) => e.action === 'delegated'), 'the rule files an ask');
  const openAsks = indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active');
  assert.equal(openAsks.length, 1);
  assert.equal(openAsks[0].seatId, 'kit');
  assert.equal(openAsks[0].signature, before[0].signature);
  // The ask is opaque: no person, no shift, no clock time in the summary.
  assert.match(openAsks[0].summary, /^Night-work breach: wnr1:[0-9a-f]{16}$/);
  // A repeat scan files nothing new: the ask is idempotent per condition.
  workNightRule(store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-y` });
  assert.equal(indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active').length, 1);
});

test('a cross-line breach is asked of the lowest seat above BOTH lines; the leader case writes a marker, not an ask', () => {
  const { store, api, as, on } = seed();
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  on('2026-11-15');
  // sam works two lines: lou's shift (06:00 → 14:00, no night) and kit's
  // project shift (22:00 → 02:00, all night). The breach is made by TWO lines.
  as('lou', () => ok(api.workRestDeclareShift(shift('sam', 'lou', '2026-11-17T06:00', '2026-11-17T14:00'))));
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T22:00', '2026-11-18T02:00'))));
  const matrix = buildMatrix(store.state, { now: at('2026-11-15'), settings: { activeSeatId: null } });
  const conditions = workNightConditions(store.state, { now: at('2026-11-15'), matrix });
  assert.equal(conditions.length, 1);
  assert.deepEqual(conditions[0].lineIds, ['lou', 'kit']);
  assert.equal(conditions[0].owner.state, 'seat');
  assert.equal(conditions[0].owner.seatId, 'vera', 'the lowest seat above both lines is vera');
  workNightRule(store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` });
  const openAsks = indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active');
  assert.equal(openAsks.length, 1, 'the joint apex is asked once, not per line');
  assert.equal(openAsks[0].seatId, 'vera');

  // Where the person IS the workspace leader, nobody is asked: an
  // identity-free marker is written and the reading still prints.
  const leaderState = fixture({
    workRestShifts: [{
      id: 's1', personId: 'vera', lineManagerId: 'vera', zone: CPH,
      start: '2026-11-17T22:00', end: '2026-11-18T02:00', startOffsetMin: 60, endOffsetMin: 60,
      effStart: '2026-11-17T22:00', effEnd: '2026-11-18T02:00', minutes: 240, cancelled: false,
      confirmed: false, amended: false, state: 'rostered', source: 'roster', note: '',
      declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'vera', via: 'operator',
    }],
    workNightPolicies: [{
      id: 'p1', label: 'Site night rule', scope: 'workspace', personIds: [],
      source: 'Site night-work handbook, section 3', nightFromMin: 1320, nightToMin: 360,
      nightMaxSharePct: 50, declaredOn: '2026-11-15', declaredAt: T0, declaredById: 'vera',
      retiredAt: null, retiredById: null, retireReason: '',
    }],
  });
  const matrix2 = buildMatrix(leaderState, { now: at('2026-11-15'), settings: { activeSeatId: null } });
  const leaderConditions = workNightConditions(leaderState, { now: at('2026-11-15'), matrix: matrix2 });
  assert.equal(leaderConditions.length, 1);
  assert.equal(leaderConditions[0].owner.state, 'leader', 'the workspace leader is nobody to ask');
  workNightRule(leaderState, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` });
  assert.equal(leaderState.workNightMarkers.length, 1);
  assert.match(leaderState.workNightMarkers[0].key, /^work-night\|obs\|/);
  assert.equal(indexWorkNightAsks(leaderState).filter((ask) => ask.task && ask.task.status === 'active').length, 0);
});

test('a missing break record on an ENDED shift asks the line holder to complete the record', () => {
  const { store, api, as, on } = seed();
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50, breakAfterMin: 240,
  })));
  on('2026-11-20');
  // A shift that ENDED yesterday, with continuous work past 240 minutes and no
  // break recorded: the ask is for the record, and never judges the person.
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-18T22:00', '2026-11-19T04:00'))));
  const matrix = buildMatrix(store.state, { now: at('2026-11-20'), settings: { activeSeatId: null } });
  const conditions = workNightConditions(store.state, { now: at('2026-11-20'), matrix });
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].condition, 'break-record-missing');
  assert.equal(conditions[0].owner.state, 'seat');
  assert.equal(conditions[0].owner.seatId, 'kit');
  workNightRule(store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-20'), idFactory: (p) => `${p}-x` });
  const openAsks = indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active');
  assert.equal(openAsks.length, 1);
  assert.equal(openAsks[0].seatId, 'kit');
  assert.equal(openAsks[0].task.expectedOutcome.includes('request for the record'), true, 'the ask is for the record, not a judgement of the person');
});

test('the rule passes with the clock, respects a human answer, and a pause governs every path', () => {
  const { store, api, as, on } = seed();
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  on('2026-11-15');
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T22:00', '2026-11-18T02:00'))));
  const scan = { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` };
  workNightRule(store.state, scan);
  assert.equal(indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active').length, 1);

  // The decisive minute passes: the ask closes on the next scan.
  on('2026-11-18');
  workNightRule(store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-18'), idFactory: (p) => `${p}-y` });
  assert.equal(indexWorkNightAsks(store.state).filter((ask) => ask.task && ask.task.status === 'active').length, 0);

  // A human who closed the ask while the condition is still in force has
  // answered it: the rule files nothing new for the same signature.
  const fresh = seed();
  as('vera', () => ok(fresh.api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  as('kit', () => ok(fresh.api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T22:00', '2026-11-18T02:00'))));
  workNightRule(fresh.store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` });
  const ask = indexWorkNightAsks(fresh.store.state).find((row) => row.task && row.task.status === 'active');
  fresh.store.update((draft) => {
    const task = draft.delegations.find((row) => row.id === ask.task.id);
    task.status = 'done';
    task.completedOn = '2026-11-15';
    task.completionNote = 'Handled.';
    task.updatedAt = '2026-11-15T12:00:00.000Z';
  }, { type: 'delegate.answered', entity: 'delegation', entityId: ask.task.id, summary: 'answered' });
  workNightRule(fresh.store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-z` });
  assert.equal(indexWorkNightAsks(fresh.store.state).filter((row) => row.task && row.task.status === 'active').length, 0);

  // A pause governs every path, including an explicit scan.
  const paused = seed();
  paused.store.update((draft) => { draft.settings = { ...draft.settings, workNightAutoPropagate: false }; },
    { type: 'settings.set', entity: 'settings', entityId: 'seat', summary: 'paused' });
  as('vera', () => ok(paused.api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  as('kit', () => ok(paused.api.workRestDeclareShift(shift('sam', 'kit', '2026-11-17T22:00', '2026-11-18T02:00'))));
  const effects = workNightRule(paused.store.state, { event: { type: 'workNight.scan' }, now: at('2026-11-15'), idFactory: (p) => `${p}-q` });
  assert.deepEqual(effects, [], 'a paused rule writes nothing');
  assert.equal(indexWorkNightAsks(paused.store.state).filter((row) => row.task && row.task.status === 'active').length, 0);
});

/* ----------------------------------------------------------------------- 6. panel */

test('what the panel prints is what is stored, to the minute — and the export is the same reader', () => {
  const { store, api, as } = seed();
  // A workspace night policy: 22:00 → 06:00, share capped at 50%, a break
  // required every 240 minutes, shortest break 15.
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50, breakAfterMin: 240, breakMinMin: 15,
  })));
  // kit records a shift for sam on the project line: 22:00 → 02:00, ALL night,
  // with a 30-minute break at 23:30.
  const recorded = as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T22:00', '2026-11-17T02:00'))));
  const shiftId = recorded.shiftId;
  as('kit', () => ok(api.workNightRecordBreak({
    personId: 'sam', lineManagerId: 'kit', shiftId, zone: CPH,
    start: '2026-11-16T23:30', end: '2026-11-17T00:00', note: 'Relief',
  })));
  const report = api.workNightReport().report;
  const sam = report.people.find((row) => row.personId === 'sam');
  assert.equal(sam.verdict, 'breach', 'the shift alone carries 100% night share, over the declared 50%');
  assert.equal(sam.shifts[0].nightMinutes, 240);
  assert.equal(sam.shifts[0].shareOver, true);
  assert.equal(sam.shifts[0].breaks.length, 1);
  assert.equal(sam.shifts[0].breaks[0].minutes, 30);
  assert.ok(sam.fatigueIndex.factors.some((f) => f.key === 'night-share' && f.ratio === 2));
  assert.equal(report.totals.nightShiftsN, 1);
  assert.equal(report.totals.fatigueIndexMax, 100);

  withDom(() => {
    const root = document.getElementById('root');
    const ctx = { api, state: store.state, now: new Date(T0), query: new URLSearchParams('panel=night'), navigate() {}, refresh() { root.replaceChildren(renderStandardWork(ctx)); } };
    ctx.refresh();
    const text = (testid) => { const node = root.querySelector(`[data-testid="${testid}"]`); assert.ok(node, `${testid} is on the page`); return node.textContent; };
    assert.equal(root.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Night work');
    assert.equal(root.querySelector('[data-testid="night-work"]') !== null, true);

    // The shift row prints the night minutes and share the reader computed.
    const cells = [...root.querySelectorAll(`[data-testid="wnr-shift-${shiftId}"] td`)].map((cell) => cell.textContent);
    assert.ok(cells.some((cell) => cell.includes('4 h 0 min')), `the shift row prints its 240 night minutes: ${cells.join(' | ')}`);
    // The finding prints the exact change that would remove it.
    const finding = sam.findings[0];
    assert.ok(text(`wnr-finding-sam`).includes(finding.sentence));
    assert.ok(text(`wnr-finding-sam`).includes('Owed to Kit Name'), 'the breach inside one line is owed to its holder');
    assert.match(text('wnr-summary'), /^1 in reach = 1 breach \+ 0 two policies \+ 0 no policy \+ 0 unproven \+ 0 clear \+ 0 no record\./);

    // The method illustration is a real file, described from what it shows.
    const image = root.querySelector('figure img');
    assert.equal(image.getAttribute('src'), './app/assets/night-work-break-method.jpg');
    assert.ok(image.getAttribute('alt').length > 80);
    assert.match(root.querySelector('figure figcaption').textContent, /AI-generated method illustration, not workspace data/);
    const file = path.join(REPO, 'app/assets/night-work-break-method.jpg');
    const bytes = fs.readFileSync(file);
    assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xff, 0xd8, 0xff], 'a real JPEG');
    assert.ok(bytes.length > 10000);

    const page = root.textContent;
    for (const junk of ['[object Object]', 'undefined', 'NaN', 'null']) assert.equal(page.includes(junk), false, `the page never prints “${junk}”`);

    // The brief dialog is the identity-free summary of the same reading.
    root.querySelector('[data-testid="wnr-brief-open"]').click();
    const modal = document.getElementById('modal-root');
    assert.match(modal.querySelector('[data-testid="wnr-brief"]').textContent, /Night-work reading/);
    assert.ok(modal.textContent.includes('rates nobody') || modal.textContent.includes('rate'));
  });

  // The export is the same reader: the exported share is the printed share.
  const exported = exportWorkspaceCsv(store.state, WORK_NIGHT_CSV_SCOPE, { now: new Date(T0) });
  assert.equal(exported.ok, true, exported.reason);
  const csvText = String(exported.text || exported.csv || '');
  const rows = parseCsv(csvText);
  assert.equal(rows.length, 2, 'a header row and one person row');
  assert.deepEqual(Object.keys(rows[0]).slice(0, 2), ['person', 'verdict']);
  const row = rows[1];
  assert.equal(row.person, 'W01', 'a person exports under a positional code, never a name');
  assert.equal(row.verdict, 'breach');
  assert.equal(row.nightSharePct, '100');
  assert.equal(row.fatigueIndex, '100');
  assert.equal(csvText.includes('sam'), false, 'no person id reaches the file');
  assert.equal(csvText.includes('Sam Name'), false, 'no person name reaches the file');
});

test('a person with no night policy reads as no-policy; silence is not a night', () => {
  const { store, api, as } = seed();
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T06:00', '2026-11-16T14:00'))));
  const report = api.workNightReport().report;
  const sam = report.people.find((row) => row.personId === 'sam');
  assert.equal(sam.verdict, 'no-policy');
  assert.equal(sam.nightShiftsN, 0, 'a day shift carries no night minutes');
  assert.equal(sam.shifts[0].nightMinutes, 0);
  assert.equal(report.totals.noPolicyN, 1);
  // The attention count is the register the spine sees, computed over the same reading.
  assert.equal(workNightAttentionCount(store.state, { now: new Date(T0), seat: null }), 1, 'one unproven/no-policy reading is an attention item');
});

test('the horizon is the shared work/rest window, and the reading is scoped to the seat that reads it', () => {
  const conv = { workRestBackDays: 28, workRestAheadDays: 14 };
  const horizon = workNightHorizon(new Date(T0), conv);
  assert.deepEqual([horizon.backDays, horizon.aheadDays, horizon.days], [28, 14, 43]);
  // A seat reads only its own reach: the operator (full access) reads everyone,
  // and a lead reads the people on its own lines.
  const { store, api, as } = seed();
  as('kit', () => ok(api.workRestDeclareShift(shift('sam', 'kit', '2026-11-16T22:00', '2026-11-17T02:00'))));
  as('vera', () => ok(api.workNightDeclarePolicy({
    label: 'Site night rule', scope: 'workspace', source: 'Site night-work handbook, section 3',
    nightFromMin: '22:00', nightToMin: '06:00', nightMaxSharePct: 50,
  })));
  const leaderReport = as(null, () => api.workNightReport().report);
  assert.equal(leaderReport.people.length, 1, 'only sam has a shift on record');
  const kitReport = as('kit', () => api.workNightReport().report);
  assert.equal(kitReport.people.length, 1, 'kit holds sam on the project line and reads him');
  assert.equal(kitReport.totals.peopleN, 1);
});
