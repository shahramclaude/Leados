/** ADR-0087: Value Stream Exchange — lateral SLA, CPM and capital carryover. */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import { pageHeader, card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { dayKey } from '../core/time.js';
import { VALUE_STREAM_PANELS } from '../core/domain/valueStreamRegistry.js';

const fmt = (v, suffix = '') => v === null || v === undefined ? '[UNVERIFIED]' : `${v}${suffix}`;
const tone = (s) => ({ agreed: 'good', met: 'good', fulfilled: 'good', breached: 'bad', missed: 'bad', countered: 'caution', open: 'caution', proposed: 'neutral' }[s] || 'neutral');
const panelFor = (query) => VALUE_STREAM_PANELS.includes(query?.get?.('panel')) ? query.get('panel') : 'network';
const input = (label, opts = {}) => h('input', { class: 'input', 'aria-label': label, ...opts });
const select = (label, options, opts = {}) => h('select', { class: 'input', 'aria-label': label, ...opts },
  ...options.map(([value, text]) => h('option', { value }, text)));
const field = (label, node) => h('label', { class: 'field' }, h('span', null, label), node);
const button = (label, onClick, kind = 'btn-secondary') => h('button', { class: `btn ${kind}`, type: 'button', onClick }, label);

/** Also accepts `(report, {preview, previewDigest})` for pure render tests. */
export function renderValueStream(ctxOrReport, directOptions = {}) {
  const direct = Boolean(ctxOrReport?.engineVersion);
  const ctx = direct ? null : ctxOrReport;
  const report = direct ? ctxOrReport : ctx.api.valueStreamRead();
  const panel = direct ? 'network' : panelFor(ctx.query);
  const state = direct ? { people: [], strategyBets: [], budgets: [], catchballPacts: [] } : ctx.state;
  const now = direct ? new Date(`${report.today}T12:00:00.000Z`) : (ctx.now instanceof Date ? ctx.now : new Date());
  const activePeople = (state.people || []).filter((p) => p.status !== 'archived');
  const activeBets = (state.strategyBets || []).filter((b) => b.status !== 'retired');
  const activeBudgets = (state.budgets || []).filter((b) => b.status === 'active');
  const playbook = report.playbook.find((p) => p.key === report.seat.altitudeKey) || null;
  const run = (result, success) => {
    toast(result?.ok ? success : (result?.error || 'Command refused.'), result?.ok ? 'good' : 'bad');
    if (result?.ok && ctx) ctx.refresh();
    return result;
  };
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Value Stream sections' },
    ...VALUE_STREAM_PANELS.map((key) => h('a', { class: `tab ${key === panel ? 'active' : ''}`, href: `#/valuestream?panel=${key}`,
      ...(key === panel ? { 'aria-current': 'page' } : {}) }, ({ network: 'Network & CPM', contracts: 'Peer contracts', carryover: 'Stop-rule carryover', rollup: 'Altitude roll-up', brief: 'Brief & method' })[key])));

  function contractForm() {
    if (!ctx || report.detailWithheld) return null;
    const title = input('Peer contract title', { value: 'Validated hand-off', maxlength: '180' });
    const supplier = select('Supplier span', activePeople.map((p) => [p.id, `${p.name} · ${p.role || p.level || 'span'}`]), { value: report.seat.id });
    const consumer = select('Consumer span', activePeople.map((p) => [p.id, `${p.name} · ${p.role || p.level || 'span'}`]));
    const bet = select('Strategy bet', [['', 'No strategy link'], ...activeBets.map((b) => [b.id, b.title])]);
    const metric = input('SLA metric', { value: 'Validated increments', maxlength: '140' });
    const unit = input('SLA unit', { value: 'increments', maxlength: '40' });
    const direction = select('SLA direction', [['at-least', 'At least (minimum service)'], ['at-most', 'At most (maximum latency/defects)']]);
    const target = input('SLA target', { type: 'number', min: '0.01', step: '1', value: '10' });
    const effort = input('Supplier effort person-days', { type: 'number', min: '0', max: '365', step: '0.5', value: '2' });
    const lead = input('Lead time days', { type: 'number', min: '0.5', max: '365', step: '0.5', value: '5' });
    const start = input('SLA start date', { type: 'date', value: report.today });
    const due = input('SLA due date', { type: 'date', value: report.today });
    const note = input('Peer contract rationale', { value: 'Downstream customer need and supplier capacity are explicit.', maxlength: '400' });
    const submit = () => run(ctx.api.valueStreamContractPropose({
      title: title.value, summary: note.value, supplierSeatId: supplier.value, consumerSeatId: consumer.value,
      strategyBetId: bet.value || null, metric: metric.value, unit: unit.value, direction: direction.value,
      target: Number(target.value), actual: 0, effortDays: Number(effort.value), leadTimeDays: Number(lead.value),
      startsOn: start.value || null, dueOn: due.value || null,
    }), 'Peer SLA proposed; both reporting branches rolled up through the LCA-mediated spine.');
    return card({ title: 'Propose a lateral supplier–customer SLA', subtitle: 'The active seat must be one party. The lowest common ancestor mediates; vertical deployment stays in Catchball.',
      body: h('div', { class: 'stack' }, h('div', { class: 'form-grid' },
        field('Title', title), field('Supplier', supplier), field('Consumer', consumer), field('Strategy bet', bet),
        field('Metric', metric), field('Unit', unit), field('Direction', direction), field('Target', target),
        field('Effort (person-days)', effort), field('Lead time (days)', lead), field('Starts', start), field('Due', due)),
      field('Customer need / capacity rationale', note), h('div', { class: 'row' }, button('Propose peer contract', submit, 'btn-primary'))) });
  }

  function actionModal(contract, kind) {
    if (!ctx) return;
    const isCheckin = kind === 'checkin'; const isCounter = kind === 'counter'; const isSettle = kind === 'settle';
    const actual = input('SLA actual', { type: 'number', min: '0', step: '1', value: String(contract.actual ?? 0) });
    const target = input('Counter SLA target', { type: 'number', min: '0.01', step: '1', value: String(contract.target) });
    const effort = input('Counter effort days', { type: 'number', min: '0', step: '0.5', value: String(contract.effortDays) });
    const lead = input('Counter lead time days', { type: 'number', min: '0.5', step: '0.5', value: String(contract.leadTimeDays) });
    const due = input('Counter due date', { type: 'date', value: contract.dueOn || report.today });
    const outcome = select('Consumer settlement outcome', [['fulfilled', 'Fulfilled — directional target met'], ['missed', 'Missed — directional target not met']]);
    const note = h('textarea', { class: 'input', rows: '3', 'aria-label': 'Evidence or negotiation note' }, isCounter ? 'Capacity-priced counter-offer.' : 'Evidence reviewed by the responsible party.');
    const submit = () => {
      let result;
      if (isCheckin) result = ctx.api.valueStreamContractCheckin(contract.id, { actual: Number(actual.value), note: note.value });
      else if (isCounter) result = ctx.api.valueStreamContractCounter(contract.id, { target: Number(target.value), effortDays: Number(effort.value), leadTimeDays: Number(lead.value), dueOn: due.value || null, note: note.value });
      else if (isSettle) result = ctx.api.valueStreamContractSettle(contract.id, { outcome: outcome.value, note: note.value });
      else if (kind === 'accept') result = ctx.api.valueStreamContractAccept(contract.id, { note: note.value });
      else result = ctx.api.valueStreamContractWithdraw(contract.id, { note: note.value });
      if (result.ok) closeAllModals();
      run(result, `Peer contract ${kind} recorded; append-only round preserved.`);
    };
    openModal({ title: `${kind} · ${contract.title}`, description: 'Only the responsible party can submit. The mediator cannot consent, report supplier actuals or verify consumer receipt.',
      body: h('div', { class: 'stack' }, isCheckin ? field('Actual', actual) : null,
        isCounter ? h('div', { class: 'form-grid' }, field('Target', target), field('Effort', effort), field('Lead time', lead), field('Due', due)) : null,
        isSettle ? field('Outcome', outcome) : null, field('Evidence / note', note)),
      footer: [button('Cancel', closeAllModals, 'btn-ghost'), button(`Record ${kind}`, submit, 'btn-primary')] });
  }

  function networkPanel() {
    const n = report.network;
    return h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Active peer contracts', value: fmt(report.totals.active), hint: 'Supplier → consumer; small cells suppressed above director' }),
        stat({ label: 'Open bilateral negotiations', value: fmt(report.totals.openNegotiations), hint: 'Silence and ancestor override are not consent' }),
        stat({ label: 'Overdue SLA breaches', value: fmt(report.totals.breached), hint: 'Directional actual vs target after due date', tone: report.totals.breached > 0 ? 'bad' : '' }),
        stat({ label: 'CPM critical path', value: fmt(n.criticalPathDays, ' days'), hint: 'Kelley–Walker longest lead-time path on agreed DAG', tone: n.cycleDetected ? 'bad' : '' })),
      n.refusal ? banner({ tone: 'warning', title: 'Network measurement refusal', body: n.refusal }) : null,
      card({ title: 'Supplier → consumer critical-path network', subtitle: 'Slack 0 marks the critical path. Downstream count is the actual directed blast radius, not a simulated probability.',
        body: table({ caption: 'Peer value-stream edges with lead time, SLA state, slack and downstream exposure',
          rows: n.edges, emptyMessage: 'No agreed peer SLA edges in this scope. Propose a contract on the Peer contracts tab.',
          columns: [
            { label: 'Supplier', render: (e) => e.supplierLabel }, { label: 'Consumer', render: (e) => e.consumerLabel },
            { label: 'Lead time', render: (e) => `${e.leadTimeDays}d` }, { label: 'SLA', render: (e) => badge(e.serviceState, tone(e.serviceState)) },
            { label: 'Slack', render: (e) => fmt(e.slackDays, 'd') },
            { label: 'Downstream', render: (e) => `${e.downstreamContractIds.length} contract(s)` },
            { label: 'Path', render: (e) => n.criticalPathContractIds.includes(e.id) ? badge('critical', 'bad') : `${e.slackDays ?? '—'}d float` },
          ] }) }),
      card({ title: 'Cross-altitude roll-up — drill from span to the same records', subtitle: 'Counts and effort derive from the shared reporting tree. Withheld cells are [UNVERIFIED], never zero.',
        body: table({ caption: 'Value-stream roll-up by reporting span', rows: report.spanRollup,
          columns: [{ label: 'Span', render: (r) => r.label }, { label: 'Altitude', render: (r) => r.altitudeKey || '—' },
            { label: 'Contracts', render: (r) => fmt(r.contractCount) }, { label: 'Active', render: (r) => fmt(r.activeCount) },
            { label: 'Breached', render: (r) => fmt(r.breachedCount) }, { label: 'Effort', render: (r) => fmt(r.effortDays, 'd') }] }) }));
  }

  function contractsPanel() {
    const rows = report.contracts.map((c) => card({
      title: `${c.title} · ${c.status}`,
      subtitle: `${c.supplierLabel} → ${c.consumerLabel} · LCA mediator ${c.mediatorLabel}`,
      actions: [badge(c.serviceState, tone(c.serviceState))],
      body: h('div', { class: 'stack' },
        h('p', null, `${c.direction} ${c.target} ${c.unit}; actual ${fmt(c.actual)} · ${c.effortDays} person-days · ${c.leadTimeDays}d lead · due ${c.dueOn || '[UNVERIFIED]'}.`),
        c.awaitingConsentSeatId ? h('p', { class: 'muted' }, `Awaiting consent from ${c.awaitingConsentSeatId === c.supplierSeatId ? 'supplier' : 'consumer'}; round ${c.roundCount}.`) : null,
        h('div', { class: 'row' },
          c.awaitingConsentSeatId ? button('Accept terms', () => actionModal(c, 'accept'), 'btn-primary') : null,
          c.awaitingConsentSeatId ? button('Counter', () => actionModal(c, 'counter')) : null,
          c.status === 'agreed' ? button('Record supplier actual', () => actionModal(c, 'checkin')) : null,
          c.status === 'agreed' ? button('Verify settlement', () => actionModal(c, 'settle')) : null,
          !['settled', 'withdrawn'].includes(c.status) ? button('Withdraw', () => actionModal(c, 'withdraw'), 'btn-ghost') : null),
        h('details', null,
          h('summary', null, `${c.rounds.length} immutable round(s)`),
          h('ol', null, ...c.rounds.map((r) => h('li', null,
            `#${r.roundNumber} ${r.kind} · ${r.recordedOn} · target ${fmt(r.target)} · actual ${fmt(r.actual)} · ${r.note || 'No note'}`))))),
    }));
    return h('div', { class: 'stack' }, contractForm(), card({
      title: 'Bilateral peer-contract ledger',
      subtitle: 'Rounds are append-only. Supplier actuals and consumer settlement are separate evidence acts.',
      body: report.contracts.length
        ? h('div', { class: 'stack' }, ...rows)
        : emptyState({ title: report.detailWithheld ? 'Contract bodies withheld at this altitude' : 'No peer contracts in this party/span scope', body: report.withheldReason || 'A peer may propose only a contract in which they are supplier or consumer.' }),
    }));
  }

  function carryoverPanel() {
    let preview = directOptions.preview || null; let previewDigest = directOptions.previewDigest || null;
    const invalidated = (state.catchballPacts || []).filter((p) => p.status === 'settled' && p.gradedOutcome === 'thesis-invalidated');
    const consumed = new Set((state.valueStreamReallocations || []).flatMap((r) => r.sourceLines.map((s) => s.sourcePactId)));
    const eligible = invalidated.filter((p) => !consumed.has(p.id));
    const title = input('Receiving pact title', { value: 'Next-cycle recovery pact' });
    const receiver = select('Receiving span', activePeople.map((p) => [p.id, `${p.name} · ${p.role || p.level || 'span'}`]));
    const bet = select('Receiving strategy bet', activeBets.map((b) => [b.id, b.title]));
    const budget = select('Receiving budget', activeBudgets.map((b) => [b.id, `${b.name} · ${b.currency}`]));
    const amount = input('Receiving budget amount', { type: 'number', min: '0', step: '50', value: '0' });
    const effort = input('Receiving effort days', { type: 'number', min: '0', step: '0.5', value: '0' });
    const start = input('Receiving pact start', { type: 'date', value: report.today });
    const due = input('Receiving pact due', { type: 'date', value: report.today });
    const rationale = h('textarea', { class: 'input', rows: '3', 'aria-label': 'Reviewed stop-rule rationale' }, 'The thesis was falsified; move only measured remaining authority to the surviving bet.');
    const sourceBoxes = eligible.map((p) => ({ pact: p, node: h('input', { type: 'checkbox', value: p.id, 'aria-label': `Source ${p.title}` }) }));
    const previewBox = h('div', { role: 'status', 'aria-live': 'polite', class: 'stack' }, 'Select sources and terms, then run the non-mutating preview.');
    const payload = () => ({
      sourcePactIds: sourceBoxes.filter((s) => s.node.checked).map((s) => s.pact.id), title: title.value,
      summary: rationale.value, toSeatId: receiver.value, strategyBetId: bet.value, budgetId: budget.value || null,
      currency: activeBudgets.find((b) => b.id === budget.value)?.currency || null,
      resourceAskAmount: Number(amount.value) || 0, effortDays: Number(effort.value) || 0,
      startsOn: start.value, dueOn: due.value, rationale: rationale.value,
    });
    const showPreview = (p) => {
      previewBox.replaceChildren();
      if (!p) { previewBox.textContent = 'No valid preview. Correct the refusal shown above.'; return; }
      previewBox.append(
        h('div', { class: 'stat-grid' }, stat({ label: 'Released budget', value: `${p.releasedBudgetAmount} ${p.currency}` }),
          stat({ label: 'Receiving planned pipeline', value: `${p.allocatedBudgetAmount} ${p.currency}` }),
          stat({ label: 'Released effort', value: `${p.releasedEffortDays}d` }), stat({ label: 'Unallocated', value: `${p.unallocatedBudgetAmount} ${p.currency} · ${p.unallocatedEffortDays}d` })),
        h('p', null, p.boundary), ...p.warnings.map((w) => banner({ tone: 'warning', title: 'Evidence boundary', body: w })),
        h('p', { class: 'muted' }, `Preview digest ${previewDigest} · receiving load ${p.receivingFeasibility.band}; re-preview after any source, actual, terms or budget change.`));
    };
    const doPreview = () => {
      if (!ctx) { showPreview(preview); return preview; }
      const result = ctx.api.valueStreamReallocationPreview(payload());
      if (!result.ok) { preview = null; previewDigest = null; previewBox.textContent = result.error; toast(result.error, 'bad'); return null; }
      preview = result.preview; previewDigest = result.digest; showPreview(preview); return preview;
    };
    const commit = () => {
      if (!ctx) return;
      const current = doPreview(); if (!current) return;
      run(ctx.api.valueStreamReallocate({ ...payload(), expectedDigest: previewDigest }), 'Carryover committed atomically: sources released, immutable receipt written, receiving pact proposed.');
    };
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Stop rule → governed capital movement, not auto-consent', body: 'Only settled thesis-invalidated pacts with open committed lines qualify. Spent actuals and grades never move. Unknown actual effort releases zero person-days. Commit creates a proposed receiving Catchball pact.' }),
      report.seat.rank < 4 && !report.seat.fullAccess ? banner({ tone: 'warning', title: 'Capital right withheld', body: 'Peer parties can negotiate SLAs here, but carryover requires the existing VP/executive or chief capital-allocation right.' }) : null,
      card({ title: '1 · Select invalidated source pacts', subtitle: 'A consumed source can never be selected again; the append-only receipt is the double-spend guard.',
        body: eligible.length ? h('div', { class: 'stack' }, ...sourceBoxes.map(({ pact, node }) => h('label', { class: 'check-row' }, node,
          h('span', null, `${pact.title} · planned ${pact.effortDays}d · actual ${fmt(p.effortActualDays, 'd')} · ${p.resourceAskAmount ?? 0} ${p.currency || ''}`)))) : emptyState({ title: 'No unused thesis-invalidated sources', body: 'Missed execution, spent lines, released lines and previously carried-over pacts do not qualify.' }) }),
      ctx ? card({ title: '2 · Price the receiving next-cycle proposal', subtitle: 'No currency conversion, no excess effort, no receiving commitment before consent.',
        body: h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, field('Title', title), field('Receiving span', receiver), field('Surviving bet', bet), field('Receiving budget', budget), field('Amount', amount), field('Effort', effort), field('Starts', start), field('Due', due)),
          field('Reviewed stop-rule rationale', rationale), h('div', { class: 'row' }, button('Run non-mutating preview', doPreview), button('Preview + commit carryover', commit, 'btn-primary')), previewBox) }) : null,
      directOptions.preview ? card({ title: 'Reviewed carryover preview', body: (preview = directOptions.preview, previewDigest = directOptions.previewDigest, showPreview(preview), previewBox) }) : null,
      card({ title: 'Immutable carryover receipts', subtitle: 'Receipt rows are never edited to follow the receiving pact; drill into that pact for its current consent state.',
        body: table({ caption: 'Stop-rule carryover receipts', rows: report.reallocations, emptyMessage: 'No carryover receipts in this scope.',
          columns: [{ label: 'Receiving proposal', render: (r) => r.title }, { label: 'Released', render: (r) => `${r.releasedBudgetAmount} ${r.currency || ''} · ${r.releasedEffortDays}d` },
            { label: 'Proposed', render: (r) => `${r.allocatedBudgetAmount} ${r.currency || ''} · ${r.allocatedEffortDays}d` },
            { label: 'Unallocated', render: (r) => `${r.unallocatedBudgetAmount} ${r.currency || ''} · ${r.unallocatedEffortDays}d` },
            { label: 'Evidence', render: (r) => r.effortActualsComplete ? 'actual effort complete' : badge('effort [UNVERIFIED]', 'caution') },
            { label: 'Lineage', render: (r) => h('a', { href: `#/catchball?panel=workbench&pact=${encodeURIComponent(r.targetPactId)}` }, 'Open proposed receiving pact') }] }) }));
  }

  function rollupPanel() {
    return h('div', { class: 'stack' },
      card({ title: 'Five altitudes, one propagation engine', subtitle: 'Same contracts, same reporting tree, different duties and disclosure. No re-entry or parallel executive ledger.',
        body: h('div', { class: 'stack' }, ...report.playbook.map((p) => h('section', { class: 'card' },
          h('h2', null, `${p.label} · ${p.horizonDays}d`), h('p', null, p.duty), h('p', null, p.question),
          h('p', { class: 'muted' }, `${p.disclosure} Action: ${p.action}`)) )) }),
      networkPanel());
  }

  function briefPanel() {
    const brief = ctx ? ctx.api.valueStreamBriefText() : '# Value Stream Exchange\n\nIdentity-free aggregate brief; unknown and withheld figures remain [UNVERIFIED].';
    const downloadBrief = () => { if (!ctx) return; const ok = downloadText({ filename: `leados-value-stream-${dayKey(now)}.md`, text: brief, mime: 'text/markdown;charset=utf-8' }); toast(ok ? 'Brief downloaded.' : 'Download unavailable.', ok ? 'good' : 'warn'); };
    const exportCsv = () => {
      if (!ctx) return; const rows = ctx.api.valueStreamCsvRows();
      const ok = downloadText({ filename: `leados-value-stream-${dayKey(now)}.csv`, text: serializeCsv(Object.keys(rows[0]), rows), mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'Aggregate-only CSV (#80) downloaded.' : 'Download unavailable.', ok ? 'good' : 'warn');
    };
    return h('div', { class: 'stack' },
      card({ title: 'Identity-free operating brief', actions: [button('Download Markdown', downloadBrief), button('Export aggregate CSV', exportCsv)],
        body: h('pre', { class: 'brief-text', tabindex: '0' }, brief) }),
      card({ title: 'Named methods and explicit limits', body: h('div', { class: 'stack' },
        h('p', null, 'Hoshin Catchball (vertical negotiated deployment) is joined to supplier–customer SLAs (horizontal value flow). Jaques time-span assigns different work to frontline, manager, director, executive and chief seats; the lowest common ancestor mediates rather than bypasses either party.'),
        h('p', null, 'Kelley–Walker Critical Path Method computes longest directed lead time and slack. Cycles return [UNVERIFIED]. Little’s Law and Goldratt’s constraint logic motivate inspecting hand-offs, but no WIP or throughput estimate is invented where the records do not contain it.'),
        h('p', null, 'Finance: committed authority is part of forecast-at-completion; planned carryover remains pipeline until receiver acceptance. Release does not alter spent actuals. A 64-bit FNV preview digest detects staleness; it is not a cryptographic signature or authentication mechanism.'),
        h('p', null, 'Local browser seats are workflow/disclosure boundaries, NOT authenticated multi-user security. No SLA is a person score. Small cells, unknown actuals and withheld network paths are labelled [UNVERIFIED].')) }));
  }

  const body = panel === 'contracts' ? contractsPanel() : panel === 'carryover' ? carryoverPanel() : panel === 'rollup' ? rollupPanel() : panel === 'brief' ? briefPanel() : networkPanel();
  return h('div', { class: 'page value-stream-page' },
    pageHeader({ eyebrow: `Session 127 · Schema v93 · ${report.seat.label}`, title: 'Value Stream Exchange',
      subtitle: playbook ? `${playbook.duty} ${playbook.question}` : 'Peer supplier–customer commitments, critical-path flow and reviewed stop-rule capital carryover.',
      actions: ctx ? [button('Run spine scan', () => run(ctx.api.valueStreamScan(), 'Value Stream spine reconciled.'), 'btn-ghost')] : [],
      meta: h('span', null, `${report.disclosureMode} · ${report.engineVersion}`) }),
    report.withheldReason ? banner({ tone: 'info', title: 'Aggregate disclosure active', body: report.withheldReason }) : null,
    report.seat.altitudeKey === 'director' ? h('p', { class: 'muted' }, 'Your mediator job: mediate the two parties and own recovery governance; never consent for them.') : null,
    nav, body);
}
