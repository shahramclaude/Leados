/** Cross-Line Ask Attribution & Shared-Contributor Load Reconciliation (ADR-0178). Pure read model. */
import { buildMatrix, matrixJointApex, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { effectiveDelegationLineActs, normalizeDelegationLineSettings } from './delegationLineSchema.js';
import {
  DELEGATION_LINE_CLASSES, DELEGATION_LINE_VERDICTS, DELEGATION_LINE_LINE_STATES,
  DELEGATION_LINE_CHARTER_STATES, DELEGATION_LINE_APEX_STATES,
  DELEGATION_LINE_CHARTER_RIGHT, DELEGATION_LINE_CSV_COLUMNS, DELEGATION_LINE_METHOD,
  DELEGATION_LINE_RIGHTS,
} from './delegationLineRegistry.js';

const counts = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

function seatFor(state, now, matrix) {
  const scope = matrixLineScope(matrix);
  return activeSeat(buildSeats(state, { now, settings: state.settings || {}, lineScope: scope.byManager }));
}

export function buildDelegationLines(state, { now = new Date(), settings = null, matrix = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const effectiveSettings = settings || state?.settings || {};
  const view = { ...state, settings: effectiveSettings };
  const graph = matrix || buildMatrix(view, { now: at, settings: effectiveSettings });
  const seat = seatFor(view, at, graph);
  const conv = normalizeDelegationLineSettings(effectiveSettings);
  const effective = effectiveDelegationLineActs(state?.delegationLineActs || []);
  const links = Array.isArray(state?.links) ? state.links : [];
  const markers = Array.isArray(state?.delegationLineMarkers) ? state.delegationLineMarkers : [];
  const full = Boolean(seat.fullAccess);
  const visiblePerson = (id) => full || id === seat.id || Boolean(seat.scope?.has(id)) || Boolean(seat.lineScope?.has(id));
  const active = (state?.delegations || []).filter((d) => d?.status === 'active' && visiblePerson(d.personId));
  const byPerson = new Map();
  for (const ask of active) {
    if (!byPerson.has(ask.personId)) byPerson.set(ask.personId, []);
    byPerson.get(ask.personId).push(ask);
  }

  const board = {
    asksReadN: active.length, asksNotReadN: (state?.delegations || []).filter((d) => d?.status === 'active').length - active.length,
    classes: counts(DELEGATION_LINE_CLASSES), sharedPeopleReadN: 0, verdicts: counts(DELEGATION_LINE_VERDICTS),
    linePairsN: 0, lines: counts(DELEGATION_LINE_LINE_STATES), sharedAsksOnLineN: 0,
    charter: counts(DELEGATION_LINE_CHARTER_STATES), overBudgetUnreadableByLineN: 0, asksReattributedN: 0,
    apex: counts(DELEGATION_LINE_APEX_STATES), openReconciliationAsksN: 0,
    classesReconcile: false, verdictsReconcile: false, linesReconcile: false, charterReconcile: false,
  };
  const people = [];
  const openMarkerTasks = new Set(markers.filter((m) => m?.kind === 'ask' && m.taskId).map((m) => m.taskId));
  board.openReconciliationAsksN = active.filter((d) => openMarkerTasks.has(d.id)).length;

  for (const [personId, asks] of [...byPerson].sort(([a], [b]) => a.localeCompare(b))) {
    const node = graph.nodes.get(personId);
    const lines = (node?.lines || []).filter((line) => line.active !== false);
    const shared = lines.length > 1;
    const askRows = [];
    const lineLoads = new Map(lines.map((line) => [line.id, 0]));
    let unreadableN = 0;
    for (const ask of asks.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const entry = effective.get(ask.id);
      const automation = links.some((l) => l?.relation === 'issues-obligation' && l?.targetType === 'delegation'
        && l?.targetId === ask.id && typeof l.ruleId === 'string' && l.ruleId.startsWith('RULE-'));
      let classKey; let line = null;
      if (entry) {
        line = lines.find((x) => x.id === entry.act.lineId && x.managerId === entry.act.managerId) || null;
        classKey = line ? 'attributed' : 'stale';
      } else if (lines.length === 1) { classKey = 'sole-line'; line = lines[0]; }
      else if (automation) classKey = 'rule-issued';
      else classKey = 'unattributed';
      board.classes[classKey] += 1;
      if (entry?.lineN > 1) board.asksReattributedN += 1;
      if (shared && line) {
        lineLoads.set(line.id, (lineLoads.get(line.id) || 0) + 1);
        board.sharedAsksOnLineN += 1;
      } else if (shared && (classKey === 'unattributed' || classKey === 'stale')) unreadableN += 1;
      let charterState = null;
      if (shared && line) {
        const holders = lines.filter((x) => (x.rights || []).includes(DELEGATION_LINE_CHARTER_RIGHT));
        charterState = holders.length === 0 ? 'charter-silent' : holders.some((x) => x.id === line.id) ? 'chartered' : 'outside-charter';
        board.charter[charterState] += 1;
      }
      askRows.push({ delegationId: ask.id, title: ask.title, personId, classKey, lineId: line?.id || entry?.act.lineId || null,
        managerId: line?.managerId || entry?.act.managerId || null, charterState, attributed: Boolean(entry), reattributed: (entry?.lineN || 0) > 1 });
    }
    if (!shared) continue;
    board.sharedPeopleReadN += 1;
    const sharesComplete = lines.every((line) => Number.isInteger(line.shareH));
    const lineRows = lines.map((line) => {
      const load = lineLoads.get(line.id) || 0;
      const entitlementH = sharesComplete ? conv.delegationLineBudget * line.shareH : null;
      const stateKey = !sharesComplete ? 'share-undeclared' : load * 100 > entitlementH ? 'over-share' : 'within-share';
      board.lines[stateKey] += 1; board.linePairsN += 1;
      return { lineId: line.id, managerId: line.managerId, kind: line.kind, shareH: line.shareH, load, entitlementH, stateKey };
    });
    let verdict;
    if (asks.length > conv.delegationLineBudget) verdict = 'overloaded';
    else if (unreadableN) verdict = 'unattributed';
    else if (!sharesComplete) verdict = 'share-undeclared';
    else if (lineRows.some((r) => r.stateKey === 'over-share')) verdict = 'line-over-share';
    else verdict = 'within';
    board.verdicts[verdict] += 1;
    if (asks.length > conv.delegationLineBudget && unreadableN) board.overBudgetUnreadableByLineN += 1;
    const apexResult = matrixJointApex(graph, lines.map((line) => line.managerId));
    const apexState = apexResult.isLeaderOnly ? 'leader-held' : apexResult.unique
      ? (graph.roster.has(apexResult.apexId) ? 'unique' : 'off-roster') : 'ambiguous';
    if (verdict === 'overloaded') board.apex[apexState] += 1;
    people.push({ personId, personName: node?.name || personId, asksN: asks.length, unreadableN, verdict, askRows, lines: lineRows,
      apexState, apexId: apexResult.apexId });
  }
  board.classesReconcile = sum(board.classes) === board.asksReadN;
  board.verdictsReconcile = sum(board.verdicts) === board.sharedPeopleReadN;
  board.linesReconcile = sum(board.lines) === board.linePairsN;
  board.charterReconcile = sum(board.charter) === board.sharedAsksOnLineN;
  return { generatedAt: at.toISOString(), generatedOn: at.toISOString().slice(0, 10), seat, conventions: conv, board, people,
    actor: { canAttribute: !seat.readOnly, canScan: full || (seat.rank || 0) >= 3 }, method: DELEGATION_LINE_METHOD,
    structure: people.length ? 'matrix' : 'single-chain', inertNote: people.length ? '' : 'No person with open work holds more than one active reporting line in this scope.' };
}

export function delegationLineBriefText(report) {
  const b = report.board;
  return [`Cross-line ask attribution — ${report.generatedOn}`, `Open asks read: ${b.asksReadN}; classes reconcile: ${b.classesReconcile ? 'yes' : 'NO'}`,
    `Shared people: ${b.sharedPeopleReadN}; verdicts reconcile: ${b.verdictsReconcile ? 'yes' : 'NO'}`,
    `Over budget: ${b.verdicts.overloaded}; on no line: ${b.classes.unattributed}; stale: ${b.classes.stale}`,
    `Line pairs: ${b.linePairsN}; line states reconcile: ${b.linesReconcile ? 'yes' : 'NO'}`,
    `Charter tests: ${b.sharedAsksOnLineN}; charter states reconcile: ${b.charterReconcile ? 'yes' : 'NO'}`].join('\n');
}

export function delegationLineCsvRows(report) {
  const b = report.board; const row = Object.fromEntries(DELEGATION_LINE_CSV_COLUMNS.map((k) => [k, '']));
  Object.assign(row, { row_kind: 'summary', scope: report.structure, budget: report.conventions.delegationLineBudget,
    asks_read: b.asksReadN, asks_attributed: b.classes.attributed, asks_sole_line: b.classes['sole-line'], asks_rule_issued: b.classes['rule-issued'], asks_unattributed: b.classes.unattributed, asks_stale: b.classes.stale, classes_reconcile: b.classesReconcile,
    asks_not_read: b.asksNotReadN, shared_people_read: b.sharedPeopleReadN,
    verdict_overloaded: b.verdicts.overloaded, verdict_unattributed: b.verdicts.unattributed, verdict_share_undeclared: b.verdicts['share-undeclared'], verdict_line_over_share: b.verdicts['line-over-share'], verdict_within: b.verdicts.within, verdicts_reconcile: b.verdictsReconcile,
    line_pairs: b.linePairsN, lines_over_share: b.lines['over-share'], lines_within_share: b.lines['within-share'], lines_share_undeclared: b.lines['share-undeclared'], lines_reconcile: b.linesReconcile,
    shared_asks_on_a_line: b.sharedAsksOnLineN, asks_chartered: b.charter.chartered, asks_outside_charter: b.charter['outside-charter'], asks_charter_silent: b.charter['charter-silent'], charter_reconcile: b.charterReconcile,
    over_budget_unreadable_by_line: b.overBudgetUnreadableByLineN, asks_reattributed: b.asksReattributedN,
    apex_unique: b.apex.unique, apex_leader_held: b.apex['leader-held'], apex_ambiguous: b.apex.ambiguous, apex_off_roster: b.apex['off-roster'],
    open_reconciliation_asks: b.openReconciliationAsksN, ask_due_days: report.conventions.delegationLineAskDueDays });
  return [row];
}
