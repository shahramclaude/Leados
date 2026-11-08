/**
 * tests/app/matrix-governance.test.mjs — CEO / C-suite × Matrix governance
 * (Session 191, Schema v119 unchanged, `#/matrix?panel=governance` + `#/board`).
 *
 * Tests the structural C-suite layer over the matrix DAG:
 *  1. Minimal common ancestors (`matrixJointApex`): unique LCA on converging
 *     branches, vs. explicit diamond ties (never silently collapsing two
 *     incomparable minimal ancestors to one).
 *  2. Operational vs stewardship rights separation and cross-axis coupling
 *     counts (`matrixGovernance`), plus small-cell Wilson rate refusal below
 *     `MATRIX_FLOORS.cellN` and executive detail-ceiling withholding.
 *  3. Post-commit `RULE-MTX-01` operational triggering (`case.created` after
 *     lines exist), unique joint-apex `escalates-to` links, non-guessing on
 *     diamond ties, privacy refusal on sensitive records, and edge pruning on
 *     line end.
 *  4. Board Room integration (`matrix-authority-vs-tree` cross-check firing
 *     only when matrix issues exist beside a clean tree, zero discrepancy in
 *     single-chain workspaces, `boardPartition` home-tree seam disclosure,
 *     `boardRead` resolving line-only executives, and identity-free text).
 *  5. Matrix CSV round-trip parity across all row kinds (`workspace`,
 *     `manager`, `right`, `finding`, `seat`, `apex`) and small-cell floor
 *     enforcement on `apex` rows.
 *  6. `#/matrix?panel=governance` and `#/board` matrix views render cleanly
 *     in JSDOM with 0 axe-core violations.
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
  buildMatrix,
  buildMatrixReport,
  matrixBriefText,
  matrixCsvRows,
  matrixGovernance,
  matrixJointApex,
} from '../../app/core/domain/matrix.js';
import { MATRIX_CSV_COLUMNS, MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { matrixRule } from '../../app/core/domain/matrixRules.js';
import { runPostCommitRules } from '../../app/core/domain/postCommit.js';
import {
  boardEvaluateMemo,
  boardMemoText,
  boardPartition,
  boardRead,
} from '../../app/core/domain/board.js';
import { BOARD_CLAIMS, BOARD_CROSS_CHECKS } from '../../app/core/domain/boardRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';
import { renderBoard } from '../../app/views/board.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-08T12:00:00.000Z');
const STAMP = '2026-01-01T00:00:00.000Z';

function line(id, personId, managerId, kind, shareH, rights = [], extra = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    role: kind === 'functional' ? 'primary' : 'secondary',
    shareH,
    rights,
    fromISO: '2026-10-01',
    toISO: null,
    note: '',
    status: 'active',
    declaredAt: STAMP,
    history: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function orgRoster() {
  return [
    { id: 'ceo', name: 'Ada Executive', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'vp1', name: 'Victor VP Eng', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'vp2', name: 'Vera VP Prod', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'engdir', name: 'Eve Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'vp2', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'lee', name: 'Lee Designer', level: 'ic', managerId: 'pmdir', status: 'active', createdAt: STAMP },
  ];
}

function workspace(lines = [], extra = {}) {
  const base = createEmptyState(STAMP);
  base.people = orgRoster();
  base.reportingLines = lines;
  return normalizeState({ ...base, ...extra }, { now: NOW }).state;
}

function bootMemoryApi(initialState) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(initialState)]]);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createStore({ now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api };
}

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

/* ------------------------------------------- 1. DAG minimal common ancestors */

test('matrixJointApex resolves the exact unique minimal common ancestor and preserves diamond ties without guessing', () => {
  // Unique convergence: engdir (under vp1 -> ceo) and pmdir (under vp2 -> ceo)
  // converge at ceo, NOT leader.
  const treeMatrix = buildMatrix(workspace([
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ]), { now: NOW });
  const unique = matrixJointApex(treeMatrix, ['engdir', 'pmdir']);
  assert.equal(unique.unique, true);
  assert.equal(unique.ambiguous, false);
  assert.equal(unique.apexId, 'ceo');
  assert.deepEqual(unique.apexIds, ['ceo']);

  // Asymmetric depth: engdir vs vp1 resolves directly to vp1.
  const asym = matrixJointApex(treeMatrix, ['engdir', 'vp1']);
  assert.equal(asym.unique, true);
  assert.equal(asym.apexId, 'vp1');

  // Diamond DAG: engdir also reports to vp2, and pmdir also reports to vp1.
  // Both vp1 and vp2 are incomparable minimal common ancestors above {engdir, pmdir}.
  const diamondMatrix = buildMatrix(workspace([
    line('l-eng-vp2', 'engdir', 'vp2', 'cross-functional', 40, ['priority']),
    line('l-pm-vp1', 'pmdir', 'vp1', 'project', 40, ['priority']),
  ]), { now: NOW });
  const tie = matrixJointApex(diamondMatrix, ['engdir', 'pmdir']);
  assert.equal(tie.unique, false);
  assert.equal(tie.ambiguous, true);
  assert.equal(tie.apexId, null);
  assert.deepEqual(tie.apexIds, ['vp1', 'vp2'], 'both minimal ancestors are listed and neither is picked');
});

/* ------------------------------ 2. Governance read model & small-cell floor */

test('matrixGovernance separates operational vs stewardship rights, counts span coupling and withholds sub-floor rates', () => {
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'governance'), 'governance panel is registered');

  // Single-chain baseline stays clean and zeroed.
  const single = buildMatrixReport(workspace([]), { now: NOW });
  assert.equal(single.governance.hasMatrix, false);
  assert.equal(single.governance.headlineVerdict, 'single-chain');
  assert.equal(single.governance.alertN, 0);
  assert.equal(single.governance.apexRows.length, 0);
  assert.equal(single.governance.coupling.coupledSpanPairsN, 0);

  // Contested operational right (`priority`) on two people (< 3 cell floor),
  // plus one contested stewardship right (`pay`).
  const matrixState = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority', 'assignment', 'technical']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority', 'pay']),
  ], { settings: { activeSeatId: 'leader' } });
  const report = buildMatrixReport(matrixState, { now: NOW, settings: matrixState.settings });
  const gov = report.governance;

  assert.equal(gov.hasMatrix, true);
  assert.equal(gov.headlineVerdict, 'attention');
  assert.equal(gov.contestedOperationalN, 1, 'priority contested');
  assert.equal(gov.contestedPriorityN, 1);
  assert.equal(gov.contestedStewardshipN, 1, 'presumed home pay contested');
  assert.equal(gov.apexRows.length, 1);
  assert.equal(gov.apexRows[0].apexId, 'ceo');
  assert.equal(gov.apexRows[0].operationalContestedN, 1);
  assert.equal(gov.apexRows[0].contestedRightsN, 2);
  assert.equal(gov.coupling.coupledSpanPairsN, 1, 'engdir and pmdir coupled via sam');

  // With only 0 open items (<3 cell floor), sharedWorkPct is withheld rather than 0.
  assert.equal(gov.coupling.workRateRefused, true);
  assert.equal(gov.coupling.sharedWorkPct, null);
  assert.equal(gov.coupling.sharedWorkInterval.lower, null);

  // Brief reports governance summary with no person names.
  const brief = matrixBriefText(report);
  assert.match(brief, /Governance: 1 contested operational right/);
  assert.doesNotMatch(brief, /Sam Engineer|Eve Director|Pia Product/);
});

test('executive detail ceiling withholds non-self apex names at rank 4 while CSV always obeys the small-cell floor', () => {
  const lines = [
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ];
  const vpScoped = buildMatrixReport(workspace(lines, { settings: { activeSeatId: 'vp1' } }), {
    now: NOW,
    settings: { activeSeatId: 'vp1' },
  });
  // vp1 can see engdir/sam, whose contested right against pmdir (outside vp1's scope? Wait: pmdir IS manager on line,
  // rightsRows builds over in-scope people, so apex of ['engdir', 'pmdir'] is 'ceo', non-self rank 5 above vp1!).
  assert.equal(vpScoped.governance.apexRows.length, 1);
  assert.equal(vpScoped.governance.apexRows[0].withheld, true);
  assert.equal(vpScoped.governance.apexRows[0].name, null);
  assert.match(vpScoped.governance.apexRows[0].displayLabel, /withheld at executive ceiling/);

  // Full-access CSV export: only 1 person affected (< cellN = 3), so apex row MUST still be withheld in CSV!
  const fullState = workspace(lines);
  const fullReport = buildMatrixReport(fullState, { now: NOW });
  assert.equal(fullReport.governance.apexRows[0].withheld, false);
  const csvRows = matrixCsvRows(fullReport);
  const apexCsv = csvRows.find((r) => r.row_kind === 'apex');
  assert.ok(apexCsv, 'apex CSV row emitted');
  assert.equal(apexCsv.withheld, 'yes');
  assert.equal(apexCsv.scope, 'withheld', 'sub-floor apex is never named in aggregate CSV');

  // Export round-trip parity over ALL rows including apex & workspace columns.
  const csvText = serializeCsv(MATRIX_CSV_COLUMNS.map((key) => ({ key, header: key })), csvRows);
  const parsed = parseCsv(csvText);
  assert.deepEqual(parsed.headers, [...MATRIX_CSV_COLUMNS]);
  for (const row of parsed.rows) {
    assert.equal(row.length, parsed.headers.length, 'every matrix CSV row matches header column count');
  }
  assert.ok(!csvText.includes('Sam Engineer'), 'IC name never enters matrix CSV');
});

/* -------------------------- 3. RULE-MTX-01 operational triggers & pruning */

test('RULE-MTX-01 triggers on operational commits, links unique joint apex, skips diamond ties & sensitive records, and prunes ended lines', () => {
  // Operational commit in single-chain remains inert.
  const singleDraft = workspace([], {
    cases: [{
      id: 'c-single', title: 'Single chain case', status: 'open', severity: 5,
      personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
      openedOn: '2026-10-10', createdAt: '2026-10-10T00:00:00.000Z',
    }],
  });
  const singleOut = matrixRule(singleDraft, {
    now: NOW,
    idFactory: (p) => `${p}-1`,
    event: { type: 'case.created', entity: 'case', entityId: 'c-single' },
  });
  assert.deepEqual(singleOut, []);
  assert.equal((singleDraft.links || []).length, 0);

  // Operational commit in matrix workspace with unique joint apex (`ceo`):
  // writes `rolls-up-to` to engdir & pmdir AND `escalates-to` to `ceo`, while
  // keeping sensitive conflict items completely out of `links`.
  const matrixDraft = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ], {
    cases: [{
      id: 'c-shared', title: 'Cross-line outage', status: 'open', severity: 7,
      personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
      openedOn: '2026-10-10', createdAt: '2026-10-10T00:00:00.000Z',
    }],
    conflicts: [{
      id: 'conf-secret', title: 'PRIVATE_CONFLICT', status: 'open',
      personId: 'sam', involvedPersonIds: ['sam'], openedOn: '2026-10-10',
      createdAt: '2026-10-10T00:00:00.000Z',
    }],
  });
  let seq = 0;
  const opResult = runPostCommitRules(matrixDraft, {
    now: NOW,
    idFactory: (p) => `${p}-${(seq += 1)}`,
    event: { type: 'case.created', entity: 'case', entityId: 'c-shared' },
  });
  assert.ok(opResult.some((e) => e.ruleId === 'RULE-MTX-01' && e.action === 'rolled-up'));
  assert.ok(opResult.some((e) => e.ruleId === 'RULE-MTX-01' && e.action === 'escalated-to-apex'));

  const mtxLinks = (matrixDraft.links || []).filter((l) => l.ruleId === 'RULE-MTX-01');
  const rollTargets = mtxLinks.filter((l) => l.relation === 'rolls-up-to').map((l) => l.targetId).sort();
  const apexTargets = mtxLinks.filter((l) => l.relation === 'escalates-to').map((l) => l.targetId);
  assert.deepEqual(rollTargets, ['engdir', 'pmdir']);
  assert.deepEqual(apexTargets, ['ceo'], 'unique joint apex above engdir & pmdir receives escalates-to edge');
  assert.equal(mtxLinks.some((l) => l.sourceId === 'conf-secret'), false, 'sensitive records emit zero matrix edges');

  // Diamond tie: must NOT write an escalates-to edge guessing vp1 vs vp2.
  const diamondDraft = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('l-eng-vp2', 'engdir', 'vp2', 'cross-functional', 40, []),
    line('l-pm-vp1', 'pmdir', 'vp1', 'project', 40, []),
  ], {
    cases: [{
      id: 'c-diamond', title: 'Diamond shared work', status: 'open', severity: 6,
      personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
      openedOn: '2026-10-10', createdAt: '2026-10-10T00:00:00.000Z',
    }],
  });
  const diamondOut = matrixRule(diamondDraft, {
    now: NOW,
    idFactory: (p) => `${p}-${(seq += 1)}`,
    event: { type: 'case.created', entity: 'case', entityId: 'c-diamond' },
  });
  assert.ok(diamondOut.some((e) => e.action === 'ambiguous-apex'), 'diamond ambiguity is explicitly flagged');
  const diamondApexEdges = (diamondDraft.links || []).filter((l) => l.ruleId === 'RULE-MTX-01' && l.relation === 'escalates-to');
  assert.equal(diamondApexEdges.length, 0, 'diamond tie never invents one escalates-to owner');

  // Ending the secondary line prunes stale RULE-MTX-01 edges cleanly.
  const secondaryLine = matrixDraft.reportingLines.find((r) => r.id === 'l-sam');
  secondaryLine.toISO = '2026-10-15';
  secondaryLine.endedAt = '2026-10-16T00:00:00.000Z';
  const endOut = matrixRule(matrixDraft, {
    now: NOW,
    idFactory: (p) => `${p}-${(seq += 1)}`,
    event: { type: 'matrix.line.ended', entity: 'matrixline', entityId: 'l-sam' },
  });
  assert.ok(endOut.some((e) => e.action === 'reconciled'));
  assert.equal((matrixDraft.links || []).filter((l) => l.ruleId === 'RULE-MTX-01').length, 0, 'ended line prunes stale fan-out and apex links');
});

test('matrix cap reports distinct missing links exactly and scans converge', () => {
  const cases = Array.from({ length: 61 }, (_, i) => ({
    id: `cap-${i}`, title: 'Shared work', status: 'open', severity: 5,
    personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam', 'kim'],
    openedOn: '2026-10-10', createdAt: STAMP,
  }));
  const draft = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('h-kim', 'kim', 'engdir', 'functional', 60, ['priority']),
    line('l-kim', 'kim', 'pmdir', 'project', 40, ['priority']),
  ], { cases });
  let seq = 0;
  const logs = [];
  const ctx = { now: NOW, idFactory: (p) => `${p}-${++seq}`,
    event: { type: 'matrix.scan' }, logEvent: (event) => logs.push(event) };
  const first = matrixRule(draft, ctx);
  // 61 distinct cases × (two managers + one joint apex) = 183 links.
  assert.equal(draft.links.length, 120);
  const deferred = first.find((e) => e.action === 'deferred');
  assert.match(deferred.summary, /^63 distinct link/);
  assert.ok(logs.some((e) => e.summary.includes(deferred.summary)));
  assert.match(draft.matrixMarkers.at(-1).detail, /63 links deferred/);
  const second = matrixRule(draft, { ...ctx, revision: 2 });
  assert.equal(draft.links.length, 183);
  assert.equal(new Set(draft.links.map((l) => JSON.stringify([l.sourceType, l.sourceId, l.targetId, l.relation]))).size, 183);
  assert.equal(second.some((e) => e.action === 'deferred'), false);
  assert.match(draft.matrixMarkers.at(-1).detail, /0 links deferred/);
});

/* ------------------- 4. Board Room cross-check, partition seam & line seat */

test('Board Room keeps 0 discrepancies in single-chain, fires matrix-authority-vs-tree in matrix, resolves line-only VP, and adds no person names', () => {
  assert.ok(BOARD_CROSS_CHECKS.some((c) => c.key === 'matrix-authority-vs-tree'));

  const claims = BOARD_CLAIMS.map((c) => ({
    key: c.key, comparator: c.comparator, unit: c.unit, threshold: c.defaultThreshold,
    declaredAt: NOW.toISOString(), declaredBy: null, lookedAt: null, lastLookAt: null,
    revisedAfterLook: false, revisionCount: 0, note: '',
  }));
  const memo = {
    id: 'brm-test', revision: 1, title: 'Q4', cycle: '2026-Q4', status: 'draft',
    claims, snapshot: null, lookCount: 0, openedAt: NOW.toISOString(),
  };

  // Single-chain: 4th cross-check stays dormant (`triggered === false`).
  const baseSingle = workspace([]);
  const singleEval = boardEvaluateMemo(baseSingle, memo, {
    now: NOW,
    sources: {
      succession: { spans: [], certification: { pLower: null } },
      solvency: { counts: { open: 0, overdue: 0 } },
      authority: { totalTrials: 10, totalCompleted: 10, overallRefused: false, conv: { floorN: 5 }, altitudeReadings: [] },
      concordance: { pairs: [] },
      health: { overall: null },
      seal: { enabled: false, blocks: 0, verification: { chainValid: false, contentValid: false, breaks: [] } },
      sceptic: { counts: { claims: 0, examined: 0 } },
      matrix: buildMatrixReport(baseSingle, { now: NOW }),
    },
  });
  assert.equal(singleEval.counts.discrepancies, 0);
  assert.equal(singleEval.matrixSummary, null);

  // Matrix workspace where home-tree authority clears (10/10 = 100%) while matrix
  // has contested operational priority right and tree-hidden work item:
  // `matrix-authority-vs-tree` MUST trigger.
  const matrixState = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
  ], {
    cases: [{
      id: 'c-hidden', title: 'Tree hidden item', status: 'open', severity: 6,
      personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
      openedOn: '2026-10-10', createdAt: '2026-10-10T00:00:00.000Z',
    }],
  });
  matrixState.boardMemos = [memo];
  const matrixReport = buildMatrixReport(matrixState, { now: NOW });
  const matrixEval = boardEvaluateMemo(matrixState, memo, {
    now: NOW,
    sources: {
      succession: { spans: [], certification: { pLower: null } },
      solvency: { counts: { open: 0, overdue: 0 } },
      authority: { totalTrials: 10, totalCompleted: 10, overallRefused: false, conv: { floorN: 5 }, altitudeReadings: [] },
      concordance: { pairs: Array.from({ length: 6 }, (_, i) => ({ nodeId: i < 3 ? 'engdir' : 'pmdir', key: `p-${i}`, latestStats: { refused: false, kappaPct: 80, clearsFloor: true } })) },
      health: { overall: null },
      seal: { enabled: false, blocks: 0, verification: { chainValid: false, contentValid: false, breaks: [] } },
      sceptic: { counts: { claims: 0, examined: 0 } },
      matrix: matrixReport,
    },
  });
  const mtxCheck = matrixEval.discrepancies.find((d) => d.key === 'matrix-authority-vs-tree');
  assert.ok(mtxCheck);
  assert.equal(mtxCheck.triggered, true, 'clean tree beside contested matrix fires cross-check');
  assert.match(mtxCheck.finding, /1 contested decision right\(s\)/);
  assert.match(mtxCheck.finding, /1 tree-hidden open item\(s\)/);

  // Span partition preserves total observations AND emits matrixNote disclosing home-tree scope.
  const expRow = matrixEval.rows.find((r) => r.key === 'expectation-alignment');
  assert.ok(expRow.partition.matrixNote, 'span partition discloses matrix coupling outside home tree');
  assert.match(expRow.partition.matrixNote, /Home-tree attribution only/);
  assert.equal(expRow.partition.reconciles, true);

  // Identity-free memo text & brief carry aggregate matrix context and never leak names.
  const { api } = bootMemoryApi(matrixState);
  const memoTxt = boardMemoText(matrixState, { now: NOW, memoId: memo.id });
  assert.match(memoTxt, /MATRIX ACCOUNTABILITY CONTEXT/);
  assert.match(memoTxt, /contested operational right/);
  for (const name of ['Ada Executive', 'Eve Director', 'Pia Product', 'Sam Engineer']) {
    assert.ok(!memoTxt.includes(name), `boardMemoText never leaks ${name}`);
  }
  assert.match(api.boardBriefText(memo.id).text, /Matrix structure active/);

  // Line-only VP (`vpMatrix` has level 'vp', zero tree reports, holds 'sam' on declared line)
  // resolves properly in `boardRead` via `matrixLineScopeFor` instead of falling back to null!
  const vpMatrixState = workspace([
    line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
    line('l-sam-vp', 'sam', 'vpMatrix', 'project', 40, ['priority']),
  ]);
  vpMatrixState.people.push({ id: 'vpMatrix', name: 'Val Matrix VP', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP });
  const readVp = boardRead(vpMatrixState, { now: NOW, settings: { activeSeatId: 'vpMatrix' } });
  assert.equal(readVp.seat?.id, 'vpMatrix');
  assert.equal(readVp.seat?.rank, 4);
});

/* ------------------------------ 5. UI renders cleanly & axe-clean in JSDOM */

test('matrix governance panel and Board Room matrix views render axe-clean with no nested <main>', async () => {
  const { dom, errors } = mountJsdom();
  try {
    const state = workspace([
      line('h-sam', 'sam', 'engdir', 'functional', 60, ['priority']),
      line('l-sam', 'sam', 'pmdir', 'project', 40, ['priority']),
      line('l-eng-vp2', 'engdir', 'vp2', 'cross-functional', 40, []),
      line('l-pm-vp1', 'pmdir', 'vp1', 'project', 40, []),
    ], {
      cases: [{
        id: 'c-ui', title: 'Cross-line incident', status: 'open', severity: 6,
        personId: 'sam', ownerId: 'sam', involvedPersonIds: ['sam'],
        openedOn: '2026-10-10', createdAt: '2026-10-10T00:00:00.000Z',
      }],
    });

    // 1) `#/matrix?panel=governance` under CEO seat (`leader`)
    const govReport = buildMatrixReport(state, { now: NOW, settings: { activeSeatId: 'leader' } });
    const matrixNode = renderMatrix({
      api: { matrixReport: () => ({ ok: true, report: govReport }) },
      query: new URLSearchParams('panel=governance'),
      navigate() {},
      refresh() {},
    });
    assert.equal(matrixNode.tagName, 'DIV');
    assert.equal(matrixNode.querySelector('main'), null);
    assert.match(matrixNode.textContent, /Where unresolved conflicts climb/);
    assert.match(matrixNode.textContent, /tie — neither chosen/);
    assert.match(matrixNode.textContent, /Structural governance checks/);

    dom.window.document.body.replaceChildren(matrixNode);
    const axeMatrix = await dom.window.axe.run(matrixNode, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(axeMatrix.violations.map((v) => v.id), [], 'matrix governance panel is axe-clean');

    // 2) `#/board?panel=memo` & `#/board?panel=discrepancies` with active matrix context
    const { api } = bootMemoryApi(state);
    const opened = api.boardOpenMemo({});
    const boardCtx = (panel) => ({
      api,
      now: NOW,
      query: new URLSearchParams(`panel=${panel}&memo=${encodeURIComponent(opened.memo.id)}`),
      navigate() {},
      refresh() {},
      seatContext: { seat: { fullAccess: false, rank: 5, label: 'CEO / C-suite' } },
    });

    const boardMemoNode = renderBoard(boardCtx('memo'));
    assert.match(boardMemoNode.textContent, /Matrix accountability active/);
    assert.match(boardMemoNode.textContent, /Open Matrix governance/);

    const boardCheckNode = renderBoard(boardCtx('discrepancies'));
    assert.match(boardCheckNode.textContent, /A clean tree can hide an unbalanced or contested matrix/);
    assert.match(boardCheckNode.textContent, /Why these four checks/);

    // Also test boardPartition directly with matrixNote rendered on rollup panel
    const partCheck = boardPartition(state, {
      key: 'expectation-alignment',
      n: 6,
      successes: 6,
      contributions: Array.from({ length: 6 }, (_, i) => ({ nodeId: i < 3 ? 'engdir' : 'pmdir', ok: true })),
    }, { now: NOW, sources: { matrix: govReport } });
    assert.ok(partCheck.matrixNote);

    for (const [label, node] of [['board memo view', boardMemoNode], ['board cross-checks view', boardCheckNode]]) {
      dom.window.document.body.replaceChildren(node);
      const axeBoard = await dom.window.axe.run(node, {
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      });
      assert.deepEqual(axeBoard.violations.map((v) => v.id), [], `${label} is axe-clean`);
    }
    assert.deepEqual(errors, [], 'zero jsdom runtime errors');
  } finally {
    dom.window.close();
  }
});
