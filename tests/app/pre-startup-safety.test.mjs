/**
 * tests/app/pre-startup-safety.test.mjs — ADR-0258 Pre-Startup Safety Review &
 * Commissioning Readiness Register (Schema v210, `#/pre-startup`, `RULE-PSR-01`,
 * CSV scope #195).
 *
 * Proves end-to-end:
 *   1. Additive Schema v210 & migration `209 → 210` (7 empty ledgers, zero inferred rows).
 *   2. Fail-closed schema loaders (counted drops on malformed/orphan/temporary-without-revert/
 *      Category-B-without-due-day/half-closed/pre-startup-restored rows) AND preservation
 *      of structurally readable governance breaches for audit.
 *   3. Exact integer calendar-day & minute arithmetic and strict decimal integer parsing.
 *   4. All TEN mutually exclusive derived states, chronological backfill detection, later
 *      gate rejection revoking earlier clearance, and Flixborough temporary-change expiry
 *      versus recorded physical restoration.
 *   5. Holmström & CCPS separation at the command door (proposer barred from unit holder,
 *      discipline gates, Category A closure, readiness and Startup Authorisation; item
 *      owner barred from Category A self-closure; operator barred from self-readiness).
 *   6. Factual startup recording: `psrAuthoriseStartup` refuses unmet gates before the fact,
 *      while `psrRecordStartup` records premature physical energisation as a permanent
 *      `breach-energised-unsafe` finding.
 *   7. Single-chain AND matrix correctness: dual-line person counted ONCE, expired secondary
 *      line refused, peer line refused, Startup Authorisation accepted ONLY from the computed
 *      `matrixJointApex` across all active lines, ambiguous matrix apex refused with printed
 *      reason, off-graph orphan hand flagged in `figuresComplete: false` while `balances: true`
 *      remains strictly separate, and rank 4/5 executive aggregate disclosure withholding
 *      names while keeping decider sightline for the joint apex.
 *   8. `RULE-PSR-01` (spine rule #167): all 6 conditions, joint-apex routing, proposer
 *      exclusion, opacity (zero leaked identifiers), idempotence, 4-per-commit cap with
 *      deferred count, human-answer respect, self-closure (incl. last-review deletion),
 *      identity-free marker when unresolvable, and `psrAutoPropagate` pause governance.
 *   9. CSV #195: exact equality with `buildPreStartupSafety`, zero leaked identities,
 *      privacy-floor blanking with reason, separate `balances` and `complete` columns.
 *  10. Persisted store reload equality, JSDOM rendered page cell-by-cell display == computed
 *      equality across all 5 tabs + live DOM modal submission + demo 10-state coverage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_SWITCH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import { MANIFEST_ROUTES } from '../../app/core/domain/disclosureManifests.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  PSR_CSV_COLUMNS,
  PSR_CSV_SCOPE,
  PSR_DISCIPLINE_KEYS,
  PSR_PAUSE_SWITCH,
  PSR_RULE_ID,
  PSR_SETTING_KEYS,
  PSR_STATE_KEYS,
  PSR_TRIGGER_KEYS,
} from '../../app/core/domain/psrRegistry.js';
import {
  instantMs,
  strictWholeInt,
  utcDayMs,
  wholeDaysBetween,
  wholeMinutesBetween,
} from '../../app/core/domain/psrMath.js';
import {
  normalizePsrAuthorisations,
  normalizePsrPunchItems,
  normalizePsrReadiness,
  normalizePsrReviews,
  normalizePsrSettings,
  normalizePsrSignoffs,
  normalizePsrStartups,
} from '../../app/core/domain/psrSchema.js';
import {
  buildPreStartupSafety,
  psrAttentionCount,
  psrSignals,
} from '../../app/core/domain/psrSafety.js';
import { indexPsrAsks, psrRule } from '../../app/core/domain/psrRules.js';
import { psrCsvRows } from '../../app/core/domain/psrReport.js';
import { renderPreStartup } from '../../app/views/preStartup.js';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const T0 = NOW.toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = (offsetDays) => new Date(NOW.getTime() + Math.round(offsetDays * 86_400_000)).toISOString();

const PSR_KEYS = [
  'psrReviews',
  'psrPunchItems',
  'psrSignoffs',
  'psrReadiness',
  'psrAuthorisations',
  'psrStartups',
  'psrMarkers',
];

function person(id, name, level, managerId) {
  return {
    id,
    name,
    role: `${level} role`,
    level,
    managerId,
    status: 'active',
    startDate: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function rline(id, personId, managerId, kind = 'functional', opts = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    shareH: null,
    rights: [],
    fromISO: opts.fromISO || '2024-01-01T00:00:00.000Z',
    toISO: opts.toISO ?? null,
    declaredAt: '2024-01-01T00:00:00.000Z',
    note: '',
    status: opts.status || 'active',
    history: [],
  };
}

/**
 * Rich single-chain + matrix fixture:
 *   leader (chief, rank 5)
 *     └── vp1 Cleo VP (vp, rank 4)
 *          ├── dana Dana Eng-Dir (director, rank 3)
 *          │    └── mei Mei Eng-Mgr (manager, rank 2)
 *          │         └── jordan Jordan Proposer (ic, rank 1)
 *          └── omar Omar Ops-Dir (director, rank 3)
 *               └── priya Priya Ops-Mgr (manager, rank 2)
 *                    ├── samuel Samuel Dual-Line (ic, rank 1; ALSO cross-functional to mei!)
 *                    └── freya Freya Operator (ic, rank 1)
 *          └── nina Nina Peer-Dir (director, rank 3) — unrelated peer branch
 *               └── liam Liam Peer-Mgr (manager, rank 2)
 */
function matrixFixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('vp1', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Engineering', 'director', 'vp1'),
    person('omar', 'Omar Operations', 'director', 'vp1'),
    person('nina', 'Nina PeerDir', 'director', 'vp1'),
    person('mei', 'Mei EngManager', 'manager', 'dana'),
    person('priya', 'Priya OpsManager', 'manager', 'omar'),
    person('liam', 'Liam PeerManager', 'manager', 'nina'),
    person('jordan', 'Jordan ProjectEng', 'lead', 'mei'),
    person('samuel', 'Samuel UnitLead', 'lead', 'priya'),
    person('freya', 'Freya ShiftOp', 'lead', 'priya'),
    person('kyle', 'Kyle PeerOp', 'lead', 'liam'),
    person('tara', 'Tara EngTech', 'ic', 'jordan'),
    person('ben', 'Ben UnitTech', 'ic', 'samuel'),
    person('owen', 'Owen ShiftTech', 'ic', 'freya'),
    person('zoe', 'Zoe PeerTech', 'ic', 'kyle'),
  ];
  raw.reportingLines = [
    rline('rl-samuel-mei', 'samuel', 'mei', 'project'),
    // Expired secondary line from freya to liam — MUST grant ZERO reach!
    rline('rl-freya-liam-exp', 'freya', 'liam', 'project', {
      fromISO: '2025-01-01T00:00:00.000Z',
      toISO: '2026-06-01T00:00:00.000Z',
      status: 'ended',
    }),
  ];
  Object.assign(raw, overrides);
  return raw;
}

const baseReview = (overrides = {}) => ({
  id: 'psr-1',
  reviewRef: 'PSSR-RX-401',
  unitRef: 'Reactor R-401 high-level trip',
  triggerKind: 'modification',
  changeBasisRef: 'MOC-2026-401 & HAZOP-19: replace LSHH-401 guided-wave radar and verify XV-401 trip isolation time.',
  proposerId: 'jordan',
  unitHolderId: 'samuel',
  requiredDisciplines: ['engineering', 'operations'],
  affectedOperatorIds: ['freya'],
  plannedStartDay: day(2),
  revertByDay: null,
  openedById: 'vp1',
  openedAt: stamp(-5),
  openedDay: day(-5),
  createdAt: stamp(-5),
  updatedAt: stamp(-5),
  ...overrides,
});

function harness(raw) {
  const normalized = normalizeState(raw, { now: NOW }).state;
  const backing = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, api, storage, idFactory };
}

function setSeat(store, seatId) {
  store.update(
    (draft) => { draft.settings.activeSeatId = seatId; },
    { type: 'test.seat', entity: 'workspace', entityId: seatId || 'none', summary: 'switch seat' },
  );
}

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
    url: 'http://localhost/#/pre-startup',
  });
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'CustomEvent', 'Event', 'navigator'];
  const saved = new Map();
  for (const k of keys) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of keys) {
    Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
  }
  try {
    return fn(dom);
  } finally {
    for (const [k, desc] of saved.entries()) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
    dom.window.close();
  }
}

/* ------------------------------------------- 1. schema, spine & registration */

test('schema v210 is additive, migration 209 → 210 invents zero records, and spine #167 / CSV #195 / manifest / pause switch are wired', () => {
  assert.equal(SCHEMA_VERSION, 214, 'ADR-0262 (secondment & assignment return) is the current head; prior registers ride along');
  const empty = createEmptyState(T0);
  for (const key of PSR_KEYS) {
    assert.ok(COLLECTIONS.includes(key), `${key} declared in COLLECTIONS`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  assert.equal(empty.settings.psrAutoPropagate, true);
  assert.equal(empty.settings.psrPrivacyFloor, 3);
  assert.equal(empty.settings.psrRevertHorizonDays, 14);
  for (const forbidden of ['psrDefaultDisciplines', 'psrDefaultRevertDays', 'psrAutoRestore', 'psrDefaultDueDays']) {
    assert.equal(forbidden in empty.settings, false, `${forbidden} must never exist as a silent default`);
  }

  // Upgrade from v209 carrying live permits and stop-work rows manufactures ZERO reviews.
  const v209 = {
    ...createEmptyState(T0),
    schemaVersion: 209,
    ptwPermits: [{ id: 'ptw-keep' }],
    workStops: [{ id: 'ws-keep' }],
  };
  for (const key of PSR_KEYS) delete v209[key];
  const { raw, applied } = migrate(v209);
  assert.deepEqual(applied, ['209 → 210', '210 → 211', '211 → 212', '212 → 213', '213 → 214']);
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  for (const key of PSR_KEYS) assert.deepEqual(raw[key], []);
  assert.equal(raw.ptwPermits[0].id, 'ptw-keep');

  // Spine #167, contract, pause switch, disclosure manifest, CSV #195, method diagram asset.
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 170);
  assert.equal(PROPAGATION_CONTRACTS.length, 170);
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === psrRule);
  assert.ok(contract);
  assert.equal(contract.module, 'psrRules.js');
  assert.deepEqual([...contract.writes].sort(), ['delegations', 'links', 'psrMarkers']);
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(PSR_PAUSE_SWITCH));
  assert.equal(PAUSE_PERMIT_SWITCH_RULES[PSR_PAUSE_SWITCH], 'psrRules.js');
  assert.ok(MANIFEST_ROUTES.includes('pre-startup'));
  assert.equal(CSV_EXPORTS.length, 198, 'ADR-0262 (secondment, #198) is the current tail');
  assert.equal(CSV_EXPORTS[194].key, PSR_CSV_SCOPE, 'CSV #195 stays at its own index, and a later scope does not move it');
  assert.equal(CSV_EXPORTS[195].key, 'modern-slavery-due-diligence', 'ADR-0260 appended #196 after this scope');
  assert.equal(CSV_EXPORTS[196].key, 'performance-calibration', 'ADR-0261 appended #197');
  assert.equal(CSV_EXPORTS[197].key, 'secondment', 'ADR-0262 appended #198');

  const assetPath = path.resolve('app/assets/pre-startup-safety-method.jpg');
  assert.ok(fs.existsSync(assetPath), 'real method illustration asset present');
  assert.ok(fs.statSync(assetPath).size > 10_000, 'asset is a genuine non-empty image');
});

/* ------------------------------------------- 2. exact math & fail-closed load */

test('psrMath rejects blanks, booleans, floats, hex and invalid calendar rollovers; computes exact UTC days and minutes', () => {
  for (const bad of ['', '  ', null, undefined, true, false, [], {}, -1, 3.5, NaN, Infinity, '0x10', '1e2', '03', '3.0']) {
    assert.equal(strictWholeInt(bad), null, `strictWholeInt rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(strictWholeInt(0), 0);
  assert.equal(strictWholeInt('14'), 14);
  assert.equal(utcDayMs('2026-02-29'), null, 'non-leap Feb 29 refused');
  assert.equal(utcDayMs('2026-13-01'), null);
  assert.equal(instantMs(1700000000000), null, 'bare epoch integer refused');
  assert.equal(instantMs('2026-11-18'), null, 'date-only string refused as instant');
  assert.equal(wholeDaysBetween('2026-11-18', '2026-11-25'), 7);
  assert.equal(wholeDaysBetween('2026-11-18', '2026-11-12'), -6);
  assert.equal(wholeMinutesBetween('2026-11-18T10:00:00Z', '2026-11-18T10:04:59Z'), 4, 'floors rather than rounding 59s up');

  const norm = normalizePsrSettings({ psrPrivacyFloor: 'bad', psrRevertHorizonDays: 999, psrAutoPropagate: false });
  assert.deepEqual(norm, { psrAutoPropagate: false, psrPrivacyFloor: 3, psrRevertHorizonDays: 14 });
});

test('fail-closed schema loaders drop malformed, partial-array, un-dated Cat B, un-reverted temporary and orphan rows with counted warnings', () => {
  const warnings = [];
  const valid = baseReview();
  const reviews = normalizePsrReviews([
    valid,
    baseReview({ id: 'dup-ref' }), // duplicate reviewRef
    baseReview({ id: 'no-basis', reviewRef: 'R-2', changeBasisRef: 'too short' }),
    baseReview({ id: 'bad-disc', reviewRef: 'R-3', requiredDisciplines: ['engineering', 'magic-gate'] }), // refused whole!
    baseReview({ id: 'bad-ops', reviewRef: 'R-4', affectedOperatorIds: ['freya', ''] }), // refused whole!
    baseReview({ id: 'temp-no-revert', reviewRef: 'R-5', triggerKind: 'temporary-change', revertByDay: null }), // Flixborough!
    baseReview({ id: 'temp-early-revert', reviewRef: 'R-6', triggerKind: 'temporary-change', plannedStartDay: day(5), revertByDay: day(2) }),
    baseReview({ id: 'perm-with-revert', reviewRef: 'R-7', triggerKind: 'modification', revertByDay: day(10) }),
    baseReview({ id: 'temp-ok', reviewRef: 'R-8', triggerKind: 'temporary-change', plannedStartDay: day(-5), revertByDay: day(5) }),
  ], warnings);
  assert.equal(reviews.length, 2);
  assert.ok(warnings.some((w) => w.includes('7 pre-startup review row(s)')));

  const punchW = [];
  const punch = normalizePsrPunchItems([
    // Cat B without dueDay -> dropped
    { id: 'p-bad1', reviewId: 'psr-1', itemRef: 'PB-1', category: 'post-startup', discipline: 'safety', finding: 'Missing nameplate and line marker on isolation valve.', ownerId: 'samuel', dueDay: null, recordedById: 'mei', recordedAt: stamp(-3), recordedDay: day(-3) },
    // Half-closed Cat A -> dropped
    { id: 'p-bad2', reviewId: 'psr-1', itemRef: 'PA-1', category: 'pre-startup', discipline: 'safety', finding: 'Trip test certificate missing from loop folder at walkdown.', ownerId: 'samuel', recordedById: 'mei', recordedAt: stamp(-3), recordedDay: day(-3), closedDay: day(-2) },
    // Orphan -> dropped
    { id: 'p-orph', reviewId: 'psr-missing', itemRef: 'PA-9', category: 'pre-startup', discipline: 'safety', finding: 'Valid length finding pointing at a missing review record.', ownerId: 'samuel', recordedById: 'mei', recordedAt: stamp(-3), recordedDay: day(-3) },
    // Self-closed Cat A -> KEPT as breach evidence so reader disqualifies & flags it!
    {
      id: 'p-self', reviewId: 'psr-1', itemRef: 'PA-SELF', category: 'pre-startup', discipline: 'safety',
      finding: 'Relief valve block valve car-seal missing on discharge riser.', ownerId: 'samuel',
      recordedById: 'mei', recordedAt: stamp(-3), recordedDay: day(-3),
      closedDay: day(-2), closedAt: stamp(-2), closedById: 'samuel', closureEvidenceRef: 'SELF-01',
      closureBasis: 'Owner signed own Category A blocker without independent witness.',
    },
  ], reviews, punchW);
  assert.equal(punch.length, 1);
  assert.equal(punch[0].id, 'p-self');
  assert.equal(punchW.length, 2);

  // Signoff on undeclared discipline dropped; readiness on unlisted operator dropped; restoration on permanent review dropped.
  assert.equal(normalizePsrSignoffs([{
    id: 's1', reviewId: 'psr-1', discipline: 'quality', verdict: 'cleared',
    evidenceRef: 'EV-01', basisRef: 'Quality was not declared on psr-1 so this row drops.',
    signedById: 'mei', signedAt: stamp(-2), signedDay: day(-2),
  }], reviews).length, 0);
  assert.equal(normalizePsrReadiness([{
    id: 'rd1', reviewId: 'psr-1', operatorId: 'samuel', procedureRef: 'SOP-1', evidenceRef: 'TRN-1',
    attestedDay: day(-2), attestedById: 'priya', attestedAt: stamp(-2),
  }], reviews).length, 0);
  assert.equal(normalizePsrAuthorisations([{
    id: 'au1', reviewId: 'psr-missing', authorisedById: 'vp1', authorisedAt: stamp(-1),
    authorisedDay: day(-1), permitClearanceRef: 'PTW-1', basisRef: 'Valid prose length on an orphan authorisation record.',
  }], reviews).length, 0);
  assert.equal(normalizePsrStartups([{
    id: 'st-bad', reviewId: 'psr-1', energisedAt: stamp(-2), energisedDay: day(-2), energisedById: 'priya',
    startupLogRef: 'LOG-1', basisRef: 'Permanent modification wrongly carrying restoration fields.',
    restoredAt: stamp(-1), restoredDay: day(-1), restoredById: 'priya', restorationRef: 'RST-1',
    restorationBasis: 'Permanent modifications cannot carry temporary restoration fields.',
  }], reviews).length, 0);
});

/* ------------------------------------------- 3. lifecycle, gates & separation */

test('full lifecycle + Holmström proposer/owner separation + gate rejection override + matrix joint-apex authorisation + Flixborough restoration', () => {
  const { store, api } = harness(matrixFixture());

  // Rank 1 frontline cannot open a review or change conventions.
  setSeat(store, 'freya');
  assert.equal(api.psrOpenReview({}).ok, false);
  assert.equal(api.psrSetConventions({ psrPrivacyFloor: 4 }).ok, false);

  // Rank 2 peer manager (liam) cannot open a review over freya despite expired line!
  setSeat(store, 'liam');
  const expiredTry = api.psrOpenReview({
    reviewRef: 'PSSR-EXP',
    unitRef: 'Unit U-9',
    triggerKind: 'modification',
    changeBasisRef: 'MOC-2026-999: attempt to commit operators across an expired reporting line.',
    proposerId: 'liam',
    unitHolderId: 'freya',
    requiredDisciplines: ['operations'],
    affectedOperatorIds: ['freya'],
    plannedStartDay: day(1),
  });
  assert.equal(expiredTry.ok, false);
  // Also prove psrOpenReview's own interior line-reach gate returns 'no-reach' directly.
  assert.equal(createApi(store, { now: () => NOW }).psrOpenReview({
    reviewRef: 'PSSR-EXP',
    unitRef: 'Unit U-9',
    triggerKind: 'modification',
    changeBasisRef: 'MOC-2026-999: attempt to commit operators across an expired reporting line.',
    proposerId: 'liam',
    unitHolderId: 'freya',
    requiredDisciplines: ['operations'],
    affectedOperatorIds: ['freya'],
    plannedStartDay: day(1),
  }).reason, 'no-reach');

  // VP (vp1) holds both Dana's engineering line and Omar's operations line — opens a temporary modification review.
  setSeat(store, 'vp1');
  // Refuses temporary-change without revertByDay.
  assert.equal(api.psrOpenReview({
    reviewRef: 'PSSR-TMP-1',
    unitRef: 'Column C-101 temporary overhead bypass',
    triggerKind: 'temporary-change',
    changeBasisRef: 'MOC-TEMP-101 & HAZOP-55: temporary overhead bypass while reflux drum level bridle is replaced.',
    proposerId: 'jordan',
    unitHolderId: 'samuel',
    requiredDisciplines: ['engineering', 'operations'],
    affectedOperatorIds: ['freya'],
    plannedStartDay: day(0),
  }).reason, 'missing-revert-day');

  // Refuses proposer === unitHolder.
  assert.equal(api.psrOpenReview({
    reviewRef: 'PSSR-SAME',
    unitRef: 'Column C-101',
    triggerKind: 'modification',
    changeBasisRef: 'MOC-2026-102: proposer trying to also act as receiving operating unit holder.',
    proposerId: 'samuel',
    unitHolderId: 'samuel',
    requiredDisciplines: ['operations'],
    affectedOperatorIds: ['freya'],
    plannedStartDay: day(0),
  }).reason, 'proposer-is-unit-holder');

  const opened = api.psrOpenReview({
    reviewRef: 'PSSR-TMP-1',
    unitRef: 'Column C-101 temporary overhead bypass',
    triggerKind: 'temporary-change',
    changeBasisRef: 'MOC-TEMP-101 & HAZOP-55: temporary overhead bypass while reflux drum level bridle is replaced.',
    proposerId: 'jordan',
    unitHolderId: 'samuel',
    requiredDisciplines: ['engineering', 'operations'],
    affectedOperatorIds: ['freya'],
    plannedStartDay: day(0),
    revertByDay: day(7),
  });
  assert.equal(opened.ok, true);
  const reviewId = opened.id;

  // Initially awaiting-verification (0 Cat A, 2 unsigned gates, 1 unbriefed operator).
  const checkState = () => buildPreStartupSafety(store.state, { now: NOW }).rows.find((r) => r.review.id === reviewId);
  assert.equal(checkState().state.key, 'awaiting-verification');

  // Log a Category A blocker (owner = samuel) and verify Cat B without dueDay is refused.
  setSeat(store, 'mei');
  assert.equal(api.psrRecordPunchItem({
    reviewId, itemRef: 'PB-NODUE', category: 'post-startup', discipline: 'operations',
    finding: 'Install permanent weatherproof tag holder on overhead bypass valve.', ownerId: 'samuel',
  }).reason, 'missing-due-day');

  const catA = api.psrRecordPunchItem({
    reviewId, itemRef: 'PA-01', category: 'pre-startup', discipline: 'engineering',
    finding: 'Hydro-test temporary bypass spool to 24 barg and verify spectacle blind tag.',
    ownerId: 'samuel',
  });
  assert.equal(catA.ok, true);
  assert.equal(checkState().state.key, 'blocked-pre-startup');

  // Proposer (jordan) CANNOT close Cat A, CANNOT sign any gate, CANNOT attest operator readiness!
  setSeat(store, 'jordan');
  assert.equal(api.psrClosePunchItem({
    reviewId, itemId: catA.id, closureEvidenceRef: 'HT-01',
    closureBasis: 'Proposer attempting to verify closure of own project Category A blocker.',
  }).reason, 'proposer-closure');
  assert.equal(api.psrRecordSignoff({
    reviewId, discipline: 'engineering', verdict: 'cleared', evidenceRef: 'WD-01',
    basisRef: 'Proposer attempting to clear engineering discipline gate on own change.',
  }).reason, 'proposer-signoff');
  assert.equal(createApi(store, { now: () => NOW }).psrAttestReadiness({
    reviewId, operatorId: 'freya', procedureRef: 'TOI-101', evidenceRef: 'TRN-01',
  }).reason, 'proposer-readiness');
  assert.equal(api.psrAttestReadiness({
    reviewId, operatorId: 'freya', procedureRef: 'TOI-101', evidenceRef: 'TRN-01',
  }).ok, false, 'gateway also refuses cross-span operator reference');

  // Owner (samuel) CANNOT self-close own Category A blocker!
  setSeat(store, 'samuel');
  assert.equal(api.psrClosePunchItem({
    reviewId, itemId: catA.id, closureEvidenceRef: 'HT-01',
    closureBasis: 'Owner attempting to self-close own Category A blocker without witness.',
  }).reason, 'self-closure');

  // Operator (freya) CANNOT self-attest readiness!
  setSeat(store, 'freya');
  assert.equal(api.psrAttestReadiness({
    reviewId, operatorId: 'freya', procedureRef: 'TOI-101', evidenceRef: 'TRN-01',
  }).reason, 'self-readiness');

  // Independent engineering sign-off by Mei (cleared), then rejected by Dana -> state flips to gate-rejected!
  setSeat(store, 'mei');
  assert.equal(api.psrRecordSignoff({
    reviewId, discipline: 'engineering', verdict: 'cleared', evidenceRef: 'WD-ENG-1',
    basisRef: 'Initial walkdown matched isometric drawing revision 3 and flange torque log.',
  }).ok, true);
  setSeat(store, 'dana');
  assert.equal(api.psrRecordSignoff({
    reviewId, discipline: 'engineering', verdict: 'rejected', evidenceRef: 'WD-ENG-2',
    basisRef: 'Hold startup: gasket spiral-wound metallurgy stamp not visible on north flange.',
  }).ok, true);
  assert.equal(checkState().state.key, 'gate-rejected');

  // Startup authorisation refused while gate rejected.
  setSeat(store, 'vp1');
  assert.equal(api.psrAuthoriseStartup({
    reviewId, permitClearanceRef: 'PTW-CLR-1',
    basisRef: 'Attempted authorisation while engineering gate stands rejected.',
  }).reason, 'gate-rejected');

  // Mei independently verifies Cat A closed; Dana re-verifies engineering cleared; Priya clears operations & briefs Freya.
  setSeat(store, 'mei');
  assert.equal(api.psrClosePunchItem({
    reviewId, itemId: catA.id, closureEvidenceRef: 'HT-CERT-24B',
    closureBasis: 'Witnessed 24 barg hydro-test for 60 minutes with zero drop and verified blind tag.',
  }).ok, true);
  setSeat(store, 'dana');
  assert.equal(api.psrRecordSignoff({
    reviewId, discipline: 'engineering', verdict: 'cleared', evidenceRef: 'WD-ENG-3',
    basisRef: 'Verified 316L/graphite spiral-wound gasket tag on north flange and re-torqued bolts.',
  }).ok, true);
  setSeat(store, 'priya');
  assert.equal(api.psrRecordSignoff({
    reviewId, discipline: 'operations', verdict: 'cleared', evidenceRef: 'WD-OPS-1',
    basisRef: 'Temporary operating instruction TOI-101 staged and bypass valves car-sealed ready.',
  }).ok, true);
  assert.equal(api.psrAttestReadiness({
    reviewId, operatorId: 'freya', procedureRef: 'TOI-101-r1', evidenceRef: 'TRN-FREYA-101',
  }).ok, true);

  // Now state MUST be ready-for-authorisation, and computed matrixJointApex MUST be vp1 (above both Dana and Omar lines)!
  const ready = checkState();
  assert.equal(ready.state.key, 'ready-for-authorisation');
  assert.equal(ready.apexId, 'vp1');

  // Single-line directors (Dana, Omar) and managers (Mei, Priya) are REFUSED Startup Authorisation!
  for (const singleLine of ['mei', 'priya', 'dana', 'omar']) {
    setSeat(store, singleLine);
    const refused = api.psrAuthoriseStartup({
      reviewId, permitClearanceRef: 'PTW-CLR-1',
      basisRef: 'Single-line leader trying to authorise startup across another reporting line.',
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'not-joint-apex', `${singleLine} refused as non-joint-apex`);
  }

  // Joint apex (vp1) authorises startup -> state becomes authorised-awaiting-startup!
  setSeat(store, 'vp1');
  const auth = api.psrAuthoriseStartup({
    reviewId, permitClearanceRef: 'PTW-CLR-101',
    basisRef: 'Verified all Cat A closures, independent engineering/operations clearances, briefing and LOTO clearance.',
  });
  assert.equal(auth.ok, true);
  assert.equal(checkState().state.key, 'authorised-awaiting-startup');
  // Duplicate valid authorisation refused.
  assert.equal(api.psrAuthoriseStartup({
    reviewId, permitClearanceRef: 'PTW-CLR-102',
    basisRef: 'Duplicate authorisation attempt when valid authorisation already stands.',
  }).reason, 'authorisation-duplicate');

  // Priya logs physical startup -> temporary modification inside 7-day revert window -> live-conditions-open + temporaryExpiring!
  setSeat(store, 'priya');
  const started = api.psrRecordStartup({
    reviewId,
    energisedAt: T0,
    startupLogRef: 'DCR-C101-1200',
    basisRef: 'Overhead vapour lined up through temporary bypass at 12:00 UTC under TOI-101-r1.',
  });
  assert.equal(started.ok, true);
  assert.equal(started.safeStartup, true);
  assert.equal(checkState().state.key, 'live-conditions-open');
  assert.equal(checkState().temporaryExpiring, true);
  assert.equal(checkState().daysToRevert, 7);

  // Advance calendar 10 days WITHOUT recording physical restoration -> temporary-expired-live (3 days overdue)!
  const futureReport = buildPreStartupSafety(store.state, { now: new Date(NOW.getTime() + 10 * 86_400_000) });
  const expiredRow = futureReport.rows.find((r) => r.review.id === reviewId);
  assert.equal(expiredRow.state.key, 'temporary-expired-live');
  assert.equal(expiredRow.revertOverdueDays, 3);

  // Record physical restoration -> state transitions to closed-verified even when read 10 days later!
  const restored = api.psrRecordRestoration({
    reviewId,
    restoredAt: T0,
    restorationRef: 'RST-C101-BASE-01',
    restorationBasis: 'Temporary bypass spool removed, flanges blinded to baseline P&ID and permanent bridle commissioned.',
  });
  assert.equal(restored.ok, true);
  assert.equal(checkState().state.key, 'closed-verified');
  const postFuture = buildPreStartupSafety(store.state, { now: new Date(NOW.getTime() + 10 * 86_400_000) });
  assert.equal(postFuture.rows.find((r) => r.review.id === reviewId).state.key, 'closed-verified');
});

/* ------------------------------------------- 4. premature startup breach */

test('factual premature physical energisation is accepted on the startup log as a permanent breach-energised-unsafe', () => {
  const { store, api } = harness(matrixFixture({ psrReviews: [baseReview()] }));
  setSeat(store, 'priya');
  const res = api.psrRecordStartup({
    reviewId: 'psr-1',
    energisedAt: stamp(-0.1),
    startupLogRef: 'DCR-UNAUTH-77',
    basisRef: 'Unit placed online during night shift without joint-apex authorisation or discipline clearances.',
  });
  assert.equal(res.ok, true);
  assert.equal(res.safeStartup, false);
  assert.equal(res.stateKey, 'breach-energised-unsafe');
  assert.ok(res.breaches.includes('energised-without-authorisation'));
  assert.ok(res.breaches.includes('energised-with-missing-disciplines'));
  assert.ok(res.breaches.includes('energised-with-unbriefed-operators'));

  // Backfilling authorisation or discipline sign-offs after startup is refused at the command door.
  assert.equal(api.psrRecordSignoff({
    reviewId: 'psr-1', discipline: 'operations', verdict: 'cleared',
    evidenceRef: 'LATE-1', basisRef: 'Attempting to backfill a pre-startup gate after energisation.',
  }).reason, 'already-started');
  setSeat(store, 'vp1');
  assert.equal(api.psrAuthoriseStartup({
    reviewId: 'psr-1', permitClearanceRef: 'LATE-PTW',
    basisRef: 'Attempting to backfill Startup Authorisation after physical energisation.',
  }).reason, 'already-started');
});

/* ------------------------------------------- 5. matrix, reconciliation & seats */

test('matrix integrity: single identity count across dual lines, peer isolation, ambiguous apex refusal, separate balances vs complete, and rank 4/5 disclosure', () => {
  const { store, api } = harness(matrixFixture({
    psrReviews: [baseReview()],
    psrSignoffs: [
      { id: 's-e', reviewId: 'psr-1', discipline: 'engineering', verdict: 'cleared', evidenceRef: 'EV-ENG-1', basisRef: 'Engineering verified all drawings and relief calculations.', signedById: 'mei', signedAt: stamp(-2), signedDay: day(-2), createdAt: stamp(-2) },
      { id: 's-o', reviewId: 'psr-1', discipline: 'operations', verdict: 'cleared', evidenceRef: 'EV-OPS-1', basisRef: 'Operations verified line-up, SOP and valve tags in field.', signedById: 'priya', signedAt: stamp(-2), signedDay: day(-2), createdAt: stamp(-2) },
    ],
    psrReadiness: [
      { id: 'r-f', reviewId: 'psr-1', operatorId: 'freya', procedureRef: 'SOP-401', evidenceRef: 'TRN-401', attestedDay: day(-2), attestedById: 'priya', attestedAt: stamp(-2), createdAt: stamp(-2) },
    ],
  }));

  // Whole register: Samuel sits on TWO active lines (Priya + Mei), yet distinct people count is 5 (jordan, samuel, freya, mei, priya) — NEVER 6!
  const full = buildPreStartupSafety(store.state, { now: NOW });
  assert.equal(full.totals.reviews, 1);
  assert.equal(full.totals.peopleN, 5, 'dual-line Samuel counted exactly once');
  assert.equal(full.balances, true);
  assert.equal(full.figuresComplete, true);
  // Both Mei's line and Priya's line see Samuel once each in lineRows, and sum(lineRows.reviewsN) > totals.reviews without corrupting totals.reviews.
  const meiLine = full.lineRows.find((l) => l.managerId === 'mei');
  const priyaLine = full.lineRows.find((l) => l.managerId === 'priya');
  assert.equal(meiLine.reviewsN, 1);
  assert.equal(priyaLine.reviewsN, 1);
  assert.ok(meiLine.peopleIds.includes('samuel') && priyaLine.peopleIds.includes('samuel'));

  // Peer director Nina (holding Liam, with only an EXPIRED line to Freya) sees 0 reviews.
  setSeat(store, 'nina');
  const peerReport = api.psrReport();
  assert.equal(peerReport.totals.reviews, 0);
  assert.equal(peerReport.disclosure.outOfReachN, 1);

  // Rank 1 Freya sees full detail on her review (1 review).
  setSeat(store, 'freya');
  const r1 = api.psrReport();
  assert.equal(r1.detailed, true);
  assert.equal(r1.rows.length, 1);

  // Rank 3 Dana (engineering director) sees full detail through Mei/Samuel.
  setSeat(store, 'dana');
  const r3 = api.psrReport();
  assert.equal(r3.detailed, true);
  assert.equal(r3.rows.length, 1);

  // Rank 4 VP (vp1) receives aggregate counts ONLY (rows withheld), PLUS exact apexActionableRefs because vp1 IS the joint startup apex!
  setSeat(store, 'vp1');
  const r4 = api.psrReport();
  assert.equal(r4.detailed, false);
  assert.equal(r4.disclosure.level, 'aggregate');
  assert.equal(r4.rows.length, 0, 'individual operational rows withheld above rank 3');
  assert.equal(r4.lineRows.length, 0, 'manager line rows withheld above rank 3');
  assert.equal(r4.totals.reviews, 1);
  assert.equal(r4.totals.readyForAuth, 1);
  assert.equal(r4.apexActionableRefs.length, 1);
  assert.equal(r4.apexActionableRefs[0].reviewId, 'psr-1');

  // Separate `balances` vs `figuresComplete`: off-graph orphan operator keeps balances === true while figuresComplete === false!
  const orphanState = normalizeState(matrixFixture({
    psrReviews: [baseReview({ id: 'psr-orph', reviewRef: 'PSSR-ORPH', affectedOperatorIds: ['ghost-operator'] })],
  }), { now: NOW }).state;
  const orphanReport = buildPreStartupSafety(orphanState, { now: NOW });
  assert.equal(orphanReport.balances, true, 'partition arithmetic still balances exactly');
  assert.equal(orphanReport.figuresComplete, false, 'orphan hand makes figuresComplete false with printed reason');
  assert.equal(orphanReport.totals.orphanHandsN, 1);
  assert.ok(orphanReport.incompleteReasons.some((msg) => msg.includes('not on the live reporting graph')));

  // True matrix diamond ambiguity: two incomparable common directors (`dana` and `omar`) BOTH holding BOTH `mei` and `priya`!
  const ambigRaw = matrixFixture({
    reportingLines: [
      rline('rl-mei-omar', 'mei', 'omar', 'project'),
      rline('rl-priya-dana', 'priya', 'dana', 'project'),
    ],
    psrReviews: [baseReview({ id: 'psr-amb', reviewRef: 'PSSR-AMB' })],
    psrSignoffs: [
      { id: 'sa-1', reviewId: 'psr-amb', discipline: 'engineering', verdict: 'cleared', evidenceRef: 'EV-ENG-2', basisRef: 'Verified engineering package against design standard.', signedById: 'tara', signedAt: stamp(-2), signedDay: day(-2), createdAt: stamp(-2) },
      { id: 'sa-2', reviewId: 'psr-amb', discipline: 'operations', verdict: 'cleared', evidenceRef: 'EV-OPS-2', basisRef: 'Verified operating procedures and field tag line-up.', signedById: 'samuel', signedAt: stamp(-2), signedDay: day(-2), createdAt: stamp(-2) },
    ],
    psrReadiness: [
      { id: 'ra-1', reviewId: 'psr-amb', operatorId: 'freya', procedureRef: 'SOP-1', evidenceRef: 'TRN-1', attestedDay: day(-2), attestedById: 'samuel', attestedAt: stamp(-2), createdAt: stamp(-2) },
    ],
  });
  const ambigH = harness(ambigRaw);
  const ambigRep = buildPreStartupSafety(ambigH.store.state, { now: NOW });
  assert.equal(ambigRep.rows[0].apexAmbiguous, true, 'complete bipartite diamond flagged ambiguous');
  assert.equal(ambigRep.rows[0].apexId, null, 'no single manager silently chosen');
  assert.equal(ambigRep.figuresComplete, false);
  setSeat(ambigH.store, 'dana');
  assert.equal(ambigH.api.psrAuthoriseStartup({
    reviewId: 'psr-amb', permitClearanceRef: 'PTW-1',
    basisRef: 'Attempting authorisation under an ambiguous two-apex matrix structure.',
  }).reason, 'apex-ambiguous');
});

/* ------------------------------------------- 6. conventions strict parsing */

test('psrSetConventions rejects blanks, floats, booleans, unknown keys and out-of-bounds integers without clamping', () => {
  const { store, api } = harness(matrixFixture());
  setSeat(store, 'vp1');
  for (const bad of [
    {},
    { bogus: 1 },
    { psrPrivacyFloor: 1 },
    { psrPrivacyFloor: 21 },
    { psrPrivacyFloor: 4.5 },
    { psrPrivacyFloor: '' },
    { psrPrivacyFloor: true },
    { psrRevertHorizonDays: 0 },
    { psrRevertHorizonDays: 91 },
    { psrRevertHorizonDays: '14.2' },
    { psrAutoPropagate: 'false' },
  ]) {
    assert.equal(api.psrSetConventions(bad).ok, false, `rejected ${JSON.stringify(bad)}`);
  }
  const ok = api.psrSetConventions({ psrPrivacyFloor: '5', psrRevertHorizonDays: 21, psrAutoPropagate: false });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.conventions, { psrPrivacyFloor: 5, psrRevertHorizonDays: 21, psrAutoPropagate: false });
});

/* ------------------------------------------- 7. RULE-PSR-01 spine discipline */

test('RULE-PSR-01: joint-apex asks, zero leaked identities, idempotence, 4-per-commit cap, human-answer respect, self-close, marker & pause switch', () => {
  // Pause switch silences both post-commit propagation and explicit scan.
  const pausedRaw = matrixFixture();
  pausedRaw.settings.psrAutoPropagate = false;
  pausedRaw.psrReviews = [baseReview({ id: 'psr-p1', reviewRef: 'SECRET-REF-99', unitRef: 'SECRET-UNIT-99' })];
  pausedRaw.psrStartups = [{
    id: 'st-p1', reviewId: 'psr-p1', energisedAt: stamp(-1), energisedDay: day(-1), energisedById: 'priya',
    startupLogRef: 'LOG-P1', basisRef: 'Energised without authorisation while rule is paused.',
    restoredAt: null, restoredDay: null, restoredById: null, restorationRef: null, restorationBasis: null,
    createdAt: stamp(-1), updatedAt: stamp(-1),
  }];
  const pausedH = harness(pausedRaw);
  const scanPaused = pausedH.api.psrScan();
  assert.equal(scanPaused.ok, true);
  assert.equal(scanPaused.paused, true);
  assert.equal(indexPsrAsks(pausedH.store.state).length, 0, 'zero asks issued while paused');

  // Demo workspace carries > 4 actionable conditions -> cap 4 per commit, remainder on next scan, idempotent on third scan!
  const demo = buildDemoState(NOW);
  const demoH = harness(demo);
  demoH.api.psrScan();
  const afterFirst = indexPsrAsks(demoH.store.state);
  assert.equal(afterFirst.length, 4, 'capped at 4 new asks on first commit');
  demoH.api.psrScan();
  const afterSecond = indexPsrAsks(demoH.store.state);
  assert.equal(afterSecond.length, 6, 'all 6 demo conditions issued by second scan (unsafe, temp-expired, post-overdue, gate-rejected, ready-for-auth, temp-expiring)');
  demoH.api.psrScan();
  assert.equal(indexPsrAsks(demoH.store.state).length, 6, 'strictly idempotent on repeat scan');

  // Every ask addresses Priya (joint apex across Mei & Samuel lines), NEVER proposer Jordan, and leaks ZERO unit names, refs or person names!
  const forbiddenStrings = ['PSSR-2026', 'K-201', 'E-104', 'R-302', 'SR-05', 'N2-12', 'AT-408', 'Jordan', 'Freya', 'Samuel', 'Mei', 'Priya'];
  for (const ask of afterSecond) {
    assert.equal(ask.seatId, 'person-demo-1', 'routed to live matrixJointApex Priya');
    assert.notEqual(ask.seatId, 'person-demo-2', 'never routed to proposer');
    const text = `${ask.task.title} ${ask.task.expectedOutcome} ${ask.task.support}`;
    for (const secret of forbiddenStrings) {
      assert.equal(text.includes(secret), false, `ask text must never leak "${secret}"`);
    }
  }

  // Human closes one ask -> never re-nagged even while condition persists.
  const unsafeAsk = afterSecond.find((a) => a.kind === 'energised-unsafe');
  demoH.store.update((draft) => {
    const d = draft.delegations.find((t) => t.id === unsafeAsk.task.id);
    d.status = 'done';
    d.completedOn = day(0);
    d.completionNote = 'Acknowledged by plant lead; emergency shutdown executed.';
  }, { type: 'delegation.completed', entity: 'delegation', entityId: unsafeAsk.task.id, summary: 'human done' });
  demoH.api.psrScan();
  assert.equal(indexPsrAsks(demoH.store.state).filter((a) => a.kind === 'energised-unsafe').length, 1, 'human closure never re-nagged');

  // Physically restore expired temporary review psr-demo-2 -> its `temporary-expired` ask self-closes immediately!
  const restRes = demoH.api.psrRecordRestoration({
    reviewId: 'psr-demo-2',
    restoredAt: T0,
    restorationRef: 'RST-E104-DONE',
    restorationBasis: 'Temporary bypass spool E-104 physically removed and baseline bundle returned to service.',
  });
  assert.equal(restRes.ok, true);
  const expAsk = indexPsrAsks(demoH.store.state).find((a) => a.kind === 'temporary-expired');
  assert.equal(expAsk.task.status, 'done');
  assert.ok(expAsk.task.completionNote.startsWith(PSR_RULE_ID));

  // Removing the final review self-closes remaining active rule asks (no ghost obligations).
  demoH.store.update((draft) => { draft.psrReviews = []; }, { type: 'preStartup.scan', entity: 'workspace', entityId: 'pre-startup', summary: 'clear' });
  const activeLeft = indexPsrAsks(demoH.store.state).filter((a) => a.task?.status === 'active');
  assert.equal(activeLeft.length, 0, 'all active asks self-closed when reviews cleared');

  // Unresolvable hands produce an identity-free psrMarkers entry.
  const ghostH = harness(matrixFixture({
    psrReviews: [baseReview({ id: 'psr-g', reviewRef: 'PSSR-GHOST', proposerId: 'ghost-a', unitHolderId: 'ghost-b', affectedOperatorIds: ['ghost-c'] })],
    psrStartups: [{
      id: 'st-g', reviewId: 'psr-g', energisedAt: stamp(-1), energisedDay: day(-1), energisedById: 'ghost-b',
      startupLogRef: 'LOG-G', basisRef: 'Off-graph unit startup breach requiring an identity-free marker.',
      restoredAt: null, restoredDay: null, restoredById: null, restorationRef: null, restorationBasis: null,
      createdAt: stamp(-1), updatedAt: stamp(-1),
    }],
  }));
  ghostH.api.psrScan();
  const markers = ghostH.store.state.psrMarkers;
  assert.equal(markers.length, 1);
  assert.equal(markers[0].ruleId, PSR_RULE_ID);
  assert.equal(markers[0].detail.includes('PSSR-GHOST'), false);
  assert.equal(markers[0].detail.includes('ghost-a'), false);
});

/* ------------------------------------------- 8. CSV #195 & insights parity */

test('CSV #195 matches buildPreStartupSafety exactly, leaks zero identifiers, applies privacy floor, and insights byDomain includes Pre-startup safety', () => {
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  const report = buildPreStartupSafety(demo, { now: NOW });

  // All 10 states == 1 each on the demo workspace!
  assert.equal(report.totals.reviews, 10);
  for (const sk of PSR_STATE_KEYS) {
    assert.equal(report.states[sk], 1, `demo derives exactly 1 review in state ${sk}`);
  }
  assert.equal(report.balances, true);
  assert.equal(report.figuresComplete, true);
  assert.equal(report.warnings.length, 0);

  // Zero stored derived fields on any demo ledger row.
  for (const key of ['psrReviews', 'psrPunchItems', 'psrSignoffs', 'psrReadiness', 'psrAuthorisations', 'psrStartups']) {
    for (const row of demo[key]) {
      for (const forbidden of ['state', 'breaches', 'overdue', 'overdueDays', 'daysToRevert', 'authorisationValid', 'verifiedClosed']) {
        assert.equal(forbidden in row, false, `${key} must never store derived field ${forbidden}`);
      }
    }
  }

  const exported = exportWorkspaceCsv(demo, PSR_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true);
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...PSR_CSV_COLUMNS]);
  const expectedRowCount = 1 + PSR_STATE_KEYS.length + PSR_TRIGGER_KEYS.length + PSR_DISCIPLINE_KEYS.length;
  assert.equal(parsed.rows.length, expectedRowCount);

  const summary = Object.fromEntries(parsed.headers.map((h, i) => [h, parsed.rows[0][i]]));
  assert.equal(Number(summary.reviews_n), report.totals.reviews);
  assert.equal(Number(summary.unsafe_breach_n), report.totals.unsafeBreach);
  assert.equal(Number(summary.temporary_expired_n), report.totals.temporaryExpired);
  assert.equal(Number(summary.post_overdue_n), report.totals.postOverdue);
  assert.equal(Number(summary.gate_rejected_n), report.totals.gateRejected);
  assert.equal(Number(summary.blocked_cat_a_n), report.totals.blockedCatA);
  assert.equal(Number(summary.awaiting_verification_n), report.totals.awaitingVerification);
  assert.equal(Number(summary.ready_for_auth_n), report.totals.readyForAuth);
  assert.equal(Number(summary.live_conditions_open_n), report.totals.liveConditionsOpen);
  assert.equal(Number(summary.authorised_waiting_n), report.totals.authorisedWaiting);
  assert.equal(Number(summary.closed_verified_n), report.totals.closedVerified);
  assert.equal(Number(summary.temporary_expiring_n), report.totals.temporaryExpiring);
  assert.equal(Number(summary.cat_a_open_n), report.totals.catAOpen);
  assert.equal(Number(summary.cat_a_closed_n), report.totals.catAClosed);
  assert.equal(Number(summary.cat_b_open_n), report.totals.catBOpen);
  assert.equal(Number(summary.cat_b_overdue_n), report.totals.catBOverdue);
  assert.equal(Number(summary.cat_b_closed_n), report.totals.catBClosed);
  assert.equal(Number(summary.gates_cleared_n), report.totals.gatesCleared);
  assert.equal(Number(summary.gates_rejected_n), report.totals.gatesRejected);
  assert.equal(Number(summary.people_n), report.totals.peopleN);
  assert.equal(Number(summary.lines_n), report.totals.linesN);
  assert.equal(summary.balances, '1');
  assert.equal(summary.complete, '1');

  // Privacy floor = 3 -> every state row has count 1 (< 3), so exported blank with reason!
  const firstState = Object.fromEntries(parsed.headers.map((h, i) => [h, parsed.rows[1][i]]));
  assert.equal(firstState.row_kind, 'state');
  assert.equal(firstState.reviews_n, '', 'non-zero count below privacy floor withheld blank');
  assert.ok(firstState.blank_reason.includes('below privacy floor 3'));

  // Trigger `modification` has count 4 (>= 3) -> printed as '4'; `new-facility` has count 1 (< 3) -> blank!
  const directRows = psrCsvRows(report);
  assert.equal(directRows.find((r) => r.row_kind === 'trigger' && r.key === 'modification').reviews_n, 4);
  assert.equal(directRows.find((r) => r.row_kind === 'trigger' && r.key === 'new-facility').reviews_n, '');

  // Zero leaked identifiers anywhere in CSV text.
  for (const secret of ['PSSR-2026', 'K-201', 'person-demo', 'Priya', 'Jordan', 'Freya', 'Samuel', 'Mei', 'MOC-2026']) {
    assert.equal(exported.csv.includes(secret), false, `CSV must not contain "${secret}"`);
  }

  // Signals & Insights bucket parity + badge parity.
  const signals = psrSignals(demo, NOW);
  assert.equal(signals.length, 6, 'all PSR-01..06 fire on the 10-state demo');
  assert.equal(psrAttentionCount(demo, { now: NOW }), report.attention.total);
  const insights = buildInsights(demo, NOW);
  const psrFindings = insights.findings.filter((f) => f.domain === 'Pre-startup safety');
  assert.equal(psrFindings.length, 6);
  const bucket = insights.byDomain.find((b) => b.domain === 'Pre-startup safety');
  assert.ok(bucket, 'Pre-startup safety registered in DOMAIN_ORDER / byDomain');
  assert.equal(bucket.count, 6);
});

/* ----------------------- 9. persistence + JSDOM displayed == computed parity */

test('persisted reload preserves exact equality, and rendered #/pre-startup matches computed report cell-by-cell + handles live modal submit', () => {
  const { store, api, storage } = harness(buildDemoState(NOW));

  // Reload in a brand-new store instance and confirm identical computed totals & states.
  const store2 = createStore({ storage, now: () => NOW });
  store2.load();
  const rep1 = api.psrReport();
  const rep2 = buildPreStartupSafety(store2.state, { now: NOW });
  assert.deepEqual(rep2.totals, rep1.totals);
  assert.deepEqual(rep2.states, rep1.states);
  assert.equal(rep2.balances, true);
  assert.equal(rep2.figuresComplete, true);

  withDom((dom) => {
    const main = dom.window.document.getElementById('app');

    // 1. Render all 5 tabs on demo data and verify displayed values match computed report EXACTLY.
    const page = renderPreStartup({ api, store, state: store.state, query: new URLSearchParams() });
    main.append(page);

    const val = (id) => page.querySelector(`[data-testid="${id}-value"]`)?.textContent;
    assert.equal(val('psr-stat-reviews'), String(rep1.totals.reviews));
    assert.equal(val('psr-stat-unsafe'), String(rep1.totals.unsafeBreach));
    assert.equal(val('psr-stat-temp-expired'), String(rep1.totals.temporaryExpired));
    assert.equal(val('psr-stat-post-overdue'), String(rep1.totals.postOverdue));
    assert.equal(val('psr-stat-held'), String(rep1.totals.gateRejected + rep1.totals.blockedCatA));
    assert.equal(val('psr-stat-cata-open'), String(rep1.totals.catAOpen));
    assert.equal(val('psr-stat-ready'), String(rep1.totals.readyForAuth));
    assert.equal(val('psr-stat-closed'), String(rep1.totals.closedVerified));
    assert.equal(page.querySelector('[data-testid="psr-balances"]')?.textContent, 'Balances: yes');
    assert.equal(page.querySelector('[data-testid="psr-complete"]')?.textContent, 'Figures complete: yes');
    for (const sk of PSR_STATE_KEYS) {
      assert.equal(page.querySelector(`[data-testid="psr-state-${sk}"]`)?.textContent, String(rep1.states[sk]));
    }
    assert.equal(page.textContent.includes('[object Object]'), false, 'zero malformed DOM nodes anywhere on page');

    // Click through every tab (punch, gates, startups, method) and verify clean render + real method diagram.
    const tabButtons = [...page.querySelectorAll('[role="tab"]')];
    assert.equal(tabButtons.length, 5);
    for (const btn of tabButtons) {
      btn.click();
      assert.equal(page.textContent.includes('[object Object]'), false);
    }
    const img = page.querySelector('img.method-diagram');
    assert.ok(img, 'method tab renders editorial schematic image');
    assert.equal(img.getAttribute('src'), './assets/pre-startup-safety-method.jpg');
    assert.ok(img.getAttribute('alt').length > 30);

    // 2. Open the real "Open review" modal via button click, fill inputs, click Save, verify stored == computed == displayed == 11!
    page.querySelector('[data-testid="psr-open-btn"]').click();
    const modal = dom.window.document.querySelector('[role="dialog"]');
    assert.ok(modal, 'modal opens cleanly');
    assert.equal(modal.textContent.includes('[object Object]'), false, 'modal footer buttons are real DOM buttons');

    const refInput = modal.querySelector('[name="reviewRef"]');
    const unitInput = modal.querySelector('[name="unitRef"]');
    const basisInput = modal.querySelector('[name="changeBasisRef"]');
    refInput.value = 'PSSR-2026-11';
    unitInput.value = 'Distillation column D-601 reboiler tie-in';
    basisInput.value = 'MOC-2026-601 & HAZOP-61: reboiler condensate return control valve upgrade and trip test.';
    const saveBtn = [...modal.querySelectorAll('button')].find((b) => b.textContent === 'Open review');
    assert.ok(saveBtn);
    saveBtn.click();

    const updated = api.psrReport();
    assert.equal(store.state.psrReviews.length, 11);
    assert.equal(updated.totals.reviews, 11);
    assert.equal(val('psr-stat-reviews'), '11', 're-rendered stat tile equals newly stored & computed review count');
    assert.equal(updated.balances, true);
    assert.equal(updated.figuresComplete, true);

    // 3. Verify rank 4 VP view hides individual unit names and people while displaying exact aggregate counts!
    setSeat(store, 'person-demo-12'); // Ingrid Solberg, VP (rank 4)
    const vpPage = renderPreStartup({ api, store, state: store.state, query: new URLSearchParams() });
    assert.equal(vpPage.querySelector('[data-testid="psr-stat-reviews-value"]')?.textContent, '11');
    assert.equal(vpPage.textContent.includes('Compressor K-201'), false, 'unit detail withheld at VP rank 4');
    assert.equal(vpPage.textContent.includes('Jordan Alvarez'), false, 'person names withheld at VP rank 4');
    assert.ok(vpPage.textContent.includes('Aggregate executive disclosure'));
  });
});
