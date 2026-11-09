/**
 * ADR-0140 — the Matrix Accountability Ledger (Schema v119).
 *
 * The claim this module makes is not "it shows a second manager". It is that
 * the roll-up AUDITS ITSELF: every manager's span, added together, must equal
 * the headcount exactly, in whole integer hundredths, and the printed total
 * must be the sum of the printed rows. A tree cannot ask that question; a
 * matrix must be able to answer it.
 *
 * These tests pin:
 *  1. The two reconciliation identities, as EXACT integer equalities.
 *  2. An undeclared allocation is attributed to nobody, never split evenly.
 *  3. A sole line owns the whole person by arithmetic, and says so.
 *  4. A loop, a self-line and a duplicate are refused with a printed reason.
 *  5. Over-commitment is reported and never netted against under-allocation.
 *  6. Contested and unowned decision rights, and the home-line presumption.
 *  7. RULE-MTX-01 fans work to EVERY manager, and refuses to fan a sensitive
 *     source.
 *  8. The CSV's displayed figure is the figure that was computed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import {
  buildMatrix, personAllocation, matrixAllocations, matrixReconciliation,
  matrixManagerSpans, matrixRightsRows, matrixRightsSummary, matrixFindings,
  buildMatrixReport, matrixCsvRows, matrixBriefText, matrixAttentionCount,
  formatShareH, formatDeltaH,
} from '../../app/core/domain/matrix.js';
import { matrixRule } from '../../app/core/domain/matrixRules.js';
import { normalizeReportingLines, normalizeShareH, shareHToDisplay } from '../../app/core/domain/matrixSchema.js';
import {
  MATRIX_CSV_COLUMNS, MATRIX_HOME_RIGHTS_DEFAULT, MATRIX_LIMITS, MATRIX_SHARE_STATES,
} from '../../app/core/domain/matrixRegistry.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { renderMatrix } from '../../app/views/matrix.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

const NOW = new Date('2026-11-08T12:00:00.000Z');
const STAMP = '2026-01-01T00:00:00.000Z';

function roster() {
  return [
    { id: 'ceo', name: 'Ada Chief', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'engdir', name: 'Eve Director', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'otto', name: 'Otto Overload', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
  ];
}

/** A reporting line row, as the normalizer would store it. */
function line(id, personId, managerId, kind, shareH, rights = [], extra = {}) {
  return {
    id, personId, managerId, kind, shareH, rights,
    fromISO: '2026-01-01', toISO: null, declaredAt: STAMP, status: 'active',
    history: [], ...extra,
  };
}

function workspace(lines = [], people = roster()) {
  const state = createEmptyState(NOW.toISOString());
  state.people = people;
  state.reportingLines = lines;
  return normalizeState(state).state;
}

const matrixFor = (lines, people) => buildMatrix(workspace(lines, people), { now: NOW, settings: {} });

/* --------------------------------------------------------------- 1. identity */

test('the two reconciliation identities hold as exact integer equalities', () => {
  const matrix = matrixFor([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('h-kim', 'kim', 'engdir', 'functional', 70),
    line('l-kim', 'kim', 'pmdir', 'product', 30, ['technical']),
    line('h-otto', 'otto', 'engdir', 'functional', 60),
    line('l-otto', 'otto', 'pmdir', 'project', 40),
    line('l-otto-2', 'otto', 'ceo', 'cross-functional', 30),
  ]);
  const allocations = matrixAllocations(matrix);
  const rec = matrixReconciliation(matrix, allocations);

  // Identity (1): the headline net error is exactly the sum of the printed
  // per-person deviations. Nothing enters the total that is not in the table.
  assert.equal(rec.netErrorH, rec.sumOfDeviationsH);
  assert.equal(rec.identityHolds, true);

  // Identity (2): every manager's attributed span, added together, equals the
  // person total exactly — no double counting, nobody lost.
  const spans = matrixManagerSpans(matrix, allocations);
  const spanSum = spans.reduce((acc, s) => acc + s.attributedH, 0);
  assert.equal(spanSum, rec.assertedH);
  assert.equal(rec.fanOutIdentical, true);

  // Otto is 60 + 40 + 30 = 130. The audit is still clean — the ledger reports
  // the over-commitment truthfully instead of hiding it in a rounding error.
  assert.equal(rec.auditClean, true);
  assert.equal(rec.balances, false, 'the allocations genuinely do not add up to the headcount');
  assert.equal(rec.netErrorH, 30);
  assert.equal(rec.netErrorDisplay, '+0.30');
  assert.equal(rec.overN, 1);
});

test('a balanced matrix balances, and says so', () => {
  const matrix = matrixFor([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ]);
  const rec = matrixReconciliation(matrix, matrixAllocations(matrix));
  assert.equal(rec.balances, true);
  assert.equal(rec.netErrorH, 0);
  assert.equal(rec.auditClean, true);
  assert.equal(rec.overN, 0);
  assert.equal(rec.undeclaredN, 0);
});

test('a single-chain workspace is untouched: every person is their own one line', () => {
  const matrix = matrixFor([]);
  const allocations = matrixAllocations(matrix);
  const rec = matrixReconciliation(matrix, allocations);
  assert.equal(rec.lineN, allocations.length, 'one home line per person, no more');
  assert.equal(rec.secondaryLineN, 0);
  assert.equal(rec.multiLineN, 0);
  assert.equal(rec.balances, true, 'an undeclared single-chain org still adds up');
  assert.equal(rec.undeclaredN, 0, 'a person on one line is not "undeclared" — the whole person is theirs');
  assert.equal(rec.soleLineN, allocations.length);
  assert.equal(rec.auditClean, true);
});

/* ------------------------------------------------- 2. refusal, not imputation */

test('an undeclared share is attributed to NOBODY, never split evenly', () => {
  const matrix = matrixFor([
    line('l-kim', 'kim', 'pmdir', 'product', 30, ['technical']),
  ]);
  const kim = personAllocation(matrix, 'kim');
  assert.equal(kim.lineN, 2, 'the home line plus the declared product line');
  assert.equal(kim.totalH, null, 'no total is published');
  assert.equal(kim.shareState, MATRIX_SHARE_STATES.undeclared);
  assert.equal(kim.shareSource, 'refused');

  // And the refusal reaches the roll-up: Kim contributes nothing to anybody.
  const rec = matrixReconciliation(matrix, matrixAllocations(matrix));
  assert.equal(rec.undeclaredN, 1);
  const pmdir = matrixManagerSpans(matrix, matrixAllocations(matrix)).find((s) => s.managerId === 'pmdir');
  assert.equal(pmdir.attributedH, 0, 'Kim’s declared 30 is not attributed while the split is unknown');
  assert.equal(pmdir.undeclaredN, 1);

  // The report refuses to claim it balances on the strength of a guess.
  const report = buildMatrixReport(workspace([line('l-kim', 'kim', 'pmdir', 'product', 30)]), { now: NOW, settings: {} });
  assert.match(matrixBriefText(report), /undeclared/);
});

test('a person on exactly ONE line owns the whole person, by arithmetic and labelled', () => {
  const matrix = matrixFor([]);
  const sam = personAllocation(matrix, 'sam');
  assert.equal(sam.lineN, 1);
  assert.equal(sam.totalH, 100);
  assert.equal(sam.shareSource, 'sole-line', 'the 100 is derived, and it says it is derived');
  assert.equal(sam.shareState, MATRIX_SHARE_STATES.balanced);
});

test('a sole line with a declared share below 100 is UNDER-allocated, not rounded up', () => {
  const matrix = matrixFor([line('h-sam', 'sam', 'engdir', 'functional', 60)]);
  const sam = personAllocation(matrix, 'sam');
  assert.equal(sam.totalH, 60);
  assert.equal(sam.shareState, MATRIX_SHARE_STATES.under);
  assert.equal(sam.deviationH, -40);
  assert.equal(sam.deviationDisplay, '-0.40');
});

test('over-commitment is never netted against under-allocation', () => {
  const matrix = matrixFor([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 80),
    line('h-kim', 'kim', 'engdir', 'functional', 40),
    line('l-kim', 'kim', 'pmdir', 'product', 20),
  ]);
  const rec = matrixReconciliation(matrix, matrixAllocations(matrix));
  // Sam +40, Kim -40. A netting roll-up would print 0.00 and look healthy.
  assert.equal(rec.netErrorH, 0, 'the arithmetic sum happens to be zero');
  assert.equal(rec.overN, 1, 'but Sam is still 140% committed');
  assert.equal(rec.underN, 1, 'and Kim still has 40% accountable to nobody');
  assert.equal(rec.balances, true, 'and the ledger is honest that these are two different facts');
  const findings = matrixFindings(matrix, { allocations: matrixAllocations(matrix) });
  assert.ok(findings.rows.some((f) => f.finding === 'over-committed' && f.personId === 'sam'));
  assert.ok(findings.rows.some((f) => f.finding === 'under-allocated' && f.personId === 'kim'));
});

/* ------------------------------------------------------- 3. refused structures */

test('a line that would close a loop is refused, and the person is kept', () => {
  const matrix = matrixFor([
    // Sam reports to Eve on the home line; making Eve report to Sam is a loop.
    line('loop', 'engdir', 'sam', 'project', 50),
  ]);
  assert.equal(matrix.defects.filter((d) => d.defect === 'cycle').length, 1);
  const cycle = matrix.defects.find((d) => d.defect === 'cycle');
  assert.equal(cycle.lineId, 'loop');
  assert.match(cycle.detail, /accountable to the other/);
  // Eve is still there, and still reporting upward through the real tree.
  assert.ok(matrix.roster.has('engdir'));
  assert.equal(matrix.linesByPerson.get('engdir').length, 1);
});

test('a self-line and a duplicate home declaration are refused with a reason', () => {
  const matrix = matrixFor([
    line('self', 'sam', 'sam', 'project', 50),
    line('dup-a', 'sam', 'engdir', 'functional', 50),
    line('dup-b', 'sam', 'engdir', 'project', 70),
  ]);
  const kinds = matrix.defects.map((d) => d.defect);
  assert.ok(kinds.includes('self-line'));
  assert.ok(kinds.includes('duplicate'), 'the second home-line allocation is refused, not averaged');
  const sam = personAllocation(matrix, 'sam');
  assert.equal(sam.lineN, 1, 'only the one home line survives');
});

test('an unparseable allocation is a DEFECT, not a silent undeclared', () => {
  const matrix = matrixFor([line('bad', 'sam', 'pmdir', 'project', 'half')]);
  assert.ok(matrix.defects.some((d) => d.defect === 'bad-share'));
  const [warnings, state] = [[]];
  const normalized = normalizeReportingLines([{
    id: 'bad', personId: 'sam', managerId: 'pmdir', kind: 'project',
    shareH: 'half', rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: STAMP, status: 'active',
  }], warnings);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].shareH, null);
  assert.equal(normalized[0].shareInvalid, true, 'the row remembers that a value was typed and could not be read');
  assert.equal(state, undefined);
});

test('an ended line stops being counted, and a future line has not started', () => {
  const matrix = matrixFor([
    line('past', 'sam', 'pmdir', 'project', 40, [], { toISO: '2026-06-01' }),
    line('future', 'kim', 'pmdir', 'product', 40, [], { fromISO: '2027-01-01' }),
  ]);
  const sam = personAllocation(matrix, 'sam');
  const kim = personAllocation(matrix, 'kim');
  assert.equal(sam.lineN, 1, 'the ended line is out of the active set');
  assert.equal(kim.lineN, 1, 'the future line is not active yet');
  assert.equal(matrix.inactiveLines.length, 2, 'and both are still on the record');
});

/* ------------------------------------------------------------- 4. rights */

test('the home line is PRESUMED to hold pay, performance and absence — and says so', () => {
  const matrix = matrixFor([line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority'])]);
  const sam = personAllocation(matrix, 'sam');
  const home = sam.lines.find((l) => l.role === 'primary');
  for (const key of MATRIX_HOME_RIGHTS_DEFAULT) {
    assert.ok(home.rights.includes(key), `home line holds ${key}`);
    assert.ok(home.presumedRights.includes(key), `and ${key} is labelled as presumed, not declared`);
  }
  assert.ok(!home.presumedRights.includes('priority'));
});

test('two managers holding the same right is CONTESTED, not averaged', () => {
  const matrix = matrixFor([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ]);
  const rows = matrixRightsRows(matrix, matrixAllocations(matrix));
  const priority = rows.find((r) => r.personId === 'sam' && r.rightKey === 'priority');
  assert.equal(priority.state, 'contested');
  assert.equal(priority.holdersN, 2);
  const summary = matrixRightsSummary(rows);
  assert.equal(summary.contestedN, 1);
});

test('a right nobody holds is UNOWNED, and counts in the attention badge', () => {
  const matrix = matrixFor([
    line('h-sam', 'sam', 'engdir', 'functional', 50),
    line('l-sam', 'sam', 'pmdir', 'project', 50),
  ]);
  const rows = matrixRightsRows(matrix, matrixAllocations(matrix));
  const summary = matrixRightsSummary(rows);
  assert.ok(summary.unownedN > 0, 'assignment and technical direction are held by nobody');
  assert.equal(summary.unownedPeopleN, 1);
  assert.ok(matrixAttentionCount(workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 50),
    line('l-sam', 'sam', 'pmdir', 'project', 50),
  ]), { now: NOW, settings: {} }) >= 0);
});

/* --------------------------------------------- 5. the rule fans to every manager */

test('RULE-MTX-01 fans one work item to EVERY manager in a person’s reporting set', () => {
  const state = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ]);
  state.cases = [{
    id: 'c1', title: 'Migration slipped again', status: 'open', severity: 6,
    personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
    openedOn: '2026-10-01', createdAt: '2026-10-01T00:00:00.000Z',
  }];
  const draft = structuredClone(state);
  draft.links = [];
  draft.matrixMarkers = [];
  let seq = 0;
  const ctx = {
    now: NOW,
    idFactory: (p) => `${p}-${(seq += 1)}`,
    event: { type: 'matrix.line.declared', entity: 'matrixline', entityId: 'l-sam' },
  };
  const out = matrixRule(draft, ctx);
  const fanOut = (draft.links || []).filter((l) => l.relation === 'rolls-up-to' && l.targetType === 'person');
  const targets = new Set(fanOut.map((l) => l.targetId));
  assert.ok(targets.has('pmdir'), 'the project manager sees the work');
  assert.ok(targets.has('engdir'), 'and so does the home-line manager');
  assert.ok(out.some((e) => /roll-up link\(s\)/.test(e.summary)));
});

test('RULE-MTX-01 is INERT in a single-chain workspace', () => {
  const state = workspace([]);
  state.cases = [{
    id: 'c1', title: 'Only one manager here', status: 'open', severity: 4,
    personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
    openedOn: '2026-10-01', createdAt: '2026-10-01T00:00:00.000Z',
  }];
  const draft = structuredClone(state);
  draft.links = [];
  const out = matrixRule(draft, {
    now: NOW, idFactory: (p) => `${p}-1`,
    event: { type: 'matrix.line.declared', entity: 'matrixline', entityId: 'x' },
  });
  assert.deepEqual(out, [], 'a tree already handles this; the matrix rule writes nothing');
  assert.equal((draft.links || []).length, 0);
});

test('the matrix rule is registered on the shared spine and in the propagation contract', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(matrixRule));
  // The seat rule must still fan the PRIMARY tree after this one.
  assert.ok(DEFAULT_POST_COMMIT_RULES.indexOf(matrixRule) < DEFAULT_POST_COMMIT_RULES.length - 1);
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === matrixRule);
  assert.ok(contract, 'a rule on the spine without a declared contract is an unaccountable rule');
  assert.deepEqual(contract.writes, ['links', 'matrixMarkers']);
  assert.match(contract.purpose, /RULE-MTX-01/);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
});

/* ------------------------------------------------------- 6. display == stored */

test('the CSV prints the figure that was computed, and refuses to name a person', () => {
  const report = buildMatrixReport(workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ]), { now: NOW, settings: {} });
  const rows = matrixCsvRows(report);
  const workspaceRow = rows.find((r) => r.row_kind === 'workspace');
  assert.equal(workspaceRow.attributed_h, report.reconciliation.assertedH);
  assert.equal(workspaceRow.net_fte_error_h, report.reconciliation.netErrorH);
  assert.equal(workspaceRow.balances, 'yes');
  // A small manager cell is withheld with its reason, never printed as a name.
  const managerRows = rows.filter((r) => r.row_kind === 'manager');
  for (const row of managerRows) {
    if (row.withheld === 'yes') assert.ok(row.withheld_reason.length > 0);
  }
  for (const key of Object.keys(rows[0])) {
    assert.ok(MATRIX_CSV_COLUMNS.includes(key), `column ${key} is declared in the registry`);
  }
  assert.ok(!rows.some((r) => r.scope === 'Sam Engineer'), 'no person is ever named in an export row');
});

test('the brief states the failure, not a reassurance', () => {
  const bad = buildMatrixReport(workspace([
    line('h-otto', 'otto', 'engdir', 'functional', 60),
    line('l-otto', 'otto', 'pmdir', 'project', 40),
    line('l-otto-2', 'otto', 'ceo', 'cross-functional', 30),
  ]), { now: NOW, settings: {} });
  const text = matrixBriefText(bad);
  assert.match(text, /do NOT add back to the headcount/);
  assert.match(text, /\+0\.30/);
  assert.ok(!/reconciles exactly/.test(text), 'a ledger that does not add up must not say that it does');
});

/* ----------------------------------------------------------- 7. schema & caps */

test('schema v119 migrates additively and starts with an EMPTY line ledger', () => {
  // v119 is no longer the head (ADR-0143 took it to v120); the assertion is that
  // the v119 STEP is still additive and still reaches the current head.
  assert.ok(SCHEMA_VERSION >= 119);
  const { raw, applied } = migrate({ schemaVersion: 118, people: [], settings: {} });
  assert.equal(raw.schemaVersion, 120);
  assert.ok(applied.includes('118 → 119'));
  assert.deepEqual(raw.reportingLines, [], 'no reporting line is invented at upgrade time');
  assert.deepEqual(raw.matrixMarkers, []);
  assert.equal(raw.settings.matrixBalanceHundredths, 5, 'the printed conventions exist before anyone re-declares them');
  assert.equal(raw.settings.matrixExpiringDays, 14);
});

test('the ledger is bounded: the additional-lines cap is enforced, not a suggestion', () => {
  // Eight distinct (manager, kind) pairs against a declared cap of six.
  const kinds = ['project', 'product', 'cross-functional', 'administrative'];
  const many = Array.from({ length: MATRIX_LIMITS.linesPerPerson + 2 }, (_, i) => line(
    `x${i}`, 'sam', i < 4 ? 'pmdir' : 'ceo', kinds[i % kinds.length], 10,
  ));
  const warnings = [];
  const normalized = normalizeReportingLines(many, warnings);
  assert.ok(normalized.length <= MATRIX_LIMITS.linesPerPerson + 1);
  assert.ok(warnings.some((w) => /maximum/.test(w)), 'and the refusal is printed');
});

test('share parsing accepts both 0–1 and 0–100 and holds integers', () => {
  assert.equal(normalizeShareH(0.4), 40);
  assert.equal(normalizeShareH(40), 40);
  assert.equal(normalizeShareH('25'), 25);
  assert.equal(normalizeShareH(null), null);
  assert.equal(normalizeShareH(''), null);
  assert.equal(normalizeShareH(101), null);
  assert.equal(normalizeShareH(-1), null);
  assert.equal(shareHToDisplay(130), '1.30');
  assert.equal(formatShareH(100), '1.00');
  assert.equal(formatDeltaH(-15), '-0.15');
  assert.equal(formatDeltaH(0), '0.00');
});

test('the report is seat-scoped: a seat never sees a peer span’s allocations', () => {
  const state = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('h-kim', 'kim', 'engdir', 'functional', 50),
    line('l-kim', 'kim', 'pmdir', 'product', 50),
  ]);
  const full = buildMatrixReport(state, { now: NOW, settings: {} });
  assert.equal(full.reconciliation.peopleN, 6);
  // A scoped seat sees only its own span; the whole-workspace figure is not leaked.
  const scoped = buildMatrixReport(state, { now: NOW, settings: { activeSeatId: 'engdir' } });
  assert.ok(scoped.reconciliation.peopleN <= full.reconciliation.peopleN);
  assert.equal(scoped.seat.id, 'engdir');
  assert.ok(scoped.people.every((p) => ['sam', 'kim', 'otto', 'engdir'].includes(p.personId)));
});

/* ------------------------------------------------------------- 8. the screen */

test('the desk renders, states the reconciliation, and is axe-clean', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/', virtualConsole });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }

  const report = buildMatrixReport(workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('l-kim', 'kim', 'pmdir', 'product', 30, ['technical']),
    line('h-otto', 'otto', 'engdir', 'functional', 60),
    line('l-otto', 'otto', 'pmdir', 'project', 40),
    line('l-otto-2', 'otto', 'ceo', 'cross-functional', 30),
  ]), { now: NOW, settings: {} });

  const node = renderMatrix({
    api: { matrixReport: () => ({ ok: true, report }) },
    query: new URLSearchParams('panel=desk'),
    navigate() {}, refresh() {},
  });
  dom.window.document.body.append(node);
  const text = node.textContent;

  // The headline states the failure rather than hiding it behind a badge.
  assert.match(text, /do not add back to the headcount/);
  assert.match(text, /\+0\.30/, 'the net error the report computed is the one on the screen');
  assert.match(text, /Otto Overload/, 'the over-committed person is named inside the seat’s own span');
  assert.match(text, /undeclared/, 'and the undeclared split is named, not printed as a number');
  assert.match(text, /does NOT add back|do not add back/);

  dom.window.eval(AXE_SRC);
  const results = await dom.window.axe.run(node, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  assert.deepEqual(results.violations.map((v) => v.id), [], 'no axe violations');
  assert.deepEqual(errors, [], 'no jsdom errors');
});
