/**
 * tests/app/line-exit.test.mjs — the Matrix Line-Exit Obligation Register
 * (Schema v127, ADR-0152, `#/matrix?panel=exit`, `RULE-LEX-01`, CSV #114).
 *
 * Organised around what a dated-out line can betray:
 *
 *  1. NEVER SETTLE BY SILENCE. An obligation left by an ended line reads `open`
 *     with its age printed. A line ending is not an answer, and a retired
 *     obligation is never deleted — the remedy row is the record.
 *  2. NEVER RE-POINT. A carry must name a manager who holds a LIVE line for the
 *     person today; the person, the ended-line manager (with no live line) and a
 *     stranger are all refused by the live API.
 *  3. NEVER VOID BY ARITHMETIC. A work window entirely outside the line is
 *     FLAGGED (`after`), never retired automatically — and an obligation that
 *     carries no dated window reads `unknown`, not the reassuring answer.
 *  4. NEVER INVENT AN END. A line key that resolves to nothing reads
 *     `vanished`: printed, counted, never settled, and never issued work.
 *  5. DISPLAY == STORED. Every figure is recomputed from the stored blob before
 *     and after a real reload, and a read mutates nothing.
 *  6. INERT SINGLE CHAIN. A workspace with no ended line gains no row, no ask,
 *     no delegation and byte-identical state.
 *  7. THE HOME LINE IS HANDED OVER, NOT ADJUDICATED.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildLineExitReport,
  lineExitAttentionCount,
  lineExitBriefText,
  lineExitCsvRows,
} from '../../app/core/domain/lineExit.js';
import { LINE_EXIT_CSV_COLUMNS, LINE_EXIT_RULE_ID } from '../../app/core/domain/lineExitRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const TODAY = '2026-11-09';
const ISO = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ priya ── kim
 *       └─ sam          sam's home line is dana; her PROJECT line to priya
 *                       ran 2026-09-01 → 2026-10-31 and is now dated out.
 */
function roster() {
  return [
    { id: 'dana', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'priya', name: 'Priya PM', role: 'Head of Delivery', level: 'manager', managerId: 'dana', status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'priya', status: 'active', startDate: '2026-09-01', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'lead', managerId: 'dana', status: 'active', startDate: '2026-09-01', createdAt: ISO },
  ];
}

function endedLine(over = {}) {
  return {
    id: 'line-sam-priya',
    personId: 'sam',
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: '2026-10-31',
    status: 'ended',
    endedAt: '2026-10-31T09:00:00.000Z',
    endReason: 'Project closed at the end of October.',
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: '',
    ...over,
  };
}

function plan(over = {}) {
  return {
    id: 'ob-1',
    personId: 'sam',
    kind: 'new-hire',
    label: '',
    startDate: '2026-09-01',
    buddyId: 'kim',
    buddyName: '',
    roleClarity: 'Owns the billing service.',
    earlyWin: 'Ship the invoice retry fix.',
    stakeholders: [],
    checkpoints: [],
    reviews: {},
    status: 'active',
    completedOn: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function brief(over = {}) {
  return {
    id: 'obf-1',
    planId: 'ob-1',
    personId: 'sam',
    lineKey: 'line-sam-priya',
    lineRole: 'secondary',
    lineKind: 'project',
    managerId: 'priya',
    outcome: 'brief',
    declaredOn: '2026-09-02',
    declaredBySeatId: null,
    declaredSource: 'manager',
    scope: 'Own the migration cutover and mentor Kim on it.',
    firstWork: 'Write the cutover runbook.',
    stakeholders: ['Dana Eng'],
    reason: '',
    acknowledgedOn: null,
    acknowledgedBySeatId: null,
    acknowledgementSource: 'person',
    acknowledgement: '',
    ...over,
  };
}

function review(over = {}) {
  return {
    id: 'rev-1',
    personId: 'sam',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    status: 'completed',
    stewardship: {
      requests: [{
        id: 'rq-1',
        lineKey: 'line-sam-priya',
        lineRole: 'secondary',
        lineKind: 'project',
        managerId: 'priya',
        askedOn: '2026-09-20',
        askedBySeatId: null,
        dueOn: '2026-09-27',
        note: '',
      }],
      answers: [],
    },
    ...over,
  };
}

function makeState({
  people = roster(),
  lines = [endedLine()],
  plans = [plan()],
  briefs = [brief()],
  reviews = [review()],
  remedies = [],
  structureHistory = [],
} = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.onboarding = plans;
  state.onboardingLineBriefs = briefs;
  state.reviews = reviews;
  state.lineExitRemedies = remedies;
  state.structureHistory = structureHistory;
  return normalizeState(state).state;
}

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
  return { store, api: createApi(store, { now: () => NOW, idFactory }), data, storage };
}

/** Reload through the real storage contract: the only proof that display == stored. */
function reload(ctx) {
  let seq = 1000;
  const idFactory = (p) => `${p}-reload-${++seq}`;
  const store = createStore({ storage: ctx.storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const report = (state) => buildLineExitReport(state, { now: NOW, settings: state.settings });

/* ------------------------------------------------------------- the register */

test('an ended line hands back every open obligation it left, with the age and the window printed', () => {
  const state = makeState();
  const r = report(state);

  assert.equal(r.verdict, 'orphaned');
  assert.equal(r.lines.length, 1);
  const line = r.lines[0];
  assert.equal(line.personName, 'Sam Engineer');
  assert.equal(line.managerName, 'Priya PM');
  assert.equal(line.endedOn, '2026-10-31');
  assert.equal(line.verdict, 'open-obligation');
  assert.equal(line.verifiable, true);
  assert.equal(line.counts.obligationsN, 2);
  assert.equal(line.counts.openN, 2);

  const ob = line.obligations.find((row) => row.source === 'onboarding-brief');
  assert.ok(ob, 'the unacknowledged line brief is an obligation');
  assert.equal(ob.askedOn, '2026-09-02');
  assert.equal(ob.daysOpen, 68, 'whole days since it was asked');
  assert.equal(ob.state, 'open');
  assert.equal(ob.windowVerdict, 'overlaps', 'the 90-day horizon met the line’s life');
  assert.equal(ob.overdue, false, 'a brief carries no due day on the record, so it is never invented');

  const rev = line.obligations.find((row) => row.source === 'review-input');
  assert.ok(rev, 'the unanswered review ask is an obligation');
  assert.equal(rev.dueOn, '2026-09-27');
  assert.equal(rev.overdue, true);
  assert.equal(rev.overdueDays, 43);

  // Every total is the sum of the printed rows.
  assert.equal(r.board.obligationsN, 2);
  assert.equal(r.board.openN + r.board.retiredN + r.board.carriedN, r.board.obligationsN);
  assert.equal(r.board.stateSum, r.board.obligationsN);
  assert.equal(lineExitAttentionCount(state, { now: NOW }), 2);
});

test('an obligation a human or a line already ANSWERED is not an obligation', () => {
  const answered = makeState({
    briefs: [brief({ acknowledgedOn: '2026-09-05', acknowledgement: 'Read it.' })],
    reviews: [review({
      stewardship: {
        requests: review().stewardship.requests,
        answers: [{ id: 'an-1', lineKey: 'line-sam-priya', outcome: 'declined', answeredOn: '2026-09-22', reason: 'Nothing to add from this line.' }],
      },
    })],
  });
  const r = report(answered);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].counts.obligationsN, 0);
  assert.equal(r.lines[0].verdict, 'no-obligation');
  assert.equal(r.board.openN, 0);
  assert.equal(r.verdict, 'clear');
});

test('a line that has not ended is not an exit, and a future line is never one either', () => {
  const live = makeState({ lines: [endedLine({ toISO: null, status: 'active', endedAt: null, endReason: '' })] });
  const rLive = report(live);
  assert.equal(rLive.lines.length, 0, 'a live line is read by the register that owns it');
  assert.equal(rLive.verdict, 'single-chain');

  const future = makeState({ lines: [endedLine({ fromISO: '2026-12-01', toISO: '2027-03-01', status: 'active', endedAt: null, endReason: '' })] });
  assert.equal(report(future).lines.length, 0, 'a line that has not started cannot have ended');
});

test('a work window entirely outside the line is FLAGGED, never retired automatically', () => {
  const state = makeState({
    lines: [endedLine({ fromISO: '2026-09-01', toISO: '2026-09-30', endedAt: '2026-09-30T09:00:00.000Z' })],
    plans: [plan({ startDate: '2026-11-15' })],
    briefs: [brief({ declaredOn: '2026-10-05' })],
    reviews: [],
  });
  const r = report(state);
  const ob = r.lines[0].obligations[0];
  assert.equal(ob.windowVerdict, 'after');
  assert.equal(ob.state, 'open', 'the register does not decide that the ask was unnecessary');
  assert.equal(r.board.afterWindowN, 1);
  assert.equal(r.board.openN, 1);
  assert.match(lineExitBriefText(state, { now: NOW }), /FLAGGED for retirement, never retired automatically/);
});

test('an obligation with no dated window reads unknown, not the reassuring answer', () => {
  const state = makeState({
    briefs: [brief({ declaredOn: '2026-09-02' })],
    plans: [plan({ startDate: null })],  // dropped at normalization, so the brief's plan does not resolve
    reviews: [],
  });
  const r = report(state);
  const ob = r.lines[0].obligations[0];
  assert.equal(ob.windowVerdict, 'unknown');
  assert.equal(r.board.unknownWindowN, 1);
  assert.equal(ob.state, 'open');
});

test('a line key that resolves to nothing reads vanished: counted, never settled, never issued work', () => {
  const state = makeState({
    lines: [],
    briefs: [brief({ lineKey: 'ghost-line' })],
    reviews: [],
  });
  const r = report(state);
  assert.equal(r.verdict, 'unverifiable');
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].verdict, 'vanished');
  assert.equal(r.lines[0].verifiable, false);
  assert.equal(r.board.openN, 1, 'an unattributable open obligation is counted as unsettled');
  assert.ok(r.refusals.some((row) => row.key === 'vanished-lines'));

  const ctx = seed(state);
  ctx.api.lineExitScan();
  assert.equal((ctx.store.state.delegations || []).length, 0, 'a task addressed to nobody could never close');
});

test('a HOME-keyed obligation is counted and handed over, never adjudicated here', () => {
  const state = makeState({
    lines: [],
    briefs: [brief({ lineKey: 'home:sam', lineRole: 'primary', lineKind: 'functional' })],
    reviews: [],
    structureHistory: [{
      id: 'sh-1', personId: 'sam', managerId: 'priya', fromISO: '2026-10-01', toISO: null,
      recordedOn: '2026-10-01', recordedBySeatId: null, source: 'moved', reason: 'Reorg.', at: ISO,
    }],
  });
  const r = report(state);
  assert.equal(r.lines.length, 0, 'the home line is not adjudicated by this register');
  assert.equal(r.board.homeScopedN, 1);
  assert.equal(r.board.homeMovedN, 1, 'the ask predates a recorded home-line move');
  assert.ok(r.refusals.some((row) => row.key === 'home-scoped'));
});

/* ---------------------------------------------------------------- remedies */

test('retire needs a reason, persists through a real reload, and display == stored', () => {
  const state = makeState();
  const ctx = seed(state);
  const before = JSON.stringify(ctx.store.state);
  const board = ctx.api.lineExitBoard().report;
  const key = board.obligations[0].key;

  const tooShort = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'retire', reason: 'no' });
  assert.equal(tooShort.ok, false);

  const ok = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'retire', reason: 'The cutover moved to the platform team before this line ended.' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.decidedOn, TODAY);

  const after = reload(ctx);
  const stored = JSON.parse(ctx.data.get(STORAGE_KEY));
  assert.equal(stored.lineExitRemedies.length, 1);
  const row = stored.lineExitRemedies[0];
  assert.equal(row.outcome, 'retire');
  assert.equal(row.decidedOn, TODAY);
  assert.equal(row.obligationKey, key);

  const rebuilt = after.api.lineExitBoard().report;
  const printed = rebuilt.obligations.find((ob) => ob.key === key);
  assert.equal(printed.state, 'retired');
  assert.equal(printed.remedy.reason, row.reason, 'the reason printed is the reason stored');
  assert.equal(printed.remedy.decidedOn, row.decidedOn);
  assert.equal(rebuilt.board.retiredN, 1);
  assert.equal(rebuilt.board.openN, 1);
  assert.equal(rebuilt.board.stateSum, rebuilt.board.obligationsN);

  // The ask itself is untouched: a remedy is a statement, not an edit.
  assert.equal(stored.onboardingLineBriefs.length, 1);
  assert.equal(stored.onboardingLineBriefs[0].acknowledgedOn, null);
  assert.notEqual(before, JSON.stringify(ctx.store.state), 'the write is real');
});

test('carry must name a manager who holds a LIVE line for the person today', () => {
  const ctx = seed(makeState());
  const key = ctx.api.lineExitBoard().report.obligations[0].key;

  const toPerson = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'carry', carryToManagerId: 'sam', reason: 'She can own her own onboarding follow-up.' });
  assert.equal(toPerson.ok, false);

  const toEndedLineManager = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'carry', carryToManagerId: 'priya', reason: 'Priya still runs the cutover follow-up.' });
  assert.equal(toEndedLineManager.ok, false, 'the manager whose line ENDED holds no live line');

  const unnamed = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'carry', carryToManagerId: '', reason: 'Somebody should own this follow-up.' });
  assert.equal(unnamed.ok, false);

  const toHome = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'carry', carryToManagerId: 'dana', reason: 'Dana now owns the cutover follow-up on the home line.' });
  assert.equal(toHome.ok, true, toHome.error);
  const reviewKey = ctx.api.lineExitBoard().report.obligations.find((ob) => ob.source === 'review-input').key;
  const reviewCarry = ctx.api.lineExitRemedy({ obligationKey: reviewKey, outcome: 'carry', carryToManagerId: 'dana', reason: 'Dana supplied the evidence the closed project would have given.' });
  assert.equal(reviewCarry.ok, true, reviewCarry.error);

  const r = reload(ctx).api.lineExitBoard().report;
  const printed = r.obligations.find((ob) => ob.key === key);
  assert.equal(printed.state, 'carried');
  assert.equal(printed.remedy.carryToManagerName, 'Dana Eng');
  assert.equal(printed.open, false);
  assert.equal(r.board.carriedN, 2);
  assert.equal(r.verdict, 'carried', 'a carried obligation is still owed, and the workspace says so');
});

test('an obligation somebody already answered cannot be retired underneath them', () => {
  const ctx = seed(makeState({
    briefs: [brief()],
    reviews: [review({
      stewardship: {
        requests: review().stewardship.requests,
        answers: [{ id: 'an-1', lineKey: 'line-sam-priya', outcome: 'input', answeredOn: '2026-09-22', text: 'Delivered the cutover.' }],
      },
    })],
  }));
  const key = ctx.api.lineExitBoard().report.obligations[0].key;
  ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'retire', reason: 'Nothing was owed on this one either.' });

  // Now the person acknowledges the brief: the obligation stops existing.
  const ok = ctx.api.onboardingMatrixAcknowledge({ planId: 'ob-1', lineKey: 'line-sam-priya', acknowledgement: 'Read and agreed.' });
  assert.equal(ok.ok, true, ok.error);
  const board = ctx.api.lineExitBoard().report;
  assert.equal(board.obligations.length, 0);
  const again = ctx.api.lineExitRemedy({ obligationKey: key, outcome: 'retire', reason: 'Trying to retire an answered obligation.' });
  assert.equal(again.ok, false, 'an answered obligation cannot be retired');
});

/* -------------------------------------------------------------- the rule */

test('RULE-LEX-01 issues one dated settlement ask per ended line, idempotently', () => {
  const ctx = seed(makeState());
  const first = ctx.api.lineExitScan();
  assert.equal(first.ok, true);
  const settlementAsks = () => (ctx.store.state.delegations || []).filter((d) => /^Settle \d+ open obligation/.test(d.title));
  assert.equal(settlementAsks().length, 1, 'exactly one ask for one ended line');
  const task = settlementAsks()[0];
  assert.equal(task.personId, 'priya', 'addressed to the manager who HELD the line');
  assert.equal(task.dueOn, '2026-11-16', 'the declared 7-day window');
  assert.match(task.title, /Sam Engineer/);
  assert.ok(ctx.store.state.lineExitMarkers.some((m) => String(m.key).startsWith('lex|line-sam-priya|')));

  ctx.api.lineExitScan();
  assert.equal(settlementAsks().length, 1, 'a second scan re-chases nothing');
});

test('the rule writes nothing in a single-chain workspace and nothing for a vanished line', () => {
  const single = seed(makeState({ lines: [], briefs: [], reviews: [] }));
  single.api.lineExitScan();
  assert.equal((single.store.state.delegations || []).length, 0);
  assert.equal((single.store.state.lineExitMarkers || []).length, 0);

  const vanished = seed(makeState({ lines: [], briefs: [brief({ lineKey: 'ghost-line' })], reviews: [] }));
  vanished.api.lineExitScan();
  assert.equal((vanished.store.state.delegations || []).length, 0);
});

test('RULE-LEX-01 is on the shared spine with a 1:1 contract', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'rule/contract parity');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'lineExitRules.js');
  assert.ok(contract, 'the rule has a declared contract');
  assert.match(contract.purpose, new RegExp(LINE_EXIT_RULE_ID));
  assert.ok(contract.writes.includes('lineExitMarkers'));
});

/* -------------------------------------------------------------------- csv */

test('CSV #114 is the same reading, aggregate only, and reconciles against the board', () => {
  const ctx = seed(makeState());
  ctx.api.lineExitRemedy({ obligationKey: ctx.api.lineExitBoard().report.obligations[0].key, outcome: 'retire', reason: 'Nothing further was owed on this obligation.' });

  const rows = lineExitCsvRows(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  const board = ctx.api.lineExitBoard().report.board;
  assert.equal(rows.length, 1 + board.linesN, 'one workspace row plus one row per ended line');
  assert.deepEqual(Object.keys(rows[0]).sort(), [...LINE_EXIT_CSV_COLUMNS].sort(), 'exact column parity');

  const summary = rows[0];
  assert.equal(summary.row_kind, 'workspace');
  assert.equal(summary.obligations, board.obligationsN);
  assert.equal(summary.open, board.openN);
  assert.equal(summary.retired, board.retiredN);
  assert.equal(summary.carried, board.carriedN);

  const lineRows = rows.filter((row) => row.row_kind === 'line');
  assert.equal(lineRows.reduce((n, row) => n + Number(row.obligations), 0), board.obligationsN);

  // No identity anywhere: not the person, not the manager, not the declaration id.
  const joined = JSON.stringify(rows);
  for (const secret of ['Sam Engineer', 'Priya PM', 'Dana Eng', 'line-sam-priya', 'obf-1', 'rev-1']) {
    assert.ok(!joined.includes(secret), `the aggregate export must not carry ${secret}`);
  }

  // And the real export pipeline carries it.
  const exported = exportWorkspaceCsv(ctx.store.state, 'line-exit', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, rows.length);
  assert.deepEqual(parsed.headers, [...LINE_EXIT_CSV_COLUMNS], 'the exported header is the declared column list');
  assert.ok(CSV_EXPORTS.some((entry) => entry.key === 'line-exit'));
});

/* ----------------------------------------------------------------- schema */

test('schema v126 past v127 is additive all the way to v128: an upgraded workspace gains an EMPTY remedy ledger, an EMPTY mark ledger and a clamped window', () => {
  const legacy = createEmptyState(ISO);
  legacy.people = roster();
  legacy.reportingLines = [endedLine()];
  legacy.onboarding = [plan()];
  legacy.onboardingLineBriefs = [brief()];
  legacy.schemaVersion = 126;
  delete legacy.lineExitRemedies;
  delete legacy.lineExitMarkers;
  delete legacy.settings.lineExitDueDays;

  const migrated = migrate(legacy);
  assert.equal(SCHEMA_VERSION, 130);
  assert.equal(migrated.raw.schemaVersion, 130);
  assert.deepEqual(migrated.raw.lineExitRemedies, []);
  assert.deepEqual(migrated.raw.lineExitMarkers, []);
  assert.equal(migrated.raw.settings.lineExitDueDays, 7);
  // Nothing is retired by a migration: the line's obligations are still open.
  const upgraded = normalizeState(migrated.raw).state;
  assert.equal(report(upgraded).board.openN, 1, 'no obligation was closed by the migration');
});

test('a hand-edited file cannot invent a retirement or a carry', () => {
  // Built RAW and normalized once, so the drop warnings are visible.
  const state = createEmptyState(ISO);
  state.people = roster();
  state.reportingLines = [endedLine()];
  state.onboarding = [plan()];
  state.onboardingLineBriefs = [brief()];
  state.lineExitRemedies = [
    { id: 'bad-1', obligationKey: 'onboarding-brief:obf-1', source: 'onboarding-brief', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'retire', reason: '', decidedOn: TODAY, at: ISO },
    { id: 'bad-2', obligationKey: 'onboarding-brief:obf-1', source: 'onboarding-brief', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'carry', reason: 'Somebody should carry this one.', decidedOn: TODAY, at: ISO },
    { id: 'bad-3', obligationKey: 'onboarding-brief:obf-1', source: 'onboarding-brief', personId: 'sam', lineKey: 'line-sam-priya', managerId: 'priya', outcome: 'spectacular', reason: 'An outcome that does not exist.', decidedOn: TODAY, at: ISO },
  ];
  const normalized = normalizeState(state);
  assert.deepEqual(normalized.state.lineExitRemedies, [], 'every malformed remedy was dropped');
  assert.ok(normalized.warnings.length >= 3);
  const r = report(normalized.state);
  assert.equal(r.board.obligationsN, 1);
  assert.equal(r.board.openN, r.board.obligationsN, 'nothing was closed by a dropped row');
});

/* ------------------------------------------------------------- reading is pure */

test('a read mutates nothing and every printed figure recomputes from the blob', () => {
  const ctx = seed(makeState());
  const snapshot = ctx.data.get(STORAGE_KEY);
  const a = ctx.api.lineExitBoard().report;
  const b = ctx.api.lineExitBoard().report;
  ctx.api.lineExitBriefText();
  ctx.api.lineExitCsvRows();
  assert.equal(ctx.data.get(STORAGE_KEY), snapshot, 'reads write nothing');

  // display == stored, recomputed independently from the persisted JSON
  const persisted = JSON.parse(ctx.data.get(STORAGE_KEY));
  const rebuilt = report(persisted);
  assert.equal(a.board.openN, rebuilt.board.openN);
  assert.equal(a.board.obligationsN, rebuilt.board.obligationsN);
  assert.equal(a.verdict, rebuilt.verdict);
  assert.deepEqual(
    a.obligations.map((ob) => [ob.key, ob.state, ob.windowVerdict, ob.daysOpen]),
    rebuilt.obligations.map((ob) => [ob.key, ob.state, ob.windowVerdict, ob.daysOpen]),
    'every obligation prints the same on both readings',
  );
  assert.equal(b.board.stateSum, b.board.obligationsN);
});

/* -------------------------------------------------------------------- view */

test('#/matrix?panel=exit renders the stored state without throwing', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderLineExitPanel } = await import('../../app/views/matrixExitPanel.js');

  const ctx = seed(makeState());
  const node = renderLineExitPanel({
    api: ctx.api,
    query: new URLSearchParams('panel=exit'),
    refresh: () => {},
    navigate: () => {},
    state: ctx.store.state,
  });
  const host = dom.window.document.getElementById('root');
  host.innerHTML = '';
  host.appendChild(node);
  const text = host.textContent || '';
  assert.match(text, /Sam Engineer/);
  assert.match(text, /Priya PM/);
  assert.match(text, /2026-10-31/, 'the day the line ended is printed');
  assert.match(text, /Open — no remedy recorded/);
  assert.match(text, /Retire with a reason/);
  assert.match(text, /Carry to a named manager/);
  assert.match(text, /One source family is deliberately not read/);
  assert.match(text, /Ended lines and the obligations they left/);
});
