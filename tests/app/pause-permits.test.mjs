/**
 * tests/app/pause-permits.test.mjs — the Automation Pause Permit Register
 * (ADR-0182, Schema v145, RULE-PMP-01, CSV #136, `#/settings?panel=pause-permits`).
 *
 * One focused pass over what this session built. Every figure asserted below is
 * worked out by hand from the fixture and stated in the test, so a failure names
 * the fact that moved rather than a number that changed:
 *
 *   1. the census and the four states reconcile to the declared switches;
 *   2. a bare pause reads `unpermitted`; a permitted pause reads `permitted`;
 *      a window that passed with the switch still off reads `expired`; a
 *      REVOKED permit left off is `unpermitted` again, not `expired`;
 *   3. a permit is written in the SAME atomic commit as the switch, and a
 *      refused permit leaves both untouched;
 *   4. revoking brings the switch back up, and does not when another live
 *      permit still names it;
 *   5. the reach list is re-derived from the source and cannot go stale;
 *   6. the export carries counts only and no switch key, authoriser or reason;
 *   7. display == stored across a real reload, and a render stores nothing;
 *   8. RULE-PMP-01 issues one ask to the single authorising seat, is idempotent,
 *      and closes its own ask when the pause is permitted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildPausePermits,
  declaredSwitches,
  pausePermitBriefText,
  pausePermitCsvRows,
} from '../../app/core/domain/pausePermits.js';
import { normalizePausePermits } from '../../app/core/domain/pausePermitSchema.js';
import {
  PAUSE_PERMIT_CSV_COLUMNS,
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
  PAUSE_PERMIT_RULE_ID,
  PAUSE_PERMIT_STATES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { renderPausePermitPanel } from '../../app/views/pausePermitPanel.js';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, level, managerId = null) => ({
  id, name, level, managerId, status: 'active', startDate: '2020-01-01', createdAt: STAMP,
});

/**
 *   Ada Chief (ceo, the workspace leader)
 *     ├ Milo Product (director)
 *     │   └ Sam Builder (ic)
 *     └ Nora Eng (director)
 *
 * Ada is the single seat above every reporting line, so she is the one seat that
 * can authorise a workspace-wide pause.
 */
function fixture(extra = {}) {
  const base = createEmptyState(NOW.toISOString());
  base.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('nora', 'Nora Eng', 'director', 'ceo'),
    person('sam', 'Sam Builder', 'ic', 'prod'),
  ];
  base.settings = { ...base.settings, leaderName: 'Ada Chief', activeSeatId: null, ...extra };
  return normalizeState(base, { now: NOW }).state;
}

function seed(rawState) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(rawState)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api, map: values };
}

/**
 * A permit that was sound when it was granted and whose window has since
 * CLOSED. This state cannot be produced through the grant door — granting an
 * already-lapsed window is refused — it is produced by time passing, so the
 * fixture writes the dated record and reads the workspace after the fact.
 */
function agedPermit(key, over = {}) {
  return {
    id: `pmp-aged-${key}`,
    key,
    authoriserId: null,
    reason: 'The classification ledger is being migrated before the scan runs again',
    mitigation: 'The director reads the turns panel by hand every Monday',
    scope: 'workspace',
    scopeTargetId: null,
    counterpartId: null,
    from: '2026-10-01',
    to: '2026-10-31',
    at: '2026-10-01T09:00:00.000Z',
    revoked: false,
    revokedOn: null,
    revokedById: null,
    revokedReason: null,
    ...over,
  };
}

const read = (state) => buildPausePermits(state, { now: NOW, settings: state.settings });
const rowFor = (report, key) => report.switches.find((r) => r.key === key);

const GOOD_PERMIT = (key, over = {}) => ({
  key,
  reason: 'The classification ledger is being migrated before the scan runs again',
  mitigation: 'The director reads the turns panel by hand every Monday',
  from: '2026-11-01',
  to: '2026-12-01',
  ...over,
});

/* =====================================================================
 * 1. REGISTRATION — schema, spine, gateway, export catalogue
 */

test('the register is registered end to end: schema v145, two collections, the spine, the gateway and CSV #136', () => {
  assert.equal(SCHEMA_VERSION, 155);
  assert.equal(COLLECTIONS.includes('pausePermits'), true);
  assert.equal(COLLECTIONS.includes('pausePermitMarkers'), true);

  const spineIds = DEFAULT_POST_COMMIT_RULES.map((rule) => rule && rule.id);
  assert.ok(spineIds.includes('pausePermitRule'), 'RULE-PMP-01 is on the shared post-commit spine');
  // It must run BEFORE the seat rule so its ask is fanned up in the same commit,
  // and before the seal so the seal covers it.
  const at = spineIds.indexOf('pausePermitRule');
  assert.ok(at < spineIds.indexOf('seatRule'), 'runs before the Operating Seat fans the transaction up');
  assert.ok(at < spineIds.indexOf('sealRule'), 'runs before the seal attests the transaction');

  const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'pausePermitRules.js');
  assert.ok(contract, 'RULE-PMP-01 declares a propagation contract');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'pausePermitMarkers']);

  assert.equal(API_RIGHTS.pausePermitGrant, 'permit-automation-pause');
  assert.equal(API_RIGHTS.pausePermitRevoke, 'permit-automation-pause');
  assert.ok(SAFE_READS.has('pausePermitReport'));
  assert.equal(ACTION_RIGHTS['permit-automation-pause'].minRank, 4, 'director+ may silence a workspace-wide control');

  assert.equal(CSV_EXPORTS.length, 146);
  const scope = CSV_EXPORTS.find((e) => e.key === 'automation-pause-permits');
  assert.ok(scope, 'CSV #136 is registered');
  assert.equal(scope.sensitive, false);
});

/* =====================================================================
 * 2. THE STATES — derived, never stored
 */

test('a bare pause reads unpermitted; a permitted one reads permitted; a lapsed window reads expired; a revoked-and-left-off one is unpermitted again', () => {
  const { api, store } = seed(fixture());

  // (a) A pause with no permit: allowed, and anonymous.
  assert.equal(api.updateSettings({ forecastAutoPropagate: false }).ok, true);
  let report = storeState(api);
  assert.equal(rowFor(report, 'forecastAutoPropagate').stateKey, 'unpermitted');
  assert.equal(rowFor(report, 'forecastAutoPropagate').permit, null, 'no authoriser is invented');

  // (b) A permitted pause.
  const granted = api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
  assert.equal(granted.ok, true, granted?.error);
  report = storeState(api);
  assert.equal(rowFor(report, 'workTurnAutoPropagate').stateKey, 'permitted');
  assert.equal(rowFor(report, 'workTurnAutoPropagate').permit.to, '2026-12-01');

  // (c) A permit whose last day has passed, switch still off → expired.
  //     Window 2026-10-01 → 2026-10-31; the reading day is 2026-11-12. The
  //     permit is written into the record as a dated fact because time, not the
  //     grant door, is what lapses it.
  const aged = { ...store.state };
  aged.pausePermits = [...aged.pausePermits, agedPermit('loadAutoPropagate')];
  aged.settings = { ...aged.settings, loadAutoPropagate: false };
  report = buildPausePermits(normalizeState(aged, { now: NOW }).state, { now: NOW });
  assert.equal(rowFor(report, 'loadAutoPropagate').stateKey, 'expired', 'the pause outlived its authority');
  assert.notEqual(rowFor(report, 'loadAutoPropagate').stateKey, 'unpermitted', 'a lapsed authority is a different failure from an anonymous one');

  // (d) A permit revoked while the switch is left off is NOT an expired
  //     authority — the authority was withdrawn, so the silence is anonymous.
  const revokedState = {
    ...normalizeState(aged, { now: NOW }).state,
    settings: { ...normalizeState(aged, { now: NOW }).state.settings, loadAutoPropagate: false },
  };
  revokedState.pausePermits = revokedState.pausePermits.map((p) => (p.key === 'loadAutoPropagate'
    ? { ...p, revoked: true, revokedOn: '2026-10-20', revokedById: null, revokedReason: 'migration abandoned' }
    : p));
  report = buildPausePermits(revokedState, { now: NOW });
  assert.equal(rowFor(report, 'loadAutoPropagate').stateKey, 'unpermitted', 'a revoked authority leaves an anonymous silence, not an expired one');

  // Every state is one of the declared five, and the partitions reconcile.
  for (const row of report.switches) assert.ok(PAUSE_PERMIT_STATES.includes(row.stateKey));
  assert.equal(report.board.statesReconcile, true);
  assert.equal(
    report.board.states.on + report.board.states.permitted + report.board.states.expired + report.board.states.unpermitted,
    report.board.switchesDeclaredN,
  );
});

/** Re-read the register through the SAME door the panel uses, from live state. */
function storeState(api) {
  const res = api.pausePermitReport();
  assert.equal(res.ok, true, res?.error);
  return res.report;
}

/* =====================================================================
 * 3. THE ATOMIC WRITE — permit and switch in one commit
 */

test('a permit is written in the same commit as the switch; a refused permit moves neither', () => {
  const { api, store, map } = seed(fixture());

  const refused = api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate', { reason: 'too short' }));
  assert.equal(refused.ok, false);
  assert.match(refused.error, /reason-too-short/);
  assert.equal(store.state.settings.workTurnAutoPropagate, true, 'the switch did not move');
  assert.equal(store.state.pausePermits.length, 0, 'no permit was written');

  const ok = api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
  assert.equal(ok.ok, true, ok?.error);
  // Both facts landed in ONE store revision.
  assert.equal(store.state.settings.workTurnAutoPropagate, false);
  assert.equal(store.state.pausePermits.length, 1);
  const stored = JSON.parse(map.get(STORAGE_KEY));
  assert.equal(stored.settings.workTurnAutoPropagate, false);
  assert.equal(stored.pausePermits.length, 1);
  assert.equal(stored.pausePermits[0].key, 'workTurnAutoPropagate');
  assert.equal(stored.pausePermits[0].to, '2026-12-01');
});

test('a second permit for one switch is refused, so a silence always has exactly one authoriser', () => {
  const { api } = seed(fixture());
  assert.equal(api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate')).ok, true);
  const second = api.updateSettings({ doaAutoPropagate: false }, GOOD_PERMIT('doaAutoPropagate'));
  assert.equal(second.ok, true);
  // Pausing the SAME switch again would need the live permit revoked first.
  const again = api.updateSettings({ workTurnAutoPropagate: true });
  assert.equal(again.ok, true);
  const after = api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate', { from: '2026-11-05', to: '2026-12-05' }));
  // The live permit still covers today, so a second one is refused.
  assert.equal(after.ok, false);
  assert.match(after.error, /already-permitted/, 'two authorisers for one silence are refused rather than stacked');
});

test('revoking withdraws the authority and brings the switch back up in one commit', () => {
  const { api, store } = seed(fixture());
  api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
  const permitId = store.state.pausePermits[0].id;
  const revoked = api.pausePermitRevoke(permitId, 'migration finished ahead of schedule');
  assert.equal(revoked.ok, true, revoked?.error);
  assert.equal(store.state.settings.workTurnAutoPropagate, true, 'the switch came back up');
  assert.equal(store.state.pausePermits[0].revoked, true, 'the permit is not deleted');
  assert.equal(store.state.pausePermits[0].revokedOn, '2026-11-12');
  assert.equal(store.state.pausePermits[0].revokedReason, 'migration finished ahead of schedule');
  // A permit is never removed, so a reader can always see what authorised a past silence.
  assert.equal(store.state.pausePermits.length, 1);
});

/* =====================================================================
 * 4. THE REACH CLAIM — re-derived from source, not hand-maintained
 */

test('the switches claimed to reach a second reporting line are exactly the switches a matrix-reading post-commit rule reads', () => {
  const root = path.resolve(process.cwd(), 'app/core/domain');
  const ruleFiles = new Set(Object.values(PAUSE_PERMIT_REACH_RULES));
  assert.equal(ruleFiles.size, PAUSE_PERMIT_MATRIX_REACH_SWITCHES.length, 'one rule named per reach switch');

  for (const [key, ruleModule] of Object.entries(PAUSE_PERMIT_REACH_RULES)) {
    const src = fs.readFileSync(path.join(root, ruleModule), 'utf8');
    assert.ok(src.includes(key), `${ruleModule} reads ${key}`);
    // The rule must actually read the reporting graph, or the reach claim is empty.
    assert.match(
      src,
      /buildMatrix|reportingLines|matrixLineScope|matrixJointApex|personAllocation/,
      `${ruleModule} reads the reporting graph, so silencing ${key} really can reach a second line`,
    );
  }
  // And the list is complete in the other direction: every post-commit rule
  // module that reads the reporting graph AND is gated by a switch is listed.
  const spine = fs.readFileSync(path.join(root, 'postCommit.js'), 'utf8');
  const imported = [...spine.matchAll(/from '\.\/([A-Za-z0-9]+Rules\.js)'/g)].map((m) => m[1]);
  const claimed = new Set(Object.values(PAUSE_PERMIT_REACH_RULES));
  for (const ruleModule of new Set(imported)) {
    const src = fs.readFileSync(path.join(root, ruleModule), 'utf8');
    if (!/buildMatrix|reportingLines|matrixLineScope|matrixJointApex|personAllocation/.test(src)) continue;
    const gated = [...src.matchAll(/([a-z][A-Za-z0-9]*Auto[A-Z][a-z]+)\s*(?:===|\!==)/g)].map((m) => m[1]);
    for (const key of gated) {
      const carried = fs.readFileSync(path.join(root, '../schema.js'), 'utf8').includes(key);
      if (!carried) continue;
      assert.ok(claimed.has(key), `${key} gates ${ruleModule}, which reads the reporting graph, so it belongs on the reach list`);
    }
  }
});

/* =====================================================================
 * 5. THE LEDGER'S REFUSALS — fail closed at the load boundary
 */

test('a permit naming a switch this workspace does not declare, or a weak reason, is dropped rather than repaired', () => {
  const warnings = [];
  const switches = ['workTurnAutoPropagate', 'loadAutoPropagate'];
  const dropped = normalizePausePermits([
    { id: 'p1', key: 'ghostAutoPropagate', authoriserId: null, reason: 'a long enough reason here', mitigation: 'a real measure', from: '2026-11-01', to: '2026-12-01', at: '2026-11-01T00:00:00.000Z' },
    { id: 'p2', key: 'workTurnAutoPropagate', authoriserId: null, reason: 'short', mitigation: 'a real measure', from: '2026-11-01', to: '2026-12-01', at: '2026-11-01T00:00:00.000Z' },
    { id: 'p3', key: 'loadAutoPropagate', authoriserId: null, reason: 'a long enough reason here', mitigation: 'a real measure', from: '2026-12-01', to: '2026-11-01', at: '2026-11-01T00:00:00.000Z' },
    { id: 'p4', key: 'loadAutoPropagate', authoriserId: null, reason: 'this reason is comfortably long', mitigation: 'a real measure stands in', from: '2026-11-01', to: '2026-12-01', at: '2026-11-01T00:00:00.000Z' },
  ], switches, warnings);
  assert.equal(dropped.length, 1, 'only the sound permit survives');
  assert.equal(dropped[0].id, 'p4');
  assert.ok(warnings.some((w) => /does not declare/.test(w)), 'an unknown switch is named');
  assert.ok(warnings.some((w) => /shorter than the declared floor/.test(w)), 'a weak reason is named, never padded');
  assert.ok(warnings.some((w) => /window is missing, reversed/.test(w)), 'a reversed window is named');
});

/* =====================================================================
 * 6. THE EXPORT — counts only, no identity, no free text
 */

test('CSV #136 carries counts only: no switch key, no authoriser, no person and no reason text', () => {
  const { api, store } = seed(fixture());
  api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
  api.updateSettings({ loadAutoPropagate: false });

  const report = buildPausePermits(store.state, { now: NOW, settings: store.state.settings });
  const rows = pausePermitCsvRows(report);
  const csv = exportWorkspaceCsv(store.state, 'automation-pause-permits', { now: NOW });
  assert.equal(csv.ok, true, csv?.error);
  const parsed = parseCsv(csv.csv);
  assert.deepEqual(parsed.headers, PAUSE_PERMIT_CSV_COLUMNS, 'the header is the declared column list');

  const everything = JSON.stringify(csv.csv);
  for (const secret of [
    'workTurnAutoPropagate', 'loadAutoPropagate',
    'Ada Chief', 'Milo Product', 'Nora Eng', 'Sam Builder',
    'migration', 'classification ledger', 'director reads',
    'ceo', 'prod', 'nora', 'sam',
  ]) {
    assert.equal(everything.includes(secret), false, `${secret} must not cross the export boundary`);
  }
  // …but the counts that matter ARE there, and equal the printed report.
  const row = rows[0];
  assert.equal(String(row.switches_declared), String(report.board.switchesDeclaredN));
  assert.equal(String(row.state_unpermitted), String(report.board.states.unpermitted));
  assert.equal(String(row.state_permitted), String(report.board.states.permitted));
  assert.equal(String(row.reach_off), String(report.board.reachOffN));
  assert.equal(String(row.states_reconcile), 'true');
  // Every declared column is populated: a blank cell in a one-row summary is a defect.
  for (const key of PAUSE_PERMIT_CSV_COLUMNS) {
    assert.notEqual(String(row[key] ?? ''), '', `column ${key} is populated`);
  }
});

/* =====================================================================
 * 7. DISPLAY == STORED across a real reload
 */

test('every figure the register prints is the figure a fresh store computes from the stored bytes', () => {
  const seeded = fixture();
  seeded.pausePermits = [agedPermit('loadAutoPropagate')];
  seeded.settings = { ...seeded.settings, loadAutoPropagate: false };
  const { api, store, map } = seed(normalizeState(seeded, { now: NOW }).state);
  api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
  api.updateSettings({ forecastAutoPropagate: false });

  const before = JSON.stringify(store.state);
  const live = buildPausePermits(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(JSON.stringify(store.state), before, 'a read mutates nothing');

  const reboot = createStore({
    storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) },
    now: () => NOW,
    idFactory: () => 'reboot',
  });
  reboot.load();
  assert.deepEqual(reboot.state.pausePermits, store.state.pausePermits, 'the permits survive the reload byte for byte');
  const fresh = buildPausePermits(reboot.state, { now: NOW, settings: reboot.state.settings });
  assert.deepEqual(fresh.board, live.board, 'every printed count is the stored count');
  assert.equal(pausePermitBriefText(fresh), pausePermitBriefText(live));
  assert.equal(fresh.board.states.permitted, 1);
  assert.equal(fresh.board.states.expired, 1);
  assert.equal(fresh.board.states.unpermitted, 1);
  assert.equal(fresh.board.switchesDeclaredN - fresh.board.states.on, 3, 'exactly three switches are off');
});

/* =====================================================================
 * 8. THE RULE — one ask, to the one seat that can authorise, idempotently
 */

test('RULE-PMP-01 escalates an unpermitted pause to the single authorising seat, once, and closes its ask when the pause is permitted', () => {
  // A dated permit keeps the pause's start PROVABLE. It is revoked (so the
  // authority is withdrawn and the switch comes back up), then the control is
  // paused again with no permit at all — leaving an anonymous silence whose
  // start the record can still date, which is exactly the case the rule exists
  // to escalate.
  const seeded = fixture({ pausePermitEscalateAfterDays: 0 });
  seeded.pausePermits = [agedPermit('workTurnAutoPropagate', { revoked: true, revokedOn: '2026-11-11', revokedReason: 'window closed' })];
  const { api, store } = seed(normalizeState(seeded, { now: NOW }).state);

  // The pause happens through the real door, so RULE-PMP-01 runs in the very
  // commit that silences the control — which is the point: the silence is
  // noticed immediately, not at some later audit.
  const paused = api.updateSettings({ workTurnAutoPropagate: false });
  assert.equal(paused.ok, true, paused?.error);

  const report = buildPausePermits(store.state, { now: NOW, settings: store.state.settings });
  const row = report.switches.find((r) => r.key === 'workTurnAutoPropagate');
  assert.equal(row.stateKey, 'unpermitted', 'a revoked authority leaves an anonymous silence');
  assert.equal(row.offDays, 42, 'dated from 2026-10-01, the only surviving evidence');
  assert.equal(row.pastGrace, true, 'the declared grace is 0 days');
  assert.equal(report.authoriser.unique, true, 'one seat sits above every reporting line');
  assert.equal(report.authoriser.seatId, 'ceo');

  const ruleAsks = () => store.state.delegations.filter((d) => String(d.support || '').includes(PAUSE_PERMIT_RULE_ID));
  const first = ruleAsks();
  assert.equal(first.length, 1, 'exactly one ask is issued');
  assert.equal(first[0].personId, 'ceo', 'and it is addressed to the single authorising seat');
  assert.match(first[0].expectedOutcome, /grant a dated permit|bring the switch back on/);
  assert.equal(store.state.pausePermitMarkers.filter((m) => m.kind === 'ask').length, 1);

  // A second write that changes nothing about the pause does not ask again.
  api.updateSettings({ forecastAutoPropagate: false });
  assert.equal(ruleAsks().length, 1, 'the ask is not duplicated');
  assert.equal(store.state.pausePermitMarkers.filter((m) => m.kind === 'ask').length, 1);

  // Permitting the pause closes the rule's own ask in the same transaction.
  const granted = api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate', { from: '2026-11-12', to: '2026-12-12' }));
  assert.equal(granted.ok, true, granted?.error);
  const after = ruleAsks();
  assert.equal(after[0].status, 'done', 'the rule closed its own ask');
  assert.match(after[0].completionNote, /RULE-PMP-01/);
});

test('a pause whose start the record cannot date makes no grace claim rather than assuming it began today', () => {
  const { api, store } = seed(fixture({ pausePermitEscalateAfterDays: 0 }));
  api.updateSettings({ forecastAutoPropagate: false });
  const report = buildPausePermits(store.state, { now: NOW, settings: store.state.settings });
  const row = report.switches.find((r) => r.key === 'forecastAutoPropagate');
  assert.equal(row.offSince, null);
  assert.equal(row.offDays, null);
  assert.equal(row.pastGrace, null, 'the grace is WITHHELD, not assumed');
  assert.equal(report.board.unprovableStartN >= 1, true, 'and it is counted apart so the grace figure is never read as covering it');
});

/* =====================================================================
 * 9. THE PANEL — prints the report, stores nothing, no console error
 */

function bootDocument() {
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

test('the panel prints the report the read model returned, and a render stores nothing', () => {
  const dom = bootDocument();
  const errors = [];
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)));
  try {
    const { api, store } = seed(fixture());
    api.updateSettings({ workTurnAutoPropagate: false }, GOOD_PERMIT('workTurnAutoPropagate'));
    api.updateSettings({ forecastAutoPropagate: false });

    const before = JSON.stringify(store.state);
    const report = buildPausePermits(store.state, { now: NOW, settings: store.state.settings });
    const node = renderPausePermitPanel({ state: store.state, now: NOW, api, query: new URLSearchParams('panel=pause-permits') });
    document.getElementById('view').appendChild(node);

    assert.equal(JSON.stringify(store.state), before, 'a render writes nothing');
    assert.equal(errors.length, 0, `no console error: ${errors.join('; ')}`);

    const panel = document.querySelector('[data-pmp="panel"]');
    assert.ok(panel, 'the panel rendered');
    // display == computed: the states claim on screen is the report's own fields.
    const claim = document.querySelector('[data-pmp="statesClaim"]').textContent;
    assert.match(claim, new RegExp(`${report.board.states.on} on`));
    assert.match(claim, new RegExp(`${report.board.states.unpermitted} unpermitted`));
    assert.match(claim, /States reconcile: yes/);

    // The brief on screen is the brief the model returns, character for character.
    const brief = document.querySelector('[data-pmp="brief"]').textContent;
    assert.equal(brief, pausePermitBriefText(report));

    // The authoriser of the live permit is printed by name, from the report.
    const text = panel.textContent;
    assert.ok(text.includes('Ada Chief') || text.includes('not recorded'), 'the authoriser is printed');
    assert.ok(text.includes('workTurnAutoPropagate'), 'the switch key is printed at the operator view');
  } finally {
    for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement']) delete globalThis[key];
  }
});

/* =====================================================================
 * 10. MIGRATION — additive, and no switch value is changed
 */

test('migration 144 → 145 adds two empty collections and four conventions, and turns no silent control back on', () => {
  const raw = {
    schemaVersion: 144,
    settings: { loadAutoPropagate: false, workTurnAutoPropagate: false, pausePermitDefaultDays: 999 },
    delegations: [],
  };
  const { raw: migrated, applied } = migrate(raw);
  assert.deepEqual(applied, ['144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152', '152 → 153', '153 → 154', '154 → 155']);
  assert.equal(migrated.schemaVersion, 155);
  assert.deepEqual(migrated.pausePermits, []);
  assert.deepEqual(migrated.pausePermitMarkers, []);
  // A workspace already running with a control off keeps it off: the pause now
  // simply reads `unpermitted` until somebody puts an authority on it. Silently
  // re-enabling a ruled-off control would be the worst possible migration.
  assert.equal(migrated.settings.loadAutoPropagate, false);
  assert.equal(migrated.settings.workTurnAutoPropagate, false);
  // An out-of-bounds stored convention is clamped by the loader, never carried
  // as a number nobody could have chosen.
  assert.equal(migrated.settings.pausePermitDefaultDays, 365);

  const loaded = normalizeState(migrated, { now: NOW });
  assert.equal(loaded.state.schemaVersion, 155);
  assert.deepEqual(loaded.state.pausePermits, []);
  assert.equal(loaded.state.settings.loadAutoPropagate, false);
});

/* =====================================================================
 * 11. THE CENSUS — 86 switches, and the register reads them all
 */

test('the census is derived from the settings in force, so a new engine’s switch appears without a second table', () => {
  const state = fixture();
  const switches = declaredSwitches(state.settings);
  assert.ok(switches.length >= 80, `the workspace declares ${switches.length} automatic switches`);
  assert.ok(switches.every((key) => /Auto[A-Z][a-z]+$/.test(key)));
  // A non-switch convention is not in the census: pausing it would stop nothing.
  assert.equal(switches.includes('leaderName'), false);
  assert.equal(switches.includes('workTurnWindowDays'), false);

  const report = read(state);
  assert.equal(report.board.switchesDeclaredN, switches.length);
  assert.equal(report.board.states.on, switches.length, 'a new workspace has every switch on');
  assert.equal(report.board.reachSwitchesN, PAUSE_PERMIT_MATRIX_REACH_SWITCHES.length);
});
