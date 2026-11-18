/** ADR-0259: render the guarded workpaper, never a second calculation. */
import { buildForm, h, openModal, toast } from '../ui/dom.js';
import { banner, card, emptyState, pageHeader, table } from '../ui/components.js';
import { CASH_ACCOUNT_FIELDS, CASH_TERM_FIELDS } from '../core/domain/minimumCash.js';
import { CASH_COVENANT_LIMITS as L } from '../core/domain/cashCovenantSchema.js';

const HREF = '#/cash-covenant';
const receiptHref = (id, number) => `${HREF}?test=${encodeURIComponent(id)}&revision=${number}`;
const button = (label, onClick, primary = false) => h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick }, label);
const labelFor = (reading) => ({ 'above minimum': 'Above minimum', 'at minimum': 'At minimum', 'below minimum': 'Below minimum' })[reading] ?? 'Headroom withheld';
const personLabel = (person) => person.name && person.name !== person.id ? `${person.name} · ${person.id}` : person.id;
const check = (matches) => matches ? 'Yes' : 'No';

function fieldsList(fields) {
  return h('dl', { class: 'stack-sm' }, ...fields.map(([key, label, value]) => h('div', null,
    h('dt', { class: 'small muted' }, label), h('dd', { 'data-cash-field': key }, value))));
}

function receiptBody({ report, revision, stewards, recorder }) {
  const { terms, result } = report;
  const reading = result?.reading;
  const facts = [
    ['facility', 'Facility code', terms.facility], ['testDate', 'Contractual test date', terms.testDate],
    ['cutoffAt', 'Contractual cutoff (UTC)', revision.cutoffAt], ['currency', 'Currency', terms.currency],
    ['clauseRef', 'Executed clause or amendment reference', terms.clauseRef], ['controlRef', 'Separate book control reference', terms.controlRef],
    ['versionRef', 'Workpaper source version', revision.versionRef], ['revision', 'Revision', String(revision.number)],
    ['stewards', 'Named leadership stewards', stewards.map(personLabel).join(', ')],
  ];
  if (revision.recordedAt) facts.push(['recordedAt', 'Recorded at (UTC)', revision.recordedAt]);
  facts.push(['recorder', revision.recordedAt ? 'Recording seat' : 'Preparing seat', recorder ? personLabel(recorder) : 'Not visible from this seat']);
  if (revision.supersedes) {
    facts.push(['supersedes', 'Replaces version', revision.supersedes], ['correctionReason', 'Correction reason', revision.correctionReason]);
  }
  const submittedAmount = (value) => report.distinctAccounts ? value : 'Withheld — no account rows';
  const measures = [
    ['minimumMinor', 'Contractual minimum', terms.minimumMinor],
    ['eligibleMinor', 'Eligible cash', result?.eligibleMinor ?? 'Withheld'],
    ['signedHeadroomMinor', 'Signed headroom (eligible cash less minimum)', result?.signedHeadroomMinor ?? 'Withheld'],
    ['distinctAccounts', 'Distinct account rows', String(report.distinctAccounts)],
    ['duplicateRows', 'Identical source copies not counted again', String(report.duplicateRows)],
    ['controlAccounts', 'Declared population count', terms.controlAccounts],
    ['countMatches', 'Account count agrees with control', check(report.countMatches)],
    ['include', 'Submitted included subtotal', submittedAmount(report.subtotalsMinor.include)],
    ['exclude', 'Submitted excluded subtotal', submittedAmount(report.subtotalsMinor.exclude)],
    ['unresolved', 'Submitted unresolved subtotal', submittedAmount(report.subtotalsMinor.unresolved)],
    ['bookMinor', 'Sum of distinct submitted balances', submittedAmount(report.bookMinor)],
    ['printedRowsBalance', 'Submitted rows and classification subtotals agree', report.distinctAccounts ? check(report.printedRowsBalance) : 'No rows to reconcile'],
    ['controlTotalMinor', 'Declared book total before exclusions', terms.controlTotalMinor],
    ['totalMatches', 'Submitted amount agrees with book control', report.distinctAccounts ? check(report.totalMatches) : 'No rows to reconcile'],
  ];
  return h('div', { class: 'stack-md' },
    banner({ title: labelFor(reading), tone: !reading || reading === 'at minimum' ? 'caution' : reading === 'below minimum' ? 'bad' : 'info', body: report.scope }),
    report.reasons.length ? h('ul', { 'aria-label': 'Reasons headroom is withheld' }, ...report.reasons.map((reason) => h('li', null, reason))) : null,
    fieldsList(facts),
    h('p', { class: 'small muted' }, `Amounts below are exact integer minor units in ${terms.currency}. Matching controls do not prove account membership, sources or interpretation of the agreement.`),
    table({ caption: 'Cash covenant reconciliation', rows: measures, columns: [
      { label: 'Measure', render: ([, label]) => label },
      { label: 'Value', render: ([key, , value]) => h('span', { 'data-cash-measure': key }, value) },
    ] }),
    h('details', null, h('summary', null, 'Account evidence and TSV line numbers'),
      table({ caption: 'Distinct submitted cash accounts', rows: report.evidence, emptyMessage: 'No account evidence was supplied.', columns: [
        { label: 'Account code', key: 'account' }, { label: 'Signed balance (minor units)', key: 'balanceMinor' },
        { label: 'Treatment', key: 'treatment' }, { label: 'Eligibility basis or question', key: 'basisRef' },
        { label: 'Balance reference', key: 'balanceRef' }, { label: 'Source lines', render: (r) => r.lines.join(', ') },
      ] })),
  );
}

function tsvInstructions() {
  return h('details', { class: 'small' }, h('summary', null, 'Required TSV format'),
    h('p', null, 'Lines 1 and 3 are the exact headers below. Line 2 is the single terms row; line 4 onward is account evidence for the same date and currency. Use actual tab separators.'),
    h('div', { class: 'table-wrap' }, h('pre', null, CASH_TERM_FIELDS.join('\t'), '\n', CASH_ACCOUNT_FIELDS.join('\t'))),
    h('p', null, 'Use stable facility and account codes, not bank account numbers. Use a separate book control covering every account before exclusions. Mark each full signed balance include, exclude or unresolved and cite the basis plus the balance source. Keep overdrafts negative; do not substitute zeros.'),
  );
}

function prepareDialog(ctx, { candidates = [], prior = null, cutoffAt = '' } = {}) {
  const form = buildForm([
    { name: 'versionRef', label: 'Workpaper source version reference', required: true, wide: true,
      help: 'Use the identifier of the specific source workpaper so it can be retrieved later.' },
    { name: 'cutoffAt', label: 'Contractual cutoff converted to UTC', required: true, wide: true, value: cutoffAt,
      help: 'Enter the actual cutoff as YYYY-MM-DDTHH:mm:ssZ or with milliseconds. It must have occurred.' },
    ...(prior ? [
      { name: 'correctionReason', label: 'What changed and why?', required: true, wide: true, help: 'Use a new source version. The previous version will remain available.' },
    ] : [
      { name: 'stewardIds', label: 'Accountable leadership stewards', type: 'boolean-block', required: true, wide: true,
        options: candidates.map((person) => ({ value: person.id, label: personLabel(person) })),
        help: `Choose 1–${L.stewards} people across the lines accountable for this test. Reviewers must reach every steward.` },
    ]),
    { name: 'text', label: 'Complete workpaper TSV', type: 'textarea', rows: 7, wide: true, required: true,
      help: 'Paste or open the complete source for one facility, one contractual date and one currency. Do not include account numbers or credentials.' },
  ]);
  const upload = h('input', { type: 'file', accept: '.tsv,.txt,text/tab-separated-values,text/plain' });
  const message = h('p', { role: 'alert', class: 'text-warn' });
  const editor = h('div', { class: 'stack-sm' }, tsvInstructions(), h('label', null, 'Open a local UTF-8 TSV ', upload), form.node);
  const body = h('div', { class: 'stack-md' }, editor, message);
  function showError(result) {
    if (result.field && form.field(result.field)?.isConnected) {
      form.setFieldError(result.field, result.error);
      const input = form.field(result.field);
      (input.querySelector('input') || input).focus();
    } else message.textContent = result.error;
  }
  let prepared = null;
  const cancel = button('Cancel', () => modal.close());
  const edit = button('Edit evidence', () => {
    prepared = null;
    body.replaceChildren(editor, message);
    controls.replaceChildren(cancel, preview);
    message.textContent = '';
    form.focusFirst();
  });
  const record = button(prior ? 'Record correction' : 'Record workpaper', async () => {
    if (!prepared || record.disabled) return;
    record.disabled = true; edit.disabled = true; cancel.disabled = true;
    message.textContent = '';
    try {
      const result = await ctx.api.cashCovenantRecord(prepared);
      if (!result.ok) { showError(result); return; }
      if (modal.dialog.isConnected) {
        modal.close();
        ctx.navigate(receiptHref(result.testId, result.number));
      }
      toast(result.saved ? 'Workpaper revision saved.' : `Workpaper held in memory only. ${result.warning}`, result.saved ? 'good' : 'bad');
    } finally { record.disabled = false; edit.disabled = false; cancel.disabled = false; }
  }, true);
  const preview = button('Preview reconciliation', () => {
    if (upload.disabled) return;
    form.clearErrors(); message.textContent = '';
    const result = ctx.api.cashCovenantPreview({ ...form.getValues(), prior });
    if (!result.ok) { showError(result); return; }
    prepared = result.submission;
    const lead = h('p', { class: 'muted small', tabindex: '-1' }, 'Preview only. Nothing has been recorded.');
    body.replaceChildren(lead, receiptBody(result), message);
    controls.replaceChildren(cancel, edit, record);
    lead.focus();
  }, true);
  const controls = h('div', { class: 'row-gap' }, cancel, preview);
  form.node.addEventListener('submit', (event) => { event.preventDefault(); preview.click(); });
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    form.clearErrors(); message.textContent = '';
    const input = form.field('text');
    input.value = '';
    if (file.size > L.extract) {
      showError({ field: 'text', error: 'The file exceeds 64 KiB. No partial file was opened.' });
      upload.value = '';
      return;
    }
    upload.disabled = true; input.readOnly = true; preview.disabled = true;
    try { input.value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { showError({ field: 'text', error: 'Could not read this file as UTF-8. Use a UTF-8 export or paste the evidence.' }); }
    finally { upload.value = ''; upload.disabled = false; input.readOnly = false; preview.disabled = false; }
  });
  const modal = openModal({ title: prior ? 'Prepare a workpaper correction' : 'Review a minimum-cash test',
    description: prior ? `You are correcting ${prior.versionRef}. Resubmit the complete workpaper for the same facility, date and currency.`
      : 'Use this only for a fixed, inclusive minimum cash amount at a point in time. A workpaper is not a lender certificate.', body, size: 'lg', footer: [controls] });
}

export function renderCashCovenant(ctx) {
  const index = ctx.api.cashCovenantIndex();
  const title = 'Cash covenant workpapers';
  if (!index.ok) return h('div', { class: 'page' }, pageHeader({ title }), banner({ tone: 'caution', title: 'Workpapers unavailable', body: index.error }));
  const testId = ctx.query.get('test');
  const read = testId ? ctx.api.cashCovenantRead(testId, ctx.query.get('revision')) : null;
  return h('div', { class: 'page', 'data-testid': 'cash-covenant-page' },
    pageHeader({ title, eyebrow: 'Treasury assurance',
      subtitle: 'Review one facility and one closed cutoff. Reconcile the account population before using the gap to the declared minimum. No totals are pooled across tests.',
      actions: index.mayRecord ? [button('Review a test', () => prepareDialog(ctx, index), true)] : [],
    }),
    index.persistError ? banner({ tone: 'bad', title: 'Changes are not durable', body: index.persistError }) : null,
    !index.mayRecord ? h('p', { class: 'small muted' }, index.recordReason, ' ', h('a', { href: '#/seat' }, 'Open Altitude Lens')) : null,
    read?.ok ? card({ title: 'Recorded receipt', id: 'cash-covenant-receipt',
      subtitle: read.revision.number === read.latestNumber ? 'Latest recorded revision for this test. Source freshness has not been certified.' : 'Superseded revision. Do not use it as the latest evidence.',
      actions: read.mayCorrect ? [button('Prepare correction', () => prepareDialog(ctx, {
        prior: { testId, versionRef: read.revision.versionRef }, cutoffAt: read.revision.cutoffAt,
      }))] : [],
      body: receiptBody(read),
    }) : read ? banner({ tone: 'caution', title: 'Receipt unavailable', body: read.error }) : null,
    read?.ok ? card({ title: 'Revision history', body: table({ caption: 'Recorded workpaper revisions', rows: [...read.history].reverse(), columns: [
      { label: 'Revision', render: (r) => h('a', { href: receiptHref(testId, r.number), 'aria-current': r.number === read.revision.number ? 'page' : null }, String(r.number)) },
      { label: 'Source version', key: 'versionRef' }, { label: 'Recorded at (UTC)', key: 'recordedAt' },
      { label: 'Status', render: (r) => r.number === read.latestNumber ? 'Latest recorded' : 'Superseded' },
    ] }) }) : null,
    card({ title: 'Tests in this seat’s reach', subtitle: 'One reading per test. Keep the receipt open to review its source and reconciliation, not just the result.',
      body: index.tests.length ? table({ caption: 'Recorded cash covenant tests', rows: index.tests, columns: [
        { label: 'Facility', render: (r) => h('a', { href: receiptHref(r.id, r.latestNumber) }, r.facility) },
        { label: 'Test date', key: 'testDate' }, { label: 'Currency', key: 'currency' }, { label: 'Latest revision', key: 'latestNumber' },
        { label: 'Latest recorded at (UTC)', key: 'recordedAt' }, { label: 'Reading', render: (r) => labelFor(r.reading) },
      ] }) : emptyState({ title: 'No readable tests', body: 'A declared seat can review only tests whose named stewards it all reaches on active reporting paths.' }),
    }),
  );
}
