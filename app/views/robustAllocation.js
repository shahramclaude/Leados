/**
 * app/views/robustAllocation.js — `#/robust-allocation`, the Robust Allocation
 * Terminal (ADR-0095).
 *
 * Five panels, five different questions at five altitudes:
 *   Desk         "What should I model at this altitude, and what is withheld?"
 *   Plans        "Which allocations are funded, falsified, overdue or ungraded?"
 *   Solve        "What is the robust plan, the regret plan, and the price of fairness?"
 *   Roll-up      "What does the altitude above read, with what interval and refusal?"
 *   Certificate  "What can travel upward without naming a person or a plan?"
 *
 * Nothing on this screen rates a person, asserts causality or sends anything to
 * anyone. A title is shown only to the altitude that declared the plan.
 */
import { h, toast, openModal, uid } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey } from '../core/time.js';
import { ROBUST_ALLOCATION_ALTITUDE_HORIZONS, ROBUST_ALLOCATION_LIMITS } from '../core/domain/robustAllocationRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'plans', label: 'Plans' },
  { key: 'solve', label: 'Solve' },
  { key: 'rollup', label: 'Roll-up' },
  { key: 'certificate', label: 'Certificate' },
];

const CSV_COLUMNS = [
  'row_kind', 'altitude', 'rank', 'plans_n', 'adopted_n', 'funded_lines_n',
  'committed_hours', 'falsified_n', 'overdue_n', 'ungraded_n',
  'falsified_pct', 'interval_low_pct', 'interval_high_pct', 'refused', 'reason',
];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/robust-allocation?panel=${panel}${extra}`);
const blank = (value) => (value === null || value === undefined ? '—' : String(value));

const STATE_META = {
  draft: { label: 'Draft', tone: 'neutral', hint: 'Solved live; not yet adopted. No governed work exists.' },
  adopted: { label: 'Adopted', tone: 'good', hint: 'Frozen solution; governed delivery work is open.' },
  falsified: { label: 'Falsified', tone: 'bad', hint: 'The linked pre-registered threshold was missed; a re-allocation decision is owed.' },
  overdue: { label: 'Overdue', tone: 'warn', hint: 'A funded line outlived the horizon; a delivery-integrity decision is owed.' },
  ungraded: { label: 'Ungraded', tone: 'warn', hint: 'The linked contract was never graded; an evidence-integrity decision is owed.' },
};

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The allocation action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function fallback(title, text, label) {
  openModal({
    title,
    body: h('textarea', { rows: 16, readonly: true, value: text, class: 'input', 'aria-label': label }),
  });
}

function exportCsv(ctx) {
  const result = ctx.api.robustAllocationCsvRows();
  if (!result.ok) return toast(result.error, 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-robust-allocation-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) fallback('Copy robust allocation CSV', text, 'Robust allocation CSV');
}

function exportBrief(ctx) {
  const result = ctx.api.robustAllocationBriefText();
  if (!result.ok) return toast(result.error, 'bad');
  const filename = `leados-robust-allocation-brief-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) fallback('Copy upward brief', result.text, 'Upward brief');
}

/* ------------------------------------------------------- declare dialog */

function segmentRow(seg = {}) {
  const key = h('input', { class: 'input', type: 'text', value: seg.key || '', placeholder: 'key', 'aria-label': 'Segment key', maxLength: '40' });
  const label = h('input', { class: 'input', type: 'text', value: seg.label || '', placeholder: 'Segment label', 'aria-label': 'Segment label', maxLength: '80' });
  const size = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: String(seg.size ?? ''), placeholder: 'size', 'aria-label': 'Segment size' });
  const floor = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(seg.floorCoverage ?? 0), placeholder: 'floor', 'aria-label': 'Equity floor coverage' });
  const row = h('div', { class: 'grid grid-4 ral-row' }, key, label, size, floor,
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', 'aria-label': 'Remove segment', onClick: () => row.remove() }, '✕'));
  row._read = () => ({ key: key.value, label: label.value, size: Number(size.value), floorCoverage: Number(floor.value) });
  return row;
}

function actionRow(act = {}, segments = []) {
  const key = h('input', { class: 'input', type: 'text', value: act.key || '', placeholder: 'key', 'aria-label': 'Action key', maxLength: '40' });
  const label = h('input', { class: 'input', type: 'text', value: act.label || '', placeholder: 'Intervention label', 'aria-label': 'Action label', maxLength: '80' });
  const seg = h('select', { class: 'input', 'aria-label': 'Target segment' },
    ...segments.map((s) => h('option', { value: s.key, ...(s.key === act.segmentKey ? { selected: true } : {}) }, s.label || s.key)));
  const cost = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(act.unitCost ?? ''), placeholder: 'cost/unit', 'aria-label': 'Cost per unit' });
  const hours = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(act.unitHours ?? ''), placeholder: 'hours/unit', 'aria-label': 'Hours per unit' });
  const coverage = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: String(act.unitCoverage ?? 1), placeholder: 'coverage/unit', 'aria-label': 'Coverage per unit' });
  const lo = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(act.effectLo ?? ''), placeholder: 'effect lo', 'aria-label': 'Effect lower bound' });
  const hi = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(act.effectHi ?? ''), placeholder: 'effect hi', 'aria-label': 'Effect upper bound' });
  const maxUnits = h('input', { class: 'input', type: 'number', min: '1', max: String(ROBUST_ALLOCATION_LIMITS.unitsMax), step: '1', value: String(act.maxUnits ?? 3), placeholder: 'max units', 'aria-label': 'Maximum units' });
  const row = h('div', { class: 'ral-action-row' },
    h('div', { class: 'grid grid-3' }, key, label, seg),
    h('div', { class: 'grid grid-3' }, cost, hours, coverage),
    h('div', { class: 'grid grid-3' }, lo, hi, maxUnits),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', 'aria-label': 'Remove action', onClick: () => row.remove() }, 'Remove action'));
  row._read = () => ({
    key: key.value, label: label.value, segmentKey: seg.value,
    unitCost: Number(cost.value), unitHours: Number(hours.value), unitCoverage: Number(coverage.value),
    effectLo: Number(lo.value), effectHi: Number(hi.value), maxUnits: Number(maxUnits.value),
  });
  row._refreshSegments = (nextSegments) => {
    const current = seg.value;
    seg.replaceChildren(...nextSegments.map((s) => h('option', { value: s.key, ...(s.key === current ? { selected: true } : {}) }, s.label || s.key)));
  };
  return row;
}

function openDeclareDialog(ctx, report) {
  const title = h('input', { class: 'input', type: 'text', maxLength: '120', placeholder: 'One short line naming the allocation', 'aria-label': 'Name the allocation' });
  const outcomeLabel = h('input', { class: 'input', type: 'text', maxLength: '80', placeholder: 'e.g. on-time completions', 'aria-label': 'Outcome unit' });
  const currency = h('input', { class: 'input', type: 'text', maxLength: '3', value: 'EUR', placeholder: 'EUR', 'aria-label': 'Currency code' });
  const budgetCap = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '1000', 'aria-label': 'Budget cap' });
  const hoursCap = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '40', 'aria-label': 'Leadership hours cap' });
  const defaultHorizon = ROBUST_ALLOCATION_ALTITUDE_HORIZONS[report.seat.altitudeKey] || 30;
  const horizonDays = h('input', { class: 'input', type: 'number', min: '7', max: '365', step: '1', value: String(defaultHorizon), 'aria-label': 'Horizon in days' });
  const gamma = h('input', { class: 'input', type: 'number', min: '0', max: String(ROBUST_ALLOCATION_LIMITS.actionsMax), step: '1', value: '1', 'aria-label': 'Uncertainty budget gamma' });

  const segContainer = h('div', { class: 'stack' });
  const actContainer = h('div', { class: 'stack' });
  const readSegments = () => [...segContainer.children].map((r) => r._read()).filter((s) => s.key);
  const refreshActionSegments = () => {
    const segs = readSegments();
    for (const row of actContainer.children) row._refreshSegments(segs);
  };
  const addSeg = (seg) => { const row = segmentRow(seg); segContainer.append(row); refreshActionSegments(); };
  const addAct = (act) => { actContainer.append(actionRow(act, readSegments())); };
  segContainer.addEventListener('input', refreshActionSegments);

  // One honest empty row each to start; the leader declares the ranges.
  addSeg({ key: 'seg-a', label: '', size: '', floorCoverage: 0 });
  addAct({});

  const contracts = (ctx.api.prospectiveRead?.().rows || []).filter((r) => r && r.id);
  const linked = h('select', { class: 'input', 'aria-label': 'Linked prospective contract (optional)' },
    h('option', { value: '' }, 'None — no pre-registered premise linked'),
    ...contracts.map((c) => h('option', { value: c.id }, `${c.instrumentLabel} · ${c.declaredOn}`)));

  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Declare draft');

  const body = h('form', {
    class: 'stack',
    onSubmit: (event) => {
      event.preventDefault();
      submit.disabled = true;
      const result = ctx.api.robustAllocationDeclare({
        title: title.value,
        outcomeLabel: outcomeLabel.value,
        currency: currency.value,
        budgetCap: Number(budgetCap.value),
        hoursCap: Number(hoursCap.value),
        horizonDays: Number(horizonDays.value),
        gamma: Number(gamma.value),
        segments: readSegments(),
        actions: [...actContainer.children].map((r) => r._read()),
        linkedContractId: linked.value || null,
      });
      if (!result.ok) {
        status.textContent = result.error;
        submit.disabled = false;
        return;
      }
      dialog.close();
      notify(result, 'Draft declared and feasibility verified. Open Solve to review the robust plan, then adopt it.');
      ctx.navigate(`#/robust-allocation?panel=solve&plan=${encodeURIComponent(result.id)}`);
      ctx.refresh();
    },
  },
    banner({ tone: 'info', title: 'Declare ranges, not point forecasts', body: 'Each intervention has an effect range [lo, hi]. Γ is how many ranges may sit at their worst end at once. The solver prints the best worst case (Wald) and the smallest largest regret (Savage), and refuses an infeasible or over-cap plan instead of approximating.' }),
    h('label', { class: 'field' }, h('span', null, 'Name'), title),
    h('div', { class: 'grid grid-2' },
      h('label', { class: 'field' }, h('span', null, 'Outcome unit'), outcomeLabel),
      h('label', { class: 'field' }, h('span', null, 'Currency'), currency)),
    h('div', { class: 'grid grid-3' },
      h('label', { class: 'field' }, h('span', null, 'Budget cap'), budgetCap),
      h('label', { class: 'field' }, h('span', null, 'Hours cap'), hoursCap),
      h('label', { class: 'field' }, h('span', null, 'Horizon (days)'), horizonDays)),
    h('label', { class: 'field' }, h('span', null, 'Uncertainty budget Γ (0 = optimistic, n = full box)'), gamma),
    h('fieldset', { class: 'field' },
      h('legend', null, 'Segments (heterogeneous populations)'),
      h('p', { class: 'muted small' }, 'key · label · size · equity floor (minimum coverage). A floor is a hard constraint; its cost is printed as the price of fairness.'),
      segContainer,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => addSeg({}) }, '+ Add segment')),
    h('fieldset', { class: 'field' },
      h('legend', null, 'Candidate interventions'),
      h('p', { class: 'muted small' }, 'key · label · segment · cost/unit · hours/unit · coverage/unit · effect lo · effect hi · max units.'),
      actContainer,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => addAct({}) }, '+ Add action')),
    h('label', { class: 'field' }, h('span', null, 'Link a pre-registered premise (optional)'), linked),
    status,
    h('div', { class: 'form-actions' }, submit),
  );

  const dialog = openModal({
    title: 'Declare a robust allocation',
    description: 'The ranges and constraints are assumptions you declare. The solution is exact integer arithmetic, never a sampled forecast.',
    body,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel')],
    size: 'lg',
  });
}

function openConventionDialog(ctx, report, key) {
  const config = {
    cellFloor: { label: 'Roll-up cell floor', min: 2, max: 20, value: report.conventions.robustAllocationCellFloor },
    reviewDays: { label: 'Review window (days)', min: 1, max: 90, value: report.conventions.robustAllocationReviewDays },
    maxCombinations: { label: 'Exact-solver bound (combinations)', min: 1000, max: 50000, value: report.conventions.robustAllocationMaxCombinations },
  }[key];
  const input = h('input', { class: 'input', type: 'number', min: String(config.min), max: String(config.max), step: '1', value: String(config.value), 'aria-label': config.label });
  const dialog = openModal({
    title: `Set ${config.label.toLowerCase()}`,
    description: 'These conventions bound what every altitude below reads. They are set at director rank and above.',
    body: h('label', { class: 'field' }, h('span', null, config.label), input),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.robustAllocationSetConventions({ [key]: Number(input.value) });
          dialog.close();
          if (notify(result, `${config.label} set.`)) ctx.refresh();
        },
      }, 'Save'),
    ],
    size: 'sm',
  });
}

/* ------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const { playbook, summary, seat } = report;
  const actions = [
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareDialog(ctx, report) }, 'Declare allocation'),
    h('button', {
      class: 'btn', type: 'button',
      onClick: () => {
        const result = ctx.api.robustAllocationScan();
        if (notify(result, 'Scanned adopted allocations for falsified, overdue and ungraded premises.')) ctx.refresh();
      },
    }, 'Scan premises'),
  ];
  const conventionButtons = seat.rank >= 3 ? card({
    title: 'Conventions (director+)',
    subtitle: 'These bound what every altitude below reads.',
    body: h('div', { class: 'grid grid-3' },
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => openConventionDialog(ctx, report, 'cellFloor') }, `Cell floor: ${report.conventions.robustAllocationCellFloor}`),
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => openConventionDialog(ctx, report, 'reviewDays') }, `Review: ${report.conventions.robustAllocationReviewDays}d`),
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => openConventionDialog(ctx, report, 'maxCombinations') }, `Solver bound: ${report.conventions.robustAllocationMaxCombinations}`)),
  }) : null;
  return h('div', { class: 'stack' },
    card({
      title: playbook.title,
      subtitle: `${playbook.horizon} · ${playbook.question}`,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'See: '), playbook.see),
        h('p', null, h('strong', null, 'Act: '), playbook.act),
        h('p', null, h('strong', null, 'Hand up: '), playbook.hand),
        h('div', { class: 'form-actions' }, ...actions)),
    }),
    h('div', { class: 'grid grid-4' },
      stat({ label: 'Plans', value: summary.plans }),
      stat({ label: 'Adopted', value: summary.adopted, tone: 'good' }),
      stat({ label: 'Falsified', value: summary.falsified, tone: summary.falsified ? 'bad' : '' }),
      stat({ label: 'Open findings', value: summary.openFindings, tone: summary.openFindings ? 'warn' : '' })),
    conventionButtons,
    ...report.withheld.map((w) => banner({ tone: 'warn', title: `${w.n} figure(s) withheld`, body: w.reason })),
    card({ title: 'What this screen is', body: h('p', { class: 'muted' }, report.premise) }),
  );
}

function plansPanel(ctx, report) {
  if (!report.rows.length) {
    return emptyState({ title: 'No allocations yet', body: 'Declare a draft to model your budget, hours and effect ranges under uncertainty.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareDialog(ctx, report) }, 'Declare allocation') });
  }
  const columns = [
    { label: 'Plan', render: (r) => h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => go(ctx, 'solve', `&plan=${encodeURIComponent(r.id)}`) }, r.title || 'Allocation (withheld)') },
    { label: 'Altitude', render: (r) => badge(r.altitudeKey || '—', 'neutral') },
    { label: 'State', render: (r) => badge(STATE_META[r.state]?.label || r.state, STATE_META[r.state]?.tone || 'neutral', STATE_META[r.state]?.hint || '') },
    { label: 'Γ', render: (r) => String(r.gamma) },
    { label: 'Actions', render: (r) => String(r.actionsN) },
    { label: 'Worst case', render: (r) => blank(r.robustWorstCase) },
    { label: 'Hours', render: (r) => blank(r.committedHours) },
    {
      label: '', render: (r) => (r.status === 'draft'
        ? h('button', {
          class: 'btn btn-small btn-primary', type: 'button',
          onClick: () => {
            const result = ctx.api.robustAllocationAdopt(r.id);
            if (notify(result, 'Adopted. Governed decision, delivery tasks and vertical roll-up written in one transaction.')) ctx.refresh();
          },
        }, 'Adopt')
        : null),
    },
  ];
  return card({ title: 'Allocation plans', subtitle: 'Select a plan to review its exact solution. Drafts solve live; adopted plans read their frozen vector.', body: table({ columns, rows: report.rows, caption: 'Allocation plans' }) });
}

function solvePanel(ctx, report) {
  const detail = report.selectedDetail;
  const sol = report.solution;
  if (!detail) {
    return emptyState({ title: 'No plan selected', body: 'Declare or select a plan to see its robust solution.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'plans') }, 'Go to plans') });
  }
  const header = card({
    title: detail.title || 'Allocation (title withheld)',
    subtitle: `${detail.outcomeLabel} · ${detail.currency} · Γ=${detail.gamma} · ${STATE_META[detail.state]?.label || detail.state}`,
    actions: detail.status === 'draft' ? [h('button', {
      class: 'btn btn-primary', type: 'button',
      onClick: () => {
        const result = ctx.api.robustAllocationAdopt(detail.id);
        if (notify(result, 'Adopted. Governed work and vertical roll-up written in one transaction.')) ctx.refresh();
      },
    }, 'Adopt this plan')] : [],
    body: h('div', { class: 'grid grid-3' },
      stat({ label: 'Budget cap', value: `${detail.budgetCap} ${detail.currency}` }),
      stat({ label: 'Hours cap', value: detail.hoursCap }),
      stat({ label: 'Segments', value: detail.segments.length })),
  });
  if (!sol || !sol.ok) {
    return h('div', { class: 'stack' }, header, banner({ tone: 'bad', title: 'Solve refused', body: sol?.reason || 'The plan could not be solved.' }));
  }
  const lineColumns = [
    { label: 'Intervention', render: (a) => a.label },
    { label: 'Segment', render: (a) => detail.segments.find((s) => s.key === a.segmentKey)?.label || a.segmentKey },
    { label: 'Range [lo, hi]', render: (a) => `[${a.effectLo}, ${a.effectHi}]` },
    { label: 'Robust units', render: (a) => h('strong', null, String(sol.robustUnits[detail.actions.indexOf(a)])) },
    { label: 'Regret units', render: (a) => String(sol.minimaxUnits[detail.actions.indexOf(a)]) },
    { label: 'Optimistic units', render: (a) => String(sol.optimisticUnits[detail.actions.indexOf(a)]) },
  ];
  const segColumns = [
    { label: 'Segment', render: (s) => s.label },
    { label: 'Size', render: (s) => String(s.size) },
    { label: 'Equity floor', render: (s) => String(s.floorCoverage) },
    { label: 'Robust coverage', render: (s) => String(detail.actions.reduce((sum, a, i) => sum + (a.segmentKey === s.key ? a.unitCoverage * sol.robustUnits[i] : 0), 0)) },
  ];
  const stressLabels = sol.stressSwitches.map((k) => detail.actions.find((a) => a.key === k)?.label || k);
  const topAction = detail.actions.find((a) => a.key === sol.topExposureAction);
  return h('div', { class: 'stack' },
    header,
    h('div', { class: 'grid grid-4' },
      stat({ label: 'Robust worst case', value: sol.robustWorstCase, tone: 'good', hint: 'Wald maximin at the declared Γ' }),
      stat({ label: 'Robust optimistic', value: sol.robustOptimistic, hint: 'Same plan, all ranges at their best end' }),
      stat({ label: 'Minimax regret', value: sol.minimaxMaxRegret, hint: 'Savage: smallest largest gap to the scenario oracle' }),
      stat({ label: 'Price of fairness', value: sol.priceOfFairness, tone: sol.priceOfFairness ? 'warn' : '', hint: 'Worst-case value the equity floor costs' })),
    h('div', { class: 'grid grid-3' },
      stat({ label: 'Committed hours', value: sol.committedHours }),
      stat({ label: 'Committed budget', value: `${sol.committedBudget} ${detail.currency}` }),
      stat({ label: 'Optimist\u2019s worst case', value: sol.optimisticWorstCase, tone: 'warn', hint: 'The point-forecast plan under the same adversary' })),
    card({ title: 'Funded lines', subtitle: `Exact integer solution over ${blank(sol.feasibleN)} feasible allocations and ${blank(sol.scenariosN)} scenario problems.${sol.frozen ? ' Frozen at adoption.' : ' Solved live.'}`, body: table({ columns: lineColumns, rows: detail.actions, caption: 'Allocated units per intervention' }) }),
    card({ title: 'Segments and equity floors', body: table({ columns: segColumns, rows: detail.segments, caption: 'Segment coverage under the robust plan' }) }),
    card({
      title: 'Sensitivity and value of information',
      body: h('div', { class: 'stack' },
        h('p', null, stressLabels.length
          ? h('span', null, h('strong', null, 'Stress switches: '), `forcing ${stressLabels.join(', ')} to its worst end flips the recommended plan. Resolve that range before committing.`)
          : h('span', { class: 'muted' }, 'No single effect range, forced to its floor, flips the robust plan. The recommendation is stable one range at a time.')),
        h('p', null, topAction
          ? h('span', null, h('strong', null, 'Highest worst-case exposure: '), `${topAction.label}. Resolving its range would release ${sol.regretRelease} unit(s) of maximum regret.`)
          : h('span', { class: 'muted' }, 'No declared range carries worst-case exposure on the robust plan.'))),
    }),
    detail.linkedGrade ? banner({
      tone: detail.linkedGrade.outcome === 1 ? 'good' : 'bad',
      title: detail.linkedGrade.outcome === 1 ? 'Linked premise reached its threshold' : 'Linked premise was falsified',
      body: `The pre-registered contract graded outcome ${detail.linkedGrade.outcome} (observed ${blank(detail.linkedGrade.observedPct)}%). A missed threshold opens a governed re-allocation decision; it is not a causal claim.`,
    }) : null,
  );
}

function rollupPanel(ctx, report) {
  const columns = [
    { label: 'Altitude', render: (a) => badge(a.altitudeKey, 'neutral') },
    { label: 'Plans', render: (a) => String(a.plansN) },
    { label: 'Adopted', render: (a) => String(a.adoptedN) },
    { label: 'Funded lines', render: (a) => String(a.fundedLinesN) },
    { label: 'Hours', render: (a) => String(a.committedHours) },
    { label: 'Falsified', render: (a) => String(a.falsifiedN) },
    { label: 'Falsified % (95%)', render: (a) => (a.refused || a.suppressed ? badge('withheld', 'neutral', a.reason) : `${a.falsifiedPct}% (${a.lowPct}–${a.highPct}%)`) },
  ];
  const findings = report.openDecisions.length
    ? table({
      columns: [
        { label: 'Rule', render: (d) => badge(d.ruleId, 'warn') },
        { label: 'Governed finding', render: (d) => d.title },
        { label: 'Review', render: (d) => blank(d.reviewOn) },
      ],
      rows: report.openDecisions,
      caption: 'Open governed allocation findings',
    })
    : emptyState({ title: 'No open governed findings', body: 'A falsified, overdue or ungraded premise opens one bounded decision per plan per ISO week.' });
  return h('div', { class: 'stack' },
    banner({
      tone: report.coverage.refused ? 'warn' : 'info',
      title: report.coverage.refused ? 'Pooled falsified share withheld' : `Falsified share ${report.coverage.pct}% (Wilson 95% ${report.coverage.lowPct}–${report.coverage.highPct}%)`,
      body: report.coverage.refused ? report.coverage.reason : `Over ${report.coverage.adoptedN} adopted plan(s). Counts are exact; a rate below the cell floor or below director rank is blank, never zero.`,
    }),
    card({ title: 'Vertical roll-up by altitude', subtitle: 'The same ledger projected at each altitude, with small-cell and complementary suppression.', body: table({ columns, rows: report.byAltitude, caption: 'Allocation roll-up by altitude' }) }),
    card({ title: 'Open governed findings', body: findings }),
  );
}

function certificatePanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Identity-free upward certificate',
      subtitle: 'Counts, hours, dates and state names only. No plan id, title, person or currency amount.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => exportBrief(ctx) }, 'Download brief (.md)'),
        h('button', { class: 'btn', type: 'button', onClick: () => exportCsv(ctx) }, 'Download CSV (#93)'),
      ],
      body: h('p', { class: 'muted' }, report.disclosure.rollup),
    }),
    card({
      title: 'What is and is not claimed',
      body: h('ul', { class: 'stack' },
        ...Object.values(report.disclosure).map((line) => h('li', { class: 'muted' }, line))),
    }),
  );
}

export function renderRobustAllocation(ctx) {
  const panel = panelFor(ctx.query);
  const planId = ctx.query?.get?.('plan') || null;
  const report = ctx.api.robustAllocationRead(planId);
  if (!report?.ok) {
    return h('div', { class: 'stack' }, pageHeader({ title: 'Robust allocation' }), banner({ tone: 'bad', title: 'Report unavailable', body: report?.error || 'The report could not be built.' }));
  }
  const body = {
    desk: () => deskPanel(ctx, report),
    plans: () => plansPanel(ctx, report),
    solve: () => solvePanel(ctx, report),
    rollup: () => rollupPanel(ctx, report),
    certificate: () => certificatePanel(ctx, report),
  }[panel]();
  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: `Rank ${report.seat.rank} · ${report.seat.altitudeKey}`,
      title: 'Robust allocation',
      subtitle: 'Multi-action, capacity-constrained allocation under declared effect ranges — Wald maximin, Savage minimax regret, and the price of fairness.',
      meta: report.engineVersion,
    }),
    tabs({ items: PANELS, active: panel, onSelect: (key) => go(ctx, key, planId && key === 'solve' ? `&plan=${encodeURIComponent(planId)}` : ''), ariaLabel: 'Robust allocation sections' }),
    body,
  );
}
