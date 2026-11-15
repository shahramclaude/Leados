/**
 * app/views/workRestPanel.js — `#/standard-work?panel=rest`, the Cross-Line
 * Work/Rest Recovery Ledger (ADR-0209, Schema v163).
 *
 * "Between the end of one manager's shift and the start of another's, how long
 * was this person actually off — and is that less than the number we declared?"
 *
 * The view computes nothing. Every minute, verdict, conflict sentence, owner and
 * refusal is a field of the report returned by `workRestReport`; a figure that
 * cannot be claimed prints a dash and its reason, never a zero. Nothing here
 * moves a shift, and nothing here says anything about how a person feels.
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  WORK_REST_BOUNDS,
  WORK_REST_CSV_COLUMNS,
  WORK_REST_LIMITS,
  WORK_REST_RULE_ID,
  WORK_REST_SETTING_KEYS,
  WORK_REST_SETTING_LABELS,
  WORK_REST_SOURCES,
  WORK_REST_THRESHOLDS,
  WORK_REST_UNPROVEN_REASONS,
  WORK_REST_VERDICTS,
} from '../core/domain/workRestRegistry.js';
import { formatMinutes } from '../core/domain/workRestTime.js';

const DIAGRAM_URL = './app/assets/work-rest-recovery.jpg';
const L = WORK_REST_LIMITS;
const minutes = (value) => (value === null || value === undefined ? '—' : formatMinutes(value));
const FOLD_OPTIONS = [
  { value: '', label: 'Not needed — this clock time happens once' },
  { value: 'first', label: 'The first time (before the clocks went back)' },
  { value: 'second', label: 'The second time (after the clocks went back)' },
];
const FOLD_HELP = 'Only on the night the clocks go back does a clock time happen twice. If it does, the ledger refuses to guess and asks here.';

/** Submit a dialog: a refusal stays on the form, against the field that caused it. */
function submit(ctx, form, result, message) {
  if (!result?.ok) {
    const at = { personId: 'personLine', lineManagerId: 'personLine', settings: null }[result?.field] ?? result?.field;
    if (at && form.field(at)) form.setErrors({ [at]: result.error });
    toast(result?.error || 'The work/rest action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  closeAllModals();
  ctx.refresh();
  return true;
}

const cancelButton = () => h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel');

/** One option per (person, line) the seat actually holds — the form cannot offer a line the action would refuse. */
function personLineOptions(found) {
  const options = [];
  for (const person of found.people) {
    for (const line of person.lines) {
      options.push({
        value: `${person.personId}|${line.managerId}`,
        label: person.linesN > 1 ? `${person.name} — on the line of ${line.managerName} (1 of ${person.linesN} lines)` : `${person.name} — line of ${line.managerName}`,
      });
    }
  }
  return options;
}
const splitPersonLine = (value) => {
  const [personId, lineManagerId] = String(value || '').split('|');
  return { personId, lineManagerId };
};

/* ------------------------------------------------------------------ dialogs */

function shiftDialog(ctx, preset = null) {
  const found = ctx.api.workRestCandidates();
  if (!found?.ok) { toast(found?.error || 'Recording a shift was refused.', 'bad'); return; }
  const options = personLineOptions(found);
  if (!options.length) { toast('This seat holds no reporting line over anyone, so there is no roster it can write.', 'warn'); return; }
  const wanted = preset ? `${preset.personId}|${preset.lineManagerId}` : null;
  const form = buildForm([
    { name: 'personLine', label: 'Who, and for which line', type: 'select', options, value: options.some((o) => o.value === wanted) ? wanted : options[0].value,
      help: 'A shift is worked for ONE reporting line. You can record only for a line you hold; the other line’s holder records theirs.' },
    { name: 'zone', label: 'Time zone of the clock on the wall', type: 'text', value: found.deviceZone, placeholder: 'e.g. Europe/Copenhagen',
      help: 'An IANA zone name. Prefilled from this device; change it if the site is elsewhere. It is stored with the shift.' },
    { name: 'start', label: 'Start (wall clock)', type: 'datetime-local', value: '' },
    { name: 'startFold', label: 'If the start time happens twice that night', type: 'select', options: FOLD_OPTIONS, value: '', help: FOLD_HELP },
    { name: 'end', label: 'End (wall clock)', type: 'datetime-local', value: '' },
    { name: 'endFold', label: 'If the end time happens twice that night', type: 'select', options: FOLD_OPTIONS, value: '', help: FOLD_HELP },
    { name: 'source', label: 'Where these times come from', type: 'select', options: WORK_REST_SOURCES.map((s) => ({ value: s.key, label: s.label })), value: 'roster' },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2, value: '',
      help: `Optional — unless this shift creates a conflict that can still be prevented. Then the reason is required (at least ${L.reasonMin} characters) and the seat above the lines is asked.` },
  ]);
  const verdict = h('div', { class: 'stack-sm', role: 'status', 'aria-live': 'polite', 'data-testid': 'wrr-preview' });
  const values = () => {
    const v = form.getValues();
    return { ...splitPersonLine(v.personLine), zone: v.zone, start: v.start, end: v.end, startFold: v.startFold || null, endFold: v.endFold || null, source: v.source, note: v.note };
  };
  const check = () => {
    form.clearErrors();
    verdict.replaceChildren();
    const result = ctx.api.workRestPreviewShift(values());
    if (!result?.ok) {
      const at = { personId: 'personLine', lineManagerId: 'personLine' }[result?.field] ?? result?.field;
      if (at && form.field(at)) form.setErrors({ [at]: result.error });
      verdict.appendChild(banner({ tone: 'warn', title: 'Not readable yet', body: result?.error || 'The check was refused.' }));
      return;
    }
    verdict.appendChild(h('p', { class: 'small' }, `Read as ${result.resolved.label}.`));
    if (result.policyState !== 'declared') {
      verdict.appendChild(banner({ tone: 'info', title: result.policyState === 'none' ? 'No policy governs this person' : 'Two live policies claim this person',
        body: 'Only a double-booking can be proved. No limit was assumed.' }));
    }
    if (!result.created.length) {
      verdict.appendChild(banner({ tone: 'good', title: 'Creates no provable conflict on the record as it stands',
        body: 'That is not a clearance: work another line has not recorded cannot be seen from here.' }));
    }
    for (const finding of result.created) {
      verdict.appendChild(banner({ tone: 'bad', title: `${finding.kindLabel}${finding.crossLine ? ' — made by two lines' : ''}`, body: `${finding.sentence} ${finding.fix}` }));
    }
    if (result.needsReason) verdict.appendChild(h('p', { class: 'small' }, 'It can still be recorded — with the reason in the note.'));
  };
  openModal({
    title: 'Record a shift',
    description: 'Times are wall-clock times in a named zone. The ledger resolves them once, refuses a time the clocks skipped, and measures elapsed time — never the difference of two clock readings.',
    body: h('div', { class: 'stack' }, form.node, verdict),
    footer: [
      cancelButton(),
      h('button', { class: 'btn', type: 'button', 'data-testid': 'wrr-shift-check', onClick: check }, 'Check against the record'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wrr-shift-save', onClick: () => {
        form.clearErrors();
        submit(ctx, form, ctx.api.workRestDeclareShift(values()), 'Shift recorded. Every rest was re-measured.');
      } }, 'Record shift'),
    ],
  });
}

function amendDialog(ctx, person, shift) {
  const form = buildForm([
    { name: 'kind', label: 'What is being recorded', type: 'select', value: shift.ended ? 'actual' : 'cancel', options: [
      { value: 'actual', label: 'The times actually worked' },
      { value: 'cancel', label: 'The shift is cancelled' },
    ], help: 'The rostered row is never edited. An amendment is a dated act on top of it; a cancelled shift stays on the record.' },
    { name: 'start', label: `Actual start (wall clock, ${shift.zone})`, type: 'datetime-local', value: shift.startWall },
    { name: 'startFold', label: 'If the start time happens twice that night', type: 'select', options: FOLD_OPTIONS, value: '', help: FOLD_HELP },
    { name: 'end', label: `Actual end (wall clock, ${shift.zone})`, type: 'datetime-local', value: shift.endWall },
    { name: 'endFold', label: 'If the end time happens twice that night', type: 'select', options: FOLD_OPTIONS, value: '', help: FOLD_HELP },
    { name: 'reason', label: 'Reason', type: 'textarea', rows: 2, value: '', help: `Required for a cancellation (at least ${L.reasonMin} characters); optional for actual times.` },
  ]);
  openModal({
    title: `Amend ${person.name}’s shift — ${shift.startLabel}`,
    description: `Recorded for the line of ${shift.lineName}. Actual times state what happened; to change a plan, cancel this shift and record the new one.`,
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wrr-amend-save', onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        submit(ctx, form, ctx.api.workRestAmendShift({
          shiftId: shift.shiftId, kind: v.kind, start: v.start, end: v.end, startFold: v.startFold || null, endFold: v.endFold || null, reason: v.reason,
        }), v.kind === 'cancel' ? 'Shift cancelled. It is no longer read as work.' : 'Actual times recorded. Every rest was re-measured.');
      } }, 'Record amendment'),
    ],
  });
}

function attestDialog(ctx, report, preset = null) {
  const found = ctx.api.workRestCandidates();
  if (!found?.ok) { toast(found?.error || 'Attesting a record was refused.', 'bad'); return; }
  const options = personLineOptions(found);
  if (!options.length) { toast('This seat holds no reporting line over anyone, so there is no record it can attest.', 'warn'); return; }
  const wanted = preset ? `${preset.personId}|${preset.lineManagerId}` : null;
  const form = buildForm([
    { name: 'personLine', label: 'Whose record, for which line', type: 'select', options, value: options.some((o) => o.value === wanted) ? wanted : options[0].value,
      help: 'You attest only the line you hold. A person with two lines is clear only when BOTH holders have attested.' },
    { name: 'fromDay', label: 'First day covered', type: 'date', value: report.horizon.fromDay },
    { name: 'toDay', label: 'Last day covered (inclusive)', type: 'date', value: report.horizon.toDay, help: `At most ${L.coverageMaxDays} days in one statement. Days are UTC days, like the horizon.` },
    { name: 'complete', label: 'The statement', type: 'checkbox', value: false,
      checkboxLabel: 'Every shift this person works for this line on those days is on this record. I checked.' },
  ]);
  openModal({
    title: 'Attest a line’s work record',
    description: 'Silence is not rest. A day nobody attested proves nothing about that day, so no clearance is given across it.',
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wrr-attest-save', onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        submit(ctx, form, ctx.api.workRestAttestCoverage({ ...splitPersonLine(v.personLine), fromDay: v.fromDay, toDay: v.toDay, complete: v.complete === true }), 'Record attested. Clearances were re-read.');
      } }, 'Attest'),
    ],
  });
}

function reasonDialog(ctx, { title, description, label, testid, action, done }) {
  const form = buildForm([{ name: 'reason', label, type: 'textarea', rows: 2, value: '', help: `At least ${L.reasonMin} characters. It stays on the record.` }]);
  openModal({
    title, description, body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': testid, onClick: () => { form.clearErrors(); submit(ctx, form, action(form.getValues().reason), done); } }, 'Record'),
    ],
  });
}

function policyDialog(ctx, report) {
  const found = ctx.api.workRestCandidates();
  if (!found?.ok) { toast(found?.error || 'Declaring a policy was refused.', 'bad'); return; }
  const scopes = [
    ...(report.canPolicyWorkspace ? [{ value: 'workspace', label: 'The whole workspace' }] : []),
    { value: 'people', label: 'Named people in my span' },
  ];
  const duration = 'Hours (11), hours and minutes (11:30), minutes (45m) or days (7d). Leave blank to leave this limit undeclared — it is then printed as “not tested”.';
  const form = buildForm([
    { name: 'label', label: 'Policy name', type: 'text', value: '', placeholder: 'e.g. Plant collective agreement 2026' },
    { name: 'scope', label: 'Applies to', type: 'select', options: scopes, value: scopes[0].value,
      help: 'A policy naming a person outranks the workspace policy for that person. One person, one governing policy.' },
    { name: 'personIds', label: 'People (only for a named-people policy)', type: 'boolean-block', options: found.policyPeople.map((p) => ({ value: p.personId, label: p.name })), value: [] },
    { name: 'source', label: 'Where these limits come from', type: 'textarea', rows: 2, value: '',
      help: 'The statute, agreement or site rule, with enough to find it again. No limit is built in: which ones bind a person depends on country, contract and derogation.' },
    { type: 'divider', label: 'Limits — declare the ones that apply' },
    { name: 'minRestMin', label: WORK_REST_THRESHOLDS[0].label, type: 'text', value: '', help: duration },
    { name: 'maxSpellMin', label: WORK_REST_THRESHOLDS[1].label, type: 'text', value: '', help: duration },
    { name: 'longRestMin', label: 'Long rest — its minimum length', type: 'text', value: '', help: 'Declared together with the next field, or not at all.' },
    { name: 'longRestWithinMin', label: 'Long rest — must begin within this long of the previous one ending', type: 'text', value: '', help: 'e.g. 6d: timed from the previous rest, not from the calendar week.' },
    { name: 'workCapMin', label: 'Rolling cap — the most work allowed', type: 'text', value: '', help: 'Declared together with the next field, or not at all.' },
    { name: 'workCapWindowMin', label: 'Rolling cap — inside any window of this length', type: 'text', value: '', help: 'e.g. 60 inside 7d. Read on every window, not on calendar weeks.' },
  ]);
  openModal({
    title: 'Declare a work/rest policy',
    description: 'The ledger compares clock time with these numbers and with nothing else.',
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wrr-policy-save', onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        submit(ctx, form, ctx.api.workRestDeclarePolicy({
          label: v.label, scope: v.scope, personIds: v.scope === 'people' ? v.personIds : [], source: v.source,
          minRestMin: v.minRestMin, maxSpellMin: v.maxSpellMin, longRestMin: v.longRestMin, longRestWithinMin: v.longRestWithinMin,
          workCapMin: v.workCapMin, workCapWindowMin: v.workCapWindowMin,
        }), 'Policy declared. Every person it governs was re-read.');
      } }, 'Declare policy'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const K = WORK_REST_SETTING_KEYS;
  const [backMin, backMax] = WORK_REST_BOUNDS.backDays;
  const [aheadMin, aheadMax] = WORK_REST_BOUNDS.aheadDays;
  const form = buildForm([
    { name: K.backDays, label: `${WORK_REST_SETTING_LABELS.backDays} (${backMin}–${backMax})`, type: 'number', value: String(report.conventions[K.backDays]) },
    { name: K.aheadDays, label: `${WORK_REST_SETTING_LABELS.aheadDays} (${aheadMin}–${aheadMax})`, type: 'number', value: String(report.conventions[K.aheadDays]) },
    { name: K.autoPropagate, label: WORK_REST_SETTING_LABELS.autoPropagate, type: 'checkbox', value: report.conventions[K.autoPropagate] !== false,
      checkboxLabel: `Ask the owning seat about a conflict that is still ahead (${WORK_REST_RULE_ID})` },
  ]);
  openModal({
    title: 'Work/rest conventions',
    description: 'A value outside its bounds is refused, never clamped. A rolling cap whose window is longer than the horizon cannot be cleared.',
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wrr-conventions-save', onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        submit(ctx, form, ctx.api.workRestSetConventions({ [K.backDays]: Number(v[K.backDays]), [K.aheadDays]: Number(v[K.aheadDays]), [K.autoPropagate]: v[K.autoPropagate] === true }), 'Conventions set.');
      } }, 'Set conventions'),
    ],
  });
}

function exportCsv(ctx, today) {
  const result = ctx.api.workRestCsvRows();
  if (!result?.ok) { toast(result?.error || 'The work/rest export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-work-rest-recovery-${today}.csv`,
    text: serializeCsv(WORK_REST_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Identity-free CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.workRestBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({ title: 'Work/rest recovery — brief', body: h('pre', { class: 'brief', 'data-testid': 'wrr-brief' }, result.text), footer: [
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close'),
  ] });
}

/* -------------------------------------------------------------------- parts */

function ownerText(finding) {
  if (!finding.ahead) return 'Already past — on the record, nothing left to prevent.';
  const owner = finding.owner;
  if (!owner) return '';
  if (owner.state === 'seat') return `Owed to ${finding.ownerName} — ${owner.basis === 'joint-apex' ? 'the lowest seat above both lines' : 'the holder of the line'}.`;
  if (owner.state === 'leader-held') return 'Held by the workspace leader; no delegation is filed.';
  if (owner.state === 'off-roster') return 'No owner: the person or the lines involved have left the roster. Nobody is substituted.';
  return 'No single seat sits above the lines involved. No owner is invented.';
}

function personCard(ctx, report, person) {
  const lineItems = person.lines.map((line) => h('li', { 'data-testid': `wrr-line-${person.personId}-${line.managerId}` },
    h('strong', null, line.managerName),
    badge(line.complete ? 'record attested' : `${line.missingDays} day(s) unattested`, line.complete ? 'good' : 'warn',
      line.complete ? 'This line’s holder attested the whole horizon.' : 'Days of the horizon nobody holding this line has attested. No clearance is given across them.'),
    ...line.attestations.map((entry) => h('span', { class: 'small muted' }, `${entry.fromDay} → ${entry.toDay}, attested ${entry.attestedOn} by ${entry.attestedByName} `,
      entry.canWithdraw ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wrr-withdraw-${entry.coverageId}`,
        onClick: () => reasonDialog(ctx, {
          title: 'Withdraw this attestation?', description: 'The row stays on the record and stops counting. Clearances that leaned on it are withheld again.',
          label: 'Why it is withdrawn', testid: 'wrr-withdraw-save', done: 'Attestation withdrawn.',
          action: (reason) => ctx.api.workRestWithdrawCoverage({ coverageId: entry.coverageId, reason }),
        }) }, 'Withdraw') : null)),
    line.canAttest ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wrr-attest-${person.personId}-${line.managerId}`,
      onClick: () => attestDialog(ctx, report, { personId: person.personId, lineManagerId: line.managerId }) }, 'Attest') : null,
    line.canRoster ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wrr-add-${person.personId}-${line.managerId}`,
      onClick: () => shiftDialog(ctx, { personId: person.personId, lineManagerId: line.managerId }) }, 'Record shift') : null));

  const body = h('div', { class: 'stack' },
    h('p', { 'data-testid': `wrr-verdict-${person.personId}` }, person.verdictSays),
    ...person.unproven.map((reason) => banner({ tone: 'warn', title: 'Why this is not a clearance', body: reason.says })),
    ...person.findings.map((finding) => h('div', { 'data-testid': `wrr-finding-${finding.signature}` }, banner({
      tone: finding.ahead ? 'bad' : 'warn',
      title: `${finding.kindLabel}${finding.crossLine ? ' — made by two lines' : ''}${finding.ahead ? ' · still ahead' : ' · already happened'}`,
      body: `${finding.sentence} ${finding.ahead ? `${finding.fix} ` : ''}${ownerText(finding)}`,
    }))),
    person.findingsOmittedN ? h('p', { class: 'small' }, `${person.findingsOmittedN} further conflict(s) are not listed.`) : null,
    h('div', { class: 'kv-row' },
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Work in the horizon'), h('span', { class: 'kv-value', 'data-testid': `wrr-work-${person.personId}` }, minutes(person.workMinutes))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Longest spell'), h('span', { class: 'kv-value', 'data-testid': `wrr-spell-${person.personId}` }, minutes(person.longestSpellMinutes))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Shortest rest'), h('span', { class: 'kv-value', 'data-testid': `wrr-rest-${person.personId}` },
        person.shortestRestMinutes === null ? '— (one spell: no rest to measure)' : minutes(person.shortestRestMinutes))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Governing policy'), h('span', { class: 'kv-value' },
        person.policyState === 'declared' ? person.policyLabel : person.policyState === 'conflict' ? 'two live policies — none applied' : 'none — no limit assumed'))),
    person.unconfirmedPastN ? h('p', { class: 'small' }, `${person.unconfirmedPastN} ended shift(s) are read as rostered: no actual times were recorded. This is a reading of the plan.`) : null,
    h('h3', { class: 'small' }, `Reporting lines (${person.linesN})`),
    h('ul', { class: 'plain-list' }, ...lineItems),
    table({
      caption: `Shifts of ${person.name} in the horizon`,
      emptyMessage: 'No shift inside the horizon.',
      rows: person.shifts.map((shift) => ({ ...shift, attrs: { 'data-testid': `wrr-shift-${shift.shiftId}` } })),
      columns: [
        { key: 'startLabel', label: 'Start' },
        { key: 'endLabel', label: 'End' },
        { key: 'minutes', label: 'Elapsed', render: (shift) => formatMinutes(shift.minutes) },
        { key: 'lineName', label: 'For the line of' },
        { key: 'stateLabel', label: 'Read', render: (shift) => h('span', null,
          badge(shift.stateLabel, shift.state === 'cancelled' ? 'neutral' : shift.state === 'worked' ? 'good' : 'info'),
          shift.inConflict ? badge('in a conflict', 'bad') : null,
          shift.zoneDrift ? badge('zone rules changed', 'warn', 'This device’s time-zone rules no longer give the recorded offset for this wall time. The shift is read at the offset that was recorded.') : null,
          shift.rosteredLabel ? h('span', { class: 'small muted' }, ` rostered ${shift.rosteredLabel}`) : null) },
        { key: 'note', label: 'Note', render: (shift) => (shift.noteWithheld ? 'Withheld — another line’s note' : (shift.cancelReason || shift.note || '—')) },
        { key: 'act', label: 'Act', render: (shift) => (shift.canAmend
          ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wrr-amend-${shift.shiftId}`, onClick: () => amendDialog(ctx, person, shift) }, 'Amend')
          : h('span', { class: 'small muted' }, shift.state === 'cancelled' ? '—' : 'another line’s shift')) },
      ],
    }),
    person.rests.length ? h('p', { class: 'small', 'data-testid': `wrr-rests-${person.personId}` },
      `Rests between spells: ${person.rests.map((rest) => `${formatMinutes(rest.minutes)}${rest.state === 'short' ? ' (short)' : rest.state === 'unproven' ? ' (not attested)' : ''}`).join(' · ')}.`) : null,
  );
  return card({
    title: person.name,
    subtitle: `${person.linesN} reporting line(s) · ${person.shiftsN} shift(s) in the horizon${person.cancelledN ? ` · ${person.cancelledN} cancelled` : ''}`,
    actions: [badge(person.verdictLabel, person.verdictTone, person.verdictSays)],
    attrs: { 'data-testid': `wrr-person-${person.personId}` },
    body,
  });
}

function policiesCard(ctx, report) {
  return card({
    title: 'Declared policies',
    subtitle: 'The only numbers the ledger tests against. Each carries its written source; none is built in.',
    actions: report.canPolicy ? [h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'wrr-policy-open', onClick: () => policyDialog(ctx, report) }, 'Declare policy')] : [],
    body: table({
      caption: 'Work/rest policies',
      emptyMessage: 'No policy is declared. Only double-bookings can be proved; no rest or hours limit is assumed for anyone.',
      rows: report.policies.map((policy) => ({ ...policy, attrs: { 'data-testid': `wrr-policy-${policy.policyId}` } })),
      columns: [
        { key: 'label', label: 'Policy', render: (policy) => h('span', null, policy.label, ' ', badge(policy.live ? 'live' : 'retired', policy.live ? 'good' : 'neutral')) },
        { key: 'scopeLabel', label: 'Applies to', render: (policy) => (policy.scope === 'workspace' ? policy.scopeLabel
          : `${policy.peopleNames.join(', ') || '—'}${policy.peopleWithheldN ? ` + ${policy.peopleWithheldN} outside your reach` : ''}`) },
        { key: 'thresholds', label: 'Limits', render: (policy) => h('ul', { class: 'plain-list' }, ...policy.thresholds.map((line) => h('li', { class: line.declared ? '' : 'muted' }, `${line.label}: ${line.text}`))) },
        { key: 'source', label: 'Source' },
        { key: 'declaredOn', label: 'Declared', render: (policy) => `${policy.declaredOn} by ${policy.declaredByName}${policy.live ? '' : ` · retired ${policy.retiredOn}: ${policy.retireReason}`}` },
        { key: 'act', label: 'Act', render: (policy) => (policy.canRetire
          ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wrr-retire-${policy.policyId}`, onClick: () => reasonDialog(ctx, {
            title: `Retire “${policy.label}”?`, description: 'The people it governed fall back to the workspace policy, or are tested against nothing.',
            label: 'Why it is retired', testid: 'wrr-retire-save', done: 'Policy retired.',
            action: (reason) => ctx.api.workRestRetirePolicy({ policyId: policy.policyId, reason }),
          }) }, 'Retire') : '—') },
      ],
    }),
  });
}

function methodCard(ctx, report) {
  const m = report.method;
  return card({
    title: 'Method, conventions and what is refused',
    subtitle: `Engine ${report.engineVersion}. Horizon ${report.horizon.fromDay} → ${report.horizon.toDay} (${report.horizon.days} UTC days: ${report.horizon.backDays} behind today, ${report.horizon.aheadDays} ahead).`,
    actions: report.canGovern ? [
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': 'wrr-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Conventions'),
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': 'wrr-scan', onClick: () => {
        const result = ctx.api.workRestScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast(report.automationOn ? `Scan run: ${result.effects.length} effect(s).` : 'The automation is paused; the scan filed nothing.', 'good');
        ctx.refresh();
      } }, 'Re-run the rule'),
    ] : [],
    body: h('div', { class: 'stack' },
      h('p', { class: 'small', 'data-testid': 'wrr-automation' }, report.automationOn
        ? `${WORK_REST_RULE_ID} is on: a provable conflict that is still ahead is asked of the holder of the line — or, when two lines made it, of the lowest seat above both.`
        : `${WORK_REST_RULE_ID} is paused: conflicts are printed here and nobody is asked.`),
      h('figure', null,
        h('img', { src: DIAGRAM_URL, loading: 'lazy', alt: 'Conceptual illustration: three day-long timelines. On the first, one manager has rostered a teal shift that ends before midday; on the second, a different manager has rostered an amber shift that starts just after midday; each looks fine on its own. The third timeline belongs to the one worker and carries both shifts, and the narrow gap between them is boxed in red dashes under a warning triangle — the rest that neither manager could see.' }),
        h('figcaption', { class: 'muted small' }, 'AI-generated method illustration, not workspace data. The ledger merges one person’s shifts across every reporting line before it measures a rest.')),
      h('ul', { class: 'plain-list' }, ...Object.values(m).map((line) => h('li', { class: 'small' }, line))),
      h('h3', { class: 'small' }, 'Readings'),
      h('ul', { class: 'plain-list' }, ...WORK_REST_VERDICTS.map((v) => h('li', { class: 'small' }, h('strong', null, `${v.label}:`), ` ${v.says}`)),
        ...WORK_REST_UNPROVEN_REASONS.map((r) => h('li', { class: 'small muted' }, `Unproven — ${r.says}`))),
      h('h3', { class: 'small' }, 'Limit shapes'),
      h('ul', { class: 'plain-list' }, ...WORK_REST_THRESHOLDS.map((t) => h('li', { class: 'small' }, h('strong', null, `${t.label}:`), ` ${t.says} ${t.shape}`))),
      h('h3', { class: 'small' }, 'Frameworks'),
      h('ul', { class: 'plain-list' }, ...report.frameworks.map((f) => h('li', { class: 'small' }, h('strong', null, `${f.label}:`), ` ${f.says}`))),
    ),
  });
}

/* ------------------------------------------------------------------- render */

export function renderWorkRestPanel(ctx) {
  const result = ctx.api.workRestReport();
  if (!result?.ok) return banner({ tone: 'warn', title: 'The work/rest ledger was refused', body: result?.error || 'No readable seat.' });
  const r = result.report;
  const t = r.totals;
  return h('div', { class: 'stack', 'data-testid': 'work-rest' },
    card({
      title: 'Work & rest — how long was each person actually off, across every line?',
      subtitle: `As of ${r.today}, ${r.scope === 'workspace' ? 'whole workspace' : `seat of ${r.actorName}`}. ${t.peopleN} person(s) in reach${t.outsideN ? `; ${t.outsideN} outside it are not read` : ''}.`,
      actions: [
        ...(r.canRoster ? [
          h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'wrr-shift-open', onClick: () => shiftDialog(ctx) }, 'Record shift'),
          h('button', { type: 'button', class: 'btn', 'data-testid': 'wrr-attest-open', onClick: () => attestDialog(ctx, r) }, 'Attest a record'),
        ] : []),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'wrr-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'wrr-csv', onClick: () => exportCsv(ctx, r.today) }, 'Export CSV'),
      ],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Provable conflict', value: String(t.conflictN), hint: `${t.findingsN} conflict(s) · ${t.aheadN} still ahead · ${t.crossLineN} made by two lines`, tone: t.conflictN ? 'bad' : '' }),
          stat({ label: 'Unproven', value: String(t.unprovenN), hint: 'No breach found, but the record is not attested or the limit cannot be read', tone: t.unprovenN ? 'warn' : '' }),
          stat({ label: 'Clear on the record', value: String(t.clearN), hint: 'Every line attested the whole horizon and no declared limit is breached', tone: t.clearN ? 'good' : '' }),
          stat({ label: 'No policy', value: String(t.noPolicyN + t.policyConflictN), hint: `${t.noPolicyN} with none · ${t.policyConflictN} claimed by two` }),
          stat({ label: 'No shift on record', value: String(t.noRecordN), hint: 'Nothing to read — which is not a statement that they rested' }),
          stat({ label: 'Shifts read', value: String(t.shiftsN), hint: `${t.cancelledN} cancelled · ${t.unconfirmedPastN} ended but read as rostered` }),
        ),
        h('p', { class: 'small', 'data-testid': 'wrr-summary' },
          `${t.peopleN} in reach = ${t.conflictN} conflict + ${t.policyConflictN} two policies + ${t.noPolicyN} no policy + ${t.unprovenN} unproven + ${t.clearN} clear + ${t.noRecordN} no record. ${t.multiLineN} report on more than one line. ${r.reconciliation.says}`),
        ...r.refusals.map((refusal) => h('div', { 'data-testid': 'wrr-refusal' }, banner({ tone: 'warn', title: 'Not claimed', body: refusal }))),
        h('p', { class: 'muted small' }, 'This compares elapsed clock time with numbers a human declared. It does not measure fatigue or fitness for work, rates nobody, and never moves a shift.'),
      ),
    }),
    ...(r.people.length ? r.people.map((person) => personCard(ctx, r, person))
      : [card({ title: 'No shift is on the record in this horizon', body: h('p', { 'data-testid': 'wrr-empty' },
        r.canRoster ? 'Record the first shift for a line you hold. Nothing is inferred from station windows, duty rosters or calendars: none of them says when a person started and stopped working.'
          : 'Nothing has been recorded for anyone in your reach. Nothing is inferred in its place.') })]),
    r.linePairs.length ? card({
      title: 'Where two lines meet',
      subtitle: 'Conflicts neither line can see on its own roster. Each pair is owed to the lowest seat above both.',
      body: table({ caption: 'Cross-line conflicts by pair of lines', rows: r.linePairs.map((pair) => ({ ...pair, attrs: { 'data-testid': `wrr-pair-${pair.aId}-${pair.bId}` } })), columns: [
        { key: 'aName', label: 'Line of' },
        { key: 'bName', label: 'and line of' },
        { key: 'peopleN', label: 'People' },
        { key: 'findingsN', label: 'Conflicts' },
        { key: 'aheadN', label: 'Still ahead' },
      ] }),
    }) : null,
    card({
      title: 'Hierarchy / matrix roll-up',
      subtitle: 'Each person is counted once in a span, however many lines lead to it. Spans overlap and must not be added.',
      body: table({ caption: 'Work/rest readings by leadership span', emptyMessage: 'No leadership span is in reach.', rows: r.spans.map((span) => ({ ...span, attrs: { 'data-testid': `wrr-span-${span.managerId}` } })), columns: [
        { key: 'name', label: 'Span' },
        { key: 'peopleN', label: 'People read', render: (span) => (span.notReadN ? `${span.peopleN} (+${span.notReadN} on a line you do not hold — not read)` : String(span.peopleN)) },
        { key: 'conflict', label: 'Conflict' },
        { key: 'unproven', label: 'Unproven' },
        { key: 'clear', label: 'Clear' },
        { key: 'no-policy', label: 'No policy', render: (span) => String(span['no-policy'] + span['policy-conflict']) },
        { key: 'no-record', label: 'No record' },
        { key: 'findingsN', label: 'Conflicts' },
        { key: 'aheadN', label: 'Still ahead' },
        { key: 'crossLineN', label: 'Two-line' },
      ] }),
    }),
    policiesCard(ctx, r),
    methodCard(ctx, r),
  );
}

export default renderWorkRestPanel;
