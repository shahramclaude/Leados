/**
 * Read-only matrix goal carriage audit (Session 225 slice).
 *
 * Goals still store one owner and have no persisted line-stances. Accordingly,
 * this reader never infers an exclusive carrier: a goal on multiple live lines
 * is explicitly `unattributed` and remains visible in every relevant manager
 * span. Each span is deduplicated by goal id; branch appearances are shown
 * separately so a leader can see exactly where adding branches double-counts.
 */
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { GOAL_CARRIAGE_LIMITS } from './goalCarriageRegistry.js';

const ACTIVE = (goal) => goal?.status === 'active';

function currentDefects(state, matrix) {
  const rawById = new Map((Array.isArray(state.reportingLines) ? state.reportingLines : [])
    .filter((row) => row?.id).map((row) => [row.id, row]));
  return matrix.defects.filter((defect) => {
    if (!defect.lineId) return true; // A malformed home edge is current by definition.
    const row = rawById.get(defect.lineId);
    if (!row) return true; // Missing source row: cannot prove the defect is historical.
    const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
      && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
    if (validDay(row.fromISO) && row.fromISO > matrix.today) return false;
    if (validDay(row.toISO) && row.toISO < matrix.today) return false;
    return true;
  });
}

function classify(goal, matrix, defects) {
  if (!goal.ownerId) return 'leader-owned';
  const person = matrix.roster.get(goal.ownerId);
  if (!person) return 'unplaced';
  const lines = matrix.linesByPerson.get(goal.ownerId) || [];
  if (!lines.length || defects.some((d) => d.personId === goal.ownerId)) return 'unanchored';
  return lines.length > 1 ? 'unattributed' : 'single-line';
}

function managerIds(matrix, scopeIds) {
  const allowed = scopeIds ? new Set(scopeIds) : null;
  return [...matrix.nodes.keys()]
    .filter((id) => id === LEADER_ID || matrix.roster.has(id))
    .filter((id) => !allowed || id === LEADER_ID || allowed.has(id))
    .filter((id) => {
      const node = matrix.nodes.get(id);
      return id === LEADER_ID || node?.descendants?.size || matrix.linesByPerson.has(id);
    })
    .sort((a, b) => {
      if (a === LEADER_ID) return -1;
      if (b === LEADER_ID) return 1;
      return String(matrix.nodes.get(a)?.name || a).localeCompare(String(matrix.nodes.get(b)?.name || b));
    });
}

function spanFor(managerId, matrix, goals, classifications, defects, scopeIds) {
  const manager = matrix.nodes.get(managerId);
  const people = new Set([...(managerId === LEADER_ID ? [] : [managerId]), ...(manager?.descendants || [])]);
  if (scopeIds) for (const id of [...people]) if (!scopeIds.has(id)) people.delete(id);
  const ownGoals = goals.filter((g) => g.ownerId ? people.has(g.ownerId) : managerId === LEADER_ID);

  const children = managerId === LEADER_ID
    ? [...matrix.roster.keys()].filter((id) => (matrix.nodes.get(id)?.managerIds || []).includes(LEADER_ID))
    : [...matrix.roster.keys()].filter((id) => (matrix.nodes.get(id)?.managerIds || []).includes(managerId));
  const branches = [
    { id: managerId, people: new Set(managerId === LEADER_ID ? [] : [managerId]) },
    ...children.map((id) => ({ id, people: new Set([id, ...(matrix.nodes.get(id)?.descendants || [])]) })),
  ];
  const branchGoalIds = branches.map((branch) => new Set(
    goals.filter((goal) => goal.ownerId
      ? branch.people.has(goal.ownerId) && people.has(goal.ownerId)
      : managerId === LEADER_ID && branch.id === LEADER_ID).map((goal) => goal.id),
  ));
  const branchAppearances = branchGoalIds.reduce((sum, ids) => sum + ids.size, 0);
  const distinctGoalIds = new Set(ownGoals.map((g) => g.id));
  const spanDefects = defects.filter((d) => d.personId && people.has(d.personId));
  const refused = spanDefects.length > 0;
  const stateCounts = Object.create(null);
  for (const goal of ownGoals) {
    const state = classifications.get(goal.id);
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }
  const reconciles = Object.values(stateCounts).reduce((sum, count) => sum + count, 0) === ownGoals.length;

  return {
    spanId: managerId,
    // Intentionally identity-free. The panel reports a structural reading, not
    // a named person's performance score.
    spanLabel: managerId === LEADER_ID ? 'Workspace leader span' : 'Manager span',
    goalN: refused ? null : distinctGoalIds.size,
    branchAppearanceN: refused ? null : branchAppearances,
    duplicateAppearanceN: refused ? null : branchAppearances - distinctGoalIds.size,
    multiLineGoalN: refused ? null : ownGoals.filter((g) => classifications.get(g.id) === 'unattributed').length,
    stateCounts: refused ? null : stateCounts,
    reconciles: !refused && reconciles,
    refused,
    refusalN: spanDefects.length,
    refusalReason: refused
      ? `${spanDefects.length} active reporting-line defect(s) sit inside this span; goal totals are withheld rather than computed over a partial graph.`
      : '',
    branchN: branches.length,
  };
}

/** Build identity-free current-state counts from the canonical matrix DAG. */
export function buildGoalCarriageReport(state = {}, { now = new Date(), scopeIds = null } = {}) {
  const matrix = buildMatrix(state, { now, settings: state.settings || {} });
  const scope = scopeIds ? new Set(scopeIds) : null;
  const defects = currentDefects(state, matrix);
  const goals = (Array.isArray(state.goals) ? state.goals : []).filter(ACTIVE);
  const classifications = new Map(goals.map((goal) => [goal.id, classify(goal, matrix, defects)]));
  const inScopeGoal = (goal) => !scope || (goal.ownerId ? scope.has(goal.ownerId) : scope.has(LEADER_ID));
  const scopedGoals = goals.filter(inScopeGoal);
  const counts = Object.create(null);
  for (const goal of scopedGoals) {
    const key = classifications.get(goal.id);
    counts[key] = (counts[key] || 0) + 1;
  }
  const stateReconciles = Object.values(counts).reduce((sum, count) => sum + count, 0) === scopedGoals.length;
  const ids = managerIds(matrix, scope);
  const allRows = ids.map((id) => spanFor(id, matrix, scopedGoals, classifications, defects, scope));
  const rows = allRows.slice(0, GOAL_CARRIAGE_LIMITS.spanRows);
  const omittedSpanN = allRows.length - rows.length;
  const stateReconcilesEverywhere = rows.every((row) => row.reconciles);
  const totals = {
    activeGoalN: scopedGoals.length,
    multiLineGoalN: scopedGoals.filter((goal) => classifications.get(goal.id) === 'unattributed').length,
    unplacedGoalN: scopedGoals.filter((goal) => classifications.get(goal.id) === 'unplaced').length,
    stateReconciles,
    stateCounts: counts,
  };
  return {
    generatedOn: matrix.today,
    engineVersion: 'goal-carriage-readonly-v1',
    matrix: matrix.lines.some((line) => line.role === 'secondary'),
    totals,
    rows,
    omittedSpanN,
    spanRowsN: allRows.length,
    rowsReconcile: !omittedSpanN && stateReconcilesEverywhere,
    reconciliation: {
      goalStatesEqualActive: stateReconciles,
      eachSpanStatesEqualDisplayedGoals: stateReconcilesEverywhere && !omittedSpanN,
      reason: omittedSpanN ? `${omittedSpanN} manager span(s) exceed the display cap and are counted as omitted.` : '',
    },
    method: 'Active goal ownership is read against the live buildMatrix DAG. A person with multiple live managers remains in every applicable span; that goal is counted once per span, while branch appearances and duplicate appearances are reported separately. No line is selected as exclusive owner.',
  };
}
