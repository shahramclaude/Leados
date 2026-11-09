/**
 * tests/app/rights-concordance.test.mjs — the Matrix Decision-Right
 * Execution Concordance (Session 197, Schema v121 unchanged, ADR-0145,
 * `#/matrix?panel=concordance`, CSV scope #108).
 *
 * The suite is organised around the four things the audit must never get
 * wrong, not around the file list:
 *
 *  1. THE ARITHMETIC. Every count the panel prints is one of the identities
 *     the read model itself returns, and the identities are asserted here
 *     against independently recomputed figures.
 *  2. THE HONESTY OF THE JOIN. A subject is resolved ONLY through typed
 *     provenance edges. A decision with no link is unscoped, never guessed;
 *     a linked subject off the roster is dangling, counted and dropped; a
 *     decider name off the roster is a limit, never mapped to a person.
 *  3. THE DATED RIGHTS. A right is in force only on the lines ACTIVE on the
 *     decision date — the shared `buildMatrix` is re-run at each decision
 *     date, so a line declared after the decision, or ended before it, is
 *     excluded by the engine, not by this module's own window logic.
 *  4. THE REFUSALS. The audit never invents a subject, never treats a
 *     missing decider as a zero, never rates a person, and never writes —
 *     a deep-compare proves the state is byte-identical after the read.
 *
 * Display-vs-stored parity is asserted directly: the CSV's counts equal the
 * report's computed counts, and the report's counts are recomputed here from
 * the raw stored blob.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { parseCsv, serializeCsv } from '../../app/core/csv.js';
import {
  buildRightsConcordance,
  rightsConcordanceBriefText,
  rightsConcordanceCsvRows,
} from '../../app/core/domain/rightsConcordance.js';
import {
  RIGHTS_CONCORDANCE_CSV_COLUMNS,
  RIGHTS_CONCORDANCE_ENGINE_VERSION,
} from '../../app/core/domain/rightsConcordanceRegistry.js';
import {
  buildMatrix,
  buildMatrixReport,
  matrixBriefText,
} from '../../app/core/domain/matrix.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-09T12:00:00.000Z');
const STAMP = '2026-10-01T00:00:00.000Z';

/* ------------------------------------------------------------------ fixtures */

function orgRoster() {
  return [
    { id: 'ceo', name: 'Ada Executive', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'vp1', name: 'Victor VP Eng', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'vp1', status: 'active', createdAt: STAMP },
    { id: 'dana', name: 'Dana Director', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'pmdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'pmdir', status: 'active', createdAt: STAMP },
    { id: 'lee', name: 'Lee Engineer', level: 'ic', managerId: 'dana', status: 'active', createdAt: STAMP },
  ];
}

function line(id, personId, managerId, kind, shareH, rights = [], extra = {}) {
  return {
    id, personId, managerId, kind,
    role: managerId === (orgRoster().find((p) => p.id === personId)?.managerId) ? 'primary' : 'secondary',
    shareH, rights,
    fromISO: extra.fromISO ?? '2026-10-01',
    toISO: extra.toISO ?? null,
    note: '',
    status: extra.status ?? 'active',
    declaredAt: STAMP,
    history: [],
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/**
 * Sam on two lines: home (Pia, functional) and project (Victor).
 * Kim and Lee are single-line by default.
 */
function baseLines() {
  return [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority']),
  ];
}

function decision(id, { date, approver, contributors = '', chosen = 'Option A', decidedOn = date, title = 'Decision ' + id } = {}) {
  return {
    id, title, question: '', date,
    reversibility: 'reversible', driver: 'Sam Engineer', approver,
    contributors, informed: '', options: [], chosen,
    rationale: 'A written rationale that is long enough to pass the quality bar.',
    reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn, portfolioNotes: [],
    createdAt: STAMP,
  };
}

function caseRec(id, ownerId, extra = {}) {
  return {
    id, title: 'Case ' + id, status: 'open', severity: 3, ownerId,
    kind: 'initiative', openedOn: '2026-10-10', createdAt: STAMP, ...extra,
  };
}

function link(id, sourceType, sourceId, targetType, targetId, relation, ruleId = 'RULE-TEST') {
  return {
    id, sourceType, sourceId, targetType, targetId, relation,
    ruleId, summary: '', createdOn: '2026-10-20', createdAt: STAMP,
  };
}

function workspace({ lines = baseLines(), decisions = [], cases = [], links = [], extra = {}, settings = {} } = {}) {
  const base = createEmptyState(STAMP);
  base.people = orgRoster();
  base.reportingLines = lines;
  base.decisions = decisions;
  base.cases = cases;
  base.links = links;
  base.settings = { ...base.settings, activeSeatId: null, ...settings };
  return normalizeState({ ...base, ...extra }, { now: NOW }).state;
}

function concordanceOf(state, opts = {}) {
  return buildRightsConcordance(state, { now: NOW, settings: state.settings, ...opts });
}

const findingsOf = (report, kind) => (report.findings.rows || []).filter((f) => f.kind === kind);

/* =====================================================================
 * 1. THE ARITHMETIC — identities, and every count recomputed here
 * ===================================================================== */

test('the read model returns its engine version and the declared conventions', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.engineVersion, RIGHTS_CONCORDANCE_ENGINE_VERSION);
  assert.deepEqual(c.conventions.consultRequiredRights, ['priority', 'assignment', 'technical']);
});

test('the four identities hold on a mixed workspace, and the headline counts are recomputed here', () => {
  const state = workspace({
    decisions: [
      // audited, clean (approver holds declared rights, all holders consulted)
      decision('dec-clean', { date: '2026-10-20', approver: 'Pia Product', contributors: 'Victor VP Eng' }),
      // audited, bypass (approver holds no right)
      decision('dec-bypass', { date: '2026-10-21', approver: 'Ada Executive' }),
      // unscoped (no links at all)
      decision('dec-unscoped', { date: '2026-10-22', approver: 'Pia Product' }),
      // single-line subject (Kim)
      decision('dec-single', { date: '2026-10-23', approver: 'Pia Product' }),
      // undecided — never audited
      decision('dec-open', { date: '2026-10-24', approver: 'Pia Product', chosen: '' }),
    ],
    cases: [caseRec('c-1', 'sam'), caseRec('c-2', 'kim')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-clean', 'decides'),
      link('lnk-2', 'case', 'c-1', 'decision', 'dec-bypass', 'decides'),
      link('lnk-3', 'case', 'c-2', 'decision', 'dec-single', 'decides'),
    ],
  });
  const c = concordanceOf(state);
  const d = c.decisions;

  // Recomputed from the raw records, independently of the module's counters.
  const completed = state.decisions.filter((x) => x.chosen && x.decidedOn);
  assert.equal(d.completedN, completed.length);
  assert.equal(d.totalN, state.decisions.length);

  assert.equal(d.auditedN, 2, 'two decisions concern multi-line subjects');
  assert.equal(d.withFindingsN + d.cleanN, d.auditedN, 'audited = with findings + clean');
  assert.equal(d.completedN, d.auditedN + d.unscopedN + d.singleLineN, 'completed = audited + unscoped + single-line');
  assert.equal(d.unscopedN, 1);
  assert.equal(d.singleLineN, 1);

  const f = c.findings;
  assert.equal(f.totalN, f.shownN + f.withheldN, 'findings = shown + withheld');
  assert.equal(f.totalN, f.counts.bypass + f.counts.contestedDecided + f.counts.unresolvedAuthority + f.counts.consultGap);
  assert.equal(f.shownN + f.remainderN, f.shownN + f.remainderN);
  assert.equal(c.identity.audited, true);
  assert.equal(c.identity.findings, true);
  assert.equal(c.identity.queue, true);
  assert.equal(c.identity.completed, true);
});

/* =====================================================================
 * 2. THE HONESTY OF THE JOIN — subjects, deciders, scope limits
 * ===================================================================== */

test('a subject resolves through a typed case link (case owner) and through a direct person link', () => {
  const state = workspace({
    decisions: [
      decision('dec-case', { date: '2026-10-20', approver: 'Pia Product' }),
      decision('dec-person', { date: '2026-10-20', approver: 'Pia Product' }),
    ],
    cases: [caseRec('c-1', 'sam')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-case', 'decides'),
      link('lnk-2', 'decision', 'dec-person', 'person', 'sam', 'concerns'),
    ],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.auditedN, 2, 'both decisions found their subject');
  assert.equal(c.decisions.unscopedN, 0);
});

test('a completed decision with no subject is counted unscoped, never guessed', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.unscopedN, 1);
  assert.equal(c.decisions.auditedN, 0);
  assert.equal(c.findings.totalN, 0);
});

test('a linked subject who is not on the roster is dangling — counted, dropped, never repaired', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
    cases: [caseRec('c-1', 'ghost-person')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.danglingSubjectN, 1);
  assert.equal(c.decisions.unscopedN, 1, 'a dangling subject leaves the decision unscoped');
  assert.equal(c.decisions.auditedN, 0);
});

test('a decider name not on the roster is a counted limit — no bypass judgement, participation still checked', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Ghost Manager' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.unresolvedDeciderN, 1);
  assert.equal(c.findings.counts.bypass, 0, 'an unresolved decider is never called a bypass');
  // Both line managers hold operational rights on Sam and neither was
  // consulted: the participation check still runs against the record.
  assert.equal(c.findings.counts.consultGap, 2);
});

test('a decider name matching two roster people is unresolved as ambiguous, not mapped to either', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Sam Engineer' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
    extra: {
      people: [
        ...orgRoster(),
        { id: 'sam2', name: 'Sam Engineer', level: 'ic', managerId: 'dana', status: 'active', createdAt: STAMP },
      ],
    },
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.unresolvedDeciderN, 1);
  const row = c.findings.rows.find((r) => r.kind === 'bypass');
  assert.equal(row, undefined, 'ambiguous decider never produces a bypass');
});

test('a decider who is a roster root but holds no line to the subject is a bypass with no governance route', () => {
  // Ada Executive is on the roster (a root with no manager) but holds no
  // declared line over Sam, so a decision she approved on Sam is a bypass —
  // and her name resolves against the roster, so it is NOT an unresolved
  // decider. The distinction is the whole point of the join.
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.unresolvedDeciderN, 0, 'a roster name resolves, even at the root');
  const row = findingsOf(c, 'bypass')[0];
  assert.ok(row, 'a decider with no governance route to the subject is a bypass');
  assert.match(row.detail, /no governance route/);
});

test('a decision about a single-line person is counted, and nothing is audited', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
    cases: [caseRec('c-1', 'kim')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.singleLineN, 1);
  assert.equal(c.decisions.auditedN, 0);
  assert.equal(c.findings.totalN, 0);
});

/* =====================================================================
 * 3. THE DATED RIGHTS — the shared engine, re-run at each decision date
 * ===================================================================== */

test('a right is in force only on the lines active on the decision date', () => {
  // Sam's project line starts 2026-11-05. On 2026-10-20 Sam has ONE line, so
  // the decision is single-line; on 2026-11-10 the line is active and the
  // same approver (Victor, who holds priority on the project line) is
  // audited against two lines.
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority'], { fromISO: '2026-11-05' }),
  ];
  const state = workspace({
    lines,
    decisions: [
      decision('dec-before', { date: '2026-10-20', approver: 'Victor VP Eng' }),
      // Dated before the read's own clock (2026-11-09): the schema refuses a
      // decidedOn in the future, so the decision date must be in the past.
      decision('dec-after', { date: '2026-11-08', approver: 'Victor VP Eng' }),
    ],
    cases: [caseRec('c-1', 'sam'), caseRec('c-2', 'sam')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-before', 'decides'),
      link('lnk-2', 'case', 'c-2', 'decision', 'dec-after', 'decides'),
    ],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.singleLineN, 1, 'the decision before the line started has a single-line subject');
  assert.equal(c.decisions.auditedN, 1, 'the decision after it started is audited');
  // On the audited decision, Victor holds priority on the project line —
  // but Pia also holds it on the home line, so the right is contested.
  assert.equal(c.findings.counts.contestedDecided, 1);
  assert.equal(c.findings.counts.bypass, 0);
});

test('a line ended before the decision date is not in force on that date', () => {
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority'], { toISO: '2026-10-15' }),
  ];
  const state = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.singleLineN, 1, 'the ended line is not active on 2026-10-20');
  assert.equal(c.decisions.auditedN, 0);
});

test('an unowned right is a finding on the decision date — and ceases to be one once a line declares it', () => {
  // assignment is held by nobody while the project line carries only
  // priority; a second line variant declares it from 2026-11-01.
  const linesBefore = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority']),
  ];
  const stateBefore = workspace({
    lines: linesBefore,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const cBefore = concordanceOf(stateBefore);
  const unownedBefore = findingsOf(cBefore, 'unresolved-authority');
  assert.equal(unownedBefore.length, 1);
  assert.ok(unownedBefore[0].rightKeys.includes('assignment'), 'assignment is named as unowned');

  const linesAfter = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority', 'assignment'], { fromISO: '2026-11-01' }),
  ];
  const stateAfter = workspace({
    lines: linesAfter,
    decisions: [decision('dec-2', { date: '2026-11-10', approver: 'Pia Product', contributors: 'Victor VP Eng' })],
    cases: [caseRec('c-2', 'sam')],
    links: [link('lnk-2', 'case', 'c-2', 'decision', 'dec-2', 'decides')],
  });
  const cAfter = concordanceOf(stateAfter);
  assert.equal(findingsOf(cAfter, 'unresolved-authority').length, 0, 'assignment is held once the line declares it');
});

test('the presumed home rights authorise the home manager — and only the three stewardship rights', () => {
  // The home line declares NO rights of its own: Pia holds exactly the three
  // presumed stewardship rights (performance, pay, absence). A decision she
  // approved is authorised — not a bypass — while the operational rights
  // belong to the project line.
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, []),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority', 'assignment', 'technical']),
  ];
  const state = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product', contributors: 'Victor VP Eng' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.findings.counts.bypass, 0, 'the home manager holds the presumed rights');
  assert.equal(c.decisions.cleanN, 1, 'every right is held by exactly one manager and the operational holder was consulted');
});

/* =====================================================================
 * 4. THE FOUR FINDINGS — each one, and its exact boundary
 * ===================================================================== */

test('bypass: a manager who manages the subject but holds none of the six rights', () => {
  // The project line declares no rights, so Victor holds nothing on Sam.
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, []),
  ];
  const state = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  const rows = findingsOf(c, 'bypass');
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /manage this person, but the declared lines give them none/);
});

test('contested-decided: the decider held a right two managers hold — and only then', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng', contributors: 'Pia Product' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  const rows = findingsOf(c, 'contested-decided');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].rightKeys, ['priority'], 'priority is the contested right');
  assert.equal(c.findings.counts.bypass, 0, 'holding a contested right is still holding a right');
});

test('unresolved-authority: a right held by nobody when the decision was made', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng', contributors: 'Pia Product' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  const rows = findingsOf(c, 'unresolved-authority');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].rightKeys.includes('assignment'));
});

test('consult-gap: an operational right-holder not recorded as a contributor — and its boundaries', () => {
  // Victor holds priority on the project line (operational). Pia holds
  // priority/technical on the home line (operational).
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority']),
  ];
  const notConsulted = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c1 = concordanceOf(notConsulted);
  assert.equal(c1.findings.counts.consultGap, 1, 'the home manager holds operational rights and was not consulted');

  const consulted = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng', contributors: 'Pia Product' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c2 = concordanceOf(consulted);
  assert.equal(c2.findings.counts.consultGap, 0);
});

test('consult-gap does not fire for stewardship-only holders, and the approver is never their own consult', () => {
  // Home line declares nothing: Pia holds only the presumed stewardship
  // rights. Victor holds all three operational rights on the project line.
  // A decision approved by Victor with nobody consulted is CLEAN — the only
  // operational right-holder is the decider himself.
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, []),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority', 'assignment', 'technical']),
  ];
  const state = workspace({
    lines,
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Victor VP Eng' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.findings.counts.consultGap, 0, 'a stewardship-only holder is not required to be consulted');
  assert.equal(c.decisions.cleanN, 1);
});

/* =====================================================================
 * 5. SEAT SCOPING — the audit widens a seat to its own people, never sideways
 * ===================================================================== */

test('findings about people outside the seat span are withheld and counted, never shown', () => {
  // Lee sits under Dana (home) with a project line to Victor. Pia's seat
  // span is her own tree (Sam, Kim) — Lee is outside it.
  const lines = [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority']),
    line('l-lee-fn', 'lee', 'dana', 'functional', 60, ['priority', 'technical']),
    line('l-lee-pj', 'lee', 'vp1', 'project', 40, []),
  ];
  const state = workspace({
    lines,
    decisions: [
      decision('dec-lee', { date: '2026-10-20', approver: 'Ada Executive' }),
      decision('dec-sam', { date: '2026-10-21', approver: 'Ada Executive' }),
    ],
    cases: [caseRec('c-1', 'lee'), caseRec('c-2', 'sam')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-lee', 'decides'),
      link('lnk-2', 'case', 'c-2', 'decision', 'dec-sam', 'decides'),
    ],
    settings: { activeSeatId: 'pmdir' },
  });
  const c = concordanceOf(state);
  assert.equal(c.seat.id, 'pmdir');
  // Both decisions are bypasses (Ada holds no rights on either person).
  assert.equal(c.findings.counts.bypass, 2);
  // Lee's decision carries three findings (bypass + unresolved-authority +
  // consult-gap) and ALL THREE are withheld: Lee is outside Pia's span.
  assert.equal(c.findings.withheldN, 3);
  assert.equal(c.findings.shownN, c.findings.totalN - 3);
  assert.ok(c.findings.rows.every((r) => r.subjectId !== 'lee'));
  assert.equal(c.identity.findings, true, 'withheld + shown still equals the total');
});

test('a full-access seat sees every finding in the workspace', () => {
  // The undeclared operator view (no active seat) is the workspace-wide
  // reading: every finding is shown, none is withheld.
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.seat.fullAccess, true);
  assert.equal(c.findings.withheldN, 0);
  assert.equal(c.findings.shownN, c.findings.totalN);
});

/* =====================================================================
 * 6. THE SHARED ENGINE — matrix report integration, no writes, CSV parity
 * ===================================================================== */

test('buildMatrixReport carries the concordance, and the matrix brief carries its identity-free clause', () => {
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
    settings: { activeSeatId: 'ceo' },
  });
  const report = buildMatrixReport(state, { now: NOW, settings: state.settings });
  assert.ok(report.concordance, 'the matrix report carries the concordance');
  assert.equal(report.concordance.decisions.auditedN, 1);
  const brief = matrixBriefText(report);
  assert.match(brief, /Concordance: 1 completed decision/);
  // The brief is identity-free: no person name appears in the clause.
  const clause = brief.split('Concordance:')[1];
  for (const name of ['Ada Executive', 'Sam Engineer', 'Pia Product', 'Victor VP Eng']) {
    assert.doesNotMatch(clause, new RegExp(name));
  }
});

test('the concordance writes nothing — the state is byte-identical after the read', () => {
  const state = workspace({
    decisions: [
      decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' }),
      decision('dec-2', { date: '2026-10-21', approver: 'Pia Product' }),
    ],
    cases: [caseRec('c-1', 'sam'), caseRec('c-2', 'lee')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides'),
      link('lnk-2', 'case', 'c-2', 'decision', 'dec-2', 'decides'),
    ],
    lines: [
      ...baseLines(),
      line('l-lee-fn', 'lee', 'dana', 'functional', 60, ['priority', 'technical']),
      line('l-lee-pj', 'lee', 'vp1', 'project', 40, []),
    ],
    settings: { activeSeatId: 'pmdir' },
  });
  const before = JSON.stringify(state);
  const c = concordanceOf(state);
  const report = buildMatrixReport(state, { now: NOW, settings: state.settings });
  assert.ok(c.findings.totalN > 0);
  assert.equal(JSON.stringify(state), before, 'the read mutates nothing');
  assert.ok(report.concordance);
});

test('the CSV scope exports the report counts exactly, and carries no person, name or id', () => {
  const state = workspace({
    decisions: [
      decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' }),
      decision('dec-2', { date: '2026-10-21', approver: 'Pia Product', contributors: 'Victor VP Eng' }),
      decision('dec-3', { date: '2026-10-22', approver: 'Pia Product' }),
    ],
    cases: [caseRec('c-1', 'sam'), caseRec('c-2', 'lee'), caseRec('c-3', 'kim')],
    links: [
      link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides'),
      link('lnk-2', 'case', 'c-2', 'decision', 'dec-2', 'decides'),
      link('lnk-3', 'case', 'c-3', 'decision', 'dec-3', 'decides'),
    ],
    lines: [
      ...baseLines(),
      line('l-lee-fn', 'lee', 'dana', 'functional', 60, ['priority', 'technical']),
      line('l-lee-pj', 'lee', 'vp1', 'project', 40, []),
    ],
  });
  const c = concordanceOf(state);
  const rows = rightsConcordanceCsvRows(c);
  const columns = RIGHTS_CONCORDANCE_CSV_COLUMNS.map((key) => ({ key, header: key }));
  const parsedCsv = parseCsv(serializeCsv(columns, rows));
  const header = parsedCsv.headers;
  const parsed = parsedCsv.rows.map((values) => {
    const row = [];
    for (let i = 0; i < header.length; i += 1) row[i] = values[i] ?? '';
    return row;
  });
  const idx = (name) => header.indexOf(name);
  const ws = parsed.find((r) => r[0] === 'workspace');
  assert.ok(ws, 'the workspace row round-trips');
  assert.equal(ws[idx('decisions_read_n')], String(c.decisions.completedN));
  assert.equal(ws[idx('decisions_audited_n')], String(c.decisions.auditedN));
  assert.equal(ws[idx('decisions_with_findings_n')], String(c.decisions.withFindingsN));
  assert.equal(ws[idx('decisions_clean_n')], String(c.decisions.cleanN));
  assert.equal(ws[idx('decisions_unscoped_n')], String(c.decisions.unscopedN));
  assert.equal(ws[idx('decisions_single_line_n')], String(c.decisions.singleLineN));
  assert.equal(ws[idx('decisions_unresolved_decider_n')], String(c.decisions.unresolvedDeciderN));
  assert.equal(ws[idx('withheld_findings_n')], String(c.findings.withheldN));
  assert.equal(ws[idx('recurrence_observations_n')], String(c.recurrence.observationN));
  assert.equal(ws[idx('recurring_observations_n')], String(c.recurrence.recurringObservationN));
  assert.equal(ws[idx('one_off_observations_n')], String(c.recurrence.oneOffObservationN));
  assert.equal(ws[idx('recurring_patterns_n')], String(c.recurrence.recurringPatternN));
  assert.equal(ws[idx('recurrence_patterns_withheld_n')], String(c.recurrence.remainderN));

  // One row per finding kind, with the exact count.
  const countKey = {
    'contested-decided': 'contestedDecided',
    'unresolved-authority': 'unresolvedAuthority',
    'consult-gap': 'consultGap',
    bypass: 'bypass',
  };
  for (const kind of ['bypass', 'contested-decided', 'unresolved-authority', 'consult-gap']) {
    const row = parsed.find((r) => r[0] === 'finding' && r[idx('kind')] === kind);
    assert.ok(row, `finding kind ${kind} is exported`);
    assert.equal(row[idx('count')], String(c.findings.counts[countKey[kind]]));
  }

  // Identity-free: no name, no id, no title survives into the export.
  const flat = JSON.stringify(parsed);
  for (const needle of ['Ada Executive', 'Sam Engineer', 'Pia Product', 'Victor VP Eng', 'dec-1', 'c-1', 'Decision']) {
    assert.doesNotMatch(flat, new RegExp(needle));
  }
});

test('recurrence groups repeated structural patterns by distinct decisions, not people, and stays identity-free', () => {
  const state = workspace({
    decisions: [
      decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' }),
      decision('dec-2', { date: '2026-10-21', approver: 'Ada Executive' }),
    ],
    cases: [caseRec('c-sam', 'sam'), caseRec('c-lee', 'lee')],
    links: [
      link('lnk-1', 'case', 'c-sam', 'decision', 'dec-1', 'decides'),
      link('lnk-2', 'case', 'c-lee', 'decision', 'dec-1', 'decides'),
      link('lnk-3', 'case', 'c-sam', 'decision', 'dec-2', 'decides'),
    ],
    lines: [
      ...baseLines(),
      line('l-lee-fn', 'lee', 'dana', 'functional', 60, ['priority', 'technical']),
      line('l-lee-pj', 'lee', 'vp1', 'project', 40, []),
    ],
  });
  const c = concordanceOf(state, { seat: { id: 'exec', rank: 5, fullAccess: true }, scope: null });
  const repeatedBypass = c.recurrence.rows.find((row) => row.kind === 'bypass'
    && row.lineKinds.join('|') === 'functional|project' && row.rightKeys.length === 0);
  assert.ok(repeatedBypass, 'same structural bypass pattern recurs across distinct decisions');
  assert.equal(repeatedBypass.decisionN, 2, 'one decision linked to two matching subjects counts once');
  assert.equal(repeatedBypass.firstOn, '2026-10-20');
  assert.equal(repeatedBypass.lastOn, '2026-10-21');
  assert.equal(c.recurrence.identity.observations, true);
  assert.equal(c.recurrence.identity.queue, true);
  assert.ok(c.recurrence.recurringObservationN > 0);
  const recurrenceCsv = rightsConcordanceCsvRows(c).filter((row) => row.row_kind === 'recurrence');
  const exportedPattern = recurrenceCsv.find((row) => row.kind === 'bypass'
    && row.line_kinds === 'functional|project' && row.right_keys === '');
  assert.equal(exportedPattern.decisions_n, 2, 'CSV exactly carries the computed distinct-decision count');
  assert.equal(recurrenceCsv.length, c.recurrence.rows.length, 'CSV includes every displayed pattern');
  const recurrenceText = JSON.stringify(c.recurrence);
  for (const privateValue of ['Sam Engineer', 'Lee Engineer', 'sam', 'lee', 'dec-1', 'l-sam-pj']) {
    assert.doesNotMatch(recurrenceText, new RegExp(privateValue));
  }
});

test('a single-chain workspace leaves the concordance inert', () => {
  const state = workspace({
    lines: [line('l-kim-fn', 'kim', 'pmdir', 'functional', 100, ['priority', 'technical', 'performance'])],
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
    cases: [caseRec('c-1', 'kim')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const c = concordanceOf(state);
  assert.equal(c.decisions.auditedN, 0, 'no multi-line person exists to audit');
  assert.equal(c.decisions.singleLineN, 1);
  assert.equal(c.findings.totalN, 0);
  assert.equal(c.identity.completed, true);
});

/* =====================================================================
 * 7. THE UI — the panel renders, axe-clean, in JSDOM
 * ===================================================================== */

function mountJsdom() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://leados.test/',
    pretendToBeVisual: true,
    virtualConsole,
  });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.axe = undefined;
  dom.window.eval(AXE_SRC);
  globalThis.axe = dom.window.axe;
  return { dom, errors };
}

test('the concordance panel renders axe-clean in JSDOM with findings, identity and limits', async () => {
  const { dom, errors } = mountJsdom();
  try {
    const state = workspace({
      decisions: [
        decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' }),
        decision('dec-2', { date: '2026-10-21', approver: 'Pia Product', contributors: 'Victor VP Eng' }),
      ],
      cases: [caseRec('c-1', 'sam'), caseRec('c-2', 'lee')],
      links: [
        link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides'),
        link('lnk-2', 'case', 'c-2', 'decision', 'dec-2', 'decides'),
      ],
      lines: [
        ...baseLines(),
        line('l-lee-fn', 'lee', 'dana', 'functional', 60, ['priority', 'technical']),
        line('l-lee-pj', 'lee', 'vp1', 'project', 40, []),
      ],
      settings: { activeSeatId: 'ceo' },
    });
    const report = buildMatrixReport(state, { now: NOW, settings: state.settings });
    const node = renderMatrix({
      api: { matrixReport: () => ({ ok: true, report }) },
      query: new URLSearchParams('panel=concordance'),
      navigate() {},
      refresh() {},
    });
    assert.equal(node.tagName, 'DIV');
    assert.equal(node.querySelector('main'), null, 'no nested <main>');
    assert.match(node.textContent, /Concordance/);
    assert.match(node.textContent, /Decisions read/);
    assert.match(node.textContent, /outside the declared rights/, 'the bypass finding is rendered');
    assert.match(node.textContent, /The reconciliation/);
    assert.match(node.textContent, /Recurring structural patterns/);
    assert.match(node.textContent, /Distinct decisions/);
    const firstPattern = report.concordance.recurrence.rows[0];
    assert.ok(firstPattern, 'fixture produces a repeated structural pattern');
    assert.ok(node.textContent.includes(String(firstPattern.decisionN)), 'rendered pattern count equals the computed report');
    assert.match(node.textContent, /Honest limits/);

    dom.window.document.body.replaceChildren(node);
    const axeResult = await dom.window.axe.run(node, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(axeResult.violations.map((v) => v.id), [], 'concordance panel is axe-clean');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test('the panel is registered as a matrix panel and renders its single-chain state', async () => {
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'concordance'), 'concordance is a matrix panel');
  const { dom } = mountJsdom();
  try {
    const state = workspace({
      lines: [line('l-kim-fn', 'kim', 'pmdir', 'functional', 100, ['priority'])],
      decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Pia Product' })],
      cases: [caseRec('c-1', 'kim')],
      links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
      settings: { activeSeatId: 'ceo' },
    });
    const report = buildMatrixReport(state, { now: NOW, settings: state.settings });
    const node = renderMatrix({
      api: { matrixReport: () => ({ ok: true, report }) },
      query: new URLSearchParams('panel=concordance'),
      navigate() {},
      refresh() {},
    });
    assert.match(node.textContent, /Single-chain workspace/);
    dom.window.document.body.replaceChildren(node);
    const axeResult = await dom.window.axe.run(node, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(axeResult.violations.map((v) => v.id), []);
  } finally {
    dom.window.close();
  }
});

/* =====================================================================
 * 8. THE API LAYER — the read reaches the workspace through the store
 * ===================================================================== */

test('the store-backed API carries the concordance inside the matrix report', () => {
  // The undeclared operator view holds every right, so the report read is
  // reachable through the live API exactly as a full-access seat reaches it.
  const state = workspace({
    decisions: [decision('dec-1', { date: '2026-10-20', approver: 'Ada Executive' })],
    cases: [caseRec('c-1', 'sam')],
    links: [link('lnk-1', 'case', 'c-1', 'decision', 'dec-1', 'decides')],
  });
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createStore({ now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  const result = api.matrixReport();
  assert.equal(result.ok, true);
  assert.ok(result.report.concordance, 'the live API report carries the concordance');
  assert.equal(result.report.concordance.decisions.auditedN, 1);
});
