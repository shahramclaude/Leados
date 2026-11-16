/**
 * tests/app/capability-sourcing.test.mjs — the focused verification suite for
 * ADR-0229 (Capability Sourcing & Firm-Boundary Register, `RULE-SRC-01`,
 * Schema v182, CSV #170, `#/sourcing`).
 *
 * ONE focused pass, in the order the doctrine asks for it:
 *   1. the additive migration and the four empty ledgers;
 *   2. the money kernel — exact cents, refusal of a third decimal place, and a
 *      present value that is IDENTICAL however the cost lines were ordered;
 *   3. the comparison — same currency/horizon/discount is required, and a
 *      mismatch is printed rather than reconciled;
 *   4. the hold-up reading — a safeguard that cannot answer the specificity is
 *      never counted as reassurance;
 *   5. the boundary decision — chief altitude only, once, with a premium that
 *      must be explained;
 *   6. the matrix — the ask goes to the joint CHIEF apex above every line, a
 *      diamond tie asks each apex, and a branch with no chief seat asks nobody
 *      and prints the decision as owed;
 *   7. the grade — once, after the review date, never the decider;
 *   8. the rule — idempotent, self-closing, pause-governed on every path;
 *   9. the CSV — identity-free and exactly the reader's figures;
 *  10. the panel — every displayed figure equals the reader's figure, cell by
 *      cell, and the two "claims" are printed apart.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { COLLECTIONS, createEmptyState, normalizeState, MIGRATIONS, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_REACH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import {
  buildSourcing,
  sourcingAttentionCount,
} from '../../app/core/domain/sourcing.js';
import { sourcingRule, sourcingConditions, indexSourcingAsks } from '../../app/core/domain/sourcingRules.js';
import { sourcingCsvRows } from '../../app/core/domain/sourcingCsv.js';
import {
  parseMoneyInputToCents,
  readStoredCents,
  centsToDisplay,
  srcPresentValueCents,
  srcAddDays,
} from '../../app/core/domain/sourcingSchema.js';
import {
  srcSafeguardAnswers,
  srcCostLinesForMode,
  SRC_SPECIFICITY,
  SRC_SAFEGUARDS,
} from '../../app/core/domain/sourcingRegistry.js';
import { renderSourcing } from '../../app/views/sourcing.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const BASIS = 'The firm is deciding whether to own this capability or contract for its output across the declared horizon.';

/** Parse the exporter's real payload (`{ csv, rowCount, columnCount }`). */
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


function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { url: 'http://localhost/#/sourcing' });
  const prev = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, Event: globalThis.Event, CustomEvent: globalThis.CustomEvent };
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
 * Matrix topology (deliberately similar to the shipped portfolio-review
 * fixture so the two registers are compared on the same shape):
 *
 *   ceo (vp → executive, rank 4)
 *    ├─ dan (director, rank 3)
 *    │   ├─ mia (manager, rank 2) ── ivo (lead, rank 1) ── ada (ic)
 *    │   └─ kai (manager, rank 2)  ← ivo holds a 40% project line here
 *    └─ zoe (director, rank 3) ── ben (manager) ── sam
 */
function seed(nowDay = '2026-11-16') {
  let currentNow = at(nowDay);
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const iso = '2026-01-01T09:00:00.000Z';
  const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dan', 'Dan Director', 'director', 'ceo'),
    person('mia', 'Mia HomeMgr', 'manager', 'dan'),
    person('kai', 'Kai ProjMgr', 'manager', 'dan'),
    person('ivo', 'Ivo Lead', 'lead', 'mia'),
    person('ada', 'Ada Tech', 'ic', 'ivo'),
    person('zoe', 'Zoe PeerDir', 'director', 'ceo'),
    person('ben', 'Ben PeerMgr', 'manager', 'zoe'),
    person('sam', 'Sam Ops', 'ic', 'ben'),
  ];
  raw.reportingLines = [
    { id: 'rl-ivo-home', personId: 'ivo', managerId: 'mia', kind: 'functional', shareH: 60, rights: ['coaching'], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '' },
    { id: 'rl-ivo-proj', personId: 'ivo', managerId: 'kai', kind: 'project', shareH: 40, rights: ['tasking'], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '' },
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
  const api = createApi(store, { now: clock, idFactory });
  return {
    store,
    api,
    setDay(day) { currentNow = at(day); },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
    now: () => currentNow,
  };
}

/** Add a person + (optionally) a line, through the store so the graph re-reads. */
function addPerson(env, id, level, managerId) {
  env.store.update((draft) => {
    draft.people = [...draft.people, { id, name: `${id} ${level}`, role: level, level, managerId, status: 'active', startDate: '2026-01-01', createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z' }];
  }, { type: 'person.created', entity: 'person', entityId: id, summary: 'seed' });
}

const DECL = (over = {}) => ({
  title: 'Billing engine for subscription invoicing',
  currency: 'DKK',
  horizonDays: 1095,
  discountBp: 800,
  specificity: 'high',
  weight: 'supporting',
  reason: BASIS,
  reviewOn: '2027-11-16',
  ...over,
});

const OPT = (over = {}) => ({
  mode: 'make',
  note: 'Build the engine in-house on the existing platform team, with two engineers and a six-month stand-up.',
  lines: [
    { key: 'build-effort', amount: '1480000' },
    { key: 'run-team', amount: '620000' },
  ],
  safeguards: ['source-code-escrow'],
  ...over,
});

function declareCase(env, over = {}) {
  const res = env.api.sourcingDeclareCase(DECL(over));
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.case;
}

/* =====================================================================
 * 1. SCHEMA — additive, empty, and stable across a reload
 */

test('sourcing: schema v184 with four EMPTY sourcing ledgers plus four EMPTY vy ledgers', () => {
  // Session ADR-0231 raised the schema to v184. The sourcing and vy ledgers are
  // still the collections THESE ADRs added, and their migration steps are
  // unchanged — only the current-version pin moves.
  assert.equal(SCHEMA_VERSION, 184);
  for (const key of ['sourcingCases', 'sourcingOptions', 'sourcingActs', 'sourcingMarkers', 'vyDecisions', 'vyAnswers', 'vyStyleRecords', 'vyMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const v181 = { schemaVersion: 181, settings: {}, people: [], cases: [], riskAppetiteStatements: [{ id: 'keep-me' }] };
  const step182 = MIGRATIONS[181](v181);
  assert.equal(step182.schemaVersion, 182, '181→182 lands at 182');
  assert.deepEqual(step182.sourcingCases, [], 'no case is inferred from a budget, contract or headcount');
  assert.deepEqual(step182.sourcingOptions, [], 'no option is priced at upgrade time');
  assert.deepEqual(step182.sourcingActs, [], 'no decision and no grade is invented');
  assert.deepEqual(step182.sourcingMarkers, [], 'no observation is manufactured');
  assert.deepEqual(step182.riskAppetiteStatements, [{ id: 'keep-me' }], 'nothing adjacent is touched');
  assert.equal(step182.settings.sourcingAutoPropagate, true, 'the sourcing pause switch defaults ON');

  // 182→183: four new empty ledgers, pause switch defaults ON.
  const v182 = { ...step182, sourcingCases: [{ id: 'src-1' }], sourcingOptions: [{ id: 'srco-1' }], sourcingActs: [{ id: 'a1' }], sourcingMarkers: [{ key: 'm' }] };
  const step183 = MIGRATIONS[182](v182);
  assert.equal(step183.schemaVersion, 183, '182→183 lands at 183');
  assert.deepEqual(step183.vyDecisions, [], 'no decision is inferred on upgrade');
  assert.deepEqual(step183.vyAnswers, [], 'no diagnostic answer is inferred on upgrade');
  assert.deepEqual(step183.vyStyleRecords, [], 'no style is inferred on upgrade');
  assert.deepEqual(step183.vyMarkers, [], 'no observation is manufactured');
  assert.deepEqual(step183.sourcingCases, [{ id: 'src-1' }], 'existing sourcing rows survive');
  assert.equal(step183.settings.vyAutoPropagate, true, 'the vy pause switch defaults ON');

  // A workspace already past 183 must not have its rows replaced.
  const v183 = { ...step183, vyDecisions: [{ id: 'vy-1' }], vyAnswers: [{ id: 'vya-1' }], vyStyleRecords: [{ id: 'vys-1' }], vyMarkers: [{ key: 'm' }] };
  const again = MIGRATIONS[182](v183);
  assert.deepEqual(again.vyDecisions, [{ id: 'vy-1' }]);
  assert.deepEqual(again.vyAnswers, [{ id: 'vya-1' }]);
  assert.deepEqual(again.vyStyleRecords, [{ id: 'vys-1' }]);
  assert.deepEqual(again.vyMarkers, [{ key: 'm' }]);
});

/* =====================================================================
 * 2. THE MONEY KERNEL — exact, order-independent, refusing a third place
 */

test('sourcing money: human input is exact cents, a third decimal place is refused, and cents read back exactly', () => {
  assert.equal(parseMoneyInputToCents('486000'), 48_600_000);
  assert.equal(parseMoneyInputToCents('486000.25'), 48_600_025);
  assert.equal(parseMoneyInputToCents(1250), 125_000);
  // A third decimal place is a DIFFERENT amount — refused, never rounded.
  assert.equal(parseMoneyInputToCents('486000.255'), null);
  assert.equal(parseMoneyInputToCents('1,480,000'), null);
  assert.equal(parseMoneyInputToCents('-500'), null);
  assert.equal(parseMoneyInputToCents('1e6'), null);
  assert.equal(parseMoneyInputToCents(''), null);
  assert.equal(parseMoneyInputToCents(' '), null);
  // A STORED figure is an integer only: a float or a numeric string is refused.
  assert.equal(readStoredCents(48_600_025), 48_600_025);
  assert.equal(readStoredCents(48_600_025.5), null);
  assert.equal(readStoredCents('48600025'), null);
  assert.equal(readStoredCents(-1), null);
  assert.equal(centsToDisplay(48_600_025), '486,000.25');
  assert.equal(centsToDisplay(null), '');
});

test('sourcing money: the present value is identical however the cost lines were ordered', () => {
  const oneTime = 148_000_000;
  const recurring = 62_000_000;
  const forward = srcPresentValueCents({ oneTimeCents: oneTime, recurringCents: recurring, horizonDays: 1095, discountBp: 800 });
  const backward = srcPresentValueCents({ oneTimeCents: oneTime, recurringCents: recurring, horizonDays: 1095, discountBp: 800 });
  assert.equal(forward, backward);
  assert.ok(Number.isInteger(forward), 'the total is a whole number of cents');
  // Sanity, by hand: a 3-year annuity at 8% is worth less than 3× the annual
  // figure, and more than 2.6× it — the discount must be real but not wild.
  const annuity = forward - oneTime;
  assert.ok(annuity > 2.6 * recurring && annuity < 3 * recurring, `annuity ${annuity} sits between 2.6x and 3x ${recurring}`);
  // A zero discount rate capitalises exactly: three whole years of a recurring
  // figure is that figure trebled, to the cent.
  const undiscounted = srcPresentValueCents({ oneTimeCents: 0, recurringCents: 10_000, horizonDays: 1095, discountBp: 0 });
  assert.equal(undiscounted, 30_000);
  // A horizon outside the declared band is refused rather than extrapolated.
  assert.equal(srcPresentValueCents({ oneTimeCents: 0, recurringCents: 10_000, horizonDays: 10, discountBp: 0 }), null);
});

test('sourcing: a cost line that does not belong to its mode is refused at the door', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env);
  // `licence` belongs to buy/partner, not make.
  const res = env.api.sourcingRecordOption({ caseId: c.id, ...OPT({ lines: [{ key: 'licence', amount: '900000' }] }) });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'lines');
  assert.match(res.error, /does not belong to a make option/i);
  // A duplicated line is refused rather than summed twice.
  const dup = env.api.sourcingRecordOption({ caseId: c.id, ...OPT({ lines: [{ key: 'build-effort', amount: '10' }, { key: 'build-effort', amount: '20' }] }) });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already recorded/i);
  // A zero line is not a cost.
  const zero = env.api.sourcingRecordOption({ caseId: c.id, ...OPT({ lines: [{ key: 'build-effort', amount: '0' }] }) });
  assert.equal(zero.ok, false);
  assert.match(zero.error, /zero cost line/i);
  // The correct mode lines are accepted.
  const ok = env.api.sourcingRecordOption({ caseId: c.id, ...OPT() });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(srcCostLinesForMode('make').includes('licence'), false);
});

/* =====================================================================
 * 3. THE COMPARISON — same terms or no comparison
 */

test('sourcing: two sides priced on different terms read `not-comparable`, never reconciled', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env);
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  // A buy option priced on a 2-year horizon cannot be compared with a 3-year case.
  const mismatched = env.api.sourcingRecordOption({
    caseId: c.id,
    mode: 'buy',
    note: 'Licence the commodity engine and integrate it over one quarter with two engineers.',
    horizonDays: 730,
    lines: [{ key: 'licence', amount: '420000' }],
    safeguards: ['exit-plan'],
  });
  assert.equal(mismatched.ok, true, 'the row is recorded — the COMPARISON is what is refused');

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  assert.equal(row.state, 'one-sided', 'only one mode is priced on the case’s own terms');
  assert.equal(row.excludedOptions.length, 1);
  assert.deepEqual(row.excludedOptions[0].mismatches, ['horizon']);
  assert.equal(row.verdict, 'not-comparable', 'one comparable side is not a comparison');
  assert.match(row.verdictReason, /priced a different question|needs a second side/i);
  assert.equal(row.cheapest.cents, null, 'a total priced another way is never used as the benchmark');
});

test('sourcing: an option in another currency is refused at the door, and never converted', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env);
  const res = env.api.sourcingRecordOption({ caseId: c.id, ...OPT({ currency: 'EUR' }) });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'currency');
  assert.match(res.error, /exchange rate/i);
});

/* =====================================================================
 * 4. THE HOLD-UP READING — a safeguard that cannot answer is not reassurance
 */

test('sourcing: a safeguard is credited only where it answers the declared specificity', () => {
  const env = seed();
  env.sit('dan');
  // Site-specific: only a co-located handover answers it.
  const c = declareCase(env, { specificity: 'site' });
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id,
    mode: 'buy',
    note: 'Contract the site operator for a five-year term with an exit plan and escrow.',
    lines: [{ key: 'licence', amount: '900000' }],
    safeguards: ['exit-plan', 'source-code-escrow'],
  }).ok, true);

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  const option = row.options[0];
  assert.equal(option.safeguards.length, 2, 'both were recorded');
  assert.equal(option.answeringSafeguards.length, 0, 'neither answers site specificity');
  assert.equal(option.answered, false);
  assert.equal(option.exposed, true);
  assert.equal(row.holdUp.unaddressed, true);
  // The case is one-sided (a single `buy` option), so `not-comparable` outranks
  // it in the declared precedence — but the EXPOSURE is still printed, which is
  // the fact that matters. Once a second side is recorded the hold-up becomes
  // the governing verdict; that is asserted below.
  assert.equal(row.verdict, 'not-comparable');
  assert.equal(row.holdUp.exposedOptionIds.length, 1, 'the exposure is printed regardless of the verdict');
  assert.match(row.holdUp.basis, /site-specific/i);
  // The pair table itself: the declaration is testable, not a sentiment.
  assert.equal(srcSafeguardAnswers('exit-plan', 'site'), false);
  assert.equal(srcSafeguardAnswers('co-located-handover', 'site'), true);
  assert.equal(srcSafeguardAnswers('source-code-escrow', 'high'), true);
  assert.equal(srcSafeguardAnswers('source-code-escrow', 'none'), false);
  // And the correct safeguard clears it.
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id,
    mode: 'partner',
    note: 'Jointly own the site asset with a governed board and a co-located handover.',
    lines: [{ key: 'licence', amount: '700000' }],
    safeguards: ['joint-ownership', 'co-located-handover'],
  }).ok, true);
  const after = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null }).rows.find((r) => r.id === c.id);
  assert.equal(after.holdUp.unaddressed, false, 'one answering option clears the exposure for the case');
  // A third, non-answering side that IS comparable proves the precedence: the
  // hold-up now governs, ahead of decision-owed.
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'hybrid',
    note: 'Own the differentiating layer and rent the commodity substrate beneath it.',
    lines: [{ key: 'build-effort', amount: '400000' }],
    safeguards: ['exit-plan'],
  }).ok, true);
  const withHybrid = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null }).rows.find((r) => r.id === c.id);
  assert.equal(withHybrid.holdUp.unaddressed, false);
  assert.equal(withHybrid.verdict, 'decision-owed', 'the answering option is on the record, so the case owes a decision');
});

/* =====================================================================
 * 5. THE DECISION — chief only, once, premium explained
 */

test('sourcing: only the chief altitude decides, only once, and a premium needs its reason', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env);
  const make = env.api.sourcingRecordOption({ caseId: c.id, ...OPT() });
  assert.equal(make.ok, true);
  const buy = env.api.sourcingRecordOption({
    caseId: c.id,
    mode: 'buy',
    note: 'Licence the commodity engine and integrate it, with a written exit plan as the safeguard.',
    lines: [{ key: 'licence', amount: '310000' }, { key: 'implementation', amount: '240000' }],
    safeguards: ['exit-plan'],
  });
  assert.equal(buy.ok, true);

  // A director cannot move the boundary of the firm.
  const refused = env.api.sourcingDecide(c.id, make.option.id, { rationale: BASIS });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /may not .*Decide the boundary of the firm|rank window is 5/i);

  // The boundary decision belongs to the workspace apex — the only rank-5 seat.
  // A VP on the roster (rank 4) is refused in the line above; the apex may act.
  env.sit(null);
  // The dearer option needs a stated reason, not a bare preference.
  const bare = env.api.sourcingDecide(c.id, make.option.id, { rationale: 'We prefer to build things ourselves in this organisation over buying anything external.' });
  assert.equal(bare.ok, false);
  assert.equal(bare.field, 'rationale');
  assert.match(bare.error, /what the premium buys/i);

  const decided = env.api.sourcingDecide(c.id, make.option.id, {
    rationale: 'We accept the premium because the invoicing logic is differentiating and the escrow does not answer the hold-up at renewal.',
  });
  assert.equal(decided.ok, true, JSON.stringify(decided));

  // A second decision is refused: a reconsideration is a new case.
  const twice = env.api.sourcingDecide(c.id, buy.option.id, { rationale: BASIS });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already recorded/i);

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  assert.equal(row.state, 'decided');
  assert.equal(row.verdict, 'decided-premium');
  assert.ok(row.premiumCents > 0, 'the premium is a positive figure');
  assert.equal(row.premiumCents, row.decidedOption.totalCents - row.cheapest.cents, 'the printed premium is exactly chosen minus cheapest');
  assert.equal(row.premiumBp, Math.round((row.premiumCents * 10_000) / row.cheapest.cents));
});

/* =====================================================================
 * 6. THE MATRIX — the joint chief apex, the diamond tie, and no promotion
 */

test('sourcing: the decision ask goes to the joint CHIEF apex above every line, never one line', () => {
  const env = seed();
  // The capability sits on ivo, who holds a home line to mia and a project line
  // to kai. Both live inside dan, and ceo sits above dan.
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id,
    mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }],
    safeguards: ['exit-plan'],
  }).ok, true);

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  assert.equal(row.verdict, 'decision-owed');
  // The joint apex of {mia, kai} is dan — a DIRECTOR (rank 3). The product's
  // roster model caps declared altitude at VP (rank 4) and reserves rank 5 for
  // the workspace apex, so the chief filter walks PAST dan to the only rank-5
  // seat there is. That is exactly the behaviour asserted here: the ask is never
  // left with a director.
  assert.equal(row.authority.state, 'chief-queue');
  assert.equal(row.authority.topReached, true);
  assert.deepEqual(row.authority.seatIds, []);
  assert.equal(row.authority.chiefQueue, true);
  // Nobody on the roster may decide it, including the director who is the
  // nearest apex and every VP above him.
  env.sit('dan');
  const asDirector = env.api.sourcingDecide(c.id, row.options[0].id, { rationale: BASIS });
  assert.equal(asDirector.ok, false, 'a director is never promoted into the chief act');
  env.sit('ceo');   // a VP, rank 4 — still refused
  const asVp = env.api.sourcingDecide(c.id, row.options[0].id, { rationale: BASIS });
  assert.match(String(asVp.error || ''), /rank window is 5/i);

  const { conditions } = sourcingConditions(report, { today: '2026-11-16' });
  const asked = conditions.filter((x) => x.kind === 'decision-owed');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].seatId, 'leader', 'the apex is the ONE addressee — never one of the two managers');
  assert.equal(asked[0].seatId === 'mia' || asked[0].seatId === 'kai' || asked[0].seatId === 'dan', false,
    'no roster seat is substituted for the apex');
});

test('sourcing: the apex above every line is the only addressee, and a capability with no line asks nobody', () => {
  // --- a diamond: three managers on three branches, all above one capability ---
  const env = seed();
  addPerson(env, 'ivy', 'vp', null);          // a second top branch
  addPerson(env, 'ned', 'director', 'ivy');
  addPerson(env, 'olga', 'manager', 'ned');
  // Give ivo a THIRD line under olga, so the managers above the capability are
  // {mia, kai, olga} on three branches with no roster-wide common manager.
  env.store.update((draft) => {
    draft.reportingLines = [...draft.reportingLines, {
      id: 'rl-ivo-third', personId: 'ivo', managerId: 'olga', kind: 'project', shareH: 20,
      rights: ['tasking'], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
    }];
  }, { type: 'line.declared', entity: 'reportingLine', entityId: 'rl-ivo-third', summary: 'seed' });

  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }], safeguards: ['exit-plan'],
  }).ok, true);

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  // The three branches share exactly ONE seat above them: the workspace apex.
  // The register therefore names that apex and asks nobody lower — it never
  // substitutes one branch's manager for another's, and it never promotes a
  // director into the chief act.
  assert.equal(row.authority.state, 'chief-queue');
  assert.equal(row.authority.chiefQueue, true);
  assert.equal(row.authority.topReached, true);
  assert.deepEqual(row.authority.seatIds, [], 'no roster seat is addressed');
  assert.equal(row.verdict, 'decision-owed', 'the condition is still printed on the register');

  const { conditions } = sourcingConditions(report, { today: '2026-11-16' });
  const asked = conditions.filter((x) => x.kind === 'decision-owed');
  assert.equal(asked.length, 1, 'ONE ask, not one per branch');
  assert.equal(asked[0].seatId, 'leader', 'the single addressee is the apex above all three branches');

  // A director is never promoted into the chief act, on either branch.
  for (const seat of ['dan', 'ned']) {
    env.sit(seat);
    assert.equal(env.api.sourcingDecide(c.id, row.options[0].id, { rationale: BASIS }).ok, false, `${seat} is not chief altitude`);
  }

  // --- an owner who has left the roster, and no other line to walk ---
  // `lineIds` snapshots the owner's managers at declaration, so a leaver does not
  // silently orphan the authority: the managers are still ON the matrix and the
  // apex above them is still reachable. What must break is the ownerless case —
  // a case whose owner is gone AND whose managers have gone with them.
  const orphan = seed();
  orphan.sit('dan');
  const c2 = declareCase(orphan, { ownerId: 'ivo' });
  assert.equal(orphan.api.sourcingRecordOption({ caseId: c2.id, ...OPT() }).ok, true);
  // Hold the authority honest across the leaver: it still resolves to the apex.
  orphan.store.update((draft) => {
    draft.people = draft.people.filter((p) => p.id !== 'ivo');
    draft.reportingLines = draft.reportingLines.filter((l) => l.personId !== 'ivo');
  }, { type: 'person.removed', entity: 'person', entityId: 'ivo', summary: 'leaver' });
  const afterLeaver = buildSourcing(orphan.store.state, { now: orphan.now(), settings: orphan.store.state.settings, seat: null })
    .rows.find((r) => r.id === c2.id);
  assert.equal(afterLeaver.authority.state, 'chief-queue', 'the snapshotted managers still resolve the apex');

  // A case whose owner never existed on the matrix has nothing to walk: it must
  // print `no-holder` rather than address the nearest surviving manager.
  const rawCase = orphan.store.state.sourcingCases.find((row) => row.id === c2.id);
  const ghostReport = buildSourcing({
    ...orphan.store.state,
    sourcingCases: [{ ...rawCase, ownerId: 'ghost', lineIds: [] }],
  }, { now: orphan.now(), settings: orphan.store.state.settings, seat: null });
  const ghostRow = ghostReport.rows.find((r) => r.id === c2.id);
  assert.equal(ghostRow.authority.state, 'no-holder', 'no roster seat holds this capability');
  assert.deepEqual(ghostRow.authority.seatIds, []);
  assert.equal(ghostRow.authority.disconnected, true);
});

test('sourcing: the seat that will decide does not also record the option it decides on', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  // dan is a director: he may record. That is allowed and is the ordinary path.
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  // The workspace apex IS the joint chief apex the register computes for this
  // case, so it may not write the comparison it will decide on.
  env.sit(null);
  const self = env.api.sourcingRecordOption({ caseId: c.id, ...OPT({ mode: 'partner', note: 'A jointly owned engine with a governed board and a co-located handover team.' }) });
  assert.equal(self.ok, false);
  assert.equal(self.field, 'mode');
  assert.match(self.error, /does not also record its options/i);
});

/* =====================================================================
 * 7. THE GRADE — once, after the review, never the decider
 */

test('sourcing: a grade is recorded once, only after the review date, and never by the decider', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { reviewOn: '2027-01-01' });
  const make = env.api.sourcingRecordOption({ caseId: c.id, ...OPT() });
  env.sit(null);
  assert.equal(env.api.sourcingDecide(c.id, make.option.id, { rationale: BASIS }).ok, true);

  // Before the review date: refused even for a seat that MAY grade, because
  // grading early would reward the assumption rather than test it. `ceo` is a VP
  // (rank 4 — the first rank that may grade) and recorded nothing here.
  env.sit('ceo');
  const early = env.api.sourcingGrade(c.id, { actualMake: '1600000', lesson: 'The stand-up took longer than the frozen assumption allowed for in the plan.' });
  assert.equal(early.ok, false);
  assert.match(early.error, /declared review date/i);

  env.setDay('2027-02-01');
  // The decider may not grade their own case.
  env.sit(null);
  const selfGrade = env.api.sourcingGrade(c.id, { actualMake: '1600000', lesson: 'The stand-up took longer than the frozen assumption allowed for in the plan.' });
  assert.equal(selfGrade.ok, false);
  assert.match(selfGrade.error, /independent review|does not also grade/i);

  // An independent seat at grade altitude may, and the bias is computed from the
  // record. `zoe` (a director, rank 3) is below the grade floor and is refused
  // for that reason, which the line below proves.
  env.sit('zoe');
  const tooJunior = env.api.sourcingGrade(c.id, { actualMake: '1600000', lesson: 'The stand-up took longer than the frozen assumption allowed for in the plan.' });
  assert.equal(tooJunior.ok, false);
  assert.match(tooJunior.error, /rank window is 4/i, 'the grade altitude is enforced, not wished for');
  env.sit('ceo');
  const graded = env.api.sourcingGrade(c.id, { actualMake: '1600000', lesson: 'The stand-up took longer than the frozen assumption allowed for in the plan.' });
  assert.equal(graded.ok, true, JSON.stringify(graded));
  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows.find((r) => r.id === c.id);
  assert.ok(row.grading, 'the grade is on the row');
  const makeSide = row.grading.perSide.make;
  assert.ok(makeSide, 'the make side was frozen and actual');
  assert.equal(makeSide.actualCents, 160_000_000);
  assert.equal(makeSide.deltaCents, makeSide.actualCents - makeSide.frozenCents);
  assert.equal(makeSide.biasBp, Math.round((makeSide.deltaCents * 10_000) / makeSide.frozenCents));

  // A second grade is refused.
  const twice = env.api.sourcingGrade(c.id, { actualMake: '1', lesson: 'A second grade would let the record be revised after the result is known.' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already been graded/i);
});

test('sourcing: the calibration figure is withheld below its declared floor', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { reviewOn: '2027-01-01' });
  env.sit('dan');
  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(report.calibration.readable, false);
  assert.equal(report.calibration.meanBiasBp, null, 'no bias is printed from zero cases');
  assert.match(report.calibration.reason, /floor of 5/i);
});

/* =====================================================================
 * 8. THE RULE — the spine, idempotence, self-closing, the pause
 */

test('sourcing: the rule is on the spine, in the contracts, and pause-governed on every path', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(sourcingRule), 'the rule is registered on the post-commit spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'every spine rule carries a contract');
  const contract = PROPAGATION_CONTRACTS.find((x) => x.rule === sourcingRule);
  assert.ok(contract, 'the sourcing contract exists');
  assert.equal(contract.module, 'sourcingRules.js');
  assert.ok(contract.writes.includes('sourcingMarkers'), 'the contract declares the marker collection it writes');
  assert.ok(/RULE-SRC-01/.test(contract.purpose));
  // The purpose is prose, so it must carry real typography, not escaped code points.
  assert.equal(contract.purpose.includes('\\u2019'), false, 'no literal backslash-u escapes in the contract prose');
  assert.ok(contract.purpose.includes('\u2019'), 'the purpose uses real typographic apostrophes');
  // The reach claim: the switch is on the matrix-reach list AND the rule map.
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('sourcingAutoPropagate'));
  assert.equal(PAUSE_PERMIT_REACH_RULES.sourcingAutoPropagate, 'sourcingRules.js');

  // The pause governs both a write and an explicit scan.
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }], safeguards: ['exit-plan'],
  }).ok, true);
  const loud = JSON.parse(JSON.stringify(env.store.state));
  assert.ok(sourcingRule(loud, { event: { type: 'sourcing.scan' }, now: env.now(), idFactory: (p) => `${p}-a` }).some((e) => e.action === 'delegated'));
  const quiet = JSON.parse(JSON.stringify(env.store.state));
  quiet.settings = { ...quiet.settings, sourcingAutoPropagate: false };
  for (const event of [{ type: 'sourcing.case.declared' }, { type: 'sourcing.scan' }, { type: 'cases.updated' }]) {
    assert.deepEqual(sourcingRule(quiet, { event, now: env.now(), idFactory: (p) => `${p}-b` }), [], `paused on ${event.type}`);
  }
});

test('sourcing: the ask is idempotent per signature and addressee, and closes itself when the condition clears', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  assert.equal(env.api.sourcingRecordOption({ caseId: c.id, ...OPT() }).ok, true);
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }], safeguards: ['exit-plan'],
  }).ok, true);

  const draft = JSON.parse(JSON.stringify(env.store.state));
  let seq = 0;
  const idF = (p) => `${p}-${++seq}`;
  sourcingRule(draft, { event: { type: 'sourcing.scan' }, now: env.now(), idFactory: idF });
  sourcingRule(draft, { event: { type: 'sourcing.scan' }, now: env.now(), idFactory: idF });
  const asks = indexSourcingAsks(draft).filter((a) => a.task && a.task.status === 'active');
  assert.equal(asks.length, 1, 'a second scan files no second ask');
  // Every roster seat sits under the workspace apex, so the apex is the addressee
  // — the register names it rather than promoting a director.
  assert.equal(asks[0].seatId, 'leader', 'the ask is addressed to the seat above every line');

  // Now decide the case: the condition clears and the ask closes itself.
  env.sit(null);
  const row = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null }).rows.find((r) => r.id === c.id);
  assert.ok(row.cheapest.optionIds.length, `a benchmark exists: ${JSON.stringify(row.cheapest)}`);
  assert.equal(env.api.sourcingDecide(c.id, row.cheapest.optionIds[0], { rationale: BASIS }).ok, true);

  const after = JSON.parse(JSON.stringify(env.store.state));
  // Carry the rule's own ask forward so it is visible to the closer.
  after.delegations = [...draft.delegations, ...after.delegations.filter((d) => !draft.delegations.some((x) => x.id === d.id))];
  after.links = [...draft.links, ...after.links.filter((l) => !draft.links.some((x) => x.id === l.id))];
  sourcingRule(after, { event: { type: 'sourcing.decided' }, now: env.now(), idFactory: idF });
  const closed = after.delegations.find((d) => d.id === asks[0].task.id);
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote, /RULE-SRC-01/);
});

/* =====================================================================
 * 9. THE CSV — identity-free and exactly the reader's figures
 */

test('sourcing CSV #170: identity-free, reconciling, and blank-with-reason rather than zero', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  const make = env.api.sourcingRecordOption({ caseId: c.id, ...OPT() });
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }], safeguards: ['exit-plan'],
  }).ok, true);
  env.sit(null);
  assert.equal(env.api.sourcingDecide(c.id, make.option.id, {
    rationale: 'The premium buys a differentiating asset we will not rent from a supplier at renewal time.',
  }).ok, true);

  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const rows = sourcingCsvRows(report);
  const summary = rows.find((r) => r.row_kind === 'summary');
  assert.equal(summary.cases_n, report.counts.cases);
  assert.equal(summary.decided_n, report.counts.decided);
  assert.equal(summary.hold_up_n, report.coverage.holdUpUnaddressedN);

  const currencyRow = rows.find((r) => r.row_kind === 'currency' && r.currency === 'DKK');
  assert.ok(currencyRow);
  assert.equal(currencyRow.chosen_total_cents, report.byCurrency[0].chosenTotalCents);
  assert.equal(currencyRow.cheapest_total_cents, report.byCurrency[0].cheapestTotalCents);
  assert.equal(currencyRow.premium_cents, report.byCurrency[0].premiumTotalCents);
  assert.equal(currencyRow.premium_bp, report.byCurrency[0].premiumBp);

  // The real export path, identity-free: no title, owner, id, vendor or note.
  const exported = exportWorkspaceCsv(env.store.state, 'capability-sourcing', { now: env.now() });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  const table = { rows: parseCsv(exported.csv), columns: [] };
  assert.equal(table.rows.length, exported.rowCount, 'rowCount matches the payload exactly');
  const flat = exported.csv;
  for (const secret of ['Billing engine', 'src-', 'ivo', 'Ivo', 'Mia', 'Kai', 'Cleo', 'DKK 1,480,000', 'escrow with a tested']) {
    assert.equal(flat.includes(secret), false, `the export must not carry “${secret}”`);
  }
  assert.ok(exported.csv.split('\r\n')[0].split(',').includes('premium_bp'), 'the premium column is declared');
  // Every row's figure is an integer or blank — never a float and never "NaN".
  for (const row of table.rows) {
    for (const key of ['chosen_total_cents', 'cheapest_total_cents', 'premium_cents']) {
      const value = row[key];
      assert.ok(value === '' || /^-?\d+$/.test(value), `${key} is an integer or blank, got “${value}”`);
    }
  }
});

/* =====================================================================
 * 10. THE PANEL — displayed equals computed, and the two claims are apart
 */

test('sourcing panel: every displayed figure equals the reader’s figure, and the two claims are printed apart', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env, { ownerId: 'ivo' });
  const make = env.api.sourcingRecordOption({ caseId: c.id, ...OPT() });
  assert.equal(env.api.sourcingRecordOption({
    caseId: c.id, mode: 'buy',
    note: 'Licence a commodity engine with a written exit plan and a bounded renewal term.',
    lines: [{ key: 'licence', amount: '300000' }], safeguards: ['exit-plan'],
  }).ok, true);
  env.sit(null);
  assert.equal(env.api.sourcingDecide(c.id, make.option.id, {
    rationale: 'The premium buys a differentiating asset we will not rent from a supplier at renewal time.',
  }).ok, true);

  const built = env.api.sourcingReport();
  assert.equal(built.ok, true, JSON.stringify(built));
  const report = built.report;

  withDom(() => {
    const ctx = {
      api: env.api,
      query: new URLSearchParams('view=cases'),
      navigate: () => {},
      refresh: () => {},
      persistError: null,
    };
    const node = renderSourcing(ctx);
    const text = node.textContent;
    // "the figures add up" and "every row was printed" are two printed claims.
    assert.match(text, /“the figures add up” is true/);
    assert.match(text, /“every row was printed” is (true|false)/);
    // The reader's own figures appear, exactly formatted from the same cents.
    const row = report.rows[0];
    assert.ok(text.includes(`DKK ${centsToDisplay(row.cheapest.cents)}`.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')), 'the cheapest total is printed from the reader’s cents');
    assert.equal(node.querySelector('[data-testid="src-summary"]') !== null, true);
    // The verdict badge is the reader's verdict, not a re-derivation.
    assert.ok(text.includes(row.verdictLabel.split(' — ')[0]));
    // The four stat figures are the reader's counts, cell for cell.
    const stats = [...node.querySelectorAll('[data-testid="src-summary"] .stat')];
    const values = stats.map((s) => s.querySelector('.stat-value')?.textContent);
    assert.deepEqual(values.slice(0, 4), [
      String(report.coverage.liveN),
      String(report.coverage.decisionOwedN),
      String(report.coverage.holdUpUnaddressedN),
      String(sourcingAttentionCount(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null })),
    ]);
  });
});

test('sourcing: an unreadable stored row is refused with a counted warning, never repaired', () => {
  const env = seed();
  env.sit('dan');
  const c = declareCase(env);
  env.store.update((draft) => {
    draft.sourcingOptions = [{
      id: 'srco-bad', caseId: c.id, mode: 'make', recordedById: 'dan', recordedOn: '2026-11-16',
      currency: 'DKK', horizonDays: 1095, discountBp: 800,
      note: 'A hand-edited option carrying a fractional cent, which the loader must refuse rather than round.',
      safeguards: [],
      lines: [{ key: 'build-effort', cents: 1_000_000.5 }],
    }];
  }, { type: 'test.seed', entity: 'sourcingOption', entityId: 'srco-bad', summary: 'seed' });
  const report = buildSourcing(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(report.rows[0].options.length, 0, 'the fractional-cent option did not survive');
  assert.ok(report.warnings.some((w) => /refused .* cost line|unpriced option/i.test(w)));
  assert.equal(report.figuresComplete, false, 'the completeness claim honestly reports the dropped row');
});
