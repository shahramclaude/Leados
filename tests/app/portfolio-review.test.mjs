import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, normalizeSettings, MIGRATIONS, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { buildPortfolioReview, portfolioReviewCsvRows, portfolioReviewMatrix, strictJointApex } from '../../app/core/domain/portfolioReview.js';
import { parsePrvMoneyToCents, normalizePortfolioVerdicts } from '../../app/core/domain/portfolioReviewSchema.js';
import { portfolioReviewRule, portfolioReviewConditions } from '../../app/core/domain/portfolioReviewRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderPortfolioReview } from '../../app/views/portfolioReview.js';
import { PRV_EVIDENCE_KINDS } from '../../app/core/domain/portfolioReviewRegistry.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
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
  const api = guardApi(store, rawApi, clock);

  return {
    store,
    rawApi,
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

test('portfolio: additive migration, settings and integer cents are stable over reload', () => {
  assert.equal(SCHEMA_VERSION, 176);
  const migrated = MIGRATIONS[175]({ schemaVersion: 175, settings: {} });
  assert.deepEqual(migrated.portfolioUnits, []);
  assert.equal(normalizeSettings({ portfolioReviewDays: 120, portfolioAutoPropagate: false }).portfolioReviewDays, 120);
  assert.equal(parsePrvMoneyToCents('0.01'), 1);
  for (const input of ['1.001', '-1', '1e3', '1,000', 'Infinity']) assert.equal(parsePrvMoneyToCents(input), null);
  const env = seed(); const id = declare(env); review(env, id); verdict(env, id);
  const roundtrip = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
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

test('portfolio: matrix joint apex, scoped reads, opaque rules, idempotency and pause', () => {
  const env = seed(); const id = declare(env, 'Matrix Operations', 'DKK', 'ivo');
  const { matrix } = portfolioReviewMatrix(env.store.state, at('2026-11-15'), env.store.state.settings);
  assert.deepEqual(strictJointApex(matrix, ['ivo']).apexIds, ['dan']);
  let report = env.api.portfolioReport();
  const derived = portfolioReviewConditions(env.store.state, report, { today: '2026-11-15', matrix });
  assert.deepEqual(derived.conditions[0].seatIds, ['ivo']);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(portfolioReviewRule));
  const before = env.store.state.delegations.filter((d) => d.title.includes('portfolio')).length;
  env.api.portfolioScan(); env.api.portfolioScan();
  assert.equal(env.store.state.delegations.filter((d) => d.title.includes('portfolio')).length, before);
  for (const task of env.store.state.delegations.filter((d) => d.title.includes('portfolio'))) assert.ok(!JSON.stringify(task).includes('Matrix Operations'));
  env.sit('zoe'); report = env.api.portfolioReport(); assert.equal(report.units.length, 0); assert.equal(report.scope.unitsOutsideScopeN, 1);
  env.sit(null);
  const draft = structuredClone(env.store.state); draft.settings.portfolioAutoPropagate = false;
  assert.deepEqual(portfolioReviewRule(draft, { now: at('2026-11-16'), event: { type: 'portfolioReview.scanned' } }), []);
  assert.equal(env.store.state.portfolioUnits[0].id, id);
});

test('portfolio: every displayed numeric cell and CSV total comes from the stored-cent reader', () => withDom(() => {
  const env = seed(); const id = declare(env); review(env, id); verdict(env, id, { verdict: 'sell', amount: '101.02', expectedOn: '2026-12-31' });
  const report = env.api.portfolioReport();
  const host = document.getElementById('host');
  for (const view of ['units', 'reviews', 'exits', 'method']) {
    host.replaceChildren(renderPortfolioReview({ api: env.api, query: new URLSearchParams({ view }), refresh() {}, navigate() {} }));
    assert.equal(host.querySelector('[data-testid="prv-count-units"]').textContent, String(report.counts.unitsLive));
    assert.equal(host.querySelector('[data-testid="prv-count-pending"]').textContent, String(report.counts.unitStates['verdict-pending']));
    assert.equal(host.querySelector('[data-testid="prv-count-measured"]').textContent, report.currencies.map((c) => c.measuredDisplay).join(' · '));
    assert.ok(!host.textContent.includes('undefined')); assert.ok(!host.textContent.includes('NaN'));
    if (view === 'units') assert.ok(host.textContent.includes(report.units[0].latestReview.measuredDisplay));
    if (view === 'exits') assert.ok(host.textContent.includes(report.currencies[0].proceedsDisplay));
  }
  const rows = portfolioReviewCsvRows(report);
  assert.equal(rows[1].money_measured_cents, env.store.state.portfolioReviews[0].measuredCents);
  assert.equal(rows[1].money_expected_proceeds_cents, env.store.state.portfolioVerdicts[0].expectedProceedsCents);
  assert.ok(!JSON.stringify(rows).includes('Nordic Packaging'));
  const exported = exportWorkspaceCsv(env.store.state, 'portfolio-review', { now: at('2026-11-15') });
  assert.equal(exported.ok, true, JSON.stringify(exported));
}));
