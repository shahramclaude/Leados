/** ADR-0192 — one expiry-aware ILUO reader for UI and actions.
 * Unit: a declared task × a live direct reporting-line pool, NOT a person score.
 * Task membership and roll-ups come only from buildMatrix's DAG; shared people
 * are deduplicated, never allocated implicitly. No staffing feasibility claim.
 */
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { dayKey } from '../time.js';
import { normalizeSkillTasks, normalizeSkillActs } from './skillCoverageSchema.js';

export function buildSkillCoverage(state, { now = new Date(), seat = null } = {}) {
  const matrix = buildMatrix(state, { now, settings: state.settings });
  const today = dayKey(now);
  const warnings = [];
  const tasks = normalizeSkillTasks(state.skillTasks, warnings);
  const acts = normalizeSkillActs(state.skillActs, tasks, warnings);
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([actorId, ...(seat.scope || []), ...(seat.lineScope || [])]);
  const visible = (id) => !seat?.readOnly && (operator || reach.has(id));
  const invalidN = [...tasks, ...acts].filter((r) => r.invalid).length;
  const futureN = [...tasks.map((r) => r.declaredAt), ...acts.map((r) => r.recordedAt)].filter((v) => v && v > now.toISOString()).length;
  const reasons = [];
  if (seat?.readOnly) reasons.push('The operating seat is unresolved.');
  if (invalidN) reasons.push(`${invalidN} invalid ledger row(s); coverage withheld rather than resurrecting older evidence. Export the workspace and repair the register.`);
  const excessN = [...tasks, ...acts].reduce((n, r) => n + (Array.isArray(r.excessRows) ? r.excessRows.length : 0), 0);
  if (excessN) reasons.push(`${excessN} over-bound row(s) retained for recovery; no coverage is claimed.`);
  if (futureN) reasons.push(`${futureN} future-dated ledger row(s); coverage cannot be claimed at this clock.`);
  if (matrix.defects.length) reasons.push(`${matrix.defects.length} reporting-graph defect(s); pool completeness cannot be proved.`);
  const clean = reasons.length === 0;
  const latest = new Map();
  for (const act of acts) if (!act.invalid) latest.set(JSON.stringify([act.taskId, act.personId]), act);
  const rows = [];
  const qualifiedByTask = new Map();
  const membersByTask = new Map();
  for (const task of tasks) {
    if (task.invalid || (task.retiredOn && task.retiredOn <= today) || !visible(task.holderId)) continue;
    const holder = matrix.nodes.get(task.holderId);
    const holderOn = task.holderId === LEADER_ID || matrix.roster.has(task.holderId);
    const members = new Set(matrix.lines.filter((l) => l.managerId === task.holderId && matrix.roster.has(l.personId)).map((l) => l.personId));
    const detail = operator || actorId === task.holderId;
    const qualified = new Set();
    const cells = [];
    const counts = { I: 0, L: 0, U: 0, O: 0, unknown: 0, expired: 0, revoked: 0 };
    for (const personId of members) {
      const act = latest.get(JSON.stringify([task.id, personId]));
      const status = !act ? 'unknown' : act.level === 'revoked' ? 'revoked' : act.expiresOn < today ? 'expired' : act.level;
      counts[status] += 1;
      if (clean && holderOn && (status === 'U' || status === 'O')) qualified.add(personId);
      if (detail) cells.push({ personId, name: matrix.nodes.get(personId)?.name || 'Name unavailable', status: clean && holderOn ? status : 'withheld',
        actId: act?.id || null, expiresOn: act?.expiresOn || null, evidence: act?.evidence || '', recordedAt: act?.recordedAt || null });
    }
    const outOfPoolN = [...latest.values()].filter((a) => a.taskId === task.id && !members.has(a.personId)).length;
    const floorN = Math.max(state.settings?.seatFloorN || 3, seat?.disclosure?.floorN || 0);
    const detailWithheld = !detail && members.size < floorN;
    const refused = !clean || !holderOn || detailWithheld;
    const qualifiedN = refused ? null : qualified.size;
    const status = refused ? 'withheld' : !members.size ? 'empty-pool' : qualifiedN === 0 ? 'uncovered' : qualifiedN < task.floor ? 'below-floor' : qualifiedN === 1 ? 'single-point' : 'covered';
    rows.push({ taskId: task.id, holderId: task.holderId, holderName: holder?.name || 'Holder off roster', title: task.title, standard: task.standard,
      floor: task.floor, poolN: members.size, qualifiedN, shortfallN: refused ? null : Math.max(0, task.floor - qualifiedN),
      status, reason: refused ? (reasons.join(' ') || (!holderOn ? 'Task holder is off roster; no successor is inferred.' : `Pool has ${members.size} people below the ancestor disclosure floor ${floorN}; qualification counts withheld.`)) : null,
      counts: refused ? null : counts, outOfPoolN, people: cells, detail, canWrite: clean && actorId === task.holderId && holderOn });
    qualifiedByTask.set(task.id, qualified);
    membersByTask.set(task.id, members);
  }
  const totalsOf = (rs) => {
    const people = new Set();
    const qualified = new Set();
    for (const r of rs) {
      for (const id of membersByTask.get(r.taskId) || []) people.add(id);
      for (const id of qualifiedByTask.get(r.taskId) || []) qualified.add(id);
    }
    const certified = clean && rs.every((r) => r.status !== 'withheld');
    return { tasksN: rs.length, peopleN: people.size, qualifiedPeopleN: certified ? qualified.size : null,
      qualifiedCellsN: certified ? rs.reduce((n, r) => n + r.qualifiedN, 0) : null,
      shortfallN: certified ? rs.reduce((n, r) => n + r.shortfallN, 0) : null,
      singlePointN: certified ? rs.filter((r) => r.qualifiedN === 1).length : null,
      exposedN: certified ? rs.filter((r) => r.qualifiedN < r.floor || r.qualifiedN === 1).length : null,
      emptyPoolN: rs.filter((r) => r.status === 'empty-pool').length,
      withheldN: rs.filter((r) => r.status === 'withheld').length };
  };
  const spans = [];
  for (const node of matrix.nodes.values()) {
    if (!visible(node.id)) continue;
    const below = rows.filter((r) => r.holderId === node.id || node.descendants?.has(r.holderId));
    if (below.length) spans.push({ nodeId: node.id, name: node.name, ...totalsOf(below) });
  }
  return { today, actorId, clean, invalidN, reasons, tasks: rows, spans, totals: totalsOf(rows),
    retiredN: tasks.filter((r) => !r.invalid && r.retiredOn && r.retiredOn <= today && visible(r.holderId)).length,
    canDeclare: !seat?.readOnly && matrix.nodes.has(actorId) && clean,
    method: 'I: in training; L: works with support; U: works independently; O: can train others. Only unexpired U/O declarations count. These are manager attestations, not independently verified credentials. Task coverage is not simultaneous staffing, availability, capacity or consent. Pools and spans overlap; never add span totals.' };
}
