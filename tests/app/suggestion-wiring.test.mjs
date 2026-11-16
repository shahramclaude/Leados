/**
 * tests/app/suggestion-wiring.test.mjs — the focused integration suite for
 * ADR-0227 (Frontline Improvement-Suggestion Ledger, `RULE-KZT-01`, Schema
 * v185, CSV #173, `#/suggestions`).
 *
 * The route is deliberately matrixed: Mila's home line is under Dana and a
 * second active line is under Omar, so the computed joint apex is Cleo. The
 * suite drives the real guarded API, store and post-commit spine; then checks
 * the same stored bytes through the kernel, seat-scoped report, DOM and CSV.
 * No test writes a derived state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { COLLECTIONS, createEmptyState, MIGRATIONS, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildSuggestionLedger } from '../../app/core/domain/suggestionLedger.js';
import { buildSuggestionReport } from '../../app/core/domain/suggestionReport.js';
import { KZT_CSV_DESCRIPTOR, KZT_CSV_SCOPE, KZT_RULE_ID } from '../../app/core/domain/suggestionRegistry.js';
import { renderSuggestions } from '../../app/views/suggestions.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const iso = '2026-01-01T09:00:00.000Z';
const problem = 'At final assembly the fixture resets between units and the operator waits.';
const proposal = 'Move the reset check into the existing cycle so the next part starts without waiting.';
const reason = 'The route accepts because the cycle can take the check without changing the safety control.';

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso };
}

function seed(startDay = '2026-11-16', { autoPropagate = true } = {}) {
  let currentNow = at(startDay);
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.settings.suggestionAutoPropagate = autoPropagate;
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Commercial', 'director', 'ceo'),
    person('mila', 'Mila Demand Manager', 'manager', 'dana'),
    person('ivo', 'Ivo Operator', 'lead', 'mila'),
    person('omar', 'Omar Operations', 'director', 'ceo'),
    person('kai', 'Kai Supply Manager', 'manager', 'omar'),
    person('ben', 'Ben Builder', 'lead', 'kai'),
  ];
  raw.reportingLines = [{
    id: 'rl-mila-omar', personId: 'mila', managerId: 'omar', kind: 'project',
    shareH: null, rights: [], fromISO: '2026-01-01', toISO: null,
    declaredAt: iso, note: '', status: 'active', history: [],
  }];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = createApi(store, { now: clock, idFactory });
  return {
    store,
    api,
    now: () => currentNow,
    setDay(day) { currentNow = at(day); },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
  };
}

function fileSuggestion(env, responseDays) {
  const result = env.api.suggestionDeclare({
    areaRef: 'Final Assembly Cell',
    problemText: problem,
    proposalText: proposal,
    responseDays,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.suggestionId;
}

/** Parse the exporter's real CSV payload, including quoted commas/newlines. */
function parseCsv(csv) {
  const lines = csv.split('\r\n').filter((line) => line.length);
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(header.map((key, i) => [key, cells[i]]));
  });
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost/#/suggestions' });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    return run(dom);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
}

/* ---------------------------------------------------------------- schema + registration */

test('suggestions: schema v185 adds three empty ledgers and the pause, without inferring a row', () => {
  assert.equal(SCHEMA_VERSION, 185);
  for (const key of ['suggestions', 'suggestionActs', 'suggestionMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is declared`);
  }
  const step = MIGRATIONS[184]({ schemaVersion: 184, settings: { suggestionAutoPropagate: false } });
  assert.equal(step.schemaVersion, 185);
  assert.deepEqual(step.suggestions, []);
  assert.deepEqual(step.suggestionActs, []);
  assert.deepEqual(step.suggestionMarkers, []);
  assert.equal(step.settings.suggestionAutoPropagate, false, 'an existing explicit pause remains paused');
  const loaded = normalizeState(step, { now: at('2026-11-16') });
  assert.equal(loaded.state.schemaVersion, 185);
  assert.deepEqual(loaded.state.suggestions, []);
  assert.deepEqual(loaded.state.suggestionActs, []);
  assert.deepEqual(loaded.state.suggestionMarkers, []);
  assert.equal(loaded.state.settings.suggestionAutoPropagate, false);
  assert.equal(normalizeState(createEmptyState(), { now: at('2026-11-16') }).state.settings.suggestionAutoPropagate, true);

  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule?.id === 'suggestionRule'), 'RULE-KZT-01 is on the shared spine');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'suggestionRules.js');
  assert.ok(contract, 'the rule declares its propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'suggestionMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.ok(CSV_EXPORTS.some((row) => row.key === KZT_CSV_SCOPE));
  assert.equal(CSV_EXPORTS.find((row) => row.key === KZT_CSV_SCOPE).sensitive, KZT_CSV_DESCRIPTOR.sensitive);
  const suggestionCsvIndex = CSV_EXPORTS.findIndex((row) => row.key === KZT_CSV_SCOPE);
  assert.ok(suggestionCsvIndex > 0, 'CSV #173 is registered');
  assert.equal(CSV_EXPORTS[suggestionCsvIndex - 1].key, 'integrated-business-plan', 'CSV #173 follows #172 in the register');
});

/* ---------------------------------------------------------------- matrix + real workflow + end-to-end integrity */

test('suggestions: computed joint route, overdue ask, three human keys, and stored = computed = displayed = CSV', () => {
  const env = seed();
  env.sit('mila');
  const ids = [fileSuggestion(env, 1), fileSuggestion(env, 5), fileSuggestion(env, 5)];

  // The submitter has two active managers (Dana and Omar). The stored route is
  // the joint apex above both, not either line chosen by the submitter.
  for (const id of ids) {
    const stored = env.store.state.suggestions.find((row) => row.id === id);
    assert.ok(stored);
    assert.equal(stored.submitterId, 'mila');
    assert.deepEqual(stored.routeIds, ['ceo']);
  }

  // The 24-hour promise expires. The shared post-commit rule files one opaque,
  // typed ask to the route member; it neither declines nor changes the ledger.
  env.setDay('2026-11-18');
  const scan = env.api.suggestionScan();
  assert.equal(scan.ok, true, JSON.stringify(scan));
  const overdueRead = env.api.suggestionReport();
  assert.equal(overdueRead.counts.overdue.response, 1);
  assert.equal(overdueRead.rows.find((row) => row.id === ids[0]).state, 'awaiting-triage');
  const task = env.store.state.delegations.find((row) => row.personId === 'ceo' && row.status === 'active'
    && row.title === 'A dated response is owed on the improvement-suggestion register');
  assert.ok(task, 'the computed route seat owns the dated ask');
  assert.equal(task.expectedOutcome.includes('Final Assembly Cell'), false);
  assert.equal(task.expectedOutcome.includes(problem), false);
  assert.equal(task.expectedOutcome.includes('mila'), false);
  assert.ok(env.store.state.links.some((link) => link.ruleId === KZT_RULE_ID && link.targetId === task.id && link.relation === 'issues-obligation'));

  // The shared route answers after the deadline: one acceptance names a
  // reachable owner and target day; two suggestions receive explicit declines.
  env.sit('ceo');
  const accepted = env.api.suggestionTriage({
    suggestionId: ids[0], decision: 'accept', reason, ownerId: 'kai', targetDay: '2026-11-20',
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  for (const id of ids.slice(1)) {
    const declined = env.api.suggestionTriage({
      suggestionId: id, decision: 'decline', reason: 'This proposed change duplicates a control already working on this line.',
    });
    assert.equal(declined.ok, true, JSON.stringify(declined));
  }
  const clearedTask = env.store.state.delegations.find((row) => row.id === task.id);
  assert.equal(clearedTask.status, 'done', 'the ask closes when the route records its answer');
  assert.ok(clearedTask.completionNote.startsWith(`${KZT_RULE_ID}:`), 'the rule marks its own completion separately from a human answer');

  // The named owner claims; the same person is refused the independent check.
  env.setDay('2026-11-19');
  env.sit('kai');
  const claim = env.api.suggestionClaim({
    suggestionId: ids[0],
    effectText: 'The reset now runs in the prior cycle and the operator starts the next unit without waiting.',
  });
  assert.equal(claim.ok, true, JSON.stringify(claim));
  const actsBeforeSelfConfirm = env.store.state.suggestionActs.length;
  const selfConfirm = env.api.suggestionConfirm({
    suggestionId: ids[0], note: 'The owner cannot verify the effect they claimed on this change.' ,
  });
  assert.equal(selfConfirm.ok, false);
  assert.match(selfConfirm.error, /owner never confirms/i);
  assert.equal(env.store.state.suggestionActs.length, actsBeforeSelfConfirm, 'a refused act is not stored');

  // The original submitter is an independent confirmer. Nothing in elapsed time
  // closes the record; only this second key does.
  env.sit('mila');
  const confirm = env.api.suggestionConfirm({
    suggestionId: ids[0], note: 'The next cycle started on time and the fixture reset before the operator reached it.',
  });
  assert.equal(confirm.ok, true, JSON.stringify(confirm));

  const storedRows = env.store.state.suggestions;
  const storedActs = env.store.state.suggestionActs;
  assert.equal(storedRows.length, 3);
  assert.equal(storedActs.length, 5, 'three triage acts, one owner claim, one independent confirmation');
  assert.equal(storedRows.every((row) => row.areaRef === 'Final Assembly Cell' && row.problemText === problem && row.proposalText === proposal), true);

  const kernel = buildSuggestionLedger(env.store.state, { now: env.now() });
  const report = buildSuggestionReport(env.store.state, { now: env.now(), seat: null });
  const scopedReport = env.api.suggestionReport();
  assert.deepEqual(report.rows, kernel.rows, 'the unscoped read is exactly the pure computation from stored rows and acts');
  assert.deepEqual(scopedReport.rows, kernel.rows, 'the submitter sees the complete party-scoped rows');
  assert.equal(kernel.counts.byState['closed-confirmed'], 1);
  assert.equal(kernel.counts.byState.declined, 2);
  assert.equal(kernel.counts.overdue.response, 0);
  assert.equal(report.partitionReconciles, true);
  assert.equal(report.figuresComplete, true);

  // Three suggestions clear the floor. The late answer does not count in-window;
  // both on-time declines do. One effect was independently confirmed.
  const area = report.rates.cells.find((cell) => cell.areaRef === 'Final Assembly Cell');
  assert.ok(area);
  assert.equal(area.suppressed, false);
  assert.equal(area.total, 3);
  assert.equal(area.answered, 2);
  assert.equal(area.implemented, 1);
  assert.equal(area.answeredBp, 6666);
  assert.equal(area.implementedBp, 3333);
  assert.equal(report.rates.totals.suggestions, 3);
  assert.equal(report.rates.totals.answered, 2);
  assert.equal(report.rates.totals.implemented, 1);

  // The UI's DOM renders the reader's row, state and aggregates, not a local
  // reimplementation. Assert the actual cells rather than a screenshot or a
  // heading that could survive while the numbers drift.
  withDom(() => {
    const ctx = {
      api: env.api,
      state: env.store.state,
      query: new URLSearchParams('view=rows'),
      navigate: () => {},
      refresh: () => {},
    };
    const rowsNode = renderSuggestions(ctx);
    const rowNode = rowsNode.querySelector(`[data-testid="kzt-row-${ids[0]}"]`);
    assert.ok(rowNode, 'the accepted suggestion is rendered');
    assert.equal(rowNode.getAttribute('data-state'), kernel.rows.find((row) => row.id === ids[0]).state);
    const textCell = (label) => rowNode.querySelector(`td[data-label="${label}"]`)?.textContent.trim();
    assert.equal(textCell('Area'), kernel.rows.find((row) => row.id === ids[0]).areaRef);
    assert.equal(textCell('Problem'), kernel.rows.find((row) => row.id === ids[0]).problemText);
    assert.equal(textCell('Proposal'), kernel.rows.find((row) => row.id === ids[0]).proposalText);
    const printedStats = Object.fromEntries([...rowsNode.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    assert.equal(printedStats.Suggestions, String(scopedReport.counts.total));
    assert.equal(printedStats['Response overdue'], String(scopedReport.counts.overdue.response));
    assert.equal(printedStats['Target overdue'], String(scopedReport.counts.overdue.target));
    assert.equal(printedStats['Refused acts'], String(scopedReport.counts.refusedActs));
    assert.equal(printedStats['Dropped rows'], String(scopedReport.counts.droppedSuggestions + scopedReport.counts.droppedActs));
    assert.ok(rowsNode.textContent.includes('The rows add up'));
    assert.ok(rowsNode.textContent.includes('Nothing refused, nothing dropped'));

    const ratesNode = renderSuggestions({ ...ctx, query: new URLSearchParams('view=counts') });
    const areaNode = ratesNode.querySelector(`[data-testid="kzt-area-${area.code}"]`);
    assert.ok(areaNode);
    const printedArea = Object.fromEntries([...areaNode.querySelectorAll('td')].map((cell) => [cell.dataset.label, cell.textContent.trim()]));
    assert.equal(printedArea.Area, area.areaRef);
    assert.equal(printedArea.Suggestions, String(area.total));
    assert.equal(printedArea['Answered in window'], String(area.answered));
    assert.equal(printedArea['Answered rate'], '66.66%');
    assert.equal(printedArea.Implemented, String(area.implemented));
    assert.equal(printedArea['Implemented rate'], '33.33%');
  });

  const csvPayload = exportWorkspaceCsv(env.store.state, KZT_CSV_SCOPE, { now: env.now() });
  assert.equal(csvPayload.ok, true, csvPayload.error);
  const csvRows = parseCsv(csvPayload.csv);
  const summary = csvRows.find((row) => row.row_kind === 'summary');
  const csvArea = csvRows.find((row) => row.row_kind === 'area' && row.key === area.code);
  assert.ok(summary);
  assert.ok(csvArea);
  assert.equal(Number(summary.suggestions), report.rates.totals.suggestions);
  assert.equal(Number(summary.answered_within_window), report.rates.totals.answered);
  assert.equal(Number(summary.implemented), report.rates.totals.implemented);
  assert.equal(Number(csvArea.suggestions), area.total);
  assert.equal(Number(csvArea.answered_within_window), area.answered);
  assert.equal(Number(csvArea.implemented), area.implemented);
  assert.equal(Number(csvArea.answered_rate_bp), area.answeredBp);
  assert.equal(Number(csvArea.implemented_rate_bp), area.implementedBp);
  for (const privateValue of ['Final Assembly Cell', problem, proposal, 'mila', 'ceo', 'kai', ...ids]) {
    assert.equal(csvPayload.csv.includes(privateValue), false, `CSV omits private value ${privateValue}`);
  }
});

/* ---------------------------------------------------------------- pause door */

test('suggestions: the literal pause governs explicit scans and can be resumed without a duplicate ask', () => {
  const env = seed('2026-11-16', { autoPropagate: false });
  env.sit('mila');
  fileSuggestion(env, 1);
  env.setDay('2026-11-18');

  const pausedScan = env.api.suggestionScan();
  assert.equal(pausedScan.ok, true, JSON.stringify(pausedScan));
  assert.equal(env.store.state.delegations.filter((row) => row.personId === 'ceo').length, 0, 'no ask is written while paused');
  assert.equal(env.store.state.suggestionMarkers.length, 0, 'the pause suppresses the full rule path');

  env.store.update((draft) => {
    draft.settings = { ...draft.settings, suggestionAutoPropagate: true };
  }, { type: 'settings.updated', entity: 'settings', entityId: 'suggestionAutoPropagate', summary: 'resume suggestion rule' });
  const resumedScan = env.api.suggestionScan();
  assert.equal(resumedScan.ok, true, JSON.stringify(resumedScan));
  assert.equal(env.store.state.delegations.filter((row) => row.personId === 'ceo' && row.status === 'active').length, 1);
  env.api.suggestionScan();
  assert.equal(env.store.state.delegations.filter((row) => row.personId === 'ceo').length, 1, 'a repeated scan is idempotent');
});
