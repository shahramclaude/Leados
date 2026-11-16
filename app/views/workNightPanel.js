/**
 * app/views/workNightPanel.js — `#/standard-work?panel=night`, the Night-Work
 * & In-Shift Break Reading (ADR-0226, Schema v181).
 *
 * "Inside and across the spells the work/rest ledger measures: did the shift
 * contain a break; how many nights in a row; what share of the hours fall in
 * the window we call night — and is any of that over a limit a human
 * declared?"
 *
 * The view computes nothing. Every night minute, share, streak, continuous
 * stretch, index and verdict is a field of the report returned by
 * `buildWorkNight`; a figure that cannot be claimed prints a dash and its
 * reason, never a zero. Nothing here moves a shift, records a break for
 * somebody else, and nothing here says anything about how a person feels.
 */
import { h, buildForm, openModal, closeAllModals, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_RULE_ID,
  WORK_NIGHT_SETTING_LABELS,
  WORK_NIGHT_THRESHOLDS,
  WORK_NIGHT_VERDICTS,
  WORK_NIGHT_UNPROVEN_REASONS,
} from '../core/domain/workNightRegistry.js';
import { formatMinutes } from '../core/domain/workRestTime.js';

const DIAGRAM_URL = './app/assets/night-work-break-method.jpg';
const L = WORK_NIGHT_LIMITS;
const minutes = (value) => (value === null || value === undefined ? '—' : formatMinutes(value));
const pct = (value) => (value === null || value === undefined ? '—' : `${value}%`);

/** Submit a dialog: a refusal stays on the form, against the field that caused it. */
function submit(ctx, form, result, message) {
  if (!result?.ok) {
    const at = { personId: 'personLine', lineManagerId: 'personLine' }[result?.field] ?? result?.field;
    if (at && form.field(at)) form.setErrors({ [at]: result.error });
    toast(result?.error || 'The night-work action was refused.', 'bad');
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

function exportCsv(ctx, report) {
  const result = ctx.api.workNightCsvRows();
  if (!result?.ok) { toast(result?.error || 'The CSV export was refused.', 'bad'); return; }
  downloadText(`night-work-${report.today}.csv`, serializeCsv(result.rows, report.engineVersion));
  toast('CSV exported. Every figure is the one the panel prints.', 'good');
}

/* ------------------------------------------------------------------ dialogs */

function breakDialog(ctx, preset = null) {
  const found = ctx.api.workNightCandidates();
  if (!found?.ok) { toast(found?.error || 'Recording a break was refused.', 'bad'); return; }
  const options = personLineOptions(found);
  if (!options.length) { toast('This seat holds no reporting line over anyone, so there is no break it can record.', 'warn'); return; }
  const wanted = preset ? `${preset.personId}|${preset.lineManagerId}` : null;
  const form = buildForm([
    { name: 'personLine', label: 'Who, and for which line', type: 'select', options, value: options.some((o) => o.value === wanted) ? wanted : options[0].value,
      help: 'A break is a statement about ONE shift of ONE line. You can record only for a line you hold; the other line’s holder records theirs.' },
    { name: 'shiftId', label: 'Shift', type: 'text', value: preset?.shiftId || '', placeholder: 'Shift id from the panel', help: 'The id of the shift the break belongs to. It must be a shift of this person on this line.' },
    { name: 'zone', label: 'Time zone of the clock on the wall', type: 'text', value: found.deviceZone, placeholder: 'e.g. Europe/Copenhagen',
      help: 'An IANA zone name. Prefilled from this device; change it if the site is elsewhere. It is stored with the break.' },
    { name: 'start', label: 'Break start (wall clock)', type: 'datetime-local', value: '' },
    { name: 'end', label: 'Break end (wall clock)', type: 'datetime-local', value: '' },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2, value: '', help: 'Optional.' },
  ]);
  const verdict = h('div', { class: 'stack-sm', role: 'status', 'aria-live': 'polite', 'data-testid': 'wnr-preview' });
  const values = () => {
    const v = form.getValues();
    return { ...splitPersonLine(v.personLine), shiftId: v.shiftId, zone: v.zone, start: v.start, end: v.end, note: v.note };
  };
  const check = () => {
    form.clearErrors();
    verdict.replaceChildren();
    const result = ctx.api.workNightPreviewBreak(values());
    if (!result?.ok) {
      const at = { personId: 'personLine', lineManagerId: 'personLine' }[result?.field] ?? result?.field;
      if (at && form.field(at)) form.setErrors({ [at]: result.error });
      verdict.appendChild(banner({ tone: 'warn', title: 'Not readable yet', body: result?.error || 'The check was refused.' }));
      return;
    }
    verdict.appendChild(h('p', { class: 'small' }, `Read as ${formatMinutes(result.resolved.minutes)} on a shift of ${result.personName} (${formatMinutes(result.shiftMinutes)}).`));
    if (result.policyState !== 'declared') {
      verdict.appendChild(banner({ tone: 'info', title: result.policyState === 'none' ? 'No policy governs this person' : 'Two live policies claim this person',
        body: 'No break-after limit is tested. The break is still recorded — it is a fact about the shift.' }));
    }
    if (result.breaksAfterN < result.breaksBeforeN) {
      verdict.appendChild(banner({ tone: 'good', title: `Clears ${result.breaksBeforeN - result.breaksAfterN} missing-break refusal(s)`,
        body: 'The record it enters is the record the reading will print.' }));
    } else {
      verdict.appendChild(banner({ tone: 'info', title: 'No missing-break refusal is cleared by this break',
        body: 'The break is still a fact about the shift and is recorded as declared.' }));
    }
  };
  openModal({
    title: 'Record a break',
    description: 'A break must lie inside the shift it belongs to. The door refuses a break outside its shift and one shorter than the governing policy’s declared minimum — nothing is guessed.',
    body: h('div', { class: 'stack' }, form.node, verdict),
    footer: [
      cancelButton(),
      h('button', { class: 'btn', type: 'button', 'data-testid': 'wnr-break-check', onClick: check }, 'Check against the record'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wnr-break-save', onClick: () => {
        form.clearErrors();
        submit(ctx, form, ctx.api.workNightRecordBreak(values()), 'Break recorded. The continuous stretches were re-measured.');
      } }, 'Record break'),
    ],
  });
}

function policyDialog(ctx, report) {
  const found = ctx.api.workNightCandidates();
  if (!found?.ok) { toast(found?.error || 'Declaring a policy was refused.', 'bad'); return; }
  const scopes = [
    ...(report.canPolicyWorkspace ? [{ value: 'workspace', label: 'The whole workspace' }] : []),
    { value: 'people', label: 'Named people in my span' },
  ];
  const duration = 'Hours (11), hours and minutes (11:30), minutes (45m) or days (7d). Leave blank to leave this limit undeclared — it is then printed as “not tested”.';
  const form = buildForm([
    { name: 'label', label: 'Policy name', type: 'text', value: '', placeholder: 'e.g. Plant night-work rules 2026' },
    { name: 'scope', label: 'Applies to', type: 'select', options: scopes, value: scopes[0].value,
      help: 'A policy naming a person outranks the workspace policy for that person. One person, one governing night policy.' },
    { name: 'personIds', label: 'People (only for a named-people policy)', type: 'boolean-block', options: found.policyPeople.map((p) => ({ value: p.personId, label: p.name })), value: [] },
    { name: 'source', label: 'Where these limits come from', type: 'textarea', rows: 2, value: '',
      help: 'The statute, agreement or site rule, with enough to find it again. No night window and no limit is built in.' },
    { type: 'divider', label: 'The night window — the hours the workspace calls night' },
    { name: 'nightFromMin', label: 'Window starts at (minute of day)', type: 'text', value: '1320', help: '22:00 is 1320. The window wraps at midnight, so 22:00 → 06:00 is 1320 → 360.' },
    { name: 'nightToMin', label: 'Window ends at (minute of day)', type: 'text', value: '360', help: '06:00 is 360. The end is exclusive: 1320 → 360 covers 22:00–23:59 and 00:00–05:59.' },
    { type: 'divider', label: 'Limits — declare the ones that apply' },
    { name: 'nightMaxSharePct', label: WORK_NIGHT_THRESHOLDS[1].label, type: 'text', value: '', help: 'A whole percentage, for example 50.' },
    { name: 'nightMaxConsecutiveNights', label: WORK_NIGHT_THRESHOLDS[2].label, type: 'text', value: '', help: 'A whole number of nights, for example 5.' },
    { name: 'breakAfterMin', label: WORK_NIGHT_THRESHOLDS[3].label, type: 'text', value: '', help: duration },
    { name: 'breakMinMin', label: WORK_NIGHT_THRESHOLDS[4].label, type: 'text', value: '', help: duration },
  ]);
  openModal({
    title: 'Declare a night policy',
    description: 'The reading compares the clock with these numbers and with nothing else. Declare at least one limit; a policy that declares none is refused.',
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wnr-policy-save', onClick: () => {
        form.clearErrors();
        const v = form.getValues();
        submit(ctx, form, ctx.api.workNightDeclarePolicy({
          label: v.label, scope: v.scope, personIds: v.personIds || [], source: v.source,
          nightFromMin: v.nightFromMin, nightToMin: v.nightToMin,
          nightMaxSharePct: v.nightMaxSharePct, nightMaxConsecutiveNights: v.nightMaxConsecutiveNights,
          breakAfterMin: v.breakAfterMin, breakMinMin: v.breakMinMin,
        }), 'Night policy declared. Every night reading was re-tested.');
      } }, 'Declare policy'),
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

function conventionsDialog(ctx, report) {
  const form = buildForm([{ name: 'workNightAutoPropagate', label: WORK_NIGHT_SETTING_LABELS.autoPropagate, type: 'checkbox', value: report.automationOn,
    checkboxLabel: 'Ask the seat above a provable breach that is still ahead, and for a break record a declared limit requires.' }]);
  openModal({
    title: 'Night-work conventions',
    description: `The reading horizon is the one the work/rest ledger reads (${report.horizon.backDays} days behind today, ${report.horizon.aheadDays} ahead). This switch governs only ${WORK_NIGHT_RULE_ID}.`,
    body: form.node,
    footer: [
      cancelButton(),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'wnr-conventions-save', onClick: () => {
        form.clearErrors();
        submit(ctx, form, ctx.api.workNightSetConventions({ workNightAutoPropagate: form.getValues().workNightAutoPropagate === true }), 'Night conventions saved.');
      } }, 'Save'),
    ],
  });
}

function briefDialog(ctx) {
  const result = ctx.api.workNightBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({ title: 'Night-work brief', description: 'The identity-free summary of the reading.', body: h('pre', { class: 'brief-text', 'data-testid': 'wnr-brief' }, result.text) });
}

/* ------------------------------------------------------------------- cards */

function personCard(ctx, report, person) {
  const t = report.totals;
  return card({
    title: `${person.name} — ${person.verdictLabel}`,
    subtitle: `${person.policyLabel ? `Policy “${person.policyLabel}” (${person.policyBasis})` : 'No governing night policy'} · ${person.linesN} line(s) · ${person.shiftsN} shift(s) in horizon`,
    actions: person.canRoster ? [
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wnr-break-${person.personId}`, onClick: () => breakDialog(ctx, { personId: person.personId, lineManagerId: person.lines[0]?.managerId, shiftId: person.shifts[0]?.shiftId }) }, 'Record break'),
    ] : [],
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Night share (max shift)', value: pct(person.nightShareMaxPct), hint: `${person.nightShiftsN} shift(s) with night minutes`, tone: person.findings.some((f) => f.kind === 'night-share-breach') ? 'bad' : '' }),
        stat({ label: 'Consecutive nights', value: String(person.consecutiveNights), hint: `Longest run of nights with night work`, tone: person.findings.some((f) => f.kind === 'night-streak-breach') ? 'bad' : '' }),
        stat({ label: 'Longest continuous work', value: minutes(person.longestContinuousMinutes), hint: `Inside a spell, after recorded breaks` }),
        stat({ label: 'Break records missing', value: String(person.missingBreakRecordsN), hint: `Where a declared limit requires one`, tone: person.missingBreakRecordsN ? 'warn' : '' }),
        stat({ label: 'Schedule fatigue index', value: person.fatigueIndex ? String(person.fatigueIndex.index) : '—', hint: person.fatigueIndex ? 'A declared convention over the printed factors — not a rating' : 'No declared factor in the record' }),
      ),
      person.fatigueIndex ? h('p', { class: 'small muted', 'data-testid': `wnr-factors-${person.personId}` },
        `Factors: ${person.fatigueIndex.factors.map((factor) => `${factor.label} ${formatMinutes(factor.measure)}/${formatMinutes(factor.limit)} (${(Math.min(1, factor.ratio) * 100).toFixed(0)}%)`).join(' · ')}`) : null,
      ...person.findings.map((finding) => h('div', { 'data-testid': `wnr-finding-${person.personId}` }, banner({
        tone: 'bad', title: `${finding.kindLabel}${finding.crossLine ? ' — made by two lines' : ''}`, body: `${finding.sentence} ${finding.fix}`,
      }))),
      ...person.unproven.map((reason) => h('div', { 'data-testid': `wnr-unproven-${person.personId}` }, banner({ tone: 'warn', title: `Unproven — ${reason.key}`, body: reason.says }))),
      ...person.missingBreaks.map((missing) => h('div', { 'data-testid': `wnr-missing-${person.personId}` }, banner({
        tone: 'warn', title: 'Break record missing',
        body: `${minutes(missing.minutes)} of continuous work from ${missing.fromLabel} to ${missing.toLabel} with no break recorded; the declared limit requires one every ${minutes(missing.limit)}.`,
      }))),
      person.shifts.length ? table({
        caption: `Shifts in horizon (${person.shiftsN})`,
        rows: person.shifts.map((shift) => ({ ...shift, attrs: { 'data-testid': `wnr-shift-${shift.shiftId}` } })),
        columns: [
          { key: 'startLabel', label: 'Shift' },
          { key: 'lineName', label: 'Line' },
          { key: 'minutes', label: 'Length', render: (shift) => minutes(shift.minutes) },
          { key: 'nightMinutes', label: 'Night minutes', render: (shift) => (shift.nightUnreadable ? 'refused' : `${shift.nightMinutes}`) },
          { key: 'sharePct', label: 'Night share', render: (shift) => (shift.sharePct === null ? '—' : `${shift.sharePct}%`), attrs: (shift) => (shift.shareOver ? { class: 'cell-bad' } : {}) },
          { key: 'breaks', label: 'Breaks', render: (shift) => (shift.breaks.length ? shift.breaks.map((b) => `${b.startLabel}–${b.endLabel} (${b.minutes}m)`).join(', ') : '—') },
          { key: 'state', label: 'State', render: (shift) => (shift.ended ? 'ended' : shift.ahead ? 'ahead' : 'now') },
        ],
      }) : null,
    ),
  });
}

function policiesCard(ctx, report) {
  return card({
    title: 'Night policies',
    subtitle: 'A night window and the limits that apply, each with a written source. No window and no limit is assumed.',
    actions: report.canPolicy ? [
      h('button', { class: 'btn btn-primary btn-small', type: 'button', 'data-testid': 'wnr-policy-open', onClick: () => policyDialog(ctx, report) }, 'Declare policy'),
    ] : [],
    body: table({
      caption: 'Night policies',
      emptyMessage: 'No night policy is declared. No night window exists, so no share, streak or break limit is tested for anyone.',
      rows: report.policies.map((policy) => ({ ...policy, attrs: { 'data-testid': `wnr-policy-${policy.policyId}` } })),
      columns: [
        { key: 'label', label: 'Policy', render: (policy) => h('span', null, policy.label, ' ', badge(policy.live ? 'live' : 'retired', policy.live ? 'good' : 'neutral')) },
        { key: 'scopeLabel', label: 'Applies to' },
        { key: 'thresholds', label: 'Window and limits', render: (policy) => h('ul', { class: 'plain-list' }, ...policy.thresholds.map((line) => h('li', { class: line.declared ? '' : 'muted' }, `${line.label}: ${line.text}`))) },
        { key: 'source', label: 'Source' },
        { key: 'declaredOn', label: 'Declared', render: (policy) => `${policy.declaredOn} by ${policy.declaredByName}${policy.live ? '' : ` · retired ${policy.retiredOn}: ${policy.retireReason}`}` },
        { key: 'act', label: 'Act', render: (policy) => (policy.canRetire
          ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': `wnr-retire-${policy.policyId}`, onClick: () => reasonDialog(ctx, {
            title: `Retire “${policy.label}”?`, description: 'The people it governed fall back to the workspace policy, or are tested against nothing.',
            label: 'Why it is retired', testid: 'wnr-retire-save', done: 'Policy retired.',
            action: (reason) => ctx.api.workNightRetirePolicy({ policyId: policy.policyId, reason }),
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
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': 'wnr-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Conventions'),
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', 'data-testid': 'wnr-scan', onClick: () => {
        const result = ctx.api.workNightScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast(report.automationOn ? `Scan run: ${result.effects.length} effect(s).` : 'The automation is paused; the scan filed nothing.', 'good');
        ctx.refresh();
      } }, 'Re-run the rule'),
    ] : [],
    body: h('div', { class: 'stack' },
      h('p', { class: 'small', 'data-testid': 'wnr-automation' }, report.automationOn
        ? `${WORK_NIGHT_RULE_ID} is on: a provable night breach that is still ahead is asked of the holder of the line — or, when two lines made it, of the lowest seat above both; a missing break record is asked of the holder of the line the shift was worked for.`
        : `${WORK_NIGHT_RULE_ID} is paused: breaches and missing break records are printed here and nobody is asked.`),
      h('figure', null,
        h('img', { src: DIAGRAM_URL, loading: 'lazy', alt: 'Conceptual illustration: a horizontal clock line divided into a grey day band and a dark night band. Above it, a shift block sits mostly in the night band and is marked with a red share figure; below it, the same shift is cut by a green break block, and a sequence of small night blocks in a row is marked with a streak count. The caption states that the reading compares the clock with declared numbers and rates nobody.' }),
        h('figcaption', { class: 'muted small' }, 'AI-generated method illustration, not workspace data. The reading compares the clock with declared numbers and rates nobody.')),
      h('ul', { class: 'plain-list' }, ...Object.values(m).map((line) => h('li', { class: 'small' }, line))),
      h('h3', { class: 'small' }, 'Readings'),
      h('ul', { class: 'plain-list' }, ...WORK_NIGHT_VERDICTS.map((v) => h('li', { class: 'small' }, h('strong', null, `${v.label}:`), ` ${v.says}`)),
        ...WORK_NIGHT_UNPROVEN_REASONS.map((r) => h('li', { class: 'small muted' }, `Unproven — ${r.says}`))),
      h('h3', { class: 'small' }, 'Limit shapes'),
      h('ul', { class: 'plain-list' }, ...WORK_NIGHT_THRESHOLDS.map((t) => h('li', { class: 'small' }, h('strong', null, `${t.label}:`), ` ${t.says}`))),
      h('h3', { class: 'small' }, 'Frameworks'),
      h('ul', { class: 'plain-list' }, ...report.frameworks.map((f) => h('li', { class: 'small' }, h('strong', null, `${f.label}:`), ` ${f.says}`))),
    ),
  });
}

/* ------------------------------------------------------------------- render */

export function renderWorkNightPanel(ctx) {
  const result = ctx.api.workNightReport();
  if (!result?.ok) return banner({ tone: 'warn', title: 'The night-work reading was refused', body: result?.error || 'No readable seat.' });
  const r = result.report;
  const t = r.totals;
  return h('div', { class: 'stack', 'data-testid': 'night-work' },
    card({
      title: 'Night work & breaks — how much of the record falls in the night window, and was a break taken?',
      subtitle: `As of ${r.today}, ${r.scope === 'workspace' ? 'whole workspace' : `seat of ${r.actorName}`}. ${t.peopleN} person(s) in reach${t.outsideN ? `; ${t.outsideN} outside it are not read` : ''}.`,
      actions: [
        ...(r.canRoster ? [h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'wnr-break-open', onClick: () => breakDialog(ctx) }, 'Record break')] : []),
        ...(r.canPolicy ? [h('button', { type: 'button', class: 'btn', 'data-testid': 'wnr-policy-open-top', onClick: () => policyDialog(ctx, r) }, 'Declare policy')] : []),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'wnr-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'wnr-csv', onClick: () => exportCsv(ctx, r) }, 'Export CSV'),
      ],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Provable night breach', value: String(t.breachN), hint: `${t.findingsN} breach(es) · ${t.aheadN} still ahead · ${t.crossLineN} made by two lines`, tone: t.breachN ? 'bad' : '' }),
          stat({ label: 'Unproven', value: String(t.unprovenN), hint: 'No breach found, but the record cannot support a clearance', tone: t.unprovenN ? 'warn' : '' }),
          stat({ label: 'Clear on the record', value: String(t.clearN), hint: 'Every line attested, no limit breached, no break record missing', tone: t.clearN ? 'good' : '' }),
          stat({ label: 'No policy', value: String(t.noPolicyN + t.policyConflictN), hint: `${t.noPolicyN} with none · ${t.policyConflictN} claimed by two` }),
          stat({ label: 'Night shifts', value: String(t.nightShiftsN), hint: `${t.nightPeopleN} person(s) with night work in the horizon` }),
          stat({ label: 'Break records missing', value: String(t.missingBreakRecordsN), hint: `Where a declared limit requires one`, tone: t.missingBreakRecordsN ? 'warn' : '' }),
        ),
        h('p', { class: 'small', 'data-testid': 'wnr-summary' },
          `${t.peopleN} in reach = ${t.breachN} breach + ${t.policyConflictN} two policies + ${t.noPolicyN} no policy + ${t.unprovenN} unproven + ${t.clearN} clear + ${t.noRecordN} no record. ${r.reconciliation.says}`),
        ...r.refusals.map((refusal) => h('div', { 'data-testid': 'wnr-refusal' }, banner({ tone: 'warn', title: 'Not claimed', body: refusal }))),
        h('p', { class: 'muted small' }, 'This compares the clock with numbers a human declared. It does not measure fatigue or fitness for work, rates nobody, and never moves a shift or invents a break.'),
      ),
    }),
    ...(r.people.length ? r.people.map((person) => personCard(ctx, r, person))
      : [card({ title: 'No shift is on the record in this horizon', body: h('p', { 'data-testid': 'wnr-empty' },
        r.canRoster ? 'Record the first shift for a line you hold, and declare a night policy with its source. Nothing is inferred from station windows, duty rosters or calendars: none of them says which hours fall in the night window.'
          : 'Nothing has been recorded for anyone in your reach. Nothing is inferred in its place.') })]),
    r.spans.length ? card({
      title: 'Hierarchy / matrix roll-up',
      subtitle: 'Each person is counted once in a span, however many lines lead to it. Spans overlap and must not be added.',
      body: table({ caption: 'Night readings by leadership span', rows: r.spans.map((span) => ({ ...span, attrs: { 'data-testid': `wnr-span-${span.managerId}` } })), columns: [
        { key: 'name', label: 'Span' },
        { key: 'peopleN', label: 'People read', render: (span) => (span.notReadN ? `${span.peopleN} (+${span.notReadN} on a line you do not hold — not read)` : String(span.peopleN)) },
        { key: 'breach', label: 'Breach' },
        { key: 'unproven', label: 'Unproven' },
        { key: 'clear', label: 'Clear' },
        { key: 'no-policy', label: 'No policy', render: (span) => String(span['no-policy'] + span['policy-conflict']) },
        { key: 'no-record', label: 'No record' },
        { key: 'findingsN', label: 'Breaches' },
        { key: 'aheadN', label: 'Still ahead' },
        { key: 'crossLineN', label: 'Two-line' },
      ] }),
    }) : null,
    policiesCard(ctx, r),
    methodCard(ctx, r),
  );
}

export default renderWorkNightPanel;
