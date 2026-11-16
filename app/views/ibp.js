/**
 * app/views/ibp.js — `#/ibp`, the Integrated Business Plan / S&OP Cycle Register
 * (ADR-0231, Schema v184, `RULE-IBP-01`, CSV scope #172).
 *
 * ONE reader (`buildIbp`) stands behind every gap, residual, verdict, count and
 * contention figure this page prints. The page formats what the reader returned;
 * it computes no sum, no gap, no residual and no addressee of its own. Where a
 * figure is withheld the page prints the reason the reader gave, never a zero.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import {
  IBP_CAPACITY_KINDS,
  IBP_METHOD,
  IBP_OPTION_KINDS,
  IBP_ROUTE,
  IBP_STEPS,
  IBP_STATES,
  IBP_VERDICTS,
  ibpStep,
} from '../core/domain/ibpRegistry.js';
import { unitsToDisplay, centsToDisplay, readCents, readNonNegUnits } from '../core/domain/ibpSchema.js';

const DIAGRAM_URL = './app/assets/ibp-plan-of-record.jpg';

const VIEWS = [
  { key: 'cycles', label: 'Cycles' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'learning', label: 'Forecast grade' },
  { key: 'method', label: 'Method' },
];

const VERDICT_TONE = Object.fromEntries(IBP_VERDICTS.map((row) => [row.key, row.tone]));

function button(label, onClick, { primary = false, testid = null, variant = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}${variant ? ` btn-${variant}` : ''}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

/** A plan unit figure, or the reason it is not printed. Never a zero for "unknown". */
function units(value, reason = 'not computed') {
  const exact = readNonNegUnits(value);
  if (exact === null) return h('span', { class: 'small muted', title: reason }, 'withheld');
  return h('span', null, unitsToDisplay(exact));
}
function signedUnits(value, reason = 'not computed') {
  if (value === null || value === undefined || !Number.isInteger(value)) return h('span', { class: 'small muted', title: reason }, 'withheld');
  const sign = value > 0 ? '+' : '';
  return h('span', null, `${sign}${unitsToDisplay(value)}`);
}
const money = (currency, cents) => {
  const exact = readCents(cents);
  if (exact === null) return 'withheld';
  return `${currency} ${centsToDisplay(exact)}`;
};
const shortVerdict = (row) => (row.verdictLabel || row.verdict).split(' — ')[0];
const shortOption = (key) => (IBP_OPTION_KINDS.find((row) => row.key === key)?.label || key);
const shortKind = (key) => (IBP_CAPACITY_KINDS.find((row) => row.key === key)?.label || key || '—').split(' — ')[0];

function optionsFrom(rows, blank = null) {
  return [
    ...(blank ? [{ value: '', label: blank }] : []),
    ...rows.map((row) => ({ value: row.key, label: row.label })),
  ];
}

function openFormModal({ title, description = '', form, submitLabel, intro = null, onSubmit }) {
  const submit = () => {
    form.clearErrors();
    const res = onSubmit(form.getValues());
    if (!res?.ok) {
      if (res?.field) form.setFieldError(res.field, res.error || '');
      toast(res?.error || 'Action refused.', 'bad');
      return;
    }
    closeAllModals();
  };
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel');
  const submitBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'ibp-modal-submit', onClick: submit }, submitLabel);
  openModal({ title, description, body: h('div', { class: 'stack' }, intro, form.node), footer: [cancelBtn, submitBtn] });
}

/* -------------------------------------------------------------- the dialogs */

function declareCycleDialog(ctx, onDone) {
  const people = (ctx.api.peopleList ? ctx.api.peopleList() : []) || [];
  const form = buildForm([
    { name: 'title', label: 'Plan name', type: 'text', required: true, help: '12–160 chars. Name the plan and the period — “FY27 consumer volume plan” has to survive being read in eighteen months.' },
    { name: 'currency', label: 'Currency (3-letter ISO)', type: 'text', required: true, help: 'DKK, EUR, USD. One plan is stated in one currency; nothing is converted and no FX policy is assumed.' },
    { name: 'horizonMonths', label: 'Horizon (months)', type: 'number', required: true, help: '1–36. The canonical cycle plans 18–24 months ahead with the most detail in the first three to six.' },
    { name: 'ownerId', label: 'Process owner', type: 'select', options: optionsFrom(people.map((p) => ({ key: p.id, label: `${p.name} (${p.id})` })), 'This seat'), help: 'The person who runs the cycle and whose ordinary duty step four is.' },
    { name: 'demandLineId', label: 'Demand line (who answers for demand)', type: 'text', help: 'The reporting line the demand plan belongs to. Leave blank to use your own line.' },
    { name: 'supplyLineId', label: 'Supply line (who answers for capacity)', type: 'text', help: 'The reporting line that must demonstrate the capacity. Leave blank to use your own line.' },
    { name: 'reviewOn', label: 'Review date (YYYY-MM-DD)', type: 'date', help: 'When this plan is reviewed. Defaults to one month after the horizon ends.' },
    { name: 'basis', label: 'Why this cycle is open (≥ 24 chars)', type: 'textarea', required: true, help: 'The written basis. A plan with no written basis is a habit.' },
  ]);
  openFormModal({
    title: 'Open an S&OP cycle',
    description: 'Five reviews in a fixed order — portfolio, demand, supply, reconciliation, executive — ending in one approved operating plan.',
    submitLabel: 'Open cycle',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpDeclareCycle({
        title: values.title,
        currency: values.currency,
        horizonMonths: Number(values.horizonMonths),
        ownerId: values.ownerId || undefined,
        demandLineId: values.demandLineId || undefined,
        supplyLineId: values.supplyLineId || undefined,
        reviewOn: values.reviewOn || undefined,
        basis: values.basis,
      });
      if (res?.ok) {
        toast('Cycle opened. Record the consensus demand plan next.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function demandDialog(ctx, row, onDone) {
  const next = row.unplannedMonths[0] || 1;
  const form = buildForm([
    { name: 'monthIndex', label: `Month (1–${row.horizonMonths})`, type: 'number', required: true, help: row.unplannedMonths.length ? `Months still unplanned: ${row.unplannedMonths.slice(0, 12).join(', ')}${row.unplannedMonths.length > 12 ? '…' : ''}` : 'Every month already carries a demand row.' },
    { name: 'baselineUnits', label: 'Statistical baseline (units)', type: 'text', required: true, help: 'What the history says, before anybody’s commercial judgement. Whole units.' },
    { name: 'targetUnits', label: 'Commercial target (units)', type: 'text', required: true, help: 'What sales is committed to sell. A target is a wish with a bonus attached; it is recorded here so it can never masquerade as a forecast.' },
    { name: 'consensusUnits', label: 'CONSENSUS demand plan (units)', type: 'text', required: true, help: 'The unconstrained number every function will plan against. If this equals the target while the baseline says otherwise, the register prints `target-substituted`.' },
    { name: 'note', label: 'Commercial adjustments behind the consensus', type: 'textarea', help: 'Promotions, pricing moves, customer wins and losses. This is what makes a consensus different from a baseline.' },
  ]);
  openFormModal({
    title: `Record the demand plan — ${row.title}`,
    description: 'Baseline, target and consensus are three different figures and are stored apart. Whole units only.',
    submitLabel: 'Record demand plan',
    form,
    intro: h('p', { class: 'small muted' }, `Plan month ${next} is the first one still unplanned on this cycle.`),
    onSubmit(values) {
      const res = ctx.api.ibpRecordDemand({
        cycleId: row.id,
        monthIndex: Number(values.monthIndex),
        baselineUnits: values.baselineUnits,
        targetUnits: values.targetUnits,
        consensusUnits: values.consensusUnits,
        note: values.note,
      });
      if (res?.ok) {
        toast('Demand plan recorded. Test it against demonstrated capacity next.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function capacityDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'monthIndex', label: `Month (1–${row.horizonMonths})`, type: 'number', required: true, help: 'The month whose feasibility this line is stating.' },
    { name: 'kind', label: 'How was this figure obtained?', type: 'select', required: true, options: optionsFrom(IBP_CAPACITY_KINDS, 'Choose the provenance…'), help: 'A `demonstrated` figure needs a real observation window of at least 28 days. A `theoretical` figure is carried but never compared as evidence.' },
    { name: 'units', label: 'Capacity (units)', type: 'text', required: true, help: 'Whole units the limiting resource can produce in that month.' },
    { name: 'windowStartDay', label: 'Observation window — start (YYYY-MM-DD)', type: 'date', help: 'Required for a demonstrated figure. The first day of the period the rate was counted over.' },
    { name: 'windowEndDay', label: 'Observation window — end (YYYY-MM-DD)', type: 'date', help: 'Required for a demonstrated figure. At least 28 days inclusive.' },
    { name: 'note', label: 'What limits this line', type: 'textarea', help: 'The constraint that actually binds: machine time, a material, a qualified operator, a supplier lead time.' },
  ]);
  openFormModal({
    title: `Record capacity — ${row.title}`,
    description: 'Demonstrated capacity is evidence. Theoretical capacity is an assertion and the register prints it as one.',
    submitLabel: 'Record capacity',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpRecordCapacity({
        cycleId: row.id,
        monthIndex: Number(values.monthIndex),
        kind: values.kind,
        units: values.units,
        windowStartDay: values.windowStartDay || undefined,
        windowEndDay: values.windowEndDay || undefined,
        note: values.note,
      });
      if (res?.ok) {
        toast('Capacity recorded against the demand plan.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function optionDialog(ctx, row, onDone) {
  const gapMonths = row.months.filter((month) => Number.isInteger(month.gapUnits) && month.gapUnits > 0);
  const form = buildForm([
    { name: 'monthIndex', label: `Month (1–${row.horizonMonths})`, type: 'number', required: true, help: gapMonths.length ? `Months with a positive gap: ${gapMonths.map((m) => m.monthIndex).join(', ')}` : 'No month currently shows a positive gap.' },
    { name: 'kind', label: 'Lever', type: 'select', required: true, options: optionsFrom(IBP_OPTION_KINDS, 'Choose the lever…'), help: 'Each lever moves one side of the equation: capacity up, or demand down on purpose.' },
    { name: 'units', label: 'Plan-unit effect', type: 'text', required: true, help: 'How many whole units this option adds on the capacity side, or removes on the demand side. At least one.' },
    { name: 'cost', label: `Cost (${row.currency}, major units)`, type: 'text', required: true, help: 'Exact to the cent, e.g. 48000 or 48000.25. A third decimal place is refused rather than rounded.' },
    { name: 'note', label: 'What this buys or gives up (≥ 24 chars)', type: 'textarea', required: true, help: 'The trade-off in words, including who is served first if demand is removed.' },
  ]);
  openFormModal({
    title: `Frame a costed option — ${row.title}`,
    description: 'A lever, a plan-unit effect and an exact cost. An option with no price is a preference, not a trade-off.',
    submitLabel: 'Frame option',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpFrameOption({
        cycleId: row.id,
        monthIndex: Number(values.monthIndex),
        kind: values.kind,
        units: values.units,
        cost: values.cost,
        note: values.note,
      });
      if (res?.ok) {
        toast('Option framed against the gap.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function approveDialog(ctx, row, onDone) {
  const residual = row.totals.residualUnits;
  const form = buildForm([
    {
      name: 'acknowledgedResidualUnits',
      label: 'Residual you are accepting (units)',
      type: 'text',
      required: true,
      help: residual === null
        ? 'The residual is not yet computable on this cycle.'
        : `The record computes ${unitsToDisplay(residual)} unit(s) still unserved after the framed options. State the figure you are signing; a different figure is printed, not reconciled.`,
    },
    { name: 'servedFirst', label: 'Who is served first', type: 'text', help: 'The customer group, channel or product family that has priority where the plan cannot serve everyone.' },
    { name: 'serviceNote', label: 'What service consequence is accepted (≥ 24 chars)', type: 'textarea', required: true, help: 'The service failure this plan accepts, in words, so it is a decision and not an omission.' },
    { name: 'reason', label: 'Basis for this plan (≥ 24 chars)', type: 'textarea', required: true, help: 'The record has to explain the plan to whoever inherits it.' },
  ]);
  openFormModal({
    title: `Approve the operating plan — ${row.title}`,
    description: 'The executive step commits resources. It is recorded once, by a seat above both lines, and never by the seat that framed the options.',
    submitLabel: 'Approve plan',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpApprovePlan({
        cycleId: row.id,
        acknowledgedResidualUnits: values.acknowledgedResidualUnits,
        servedFirst: values.servedFirst,
        serviceNote: values.serviceNote,
        reason: values.reason,
      });
      if (res?.ok) {
        toast(res.matches
          ? 'Plan approved and its residual closes.'
          : 'Plan approved WITH a declared residual that does not equal the computed one — both figures are printed.', res.matches ? 'good' : 'caution');
        onDone?.();
      }
      return res;
    },
  });
}

function gradeDialog(ctx, row, onDone) {
  const planned = row.months.filter((month) => month.hasDemand);
  const form = buildForm([
    { name: 'monthIndex', label: `Month (1–${row.horizonMonths})`, type: 'number', required: true, help: `Months carrying a frozen consensus: ${planned.map((m) => m.monthIndex).join(', ') || 'none'}` },
    { name: 'actualUnits', label: 'What actually sold (units)', type: 'text', required: true, help: 'Whole units. The consensus this is graded against is already frozen — it is never rewritten after the result is known.' },
    { name: 'note', label: 'What explains the difference', type: 'textarea', help: 'Written now, while it is still an explanation and not yet a story.' },
  ]);
  openFormModal({
    title: `Grade the demand plan — ${row.title}`,
    description: 'Signed bias and absolute error are reported separately, and both withheld below five graded months.',
    submitLabel: 'Record grade',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpGradeDemand({
        cycleId: row.id,
        monthIndex: Number(values.monthIndex),
        actualUnits: values.actualUnits,
        note: values.note,
      });
      if (res?.ok) {
        toast(`Grade recorded — signed bias ${res.biasUnits > 0 ? '+' : ''}${unitsToDisplay(res.biasUnits)} unit(s).`, 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why is this cycle being withdrawn? (≥ 24 chars)', type: 'textarea', required: true, help: 'A withdrawal is final. A revision is a new cycle, so the abandoned plan stays on the record.' },
  ]);
  openFormModal({
    title: `Withdraw the cycle — ${row.title}`,
    description: 'The cycle is closed without an approved plan. Nothing is deleted.',
    submitLabel: 'Withdraw cycle',
    form,
    onSubmit(values) {
      const res = ctx.api.ibpWithdrawCycle(row.id, values.reason);
      if (res?.ok) {
        toast('Cycle withdrawn.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* ---------------------------------------------------------------- the views */

function summaryStrip(report, attention) {
  const gap = report.rows.filter((row) => !row.withdrawn && Number.isInteger(row.totals.gapUnits) && row.totals.gapUnits > 0);
  const residual = report.rows.filter((row) => !row.withdrawn && Number.isInteger(row.totals.residualUnits) && row.totals.residualUnits > 0);
  return h('div', { class: 'stat-grid', 'data-testid': 'ibp-summary' },
    stat({ label: 'Live cycles', value: report.coverage.liveN, hint: `${report.coverage.withdrawnN} withdrawn` }),
    stat({ label: 'Plans approved', value: report.counts.approved, hint: `${report.coverage.approvedClosingN} close · ${report.coverage.approvedWithResidualN} with a declared residual` }),
    stat({
      label: 'Cycles with a gap',
      value: gap.length,
      tone: gap.length ? 'warn' : '',
      hint: gap.length ? `${unitsToDisplay(gap.reduce((acc, row) => acc + row.totals.gapUnits, 0))} unit(s) of demand above demonstrated capacity` : 'No live cycle asks for more than its line can demonstrate',
    }),
    stat({
      label: 'Residual unserved',
      value: residual.length,
      tone: residual.length ? 'bad' : '',
      hint: residual.length ? `${unitsToDisplay(residual.reduce((acc, row) => acc + row.totals.residualUnits, 0))} unit(s) still unserved after framed options` : 'Nothing computed as unserved after options',
    }),
    stat({ label: 'Owed to a human', value: attention, hint: 'Supply test, reconciliation, executive step or review' }),
    stat({
      label: 'Figures complete',
      value: report.figuresComplete ? 'yes' : 'no',
      tone: report.figuresComplete ? 'good' : 'warn',
      hint: report.figuresComplete ? 'No row dropped, no option outside the horizon' : `${report.warnings.length} stored row(s) refused at load`,
    }),
  );
}

function cyclesView(ctx, report, onDone) {
  const columns = [
    { key: 'plan', label: 'Plan' },
    { key: 'demand', label: 'Consensus demand' },
    { key: 'capacity', label: 'Demonstrated capacity' },
    { key: 'gap', label: 'Gap' },
    { key: 'residual', label: 'Residual' },
    { key: 'verdict', label: 'Verdict' },
    { key: 'actions', label: 'Actions' },
  ];
  const rows = report.visibleRows.map((row) => ({
    plan: h('div', { class: 'stack-xs' },
      h('strong', null, row.title),
      h('span', { class: 'small muted' }, `${row.currency} · ${row.horizonMonths} months · ${row.stateLabel.split(' — ')[0]}`),
      h('span', { class: 'small muted' }, `${row.totals.demandRecordedN}/${row.horizonMonths} month(s) planned · ${row.totals.capacityEvidenceN} with demonstrated capacity`)),
    demand: h('div', { class: 'stack-xs' },
      h('span', null, `${unitsToDisplay(row.totals.consensusUnits)} u`),
      h('span', { class: 'small muted' }, `baseline ${unitsToDisplay(row.totals.baselineUnits)} · target ${unitsToDisplay(row.totals.targetUnits)}`)),
    capacity: row.totals.capacityEvidenceN
      ? h('div', { class: 'stack-xs' },
        h('span', null, `${unitsToDisplay(row.totals.capacityUnits)} u`),
        h('span', { class: 'small muted' }, `${row.totals.capacityEvidenceN} demonstrated month(s)`),
        row.theoreticalN ? h('span', { class: 'small muted' }, `${row.theoreticalN} theoretical — not evidence`) : null)
      : h('span', { class: 'small muted' }, row.totals.capacityRecordedN ? 'theoretical only — not evidence' : 'not tested'),
    gap: row.totals.gapUnits === null
      ? h('span', { class: 'small muted' }, 'withheld — both sides not on the record')
      : signedUnits(row.totals.gapUnits),
    residual: row.totals.residualUnits === null
      ? h('span', { class: 'small muted' }, 'withheld')
      : h('div', { class: 'stack-xs' },
        h('span', null, unitsToDisplay(row.totals.residualUnits)),
        row.decision
          ? h('span', { class: 'small muted' }, row.residualMatches
            ? 'equals what the executive accepted'
            : `approved ${unitsToDisplay(row.decision.acknowledgedResidualUnits)} — PRINTED AS A DISAGREEMENT`)
          : h('span', { class: 'small muted' }, 'no executive decision yet')),
    verdict: h('div', { class: 'stack-xs' },
      badge(shortVerdict(row), VERDICT_TONE[row.verdict] || 'neutral'),
      h('span', { class: 'small muted' }, row.verdictRank <= 4 ? row.verdictLabel.split(' — ').slice(1).join(' — ') : '')),
    actions: h('div', { class: 'row gap-s wrap' },
      !row.withdrawn && row.totals.demandRecordedN < row.horizonMonths
        ? button('Record demand', () => demandDialog(ctx, row, onDone)) : null,
      !row.withdrawn && row.totals.demandRecordedN && !row.totals.capacityEvidenceN
        ? button('Record capacity', () => capacityDialog(ctx, row, onDone)) : null,
      !row.withdrawn && row.executiveOwed ? button('Frame option', () => optionDialog(ctx, row, onDone)) : null,
      !row.withdrawn && row.executiveOwed && row.totals.optionsN ? button('Approve', () => approveDialog(ctx, row, onDone), { primary: true }) : null,
      !row.withdrawn && row.totals.demandRecordedN ? button('Grade', () => gradeDialog(ctx, row, onDone)) : null,
      !row.withdrawn && !row.decision ? button('Withdraw', () => withdrawDialog(ctx, row, onDone)) : null),
  }));

  return card({
    title: 'Every declared cycle, and what it is owed',
    subtitle: 'Baseline, target and consensus are printed apart; demonstrated capacity is separated from theoretical; the residual an executive accepted is compared with the one the record computes.',
    actions: [button('Open a cycle', () => declareCycleDialog(ctx, onDone), { primary: true, testid: 'ibp-declare' })],
    body: report.visibleRows.length
      ? table({ columns, rows, caption: 'Integrated business plan cycles' })
      : emptyState({
        title: 'No cycle is open',
        body: 'An S&OP cycle starts by naming the plan, the currency, the horizon and the two lines that answer for demand and for capacity. Nothing is inferred from a budget, a target or a headcount.',
        action: button('Open a cycle', () => declareCycleDialog(ctx, onDone), { primary: true }),
      }),
  });
}

function monthTable(row) {
  const columns = [
    { key: 'month', label: 'Month' },
    { key: 'baseline', label: 'Baseline' },
    { key: 'target', label: 'Target' },
    { key: 'consensus', label: 'Consensus' },
    { key: 'capacity', label: 'Capacity' },
    { key: 'gap', label: 'Gap' },
    { key: 'options', label: 'Options applied' },
    { key: 'residual', label: 'Residual' },
  ];
  const rows = row.months.map((month) => ({
    month: h('div', { class: 'stack-xs' },
      h('span', null, `M${month.monthIndex}`),
      month.targetSubstituted ? badge('target substituted', 'bad') : null,
      month.demandConstrained ? badge('demand constrained', 'bad') : null),
    baseline: units(month.baselineUnits),
    target: units(month.targetUnits),
    consensus: units(month.consensusUnits),
    capacity: month.hasCapacity
      ? h('div', { class: 'stack-xs' },
        h('span', null, unitsToDisplay(month.capacityUnits)),
        badge(shortKind(month.capacityKind), month.capacityIsEvidence ? 'good' : 'caution'))
      : h('span', { class: 'small muted' }, 'not tested'),
    gap: month.gapUnits === null
      ? h('span', { class: 'small muted', title: month.hasCapacity ? 'capacity is theoretical, so no gap is computable' : 'no capacity on the record for this month' }, 'withheld')
      : signedUnits(month.gapUnits),
    options: h('span', null, `+${unitsToDisplay(month.capacityAddedUnits)} cap · −${unitsToDisplay(month.demandRemovedUnits)} dem`),
    residual: month.residualUnits === null ? h('span', { class: 'small muted' }, 'withheld') : unitsToDisplay(month.residualUnits),
  }));
  return table({ columns, rows, caption: `Month-by-month reconciliation — ${row.title}` });
}

function reconcileView(report) {
  const live = report.visibleRows.filter((row) => !row.withdrawn);
  if (!live.length) {
    return card({ title: 'Reconcile', body: emptyState({ title: 'Nothing to reconcile yet', body: 'A cycle with a consensus demand plan and demonstrated capacity gets a month-by-month gap here.' }) });
  }
  return h('div', { class: 'stack' },
    report.contention.sharedLineMonthN
      ? card({
        title: 'Shared demonstrated capacity',
        subtitle: 'Two cycles drawing on the same supply line in the same month consume the same capacity. Each is summed here, so two plans that each fit cannot both be approved against a line that serves neither.',
        body: report.contention.contendedN
          ? h('div', { class: 'stack' },
            banner({
              tone: 'bad',
              title: `${report.contention.contendedN} line-month(s) are contended`,
              body: `${unitsToDisplay(report.contention.contentionUnits)} unit(s) of demand across all cycles exceed what those lines demonstrated. Contention is printed against the line and the month, never against a person.`,
            }),
            table({
              columns: [
                { key: 'line', label: 'Supply line' },
                { key: 'month', label: 'Month' },
                { key: 'cycles', label: 'Cycles drawing on it' },
                { key: 'demand', label: 'Combined demand' },
                { key: 'capacity', label: 'Capacity' },
                { key: 'contention', label: 'Contention' },
              ],
              rows: report.contention.rows.map((entry) => ({
                line: entry.lineId,
                month: `M${entry.monthIndex}`,
                cycles: String(entry.cycleN),
                demand: unitsToDisplay(entry.demandUnits),
                capacity: entry.capacityUnits === null ? h('span', { class: 'small muted' }, 'not demonstrated') : unitsToDisplay(entry.capacityUnits),
                contention: entry.contentionUnits === null
                  ? h('span', { class: 'small muted' }, 'withheld — capacity is not evidence')
                  : badge(unitsToDisplay(entry.contentionUnits), entry.contentionUnits > 0 ? 'bad' : 'good'),
              })),
              caption: 'Shared capacity contention by line and month',
            }))
          : h('p', { class: 'small muted' }, `${report.contention.sharedLineMonthN} shared line-month(s) exist and none is contended on the current record.`),
      })
      : null,
    ...live.map((row) => card({
      title: row.title,
      subtitle: `${row.currency} · horizon ${row.horizonMonths} months · demand line ${row.demandLineId} · supply line ${row.supplyLineId}`
        + (row.authority?.ambiguous ? ' · the graph holds more than one joint seat above both lines, so every apex is asked' : ''),
      actions: [badge(shortVerdict(row), VERDICT_TONE[row.verdict] || 'neutral')],
      body: h('div', { class: 'stack' },
        h('div', { class: 'row gap-s wrap' },
          kv('Consensus', `${unitsToDisplay(row.totals.consensusUnits)} u`),
          kv('Demonstrated capacity', row.totals.capacityEvidenceN ? `${unitsToDisplay(row.totals.capacityUnits)} u` : 'not on the record'),
          kv('Option cost', row.options.length ? money(row.currency, row.totals.optionCents) : 'no option framed'),
          kv('Months computable', `${row.totals.gapComputableN}/${row.horizonMonths}`)),
        row.totals.gapUnits === null
          ? banner({ tone: 'caution', title: 'The gap is not computable', body: 'Either no month carries both a consensus demand figure and a demonstrated capacity figure. The register withholds the gap rather than printing a zero that would read as “no gap”.' })
          : null,
        monthTable(row),
        row.options.length
          ? h('div', { class: 'stack' },
            h('h3', { class: 'h3' }, 'Framed options'),
            table({
              columns: [
                { key: 'lever', label: 'Lever' },
                { key: 'month', label: 'Month' },
                { key: 'side', label: 'Moves' },
                { key: 'effect', label: 'Effect' },
                { key: 'cost', label: 'Cost' },
                { key: 'note', label: 'What it buys or gives up' },
              ],
              rows: row.options.map((option) => ({
                lever: shortOption(option.kind),
                month: `M${option.monthIndex}`,
                side: option.side === 'capacity' ? 'capacity up' : 'demand down',
                effect: option.side === 'capacity' ? `+${unitsToDisplay(option.units)} u` : `−${unitsToDisplay(option.units)} u`,
                cost: money(row.currency, option.cents),
                note: h('span', { class: 'small muted' }, option.note),
              })),
              caption: `Costed options — ${row.title}`,
            }))
          : null,
        row.decision
          ? h('div', { class: 'stack' },
            h('h3', { class: 'h3' }, 'The executive decision'),
            kv('Approved on', row.decision.decidedOn),
            kv('Residual accepted', `${unitsToDisplay(row.decision.acknowledgedResidualUnits)} u`),
            kv('Residual the record computes', row.totals.residualUnits === null ? 'withheld' : `${unitsToDisplay(row.totals.residualUnits)} u`),
            row.residualMatches
              ? badge('the accepted residual is the computed residual', 'good')
              : badge('THE ACCEPTED RESIDUAL DOES NOT EQUAL THE COMPUTED ONE — printed, not reconciled', 'bad'),
            kv('Served first', row.decision.servedFirst),
            h('p', { class: 'small muted' }, row.decision.serviceNote),
            h('p', { class: 'small muted' }, row.decision.reason))
          : row.executiveOwed
            ? banner({ tone: 'warn', title: 'The executive step is owed', body: 'A gap is quantified and no plan has been approved. The register has asked the lowest seat above both lines; it will not approve the plan itself.' })
            : null,
      ),
    })));
}

function learningView(report) {
  const grade = report.grade;
  return h('div', { class: 'stack' },
    card({
      title: 'Forecast grade — bias and error, reported apart',
      subtitle: 'A forecast that runs high every month has a fatal bias and near-zero pure error. Reporting one number would hide which is failing, so both are printed and both are withheld below the floor.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Graded months', value: grade.n, hint: `Floor ${grade.floor}` }),
          stat({
            label: 'Signed bias',
            value: grade.belowFloor ? 'withheld' : `${grade.biasUnits > 0 ? '+' : ''}${unitsToDisplay(grade.biasUnits)} u`,
            tone: grade.belowFloor ? '' : (Math.abs(grade.biasUnits) > 0 ? 'warn' : 'good'),
            hint: 'Actual minus consensus, summed. A positive figure means the plan under-called demand.',
          }),
          stat({
            label: 'Mean absolute error',
            value: grade.belowFloor ? 'withheld' : `${(grade.mapeBp / 100).toFixed(2)}%`,
            hint: 'Mean absolute percentage error over the graded months.',
          })),
        grade.belowFloor ? banner({ tone: 'info', title: 'Not enough graded months to measure anything', body: grade.withheldReason }) : null,
        grade.rows.length
          ? table({
            columns: [
              { key: 'cycle', label: 'Cycle' },
              { key: 'month', label: 'Month' },
              { key: 'consensus', label: 'Frozen consensus' },
              { key: 'actual', label: 'Actual' },
              { key: 'bias', label: 'Signed bias' },
              { key: 'abs', label: 'Absolute error' },
            ],
            rows: grade.rows.map((entry) => {
              const cycle = report.rows.find((row) => row.id === entry.cycleId);
              return {
                cycle: cycle ? cycle.title : entry.cycleId,
                month: `M${entry.monthIndex}`,
                consensus: unitsToDisplay(entry.consensusUnits),
                actual: unitsToDisplay(entry.actualUnits),
                bias: signedUnits(entry.bias),
                abs: `${unitsToDisplay(entry.absError)} u`,
              };
            }),
            caption: 'Graded cycle-months',
          })
          : emptyState({ title: 'No forecast has been graded yet', body: 'A grade compares what actually sold against the consensus that was already frozen. The consensus is never rewritten afterwards.' }),
      ),
    }));
}

function methodView() {
  return h('div', { class: 'stack' },
    card({
      title: 'The five reviews',
      subtitle: 'In a fixed order. A step recorded out of sequence is a cycle that has already broken.',
      body: table({
        columns: [
          { key: 'step', label: '#' },
          { key: 'name', label: 'Review' },
          { key: 'owner', label: 'Accountable' },
          { key: 'decides', label: 'What it decides' },
          { key: 'output', label: 'Output' },
        ],
        rows: IBP_STEPS.map((step) => ({
          step: String(step.order),
          name: h('strong', null, step.label),
          owner: step.owner,
          decides: h('span', { class: 'small' }, step.decides),
          output: h('span', { class: 'small muted' }, step.output),
        })),
        caption: 'The S&OP cycle',
      }),
    }),
    card({
      title: 'Frameworks applied — named, not paraphrased',
      body: h('ul', { class: 'list' },
        ...IBP_METHOD.frameworks.map((line) => h('li', null, line))),
    }),
    card({
      title: 'What this page prints, and how',
      body: h('ul', { class: 'list' }, ...IBP_METHOD.printed.map((line) => h('li', null, line))),
    }),
    card({
      title: 'What it deliberately does not do',
      body: h('ul', { class: 'list' }, ...IBP_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
    }),
    card({
      title: 'The seven ways an S&OP cycle breaks',
      subtitle: 'Each is a printed verdict here, never a silent pass.',
      body: table({
        columns: [
          { key: 'verdict', label: 'Verdict' },
          { key: 'meaning', label: 'What it says' },
        ],
        rows: IBP_VERDICTS.map((verdict) => ({
          verdict: badge(verdict.label.split(' — ')[0], verdict.tone),
          meaning: h('span', { class: 'small muted' }, verdict.label.split(' — ').slice(1).join(' — ')),
        })),
        caption: 'Documented failure modes',
      }),
    }),
    card({
      title: 'Where the month-by-month arithmetic lives',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Demand, demonstrated capacity, gap, options and residual shown as one month-by-month equation, with the residual owned by the seat above both lines', class: 'method-figure', loading: 'lazy' }),
        h('p', { class: 'small muted' }, 'Demand up, demonstrated capacity across, gap between, costed options applied, residual owned. Every figure is a whole unit and every total is proved to be the sum of its printed months.')),
    }));
}

export function renderIbp(ctx) {
  const res = ctx.api.ibpReport ? ctx.api.ibpReport() : null;
  if (!res || res.ok === false || !res.report) {
    return h('div', { class: 'page' },
      pageHeader({
        eyebrow: 'Director / VP · single-chain and matrix',
        title: 'Integrated business plan',
        subtitle: 'Demand, demonstrated capacity and the gap between them — one operating plan.',
      }),
      banner({ tone: 'bad', title: 'The plan register could not be read', body: res?.error || 'Resolve a valid operating seat to read this register.' }));
  }
  const report = res.report;
  const requested = ctx.query?.get?.('view');
  const activeTab = VIEWS.some((v) => v.key === requested) ? requested : 'cycles';
  const attentionRes = ctx.api.ibpAttentionCount ? ctx.api.ibpAttentionCount() : { count: 0 };
  const attention = typeof attentionRes === 'number' ? attentionRes : (attentionRes?.count || 0);
  const onDone = () => ctx.refresh?.();

  return h('div', { class: 'page', 'data-testid': 'ibp-panel' },
    pageHeader({
      eyebrow: 'Director / VP · single-chain and matrix',
      title: 'What will this business actually commit to sell and make?',
      subtitle: 'The five-step S&OP cycle ends in one approved operating plan. Demand is recorded unconstrained, capacity is demonstrated rather than asserted, the gap is counted, the options are priced, and the residual is owned by the seat above both lines.',
    }),
    ctx.persistError ? banner({ tone: 'caution', title: 'Persistence warning', body: `Changes are not being persisted: ${ctx.persistError}` }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Reporting graph unreadable', body: report.matrixError }) : null,
    ...(report.warnings || []).map((w) => banner({ tone: 'caution', title: 'Malformed stored row refused', body: w })),
    report.withheldN
      ? banner({ tone: 'info', title: `${report.withheldN} cycle(s) withheld from this seat`, body: 'A cycle reaches a seat only through a line it holds, or a line above both its lines in the reporting tree. Nothing sideways is disclosed.' })
      : null,
    summaryStrip(report, attention),
    h('p', { class: 'small muted' },
      `Engine ${report.engine} · ${report.rule} · as of ${report.asOf} · “the figures add up” is ${report.totalReconcile ? 'true' : 'FALSE'} and “every printed figure is the computed figure” is ${report.figuresComplete ? 'true' : 'false'} — two different claims, reported apart.`),
    tabs({
      items: VIEWS.map((v) => ({
        key: v.key,
        label: v.label,
        count: v.key === 'cycles' ? report.coverage.liveN
          : v.key === 'reconcile' ? report.coverage.liveN
            : v.key === 'learning' ? report.grade.n
              : undefined,
      })),
      active: activeTab,
      ariaLabel: 'Integrated business plan views',
      onSelect: (key) => ctx.navigate(`${IBP_ROUTE}?view=${key}`),
    }),
    activeTab === 'cycles' ? cyclesView(ctx, report, onDone) : null,
    activeTab === 'reconcile' ? reconcileView(report) : null,
    activeTab === 'learning' ? learningView(report) : null,
    activeTab === 'method' ? methodView() : null,
  );
}

export default renderIbp;
