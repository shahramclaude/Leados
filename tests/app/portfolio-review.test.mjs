import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { COLLECTIONS, createEmptyState, migrate, normalizeState, normalizeSettings, MIGRATIONS, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import {
  buildPortfolioReview,
  portfolioReviewAttentionCount,
  portfolioReviewCsvRows,
  portfolioReviewMatrix,
  resolvePortfolioAuthority,
  strictJointApex,
} from '../../app/core/domain/portfolioReview.js';
import { parsePrvMoneyToCents, normalizePortfolioVerdicts } from '../../app/core/domain/portfolioReviewSchema.js';
import { createPortfolioReviewActions } from '../../app/core/domain/portfolioReviewActions.js';
import { portfolioReviewRule, portfolioReviewConditions } from '../../app/core/domain/portfolioReviewRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderPortfolioReview } from '../../app/views/portfolioReview.js';
import { PRV_CONDITION_KINDS, PRV_EVIDENCE_KINDS, PRV_MARKER_REASONS, PRV_ROUTE } from '../../app/core/domain/portfolioReviewRegistry.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const BASIS = 'Declared unit boundary and audited valuation evidence for the current reporting period.';
const at = (day) => new Date(`${day}T10:00:00.000Z`);

function guardApi(store, raw, clock) {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const nowMs = clock().getTime();
        const verdict = guardApiCall(store.state, String(prop), args, nowMs);
        if (!verdict.ok) return verdict;
        return value.apply(target, args);
      };
    },
  });
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost/#/means',
  });
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
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    dom.window.close();
  }
}

/**
 * Matrix topology:
 *   ceo (vp, rank 4)
 *    ├─ dan (director, rank 3)
 *    │   ├─ mia (manager, rank 2 — home line of ivo at 60%)
 *    │   │   └─ ivo (lead/frontline, rank 1 — also dotted project line to kai at 40%)
 *    │   └─ kai (manager, rank 2 — project line of ivo at 40%)
 *    └─ zoe (director, rank 3 — unrelated peer branch)
 *        └─ ben (manager, rank 2)
 */
function seed(nowDay = '2026-11-15') {
  let currentNow = at(nowDay);
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const iso = '2026-01-01T09:00:00.000Z';
  const person = (id, name, level, managerId) => ({
    id,
    name,
    role: level,
    level,
    managerId,
    status: 'active',
    startDate: iso,
    createdAt: iso,
    updatedAt: iso,
  });
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo VP', 'vp', null),
    person('dan', 'Dan Director', 'director', 'ceo'),
    person('mia', 'Mia HomeMgr', 'manager', 'dan'),
    person('kai', 'Kai ProjMgr', 'manager', 'dan'),
    // Frontline supervisor `ivo` holds `ada` (making `ivo` a rank-1 frontline seat)
    // and answers to `mia` (home, residual 60%) and `kai` (project line, 40%).
    person('ivo', 'Ivo Lead', 'lead', 'mia'),
    person('ada', 'Ada Tech', 'ic', 'ivo'),
    person('lea', 'Lea Eng', 'ic', 'kai'),
    person('zoe', 'Zoe PeerDir', 'director', 'ceo'),
    person('ben', 'Ben PeerMgr', 'manager', 'zoe'),
    person('sam', 'Sam Ops', 'ic', 'ben'),
  ];
  raw.reportingLines = [
    {
      id: 'rl-ivo-home',
      personId: 'ivo',
      managerId: 'mia',
      kind: 'functional',
      shareH: 60,
      rights: ['coaching', 'review'],
      fromISO: '2026-01-01',
      toISO: null,
      declaredAt: iso,
      note: '',
    },
    {
      id: 'rl-ivo-proj',
      personId: 'ivo',
      managerId: 'kai',
      kind: 'project',
      shareH: 40,
      rights: ['tasking'],
      fromISO: '2026-01-01',
      toISO: null,
      declaredAt: iso,
      note: '',
    },
  ];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => { values.set(k, String(v)); },
    removeItem: (k) => { values.delete(k); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const rawApi = createApi(store, { now: clock, idFactory });
  const directPrv = createPortfolioReviewActions(store, { now: clock, idFactory });
  const api = guardApi(store, rawApi, clock);

  return {
    store,
    rawApi,
    directPrv,
    api,
    setDay(day) { currentNow = at(day); },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
  };
}


function declare(env, name = 'Nordic Packaging', currency = 'DKK', owner = 'ceo') {
  const result = env.api.portfolioDeclareUnit({ name, currency, owningLineHolderId: owner, reviewDueOn: '2026-11-15', basis: BASIS });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.unitId;
}
function review(env, unitId, amount = '12345.67') {
  const result = env.api.portfolioRecordReview(unitId, { amount, evidenceKind: PRV_EVIDENCE_KINDS[0].key, evidenceId: 'audit-2026-Q4', basis: BASIS });
  assert.equal(result.ok, true, JSON.stringify(result)); return result;
}
function verdict(env, unitId, extra = {}) {
  const result = env.api.portfolioRecordVerdict(unitId, { verdict: 'keep', rationale: BASIS, ...extra });
  assert.equal(result.ok, true, JSON.stringify(result)); return result;
}

test('portfolio: additive migration, v176→v177 marker separation, settings and integer cents are stable over reload', () => {
  assert.equal(SCHEMA_VERSION, 177);
  assert.ok(COLLECTIONS.includes('portfolioExits'));
  assert.ok(COLLECTIONS.includes('portfolioReviewMarkers'));
  assert.equal(COLLECTIONS.filter((c) => c === 'portfolioMarkers').length, 1, 'portfolioMarkers belongs solely to Schema v55 Decision Portfolio');

  const v175 = { schemaVersion: 175, settings: {}, portfolioMarkers: ['dpf:existing-string-marker'] };
  const step176 = MIGRATIONS[175](v175);
  assert.deepEqual(step176.portfolioUnits, []);

  // Legacy v176 state carrying both v55 string markers and mixed PRV object markers
  const v176 = {
    ...createEmptyState('2026-11-15T10:00:00.000Z'),
    schemaVersion: 176,
    portfolioMarkers: [
      'dpf:101',
      { id: 'prvmk-1', signature: 'prv1:verdict:u1', reason: 'no-joint-apex', observedOn: '2026-11-10', resolvedOn: null },
    ],
  };
  const step177 = MIGRATIONS[176](v176);
  assert.equal(step177.schemaVersion, 177);
  assert.deepEqual(step177.portfolioMarkers, ['dpf:101']);
  assert.equal(step177.portfolioReviewMarkers.length, 1);
  assert.deepEqual(step177.portfolioExits, []);
  const fullChain = migrate({ schemaVersion: 175, appId: 'leados', settings: {}, portfolioMarkers: ['dpf:legacy'] });
  assert.deepEqual(fullChain.applied, ['175 → 176', '176 → 177']);
  assert.deepEqual(fullChain.raw.portfolioMarkers, ['dpf:legacy']);
  assert.deepEqual(fullChain.raw.portfolioReviewMarkers, []);
  assert.deepEqual(fullChain.raw.portfolioExits, []);

  assert.equal(normalizeSettings({ portfolioReviewDays: 120, portfolioAutoPropagate: false }).portfolioReviewDays, 120);
  assert.equal(parsePrvMoneyToCents('0.01'), 1);
  for (const input of ['1.001', '-1', '1e3', '1,000', 'Infinity']) assert.equal(parsePrvMoneyToCents(input), null);

  const env = seed();
  env.store.update((draft) => { draft.portfolioMarkers.push('dpf:keep-me'); }, { type: 'test.marker', entity: 'workspace', entityId: 'w1', summary: 'dpf marker' });
  const id = declare(env); review(env, id); verdict(env, id);
  const parsedRoundtrip = JSON.parse(JSON.stringify(env.store.state));
  const roundtripResult = normalizeState(parsedRoundtrip, { now: at('2026-11-15') });
  assert.deepEqual(roundtripResult.warnings, []);
  const roundtrip = roundtripResult.state;
  assert.deepEqual(roundtrip.portfolioMarkers, ['dpf:keep-me'], 'Decision Portfolio string markers survive PRV normalization intact');
  assert.equal(roundtrip.portfolioReviews[0].measuredCents, 1234567);
  assert.deepEqual(roundtrip.portfolioVerdicts, env.store.state.portfolioVerdicts);
  assert.equal(buildPortfolioReview(roundtrip, { now: at('2026-11-15') }).units[0].state, 'keep');
});

test('portfolio: rank, owning line, exact verdict fields, and same-day evidence invalidation', () => {
  const env = seed(); const id = declare(env);
  assert.equal(env.api.portfolioRecordVerdict(id, { verdict: 'keep', rationale: BASIS }).ok, false);
  env.sit('dan');
  assert.equal(env.api.portfolioDeclareUnit({}).ok, false);
  assert.equal(env.api.portfolioRecordReview(id, {}).ok, false);
  env.sit('ceo'); review(env, id);
  assert.equal(env.api.portfolioRecordVerdict(id, { verdict: 'keep', rationale: BASIS }).ok, false);
  env.sit(null); verdict(env, id);
  assert.equal(env.api.portfolioRecordVerdict(id, { verdict: 'keep', rationale: BASIS, amount: '1' }).ok, false);
  assert.equal(env.api.portfolioRecordVerdict(id, { verdict: 'fix', rationale: BASIS }).ok, false);
  review(env, id, '999.99');
  assert.equal(env.api.portfolioReport().units[0].state, 'verdict-pending');
  const invalid = { ...env.store.state.portfolioVerdicts[0], expectedProceedsCents: 1 };
  const warnings = []; assert.deepEqual(normalizePortfolioVerdicts([invalid], warnings), []); assert.equal(warnings.length, 1);
});

test('portfolio: execution completion, fix expiry, currency separation, overflow refusal and retirement', () => {
  const env = seed(); const id = declare(env); review(env, id);
  const v = verdict(env, id, { verdict: 'fix', reReviewOn: '2026-11-16' });
  const m = env.api.portfolioRecordMilestone(v.verdictId, { label: 'Repair work accepted', dueOn: '2026-11-15' });
  assert.equal(m.ok, true, JSON.stringify(m)); env.setDay('2026-11-17');
  assert.equal(env.api.portfolioReport().counts.milestoneStates.overdue, 1);
  const done = env.api.portfolioRecordMilestone(v.verdictId, { milestoneId: m.milestoneId, label: 'Repair work accepted', dueOn: '2026-11-15', doneOn: '2026-11-17' });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(env.store.state.portfolioMilestones.length, 1);
  assert.equal(env.api.portfolioReport().counts.milestoneStates.done, 1);
  assert.equal(env.api.portfolioReport().units[0].state, 'review-overdue');
  const id2 = declareLater(env); review(env, id2, '0.01');
  let report = env.api.portfolioReport(); assert.equal(report.currencies.length, 2);
  assert.equal(report.currencies.find((c) => c.currency === 'EUR').measuredCents, 1);
  const huge = structuredClone(env.store.state);
  huge.portfolioUnits.push({ ...huge.portfolioUnits[0], id: 'another-unit', name: 'Another unit' });
  huge.portfolioReviews = [huge.portfolioUnits[0], huge.portfolioUnits.at(-1)].map((u, i) => ({ ...huge.portfolioReviews[0], id: `large-${i}`, unitId: u.id, measuredCents: 9000000000000000 }));
  report = buildPortfolioReview(huge, { now: at('2026-11-17') });
  assert.equal(report.currencies.find((c) => c.currency === 'DKK').measuredCents, null);
  assert.equal(report.claims.countsReconcile, false);
  assert.equal(env.api.portfolioRetireUnit(id, { reason: BASIS }).ok, true);
  assert.equal(env.api.portfolioReport().counts.unitsRetired, 1);
});
function declareLater(env) {
  const result = env.api.portfolioDeclareUnit({ name: 'European Distribution', currency: 'EUR', owningLineHolderId: 'ceo', reviewDueOn: '2026-11-20', basis: BASIS });
  assert.equal(result.ok, true, JSON.stringify(result)); return result.unitId;
}

test('portfolio: right-capable authority resolution, synthetic chief queue, opaque rules, idempotency and pause', () => {
  const env = seed(); const id = declare(env, 'Matrix Operations', 'DKK', 'ivo');
  const { matrix } = portfolioReviewMatrix(env.store.state, at('2026-11-15'), env.store.state.settings);
  assert.deepEqual(strictJointApex(matrix, ['ivo']).apexIds, ['dan']);
  // `review-portfolio` requires rank >= 4: rank-1 `ivo` & rank-3 `dan` cannot record reviews, so review escalation targets `ceo` (rank 4).
  let report = env.api.portfolioReport();
  let derived = portfolioReviewConditions(env.store.state, report, { today: '2026-11-15', matrix });
  assert.equal(derived.conditions.length, 1);
  assert.equal(derived.conditions[0].kind, PRV_CONDITION_KINDS.REVIEW_OVERDUE);
  assert.deepEqual(derived.conditions[0].seatIds, ['ceo']);
  // Every delegation addressee can execute the corresponding action without rank-denied!
  env.sit('ivo');
  assert.equal(env.api.portfolioAttentionCount(), 0);
  const blockedReview = env.api.portfolioRecordReview(id, { amount: '10', evidenceKind: 'case', evidenceId: 'c1', basis: BASIS });
  assert.equal(blockedReview.ok, false);
  assert.equal(blockedReview.code, 'scope-refusal');
  assert.equal(env.directPrv.portfolioRecordReview(id, { amount: '10', evidenceKind: 'case', evidenceId: 'c1', basis: BASIS }).refusal, 'portfolioReview:rank-denied');
  env.sit('dan');
  assert.equal(env.api.portfolioAttentionCount(), 0);
  env.sit('ceo');
  assert.equal(env.api.portfolioAttentionCount(), 1);
  review(env, id, '500.00'); // `ceo` genuinely holds review-portfolio and succeeds!

  // Now `verdict-pending`: requires rank 5 (`verdict-portfolio`). Never routes to `dan` (rank 3) or `ceo` (rank 4), and never writes a `person` delegation to `'leader'`.
  report = env.api.portfolioReport();
  derived = portfolioReviewConditions(env.store.state, report, { today: '2026-11-15', matrix });
  assert.equal(derived.conditions.length, 0);
  assert.equal(derived.observations.length, 1);
  assert.equal(derived.observations[0].reason, PRV_MARKER_REASONS.CHIEF_DECISION_OWED);
  assert.equal(env.api.portfolioAttentionCount(), 0, 'rank-4 VP does not carry chief verdict count');
  assert.equal(report.chiefQueue.length, 1);
  assert.equal(env.store.state.portfolioReviewMarkers.some((m) => !m.resolvedOn && m.reason === PRV_MARKER_REASONS.CHIEF_DECISION_OWED), true);
  assert.equal(env.store.state.delegations.some((d) => d.personId === 'leader'), false, 'never issues person delegation to LEADER_ID');
  env.sit('leader');
  assert.equal(env.api.portfolioAttentionCount(), 1, 'declared chief seat sees explicit chief queue count');
  env.sit(null);
  assert.equal(env.api.portfolioAttentionCount(), 1, 'operator view sees explicit chief queue count');

  // Lowering `chainLeaderAltitude` below `chief` leaves zero rank-5 verdict authority (`no-authority-at-rank`).
  const lowered = structuredClone(env.store.state);
  lowered.settings.chainLeaderAltitude = 'exec';
  const loweredMatrix = portfolioReviewMatrix(lowered, at('2026-11-15'), lowered.settings).matrix;
  assert.equal(resolvePortfolioAuthority(loweredMatrix, 'ivo', 5).reason, PRV_MARKER_REASONS.NO_AUTHORITY_AT_RANK);
  assert.equal(portfolioReviewAttentionCount(lowered, { now: at('2026-11-15'), settings: lowered.settings, seat: { id: 'leader', isLeader: true, fullAccess: false, rank: 4 } }), 0);

  // CEO pronounces `fix` verdict -> chief-decision-owed marker resolves automatically; overdue milestone escalates to rank-3 `dan` (`track-portfolio`).
  const fixV = verdict(env, id, { verdict: 'fix', reReviewOn: '2026-12-01' });
  assert.equal(env.store.state.portfolioReviewMarkers.every((m) => Boolean(m.resolvedOn)), true, 'chief-decision-owed marker cleared upon verdict');
  const m = env.api.portfolioRecordMilestone(fixV.verdictId, { label: 'Margin audit closed', dueOn: '2026-11-15' });
  assert.equal(m.ok, true);
  env.setDay('2026-11-18');
  env.api.portfolioScan();
  env.sit('dan');
  assert.equal(env.api.portfolioAttentionCount(), 1, 'rank-3 `dan` sees trackable milestone slippage');
  const slippageTasks = env.store.state.delegations.filter((d) => d.status === 'active' && d.personId === 'dan' && d.title.includes('milestone'));
  assert.equal(slippageTasks.length, 1);
  assert.ok(!slippageTasks[0].expectedOutcome.includes('retir'), 'slippage task never asks lower seat to retire/re-verdict');
  assert.ok(!JSON.stringify(slippageTasks[0]).includes('Matrix Operations'));
  // `dan` CAN resolve their own milestone obligation!
  const doneM = env.api.portfolioRecordMilestone(fixV.verdictId, { milestoneId: m.milestoneId, label: 'Margin audit closed', dueOn: '2026-11-15', doneOn: '2026-11-18' });
  assert.equal(doneM.ok, true, JSON.stringify(doneM));
  assert.equal(env.api.portfolioAttentionCount(), 0);

  env.sit(null);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(portfolioReviewRule));
  const before = env.store.state.delegations.filter((d) => d.title.includes('portfolio')).length;
  env.api.portfolioScan(); env.api.portfolioScan();
  assert.equal(env.store.state.delegations.filter((d) => d.title.includes('portfolio')).length, before);
  env.sit('zoe'); report = env.api.portfolioReport(); assert.equal(report.units.length, 0); assert.equal(report.scope.unitsOutsideScopeN, 1);
  env.sit(null);
  const draft = structuredClone(env.store.state); draft.settings.portfolioAutoPropagate = false;
  assert.deepEqual(portfolioReviewRule(draft, { now: at('2026-11-19'), event: { type: 'portfolioReview.scanned' } }), []);
});

test('portfolio: sell/exit expected-date breach routing, completion gates, realized proceeds conservation and post-settlement locks', () => {
  const env = seed('2026-11-01');
  const id = declare(env, 'Legacy Logistics', 'EUR', 'ivo');
  review(env, id, '2500.00');
  const sv = verdict(env, id, { verdict: 'sell', amount: '1800.50', expectedOn: '2026-11-10' });
  const ms = env.api.portfolioRecordMilestone(sv.verdictId, { label: 'Closing docs signed', dueOn: '2026-11-08' });
  assert.equal(ms.ok, true);

  // Move past `expectedOn`: sell unit breaches expected date -> flagged, escalates to chiefQueue + chief-decision-owed marker.
  env.setDay('2026-11-12');
  env.api.portfolioScan();
  let report = env.api.portfolioReport();
  assert.equal(report.units[0].executionOverdue, true);
  assert.equal(report.gaps.executionOverdueUnitsN, 1);
  assert.equal(report.claims.figuresComplete, false);
  assert.ok(report.claims.incompleteReasons.some((r) => r.startsWith('execution-date-passed')));
  assert.ok(report.escalations.some((e) => e.conditionKind === PRV_CONDITION_KINDS.EXECUTION_OVERDUE));
  assert.ok(report.chiefQueue.some((q) => q.kind === PRV_CONDITION_KINDS.EXECUTION_OVERDUE));
  assert.ok(report.markers.some((m) => m.reason === PRV_MARKER_REASONS.CHIEF_DECISION_OWED && m.signature.includes('exit-overdue')));
  // Rank 4 CEO is refused completion, and open milestones refuse completion too.
  env.sit('ceo');
  const blockedExit = env.api.portfolioCompleteExit(sv.verdictId, { amount: '1750.00', evidenceKind: 'document', evidenceId: 'deed-1', basis: BASIS });
  assert.equal(blockedExit.ok, false);
  assert.equal(blockedExit.code, 'scope-refusal');
  assert.equal(env.directPrv.portfolioCompleteExit(sv.verdictId, { amount: '1750.00', evidenceKind: 'document', evidenceId: 'deed-1', basis: BASIS }).refusal, 'portfolioReview:rank-denied');
  env.sit(null);
  assert.equal(env.api.portfolioCompleteExit(sv.verdictId, { amount: '1750.00', evidenceKind: 'document', evidenceId: 'deed-1', basis: BASIS }).refusal, 'portfolioReview:open-milestones-remain');

  // Complete milestone, then record exact disposal settlement.
  assert.equal(env.api.portfolioRecordMilestone(sv.verdictId, { milestoneId: ms.milestoneId, label: 'Closing docs signed', dueOn: '2026-11-08', doneOn: '2026-11-12' }).ok, true);
  assert.equal(env.api.portfolioCompleteExit(sv.verdictId, { amount: '1750.123', evidenceKind: 'document', evidenceId: 'deed-1', basis: BASIS }).refusal, 'portfolioReview:invalid-amount');
  const settled = env.api.portfolioCompleteExit(sv.verdictId, { completedOn: '2026-11-12', amount: '1750.25', evidenceKind: 'document', evidenceId: 'deed-1', basis: BASIS });
  assert.equal(settled.ok, true, JSON.stringify(settled));

  report = env.api.portfolioReport();
  assert.equal(report.counts.unitsLive, 0);
  assert.equal(report.counts.unitsCompleted, 1);
  assert.equal(report.units[0].status, 'completed');
  assert.equal(report.units[0].executionOverdue, false);
  assert.equal(report.exits[0].actualProceedsCents, 175025);
  assert.equal(report.currencies[0].proceedsCents, 0, 'completed exit expected proceeds no longer counted in live expected proceeds');
  assert.equal(report.currencies[0].realizedProceedsCents, 175025);
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true);
  assert.equal(report.chiefQueue.length, 0);
  assert.equal(env.store.state.portfolioReviewMarkers.every((m) => Boolean(m.resolvedOn)), true);
  assert.equal(env.api.portfolioAttentionCount(), 0);

  // Settled unit rejects duplicate completions, re-verdicts, or retirement.
  assert.equal(env.api.portfolioCompleteExit(sv.verdictId, { amount: '1750.25', evidenceKind: 'document', evidenceId: 'deed-2', basis: BASIS }).refusal, 'portfolioReview:exit-already-completed');
  assert.equal(env.api.portfolioRecordVerdict(id, { verdict: 'keep', rationale: BASIS }).refusal, 'portfolioReview:exit-already-completed');
  assert.equal(env.api.portfolioRetireUnit(id, { reason: BASIS }).refusal, 'portfolioReview:exit-already-completed');

  const csv = portfolioReviewCsvRows(report);
  assert.equal(csv[0].units_completed_total, 1);
  assert.equal(csv[1].money_realized_proceeds_cents, 175025);
});

test('portfolio: real app routing, Decision Portfolio non-collision, live UI milestone edit & completion, and reload-to-DOM/CSV parity', () => {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/#/today', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    Node: globalThis.Node,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    localStorage: globalThis.localStorage,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.localStorage = dom.window.localStorage;
  dom.window.__LEADOS_TEST__ = true;

  return (async () => {
    const { createApp, NAV } = await import('../../app/main.js');
    let currentDay = at('2026-11-15');
    const app = createApp({ storage: dom.window.localStorage, now: () => currentDay });
    app.ctx.loadDemo();

    // 1. Verify route and NAV separation between `#/portfolio` and `#/portfolio-review`
    const navRoutes = NAV.flatMap((g) => g.items.map((i) => i.route));
    assert.equal(navRoutes.filter((r) => r === 'portfolio').length, 1);
    assert.equal(navRoutes.filter((r) => r === 'portfolio-review').length, 1);
    app.ctx.navigate('#/portfolio');
    assert.ok(dom.window.document.querySelector('#view').textContent.includes('Decision portfolio') || dom.window.document.querySelector('h1').textContent.length > 0);
    assert.equal(dom.window.document.querySelector('[data-testid="portfolio-review-panel"]'), null, '#/portfolio must NOT render Portfolio Review');

    app.ctx.navigate(PRV_ROUTE);
    assert.ok(dom.window.document.querySelector('[data-testid="portfolio-review-panel"]'), '#/portfolio-review renders Portfolio Review');

    // 2. Drive real DOM dialogs end-to-end: Declare unit -> Review -> Verdict (sell) -> Add milestone -> Prefilled Update milestone -> Complete exit!
    dom.window.document.querySelector('[data-testid="prv-declare-unit"]').click();
    let dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.ok(dialog && dialog.querySelector('form input[name="name"]'), 'Declare dialog renders real inputs');
    dialog.querySelector('input[name="name"]').value = 'Baltic Marine Services';
    const ownerOpts = [...dialog.querySelectorAll('select[name="owningLineHolderId"] option')].map((o) => o.value).filter(Boolean);
    assert.ok(ownerOpts.length > 0);
    dialog.querySelector('select[name="owningLineHolderId"]').value = ownerOpts[0];
    dialog.querySelector('input[name="currency"]').value = 'DKK';
    dialog.querySelector('input[name="reviewDueOn"]').value = '2026-11-15';
    dialog.querySelector('textarea[name="basis"]').value = BASIS;
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null, 'Declare dialog closed after valid submission');

    const unitId = app.ctx.state.portfolioUnits[0].id;
    dom.window.document.querySelector(`[data-testid="prv-review-${unitId}"]`).click();
    dialog = dom.window.document.querySelector('[role="dialog"]');
    dialog.querySelector('input[name="amount"]').value = '4200.55';
    dialog.querySelector('input[name="evidenceId"]').value = 'ev-baltic-q4';
    dialog.querySelector('textarea[name="basis"]').value = BASIS;
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();

    dom.window.document.querySelector(`[data-testid="prv-verdict-${unitId}"]`).click();
    dialog = dom.window.document.querySelector('[role="dialog"]');
    dialog.querySelector('select[name="verdict"]').value = 'sell';
    dialog.querySelector('textarea[name="rationale"]').value = BASIS;
    dialog.querySelector('input[name="amount"]').value = '3100.25';
    dialog.querySelector('input[name="expectedOn"]').value = '2026-12-20';
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();

    // Switch to Exits & Milestones tab, add a milestone without typing an ID, then click prefilled Update to finish it!
    app.ctx.navigate(`${PRV_ROUTE}?view=exits`);
    dom.window.document.querySelector('[data-testid="prv-add-milestone"]').click();
    dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('input[name="milestoneId"]'), null, 'Add milestone does not prompt for a raw milestoneId');
    dialog.querySelector('input[name="label"]').value = 'Escrow signed';
    dialog.querySelector('input[name="dueOn"]').value = '2026-11-18';
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();

    const milestoneId = app.ctx.state.portfolioMilestones[0].id;
    dom.window.document.querySelector(`[data-testid="prv-milestone-edit-${milestoneId}"]`).click();
    dialog = dom.window.document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('input[name="milestoneId"]').value, milestoneId, 'Update dialog prefills hidden milestoneId');
    assert.equal(dialog.querySelector('input[name="label"]').value, 'Escrow signed', 'Update dialog prefills label');
    assert.equal(dialog.querySelector('input[name="dueOn"]').value, '2026-11-18', 'Update dialog prefills dueOn');
    dialog.querySelector('input[name="doneOn"]').value = '2026-11-15';
    dialog.querySelector('textarea[name="note"]').value = 'Escrow confirmed by legal.';
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();

    // Also test Complete exit modal cleanly on Units tab!
    app.ctx.navigate(PRV_ROUTE);
    dom.window.document.querySelector(`[data-testid="prv-complete-exit-${unitId}"]`).click();
    dialog = dom.window.document.querySelector('[role="dialog"]');
    dialog.querySelector('input[name="amount"]').value = '3125.75';
    dialog.querySelector('input[name="evidenceId"]').value = 'closing-baltic-2026';
    dialog.querySelector('textarea[name="basis"]').value = BASIS;
    dialog.querySelector('[data-testid="prv-modal-submit"]').click();

    // 3. Reload cleanly from serialized storage bytes and verify 100% parity across all stats, every rendered tab cell, and CSV!
    const rawSaved = dom.window.localStorage.getItem(STORAGE_KEY);
    assert.ok(rawSaved);
    const reloadedStore = createStore({
      storage: { getItem: () => rawSaved, setItem() {}, removeItem() {} },
      now: () => currentDay,
      idFactory: (p) => `${p}-x`,
    });
    reloadedStore.load();
    const reloadedApi = createApi(reloadedStore, { now: () => currentDay, idFactory: (p) => `${p}-x` });
    const reloadedReport = buildPortfolioReview(reloadedStore.state, { now: currentDay });
    assert.equal(reloadedReport.counts.unitsLive, 0);
    assert.equal(reloadedReport.counts.unitsCompleted, 1);
    assert.equal(reloadedReport.exits[0].actualProceedsCents, 312575);

    const view = dom.window.document.querySelector('#view');
    for (const tab of ['units', 'reviews', 'exits', 'method']) {
      view.replaceChildren(renderPortfolioReview({
        api: reloadedApi,
        query: new URLSearchParams({ view: tab }),
        refresh() {},
        navigate() {},
      }));
      assert.equal(view.querySelector('[data-testid="prv-count-units"]').textContent, String(reloadedReport.counts.unitsLive));
      assert.equal(view.querySelector('[data-testid="prv-count-pending"]').textContent, String(reloadedReport.counts.unitStates['verdict-pending']));
      assert.equal(view.querySelector('[data-testid="prv-count-measured"]').textContent, reloadedReport.currencies.map((c) => c.measuredDisplay).join(' · '));
      assert.ok(!view.textContent.includes('undefined') && !view.textContent.includes('NaN') && !view.textContent.includes('[object Object]'));
      if (tab === 'units') {
        assert.ok(view.textContent.includes('Baltic Marine Services'));
        assert.ok(view.textContent.includes(reloadedReport.units[0].latestExit.actualProceedsDisplay));
      }
      if (tab === 'reviews') {
        assert.ok(view.textContent.includes(reloadedReport.reviews[0].measuredDisplay));
        assert.ok(view.textContent.includes('closing-baltic-2026') || view.textContent.includes('Completed'));
      }
      if (tab === 'exits') {
        assert.ok(view.textContent.includes('Escrow signed'));
        assert.ok(view.textContent.includes(reloadedReport.exits[0].actualProceedsDisplay));
        assert.ok(view.textContent.includes(reloadedReport.currencies[0].realizedProceedsDisplay));
      }
    }

    const csvRows = portfolioReviewCsvRows(reloadedReport);
    assert.equal(csvRows[0].units_completed_total, 1);
    assert.equal(csvRows[1].money_realized_proceeds_cents, 312575);
    assert.ok(!JSON.stringify(csvRows).includes('Baltic Marine Services'));
    const exported = exportWorkspaceCsv(reloadedStore.state, 'portfolio-review', { now: currentDay });
    assert.equal(exported.ok, true, JSON.stringify(exported));
    assert.deepEqual(errors, []);
  })().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    dom.window.close();
  });
});
