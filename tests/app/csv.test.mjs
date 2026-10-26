import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { CSV_EXPORTS, escapeCsvCell, serializeCsv, parseCsv, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-24T10:00:00.000Z');

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));

  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;

  return { dom, window, document: window.document, consoleErrors };
}

test('escapeCsvCell neutralizes OWASP CWE-1236 formula payloads while keeping negative numbers numeric', () => {
  const payloads = [
    "=CMD|' /C calc'!A0",
    '+SUM(A1:A2)',
    '-2+3+cmd',
    '@SUM(1+1)',
    '\t=1+1',
    '\r=1+1',
    '\n=1+1',
    '   =HYPERLINK("https://evil.example","Click")',
    '\uFF1D1+1', // ＝
    '\uFF0B1+1', // ＋
    '\uFF0D1+1', // －
    '\uFF20SUM(1)', // ＠
  ];
  for (const payload of payloads) {
    const csv = serializeCsv(['note'], [{ note: payload }]);
    const parsed = parseCsv(csv);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0][0], `'${payload}`, `payload ${JSON.stringify(payload)} must be prefixed with apostrophe`);
  }

  // Finite numbers (including negatives and zero) remain true numeric cells
  assert.equal(escapeCsvCell(-4.5), '-4.5');
  assert.equal(escapeCsvCell(-18), '-18');
  assert.equal(escapeCsvCell(0), '0');
  assert.equal(escapeCsvCell(92.4), '92.4');

  // Unknowns serialize as empty cells, never 0 or "null"
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
  assert.equal(escapeCsvCell(Number.NaN), '');
  assert.equal(escapeCsvCell(Number.POSITIVE_INFINITY), '');

  // Embedded quotes, commas and CRLF round-trip losslessly under RFC 4180
  const tricky = 'Said "ship it, team",\r\nthen followed up';
  const roundTrip = parseCsv(serializeCsv(['text'], [{ text: tricky }]));
  assert.equal(roundTrip.rows[0][0], tricky);
});

test('every CSV scope round-trips cleanly and preserves unknown values as blank cells', () => {
  const state = buildDemoState(NOW);
  // Add an unmeasured feedback item and an unknown-authorship goal
  state.feedback.push({
    id: 'fb-unmeasured', personId: state.people[0].id, direction: 'given', kind: 'praise',
    situation: 'Incident call', behavior: '=Handled calm handoff', impact: 'Zero downtime',
    tags: ['calm'], date: '2026-10-23', observedOn: null, followUpOn: null,
    followUpDone: false, followUpCompletedOn: null, createdAt: NOW.toISOString(),
  });
  state.goals.push({
    id: 'g-unknown-auth', title: 'Explore reliability SLOs', description: '',
    ownerId: state.people[0].id, scope: 'person', coAuthored: null, dueDate: null,
    keyResults: [], confidence: 'on-track', initialConfidence: 'on-track',
    status: 'active', completedOn: null, krUpdatedOn: null, checkins: [], createdAt: NOW.toISOString(),
  });

  state.feedback.push({
    id: 'fb-measured', personId: state.people[0].id, direction: 'given', kind: 'constructive',
    situation: 'Sprint planning', behavior: 'Joined 20m late without heads-up', impact: 'Delayed estimation',
    tags: ['timeliness'], date: '2026-10-23', observedOn: '2026-10-20', followUpOn: '2026-10-30',
    followUpDone: false, followUpCompletedOn: null, createdAt: NOW.toISOString(),
  });
  state.feedback.push({
    id: 'fb-invalid-order', personId: state.people[0].id, direction: 'given', kind: 'constructive',
    situation: 'Retro', behavior: 'Date typo test', impact: '',
    tags: [], date: '2026-10-18', observedOn: '2026-10-22', followUpOn: null,
    followUpDone: false, followUpCompletedOn: null, createdAt: NOW.toISOString(),
  });

  assert.equal(CSV_EXPORTS.length, 24);
  for (const spec of CSV_EXPORTS) {
    const res = exportWorkspaceCsv(state, spec.key, { now: NOW });
    assert.equal(res.ok, true, `${spec.key} export succeeds`);
    assert.ok(res.csv.endsWith('\r\n'), `${spec.key} uses CRLF record endings`);
    const parsed = parseCsv(res.csv);
    assert.equal(parsed.headers.length, res.columnCount);
    assert.equal(parsed.rows.length, res.rowCount);
    for (const row of parsed.rows) {
      assert.equal(row.length, parsed.headers.length, `${spec.key} row matches header length`);
    }
  }

  // Verify unmeasured, measured, and invalid-order feedback latency in CSV export
  const fbParsed = parseCsv(exportWorkspaceCsv(state, 'feedback', { now: NOW }).csv);
  const idxId = fbParsed.headers.indexOf('feedback_id');
  const idxLat = fbParsed.headers.indexOf('latency_days');
  const idxStatus = fbParsed.headers.indexOf('latency_status');
  const idxBehavior = fbParsed.headers.indexOf('behavior');
  const targetFb = fbParsed.rows.find((r) => r[idxId] === 'fb-unmeasured');
  assert.equal(targetFb[idxLat], '', 'missing observedOn exports blank latency cell, never 0');
  assert.equal(targetFb[idxStatus], 'unmeasured');
  assert.equal(targetFb[idxBehavior], "'=Handled calm handoff");

  const measuredFb = fbParsed.rows.find((r) => r[idxId] === 'fb-measured');
  assert.equal(measuredFb[idxLat], '3', 'measured observedOn -> date gap exports exact days');
  assert.equal(measuredFb[idxStatus], 'measured');

  const invalidFb = fbParsed.rows.find((r) => r[idxId] === 'fb-invalid-order');
  assert.equal(invalidFb[idxLat], '', 'invalid observedOn > date exports blank latency cell');
  assert.equal(invalidFb[idxStatus], 'invalid-order');

  // Verify unknown goal co-authorship and missing KRs export blank cells, never "no" or 0
  const goalParsed = parseCsv(exportWorkspaceCsv(state, 'goals', { now: NOW }).csv);
  const gRow = goalParsed.rows.find((r) => r[0] === 'g-unknown-auth');
  assert.equal(gRow[goalParsed.headers.indexOf('co_authored')], '');
  assert.equal(gRow[goalParsed.headers.indexOf('goal_progress_pct')], '');
});

test('pulseSummary CSV strictly enforces anonymity thresholds, unanimity suppression and comment floors; routine CSVs exclude conflicts', () => {
  const state = createEmptyState(NOW.toISOString());
  state.settings.pulseMinResponses = 5;
  state.people.push({
    id: 'p-secret', name: 'Named Responder', role: 'SWE', level: 'ic', team: 'Core',
    managerId: null, startDate: '2026-01-01', focus: '', status: 'active',
    createdAt: NOW.toISOString(), archivedAt: null,
  });

  // Week 1 (2026-10-05..10-11): 3 responses (< 5 floor) — must be suppressed
  for (let i = 0; i < 3; i += 1) {
    state.pulses.push({
      id: `w1-${i}`, date: '2026-10-06', personId: 'p-secret', anonymity: 'named',
      scores: { safety: 4, clarity: 3 + (i % 2), workload: 4, growth: 3 },
      comment: `Small cohort comment ${i}`, createdAt: NOW.toISOString(),
    });
  }

  // Week 2 (2026-10-12..10-18): 5 responses with unanimous safety=2 — must be suppressed
  for (let i = 0; i < 5; i += 1) {
    state.pulses.push({
      id: `w2-${i}`, date: '2026-10-14', personId: null, anonymity: 'anonymous',
      scores: { safety: 2, clarity: 2 + (i % 3), workload: 2 + ((i + 1) % 3), growth: 3 + (i % 2) },
      comment: `Unanimous week comment ${i}`, createdAt: NOW.toISOString(),
    });
  }

  // Week 3 (2026-10-19..10-24): 5 varied responses, but only 2 comments — scores released, comments suppressed!
  const varied = [
    { safety: 4, clarity: 5, workload: 3, growth: 4 },
    { safety: 3, clarity: 4, workload: 4, growth: 3 },
    { safety: 5, clarity: 3, workload: 2, growth: 4 },
    { safety: 2, clarity: 4, workload: 3, growth: 5 },
    { safety: 4, clarity: 2, workload: 5, growth: 2 },
  ];
  varied.forEach((scores, i) => {
    state.pulses.push({
      id: `w3-${i}`, date: '2026-10-21', personId: 'p-secret', anonymity: 'named',
      scores,
      comment: i < 2 ? `Identifiable lone comment ${i}` : '',
      createdAt: NOW.toISOString(),
    });
  });

  // Confidential conflict record
  state.conflicts.push({
    id: 'conf-1', title: 'CONFIDENTIAL_MEDIATION_CASE', summary: 'DO_NOT_LEAK_SUMMARY',
    safety: 'direct', coordinator: 'Manager', process: 'Voluntary', sharing: 'Restricted',
    participants: [{ name: 'Named Responder', perspective: 'PRIVATE_PERSPECTIVE', interest: 'Fairness', participation: 'willing' }],
    openedOn: '2026-10-15', nextFollowUpOn: '2026-10-28', status: 'open',
    agreements: [], followUps: [], transitions: [], followUpFloor: 0,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  });

  const pulseRes = exportWorkspaceCsv(state, 'pulseSummary', { now: NOW });
  assert.equal(pulseRes.csv.includes('p-secret'), false, 'never leaks personId');
  assert.equal(pulseRes.csv.includes('Named Responder'), false, 'never leaks responder name');
  assert.equal(pulseRes.csv.includes('Small cohort comment'), false);
  assert.equal(pulseRes.csv.includes('Unanimous week comment'), false);
  assert.equal(pulseRes.csv.includes('Identifiable lone comment'), false, 'suppresses comments below comment cohort floor');

  const parsed = parseCsv(pulseRes.csv);
  assert.equal(parsed.rows.length, 3);
  const statusIdx = parsed.headers.indexOf('privacy_status');
  const reasonIdx = parsed.headers.indexOf('blocked_reason');
  const overallIdx = parsed.headers.indexOf('overall_avg');
  const commentStatusIdx = parsed.headers.indexOf('comments_status');

  assert.equal(parsed.rows[0][statusIdx], 'suppressed');
  assert.equal(parsed.rows[0][reasonIdx], 'threshold');
  assert.equal(parsed.rows[0][overallIdx], '');

  assert.equal(parsed.rows[1][statusIdx], 'suppressed');
  assert.equal(parsed.rows[1][reasonIdx], 'unanimous');
  assert.equal(parsed.rows[1][overallIdx], '');

  assert.equal(parsed.rows[2][statusIdx], 'released');
  assert.notEqual(parsed.rows[2][overallIdx], '');
  assert.equal(parsed.rows[2][commentStatusIdx], 'suppressed');

  // Verify routine scopes never leak confidential conflict content
  for (const spec of CSV_EXPORTS.filter((s) => !s.sensitive)) {
    const out = exportWorkspaceCsv(state, spec.key, { now: NOW });
    assert.equal(out.csv.includes('CONFIDENTIAL_MEDIATION_CASE'), false, `${spec.key} must not contain conflict title`);
    assert.equal(out.csv.includes('DO_NOT_LEAK_SUMMARY'), false, `${spec.key} must not contain conflict summary`);
  }

  // Explicit confidential scope exports the conflict record with sensitive=true
  const confOut = exportWorkspaceCsv(state, 'conflicts', { now: NOW });
  assert.equal(confOut.sensitive, true);
  assert.equal(confOut.csv.includes('CONFIDENTIAL_MEDIATION_CASE'), true);
});

test('store.exportCSV works when storage quota is full and refuses when a future schema is protected', () => {
  let quotaBlocked = false;
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (quotaBlocked) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };

  const store = createStore({ storage, now: () => NOW });
  store.load();
  quotaBlocked = true;
  store.update((draft) => {
    draft.people.push({
      id: 'p1', name: '=Unsaved Leader Note', role: 'EM', level: 'manager', team: 'Core',
      managerId: null, startDate: '2026-01-01', focus: '', status: 'active',
      createdAt: NOW.toISOString(), archivedAt: null,
    });
  });
  assert.ok(store.persistError, 'persist failed due to quota');
  const csvWhileFull = store.exportCSV('people');
  assert.equal(csvWhileFull.ok, true, 'read-only CSV export still works under QuotaExceededError');
  assert.ok(csvWhileFull.csv.includes("'=Unsaved Leader Note"));

  // Future schema protection
  quotaBlocked = false;
  storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, people: [{ id: 'future', name: 'Future' }] }));
  const futureStore = createStore({ storage, now: () => NOW });
  futureStore.load();
  assert.ok(futureStore.writeBlockReason);
  const blockedCsv = futureStore.exportCSV('people');
  assert.equal(blockedCsv.ok, false);
  assert.equal(blockedCsv.reason, 'unsupported-schema');
  assert.ok(blockedCsv.error.includes('Export JSON'));
});

test('Settings UI exposes scoped CSV preview, guards confidential conflict CSV behind confirmation, and passes axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({
    root: env.document.getElementById('view'),
    storage: env.window.localStorage,
    now: () => NOW,
  });

  app.api.addPerson({ name: '=Formula Name', role: 'Engineer' });
  app.api.addConflict({
    title: 'Sensitive handoff dispute',
    summary: 'Disagreement over pager rotation',
    safety: 'direct',
    coordinator: 'Team Lead',
    openedOn: '2026-10-20',
    participants: [{ name: 'Avery' }, { name: 'Blair' }],
  });

  app.navigate('#/settings');
  const view = env.document.getElementById('view');
  const box = view.querySelector('[data-testid="csv-exports"]');
  assert.ok(box, 'renders CSV export card');

  const select = box.querySelector('#csv-export-scope');
  const optionValues = [...select.querySelectorAll('option')].map((o) => o.value);
  assert.equal(optionValues.includes('conflicts'), false, 'confidential conflicts excluded from routine dropdown');
  assert.equal(optionValues.includes('pulseSummary'), true);
  assert.equal(optionValues.includes('healthTrends'), true);

  // Preview routine people CSV in modal
  const previewBtn = [...box.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Preview / copy CSV');
  previewBtn.click();
  let dialog = env.document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'opens CSV preview modal');
  const textarea = dialog.querySelector('textarea[name="csv"]');
  assert.ok(textarea.value.includes("'=Formula Name"), 'preview shows formula-neutralized CSV');
  const closeBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close');
  closeBtn.click();

  // Clicking Export confidential CSV opens danger confirmation first
  const confBtn = [...box.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Export confidential CSV');
  confBtn.click();
  dialog = env.document.querySelector('[role="dialog"]');
  assert.ok(dialog.textContent.includes('Export confidential conflict records to CSV?'));
  const cancelBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
  cancelBtn.click();

  if (!env.window.axe) env.window.eval(AXE_SRC);
  const axeRes = await env.window.axe.run(env.document, {
    rules: { 'color-contrast': { enabled: false } },
  });
  assert.deepEqual(Array.from(axeRes.violations).map((v) => `${v.id}: ${v.help}`), [], 'zero axe-core violations on #/settings');
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});
