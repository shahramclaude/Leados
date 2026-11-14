/**
 * Workspace checkup: honest readings over the record the app already owns.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  buildWorkspaceCheckup, checkupBrief, CHECKUP_CAVEATS,
} from '../../app/core/domain/workspaceCheckup.js';
import { buildDemoState } from '../../app/core/demo.js';
import { SCHEMA_VERSION, createEmptyState } from '../../app/core/schema.js';
import { runPostCommitRules } from '../../app/core/domain/postCommit.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const byId = (report, id) => report.checks.find((row) => row.id === id);

test('a healthy demo workspace passes what it can and never invents the rest', () => {
  const state = buildDemoState();
  const report = buildWorkspaceCheckup(state, {
    now: NOW,
    storageBytes: 600_000,
    isEncrypted: true,
    propagationMetrics: { events: 10, rules: 89, executed: 3, declined: 7, rolledBack: 0, omittedEvents: 0, elapsedMs: 12, rootEvent: 'person.created' },
    perfSamples: [{ slow: false, elapsedMs: 10 }],
  });
  assert.equal(byId(report, 'schema').status, 'pass');
  assert.equal(byId(report, 'identity').status, 'pass');
  assert.equal(byId(report, 'automation-failures').status, 'pass');
  assert.equal(byId(report, 'automation-gaps').status, 'pass');
  assert.equal(byId(report, 'cascade').status, 'pass');
  assert.equal(byId(report, 'links').status, 'pass');
  assert.equal(byId(report, 'workspace-mode').status, 'warn', 'demo data is labelled, not mistaken for real records');
  assert.equal(report.status, 'warn');
  assert.equal(report.total, 11);
  assert.equal(report.measured.records > 0, true);
});

test('nothing measured is unknown, never a zero', () => {
  const report = buildWorkspaceCheckup(createEmptyState(NOW.toISOString()), { now: NOW });
  assert.equal(byId(report, 'storage').status, 'unknown');
  assert.equal(byId(report, 'links').status, 'unknown');
  assert.equal(byId(report, 'cascade').status, 'unknown');
  assert.equal(byId(report, 'performance').status, 'unknown');
  assert.equal(report.counts.fail, 0);
  assert.equal(report.measured.storageBytes, null);
});

test('a paid-for write that did not land is the one hard failure', () => {
  const report = buildWorkspaceCheckup(buildDemoState(), {
    now: NOW,
    storageBytes: 600_000,
    persistError: 'Could not save: browser storage is full.',
  });
  const persistence = byId(report, 'persistence');
  assert.equal(persistence.status, 'fail');
  assert.match(persistence.detail, /storage is full/);
  assert.equal(report.status, 'fail');
});

test('quota thresholds are exact-byte thresholds and fail before the write does', () => {
  const state = buildDemoState();
  const warn = buildWorkspaceCheckup(state, { now: NOW, storageBytes: 4 * 1024 * 1024 });
  assert.equal(byId(warn, 'storage').status, 'warn');
  const fail = buildWorkspaceCheckup(state, { now: NOW, storageBytes: 4.8 * 1024 * 1024 });
  assert.equal(byId(fail, 'storage').status, 'fail');
  assert.match(byId(fail, 'storage').detail, /may fail/);
});

test('a newer schema is protected rather than silently written over', () => {
  const state = buildDemoState();
  state.schemaVersion = SCHEMA_VERSION + 5;
  const report = buildWorkspaceCheckup(state, { now: NOW });
  assert.equal(byId(report, 'schema').status, 'warn');
  assert.match(byId(report, 'schema').detail, /newer LeadOS/);
});

test('duplicate ids and dangling links are found by the existing definitions', () => {
  const state = buildDemoState();
  state.cases.push({ ...state.cases[0] }); // same id in one collection
  state.links.push({ id: 'lnk-dangling-test', sourceType: 'case', sourceId: 'does-not-exist', targetType: 'delegation', targetId: state.delegations[0].id, relation: 'mitigates' });
  const report = buildWorkspaceCheckup(state, { now: NOW, storageBytes: 600_000 });
  assert.equal(byId(report, 'identity').status, 'fail');
  assert.match(byId(report, 'identity').detail, /repeated id/);
  assert.equal(byId(report, 'links').status, 'fail');
  assert.match(byId(report, 'links').detail, /1 dangling/);
});

test('a budget gap is a durable warning, not a rule failure and not a silently healthy cascade', () => {
  const state = buildDemoState();
  state.events.push({ id: 'gap-test', ts: '2026-11-13T09:00:00.000Z', type: 'automation.gap', entity: 'workspace', entityId: '', summary: 'Automation event limit reached.' });
  const report = buildWorkspaceCheckup(state, { now: NOW, storageBytes: 600_000 });
  assert.equal(byId(report, 'automation-gaps').status, 'warn');
  assert.match(byId(report, 'automation-gaps').detail, /withheld derived events/);
  assert.equal(report.measured.gaps, 1);
  assert.equal(byId(report, 'automation-failures').status, 'pass', 'a gap is not a failure receipt');
});

test('the spine itself now writes the durable gap event when it withholds source-created events', () => {
  const draft = createEmptyState();
  draft.cases = Array.from({ length: 300 }, (_, i) => ({ id: `case-gap-${i}` }));
  const audit = [];
  const warnings = [];
  const metrics = {};
  runPostCommitRules(draft, {
    event: { type: 'workspace.imported', entity: 'workspace', entityId: 'w' },
    previousState: { cases: [] },
    rules: [],
    metrics,
    warnings,
    now: NOW,
    idFactory: (prefix) => `${prefix}-gap`,
    logEvent: (entry) => audit.push(entry),
  });
  assert.equal(metrics.omittedEvents, 45);
  assert.equal(audit.filter((event) => event.type === 'automation.gap').length, 1);
  assert.equal(audit.some((event) => event.type === 'automation.rule_error'), false);
  assert.ok(warnings.some((warning) => /not delivered/i.test(warning)));
});

test('the brief names every limit and carries no record titles or names', () => {
  const state = buildDemoState();
  state.events.push({ id: 'err-test', ts: NOW.toISOString(), type: 'automation.rule_error', entity: 'workspace', entityId: '', summary: 'SECRET PERSON NOTE' });
  const report = buildWorkspaceCheckup(state, { now: NOW, storageBytes: 600_000 });
  const brief = checkupBrief(report);
  assert.match(brief, /LeadOS workspace checkup/);
  assert.match(brief, /Limits:/);
  for (const caveat of CHECKUP_CAVEATS) assert.ok(brief.includes(caveat));
  assert.equal(brief.includes('SECRET'), false);
  assert.equal(brief.includes('Priya'), false);
});

/* ------------------------------------------------------------------ view */

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function boot() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, consoleErrors };
}

test('the route renders its readings, its evidence and its limits', async () => {
  const env = boot();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  app.store.seedDemo();
  app.navigate('#/checkup');
  const view = env.document.querySelector('#view');
  assert.match(view.querySelector('h1').textContent, /Workspace checkup/);
  assert.equal(view.querySelectorAll('.view-checkup tbody tr').length >= 11, true);
  assert.match(view.textContent, /not a security audit/i);
  assert.match(view.textContent, /Download report/);
  assert.deepEqual(env.consoleErrors, []);
});
