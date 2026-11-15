/**
 * ADR-0221 — Duty-Without-Means Register (Accountability–Means Parity &
 * Simons' Entrepreneurial Gap Ledger, Schema v175, CSV #163, `#/means`,
 * `RULE-DWM-01`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  DEFAULT_SETTINGS,
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeSettings,
  normalizeState,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_SWITCH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  DWM_CSV_SCOPE,
  DWM_RULE_ID,
  DWM_SETTING_KEYS,
} from '../../app/core/domain/dutyMeansRegistry.js';
import {
  normalizeDutyMeansActs,
  normalizeDutyMeansDuties,
  normalizeDutyMeansRequirements,
  normalizeDutyMeansSettings,
  parseDwmHours,
  parseDwmMoneyToCents,
  readStoredDwmCents,
} from '../../app/core/domain/dutyMeansSchema.js';
import {
  buildDutyMeans,
  dutyMeansAttentionCount,
  dutyMeansCsvRows,
  strictJointApex,
} from '../../app/core/domain/dutyMeans.js';
import {
  dutyMeansConditions,
  dutyMeansRule,
} from '../../app/core/domain/dutyMeansRules.js';
import { renderDutyMeans } from '../../app/views/dutyMeans.js';

const BASIS = 'Hold station changeover scrap below 1.5% across Q4 runs under charter Q4-OPS-19.';
const RATIONALE = 'Requires dedicated maintenance technicians and calibration budget during changeover windows.';
const REASON = 'Line capacity is committed to regulatory audit remediation through December; cannot release hours.';
const GAP_REASON = 'Joint-apex entrepreneurial stretch accepted for Q4 pilot; carrier protected from unresourced scrap variance.';

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

/* ------------------------------------------- 1. Schema, migration & parsers */

test('ADR-0221 Schema v175: additive migration, persisted conventions, exact integer parsers and zero ×100 reload inflation', () => {
  assert.equal(SCHEMA_VERSION, 175);
  for (const col of ['dutyMeansDuties', 'dutyMeansRequirements', 'dutyMeansActs', 'dutyMeansMarkers']) {
    assert.ok(COLLECTIONS.includes(col), `${col} registered in COLLECTIONS`);
  }
  assert.equal(DEFAULT_SETTINGS.dutyMeansResponseDays, 7);
  assert.equal(DEFAULT_SETTINGS.dutyMeansAutoPropagate, true);

  const kept = normalizeSettings({ dutyMeansResponseDays: 14, dutyMeansAutoPropagate: false });
  assert.equal(kept.dutyMeansResponseDays, 14);
  assert.equal(kept.dutyMeansAutoPropagate, false);
  assert.deepEqual(normalizeDutyMeansSettings({ dutyMeansResponseDays: 999 }), {
    dutyMeansResponseDays: 60,
    dutyMeansAutoPropagate: true,
  });

  const v174 = { schemaVersion: 174, people: [], settings: {} };
  assert.equal(typeof MIGRATIONS[174], 'function');
  const migrated = migrate(v174);
  assert.equal(migrated.raw.schemaVersion, 175);
  assert.equal(migrated.applied.at(-1), '174 → 175');
  assert.deepEqual(migrated.raw.dutyMeansDuties, []);
  assert.deepEqual(migrated.raw.dutyMeansRequirements, []);
  assert.deepEqual(migrated.raw.dutyMeansActs, []);
  assert.deepEqual(migrated.raw.dutyMeansMarkers, []);

  // Exact BigInt money parser & stored integer reader (no ×100 inflation on reload)
  assert.equal(parseDwmMoneyToCents('45000.00'), 4_500_000);
  assert.equal(parseDwmMoneyToCents('0.05'), 5);
  assert.equal(parseDwmMoneyToCents('45,000.00'), null, 'commas refused');
  assert.equal(parseDwmMoneyToCents('10.125'), null, 'third decimal refused, never rounded');
  assert.equal(parseDwmMoneyToCents('-5.00'), null, 'negatives refused');
  assert.equal(parseDwmMoneyToCents('1e4'), null, 'scientific notation refused');
  assert.equal(readStoredDwmCents(4_500_000), 4_500_000);
  assert.equal(readStoredDwmCents('4500000'), null, 'strings refused in stored cents reader');
  assert.equal(parseDwmHours('120'), 120);
  assert.equal(parseDwmHours('12.5'), null, 'fractional hours refused');

  // Fail-closed reload idempotency: reloading normalized state never multiplies cents
  const env = seed();
  env.sit('kai');
  const d = env.api.dutyMeansDeclareDuty({
    label: 'Q4 changeover scrap target',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  assert.equal(d.ok, true, d.error);
  const r = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'budget',
    controllingHolderId: 'dan',
    currency: 'DKK',
    amount: '45000.00',
    rationale: RATIONALE,
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.requirement.requiredCents, 4_500_000);

  const pass1 = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
  const pass2 = normalizeState(JSON.parse(JSON.stringify(pass1)), { now: at('2026-11-15') }).state;
  assert.equal(pass1.dutyMeansRequirements[0].requiredCents, 4_500_000);
  assert.equal(pass2.dutyMeansRequirements[0].requiredCents, 4_500_000, 'stored cents are never multiplied on reload');

  // Malformed rows drop with counted warnings
  const warnings = [];
  assert.equal(normalizeDutyMeansDuties([{ id: 'bad', label: 'ok label', carrierId: 'ivo', demandingLineHolderId: 'ivo' }], warnings).length, 0);
  assert.equal(normalizeDutyMeansRequirements([{ id: 'bad-r', dutyId: d.dutyId, pillar: 'time', controllingHolderId: 'mia', currency: 'DKK', requiredCents: 100, requiredHours: 10, rationale: RATIONALE, declaredOn: '2026-11-15', declaredById: 'ivo' }], warnings).length, 0);
  assert.equal(normalizeDutyMeansActs([{ id: 'bad-a', requirementId: r.requirementId, state: 'declined', on: '2026-11-15', byId: 'dan', reason: 'too short' }], warnings).length, 0);
  assert.equal(warnings.length, 3);
});

/* -------------------------- 2. First-person frontline & boundary refusals */

test('ADR-0221 frontline registration & boundary controls: carrier can register owed duties, cannot self-retire or self-supply, and Line A cannot promise Line B’s means', () => {
  const env = seed();

  // Frontline supervisor Ivo registers a duty owed to project-line manager Kai
  env.sit('ivo');
  const selfDemand = env.api.dutyMeansDeclareDuty({
    label: 'Self-held mandate',
    carrierId: 'ivo',
    demandingLineHolderId: 'ivo',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  assert.equal(selfDemand.ok, false);
  assert.equal(selfDemand.refusal, 'dutyMeans:self-demand');

  const wrongHolder = env.api.dutyMeansDeclareDuty({
    label: 'Unrelated line mandate',
    carrierId: 'ivo',
    demandingLineHolderId: 'ben',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  assert.equal(wrongHolder.ok, false);
  assert.equal(wrongHolder.refusal, 'dutyMeans:demanding-line-does-not-hold-carrier');

  const declared = env.api.dutyMeansDeclareDuty({
    label: 'Reduce line changeover scrap below 1.5%',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'case',
    sourceId: 'case-q4-scrap',
    outcomeBasis: BASIS,
  });
  assert.equal(declared.ok, true, declared.error);

  // Carrier cannot declare self-controlled means
  const selfMeans = env.api.dutyMeansAddRequirement(declared.dutyId, {
    pillar: 'time',
    controllingHolderId: 'ivo',
    hours: '80',
    rationale: RATIONALE,
  });
  assert.equal(selfMeans.ok, false);
  assert.equal(selfMeans.refusal, 'dutyMeans:self-controlled-means');

  // Carrier declares protected hours controlled by home manager Mia (cross-line!)
  const timeReq = env.api.dutyMeansAddRequirement(declared.dutyId, {
    pillar: 'time',
    controllingHolderId: 'mia',
    hours: '120',
    rationale: RATIONALE,
  });
  assert.equal(timeReq.ok, true, timeReq.error);

  // Carrier cannot unilaterally retire an owed duty
  const carrierRetire = env.api.dutyMeansRetireDuty(declared.dutyId, { reason: REASON });
  assert.equal(carrierRetire.ok, false);
  assert.equal(carrierRetire.refusal, 'dutyMeans:carrier-cannot-retire');

  // Carrier at rank 1 is denied supply-duty-means (rank 2+); even a rank 2 carrier cannot self-supply
  const carrierSupply = env.api.dutyMeansRecordAct(timeReq.requirementId, {
    state: 'supplied',
    hours: '120',
    evidenceKind: 'reporting-line',
    evidenceId: 'rl-ivo-home',
  });
  assert.equal(carrierSupply.ok, false);

  // Demanding line Kai (project line) CANNOT supply Mia's (home line) hours!
  env.sit('kai');
  const crossLineFakePromise = env.api.dutyMeansRecordAct(timeReq.requirementId, {
    state: 'supplied',
    hours: '120',
    evidenceKind: 'reporting-line',
    evidenceId: 'rl-ivo-home',
  });
  assert.equal(crossLineFakePromise.ok, false);
  assert.equal(crossLineFakePromise.refusal, 'dutyMeans:demanding-line-cannot-supply-other-line');

  // Reader proves: Mia's 60% declared shareH is printed as context ONLY, never invented as supplied hours!
  const report = env.api.dutyMeansReport();
  const dutyRow = report.duties.find((d) => d.id === declared.dutyId);
  assert.equal(dutyRow.verdict, 'cross-line-locked');
  assert.equal(dutyRow.requirements[0].declaredLineShareH, 60);
  assert.equal(dutyRow.requirements[0].coveredHours, 0, 'shareH never fabricates supplied hours');
  assert.equal(dutyRow.requirements[0].unbackedShortfallHours, 120);
});

/* ---------------- 3. Conservation, multi-currency, no netting & drift */

test('ADR-0221 exact conservation: over-supply never masks another requirement’s shortfall, currencies never pool, and reorg drift invalidates stale supply', () => {
  const env = seed('2026-11-10');
  env.sit('kai');
  const d1 = env.api.dutyMeansDeclareDuty({
    label: 'Duty alpha — fixture retrofit',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-05',
    windowTo: '2026-12-20',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  const rDkkOver = env.api.dutyMeansAddRequirement(d1.dutyId, {
    pillar: 'budget',
    controllingHolderId: 'mia',
    currency: 'DKK',
    amount: '60000.00',
    rationale: RATIONALE,
  });
  const rDkkShort = env.api.dutyMeansAddRequirement(d1.dutyId, {
    pillar: 'authority',
    authorityScope: 'spend-commit',
    controllingHolderId: 'dan',
    currency: 'DKK',
    amount: '50000.00',
    rationale: RATIONALE,
  });
  const rEur = env.api.dutyMeansAddRequirement(d1.dutyId, {
    pillar: 'budget',
    controllingHolderId: 'dan',
    currency: 'EUR',
    amount: '10000.00',
    rationale: RATIONALE,
  });

  // Mia over-supplies Req 1 (100,000 DKK against 60,000 DKK required)
  env.sit('mia');
  assert.equal(env.api.dutyMeansRecordAct(rDkkOver.requirementId, {
    state: 'supplied',
    currency: 'DKK',
    amount: '100000.00',
    evidenceKind: 'budget',
    evidenceId: 'bud-dkk-1',
  }).ok, true);

  // Dan partially supplies Req 2 (20,000 DKK against 50,000 DKK required) and rejects currency mismatch
  env.sit('dan');
  const wrongCur = env.api.dutyMeansRecordAct(rDkkShort.requirementId, {
    state: 'supplied',
    currency: 'EUR',
    amount: '20000.00',
    evidenceKind: 'doa',
    evidenceId: 'doa-1',
  });
  assert.equal(wrongCur.ok, false);
  assert.equal(wrongCur.refusal, 'dutyMeans:currency-mismatch');

  assert.equal(env.api.dutyMeansRecordAct(rDkkShort.requirementId, {
    state: 'supplied',
    currency: 'DKK',
    amount: '20000.00',
    evidenceKind: 'doa',
    evidenceId: 'doa-1',
  }).ok, true);

  // EUR remains unanswered
  const report = env.api.dutyMeansReport();
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, false, 'EUR requirement is unanswered');
  assert.equal(report.currencies.length, 2, 'DKK and EUR are never pooled');

  const dkk = report.currencies.find((c) => c.currency === 'DKK');
  assert.equal(dkk.requiredCents, 11_000_000);
  assert.equal(dkk.coveredCents, 8_000_000, '60k capped + 20k partial = 80k covered; 40k excess on Req 1 never masks Req 2');
  assert.equal(dkk.unbackedShortfallCents, 3_000_000, 'exact 30k DKK shortfall preserved');
  assert.equal(dkk.coveredCents + dkk.acceptedGapCents + dkk.unbackedShortfallCents, dkk.requiredCents);

  const eur = report.currencies.find((c) => c.currency === 'EUR');
  assert.equal(eur.requiredCents, 1_000_000);
  assert.equal(eur.coveredCents, 0);
  assert.equal(eur.unbackedShortfallCents, 1_000_000);

  // Revocation requires prior supply; revoking Mia's supply flips Req 1 to `withdrawn`
  assert.equal(env.api.dutyMeansRecordAct(rEur.requirementId, {
    state: 'revoked',
    reason: REASON,
  }).refusal, 'dutyMeans:nothing-supplied-to-revoke');

  env.setDay('2026-11-12');
  env.sit('mia');
  assert.equal(env.api.dutyMeansRecordAct(rDkkOver.requirementId, {
    state: 'revoked',
    reason: REASON,
  }).ok, true);
  const afterRevoke = env.api.dutyMeansReport();
  assert.equal(afterRevoke.duties[0].verdict, 'means-declined');
  assert.equal(afterRevoke.requirements.find((x) => x.id === rDkkOver.requirementId).state, 'withdrawn');

  // Supplier drift: Mia re-supplies on Nov 13, then Mia departs -> requirement becomes `drifted`
  env.setDay('2026-11-13');
  assert.equal(env.api.dutyMeansRecordAct(rDkkOver.requirementId, {
    state: 'supplied',
    currency: 'DKK',
    amount: '60000.00',
    evidenceKind: 'budget',
    evidenceId: 'bud-dkk-2',
  }).ok, true);
  env.store.update((draft) => {
    const m = draft.people.find((p) => p.id === 'mia');
    m.status = 'archived';
    const iv = draft.people.find((p) => p.id === 'ivo');
    iv.managerId = 'dan';
  }, { type: 'person.updated', entity: 'person', entityId: 'mia', summary: 'mia archived and ivo moved to dan' });
  env.sit('dan');
  const afterDrift = env.api.dutyMeansReport();
  assert.equal(afterDrift.requirements.find((x) => x.id === rDkkOver.requirementId).state, 'drifted');
});

/* -------------- 4. Simons' Entrepreneurial Gap & strict joint-apex proof */

test('ADR-0221 Simons entrepreneurial gap: only a seat strictly above BOTH demanding and controlling lines can accept a gap, and a line that declined means cannot govern its own refusal', () => {
  const env = seed();
  env.sit('kai');
  const d = env.api.dutyMeansDeclareDuty({
    label: 'Cross-line tooling readiness',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  const rCross = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'time',
    controllingHolderId: 'mia',
    hours: '80',
    rationale: RATIONALE,
  });
  const rDan = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'authority',
    authorityScope: 'process-halt',
    controllingHolderId: 'dan',
    rationale: RATIONALE,
  });

  // Mia declines the hours
  env.sit('mia');
  assert.equal(env.api.dutyMeansRecordAct(rCross.requirementId, {
    state: 'declined',
    reason: REASON,
  }).ok, true);

  // Unrelated peer director Zoe cannot govern Kai×Mia gap
  env.sit('zoe');
  const peerTry = env.api.dutyMeansGovernGap(rCross.requirementId, { reason: GAP_REASON });
  assert.equal(peerTry.ok, false);
  assert.equal(peerTry.refusal, 'dutyMeans:not-joint-apex');

  // Dan sits strictly above BOTH Kai and Mia -> Dan CAN govern rCross!
  env.sit('dan');
  const danCross = env.api.dutyMeansGovernGap(rCross.requirementId, { reason: GAP_REASON });
  assert.equal(danCross.ok, true, danCross.error);

  // Dan declines rDan (where Dan HIMSELF is controllingHolderId) -> Dan CANNOT govern his own refusal!
  assert.equal(env.api.dutyMeansRecordAct(rDan.requirementId, {
    state: 'declined',
    reason: REASON,
  }).ok, true);
  const danSelfGovern = env.api.dutyMeansGovernGap(rDan.requirementId, { reason: GAP_REASON });
  assert.equal(danSelfGovern.ok, false);
  assert.equal(danSelfGovern.refusal, 'dutyMeans:not-joint-apex');

  // Cleo VP ('ceo') sits strictly above BOTH Kai and Dan -> Cleo CAN govern rDan!
  env.sit('ceo');
  const ceoGovern = env.api.dutyMeansGovernGap(rDan.requirementId, { reason: GAP_REASON });
  assert.equal(ceoGovern.ok, true, ceoGovern.error);

  env.sit('dan');
  const report = env.api.dutyMeansReport();
  const duty = report.duties.find((x) => x.id === d.dutyId);
  assert.equal(duty.verdict, 'entrepreneurial-gap');
  assert.equal(report.hours.coveredHours, 0, 'accepted gap is never folded into covered hours');
  assert.equal(report.hours.acceptedGapHours, 80);
  assert.equal(report.hours.unbackedShortfallHours, 0);
  assert.equal(report.authority.acceptedGapN, 1);
});

/* ---------------- 5. RULE-DWM-01 spine, pause permits & opaque asks */

test('ADR-0221 RULE-DWM-01: spine registration (#137), pause-permit census, joint-apex routing, opaque asks, idempotency, self-close, and top-of-house markers', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 137);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(dutyMeansRule));
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2)?.id, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1)?.id, 'sealRule');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes(DWM_SETTING_KEYS.autoPropagate));
  assert.equal(PAUSE_PERMIT_SWITCH_RULES[DWM_SETTING_KEYS.autoPropagate], 'dutyMeansRules.js');

  const env = seed();
  env.sit('kai');

  // 1. Declaring an opened duty with 0 requirements files an opaque unscoped ask to `kai`
  const d = env.api.dutyMeansDeclareDuty({
    label: 'Secret Project Phoenix Cutover',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  assert.equal(d.ok, true);
  let asks = env.store.state.delegations.filter((t) => t.support?.includes(DWM_RULE_ID) && t.status === 'active');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'kai');
  assert.ok(!/Phoenix|ivo|kai|DKK|120/i.test(asks[0].title), 'opaque title carries no label, person, or figure');
  assert.ok(!/Phoenix|ivo|kai|DKK/i.test(asks[0].expectedOutcome), 'opaque body carries no label or person');

  // 2. Adding a requirement clears `duty-unscoped` (self-closing Kai's ask!) and, since window is open, asks controlling line `mia`
  const req = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'time',
    controllingHolderId: 'mia',
    hours: '120',
    rationale: RATIONALE,
  });
  assert.equal(req.ok, true);
  asks = env.store.state.delegations.filter((t) => t.support?.includes(DWM_RULE_ID) && t.status === 'active');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'mia', 'overdue unanswered requirement asks controlling line Mia, closing Kai’s unscoped ask');

  // 3. Mia declines -> closes Mia's unanswered ask and escalates to strict joint apex `dan` (above Kai and Mia)!
  env.sit('mia');
  assert.equal(env.api.dutyMeansRecordAct(req.requirementId, {
    state: 'declined',
    reason: REASON,
  }).ok, true);
  asks = env.store.state.delegations.filter((t) => t.support?.includes(DWM_RULE_ID) && t.status === 'active');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'dan', 'cross-line refusal escalates to joint apex Dan, never to Ivo, Kai, or Mia');

  // Attention count matches Dan's owed decision
  env.sit('dan');
  assert.equal(env.api.dutyMeansAttentionCount(), 1);
  assert.equal(dutyMeansAttentionCount(env.store.state, { now: at('2026-11-15'), seat: null }), 0);

  // Idempotent on repeated scan
  env.api.dutyMeansScan();
  assert.equal(
    env.store.state.delegations.filter((t) => t.support?.includes(DWM_RULE_ID) && t.status === 'active').length,
    1,
  );

  // Top-of-house unaddressable gap: when `ceo` has no roster manager (`leader` is top) and declines a means, writes an identity-free marker and asks nobody!
  const reqTop = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'budget',
    controllingHolderId: 'ceo',
    currency: 'DKK',
    amount: '250000.00',
    rationale: RATIONALE,
  });
  env.sit('ceo');
  assert.equal(env.api.dutyMeansRecordAct(reqTop.requirementId, {
    state: 'declined',
    reason: REASON,
  }).ok, true);
  const openMarkers = env.store.state.dutyMeansMarkers.filter((m) => !m.resolvedOn);
  assert.equal(openMarkers.length, 1);
  assert.equal(openMarkers[0].reason, 'no-joint-apex');

  // Pause switch silences scan & new asks while keeping report verdicts intact
  env.store.update((draft) => {
    draft.settings = { ...draft.settings, [DWM_SETTING_KEYS.autoPropagate]: false };
    draft.delegations = [];
  }, { type: 'settings.updated', entity: 'settings', entityId: 'dutyMeansAutoPropagate', summary: 'paused' });
  env.sit('dan');
  env.api.dutyMeansScan();
  assert.equal(env.store.state.delegations.length, 0, 'paused rule files nothing even on scan');
  assert.equal(env.api.dutyMeansReport().duties[0].verdict, 'means-declined');

  // Direct pure helper checks
  assert.equal(strictJointApex(null, ['mia']).ok, false);
  assert.deepEqual(dutyMeansConditions(null, null, {}), { conditions: [], observations: [] });
});

/* ---------------- 6. Scoping, executive redaction, CSV #163 & DOM parity */

test('ADR-0221 scoping, executive carrier redaction, CSV #163 identity-free export, and cell-by-cell DOM parity', () => withDom(() => {
  assert.equal(CSV_EXPORTS.length, 163);
  const env = seed();
  env.sit('kai');
  const d = env.api.dutyMeansDeclareDuty({
    label: 'Station 4 OEE recovery',
    carrierId: 'ivo',
    demandingLineHolderId: 'kai',
    windowFrom: '2026-11-01',
    windowTo: '2026-12-31',
    sourceKind: 'written',
    outcomeBasis: BASIS,
  });
  const reqBudget = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'budget',
    controllingHolderId: 'dan',
    currency: 'DKK',
    amount: '50000.00',
    rationale: RATIONALE,
  });
  const reqHours = env.api.dutyMeansAddRequirement(d.dutyId, {
    pillar: 'time',
    controllingHolderId: 'mia',
    hours: '60',
    rationale: RATIONALE,
  });
  env.sit('dan');
  assert.equal(env.api.dutyMeansRecordAct(reqBudget.requirementId, {
    state: 'supplied',
    currency: 'DKK',
    amount: '30000.00',
    evidenceKind: 'budget',
    evidenceId: 'bud-99',
  }).ok, true);

  // Unrelated peer branch (`ben`) sees 0 duties and `dutiesOutsideScopeN === 1`
  env.sit('ben');
  const peerReport = env.api.dutyMeansReport();
  assert.equal(peerReport.duties.length, 0);
  assert.equal(peerReport.scope.dutiesOutsideScopeN, 1);

  // Executive (`ceo`, rank 4) sees line-to-line lock & exact numbers, with individual carrier identity redacted
  env.sit('ceo');
  const execReport = env.api.dutyMeansReport();
  assert.equal(execReport.detailLevel, 'leaders');
  assert.equal(execReport.duties[0].carrierId, null);
  assert.equal(execReport.duties[0].carrierName, null);
  assert.equal(execReport.duties[0].demandingLineName, 'Kai ProjMgr');
  assert.equal(execReport.claims.countsReconcile, true);
  assert.equal(execReport.claims.figuresComplete, false);
  assert.ok(execReport.claims.incompleteReasons.some((r) => r.startsWith('carrier-identity-withheld:')));

  // CSV #163 export: aggregate, identity-free, exact reader integers
  const wholeReport = buildDutyMeans(env.store.state, { now: at('2026-11-15'), seat: null });
  const exported = exportWorkspaceCsv(env.store.state, DWM_CSV_SCOPE, { now: at('2026-11-15') });
  assert.equal(exported.ok, true, exported.error);
  for (const forbidden of ['Station 4 OEE recovery', 'ivo', 'Ivo Lead', 'Kai ProjMgr', 'Mia HomeMgr', 'bud-99', BASIS, RATIONALE]) {
    assert.ok(!exported.csv.includes(forbidden), `CSV leaks no "${forbidden}"`);
  }
  const csvRows = dutyMeansCsvRows(wholeReport);
  assert.equal(csvRows.length, 2, '1 workspace row + 1 DKK currency row');
  assert.equal(csvRows[0].row_kind, 'workspace');
  assert.equal(csvRows[0].hours_required_total, 60);
  assert.equal(csvRows[0].hours_unbacked_shortfall_total, 60);
  assert.equal(csvRows[1].row_kind, 'currency');
  assert.equal(csvRows[1].currency, 'DKK');
  assert.equal(csvRows[1].money_required_cents, 5_000_000);
  assert.equal(csvRows[1].money_covered_cents, 3_000_000);
  assert.equal(csvRows[1].money_unbacked_shortfall_cents, 2_000_000);

  // DOM parity at director seat (`dan`) across all 4 tabs
  env.sit('dan');
  const danReport = env.api.dutyMeansReport();
  const makeCtx = (view = '') => ({
    api: env.api,
    navigate: () => {},
    refresh: () => {},
    query: new URLSearchParams(view ? `view=${view}` : ''),
  });

  const dutiesDom = renderDutyMeans(makeCtx('duties'));
  const text = (root, testid) => root.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim();
  assert.equal(text(dutiesDom, 'dwm-count-duties'), String(danReport.counts.dutiesLive));
  assert.equal(text(dutiesDom, 'dwm-count-cross-line'), String(danReport.gaps.crossLineLockedDutiesN));
  assert.equal(text(dutiesDom, 'dwm-count-hours-shortfall'), `${danReport.hours.unbackedShortfallHours} h`);
  const dutyTr = dutiesDom.querySelector(`[data-testid="dwm-duty-${d.dutyId}"]`);
  assert.ok(dutyTr);
  assert.equal(dutyTr.getAttribute('data-verdict'), danReport.duties[0].verdict);

  const reqsDom = renderDutyMeans(makeCtx('requirements'));
  const reqTr = reqsDom.querySelector(`[data-testid="dwm-req-${reqBudget.requirementId}"]`);
  assert.ok(reqTr);
  assert.equal(reqTr.getAttribute('data-state'), 'partial');
  assert.equal(reqTr.getAttribute('data-required-cents'), '5000000');
  assert.equal(reqTr.getAttribute('data-shortfall-cents'), '2000000');

  const escDom = renderDutyMeans(makeCtx('escalations'));
  const curTr = escDom.querySelector('[data-testid="dwm-currency-DKK"]');
  assert.ok(curTr);
  assert.equal(curTr.getAttribute('data-required-cents'), String(danReport.currencies[0].requiredCents));
  assert.equal(curTr.getAttribute('data-shortfall-cents'), String(danReport.currencies[0].unbackedShortfallCents));

  const methodDom = renderDutyMeans(makeCtx('method'));
  const img = methodDom.querySelector('[data-testid="dwm-diagram"]');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), './app/assets/duty-without-means-method.jpg');
}));
