import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectExportGovernance,
  scanSensitiveStakeholders,
} from '../../app/core/domain/export-governance.js';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 15));

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
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
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('inspectExportGovernance: flags HIRE-08 overdue candidates, disabled retention, conflicts, and candid stakeholder/veto stances', () => {
  // 1. Clean empty workspace requires zero disclosure
  const empty = createEmptyState(NOW.toISOString());
  const cleanGov = inspectExportGovernance(empty, { format: 'json-full', now: NOW });
  assert.equal(cleanGov.requiresDisclosure, false);
  assert.deepEqual(cleanGov.findings, []);

  // 2. Demo workspace flags overdue candidate (EXPORT-RET-01) and candid stakeholder stances (EXPORT-STK-01)
  const demo = buildDemoState(NOW);
  const demoGov = inspectExportGovernance(demo, { format: 'json-full', now: NOW });
  assert.equal(demoGov.requiresDisclosure, true);
  const codes = demoGov.findings.map((f) => f.code);
  assert.ok(codes.includes('EXPORT-RET-01'), 'flags overdue candidate past 180-day HIRE-08 window');
  assert.ok(codes.includes('EXPORT-STK-01'), 'flags skeptical/blocker stakeholder stances & unaligned veto players');
  assert.ok(demoGov.counts.candidatesExempt >= 1, 'tracks keep-in-touch exempt candidates separately from overdue ones');

  // 3. Redacting all flagged scopes clears requiresDisclosure
  const clearedGov = inspectExportGovernance(demo, {
    format: 'json-full',
    redactConflicts: true,
    pruneOverdueCandidates: true,
    redactStakeholderStances: true,
    now: NOW,
  });
  assert.equal(clearedGov.requiresDisclosure, false);
  assert.deepEqual(clearedGov.findings, []);

  // 4. Disabled retention (candidateRetentionDays = 0) with closed candidates flags EXPORT-RET-02
  const disabledRet = structuredClone(demo);
  disabledRet.settings.candidateRetentionDays = 0;
  const retOffGov = inspectExportGovernance(disabledRet, { format: 'csv', csvScope: 'hiring', now: NOW });
  assert.ok(retOffGov.findings.some((f) => f.code === 'EXPORT-RET-02'), 'warns when candidate retention window is switched off');
  assert.ok(retOffGov.findings.some((f) => f.code === 'EXPORT-HIR-01'), 'discloses candidate hiring CSV sensitivity');

  // 5. Stakeholder scan counts match across cases & changes
  const stk = scanSensitiveStakeholders(demo);
  assert.ok(stk.adverseStanceCount >= 1);
});

test('store & CSV redactions: pruneOverdueCandidates and redactStakeholderStances scrub exported copies without mutating live workspace', () => {
  const store = createStore({ storage: memoryStorage(), now: () => NOW });
  store.load();
  store.seedDemo(buildDemoState(NOW));

  const liveCandidateCount = store.state.candidates.length;
  const liveChangeBlocker = store.state.changes
    .flatMap((c) => c.coalition || [])
    .filter((m) => m.stance === 'skeptical' || m.stance === 'blocker').length;
  assert.ok(liveChangeBlocker >= 1);

  // 1. Redacted JSON omits overdue HIRE-08 candidates & scrubs stakeholder stances
  const exported = store.exportRedactedJSON({
    redactConflicts: true,
    pruneOverdueCandidates: true,
    redactStakeholderStances: true,
  });
  assert.equal(exported.ok, true);
  assert.ok(exported.omitted.overdueCandidatesOmitted >= 1, 'omits overdue candidate record');
  assert.ok(exported.omitted.stakeholderRecordsScrubbed >= 1, 'scrubs candid stakeholder stances');

  const parsed = JSON.parse(exported.json);
  assert.equal(parsed.redactions.overdueCandidates, true);
  assert.equal(parsed.redactions.stakeholderStances, true);
  assert.ok(parsed.state.candidates.length < liveCandidateCount, 'overdue candidate absent from exported state');
  const exportedAdverse = [
    ...(parsed.state.cases || []).flatMap((c) => c.stakeholders || []),
    ...(parsed.state.changes || []).flatMap((c) => c.coalition || []),
  ].filter((s) => s.stance === 'skeptical' || s.stance === 'blocker' || s.vetoPlayer);
  assert.equal(exportedAdverse.length, 0, 'all adverse stances and veto flags scrubbed in exported file');

  // Live store remains untouched
  assert.equal(store.state.candidates.length, liveCandidateCount);

  // 2. CSV hiring export with pruneOverdueCandidates omits overdue candidate row
  const fullHiringCsv = store.exportCSV('hiring');
  const prunedHiringCsv = store.exportCSV('hiring', { pruneOverdueCandidates: true });
  assert.equal(fullHiringCsv.ok, true);
  assert.equal(prunedHiringCsv.ok, true);
  assert.equal(
    prunedHiringCsv.rowCount,
    fullHiringCsv.rowCount - exported.omitted.overdueCandidatesOmitted,
    'hiring CSV omits exact number of overdue candidates when pruneOverdueCandidates=true',
  );

  // 3. CSV changes export with redactStakeholderStances zeroes unaligned veto player count
  const scrubbedChangesCsv = store.exportCSV('changes', { redactStakeholderStances: true });
  assert.equal(scrubbedChangesCsv.ok, true);
  assert.ok(!scrubbedChangesCsv.csv.includes('blocker'));
});

test('clearDemo: removes demo changes cleanly while preserving user-created changes and clearing dangling demo references', () => {
  const store = createStore({ storage: memoryStorage(), now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  store.seedDemo(buildDemoState(NOW));

  const demoPerson = store.state.people[0];
  const demoGoal = store.state.goals[0];
  const userChg = api.addChange({
    title: 'User-authored team charter',
    kind: 'charter',
    status: 'active',
    summary: 'Real user change linked to demo person & goal before clearing demo.',
    ownerId: demoPerson.id,
    linkedGoalId: demoGoal.id,
    impacts: [{ personId: demoPerson.id, impactKind: 'scope-shift', newRoleLabel: 'Tech Lead' }],
  });
  assert.equal(userChg.ok, true);

  store.clearDemo();
  assert.equal(store.state.changes.length, 1, 'demo changes removed, real user change preserved');
  assert.equal(store.state.changes[0].id, userChg.id);
  assert.equal(store.state.changes[0].ownerId, null, 'dangling demo ownerId cleared');
  assert.equal(store.state.changes[0].linkedGoalId, null, 'dangling demo linkedGoalId cleared');
  assert.equal(store.state.changes[0].impacts.length, 0, 'dangling demo impacts entries removed');
});

test('UI: Settings & Hiring pre-export disclosure dialogs surface HIRE-08 & stakeholder warnings, apply redactions, and log private-free audit events', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const origGlobalCreate = globalThis.URL?.createObjectURL;
    if (globalThis.URL) globalThis.URL.createObjectURL = undefined;
    try {
      const app = createApp({ storage: env.window.localStorage, now: () => NOW });
      app.ctx.loadDemo();
      app.ctx.navigate('#/settings');
      await flush();

      // 1. Clicking 'Export JSON' on demo workspace intercepts with disclosure dialog
      const exportBtn = Array.from(env.document.querySelectorAll('#view button')).find(
        (b) => b.textContent.trim() === 'Export JSON',
      );
      assert.ok(exportBtn, 'Export JSON button present');
      exportBtn.click();
      await flush();

      const dialog = env.document.querySelector('[data-testid="export-disclosure-dialog"]');
      assert.ok(dialog, 'Pre-export disclosure dialog opened for workspace with overdue HIRE-08 candidate & stakeholder stances');
      assert.match(dialog.textContent, /HIRE-08/);

      // Toggle both redactions inside the dialog
      const pruneBox = dialog.querySelector('input[name="pruneOverdueCandidates"]');
      const stkBox = dialog.querySelector('input[name="redactStakeholderStances"]');
      assert.ok(pruneBox && stkBox, 'both retention & stakeholder redaction toggles rendered');
      pruneBox.checked = true;
      pruneBox.dispatchEvent(new env.window.Event('change', { bubbles: true }));
      stkBox.checked = true;
      stkBox.dispatchEvent(new env.window.Event('change', { bubbles: true }));
      await flush();

      assert.match(dialog.textContent, /omitted or scrubbed/i, 'live summary updates to confirm all flagged items are handled');

      // Confirm export -> opens fallback modal with operational redacted JSON
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Export JSON');
      confirmBtn.click();
      await flush();

      const fallbackTextarea = env.document.querySelector('[role="dialog"] textarea[name="json"]');
      assert.ok(fallbackTextarea, 'fallback operational JSON modal opened after confirming disclosure');
      const exportedPayload = JSON.parse(fallbackTextarea.value);
      assert.equal(exportedPayload.redactions.overdueCandidates, true);
      assert.equal(exportedPayload.redactions.stakeholderStances, true);

      // Verify append-only audit event contains ONLY codes/flags — never candidate names!
      const auditEv = app.ctx.state.events.findLast((e) => e.type === 'export.disclosed');
      assert.ok(auditEv, 'export.disclosed event logged');
      for (const cand of app.ctx.state.candidates) {
        assert.ok(!auditEv.summary.includes(cand.name), 'audit log never leaks candidate names');
      }

      // Close fallback modal
      env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flush();

      // 2. Settings exposes 'Export candidate & hiring CSV' and respects Cancel
      const hiringCsvBox = env.document.querySelector('[data-testid="csv-sensitive-hiring"]');
      assert.ok(hiringCsvBox, 'Settings exposes dedicated Hiring & Candidates CSV sensitive box');
      const hiringBtn = Array.from(hiringCsvBox.querySelectorAll('button')).find((b) => /Export candidate & hiring CSV/i.test(b.textContent));
      hiringBtn.click();
      await flush();
      assert.ok(env.document.querySelector('[data-testid="export-disclosure-dialog"]'), 'Hiring CSV disclosure modal opened');

      const cancelBtn = Array.from(env.document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === 'Cancel');
      cancelBtn.click();
      await flush();
      assert.equal(env.document.querySelector('[role="dialog"]'), null, 'Cancelling closes disclosure without exporting');
    } finally {
      if (globalThis.URL && origGlobalCreate) globalThis.URL.createObjectURL = origGlobalCreate;
    }
  } finally {
    env.dom.window.close();
  }
});
