/**
 * tests/app/domain-sense-wiring.test.mjs — the focused integration suite for
 * ADR-0228 (Decision-Domain Sensing Register, Cynefin, `RULE-DSN-01`, Schema
 * v186, CSV #174, `#/domain-sense`).
 *
 * The panel is deliberately matrixed: Leila reads on Dana's function line and
 * Kai reads on Omar's function line, so the domain can only be agreed across\n * two lines — one line alone can never state it. The suite drives the real\n * guarded API, store and post-commit spine; then checks the same stored bytes\n * through the kernel, the seat-scoped attention count, the DOM and the CSV.\n * No test writes a derived state.\n *
 * `RULE-DSN-01` is enforced in the reader (`buildDomainSense`), not by a new\n * post-commit spine rule: the shared spine stays at 140 rules and every\n * write re-proves its right inside the action.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, createEmptyState, MIGRATIONS, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';

let JSDOM = null;
// jsdom is not installed in every environment (there is no node_modules tree
// in this checkout); the DOM subtest below is skipped where it is absent — the
// pre-existing suggestion-wiring suite carries the same constraint.
try { JSDOM = (await import('jsdom')).JSDOM; } catch { /* skipped */ }
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDomainSense } from '../../app/core/domain/domainSense.js';
import { DSN_CSV_SCOPE, DSN_HREF, DSN_RIGHTS, DSN_RULE_ID } from '../../app/core/domain/domainSenseRegistry.js';
import { renderDomainSense } from '../../app/views/domain-sense.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const iso = '2026-01-01T09:00:00.000Z';
const title = 'Move the fixture reset into the prior cycle — is that a process fix or an experiment?';
const rationale = 'The panel sensed complicated: cause and effect are knowable by expert analysis, so the committed mode is expert analysis with a named capacity model, not a probe.';

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso };
}

function line(id, personId, managerId, kind) {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: iso, toISO: null, declaredAt: iso, note: '', status: 'active', history: [] };
}

function seed() {
  let currentNow = at('2026-11-16');
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Function', 'director', 'ceo'),
    person('omar', 'Omar Project', 'director', 'ceo'),
    person('leila', 'Leila Platform', 'manager', 'dana'),
    person('kai', 'Kai Delivery', 'manager', 'omar'),
    person('ria', 'Ria Platform', 'manager', 'dana'),
  person('lea2', 'Leila Direct Report', 'ic', 'leila'),
  person('kai2', 'Kai Direct Report', 'ic', 'kai'),
  person('ria2', 'Ria Direct Report', 'ic', 'ria'),
  ];
  raw.reportingLines = [
    line('rl-leila-dana', 'leila', 'dana', 'function'),
    line('rl-kai-omar', 'kai', 'omar', 'function'),
    line('rl-ria-dana', 'ria', 'dana', 'function'),
  ];
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
    storageSnapshot() { return values.get(STORAGE_KEY); },
  };
}


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

/* ---------------------------------------------------------------- schema + registration */

// Session 311 (Schema v187, ADR-0232) moved the version on by one and added a
// single spine rule. The ADR-0228 migration step under test is unchanged — it
// still takes 185 → 186 — so the step is asserted at 186 and the normalized
// workspace at the current version, rather than pinning the whole suite to the
// version ADR-0228 happened to ship at.
test('domain sense: the v186 step adds two empty ledgers, the spine carries ADR-0232 as well, and CSV #174 is registered', () => {
  assert.equal(SCHEMA_VERSION, 205, 'ADR-0252 (instrument look-back) is the current head');
  for (const key of ['domainDecisions', 'domainSenseActs']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is declared`);
  }
  const step = MIGRATIONS[185]({ schemaVersion: 185 });
  assert.equal(step.schemaVersion, 186);
  assert.deepEqual(step.domainDecisions, []);
  assert.deepEqual(step.domainSenseActs, []);
  const loaded = normalizeState(step, { now: at('2026-11-16') });
  assert.equal(loaded.state.schemaVersion, SCHEMA_VERSION, 'the migration chain carries the workspace to the current version');
  assert.deepEqual(loaded.state.domainDecisions, []);
  assert.deepEqual(loaded.state.domainSenseActs, []);
  assert.equal(normalizeState(createEmptyState(), { now: at('2026-11-16') }).state.schemaVersion, SCHEMA_VERSION);

  // RULE-DSN-01 is enforced in the reader, not by a post-commit rule: ADR-0228
  // added no spine rule and every rule keeps exactly one contract. The spine
  // stood at 152 through ADR-0238; ADR-0240 added `incidentCommandRule` and the
  // count moved to 154; ADR-0243 added `voiceRule` and the count moved to 156;
  // ADR-0247 added `authorisationRule` and the count moved to 160 — one contract per
  // rule, unchanged discipline.
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 163, 'the spine carries ADR-0250 (RULE-PROV-01) after ADR-0249');
  assert.equal(DEFAULT_POST_COMMIT_RULES.some((rule) => rule && rule.id === 'incidentCommandRule'), true, 'RULE-MIC-01 is on the spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES.some((rule) => rule && rule.id === 'mutualAidRule'), true, 'RULE-MAA-01 is on the spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES.some((rule) => rule && rule.id === 'domainSenseRule'), false, 'no new spine rule; refusals are reader refusals');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per spine rule');

  assert.ok(CSV_EXPORTS.some((row) => row.key === DSN_CSV_SCOPE));
  const index = CSV_EXPORTS.findIndex((row) => row.key === DSN_CSV_SCOPE);
  assert.ok(index > 0, 'CSV #174 is registered');
  assert.equal(CSV_EXPORTS[index - 1].key, 'improvement-suggestions', 'CSV #174 follows #173 in the register');
  assert.equal(CSV_EXPORTS[index].sensitive, true);
});

/* ---------------------------------------------------------------- matrix workflow end to end */

test('domain sense: declared cross-line panel, readings from two lines, owner commits, and the fit is read', () => {
  const env = seed();
  env.sit('dana');
  const declared = env.api.domainDeclare({
    title,
    ownerId: 'dana',
    panel: [
      { memberId: 'leila', lineId: 'rl-leila-dana' },
      { memberId: 'kai', lineId: 'rl-kai-omar' },
    ],
    senseInDays: 14,
  });
  assert.equal(declared.ok, true, JSON.stringify(declared));
  const decisionId = declared.decisionId;

  const stored = env.store.state.domainDecisions.find((row) => row.id === decisionId);
  assert.ok(stored, 'the declared decision is stored');
  assert.equal(stored.title, title);
  assert.equal(stored.ownerId, 'dana');
  assert.deepEqual(stored.panel, [
    { memberId: 'kai', lineId: 'rl-kai-omar' },
    { memberId: 'leila', lineId: 'rl-leila-dana' },
  ], 'the panel is stored exactly as declared, on declared lines (sorted by member)');
  assert.equal(env.store.state.domainSenseActs.length, 0, 'no acts until the panel reads');

  // Leila reads the domain on her line, with analysis evidence for complicated.
  env.sit('leila');
  const readLeila = env.api.domainAssess({
    decisionId,
    domain: 'complicated',
    lineId: 'rl-leila-dana',
    basis: { kind: 'analysis', analysisRef: 'capacity model CM-2026-11' },
  });
  assert.equal(readLeila.ok, true, JSON.stringify(readLeila));

  // The owner does not assess — she is not on the panel, and even if she were,
  // the owner never grades her own decision.
  env.sit('dana');
  const ownerRead = env.api.domainAssess({
    decisionId, domain: 'complicated', lineId: 'rl-leila-dana',
    basis: { kind: 'analysis', analysisRef: 'capacity model CM-2026-11' },
  });
  assert.equal(ownerRead.ok, false);
  assert.match(ownerRead.error, /not a declared member|owner does not assess/i);

  // Kai reads the same domain on his line. Two distinct lines, one domain.
  env.sit('kai');
  const readKai = env.api.domainAssess({
    decisionId,
    domain: 'complicated',
    lineId: 'rl-kai-omar',
    basis: { kind: 'analysis', analysisRef: 'capacity model CM-2026-11' },
  });
  assert.equal(readKai.ok, true, JSON.stringify(readKai));
  assert.equal(env.store.state.domainSenseActs.length, 2, 'two readings, append-only');

  // A second reading from Kai is refused and never overwrites the first.
  const again = env.api.domainAssess({
    decisionId, domain: 'complex', lineId: 'rl-kai-omar', basis: { kind: 'probe', probes: 1, observed: 'a pilot' },
  });
  assert.equal(again.ok, false);
  assert.match(again.error, /already recorded your reading/i);
  assert.equal(env.store.state.domainSenseActs.length, 2);

  // The kernel now states the domain, and the report is the stored record computed.
  const report = env.api.domainSenseReport();
  const row = report.rows.find((r) => r.id === decisionId);
  assert.ok(row, 'the decision is on the register');
  assert.equal(row.state, 'domain-agreed', 'two distinct lines naming one domain states it');
  assert.equal(row.domain, 'complicated');
  assert.equal(row.quorum.met, true);
  assert.equal(row.quorum.readings, 2);
  assert.equal(row.quorum.lines, 2);
  assert.equal(row.commit, null, 'nothing is committed yet');
  assert.equal(row.expectedMode, 'expert-analysis', 'complicated fits expert analysis');
  assert.equal(row.fit, 'owed', 'fit is owed until the owner commits');
  assert.equal(report.stateCountsReconcile, true);
  assert.equal(report.figuresComplete, true);

  // The owner commits the fitting mode.
  env.sit('dana');
  const committed = env.api.domainCommit({ decisionId, mode: 'expert-analysis', rationale });
  assert.equal(committed.ok, true, JSON.stringify(committed));
  assert.equal(env.store.state.domainSenseActs.length, 3);

  // A second commitment is refused and the first stands.
  const againCommit = env.api.domainCommit({ decisionId, mode: 'standard-practice', rationale: 'Actually, best practice.' });
  assert.equal(againCommit.ok, false);
  assert.match(againCommit.error, /first stands/i);
  assert.equal(env.store.state.domainSenseActs.length, 3);
  const after = env.api.domainSenseReport();
  const rowAfter = after.rows.find((r) => r.id === decisionId);
  assert.equal(rowAfter.commit.mode, 'expert-analysis', 'the first commitment stands');
  assert.equal(rowAfter.fit, 'fit', 'the committed mode fits the agreed domain');
});

test('domain sense: what one line alone cannot do — a panel on one line never states a domain', () => {
  const env = seed();
  env.sit('dana');
  const declared = env.api.domainDeclare({
    title: 'Same line, two members — no cross-line reading possible',
    ownerId: 'dana',
    panel: [
      { memberId: 'leila', lineId: 'rl-leila-dana' },
      { memberId: 'ria', lineId: 'rl-leila-dana' },
    ],
    senseInDays: 7,
  });
  assert.equal(declared.ok, true, JSON.stringify(declared));
  const decisionId = declared.decisionId;

  env.sit('leila');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'clear', lineId: 'rl-leila-dana', basis: { kind: 'precedent', cases: 5, note: 'Five rollouts, same outcome.' } }).ok, true);
  env.sit('ria');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'clear', lineId: 'rl-leila-dana', basis: { kind: 'precedent', cases: 4, note: 'Four rollouts, same outcome.' } }).ok, true);

  const report = env.api.domainSenseReport();
  const row = report.rows.find((r) => r.id === decisionId);
  assert.equal(row.state, 'awaiting-quorum');
  assert.match(row.reason, /panel-single-line/);
  assert.equal(row.domain, null, 'no domain is stated from one line');
  assert.equal(report.figuresComplete, true);
});

test('domain sense: a basis that does not support the domain is refused and never counted', () => {
  const env = seed();
  env.sit('dana');
  const declared = env.api.domainDeclare({
    title: 'Evidence must match the domain',
    ownerId: 'dana',
    panel: [
      { memberId: 'leila', lineId: 'rl-leila-dana' },
      { memberId: 'kai', lineId: 'rl-kai-omar' },
    ],
    senseInDays: 14,
  });
  assert.equal(declared.ok, true);
  const decisionId = declared.decisionId;

  env.sit('leila');
  const mismatched = env.api.domainAssess({
    decisionId, domain: 'complex', lineId: 'rl-leila-dana',
    basis: { kind: 'analysis', analysisRef: 'capacity model CM-1' }, // analysis cannot prove complexity: well-formed, wrong domain
  });
  assert.equal(mismatched.ok, true, 'the act is stored — the refusal is a read-time judgement');
  env.sit('kai');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'complex', lineId: 'rl-kai-omar', basis: { kind: 'probe', probes: 1, observed: 'a pilot cohort showed mixed results in week one' } }).ok, true);

  const report = env.api.domainSenseReport();
  const row = report.rows.find((r) => r.id === decisionId);
  assert.equal(row.state, 'awaiting-quorum');
  assert.equal(row.readings.length, 1, 'only the reading whose basis supports its domain is counted');
  assert.ok(report.refusals.some((refusal) => refusal.decisionId === decisionId && refusal.reason === 'basis-does-not-support-domain'), 'the refused reading is printed with its reason');
  assert.equal(row.domain, null, 'no domain is stated while quorum fails');
  assert.equal(report.figuresComplete, false, 'a refusal makes figures incomplete but it is printed, not dropped');
});

test('domain sense: attention counts what this seat owes, and the stored record survives reload', () => {
  const env = seed();
  env.sit('dana');
  const { decisionId } = env.api.domainDeclare({
    title: 'Reload keeps the declared decision and its acts',
    ownerId: 'dana',
    panel: [
      { memberId: 'leila', lineId: 'rl-leila-dana' },
      { memberId: 'kai', lineId: 'rl-kai-omar' },
    ],
    senseInDays: 14,
  });

  // Dana (the owner) owes the commitment; leila and kai each owe an assessment.
  env.sit('leila');
  assert.equal(env.api.domainSenseAttentionCount(), 1, 'the panel member owes the assessment');
  env.sit('kai');
  assert.equal(env.api.domainSenseAttentionCount(), 1, 'the panel member owes the assessment');
  env.sit('dana');
  assert.equal(env.api.domainSenseAttentionCount(), 1, 'the owner owes the commitment');

  env.sit('leila');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-leila-dana', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
  env.sit('kai');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-kai-omar', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
  env.sit('dana');
  assert.equal(env.api.domainCommit({ decisionId, mode: 'expert-analysis', rationale }).ok, true);
  env.sit('leila');
  assert.equal(env.api.domainSenseAttentionCount(), 0, 'nothing owed once the owner committed');

  // Stored == computed: the same stored bytes read back through the kernel.
  const first = env.api.domainSenseReport();
  const kernel = buildDomainSense(env.store.state, { now: env.now() });
  assert.deepEqual(first.rows, kernel.rows, 'the report is the pure computation from the stored record');
  assert.equal(first.stateCountsReconcile, true);
  assert.equal(first.figuresComplete, true);

  // Reload from the storage blob and recompute: identical.
  const values = new Map([[STORAGE_KEY, env.storageSnapshot()]]);

  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const reloaded = createStore({ storage, now: env.now, idFactory: (p) => `${p}-r` });
  reloaded.load();
  const reloadedApi = createApi(reloaded, { now: env.now, idFactory: (p) => `${p}-r` });
  const again = reloadedApi.domainSenseReport();
  assert.deepEqual(again.rows, first.rows, 'display == stored == computed across a reload');
  assert.equal(again.stateCountsReconcile, true);
  assert.equal(again.figuresComplete, true);
});

/* ---------------------------------------------------------------- DOM + CSV */

test('domain sense: the CSV export matches the reader and stays identity-free', () => {
  const env = seed();
  env.sit('dana');
  const { decisionId } = env.api.domainDeclare({
    title,
    ownerId: 'dana',
    panel: [
      { memberId: 'leila', lineId: 'rl-leila-dana' },
      { memberId: 'kai', lineId: 'rl-kai-omar' },
    ],
    senseInDays: 14,
  });
  env.sit('leila');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-leila-dana', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
  env.sit('kai');
  assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-kai-omar', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
  env.sit('dana');
  assert.equal(env.api.domainCommit({ decisionId, mode: 'expert-analysis', rationale }).ok, true);

  const report = env.api.domainSenseReport();
  const kernel = buildDomainSense(env.store.state, { now: env.now() });
  assert.deepEqual(report.rows, kernel.rows, 'the register reads exactly what the kernel computed');

  const payload = exportWorkspaceCsv(env.store.state, DSN_CSV_SCOPE, { now: env.now() });
  assert.equal(payload.ok, true, payload.error);
  const rows = parseCsv(payload.csv);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.ok(summary);
  // Summary row carries raw counts (not blanked); state/fit/domain rows blank below floor
  assert.equal(Number(summary.decisions), report.counts.decisions);
  const stateRow = rows.find((row) => row.row_kind === 'state' && row.state === 'domain-agreed');
  assert.ok(stateRow);
  if (report.counts.states['domain-agreed'] < 3) {
    assert.equal(stateRow.decisions, '', 'below-floor state count is blanked');
  } else {
    assert.equal(Number(stateRow.decisions), report.counts.states['domain-agreed']);
  }
  const fitRow = rows.find((row) => row.row_kind === 'fit' && row.fit === 'fit');
  assert.ok(fitRow);
  if (report.counts.fit['fit'] < 3) {
    assert.equal(fitRow.decisions, '', 'below-floor fit count is blanked');
  } else {
    assert.equal(Number(fitRow.decisions), report.counts.fit['fit']);
  }
  // No identity crosses the boundary: titles, ids, owners, lines, rationale.
  for (const privateValue of [title, decisionId, 'dana', 'leila', 'kai', 'rl-leila-dana', 'rl-kai-omar', rationale, 'capacity model CM-2026-11']) {
    assert.equal(payload.csv.includes(privateValue), false, `CSV omits private value ${privateValue}`);
  }
});

test('domain sense: the DOM renders the reader', async () => {
  if (!JSDOM) return; // jsdom is not installed in this environment
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost/#/domain-sense' });
  const prev = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, Event: globalThis.Event, CustomEvent: globalThis.CustomEvent };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    const env = seed();
    env.sit('dana');
    const { decisionId } = env.api.domainDeclare({
      title,
      ownerId: 'dana',
      panel: [
        { memberId: 'leila', lineId: 'rl-leila-dana' },
        { memberId: 'kai', lineId: 'rl-kai-omar' },
      ],
      senseInDays: 14,
    });
    env.sit('leila');
    assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-leila-dana', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
    env.sit('kai');
    assert.equal(env.api.domainAssess({ decisionId, domain: 'complicated', lineId: 'rl-kai-omar', basis: { kind: 'analysis', analysisRef: 'CM-1' } }).ok, true);
    env.sit('dana');
    assert.equal(env.api.domainCommit({ decisionId, mode: 'expert-analysis', rationale }).ok, true);

    const report = env.api.domainSenseReport();
    const ctx = {
      api: env.api,
      state: env.store.state,
      query: new URLSearchParams('view=rows'),
      navigate: () => {},
      refresh: () => {},
    };
    const panel = renderDomainSense(ctx);
    assert.ok(panel.querySelector(`[data-testid="dsn-row-${decisionId}"]`), 'the declared decision is rendered');
    const rowNode = panel.querySelector(`[data-testid="dsn-row-${decisionId}"]`);
    assert.equal(rowNode.getAttribute('data-state'), 'domain-agreed');
    const cell = (label) => rowNode.querySelector(`td[data-label="${label}"]`)?.textContent.trim();
    assert.ok(cell('Decision').includes(title));
    assert.ok(cell('Owner').includes('you'), 'owner sees themselves as you');
    assert.ok(cell('Fit vs mode').includes('fit'));
    const stats = Object.fromEntries([...panel.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    assert.equal(stats.Decisions, String(report.counts.decisions));
    const kernel = buildDomainSense(env.store.state, { now: env.now() });
    assert.deepEqual(report.rows, kernel.rows, 'the page prints exactly what the kernel computed from the stored record');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});