/** ADR-0192 — a real manager-attested ILUO register, not a credential inference.
 * All figures and person states come from skillCoverageReport, including blanks.
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { card, table, banner } from '../ui/components.js';

function finish(ctx, result) {
  if (!result?.ok) { toast(result?.error || 'The skill declaration was refused.', 'bad'); return; }
  toast(result.warning || 'Recorded. Coverage has been recomputed.', result.warning ? 'bad' : 'good');
  closeAllModals();
  ctx.refresh();
}
function dialog(ctx, title, fields, action) {
  const form = buildForm(fields);
  openModal({ title, body: form.node, footer: [
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
    h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'skill-save', onClick: () => finish(ctx, action(form.getValues())) }, 'Record declaration'),
  ] });
}
function declareTask(ctx) {
  dialog(ctx, 'Declare a task for your reporting-line pool', [
    { name: 'title', label: 'Task', type: 'text', value: '' },
    { name: 'standard', label: 'Observable independent-performance standard', type: 'textarea', value: '', help: 'At least 10 characters. State the test or evidence required, not a personality judgement.' },
    { name: 'floor', label: 'Minimum independently qualified people (1–100)', type: 'number', value: '2' },
  ], (v) => ctx.api.skillDeclareTask({ ...v, floor: Number(v.floor) }));
}
function recordQualification(ctx, task, today) {
  dialog(ctx, `Attest qualification — ${task.title}`, [
    { name: 'personId', label: 'Person in your live reporting-line pool', type: 'select', options: task.people.map((p) => ({ value: p.personId, label: p.name })), value: task.people[0]?.personId || '' },
    { name: 'level', label: 'Your observed level', type: 'select', value: 'I', options: [
      { value: 'I', label: 'I — in training' }, { value: 'L', label: 'L — works with support' },
      { value: 'U', label: 'U — works independently' }, { value: 'O', label: 'O — can train others' }, { value: 'revoked', label: 'Revoke prior attestation' },
    ] },
    { name: 'expiresOn', label: 'Valid through (inclusive; ignored for revocation)', type: 'date', value: today },
    { name: 'evidence', label: 'Evidence or reason for revocation', type: 'textarea', value: '', help: 'At least 10 characters. Reference the observed demonstration and its standard. Nothing is inferred from ratings or job titles.' },
  ], (v) => ctx.api.skillRecordQualification({ ...v, taskId: task.taskId }));
}
const n = (value) => value === null || value === undefined ? 'Withheld' : String(value);
export function renderSkillCoveragePanel(ctx) {
  const result = ctx.api.skillCoverageReport();
  if (!result?.ok) return banner({ tone: 'warn', title: 'Skill coverage was refused', body: result?.error || 'No readable seat.' });
  const r = result.report;
  return h('div', { class: 'stack', 'data-testid': 'skill-coverage' },
    card({ title: 'Skills & versatility — manager-attested ILUO',
      subtitle: `As of ${r.today}. ${r.retiredN} retired task(s) retained in the workspace history.`,
      actions: r.canDeclare ? [h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'skill-declare', onClick: () => declareTask(ctx) }, 'Declare task')] : [],
      body: h('div', { class: 'stack' },
        h('p', { 'data-testid': 'skill-summary' }, `${r.totals.tasksN} live task(s) · ${r.totals.peopleN} distinct people · ${n(r.totals.qualifiedCellsN)} qualified task/person cells · ${n(r.totals.singlePointN)} single-point task(s) · ${n(r.totals.shortfallN)} total shortfall.`),
        ...r.reasons.map((reason) => banner({ tone: 'warn', title: 'Coverage withheld', body: reason })),
        h('p', { class: 'muted small' }, r.method),
        h('p', { class: 'muted small' }, 'A floor of one may be met and still be a single point of skill. An empty pool is not covered. A qualification on one manager’s task never qualifies the same person on another manager’s task. Only the task’s manager sees individual evidence; ancestors see task counts. Training plans, trainee acknowledgement, independent trainer approval, reminders and scheduling are not implemented.'),
        h('details', null, h('summary', null, 'How to read this register'),
          h('figure', null,
            h('img', { src: './app/assets/skill-coverage.jpg', alt: 'Conceptual illustration: two manager branches share three people; task rows show multiple qualified people, a single point of skill, and expired evidence.', style: { width: '100%', height: 'auto' } }),
            h('figcaption', { class: 'muted small' }, 'AI-generated method illustration, not workspace data. Produced with the available image-generation tool; Higgsfield was unavailable.')))),
    }),
    ...r.tasks.map((task) => card({ title: task.title,
      subtitle: `${task.holderName} · ${task.status} · qualified ${n(task.qualifiedN)} / floor ${task.floor} · pool ${task.poolN} · shortfall ${n(task.shortfallN)} · ${task.outOfPoolN} former-pool attestation(s) excluded`,
      actions: task.canWrite ? [
        ...(task.people.length ? [h('button', { class: 'btn btn-small', type: 'button', 'data-testid': `skill-attest-${task.taskId}`, onClick: () => recordQualification(ctx, task, r.today) }, 'Attest / revoke')] : []),
        h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => dialog(ctx, 'Retire this task? History will be retained.', [], () => ctx.api.skillRetireTask(task.taskId)) }, 'Retire task'),
      ] : [],
      body: h('div', { class: 'stack', 'data-testid': `skill-task-${task.taskId}` },
        h('p', null, task.standard), task.reason ? h('p', { class: 'muted' }, task.reason) : null,
        task.detail ? table({ caption: 'Current pool — no qualification is inferred for an unknown person', columns: [
          { key: 'name', label: 'Person' }, { key: 'status', label: 'Current state' },
          { key: 'expiresOn', label: 'Valid through', render: (p) => p.expiresOn || 'Not declared' },
          { key: 'evidence', label: 'Manager evidence', render: (p) => p.evidence || 'No attestation' },
        ], rows: task.people, emptyMessage: 'No live direct reporting-line members. Coverage cannot be supplied by a former member.' })
          : h('p', { class: 'muted small' }, 'Individual evidence is withheld: only the task’s declaring manager or the local operator can read it.'),
      ),
    })),
    card({ title: 'Hierarchy / matrix roll-up', subtitle: 'Distinct people within each span; spans overlap and must not be added.', body: table({
      caption: 'Skill coverage by leadership span', columns: [
        { key: 'name', label: 'Span' }, { key: 'tasksN', label: 'Tasks' }, { key: 'peopleN', label: 'Distinct people' },
        { key: 'qualifiedPeopleN', label: 'Distinct qualified people', render: (row) => n(row.qualifiedPeopleN) },
        { key: 'singlePointN', label: 'Single-point tasks', render: (row) => n(row.singlePointN) },
        { key: 'shortfallN', label: 'Shortfall', render: (row) => n(row.shortfallN) },
      ], rows: r.spans, emptyMessage: 'Declare a task to start the register. No qualifications or exposure are inferred from an empty register.',
    }) }),
  );
}
