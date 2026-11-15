// ADR-0208 — Investment Case Register: appraisal, ratification, post-completion review.
//
// The register's claims are arithmetic and control, so the tests are too:
//   - every money figure is hand-computed or pinned against frozen 90-digit
//     reference vectors (generated once with mpmath and cross-checked against
//     pyxirr 0.10.8 / numpy-financial 1.0.0), to the cent;
//   - a rate of return is printed only where it is provably unique;
//   - the benefit owner can never ratify or review their own case — at the door
//     and again at load;
//   - a case with a multi-line owner is counted once, and a due review goes to
//     the seat above EVERY one of the owner's lines, never one line's manager;
//   - what the screen prints is what is stored, to the cent.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import {
  buildInvestmentCases,
  investmentCaseAttentionCount,
  investmentCaseCacheStats,
  investmentCaseCsvRows,
  investmentMoney,
  investmentRateBp,
  investmentRateMicro,
  investmentRatio,
  resolveInvestmentMonitor,
} from '../../app/core/domain/investmentCase.js';
import {
  adjustInvestment,
  appraiseInvestment,
  investmentIrr,
  investmentMedian,
  reviewInvestment,
} from '../../app/core/domain/investmentCaseMath.js';
import { indexInvestmentCaseAsks, investmentCaseRule } from '../../app/core/domain/investmentCaseRules.js';
import {
  INVESTMENT_CASE_CLOSED_PREFIX,
  INVESTMENT_CASE_CSV_COLUMNS,
  INVESTMENT_CASE_CSV_SCOPE,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_REFUSAL_KEYS,
  INVESTMENT_CASE_RIGHTS,
  INVESTMENT_CASE_RULE_ID,
  INVESTMENT_CASE_SETTING_KEYS,
} from '../../app/core/domain/investmentCaseRegistry.js';
import {
  investmentCaseSignature,
  investmentFlowLines,
  normalizeInvestmentCaseActs,
  normalizeInvestmentCases,
  normalizeInvestmentCaseSettings,
  parseInvestmentAmount,
  parseInvestmentFlowLines,
  parseInvestmentRatePercent,
} from '../../app/core/domain/investmentCaseSchema.js';
import { renderFinance } from '../../app/views/finance.js';
import { renderFinanceInvestmentCasePanel } from '../../app/views/financeInvestmentCasePanel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = '2026-11-15T12:00:00.000Z';
const AT = '2026-01-01T09:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const plusDays = (day, n) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ fixture */

// Leader (operator) → vera (VP) → dan, eve, fay (directors) → mia, ned, fox
// (managers) → lou (lead) → ivy; ike, fin; dot reports to dan directly, so dan
// keeps a span when mia's home line moves. One declared matrix line: mia also
// reports to eve on a project line, so mia is the multi-line benefit owner.
const person = (id, managerId, level) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level, role: 'Operations', status: 'active', startDate: AT, createdAt: AT, updatedAt: AT });
const line = (id, personId, managerId, kind = 'project') => ({ id, personId, managerId, kind, shareH: 30, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: AT, note: '' });

function rawFixture(patch = {}, now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'), person('eve', 'vera', 'director'), person('fay', 'vera', 'director'),
    person('mia', 'dan', 'manager'), person('ned', 'eve', 'manager'), person('fox', 'fay', 'manager'),
    person('lou', 'mia', 'lead'), person('ivy', 'lou', 'ic'), person('ike', 'ned', 'ic'), person('fin', 'fox', 'ic'), person('dot', 'dan', 'ic'),
  ];
  raw.reportingLines = [line('rl-mia-eve', 'mia', 'eve')];
  return { ...raw, ...patch };
}
const fixture = (patch = {}, now = T0) => normalizeState(rawFixture(patch, now), { now: new Date(now) }).state;

function seed(state, startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  return { store, api, sit, on };
}

// The hand-computed case. Flows sit at exactly 0, 365, 730 and 1095 days, so at
// a 10% hurdle the discount factors are exactly 1/1.1, 1/1.21 and 1/1.331:
//   NPV = -1000 + 500/1.1 + 500/1.21 + 500/1.331 = 243.42599549… → 243.43
const annual = (base) => [0, 365, 730, 1095].map((n) => plusDays(base, n));
const typedA = (base = '2027-01-01') => {
  const [d0, d1, d2, d3] = annual(base);
  return [
    { on: d0, kind: 'outlay', amount: '1000' },
    { on: d1, kind: 'benefit', amount: '500' },
    { on: d2, kind: 'benefit', amount: '500' },
    { on: d3, kind: 'benefit', amount: '500.00' },
  ];
};
const storedA = (base = '2027-01-01') => {
  const [d0, d1, d2, d3] = annual(base);
  return [
    { on: d0, kind: 'outlay', cents: -100000 },
    { on: d1, kind: 'benefit', cents: 50000 },
    { on: d2, kind: 'benefit', cents: 50000 },
    { on: d3, kind: 'benefit', cents: 50000 },
  ];
};
const draftA = (extra = {}) => ({ title: 'Second filling line', ownerId: 'mia', currency: 'DKK', basis: 'nominal', hurdlePct: '10', flows: typedA(), reviewOn: '2028-12-31', ...extra });

// Stored rows for tests that need a ledger with history without walking the door.
const storedCase = (id, extra = {}) => ({
  id, title: `Case ${id}`, ownerId: 'mia', currency: 'DKK', basis: 'nominal', hurdleBp: 1000, baseOn: '2027-01-01', reviewOn: '2028-12-31',
  flows: storedA(), note: '', declaredOn: '2026-12-01', declaredAt: '2026-12-01T09:00:00.000Z', declaredById: 'mia', engineVersion: 'test', ...extra,
});
const approveAct = (id, caseId, extra = {}) => ({ id, caseId, kind: 'approve', actedOn: '2026-12-05', actedAt: '2026-12-05T09:00:00.000Z', actedById: 'dan', via: 'home-line', reason: '', ...extra });
const reviewAct = (id, caseId, outlayCents, benefitCents, extra = {}) => ({
  id, caseId, kind: 'review', actedOn: '2029-01-05', actedAt: '2029-01-05T09:00:00.000Z', actedById: 'dan', via: 'home-line', reason: '',
  cutoffOn: '2028-12-31', outlayComplete: true, nextReviewOn: null,
  flows: [
    { on: '2027-01-01', kind: 'outlay', cents: -outlayCents },
    { on: '2028-01-01', kind: 'benefit', cents: benefitCents },
    { on: '2028-12-31', kind: 'benefit', cents: benefitCents },
  ],
  ...extra,
});

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key.includes('AnimationFrame') && dom.window[key] ? dom.window[key].bind(dom.window) : (typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key]);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function csvObjects(text) {
  const parsed = parseCsv(text);
  return parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, index) => [header, cells[index] ?? ''])));
}

const asksOf = (store) => indexInvestmentCaseAsks(store.state).filter((ask) => ask.task);
const openAsksOf = (store) => asksOf(store).filter((ask) => ask.task.status === 'active');

// Frozen reference vectors. Generated once with mpmath at 90 significant digits
// by the declared rule — (1 + r)^-(days/365), snap to a billionth of a cent,
// half away from zero — and cross-checked against pyxirr 0.10.8. Flows are
// [day, kind, signed cents].
const VECTORS = [
  {"label": "irregular dates, unique rate", "baseOn": "2023-05-17", "hurdleBp": 800, "flows": [["2023-05-17", "outlay", -822759166], ["2025-05-21", "benefit", 190458306]], "npvCents": -659643923, "pvOutlayCents": 822759166, "pvBenefitCents": 163115243, "pvResidualCents": 0, "piPermille": 198, "residualSharePermille": null, "irrState": "unique", "irrMicro": -516469},
  {"label": "ten-trillion-cent flows", "baseOn": "2029-02-02", "hurdleBp": 1, "flows": [["2029-02-02", "outlay", -7422064247207], ["2029-10-23", "benefit", 711916109552]], "npvCents": -6710199430211, "pvOutlayCents": 7422064247207, "pvBenefitCents": 711864816996, "pvResidualCents": 0, "piPermille": 96, "residualSharePermille": null, "irrState": "unique", "irrMicro": -961359},
  {"label": "flows of a few cents", "baseOn": "2023-11-29", "hurdleBp": 0, "flows": [["2023-11-29", "outlay", -211], ["2024-12-23", "benefit", 270], ["2025-04-19", "benefit", 436], ["2027-03-08", "benefit", 117]], "npvCents": 612, "pvOutlayCents": 211, "pvBenefitCents": 823, "pvResidualCents": 0, "piPermille": 3900, "residualSharePermille": null, "irrState": "unique", "irrMicro": 1666882},
  {"label": "zero hurdle", "baseOn": "2021-07-31", "hurdleBp": 0, "flows": [["2021-07-31", "outlay", -87787419], ["2022-07-31", "benefit", 89186967], ["2023-07-31", "benefit", 8591417], ["2024-07-30", "benefit", 65087020], ["2025-07-30", "benefit", 63047224], ["2026-07-30", "benefit", 55004551], ["2027-07-30", "benefit", 88346304]], "npvCents": 281476064, "pvOutlayCents": 87787419, "pvBenefitCents": 369263483, "pvResidualCents": 0, "piPermille": 4206, "residualSharePermille": null, "irrState": "unique", "irrMicro": 661592},
  {"label": "hundred-percent hurdle", "baseOn": "2030-03-25", "hurdleBp": 10000, "flows": [["2030-03-25", "outlay", -3467], ["2032-03-17", "outlay", -3743], ["2032-12-11", "benefit", 4331], ["2034-05-11", "benefit", 6328]], "npvCents": -3396, "pvOutlayCents": 4415, "pvBenefitCents": 1019, "pvResidualCents": 0, "piPermille": 231, "residualSharePermille": null, "irrState": "unique", "irrMicro": 164554},
  {"label": "several sign changes", "baseOn": "2030-06-24", "hurdleBp": 9776, "flows": [["2030-06-24", "outlay", -9013103646198], ["2031-10-17", "benefit", 5694124934915], ["2032-07-07", "benefit", 9557987104164], ["2034-10-07", "residual", -3507574861988], ["2034-12-26", "benefit", 6423178749261], ["2035-07-15", "benefit", 4573718327050], ["2036-04-14", "benefit", 7655120519300], ["2037-11-10", "benefit", 9698817471874], ["2038-02-25", "benefit", 1304818717677]], "npvCents": -3840411051307, "pvOutlayCents": 9013103646198, "pvBenefitCents": 5360819661197, "pvResidualCents": -188127066306, "piPermille": 574, "residualSharePermille": null, "irrState": "multiple-sign-changes", "irrMicro": null},
  {"label": "rate above the bracket", "baseOn": "2022-09-30", "hurdleBp": 250, "flows": [["2022-09-30", "outlay", -906044], ["2023-02-14", "benefit", 9730962], ["2024-06-24", "benefit", 4757231], ["2025-01-02", "benefit", 3585123]], "npvCents": 16683470, "pvOutlayCents": 906044, "pvBenefitCents": 17589514, "pvResidualCents": 0, "piPermille": 19414, "residualSharePermille": null, "irrState": "above-bracket", "irrMicro": null},
  {"label": "one-signed stream", "baseOn": "2023-10-03", "hurdleBp": 1000, "flows": [["2023-10-03", "outlay", -48027], ["2026-01-30", "outlay", -33368]], "npvCents": -74753, "pvOutlayCents": 74753, "pvBenefitCents": 0, "pvResidualCents": 0, "piPermille": 0, "residualSharePermille": null, "irrState": "no-sign-change", "irrMicro": null},
  {"label": "negative unique rate", "baseOn": "2028-02-01", "hurdleBp": 800, "flows": [["2028-02-01", "outlay", -902421135], ["2029-09-20", "benefit", 477516482], ["2030-12-07", "benefit", 56393699]], "npvCents": -436095148, "pvOutlayCents": 902421135, "pvBenefitCents": 466325987, "pvResidualCents": 0, "piPermille": 517, "residualSharePermille": null, "irrState": "unique", "irrMicro": -254595},
  {"label": "residual share", "baseOn": "2023-11-27", "hurdleBp": 1234, "flows": [["2023-11-27", "outlay", -408445508], ["2024-01-18", "benefit", 705418451], ["2025-04-11", "benefit", 978904951], ["2027-08-11", "residual", 170666664], ["2028-09-27", "benefit", 721391198]], "npvCents": 1641488048, "pvOutlayCents": 408445508, "pvBenefitCents": 1939060704, "pvResidualCents": 110872852, "piPermille": 5019, "residualSharePermille": 54, "irrState": "unique", "irrMicro": 49102851},
];

/* ---------------------------------------------------------- 1. registration */

test('the register declares its rights, its pause, its export and its place on the spine', () => {
  for (const key of Object.values(INVESTMENT_CASE_RIGHTS)) assert.ok(ACTION_RIGHTS[key], `${key} is a declared right`);
  assert.equal(ACTION_RIGHTS[INVESTMENT_CASE_RIGHTS.READ].minRank, 1, 'every altitude may read its own span');
  assert.equal(ACTION_RIGHTS[INVESTMENT_CASE_RIGHTS.DECLARE].minRank, 2, 'declaring a capital promise is a manager’s act and above');
  assert.equal(ACTION_RIGHTS[INVESTMENT_CASE_RIGHTS.RATIFY].minRank, 3, 'decision control starts at the director altitude');
  // Reads are scoped inside the reader; every act needs its declared right.
  for (const name of ['investmentCaseReport', 'investmentCaseBriefText', 'investmentCaseCsvRows', 'investmentCaseAttentionCount']) assert.ok(SAFE_READS.has(name), name);
  for (const name of ['investmentCaseDeclare', 'investmentCaseDecide', 'investmentCaseReview', 'investmentCaseWithdraw', 'investmentCaseSetConventions']) assert.equal(SAFE_READS.has(name), false, name);
  // One rule in the closing block, with a matching contract. Pinned as an ORDER,
  // not as a distance from the end: "third from last" goes red the day the next
  // rule registers, which is how several older suites were found failing.
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  const at = ids.indexOf('investmentCaseRule');
  assert.ok(at >= 0, 'RULE-ICA-01 is on the shared spine');
  assert.equal(ids.lastIndexOf('investmentCaseRule'), at, 'registered exactly once');
  assert.ok(at > ids.indexOf('goalAttainmentRule'), 'after the goal-attainment rule');
  assert.ok(at < ids.indexOf('seatRule'), 'before the seat roll-up, which reads the finished workspace');
  assert.equal(ids.at(-2), 'seatRule');
  assert.equal(ids.at(-1), 'sealRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'rule/contract parity');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === investmentCaseRule);
  assert.ok(contract, 'RULE-ICA-01 has a propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'investmentCaseMarkers']);
  assert.equal(contract.scansWorkspace, true);
  assert.ok(contract.purpose.startsWith(`${INVESTMENT_CASE_RULE_ID}:`));
  // The pause reaches a second reporting line, and says so.
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(INVESTMENT_CASE_SETTING_KEYS.autoPropagate));
  assert.equal(PAUSE_PERMIT_REACH_RULES.investmentCaseAutoPropagate, 'investmentCaseRules.js');
  // The reach claim is checkable against the source, the way the pause-permit
  // audit checks it: the rule names its switch literally, gates on it, and reads
  // the reporting graph. (That shared audit is red for an older module, so this
  // module's half of it is pinned here rather than hidden behind that failure.)
  const ruleSource = fs.readFileSync(path.join(REPO, 'app/core/domain/investmentCaseRules.js'), 'utf8');
  assert.ok(ruleSource.includes(INVESTMENT_CASE_SETTING_KEYS.autoPropagate), 'the rule names its switch literally');
  assert.match(ruleSource, /investmentCaseAutoPropagate\s*===\s*false/, 'and stops when it is switched off');
  assert.match(ruleSource, /buildMatrix/, 'and reads the reporting graph, so silencing it can reach a second line');
  // CSV scope #150, identity-free.
  assert.equal(CSV_EXPORTS.length, 157);
  assert.equal(CSV_EXPORTS[149].key, INVESTMENT_CASE_CSV_SCOPE);
  assert.equal(CSV_EXPORTS[149].sensitive, false);
  // Report-only ledgers: the generic seat projection never hands the raw rows out.
  for (const key of ['investmentCases', 'investmentCaseActs', 'investmentCaseMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a real collection`);
    assert.equal(RECORD_POLICIES[key].detailCeiling, 0, `${key} is report-only`);
  }
});

/* --------------------------------------------------------------- 2. schema */

test('v162 is additive, starts empty, assumes no hurdle rate and invents no case from an envelope', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 161 };
  delete old.investmentCases; delete old.investmentCaseActs; delete old.investmentCaseMarkers;
  old.people = [person('mia', null, 'manager')];
  old.budgets = [{ id: 'b1', name: 'Capex FY27', currency: 'DKK', limit: 500000, status: 'active', ownerId: 'mia', lines: [], createdAt: AT, updatedAt: AT }];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 169);
  assert.deepEqual(next.applied.at(-1), '168 → 169');
  assert.deepEqual([next.raw.investmentCases, next.raw.investmentCaseActs, next.raw.investmentCaseMarkers], [[], [], []]);
  assert.equal(next.raw.settings.investmentCaseAskDueDays, 14);
  assert.equal(next.raw.settings.investmentCaseAutoPropagate, true);
  // No setting carries a default discount rate: each case declares its own.
  assert.equal(Object.keys(next.raw.settings).some((key) => /hurdle|discount/i.test(key) && key.startsWith('investmentCase')), false);
  // An envelope says how much MAY be spent; it is never read as a case.
  assert.equal(normalizeState(next.raw, { now: new Date(T0) }).state.investmentCases.length, 0);
  // The loader clamps a convention; only an explicit false pauses the rule.
  const clamped = normalizeInvestmentCaseSettings({ investmentCaseAskDueDays: 999, investmentCaseAutoPropagate: 'off' });
  assert.deepEqual(clamped, { investmentCaseAskDueDays: 60, investmentCaseAutoPropagate: true });
});

test('a stored case is read to the exact cent or dropped — never repaired', () => {
  const good = storedCase('c1');
  const cases = [
    good,
    storedCase('c2', { flows: [{ on: '2027-01-01', kind: 'outlay', cents: -100000.5 }, { on: '2028-01-01', kind: 'benefit', cents: 50000 }] }), // a fraction of a cent
    storedCase('c3', { flows: [{ on: '2027-01-01', kind: 'outlay', cents: 100000 }, { on: '2028-01-01', kind: 'benefit', cents: 50000 }] }),    // an outlay that is money in
    storedCase('c4', { flows: [{ on: '2027-01-01', kind: 'outlay', cents: -100000 }, { on: '2028-01-01', kind: 'residual', cents: 50000 }] }),  // no dated benefit
    storedCase('c5', { flows: [{ on: '2026-06-01', kind: 'outlay', cents: -100000 }, { on: '2028-01-01', kind: 'benefit', cents: 50000 }] }),   // sunk before the valuation day
    storedCase('c6', { reviewOn: '2027-06-01' }),                                                                                             // reviewed before anything is promised
    storedCase('c7', { hurdleBp: 8.5 }),                                                                                                      // a rate that is not whole basis points
    storedCase('c8', { ownerId: '' }),                                                                                                        // a promise nobody made
    storedCase('c9', { currency: 'kr' }),
    storedCase('c1', { title: 'A second row under the same id' }),
    storedCase('c10', { flows: [{ on: '2027-02-30', kind: 'outlay', cents: -1 }, { on: '2028-01-01', kind: 'benefit', cents: 2 }] }),          // not a calendar day
  ];
  const warnings = [];
  const kept = normalizeInvestmentCases(cases, warnings);
  assert.deepEqual(kept.map((row) => row.id), ['c1']);
  assert.equal(warnings.length, 1, 'one counted warning, not ten');
  assert.match(warnings[0], /^10 investment-case row\(s\)/);
  // Nothing derived is stored on the row that survives.
  for (const key of ['npvCents', 'irr', 'status', 'payback', 'pi']) assert.equal(key in kept[0], false, `${key} is never stored`);
  assert.deepEqual(kept[0].flows, storedA());
});

test('acts are read through the case’s own lifecycle: a forged self-ratification cannot be loaded', () => {
  const cases = normalizeInvestmentCases([storedCase('c1'), storedCase('c2')], []);
  const warnings = [];
  const acts = normalizeInvestmentCaseActs([
    approveAct('a0', 'c1', { actedById: 'mia' }),                         // the benefit owner ratifying their own case
    approveAct('a1', 'c1'),                                                // admitted
    approveAct('a2', 'c1', { actedById: 'vera' }),                         // a second decision on one case
    reviewAct('a3', 'c2', 100000, 50000),                                  // a review of a case nobody ratified
    reviewAct('a4', 'c1', 100000, 50000, { actedById: 'mia' }),            // the owner grading their own case
    reviewAct('a5', 'c1', 100000, 50000, { cutoffOn: '2028-06-30', actedOn: '2028-07-02', nextReviewOn: null }), // a final review short of the declared day
    reviewAct('a6', 'c1', 100000, 50000, { cutoffOn: '2028-06-30', actedOn: '2028-07-02', nextReviewOn: '2028-12-31',
      flows: [{ on: '2027-01-01', kind: 'outlay', cents: -100000 }, { on: '2028-01-01', kind: 'benefit', cents: 50000 }] }), // admitted (interim)
    reviewAct('a7', 'c1', 100000, 50000, { cutoffOn: '2028-06-30', actedOn: '2028-08-01' }),                             // a cut-off that does not move forward
    reviewAct('a8', 'c1', 100000, 50000, { outlayComplete: false }),                                                     // re-opening a completed outlay
    reviewAct('a9', 'c1', 100000, 50000, { cutoffOn: '2029-06-30' }),                                                    // a cut-off after the day it was recorded
    approveAct('a10', 'nope'),                                             // a case that is not on the record
    approveAct('a11', 'c2', { via: null }),                                // control that states no route
    reviewAct('a12', 'c1', 100000, 50000),                                 // admitted (final) — closes c1
    reviewAct('a13', 'c1', 100000, 50000, { cutoffOn: '2029-01-04' }),     // a review of a closed case
  ], cases, warnings);
  assert.deepEqual(acts.map((act) => act.id), ['a1', 'a6', 'a12']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^11 investment-case act row\(s\)/);
  assert.match(warnings[0], /signed by the case’s own benefit owner/);
});

/* --------------------------------------------------------------- 3. kernel */

test('the hand-computed case: value, index, rate, payback and exposure to the cent', () => {
  const a = appraiseInvestment({ flows: storedA(), baseOn: '2027-01-01', hurdleBp: 1000 });
  assert.equal(a.ok, true);
  // -1000 + 500/1.1 + 500/1.21 + 500/1.331 = 243.42599549…
  assert.equal(a.npvCents, 24343);
  assert.equal(a.pvOutlayCents, 100000);
  assert.equal(a.pvBenefitCents, 124343);
  assert.equal(a.pvResidualCents, 0);
  assert.equal(a.piPermille, 1243, '1243.426 / 1000');
  // v + v² + v³ = 2  →  r = 23.3751928…%: unique, and FLOORED to a millionth.
  assert.deepEqual(a.irr, { state: 'unique', micro: 233751, signChanges: 1 });
  assert.equal(a.marginMicro, 233751 - 100000);
  // -1000, -500, 0: the running total stops being negative on day 730. No interpolation.
  assert.deepEqual(a.payback, { state: 'pays-back', on: '2028-12-31', days: 730 });
  // Discounted: -1000, -545.45, -132.23, +243.43 — a year later.
  assert.deepEqual(a.discountedPayback, { state: 'pays-back', on: '2029-12-31', days: 1095 });
  assert.equal(a.peakExposureCents, 100000);
  assert.equal(a.peakExposureOn, '2027-01-01');
  assert.deepEqual(a.undiscounted, { outlayCents: 100000, benefitCents: 150000, residualCents: 0, netCents: 50000 });
  assert.deepEqual(a.refusals, []);
  // At a zero hurdle the value IS the plain sum, exactly.
  assert.equal(appraiseInvestment({ flows: storedA(), baseOn: '2027-01-01', hurdleBp: 0 }).npvCents, 50000);
  // The stream is worth exactly zero at its own rate of return, within a cent.
  assert.ok(Math.abs(appraiseInvestment({ flows: storedA(), baseOn: '2027-01-01', hurdleBp: 2338 }).npvCents) < 20);
});

test('the declared rounding rule: an exact half cent rounds away from zero, in either direction', () => {
  // One cent out today; N cents back in exactly 365 days at 100%: worth N/2 cents.
  const one = (cents) => appraiseInvestment({ baseOn: '2027-01-01', hurdleBp: 10000, flows: [{ on: '2027-01-01', kind: 'outlay', cents: -1 }, { on: '2028-01-01', kind: 'benefit', cents }] });
  assert.equal(one(1).pvBenefitCents, 1, '0.5 → 1');
  assert.equal(one(1).npvCents, -1, '-0.5 → -1');
  assert.equal(one(3).pvBenefitCents, 2, '1.5 → 2');
  assert.equal(one(2).npvCents, 0, 'exactly zero is zero');
  assert.equal(one(2).npvSign, 0);
  assert.deepEqual(one(2).irr, { state: 'unique', micro: 1000000, signChanges: 1 }, '1 → 2 in a year is exactly 100%');
});

test('a rate of return is printed only where exactly one exists', () => {
  // Lorie & Savage's pump: -1600, +10000, -10000. Worth zero at 25% AND at 400%.
  const pump = [
    { on: '2026-01-01', kind: 'outlay', cents: -160000 },
    { on: '2027-01-01', kind: 'benefit', cents: 1000000 },
    { on: '2028-01-01', kind: 'residual', cents: -1000000 },
  ];
  const at10 = appraiseInvestment({ flows: pump, baseOn: '2026-01-01', hurdleBp: 1000 });
  assert.equal(at10.irr.state, 'multiple-sign-changes');
  assert.equal(at10.irr.micro, null, 'no rate is printed');
  assert.equal(at10.irr.signChanges, 2);
  assert.equal(at10.npvCents, -77355, '-1600 + 10000/1.1 - 10000/1.21');
  assert.ok(at10.refusals.includes('irr:multiple-sign-changes'));
  // The value at 25% really is zero — which is why a tool that prints "25%" alone misleads.
  const at25 = appraiseInvestment({ flows: pump, baseOn: '2026-01-01', hurdleBp: 2500 });
  assert.equal(at25.npvCents, 0);
  assert.equal(at25.npvSign, 0);
  // Money in before money out: the one rate that exists is a borrowing cost.
  const loan = [{ on: '2026-01-01', kind: 'benefit', cents: 100000 }, { on: '2027-01-01', kind: 'outlay', cents: -110000 }];
  assert.equal(investmentIrr(loan, '2026-01-01').state, 'inflow-first');
  // Money that only goes one way has no rate at all.
  assert.equal(investmentIrr([{ on: '2026-01-01', kind: 'outlay', cents: -5 }, { on: '2027-01-01', kind: 'outlay', cents: -5 }], '2026-01-01').state, 'no-sign-change');
  // Two flows on one day are one coefficient: +10 and -30 on day 0 is money out.
  const sameDay = [{ on: '2026-01-01', kind: 'benefit', cents: 1000 }, { on: '2026-01-01', kind: 'outlay', cents: -3000 }, { on: '2027-01-01', kind: 'benefit', cents: 2200 }];
  assert.deepEqual(investmentIrr(sameDay, '2026-01-01'), { state: 'unique', micro: 100000, signChanges: 1 });
  // A flow dated before the valuation day is sunk; the stream refuses.
  assert.equal(appraiseInvestment({ flows: storedA(), baseOn: '2027-06-01', hurdleBp: 1000 }).ok, false);
});

test('the spreadsheet a finance team already trusts: the documented XNPV / XIRR example', () => {
  // -10,000 on 2008-01-01; 2,750 / 4,250 / 3,250 / 2,750 on four later dates.
  // Documented results: XNPV at 9% = 2,086.65; XIRR = 0.373362535.
  const flows = [
    { on: '2008-01-01', kind: 'outlay', cents: -1000000 },
    { on: '2008-03-01', kind: 'benefit', cents: 275000 },
    { on: '2008-10-30', kind: 'benefit', cents: 425000 },
    { on: '2009-02-15', kind: 'benefit', cents: 325000 },
    { on: '2009-04-01', kind: 'benefit', cents: 275000 },
  ];
  const a = appraiseInvestment({ flows, baseOn: '2008-01-01', hurdleBp: 900 });
  assert.equal(a.npvCents, 208665);
  assert.deepEqual(a.irr, { state: 'unique', micro: 373362, signChanges: 1 });
});

test('frozen 90-digit reference vectors agree to the cent, the permille and the millionth', () => {
  assert.equal(VECTORS.length, 10);
  for (const v of VECTORS) {
    const flows = v.flows.map(([on, kind, cents]) => ({ on, kind, cents }));
    const a = appraiseInvestment({ flows, baseOn: v.baseOn, hurdleBp: v.hurdleBp });
    assert.equal(a.ok, true, v.label);
    for (const key of ['npvCents', 'pvOutlayCents', 'pvBenefitCents', 'pvResidualCents', 'piPermille', 'residualSharePermille']) {
      assert.equal(a[key], v[key], `${v.label}: ${key}`);
    }
    assert.equal(a.irr.state, v.irrState, `${v.label}: irr state`);
    assert.equal(a.irr.micro, v.irrMicro, `${v.label}: irr`);
    // The same stream in a different order is the same stream.
    const shuffled = appraiseInvestment({ flows: [...flows].reverse(), baseOn: v.baseOn, hurdleBp: v.hurdleBp });
    assert.equal(shuffled.npvCents, a.npvCents, `${v.label}: order-independent`);
  }
  // Ten-trillion-cent flows stay inside exact integers end to end.
  assert.ok(VECTORS.some((v) => Math.abs(v.npvCents) > 1e12));
});

/* ------------------------------------------------------- 4. typed amounts */

test('a typed amount becomes exact cents with no floating point in between, or is refused', () => {
  assert.equal(parseInvestmentAmount('250000'), 25000000);
  assert.equal(parseInvestmentAmount('1234567.89'), 123456789);
  assert.equal(parseInvestmentAmount('0.07'), 7);
  assert.equal(parseInvestmentAmount('-1200.5'), -120050);
  assert.equal(parseInvestmentAmount(19.99), 1999, 'a number is read through its own decimal text');
  assert.equal(parseInvestmentAmount('1000000000000'), 100000000000000, 'a trillion is the declared bound');
  // Refused, never rounded into something readable.
  for (const bad of ['1,000', '1.000,50', '1e6', '12.345', '', ' ', 'abc', 0.1 + 0.2, Infinity, null, undefined, '1000000000001', '--5']) {
    assert.equal(parseInvestmentAmount(bad), null, `${String(bad)} is refused`);
  }
  assert.equal(parseInvestmentRatePercent('8.5'), 850);
  assert.equal(parseInvestmentRatePercent('12.25%'), 1225);
  assert.equal(parseInvestmentRatePercent('0'), 0);
  assert.equal(parseInvestmentRatePercent('100'), 10000);
  for (const bad of ['100.01', '8.555', '-1', 'eight', '']) assert.equal(parseInvestmentRatePercent(bad), null, `${bad} is refused`);
});

test('the flow grammar reads a pasted column, names the line it refuses, and round-trips', () => {
  const read = parseInvestmentFlowLines('# the promise\n2027-01-01\toutlay\t1000\n2028-01-01, benefit, 500\n\n2028-12-31; benefit; 500\n2029-12-31 Benefit 500.00');
  assert.equal(read.ok, true, read.error);
  assert.deepEqual(read.flows, storedA());
  // Stored → text → stored is the identity.
  assert.deepEqual(parseInvestmentFlowLines(investmentFlowLines(read.flows)).flows, read.flows);
  const refusals = [
    ['2027-01-01 outlay', /Line 1 has 2 field\(s\)/],
    ['2027-01-01 outlay 1000\n2028-01-01 benefit 1,500', /Line 2 has 4 field\(s\)/],          // a thousands separator splits the amount
    ['2027-01-01 outlay 1000\n2027-02-30 benefit 5', /Line 2 has no real calendar day/],
    ['2027-01-01 capex 1000', /Line 1 names no declared kind/],
    ['2027-01-01 outlay -1000', /an outlay is entered as a positive amount/],
    ['2027-01-01 benefit 0', /is zero/],
    ['2027-01-01 benefit 12.345', /cannot be read exactly/],
  ];
  for (const [text, pattern] of refusals) {
    const result = parseInvestmentFlowLines(text);
    assert.equal(result.ok, false, text);
    assert.match(result.error, pattern);
  }
});

/* ---------------------------------------------------------------- 5. the door */

test('a case is declared whole or not at all, and what is stored is exactly what was typed', () => {
  const { store, api } = seed(fixture());
  const refusals = [
    [{ ownerId: '' }, /Name the benefit owner/],
    [{ ownerId: 'nobody' }, /not on the active roster/],
    [{ currency: 'kr' }, /three-letter code/],
    [{ basis: undefined }, /nominal or real/],
    [{ hurdlePct: '' }, /No rate is assumed for you/],
    [{ reviewOn: '' }, /nobody intends to check/],
    [{ reviewOn: '2027-06-01' }, /before the first promised benefit/],
    [{ flows: typedA().slice(0, 1) }, /at least two dated flows/],
    [{ flows: [typedA()[0], { on: '2028-01-01', kind: 'residual', amount: '900' }] }, /names no dated benefit/],
    [{ flows: typedA().slice(1) }, /names no outlay/],
    [{ baseOn: '2027-06-01' }, /before the valuation day/],
    [{ flows: [...typedA(), { on: '2028-06-01', kind: 'benefit', amount: '0.001' }] }, /cannot be read exactly/],
    [{ title: 'x' }, /Name the case/],
    [{ note: 'short' }, /at least 8 characters/],
  ];
  for (const [patch, pattern] of refusals) {
    const result = api.investmentCaseDeclare(draftA(patch));
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.match(result.error, pattern);
  }
  assert.equal(store.state.investmentCases.length, 0, 'a refused declaration writes nothing');

  // The preview and the declaration read the draft the same way.
  const preview = api.investmentCasePreview(draftA());
  assert.equal(preview.ok, true, preview.error);
  assert.equal(preview.appraisal.npvCents, 24343);
  assert.equal(preview.retrospective, false);
  assert.equal(store.state.investmentCases.length, 0, 'a preview writes nothing');

  const declared = api.investmentCaseDeclare(draftA({ flowsText: undefined }));
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.saved, true);
  assert.equal(declared.appraisal.npvCents, preview.appraisal.npvCents);
  const stored = store.state.investmentCases[0];
  assert.deepEqual(stored.flows, storedA(), 'typed 1000 / 500 / 500.00 are stored as exact cents');
  assert.equal(stored.hurdleBp, 1000);
  assert.equal(stored.baseOn, '2027-01-01', 'the valuation day defaults to the first flow day');
  assert.equal(stored.declaredOn, '2026-11-15');
  assert.equal(stored.declaredById, 'leader');
  // Nothing derived is written beside the flows.
  for (const key of ['npvCents', 'irr', 'status', 'appraisal', 'payback']) assert.equal(key in stored, false, `${key} is never stored`);
  // Immutable: there is no command that edits a declared case.
  assert.equal(Object.keys(api).filter((name) => /^investmentCase/.test(name) && /Edit|Update|Amend|Delete|Remove/.test(name)).length, 0);
  // The text grammar is the same door.
  const viaText = api.investmentCaseDeclare(draftA({ title: 'Typed as lines', flows: undefined, flowsText: investmentFlowLines(storedA()) }));
  assert.equal(viaText.ok, true, viaText.error);
  assert.deepEqual(store.state.investmentCases[1].flows, storedA());
  // A case declared after its first outlay day is flagged as written with hindsight.
  const late = api.investmentCaseDeclare(draftA({ title: 'Backfilled case', flows: typedA('2026-01-01'), reviewOn: '2027-12-31' }));
  assert.equal(late.ok, true, late.error);
  assert.equal(late.retrospective, true);
});

/* ------------------------------------------------------ 6. decision control */

test('decision control is never the benefit owner’s own act, and a value-destroying case needs its reason in writing', () => {
  const { store, api, sit } = seed(fixture());
  const mine = api.investmentCaseDeclare(draftA());
  const dans = api.investmentCaseDeclare(draftA({ title: 'Dan’s own line', ownerId: 'dan' }));
  // 420,000 out; 150,000 a year for three years plus 40,000 residual. "Pays back in three years" — and is worth less than zero at 8.5%.
  const weak = api.investmentCaseDeclare(draftA({ title: 'Pays back in three years', hurdlePct: '8.5', reviewOn: '2028-06-01', flows: [
    { on: '2026-12-01', kind: 'outlay', amount: '420000' },
    { on: '2027-12-01', kind: 'benefit', amount: '150000' },
    { on: '2028-12-01', kind: 'benefit', amount: '150000' },
    { on: '2029-12-01', kind: 'benefit', amount: '150000' },
    { on: '2029-12-01', kind: 'residual', amount: '40000' },
  ] }));
  assert.equal(weak.ok, true, weak.error);
  assert.equal(weak.appraisal.payback.state, 'pays-back');
  assert.equal(weak.appraisal.npvSign, -1, 'paying back is not the same as being worth it');
  assert.ok(weak.appraisal.irr.micro < 85000, 'its unique rate of return sits below its own hurdle');

  // A manager may declare a case and may not ratify one: the rank window refuses at the gateway.
  sit('mia');
  assert.equal(api.investmentCaseDeclare(draftA({ title: 'Palletiser' })).ok, true);
  const byManager = api.investmentCaseDecide({ caseId: mine.caseId, decision: 'approve' });
  assert.equal(byManager.ok, false);
  assert.match(byManager.error, /rank window is 3–5/);

  // A director holds the right — and still cannot ratify the case they own.
  sit('dan');
  const self = api.investmentCaseDecide({ caseId: dans.caseId, decision: 'approve' });
  assert.equal(self.ok, false);
  assert.match(self.error, /You are this case’s benefit owner/);
  const selfReview = api.investmentCaseReview({ caseId: dans.caseId, cutoffOn: '2026-11-15', outlayComplete: false, flows: [] });
  assert.equal(selfReview.ok, false);
  assert.match(selfReview.error, /You are this case’s benefit owner/);

  // Ratifying a case worth less than zero at its own hurdle is refused without the reason.
  const blind = api.investmentCaseDecide({ caseId: weak.caseId, decision: 'approve' });
  assert.equal(blind.ok, false);
  assert.match(blind.error, /worth −DKK 5,642\.04/);
  assert.match(blind.error, /write the reason/);
  const reasoned = api.investmentCaseDecide({ caseId: weak.caseId, decision: 'approve', reason: 'Regulatory: the old line loses its permit in 2027.' });
  assert.equal(reasoned.ok, true, reasoned.error);

  // The ordinary ratification: dan holds mia in his own reporting tree.
  const ok = api.investmentCaseDecide({ caseId: mine.caseId, decision: 'approve' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.via, 'home-line');
  const act = store.state.investmentCaseActs.find((row) => row.caseId === mine.caseId);
  assert.deepEqual({ kind: act.kind, actedById: act.actedById, via: act.via, actedOn: act.actedOn }, { kind: 'approve', actedById: 'dan', via: 'home-line', actedOn: '2026-11-15' });
  // A case is ratified once.
  const twice = api.investmentCaseDecide({ caseId: mine.caseId, decision: 'reject', reason: 'Changed my mind about it.' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /ratified once/);

  // The seat above dan ratifies dan's own case; refusing needs its reason.
  sit('vera');
  assert.match(api.investmentCaseDecide({ caseId: dans.caseId, decision: 'reject' }).error, /Write why the case is refused/);
  const refused = api.investmentCaseDecide({ caseId: dans.caseId, decision: 'reject', reason: 'Capacity is not the constraint this year.' });
  assert.equal(refused.ok, true, refused.error);
  const report = api.investmentCaseReport().report;
  assert.equal(report.allCases.find((row) => row.caseId === dans.caseId).status, 'rejected');
  // Withdrawal is for a case still awaiting a decision, and needs a reason.
  const palletiser = store.state.investmentCases.find((row) => row.title === 'Palletiser');
  assert.match(api.investmentCaseWithdraw({ caseId: palletiser.id, reason: '' }).error, /Write why the case is withdrawn/);
  assert.equal(api.investmentCaseWithdraw({ caseId: palletiser.id, reason: 'Superseded by the filling-line case.' }).ok, true);
  assert.match(api.investmentCaseWithdraw({ caseId: mine.caseId, reason: 'Trying to withdraw a ratified case.' }).error, /Only a case still awaiting ratification/);
  // Every act that was saved survives its own loader.
  const reloaded = normalizeInvestmentCaseActs(store.state.investmentCaseActs, normalizeInvestmentCases(store.state.investmentCases, []), []);
  assert.equal(reloaded.length, store.state.investmentCaseActs.length);
});

/* ------------------------------------------------------------- 7. the matrix */

test('a case with a multi-line owner is seen by every line, ratified through a declared line, and counted once', () => {
  const { store, api, sit } = seed(fixture());
  const declared = api.investmentCaseDeclare(draftA());
  const other = api.investmentCaseDeclare(draftA({ title: 'Fox’s tooling', ownerId: 'fox' }));
  assert.equal(other.ok, true, other.error);

  // The operator view: two cases, one of them with a two-line owner.
  const whole = api.investmentCaseReport().report;
  assert.equal(whole.totals.casesN, 2);
  assert.equal(whole.totals.multiLineOwnerN, 1);
  assert.equal(whole.totals.outsideN, 0);

  // dan holds mia in his tree; eve holds her only on the declared project line.
  sit('dan');
  const dan = api.investmentCaseReport().report;
  assert.deepEqual(dan.allCases.map((row) => [row.title, row.matrix.reach, row.matrix.ownerLinesN]), [['Second filling line', 'tree', 2]]);
  assert.equal(dan.totals.outsideN, 1, 'fox’s case is counted, never listed');
  assert.ok(dan.refusals.some((row) => row.key === 'outside-span'));
  assert.ok(dan.refusals.some((row) => row.key === 'multi-line-owner'));

  sit('eve');
  const eve = api.investmentCaseReport().report;
  assert.deepEqual(eve.allCases.map((row) => [row.title, row.matrix.reach, row.matrix.multiLine]), [['Second filling line', 'line', true]]);
  assert.equal(eve.totals.viaLineN, 1);
  assert.equal(eve.allCases[0].can.decide, true, 'the line holder holds decision control too');
  // A declared line carries decision control, and the act records that it did.
  const viaLine = api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' });
  assert.equal(viaLine.ok, true, viaLine.error);
  assert.equal(viaLine.via, 'declared-line');
  assert.equal(store.state.investmentCaseActs.at(-1).via, 'declared-line');
  // eve cannot name somebody on a peer's branch as a benefit owner.
  const sideways = api.investmentCaseDeclare(draftA({ title: 'Sideways', ownerId: 'fin' }));
  assert.equal(sideways.ok, false);
  assert.match(sideways.error, /outside the operating span/);

  // fay sits on another branch: the case is outside her span, and she holds no control over it.
  sit('fay');
  const fay = api.investmentCaseReport().report;
  assert.deepEqual(fay.allCases.map((row) => row.title), ['Fox’s tooling']);
  assert.equal(fay.totals.outsideN, 1);
  const outside = api.investmentCaseDecide({ caseId: declared.caseId, decision: 'reject', reason: 'Not mine to refuse at all.' });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /outside this seat’s reporting tree and declared lines/);

  // Seen by two line holders, the case is still ONE case in the workspace — and in the export.
  sit(null);
  const after = api.investmentCaseReport().report;
  assert.equal(after.totals.casesN, 2);
  assert.equal(after.currencies[0].ratified.n, 1);
  assert.equal(after.currencies[0].ratified.outlayCents, 100000, 'one promised outlay, not one per line');
  const rows = investmentCaseCsvRows(after);
  assert.equal(rows.filter((row) => row.row_type === 'case').length, 2);
  assert.equal(rows.find((row) => row.row_type === 'workspace').multi_line_owner_n, 1);
  // A frontline lead's horizon is the week: lou reads his own span and may not declare.
  sit('lou');
  assert.equal(api.investmentCaseReport().report.totals.casesN, 0);
  assert.match(api.investmentCaseDeclare(draftA({ ownerId: 'ivy' })).error, /rank window is 2–5/);
});

/* -------------------------------------------------------------- 8. the review */

test('a review is compared with the dated promise: hand-computed ratios, and no cost ratio while the outlay is open', () => {
  const { store, api, sit, on } = seed(fixture());
  const declared = api.investmentCaseDeclare(draftA());
  sit('dan');
  assert.equal(api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' }).ok, true);
  const review = (patch) => api.investmentCaseReview({ caseId: declared.caseId, cutoffOn: '2028-01-01', outlayComplete: false, flows: [{ on: '2027-01-01', kind: 'outlay', amount: '700' }, { on: '2028-01-01', kind: 'benefit', amount: '400' }], nextReviewOn: '2028-12-31', ...patch });

  // A review states what happened, never what is expected.
  on('2027-06-01');
  assert.match(review({}).error, /after today/);
  on('2028-01-05');
  assert.match(review({ outlayComplete: undefined }).error, /Say whether the outlay is complete/);
  assert.match(review({ flows: [{ on: '2028-01-03', kind: 'benefit', amount: '400' }] }).error, /after the cut-off/);
  assert.match(review({ flows: [{ on: '2026-06-01', kind: 'outlay', amount: '10' }] }).error, /before the case’s valuation day/);
  assert.match(review({ flows: [] }).error, /needs a written note/);
  assert.match(review({ nextReviewOn: '' }).error, /stops short of the review day the case declared/);
  assert.match(review({ nextReviewOn: '2027-12-01' }).error, /must be after this review’s cut-off/);

  // First review, outlay still open: 700 of the promised 1000 is spent. Under budget, or late?
  const first = review({});
  assert.equal(first.ok, true, first.error);
  assert.equal(first.status, 'tracking');
  assert.equal(first.reading.costPermille, null, 'no cost ratio while money is still going out');
  assert.equal(first.reading.evidenceNpvCents, null);
  assert.ok(first.reading.refusals.includes('cost-ratio:outlay-open'));
  assert.equal(first.reading.benefitPermille, 800, '(400/1.1) / (500/1.1)');
  assert.ok(api.investmentCaseReport().report.refusals.some((row) => row.key === 'outlay-open'));

  // Second review: the outlay closed at 1200, and both benefits arrived at 400.
  on('2029-01-05');
  const cumulative = [{ on: '2027-01-01', kind: 'outlay', amount: '1200' }, { on: '2028-01-01', kind: 'benefit', amount: '400' }, { on: '2028-12-31', kind: 'benefit', amount: '400' }];
  assert.match(review({ cutoffOn: '2028-01-01', flows: cumulative.slice(0, 2), outlayComplete: true }).error, /must reach a later day/);
  const second = review({ cutoffOn: '2028-12-31', flows: cumulative, outlayComplete: true, nextReviewOn: '2029-12-31' });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.reading.costPermille, 1200, '1200 / 1000');
  assert.equal(second.reading.benefitPermille, 800, '(400/1.1 + 400/1.21) / (500/1.1 + 500/1.21)');
  // -1200 + 400/1.1 + 400/1.21 + [the promised 500/1.331 not yet due] = -130.1277…
  assert.equal(second.reading.evidenceNpvCents, -13013);
  assert.equal(second.reading.evidenceNpvSign, -1);
  assert.deepEqual(second.reading.undiscounted, {
    benefitPromisedToDateCents: 100000, benefitActualCents: 80000, outlayPromisedCents: 100000,
    outlayPromisedToDateCents: 100000, outlayActualCents: 120000, residualActualCents: 0,
  });
  // The kernel says the same thing when asked directly, from the STORED rows.
  const stored = store.state.investmentCases[0];
  const storedReview = store.state.investmentCaseActs.at(-1);
  const direct = reviewInvestment({ promised: stored.flows, actual: storedReview.flows, baseOn: stored.baseOn, hurdleBp: stored.hurdleBp, cutoffOn: storedReview.cutoffOn, outlayComplete: storedReview.outlayComplete });
  assert.deepEqual([direct.costPermille, direct.benefitPermille, direct.evidenceNpvCents], [1200, 800, -13013]);
  // A completed outlay is not re-opened by a later review.
  on('2030-01-05');
  assert.match(review({ cutoffOn: '2029-12-31', flows: cumulative, outlayComplete: false, nextReviewOn: '' }).error, /cannot re-open it/);
  // The final review reaches the declared day and closes the case.
  const final = review({ cutoffOn: '2029-12-31', flows: [...cumulative, { on: '2029-12-31', kind: 'benefit', amount: '450' }], outlayComplete: true, nextReviewOn: '' });
  assert.equal(final.ok, true, final.error);
  assert.equal(final.status, 'closed');
  // With nothing left to carry at the promise, the evidence IS the outcome: -1200 + 400/1.1 + 400/1.21 + 450/1.331
  assert.equal(final.reading.evidenceNpvCents, -16769);
  assert.match(review({ cutoffOn: '2030-01-01', flows: cumulative, outlayComplete: true }).error, /It is closed/);
});

/* ---------------------------------------------------------- 9. track record */

test('the track record is refused below its floor, exact at it, and never built from hindsight', () => {
  const NOW = at('2029-02-01');
  const ratios = [[100000, 30000], [110000, 35000], [120000, 40000], [130000, 45000], [150000, 50000]]; // cost 1.0–1.5×, benefit 0.6–1.0×
  const ledger = (n) => ({
    investmentCases: [
      ...ratios.slice(0, n).map((_, i) => storedCase(`h${i + 1}`)),
      // Declared after its first outlay day: reviewed, printed, and left out.
      storedCase('hindsight', { declaredOn: '2027-03-01', declaredAt: '2027-03-01T09:00:00.000Z' }),
      // The open promise the track record is applied to: the same shape, a later start.
      storedCase('open', { baseOn: '2029-03-01', reviewOn: '2030-03-01', flows: storedA('2029-03-01'), declaredOn: '2029-01-15', declaredAt: '2029-01-15T09:00:00.000Z' }),
    ],
    investmentCaseActs: [
      ...ratios.slice(0, n).flatMap(([outlay, benefit], i) => [approveAct(`a${i + 1}`, `h${i + 1}`), reviewAct(`r${i + 1}`, `h${i + 1}`, outlay, benefit)]),
      approveAct('ah', 'hindsight', { actedOn: '2027-03-02' }),
      reviewAct('rh', 'hindsight', 300000, 5000),
    ],
  });
  const read = (n, seat = null) => buildInvestmentCases(fixture(ledger(n), NOW.toISOString()), { now: NOW, seat });

  // Four reviewed cases: counts only, and no promise is re-read.
  const thin = read(4);
  assert.equal(thin.trackRecord.sufficient, false);
  assert.deepEqual([thin.trackRecord.costN, thin.trackRecord.benefitN, thin.trackRecord.floorN], [4, 4, 5]);
  assert.equal(thin.trackRecord.costMedianPermille, null);
  assert.equal(thin.trackRecord.benefitMedianPermille, null);
  assert.equal(thin.allCases.find((row) => row.caseId === 'open').adjusted.state, 'below-floor');
  assert.equal(thin.allCases.find((row) => row.caseId === 'open').adjusted.npvCents, null, 'a refused figure is null, never zero');
  assert.ok(thin.refusals.some((row) => row.key === 'track-record-below-floor'));

  // Five: the medians exist, and the hindsight case moved neither of them.
  const full = read(5);
  assert.equal(full.trackRecord.sufficient, true);
  assert.equal(full.trackRecord.costMedianPermille, 1200, 'median of 1.0, 1.1, 1.2, 1.3, 1.5');
  assert.equal(full.trackRecord.benefitMedianPermille, 800, 'median of 0.6, 0.7, 0.8, 0.9, 1.0');
  assert.equal(full.trackRecord.retrospectiveN, 1);
  assert.ok(full.refusals.some((row) => row.key === 'retrospective-excluded'));
  const hindsight = full.allCases.find((row) => row.caseId === 'hindsight');
  assert.equal(hindsight.retrospective, true);
  assert.equal(hindsight.latestReading.costPermille, 3000, 'its own ratios are still printed on its own card');

  // The open promise, re-read at the organisation's own record:
  //   1243.42599549 × 0.8 − 1000 × 1.2 = −205.2592…
  const open = full.allCases.find((row) => row.caseId === 'open');
  assert.equal(open.appraisal.npvCents, 24343, 'the promised figure is unchanged');
  assert.deepEqual(open.adjusted, { state: 'adjusted', npvCents: -20526, npvSign: -1 });
  assert.equal(adjustInvestment({ flows: storedA('2029-03-01'), baseOn: '2029-03-01', hurdleBp: 1000, costPermille: 1200, benefitPermille: 800 }).npvCents, -20526);
  // A closed case is evidence, not a promise: nothing is re-read on it.
  assert.equal(full.allCases.find((row) => row.caseId === 'h1').adjusted.state, 'not-applicable');
  // A seat whose own disclosure floor is higher is held to the higher floor.
  const exec = read(5, { id: 'vera', nodeId: 'vera', rank: 4, label: 'VP / executive', scope: new Set(['vera', 'dan', 'mia']), disclosure: { floorN: 8 } });
  assert.equal(exec.trackRecord.floorN, 8);
  assert.equal(exec.trackRecord.sufficient, false);
  // An even count takes the mean of the two middles.
  assert.equal(investmentMedian([1000, 1100, 1300, 1500]), 1200);
  assert.equal(investmentMedian([1000, 1101]), 1051, 'half up');
  assert.equal(investmentMedian([]), null);
});

/* ----------------------------------------------------------------- 10. rule */

test('RULE-ICA-01: a due review becomes ONE dated ask to the seat that ratified — never to the benefit owner', () => {
  const { store, api, sit, on } = seed(fixture());
  const declared = api.investmentCaseDeclare(draftA());
  sit('dan');
  assert.equal(api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' }).ok, true);
  sit(null);

  // The day before the declared review day: nothing is due, nobody is asked.
  on('2028-12-30');
  assert.equal(api.investmentCaseScan().ok, true);
  assert.equal(asksOf(store).length, 0);
  assert.equal(api.investmentCaseReport().report.allCases[0].status, 'approved');

  // The review day arrives.
  on('2028-12-31');
  const scan = api.investmentCaseScan();
  assert.equal(scan.ok, true, scan.error);
  assert.deepEqual(scan.effects.map((effect) => effect.action), ['delegated']);
  const asks = openAsksOf(store);
  assert.equal(asks.length, 1);
  const task = asks[0].task;
  assert.equal(task.personId, 'dan', 'the seat that ratified holds decision control');
  assert.notEqual(task.personId, 'mia', 'the benefit owner is never asked to grade their own case');
  assert.equal(task.authority, 'act-inform');
  assert.equal(task.dueOn, '2029-01-14', 'today plus the declared 14-day ask window');
  assert.match(task.title, /Post-completion review is due/);
  assert.equal(asks[0].signature, investmentCaseSignature({ caseId: declared.caseId, dueOn: '2028-12-31' }));
  assert.match(asks[0].signature, /^ica1:[0-9a-f]{16}$/);
  // Typed provenance: the obligation, and one roll-up edge per roster ancestor.
  const links = store.state.links.filter((link) => link.ruleId === INVESTMENT_CASE_RULE_ID);
  assert.ok(links.some((link) => link.relation === 'issues-obligation' && link.sourceId === 'dan' && link.targetId === task.id));
  assert.deepEqual(links.filter((link) => link.relation === 'rolls-up-to').map((link) => link.targetId).sort(), ['vera']);
  // Idempotent: further commits and scans file nothing more.
  api.investmentCaseScan();
  store.update(() => {}, { type: 'workspace.touched', entity: 'workspace', entityId: 'x', summary: 'an unrelated commit' });
  assert.equal(asksOf(store).length, 1);
  const report = api.investmentCaseReport().report;
  assert.equal(report.allCases[0].status, 'review-due');
  assert.deepEqual([report.allCases[0].monitor.state, report.allCases[0].monitor.seatId, report.allCases[0].monitor.basis], ['seat', 'dan', 'ratifier']);
  assert.equal(report.attentionN, 1, 'the operator view counts the review that is owed');

  // Recording the review closes the ask, in the rule's own words.
  sit('dan');
  on('2029-01-03');
  const reviewed = api.investmentCaseReview({ caseId: declared.caseId, cutoffOn: '2028-12-31', outlayComplete: true, nextReviewOn: '2029-12-31',
    flows: [{ on: '2027-01-01', kind: 'outlay', amount: '1000' }, { on: '2028-01-01', kind: 'benefit', amount: '500' }, { on: '2028-12-31', kind: 'benefit', amount: '500' }] });
  assert.equal(reviewed.ok, true, reviewed.error);
  assert.equal(openAsksOf(store).length, 0);
  assert.equal(task.id, asksOf(store)[0].task.id);
  assert.equal(asksOf(store)[0].task.status, 'done');
  assert.ok(asksOf(store)[0].task.completionNote.startsWith(INVESTMENT_CASE_CLOSED_PREFIX));
  // The NEXT declared review day is a new obligation with its own signature.
  sit(null);
  on('2029-12-31');
  api.investmentCaseScan();
  assert.equal(openAsksOf(store).length, 1);
  assert.equal(openAsksOf(store)[0].signature, investmentCaseSignature({ caseId: declared.caseId, dueOn: '2029-12-31' }));
  assert.equal(asksOf(store).length, 2);
});

test('RULE-ICA-01 in a matrix: when control moves, the ask goes to the seat above BOTH lines — not to either line’s manager', () => {
  const { store, api, sit, on } = seed(fixture());
  const declared = api.investmentCaseDeclare(draftA());
  sit('dan');
  assert.equal(api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' }).ok, true);
  sit(null);
  on('2028-12-31');
  api.investmentCaseScan();
  assert.deepEqual(openAsksOf(store).map((ask) => ask.task.personId), ['dan']);

  // A re-organisation moves mia's home line from dan to fay. Her project line to
  // eve stands. dan no longer sits above her; fay and eve each hold ONE line.
  store.update((draft) => { draft.people.find((row) => row.id === 'mia').managerId = 'fay'; },
    { type: 'person.updated', entity: 'person', entityId: 'mia', summary: 'home line moved' });
  const open = openAsksOf(store);
  assert.deepEqual(open.map((ask) => ask.task.personId), ['vera'], 'the joint apex of fay and eve');
  for (const lineManager of ['fay', 'eve', 'mia', 'dan']) {
    assert.equal(open.some((ask) => ask.task.personId === lineManager), false, `${lineManager} is not asked on behalf of the other line`);
  }
  const stale = asksOf(store).find((ask) => ask.task.personId === 'dan').task;
  assert.equal(stale.status, 'done');
  assert.match(stale.completionNote, /decision control over this case moved/);
  const row = api.investmentCaseReport().report.allCases[0];
  assert.deepEqual([row.monitor.state, row.monitor.seatId, row.monitor.basis], ['seat', 'vera', 'joint-apex']);
  assert.equal(row.matrix.ownerLinesN, 2);
  // The case is still one case, and still visible to both line holders.
  for (const holder of ['fay', 'eve']) {
    sit(holder);
    assert.equal(api.investmentCaseReport().report.totals.casesN, 1, `${holder} sees it`);
  }
  sit('dan');
  assert.deepEqual([api.investmentCaseReport().report.totals.casesN, api.investmentCaseReport().report.totals.outsideN], [0, 1], 'dan no longer holds it');
});

test('RULE-ICA-01: leader-held control is observed without an identity; a pause governs every path; the cap defers', () => {
  // (a) Ratified from the operator view: control sits with the workspace leader.
  const a = seed(fixture());
  const declared = a.api.investmentCaseDeclare(draftA());
  assert.equal(a.api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' }).via, 'operator');
  a.on('2029-01-02');
  const scan = a.api.investmentCaseScan();
  assert.deepEqual(scan.effects.map((effect) => effect.action), ['observed']);
  assert.equal(asksOf(a.store).length, 0, 'no delegation is filed for the leader’s own board');
  assert.equal(a.store.state.investmentCaseMarkers.length, 1);
  a.api.investmentCaseScan();
  assert.equal(a.store.state.investmentCaseMarkers.length, 1, 'one observation, however many commits');
  const marker = JSON.stringify(a.store.state.investmentCaseMarkers);
  for (const secret of ['mia', 'Mia Name', 'Second filling line', declared.caseId, '1000']) assert.equal(marker.includes(secret), false, `${secret} never reaches a marker`);
  assert.equal(a.api.investmentCaseReport().report.allCases[0].monitor.state, 'leader-held');
  assert.equal(a.api.investmentCaseReport().report.attentionN, 1, 'and it is counted on the leader’s own board');

  // (b) A pause is a pause — including the explicit scan.
  const b = seed(fixture());
  const second = b.api.investmentCaseDeclare(draftA());
  b.sit('dan');
  b.api.investmentCaseDecide({ caseId: second.caseId, decision: 'approve' });
  b.sit(null);
  assert.equal(b.api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.autoPropagate]: false }).ok, true);
  b.on('2029-01-02');
  assert.deepEqual(b.api.investmentCaseScan().effects, []);
  assert.equal(asksOf(b.store).length, 0);
  assert.equal(b.api.investmentCaseReport().report.allCases[0].status, 'review-due', 'the board still prints it');
  assert.equal(b.api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.autoPropagate]: true }).ok, true);
  assert.equal(openAsksOf(b.store).length, 1, 'switching it back on files the ask');

  // (c) Five reviews fall due at once: four asks, one deferred and counted, then the fifth.
  const ledger = {
    investmentCases: [1, 2, 3, 4, 5].map((n) => storedCase(`c${n}`)),
    investmentCaseActs: [1, 2, 3, 4, 5].map((n) => approveAct(`a${n}`, `c${n}`)),
  };
  const c = seed(fixture(ledger, '2029-01-02T12:00:00.000Z'), '2029-01-02T12:00:00.000Z');
  const capped = c.api.investmentCaseScan();
  assert.equal(INVESTMENT_CASE_LIMITS.asksPerCommit, 4);
  assert.equal(capped.effects.filter((effect) => effect.action === 'delegated').length, 4);
  assert.match(capped.effects.find((effect) => effect.action === 'deferred').summary, /^1 investment-case review ask\(s\) were deferred/);
  c.api.investmentCaseScan();
  assert.equal(openAsksOf(c.store).length, 5);
  assert.equal(new Set(openAsksOf(c.store).map((ask) => ask.signature)).size, 5);
  // Derived automation events never re-trigger the rule.
  assert.deepEqual(investmentCaseRule(c.store.state, { event: { type: 'automation.propagated' }, now: at('2029-01-02') }), []);
});

test('who holds decision control is resolved on the graph, and a diamond is never broken by arithmetic', () => {
  const now = at('2028-12-31');
  const matrixOf = (patch = {}) => buildMatrix(fixture(patch, now.toISOString()), { now });
  const record = (ownerId) => storedCase('c1', { ownerId });
  const base = matrixOf();
  // The ratifier still sits above the owner: control stays where it was signed.
  assert.deepEqual(resolveInvestmentMonitor(base, record('mia'), 'dan'), { state: 'seat', seatId: 'dan', basis: 'ratifier' });
  assert.deepEqual(resolveInvestmentMonitor(base, record('mia'), 'eve'), { state: 'seat', seatId: 'eve', basis: 'ratifier' }, 'a line holder is above the owner too');
  assert.deepEqual(resolveInvestmentMonitor(base, record('mia'), 'leader'), { state: 'leader-held', seatId: null, basis: 'ratifier' });
  // The ratifier is not above the owner (or is gone): the joint apex of BOTH lines.
  assert.deepEqual(resolveInvestmentMonitor(base, record('mia'), 'fay'), { state: 'seat', seatId: 'vera', basis: 'joint-apex' });
  assert.deepEqual(resolveInvestmentMonitor(base, record('mia'), 'somebody-who-left'), { state: 'seat', seatId: 'vera', basis: 'joint-apex' });
  // Single chain: the climb passes every seat below the ratifying altitude.
  assert.deepEqual(resolveInvestmentMonitor(base, record('ike'), 'somebody-who-left'), { state: 'seat', seatId: 'eve', basis: 'joint-apex' }, 'ike → ned (manager) → eve (director)');
  assert.deepEqual(resolveInvestmentMonitor(base, record('ivy'), 'somebody-who-left'), { state: 'seat', seatId: 'vera', basis: 'joint-apex' }, 'ivy → lou → mia → above BOTH of mia’s lines');
  // A manager who ratified nothing cannot inherit control just by being above the owner.
  assert.deepEqual(resolveInvestmentMonitor(base, record('ike'), 'ned'), { state: 'seat', seatId: 'eve', basis: 'joint-apex' }, 'ned holds no ratifying altitude');
  // The owner has left; the promise was made TO the ratifier, who still holds it.
  const ownerGone = matrixOf({ people: rawFixture().people.map((row) => (row.id === 'mia' ? { ...row, status: 'archived' } : row)) });
  assert.deepEqual(resolveInvestmentMonitor(ownerGone, record('mia'), 'dan'), { state: 'seat', seatId: 'dan', basis: 'ratifier' });
  assert.deepEqual(resolveInvestmentMonitor(ownerGone, record('mia'), 'somebody-who-left'), { state: 'off-roster', seatId: null, basis: null });
  // A diamond: dan and eve BOTH also report to sam, a second executive beside vera.
  // Two incomparable seats sit above both of mia's lines. Nobody is chosen.
  const diamond = matrixOf({
    people: [...rawFixture().people, person('sam', null, 'vp')],
    reportingLines: [line('rl-mia-eve', 'mia', 'eve'), line('rl-dan-sam', 'dan', 'sam', 'cross-functional'), line('rl-eve-sam', 'eve', 'sam', 'cross-functional')],
  });
  assert.deepEqual(resolveInvestmentMonitor(diamond, record('mia'), 'fay'), { state: 'ambiguous', seatId: null, basis: 'joint-apex' });
  assert.deepEqual(resolveInvestmentMonitor(diamond, record('mia'), 'dan'), { state: 'seat', seatId: 'dan', basis: 'ratifier' }, 'the seat that signed is not ambiguous');
});

/* ------------------------------------------- 11. displayed equals stored */

test('zero tolerance: every figure on the screen and in the export is the stored cent, recomputed independently', () => {
  const { store, api, sit, on } = seed(fixture());
  // Awkward amounts on purpose: cents that a float would mangle.
  const typed = [
    { on: '2027-01-01', kind: 'outlay', amount: '1234567.89' },
    { on: '2027-07-19', kind: 'outlay', amount: '0.07' },
    { on: '2028-03-03', kind: 'benefit', amount: '700000.10' },
    { on: '2029-03-03', kind: 'benefit', amount: '650000.20' },
    { on: '2030-03-03', kind: 'benefit', amount: '-12000.30' },
    { on: '2030-03-03', kind: 'residual', amount: '99999.99' },
  ];
  const declared = api.investmentCaseDeclare(draftA({ title: 'Awkward cents', hurdlePct: '7.25', basis: 'real', flows: typed, reviewOn: '2028-06-30' }));
  assert.equal(declared.ok, true, declared.error);
  const stored = store.state.investmentCases[0];
  assert.deepEqual(stored.flows.map((flow) => flow.cents), [-123456789, -7, 70000010, 65000020, -1200030, 9999999]);
  sit('dan');
  assert.equal(api.investmentCaseDecide({ caseId: declared.caseId, decision: 'approve' }).ok, true);
  on('2028-07-02');
  assert.equal(api.investmentCaseReview({ caseId: declared.caseId, cutoffOn: '2028-06-30', outlayComplete: true, nextReviewOn: '2029-06-30',
    flows: [{ on: '2027-01-01', kind: 'outlay', amount: '1300000.01' }, { on: '2028-03-03', kind: 'benefit', amount: '612345.67' }] }).ok, true);
  sit(null);

  // Independent recomputation, from the STORED rows only, with the bare kernel.
  const independent = appraiseInvestment({ flows: stored.flows, baseOn: stored.baseOn, hurdleBp: stored.hurdleBp });
  const storedReview = store.state.investmentCaseActs.find((act) => act.kind === 'review');
  const independentReview = reviewInvestment({ promised: stored.flows, actual: storedReview.flows, baseOn: stored.baseOn, hurdleBp: stored.hurdleBp, cutoffOn: storedReview.cutoffOn, outlayComplete: storedReview.outlayComplete });
  const report = api.investmentCaseReport().report;
  const row = report.allCases[0];
  assert.deepEqual(row.appraisal, independent, 'the reader adds nothing to the kernel');
  assert.deepEqual(row.latestReading, independentReview);
  assert.deepEqual(row.flows, stored.flows);

  withDom(() => {
    const ctx = { api, query: new URLSearchParams('panel=cases'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderFinanceInvestmentCasePanel(ctx));
    const cardNode = document.querySelector(`[data-testid="investment-case-${declared.caseId}"]`);
    assert.ok(cardNode, 'the case has a card');
    const figure = (key) => cardNode.querySelector(`[data-testid="investment-figure-${key}"] td.num`).textContent;
    // Each printed figure is exactly the stored-derived cent, formatted by integer arithmetic.
    assert.equal(figure('npv'), investmentMoney('DKK', independent.npvCents));
    assert.equal(figure('outlay'), investmentMoney('DKK', independent.pvOutlayCents));
    assert.equal(figure('benefit'), investmentMoney('DKK', independent.pvBenefitCents));
    assert.equal(figure('pi'), investmentRatio(independent.piPermille));
    assert.equal(figure('irr'), investmentRateMicro(independent.irr.micro));
    assert.equal(figure('exposure'), investmentMoney('DKK', independent.peakExposureCents));
    assert.equal(figure('residual'), investmentMoney('DKK', independent.pvResidualCents));
    assert.equal(figure('npv-ex-residual'), investmentMoney('DKK', independent.npvExResidualCents));
    // Every promised flow is printed as the cent that is stored — all six, in order.
    const flowCells = [...cardNode.querySelectorAll('details table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    assert.deepEqual(flowCells.map((cells) => cells[2]), stored.flows.map((flow) => investmentMoney('DKK', flow.cents)));
    assert.deepEqual(flowCells.map((cells) => cells[0]), stored.flows.map((flow) => flow.on));
    assert.ok(flowCells.some((cells) => cells[2] === '−DKK 1,234,567.89'), 'the awkward cents survive to the screen');
    assert.ok(flowCells.some((cells) => cells[2] === '−DKK 0.07'));
    // The review row prints the two ratios and the evidence value the kernel computed.
    const reviewCells = [...cardNode.querySelector(`[data-testid="investment-review-${storedReview.id}"]`).querySelectorAll('td')].map((td) => td.textContent);
    assert.equal(reviewCells[1], investmentRatio(independentReview.benefitPermille));
    assert.equal(reviewCells[2], investmentRatio(independentReview.costPermille));
    assert.equal(reviewCells[3], investmentMoney('DKK', independentReview.evidenceNpvCents));
    const text = document.getElementById('root').textContent;
    assert.ok(text.includes(`DKK at ${investmentRateBp(725)} real`), 'the rate and the price basis are printed beside the figures');
    for (const junk of ['[object Object]', 'undefined', 'NaN', 'null']) assert.equal(text.includes(junk), false, `the page never prints “${junk}”`);
  });

  // The export is the same reader: the case row carries the same cents.
  const exported = exportWorkspaceCsv(store.state, INVESTMENT_CASE_CSV_SCOPE, { now: at('2028-07-02') });
  assert.equal(exported.ok, true, exported.reason);
  const csvText = String(exported.text || exported.csv || '');
  const records = csvObjects(csvText);
  assert.deepEqual(Object.keys(records[0]), INVESTMENT_CASE_CSV_COLUMNS);
  assert.deepEqual(records.map((record) => record.row_type), ['workspace', 'currency', 'case', 'track-record']);
  const caseRow = records.find((record) => record.row_type === 'case');
  assert.equal(caseRow.key, 'C01');
  assert.equal(caseRow.npv_cents, String(independent.npvCents));
  assert.equal(caseRow.pv_outlay_cents, String(independent.pvOutlayCents));
  assert.equal(caseRow.outlay_cents, '123456796', '1,234,567.89 + 0.07, to the cent');
  assert.equal(caseRow.irr_micro, String(independent.irr.micro));
  assert.equal(caseRow.pi_permille, String(independent.piPermille));
  assert.equal(caseRow.cost_permille, String(independentReview.costPermille));
  assert.equal(caseRow.benefit_permille, String(independentReview.benefitPermille));
  assert.equal(caseRow.evidence_npv_cents, String(independentReview.evidenceNpvCents));
  assert.equal(caseRow.hurdle_bp, '725');
  assert.equal(caseRow.basis, 'real');
  // A refused figure exports BLANK with its reason — never a zero.
  assert.equal(caseRow.adjusted_npv_cents, '');
  assert.match(caseRow.claim_reason, /adjusted-npv:track-record-below-floor/);
  const trackRow = records.find((record) => record.row_type === 'track-record');
  assert.equal(trackRow.track_cost_median_permille, '');
  assert.equal(trackRow.figures_complete, 'no');
  assert.ok(trackRow.claim_reason.length > 20);
  const currencyRow = records.find((record) => record.row_type === 'currency');
  assert.equal(currencyRow.key, 'DKK');
  assert.equal(currencyRow.outlay_cents, '123456796');
  // No identity crosses the boundary.
  for (const secret of ['Mia Name', 'Dan Name', 'mia', 'Awkward cents', declared.caseId, storedReview.id, 'icase', 'iact']) {
    assert.equal(csvText.includes(secret), false, `${secret} must not reach the export`);
  }
  // The seat-scoped export is the same rows the seat's own board printed.
  sit('eve');
  const eveRows = api.investmentCaseCsvRows().rows;
  assert.deepEqual(eveRows, investmentCaseCsvRows(api.investmentCaseReport().report));
  assert.equal(eveRows.filter((record) => record.row_type === 'case').length, 1);
});

/* ---------------------------------------------------------- 12. the screens */

test('the journey through the real dialogs: appraise a draft, declare it, ratify it, review it', () => {
  const { store, api, on } = seed(fixture());
  withDom(() => {
    const root = document.getElementById('root');
    const ctx = { api, state: store.state, now: at('2026-11-15'), query: new URLSearchParams('panel=cases'), navigate() {}, refresh() { ctx.state = store.state; root.replaceChildren(renderFinance(ctx)); } };
    const click = (testid) => { const node = document.querySelector(`[data-testid="${testid}"]`); assert.ok(node, `${testid} is on the page`); node.click(); };
    const fill = (name, value) => { const node = document.querySelector(`#modal-root [name="${name}"]`); assert.ok(node, `the dialog has a ${name} field`); node.value = value; };
    ctx.refresh();

    // The finance view lends the register its own navigation: three panels, this one active.
    const tabLabels = [...root.querySelectorAll('[role="tablist"][aria-label="Budget & finance views"] [role="tab"]')].map((tab) => tab.textContent.trim());
    assert.equal(tabLabels.length, 3);
    assert.ok(tabLabels[2].startsWith('Investment cases'));
    assert.match(root.textContent, /No investment case is in view/);
    assert.match(root.textContent, /Is it worth it — and did it deliver\?/);

    // 1. A draft that is not a case yet says why, on the field it concerns, and saves nothing.
    click('investment-declare-open');
    fill('title', 'Second filling line');
    fill('ownerId', 'mia');
    fill('currency', 'DKK');
    fill('hurdlePct', '10');
    fill('flowsText', '2027-01-01 outlay 1000\n2028-01-01 benefit 500');
    click('investment-preview-run');
    assert.match(document.querySelector('[data-testid="investment-preview"]').textContent, /nobody intends to check/);
    assert.equal(store.state.investmentCases.length, 0);

    // 2. The whole promise: the preview prints the hand-computed value before anything is saved.
    fill('flowsText', investmentFlowLines(storedA()));
    fill('reviewOn', '2028-12-31');
    click('investment-preview-run');
    const preview = document.querySelector('[data-testid="investment-preview"]');
    assert.equal(preview.querySelector('[data-testid="investment-figure-npv"] td.num').textContent, 'DKK 243.43');
    assert.equal(preview.querySelector('[data-testid="investment-figure-irr"] td.num').textContent, '23.3751%');
    assert.match(preview.querySelector('[data-testid="investment-figure-payback"] td.num').textContent, /^730 d \(2\.00 y\) · 2028-12-31$/);
    assert.equal(store.state.investmentCases.length, 0, 'appraising a draft saves nothing');
    click('investment-declare-save');
    assert.equal(store.state.investmentCases.length, 1);
    assert.deepEqual(store.state.investmentCases[0].flows, storedA());
    const caseId = store.state.investmentCases[0].id;
    assert.equal(document.querySelector('#modal-root [role="dialog"]'), null, 'the dialog closed');
    assert.match(root.querySelector(`[data-testid="investment-case-${caseId}"]`).textContent, /Awaiting ratification/);
    assert.equal(root.querySelector(`[data-testid="investment-figure-npv"] td.num`).textContent, 'DKK 243.43');

    // 3. Ratify it — the operator view is the workspace leader, above every roster seat.
    click(`investment-approve-${caseId}`);
    click('investment-approve-save');
    assert.equal(store.state.investmentCaseActs.length, 1);
    assert.deepEqual([store.state.investmentCaseActs[0].kind, store.state.investmentCaseActs[0].via], ['approve', 'operator']);
    assert.match(root.querySelector(`[data-testid="investment-case-${caseId}"]`).textContent, /Ratified/);
    assert.equal(root.querySelector(`[data-testid="investment-approve-${caseId}"]`), null, 'a case is ratified once: the control is gone');

    // 4. The review day arrives; the card says so, and the review is recorded through its dialog.
    on('2029-01-04');
    ctx.now = at('2029-01-04');
    ctx.refresh();
    assert.match(root.textContent, /1 ratified promise\(s\) have reached their review day unexamined/);
    assert.match(root.querySelector(`[data-testid="investment-case-${caseId}"]`).textContent, /Review due since 2028-12-31/);
    click(`investment-review-open-${caseId}`);
    fill('cutoffOn', '2028-12-31');
    fill('flowsText', '2027-01-01 outlay 1200\n2028-01-01 benefit 400\n2028-12-31 benefit 400');
    click('investment-review-save');
    assert.equal(store.state.investmentCaseActs.length, 1, 'refused: nobody said whether the outlay is complete');
    fill('outlayComplete', 'yes');
    fill('nextReviewOn', '2029-12-31');
    click('investment-review-save');
    assert.equal(store.state.investmentCaseActs.length, 2);
    const reviewId = store.state.investmentCaseActs[1].id;
    const cells = [...root.querySelector(`[data-testid="investment-review-${reviewId}"]`).querySelectorAll('td')].map((td) => td.textContent);
    assert.deepEqual(cells.slice(0, 4), ['2028-12-31', '0.800×', '1.200×', '−DKK 130.13']);
    assert.match(root.textContent, /Reviewed — next review declared/);

    // 5. No control on the page edits a declared case or moves money.
    const labels = [...root.querySelectorAll('button')].map((button) => button.textContent.toLowerCase()).join(' | ');
    assert.equal(/edit|delete|amend|overwrite|pay|transfer|post /.test(labels), false, labels);
  });
});

test('the track-record and method views print the refusals, the frameworks and a captioned generated illustration', () => {
  const { api } = seed(fixture());
  api.investmentCaseDeclare(draftA());
  withDom(() => {
    const root = document.getElementById('root');
    const navigated = [];
    const view = (query) => { root.replaceChildren(renderFinanceInvestmentCasePanel({ api, query: new URLSearchParams(query), navigate: (hash) => navigated.push(hash), refresh() {} })); return root.textContent; };
    const track = view('panel=cases&view=track');
    assert.match(track, /What this organisation’s promises have been worth/);
    assert.match(track, /0 of 5 cost ratios and 0 of 5 benefit ratios/);
    assert.match(track, /No case has been reviewed yet/);
    const method = view('panel=cases&view=method');
    for (const phrase of ['Actual/365 Fixed', 'Fama & Jensen (1983)', 'Lorie & Savage (1955)', 'Refusals this register can print', 'What is never done here', 'RULE-ICA-01', '160-bit binary fixed point']) {
      assert.ok(method.includes(phrase), `the method view prints “${phrase}”`);
    }
    for (const key of INVESTMENT_CASE_REFUSAL_KEYS) assert.ok(method.includes(`${key}: `), `the refusal ${key} is printed`);
    // The limits of this slice are printed on the page, not hidden in a log.
    assert.match(method, /not yet tested against the ratifier’s standing delegation limit/);
    // The illustration: a real file, described, and captioned as generated.
    const image = root.querySelector('figure img');
    assert.equal(image.getAttribute('src'), './app/assets/investment-case-appraisal.jpg');
    assert.ok(image.getAttribute('alt').length > 200, 'the illustration is described, not decorated');
    assert.match(root.querySelector('figure figcaption').textContent, /generated asset/);
    const file = path.join(REPO, 'app/assets/investment-case-appraisal.jpg');
    assert.ok(fs.existsSync(file));
    const bytes = fs.readFileSync(file);
    assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xff, 0xd8, 0xff], 'a real JPEG, not a placeholder');
    assert.ok(bytes.length > 8000);
    // The governing controls are on the page for a seat that may govern.
    assert.ok(root.querySelector('[data-testid="investment-conventions-open"]'));
    assert.ok(root.querySelector('[data-testid="investment-scan"]'));
    // The view tabs navigate inside the finance route.
    root.querySelectorAll('[role="tablist"][aria-label="Investment case views"] [role="tab"]')[1].click();
    assert.deepEqual(navigated, ['#/finance?panel=cases&view=track']);
    // The ADR the register cites exists.
    assert.ok(fs.existsSync(path.join(REPO, 'docs/adr/0208-investment-case-appraisal.md')));
  });
});

/* ------------------------------------------------- 13. conventions and counts */

test('the conventions refuse rather than clamp, and the navigation counter is silent until a case exists', () => {
  const { store, api, sit } = seed(fixture());
  // No case on the record: the counter is zero and never reads the reporting graph.
  assert.equal(investmentCaseAttentionCount(store.state, { now: at('2026-11-15') }), 0);
  assert.equal(investmentCaseAttentionCount({ investmentCases: 'not-an-array' }, {}), 0);
  const refused = api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.askDueDays]: 400 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /whole number from 1 to 60/);
  assert.match(api.investmentCaseSetConventions({ investmentCaseHurdleBp: 800 }).error, /not a declared investment-case convention/);
  assert.match(api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.autoPropagate]: 'off' }).error, /must be true or false/);
  assert.equal(api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.askDueDays]: 21 }).ok, true);
  assert.equal(api.investmentCaseReport().report.conventions.investmentCaseAskDueDays, 21);
  // A proposal is owed an act by the seats that may ratify it — and by nobody else.
  const declared = api.investmentCaseDeclare(draftA());
  assert.equal(api.investmentCaseAttentionCount().count, 1, 'the operator may ratify it');
  sit('dan');
  assert.equal(api.investmentCaseAttentionCount().count, 1, 'dan holds decision control over mia’s case');
  sit('mia');
  assert.equal(api.investmentCaseAttentionCount().count, 0, 'the owner’s seat owes no act on its own case');
  assert.equal(api.investmentCaseReport().report.allCases[0].can.decide, false);
  sit('fay');
  assert.equal(api.investmentCaseAttentionCount().count, 0, 'another branch owes nothing and sees nothing');
  // Governing is director-and-above; a manager is refused at the gateway.
  sit('mia');
  assert.match(api.investmentCaseSetConventions({ [INVESTMENT_CASE_SETTING_KEYS.askDueDays]: 7 }).error, /rank window is 3–5/);
  assert.match(api.investmentCaseScan().error, /rank window is 3–5/);
  // The brief is identity-free.
  sit(null);
  const brief = api.investmentCaseBriefText().text;
  assert.match(brief, /1 case\(s\) in view: 1 awaiting ratification/);
  assert.match(brief, /DKK: ratified book 0 case\(s\).*1 proposal\(s\) asking DKK 1,000\.00/);
  for (const secret of ['Mia', 'Second filling line', declared.caseId]) assert.equal(brief.includes(secret), false, `${secret} never reaches the brief`);
});

test('the navigation counter agrees with the register for every seat, and never appraises a case', () => {
  // Five cases whose content no other test uses (hurdle 12.34%), so none of them
  // is in the appraisal cache yet: awaiting ratification (mia's, ned's), ratified
  // with a review far ahead, ratified with a review day that has passed, closed.
  const unique = (id, extra = {}) => storedCase(id, { hurdleBp: 1234, ...extra });
  const ledger = {
    investmentCases: [
      unique('c-proposed'),
      unique('c-ned', { ownerId: 'ned', declaredById: 'ned' }),
      unique('c-ahead', { reviewOn: '2031-12-31' }),
      unique('c-due'),
      unique('c-closed'),
    ],
    investmentCaseActs: [
      approveAct('a-ahead', 'c-ahead'),
      approveAct('a-due', 'c-due'),
      approveAct('a-closed', 'c-closed'),
      reviewAct('r-closed', 'c-closed', 100000, 50000),
    ],
  };
  const today = at('2029-02-01');
  const state = fixture(ledger);
  assert.equal(state.investmentCases.length, 5, 'the fixture ledger loads whole');
  assert.equal(state.investmentCaseActs.length, 4);

  // 1. Counting appraises nothing — and the register, asked next, does: so the
  //    unchanged cache is evidence about the counter, not about a warm cache.
  const before = investmentCaseCacheStats();
  const counted = investmentCaseAttentionCount(state, { now: today, seat: null });
  assert.deepEqual(investmentCaseCacheStats(), before, 'the counter ran no appraisal and no review reading');
  const report = buildInvestmentCases(state, { now: today, settings: state.settings, seat: null });
  assert.ok(investmentCaseCacheStats().appraisals > before.appraisals, 'the register did appraise these cases');
  assert.ok(investmentCaseCacheStats().reviews > before.reviews, 'and read the review');
  assert.deepEqual(report.allCases.map((row) => `${row.caseId}:${row.status}`).sort(),
    ['c-ahead:approved', 'c-closed:closed', 'c-due:review-due', 'c-ned:proposed', 'c-proposed:proposed']);
  // By hand: two proposals a seat above their owners may ratify, one review owed.
  assert.equal(counted, 3);
  assert.equal(report.attentionN, 3);

  // 2. Seat by seat, through the guarded door, against a count worked out by
  //    hand — and against the register's own rows, so the badge in the
  //    navigation can never point at a number the screen does not show.
  const { api, sit } = seed(state, '2029-02-01T12:00:00.000Z');
  const expected = [
    [null, 3, 'the operator view reaches every case'],
    ['vera', 3, 'the VP holds all three branches'],
    ['dan', 2, 'mia’s proposal and mia’s due review; ned’s case is outside dan’s tree'],
    ['eve', 3, 'ned’s proposal in her tree, and mia’s proposal and due review over her declared line'],
    ['fay', 0, 'another branch reaches none of them'],
    ['mia', 0, 'the benefit owner owes no act on her own cases, and a manager cannot ratify'],
    ['ned', 0, 'likewise'],
    ['lou', 0, 'a lead reads; decision control starts at the director altitude'],
  ];
  for (const [seatId, owed, why] of expected) {
    sit(seatId);
    const rows = api.investmentCaseReport().report;
    assert.equal(api.investmentCaseAttentionCount().count, owed, `${seatId || 'operator'}: ${why}`);
    assert.equal(rows.attentionN, owed, `${seatId || 'operator'}: the register counts the same`);
    assert.equal(rows.allCases.filter((row) => row.can.decide || (row.status === 'review-due' && row.can.review)).length, owed,
      `${seatId || 'operator'}: and it is the number of rows that carry the act`);
  }
});
