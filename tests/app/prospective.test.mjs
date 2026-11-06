/**
 * ADR-0094, Schema v97 — the Prospective Intervention Contract.
 *
 * These are integration tests, not unit tests of a form. They prove that ONE
 * `prospectiveDeclare` call, through the standard API gateway and the SHARED
 * post-commit spine, writes a governed DACI decision, an owned dated task,
 * typed provenance and one `rolls-up-to` edge per leadership ancestor in the
 * SAME atomic transaction; that a due cohort is graded exactly ONCE from dated
 * records other modules own; that altitudes above the declaring seat can read
 * the aggregate while a peer span cannot; and that no name, title or cohort id
 * survives into the brief, the CSV or any renderer panel.
 *
 * Named frameworks exercised: pre-registration (clinical-trial registry),
 * Brier proper scoring, Good Judgment Project / Tetlock superforecasting with
 * a strictly-prior sequential base rate, Wilson score interval, Jaques'
 * time-span of discretion for the five altitude horizons, Ashby/Beer's
 * requisite variety for the altitude x instrument cells, and small-cell
 * complementary suppression / fail-closed disclosure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv, serializeCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { activeSeat, buildSeats, canAct } from '../../app/core/domain/seat.js';
import { API_RIGHTS, workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES, routeRankWindow } from '../../app/core/domain/seatRegistry.js';
import { compileDisclosure } from '../../app/core/domain/disclosure.js';
import { MODULE_MANIFESTS } from '../../app/core/domain/disclosureManifests.js';
import {
  LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS, resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  brierFor, buildProspectiveCells, buildProspectiveReport, cohortFingerprint,
  freezeCohort, prospectiveBaseRate, prospectiveBriefText, prospectiveCsvRows,
  prospectiveHash, prospectiveWeekKey, resolveOutcome, wilsonInterval,
} from '../../app/core/domain/prospective.js';
import {
  PROSPECTIVE_ALTITUDE_HORIZONS, PROSPECTIVE_ENGINE_VERSION,
  PROSPECTIVE_INSTRUMENTS, PROSPECTIVE_PLAYBOOK, PROSPECTIVE_RULE_IDS,
} from '../../app/core/domain/prospectiveRegistry.js';
import {
  normalizeProspectiveContract, normalizeProspectiveContracts,
  normalizeProspectiveGrade, normalizeProspectiveGrades,
  normalizeProspectiveSettings, prospectiveConventions,
  validateProspectiveDeclaration,
} from '../../app/core/domain/prospectiveSchema.js';
import { renderProspective } from '../../app/views/prospective.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const HORIZON = new Date('2026-11-19T12:00:00.000Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const NAMES = ['Vera Executive', 'Dana Director', 'Mira Manager', 'Malik Manager', 'Lee Lead', 'Pat Lead', 'Ira Analyst', 'Ida Analyst'];
const TITLE = 'SENTINEL-CONTRACT-TITLE-NEVER-EXPORTS';
const CASE_TITLE = 'SENTINEL-CASE-TITLE-NEVER-EXPORTS';

/** A five-altitude tree with two sibling branches, so a peer span is testable. */
function tree({ activeSeatId = null, settings = {} } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, chainLeaderAltitude: 'chief', activeSeatId, ...settings };
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.prospectiveAutoPropagate = true;
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Malik Manager', role: 'Manager', level: 'manager', team: 'Claims', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', team: 'Claims', managerId: 'mgr2', status: 'active' },
    { id: 'ic1', name: 'Ira Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Ida Analyst', role: 'Analyst', level: 'ic', team: 'Claims', managerId: 'lead2', status: 'active' },
  ];
  // Four open cases owned in the billing branch. These are OTHER MODULES' dated
  // records; the prospective ledger never writes to them.
  state.cases = ['a', 'b', 'c', 'd'].map((letter) => ({
    id: `case-${letter}`,
    title: `${CASE_TITLE}-${letter}`,
    status: 'open',
    openedOn: '2026-10-01',
    personId: 'lead1',
    ownerId: 'lead1',
    severity: 'medium',
    createdAt: NOW.toISOString(),
  }));
  return state;
}

function normalize(state) {
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = tree({ activeSeatId: 'lead1' })) {
  const seeded = normalize(state);
  seeded.settings.activeSeatId = state.settings.activeSeatId;
  const values = new Map([[STORAGE_KEY, JSON.stringify(seeded)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-pic-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; }, values };
}

const linkRows = (state, sourceType, relation = null) => (state.links || []).filter((l) => l
  && l.sourceType === sourceType && (!relation || l.relation === relation));

/* ------------------------------------------------------------------ schema */

test('Schema v97 migrates additively: empty ledgers, declared conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 109);
  const migrated = migrate({ schemaVersion: 95, settings: { leaderName: 'Keep this' }, cases: [{ id: 'x' }] });
  assert.deepEqual(migrated.applied, ['95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109']);
  assert.equal(migrated.raw.schemaVersion, 109);
  assert.deepEqual(migrated.raw.prospectiveContracts, []);
  assert.deepEqual(migrated.raw.prospectiveGrades, []);
  assert.deepEqual(migrated.raw.prospectiveMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.prospectiveEvidenceFloor, 3);
  assert.equal(migrated.raw.settings.prospectiveCellFloor, 4);
  assert.equal(migrated.raw.settings.prospectiveSkillFloorPct, 10);
  assert.equal(migrated.raw.settings.prospectiveReviewDays, 14);
  assert.equal(migrated.raw.settings.prospectiveAutoPropagate, true);
  for (const key of ['prospectiveContracts', 'prospectiveGrades', 'prospectiveMarkers']) {
    assert.ok(createEmptyState()[key], `${key} is a collection`);
  }
});

test('the persistence boundary clamps conventions and drops malformed rows with warnings', () => {
  const settings = normalizeProspectiveSettings({ prospectiveEvidenceFloor: 999, prospectiveCellFloor: -3, prospectiveSkillFloorPct: 'abc', prospectiveAutoPropagate: false });
  assert.equal(settings.prospectiveEvidenceFloor, 20);
  assert.equal(settings.prospectiveCellFloor, 2);
  assert.equal(settings.prospectiveSkillFloorPct, 10);
  assert.equal(settings.prospectiveAutoPropagate, false);
  assert.equal(prospectiveConventions({}).prospectiveReviewDays, 14);
  const warnings = [];
  const contracts = normalizeProspectiveContracts([
    { id: 'ok', instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, declaredOn: '2026-11-04', horizonOn: '2026-11-18', cohortN: 4, cohortIds: ['a', 'b', 'c', 'd'], scopeSeatId: 'lead1', altitudeKey: 'frontline', rank: 1 },
    { id: 'bad', instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, declaredOn: '2026-11-04', horizonOn: '2026-11-18', cohortN: 4, cohortIds: [], scopeSeatId: 'lead1' },
    { id: 'ok', instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, declaredOn: '2026-11-04', horizonOn: '2026-11-18', cohortN: 4, cohortIds: ['a', 'b', 'c', 'd'], scopeSeatId: 'lead1' },
  ], warnings);
  assert.equal(contracts.length, 1, 'an empty cohort and a duplicate id are dropped, never repaired');
  assert.ok(warnings.length >= 2);
  const grades = normalizeProspectiveGrades([
    { id: 'g1', contractId: 'ok', gradedOn: '2026-11-19', instrumentKey: 'case-resolution', probabilityPct: 70, outcome: 1, brier: 0.09, observedN: 4, reachedN: 3 },
    { id: 'g1', contractId: 'ok', gradedOn: '2026-11-19', instrumentKey: 'case-resolution', probabilityPct: 70, outcome: 0, brier: 0.49, observedN: 4, reachedN: 1 },
    { id: 'g2', contractId: 'ok', gradedOn: '2026-11-19', instrumentKey: 'case-resolution', probabilityPct: 70, outcome: 'maybe', brier: 0.09, observedN: 4, reachedN: 3 },
  ], warnings);
  assert.equal(grades.length, 1, 'a contract is graded once; a malformed outcome is dropped');
  assert.equal(normalizeProspectiveGrade({ id: 'y', outcome: 3 }), null);
});

test('the declaration validator refuses certainties, non-integer horizons and unknown instruments', () => {
  assert.equal(validateProspectiveDeclaration({ instrumentKey: 'case-resolution', probabilityPct: 100, thresholdPct: 50, horizonDays: 14, title: 'x' }).ok, false);
  assert.equal(validateProspectiveDeclaration({ instrumentKey: 'not-real', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: 'x' }).ok, false);
  assert.equal(validateProspectiveDeclaration({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14.5, title: 'x' }).ok, false);
  assert.equal(validateProspectiveDeclaration({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: '' }).ok, false);
  const good = validateProspectiveDeclaration({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: '  Frozen bet  ' });
  assert.equal(good.ok, true);
  assert.equal(good.declaration.title, 'Frozen bet');
});

/* -------------------------------------------------------- pure arithmetic */

test('Brier proper scoring, Wilson interval, strict-prior base rate and exact threshold arithmetic', () => {
  assert.equal(brierFor(70, 1), 0.09);
  assert.equal(brierFor(70, 0), 0.49);
  assert.equal(brierFor(100, 0), 1);
  assert.ok(Math.abs(wilsonInterval(3, 4).pct - 75) < 0.01);
  assert.ok(wilsonInterval(3, 4).lowPct < wilsonInterval(3, 4).pct);
  assert.ok(wilsonInterval(3, 4).highPct > wilsonInterval(3, 4).pct);
  assert.equal(wilsonInterval(0, 0).refused, true);
  assert.equal(prospectiveHash('abc'), prospectiveHash('abc'));
  assert.notEqual(prospectiveHash('abc'), prospectiveHash('abd'));
  assert.equal(cohortFingerprint(['b', 'a']), cohortFingerprint(['a', 'b']), 'the frozen population is order-independent');
  assert.match(prospectiveWeekKey(NOW), /^2026-\d\d-\d\d$/, 'the marker window is a Monday-aligned ISO week key');
  assert.equal(prospectiveWeekKey(NOW), prospectiveWeekKey(new Date('2026-11-08T12:00:00.000Z')), 'one window per ISO week');
  const contract = { altitudeKey: 'frontline', instrumentKey: 'case-resolution' };
  assert.equal(prospectiveBaseRate([], contract, { priorFloor: 3 }).referenceBrier, null, 'no in-sample flattery');
  const prior = [0, 1, 1].map((outcome, i) => ({ altitudeKey: 'frontline', instrumentKey: 'case-resolution', outcome, gradedOn: `2026-10-0${i + 1}`, createdAt: NOW.toISOString() }));
  const base = prospectiveBaseRate(prior, contract, { priorFloor: 3, outcome: 1 });
  assert.equal(base.baseRatePct, 66.7);
  assert.equal(base.referenceBrier, 0.1109);
  assert.equal(resolveOutcome({ cases: [{ id: 'a', status: 'closed', resolvedOn: '2026-11-10' }] }, {
    instrumentKey: 'case-resolution', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    cohortIds: ['a'], thresholdPct: 100, probabilityPct: 70,
  }, { now: HORIZON }).outcome, 1);
  assert.equal(resolveOutcome({ cases: [{ id: 'a', status: 'closed', resolvedOn: '2026-11-20' }] }, {
    instrumentKey: 'case-resolution', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    cohortIds: ['a'], thresholdPct: 100, probabilityPct: 70,
  }, { now: HORIZON }).outcome, 0, 'a terminal event after the horizon is not a hit');
  assert.equal(resolveOutcome({ cases: [{ id: 'a', status: 'closed' }] }, {
    instrumentKey: 'case-resolution', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    cohortIds: ['a'], thresholdPct: 100, probabilityPct: 70,
  }, { now: HORIZON }).outcome, 0, 'an undated terminal event is refused as a hit');
  assert.equal(resolveOutcome({ cases: [] }, {
    instrumentKey: 'case-resolution', declaredOn: '2026-11-04', horizonOn: '2026-11-18',
    cohortIds: ['a'], thresholdPct: 100, probabilityPct: 70,
  }, { now: HORIZON }).ok, false, 'a missing cohort member refuses the grade');
});

test('the four instruments read only other modules’ dated collections', () => {
  assert.equal(PROSPECTIVE_INSTRUMENTS.length, 4);
  for (const instrument of PROSPECTIVE_INSTRUMENTS) {
    assert.ok(instrument.collection && instrument.unit && instrument.terminalLabel, `${instrument.key} is fully declared`);
  }
  assert.equal(Object.keys(PROSPECTIVE_ALTITUDE_HORIZONS).length, 5, 'Jaques time-span horizons cover all five altitudes');
  assert.equal(Object.keys(PROSPECTIVE_PLAYBOOK).length, 5, 'every altitude has its own job, view and permitted action');
  assert.equal(PROSPECTIVE_ENGINE_VERSION, 'prospective-contracts-v1');
  const state = tree();
  const built = buildSeats(normalize(state), { now: NOW, settings: normalize(state).settings });
  const seat = activeSeat(built);
  const frozen = freezeCohort(normalize(state), 'case-resolution', seat.scope, { declaredOn: '2026-11-04', horizonOn: '2026-11-18', evidenceFloor: 3 });
  assert.equal(frozen.ok, true);
  assert.equal(frozen.n, 4);
  assert.deepEqual(frozen.ids, ['case-a', 'case-b', 'case-c', 'case-d']);
  assert.equal(freezeCohort(normalize(state), 'case-resolution', seat.scope, { declaredOn: '2026-11-04', horizonOn: '2026-11-18', evidenceFloor: 20 }).ok, false);
  assert.equal(freezeCohort(normalize(state), 'decision-review', seat.scope, { declaredOn: '2026-11-04', horizonOn: '2026-11-18', evidenceFloor: 3 }).ok, false, 'an empty cohort is refused, not scored');
});

/* ------------------------------------- real cross-module propagation, one write */

test('ONE declaration writes a decision, an owned task and typed provenance through the SHARED spine', () => {
  const { store, api } = harness();
  const before = { decisions: (store.state.decisions || []).length, delegations: (store.state.delegations || []).length, links: (store.state.links || []).length };
  const result = api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.cohortN, 4);
  assert.equal(result.saved, true);
  const state = store.state;
  assert.equal(state.prospectiveContracts.length, 1);
  assert.equal(state.prospectiveContracts[0].cohortIds.length, 4);
  assert.equal(state.prospectiveContracts[0].cohortFingerprint, cohortFingerprint(state.prospectiveContracts[0].cohortIds));
  assert.equal(state.prospectiveContracts[0].engineVersion, PROSPECTIVE_ENGINE_VERSION);
  assert.equal(state.decisions.length, before.decisions + 1, 'RULE-PIC-01 opened one governed DACI decision');
  assert.equal(state.delegations.length, before.delegations + 1, 'RULE-PIC-01 opened one owned outcome task');
  const decision = state.decisions.at(-1);
  assert.match(decision.rationale, /RULE-PIC-01/);
  assert.equal(decision.chosen, '', 'the engine never approves the operational work');
  assert.equal(decision.outcome, 'pending');
  assert.equal(state.delegations.at(-1).status, 'active');
  assert.ok(state.delegations.at(-1).dueOn, 'the outcome task is dated');
  assert.equal(linkRows(state, 'prospectivecontract', 'pre-registers').length, 1);
  assert.equal(linkRows(state, 'prospectivecontract', 'tracks-followup').length, 1);
  assert.equal(state.prospectiveMarkers.filter((m) => m.kind === 'declared').length, 1);
  assert.ok(state.links.length > before.links + 4, 'typed edges were written in the same transaction');
  // The rule is on the shared spine and has a declared contract, not a private bus.
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'prospectiveRule'));
  assert.ok(PROPAGATION_CONTRACTS.some((c) => c.rule.name === 'prospectiveRule'));
  assert.ok((store.state.events || []).some((e) => e.type === 'prospective.declared'), 'the action history is append-only and meaningful');
});

test('the roll-up is REAL: every leadership ancestor gets a typed edge; a peer span reads nothing', () => {
  const { store, api } = harness();
  api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  const state = store.state;
  const rolled = linkRows(state, 'prospectivecontract', 'rolls-up-to').map((l) => l.targetId);
  assert.deepEqual([...rolled].sort(), ['dir1', 'mgr1', 'vp1'], 'frontline → manager → director → VP in ONE atomic write');
  for (const targetId of rolled) {
    const resolved = resolveLinkedEntity(state, 'person', targetId);
    assert.ok(resolved, `${targetId} is a real navigation target`);
  }
  // Upward read: director sees the frozen bet as an aggregate.
  const atDirector = clone(state);
  atDirector.settings.activeSeatId = 'dir1';
  const directorReport = buildProspectiveReport(atDirector, { now: NOW });
  assert.equal(directorReport.summary.declared, 1);
  assert.equal(directorReport.seat.rank, 3);
  assert.equal(directorReport.detailAllowed, false, 'a director reads the span, never the local title');
  // Downward/sideways boundary: a peer branch sees none of the billing bet.
  const atPeer = clone(state);
  atPeer.settings.activeSeatId = 'lead2';
  const peerReport = buildProspectiveReport(atPeer, { now: NOW });
  assert.equal(peerReport.summary.declared, 0, 'no sideways leakage across sibling spans');
  // Below director rank a pooled rate is withheld with a printed reason.
  const atLead = buildProspectiveReport(state, { now: NOW });
  assert.equal(atLead.coverage.refused, true);
  assert.match(atLead.coverage.reason, /withheld below director rank/);
  assert.equal(atLead.rows[0].title, TITLE, 'the declaring altitude may read its own title');
  assert.equal(directorReport.rows[0].title, '', 'the title never travels upward');
});

test('the grade is written ONCE from dated records other modules own, and rolls up the same tree', () => {
  const { store, api, setNow } = harness();
  const declared = api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  assert.equal(declared.ok, true);
  setNow(HORIZON);
  store.update((draft) => {
    for (const c of draft.cases) {
      if (c.id !== 'case-d') { c.status = 'closed'; c.resolvedOn = '2026-11-10'; }
    }
  }, { type: 'case.updated', entity: 'case', entityId: 'case-a', summary: 'closed three of four cases' });
  const scanned = api.prospectiveScan();
  assert.equal(scanned.ok, true, scanned.error);
  const state = store.state;
  assert.equal(state.prospectiveGrades.length, 1);
  const grade = state.prospectiveGrades[0];
  assert.equal(grade.observedN, 4);
  assert.equal(grade.reachedN, 3);
  assert.equal(grade.observedPct, 75);
  assert.equal(grade.outcome, 1, '75% >= the declared 50% threshold');
  assert.equal(grade.brier, brierFor(70, 1));
  assert.equal(grade.late, false);
  assert.equal(grade.baseRatePct, null, 'no strictly-prior sample yet; skill is refused, not invented');
  assert.equal(linkRows(state, 'prospectivegrade', 'grades-outcome').length, 1);
  assert.deepEqual(linkRows(state, 'prospectivegrade', 'rolls-up-to').map((l) => l.targetId).sort(), ['dir1', 'mgr1', 'vp1']);
  assert.equal(resolveLinkedEntity(state, 'prospectivegrade', grade.id).route, '#/prospective?panel=calibration');
  const contractNode = resolveLinkedEntity(state, 'prospectivecontract', grade.contractId);
  assert.ok(contractNode);
  assert.ok(!JSON.stringify(contractNode).includes(TITLE), 'the general resolver never projects a title or a cohort id');
  assert.ok(!JSON.stringify(contractNode).includes('case-a'));
  // Once-only + idempotent: a second scan writes nothing.
  const linksBefore = state.links.length;
  api.prospectiveScan();
  assert.equal(store.state.prospectiveGrades.length, 1, 'no second grade');
  assert.equal(store.state.links.length, linksBefore, 'no duplicate roll-up edges');
  assert.equal(store.state.prospectiveMarkers.filter((m) => m.kind === 'graded').length, 1);
});

test('an unobservable cohort is REFUSED loudly with owned reconciliation work, never scored as a miss', () => {
  const { store, api, setNow } = harness();
  api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  setNow(HORIZON);
  store.update((draft) => {
    draft.cases = draft.cases.filter((c) => c.id !== 'case-d');
  }, { type: 'case.deleted', entity: 'case', entityId: 'case-d', summary: 'one frozen cohort member is gone' });
  const beforeTasks = (store.state.delegations || []).length;
  const scanned = api.prospectiveScan();
  assert.equal(scanned.ok, true);
  const state = store.state;
  assert.equal(state.prospectiveGrades.length, 0, 'a missing member is not a failed bet');
  const refusals = state.prospectiveMarkers.filter((m) => m.kind === 'ungradable');
  assert.equal(refusals.length, 1);
  assert.match(refusals[0].note, /Grade refused/);
  assert.equal(state.delegations.length, beforeTasks + 1, 'one owned reconciliation task was opened');
  assert.match(state.delegations.at(-1).expectedOutcome, /dated terminal record/);
  const report = api.prospectiveRead();
  assert.equal(report.summary.ungradable, 1);
  assert.match(report.rows[0].reason, /missing/);
  api.prospectiveScan();
  assert.equal(store.state.prospectiveMarkers.filter((m) => m.kind === 'ungradable').length, 1, 'the refusal is once per week');
});

test('a reload preserves the frozen cohort, the once-only grade and every typed edge', () => {
  const { store, api, setNow, values } = harness();
  api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  setNow(HORIZON);
  store.update((draft) => {
    for (const c of draft.cases) { c.status = 'closed'; c.resolvedOn = '2026-11-10'; }
  }, { type: 'case.updated', entity: 'case', entityId: 'case-a', summary: 'closed the frozen cohort' });
  api.prospectiveScan();
  const persisted = values.get(STORAGE_KEY);
  assert.ok(persisted);
  const reloaded = normalizeState(JSON.parse(persisted), { now: HORIZON });
  assert.deepEqual(reloaded.warnings, [], 'a real transaction reloads without repair warnings');
  const state = reloaded.state;
  assert.equal(state.prospectiveContracts.length, 1);
  assert.equal(state.prospectiveGrades.length, 1);
  assert.equal(state.prospectiveGrades[0].brier, 0.09);
  assert.equal(state.prospectiveContracts[0].cohortIds.length, 4);
  assert.ok(state.links.some((l) => l.relation === 'pre-registers'));
  assert.ok(state.links.some((l) => l.relation === 'grades-outcome'));
  assert.equal(state.links.filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'prospectivecontract').length, 3);
});

/* ------------------------------------------------------------ governance */

test('permissions: declared rights, rank windows, refuse-unknown and director+ conventions', () => {
  assert.equal(API_RIGHTS.prospectiveDeclare, 'declare-prospective');
  assert.equal(API_RIGHTS.prospectiveScan, 'declare-prospective');
  assert.equal(API_RIGHTS.prospectiveSetConventions, 'declare-prospective');
  assert.deepEqual(routeRankWindow('prospective'), { floor: 1, ceiling: 5, kind: 'open' });
  assert.equal(ACTION_RIGHTS['declare-prospective'].minRank, 1);
  assert.equal(RECORD_POLICIES.prospectiveContracts.detailCeiling, 0, 'raw cohort ids never enter declared-seat view state');
  assert.equal(MODULE_MANIFESTS.prospective.adapterScoped, true);
  assert.equal(MODULE_MANIFESTS.prospective.detailCeiling, 0);
  const state = normalize(tree({ activeSeatId: 'lead1' }));
  state.settings.activeSeatId = 'lead1';
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  const compiled = compileDisclosure(state, seat, built, { now: NOW, settings: state.settings });
  const verdict = workspaceRouteVerdict('prospective', seat, { state, built, now: NOW, settings: state.settings, compiled });
  assert.equal(verdict.allow, true, verdict.reason);
  assert.equal(verdict.detail, false, 'only the scoped aggregate is readable, never item detail');
  assert.equal(canAct('declare-prospective', seat).allow, true);
  const { api: frontline } = harness();
  const refused = frontline.prospectiveSetConventions({ evidenceFloor: 9 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /director rank/);
  const director = harness(tree({ activeSeatId: 'dir1' }));
  const allowed = director.api.prospectiveSetConventions({ evidenceFloor: 9 });
  assert.equal(allowed.ok, true, allowed.error);
  assert.equal(director.store.state.settings.prospectiveEvidenceFloor, 9);
  assert.equal(typeof frontline.prospectiveRead, 'function');
  assert.equal(frontline.prospectiveDoesNotExist, undefined, 'an unknown method fails closed by absence');
});

test('the four rule ids, the graph vocabulary and the propagation contract are all declared', () => {
  assert.deepEqual(Object.values(PROSPECTIVE_RULE_IDS), ['RULE-PIC-01', 'RULE-PIC-02', 'RULE-PIC-03', 'RULE-PIC-04']);
  for (const type of ['prospectivecontract', 'prospectivegrade']) {
    assert.ok(LINK_ENTITY_TYPES.includes(type));
    assert.equal(LINK_ENTITY_COLLECTIONS[type], type === 'prospectivecontract' ? 'prospectiveContracts' : 'prospectiveGrades');
  }
  for (const relation of ['pre-registers', 'grades-outcome', 'rolls-up-to', 'tracks-followup']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} is in the allowed vocabulary`);
  }
  for (const relation of ['pre-registers', 'grades-outcome']) {
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), `${relation} is discovered provenance, not a manual claim`);
  }
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule.name === 'prospectiveRule');
  assert.ok(contract);
  assert.ok(contract.writes.includes('prospectiveGrades'));
  assert.ok(contract.writes.includes('links'));
});

/* -------------------------------------------------- leak oracle + surfaces */

test('the brief, the CSV and all five renderer panels carry no name, title, cohort id or amount', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const { store, api, setNow } = harness();
  api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  setNow(HORIZON);
  store.update((draft) => {
    for (const c of draft.cases) { c.status = 'closed'; c.resolvedOn = '2026-11-10'; }
  }, { type: 'case.updated', entity: 'case', entityId: 'case-a', summary: 'closed the frozen cohort' });
  api.prospectiveScan();
  const state = store.state;
  const brief = prospectiveBriefText(api.prospectiveRead());
  const rows = prospectiveCsvRows(api.prospectiveRead());
  const csv = serializeCsv(['row_kind', 'altitude', 'rank', 'instrument', 'contracts_n', 'graded_n', 'reached_n', 'observed_pct', 'mean_brier', 'mean_reference_brier', 'skill_pct', 'interval_low_pct', 'interval_high_pct', 'refused', 'reason'], rows);
  const leaked = (text, { allowTitle = false } = {}) => {
    for (const name of NAMES) assert.ok(!text.includes(name), `never prints ${name}`);
    if (!allowTitle) assert.ok(!text.includes(TITLE), 'never prints the contract title');
    assert.ok(!text.includes(CASE_TITLE), 'never prints a cohort record title');
    assert.ok(!text.includes('case-a'), 'never prints a cohort id');
    assert.ok(!text.includes('pic-'), 'never prints a ledger id');
    assert.ok(!/undefined|NaN/.test(text), 'no undefined or NaN cell');
  };
  leaked(brief);
  leaked(csv);
  leaked(JSON.stringify(rows));
  assert.ok(brief.includes('Brier'), 'the brief names the proper scoring rule');
  assert.ok(brief.includes('WITHHELD') || brief.includes('Wilson'), 'the brief states its refusal or its interval');
  assert.equal(rows.length, 7, '4 cell rows + ... are bounded aggregate rows only');
  for (const seatId of ['lead1', 'mgr1', 'dir1', 'vp1']) {
    const copy = clone(state);
    copy.settings.activeSeatId = seatId;
    const report = buildProspectiveReport(copy, { now: HORIZON });
    for (const panel of ['desk', 'contracts', 'instruments', 'calibration', 'certificate']) {
      const node = renderProspective({
        state: copy,
        now: HORIZON,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        refresh: () => {},
        api: {
          prospectiveRead: () => report,
          prospectiveDeclare: () => ({ ok: true }),
          prospectiveScan: () => ({ ok: true }),
          prospectiveSetConventions: () => ({ ok: true }),
          prospectiveBriefText: () => ({ ok: true, text: brief }),
          prospectiveCsvRows: () => ({ ok: true, rows }),
        },
      });
      assert.ok(node, `${panel} renders at ${seatId}`);
      const html = node.outerHTML;
      // The declaring (rank <= 2) altitude may read its OWN contract title;
      // no title may ever climb above it, and no other identifier may appear.
      leaked(html, { allowTitle: report.detailAllowed });
      if (!report.detailAllowed) assert.ok(!html.includes(TITLE), `${panel} at ${seatId} never lifts a local title upward`);
      assert.equal(node.querySelectorAll('[role="tab"]').length, 5, 'five keyboard-reachable panel tabs');
      assert.ok(node.querySelector('h1') || node.querySelector('h2'), `${panel} has semantic headings`);
    }
  }
  delete globalThis.window;
  delete globalThis.document;
});

test('CSV scope #92 is aggregate-only, refusal-honest and refuses an unknown scope', () => {
  assert.equal(CSV_EXPORTS.length, 101);
  const descriptor = CSV_EXPORTS.find((item) => item.key === 'prospective-contracts');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const state = normalize(tree({ activeSeatId: 'dir1' }));
  state.settings.activeSeatId = 'dir1';
  state.prospectiveContracts = [normalizeProspectiveContract({
    id: 'contract-1', title: TITLE, instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50,
    declaredOn: '2026-11-04', horizonOn: '2026-11-18', cohortN: 4,
    cohortIds: ['case-a', 'case-b', 'case-c', 'case-d'], scopeSeatId: 'lead1', altitudeKey: 'frontline', rank: 1,
  })].filter(Boolean);
  const out = exportWorkspaceCsv(state, 'prospective-contracts', { now: HORIZON });
  assert.equal(out.ok, true, 'the declared scope is a real export, not an unknown scope');
  const text = out.csv;
  assert.ok(text.includes('row_kind'));
  assert.ok(!text.includes(TITLE));
  assert.ok(!text.includes('case-a'));
  assert.ok(text.includes('row_kind'));
  assert.ok(text.includes('workspace'));
  const unknown = exportWorkspaceCsv(state, 'prospective-not-a-scope');
  assert.equal(unknown.ok, false);
});

test('UI FLOW: the declare dialog writes a frozen contract and the shared spine propagates it', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const { store, api } = harness();
  const report = buildProspectiveReport(store.state, { now: NOW });
  const node = renderProspective({
    state: store.state,
    now: NOW,
    query: new URLSearchParams('panel=desk'),
    navigate: () => {},
    refresh: () => {},
    api,
  });
  const trigger = Array.from(node.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Pre-register a bet');
  assert.ok(trigger, 'the declare action is a real, keyboard-reachable button');
  trigger.click();
  const dialog = dom.window.document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'an accessible dialog opens — no window.prompt');
  const instrument = dialog.querySelector('select[aria-label="Observable instrument"]');
  const probability = dialog.querySelector('input[aria-label="Declared probability percent"]');
  const threshold = dialog.querySelector('input[aria-label="Declared threshold percent"]');
  const horizon = dialog.querySelector('input[aria-label="Horizon in days"]');
  const title = dialog.querySelector('input[aria-label="Name the bet"]');
  assert.ok(instrument && probability && threshold && horizon && title, 'every input is labelled');
  instrument.value = 'case-resolution';
  probability.value = '70';
  threshold.value = '50';
  horizon.value = '14';
  title.value = TITLE;
  const form = dialog.querySelector('form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(store.state.prospectiveContracts.length, 1, 'the UI wrote a real frozen contract');
  assert.equal(store.state.prospectiveContracts[0].title, TITLE);
  assert.equal(store.state.decisions.filter((d) => /RULE-PIC-01/.test(d.rationale || '')).length, 1);
  assert.equal(linkRows(store.state, 'prospectivecontract', 'rolls-up-to').length, 3, 'the UI flow rolled up three altitudes in one write');
  assert.equal(dom.window.document.querySelector('[role="dialog"]'), null, 'the dialog closes after a successful submit');
  assert.ok(api.prospectiveRead().summary.declared === 1);
  delete globalThis.window;
  delete globalThis.document;
});

test('an unresolved seat and an unknown method fail closed at the API boundary', () => {
  const { store, api } = harness();
  store.state.settings.activeSeatId = '__not-a-person__';
  const refused = api.prospectiveDeclare({ instrumentKey: 'case-resolution', probabilityPct: 70, thresholdPct: 50, horizonDays: 14, title: TITLE });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /seat|valid/i);
  assert.equal(store.state.prospectiveContracts.length, 0, 'nothing was written');
});
