/**
 * tests/app/interfaces.test.mjs — Schema v68 Cross-Boundary Interface,
 * Queue-Network & Operating Pact Terminal (`#/interfaces`, ADR-0058).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  buildBoundaryResetScript,
  interfaceBrief,
  interfaceReport,
} from '../../app/core/domain/interfaces.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-31T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function makeHarness(nowFn = () => NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${(seq += 1)}`;
  const store = createStore({ storage: memoryStorage(), now: nowFn, idFactory });
  store.load();
  const api = createApi(store, { now: nowFn, idFactory });
  return { store, api };
}

test('schema v68: migrates v67 cleanly, clamps settings, and fails closed on malformed records', () => {
  assert.equal(SCHEMA_VERSION, 68);
  const v67 = { ...createEmptyState(NOW), schemaVersion: 67 };
  delete v67.interfacePacts;
  delete v67.interfaceAudits;
  delete v67.interfaceMarkers;
  const migrated = migrate(v67);
  assert.deepEqual(migrated.applied, ['67 → 68']);
  assert.equal(migrated.raw.schemaVersion, 68);
  assert.deepEqual(migrated.raw.interfacePacts, []);
  assert.deepEqual(migrated.raw.interfaceAudits, []);
  assert.deepEqual(migrated.raw.interfaceMarkers, []);

  const norm = normalizeState(
    {
      ...migrated.raw,
      settings: {
        ...migrated.raw.settings,
        interfaceMinExchanges: 1, // clamp -> 3
        interfaceCleanHandsFloorPct: 99, // clamp -> 95
        interfaceHighUtilPct: 20, // clamp -> 55
      },
      interfacePacts: [
        { id: 'bad-same-unit', title: 'Loop', sourceUnit: 'Core', targetUnit: 'core' },
        {
          id: 'ok-1',
          title: 'Checkout ↔ Payments Gate',
          sourceUnit: 'Checkout',
          targetUnit: 'Payments',
          mode: 'x-as-a-service',
          turnaroundDays: 4,
          externalArrivalPerWeek: 4,
          serviceCapacityPerWeek: 8,
        },
      ],
    },
    { now: NOW },
  );
  assert.equal(norm.state.settings.interfaceMinExchanges, 3);
  assert.equal(norm.state.settings.interfaceCleanHandsFloorPct, 95);
  assert.equal(norm.state.settings.interfaceHighUtilPct, 65);
  assert.equal(norm.state.interfacePacts.length, 1);
  assert.equal(norm.state.interfacePacts[0].id, 'ok-1');
  assert.ok(norm.warnings.some((w) => /distinct/i.test(w)));
});

test('queue-network math: hand-verified Whitt QNA, Naor congestion multiplier, instability refusal, surge paradox & currency isolation', () => {
  const { store, api } = makeHarness();

  // Pact 1: λ0 = 6/wk, rework r = 0.25 => λ_eff = 8/wk, μ = 10/wk => ρ = 0.80.
  // arrivalCv = 1.0 (Ca^2 = 1.0), serviceCv = sqrt(1.5) => Cs^2 = 1.5.
  // W_q(weeks) = (0.8/0.2)*((1+1.5)/2)*(1/10) = 0.5 wk = 3.5 calendar days!
  // Naor external wait = W_q / (1 - ρ) = 3.5 / 0.2 = 17.5 days!
  // Social-to-private ratio = (2 - 0.8) / (1 - 0.8) = 6.0×!
  // Whitt departure C_d^2 = (1 - 0.64)*1.0 + 0.64*1.5 = 1.32!
  const p1 = api.addInterfacePact({
    title: 'Billing ↔ Security Review',
    sourceUnit: 'Billing',
    targetUnit: 'Security',
    mode: 'x-as-a-service',
    turnaroundDays: 3,
    externalArrivalPerWeek: 6,
    serviceCapacityPerWeek: 10,
    arrivalCv: 1.0,
    serviceCv: Math.sqrt(1.5),
    reworkRate: 0.25,
    weeklyDelayPrice: 5000,
    currency: 'USD',
  });
  assert.equal(p1.ok, true);

  let rep = interfaceReport(store.state, NOW);
  const r1 = rep.rows.find((r) => r.pact.id === p1.pact.id);
  assert.equal(r1.effectiveArrival, 8);
  assert.equal(r1.queue.rho, 0.8);
  assert.equal(r1.queue.privateWaitDays, 3.5);
  assert.equal(r1.queue.marginalExternalityDaysPerItem, 17.5);
  assert.equal(r1.queue.socialToPrivateRatio, 6);
  assert.ok(Math.abs(r1.queue.departureCv2 - 1.32) < 0.01);
  assert.equal(r1.surgeParadox.paradoxTriggered, true, '+20% surge triggers ρ=0.96 queue blow-up');

  // Pact 2 in EUR feeding a saturated gate (λ_eff = 10 >= μ = 9) => unstable refusal, EUR kept separate from USD.
  const p2 = api.addInterfacePact({
    title: 'EU Core ↔ Privacy Counsel',
    sourceUnit: 'EU Core',
    targetUnit: 'Privacy Counsel',
    mode: 'gatekeeper',
    turnaroundDays: 5,
    externalArrivalPerWeek: 9,
    serviceCapacityPerWeek: 9,
    reworkRate: 0.1,
    weeklyDelayPrice: 4000,
    currency: 'EUR',
  });
  assert.equal(p2.ok, true);

  rep = interfaceReport(store.state, NOW);
  const r2 = rep.rows.find((r) => r.pact.id === p2.pact.id);
  assert.equal(r2.queue.unstable, true);
  assert.equal(r2.queue.privateWaitDays, null, 'divergent queue refuses finite stationary wait');
  assert.equal(rep.summary.exposureByCurrency.length, 1, 'only stable priced USD gate has finite weekly externality; EUR never summed into USD');
  assert.equal(rep.summary.exposureByCurrency[0].currency, 'USD');

  // Shared gate superposition: a second stream into Security (λ0 = 2.5 => total Λ = 10.5 > μ = 10) tips the shared gate unstable!
  const p3 = api.addInterfacePact({
    title: 'Growth ↔ Security Review',
    sourceUnit: 'Growth',
    targetUnit: 'Security',
    mode: 'x-as-a-service',
    turnaroundDays: 3,
    externalArrivalPerWeek: 2.5,
    serviceCapacityPerWeek: 10,
  });
  assert.equal(p3.ok, true);
  rep = interfaceReport(store.state, NOW);
  const r1After = rep.rows.find((r) => r.pact.id === p1.pact.id);
  assert.equal(r1After.queue.unstable, true, 'superposed inbound demand tipped shared Security gate past 100%');
});

test('Clean-Hands Escalation Gate & cross-module propagation: dirty hands blocks negotiation; clean hands prepares Fisher-Ury negotiation', () => {
  const { store, api } = makeHarness();
  const owner = api.addPerson({ name: 'Elena Vance', role: 'Engineering Manager', team: 'Checkout' });

  // Case A: Dirty hands (2/6 clean = 33.3% < 70% floor) even though counterparty missed SLA 4/6 times.
  const dirty = api.addInterfacePact({
    title: 'Checkout ↔ Infra Gate',
    sourceUnit: 'Checkout',
    targetUnit: 'Infra',
    ownerId: owner.id,
    turnaroundDays: 3,
    ourGive: 'Complete runbook & load profile',
    theirGive: 'Provision within 3d',
  });
  for (let i = 0; i < 6; i += 1) {
    api.recordInterfaceExchange(dirty.pact.id, {
      recordedOn: `2026-10-${String(10 + i).padStart(2, '0')}`,
      summary: `Exchange ${i + 1}`,
      intakeClean: i < 2,
      turnaroundDays: i < 2 ? 2 : 6,
      bounced: i >= 2,
    });
  }

  let rep = interfaceReport(store.state, NOW);
  const dirtyRow = rep.rows.find((r) => r.pact.id === dirty.pact.id);
  assert.equal(dirtyRow.compliance.verdict, 'dirty-hands-asymmetry');
  assert.equal(
    store.state.negotiations.length,
    0,
    'Clean-Hands Gate blocked counterparty escalation negotiation when our own intake is 33.3%',
  );
  assert.ok(
    store.state.delegations.some((d) => /Clean-Hands|intake/i.test(`${d.title} ${d.expectedOutcome || d.outcome || ''}`)),
    'RULE-INT-03 opened internal intake-hygiene delegation instead of blaming counterparty',
  );
  const resetDirty = buildBoundaryResetScript(dirtyRow);
  assert.match(resetDirty, /Clean-hands ownership first/i);

  // Case B: Clean hands (6/6 clean = 100% >= 70% floor) while counterparty met SLA only 1/6 times (16.7%).
  const clean = api.addInterfacePact({
    title: 'Checkout ↔ Legal DPA Gate',
    sourceUnit: 'Checkout',
    targetUnit: 'Legal',
    ownerId: owner.id,
    turnaroundDays: 4,
    ourGive: 'Complete DPA packet + SOC2',
    theirGive: 'Redline within 4d',
  });
  for (let i = 0; i < 6; i += 1) {
    api.recordInterfaceExchange(clean.pact.id, {
      recordedOn: `2026-10-${String(18 + i).padStart(2, '0')}`,
      summary: `Vendor packet ${i + 1}`,
      intakeClean: true,
      turnaroundDays: i === 0 ? 3 : 9,
      bounced: false,
    });
  }

  rep = interfaceReport(store.state, NOW);
  const cleanRow = rep.rows.find((r) => r.pact.id === clean.pact.id);
  assert.equal(cleanRow.compliance.verdict, 'clean-hands-counterparty-breach');
  assert.equal(
    store.state.negotiations.length,
    1,
    'RULE-INT-04 prepared exactly one Fisher-Ury negotiation once clean hands were verified',
  );
  assert.ok(
    store.state.links.some((l) => l.relation === 'renegotiates-pact'),
    'typed renegotiates-pact link attached to negotiation',
  );
  const resetClean = buildBoundaryResetScript(cleanRow);
  assert.match(resetClean, /Symmetric give-get check/i);

  // Idempotency: repeated scans do not duplicate negotiations, delegations, or decisions.
  const countsBefore = {
    decisions: store.state.decisions.length,
    delegations: store.state.delegations.length,
    negotiations: store.state.negotiations.length,
  };
  api.scanInterfaces();
  assert.deepEqual(
    {
      decisions: store.state.decisions.length,
      delegations: store.state.delegations.length,
      negotiations: store.state.negotiations.length,
    },
    countsBefore,
  );
});

test('prospective Pact Audits: content-free freeze, early-grade refusal, exact Brier score, and Brier skill floor', () => {
  let currentNow = new Date('2026-10-01T10:00:00.000Z');
  const { store, api } = makeHarness(() => currentNow);

  const created = api.addInterfacePact({
    title: 'Secret Project Phoenix ↔ Core Infra',
    sourceUnit: 'Phoenix Pod',
    targetUnit: 'Core Infra',
    turnaroundDays: 3,
    ourGive: 'Confidential architecture spec',
    theirGive: 'Dedicated staging slice',
  });

  const frozen = api.freezeInterfaceAudit(created.pact.id, {
    horizonDays: 14,
    predictedComplianceProb: 0.8,
  });
  assert.equal(frozen.ok, true);
  const snapJson = JSON.stringify(frozen.audit.baseline);
  assert.equal(/Phoenix|Confidential|Dedicated/.test(snapJson), false, 'baseline snapshot is strictly content-free');

  // Cannot grade before reviewOn (2026-10-15).
  const early = api.gradeInterfaceAudit(frozen.audit.id);
  assert.equal(early.ok, false);

  // Record 5 exchanges inside (2026-10-01, 2026-10-15], all clean & on-time => realizedRate = 1.0 >= 0.80 => outcomeBinary = 1.
  // Brier = (0.8 - 1)^2 = 0.04!
  for (let d = 3; d <= 11; d += 2) {
    currentNow = new Date(`2026-10-${String(d).padStart(2, '0')}T10:00:00.000Z`);
    api.recordInterfaceExchange(created.pact.id, {
      recordedOn: `2026-10-${String(d).padStart(2, '0')}`,
      summary: `Window item ${d}`,
      intakeClean: true,
      turnaroundDays: 2,
      bounced: false,
    });
  }

  currentNow = new Date('2026-10-16T10:00:00.000Z');
  const graded = api.gradeInterfaceAudit(frozen.audit.id);
  assert.equal(graded.ok, true);
  assert.equal(graded.grade.outcomeBinary, 1);
  assert.equal(graded.grade.brier, 0.04);

  // Irreversible: cannot grade twice or delete a graded audit.
  assert.equal(api.gradeInterfaceAudit(frozen.audit.id).ok, false);
  assert.equal(api.deleteInterfaceAudit(frozen.audit.id).ok, false);

  // Brier skill withheld below 5 graded audits.
  const rep = interfaceReport(store.state, currentNow);
  assert.equal(rep.calibration.gradedCount, 1);
  assert.equal(rep.calibration.skillReportable, false);
  assert.equal(rep.calibration.brierSkill, null);
});

test('privacy, CSV scope #58, Insights integration, and clearDemo surgical cleanup', () => {
  const { store, api } = makeHarness();
  store.seedDemo({ force: true });
  assert.ok(store.state.interfacePacts.length >= 3, 'demo seeds contrasting Operating Pacts');

  // Add a real user pact alongside demo records.
  const userPact = api.addInterfacePact({
    title: 'Payments ↔ Treasury Settlement',
    sourceUnit: 'Payments',
    targetUnit: 'Treasury',
    turnaroundDays: 2,
    externalArrivalPerWeek: 4,
    serviceCapacityPerWeek: 6,
    weeklyDelayPrice: 3000,
    currency: 'USD',
  });
  assert.equal(userPact.ok, true);

  // Insights surfaces 'Boundary interfaces'.
  const ins = buildInsights(store.state, NOW);
  assert.ok(
    ins.byDomain.some((b) => b.domain === 'Boundary interfaces'),
    'Boundary interfaces domain wired into Insights',
  );

  // CSV Scope #58 exports positional IF01.. + ALL with zero unit names, titles, or clauses.
  assert.equal(CSV_EXPORTS.length, 58);
  const csvRes = exportWorkspaceCsv(store.state, 'interfaces', { now: NOW });
  assert.ok(csvRes.rowCount >= 4);
  assert.match(csvRes.csv, /IF01/);
  assert.match(csvRes.csv, /CALIBRATION_SUMMARY,ALL/);
  assert.equal(
    /Payments|Treasury|Security Architecture|Commercial Counsel|Priya/.test(csvRes.csv),
    false,
    'CSV scope #58 leaks zero unit names, pact titles, clauses, or person names',
  );

  // Executive brief produces clean structured text.
  const brief = interfaceBrief(interfaceReport(store.state, NOW));
  assert.match(brief, /BOUNDARY & INTERFACE PHYSICS/i);

  // clearDemo removes all *-demo-* pacts while preserving userPact.
  store.clearDemo();
  assert.equal(store.state.interfacePacts.length, 1);
  assert.equal(store.state.interfacePacts[0].id, userPact.pact.id);
});

test('ui + a11y: all 6 panels of #/interfaces and modal dialogs render cleanly and pass axe-core', async () => {
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('error', (...a) => consoleErrors.push(a.join(' ')));
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
  globalThis.SVGElement = window.SVGElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  window.eval(AXE_SRC);

  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: window.localStorage, now: () => NOW });
    app.ctx.loadDemo();

    for (const panel of ['overview', 'network', 'pacts', 'redesign', 'audits', 'method']) {
      app.ctx.navigate(`#/interfaces?panel=${panel}`);
      const view = window.document.querySelector('#view');
      assert.ok(view.textContent.length > 80, `panel ${panel} rendered rich content`);
      assert.equal(view.querySelectorAll('h1').length, 1, `panel ${panel} has exactly one h1`);
      const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(
        Array.from(res.violations, (v) => v.id),
        [],
        `panel ${panel} has zero axe violations`,
      );
    }

    // Open New Operating Pact modal, verify axe-clean & Escape closes cleanly.
    app.ctx.navigate('#/interfaces?panel=pacts');
    const newBtn = [...window.document.querySelectorAll('#view button')].find((b) =>
      /New Operating Pact/i.test(b.textContent),
    );
    assert.ok(newBtn);
    newBtn.focus();
    newBtn.click();
    const dialog = window.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'New Operating Pact modal opened');
    const modalAxe = await window.axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(modalAxe.violations, (v) => v.id), [], 'pact dialog is axe-clean');
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(window.document.querySelector('[role="dialog"]'), null);
    assert.deepEqual(consoleErrors, []);
  } finally {
    dom.window.close();
  }
});
