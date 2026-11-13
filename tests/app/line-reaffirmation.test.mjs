import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildLineReaffirmation,
  lineReaffirmationState,
  lineReaffirmationCsvRows,
  lineReaffirmationBriefText,
} from '../../app/core/domain/lineReaffirmation.js';
import {
  LINE_REAFFIRMATION_CSV_COLUMNS,
  LINE_REAFFIRMATION_STATES,
} from '../../app/core/domain/lineReaffirmationRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const TODAY = '2026-11-10';

function line(id, personId, managerId, extra = {}) {
  return {
    id, personId, managerId, kind: 'project', shareH: 20, rights: [],
    fromISO: '2025-01-01', toISO: null, status: 'active',
    declaredAt: '2025-01-01T00:00:00Z', ...extra,
  };
}

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'product', name: 'Product Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'kim', name: 'Kim', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.reportingLines = [
    line('l-project', 'sam', 'project', { shareH: 40 }),
    line('l-product', 'sam', 'product', { shareH: 30 }),
    line('l-kim', 'kim', 'project', { shareH: 25 }),
  ];
  return normalizeState(state).state;
}

function act(id, declarationId, personId, managerId, side, outcome, decidedOn, extra = {}) {
  return {
    id, declarationId, personId, managerId, kind: 'project', side, outcome, decidedOn,
    decidedBySeatId: null, via: 'seat', termEndsOn: null, sharePct: null,
    basis: '', reason: '', at: `${decidedOn}T00:00:00.000Z`, ...extra,
  };
}

const read = (state, settings = state.settings) => buildLineReaffirmation(state, { now: NOW, settings });

function openApi(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => NOW });
  store.load();
  return { store, api: createApi(store, { now: () => NOW }), data };
}

/* ------------------------------------------------------------------ states */

test('no stored answer reads no-term, and that is not read as in-term', () => {
  const state = fixture();
  const report = read(state);
  assert.equal(report.isMatrix, true);
  assert.equal(report.board.linesN, 3);
  assert.equal(report.board.noTermN, 3);
  assert.equal(report.board.inTermN, 0);
  assert.equal(report.board.uncoveredShareH, 95);
  assert.equal(report.board.reaffirmedShareH, 0);
  const sam = report.persons.find((p) => p.personId === 'sam');
  assert.equal(sam.verdict, 'no-term');
  assert.equal(sam.verdictOpen, true);
  assert.equal(sam.totals.declaredShareH, 70);
  assert.equal(sam.totals.reconciled ?? sam.totals.reconciles, true);
});

test('a live term both sides answered reads in-term; a term that ran out reads lapsed and stays charged', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2027-06-01', sharePct: 40 }),
    act('a2', 'l-project', 'sam', 'project', 'person', 'accept', '2026-06-02'),
    act('a3', 'l-product', 'sam', 'product', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2026-09-01', sharePct: 30 }),
  ];
  const report = read(state);
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  const product = sam.lines.find((l) => l.declarationId === 'l-product');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.inTerm);
  assert.equal(project.termEndsOn, '2027-06-01');
  assert.equal(product.state, LINE_REAFFIRMATION_STATES.lapsed);
  assert.equal(product.covered, false);
  assert.equal(product.sharePct, 30, 'a lapsed term does not remove the charge');
  assert.equal(sam.totals.reaffirmedShareH, 40);
  assert.equal(sam.totals.uncoveredShareH, 30);
  assert.equal(sam.totals.reconciles, true);
  // Kim has no answer at all, so the person verdict is the worst open finding.
  assert.equal(sam.verdict, 'lapsed');
});

test('a retuned share is not a re-affirmed share: both numbers print and the term does not cover', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', TODAY, { termEndsOn: '2027-01-01', sharePct: 40 }),
  ];
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-project' ? { ...l, shareH: 90 } : l));
  const report = read(normalizeState(state).state);
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.changed);
  assert.equal(project.answeredSharePct, 40);
  assert.equal(project.sharePct, 90);
  assert.equal(project.covered, false);
  assert.match(project.reason, /Agreeing to one number is not agreeing to another/);
});

test('a release records a decision and NEVER ends the charge', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'release', TODAY, { reason: 'The migration shipped and the project closed.' }),
  ];
  const report = read(state);
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.released);
  assert.equal(project.chargedDespiteRelease, true);
  assert.equal(project.sharePct, 40);
  assert.equal(sam.verdict, 'released');
  assert.match(report.queue[0].verdictReason, /still charged|still counts|declaration/);
  // The declaration itself is byte-identical: no read ended a line.
  assert.equal(state.reportingLines.find((l) => l.id === 'l-project').toISO, null);
});

test('a person objection is a finding, never an ending, and outranks a due window', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2026-11-20', sharePct: 40 }),
    act('a2', 'l-project', 'sam', 'project', 'person', 'object', '2026-07-01', { reason: 'That project ended for me in June.' }),
  ];
  const report = read(state);
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.objected);
  assert.equal(project.covered, false);
  assert.equal(project.inWarnWindow, true, 'the window is still reported beside the objection');
  assert.equal(project.chargedDespiteRelease, false);
  assert.equal(sam.verdict, 'objected');
});

test('a warning window reads due; an answer dated in the future is counted and never read as in force', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-kim', 'kim', 'project', 'manager', 'reaffirm', TODAY, { termEndsOn: '2026-11-25', sharePct: 25 }),
    act('a2', 'l-kim', 'kim', 'project', 'person', 'accept', TODAY),
    act('a3', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2027-01-01', { termEndsOn: '2028-01-01', sharePct: 40 }),
  ];
  const report = read(state);
  const kim = report.persons.find((p) => p.personId === 'kim');
  const kimproject = kim.lines.find((l) => l.declarationId === 'l-kim');
  assert.equal(kimproject.state, LINE_REAFFIRMATION_STATES.due);
  assert.equal(kimproject.covered, true);
  assert.equal(kimproject.termDaysRemaining, 15);
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.noTerm, 'a future answer is not in force');
  assert.equal(project.futureAnswerN, 1);
  assert.equal(report.board.futureAnswerN, 1);
});

test('an undeclared share refuses both totals outright and says so, never a partial sum', () => {
  const state = fixture();
  state.reportingLines = state.reportingLines.map((l) => (l.id === 'l-product' ? { ...l, shareH: null } : l));
  const report = read(normalizeState(state).state);
  assert.equal(report.board.sharesRefused, true);
  assert.equal(report.board.declaredShareH, null);
  assert.equal(report.board.uncoveredShareH, null);
  assert.equal(report.board.reaffirmedShareH, null);
  assert.match(report.board.sharesRefusedReason, /understate the claim/);
  // The exported cell is BLANK with the reason, never a zero.
  const rows = lineReaffirmationCsvRows(report);
  assert.equal(rows[0].uncovered_share_h, '');
  assert.equal(rows[0].share_refused, 'true');
  assert.match(rows[0].share_refused_reason, /understate/);
});

test('two lines re-affirmed past 100% of a person are refused at the action, with the arithmetic printed', () => {
  const state = fixture();
  // Sam: 70% re-affirmed on the project line and 40% declared on the product
  // line. Re-affirming the second would cover 110% of one person.
  state.reportingLines = state.reportingLines.map((l) => {
    if (l.id === 'l-project') return { ...l, shareH: 70 };
    if (l.id === 'l-product') return { ...l, shareH: 40 };
    return l;
  });
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', TODAY, { termEndsOn: '2027-01-01', sharePct: 70 }),
  ];
  state.settings = { ...state.settings, activeSeatId: 'product' };
  const { api } = openApi(normalizeState(state).state);
  const result = api.lineReaffirm({ declarationId: 'l-product', termEndsOn: '2027-01-01' });
  assert.equal(result.ok, false);
  assert.match(result.error, /would cover 110% of Sam/);
  assert.match(result.error, /against 100% of a person/);
  assert.match(result.error, /70% is already covered/);
});

/* ------------------------------------------------------------------- writes */

test('only the line’s own manager may re-affirm or release; only the person may answer', () => {
  const state = fixture();
  state.settings = { ...state.settings, activeSeatId: 'product' };
  const { api } = openApi(state);
  const wrongManager = api.lineReaffirm({ declarationId: 'l-project', termEndsOn: '2027-01-01' });
  assert.equal(wrongManager.ok, false);
  assert.match(wrongManager.error, /Only the manager who holds this line/);
  const wrongRelease = api.lineRelease({ declarationId: 'l-project', reason: 'Not my line to end.' });
  assert.equal(wrongRelease.ok, false);

  const projectSeat = openApi({ ...state, settings: { ...state.settings, activeSeatId: 'project' } });
  const acceptedByManager = projectSeat.api.lineReaffirmationAccept({ declarationId: 'l-project' });
  assert.equal(acceptedByManager.ok, false);
  assert.match(acceptedByManager.error, /Only the person the share is taken from/);
  const objectedByManager = projectSeat.api.lineReaffirmationObject({ declarationId: 'l-project', reason: 'I will object for them.' });
  assert.equal(objectedByManager.ok, false);
});

test('a re-affirmation must carry a future term, and a release must carry a stated reason', () => {
  const state = fixture();
  state.settings = { ...state.settings, activeSeatId: 'project' };
  const { api } = openApi(state);
  const past = api.lineReaffirm({ declarationId: 'l-project', termEndsOn: '2026-11-09' });
  assert.equal(past.ok, false);
  assert.match(past.error, /future date/);
  const tooLong = api.lineReaffirm({ declarationId: 'l-project', termEndsOn: '2029-11-09' });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /cannot run longer/);
  const bare = api.lineRelease({ declarationId: 'l-project', reason: 'no' });
  assert.equal(bare.ok, false);
  assert.match(bare.error, /Say why/);
});

test('the round trip through the real API: re-affirm, person answers, release, and the charge survives', () => {
  const state = fixture();
  state.settings = { ...state.settings, activeSeatId: 'project' };
  const projectSeat = openApi(state);
  const reaffirmed = projectSeat.api.lineReaffirm({ declarationId: 'l-project', termEndsOn: '2027-01-01', basis: 'Own the migration end to end through the January cutover.' });
  assert.equal(reaffirmed.ok, true, reaffirmed.error);
  assert.equal(reaffirmed.termEndsOn, '2027-01-01');

  // A non-leader has no seat in this workspace, so the OPERATOR view captures the
  // person's statement — and the row is marked `operator`, never printed as an
  // authenticated identity. That is the same rule ADR-0148 applies.
  const operator = openApi({ ...projectSeat.store.state, settings: { ...projectSeat.store.state.settings, activeSeatId: null } });
  const accepted = operator.api.lineReaffirmationAccept({ declarationId: 'l-project' });
  assert.equal(accepted.ok, true, accepted.error);
  const report = operator.api.lineReaffirmationBoard().report;
  const sam = report.persons.find((p) => p.personId === 'sam');
  const project = sam.lines.find((l) => l.declarationId === 'l-project');
  assert.equal(project.state, LINE_REAFFIRMATION_STATES.inTerm);
  assert.equal(project.personAnsweredOn, TODAY);
  assert.equal(project.personAnswerVia, 'operator', 'a scribed statement is never printed as authentication');

  const released = operator.api.lineRelease({ declarationId: 'l-project', reason: 'The cutover finished and the project closed in October.' });
  assert.equal(released.ok, true, released.error);
  assert.equal(released.stillCharged, true);
  assert.equal(released.stillChargedPct, 40);
  const after = operator.api.lineReaffirmationBoard().report;
  const afterProject = after.persons.find((p) => p.personId === 'sam').lines.find((l) => l.declarationId === 'l-project');
  assert.equal(afterProject.state, LINE_REAFFIRMATION_STATES.released);
  // And the declaration is untouched: a release is a decision, not an ending.
  assert.equal(operator.store.state.reportingLines.find((l) => l.id === 'l-project').toISO, null);
});

test('the rule puts a dated ask in front of the right seat and never answers for anybody', () => {
  const state = fixture();
  state.settings = { ...state.settings, activeSeatId: null };
  const { api, store } = openApi(state);
  // Declaring a line fires RULE-LRF-01 on the same transaction.
  const declared = api.matrixDeclareLine({
    personId: 'kim', managerId: 'product', kind: 'product', shareH: 15,
    fromISO: '2026-11-01', toISO: null, rights: [], note: 'Product line for the pricing work.',
  });
  assert.equal(declared.ok, true, declared.error);
  const asks = store.state.delegations.filter((d) => String(d.support || '').includes('RULE-LRF-01'));
  assert.ok(asks.length >= 1, 'the rule issued at least one dated ask');
  const toManager = asks.find((d) => d.personId === 'product');
  assert.ok(toManager, 'the ask to the manager who HOLDS the line exists');
  assert.match(toManager.expectedOutcome, /re-affirmed this line/);
  assert.match(toManager.expectedOutcome, /released it with a stated reason/);
  // A line re-affirmed but unanswered by the person asks the PERSON — once the
  // declared ask window has passed (14 days by default).
  const stale = { ...store.state };
  stale.settings = { ...stale.settings, activeSeatId: null };
  stale.lineReaffirmations = [
    act('r1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-09-01', { termEndsOn: '2027-09-01', sharePct: 40 }),
  ];
  const personSeat = openApi(stale);
  assert.equal(personSeat.api.lineReaffirmationScan().ok, true);
  const personAsk = personSeat.store.state.delegations.find((d) => d.personId === 'sam' && String(d.support || '').includes('RULE-LRF-01'));
  assert.ok(personAsk, 'a re-affirmation the person has not answered is put in front of the person');
  assert.match(personAsk.title, /Answer the re-affirmed/);
  // And the freshly re-affirmed line does NOT chase the person on day zero.
  const fresh = openApi({ ...store.state, settings: { ...store.state.settings, activeSeatId: null } });
  fresh.api.lineReaffirmationScan();
  assert.equal(
    fresh.store.state.delegations.some((d) => d.personId === 'sam' && /Answer the re-affirmed/.test(d.title)),
    false,
    'day zero is not a chase',
  );
  // Nothing was answered on anybody's behalf.
  assert.equal(personSeat.store.state.lineReaffirmations.filter((a) => a.side === 'person').length, 0);
});

test('an objection is escalated to the home line, and a released-but-charged line is put back to its manager', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2027-06-01', sharePct: 40 }),
    act('a2', 'l-project', 'sam', 'project', 'person', 'object', '2026-07-01', { reason: 'That project ended for me in June.' }),
    act('a3', 'l-product', 'sam', 'product', 'manager', 'release', '2026-07-02', { reason: 'The product line closed and nobody told the ledger.' }),
  ];
  state.settings = { ...state.settings, activeSeatId: null };
  const { api, store } = openApi(state);
  const scan = api.lineReaffirmationScan();
  assert.equal(scan.ok, true, scan.error);
  const asks = store.state.delegations.filter((d) => String(d.support || '').includes('RULE-LRF-01'));
  assert.ok(asks.some((d) => d.personId === 'home' && /objected/.test(d.title)), 'the objection reaches the home line');
  assert.ok(asks.some((d) => d.personId === 'product' && /End the/.test(d.title)), 'the released-but-charged line is put back to its manager');
  assert.ok(!asks.some((d) => d.personId === 'sam'), 'the rule never asks the person to settle their own objection');
});

/* ------------------------------------------------- display == stored check */

test('every printed figure equals the recomputed model across a real reload, and reads mutate nothing', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2027-06-01', sharePct: 40 }),
    act('a2', 'l-project', 'sam', 'project', 'person', 'accept', '2026-06-02'),
    act('a3', 'l-product', 'sam', 'product', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2026-09-01', sharePct: 30 }),
  ];
  const first = openApi(state);
  const storedBefore = first.data.get(STORAGE_KEY);
  const revisionBefore = first.store.state.meta.revision;
  const report = first.api.lineReaffirmationBoard().report;
  assert.equal(first.data.get(STORAGE_KEY), storedBefore, 'a read writes nothing');
  assert.equal(first.store.state.meta.revision, revisionBefore, 'a read bumps no revision');

  const second = openApi(state);
  const reloaded = second.api.lineReaffirmationBoard().report;
  assert.deepEqual(reloaded.board, report.board, 'the board survives a real reload');
  assert.deepEqual(
    reloaded.persons.map((p) => [p.personId, p.verdict, p.totals]),
    report.persons.map((p) => [p.personId, p.verdict, p.totals]),
  );

  // Every printed total equals the sum of the rows it claims to sum.
  const persisted = JSON.parse(second.data.get(STORAGE_KEY));
  const recomputed = read(persisted);
  assert.deepEqual(report.board, recomputed.board, 'display == computed from the stored blob');
  for (const person of recomputed.persons) {
    const declared = person.lines.reduce((acc, l) => acc + (l.sharePct || 0), 0);
    assert.equal(person.totals.declaredShareH, declared, `${person.personId}: declared equals the printed rows`);
    assert.equal((person.totals.reaffirmedShareH || 0) + (person.totals.uncoveredShareH || 0), declared);
  }
  const linesTotal = recomputed.board.noTermN + recomputed.board.dueN + recomputed.board.lapsedN
    + recomputed.board.awaitingPersonN + recomputed.board.objectedN + recomputed.board.releasedN
    + recomputed.board.changedN + recomputed.board.inTermN;
  assert.equal(linesTotal, recomputed.board.linesN);
  assert.equal(recomputed.board.countsReconcile, true);

  // The rendered panel prints the same numbers the model holds.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((k) => [k, globalThis[k]]));
  try {
    for (const k of globals) globalThis[k] = k === 'document' ? dom.window.document : k === 'window' ? dom.window : dom.window[k];
    const node = renderMatrix({
      api: second.api, state: second.store.state,
      query: new URLSearchParams('panel=renewal'), navigate() {}, refresh() {},
    });
    assert.equal(second.data.get(STORAGE_KEY), storedBefore, 'render mutates nothing');
    const text = node.textContent;
    const table = [...node.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === 'Declared lines and their re-affirmation state');
    assert.ok(table, 'the register table renders');
    const rows = [...table.querySelectorAll('tbody tr')];
    const expected = recomputed.persons.flatMap((p) => p.lines);
    assert.equal(rows.length, expected.length);
    for (const [i, row] of rows.entries()) {
      const model = expected[i];
      const saved = persisted.reportingLines.find((l) => l.id === model.declarationId);
      const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
      assert.ok(cells[0].startsWith(model.personName), `row ${i}: the printed person is the stored person`);
      assert.equal(cells[2], model.sharePct === null ? 'refused' : `${model.sharePct}%`, `row ${i}: printed share == stored share`);
      assert.equal(cells[3].startsWith(model.termEndsOn || 'no term'), true, `row ${i}: printed term == stored term`);
      assert.ok(cells[4].startsWith(model.stateLabel), `row ${i}: printed state == derived state`);
      assert.equal(saved.shareH, model.sharePct, `row ${i}: display == stored declaration`);
    }
    assert.match(text, new RegExp(`= ${recomputed.board.linesN}`), 'the identity line prints the computed line count');
    assert.match(text, new RegExp(`${recomputed.board.reaffirmedShareH}% covered by a live re-affirmed term`));
    assert.match(text, /Charged, uncovered/);
  } finally {
    for (const [k, v] of previous) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    dom.window.close();
  }
});

/* ------------------------------------------------------------------ surface */

test('the export is aggregate-only, reconciles to the panel, and carries no identity or free text', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2027-06-01', sharePct: 40 }),
    act('a2', 'l-project', 'sam', 'project', 'person', 'accept', '2026-06-02'),
    act('a3', 'l-product', 'sam', 'product', 'manager', 'release', '2026-07-02', { reason: 'The product line closed and nobody told the ledger.' }),
  ];
  const report = read(state);
  const rows = lineReaffirmationCsvRows(report);
  assert.deepEqual(Object.keys(rows[0]), [...LINE_REAFFIRMATION_CSV_COLUMNS]);
  const summary = rows[0];
  assert.equal(Number(summary.lines_n), report.board.linesN);
  assert.equal(Number(summary.reaffirmed_share_h), report.board.reaffirmedShareH);
  assert.equal(Number(summary.uncovered_share_h), report.board.uncoveredShareH);
  assert.equal(Number(summary.released_n), report.board.releasedN);
  const flat = JSON.stringify(rows);
  for (const banned of ['sam', 'kim', 'Project Manager', 'l-project', 'Home Manager', 'closed']) {
    assert.equal(flat.includes(banned), false, `the export must not carry ${banned}`);
  }
  // The registered scope builds the same read model the panel renders.
  const exported = exportWorkspaceCsv(state, 'line-reaffirmation', { now: NOW });
  assert.equal(exported.ok, true);
  assert.equal(CSV_EXPORTS.filter((e) => e.key === 'line-reaffirmation').length, 1);
});

test('the brief names nobody and prints both claims', () => {
  const state = fixture();
  state.lineReaffirmations = [
    act('a1', 'l-project', 'sam', 'project', 'manager', 'reaffirm', '2026-06-01', { termEndsOn: '2026-09-01', sharePct: 40 }),
  ];
  const text = lineReaffirmationBriefText(read(state));
  assert.match(text, /1 with a term that ran out/);
  assert.match(text, /no live answer covers/);
  assert.equal(text.includes('Sam'), false);
  assert.equal(text.includes('Project Manager'), false);
});

test('a single-chain workspace is inert: no row, no term, no ask, and the schema still holds', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'boss', name: 'Boss', level: 'director', managerId: null, status: 'active' },
    { id: 'ic', name: 'IC', level: 'ic', managerId: 'boss', status: 'active' },
  ];
  const normalized = normalizeState(state).state;
  const before = JSON.stringify(normalized);
  const report = buildLineReaffirmation(normalized, { now: NOW });
  assert.equal(report.isMatrix, false);
  assert.equal(report.persons.length, 0);
  assert.equal(report.board.linesN, 0);
  assert.match(report.singleChainNote, /no second share/);
  assert.equal(JSON.stringify(normalized), before, 'a read mutates nothing');
  assert.equal(SCHEMA_VERSION, 148);
  assert.equal(migrate({ schemaVersion: 128, settings: {} }).raw.schemaVersion, 148);
});

test('the vocabulary is closed and the state counts reconcile by construction', () => {
  assert.deepEqual(Object.values(LINE_REAFFIRMATION_STATES).sort(), [
    'awaiting-person', 'changed-share', 'in-term', 'no-term', 'person-objected',
    'reaffirmation-due', 'released', 'term-lapsed',
  ].sort());
  const state = fixture();
  const report = read(state);
  assert.equal(report.board.countsReconcile, true);
  // A refused answer cannot be read into the record: the normalizers drop it.
  const doctored = normalizeState({
    ...state,
    lineReaffirmations: [
      { id: 'x', declarationId: 'l-project', personId: 'sam', managerId: 'project', side: 'manager', outcome: 'reaffirm', decidedOn: TODAY },
      { id: 'y', declarationId: 'l-kim', personId: 'kim', managerId: 'project', side: 'manager', outcome: 'release', decidedOn: TODAY, reason: 'no' },
      { id: 'z', declarationId: 'l-product', personId: 'sam', managerId: 'product', side: 'person', outcome: 'accept', decidedOn: TODAY },
    ],
  });
  assert.equal(doctored.state.lineReaffirmations.length, 1, 'a term-less renewal and a bare release are dropped');
  assert.equal(doctored.state.lineReaffirmations[0].id, 'z');
  assert.ok(doctored.warnings.length >= 2);
});

test('lineReaffirmationState is a pure function of its inputs', () => {
  const base = { today: TODAY, currentSharePct: 40, warnDays: 30 };
  assert.equal(lineReaffirmationState(base).state, LINE_REAFFIRMATION_STATES.noTerm);
  assert.equal(lineReaffirmationState({ ...base, managerAct: { outcome: 'release', decidedOn: '2026-01-01' } }).state, LINE_REAFFIRMATION_STATES.released);
  assert.equal(lineReaffirmationState({
    ...base,
    managerAct: { outcome: 'reaffirm', decidedOn: '2026-01-01', termEndsOn: '2027-01-01', sharePct: 40 },
  }).state, LINE_REAFFIRMATION_STATES.awaitingPerson);
  assert.equal(lineReaffirmationState({
    ...base,
    managerAct: { outcome: 'reaffirm', decidedOn: '2026-01-01', termEndsOn: '2027-01-01', sharePct: 40 },
    personAct: { outcome: 'accept', decidedOn: '2026-01-02' },
  }).state, LINE_REAFFIRMATION_STATES.inTerm);
});
