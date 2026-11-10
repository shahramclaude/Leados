/**
 * tests/app/authority-continuity.test.mjs — the Matrix Authority Continuity
 * Register (ADR-0156, Schema v129, `#/matrix?panel=continuity`, CSV scope #117).
 *
 * Organised around the ways an authority-continuity reading can be betrayed:
 *
 *  1. THE PORTFOLIO, NOT ONE TYPE. The register must read every frozen
 *     decision record the workspace stores — a merit cycle, a decided decision
 *     record, a frozen board memo — and must NOT read only the type that
 *     happens to be easiest.
 *  2. THE RECORD'S OWN DAY. A decision made while Priya held the line must be
 *     compared against Priya, not against today's Dana, even though today's
 *     roster says Dana.
 *  3. NEVER ABSORB AN ABSENCE. A record whose authority cannot be read is
 *     counted and printed, and it REFUSES the portfolio claim. A population
 *     claim over an incomplete population is the failure this module exists to
 *     prevent.
 *  4. NEVER GUESS. A record with no approver is `unattributed`, not filled in.
 *     A record with a subject that cannot be resolved falls back to the
 *     approver's own span and PRINTS that it did so.
 *  5. REPORT, NEVER CORRECT. Nothing is rewritten; a drifted record is named.
 *  6. DISPLAY == STORED. Every printed figure equals the recomputed blob,
 *     before and after a real reload, and no read mutates or bumps a revision.
 *  7. NO IDENTITY IN THE EXPORT. The CSV carries counts and verdicts, never a
 *     record id, a title, a person id or a manager id.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildAuthorityContinuity,
  authorityContinuityBriefLines,
  authorityContinuityCsvRows,
} from '../../app/core/domain/authorityContinuity.js';
import {
  AUTHORITY_CONTINUITY_CSV_COLUMNS,
  AUTHORITY_CONTINUITY_RIGHTS,
  AUTHORITY_CONTINUITY_TYPE_KEYS,
  AUTHORITY_CONTINUITY_VERDICTS,
} from '../../app/core/domain/authorityContinuityRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const ISO = NOW.toISOString();
const EFFECTIVE = '2026-11-15';

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ priya ─┬─ sam    (home line dana; project line to priya)
 *        │         ├─ lee
 *        │         └─ mo
 *        ├─ kim
 *        └─ ana
 */
function person(id, name, level, managerId = 'dana') {
  return {
    id, name, role: 'Engineer', level, managerId, status: 'active',
    startDate: '2024-01-01', createdAt: ISO,
  };
}

function roster(over = {}) {
  return [
    person('dana', 'Dana Eng', 'director', null),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead'),
    person('lee', 'Lee Engineer', 'lead'),
    person('mo', 'Mo Engineer', 'lead'),
    person('kim', 'Kim Engineer', 'lead'),
    person('ana', 'Ana Engineer', 'lead'),
    person('zoe', 'Zoe Engineer', 'lead'),
  ].map((p) => (over[p.id] ? { ...p, ...over[p.id] } : p));
}

function line(personId, over = {}) {
  return {
    id: `line-${personId}-priya`,
    personId,
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: null,
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

const projectLines = (over = {}) => ['sam', 'lee', 'mo'].map((id) => line(id, over));

function period(personId, managerId, fromISO, toISO = null, over = {}) {
  return {
    id: `str-${personId}-${fromISO}`,
    personId,
    managerId,
    fromISO,
    toISO,
    recordedOn: fromISO,
    recordedBySeatId: null,
    source: 'moved',
    reason: 'Structural baseline recorded for the audit.',
    at: `${fromISO}T00:00:00.000Z`,
    ...over,
  };
}

/** Every person recorded as reporting to their current manager from 2026-09-01. */
function fullHistory(overrides = {}) {
  const out = roster().map((p) => period(p.id, p.managerId || 'leader', '2026-09-01'));
  for (const row of Object.values(overrides)) {
    if (row === null) continue;
    const idx = out.findIndex((r) => r.personId === row.personId && r.fromISO === row.fromISO);
    if (idx >= 0) out[idx] = row;
    else out.push(row);
  }
  return out.filter(Boolean);
}

function decision(over = {}) {
  return {
    id: 'dec-1',
    title: 'Ship the migration in Q1',
    question: 'Do we cut over in Q1?',
    date: '2026-10-05',
    decidedOn: '2026-10-05',
    reversibility: 'reversible',
    driver: 'Delivery',
    approver: 'Priya PM',
    contributors: '',
    informed: '',
    options: [],
    chosen: 'Yes, cut over in Q1',
    rationale: 'The programme has the capacity.',
    reviewOn: null,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: ISO,
    ...over,
  };
}

/**
 * A board memo the board was actually shown.
 *
 * A memo carries NO approver field: the authority it names is its
 * `ownerNodeId`. A memo with no readable claim cannot hold a snapshot, and a
 * committed memo with no snapshot is reopened as a draft by the schema — so
 * the fixture carries one declared claim.
 */
function memo(over = {}) {
  const claim = {
    key: 'bench-coverage',
    verdict: 'holds',
    value: 80,
    lower: 70,
    upper: 90,
    n: 10,
    threshold: 60,
    tag: 'clear',
  };
  return {
    id: 'memo-1',
    revision: 1,
    title: 'Q1 board pack',
    cycle: '',
    claims: [{ key: 'bench-coverage', threshold: 60, note: '' }],
    status: 'committed',
    ownerNodeId: 'dana',
    ownerSeatId: null,
    committedAt: '2026-10-20T09:00:00.000Z',
    frozenAt: null,
    frozenBy: null,
    snapshot: { takenAt: '2026-10-20T09:00:00.000Z', fingerprint: 'abc12345', claims: [claim] },
    openedAt: '2026-10-18T09:00:00.000Z',
    createdAt: ISO,
    ...over,
  };
}

function payRow(personId, currentPay, proposedPay, over = {}) {
  return {
    personId, level: 'lead', currentPay, proposedPay,
    origin: 'internal', retentionConcern: false, note: '', ...over,
  };
}

/** Six priced pay rows: three matrix leads at +2%, three home-line leads at +4%. */
function defaultRows() {
  return [
    payRow('sam', 100000, 102000),
    payRow('lee', 100000, 102000),
    payRow('mo', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
}

/** A draft merit cycle. It is finalised through the REAL API in the test. */
function cycle(rows, over = {}) {
  return {
    id: 'merit-1',
    label: 'FY26 merit',
    currency: 'USD',
    effectiveOn: EFFECTIVE,
    status: 'draft',
    budget: { kind: 'amount', value: 60000 },
    comparison: { dimension: 'origin' },
    ownerId: null,
    rows,
    audit: null,
    outcomes: [],
    history: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function link(id, sourceType, sourceId, targetType, targetId, relation) {
  return {
    id, sourceType, sourceId, targetType, targetId, relation,
    ruleId: 'RULE-TEST', summary: '', createdOn: '2026-10-20', createdAt: ISO,
  };
}

function makeState({
  people = roster(),
  lines = projectLines(),
  history = null,
  decisions = [],
  memos = [],
  cycles = [],
  links = [],
} = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.structureHistory = history === null ? [] : history;
  state.decisions = decisions;
  state.boardMemos = memos;
  state.meritCycles = cycles;
  state.links = links;
  return normalizeState(state).state;
}

const reportFor = (state, over = {}) => buildAuthorityContinuity(state, {
  now: NOW, settings: state.settings, ...over,
});

/** A real store and API over a real storage adapter. */
function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

/* --------------------------------------------------- 1. the whole portfolio */

test('the register reads EVERY frozen decision type, not only the easy one', () => {
  const state = makeState({
    decisions: [decision()],
    memos: [memo()],
  });
  const r = reportFor(state);

  assert.equal(r.totalN, 2, 'both the decision record and the board memo are in the population');
  assert.equal(r.byType.get('decision').totalN, 1);
  assert.equal(r.byType.get('board-memo').totalN, 1);
  assert.equal(r.byType.get('merit-cycle').totalN, 0);
  assert.equal(r.rows.length, 2);
  assert.ok(AUTHORITY_CONTINUITY_TYPE_KEYS.includes('merit-cycle'));
  assert.ok(AUTHORITY_CONTINUITY_TYPE_KEYS.includes('decision'));
  assert.ok(AUTHORITY_CONTINUITY_TYPE_KEYS.includes('board-memo'));
});

/* ------------------------------------------------------ 2. the record's own day */

test('a decision is compared against the authority on ITS OWN day, not today’s', () => {
  // Sam's home line was Dana on 2026-10-05 (recorded); it moved to Priya on
  // 2026-11-01. Today's roster says Priya. The decision was Dana's — and the
  // decision is LINKED to Sam, so the comparison is made against Sam's lines
  // on the decision's own day.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-10-31'),
    extra: period('sam', 'priya', '2026-11-01', null, { recordedOn: '2026-11-01', id: 'str-sam-nov' }),
  });
  const state = makeState({
    people,
    history,
    decisions: [decision({ approver: 'Dana Eng' })],
    links: [link('lnk-1', 'decision', 'dec-1', 'person', 'sam', 'concerns')],
  });
  const r = reportFor(state);
  const row = r.rows.find((x) => x.type === 'decision');

  assert.equal(row.route, 'subject', 'the subject resolved through a typed edge');
  assert.equal(row.verdict, 'attributable', 'Dana held the line on the decision’s own day');
  assert.equal(row.asOf, '2026-10-05');
  assert.equal(row.subjectN, 1);
  assert.equal(r.driftedN, 0);
});

test('a decision whose approver did NOT hold the line on its own day reads DRIFTED', () => {
  // Same reorganisation, but the decision names Priya — who did not hold
  // Sam's home line until 2026-11-01, a month AFTER the decision.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-10-31'),
    extra: period('sam', 'priya', '2026-11-01', null, { recordedOn: '2026-11-01', id: 'str-sam-nov' }),
  });
  const state = makeState({
    people,
    history,
    decisions: [decision({ approver: 'Priya PM' })],
    links: [link('lnk-1', 'decision', 'dec-1', 'person', 'sam', 'concerns')],
  });
  const r = reportFor(state);
  const row = r.rows.find((x) => x.type === 'decision');

  assert.equal(row.route, 'subject');
  assert.equal(row.verdict, 'drifted');
  assert.equal(r.driftedN, 1);
  assert.equal(r.attributableN, 0);
  assert.ok(row.differences.length >= 1);
  assert.equal(row.differences[0].kind, 'authority-moved');
});

/* ------------------------------------------------------- 3. never absorb an absence */

test('a record whose authority cannot be read is COUNTED and REFUSES the portfolio claim', () => {
  const state = makeState({
    decisions: [
      decision({ id: 'dec-1', approver: 'Dana Eng' }),
      decision({ id: 'dec-2', approver: 'Ghost Person' }),
      decision({ id: 'dec-3', approver: 'Kim Engineer' }),
    ],
  });
  const r = reportFor(state);

  assert.equal(r.totalN, 3);
  assert.equal(r.uncoveredN, 1, 'the unresolvable approver is counted, not dropped');
  assert.equal(r.coveredN, 2);
  assert.equal(r.populationClaim, false, 'a portfolio claim over an incomplete population is refused');
  assert.match(r.populationClaimReason, /could not be read/);
  assert.ok(r.refusals.some((x) => x.kind === 'unreadable-records'));
  const unread = r.rows.find((x) => x.recordId === 'dec-2');
  assert.equal(unread.verdict, 'unreadable');
  assert.match(unread.reason, /not on this workspace's roster/);
});

test('the portfolio claim is refused below the declared population floor', () => {
  const state = makeState({ decisions: [decision({ approver: 'Dana Eng' })] });
  const r = reportFor(state);
  assert.equal(r.coveredN, 1);
  assert.equal(r.populationClaim, false);
  assert.match(r.populationClaimReason, /below the declared floor/);
  assert.equal(r.populationFloor, 3);
});

test('a complete, fully-attributable population GRANTS the portfolio claim', () => {
  // Three decisions, each approved by someone who HELD a span on the
  // decision's own day: Dana (the director), Dana again, and Dana once more
  // under different ids. Each has a resolvable approver and a non-empty span.
  const state = makeState({
    history: fullHistory(),
    decisions: [
      decision({ id: 'dec-1', approver: 'Dana Eng' }),
      decision({ id: 'dec-2', approver: 'Dana Eng' }),
      decision({ id: 'dec-3', approver: 'Dana Eng' }),
    ],
  });
  const r = reportFor(state);
  assert.equal(r.coveredN, 3);
  assert.equal(r.uncoveredN, 0);
  assert.equal(r.driftedN, 0);
  assert.equal(r.unattributedN, 0);
  assert.equal(r.coveredAgree, true);
  assert.equal(r.populationClaim, true);
  assert.match(r.populationClaimReason, /population is complete/);
});

/* ------------------------------------------------------------- 4. never guess */

test('a record that names no authority is UNATTRIBUTED, never filled in', () => {
  const state = makeState({ decisions: [decision({ approver: '' })] });
  const r = reportFor(state);
  const row = r.rows.find((x) => x.type === 'decision');
  assert.equal(row.verdict, 'unattributed');
  assert.equal(row.frozenAuthority, null);
  assert.equal(r.unattributedN, 1);
  assert.equal(r.populationClaim, false);
  assert.match(row.reason, /names no approver/);
});

test('a record whose subject cannot be resolved falls back to the approver’s span and PRINTS it', () => {
  // No typed link: the comparison is made against the approver's own span.
  // Dana manages people on 2026-10-05, so the record is attributable — but by
  // the WEAKER reading, and the row must say so.
  const state = makeState({ history: fullHistory(), decisions: [decision({ approver: 'Dana Eng' })] });
  const r = reportFor(state);
  const row = r.rows.find((x) => x.type === 'decision');
  assert.equal(row.route, 'span');
  assert.equal(row.verdict, 'attributable');
  assert.match(row.reason, /no typed subject/);
  assert.match(row.reason, /WEAKER reading/);
});

test('an approver who managed nobody on the decision’s own day reads DRIFTED', () => {
  // Kim is a lead with no reports on the record's own day.
  const state = makeState({ history: fullHistory(), decisions: [decision({ approver: 'Kim Engineer' })] });
  const r = reportFor(state);
  const row = r.rows.find((x) => x.type === 'decision');
  assert.equal(row.verdict, 'drifted');
  assert.equal(row.differences[0].kind, 'no-span');
});

/* ------------------------------------------------------ 5. report, never correct */

test('the register WRITES nothing: the state is byte-identical after a read', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision()],
    memos: [memo()],
  });
  const before = JSON.stringify(state);
  const r = reportFor(state);
  assert.ok(r.totalN >= 1);
  const after = JSON.stringify(state);
  assert.equal(after, before, 'a read must not mutate the workspace');
});

/* ------------------------------------------------------- 6. display == stored */

test('every printed figure equals the recomputed report after a real reload', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision({ approver: 'Dana Eng' }), decision({ id: 'dec-2', approver: 'Ghost' })],
    memos: [memo()],
  });
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `${p}-test` });
  store.load();
  const reloaded = store.state;

  const r = reportFor(reloaded);
  assert.equal(r.totalN, r.coveredN + r.uncoveredN, 'the population reconciles to the sum of its parts');
  const recomputed = reportFor(reloaded);
  assert.equal(r.totalN, recomputed.totalN);
  assert.equal(r.coveredN, recomputed.coveredN);
  assert.equal(r.uncoveredN, recomputed.uncoveredN);
  assert.equal(r.driftedN, recomputed.driftedN);
  assert.equal(r.attributableN, recomputed.attributableN);
  assert.equal(r.unattributedN, recomputed.unattributedN);
  assert.equal(r.populationClaim, recomputed.populationClaim);
  assert.equal(r.populationClaimReason, recomputed.populationClaimReason);
});

test('the verdict counts reconcile to the row count', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [
      decision({ id: 'dec-1', approver: 'Dana Eng' }),
      decision({ id: 'dec-2', approver: 'Ghost' }),
      decision({ id: 'dec-3', approver: '' }),
      decision({ id: 'dec-4', approver: 'Kim Engineer' }),
    ],
    memos: [memo()],
  });
  const r = reportFor(state);
  const sum = AUTHORITY_CONTINUITY_VERDICTS.reduce((acc, v) => acc + (r.byVerdict[v.key] || 0), 0);
  assert.equal(sum, r.totalN, 'every record lands in exactly one verdict');
  assert.equal(r.attributableN + r.driftedN + r.unattributedN + r.uncoveredN, r.totalN);
});

test('the type buckets reconcile to the population', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision()],
    memos: [memo()],
  });
  const r = reportFor(state);
  const total = [...r.byType.values()].reduce((acc, b) => acc + b.totalN, 0);
  assert.equal(total, r.totalN);
  for (const [, bucket] of r.byType) {
    assert.equal(bucket.coveredN + bucket.uncoveredN, bucket.totalN);
  }
});

/* ----------------------------------------------------- 7. no identity in export */

test('the CSV carries counts and verdicts and NO identity', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision({ approver: 'Dana Eng' }), decision({ id: 'dec-2', approver: 'Ghost' })],
    memos: [memo()],
  });
  const rows = authorityContinuityCsvRows(reportFor(state));
  assert.ok(rows.length >= 2, 'a summary row plus one row per type present');
  assert.equal(rows[0].row_kind, 'summary');
  const serialised = JSON.stringify(rows);
  for (const forbidden of ['Dana', 'Priya', 'Sam', 'dec-1', 'dec-2', 'memo-1', 'sam', 'dana', 'priya']) {
    assert.ok(!serialised.includes(forbidden), `the export must not carry "${forbidden}"`);
  }
  for (const row of rows) {
    for (const col of AUTHORITY_CONTINUITY_CSV_COLUMNS) {
      assert.ok(col in row, `column ${col} is present`);
    }
  }
});

test('the registered CSV export scope carries the same figures as the panel', async () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision({ approver: 'Dana Eng' })],
    memos: [memo()],
  });
  const spec = CSV_EXPORTS.find((item) => item.key === 'authority-continuity');
  assert.ok(spec, 'the export scope is registered');
  const res = exportWorkspaceCsv(state, 'authority-continuity', { now: NOW });
  assert.equal(res.ok, true);
  const parsed = parseCsv(res.csv);
  const panel = reportFor(state);
  assert.equal(parsed.rows.length, authorityContinuityCsvRows(panel).length);

  // `parseCsv` returns arrays; the header row names the columns.
  const headers = parsed.headers;
  const summary = Object.fromEntries(headers.map((h, i) => [h, parsed.rows[0][i]]));
  assert.equal(summary.covered_n, String(panel.coveredN));
  assert.equal(summary.uncovered_n, String(panel.uncoveredN));
  assert.equal(summary.attributable_n, String(panel.attributableN));
  assert.equal(summary.population_claim, panel.populationClaim ? 'granted' : 'refused');
  assert.equal(summary.population_claim_reason, panel.populationClaimReason);
});

/* -------------------------------------------------------------- the brief */

test('the brief names nobody and carries the population claim reason', () => {
  const state = makeState({
    history: fullHistory(),
    decisions: [decision({ approver: 'Dana Eng' })],
    memos: [memo()],
  });
  const lines = authorityContinuityBriefLines(reportFor(state));
  assert.ok(lines.length >= 4);
  const joined = lines.join(' ');
  for (const forbidden of ['Dana', 'Priya', 'Sam', 'Q1 board pack']) {
    assert.ok(!joined.includes(forbidden), `the brief must not name "${forbidden}"`);
  }
  assert.ok(joined.includes('frozen decision record'));
});

test('an authority OUTSIDE the seat’s span is withheld, while the verdict survives', () => {
  // The record concerns Sam, who IS in this seat's span, but the authority it
  // names (Dana) is not. The concordance module withholds exactly that name;
  // the register must do the same — a line manager cannot learn who approved
  // a decision about their person by opening a panel they may open.
  const state = makeState({
    history: fullHistory(),
    decisions: [decision({ approver: 'Dana Eng' })],
    links: [link('lnk-1', 'decision', 'dec-1', 'person', 'sam', 'concerns')],
  });
  const scoped = reportFor(state, { scope: new Set(['sam']) });
  assert.equal(scoped.totalN, 1, 'the record IS in scope — it concerns someone in the span');
  const row = scoped.rows[0];
  assert.equal(row.authorityWithheld, true);
  assert.equal(row.authorityName, null, 'the name is withheld');
  assert.match(row.authorityWithheldReason, /outside this seat/);
  assert.equal(row.verdict, 'attributable', 'the verdict survives the withholding');
  assert.equal(scoped.attributableN, 1, 'and so do the counts');

  // An unrestricted seat sees the name.
  const full = reportFor(state, { scope: null });
  assert.equal(full.rows[0].authorityWithheld, false);
  assert.equal(full.rows[0].authorityName, 'Dana Eng');
});

/* ------------------------------------------- the cross-module integration */

test('a REAL finalised merit cycle flows into the register and is compared against the live structure', () => {
  // This is the cross-module proof: the cycle is finalised through the REAL
  // API — which freezes the structure block beside the money (ADR-0155) — and
  // the register then reads that frozen block through the SAME contract the
  // merit-parity reader uses. The two modules cannot disagree.
  const state = makeState({
    history: fullHistory(),
    cycles: [cycle(defaultRows())],
  });
  const ctx = seed(state);
  assert.equal(ctx.api.finalizeMeritCycle('merit-1').ok, true, 'the cycle finalises');

  const r = reportFor(ctx.store.state);
  assert.equal(r.byType.get('merit-cycle').totalN, 1, 'the finalised cycle is in the population');
  const row = r.rows.find((x) => x.type === 'merit-cycle');
  assert.equal(row.verdict, 'attributable', 'the frozen structure reproduces the live as-of structure');
  assert.equal(row.asOf, EFFECTIVE);
  assert.ok(row.frozenAuthority.includes('frozen home line'));
});

test('a home line that moves AFTER the effective date does NOT drift the record', () => {
  // Sam's home line was Dana on 2026-11-15 (the effective date) and moved to
  // Priya on 2026-12-01 — AFTER the money lands. The frozen record names Dana
  // and the as-of reading on the effective date also says Dana: the record
  // reproduces its own authority and must NOT be reported as drift. A move
  // after the decision cannot unmake the decision.
  const people = roster({ sam: { managerId: 'priya' } });
  const history = fullHistory({
    sam: period('sam', 'dana', '2026-09-01', '2026-11-30'),
    extra: period('sam', 'priya', '2026-12-01', null, { recordedOn: '2026-12-01', id: 'str-sam-dec' }),
  });
  const state = makeState({ people, history, cycles: [cycle(defaultRows())] });
  const ctx = seed(state);
  assert.equal(ctx.api.finalizeMeritCycle('merit-1').ok, true);

  const frozen = ctx.store.state.meritCycles[0].audit.structure;
  assert.ok(frozen, 'the structure block was frozen beside the money');

  const r = reportFor(ctx.store.state);
  const row = r.rows.find((x) => x.type === 'merit-cycle');
  assert.equal(row.verdict, 'attributable', 'a later move does not unmake the decision');
  assert.deepEqual(
    ctx.store.state.meritCycles[0].audit.structure,
    frozen,
    'the frozen record is byte-identical after the read',
  );
});

test('a home-line move recorded AFTER the freeze, effective BEFORE the cycle, DRIFTS the record', () => {
  // The cycle is finalised on 2026-11-09 with Sam on Dana's home line (the
  // ledger says so on 2026-11-15). Then the reorganisation is RECORDED — and
  // it says Sam moved to Priya on 2026-11-01, before the money lands. The
  // frozen block still names Dana; the as-of reading on the effective date now
  // says Priya. The record has drifted: it can no longer reproduce the
  // authority the record says was in force. Nothing is rewritten.
  const state = makeState({ history: fullHistory(), cycles: [cycle(defaultRows())] });
  const ctx = seed(state);
  assert.equal(ctx.api.finalizeMeritCycle('merit-1').ok, true);

  const frozen = ctx.store.state.meritCycles[0].audit.structure;
  assert.ok(frozen, 'the structure block was frozen beside the money');
  const samFrozen = frozen.rows.find((row) => row.personId === 'sam');
  assert.equal(samFrozen.managerId, 'dana', 'frozen beside the money as the ledger then said');

  // Record the move afterwards: it takes effect 2026-11-01, before the cycle.
  ctx.store.update((draft) => {
    const rows = draft.structureHistory || [];
    const sam = rows.find((r) => r.personId === 'sam' && r.toISO === null);
    if (sam) sam.toISO = '2026-10-31';
    draft.structureHistory = [...rows, {
      id: 'str-sam-priya', personId: 'sam', managerId: 'priya', fromISO: '2026-11-01',
      toISO: null, recordedOn: '2026-11-09', recordedBySeatId: null, source: 'moved',
      reason: 'Moved to the migration programme.', at: '2026-11-09T00:00:00.000Z',
    }];
  }, { type: 'test.move', entity: 'person', entityId: 'sam', summary: 'Test re-organisation' });

  const r = reportFor(ctx.store.state);
  const row = r.rows.find((x) => x.type === 'merit-cycle');
  assert.equal(row.verdict, 'drifted');
  assert.ok(row.differenceN >= 1);
  assert.equal(r.driftedN, 1);
  assert.equal(r.populationClaim, false, 'a drifted record refuses the portfolio claim');
  assert.deepEqual(
    ctx.store.state.meritCycles[0].audit.structure,
    frozen,
    'the frozen record is never rewritten to match today',
  );
});

/* ------------------------------------------------------------- the panel */

test('the panel prints the STORED state and the computed claim, and refuses an incomplete population', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;

  const { renderContinuityPanel } = await import('../../app/views/matrixContinuityPanel.js');

  // A workspace where one record's authority cannot be read: the population
  // claim must be REFUSED and the reason must be on the screen.
  const state = makeState({
    history: fullHistory(),
    decisions: [
      decision({ id: 'dec-1', approver: 'Dana Eng' }),
      decision({ id: 'dec-2', approver: 'Ghost Person' }),
    ],
    memos: [memo()],
  });
  const report = reportFor(state);
  const node = renderContinuityPanel({ api: null, state }, { now: NOW, settings: state.settings });
  const text = node.textContent;

  assert.match(text, /The portfolio claim is REFUSED/);
  assert.ok(text.includes(report.populationClaimReason), 'the computed claim reason is the printed one');
  assert.match(text, /frozen decision record/i);
  assert.match(text, /No authority named/i);
  assert.match(text, /Could not be read/i);

  // Every rendered stat equals the computed figure.
  const stats = [...node.querySelectorAll('.stat')].map((n) => n.textContent);
  const joined = stats.join(' | ');
  assert.ok(joined.includes(String(report.totalN)), 'the population count is printed');
  assert.ok(joined.includes(String(report.uncoveredN)), 'the uncovered count is printed');
  assert.ok(joined.includes(String(report.attributableN)), 'the attributable count is printed');

  // A complete population GRANTS the claim and the panel says so.
  const complete = makeState({
    history: fullHistory(),
    decisions: [
      decision({ id: 'dec-1', approver: 'Dana Eng' }),
      decision({ id: 'dec-2', approver: 'Dana Eng' }),
      decision({ id: 'dec-3', approver: 'Dana Eng' }),
    ],
  });
  const node2 = renderContinuityPanel({ api: null, state: complete }, { now: NOW, settings: complete.settings });
  assert.match(node2.textContent, /still names the authority that was in force/i);

  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
});

/* ------------------------------------------------------------ single-chain */

test('a single-chain workspace with no frozen decisions reads EMPTY, not broken', () => {
  const state = makeState({ lines: [] });
  const r = reportFor(state);
  assert.equal(r.totalN, 0);
  assert.equal(r.coveredN, 0);
  assert.equal(r.uncoveredN, 0);
  assert.equal(r.hasMatrix, false);
  assert.equal(r.populationClaim, false);
  assert.match(r.populationClaimReason, /below the declared floor/);
});

test('the schema reflects ADR-0159/0162 matrix settlement & interface storage while pure reads store nothing', () => {
  assert.equal(SCHEMA_VERSION, 135, 'ADR-0168 (bench-evidence markers) is the current head');
});
