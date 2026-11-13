/** ADR-0192 — self-attributed manager declarations through the shared atomic
 * store/event/post-commit pipeline. Never grants an inferred qualification,
 * changes a reporting line, issues a training plan or impersonates a trainer.
 */
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildSkillCoverage } from './skillCoverage.js';
import { SKILL_LIMITS, skillTaskError, skillActError } from './skillCoverageSchema.js';

export function createSkillCoverageActions(store, { now, idFactory }) {
  const fail = (error) => ({ ok: false, error });
  function context(right) {
    const at = new Date(now());
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: store.state.settings });
    const seat = activeSeat(buildSeats(store.state, { now: at, settings: store.state.settings, lineScope }));
    const verdict = canAct(right, seat);
    if (seat.readOnly || !verdict.allow) return fail(verdict.reason || 'Resolve the operating seat first.');
    const report = buildSkillCoverage(store.state, { now: at, seat });
    return { ok: true, at, seat, report, actorId: seat.fullAccess ? LEADER_ID : seat.nodeId || seat.id };
  }
  function save(collection, row, type, summary) {
    if ([...(store.state.skillTasks || []), ...(store.state.skillActs || [])].some((r) => r.id === row.id)) return fail('Generated ledger identity already exists. Nothing was written.');
    store.update((draft) => {
      draft[collection] = [...(draft[collection] || []), row];
    }, { type, entity: 'skillCoverage', entityId: row.id, summary });
    return { ok: true, id: row.id, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] };
  }
  return {
    skillCoverageReport() {
      const c = context('read-skill-coverage');
      return c.ok ? { ok: true, report: c.report } : c;
    },
    skillDeclareTask(input = {}) {
      const c = context('declare-skill-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      if ((store.state.skillTasks || []).length >= SKILL_LIMITS.tasks) return fail('Task register is full. Export the workspace before proceeding.');
      const task = { id: idFactory('skill-task'), holderId: c.actorId, title: String(input.title || '').trim(),
        standard: String(input.standard || '').trim(), floor: input.floor, declaredAt: c.at.toISOString(), retiredOn: null };
      const error = skillTaskError(task);
      if (error) return fail(error);
      if ((store.state.skillTasks || []).some((r) => !r.retiredOn && r.holderId === c.actorId && r.title.toLocaleLowerCase() === task.title.toLocaleLowerCase())) return fail('You already have a live task with this title. Retire the old declaration before replacing it.');
      return save('skillTasks', task, 'skills.task.declared', 'A manager declared a task, its observable standard and its independent-coverage floor.');
    },
    skillRetireTask(taskId) {
      const c = context('declare-skill-coverage');
      if (!c.ok) return c;
      const task = (store.state.skillTasks || []).find((r) => r.id === taskId && !r.invalid);
      if (!task || task.holderId !== c.actorId) return fail('Only the manager who declared this task can retire it. No successor is inferred.');
      if (task.retiredOn) return fail('This task was already retired. Its history remains on record.');
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      store.update((draft) => {
        draft.skillTasks.find((r) => r.id === taskId).retiredOn = c.report.today;
      }, { type: 'skills.task.retired', entity: 'skillCoverage', entityId: taskId, summary: 'A manager retired a task; its qualification history was retained.' });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null };
    },
    skillRecordQualification(input = {}) {
      const c = context('declare-skill-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      const task = (store.state.skillTasks || []).find((r) => r.id === input.taskId && !r.retiredOn && !r.invalid);
      if (!task || task.holderId !== c.actorId) return fail('Only the task’s declaring manager can attest or revoke a qualification in this slice.');
      const matrix = buildMatrix(store.state, { now: c.at });
      if (!matrix.roster.has(input.personId) || !(matrix.linesByPerson.get(input.personId) || []).some((l) => l.managerId === c.actorId)) return fail('That person does not hold an active reporting line to this task’s manager. Qualifications never transfer between pools by inference.');
      if ((store.state.skillActs || []).length >= SKILL_LIMITS.acts) return fail('Qualification ledger is full. Export the workspace before proceeding.');
      const previous = (store.state.skillActs || []).filter((r) => r.taskId === task.id && r.personId === input.personId).at(-1);
      if (input.level === 'revoked' && (!previous || previous.level === 'revoked')) return fail('There is no current attestation to revoke.');
      const act = { id: idFactory('skill-act'), taskId: task.id, personId: input.personId, byId: c.actorId,
        level: input.level, expiresOn: input.level === 'revoked' ? null : input.expiresOn,
        evidence: String(input.evidence || '').trim(), recordedAt: c.at.toISOString(), supersedesId: previous?.id || null };
      const error = skillActError(act, store.state.skillTasks || []);
      if (error) return fail(error);
      return save('skillActs', act, 'skills.qualification.recorded', 'A task’s manager recorded an evidence-backed ILUO attestation or revocation; coverage is recomputed from the ledger.');
    },
  };
}
