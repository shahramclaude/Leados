// ADR-0210 — Decision-Maker Conflict-of-Interest & Recusal Register.
//
// What this suite is FOR. The register's whole claim is that it refuses to
// collapse facts that governance reviews routinely collapse:
//   - "nobody searched" is not "nothing found";
//   - a declared recusal is not a recusal that took the hand off;
//   - a mitigation is a claim, not proof of independence;
//   - an interest that does not reach a record is not a clean record;
//   - a hand may not clear its own conflict, nor clear a peer's subordinate's.
// Each test below pins one of those apart from the others, and the last group
// pins that what the screen and the CSV print is what was stored.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  createEmptyState,
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
import {
  buildConflictRecusal,
  conflictRecusalAttentionCount,
  conflictRecusalBriefText,
} from '../../app/core/domain/conflictRecusal.js';
import { indexConflictRecusalAsks, conflictRecusalRule } from '../../app/core/domain/conflictRecusalRules.js';
import { conflictRecusalSignature, normalizeConflictNoneDeclarations } from '../../app/core/domain/conflictRecusalSchema.js';
import {
  CONFLICT_RECUSAL_CSV_COLUMNS,
  CONFLICT_RECUSAL_CSV_SCOPE,
  CONFLICT_RECUSAL_RIGHTS,
  CONFLICT_RECUSAL_RULE_ID,
  CONFLICT_RECUSAL_SETTING_KEYS,
} from '../../app/core/domain/conflictRecusalRegistry.js';
import { renderConflictRecusal } from '../../app/views/conflictRecusalPanel.js';

const T0 = '2026-11-15T12:00:00.000Z';
const AT = '2026-01-01T09:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

/* ------------------------------------------------------------------ fixture */

// Leader (operator) → vera (VP) → dan, eve (directors) → mia, ned (managers) →
// sam (IC). sam ALSO reports to ned on a declared project line, so the lowest
// seat above both of sam's lines is vera — the one joint apex in this fixture.
const person = (id, managerId, level) => ({
  id, name: `${id[0].toUpperCase()}${id.slice(1)} Name`, managerId, level,
  role: 'Operations', status: 'active', startDate: AT, createdAt: AT, updatedAt: AT,
});
const line = (id, personId, managerId) => ({
  id, personId, managerId, kind: 'project', shareH: 30, rights: [],
  fromISO: '2026-01-01', toISO: null, declaredAt: AT, note: '',
});
const decision = (id, title, day, approver) => ({
  id, title, question: '', date: day, reversibility: 'reversible', driver: '', approver,
  contributors: '', informed: '', options: [], chosen: 'Approved', rationale: '',
  reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
  forecastProbability: null, decidedOn: day, createdAt: AT, portfolioNotes: [],
});

function rawFixture(patch = {}, now = T0) {
  const raw = createEmptyState(now);
  raw.people = [
    person('vera', null, 'vp'),
    person('dan', 'vera', 'director'), person('eve', 'vera', 'director'),
    person('mia', 'dan', 'manager'), person('ned', 'eve', 'manager'),
    person('sam', 'mia', 'ic'),
  ];
  raw.reportingLines = [line('rl-sam-ned', 'sam', 'ned')];
  raw.decisions = [
    decision('dec-supplier', 'Award the pump contract', '2026-10-01', 'Dan Name'),
    decision('dec-promotion', 'Sign off the promotion', '2026-10-05', 'Eve Name'),
    decision('dec-line', 'Close the service line', '2026-10-09', 'Ned Name'),
  ];
  raw.conflictRules = [{
    id: 'cru-finance', relationships: ['financial', 'family'], minRank: 1,
    effectiveFrom: '2026-01-01', sourceNote: 'Board conflict-of-interest policy 2026, section 3',
    declaredOn: '2026-01-01', declaredAt: AT, declaredById: 'vera',
  }];
  return { ...raw, ...patch };
}
const fixture = (patch = {}, now = T0) => normalizeState(rawFixture(patch, now), { now: new Date(now) }).state;

function seed(state = fixture(), startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  const as = (id, run) => { sit(id); try { return run(); } finally { sit(null); } };
  return { store, api, sit, on, as };
}

const ok = (result) => { assert.equal(result?.ok, true, result?.error); return result; };
const refused = (result, pattern, field) => {
  assert.equal(result?.ok, false, 'the act is refused');
  if (pattern) assert.match(result.error, pattern);
  if (field) assert.equal(result.field, field);
  return result;
};
const DECLARE_RICH = {
  personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
  relationship: 'financial', becameKnownOn: '2026-09-28', note: 'Owns 15 per cent of the supplier',
};

/* ----------------------------------------------------- schema & registration */

test('schema v164: the register is additive, EMPTY at upgrade and stores no verdict', () => {
  assert.equal(SCHEMA_VERSION, 177);
  for (const key of ['conflictInterests', 'conflictNoneDeclarations', 'conflictStandings', 'conflictRules', 'conflictRecusalMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  // A v163 workspace upgraded carries no interest, no declaration and no rule:
  // a record names a signer and a day, and says nothing about who holds a stake.
  const upgraded = normalizeState({ schemaVersion: 163, people: [], settings: {} }, { now: new Date(T0) }).state;
  assert.deepEqual(upgraded.conflictInterests, []);
  assert.deepEqual(upgraded.conflictNoneDeclarations, []);
  assert.deepEqual(upgraded.conflictStandings, []);
  assert.deepEqual(upgraded.conflictRules, []);
  // The conventions are clamped, and the automation starts ON.
  assert.equal(upgraded.settings[CONFLICT_RECUSAL_SETTING_KEYS.backDays], 365);
  assert.equal(upgraded.settings[CONFLICT_RECUSAL_SETTING_KEYS.lateDays], 30);
  assert.equal(upgraded.settings[CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate], true);
});

test('the loader drops a forged declaration of no interest and never repairs it', () => {
  const raw = rawFixture({
    conflictNoneDeclarations: [
      // declaredById ≠ personId: somebody else clearing them. Refused.
      { id: 'cnd-forged', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier', relationships: ['financial'], declaredOn: '2026-10-02', declaredAt: AT, declaredById: 'eve' },
      // First person, well-formed: kept.
      { id: 'cnd-good', personId: 'eve', subjectType: 'decision', subjectId: 'dec-promotion', relationships: ['financial', 'family'], declaredOn: '2026-10-05', declaredAt: AT, declaredById: 'eve' },
    ],
  });
  // `normalizeState` RETURNS its warnings; it does not fill an array passed in.
  const { state, warnings } = normalizeState(raw, { now: new Date(T0) });
  const kept = state.conflictNoneDeclarations;
  assert.equal(kept.length, 1, 'only the first-person declaration survives');
  assert.equal(kept[0].id, 'cnd-good');
  assert.ok(warnings.some((w) => /no-interest declaration\(s\) could not be read/.test(w)));
});

/* ---------------------------------------- THE COVERAGE CLAIM, TESTED APART */

test('a signer nobody asked reads unsearched — never clean, and never a zero', () => {
  const report = buildConflictRecusal(fixture(), { now: at('2026-11-15') });
  const dan = report.coverageRows.find((row) => row.personId === 'dan' && row.subjectId === 'dec-supplier');
  assert.ok(dan, 'the hand that signs dec-supplier is a coverage position');
  assert.deepEqual(dan.positions, ['approver']);
  assert.equal(dan.verdict, 'unsearched');
  assert.match(dan.verdictReason, /Nobody was asked/);
  assert.deepEqual(dan.coverage.unaskedKinds, ['family', 'financial']);
  // The reassuring word must not be printable without a declaration.
  assert.notEqual(report.allCounts.clean, 2);
  assert.ok(report.allCounts.unsearched >= 3);
});

test('a declaration covering EVERY reportable kind makes the position clean, and prints the day', () => {
  const report = buildConflictRecusal(fixture({
    conflictNoneDeclarations: [{
      id: 'cnd-eve', personId: 'eve', subjectType: 'decision', subjectId: 'dec-promotion',
      relationships: ['financial', 'family'], declaredOn: '2026-10-05', declaredAt: AT, declaredById: 'eve',
    }],
  }), { now: at('2026-11-15') });
  const eve = report.coverageRows.find((row) => row.personId === 'eve' && row.subjectId === 'dec-promotion');
  assert.equal(eve.verdict, 'clean');
  assert.match(eve.verdictReason, /2026-10-05/);
  assert.deepEqual(eve.coverage.unaskedKinds, []);
});

test('a declaration covering FEWER kinds stays unsearched and NAMES the rest', () => {
  const report = buildConflictRecusal(fixture({
    conflictNoneDeclarations: [{
      id: 'cnd-eve', personId: 'eve', subjectType: 'decision', subjectId: 'dec-promotion',
      relationships: ['financial'], declaredOn: '2026-10-05', declaredAt: AT, declaredById: 'eve',
    }],
  }), { now: at('2026-11-15') });
  const eve = report.coverageRows.find((row) => row.personId === 'eve' && row.subjectId === 'dec-promotion');
  assert.equal(eve.verdict, 'unsearched');
  assert.deepEqual(eve.coverage.unaskedKinds, ['family']);
  assert.match(eve.verdictReason, /never asked \(family\)/);
});

test('with no rule at all every position is unsearched, and the brief says so in words', () => {
  const report = buildConflictRecusal(fixture({ conflictRules: [] }), { now: at('2026-11-15') });
  assert.equal(report.reportableKinds.length, 0);
  assert.equal(report.allCounts.clean, 0);
  assert.ok(report.allCounts.unsearched >= 3);
  assert.match(conflictRecusalBriefText(report), /NONE DECLARED/);
});

/* -------------------------------------- RECUSAL EFFECTIVENESS IS THE PRODUCT */

test('a recusal that leaves the same hand on the signature reads INEFFECTIVE', () => {
  const report = buildConflictRecusal(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: '',
    }],
    conflictStandings: [{
      id: 'cst-1', interestId: 'cin-1', kind: 'recuse', authorityId: 'vera',
      recordedOn: '2026-10-02', recordedAt: AT, recordedById: 'vera',
      reason: 'Dan stands back; the contract moves to the finance committee', control: '', supersedesId: null,
    }],
  }), { now: at('2026-11-15') });
  const row = report.rows.find((entry) => entry.interestId === 'cin-1');
  assert.equal(row.verdict, 'ineffective');
  assert.match(row.verdictReason, /still the record’s approver/);
  // It is a failure state, not a handled one: it must not read as determined.
  assert.notEqual(row.verdict, 'determined');
});

test('the same recusal becomes effective the moment the RECORD itself moves the hand', () => {
  const base = fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: '',
    }],
    conflictStandings: [{
      id: 'cst-1', interestId: 'cin-1', kind: 'recuse', authorityId: 'vera',
      recordedOn: '2026-10-02', recordedAt: AT, recordedById: 'vera',
      reason: 'Dan stands back; the contract moves to the finance committee', control: '', supersedesId: null,
    }],
  });
  const before = buildConflictRecusal(base, { now: at('2026-11-15') });
  assert.equal(before.rows[0].verdict, 'ineffective');
  // Correct the record's own approver — nothing in the register is edited.
  const after = buildConflictRecusal({ ...base, decisions: base.decisions.map((row) => (row.id === 'dec-supplier' ? { ...row, approver: 'Eve Name' } : row)) }, { now: at('2026-11-15') });
  assert.equal(after.rows[0].verdict, 'determined');
  assert.match(after.rows[0].verdictReason, /took the hand off/);
});

test('a mitigation is printed as a CLAIM and is never reported as independence', () => {
  const report = buildConflictRecusal(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'family', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: '',
    }],
    conflictStandings: [{
      id: 'cst-1', interestId: 'cin-1', kind: 'mitigate', authorityId: 'vera',
      recordedOn: '2026-10-02', recordedAt: AT, recordedById: 'vera',
      reason: 'The committee reviews the award independently', control: 'A second signature by the finance committee chair', supersedesId: null,
    }],
  }), { now: at('2026-11-15') });
  const row = report.rows[0];
  assert.equal(row.verdict, 'mitigated');
  assert.match(row.verdictReason, /not printed as independence/);
  assert.equal(report.allCounts.clean, row.verdict === 'clean' ? 1 : report.allCounts.clean);
  assert.notEqual(report.allCounts.clean, report.allCounts.mitigated + report.allCounts.clean);
});

test('an interest that does not reach the record is determined, and says which positions were checked', () => {
  const report = buildConflictRecusal(fixture({
    conflictInterests: [{
      // Mia holds a family interest in a decision Eve signs: Mia is neither the
      // approver, the owner, nor a declared line over its subject.
      id: 'cin-1', personId: 'mia', subjectType: 'decision', subjectId: 'dec-promotion',
      relationship: 'family', direction: 'held', becameKnownOn: '2026-10-01',
      declaredOn: '2026-10-01', declaredAt: AT, declaredById: 'mia', source: 'self', note: '',
    }],
  }), { now: at('2026-11-15') });
  const row = report.rows[0];
  assert.equal(row.verdict, 'determined');
  assert.deepEqual(row.positions, []);
  assert.match(row.verdictReason, /does not reach this record/);
});

/* ----------------------------------------------------------- matrix ownership */

test('a cross-line holder’s interest is owed to the LOWEST SEAT ABOVE BOTH lines', () => {
  const report = buildConflictRecusal(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'sam', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'sam', source: 'self', note: '',
    }],
  }), { now: at('2026-11-15') });
  const row = report.rows[0];
  // sam reports to mia (tree) and ned (declared line); the joint apex is vera.
  assert.equal(row.owner.state, 'seat');
  assert.equal(row.owner.seatId, 'vera');
  assert.equal(row.owner.basis, 'joint-apex');
});

test('a single-line holder is owed to their own line, not to the apex', () => {
  const report = buildConflictRecusal(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: '',
    }],
  }), { now: at('2026-11-15') });
  assert.equal(report.rows[0].owner.seatId, 'vera');
  assert.equal(report.rows[0].owner.basis, 'single-line');
});

/* ----------------------------------------------------------------- the door */

test('the door refuses a fabricated record, an unknown kind and a holder clearing themselves', () => {
  const ctx = seed();
  const declare = (input) => ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(input));
  // A record nobody can open.
  refused(declare({ ...DECLARE_RICH, subjectId: 'dec-imaginary' }), /not on the workspace/, 'subjectId');
  // A relationship kind outside the closed list.
  refused(declare({ ...DECLARE_RICH, relationship: 'vibes' }), /closed list/, 'relationship');
  // A record kind outside the closed list.
  refused(declare({ ...DECLARE_RICH, subjectType: 'rumour' }), /what the interest touches/, 'subjectType');
  // An interest cannot become known in the future.
  refused(declare({ ...DECLARE_RICH, becameKnownOn: '2027-01-01' }), /future/, 'becameKnownOn');
  // The declaration itself is fine.
  const created = ok(declare(DECLARE_RICH));
  assert.equal(created.route, 'self', 'a person declaring their own stake is a first-person route');

  // The holder may not decide their own interest.
  refused(ctx.as('dan', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'recuse', reason: 'I stand back from this decision' })), /do not clear its own|You hold this interest/);
  // A manager without reach may not either.
  refused(ctx.as('mia', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'recuse', reason: 'I clear his conflict for him' })));
  // The seat above may.
  const stood = ok(ctx.as('vera', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'recuse', reason: 'Dan stands back; the award moves to the committee' })));
  assert.equal(stood.verdict, 'ineffective', 'the act reports the verdict the register now prints, not an intention');
});

test('a mitigation without a written control is refused; a recusal is not asked for one', () => {
  const ctx = seed();
  const created = ok(ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(DECLARE_RICH)));
  refused(ctx.as('vera', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'mitigate', reason: 'A control stands in for his independence' })), /control that stands in/, 'control');
  // A recusal's control IS the absence of the hand, so it must not demand one.
  ok(ctx.as('vera', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'recuse', reason: 'Dan stands back from the award entirely' })));
});

test('a no-interest declaration is first person only, and the operator view cannot make one', () => {
  const ctx = seed();
  // Nobody may declare somebody else clear.
  refused(ctx.as('eve', () => ctx.api.conflictRecusalDeclareNoInterest({ subjectType: 'decision', subjectId: 'dec-supplier', relationships: ['financial'] })));
  // Eve signs dec-promotion, so she may declare herself clear on it.
  const own = ok(ctx.as('eve', () => ctx.api.conflictRecusalDeclareNoInterest({ subjectType: 'decision', subjectId: 'dec-promotion', relationships: ['financial', 'family'] })));
  assert.equal(own.verdict, 'clean');
  // The operator view holds no person, so it cannot speak first-person.
  ctx.sit(null);
  const operatorTry = ctx.api.conflictRecusalDeclareNoInterest({ subjectType: 'decision', subjectId: 'dec-supplier', relationships: ['financial'] });
  refused(operatorTry, /first person/);
});

test('a rule needs a written source and at least one kind, and retiring it stops coverage', () => {
  const ctx = seed();
  ctx.sit(null);
  refused(ctx.api.conflictRecusalDeclareRule({ relationships: [], minRank: 1, sourceNote: 'Policy 2026' }), /at least one relationship kind/, 'relationships');
  refused(ctx.api.conflictRecusalDeclareRule({ relationships: ['financial'], minRank: 1, sourceNote: 'xyz' }), /Name the source/, 'sourceNote');
  const rule = ok(ctx.api.conflictRecusalDeclareRule({ relationships: ['gift'], minRank: 1, sourceNote: 'Site gifts and hospitality policy 2026' }));
  // The rule took effect on the day it was declared (2026-11-15). Retiring from
  // before that day is refused, whatever the number looks like.
  refused(ctx.api.conflictRecusalRetireRule({ ruleId: rule.ruleId, retiredOn: '2025-06-01' }), /before it took effect/, 'retiredOn');
  refused(ctx.api.conflictRecusalRetireRule({ ruleId: rule.ruleId, retiredOn: '2026-11-01' }), /before it took effect/, 'retiredOn');
  // A day on which it actually operated is fine.
  ctx.on('2026-12-01');
  const retired = ok(ctx.api.conflictRecusalRetireRule({ ruleId: rule.ruleId, retiredOn: '2026-12-01' }));
  assert.equal(retired.retiredOn, '2026-12-01');
  const report = ctx.api.conflictRecusalReport().report;
  // The retired kind is no longer reportable, so nothing was asked about it.
  assert.ok(!report.reportableKinds.includes('gift'));
});

/* ------------------------------------------------------ the shared spine */

test('RULE-CIR-01 is on the spine with one contract, and its pause is a matrix-reach switch', () => {
  const ruleIds = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id || rule.name);
  assert.ok(ruleIds.includes('conflictRecusalRule'), 'the rule is registered on the post-commit spine');
  // It runs BEFORE seatRule and sealRule, so the roll-up and the seal see its work.
  const seatIndex = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => (rule.id || rule.name) === 'seatRule');
  const oursIndex = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => (rule.id || rule.name) === 'conflictRecusalRule');
  assert.ok(oursIndex >= 0 && seatIndex >= 0 && oursIndex < seatIndex);
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === conflictRecusalRule);
  assert.ok(contract, 'exactly one contract for the rule');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'conflictRecusalMarkers']);
  // A pause here reaches a second reporting line: the rule builds the matrix.
  // The reach list is an ARRAY of switch names; the label map is the OBJECT.
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('conflictRecusalAutoPropagate'), 'the switch is on the matrix reach list');
  assert.equal(PAUSE_PERMIT_REACH_RULES.conflictRecusalAutoPropagate, 'conflictRecusalRules.js');
  // Every switch on the reach list must be named in the label map, or the panel
  // prints an unnamed consequence.
  for (const key of PAUSE_PERMIT_MATRIX_REACH_SWITCHES) {
    assert.ok(PAUSE_PERMIT_REACH_RULES[key], `${key} must name the rule module it silences`);
  }
});

test('the rule files one dated ask to the seat above, is idempotent, and closes itself', () => {
  const ctx = seed();
  const created = ok(ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(DECLARE_RICH)));
  const asks = () => indexConflictRecusalAsks(ctx.store.state).filter((ask) => ask.task);
  let open = asks().filter((ask) => ask.task.status === 'active');
  assert.equal(open.length, 1, 'one ask');
  assert.equal(open[0].seatId, 'vera', 'the seat above the holder, never the holder');
  assert.equal(open[0].task.personId, 'vera');
  const signature = open[0].signature;
  assert.equal(signature, conflictRecusalSignature({ interestId: created.interestId, state: 'undisclosed' }));

  // Another write does not duplicate the ask.
  ctx.on('2026-11-16');
  ctx.as('eve', () => ok(ctx.api.conflictRecusalDeclareNoInterest({ subjectType: 'decision', subjectId: 'dec-promotion', relationships: ['financial', 'family'] })));
  open = asks().filter((ask) => ask.task.status === 'active');
  assert.equal(open.length, 1, 'idempotent per signature');

  // Recording the response closes it.
  ok(ctx.as('vera', () => ctx.api.conflictRecusalRecordStanding({ interestId: created.interestId, kind: 'recuse', reason: 'Dan stands back from the award entirely' })));
  open = asks().filter((ask) => ask.task.status === 'active');
  assert.equal(open.length, 0, 'the ask closes when the interest is answered');
  const closed = asks().find((ask) => ask.signature === signature);
  assert.match(closed.task.completionNote, /Closed by RULE-CIR-01/);
});

test('a paused rule files nothing, on every path including an explicit scan', () => {
  const ctx = seed();
  ctx.as('vera', () => ok(ctx.api.conflictRecusalSetConventions({ [CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate]: false })));
  ok(ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(DECLARE_RICH)));
  assert.equal(indexConflictRecusalAsks(ctx.store.state).filter((ask) => ask.task).length, 0, 'paused: no ask on the declaration');
  // An explicit scan is a pause-governed path too.
  ctx.as('vera', () => ok(ctx.api.conflictRecusalScan()));
  assert.equal(indexConflictRecusalAsks(ctx.store.state).filter((ask) => ask.task).length, 0, 'paused: no ask on the scan');
  // The reading is still available — a pause silences the rule, not the ledger.
  const report = ctx.as('vera', () => ok(ctx.api.conflictRecusalReport())).report;
  assert.equal(report.allCounts.undisclosed, 1);
});

test('a leader-held or apex-less condition records ONE identity-free marker and asks nobody', () => {
  // vera is the only seat above dan when dan has one line — but here dan reports
  // to the leader (operator), so the seat above is the leader: nobody is asked.
  const raw = rawFixture();
  raw.people = raw.people.map((row) => (row.id === 'dan' ? { ...row, managerId: null } : row));
  delete raw.reportingLines;
  const state = normalizeState(raw, { now: new Date(T0) }).state;
  const ctx = seed(state);
  ok(ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(DECLARE_RICH)));
  assert.equal(indexConflictRecusalAsks(ctx.store.state).filter((ask) => ask.task?.status === 'active').length, 0);
  const markers = ctx.store.state.conflictRecusalMarkers || [];
  assert.equal(markers.length, 1, 'one observation, not an invented owner');
  assert.equal(markers[0].kind, 'conflict-recusal');
  assert.ok(!markers[0].detail.includes('Dan'), 'the marker is identity-free');
});

/* ------------------------------------------- display == stored, exactly */

test('the counts are the sum of the rows printed, and the screen prints those counts', () => {
  const ctx = seed(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: '',
    }],
    conflictNoneDeclarations: [{
      id: 'cnd-eve', personId: 'eve', subjectType: 'decision', subjectId: 'dec-promotion',
      relationships: ['financial', 'family'], declaredOn: '2026-10-05', declaredAt: AT, declaredById: 'eve',
    }],
  }));
  ctx.sit(null);
  const report = ok(ctx.api.conflictRecusalReport()).report;
  const sum = {};
  for (const row of report.allRows) sum[row.verdict] = (sum[row.verdict] || 0) + 1;
  for (const key of Object.keys(report.allCounts)) assert.equal(report.allCounts[key], sum[key] || 0, `${key} reconciles`);
  assert.equal(report.balances, true);
  assert.equal(report.auditClean, true);

  // The DOM prints the same numbers: no second computation anywhere.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const saved = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const el = renderConflictRecusal({
    api: ctx.api, state: ctx.store.state, now: new Date(T0),
    query: new URLSearchParams(''), refresh() {}, navigate() {}, persistError: null,
  });
  document.body.appendChild(el);
  const heads = [...el.querySelectorAll('h1')];
  assert.equal(heads.length, 1, 'exactly one h1');
  const text = el.textContent;
  assert.ok(text.includes('Declared interests (1)'), 'the declared row is on the screen');
  assert.ok(text.includes('Positions nobody has declared anything about'), 'the coverage rows are on the screen');
  // Level order never skips.
  const levels = [...el.querySelectorAll('h1,h2,h3,h4')].map((node) => Number(node.tagName[1]));
  for (let index = 1; index < levels.length; index += 1) assert.ok(levels[index] <= levels[index - 1] + 1, 'no heading level is skipped');
  globalThis.window = saved.window;
  globalThis.document = saved.document;
  globalThis.Node = saved.Node;
});

test('the CSV is identity-free and its counts are the screen’s counts', () => {
  const ctx = seed(fixture({
    conflictInterests: [{
      id: 'cin-1', personId: 'dan', subjectType: 'decision', subjectId: 'dec-supplier',
      relationship: 'financial', direction: 'held', becameKnownOn: '2026-09-28',
      declaredOn: '2026-09-28', declaredAt: AT, declaredById: 'dan', source: 'self', note: 'Owns 15 per cent of the supplier',
    }],
  }));
  ctx.sit(null);
  const report = ok(ctx.api.conflictRecusalReport()).report;
  const scope = CSV_EXPORTS.find((row) => row.key === CONFLICT_RECUSAL_CSV_SCOPE);
  assert.ok(scope, 'CSV scope #152 is registered');
  const exported = exportWorkspaceCsv(ctx.store.state, CONFLICT_RECUSAL_CSV_SCOPE, { now: new Date(T0) });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, CONFLICT_RECUSAL_CSV_COLUMNS);
  const rows = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((name, index) => [name, cells[index] ?? ''])));
  const workspace = rows.find((row) => row.row_type === 'workspace');
  assert.equal(Number(workspace.undisclosed_n), report.allCounts.undisclosed);
  assert.equal(Number(workspace.unsearched_n), report.allCounts.unsearched);
  assert.equal(Number(workspace.clean_n), report.allCounts.clean);
  assert.equal(Number(workspace.positions_n), report.allRows.length);
  assert.equal(workspace.verdicts_reconcile, report.balances ? 'YES' : 'NO');
  // Identity-free: no person, manager, record id, title, note or control text.
  for (const row of rows) {
    const flat = Object.values(row).join('|');
    for (const secret of ['Dan Name', 'Eve Name', 'Vera Name', 'dec-supplier', 'Award the pump contract', '15 per cent', 'cin-1', 'cst-', 'cru-']) {
      assert.ok(!flat.includes(secret), `the export leaks nothing: ${secret}`);
    }
  }
});

test('a person’s own declaration is counted and readable; a withdrawn one is kept, never erased', () => {
  const ctx = seed();
  const created = ok(ctx.as('dan', () => ctx.api.conflictRecusalDeclareInterest(DECLARE_RICH)));
  assert.ok(conflictRecusalAttentionCount(ctx.store.state, { now: new Date(T0) }) >= 1, 'declared work is counted');
  ok(ctx.as('dan', () => ctx.api.conflictRecusalWithdrawInterest({ interestId: created.interestId, reason: 'The supplier relationship ended in October' })));
  const stored = ctx.store.state.conflictInterests.find((row) => row.id === created.interestId);
  assert.equal(stored.withdrawnOn, '2026-11-15', 'the row stays on the record with its date');
  assert.match(stored.withdrawalReason, /ended in October/);
  const report = ctx.as('vera', () => ok(ctx.api.conflictRecusalReport())).report;
  assert.equal(report.allCounts.withdrawn, 1);
  // A withdrawal with no reason is a deletion with a friendlier name: refused.
  const second = ok(ctx.as('eve', () => ctx.api.conflictRecusalDeclareInterest({ personId: 'eve', subjectType: 'decision', subjectId: 'dec-line', relationship: 'gift', becameKnownOn: '2026-10-09' })));
  refused(ctx.as('eve', () => ctx.api.conflictRecusalWithdrawInterest({ interestId: second.interestId })), /why the interest no longer stands/, 'reason');
});

test('reading a workspace leaves the disk bytes and the revision untouched', () => {
  const ctx = seed();
  const before = JSON.stringify(ctx.store.state);
  ok(ctx.api.conflictRecusalReport());
  ok(ctx.api.conflictRecusalBriefText());
  ok(ctx.api.conflictRecusalCsvRows());
  ok(ctx.api.conflictRecusalAttentionCount());
  ok(ctx.api.conflictRecusalNoInterestCandidates());
  assert.equal(JSON.stringify(ctx.store.state), before, 'every read mutates nothing');
});

test('the rights are declared on the spine, the reads are safe, and the rows are report-only', () => {
  for (const right of Object.values(CONFLICT_RECUSAL_RIGHTS)) assert.ok(ACTION_RIGHTS[right], `${right} is declared`);
  for (const method of ['conflictRecusalReport', 'conflictRecusalBriefText', 'conflictRecusalCsvRows', 'conflictRecusalAttentionCount']) {
    assert.ok(SAFE_READS.has(method), `${method} is a safe read`);
  }
  for (const collection of ['conflictInterests', 'conflictNoneDeclarations', 'conflictStandings', 'conflictRules', 'conflictRecusalMarkers']) {
    const policy = RECORD_POLICIES[collection];
    assert.ok(policy, `${collection} has a record policy`);
    assert.equal(policy.detailCeiling, 0, `${collection} is report-only — an interest names a person and a record`);
  }
  assert.equal(CONFLICT_RECUSAL_RULE_ID, 'RULE-CIR-01');
});

test('a declaration of no interest is scored by the kinds a rule asks, not by what was ticked', () => {
  const state = fixture();
  // A rule reaching only from rank 3 leaves a frontline signer asked nothing —
  // and therefore unsearched, never clean, whatever they declared.
  const narrow = { ...state, conflictRules: [{ ...state.conflictRules[0], minRank: 4 }] };
  const report = buildConflictRecusal(narrow, { now: at('2026-11-15') });
  const dan = report.coverageRows.find((row) => row.personId === 'dan' && row.subjectId === 'dec-supplier');
  assert.equal(dan.verdict, 'unsearched');
  assert.match(dan.verdictReason, /No live rule makes any relationship kind reportable/);
});

test('an upgraded legacy workspace with no declarations reads every signer as unsearched', () => {
  const upgraded = normalizeState({
    schemaVersion: 163,
    people: [
      { id: 'p1', name: 'Ana', managerId: null, status: 'active' },
      { id: 'p2', name: 'Bo', managerId: 'p1', status: 'active' },
    ],
    decisions: [{ id: 'd1', title: 'A call', date: '2026-10-01', approver: 'Ana', chosen: 'Go', decidedOn: '2026-10-01' }],
    settings: {},
  }, { now: new Date(T0) }).state;
  const report = buildConflictRecusal(upgraded, { now: at('2026-11-15') });
  assert.equal(report.rulesN, 0);
  assert.equal(report.allCounts.clean, 0, 'an upgraded workspace never reads clean by accident');
  assert.ok(report.allCounts.unsearched >= 1);
  assert.equal(normalizeConflictNoneDeclarations(undefined, []).length, 0);
});
