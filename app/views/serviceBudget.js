/** Read the guarded ADR-0255 workpaper. No arithmetic or raw store access here. */
import { h, buildForm, openModal, toast } from '../ui/dom.js';
import { banner, card, emptyState, pageHeader, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  SERVICE_BUDGET_HEADERS, SERVICE_BUDGET_HREF as HREF, SERVICE_BUDGET_LABELS, SERVICE_BUDGET_LIMITS as L,
  parseServiceBudgetExtract, serviceTargetPpm,
} from '../core/domain/serviceBudget.js';

const TONES = { within: 'good', 'no-headroom': 'caution', exceeded: 'bad', withheld: 'caution' };
const MEASURES = {
  coverage_days: 'Recorded days', expected_days: 'Expected days', missing_days: 'Missing days', printed_rows_balance: 'Printed rows add up',
  recorded_good_events: 'Recorded good events', recorded_total_events: 'Recorded eligible events', recorded_error_events: 'Recorded error events',
  control_good_events: 'Control good events', control_total_events: 'Control eligible events', control_matches: 'Daily sums match both control counts',
  target_percent: 'Declared success objective', observed_success_fraction: 'Observed success (good / eligible)', whole_errors_allowed: 'Whole errors allowed',
  whole_error_headroom: 'Additional errors allowed in this fixed population', errors_over_allowance: 'Errors over allowance',
  burn_multiple_fraction: 'Burn multiple (exact ratio)', verdict: 'Objective result code',
};
const button = (label, onClick, primary = false) => h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick }, label);
const paperHref = (id) => `${HREF}?paper=${encodeURIComponent(id)}`;

function exportReceipt(ctx, id) {
  const read = ctx.api.serviceBudgetRead(id);
  if (!read.ok) { toast(read.error, 'bad'); return; }
  const text = serializeCsv(['measure', 'value', 'reason'], read.report.receipt);
  if (!downloadText({ filename: 'service-error-budget-receipt.csv', mime: 'text/csv;charset=utf-8', text })) {
    openModal({ title: 'Copy numeric receipt', description: 'Download is unavailable. Copy the CSV below and keep the value column as text to preserve exact counts and fractions.',
      body: h('textarea', { rows: 12, value: text, readonly: true, 'aria-label': 'Service error-budget receipt CSV' }) });
  }
}

function evidenceBody(read) {
  const { report } = read;
  const refs = [
    ['Service', read.serviceRef], ['Objective and query version', read.policyRef], ['Extract version', read.sourceRef],
    ['Separate control source', read.controlRef ?? 'Not supplied'], ['Inclusive UTC window', `${read.startOn} to ${read.endOn}`],
    ['Service stewards', read.stewards.map((s) => s.name === null ? `${s.id} (no longer on the active roster)` : s.name).join(', ')],
    ...(read.recordedAt ? [['Recorded at (UTC)', read.recordedAt], ['Recorder reference', read.recorderId || 'Not visible from this seat']] : []),
  ];
  return h('div', { class: 'stack-md' },
    banner({ title: SERVICE_BUDGET_LABELS[report.verdict], tone: TONES[report.verdict],
      body: 'This is evidence about the recorded window, not permission to deploy or a forecast of future reliability.' }),
    report.issues.length ? h('ul', { 'aria-label': 'Why the objective result is withheld' }, ...report.issues.map((issue) => h('li', null, issue.message))) : null,
    report.missing.length ? h('p', { class: 'small', 'data-testid': 'sbud-missing' }, `Missing UTC days: ${report.missing.join(', ')}`) : null,
    h('dl', { class: 'stack-sm' }, ...refs.map(([label, value]) => h('div', null, h('dt', { class: 'small muted' }, label), h('dd', null, value)))),
    table({ caption: 'Closed-window reconciliation', columns: [
      { label: 'Measure', render: (r) => MEASURES[r.measure] },
      { label: 'Value', render: (r) => h('span', { 'data-measure': r.measure }, r.value ?? 'Withheld') },
      { label: 'Evidence limit', key: 'reason' },
    ], rows: report.receipt }),
    h('details', null,
      h('summary', null, 'Daily source rows'),
      table({ caption: 'Recorded UTC daily counts', rows: report.rows, columns: [
        { label: 'UTC day', key: 'day' }, { label: 'Good', key: 'good' }, { label: 'Eligible', key: 'total' }, { label: 'Errors', key: 'errors' },
      ] })),
  );
}

function prepare(ctx, candidates) {
  const form = buildForm([
    { name: 'serviceRef', label: 'Service reference', required: true },
    { name: 'policyRef', label: 'Objective and query version', required: true,
      help: 'Reference the agreed target and the definitions of a good and an eligible event. Do not paste customer records.' },
    { name: 'startOn', label: 'First UTC day', type: 'date', required: true },
    { name: 'endOn', label: 'Last UTC day', type: 'date', required: true, help: `Inclusive, before today; up to ${L.days} days.` },
    { name: 'target', label: 'Success target (%)', required: true, help: 'Enter a decimal percentage, such as 99.9. Up to four decimal places; no percent sign.' },
    { name: 'sourceRef', label: 'Telemetry extract and version', required: true, help: 'Use a reference you can retrieve again. A correction needs a new source version.' },
    { name: 'stewardIds', label: 'Service stewards', type: 'boolean-block', required: true, wide: true,
      options: candidates.map((c) => ({ value: c.id, label: c.name === c.id ? c.id : `${c.name} · ${c.id}` })),
      help: `Choose up to ${L.stewards} distinct leadership seats across all involved lines. A reviewer must reach all of them.` },
    { name: 'extract', label: 'UTC daily CSV or TSV', type: 'textarea', rows: 5, wide: true, required: true,
      help: `Use ${SERVICE_BUDGET_HEADERS.join(', ')}. Exactly one row per UTC day. Pre-aggregate the same, deduplicated request population across lines; 0/0 means an observed day with no eligible events.` },
    { name: 'controlRef', label: 'Independent control reference', wide: true,
      help: 'Use separate, whole-window totals for the same objective and population, not sums of the pasted daily rows. If unavailable, leave all three control fields blank and the verdict will be withheld.' },
    { name: 'controlGood', label: 'Control good events' },
    { name: 'controlTotal', label: 'Control eligible events' },
  ]);
  const message = h('p', { class: 'text-warn', role: 'alert' });
  const errors = (r) => {
    const field = form.field(r.field);
    if (field?.isConnected && !field.readOnly) {
      message.textContent = '';
      form.setFieldError(r.field, r.error);
      (field.querySelector('input') || field).focus();
    } else message.textContent = r.error;
  };
  const upload = h('input', { type: 'file', accept: '.csv,.tsv,text/csv,text/tab-separated-values' });
  const editor = h('div', { class: 'stack-sm' }, h('label', null, 'Open a local UTF-8 CSV or TSV ', upload), form.node);
  const body = h('div', { class: 'stack-md' }, editor, message);
  let prepared = null;
  let loading = false;
  const cancel = button('Cancel', () => modal.close());
  const edit = button('Edit evidence', () => {
    prepared = null;
    body.replaceChildren(editor, message);
    controls.replaceChildren(cancel, preview);
    message.textContent = '';
    form.focusFirst();
  });
  const save = button('Record workpaper', async () => {
    if (!prepared || save.disabled) return;
    save.disabled = true; edit.disabled = true; cancel.disabled = true;
    message.textContent = '';
    try {
      const result = await ctx.api.serviceBudgetRecord(prepared);
      if (!result.ok) { errors(result); return; }
      modal.close();
      toast(result.saved ? 'Service evidence recorded.' : `Workpaper held in memory only. ${result.warning}`, result.saved ? 'good' : 'bad');
      ctx.navigate(paperHref(result.id));
    } finally { save.disabled = false; edit.disabled = false; cancel.disabled = false; }
  }, true);
  const preview = button('Preview reconciliation', () => {
    if (loading) return;
    form.clearErrors(); message.textContent = '';
    const { extract, target, controlRef, controlGood, controlTotal, ...inputs } = form.getValues();
    const parsed = parseServiceBudgetExtract(extract);
    if (!parsed.ok) { errors(parsed); return; }
    const control = (controlRef || controlGood || controlTotal) ? { ref: controlRef, good: controlGood, total: controlTotal } : null;
    const read = ctx.api.serviceBudgetPreview({ ...inputs, targetPpm: serviceTargetPpm(target), daily: parsed.daily, control });
    if (!read.ok) { errors(read); return; }
    prepared = read.evidence;
    const title = h('p', { class: 'small muted', tabindex: '-1' }, 'Preview only. Nothing has been recorded.');
    body.replaceChildren(title, evidenceBody(read), message);
    controls.replaceChildren(cancel, edit, save);
    title.focus();
  }, true);
  const controls = h('div', { class: 'row-gap' }, cancel, preview);
  form.node.addEventListener('submit', (e) => { e.preventDefault(); preview.click(); });
  upload.addEventListener('change', async () => {
    const file = upload.files[0];
    if (!file) return;
    const input = form.field('extract');
    form.clearErrors(); message.textContent = ''; input.value = '';
    if (file.size > L.extract) { errors({ field: 'extract', error: 'File exceeds 16 KiB. No partial file was opened.' }); upload.value = ''; return; }
    upload.disabled = true; loading = true; input.readOnly = true; preview.disabled = true;
    try { input.value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { errors({ field: 'extract', error: 'This file could not be read as UTF-8. Open a UTF-8 export or paste the data.' }); }
    finally { upload.disabled = false; upload.value = ''; loading = false; input.readOnly = false; preview.disabled = false; }
  });
  const modal = openModal({ title: 'Review a service objective window', size: 'lg',
    description: 'Preview the evidence before recording. This local workpaper is not a deployment control.', body, footer: [controls] });
}

export function renderServiceBudget(ctx) {
  const index = ctx.api.serviceBudgetIndex();
  const title = 'Service error budget';
  if (!index.ok) return h('div', { class: 'page' }, pageHeader({ title }), banner({ tone: 'caution', title: 'Workpapers not available', body: index.error }));
  const id = ctx.query?.get('paper');
  const read = id ? ctx.api.serviceBudgetRead(id) : null;
  return h('div', { class: 'page', 'data-testid': 'service-budget-page' },
    pageHeader({ eyebrow: 'Operations assurance · director / VP / CEO', title,
      subtitle: 'Reconcile one completed window of customer-facing service evidence before a release review. See how many errors the declared objective allowed, or why the evidence cannot support a verdict.',
      actions: index.mayRecord ? [button('Review a window', () => prepare(ctx, index.candidates), true)] : [h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Declare an operating seat')],
    }),
    index.persistError ? banner({ tone: 'bad', title: 'Changes are not durable', body: index.persistError }) : null,
    !index.mayRecord ? h('p', { class: 'small muted' }, index.recordReason) : null,
    ...index.warnings.map((warning) => banner({ tone: 'caution', title: 'Evidence refused on load', body: warning })),
    read?.ok ? card({ title: 'Recorded evidence', actions: [button('Export numeric receipt', () => exportReceipt(ctx, id))], body: evidenceBody(read) }) : null,
    read && !read.ok ? banner({ tone: 'caution', title: 'Workpaper unavailable', body: read.error }) : null,
    card({ title: 'Workpapers in this seat’s reach', subtitle: 'Revisions remain separate; overlapping windows are never added together. Review the relevant version before relying on its result.',
      body: index.entries.length ? table({ caption: 'Recorded service error-budget workpapers', rows: index.entries, columns: [
        { label: 'Service', render: (p) => h('a', { href: paperHref(p.id), 'aria-current': p.id === id ? 'page' : null }, p.serviceRef) },
        { label: 'Objective version', key: 'policyRef' }, { label: 'Source version', key: 'sourceRef' },
        { label: 'Window (UTC)', render: (p) => `${p.startOn} to ${p.endOn}` }, { label: 'Recorded at (UTC)', key: 'recordedAt' },
      ] }) : emptyState({ title: 'No readable workpapers', body: 'Scoped seats can only read papers whose stewards all hold leadership seats and are in reach today.' }),
    }),
    h('details', null, h('summary', null, 'How the figures are calculated'),
      h('p', null, 'We sum good and eligible events, not daily percentages. The maximum whole errors allowed is the eligible count multiplied by the allowed error rate, rounded down to a whole event. The observed success fraction and the burn multiple are exact; a 100% objective has no defined burn multiple.'),
      h('p', null, 'A missing day, a missing or disagreeing control, or no eligible requests withholds the objective verdict. An arithmetic match does not authenticate the source or prove that it counted every customer event.'),
      h('p', null, 'LeadOS neither monitors the service nor controls releases. The CSV receipt contains the same numbers without identities or source references. Import its value column as text to preserve large counts and fractions.'),
      !index.mayRecord ? h('p', null, h('a', { href: '#/incidents' }, 'Open the incident command register')) : null),
  );
}
