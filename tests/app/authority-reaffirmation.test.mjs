/**
 * tests/app/authority-reaffirmation.test.mjs — Frozen Authority Re-Affirmation
 * & Drift Settlement (ADR-0159, Schema v130, RULE-ACR-01, `#/matrix?panel=continuity`,
 * CSV scope #117 extended).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { authorityContinuityRule } from '../../app/core/domain/authorityContinuityRules.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildAuthorityContinuity,
  authorityContinuityBriefLines,
  authorityContinuityCsvRows,
} from '../../app/core/domain/authorityContinuity.js';
import { renderContinuityPanel } from '../../app/views/matrixContinuityPanel.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const ISO = NOW.toISOString();

function person(id, name, level, managerId = null) {
  return {
    id,
    name,
    role: 'Leader',
    level,
    managerId,
    status: 'active',
    startDate: '2024-01-01',
    createdAt: ISO,
  };
}

function baseRoster(over = {}) {
  return [
    person('vp', 'Vera VP', 'vp', null),
    person('dana', 'Dana Director', 'director', 'vp'),
    person('marcus', 'Marcus Director', 'director', 'vp'),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead', 'dana'),
    person('lee', 'Lee Engineer', 'lead', 'marcus'),
  ].map((p) => (over[p.id] ? { ...p, ...over[p.id] } : p));
}

function period(personId, managerId, fromISO, toISO = null) {
  return {
    id: `str-${personId}-${fromISO}`,
    personId,
    managerId,
    fromISO,
    toISO,
    recordedOn: fromISO,
    recordedBySeatId: null,
    source: 'observed-today',
    reason: 'Recorded structure.',
    at: `${fromISO}T00:00:00.000Z`,
  };
}

function baseHistory() {
  return [
    period('vp', '__leader__', '2026-01-01'),
    period('dana', 'vp', '2026-01-01'),
    period('marcus', 'vp', '2026-01-01'),
    period('priya', 'dana', '2026-01-01'),
    period('sam', 'dana', '2026-01-01'),
    period('lee', 'marcus', '2026-01-01'),
  ];
}

function projectLine(personId = 'sam', managerId = 'priya', over = {}) {
  return {
    id: `line-${personId}-${managerId}`,
    personId,
    managerId,
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: null,
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Matrix project line.',
    ...over,
  };
}

function decidedRecord({
  id = 'dec-drift',
  title = 'Approve Sam architecture mandate',
  approver = 'Marcus Director',
  decidedOn = '2026-10-05',
} = {}) {
  return {
    id,
    title,
    question: 'Should Sam own the migration gateway?',
    date: decidedOn,
    decidedOn,
    reversibility: 'reversible',
    driver: approver,
    approver,
    contributors: '',
    informed: '',
    options: [{ id: 'opt-1', label: 'Proceed', pros: 'Fast', cons: 'Load' }],
    chosen: 'Proceed',
    rationale: 'Aligned with Q4 milestone.',
    reviewOn: '2026-12-15',
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: 70,
    createdAt: ISO,
    portfolioNotes: [],
  };
}

function subjectLink(decisionId = 'dec-drift', personId = 'sam') {
  return {
    id: `lnk-${decisionId}-${personId}`,
    sourceType: 'decision',
    sourceId: decisionId,
    targetType: 'person',
    targetId: personId,
    relation: 'concerns',
    ruleId: '',
    summary: 'Decision concerns Sam.',
    createdOn: '2026-10-05',
    createdAt: ISO,
  };
}

function seed(rawState) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(rawState)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const store = createStore({
    storage,
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-${++seq}`,
  });
  store.load();
  const rawApi = createApi(store, {
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-${++seq}`,
  });
  const api = guardApi(rawApi, store, { now: () => NOW.getTime() });
  return { store, api, rawApi, storage };
}

function makeWorkspace({
  people = baseRoster(),
  history = baseHistory(),
  lines = [projectLine()],
  decisions = [],
  links = [],
  memos = [],
  settings = {},
} = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.structureHistory = history;
  state.reportingLines = lines;
  state.decisions = decisions;
  state.links = links;
  state.boardMemos = memos;
  state.settings = { ...state.settings, leaderName: 'Alex CEO', ...settings };
  return normalizeState(state, { now: NOW }).state;
}

test('schema v129 → v130 migrates to empty settlement ledgers and drops malformed settlements fail-closed', () => {
  assert.equal(SCHEMA_VERSION, 150);
  const legacy = { schemaVersion: 129, people: baseRoster(), settings: { authorityReaffirmDueDays: 999 } };
  const { raw, applied } = migrate(legacy);
  assert.deepEqual(applied, ['129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150']);
  assert.equal(raw.schemaVersion, 150);
  assert.deepEqual(raw.authorityReaffirmations, []);
  assert.deepEqual(raw.authorityReaffirmationMarkers, []);
  assert.equal(raw.settings.authorityReaffirmDueDays, 60);

  const doctored = createEmptyState(ISO);
  doctored.authorityReaffirmations = [
    null,
    { id: 'bad-no-authorities', recordType: 'decision', recordId: 'dec-1', outcome: 'stand-behind', decidedOn: '2026-11-10', decidedBySeatId: 'dana', underAuthorityIds: [], reason: 'Valid length reason.' },
    { id: 'bad-short-reason', recordType: 'decision', recordId: 'dec-1', outcome: 'stand-behind', decidedOn: '2026-11-10', decidedBySeatId: 'dana', underAuthorityIds: ['dana'], reason: 'ok' },
    { id: 'good-act', recordType: 'decision', recordId: 'dec-1', outcome: 'stand-behind', decidedOn: '2026-11-10', decidedBySeatId: 'dana', underAuthorityIds: ['dana'], reason: 'Confirmed under Dana home line.' },
  ];
  const normalized = normalizeState(doctored, { now: NOW });
  assert.equal(normalized.state.authorityReaffirmations.length, 1);
  assert.equal(normalized.state.authorityReaffirmations[0].id, 'good-act');
  assert.ok(normalized.warnings.length >= 3, 'every dropped settlement row emits an explicit warning');
});

test('standing behind a drifted record preserves original verdict & populationClaim while granting reconciledClaim once complete', () => {
  const state = makeWorkspace({
    decisions: [
      decidedRecord({ id: 'dec-drift', approver: 'Marcus Director' }),
      decidedRecord({ id: 'dec-ok-1', approver: 'Dana Director' }),
      decidedRecord({ id: 'dec-ok-2', approver: 'Dana Director' }),
    ],
    links: [
      subjectLink('dec-drift', 'sam'),
      subjectLink('dec-ok-1', 'sam'),
      subjectLink('dec-ok-2', 'sam'),
    ],
  });
  const ctx = seed(state);

  const beforeDecisionJson = JSON.stringify(ctx.store.state.decisions);
  const initial = buildAuthorityContinuity(ctx.store.state, { now: NOW });
  assert.equal(initial.driftedN, 1);
  assert.equal(initial.unsettledDriftedN, 1);
  assert.equal(initial.populationClaim, false);
  assert.equal(initial.reconciledClaim, false);

  // Marcus does NOT hold performance over Sam today (Dana does) — Marcus must be refused.
  ctx.store.update((d) => { d.settings.activeSeatId = 'marcus'; });
  const refusedMarcus = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-drift',
    reason: 'Trying to sign off on a line I do not hold.',
  });
  assert.equal(refusedMarcus.ok, false);
  assert.match(refusedMarcus.error, /currently holds the relevant right|operating span/i);

  // Dana holds performance over Sam today — Dana may stand behind it.
  ctx.store.update((d) => { d.settings.activeSeatId = 'dana'; });
  const ok = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-drift',
    reason: 'Reviewed gateway mandate with Sam; stands under home engineering line.',
  });
  assert.equal(ok.ok, true);

  // Frozen decision record itself is untouched byte-for-byte.
  assert.equal(JSON.stringify(ctx.store.state.decisions), beforeDecisionJson);

  ctx.store.update((d) => { d.settings.activeSeatId = null; });
  const after = buildAuthorityContinuity(ctx.store.state, { now: NOW });
  assert.equal(after.driftedN, 1, 'driftedN is never rewritten');
  assert.equal(after.settledN, 1);
  assert.equal(after.unsettledDriftedN, 0);
  assert.equal(after.populationClaim, false, 'structural populationClaim remains refused');
  assert.equal(after.reconciledClaim, true, 'reconciledClaim is granted once all drift is stood behind');
});

test('unreadable, unattributed, and already-attributable records are refused — never papered over', () => {
  const state = makeWorkspace({
    decisions: [
      decidedRecord({ id: 'dec-ok', approver: 'Dana Director' }),
      decidedRecord({ id: 'dec-ghost', approver: 'Nonexistent Person' }),
      decidedRecord({ id: 'dec-blank', approver: '' }),
    ],
    links: [subjectLink('dec-ok', 'sam')],
  });
  const ctx = seed(state);

  const rOk = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-ok',
    reason: 'Already attributable record.',
  });
  assert.equal(rOk.ok, false);
  assert.match(rOk.error, /not drifted/i);

  const rGhost = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-ghost',
    reason: 'Attempting to paper over unreadable approver.',
  });
  assert.equal(rGhost.ok, false);
  assert.match(rGhost.error, /unreadable record cannot be settled/i);

  const rBlank = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-blank',
    reason: 'Attempting to supply missing approver retroactively.',
  });
  assert.equal(rBlank.ok, false);
  assert.match(rBlank.error, /unattributed record named no authority/i);
});

test('subsequent live-matrix shift turns an earlier settlement STALE rather than carrying it to a new holder', () => {
  const state = makeWorkspace({
    decisions: [
      decidedRecord({ id: 'dec-drift', approver: 'Marcus Director' }),
      decidedRecord({ id: 'dec-2', approver: 'Dana Director' }),
      decidedRecord({ id: 'dec-3', approver: 'Dana Director' }),
    ],
    links: [
      subjectLink('dec-drift', 'sam'),
      subjectLink('dec-2', 'sam'),
      subjectLink('dec-3', 'sam'),
    ],
  });
  const ctx = seed(state);

  assert.equal(ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-drift',
    reason: 'Dana stands behind Sam mandate while holding performance right.',
  }).ok, true);
  assert.equal(buildAuthorityContinuity(ctx.store.state, { now: NOW }).reconciledClaim, true);

  // Now Priya's project line is granted the `performance` right too, contesting it with Dana!
  ctx.store.update((draft) => {
    draft.reportingLines[0].rights = ['performance'];
  }, { type: 'matrix.line.retuned', entity: 'matrix', entityId: 'line-sam-priya', summary: 'Retuned rights' });

  const afterMove = buildAuthorityContinuity(ctx.store.state, { now: NOW });
  const driftedRow = afterMove.rows.find((r) => r.recordId === 'dec-drift');
  assert.equal(driftedRow.settlement, 'stale', 'prior settlement under [dana] is now stale under [dana, priya]');
  assert.equal(afterMove.staleN, 1);
  assert.equal(afterMove.settledN, 0);
  assert.equal(afterMove.reconciledClaim, false);
});

test('contested multi-line authority refuses unilateral line-holder sign-off and requires joint matrix principal', () => {
  const state = makeWorkspace({
    lines: [
      projectLine('sam', 'marcus', { rights: ['performance'] }),
    ],
    decisions: [
      decidedRecord({ id: 'dec-contested', approver: 'Priya PM' }),
    ],
    links: [subjectLink('dec-contested', 'sam')],
  });
  const ctx = seed(state);

  // Sam's performance right is held by BOTH Dana (home) and Marcus (project line); their joint apex is `vp` (Vera VP).
  ctx.store.update((d) => { d.settings.activeSeatId = 'dana'; });
  const danaTry = ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-contested',
    reason: 'Dana trying to settle contested right unilaterally.',
  });
  assert.equal(danaTry.ok, false);
  assert.match(danaTry.error, /multiple managers|joint matrix principal/i);

  // Vera VP sits at `matrixJointApex(['dana', 'marcus'])` — Vera can refer it to re-open!
  ctx.store.update((d) => { d.settings.activeSeatId = 'vp'; });
  const vpRefer = ctx.api.authorityReaffirmRefer({
    recordType: 'decision',
    recordId: 'dec-contested',
    reason: 'Dana and Marcus both claim performance stewardship; re-open charter scope.',
  });
  assert.equal(vpRefer.ok, true);
  assert.ok(vpRefer.referralDecisionId);

  const opened = ctx.store.state.decisions.find((d) => d.id === vpRefer.referralDecisionId);
  assert.ok(opened, 'governed re-decision opened');
  assert.equal(opened.chosen, '', 'referral decision is open for DACI deliberation');

  ctx.store.update((d) => { d.settings.activeSeatId = null; });
  const r = buildAuthorityContinuity(ctx.store.state, { now: NOW });
  assert.equal(r.referredN, 1);
  assert.equal(r.reconciledClaim, false, 'referred record is in re-decision, not affirmed as standing');
});

test('RULE-ACR-01 issues idempotent reconciliation task, closes it on settlement, and refuses to guess on diamond ties', () => {
  // 1. Parity on post-commit spine
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(authorityContinuityRule);
  assert.ok(idx >= 0, 'authorityContinuityRule registered on postCommit spine');
  assert.ok(DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule') > idx, 'runs before seatRule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === authorityContinuityRule);
  assert.ok(contract, '1:1 propagation contract entry exists');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'authorityReaffirmationMarkers']);

  // 2. Scan issues exactly one delegation to unique current holder (`dana`), idempotent on re-scan, closed when settled
  const state = makeWorkspace({
    decisions: [decidedRecord({ id: 'dec-drift', approver: 'Marcus Director' })],
    links: [subjectLink('dec-drift', 'sam')],
  });
  const ctx = seed(state);

  assert.equal(ctx.api.authorityContinuityScan().ok, true);
  const tasks1 = ctx.store.state.delegations.filter((d) => d.title.includes('Settle drifted decision'));
  assert.equal(tasks1.length, 1);
  assert.equal(tasks1[0].personId, 'dana');

  // Re-scan does not duplicate
  assert.equal(ctx.api.authorityContinuityScan().ok, true);
  const tasks2 = ctx.store.state.delegations.filter((d) => d.title.includes('Settle drifted decision'));
  assert.equal(tasks2.length, 1);

  // Standing behind closes the reconciliation task automatically
  assert.equal(ctx.api.authorityReaffirmStandBehind({
    recordType: 'decision',
    recordId: 'dec-drift',
    reason: 'Confirmed with Sam on engineering home line.',
  }).ok, true);
  const closed = ctx.store.state.delegations.find((d) => d.id === tasks1[0].id);
  assert.equal(closed.status, 'done');

  // 3. Matrix diamond tie: two top-level VPs (`vpA`, `vpB`) each co-lead contesting managers (`dana`, `marcus`) via cross-lines!
  const diamondPeople = [
    person('vpA', 'VP Alpha', 'vp', null),
    person('vpB', 'VP Beta', 'vp', null),
    person('dana', 'Dana Director', 'director', 'vpA'),
    person('marcus', 'Marcus Director', 'director', 'vpB'),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead', 'dana'),
  ];
  const diamondLines = [
    projectLine('dana', 'vpB', { id: 'line-dana-vpB', shareH: 20 }),
    projectLine('marcus', 'vpA', { id: 'line-marcus-vpA', shareH: 20 }),
    projectLine('sam', 'marcus', { id: 'line-sam-marcus', rights: ['performance'] }),
  ];
  const diamondHistory = [
    period('vpA', '__leader__', '2026-01-01'),
    period('vpB', '__leader__', '2026-01-01'),
    period('dana', 'vpA', '2026-01-01'),
    period('marcus', 'vpB', '2026-01-01'),
    period('priya', 'dana', '2026-01-01'),
    period('sam', 'dana', '2026-01-01'),
  ];
  const diamondCtx = seed(makeWorkspace({
    people: diamondPeople,
    history: diamondHistory,
    lines: diamondLines,
    decisions: [decidedRecord({ id: 'dec-diamond', approver: 'Priya PM' })],
    links: [subjectLink('dec-diamond', 'sam')],
  }));
  const diamondReport = buildAuthorityContinuity(diamondCtx.store.state, { now: NOW });
  assert.equal(diamondReport.ambiguousApexN, 1, 'diamond tie between vpA and vpB is detected');
  assert.equal(diamondCtx.api.authorityContinuityScan().ok, true);
  const guessedTasks = diamondCtx.store.state.delegations.filter((d) => d.title.includes('dec-diamond') || d.title.includes('Approve Sam'));
  assert.equal(guessedTasks.length, 0, 'RULE-ACR-01 refuses to guess between tied joint principals');
});

test('CSV export, brief, seat name-withholding, and interactive panel stay 100% consistent with stored state', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;

  try {
    const state = makeWorkspace({
      decisions: [
        decidedRecord({ id: 'dec-drift', approver: 'Marcus Director' }),
        decidedRecord({ id: 'dec-2', approver: 'Dana Director' }),
        decidedRecord({ id: 'dec-3', approver: 'Dana Director' }),
      ],
      links: [
        subjectLink('dec-drift', 'sam'),
        subjectLink('dec-2', 'sam'),
        subjectLink('dec-3', 'sam'),
      ],
    });
    const ctx = seed(state);

    // Interactive DOM settlement through `renderContinuityPanel`
    let rerendered = 0;
    const panel1 = renderContinuityPanel(
      { api: ctx.api, state: ctx.store.state, rerender: () => { rerendered += 1; } },
      { now: NOW },
    );
    const input = panel1.querySelector('[data-reaffirm-reason="decision:dec-drift"]');
    const standBtn = panel1.querySelector('[data-reaffirm-stand="decision:dec-drift"]');
    assert.ok(input && standBtn, 'interactive settlement controls render for drifted row');
    input.value = 'Confirmed with Sam during Q4 matrix review.';
    standBtn.click();
    assert.equal(rerendered, 1);

    // Reload store from serialized JSON and verify displayed == computed == exported
    const reloaded = seed(JSON.parse(ctx.storage.getItem(STORAGE_KEY)));
    const report = buildAuthorityContinuity(reloaded.store.state, { now: NOW });
    assert.equal(report.settledN, 1);
    assert.equal(report.reconciledClaim, true);

    const panel2 = renderContinuityPanel({ api: reloaded.api, state: reloaded.store.state }, { now: NOW });
    assert.match(panel2.textContent, /Reconciled continuity claim GRANTED/);
    assert.ok(panel2.textContent.includes(report.reconciledClaimReason));

    // Scoped seat (`priya` holds Sam on project line; `dana` is outside Priya's downward span!)
    reloaded.store.update((d) => { d.settings.activeSeatId = 'priya'; });
    const priyaRes = reloaded.api.authorityContinuityReport();
    assert.equal(priyaRes.ok, true);
    const scopedRow = priyaRes.report.rows.find((r) => r.recordId === 'dec-drift');
    assert.equal(scopedRow.reaffirmation.decidedByWithheld, true, 'outside-span settler name is withheld');
    assert.equal(scopedRow.reaffirmation.decidedByName, null);

    // CSV & brief carry zero names and zero record ids
    reloaded.store.update((d) => { d.settings.activeSeatId = null; });
    const csvRes = exportWorkspaceCsv(reloaded.store.state, 'authority-continuity', { now: NOW });
    assert.equal(csvRes.ok, true);
    for (const forbidden of ['Dana', 'Marcus', 'Priya', 'Sam', 'dec-drift', 'Confirmed with Sam']) {
      assert.ok(!csvRes.csv.includes(forbidden), `CSV must not leak "${forbidden}"`);
    }
    const parsed = parseCsv(csvRes.csv);
    const summary = Object.fromEntries(parsed.headers.map((h, i) => [h, parsed.rows[0][i]]));
    assert.equal(summary.drifted_n, '1');
    assert.equal(summary.drifted_settled_n, '1');
    assert.equal(summary.drifted_unsettled_n, '0');
    assert.equal(summary.population_claim, 'refused');
    assert.equal(summary.reconciled_claim, 'granted');
    assert.equal(summary.reconciles, 'yes');

    const briefText = authorityContinuityBriefLines(report).join('\n');
    for (const forbidden of ['Dana', 'Marcus', 'Priya', 'Sam', 'dec-drift']) {
      assert.ok(!briefText.includes(forbidden));
    }
    assert.equal(authorityContinuityCsvRows(report)[0].reconciled_claim, 'granted');
  } finally {
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
  }
});
