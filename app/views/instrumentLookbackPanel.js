/** Standard Work → Instrument look-back. The worklist and its numeric receipt
 * come from one trace; the table does not decide what counts as exposure. */
import { h, buildForm, openModal, toast } from '../ui/dom.js';
import { card, banner, table, stat } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import { LOOKBACK_LIMITS, USE_CLASSES, instrumentReceipt, readInstrumentEvidence, traceInstrumentUses } from '../core/domain/instrumentLookback.js';
import { parseInstrumentUses, USE_HEADERS } from '../core/domain/instrumentUseExtract.js';

const route = '#/instrument-lookback';
const button = (label, click, primary = false) => h('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn', onClick: click }, label);
const detail = (title, ...children) => h('details', null, h('summary', null, title), ...children);

/** Keep large worklists usable without hiding or truncating the rest. */
function pages(caption, columns, rows, searchFields, emptyMessage) {
  const body = h('div');
  const status = h('span', { class: 'small muted', role: 'status' });
  const pageSize = 50;
  let start = 0, filtered = rows;
  const prev = button('Previous', () => { start -= pageSize; draw(); });
  const next = button('Next', () => { start += pageSize; draw(); });
  const search = h('input', { type: 'search', class: 'input', 'aria-label': `Find a reference in ${caption}`, onInput: () => {
    const term = search.value.toLowerCase();
    filtered = rows.filter((r) => searchFields.some((key) => r[key]?.toLowerCase().includes(term)));
    start = 0; draw();
  } });
  function draw() {
    const end = Math.min(filtered.length, start + pageSize);
    body.replaceChildren(table({ caption, columns, rows: filtered.slice(start, end), emptyMessage: rows.length ? 'No matching references.' : emptyMessage }));
    status.textContent = `${filtered.length ? `${start + 1}–${end}` : '0'} of ${filtered.length} matching · ${rows.length} in this list`;
    prev.disabled = !start; next.disabled = end === filtered.length;
  }
  draw();
  return h('div', { class: 'stack-sm' }, rows.length > pageSize ? h('div', { class: 'row-gap' }, h('label', null, 'Find reference ', search), prev, next, status) : null, body);
}

function traceBody(trace, withheldRows = 0) {
  const b = trace.basis;
  const receipt = instrumentReceipt(trace);
  return h('div', { class: 'stack-sm' },
    h('p', null, h('strong', null, b.instrumentRef), ' · As found out of tolerance: ', b.failedOn, ` (${b.failureRef}). `,
      b.goodOn ? `Last good: ${b.goodOn} (${b.goodRef}). Both boundary days are included; their within-day order is unknown.` : 'Last good: not evidenced.'),
    h('p', { class: 'small muted' }, `Source: ${b.sourceRef}. Coverage: ${b.coverage === 'attested' ? 'recorder attests all relevant lines and uses' : 'partial or unknown'}.`),
    banner({ tone: trace.decisionTotal === null ? 'warn' : 'info',
      title: trace.decisionTotal === null ? 'Total decisions to review: withheld' : `Total decisions to review: ${trace.decisionTotal}`,
      body: trace.decisionTotal === null ? trace.reasons.join(' ') : 'Within the evidenced calendar window and attested source coverage. This count is not a product verdict.' }),
    trace.counts.after ? banner({ tone: 'warn', title: `${trace.counts.after} use(s) after the failure day`, body: 'Outside this historical window, not cleared. Check instrument identity and return-to-service evidence separately.' }) : null,
    h('h3', null, 'Decisions to reopen or investigate'),
    pages('Inspection and release decisions', [{ label: 'Decision reference', key: 'decisionRef' }, { label: 'In-window uses', key: 'matched' }, { label: 'Possible uses', key: 'possible' }],
      trace.decisions, ['decisionRef'], 'No named decision is linked in this extract. See the coverage and unlinked-use counts.'),
    trace.unlinked ? h('p', { class: 'text-warn' }, `${trace.unlinked} use(s) still need a decision reference. These are not counted as distinct decisions.`) : null,
    detail('Source-use ledger',
      withheldRows ? h('p', { class: 'small muted' }, `${withheldRows} out-of-window or other-instrument row(s) counted but not disclosed to this tier.`) : null,
      pages('Source use evidence', [
        { label: 'Use ID', key: 'useRef' }, { label: 'Instrument', render: (r) => r.instrumentRef ?? 'Unknown' },
        { label: 'Use day', render: (r) => r.usedOn ?? 'Unknown' }, { label: 'Decision', render: (r) => r.decisionRef ?? 'Unlinked' },
        { label: 'Placement', render: (r) => USE_CLASSES[r.placement] }, { label: 'Source copies', key: 'copies' },
      ], trace.rows, ['useRef', 'decisionRef', 'instrumentRef'], 'No source-use rows to show for this grant.')),
    detail('Reconcile counts', table({ caption: 'Instrument look-back receipt', columns: [
      { label: 'Measure', key: 'measure' }, { label: 'Value', render: (r) => r.value ?? 'Withheld' }, { label: 'Reason if withheld', key: 'reason' },
    ], rows: receipt })),
  );
}

function prepare(ctx, index) {
  const candidates = new Map(index.candidates.map((p) => [p.checkId, p]));
  const form = buildForm([
    { name: 'checkId', label: 'Abnormal check you recorded', type: 'select', required: true,
      options: [{ value: '', label: 'Choose the source check' }, ...index.candidates.map((p) => ({ value: p.checkId, label: `${p.checkOn} · ${p.title} · ${p.note}` }))] },
    { name: 'instrumentRef', label: 'Failed instrument ID (exactly as logged)', required: true },
    { name: 'failedOn', type: 'date', label: 'As-found failure day', required: true },
    { name: 'failureRef', label: 'As-found certificate or failure report reference', required: true },
    { name: 'goodOn', type: 'date', label: 'Last evidenced good day' },
    { name: 'goodRef', label: 'Prior good check reference', help: 'If there is no evidenced start, leave both prior-good fields blank. A later as-left pass does not count.' },
    { name: 'sourceRef', label: 'Use-log source and version', required: true, help: 'Identify the exact extract so it can be retrieved. A later version is a separate workpaper.' },
    { name: 'coverage', label: 'Does this extract cover every use of the instrument across the relevant lines and days?', type: 'select', required: true,
      options: [{ value: '', label: 'Choose a coverage statement' }, { value: 'partial', label: 'Partial or unknown' }, { value: 'attested', label: 'I attest full coverage of this review window' }] },
    { name: 'expectedUses', label: 'Independent source count of distinct use IDs', help: 'Use the source system’s control for the entire extract, before filtering. Do not count the pasted rows. Blank means unknown; zero must be explicit.' },
    { name: 'extract', type: 'textarea', label: 'Use extract (paste from CSV or a spreadsheet)', rows: 5, required: true,
      help: `Four headers: ${USE_HEADERS.join(',')}. Use a common ID namespace across lines (qualify site-local IDs). One use per row; blank instrument, day or decision means unknown. Days are YYYY-MM-DD. A header alone explicitly supplies an empty extract. Up to ${LOOKBACK_LIMITS.rows} source rows.` },
  ]);
  const message = h('p', { class: 'text-warn', role: 'alert' });
  const errors = (r) => {
    message.textContent = r.error;
    if (r.field && form.field(r.field)) { form.setFieldError(r.field, r.error); form.field(r.field).focus(); }
  };
  const opener = h('input', { type: 'file', accept: '.csv,.tsv,text/csv,text/tab-separated-values' });
  let loading = false;
  opener.addEventListener('change', async () => {
    const file = opener.files[0];
    if (!file) return;
    form.field('extract').value = ''; message.textContent = ''; form.clearErrors();
    if (file.size > LOOKBACK_LIMITS.text) { errors({ field: 'extract', error: 'File exceeds 1 MiB. No partial file was opened.' }); return; }
    loading = true; opener.disabled = true; form.field('extract').readOnly = true; review.disabled = true;
    try { form.field('extract').value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { errors({ field: 'extract', error: 'Could not read a UTF-8 file. Paste the source or open a UTF-8 export.' }); }
    finally { loading = false; opener.disabled = false; form.field('extract').readOnly = false; review.disabled = false; }
  });
  const editor = h('div', { class: 'stack-sm' }, h('label', null, 'Or open a local UTF-8 CSV / TSV ', opener), form.node);
  const body = h('div', { class: 'stack-sm' }, editor, message);
  let prepared = null;
  const cancel = button('Cancel', () => modal.close());
  const edit = button('Edit evidence', () => {
    prepared = null; body.replaceChildren(editor, message); message.textContent = '';
    controls.replaceChildren(cancel, review); form.focusFirst();
  });
  const review = button('Preview worklist', () => {
    if (loading) return;
    form.clearErrors(); message.textContent = '';
    const { extract, expectedUses, ...values } = form.getValues();
    const parent = candidates.get(values.checkId);
    if (!parent) { errors({ field: 'checkId', error: 'Choose the abnormal check that recorded the failure.' }); return; }
    const parsed = parseInstrumentUses(extract);
    if (!parsed.ok) { errors(parsed); return; }
    const n = expectedUses === '' ? null : /^\d+$/.test(expectedUses) ? Number(expectedUses) : NaN;
    const read = readInstrumentEvidence({ ...values, expectedUses: n, uses: parsed.uses }, { checkOn: parent.checkOn, capturedOn: index.today });
    if (!read.ok) { errors(read); return; }
    prepared = { checkId: parent.checkId, ...read.evidence };
    body.replaceChildren(h('p', { class: 'small muted' }, `Preview only · ${parent.title} · check ${parent.checkOn}. Nothing has been saved.`), traceBody(traceInstrumentUses(read.evidence)), message);
    controls.replaceChildren(cancel, edit, save); edit.focus();
  }, true);
  const save = button('Record this workpaper', async () => {
    if (!prepared || save.disabled) return;
    edit.disabled = true; save.disabled = true;
    try {
      const result = await ctx.api.instrumentLookbackRecord(prepared);
      if (!result.ok) { message.textContent = result.error; return; }
      modal.close();
      toast(result.saved ? 'Instrument workpaper recorded.' : `Workpaper is in memory only: ${result.warning}`, result.saved ? 'good' : 'bad');
      ctx.navigate(`${route}?paper=${encodeURIComponent(result.id)}`);
    } finally { edit.disabled = false; save.disabled = false; }
  }, true);
  const controls = h('div', { class: 'row-gap' }, cancel, review);
  form.node.addEventListener('submit', (event) => { event.preventDefault(); review.click(); });
  const modal = openModal({ title: 'Trace an out-of-tolerance instrument', size: 'lg',
    description: 'Use references, not personal data. The source stays in the local workspace and its backups. The named escalation tiers can see the review list, not unrelated source rows.',
    body, footer: [controls] });
}

function exportReceipt(ctx, paperId) {
  const read = ctx.api.instrumentLookbackRead(paperId);
  if (!read.ok) { toast(read.error, 'bad'); return; }
  const text = serializeCsv(['measure', 'value', 'reason'], instrumentReceipt(read.trace));
  if (!downloadText({ filename: 'instrument-lookback-receipt.csv', mime: 'text/csv;charset=utf-8', text })) {
    openModal({ title: 'Copy aggregate CSV', description: 'Download is unavailable. These are the same counts, without source references.', body: h('textarea', { readonly: true, rows: 12, 'aria-label': 'Aggregate CSV receipt', value: text }) });
  }
}

export function renderInstrumentLookbackPanel(ctx, { recordSource, declareSource }) {
  const index = ctx.api.instrumentLookbackIndex();
  if (!index.ok) return banner({ tone: 'warn', title: 'Look-back unavailable', body: index.error });
  const id = ctx.query?.get?.('paper') || index.entries[0]?.id;
  const paper = id ? ctx.api.instrumentLookbackRead(id) : null;
  const pick = h('select', { class: 'input', 'aria-label': 'Saved workpaper', onChange: () => ctx.navigate(`${route}?paper=${encodeURIComponent(pick.value)}`) },
    ...index.entries.map((p) => h('option', { value: p.id }, `${p.instrumentRef} · ${p.sourceRef} · ${p.title} · ${p.recordedAt}`)));
  pick.value = id || '';
  return h('div', { class: 'stack', 'data-testid': 'instrument-lookback' },
    card({ title: 'Which decisions relied on this instrument?', subtitle: 'Trace one as-found failure to earlier inspections and releases. Repairing the gauge does not settle those decisions.',
      actions: index.candidates.length ? [button('Trace instrument uses', () => prepare(ctx, index), true)] : [],
      body: h('div', { class: 'stack-sm' },
        detail('Record the source abnormality',
          h('p', null, 'A workpaper belongs to the person who recorded the failed check. If it is not on record yet, record it on your own standard-work routine. Do not create a second check for the same event.'),
          h('div', { class: 'row-gap' }, button('Record a source check', recordSource), button('Declare my routine', declareSource))),
        detail('How the look-back works', h('figure', null,
          h('img', { src: './app/assets/instrument-lookback.jpg', alt: 'A tagged micrometer is traced back to the inspection records for three machined parts.', loading: 'lazy', width: 688, style: { maxWidth: '100%', height: 'auto' } }),
          h('figcaption', { class: 'small muted' }, 'Follow the instrument ID back to each use, then group uses by inspection or release reference. A missing link is work to investigate, not a failed part. Concept illustration, not workspace data.')))) }),
    ...index.warnings.map((body) => banner({ tone: 'warn', title: 'Source data refused on load', body })),
    index.persistError ? banner({ tone: 'bad', title: 'Workspace changes are not saved', body: index.persistError }) : null,
    card({ title: 'Workpapers in your scope', subtitle: 'Counts are of dated extracts, not instruments or products. Extracts can overlap; never add their decision totals.',
      body: h('div', { class: 'stack-sm' }, h('div', { class: 'stat-grid' },
        stat({ label: 'Readable workpapers', value: index.inScope }), stat({ label: 'With a supported total', value: index.supported }), stat({ label: 'Total withheld', value: index.withheld })),
      index.countOnly ? h('p', { class: 'small muted' }, `${index.countOnly} workpaper(s) counted without details: your span reaches the recorder, but the check was not addressed to you.`) : null,
      index.entries.length ? h('label', null, 'Read a dated workpaper ', pick) : h('p', { class: 'small muted' }, 'No detailed workpaper is available to this seat. This is not evidence of zero exposure.')) }),
    paper && !paper.ok ? banner({ tone: 'warn', title: 'Workpaper withheld', body: paper.error }) : null,
    paper?.ok ? card({ title: 'Instrument-use workpaper', subtitle: `Abnormal check ${paper.checkOn}: ${paper.note} · Captured ${paper.trace.basis.recordedAt}`,
      actions: [button('Aggregate receipt (CSV)', () => exportReceipt(ctx, id))], body: traceBody(paper.trace, paper.withheldRows) }) : null,
  );
}
