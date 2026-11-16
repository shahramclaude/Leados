/**
 * app/views/domain-sense.js — `#/domain-sense`, the Decision-Domain Sensing
 * Register (ADR-0228, Cynefin, Schema v186).
 *
 * ONE reader (`buildDomainSense`) behind every state, domain, fit, count and
 * flag this page prints. The page formats what the reader returned; it
 * computes no state, no overdue flag and no fit of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. THE DECISION — a dated matter a named owner is accountable for, with a
 *      declared panel, each member on a declared line;
 *   2. THE SENSING — panel readings, each with evidence matched to the domain
 *      stated (precedent for clear, analysis for complicated, probe for
 *      complex, onset for chaotic, unsorted for disorder);
 *   3. THE COMMIT — the owner's single mode commitment, read for fit against
 *      the agreed domain (clear → standard practice, complicated → expert
 *      analysis, complex → safe-to-fail probe, chaotic → stabilise first,
 *      disorder → decompose). Reported, never enforced.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  DSN_DOMAINS, DSN_DOMAIN_KEYS, DSN_MODES, DSN_MODE_KEYS, DSN_FIT, DSN_STATES,
  DSN_FIT_STATES, DSN_LIMITS, DSN_METHOD, DSN_HREF, DSN_RIGHTS,
} from '../core/domain/domainSenseRegistry.js';
import { buildDomainSense } from '../core/domain/domainSense.js';

const L = DSN_LIMITS;
const DOMAIN_LABEL = Object.freeze(Object.fromEntries(DSN_DOMAINS.map((row) => [row.key, row.label])));
const DOMAIN_SEQ = Object.freeze(Object.fromEntries(DSN_DOMAINS.map((row) => [row.key, row.sequence])));
const DOMAIN_EVIDENCE = Object.freeze({
  clear: 'Precedent — at least 3 comparable dated cases, same outcome',
  complicated: 'Analysis — a named analysis reference',
  complex: 'Probe — at least 1 dated safe-to-fail probe, with what was observed',
  chaotic: 'Onset — a declared onset instant not later than the reading',
  disorder: 'Unsorted — a note that the panel cannot yet name a basis',
});
const MODE_LABEL = Object.freeze(Object.fromEntries(DSN_MODES.map((row) => [row.key, row.label])));
const STATE_TONE = {
  'awaiting-readings': 'caution',
  'awaiting-quorum': 'caution',
  'domain-contested': 'bad',
  'domain-agreed': 'info',
};
const FIT_TONE = { fit: 'good', mismatch: 'bad', owed: 'caution', 'not-readable': 'neutral' };
const STATE_SHORT = {
  'awaiting-readings': 'No readings yet',
  'awaiting-quorum': 'Below quorum',
  'domain-contested': 'Panel disagrees',
  'domain-agreed': 'Domain agreed',
};
const VIEWS = [
  { key: 'rows', label: 'Decisions' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];

function button(label, onClick, { primary = false, testid = null, danger = false } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : danger ? 'btn-ghost text-warn' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const when = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, onDone) {
  const panelCandidates = ctx.domainSensePanel || [];
  const peopleOptions = panelCandidates.map((p) => ({ value: p.id, label: `${p.name} · ${p.role || 'team'}` }));
  const form = buildForm([
    { name: 'title', label: 'The decision', type: 'textarea', required: true,
      help: `At least ${L.titleMin} characters: the matter, and why its kind of cause and effect needs stating.` },
    { name: 'ownerId', label: 'Owner (commits the mode)', type: 'select', required: true,
      options: options(peopleOptions, { blank: 'Choose the owner' }),
      help: 'Only the owner commits a mode, once; nobody else can commit in their place.' },
    { name: 'senseInDays', label: 'Sensing window (days)', type: 'select', required: true,
      options: options([7, 14, 30, 60].map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` })), { blank: 'Choose the window' }),
      help: `Between ${L.senseMinDays} and ${L.senseMaxDays} days. Past it without an agreed domain, the register prints sense-overdue.` },
  ]);
  const panelNode = h('div', { class: 'stack' });
  const selected = new Set();
  const lineByMember = new Map();

  function renderPanel() {
    panelNode.innerHTML = '';
    panelNode.appendChild(h('p', { class: 'small muted' },
      'Panel members — each on the line they read from. A cross-line panel is the point: quorum needs readings from at least two distinct lines, and a panel on one line can never agree a domain.'));
    const list = h('div', { class: 'list' });
    for (const p of panelCandidates) {
      const lines = p.lines || [];
      const hasLines = lines.length > 0;
      const checked = selected.has(p.id);
      const defaultLine = lines.length ? lines[0] : null;
      const lineSelect = lines.length > 1
        ? h('select', { class: 'input', disabled: !checked },
            ...lines.map((l) => h('option', { value: l.id, selected: lineByMember.get(p.id) === l.id || (!checked && l === defaultLine) }, `${l.managerName} · ${l.kind || 'line'}`)))
        : lines.length === 1
          ? h('span', { class: 'small muted' }, `on ${defaultLine.managerName} · ${defaultLine.kind || 'line'}`)
          : h('span', { class: 'text-warn small' }, 'no declared line — cannot sit on the panel');
      const checkbox = h('input', { type: 'checkbox', checked, disabled: !hasLines,
        onClick: () => {
          if (checked) { selected.delete(p.id); lineByMember.delete(p.id); }
          else { selected.add(p.id); if (defaultLine) lineByMember.set(p.id, defaultLine.id); }
          renderPanel();
        } });
      list.appendChild(h('div', { class: 'row gap-s' },
        checkbox,
        h('span', { class: 'small' }, `${p.name} · ${p.role || 'team'}`),
        lineSelect));
    }
    panelNode.appendChild(list);
  }
  renderPanel();

  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    if (selected.size < L.panelMin || selected.size > L.panelMax) {
      toast(`Declare between ${L.panelMin} and ${L.panelMax} panel members.`, 'bad');
      return;
    }
    const panel = [...selected].map((memberId) => ({
      memberId,
      lineId: lineByMember.get(memberId) || '',
    }));
    if (panel.some((seat) => !seat.lineId)) {
      toast('Every panel member needs a declared line.', 'bad');
      return;
    }
    const result = ctx.api.domainDeclare({
      title: values.title,
      ownerId: values.ownerId,
      panel,
      senseInDays: values.senseInDays ? Number(values.senseInDays) : undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Decision declared. The panel now owes its readings — from more than one line, or nothing can be agreed.', 'good');
    onDone?.();
  };

  openModal({
    title: 'Declare a decision for the panel to sense',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Sense before you respond', body: 'Cynefin: the domain is a property of the problem as evidenced, not a label the owner picks. The panel states it on evidence; the owner then commits a mode that is read for fit against it.' }),
      form.node,
      h('fieldset', { class: 'panel-fieldset' },
        h('legend', null, 'Panel'),
        panelNode)),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare decision', onClick: submit, primary: true }],
  });
}

function assessDialog(ctx, decision, onDone) {
  const basisOptions = [
    { value: 'precedent', label: 'Precedent — comparable dated cases (clear)' },
    { value: 'analysis', label: 'Analysis — a named analysis reference (complicated)' },
    { value: 'probe', label: 'Probe — dated safe-to-fail probes (complex)' },
    { value: 'onset', label: 'Onset — a declared onset instant (chaotic)' },
    { value: 'unsorted', label: 'Unsorted — no basis yet (disorder)' },
  ];
  const form = buildForm([
    { name: 'domain', label: 'The domain this matter is in', type: 'select', required: true,
      options: options(DSN_DOMAINS.map((d) => ({ value: d.key, label: `${d.label} — ${DOMAIN_SEQ[d.key]}` })), { blank: 'Choose the domain' }),
      help: 'State what kind of problem this is. The evidence must match the domain.' },
    { name: 'basisKind', label: 'Evidence basis', type: 'select', required: true,
      options: options(basisOptions, { blank: 'Choose the basis' }),
      help: 'Clear needs precedent; complicated needs analysis; complex needs probes; chaotic needs an onset; disorder names that nothing is sorted yet.' },
    { name: 'cases', label: 'Comparable dated cases', type: 'number', help: 'At least 3 for precedent.' },
    { name: 'note', label: 'Note', type: 'textarea', help: 'What the cases, analysis, probes or onset show.' },
    { name: 'analysisRef', label: 'Analysis reference', type: 'text', help: 'The named analysis this reading rests on.' },
    { name: 'probes', label: 'Dated probes', type: 'number', help: 'At least 1 for complex.' },
    { name: 'observed', label: 'What was observed', type: 'textarea', help: 'What the probes showed.' },
    { name: 'onsetAt', label: 'Onset instant', type: 'text', help: 'ISO instant, e.g. 2026-11-04T06:00:00.000Z — not later than now.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const basis = { kind: values.basisKind };
    if (values.basisKind === 'precedent') basis.cases = values.cases ? Number(values.cases) : null;
    if (values.basisKind === 'analysis') basis.analysisRef = values.analysisRef || '';
    if (values.basisKind === 'probe') { basis.probes = values.probes ? Number(values.probes) : null; basis.observed = values.observed || ''; }
    if (values.basisKind === 'onset') { basis.onsetAt = values.onsetAt || ''; basis.note = values.note || ''; }
    if (values.basisKind === 'unsorted') basis.note = values.note || '';
    const result = ctx.api.domainAssess({
      decisionId: decision.id,
      domain: values.domain || '',
      lineId: decision.panel.find((s) => s.memberId === ctx.seatId)?.lineId || '',
      basis,
      assessedAt: undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The reading was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Reading recorded. The domain is stated only when every line reads the same way.', 'good');
    onDone?.();
  };
  openModal({
    title: `State the domain for ${decision.id}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One line does not make a domain', body: 'Your reading counts once, on the line you were declared on, and never as the owner. A reading whose evidence does not support its domain is refused and printed.' }),
      h('p', { class: 'small' }, `Panel seat: ${decision.panel.map((s) => s.memberId).join(', ')}`),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record reading', onClick: submit, primary: true }],
  });
}

function commitDialog(ctx, decision, onDone) {
  const form = buildForm([
    { name: 'mode', label: 'The mode you commit to', type: 'select', required: true,
      options: options(DSN_MODES.map((m) => ({ value: m.key, label: `${m.label}` })), { blank: 'Choose the mode' }),
      help: 'The reader will compare this with the one mode that fits the agreed domain — and print a mismatch if they differ. It does not block you.' },
    { name: 'rationale', label: 'Why this mode', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters: why this mode fits the domain the panel sensed.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.domainCommit({
      decisionId: decision.id,
      mode: values.mode || '',
      rationale: values.rationale || '',
      committedAt: undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The commitment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Mode committed. The register prints whether it fits the agreed domain — it never enforces it.', 'good');
    onDone?.();
  };
  openModal({
    title: `Commit a mode for ${decision.id}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Fit is read, not enforced', body: 'Only the owner commits, once. The fit verdict (fit / mismatch / owed) is a reading against the agreed domain; no decision is blocked or changed by it.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Commit mode', onClick: submit, primary: true }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The register in five numbers',
    subtitle: 'States, domains and fits are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Decisions', value: String(c.decisions) }),
      stat({ label: 'Domain agreed', value: String(c.states['domain-agreed'] || 0), tone: c.states['domain-agreed'] ? 'good' : undefined }),
      stat({ label: 'Contested / no quorum', value: String((c.states['domain-contested'] || 0) + (c.states['awaiting-quorum'] || 0)), tone: (c.states['domain-contested'] || 0) > 0 ? 'warn' : undefined }),
      stat({ label: 'Fit / mismatch', value: `${String(c.fit['fit'] || 0)} / ${String(c.fit['mismatch'] || 0)}` }),
      stat({ label: 'Refused acts', value: String(report.refusals.length), tone: report.refusals.length ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.stateCountsReconcile
      ? banner({ tone: 'good', title: 'The rows add up', body: 'The printed state counts sum to the decision total (`stateCountsReconcile`), and the agreed-domain counts equal the agreed state.' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the decision total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped', body: 'No refused act and no dropped row sit behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'Figures carry refusals behind them', body: `${report.refusals.length} refused act(s) are listed on their own tab and are not applied.` }),
  );
}

function rowsView(ctx, report, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const seatId = ctx.seatId || self || null;
  const columns = [
    { label: 'Decision', render: (r) => h('strong', null, r.title) },
    { label: 'Owner', render: (r) => h('span', null, r.ownerId === seatId ? 'you' : r.ownerId) },
    { label: 'Panel (lines)', render: (r) => h('span', { class: 'small' }, r.panel.map((s) => `${s.memberId} on ${s.lineId}`).join('; ')) },
    { label: 'Sense by', render: (r) => when(r.senseByAt) },
    { label: 'State', render: (r) => h('span', null, badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral')) },
    { label: 'Domain read', render: (r) => h('span', null, r.domain ? `${r.domainLabel} (${r.domainCounts && Object.entries(r.domainCounts).map(([k, v]) => `${k}:${v}`).join(', ')})` : '—') },
    { label: 'Fit vs mode', render: (r) => {
      const fit = r.fit === 'not-readable' ? 'not yet readable' : r.fit;
      const extra = r.expectedMode ? ` — fits ${r.expectedMode}` : '';
      return h('span', null, badge(`${fit}${extra}`, FIT_TONE[r.fit] || 'neutral'));
    } },
    { label: 'Flags', render: (r) => h('span', { class: 'small' }, r.flags.length ? r.flags.map((f) => f === 'sense-overdue' ? 'sense overdue' : 'reading stale').join('; ') : '—') },
    { label: 'Owes you', render: (r) => {
      const owns = r.ownerId === seatId && !r.commit;
      const reads = r.panel.some((s) => s.memberId === seatId && s.memberId !== r.ownerId && !r.readings.some((a) => a.assessorId === seatId));
      if (owns && reads) return h('span', { class: 'text-warn' }, 'commit + assess');
      if (owns) return h('span', null, 'commit');
      if (reads) return h('span', null, 'assess');
      return '—';
    } },
    { label: '', render: (r) => h('div', { class: 'row gap-s' },
      [
        (!r.commit && r.ownerId === seatId)
          ? button('Commit mode', () => commitDialog(ctx, r, onDone), { primary: true, testid: `dsn-commit-${r.id}` })
          : null,
        (r.panel.some((s) => s.memberId === seatId && s.memberId !== r.ownerId) && !r.readings.some((a) => a.assessorId === seatId))
          ? button('Record reading', () => assessDialog(ctx, r, onDone), { testid: `dsn-assess-${r.id}` })
          : null
      ]
    ) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'dsn-rows' },
    h('div', { class: 'row gap-s' },
      button('Declare a decision', () => declareDialog(ctx, onDone), { primary: true, testid: 'dsn-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.domainScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Overdue windows and stale readings re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'dsn-scan' })),
    table({
      caption: 'Declared decisions — who owns each one, which panel senses it, what domain the panel reads and whether the committed mode fits',
      columns,
      rows: report.rows.map((row) => ({ ...row, attrs: { 'data-testid': `dsn-row-${row.id}`, 'data-state': row.state } })),
      emptyMessage: 'No decision is declared yet. A cross-line panel states the domain on evidence, then the owner commits a mode.',
    }),
  );
}

function refusalsView(report) {
  const columns = [
    { label: 'Act', render: (r) => h('code', null, r.actId) },
    { label: 'Decision', render: (r) => h('code', null, r.decisionId) },
    { label: 'Kind', render: (r) => badge(r.kind, 'neutral') },
    { label: 'Refused because', render: (r) => h('span', null, r.reason) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'dsn-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'Every act the replay refused is counted and printed here with its reason. A second reading or commitment never overwrites the first — the refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    table({
      caption: 'Refused acts — append-only, counted, explained',
      columns,
      rows: report.refusals,
      emptyMessage: 'Nothing has been refused. Every act on the record replayed as valid.',
    }),
  );
}

function methodView() {
  const domainRows = DSN_DOMAINS.map((d) => h('tr', null,
    h('td', null, h('strong', null, d.label)),
    h('td', null, d.sequence),
    h('td', null, DOMAIN_EVIDENCE[d.key])));
  const fitRows = DSN_DOMAIN_KEYS.map((k) => h('tr', null,
    h('td', null, h('strong', null, DSN_DOMAINS.find((d) => d.key === k).label)),
    h('td', null, MODE_LABEL[DSN_FIT[k]])));
  return h('div', { class: 'stack', 'data-testid': 'dsn-method' },
    card({
      title: 'The five domains (Cynefin — Snowden & Boone, HBR 2007)',
      body: h('div', null,
        h('table', { class: 'striped' },
          h('thead', null, h('tr', null, h('th', null, 'Domain'), h('th', null, 'Decision sequence'), h('th', null, 'Evidence a reading must carry'))),
          h('tbody', null, ...domainRows)))}),
    card({
      title: 'Committed mode vs agreed domain (fit map)',
      body: h('div', null,
        h('table', { class: 'striped' },
          h('thead', null, h('tr', null, h('th', null, 'Agreed domain'), h('th', null, 'The one mode that fits'))),
          h('tbody', null, ...fitRows)),
        h('p', { class: 'small muted' }, 'One mode per domain by construction: a mode that fits two domains would let an owner pick the reading after the fact.'))
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...DSN_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...DSN_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...DSN_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderDomainSense(ctx) {
  const report = ctx.api.domainSenseReport ? ctx.api.domainSenseReport() : null;
  if (!report || report.counts === undefined) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Director / VP · single-chain and matrix', title: 'Decision-domain sensing', subtitle: 'The panel senses the domain; the owner commits the mode; the fit is read, never enforced.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  ctx.domainSensePanel = ctx.api.domainSensePanelCandidates ? ctx.api.domainSensePanelCandidates() : null;
  ctx.domainSenseCandidates = ctx.domainSensePanel || [];
  ctx.seatId = (ctx.state?.settings?.activeSeatId || null);
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'rows';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'domain-sense-panel' },
    pageHeader({
      eyebrow: 'Director / VP · single-chain and matrix',
      title: 'What kind of decision is this, and who says so?',
      subtitle: 'A decision declares a panel on declared lines; each member states the domain with evidence matched to it; the owner commits a mode, read for fit against the agreed domain and never enforced. Quorum is two readings from two distinct lines; agreement is unanimity, never majority.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'rows' ? report.rows.length : row.key === 'refusals' ? report.refusals.length : undefined,
      })),
      active: view,
      ariaLabel: 'Decision-domain sensing views',
      onSelect: (key) => ctx.navigate(`${DSN_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, onDone) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderDomainSense;
