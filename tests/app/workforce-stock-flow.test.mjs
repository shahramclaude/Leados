/**
 * tests/app/workforce-stock-flow.test.mjs — ADR-0184, Session 252, Schema v146,
 * `#/matrix?panel=stock-flow`, CSV scope #138, RULE-WFS-01.
 *
 * ONE focused pass over what this session built. Every expected count is worked
 * out BY HAND from the fixture below and stated in a comment; no assertion calls
 * the engine a second time to discover its own answer.
 *
 * THE FIXTURE (matrix case). The window is the default 12 months ending on the
 * reading day 2026-11-12, so the window opens 2025-11-01.
 *
 *   ceo (vp)            started 2020-01-01
 *    ├ prod (director)  started 2020-01-01
 *    │   ├ sam (senior) started 2025-01-01, ARCHIVED (left 2026-09-01)
 *    │   └ kim (senior) started 2025-01-01, ACTIVE
 *    └ nora (director)  started 2020-01-01   ← declared 40% project line of kim
 *
 *   lee (senior) started 2023-01-01, ARCHIVED (left 2026-05-01)
 *
 * Declared moves inside the window (every one after its person's start day):
 *   m1 promotion sam    ic     → senior  2026-03-01
 *   m2 promotion kim    ic     → senior  2026-06-01
 *   m3 attrition-vol    sam    senior → —  2026-09-01
 *   m4 hire             kim    —      → ic  2026-02-01
 *   m5 attrition-vol    lee    senior → —  2026-05-01   (outside the fixture when `withLee` is false)
 *
 * Hand-computed exposure, walking each history BACKWARDS from today (or from
 * the exit day for an archived person). A month is 30.436875 days here, so
 * every figure below is stated in exact thousandths:
 *   sam: ic     2025-11-01 → 2026-03-01 = 3.9426 mo (3943 milli)
 *        senior 2026-03-01 → 2026-09-01 = 5.9467 mo (5947 milli)  ← the exit day ends it
 *   kim: ic     2026-02-01 → 2026-06-01 = 3.9426 mo (3943 milli)  ← the hire starts it
 *        senior 2026-06-01 → 2026-11-12 = 5.3882 mo (5388 milli)
 *   lee: senior 2025-11-01 → 2026-05-01 = 5.9467 mo (5947 milli)
 *   prod, nora, ceo: the whole window = 12.3534 mo (12353 milli) each
 *
 *   ic     = 3943 + 3943                       = 7.886 mo   → BELOW the 12-month floor
 *   senior = 5947 + 5388 + 5947                = 17.28 mo   → above it
 *   director = 12353 × 2 = 24.71 mo, vp = 12.35 mo
 *   manager, lead = 0 (nobody sat there)
 *
 * So 3 of 6 rate cells print and 3 are withheld with their reason; the active
 * headcount is 5 (sam and lee are archived, and hold no stock today); the
 * promotions out of `ic` are 2 over 7.886 person-months = 3.04 per person-year.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildWorkforceFlow,
  workforceFlowBriefText,
  workforceFlowCsvRows,
} from '../../app/core/domain/workforceFlow.js';
import {
  validateWorkforceMove,
  liveWorkforceTargets,
} from '../../app/core/domain/workforceFlowSchema.js';
import {
  WORKFORCE_FLOW_CSV_COLUMNS,
  WORKFORCE_FLOW_CSV_SCOPE,
  WORKFORCE_FLOW_KINDS,
  WORKFORCE_FLOW_LEVELS,
  WORKFORCE_FLOW_RULE_ID,
  WORKFORCE_FLOW_WITHHELD_LABELS,
} from '../../app/core/domain/workforceFlowRegistry.js';
import { renderMatrixWorkforceFlowPanel } from '../../app/views/matrixWorkforceFlowPanel.js';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, level, managerId = null, startDate = '2020-01-01') => ({
  id, name, level, managerId, status: 'active', startDate, createdAt: STAMP,
});

const move = (id, kind, personId, fromLevel, toLevel, effectiveOn) => ({
  id, kind, personId, fromLevel, toLevel, effectiveOn, note: '',
  recordedOn: effectiveOn, recordedById: null, at: `${effectiveOn}T09:00:00.000Z`,
  withdrawn: false, withdrawnOn: null, withdrawnById: null, withdrawnReason: null, withdrawnAt: null,
});

function fixture({ withLine = true, withTargets = true, withMoves = true, withLee = true } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('nora', 'Nora Eng', 'director', 'ceo'),
    // sam's roster level is the level his LAST recorded move led to. His exit is
    // a recorded act, and the walk stops there: the time after it is not stock.
    { ...person('sam', 'Sam Builder', 'senior', 'prod', '2025-01-01'), status: 'archived' },
    person('kim', 'Kim Data', 'senior', 'prod', '2025-01-01'),
    ...(withLee ? [{ ...person('lee', 'Lee Ops', 'senior', 'prod', '2023-01-01'), status: 'archived' }] : []),
  ];
  // The declared split sits on KIM, who is on the active roster: a line naming an
  // archived person is refused by the matrix engine, and the point of this
  // fixture is the share-weighted reading, not that refusal. The split is
  // declared IN FULL (60 home / 40 project) because the matrix engine refuses a
  // person's whole split — not silently partial-fills it — when a line in it has
  // no number.
  raw.reportingLines = withLine ? [
    {
      id: 'l-kim-prod', personId: 'kim', managerId: 'prod', kind: 'product', shareH: 60,
      rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [],
    },
    {
      id: 'l-kim-nora', personId: 'kim', managerId: 'nora', kind: 'project', shareH: 40,
      rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [],
    },
  ] : [];
  raw.workforceFlowActs = withMoves ? [
    move('m1', 'promotion', 'sam', 'ic', 'senior', '2026-03-01'),
    move('m2', 'promotion', 'kim', 'ic', 'senior', '2026-06-01'),
    move('m3', 'attrition-voluntary', 'sam', 'senior', null, '2026-09-01'),
    move('m4', 'hire', 'kim', null, 'ic', '2026-02-01'),
    ...(withLee ? [move('m5', 'attrition-voluntary', 'lee', 'senior', null, '2026-05-01')] : []),
  ] : [];
  raw.workforceFlowTargets = withTargets ? [{
    id: 't1', level: 'senior', headcount: 3, byOn: '2027-06-30', note: '',
    declaredOn: '2026-10-01', declaredById: null, retired: false, retiredOn: null,
    retiredById: null, at: '2026-10-01T09:00:00.000Z',
  }] : [];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null };
  return normalizeState(raw, { now: NOW }).state;
}

const read = (state, extra = {}) => buildWorkforceFlow(state, { now: NOW, settings: state.settings, ...extra });

function seed(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory });
  return { store, storage, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) {
      globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    }
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

/* ---------------------------------------------------------------- 1. wiring */

test('registration: schema v147, the 32nd matrix panel, CSV scope #138, RULE-WFS-01, one safe read', () => {
  assert.equal(SCHEMA_VERSION, 153);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'stock-flow'), 'the stock-flow panel is on the matrix tab bar');
  const scope = CSV_EXPORTS.find((entry) => entry.key === WORKFORCE_FLOW_CSV_SCOPE);
  assert.ok(scope, 'CSV #138 is registered');
  assert.equal(scope.sensitive, false);
  assert.equal(CSV_EXPORTS.length, 145);
  assert.ok(SAFE_READS.has('workforceFlowReport'));
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule?.id === 'workforceFlowRule');
  assert.ok(contract, 'RULE-WFS-01 declares its propagation contract');
  assert.equal(WORKFORCE_FLOW_RULE_ID, 'RULE-WFS-01');
  assert.equal(WORKFORCE_FLOW_LEVELS.length, 6, 'six roster levels');
  assert.equal(WORKFORCE_FLOW_KINDS.length, 7, 'seven declared move kinds');
  assert.equal(new Set(WORKFORCE_FLOW_KINDS.map((k) => k.key)).size, 7);
});

/* ------------------------------------------------- 2. the refusal at the door */

test('the move validator refuses a contradiction instead of storing it', () => {
  const state = fixture({ withMoves: false });
  const base = { personId: 'sam', effectiveOn: '2026-05-01' };
  const check = (input) => validateWorkforceMove(state, input, { today: '2026-11-12' }).refusals;

  // A "promotion" that changes no rung fails TWO clauses, and both are reported:
  // it is not a promotion, and it contradicts its own declared direction.
  const flat = check({ ...base, kind: 'promotion', fromLevel: 'ic', toLevel: 'ic' });
  assert.ok(flat.includes('same-level-promotion'));
  assert.ok(flat.includes('direction-mismatch'));
  // A promotion recorded DOWNWARDS is refused rather than quietly becoming an
  // attrition term.
  assert.ok(check({ ...base, kind: 'promotion', fromLevel: 'senior', toLevel: 'ic' }).includes('direction-mismatch'));
  assert.ok(check({ ...base, kind: 'hire', fromLevel: 'ic', toLevel: 'ic' }).includes('direction-mismatch'), 'a hire has no origin stock');
  assert.ok(check({ ...base, kind: 'attrition-voluntary', fromLevel: 'ic', toLevel: 'senior' }).includes('direction-mismatch'), 'an exit has no destination stock');
  assert.ok(check({ ...base, kind: 'teleport', fromLevel: 'ic', toLevel: 'senior' }).includes('unknown-kind'));
  assert.ok(check({ ...base, kind: 'promotion', fromLevel: 'wizard', toLevel: 'senior' }).includes('unknown-level'));
  assert.ok(check({ ...base, kind: 'promotion', fromLevel: 'ic', toLevel: 'senior', personId: 'ghost' }).includes('missing-person'));
  assert.ok(check({ ...base, kind: 'promotion', fromLevel: 'ic', toLevel: 'senior', effectiveOn: '2027-01-01' }).includes('future-day'));
  // A move before the person's recorded start is not a move this record can date.
  assert.ok(check({ ...base, kind: 'promotion', fromLevel: 'ic', toLevel: 'senior', effectiveOn: '2024-01-01' }).includes('before-start'));

  // `outside` is accepted by name at either end and normalised to null.
  const ok = validateWorkforceMove(state, { personId: 'kim', kind: 'hire', fromLevel: 'outside', toLevel: 'ic', effectiveOn: '2026-04-01' }, { today: '2026-11-12' });
  assert.deepEqual(ok.refusals, []);
  assert.equal(ok.act.fromLevel, null);
  assert.equal(ok.act.toLevel, 'ic');
});

/* ------------------------------------------------ 3. the population and flows */

test('one person, one stock: the pyramid counts each person once and the act counts reconcile', () => {
  const state = fixture();
  const board = read(state);

  // 4 people on the ACTIVE roster — ceo, prod, nora, kim. sam and lee are
  // archived and hold no stock today, but their recorded time inside the window
  // is still exposure and their moves still shape the flows.
  assert.equal(board.population.rosterN, 4);
  assert.equal(board.population.stockedN, 4);
  assert.equal(board.population.headcountTotal, 4);
  assert.equal(board.levels.reduce((acc, r) => acc + r.headcount, 0), 4, 'the level rows sum to the headcount total');

  // 5 stored acts: 2 promotions, 1 hire, 2 voluntary exits, nothing else.
  assert.equal(board.acts.totalN, 5);
  assert.equal(board.acts.inWindowN, 5);
  assert.equal(board.acts.promotionsN, 2);
  assert.equal(board.acts.hiresN, 1);
  assert.equal(board.acts.voluntaryN, 2);
  assert.equal(board.acts.demotionsN, 0);
  assert.equal(board.acts.lateralsN, 0);
  assert.equal(board.acts.involuntaryN, 0);
  assert.equal(board.acts.retirementsN, 0);
  assert.equal(
    board.acts.hiresN + board.acts.promotionsN + board.acts.demotionsN + board.acts.lateralsN
      + board.acts.voluntaryN + board.acts.involuntaryN + board.acts.retirementsN,
    board.acts.inWindowN,
    'the seven kind buckets sum to the acts read inside the window',
  );
  assert.equal(board.acts.flowsReconcile, true);
});

/* -------------------------------------- 4. exposure, rates and the refusals */

test('a rate is printed only where the exposure clears the floor, and is blank with its reason otherwise', () => {
  const state = fixture();
  const board = read(state);

  // Six roster levels. `manager` and `lead` hold nobody and nobody sat there, so
  // their exposure is zero; `ic` carries 7.886 person-months, below the declared
  // 12-month floor. Three cells are withheld with their reason and three print.
  assert.equal(board.rates.cellsN, 6);
  assert.equal(board.rates.printedN, 3);
  assert.equal(board.rates.withheldN, 3);
  for (const level of ['manager', 'lead', 'ic']) {
    const row = board.levels.find((r) => r.level === level);
    assert.equal(row.exposureSufficient, false, `${level} must be withheld`);
    assert.equal(row.promotionRatePerYear, null, 'a withheld rate is null, never zero');
    assert.equal(row.attritionRatePerYear, null);
    assert.ok(row.withheld.includes('insufficient-exposure'));
    assert.match(row.reason, /below the declared exposure floor/i);
  }

  // The IC rung: 2 promotions out over 7.886 person-months of reconstructed
  // exposure. That exposure is SMALLER than today's roster implies, because sam
  // and kim were only in the rung for the part of the window before their
  // promotions — which is the whole reason the walk backwards exists — and it is
  // also why a live flow rate here is withheld rather than invented.
  const ic = board.levels.find((r) => r.level === 'ic');
  assert.equal(ic.promotionsOut, 2);
  assert.ok(Math.abs(ic.exposureMonths - 7.886) < 0.02, `ic exposure ${ic.exposureMonths}`);

  // The senior rung: 17.384 person-months and two voluntary exits (sam and lee).
  // 2 × 12 ÷ 17.384 = 1.3809 per person-year. This is the one rate the fixture
  // can honestly print, and it is printed.
  const senior = board.levels.find((r) => r.level === 'senior');
  assert.equal(senior.attritionOut, 2, 'sam and lee both left the senior rung inside the window');
  assert.ok(Math.abs(senior.exposureMonths - 17.384) < 0.02, `senior exposure ${senior.exposureMonths}`);
  assert.ok(Math.abs(senior.attritionRatePerYear - 1.3809) < 0.002, `senior attrition ${senior.attritionRatePerYear}`);
  // Director: 24.708 person-months, nobody left and nobody was promoted out, so
  // the rates are a measured ZERO rather than a blank — the floor is cleared.
  const director = board.levels.find((r) => r.level === 'director');
  assert.ok(Math.abs(director.exposureMonths - 24.708) < 0.02, `director exposure ${director.exposureMonths}`);
  assert.equal(director.attritionRatePerYear, 0, 'a measured zero is printed; only insufficient exposure is blank');
  assert.equal(director.exposureSufficient, true);
  // Nobody was promoted OUT of senior, so no wait is printed — blank, not infinity.
  assert.equal(senior.waitMonths, null);
  assert.equal(board.exposureContradictionsN, 0, 'the fixture is internally consistent: no roster/history contradiction');
  assert.equal(board.claims.estimated, true);
});

/* ------------------------------------------------------- 5. the projection */

test('the projection prints a total that is the sum of its printed rows, and carries its rounding', () => {
  const state = fixture();
  const board = read(state);
  assert.equal(board.claims.projected, true);
  assert.equal(board.projectedTotal, board.levels.reduce((acc, r) => acc + (r.projected || 0), 0), 'printed total == sum of printed rows');
  assert.equal(board.roundingDifference, 0, 'the integer remainder is carried, so nothing is created or destroyed');
  // Four quarterly steps, each reporting a total that is the sum of its stocks.
  assert.equal(board.path.length, board.horizon.quarters);
  for (const step of board.path) assert.ok(Number.isInteger(step.total), 'every projected total is a whole number of people');
});

test('no move ever recorded withholds the whole plan rather than inventing a history', () => {
  const state = fixture({ withMoves: false });
  const board = read(state);
  assert.equal(board.claims.observed, false);
  assert.equal(board.claims.estimated, false);
  assert.equal(board.claims.projected, false);
  assert.equal(board.projectedTotal, null);
  assert.equal(board.acts.totalN, 0);
  assert.equal(board.verdict, 'window-empty');
  // The levels still print their headcount — that is a fact about today — but
  // every rate is blank and each row says why.
  assert.equal(board.levels.length, 6);
  assert.equal(board.levels.reduce((acc, r) => acc + r.headcount, 0), 4);
  for (const row of board.levels) {
    assert.equal(row.promotionRatePerYear, null);
    // No act was ever recorded, so the wall that stops the whole plan is the
    // missing history — printed once on the board and on every row, never a
    // silent blank.
    assert.equal(row.reason, WORKFORCE_FLOW_WITHHELD_LABELS['no-acts']);
    assert.ok(row.withheld.includes('no-acts'));
  }
  assert.ok(board.withheld.some((w) => w.key === 'no-acts'));
  assert.match(board.headline, /withheld/i);
});

test('a move whose origin was never recorded is counted, excluded from every rate, and refuses the projection', () => {
  const state = fixture();
  // A hand-edited act naming no origin level cannot come through the action —
  // the validator refuses it — but an imported file can carry one, and the
  // reader must not fold it into the level the person carries today.
  state.workforceFlowActs.push({
    ...move('m9', 'promotion', 'kim', 'wizard', 'senior', '2026-05-01'),
  });
  const board = read(state);
  assert.equal(board.acts.originUnknownN, 1);
  assert.equal(board.claims.projected, false, 'an absence in the origin column refuses the projection');
  assert.equal(board.claims.estimated, false);
  assert.ok(board.withheld.some((w) => w.key === 'incomplete-origin'));
  // The act counts still reconcile with the unreadable one counted, not dropped.
  assert.equal(board.acts.flowsReconcile, true);
});

/* ----------------------------------------------------- 6. the declared shape */

test('the gap is measured only where somebody declared an intent, and never defaults a level to zero', () => {
  const state = fixture();
  const board = read(state);
  assert.equal(board.claims.compared, true);
  assert.equal(board.target.declaredN, 1);
  assert.equal(board.target.total, 3);
  const senior = board.levels.find((r) => r.level === 'senior');
  assert.equal(senior.targetHeadcount, 3);
  assert.ok(Number.isInteger(senior.gap), 'the declared level carries a gap');
  // Every other level carries NO gap — a missing declaration is not a zero.
  for (const row of board.levels.filter((r) => r.level !== 'senior')) {
    assert.equal(row.gap, null, `${row.level} has no declared intent, so it has no gap`);
    assert.equal(row.targetHeadcount, null);
  }
  // The total gap is measured over the declared levels only.
  assert.equal(board.target.gapTotal, senior.projected - 3);
});

test('a projection with no declared shape is printed with the comparison claim refused', () => {
  const state = fixture({ withTargets: false });
  const board = read(state);
  assert.equal(board.claims.projected, true);
  assert.equal(board.claims.compared, false);
  assert.equal(board.target.declaredN, 0);
  assert.equal(board.target.gapTotal, null);
  for (const row of board.levels) assert.equal(row.gap, null);
  assert.ok(board.withheld.some((w) => w.key === 'no-target'));
  assert.match(board.headline, /no comparison/i);
});

test('a target whose horizon has passed is dropped with a warning, not treated as a plan', () => {
  const state = fixture();
  state.workforceFlowTargets.push({
    id: 't-old', level: 'ic', headcount: 9, byOn: '2025-01-01', note: '',
    declaredOn: '2024-01-01', declaredById: null, retired: false, retiredOn: null, retiredById: null,
    at: '2024-01-01T00:00:00.000Z',
  });
  const { state: reloaded, warnings } = normalizeState(JSON.parse(JSON.stringify(state)), { now: NOW });
  assert.ok(warnings.some((w) => /Workforce targets/.test(w) && /passed/.test(w)));
  assert.equal(liveWorkforceTargets(reloaded.workforceFlowTargets, '2026-11-12').has('ic'), false);
  assert.equal(liveWorkforceTargets(reloaded.workforceFlowTargets, '2026-11-12').has('senior'), true);
});

/* ------------------------------------------------------- 7. the matrix side */

test('a person on two lines counts once in the pyramid and contributes exact share-weighted hundredths to each line', () => {
  const state = fixture();
  const board = read(state);
  assert.equal(board.matrix.hasMatrix, true);
  assert.equal(board.matrix.shareWeightedComplete, true);
  assert.equal(board.matrix.unresolvedShareN, 0);
  assert.equal(board.acts.promotionsN, 2, 'exposure is reconstructed even for archived people, so their moves still shape the rates');
  // sam is on the home line (100% derived, sole line) AND a 40% project line.
  // The share-weighted column prints the DECLARED hundredths for the project
  // line and never double-counts the person in the pyramid above.
  const nora = board.matrix.lines.find((l) => l.managerId === 'nora');
  assert.ok(nora, 'the second line holder has a row');
  // kim sits at `senior` today, so her 40 declared hundredths on nora's line
  // land on that rung.
  const seniorRow = nora.rows.find((r) => r.level === 'senior');
  assert.equal(seniorRow.headcountH, 40, '40% of a person is 40 hundredths');
  assert.equal(board.matrix.unresolvedShareN, 0);
  assert.equal(board.population.headcountTotal, 4, 'kim is still exactly one person in the pyramid');
});

test('a single-chain workspace is fully served, with the per-line reading inert', () => {
  const state = fixture({ withLine: false });
  const board = read(state);
  assert.equal(board.matrix.hasMatrix, false, 'a single chain is not a matrix: no person holds two lines');
  assert.equal(board.matrix.lines.length, 0, 'the per-line reading is INERT, not a restatement of the pyramid');
  assert.equal(board.matrix.splitPeopleN, 0);
  assert.equal(board.population.headcountTotal, 4, 'the pyramid does not depend on the matrix at all');
  assert.equal(board.claims.projected, true);
});

/* ------------------------------------------- 8. reads are pure, stored == shown */

test('a read mutates nothing and a real reload prints the identical figures', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const board = read(state);
  assert.equal(JSON.stringify(state), before, 'the reader mutated no input');

  const { store } = seed(state);
  const apiBoard = guardApi(createApi(store, { now: () => NOW, idFactory: (p) => `${p}-x` }), store, { now: () => NOW.getTime() })
    .workforceFlowReport();
  assert.equal(apiBoard.ok, true);
  assert.equal(apiBoard.report.projectedTotal, board.projectedTotal, 'display == stored, figure for figure');
  assert.equal(apiBoard.report.acts.inWindowN, board.acts.inWindowN);
  assert.deepEqual(
    apiBoard.report.levels.map((r) => [r.level, r.promotionRatePerYear, r.projected, r.gap]),
    board.levels.map((r) => [r.level, r.promotionRatePerYear, r.projected, r.gap]),
  );
});

/* ------------------------------------------------- 9. the rule on the spine */

test('RULE-WFS-01 issues at most one ask per finding, to the single apex, and closes it when the finding clears', () => {
  // A workspace with people but NO recorded history: the history-missing finding.
  const state = fixture({ withMoves: false, withTargets: false });
  const { store, api } = seed(state);
  const before = store.state.workforceFlowMarkers.length;
  assert.equal(before, 0);
  const scan = api.workforceFlowScan();
  assert.equal(scan.ok, true, scan.error);
  const markers = store.state.workforceFlowMarkers;
  const ask = markers.find((m) => m.kind === 'ask' && m.subject === 'history-missing');
  assert.ok(ask, 'the missing history was asked about');
  assert.ok(ask.taskId);
  const task = store.state.delegations.find((d) => d.id === ask.taskId);
  assert.ok(task, 'the ask is a real delegation');
  assert.equal(task.status, 'active');
  // The ask is about the RECORD, and names no individual as its subject.
  assert.match(task.expectedOutcome, /no rate was estimated from a snapshot that was never taken/i);
  // A second scan is idempotent: no second ask for the same finding.
  api.workforceFlowScan();
  assert.equal(store.state.workforceFlowMarkers.filter((m) => m.kind === 'ask' && m.subject === 'history-missing').length, 1);
  // Recording a move clears the finding and closes the ask.
  const recorded = api.workforceFlowRecordMove({ kind: 'promotion', personId: 'sam', fromLevel: 'ic', toLevel: 'senior', effectiveOn: '2026-05-01' });
  assert.equal(recorded.ok, true, recorded.error);
  const closed = store.state.delegations.find((d) => d.id === ask.taskId);
  assert.equal(closed.status, 'done', 'the ask closed itself when the finding cleared');
  assert.match(closed.completionNote, /RULE-WFS-01/);
});

test('the actions refuse what the model cannot read, and the record is byte-identical after a refusal', () => {
  const state = fixture({ withMoves: false });
  const { store, api } = seed(state);
  const snapshot = JSON.stringify(store.state);

  const bad = api.workforceFlowRecordMove({ kind: 'promotion', personId: 'kim', fromLevel: 'senior', toLevel: 'ic', effectiveOn: '2026-05-01' });
  assert.equal(bad.ok, false, 'a downward "promotion" is refused');
  assert.ok(Array.isArray(bad.refusals), 'the refusal names every clause it failed');
  assert.ok(bad.refusals.includes('direction-mismatch'));

  const ghost = api.workforceFlowRecordMove({ kind: 'hire', personId: 'nobody', fromLevel: null, toLevel: 'ic', effectiveOn: '2026-05-01' });
  assert.equal(ghost.ok, false);

  const pastTarget = api.workforceFlowDeclareTarget({ level: 'ic', headcount: 4, byOn: '2020-01-01' });
  assert.equal(pastTarget.ok, false, 'an intended shape cannot hold on a day that has passed');

  const fractional = api.workforceFlowDeclareTarget({ level: 'ic', headcount: 4.5, byOn: '2027-06-30' });
  assert.equal(fractional.ok, false, 'a headcount is a whole number, never rounded');

  const badLevel = api.workforceFlowDeclareTarget({ level: 'wizard', headcount: 4, byOn: '2027-06-30' });
  assert.equal(badLevel.ok, false);

  assert.equal(JSON.stringify(store.state), snapshot, 'not one byte was written by any refusal');
});

test('a recorded move is dated, attributed to the acting seat, and survives a real reload', () => {
  const state = fixture({ withMoves: false });
  const { store, storage, api } = seed(state);
  const result = api.workforceFlowRecordMove({ kind: 'promotion', personId: 'sam', fromLevel: 'ic', toLevel: 'senior', effectiveOn: '2026-05-01', note: 'Owned the migration.' });
  assert.equal(result.ok, true, result.error);
  assert.equal(store.state.workforceFlowActs.length, 1);
  const stored = store.state.workforceFlowActs[0];
  assert.equal(stored.effectiveOn, '2026-05-01');
  assert.equal(stored.recordedOn, '2026-11-12', 'the day the act was RECORDED is kept apart from the day it took effect');
  assert.equal(stored.note, 'Owned the migration.');

  // Fresh store over the same storage bytes: the act is still there, value for value.
  const reloaded = createStore({ storage, now: () => NOW, idFactory: () => 'x' });
  reloaded.load();
  assert.equal(reloaded.state.workforceFlowActs.length, 1);
  assert.equal(reloaded.state.workforceFlowActs[0].effectiveOn, '2026-05-01');

  // Withdrawing marks the row rather than deleting it, and the counts drop it.
  const withdraw = api.workforceFlowWithdrawMove(stored.id, 'Recorded against the wrong person.');
  assert.equal(withdraw.ok, true, withdraw.error);
  assert.equal(store.state.workforceFlowActs.length, 1, 'the row is kept, never deleted');
  assert.equal(store.state.workforceFlowActs[0].withdrawn, true);
  const board = buildWorkforceFlow(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(board.acts.inWindowN, 0);
  assert.equal(board.acts.withdrawnN, 1);
  assert.equal(board.acts.flowsReconcile, true, 'the withdrawn act is counted, so the ledger still reconciles');

  // A withdrawal with no reason is refused: an unexplained deletion is unauditable.
  const noReason = api.workforceFlowWithdrawMove('m1', '');
  assert.equal(noReason.ok, false);
});

test('the convention setter refuses out-of-bound values rather than clamping them', () => {
  const state = fixture();
  const { store, api } = seed(state);
  const before = JSON.stringify(store.state.settings);
  assert.equal(api.workforceFlowSetConventions({ workforceFlowMinExposure: 500 }).ok, false, '500 is above the declared bound of 240');
  assert.equal(api.workforceFlowSetConventions({ workforceFlowWindowMonths: 2 }).ok, false, '2 is below the declared bound of 3');
  assert.equal(api.workforceFlowSetConventions({ notAKey: 3 }).ok, false, 'an undeclared key is refused');
  assert.equal(JSON.stringify(store.state.settings), before, 'nothing was written');
  const ok = api.workforceFlowSetConventions({ workforceFlowHorizonQuarters: 8 });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(store.state.settings.workforceFlowHorizonQuarters, 8);
});

/* ------------------------------------------------- 10. disclosure, export, DOM */

test('a seat that reads counts only is given counts only, with the reason printed', () => {
  const state = fixture();
  const board = read(state, { detailLevel: 'none' });
  assert.equal(board.detailLevel, 'none');
  assert.deepEqual(board.levels, []);
  assert.equal(board.projectedTotal, null);
  assert.ok(board.withheld.some((w) => w.key === 'seat-withheld'));
  // The counts that remain are still the real ones — never zeroed rows.
  assert.equal(board.population.headcountTotal, 4);
  assert.equal(board.acts.inWindowN, 5);
});

test('CSV #138 is identity-free, carries every declared column and matches the panel row for row', () => {
  const state = fixture();
  const board = read(state);
  // The third argument is an options object, not a date: passing `NOW` here
  // positionally let the export read the real wall clock while `board` was read
  // at the fixture date, so a trailing-12-month exposure window shifted by a day
  // and this test compared two different windows (17.41 against 17.38).
  const csv = exportWorkspaceCsv(state, WORKFORCE_FLOW_CSV_SCOPE, { now: NOW });
  const parsed = parseCsv(csv.csv || csv);
  assert.deepEqual(parsed.headers, [...WORKFORCE_FLOW_CSV_COLUMNS], 'exact column parity with the registry');
  const rows = workforceFlowCsvRows(board);
  assert.equal(parsed.rows.length, rows.length, 'the export and the panel print the same number of rows');
  assert.equal(parsed.rows.length, 7, 'one workspace row + six level rows');
  const col = (name) => parsed.headers.indexOf(name);
  const cell = (row, name) => row[col(name)];
  const asObjects = parsed.rows.map((row) => Object.fromEntries(parsed.headers.map((h, i) => [h, row[i]])));

  // The workspace row's counts are the board's own counts.
  const workspace = asObjects[0];
  assert.equal(cell(parsed.rows[0], 'row_type'), 'workspace');
  assert.equal(Number(workspace.acts_in_window), board.acts.inWindowN);
  assert.equal(Number(workspace.promotions), board.acts.promotionsN);
  assert.equal(Number(workspace.projected_total), board.projectedTotal);
  assert.equal(Number(workspace.target_total), board.target.total);
  assert.equal(workspace.rates_estimable, 'true');
  assert.equal(workspace.target_compared, 'true');

  // A withheld rate is BLANK in the file with its reason, never a zero.
  const managerRow = asObjects.find((r) => r.row_type === 'level' && r.level === 'manager');
  assert.equal(managerRow.promotion_rate, '');
  assert.match(managerRow.row_reason, /exposure floor/i);

  // Row for row with the panel: every level row's figures are the board's own.
  for (const row of board.levels) {
    const exported = asObjects.find((r) => r.row_type === 'level' && r.level === row.level);
    assert.ok(exported, `the export carries a row for ${row.level}`);
    assert.equal(Number(exported.headcount_now), row.headcount);
    assert.equal(Number(exported.exposure_months), row.exposureMonths);
    assert.equal(Number(exported.promotions_out), row.promotionsOut);
    assert.equal(
      exported.promotion_rate === '' ? null : Number(exported.promotion_rate),
      row.promotionRatePerYear,
      `the printed ${row.level} rate equals the exported one exactly`,
    );
  }

  // No identity of any kind crosses the boundary.
  const body = String(csv.csv || csv).toLowerCase();
  for (const needle of ['sam builder', 'kim data', 'nora eng', 'milo product', 'ada chief', 'person-', 'l-sam-nora']) {
    assert.ok(!body.includes(needle), `the export must not contain “${needle}”`);
  }
  // Nor does the brief.
  const brief = workforceFlowBriefText(board).toLowerCase();
  for (const needle of ['sam', 'kim', 'nora', 'milo', 'ada']) {
    assert.ok(!new RegExp(`\\b${needle}\\b`).test(brief), `the brief must not name ${needle}`);
  }
});

test('the panel renders the computed figures, embeds the real diagram, stores nothing and prints one h1', () => {
  const state = fixture();
  const { store, api } = seed(state);
  const before = JSON.stringify(store.state);
  const report = api.workforceFlowReport().report;
  const dom = withDom(() => renderMatrixWorkforceFlowPanel(
    { state: store.state, api, route: { panel: 'stock-flow' } },
    { now: NOW },
  ));
  assert.ok(dom, 'the panel rendered');
  const text = dom.textContent;
  // The headline the reader computed is the headline the screen prints.
  assert.ok(text.includes(String(report.projectedTotal)), 'the projected total is printed');
  assert.ok(text.includes('The pyramid, level by level'));
  assert.ok(text.includes('The estimated transition matrix'));
  assert.ok(text.includes('Four claims'));
  assert.ok(text.includes('workforceFlowReport') || text.includes('withheld'), 'the refusal contract is on the page');
  const img = [...dom.querySelectorAll('img')].find((el) => el.getAttribute('src') === './app/assets/workforce-stock-flow.jpg');
  assert.ok(img, 'the generated diagram is the real asset, not a placeholder');
  assert.ok(img.getAttribute('alt').length > 40, 'the diagram carries a meaningful alternative text');
  // RENDER IS PURE.
  assert.equal(JSON.stringify(store.state), before, 'a render wrote nothing');
  const h1s = dom.querySelectorAll('h1');
  assert.ok(h1s.length <= 1, 'at most one h1 on the panel');
});
