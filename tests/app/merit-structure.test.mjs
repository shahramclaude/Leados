/**
 * tests/app/merit-structure.test.mjs — As-Of Home-Line Authority & Frozen
 * Structure (ADR-0155, Schema v128 unchanged, `#/merit?panel=matrix`, CSV #116).
 *
 * Organised around what an as-of pay-authority reading can be betrayed by:
 *
 *  1. THE DAY, NOT TODAY. A home line that moved after the money landed must not
 *     be credited with a decision it never saw, and a line that moved TO the
 *     person later must not be erased from the earlier period.
 *  2. NEVER PROJECT. A day the ledger covers for nobody is not "probably like
 *     today": the authority is `unknown`, the row is excluded, the medians and
 *     the gap are withheld, and `figuresComplete` refuses.
 *  3. PRESUMPTION IS PRINTED. A workspace with no recorded history reads exactly
 *     as it did before ADR-0155 and says on every surface that today's pointer is
 *     a presumption.
 *  4. FREEZE BESIDE THE MONEY. Finalising stores the effective-date structure in
 *     the same transaction as the money; a later move produces `drifted`, never a
 *     rewritten record.
 *  5. DISPLAY == STORED. Every printed figure equals the recomputed blob, before
 *     and after a real reload, and no read mutates or bumps a revision.
 *  6. NO IDENTITY IN THE EXPORT. The CSV carries counts and states, never a
 *     manager id or a person id.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildMeritParity, meritParityBriefText, meritParityCsvRows, MERIT_PARITY_CSV_COLUMNS, MERIT_PARITY_EXPORT_COLUMNS } from '../../app/core/domain/meritParity.js';
import {
  buildFrozenStructure,
  buildMeritStructure,
  compareFrozenStructure,
  meritStructureBriefLines,
} from '../../app/core/domain/meritStructure.js';
import { MERIT_STRUCTURE_STATES, MERIT_STRUCTURE_FREEZE_VERDICTS } from '../../app/core/domain/meritStructureRegistry.js';
import { COMP_SNAPSHOT_VERSION, buildFairnessSnapshot, normalizeFairnessSnapshot } from '../../app/core/domain/compSchema.js';
import { fairnessReading } from '../../app/core/domain/comp.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const ISO = NOW.toISOString();
const TODAY = '2026-11-09';
const EFFECTIVE = '2026-11-15';

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ priya
 *       ├─ sam      (home line dana; project line to priya)
 *       └─ lee / mo / kim / ana / zoe
 *
 * The effective date is 2026-11-15. Sam's home line is recorded as dana from
 * 2026-09-01 to 2026-12-31, and the roster's today pointer is ALSO dana, so the
 * default workspace changes nothing. The interesting cases move one or the other.
 */
function person(id, name, level, managerId = 'dana') {
  return {
    id, name, role: 'Engineer', level, managerId, status: 'active',
    startDate: '2024-01-01', createdAt: ISO,
  };
}

function roster(over = {}) {
  return [
    person('dana', 'Dana Eng', 'director', null),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead'),
    person('lee', 'Lee Engineer', 'lead'),
    person('mo', 'Mo Engineer', 'lead'),
    person('kim', 'Kim Engineer', 'lead'),
    person('ana', 'Ana Engineer', 'lead'),
    person('zoe', 'Zoe Engineer', 'lead'),
  ].map((p) => (over[p.id] ? { ...p, ...over[p.id] } : p));
}

function line(personId, over = {}) {
  return {
    id: `line-${personId}-priya`,
    personId,
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: null,
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

const projectLines = (over = {}) => ['sam', 'lee', 'mo'].map((id) => line(id, over));

function payRow(personId, currentPay, proposedPay, over = {}) {
  return { personId, level: 'lead', currentPay, proposedPay, origin: 'internal', retentionConcern: false, note: '', ...over };
}

/** Three matrix leads at +2%, three home-line leads at +4%: a −200 bp gap. */
function defaultRows() {
  return [
    payRow('sam', 100000, 102000),
    payRow('lee', 100000, 102000),
    payRow('mo', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
}

function cycle(rows, over = {}) {
  return {
    id: 'merit-1',
    label: 'FY26 merit',
    currency: 'USD',
    effectiveOn: EFFECTIVE,
    status: 'draft',
    budget: { kind: 'amount', value: 60000 },
    comparison: { dimension: 'origin' },
    ownerId: null,
    rows,
    audit: null,
    outcomes: [],
    history: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

/** One recorded home-line period for a person. */
function period(personId, managerId, fromISO, toISO = null, over = {}) {
  return {
    id: `str-${personId}-${fromISO}`,
    personId,
    managerId,
    fromISO,
    toISO,
    recordedOn: fromISO,
    recordedBySeatId: null,
    source: 'moved',
    reason: 'Structural baseline recorded for the audit.',
    at: `${fromISO}T00:00:00.000Z`,
    ...over,
  };
}

/**
 * Every person recorded as reporting to `dana` from 2026-09-01 — a workspace
 * whose ledger covers the roster. `overrides` replaces individual records.
 */
function fullHistory(overrides = {}) {
  const out = roster().map((p) => {
    const manager = p.managerId || 'leader';
    return period(p.id, manager, '2026-09-01');
  });
  for (const row of Object.values(overrides)) {
    if (row === null) continue;
    const idx = out.findIndex((r) => r.personId === row.personId && r.fromISO === row.fromISO);
    if (idx >= 0) out[idx] = row;
    else out.push(row);
  }
  return out.filter(Boolean);
}

function makeState({ people = roster(), lines = projectLines(), rows = defaultRows(), history = null, cycleOver = {} } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.structureHistory = history === null ? [] : history;
  state.meritCycles = [cycle(rows, cycleOver)];
  return normalizeState(state).state;
}

const reportFor = (state, over = {}) => buildMeritParity(state, { now: NOW, settings: state.settings, ...over });
const structureFor = (state, over = {}) => buildMeritStructure(state, { asOf: EFFECTIVE, now: NOW, settings: state.settings, ...over });

function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

/* ---------------------------------------------- 1. the day, not today's chart */

test('a home line that moved AFTER the effective date is read as it stood on that day', () => {
  // Sam's home line was dana on 2026-11-15 (recorded), and moved to priya from
  // 2026-12-01. Today's roster points at priya. The November pay decision was
  // Dana's.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-11-30'),
    extra: period('sam', 'priya', '2026-12-01', null, { recordedOn: '2026-12-01', id: 'str-sam-dec' }),
  });
  const state = makeState({ people, history });
  const r = reportFor(state);

  assert.equal(r.structure.asOf, EFFECTIVE);
  assert.equal(r.totals.supersededHomeN, 1, 'one home line the record has since superseded');
  const sam = r.structure.superseded[0];
  assert.equal(sam.personId, 'sam');
  assert.equal(sam.managerId, 'dana', 'the recorded home line for that day');
  assert.equal(sam.managerName, 'Dana Eng', 'the recorded manager for that day, not today’s Priya');
  assert.equal(sam.currentManagerId, 'priya', 'today’s pointer is carried separately and never substituted');
  const row = r.rows.find((x) => x.personId === 'sam');
  assert.equal(row.homeManagerName, 'Dana Eng');
  assert.equal(row.homeState, 'observed');
  assert.equal(row.homeSuperseded, true);
  assert.equal(row.homeCurrentManagerName, 'Priya PM', 'both managers are printed, never one instead of the other');
  assert.ok(r.findings.some((f) => f.kind === 'home-line-superseded' && f.personId === 'sam'));
  assert.match(meritParityBriefText(state, { now: NOW }), /home line\(s\) differ from today’s roster/);
});

test('a home line that moved BEFORE the effective date is already the new manager', () => {
  // Sam moved to priya on 2026-10-01, before the money lands. The November
  // decision is Priya's, and today's roster agrees.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-09-30'),
    extra: period('sam', 'priya', '2026-10-01', null, { recordedOn: '2026-10-01', id: 'str-sam-oct' }),
  });
  const r = reportFor(makeState({ people, history }));
  const row = r.rows.find((x) => x.personId === 'sam');
  assert.equal(row.homeManagerName, 'Priya PM');
  assert.equal(row.homeSuperseded, false, 'the record and today agree about this day');
});

/* ------------------------------------------------------------- 2. never project */

test('a home line the record does not cover on that day is UNKNOWN, excluded and withheld', () => {
  // The ledger has Sam's history from 2026-02-01 to 2026-03-31 only. The
  // effective date is 2026-11-15: nothing covers it.
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-02-01', '2026-03-31'),
  });
  const private1 = period('lee', 'priya', '2026-02-01', '2026-03-31');
  void private1;
  const state = makeState({ history });
  // Force the unrecorded case for exactly one person so the rest of the pool
  // stays readable: every other person's period is still open from 09-01.
  const stripped = { ...state, structureHistory: state.structureHistory.map((row) => (row.personId === 'sam' ? { ...row, fromISO: '2026-02-01', toISO: '2026-03-31', recordedOn: '2026-02-01' } : row)) };
  const r = reportFor(stripped);

  assert.equal(r.structure.unrecordedN, 1);
  assert.equal(r.structure.readable, false);
  const sam = r.rows.find((x) => x.personId === 'sam');
  assert.equal(sam.homeState, 'unrecorded');
  assert.equal(sam.homeManagerName, null, 'no manager is invented from today’s roster');
  assert.equal(sam.included, false);
  assert.equal(sam.excludeReason, 'unrecorded-home-line');
  assert.equal(sam.authorityState, 'unknown', 'never `unowned` and never cleared from today');
  assert.equal(r.totals.unrecordedHomeN, 1);
  assert.ok(r.refusals.some((x) => x.kind === 'unrecorded-home-line'));
  assert.ok(r.findings.some((f) => f.kind === 'unrecorded-home-line'));
  assert.equal(r.gapBps, null, 'an unreadable home line withholds the whole comparison');
  assert.equal(r.figuresComplete, false);
  assert.match(r.gapReason, /home line|structure/i);
  assert.match(r.authorityDetail, /never|UNKNOWN/i);
});

test('a future effective date reads as PROJECTED, never as observed', () => {
  const history = fullHistory();
  const state = makeState({ history });
  const st = buildMeritStructure(state, { asOf: '2027-06-01', now: NOW, settings: state.settings });
  assert.equal(st.isFuture, true);
  assert.equal(st.observedN, 0, 'nothing about an open line reaching a day that has not happened is observed');
  assert.equal(st.projectedN, st.rowN);
  assert.ok(st.refusals.some((x) => x.kind === 'projected-home-line'));
  const r = buildMeritParity({ ...state, meritCycles: [{ ...state.meritCycles[0], effectiveOn: '2027-06-01' }] }, { now: NOW, settings: state.settings });
  assert.equal(r.structure.projectedN, r.structure.rowN);
  assert.match(r.structure.refusals.find((x) => x.kind === 'projected-home-line').detail, /has not happened yet/);
});

/* ------------------------------------------------- 3. presumption is printed */

test('a workspace with no recorded history is INERT and prints the presumption', () => {
  const state = makeState({ history: [] });
  const r = reportFor(state);
  assert.equal(r.structure.hasLedger, false);
  assert.equal(r.structure.presumedN, r.structure.rowN);
  assert.equal(r.structure.observedN, 0);
  assert.equal(r.structure.supersededN, 0);
  assert.equal(r.structure.reconciles, true);
  assert.equal(r.totals.unrecordedHomeN, 0);
  // Byte-identical to the pre-ADR-0155 reading: the pool arithmetic is untouched.
  assert.equal(r.verdict, 'divergent');
  assert.equal(r.gapBps, -200);
  assert.equal(r.figuresComplete, true, 'a presumption is a printed convention, not an incompleteness');
  assert.ok(r.structure.refusals.some((x) => x.kind === 'presumed-home-line'));
  assert.match(r.structure.refusals.find((x) => x.kind === 'presumed-home-line').detail, /PRESUMPTION/);
  // The states reconcile to the roster exactly.
  const st = structureFor(state);
  assert.equal(st.observedN + st.projectedN + st.presumedN + st.unrecordedN + st.notOnRosterN, st.rowN);
});

test('a person who had not started yet is a FIFTH fact, not an unreadable line', () => {
  const people = roster({ sam: { startDate: '2026-12-01' } });
  const history = fullHistory();
  const st = buildMeritStructure(makeState({ people, history }), { asOf: EFFECTIVE, now: NOW, settings: null });
  assert.equal(st.notOnRosterN, 1);
  assert.equal(st.unrecordedN, 0, 'a future start is knowledge, not ignorance');
  assert.equal(st.readable, true);
});

/* ------------------------------------------------------- 4. freeze beside money */

test('finalising freezes the effective-date structure beside the money', () => {
  const state = makeState({ history: fullHistory() });
  const ctx = seed(state);
  const res = ctx.api.finalizeMeritCycle('merit-1');
  assert.equal(res.ok, true, res.error);
  const stored = ctx.store.state.meritCycles.find((c) => c.id === 'merit-1');
  assert.equal(stored.status, 'finalized');
  assert.ok(stored.audit.structure, 'the structure block is frozen');
  assert.equal(COMP_SNAPSHOT_VERSION, 2, 'the frozen-snapshot contract was bumped additively');
  assert.equal(stored.audit.structure.asOf, EFFECTIVE);
  assert.equal(stored.audit.structure.capturedOn, TODAY);
  // Every recorded period in this fixture is OPEN from 2026-09-01 and the
  // effective date has not happened yet, so reaching it is a PROJECTION — a
  // presumption that the current line continues, counted as such and never
  // frozen as an observation.
  assert.equal(stored.audit.structure.observedN, 0, 'no future day is frozen as observed');
  assert.equal(stored.audit.structure.projectedN, stored.audit.structure.rowN);
  assert.equal(stored.audit.structure.rows.length, stored.audit.structure.rowN);
  const sam = stored.audit.structure.rows.find((row) => row.personId === 'sam');
  assert.equal(sam.managerId, 'dana');
  assert.equal(sam.state, 'projected');
  // The frozen pool figures are the live reading's figures at that moment.
  const live = reportFor(ctx.store.state);
  assert.equal(stored.audit.structure.pool.gapBps, live.gapBps);
  assert.equal(stored.audit.structure.pool.authorityVerdict, live.authorityVerdict);
  assert.equal(stored.audit.structure.pool.rowsN, live.totals.rowsN);

  // A finalised cycle reads `identical` against its own frozen block.
  const after = ctx.api.meritParityReport().report;
  assert.equal(after.frozen.key, 'identical');
  assert.equal(after.frozen.compared, true);
  assert.equal(after.frozen.differenceN, 0);
});

test('a home-line move after finalisation reads DRIFTED — the frozen record is not rewritten', () => {
  const ctx = seed(makeState({ history: fullHistory() }));
  assert.equal(ctx.api.finalizeMeritCycle('merit-1').ok, true);
  const frozenBefore = JSON.parse(JSON.stringify(ctx.store.state.meritCycles[0].audit.structure));

  // The reorganisation: Sam's recorded home line closes on 2026-10-01 and a new
  // one to priya opens, so the November reading now says priya — not dana.
  ctx.store.update((draft) => {
    const rows = draft.structureHistory || [];
    const sam = rows.find((r) => r.personId === 'sam' && r.toISO === null);
    if (sam) sam.toISO = '2026-10-01';
    draft.structureHistory = [...rows, {
      id: 'str-sam-priya', personId: 'sam', managerId: 'priya', fromISO: '2026-10-02',
      toISO: null, recordedOn: '2026-10-02', recordedBySeatId: null, source: 'moved',
      reason: 'Moved to the migration programme.', at: '2026-10-02T00:00:00.000Z',
    }];
  }, { type: 'test.move', entity: 'person', entityId: 'sam', summary: 'Test re-organisation' });

  const after = ctx.api.meritParityReport().report;
  assert.equal(after.frozen.key, 'drifted');
  assert.ok(after.frozen.differenceN > 0);
  const moved = after.frozen.differences.find((d) => d.kind === 'home-line-changed' && d.personId === 'sam');
  assert.ok(moved, 'the changed home line is named');
  assert.equal(moved.frozenManagerId, 'dana');
  assert.equal(moved.liveManagerId, 'priya');
  // The frozen record is untouched.
  const frozenAfter = ctx.store.state.meritCycles[0].audit.structure;
  assert.deepEqual(
    { asOf: frozenAfter.asOf, rows: frozenBefore.rows },
    { asOf: frozenBefore.asOf, rows: frozenBefore.rows },
  );
  assert.equal(frozenAfter.rows.find((r) => r.personId === 'sam').managerId, 'dana');
});

test('a snapshot that predates the freeze reads `not-frozen`, never a confirming blank', () => {
  const v1 = normalizeFairnessSnapshot({ version: 1, on: '2026-01-01', rowCount: 2, integrity: { rows: 2 } });
  assert.ok(v1, 'a v1 snapshot still loads');
  assert.equal(v1.structure, null);
  const cmp = compareFrozenStructure(v1.structure, structureFor(makeState({ history: fullHistory() })));
  assert.equal(cmp.key, 'not-frozen');
  assert.equal(cmp.compared, false);
  assert.match(cmp.detail, /absence, not a match/);
  // An unreadable block is `unreadable`, and a failed comparison never agrees.
  assert.equal(normalizeFairnessSnapshot({ structure: { asOf: 'not-a-day', rows: 'nope' } }).structure.rows.length, 0);
  assert.equal(compareFrozenStructure({ version: 1, rows: 'nope' }, structureFor(makeState({ history: fullHistory() }))).key, 'unreadable');
});

test('a frozen structure row that cannot be read is dropped and counted, never repaired', () => {
  const snap = normalizeFairnessSnapshot({
    version: 2,
    on: TODAY,
    structure: {
      asOf: EFFECTIVE,
      capturedOn: TODAY,
      observedN: 3,
      rows: [
        { personId: 'sam', state: 'observed', managerId: 'dana' },
        { personId: '', state: 'observed', managerId: 'dana' },
        { personId: 'lee', state: 'made-up-state', managerId: 'dana' },
        { personId: 'mo', state: 'unrecorded', managerId: null },
      ],
    },
  });
  assert.equal(snap.structure.rows.length, 2);
  assert.equal(snap.structure.rowsDroppedN, 2, 'the unreadable rows are counted, not dropped silently');
  assert.equal(snap.structure.asOf, EFFECTIVE);
});

/* ------------------------------------------------------------ 5. display == stored */

test('every printed structure figure equals the recomputed blob across a real reload, and reads mutate nothing', () => {
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-11-30'),
    extra: period('sam', 'priya', '2026-12-01', null, { recordedOn: '2026-12-01', id: 'str-sam-dec' }),
  });
  const ctx = seed(makeState({ people, history }));
  const before = ctx.storage.getItem(STORAGE_KEY);
  const revision = ctx.store.state.meta.revision;

  const a = ctx.api.meritParityReport().report;
  const b = ctx.api.meritParityReport().report;
  assert.deepEqual(a.structure, b.structure, 'two reads of an unchanged workspace are identical');
  assert.equal(ctx.storage.getItem(STORAGE_KEY), before, 'reading mutates nothing');
  assert.equal(ctx.store.state.meta.revision, revision, 'and bumps no revision');

  const recomputed = reportFor(ctx.store.state);
  assert.deepEqual(a.structure, recomputed.structure);
  assert.deepEqual(a.totals, recomputed.totals);
  assert.equal(a.frozen.key, recomputed.frozen.key);
  assert.equal(a.structure.reconciles, true);

  // The CSV cells equal the report fields, cell for cell.
  const csv = ctx.api.meritParityCsv().rows;
  assert.deepEqual(csv, meritParityCsvRows(ctx.store.state, { now: NOW }));
  const summary = csv[0];
  assert.equal(summary.structure_as_of, EFFECTIVE);
  assert.equal(summary.structure_observed_n, String(a.totals.observedHomeN));
  assert.equal(summary.structure_presumed_n, String(a.totals.presumedHomeN));
  assert.equal(summary.structure_unrecorded_n, String(a.totals.unrecordedHomeN));
  assert.equal(summary.structure_superseded_n, String(a.totals.supersededHomeN));
  assert.equal(summary.structure_reconciles, 'yes');
  assert.equal(summary.frozen_structure_status, a.frozen.key);

  // After a real reload the same figures come back.
  const reloaded = createStore({ storage: ctx.storage, now: () => NOW });
  reloaded.load();
  assert.deepEqual(reportFor(reloaded.state).structure, a.structure);
  assert.equal(ctx.storage.getItem(STORAGE_KEY), before);
});

/* --------------------------------------------------------- 6. no identity in export */

test('CSV #116 carries the structure counts and no manager or person identity', () => {
  // ADR-0156 added scope #117 (the authority continuity register), so the
  // registered total moved from 115 to 116. The pin states the total
  // deliberately so the next session cannot drift the count silently.
  assert.equal(CSV_EXPORTS.length, 141, 'ADR-0185 brings the register to 139 scopes (#75 stays reserved)');
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-11-30'),
    extra: period('sam', 'priya', '2026-12-01', null, { recordedOn: '2026-12-01', id: 'str-sam-dec' }),
  });
  const ctx = seed(makeState({ people, history }));
  ctx.api.finalizeMeritCycle('merit-1');
  const rows = ctx.api.meritParityCsv().rows;
  for (const row of rows) {
    // ADR-0166 appends the evidence columns; the existing header is a prefix.
    assert.deepEqual(Object.keys(row), [...MERIT_PARITY_EXPORT_COLUMNS], 'exact column parity');
    const cell = JSON.stringify(row);
    for (const name of ['Sam', 'Lee', 'Mo', 'Kim', 'Ana', 'Zoe', 'Dana', 'Priya']) {
      assert.equal(cell.includes(name), false, `no person or manager identity (${name})`);
    }
    assert.equal(/dana|priya|person-/.test(cell), false, 'no manager id or person id');
  }
  const exported = exportWorkspaceCsv(ctx.store.state, 'merit-matrix-parity', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...MERIT_PARITY_EXPORT_COLUMNS]);
  assert.equal(parsed.rows.length, rows.length);
});

/* ---------------------------------------------------------------- 7. vocabulary */

test('the declared vocabulary is closed and the states reconcile by construction', () => {
  assert.deepEqual(MERIT_STRUCTURE_STATES.map((s) => s.key), ['unrecorded', 'presumed-current', 'projected', 'observed']);
  assert.deepEqual(MERIT_STRUCTURE_FREEZE_VERDICTS.map((v) => v.key), ['not-frozen', 'unreadable', 'drifted', 'identical']);
  assert.equal(MERIT_STRUCTURE_STATES[0].rank < MERIT_STRUCTURE_STATES[3].rank, true, 'unrecorded is worse than observed');
  assert.equal(MERIT_STRUCTURE_STATES.find((s) => s.key === 'unrecorded').blocks, true);
  assert.equal(MERIT_STRUCTURE_STATES.find((s) => s.key === 'presumed-current').blocks, false);
  assert.equal(SCHEMA_VERSION, 149);

  const st = structureFor(makeState({ history: fullHistory() }));
  const detail = st.reconcilesDetail;
  const sum = st.observedN + st.projectedN + st.presumedN + st.unrecordedN + st.notOnRosterN;
  assert.equal(st.rowN, sum, 'the states sum to the roster');
  // The fixture's periods are open from 2026-09-01 and the effective date is
  // after the clock, so every row reads `projected` — and the sentence says so.
  assert.match(detail, /^0 observed \+ 8 projected \+ 0 presumed \+ 0 unrecorded \+ 0 not on roster = 8 roster row\(s\)\.$/);
});

test('no cycle prints a printed absence, never a presumed structure', () => {
  const empty = normalizeState(createEmptyState(ISO)).state;
  const r = buildMeritParity(empty, { now: NOW });
  assert.equal(r.hasCycle, false);
  assert.equal(r.structure, null);
  assert.equal(r.frozen, null);
  assert.equal(r.totals.observedHomeN, 0);
  assert.equal(meritParityCsvRows(empty, { now: NOW }).length, 0);
  assert.match(meritStructureBriefLines(null, null)[0], /not readable/);
});

/* ------------------------------------------------------------------ 8. panel */

test('the panel prints the as-of structure, the supersession and the withheld authority', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    t.skip('jsdom is not installed in this environment; the render pass is unverified here');
    return;
  }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderMeritMatrixTab } = await import('../../app/views/meritMatrixPanel.js');

  // A workspace the record has superseded: Sam's home line was dana, today priya.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-11-30'),
    extra: period('sam', 'priya', '2026-12-01', null, { recordedOn: '2026-12-01', id: 'str-sam-dec' }),
  });
  const ctx = seed(makeState({ people, history }));
  const report = ctx.api.meritParityReport().report;
  const node = renderMeritMatrixTab({ api: ctx.api, state: ctx.store.state }, ctx.store.state.meritCycles[0], NOW);
  const text = node.textContent;
  assert.match(text, new RegExp(`Structure on ${EFFECTIVE}`));
  assert.match(text, /Dana Eng/, 'the recorded manager for that day is printed');
  assert.match(text, /Priya PM/, 'and today’s roster is printed beside it, not instead of it');
  assert.match(text, /Home lines the record has superseded/);
  assert.match(text, /No structure frozen with this cycle/);
  assert.match(text, /Frozen beside this decision/);
  assert.ok(text.includes(report.structure.reconcilesDetail), 'the reconciliation sentence is the computed one');

  // Every rendered state count equals the computed count.
  for (const state of MERIT_STRUCTURE_STATES) {
    const expected = report.structure.stateCounts?.[state.key] ?? 0;
    assert.equal(structureFor(ctx.store.state).stateCounts[state.key] ?? 0, expected);
  }

  // An unrecorded workspace prints `withheld` on the gap rather than a number.
  const stripped = makeState({ history: fullHistory() });
  const unrecorded = { ...stripped, structureHistory: stripped.structureHistory.map((row) => (row.personId === 'sam' ? { ...row, fromISO: '2026-02-01', toISO: '2026-03-31', recordedOn: '2026-02-01' } : row)) };
  const ctx2 = seed(unrecorded);
  const node2 = renderMeritMatrixTab({ api: ctx2.api, state: ctx2.store.state }, ctx2.store.state.meritCycles[0], NOW);
  const text2 = node2.textContent;
  assert.match(text2, /unrecorded/);
  assert.match(text2, /never projected backwards from today/);
  const gapCell = [...node2.querySelectorAll('.stat')].find((n) => n.textContent.includes('Gap (unadjusted)'));
  assert.ok(gapCell);
  assert.match(gapCell.textContent, /withheld/);
  assert.doesNotMatch(text2, /−2\.00%/);
});

/* --------------------------------------------------------- 9. the audit carry */

test('the frozen structure is preserved verbatim by normalizeState and survives a reload', () => {
  const ctx = seed(makeState({ history: fullHistory() }));
  assert.equal(ctx.api.finalizeMeritCycle('merit-1').ok, true);
  const frozen = ctx.store.state.meritCycles[0].audit.structure;
  const reloaded = createStore({ storage: ctx.storage, now: () => NOW });
  reloaded.load();
  assert.deepEqual(reloaded.state.meritCycles[0].audit.structure, frozen, 'the frozen block is byte-identical after reload');
  // A snapshot built without a structure freezes `null`, not a confirmation.
  const state = makeState({ history: [] });
  const reading = fairnessReading(state, state.meritCycles[0], NOW);
  const snap = buildFairnessSnapshot(reading, { capturedAt: ISO });
  assert.equal(snap.structure, null);
  const live = structureFor(state);
  assert.equal(compareFrozenStructure(snap.structure, live).key, 'not-frozen');
});

test('the frozen structure block is built from the live reading, not from a second derivation', () => {
  const state = makeState({ history: fullHistory() });
  const st = structureFor(state);
  const parity = reportFor(state);
  const frozen = buildFrozenStructure(st, parity);
  assert.equal(frozen.asOf, EFFECTIVE);
  assert.equal(frozen.rowN, st.rowN);
  assert.equal(frozen.rows.length, st.rowN);
  assert.equal(frozen.pool.gapBps, parity.gapBps);
  assert.equal(frozen.pool.parityVerdict, parity.verdict);
  assert.equal(frozen.pool.contestedN, parity.totals.contestedN);
  // The block survives its own normalizer round-trip unchanged.
  const round = normalizeFairnessSnapshot({ structure: frozen }).structure;
  assert.deepEqual(round.rows, frozen.rows);
  assert.equal(round.observedN, frozen.observedN);
  assert.equal(round.rowsDroppedN, 0);
});
