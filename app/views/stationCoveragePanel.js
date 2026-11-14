/** ADR-0201 — a real simultaneous-staffing register, not a percentage.
 * Every figure, verdict, deficient set and refusal comes from
 * `stationCoverageReport`; nothing here computes one of its own, and nothing
 * here assigns anybody to anything. Withheld figures print "Withheld".
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, table, banner } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  STATION_COVERAGE_CSV_COLUMNS,
  STATION_COVERAGE_REQUIREMENTS,
  STATION_COVERAGE_STATION_STATES,
} from '../core/domain/stationCoverageRegistry.js';

const n = (value) => (value === null || value === undefined ? 'Withheld' : String(value));
const dash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const DIAGRAM_URL = './app/assets/station-coverage.jpg';

function finish(ctx, result) {
  if (!result?.ok) { toast(result?.error || 'The station declaration was refused.', 'bad'); return; }
  toast(result.warning || 'Recorded. Coverage has been recomputed.', result.warning ? 'bad' : 'good');
  closeAllModals();
  ctx.refresh();
}
function dialog(ctx, title, fields, action, submitLabel = 'Record declaration') {
  const form = buildForm(fields);
  openModal({ title, body: form.node, footer: [
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
    h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'station-save', onClick: () => finish(ctx, action(form.getValues())) }, submitLabel),
  ] });
}

function declareWindow(ctx, today) {
  dialog(ctx, 'Declare a simultaneous window', [
    { name: 'label', label: 'Window name', type: 'text', value: '', help: 'The shift, run or day this register must be able to staff — for example “Monday A-shift”.' },
    { name: 'fromDay', label: 'First day', type: 'date', value: today },
    { name: 'toDay', label: 'Last day (inclusive)', type: 'date', value: today },
  ], (v) => ctx.api.stationCoverageDeclareWindow(v));
}

function declareStation(ctx, window, tasks) {
  dialog(ctx, `Declare a station in “${window.label}”`, [
    { name: 'title', label: 'Station', type: 'text', value: '', help: 'The physical or logical place that must be manned.' },
    { name: 'standard', label: 'Observable standard', type: 'textarea', value: '', help: 'At least 10 characters. State what “manned” means, not who should do it.' },
    { name: 'taskId', label: 'ILUO task that qualifies a person for this station', type: 'select',
      value: tasks[0]?.id || '',
      options: tasks.map((t) => ({ value: t.id, label: `${t.title} (floor ${t.floor})` })),
      help: 'Only people with a live, unexpired U or O attestation on this task can man the station.' },
    { name: 'requirement', label: 'Requirement', type: 'select', value: 'concurrent',
      options: STATION_COVERAGE_REQUIREMENTS.map((r) => ({ value: r.key, label: r.label })) },
    { name: 'demand', label: 'People required at once (1–200)', type: 'number', value: '1' },
  ], (v) => ctx.api.stationCoverageDeclareStation({ ...v, windowId: window.windowId, demand: Number(v.demand) }));
}

function declareAvailability(ctx, window, candidates, today) {
  dialog(ctx, `Availability for “${window.label}”`, [
    { name: 'personId', label: 'Person', type: 'select', value: candidates[0]?.personId || '',
      options: candidates.map((c) => ({ value: c.personId, label: c.label })) },
    { name: 'fromDay', label: 'Available from', type: 'date', value: window.fromDay },
    { name: 'toDay', label: 'Available through (inclusive)', type: 'date', value: window.toDay },
    { name: 'capacity', label: 'How many stations they can hold at once (1–10)', type: 'number', value: '1' },
    { name: 'note', label: 'Note (optional)', type: 'text', value: '', help: 'Anything the statement should carry — a partial day, a condition. Never a personality remark.' },
  ], (v) => ctx.api.stationCoverageDeclareAvailability({ ...v, windowId: window.windowId, capacity: Number(v.capacity) }),
  'Record availability');
}

function withdraw(ctx, statementId) {
  const form = buildForm([
    { name: 'reason', label: 'Why is this statement being withdrawn?', type: 'textarea', value: '', help: 'At least 5 characters. The statement is kept on record with this reason.' },
  ]);
  openModal({ title: 'Withdraw this availability statement?', body: form.node, footer: [
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
    h('button', { type: 'button', class: 'btn btn-danger', 'data-testid': 'station-withdraw-save',
      onClick: () => finish(ctx, ctx.api.stationCoverageWithdrawAvailability(statementId, form.getValues().reason)) }, 'Withdraw'),
  ] });
}

function csv(ctx, today) {
  const result = ctx.api.stationCoverageCsvRows();
  if (!result?.ok) { toast(result?.error || 'The station-coverage export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-skill-station-coverage-${today}.csv`,
    text: serializeCsv(STATION_COVERAGE_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Aggregate CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.stationCoverageBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({ title: 'Simultaneous station coverage — brief', body: h('pre', { class: 'brief', 'data-testid': 'station-brief' }, result.text), footer: [
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close'),
  ] });
}

const VERDICT_TONE = { feasible: 'good', infeasible: 'bad', unproven: 'warn', inert: 'neutral' };

function witnessBlock(row) {
  const w = row.witness;
  return h('div', { class: 'stack', 'data-testid': `station-witness-${row.windowId}` },
    banner({ tone: 'bad', title: `Proven shortage — exact deficit ${w.deficitN}`,
      body: `The stations ${w.stationTitles.map((t) => `“${t}”`).join(', ')} demand ${w.demandN} person(s) between them, but only ${w.peopleN} qualified, available person(s) can serve any of them — ${w.capacityN} concurrent place(s) in total. Whoever is scheduled, at least one of these stations runs unmanned.${w.minimal ? ' This is the smallest such set: every station named is load-bearing.' : ''} This is a proof, not a percentage.` }),
    h('p', { class: 'muted small' }, 'No person is named to move: the register proves that an assignment cannot exist, and a human decides what changes.'));
}

function windowCard(ctx, row, tasks, report) {
  const candidates = [];
  for (const station of row.stations) {
    for (const person of station.people || []) {
      if (!candidates.some((c) => c.personId === person.personId)) {
        candidates.push({ personId: person.personId, label: `${person.name}${person.available ? '' : ' (no availability statement)'}` });
      }
    }
  }
  const actions = [];
  if (report.canDeclare && !row.past && tasks.length) {
    actions.push(h('button', { type: 'button', class: 'btn btn-small', 'data-testid': `station-add-${row.windowId}`, onClick: () => declareStation(ctx, row, tasks) }, 'Declare station'));
  }
  if (report.canDeclareAvailability && !row.past && candidates.length) {
    actions.push(h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'data-testid': `station-avail-${row.windowId}`, onClick: () => declareAvailability(ctx, row, candidates, report.today) }, 'Record availability'));
  }
  if (report.canDeclare && row.holderId === report.actorId) {
    actions.push(h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => dialog(ctx, 'Retire this window? Its stations and statements stay on record.', [], () => ctx.api.stationCoverageRetireWindow(row.windowId), 'Retire') }, 'Retire'));
  }
  const columns = [
    { key: 'title', label: 'Station' },
    { key: 'requirement', label: 'Requirement', render: (s) => STATION_COVERAGE_REQUIREMENTS.find((r) => r.key === s.requirement)?.label || s.requirement },
    { key: 'taskTitle', label: 'Qualifying task' },
    { key: 'demand', label: 'Required at once' },
    { key: 'qualifiedN', label: 'Qualified', render: (s) => n(s.qualifiedN) },
    { key: 'availableN', label: 'Qualified & available', render: (s) => n(s.availableN) },
    { key: 'state', label: 'State', render: (s) => STATION_COVERAGE_STATION_STATES.find((x) => x.key === s.state)?.label || s.state },
  ];
  return card({
    title: `${row.label} · ${row.fromDay} → ${row.toDay}${row.dayN > 1 ? ` (${row.dayN} days)` : ''}`,
    subtitle: `${row.verdictLabel} · ${row.concurrentN} simultaneous · ${row.sequentialN} sequential · declared headcount ${row.demandN} · ${row.statementsN} live statement(s)${row.withdrawnN ? `, ${row.withdrawnN} withdrawn` : ''}${row.past ? ' · window has passed' : ''}`,
    attrs: { 'data-testid': `station-window-${row.windowId}`, 'data-verdict': row.verdict },
    actions,
    body: h('div', { class: 'stack' },
      ...(row.witness ? [witnessBlock(row)] : []),
      row.verdict === 'feasible'
        ? banner({ tone: 'good', title: 'Feasible — a legal assignment exists',
          body: `${row.matching.matchedN} of ${row.matching.totalDemand} required place(s) are fillable from ${row.matching.peopleN} candidate(s) carrying ${row.matching.capacityN} declared concurrent place(s). This is a proof of possibility, not a schedule: nobody has been assigned.` })
        : null,
      row.verdict === 'unproven'
        ? banner({ tone: 'warn', title: 'Unproven — the register cannot answer yet',
          body: row.undeclaredN
            ? `${row.undeclaredN} qualified person(s) in this window made no availability statement. Silence is not unavailability, so no shortage and no feasibility is claimed.`
            : 'The record cannot support a feasibility claim. Nothing is claimed either way.' })
        : null,
      ...row.reasons.map((reason) => h('p', { class: 'muted small' }, reason)),
      table({ caption: `Stations in ${row.label}`, columns, rows: row.stations,
        emptyMessage: 'No station is declared for this window yet. A window with no station proves nothing.' }),
      row.sequentialNote ? h('p', { class: 'muted small' }, row.sequentialNote) : null,
      row.stations.some((s) => s.people?.length)
        ? h('details', null, h('summary', null, 'Who is qualified and who said they are available'),
          h('div', { class: 'stack' }, ...row.stations.filter((s) => s.people?.length).map((s) => h('div', null,
            h('p', { class: 'small' }, h('strong', null, s.title)),
            table({ caption: `People for ${s.title}`, columns: [
              { key: 'name', label: 'Person' },
              { key: 'qualified', label: 'Qualified', render: (p) => (p.qualified ? 'U/O on record' : 'No') },
              { key: 'available', label: 'Availability', render: (p) => (p.available ? `${p.basis === 'self' ? 'Own statement' : 'Manager statement'} · ${p.coveredFrom} → ${p.coveredTo} · capacity ${p.capacity}` : 'No statement') },
              { key: 'rejected', label: 'Why excluded', render: (p) => p.rejected || 'Counted' },
            ], rows: s.people })))))
        : h('p', { class: 'muted small' }, 'Individual rows are withheld: only the window’s holder or the local operator can read them.'),
    ),
  });
}

export function renderStationCoveragePanel(ctx) {
  const result = ctx.api.stationCoverageReport();
  if (!result?.ok) return banner({ tone: 'warn', title: 'Station coverage was refused', body: result?.error || 'No readable seat.' });
  const r = result.report;
  const t = r.totals;
  const skill = ctx.api.skillCoverageReport?.();
  const tasks = skill?.ok ? (skill.report.tasks || []).filter((task) => task.canWrite).map((task) => ({ id: task.taskId, title: task.title, floor: task.floor })) : [];
  const live = r.windows.filter((w) => !w.past);
  const past = r.windows.filter((w) => w.past);
  return h('div', { class: 'stack', 'data-testid': 'station-coverage' },
    card({
      title: 'Simultaneous station coverage — can these stations actually run at once?',
      subtitle: `As of ${r.today}. ${t.windowsN} declared window(s); ${t.retiredN} retired window(s) retained in history.`,
      actions: [
        ...(r.canDeclare ? [h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'station-declare-window', onClick: () => declareWindow(ctx, r.today) }, 'Declare window')] : []),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'station-brief', onClick: () => briefDialog(ctx) }, 'Brief'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'station-csv', onClick: () => csv(ctx, r.today) }, 'Export CSV'),
      ],
      body: h('div', { class: 'stack' },
        h('p', { 'data-testid': 'station-summary' },
          `${t.windowsN} window(s) · ${t.concurrentN} simultaneous station(s) · ${t.demandN} declared headcount · ${t.feasibleN} proven feasible · ${t.infeasibleN} proven infeasible · ${t.unprovenN} unproven · ${t.deficientSetsN} deficient set(s) · largest exact deficit ${t.maxDeficitN}.`),
        ...r.reasons.map((reason) => banner({ tone: 'warn', title: 'Coverage withheld', body: reason })),
        h('p', { class: 'muted small' }, r.method),
        h('p', { class: 'muted small' }, 'This is not the skills register: coverage there counts qualified people per task. This register answers a different question — whether the same person is being counted by two stations that must run at the same moment. Availability is a dated human statement and is never assumed; nobody is scheduled by this screen.'),
        h('details', null, h('summary', null, 'How the shortage witness is proved'),
          h('figure', null,
            h('img', { src: DIAGRAM_URL, alt: 'Conceptual illustration: three stations must run at once; qualified people are drawn only to the stations their attestation names; one subset of stations has more demand than the people able to serve it, and that subset and its deficit are highlighted.', style: { width: '100%', height: 'auto' } }),
            h('figcaption', { class: 'muted small' }, 'AI-generated method illustration, not workspace data. Feasibility is decided by exact integer maximum matching; the highlighted subset is Hall’s condition failing.')),
          h('p', { class: 'muted small' }, 'Two stations can each look covered on the skills register and still be impossible to run together, because the one person both count on cannot be at both. Checking the total headcount would miss that; checking every subset does not. The register prints the smallest failing subset and its exact deficit, so the leader acts on the true cause rather than on a percentage.'))),
    }),
    ...live.map((row) => windowCard(ctx, row, tasks, r)),
    past.length
      ? card({ title: 'Past windows', subtitle: 'History: a shift that has happened is evidence, not a duty. Nobody is asked to staff it.',
        body: table({ caption: 'Past windows', columns: [
          { key: 'label', label: 'Window' },
          { key: 'fromDay', label: 'From' },
          { key: 'toDay', label: 'To' },
          { key: 'verdictLabel', label: 'Verdict at the time of reading' },
          { key: 'deficientSetsN', label: 'Proven shortage', render: (row) => (row.witness ? `deficit ${row.witness.deficitN}` : '—') },
        ], rows: past }) })
      : null,
    card({ title: 'Hierarchy / matrix roll-up', subtitle: 'Distinct stations and demand inside each span; spans overlap and must not be added.',
      body: table({ caption: 'Station coverage by leadership span', columns: [
        { key: 'name', label: 'Span' },
        { key: 'windowsN', label: 'Windows' },
        { key: 'stationsN', label: 'Stations' },
        { key: 'distinctStationsN', label: 'Distinct stations' },
        { key: 'demandN', label: 'Declared headcount' },
        { key: 'peopleN', label: 'Distinct people', render: (row) => n(row.peopleN) },
        { key: 'infeasibleN', label: 'Proven short' },
        { key: 'unprovenN', label: 'Unproven' },
      ], rows: r.spans, emptyMessage: 'Declare a window and a station to start the register. Nothing is inferred from an empty register.' }) }),
  );
}

export default renderStationCoveragePanel;
