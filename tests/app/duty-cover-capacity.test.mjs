/**
 * tests/app/duty-cover-capacity.test.mjs — ADR-0124, Schema v115 unchanged,
 * Session 170.
 *
 * THE QUESTION A MID-MANAGER ACTUALLY ASKS
 * ---------------------------------------
 * "Two of my leads are out the same week and I am the only declared cover for
 * both. Can I carry the work?" ADR-0123 printed the single point of failure;
 * it said nothing about the load behind it. This suite proves the capacity
 * reading is derived from the same shared open-work harvester, counts each
 * item ONCE (including items already inside the cover's own span), grades the
 * union against a LIKE-FOR-LIKE revealed envelope, refuses when there is no
 * denominator, and travels with the register/brief/decision/event spine at
 * every altitude with the identity wall intact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { harvestWork } from '../../app/core/domain/chain.js';
import {
  absenceConcurrency, dutiesForSeat, buildDutyCoverageReport, dutyCoverageBriefText,
  dutyCoverageCsvRows, coverLoadEnvelope,
} from '../../app/core/domain/dutyCoverage.js';
import {
  DUTY_COVER_LOAD_ENGINE_VERSION, DUTY_COVER_LOAD_PREMISE, DUTY_COVER_LOAD_LIMITS,
  DUTY_COVER_LOAD_REFUSALS,
} from '../../app/core/domain/dutyAbsenceRegistry.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

/** leader → vp1 → dir1 → { mgr1 → lead1, lead2; mgr2 → lead3 } → ICs */
function people() {
  return [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1' },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'mgr2', name: 'Tomas Ito', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead3', name: 'Ana Duarte', role: 'Shift lead', level: 'lead', managerId: 'mgr2' },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2' },
    { id: 'ic4', name: 'Dee Marsh', role: 'Analyst', level: 'ic', managerId: 'lead3' },
  ];
}

const WINDOW = { from: '2027-07-05', to: '2027-07-09' };

/** Open work in the two branches. `case-shared` deliberately names people in
 *  BOTH leads' spans, so the same case reaches two absent seats' duty lines. */
function work() {
  const c = (id, people0 = [], days = 11) => ({
    id, title: `Open case ${id}`, status: 'open', ownerId: people0[0] || 'ic1',
    involvedPersonIds: people0, openedOn: ago(days),
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), fmea: { severity: 5 },
  });
  return {
    cases: [
      c('case-a', ['ic1']), c('case-b', ['ic2']), c('case-shared', ['ic1', 'ic3']),
      c('case-c', ['ic3']), c('case-d', ['ic4'], 13),
    ],
    delegations: [
      { id: 'del-a', title: 'Rolling rota', personId: 'ic1', delegatedOn: ago(10), status: 'active' },
      { id: 'del-c', title: 'Supplier backlog', personId: 'ic3', delegatedOn: ago(9), status: 'active' },
    ],
    goals: [
      { id: 'goal-a', title: 'Cut rework', ownerId: 'ic1', status: 'active', createdAt: ago(20), keyResults: [] },
      { id: 'goal-c', title: 'Close the gap', ownerId: 'ic3', status: 'active', createdAt: ago(18), keyResults: [] },
    ],
  };
}

/** Two absent leads, one manager declared as the only cover for their case
 *  and clarity duty lines (the ones whose sources actually hold open work). */
function twoLeadSetup() {
  return {
    absences: [
      { seatId: 'lead1', from: WINDOW.from, to: WINDOW.to },
      { seatId: 'lead2', from: WINDOW.from, to: WINDOW.to },
    ],
    covers: [
      { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
      { seatId: 'lead1', dutyKey: 'clarity', coverId: 'mgr1' },
      { seatId: 'lead2', dutyKey: 'first-signal', coverId: 'mgr1' },
      { seatId: 'lead2', dutyKey: 'clarity', coverId: 'mgr1' },
    ],
  };
}

function makeState({ activeSeatId = 'mgr1', absences = [], covers = [], roster = people(), openWork = work(), oneOnOnes = [] } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId,
  };
  state.people = roster.map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
  state.oneOnOnes = oneOnOnes;
  state.cases = openWork.cases || [];
  state.delegations = openWork.delegations || [];
  state.goals = openWork.goals || [];
  state.absencePlans = absences.map((a, i) => ({
    id: `abs-${i + 1}`, seatId: a.seatId, from: a.from, to: a.to,
    reason: a.reason || 'A planned absence declared for this window.', note: '',
    decisionId: null, declaredBySeatId: a.seatId, declaredOn: ago(2),
    declaredAt: NOW.toISOString(), status: 'active', revokedOn: null,
    revokedAt: null, revokeReason: '', version: 'duty-absence-2026.11-v1',
  }));
  state.dutyCovers = covers.map((c, i) => ({
    id: `cover-${i + 1}`, dutyId: `${c.seatId}|${c.dutyKey}`, seatId: c.seatId,
    dutyKey: c.dutyKey, coverId: c.coverId,
    note: 'Declared answerable for this duty while the holder is absent.',
    decisionId: null, declaredBySeatId: 'dir1', declaredOn: ago(5),
    declaredAt: NOW.toISOString(), status: 'active', revokedOn: null,
    revokedAt: null, revokeReason: '', verifiedOn: null,
    version: 'duty-coverage-2026.11-v1',
  }));
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = makeState()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

function read(state, seatId = state.settings.activeSeatId) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  assert.equal(seat.id === seatId || seat.fullAccess, true, 'the fixture seat is the active seat');
  return { built, seat, conc: absenceConcurrency(state, built, seat, { now: NOW, settings: state.settings }) };
}

/** Independent parity computation: the DISTINCT open items inside the covered
 *  duty lines of the absent seats, using the same shared harvester but a plain
 *  Set — so a double count in the engine cannot pass. */
function expectedInherited(state, built, seatIds, dutyKeys) {
  const items = harvestWork(state, built.chain, { now: NOW, settings: state.settings });
  const keys = new Set();
  for (const id of seatIds) {
    const s = built.byId.get(id);
    for (const duty of dutiesForSeat(s).filter((d) => dutyKeys.includes(d.key))) {
      for (const item of items.filter((i) => duty.sources.includes(i.type))) {
        const inSpan = item.people.some((pid) => s.scope.has(pid)) || s.scope.has(item.ownerNodeId);
        if (inSpan) keys.add(`${item.type}:${item.entityId}`);
      }
    }
  }
  return keys;
}

/* ------------------------------------------- 1. no open work ⇒ honest refusal */

test('with no observed open work the capacity reading refuses instead of printing spare capacity', () => {
  assert.equal(SCHEMA_VERSION, 156, 'ADR-0124 adds no schema bump');
  assert.equal(DUTY_COVER_LOAD_ENGINE_VERSION, 'duty-cover-load-2026.11-v1');
  assert.ok(DUTY_COVER_LOAD_PREMISE.length > 0);
  assert.equal(DUTY_COVER_LOAD_LIMITS.coverCap, 24);

  const setup = twoLeadSetup();
  const state = makeState({
    activeSeatId: 'mgr1', ...setup,
    openWork: { cases: [], delegations: [], goals: [] },
  });
  const { conc } = read(state);
  assert.equal(conc.refused, null, 'the overlap itself is still graded');
  assert.equal(conc.windows.length, 1);
  assert.equal(conc.coverLoad.gradedN, 1, 'the cover is still listed, with a refusal');
  assert.equal(conc.coverLoad.refusedN, 1);
  assert.equal(conc.coverLoad.overEnvelopeN, 0, 'a refusal is not a pass');
  assert.match(conc.coverLoad.refusal, /Zero open work is not spare capacity/i);
  const row = conc.windows[0].coverLoads[0];
  assert.equal(row.band, 'refused');
  assert.equal(row.ratio, null, 'no ratio without a denominator');
  assert.match(row.reason, /Cover capacity refused/);
  assert.match(row.reason, new RegExp(DUTY_COVER_LOAD_REFUSALS.noEnvelope.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(conc.windows[0].singleCovers.length, 1, 'the single point of failure survives the capacity refusal');
  assert.equal(conc.windows[0].singleCovers[0].capacity.band, 'refused');

  const brief = dutyCoverageBriefText(buildDutyCoverageReport(state, { now: NOW, settings: state.settings }));
  assert.match(brief, /Cover capacity on the shared dates/);
  assert.match(brief, /Cover capacity refusal:.*Zero open work is not spare capacity/);
});

/* ------------------------------------- 2. set union, dedupe and like-for-like */

test('own + inherited − overlap is the distinct union, and the same case is not counted in two seats', () => {
  const state = makeState({ activeSeatId: 'mgr1', ...twoLeadSetup() });
  const { built, conc } = read(state);
  const w = conc.windows[0];
  assert.equal(w.coverLoads.length, 1);
  const row = w.coverLoads[0];
  assert.equal(row.name, 'Mei Chen');
  assert.equal(row.soleLinesN, 4, 'four sole-answerable duty lines across two seats');
  assert.equal(row.seatsN, 2);
  assert.equal(row.combinedN, row.ownN + row.inheritedN - row.overlapN, 'inclusion–exclusion, not a sum');
  assert.ok(row.inheritedN > 0, 'open work is inherited on the shared dates');
  assert.ok(row.overlapN > 0, "the ancestor cover's span already contains some of the inherited work");
  assert.ok(row.ownN > 0);

  // Independent parity: the same case reaches BOTH absent seats' duty lines
  // (case-shared names ic1 and ic3), but the engine must count it once.
  const expected = expectedInherited(state, built, ['lead1', 'lead2'], ['first-signal', 'clarity']);
  assert.equal(row.inheritedN, expected.size, 'distinct inherited open work');
  assert.ok(expected.has('case:case-shared'));
  assert.ok(row.inheritedN < 2 * expected.size, 'the set is not a per-seat sum');

  // The envelope is like-for-like: only seats at or below the cover's rank,
  // excluding the cover. A chief's whole-span load is NOT the comparison.
  const env = coverLoadEnvelope(built, built.byId.get('mgr1'), harvestWork(state, built.chain, { now: NOW, settings: state.settings }));
  const comparable = [...env.loads.values()].filter((x) => x.id !== 'mgr1' && x.rank <= row.rank);
  assert.equal(row.peersN, comparable.length);
  assert.equal(row.envelopeN, Math.max(...comparable.map((x) => x.n)));
  assert.ok(row.envelopeN > 0);
  assert.equal(row.band, 'over-envelope', 'this cover would carry more than the busiest comparable seat');
  assert.ok(row.ratio > 1);
  assert.match(row.reason, /counted once, not twice/);
  assert.equal(w.capacity.gradedN, 1);
  assert.equal(w.capacity.overEnvelopeN, 1);
  assert.equal(conc.summary.coverLoadOverN, 1);
  assert.equal(conc.coverLoad.maxCombinedN, row.combinedN);
});

/* -------------------------------------- 3. bands follow the observed envelope */

test('within-envelope and at-envelope are real bands, not just one bad case', () => {
  // Load the OTHER manager's branch with far more open work. mgr1's combined
  // load is then below the busiest comparable seat (mgr2), so the same code
  // path prints within-envelope — the point of like-for-like comparison.
  const extraCases = [];
  for (let i = 0; i < 8; i += 1) {
    extraCases.push({
      id: `case-heavy-${i}`, title: `Branch-two case ${i}`, status: 'open', ownerId: 'ic4',
      involvedPersonIds: ['ic4'], openedOn: ago(12 + i), createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(), fmea: { severity: 5 },
    });
  }
  const state = makeState({
    activeSeatId: 'dir1',
    ...twoLeadSetup(),
    openWork: { ...work(), cases: [...work().cases, ...extraCases] },
  });
  const { conc } = read(state, 'dir1');
  const w = conc.windows[0];
  const mgr1Row = w.coverLoads.find((r) => r.label === 'Manager');
  assert.ok(mgr1Row, 'the manager cover is graded');
  assert.equal(mgr1Row.band, 'within-envelope');
  assert.ok(mgr1Row.ratio < 1);
  assert.match(mgr1Row.reason, /Inside|inside the peak|is .*× the/);
  assert.equal(conc.coverLoad.overEnvelopeN, 0);
  assert.equal(conc.coverLoad.withinEnvelopeN, 1);

  // A state where the union exactly equals the comparable peak reads
  // at-envelope, with no headroom claimed.
  const oneCase = makeState({
    activeSeatId: 'mgr1',
    ...twoLeadSetup(),
    openWork: { cases: [{ id: 'case-only', title: 'One case', status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic1'], openedOn: ago(10), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), fmea: { severity: 5 } }], delegations: [], goals: [] },
  });
  const single = read(oneCase).conc.windows[0].coverLoads[0];
  assert.equal(single.band, 'at-envelope');
  assert.equal(single.ratio, 1);
  assert.match(single.reason, /no recorded headroom/);
});

/* ---------------------------------------- 4. shared lines are never invented */

test('a duty line with two available covers is printed as shared, not split by guess', () => {
  const setup = twoLeadSetup();
  const withShared = {
    ...setup,
    // dir1 is an ancestor of lead1 and therefore eligible; a peer manager
    // would be refused by ADR-0121 and would never become an available cover.
    covers: [...setup.covers, { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'dir1' }],
  };
  const state = makeState({ activeSeatId: 'dir1', ...withShared });
  const { conc } = read(state, 'dir1');
  const w = conc.windows[0];
  const rows = w.coverLoads;
  assert.equal(rows.length, 2, 'both available covers are graded');
  const sharedRows = rows.filter((r) => r.sharedLinesN > 0);
  assert.ok(sharedRows.length > 0, 'the shared line is visible');
  for (const r of sharedRows) assert.match(r.reason, /not attributed to one person/);
  // The shared line is visible on both eligible covers and its open work is
  // attributed to neither of them.
  const eligibleRows = rows.filter((r) => r.soleLinesN > 0);
  assert.ok(eligibleRows.length >= 1);
  for (const r of rows) assert.equal(r.combinedN, r.ownN + r.inheritedN - r.overlapN);
});

/* ----------------------------------------------- 5. the identity wall holds */

test('above rank 2 the capacity reading withholds every name and id, counts intact', () => {
  const setup = twoLeadSetup();
  const atManager = read(makeState({ activeSeatId: 'mgr1', ...setup })).conc;
  const atDirector = read(makeState({ activeSeatId: 'dir1', ...setup }), 'dir1').conc;
  const m = atManager.windows[0].coverLoads[0];
  const d = atDirector.windows[0].coverLoads[0];
  assert.equal(atDirector.namesVisible, false);
  assert.equal(d.name, null);
  assert.equal(d.coverId, null);
  assert.equal(d.label, 'Manager');
  assert.equal(d.combinedN, m.combinedN, 'redaction changes no count');
  assert.equal(d.band, m.band);
  assert.equal(atDirector.windows[0].singleCovers[0].capacity.combinedN, m.combinedN);
  const serialized = JSON.stringify(atDirector);
  for (const name of ['Mei Chen', 'Tomas Ito', 'Priya Raman', 'Jordan Lee', 'Ari Klein', 'Samuel Park']) {
    assert.ok(!serialized.includes(name), `the director reading must not carry “${name}”`);
  }
  assert.match(d.reason, /^Manager \(rank 2\)/, 'the reason is built after redaction');
});

/* ------------------------------------------------ 6. derived, never stored */

test('capacity is derived on every read: no stored verdict, reload parity, and it follows the record', () => {
  const state = makeState({ activeSeatId: 'mgr1', ...twoLeadSetup() });
  for (const row of state.absencePlans) {
    for (const banned of ['capacity', 'coverLoad', 'combinedN', 'envelopeN', 'band']) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, banned), false, `the absence row must not store “${banned}”`);
    }
  }
  for (const row of state.dutyCovers) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'capacity'), false);
  }
  const first = read(state).conc;
  const booted = boot(state);
  const reloaded = read(JSON.parse(booted.map.get(STORAGE_KEY))).conc;
  assert.deepEqual(reloaded, first, 'a reload re-derives the identical reading');

  // One more open case in a covered lead's span changes the union and the
  // verdict without any stored capacity field being edited.
  const more = {
    ...state,
    cases: [...state.cases, {
      id: 'case-new', title: 'New blocker', status: 'open', ownerId: 'ic3',
      involvedPersonIds: ['ic3'], openedOn: ago(4), createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(), fmea: { severity: 6 },
    }],
  };
  const after = read(more).conc.windows[0].coverLoads[0];
  const before = first.windows[0].coverLoads[0];
  assert.ok(after.combinedN > before.combinedN, 'the reading follows the open-work record');
  assert.equal(after.combinedN, after.ownN + after.inheritedN - after.overlapN);
});

/* -------------------------------------- 7. report, brief, CSV, five altitudes */

test('the same derived capacity rolls up through report/brief at five altitudes; CSV kinds unchanged', () => {
  const setup = twoLeadSetup();
  const readings = {};
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    const state = makeState({ activeSeatId: seatId, ...setup });
    const report = buildDutyCoverageReport(state, { now: NOW, settings: state.settings });
    const conc = report.absences.concurrency;
    assert.equal(conc.coverLoad.engineVersion, DUTY_COVER_LOAD_ENGINE_VERSION);
    assert.equal(report.bounds.dutyCoverLoadCap, DUTY_COVER_LOAD_LIMITS.coverCap);
    readings[seatId] = { conc, brief: dutyCoverageBriefText(report), csv: dutyCoverageCsvRows(report) };
  }
  assert.equal(readings.lead1.conc.windows.length, 0, 'a rank-1 peer still cannot see a peer’s window');
  assert.ok(readings.lead1.conc.refused);
  for (const seatId of ['mgr1', 'dir1', 'vp1', 'leader']) {
    assert.equal(readings[seatId].conc.windows.length, 1, `${seatId} rolls up the shared window`);
    assert.equal(readings[seatId].conc.windows[0].coverLoads.length, 1, `${seatId} carries the capacity reading`);
    assert.match(readings[seatId].brief, /Cover capacity on the shared dates/);
    // ADR-0126 (Session 172): the branch comparison exists from director rank
    // up; a manager seat has no child branches, so it exports no branch rows.
    const kinds = [...new Set(readings[seatId].csv.map((r) => r.row_kind))].sort();
    const expected = seatId === 'mgr1'
      ? ['absence', 'duty', 'register']
      : ['absence', 'branch', 'branch-summary', 'duty', 'register'];
    assert.deepEqual(kinds, expected, `${seatId} exports the expected row kinds`);
  }
  assert.match(readings.mgr1.brief, /1 would carry more than that peak/);
  assert.ok(!readings.dir1.brief.includes('Mei Chen'), 'the upward brief is identity-free');
  assert.ok(!readings.dir1.brief.includes('Priya Raman'));
  assert.ok(!readings.leader.brief.includes('Mei Chen'));
});

/* --------------------------------- 8. governed decision, event and scan */

test('declaring the overlap puts cover capacity on the governed decision, the event and the scan', () => {
  const first = makeState({
    activeSeatId: 'mgr1',
    absences: [{ seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' }],
    covers: [
      { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
      { seatId: 'lead1', dutyKey: 'clarity', coverId: 'mgr1' },
      // The declaring seat is mgr1 itself, so its own duty lines need covers
      // too: otherwise the new overlap has no available cover to grade.
      { seatId: 'mgr1', dutyKey: 'throughput', coverId: 'dir1' },
      { seatId: 'mgr1', dutyKey: 'coordination', coverId: 'dir1' },
    ],
  });
  const h = boot(first);
  const declared = h.api.dutyAbsenceDeclare({
    from: '2027-07-06', to: '2027-07-10', reason: 'A second lead is out in the same week.',
  });
  assert.ok(declared.ok, declared.error);
  assert.equal(declared.concurrency.windowsN, 1);
  assert.ok(declared.concurrency.coverLoad);
  assert.ok(declared.concurrency.coverLoad.gradedN >= 1, 'the declaration grades at least one available cover');

  const row = h.store.state.absencePlans.find((r) => r.id === declared.id);
  const decision = h.store.state.decisions.find((d) => d.id === row.decisionId);
  assert.ok(decision);
  assert.match(decision.question, /Cover capacity: \d+ available cover\(s\) graded/);
  assert.match(decision.question, /like-for-like revealed envelope/);
  const event = h.store.state.events.find((e) => e.entityId === row.id && /declared/i.test(e.type));
  assert.ok(event);
  assert.match(event.summary, /Cover capacity: \d+ graded/);

  const scan = h.api.dutyAbsenceScan();
  assert.ok(scan.ok, scan.error);
  assert.equal(scan.concurrency.windowsN, 1);
  assert.ok(scan.concurrency.coverLoad);
  assert.equal(scan.concurrency.coverLoad.envelopeN > 0, true);
});

/* --------------------------------------------------------- 9. the view */

test('the plan panel renders the cover-capacity table, axe-clean, named below and withheld above rank 2', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;
  if (!window.axe) window.eval(AXE_SRC);

  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();

  const render = async (seatId) => {
    const { api } = boot(makeState({ activeSeatId: seatId, ...twoLeadSetup() }));
    const ctx = { api, query: new URLSearchParams('panel=plan'), navigate: () => {}, refresh: () => {} };
    view.replaceChildren(renderDutyCover(ctx));
    assert.match(view.textContent, /Cover capacity on the shared dates/);
    assert.match(view.textContent, /Covers past observed load/);
    assert.ok(!/undefined|\[object Object\]/.test(view.textContent), 'no placeholder leaked into the DOM');
    for (const el of view.querySelectorAll('button, a[href]')) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim();
      assert.ok(name.length > 0, `an unnamed ${el.tagName} control would fail a screen-reader user`);
    }
    const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `axe violations at ${seatId}`);
    return view.textContent;
  };

  const managerText = await render('mgr1');
  assert.match(managerText, /Mei Chen/);
  assert.match(managerText, /counted once, not twice/);
  const directorText = await render('dir1');
  assert.ok(!directorText.includes('Mei Chen'), 'above the manager altitude the cover is not named');
  assert.ok(!directorText.includes('Priya Raman'));
  assert.match(directorText, /past observed load|capacity refused/);
  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});
