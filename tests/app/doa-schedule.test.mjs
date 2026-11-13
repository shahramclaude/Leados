/**
 * tests/app/doa-schedule.test.mjs — Standing Delegation-of-Authority (DoA)
 * Schedule & Cross-Line Limit Conformance (ADR-0174, Schema v138,
 * `RULE-DOA-01`, `#/matrix?panel=authority`, CSV scope #128).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES, runPostCommitRules } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildDoaReport,
  doaBriefText,
  doaCsvRows,
} from '../../app/core/domain/doaSchedule.js';
import {
  DOA_CSV_COLUMNS,
  DOA_EVENTS,
  DOA_RULE_ID,
} from '../../app/core/domain/doaScheduleRegistry.js';
import { amountToCents, centsToFixed } from '../../app/core/domain/doaScheduleSchema.js';
import { doaScheduleRule } from '../../app/core/domain/doaScheduleRules.js';
import { renderMatrixDoaPanel } from '../../app/views/matrixDoaPanel.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ISO = NOW.toISOString();

function fakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

function person(id, name, level, managerId = null) {
  return {
    id,
    name,
    role: level === 'ic' ? 'Engineer' : 'Leader',
    level,
    managerId,
    status: 'active',
    startDate: '2025-01-01',
    createdAt: ISO,
  };
}

function line(id, personId, managerId, kind, shareH, extra = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    shareH,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: ISO,
    declaredBySeatId: null,
    history: [],
    status: 'active',
    ...extra,
  };
}

function makeHarness(seedFn, clockDate = NOW) {
  let currentNow = clockDate;
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => currentNow });
  store.load();
  if (seedFn) {
    store.update((draft) => seedFn(draft), { type: 'test.seed', entity: 'workspace', entityId: 'seed', summary: 'seed' });
  }
  const api = createApi(store, { now: () => currentNow });
  return {
    storage,
    store,
    api,
    setNow(nextDate) { currentNow = nextDate; },
  };
}

function seedMatrixOrg(draft) {
  draft.people = [
    person('ceo', 'Celia Chief', 'vp', null),
    person('vpFin', 'Victor VP', 'vp', 'ceo'),
    person('dana', 'Dana Director', 'director', 'vpFin'),
    person('priya', 'Priya Project', 'director', 'vpFin'),
    person('mgrA', 'Maya Manager', 'manager', 'dana'),
    person('sam', 'Sam Shared', 'ic', 'mgrA'),
  ];
  draft.reportingLines = [
    line('ln-sam-priya', 'sam', 'priya', 'project', 40, { rights: ['budget'] }),
  ];
}

/* =====================================================================
 * 1. REGISTRATION, SCHEMA v138, EXACT INTEGER CENTS & FAIL-CLOSED LOAD
 * ===================================================================== */

test('registration, Schema v138 additive migration, exact integer-cents conversion and fail-closed load', () => {
  assert.equal(SCHEMA_VERSION, 149);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'authority'), 'authority panel registered in MATRIX_PANELS');
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'matrix-doa' && s.sensitive === false));
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(doaScheduleRule));
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule === doaScheduleRule && c.module === 'doaScheduleRules.js'));
  assert.ok(RECORD_POLICIES.doaSchedule && RECORD_POLICIES.doaMarkers);
  assert.ok(ACTION_RIGHTS['declare-doa-limit'] && ACTION_RIGHTS['govern-doa-schedule']);
  assert.ok(SAFE_READS.has('doaReport') && SAFE_READS.has('doaCsvRows') && SAFE_READS.has('doaBriefText'));

  // Exact integer-cents arithmetic: 19.99 * 100 float pitfalls avoided
  assert.equal(amountToCents('19.99'), 1999);
  assert.equal(amountToCents(19.99), 1999);
  assert.equal(amountToCents(0), 0);
  assert.equal(amountToCents(-5), null);
  assert.equal(amountToCents(NaN), null);
  assert.equal(centsToFixed(1999), '19.99');
  assert.equal(centsToFixed(5000000), '50000.00');

  // Additive migration 137 -> 138 invents zero limits
  const legacy = { schemaVersion: 137, people: [person('ceo', 'Celia', 'vp', null)], settings: { doaAskDueDays: 999 } };
  const { raw, applied } = migrate(legacy);
  assert.deepEqual(applied, ['137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.equal(raw.schemaVersion, 149);
  assert.deepEqual(raw.doaSchedule, []);
  assert.deepEqual(raw.doaMarkers, []);
  assert.equal(raw.settings.doaAskDueDays, 60, 'clamped to upper bound 60');
  assert.equal(raw.settings.doaAutoPropagate, true);

  // Fail-closed normalizer drops forged/malformed schedule acts with printed warnings
  const doctored = createEmptyState(ISO);
  doctored.doaSchedule = [
    null,
    { id: 'bad-float', kind: 'declare', seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limitCents: 12.5, effectiveFrom: '2026-01-01', decidedBySeatId: 'leader', decidedOn: '2026-01-01', reason: 'Bad non-integer cents.' },
    { id: 'bad-curr', kind: 'declare', seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'US', limitCents: 1000, effectiveFrom: '2026-01-01', decidedBySeatId: 'leader', decidedOn: '2026-01-01', reason: 'Bad ISO code.' },
    { id: 'good-1', kind: 'declare', seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limitCents: 2500000, effectiveFrom: '2026-01-01', decidedBySeatId: 'leader', decidedOn: '2026-01-01', decidedAt: ISO, reason: 'Charter Q1 signing schedule.' },
  ];
  const normRes = normalizeState(doctored, { now: NOW });
  assert.equal(normRes.state.doaSchedule.length, 1);
  assert.equal(normRes.state.doaSchedule[0].id, 'good-1');
  assert.ok(normRes.warnings.some((w) => w.includes('Delegation-of-authority schedule')), 'malformed DoA acts emit load warnings');
});

/* =====================================================================
 * 2. STANDING GUARDS: ANTI-SELF-GRANT, DOWNWARD SPAN & GRANT-TIME NEMO DAT
 * ===================================================================== */

test('doaDeclareLimit enforces anti-self-grant, downward DAG span, grant-time nemo dat, overlap refusal and as-of retirement', () => {
  const h = makeHarness(seedMatrixOrg);

  // Operator seeds CEO ($500,000) and VP ($200,000)
  assert.equal(h.api.doaDeclareLimit({
    seatId: 'ceo', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 500000, effectiveFrom: '2026-01-01', reason: 'Board charter CEO signing authority.',
  }).ok, true);
  assert.equal(h.api.doaDeclareLimit({
    seatId: 'vpFin', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 200000, effectiveFrom: '2026-01-01', reason: 'CEO delegation to VP Finance.',
  }).ok, true);

  // Act as vpFin:
  h.api.setActiveSeat('vpFin');

  // 1. Self-grant MUST be refused
  const selfTry = h.api.doaDeclareLimit({
    seatId: 'vpFin', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 300000, effectiveFrom: '2026-01-01', reason: 'Trying to raise my own limit.',
  });
  assert.equal(selfTry.ok, false);
  assert.match(selfTry.error, /Self-grant refused/i);

  // 2. Upward / peer grant MUST be refused
  const upTry = h.api.doaDeclareLimit({
    seatId: 'ceo', lineKind: 'any-line', scopeClass: 'opex', currency: 'USD', limit: 50000, effectiveFrom: '2026-01-01', reason: 'Trying to grant upward to CEO.',
  });
  assert.equal(upTry.ok, false);
  assert.match(upTry.error, /downward reporting or matrix span/i);

  // 3. Grant-time nemo dat: vpFin holds $200,000 USD, cannot grant $250,000 USD to dana!
  const nemoTry = h.api.doaDeclareLimit({
    seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 250000, effectiveFrom: '2026-01-01', reason: 'Exceeding VP ceiling.',
  });
  assert.equal(nemoTry.ok, false);
  assert.match(nemoTry.error, /Nemo dat quod non habet/i);

  // 4. Grant-time currency nemo dat: vpFin holds NO EUR schedule, cannot grant EUR to dana!
  const eurNemo = h.api.doaDeclareLimit({
    seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'EUR', limit: 10000, effectiveFrom: '2026-01-01', reason: 'Granting unheld EUR.',
  });
  assert.equal(eurNemo.ok, false);
  assert.match(eurNemo.error, /Nemo dat quod non habet/i);

  // 5. Lawful downward grant within ceiling succeeds ($100,000 <= $200,000)
  const okDana = h.api.doaDeclareLimit({
    seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 100000, effectiveFrom: '2026-01-01', reason: 'VP delegation to Dana Director.',
  });
  assert.equal(okDana.ok, true);

  // 6. Overlapping duplicate declaration at same specificity is refused until retired
  const dupDana = h.api.doaDeclareLimit({
    seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 80000, effectiveFrom: '2026-06-01', reason: 'Overlapping window without retirement.',
  });
  assert.equal(dupDana.ok, false);
  assert.match(dupDana.error, /overlaps this window/i);

  // 7. Retire effective 2026-06-01, then declare new $80,000 from 2026-06-01 -> succeeds!
  const retDana = h.api.doaRetireLimit({
    targetLimitId: okDana.act.id,
    retiredOn: '2026-06-01',
    reason: 'Mid-year signing ceiling recalibration.',
  });
  assert.equal(retDana.ok, true);

  const nextDana = h.api.doaDeclareLimit({
    seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 80000, effectiveFrom: '2026-06-01', reason: 'H2 signing schedule for Dana.',
  });
  assert.equal(nextDana.ok, true);
});

/* =====================================================================
 * 3. MANDATE NEMO-DAT, BUDGETS, DECISIONS, CROSS-LINE ANTI-SPLITTING & COVER
 * ===================================================================== */

test('evaluates mandates, budgets & decisions as-of commitment day; catches nemo-dat, cross-line anti-splitting, covering ties & refusals', () => {
  const h = makeHarness((draft) => {
    seedMatrixOrg(draft);
    draft.cases = [
      { id: 'case-1', title: 'GPU capacity spike', ownerId: 'sam', status: 'open', severity: 'high', createdAt: ISO },
    ];
    // Commitments across all 3 canonical object classes (`normalizeMandates`, `normalizeBudgets`, `normalizeDecisions`):
    draft.decisions = [
      {
        id: 'dec-prose',
        title: 'Adopt trunk-based release branch naming',
        decidedOn: '2026-10-01',
        chosen: 'Use release/YYYY.MM tags',
        approver: 'Dana Director',
        driver: 'Maya Manager',
        createdAt: ISO,
      },
      {
        id: 'dec-split',
        title: 'Contract external load-testing vendor for shared project',
        decidedOn: '2026-10-20',
        chosen: 'Engage LoadLab at $22k',
        approver: 'Priya Project',
        driver: 'Sam Shared',
        createdAt: ISO,
      },
      {
        id: 'dec-mixed',
        title: 'Cross-border vendor settlement',
        decidedOn: '2026-10-22',
        chosen: 'Bundle USD and EUR pools',
        approver: 'Dana Director',
        driver: 'Maya Manager',
        createdAt: ISO,
      },
    ];

    // (A) Canonical `normalizeMandates` spending mandates (linked to `case-1` so `dec-prose` remains unlinked):
    //   - `mnd-nemo`: granted by `mgrA` ($25k ceiling) to `sam` ($10k ceiling) for $40k -> NEMO DAT breach!
    //   - `mnd-ok`: granted by `dana` ($100k ceiling) to `mgrA` ($25k ceiling) for $20k -> conformant!
    draft.mandates = [
      {
        id: 'mnd-nemo',
        title: 'Cloud GPU burst contract',
        sourceType: 'case',
        sourceId: 'case-1',
        fromSeatId: 'mgrA',
        toSeatId: 'sam',
        peopleIds: ['sam'],
        direction: 'down',
        outcome: 'Provision burst GPU cluster within sprint window',
        actions: ['spend'],
        spendCeiling: 40000,
        currency: 'USD',
        effortDays: 10,
        status: 'accepted',
        createdAt: '2026-10-15T10:00:00.000Z',
        createdOn: '2026-10-15',
        expiresOn: '2026-12-31',
        acceptedAt: '2026-10-15T12:00:00.000Z',
        history: [
          { at: '2026-10-15T10:00:00.000Z', status: 'proposed', actorSeatId: 'mgrA', note: 'Proposed' },
          { at: '2026-10-15T12:00:00.000Z', status: 'accepted', actorSeatId: 'sam', note: 'Accepted' },
        ],
      },
      {
        id: 'mnd-ok',
        title: 'Team tooling renewal',
        sourceType: 'case',
        sourceId: 'case-1',
        fromSeatId: 'dana',
        toSeatId: 'mgrA',
        peopleIds: ['mgrA'],
        direction: 'down',
        outcome: 'Annual CI license renewal',
        actions: ['spend'],
        spendCeiling: 20000,
        currency: 'USD',
        effortDays: 5,
        status: 'accepted',
        createdAt: '2026-10-16T10:00:00.000Z',
        createdOn: '2026-10-16',
        expiresOn: '2026-12-31',
        acceptedAt: '2026-10-16T12:00:00.000Z',
        history: [
          { at: '2026-10-16T10:00:00.000Z', status: 'proposed', actorSeatId: 'dana', note: 'Proposed' },
          { at: '2026-10-16T12:00:00.000Z', status: 'accepted', actorSeatId: 'mgrA', note: 'Accepted' },
        ],
      },
    ];

    // (B) Canonical `normalizeBudgets` envelopes sponsored by `dana` ($100k USD ceiling):
    //   - `bl-ok`: $60,000 USD tools-software (`opex`) -> conformant
    //   - `bl-apex`: $600,000 USD facilities-equipment (`capex`) -> exceeds even CEO ($500k) -> `over-limit` with `above-apex`!
    //   - `bl-eur`: €15,000 EUR vendors-services (`vendor`) -> `currency-mismatch` against dana's USD-only schedule!
    draft.budgets = [
      {
        id: 'bdg-usd',
        name: 'Platform FY26 USD',
        currency: 'USD',
        startsOn: '2026-01-01',
        endsOn: '2026-12-31',
        ownerId: 'dana',
        limit: 800000,
        lines: [
          { id: 'bl-ok', title: 'Observability SaaS', category: 'tools-software', committedAmount: 60000, committedOn: '2026-09-10', status: 'committed', sourceType: 'decision', sourceId: 'dec-mixed' },
          { id: 'bl-apex', title: 'Data center acquisition', category: 'facilities-equipment', committedAmount: 600000, committedOn: '2026-09-12', status: 'committed' },
        ],
        createdAt: ISO,
      },
      {
        id: 'bdg-eur',
        name: 'EU Contractor Pool',
        currency: 'EUR',
        startsOn: '2026-01-01',
        endsOn: '2026-12-31',
        ownerId: 'dana',
        limit: 50000,
        lines: [
          { id: 'bl-eur', title: 'Berlin audit retainer', category: 'vendors-services', committedAmount: 15000, committedOn: '2026-09-15', status: 'committed', sourceType: 'decision', sourceId: 'dec-mixed' },
        ],
        createdAt: ISO,
      },
    ];

    draft.links = [
      { id: 'lnk-1', sourceType: 'decision', sourceId: 'dec-split', targetType: 'person', targetId: 'sam', relation: 'affects', createdAt: ISO },
    ];
  });

  // Declare standing schedule (operator):
  h.api.doaDeclareLimit({ seatId: 'ceo', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 500000, effectiveFrom: '2026-01-01', reason: 'CEO charter limit.' });
  h.api.doaDeclareLimit({ seatId: 'vpFin', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 200000, effectiveFrom: '2026-01-01', reason: 'VP Finance limit.' });
  h.api.doaDeclareLimit({ seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 100000, effectiveFrom: '2026-01-01', reason: 'Dana functional limit.' });
  h.api.doaDeclareLimit({ seatId: 'priya', lineKind: 'project', scopeClass: 'general', currency: 'USD', limit: 15000, effectiveFrom: '2026-01-01', reason: 'Priya project ceiling.' });
  h.api.doaDeclareLimit({ seatId: 'mgrA', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 25000, effectiveFrom: '2026-01-01', reason: 'Maya manager ceiling.' });
  h.api.doaDeclareLimit({ seatId: 'sam', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 10000, effectiveFrom: '2026-01-01', reason: 'Sam IC purchase card ceiling.' });

  // Explicitly price `dec-split` at $22,000 USD
  const priced = h.api.doaPriceDecision({
    decisionId: 'dec-split',
    scopeClass: 'vendor',
    currency: 'USD',
    amount: 22000,
    reason: 'Signed SOW quote for LoadLab engagement.',
  });
  assert.equal(priced.ok, true);

  const report = h.api.doaReport({ now: NOW }).report;
  const b = report.board;

  // Exact partition reconciliation MUST hold, while figuresComplete is FALSE (due to mixed-currency + EUR mismatch)!
  assert.equal(b.countsReconcile, true, 'all 8 partition identities reconcile');
  assert.equal(b.figuresComplete, false, 'mixed-currency refusal + EUR currency mismatch make figures incomplete');
  assert.equal(b.conformancePermille, null, 'conformance rate withheld when any item is refused or currency-mismatched');
  assert.equal(b.untypedDecisionsN, 1, 'non-monetary prose decision skipped without prose parsing');
  assert.equal(b.recordRefusedN, 1, 'dec-mixed refused for mixed-currency');
  assert.equal(report.refusals.find((r) => r.key === 'mixed-currency')?.count, 1);

  // Check individual verdicts:
  const byId = new Map(report.allRows.map((r) => [r.recordId, r]));
  assert.equal(byId.get('mnd-nemo').verdict, 'breach');
  assert.equal(byId.get('mnd-nemo').breachClass, 'nemo-dat');
  assert.equal(byId.get('mnd-nemo').cover.state, 'unique');
  assert.equal(byId.get('mnd-nemo').cover.rawSeatIds[0], 'dana', 'Dana ($100k) is the minimal covering principal above mgrA ($25k)');

  assert.equal(byId.get('mnd-ok').verdict, 'conformant');
  assert.equal(byId.get('bdg-usd:bl-ok').verdict, 'conformant');

  assert.equal(byId.get('bdg-usd:bl-apex').verdict, 'breach');
  assert.equal(byId.get('bdg-usd:bl-apex').breachClass, 'over-limit');
  assert.equal(byId.get('bdg-usd:bl-apex').cover.state, 'above-apex', '$600k exceeds even CEO $500k');

  assert.equal(byId.get('bdg-eur:bl-eur').verdict, 'currency-mismatch', 'EUR budget line against USD-only schedule refuses implicit FX');

  // Cross-line anti-splitting on `dec-split` ($22k: Maya holds $25k, but Sam's project manager Priya holds $15k!)
  const splitRow = byId.get('dec-split');
  assert.equal(splitRow.verdict, 'breach');
  assert.equal(splitRow.breachClass, 'second-line-limit');
  assert.equal(splitRow.crossLine.state, 'asymmetric-line-limits');
});

/* =====================================================================
 * 4. MATRIX COVERING TIE + JOINT APEX, RULE-DOA-01 & RELOAD PERSISTENCE
 * ===================================================================== */

test('RULE-DOA-01 is O(1) inert when schedule is empty, routes matrix-tie breaches to unique matrixJointApex, abstains above-apex, and closes resolved asks', () => {
  // 1. Empty schedule -> RULE-DOA-01 writes nothing on budget/mandate events
  const emptyH = makeHarness((draft) => {
    seedMatrixOrg(draft);
    draft.budgets = [{
      id: 'b1', name: 'Ops', currency: 'USD', startsOn: '2026-01-01', endsOn: '2026-12-31', ownerId: 'mgrA', limit: 50000,
      lines: [{ id: 'l1', title: 'Tools', category: 'tools-software', committedAmount: 5000, committedOn: '2026-10-01', status: 'committed' }],
      createdAt: ISO,
    }];
  });
  emptyH.store.update(() => {}, { type: 'budget.lineAdded', entity: 'budget', entityId: 'b1', summary: 'noop' });
  assert.equal(emptyH.store.state.doaMarkers.length, 0);
  assert.equal(emptyH.store.state.delegations.length, 0);

  // 2. Multi-line authorizer `sam` ($5k ceiling) has TWO managers with covering limits:
  //    `mgrA` ($50k) on home line AND `priya` ($50k) on project line -> incomparable covering seats -> `matrix-tie`!
  //    Their unique `matrixJointApex` in the DAG is `vpFin`!
  const h = makeHarness((draft) => {
    seedMatrixOrg(draft);
    draft.budgets = [{
      id: 'bdg-sam',
      name: 'Shared Prototype Budget',
      currency: 'USD',
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      ownerId: 'sam',
      limit: 40000,
      lines: [
        { id: 'bl-tie', title: 'Bench rig hardware', category: 'facilities-equipment', committedAmount: 30000, committedOn: '2026-10-05', status: 'committed' },
        { id: 'bl-huge', title: 'Satellite lease', category: 'facilities-equipment', committedAmount: 900000, committedOn: '2026-10-06', status: 'committed' },
      ],
      createdAt: ISO,
    }];
  });

  h.api.doaDeclareLimit({ seatId: 'vpFin', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 200000, effectiveFrom: '2026-01-01', reason: 'VP Finance ceiling.' });
  h.api.doaDeclareLimit({ seatId: 'mgrA', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 50000, effectiveFrom: '2026-01-01', reason: 'Maya ceiling.' });
  h.api.doaDeclareLimit({ seatId: 'priya', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 50000, effectiveFrom: '2026-01-01', reason: 'Priya ceiling.' });
  h.api.doaDeclareLimit({ seatId: 'sam', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 5000, effectiveFrom: '2026-01-01', reason: 'Sam ceiling.' });

  const rep = h.api.doaReport({ now: NOW }).report;
  const tieRow = rep.allRows.find((r) => r.recordId === 'bdg-sam:bl-tie');
  assert.equal(tieRow.cover.state, 'matrix-tie');
  assert.equal(tieRow.cover.rawJointApexId, 'vpFin', 'incomparable covering managers escalate to unique matrixJointApex vpFin');

  // RULE-DOA-01 issued ONE ratification ask to `vpFin` for `bl-tie`, and ABSTAINED on `bl-huge` (`above-apex`)!
  const doaTasks = h.store.state.delegations.filter((d) => d.support?.includes(DOA_RULE_ID));
  assert.equal(doaTasks.length, 1);
  assert.equal(doaTasks[0].personId, 'vpFin');
  assert.equal(doaTasks[0].status, 'active');

  // Verify typed provenance links (`issues-obligation` + `rolls-up-to` to `ceo`)
  const obLinks = h.store.state.links.filter((l) => l.ruleId === DOA_RULE_ID && l.relation === 'issues-obligation');
  const rollLinks = h.store.state.links.filter((l) => l.ruleId === DOA_RULE_ID && l.relation === 'rolls-up-to');
  assert.equal(obLinks.length, 1);
  assert.ok(rollLinks.some((l) => l.sourceId === doaTasks[0].id && l.targetId === 'ceo'));

  // Abstention marker recorded for `bl-huge`, never guessing an owner
  assert.ok(h.store.state.doaMarkers.some((m) => m.kind === 'abstained' && m.objectKey === 'budget-line:bdg-sam:bl-huge'));

  // Idempotency: running explicit `doaScan` again issues ZERO duplicate tasks
  h.api.doaScan();
  assert.equal(h.store.state.delegations.filter((d) => d.support?.includes(DOA_RULE_ID)).length, 1);

  // Raise Sam's standing limit (retire $5k, grant $40k from 2026-01-01) -> prior ask closes automatically!
  const samDecl = h.store.state.doaSchedule.find((a) => a.kind === 'declare' && a.seatId === 'sam');
  h.api.doaRetireLimit({ targetLimitId: samDecl.id, retiredOn: '2026-11-11', reason: 'Superseded by expanded prototype authority.' });
  h.api.doaDeclareLimit({ seatId: 'sam', lineKind: 'any-line', scopeClass: 'capex', currency: 'USD', limit: 40000, effectiveFrom: '2026-01-01', reason: 'Retroactive prototype capex charter.' });

  const closedTask = h.store.state.delegations.find((d) => d.id === doaTasks[0].id);
  assert.equal(closedTask.status, 'done', 'RULE-DOA-01 closes ratification task once commitment conforms');

  // Savepoint lazy vs clone equivalence
  const baseA = JSON.parse(JSON.stringify(h.store.state));
  const baseB = JSON.parse(JSON.stringify(h.store.state));
  const ev = { type: DOA_EVENTS.SCAN, entity: 'workspace', entityId: 'matrix-doa' };
  runPostCommitRules(baseA, { now: NOW, nowIso: ISO, event: ev, idFactory: (p) => `${p}-1` });
  runPostCommitRules(baseB, { now: NOW, nowIso: ISO, event: ev, idFactory: (p) => `${p}-1`, savepoint: 'clone', declineMemo: false });
  assert.deepEqual(baseA, baseB);
});

/* =====================================================================
 * 5. CSV #128 IDENTITY AUDIT, PERSISTENCE & JSDOM + AXE DISPLAY PARITY
 * ===================================================================== */

test('CSV #128 is identity-free and JSDOM `#/matrix?panel=authority` matches stored/computed report with zero axe violations', async () => {
  const h = makeHarness((draft) => {
    seedMatrixOrg(draft);
    draft.budgets = [{
      id: 'bdg-clean',
      name: 'Engineering Ops',
      currency: 'USD',
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      ownerId: 'dana',
      limit: 300000,
      lines: [
        { id: 'c1', title: 'CI runners', category: 'tools-software', committedAmount: 35000, committedOn: '2026-10-01', status: 'committed' },
        { id: 'c2', title: 'Security audit', category: 'vendors-services', committedAmount: 45000, committedOn: '2026-10-02', status: 'committed' },
        { id: 'c3', title: 'Region failover', category: 'facilities-equipment', committedAmount: 140000, committedOn: '2026-10-03', status: 'committed' },
      ],
      createdAt: ISO,
    }];
  });

  h.api.doaDeclareLimit({ seatId: 'vpFin', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 250000, effectiveFrom: '2026-01-01', reason: 'VP Finance standing schedule.' });
  h.api.doaDeclareLimit({ seatId: 'dana', lineKind: 'any-line', scopeClass: 'general', currency: 'USD', limit: 100000, effectiveFrom: '2026-01-01', reason: 'Dana Director standing schedule.' });

  // Reload from serialized storage and verify stored == computed
  const rawJson = h.storage.getItem(STORAGE_KEY);
  const reloadedStorage = fakeStorage();
  reloadedStorage.setItem(STORAGE_KEY, rawJson);
  const reloadedStore = createStore({ storage: reloadedStorage, now: () => NOW });
  reloadedStore.load();

  const computed = buildDoaReport(reloadedStore.state, { now: NOW });
  assert.equal(computed.board.countsReconcile, true);
  assert.equal(computed.board.figuresComplete, true);
  assert.equal(computed.board.testedN, 3);
  assert.equal(computed.board.conformantN, 2);
  assert.equal(computed.board.breachN, 1);
  assert.equal(computed.board.conformancePermille, 667, 'round(2 / 3 * 1000) === 667‰');

  // CSV #128 export verification + zero-identity check
  const csvRes = exportWorkspaceCsv(reloadedStore.state, 'matrix-doa', { now: NOW });
  assert.equal(csvRes.ok, true);
  assert.equal(csvRes.columnCount, DOA_CSV_COLUMNS.length);
  assert.equal(csvRes.rowCount, 4, 'workspace row + 3 object-kind rows');
  const parsed = parseCsv(csvRes.csv);
  assert.deepEqual(parsed.rows.map((r) => r[2]), ['workspace', 'mandate', 'budget-line', 'decision']);
  for (const forbidden of ['Dana Director', 'Victor VP', 'Celia Chief', 'CI runners', 'Region failover', 'bdg-clean']) {
    assert.ok(!csvRes.csv.includes(forbidden), `CSV must not leak "${forbidden}"`);
    assert.ok(!doaBriefText(computed).includes(forbidden), `Brief must not leak "${forbidden}"`);
  }

  // JSDOM render + exact displayed == computed parity + axe-core zero-violation check
  const dom = new JSDOM('<!doctype html><html lang="en"><head><title>LeadOS DoA</title></head><body><main id="root"></main></body></html>', {
    pretendToBeVisual: true,
  });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    Node: globalThis.Node,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;

  try {
    const reloadedApi = createApi(reloadedStore, { now: () => NOW });
    const panelNode = renderMatrixDoaPanel({
      api: reloadedApi,
      state: reloadedStore.state,
      toast() {},
      refresh() {},
      navigate() {},
    }, { now: NOW });

    const root = dom.window.document.querySelector('#root');
    root.appendChild(panelNode);
    const renderedText = root.textContent;

    // Verify displayed figures match computed report verbatim
    assert.match(renderedText, /countsReconcile: true/);
    assert.match(renderedText, /figuresComplete: true/);
    assert.match(renderedText, /667‰/);
    assert.match(renderedText, /USD 250000\.00/);
    assert.match(renderedText, /USD 100000\.00/);
    assert.match(renderedText, /USD 140000\.00/);
    assert.match(renderedText, /Victor VP \(unique\)/);
    assert.equal(root.querySelectorAll('h1').length, 0, 'subpanel renders no duplicate h1');

    // Axe accessibility check on rendered panel
    const axeResults = await axe.run(root, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    assert.deepEqual(axeResults.violations, [], `axe violations: ${axeResults.violations.map((v) => v.id).join(', ')}`);
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.Element = prev.Element;
    globalThis.HTMLElement = prev.HTMLElement;
    dom.window.close();
  }

  assert.equal(doaCsvRows(computed).length, 4);
});
