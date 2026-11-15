/**
 * app/views/incentive.js — `#/incentive`, the Variable-Pay Design & Incentive
 * Integrity Register (ADR-0220, Schema v174).
 *
 * ONE reader (`buildIncentiveIntegrity`) stands behind every figure, verdict,
 * contest and gap this page prints. The page formats what the reader returned; it
 * computes no sum, no verdict and no target of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART:
 *   1. what a plan PAYS FOR (a measure, a direction, an exact target, a declared
 *      control);
 *   2. what the record can PROVE was paid (a verified reading met the target and
 *      still does);
 *   3. money that was paid on another basis (discretion), on no verified evidence
 *      (unverified), on a miss (missed), or with a restatement behind it
 *      (recovery due) — every one of them printed, none of them in the headline;
 *   4. the same outcome paid by two plans (CONTESTED), held out of the total
 *      rather than split or double counted;
 *   5. whether the WHOLE record was measured — a separate claim, because
 *      "within ceiling" over an unmeasured plan is not reassurance.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  INC_BASES,
  INC_CONTROLS,
  INC_DIRECTIONS,
  INC_HREF,
  INC_LIMITS as L,
  INC_METHOD,
  INC_RECOVERY_KINDS,
  INC_RECOVERY_STATES,
  INC_UNITS,
  incControl,
  incDirection,
  incRecoveryState,
  incUnit,
} from '../core/domain/incentiveRegistry.js';
import { centsToDisplay } from '../core/domain/incentiveSchema.js';

const DIAGRAM_URL = './app/assets/incentive-integrity-method.jpg';
const VIEWS = [
  { key: 'plans', label: 'Plans' },
  { key: 'awards', label: 'Awards' },
  { key: 'queries', label: 'Queries' },
  { key: 'method', label: 'Method' },
];
const STATE_TONE = {
  provable: 'good', missed: 'caution', discretionary: 'neutral', unverified: 'bad', 'recovery-due': 'bad', contested: 'caution',
};
const STATE_SHORT = {
  provable: 'Provable', missed: 'Missed', discretionary: 'Discretionary', unverified: 'Unverified', 'recovery-due': 'Recovery due', contested: 'Contested',
};

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const money = (currency, cents) => (Number.isSafeInteger(cents) ? `${currency} ${centsToDisplay(cents)}` : 'withheld');

function amountText(row) {
  if (!Number.isSafeInteger(row.amountCents)) return 'withheld';
  return money(row.currency, row.amountCents);
}

function targetText(row) {
  if (row.unit === 'money') {
    return Number.isSafeInteger(row.targetCents) ? `${row.currency} ${centsToDisplay(row.targetCents)}` : 'withheld';
  }
  return Number.isSafeInteger(row.targetCount) ? `${row.targetCount}` : 'withheld';
}

function actualText(row) {
  if (row.unit === 'money') {
    return Number.isSafeInteger(row.basisActualCents) ? `${row.currency} ${centsToDisplay(row.basisActualCents)}` : 'no reading';
  }
  return Number.isSafeInteger(row.basisActualCount) ? `${row.basisActualCount}` : 'no reading';
}

/* ------------------------------------------------------------------ dialogs */

function declarePlanDialog(ctx, report, onDone) {
  const form = buildForm([
    { name: 'label', label: 'What is this envelope for?', type: 'text', required: true, help: 'For example “Field service quarterly variable pay”.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, help: 'Three letters. The plan carries exactly one currency; nothing is converted.' },
    { name: 'ceiling', label: 'Funding ceiling', type: 'text', required: true, help: 'Major units, at most two decimals. An award may exceed it — the register prints that and asks the line above; the door never refuses an expensive award.' },
    { name: 'periodFrom', label: 'Window opens', type: 'date', required: true },
    { name: 'periodTo', label: 'Window closes', type: 'date', required: true, help: `The window may not exceed ${L.periodMaxDays} days.` },
    { name: 'basis', label: 'Why this envelope, and how was it sized?', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveDeclarePlan(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The plan was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Plan declared. Add the measures it pays on before anyone is awarded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a variable-pay plan',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'An envelope, not a spreadsheet', body: 'The plan names what it pays for (its measures), who funds it (your line), what it may spend (an exact ceiling) and over what window. The register derives every figure from awards and verified readings; nothing is stored that the rows do not imply.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare', onClick: submit }],
  });
}

function addMeasureDialog(ctx, report, onDone) {
  const plans = report.plans.filter((row) => row.status === 'live');
  if (!plans.length) {
    openModal({
      title: 'Add a measure',
      body: banner({ tone: 'info', title: 'No live plan on this seat', body: 'A measure belongs to a plan. Declare a plan first, or ask the funding line that owns one.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  const form = buildForm([
    {
      name: 'planId', label: 'Plan', type: 'select', required: true,
      options: options(plans.map((row) => ({ value: row.id, label: `${row.label} — ${row.currency}, to ${row.periodTo}` })), { blank: 'Choose the plan' }),
    },
    { name: 'key', label: 'Outcome key', type: 'text', required: true, help: 'Lower-case letters, digits and hyphens, e.g. ebit-contribution. Two plans with one key are paying for the SAME outcome — that is how the register finds a double payment.' },
    { name: 'label', label: 'Measure name', type: 'text', required: true },
    {
      name: 'direction', label: 'Direction', type: 'select', required: true,
      options: options(INC_DIRECTIONS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the direction' }),
    },
    {
      name: 'unit', label: 'Unit', type: 'select', required: true,
      options: options(INC_UNITS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the unit' }),
    },
    { name: 'target', label: 'Target', type: 'text', required: true, help: 'Exact: major units for money, a whole number for a count. A target of zero is not a target.' },
    {
      name: 'control', label: 'Who can move it?', type: 'select', required: true,
      options: options(INC_CONTROLS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the control' }),
      help: 'Declared, never inferred. An award resting on a measure the line does not control is counted as a line-of-sight gap.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveAddMeasure(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The measure was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Measure added. A reading has to be verified above the funding line before a measured award can be recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Add a measure',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The key is the join', body: 'The outcome key is how the register recognises the same result appearing in two schemes. Use the same key deliberately — or a different one deliberately.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Add measure', onClick: submit }],
  });
}

function readingDialog(ctx, report, onDone) {
  const measures = report.measures;
  if (!measures.length) {
    openModal({
      title: 'Record a verified reading',
      body: banner({ tone: 'info', title: 'No measure on this seat', body: 'A reading verifies one measure. Add a measure to a live plan first.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  const earlier = (measureId) => report.measures.find((row) => row.id === measureId)?.newestReading || null;
  const form = buildForm([
    {
      name: 'measureId', label: 'Measure', type: 'select', required: true,
      options: options(measures.map((row) => ({ value: row.id, label: `${row.label} (${row.key}) — ${row.planLabel}` })), { blank: 'Choose the measure' }),
      help: 'The verifier must be above the plan’s funding line and must not receive an award on this measure.',
    },
    { name: 'actual', label: 'Actual figure', type: 'text', required: true, help: 'Exact: major units for money, a whole number for a count. Nothing is rounded.' },
    { name: 'asOf', label: 'Measured for the day', type: 'date', value: report.asOf, required: true, help: 'Inside the plan’s window, and never in the future.' },
    {
      name: 'evidenceKind', label: 'Evidence kind', type: 'select', required: true,
      options: options(['case', 'decision', 'goal', 'review', 'document'].map((key) => ({ value: key, label: key })), { blank: 'Choose the evidence kind' }),
    },
    { name: 'evidenceId', label: 'Evidence reference', type: 'text', required: true, help: 'The record the figure comes from. A number with no reference cannot be audited later.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
    { name: 'restatesId', label: 'Restates an earlier reading', type: 'select', options: options([], { blank: 'Not a restatement' }), help: 'A restatement names the reading it replaces. If the restated figure no longer meets the target, any award resting on it reads recovery-due.' },
    { name: 'restatementReason', label: 'Why restated? (required for a restatement)', type: 'textarea', help: `At least ${L.textMin} characters.` },
  ]);
  const restates = form.field('restatesId');
  const refreshReadings = () => {
    if (!restates) return;
    const chosen = form.field('measureId')?.value;
    const prior = chosen ? earlier(chosen) : null;
    restates.innerHTML = '';
    restates.appendChild(new Option('Not a restatement', ''));
    // The measure may carry earlier readings; the reader exposes the newest, so a
    // restatement of an older row is entered by its id directly in that case.
    if (prior) restates.appendChild(new Option(`Restate the newest reading (${prior.asOf})`, prior.id));
  };
  form.field('measureId')?.addEventListener('change', refreshReadings);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveRecordReading(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The reading was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Reading recorded. It stands as verified evidence for this measure.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a verified reading',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The hand that benefits does not confirm the figure', body: 'The funding line cannot verify its own measure, and a person who receives an award resting on this measure cannot verify it either. The door proves both against the live reporting graph.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record reading', onClick: submit }],
  });
}

function awardDialog(ctx, report, onDone) {
  const plans = report.plans.filter((row) => row.status === 'live');
  const boot = ctx.api.incentiveCandidates ? ctx.api.incentiveCandidates() : null;
  const awardees = boot && boot.ok !== false ? (boot.awardees || []) : [];
  if (!plans.length) {
    openModal({
      title: 'Record an award',
      body: banner({ tone: 'info', title: 'No live plan on this seat', body: 'An award is paid under a plan. Declare one first.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  if (!awardees.length) {
    openModal({
      title: 'Record an award',
      body: banner({ tone: 'info', title: 'No person is reachable from this seat', body: 'An award names a person this seat holds on the tree or on a declared line — never yourself.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  const measuresFor = (planId) => report.measures.filter((row) => row.planId === planId);
  const form = buildForm([
    {
      name: 'planId', label: 'Plan', type: 'select', required: true,
      options: options(plans.map((row) => ({ value: row.id, label: `${row.label} — ${row.currency}${Number.isSafeInteger(row.overByCents) && row.overByCents > 0 ? ' (over ceiling)' : ''}` })), { blank: 'Choose the plan' }),
    },
    {
      name: 'personId', label: 'For', type: 'select', required: true,
      options: options(awardees.map((row) => ({ value: row.id, label: row.name })), { blank: 'Choose the person' }),
    },
    {
      name: 'basisKind', label: 'Basis', type: 'select', required: true,
      options: options(INC_BASES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the basis' }),
      help: 'Measured awards are refused without a verified reading in force on the decision day. Discretion is legitimate and is counted apart.',
    },
    {
      name: 'measureId', label: 'Measure', type: 'select',
      options: options([], { blank: 'Choose a measure' }),
      help: 'Required for a measured award.',
    },
    { name: 'amount', label: 'Amount', type: 'text', required: true, help: 'Major units, at most two decimals. The register records what was awarded; it does not refuse an expensive award.' },
    { name: 'decidedOn', label: 'Decided on', type: 'date', value: report.asOf, required: true },
    { name: 'rationale', label: 'Written reason (required for discretion)', type: 'textarea', help: `At least ${L.textMin} characters for a discretionary award.` },
  ]);
  const measureField = form.field('measureId');
  const refreshMeasures = () => {
    if (!measureField) return;
    const planId = form.field('planId')?.value;
    measureField.innerHTML = '';
    measureField.appendChild(new Option('Choose a measure', ''));
    for (const row of planId ? measuresFor(planId) : []) {
      measureField.appendChild(new Option(`${row.label} (${row.key})${row.verified ? ' · verified reading stands' : ' · no verified reading'}`, row.id));
    }
  };
  form.field('planId')?.addEventListener('change', refreshMeasures);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveRecordAward(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The award was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Award recorded. The register now prints whether the evidence behind it stands.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record an award',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'What this records, and what it refuses', body: 'It records money decided for one person under one plan. It refuses an award to yourself, an award to a person your lines do not hold, and a measured award with no verified reading behind it. It does not refuse an award that takes the plan over its ceiling — that is printed and escalated instead.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record award', onClick: submit }],
  });
}

function recoveryDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'kind', label: 'Kind', type: 'select', required: true,
      options: options(INC_RECOVERY_KINDS.map((item) => ({ value: item.key, label: item.label })), { blank: 'Choose the kind' }),
    },
    {
      name: 'state', label: 'What is being recorded', type: 'select', required: true,
      options: options(INC_RECOVERY_STATES.map((item) => ({ value: item.key, label: item.label })), { blank: 'Choose the state' }),
    },
    { name: 'amount', label: 'Amount', type: 'text', required: true, help: 'Major units, at most two decimals. A recovery may never exceed the award.' },
    { name: 'on', label: 'Effective on', type: 'date', value: '', required: true, help: 'Not before the award was decided, and not in the future.' },
    { name: 'reason', label: 'Why?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A waiver without a reason reads as an absence, not a decision.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveRecordRecovery({ awardId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The recovery was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recovery recorded. The register never moves the money itself.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a recovery',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A decision with a state, not a deduction', body: 'Demanded records that the money is owed; recovered records that it is back (or was withheld); waived records an executive decision not to pursue it. None of them changes the award.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record', onClick: submit }],
  });
}

function retireDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'on', label: 'Retired on', type: 'date', value: '', required: true },
    { name: 'reason', label: 'Why is the envelope closed?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Its awards and history stay on the record.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.incentiveRetirePlan({ planId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The retirement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Plan retired. It is history now; a new envelope is declared for the next period.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Retire this plan',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Retirement is final and never revives an older envelope', body: 'Awards already made under it stay on the record and still count against its ceiling. What ends is the ability to award on it.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Retire', onClick: submit }],
  });
}

/* ------------------------------------------------------------------- views */

function summaryCard(report) {
  const currencyLine = report.currencies
    .map((row) => `${row.currency} ${centsToDisplay(row.provableCents)} provable of ${centsToDisplay(row.awardedCents)} awarded`)
    .join(' · ');
  return card({
    title: 'What the register holds',
    subtitle: 'Every figure is the reader’s own exact integer. Currencies are never converted or pooled, so each one is named.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Plans in scope', value: h('span', { 'data-testid': 'inc-count-plans' }, String(report.counts.plansLive)), hint: `${report.counts.plansRetired} retired · ${report.counts.plansLive} live` }),
      stat({ label: 'Over ceiling', value: h('span', { 'data-testid': 'inc-count-over' }, String(report.gaps.plansOverCeilingN)), hint: 'awarded above the declared envelope' }),
      stat({ label: 'Measures', value: h('span', { 'data-testid': 'inc-count-measures' }, String(report.counts.measures)), hint: `${report.gaps.measuresOutsideControlN} declared outside the line’s control` }),
      stat({ label: 'Awards', value: h('span', { 'data-testid': 'inc-count-awards' }, String(report.counts.awards)), hint: `${report.counts.recoveries} recovery act(s) recorded` }),
      stat({ label: 'Provable money', value: h('span', { 'data-testid': 'inc-count-provable' }, currencyLine || 'no currency declared'), hint: 'verified reading, target met, not contested, not withheld' }),
      stat({ label: 'Contested outcomes', value: h('span', { 'data-testid': 'inc-count-contests' }, String(report.counts.contests)), hint: 'the same measure key paid by two overlapping plans' }),
      stat({ label: 'Recovery outstanding', value: h('span', { 'data-testid': 'inc-count-recovery' }, String(report.gaps.recoveryOutstandingN)), hint: 'money owed back with no recovery or waiver covering it' }),
      stat({ label: 'Plans unmeasured', value: h('span', { 'data-testid': 'inc-count-unmeasured' }, String(report.gaps.plansWithoutReadingN)), hint: 'live, opened, and no verified reading at all' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'inc-count-attention' }, String(report.attention ?? 0)), hint: report.attentionReason || 'nothing owed by this seat' }),
    ),
  });
}

function claimsBanners(report) {
  const c = report.claims;
  return h('div', { class: 'stack' },
    banner({
      tone: c.countsReconcile ? 'info' : 'bad',
      title: c.countsReconcile
        ? 'The per-plan counts add up to the awards on the record'
        : 'The per-plan counts do not add up to the awards on the record',
      body: `This is the first claim, and it says nothing else: ${c.planAwardsSum} counted per plan, ${c.countedAwardsN} award rows in scope.`,
    }),
    banner({
      tone: c.figuresComplete ? 'good' : 'caution',
      title: c.figuresComplete
        ? 'Coverage is complete: every plan is measured and every award’s evidence stands'
        : 'NOT CERTIFIED — the printed figures are not provably the whole record’s',
      body: c.figuresComplete
        ? 'The second claim, separate from the first: every live plan carries a measure and a verified reading, every award resolves to a live plan and a reading whose verifier is still above the funding line, and nothing is withheld from this seat.'
        : `${[
          c.plansWithoutMeasureN ? `${c.plansWithoutMeasureN} live plan(s) carry no measure` : '',
          c.plansWithoutReadingN ? `${c.plansWithoutReadingN} live plan(s) have no verified reading` : '',
          c.awardsWithoutReadingN ? `${c.awardsWithoutReadingN} award(s) rest on no reading in force` : '',
          c.verifierDriftedN ? `${c.verifierDriftedN} award(s) rest on a verifier the matrix no longer puts above the funding line` : '',
          c.orphanAwardN ? `${c.orphanAwardN} award(s) name a plan that is not readable` : '',
          c.withheldAwardN ? `${c.withheldAwardN} individual award row(s) are withheld at this altitude` : '',
          report.matrixError ? 'the reporting graph could not be read' : '',
        ].filter(Boolean).join('; ')}. A “within ceiling” verdict below is TRUE OF THE AWARDS THIS REGISTER CAN SEE.`,
    }),
    report.scope.scoped
      ? banner({
        tone: 'info',
        title: `Scoped to the lines this seat funds: ${report.scope.plansInScopeN} plan(s)`,
        body: `${report.scope.plansOutsideScopeN} plan(s) on other lines are not in these figures, and ${report.scope.withheldAwardN} award row(s) are counted without individual detail at this altitude. A workspace-wide claim needs the seat above every funding line.`,
      })
      : null,
  );
}

function plansView(ctx, report, onDone) {
  const rows = report.plans.map((row) => ({
    ...row,
    attrs: {
      'data-testid': `inc-plan-${row.id}`,
      'data-verdict': row.verdict,
      'data-ceiling-cents': String(row.ceilingCents),
      'data-awarded-cents': String(row.awardedCents ?? ''),
    },
  }));
  const columns = [
    { label: 'Plan', render: (r) => h('div', null,
      h('strong', null, r.label),
      h('div', { class: 'small muted' }, `${r.ownerName} · ${r.periodFrom} → ${r.periodTo} · ${r.status}`)) },
    { label: 'Ceiling', render: (r) => h('span', { 'data-testid': `inc-ceiling-${r.id}` }, money(r.currency, r.ceilingCents)) },
    { label: 'Awarded', render: (r) => h('span', { 'data-testid': `inc-awarded-${r.id}`, 'data-cents': String(r.awardedCents ?? '') }, money(r.currency, r.awardedCents)) },
    { label: 'Verdict', render: (r) => h('span', { class: 'row gap-s' },
      badge(r.verdict === 'over-ceiling' ? `over by ${money(r.currency, r.overByCents)}` : r.verdict === 'within-ceiling' ? 'within ceiling' : 'unmeasurable',
        r.verdict === 'over-ceiling' ? 'bad' : r.verdict === 'within-ceiling' ? 'good' : 'caution'),
      r.unmeasured ? badge('no verified reading', 'caution') : null) },
    { label: 'Measures', render: (r) => (r.measures.length
      ? h('ul', { class: 'list' }, ...r.measures.map((m) => h('li', null,
        `${m.label} (${m.key}) — ${incDirection(m.direction)?.key === 'increase' ? '≥' : '≤'} ${targetText({ ...m, currency: r.currency })}`,
        h('span', { class: 'small muted' }, ` · control: ${incControl(m.control)?.key || m.control} · ${m.verified ? 'verified reading' : m.readingsN ? 'unverified reading' : 'no reading'}`))))
      : h('span', { class: 'small text-warn' }, 'no measure — this plan pays for nothing yet')) },
    { label: 'Money by state', render: (r) => h('div', { class: 'small' },
      h('div', null, `provable ${money(r.currency, r.provableCents)}`),
      h('div', { class: 'muted' }, `missed ${money(r.currency, r.missedCents)} · discretion ${money(r.currency, r.discretionaryCents)}`),
      h('div', { class: 'muted' }, `unverified ${money(r.currency, r.unverifiedCents)} · recovery due ${money(r.currency, r.recoveryDueCents)}`),
      r.contestedCents ? h('div', { class: 'text-warn' }, `contested ${money(r.currency, r.contestedCents)} — held out of provable`) : null) },
    { label: 'Escalates to', render: (r) => {
      const e = r.escalation;
      const needs = r.verdict === 'over-ceiling' || (r.recoveryOutstandingN || 0) > 0;
      if (!needs) return h('span', { class: 'small muted' }, '—');
      if (e.unique) return h('span', { class: 'small' }, e.apexId);
      if (e.ambiguous) return h('span', { class: 'small' }, `joint apex tie: ${e.apexIds.length} seats, each asked`);
      if (e.disconnected) return h('span', { class: 'small text-warn' }, 'no joint seat above the funding lines');
      return h('span', { class: 'small muted' }, 'no seat resolves');
    } },
    { label: '', render: (r) => (r.status === 'live'
      ? button('Retire', () => retireDialog(ctx, r, onDone), { testid: `inc-retire-${r.id}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'inc-plans' },
    h('div', { class: 'row gap-s' },
      button('Declare a plan', () => declarePlanDialog(ctx, report, onDone), { primary: true, testid: 'inc-declare-plan' }),
      button('Add a measure', () => addMeasureDialog(ctx, report, onDone), { testid: 'inc-add-measure' }),
      button('Record a verified reading', () => readingDialog(ctx, report, onDone), { testid: 'inc-record-reading' }),
      button('Scan the register', () => {
        const result = ctx.api.incentiveScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Owed decisions were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'inc-scan' })),
    table({
      caption: 'Variable-pay plans — the envelope, what was awarded against it, the measures it pays on, and where each currency’s money stands',
      columns,
      rows,
      emptyMessage: 'No variable-pay plan has been declared. Until one is, nothing on this record says what money is paid for.',
    }),
  );
}

function awardsView(ctx, report, onDone) {
  const rows = report.awards.map((row) => ({
    ...row,
    attrs: {
      'data-testid': `inc-award-${row.id}`,
      'data-state': row.state,
      'data-bucket': row.bucket,
      'data-cents': String(row.amountCents ?? ''),
      'data-contested': row.contested ? '1' : '0',
    },
  }));
  const columns = [
    { label: 'For', render: (r) => h('div', null,
      h('strong', null, r.personName || 'withheld'),
      h('div', { class: 'small muted' }, `${r.planLabel} · ${r.currency}`)) },
    { label: 'Measure', render: (r) => (r.measureKey
      ? h('div', null,
        h('div', null, r.measureLabel || r.measureKey),
        h('div', { class: 'small muted' }, `${r.measureKey} · control: ${incControl(r.control)?.key || '—'}`))
      : h('span', { class: 'small muted' }, 'no measure — discretion')) },
    { label: 'Target', render: (r) => h('span', { class: 'small' }, targetText(r)) },
    { label: 'Reading in force', render: (r) => h('div', { class: 'small' },
      h('span', null, actualText(r)),
      r.basisAsOf ? h('div', { class: 'muted' }, `${r.basisAsOf} · verified by ${r.verifiedByName || r.verifiedById || '—'}`) : null,
      r.restated ? h('div', { class: 'text-warn' }, 'restated after the award') : null) },
    { label: 'Amount', render: (r) => h('span', { 'data-testid': `inc-amount-${r.id}`, 'data-cents': String(r.amountCents ?? '') }, amountText(r)) },
    { label: 'State', render: (r) => h('span', { class: 'row gap-s' },
      badge(STATE_SHORT[r.bucket] || r.bucket, STATE_TONE[r.bucket] || 'neutral'),
      r.contested ? badge('contested', 'caution') : null,
      r.state !== r.bucket ? h('span', { class: 'small muted' }, `own state: ${r.state}`) : null) },
    { label: 'Why', render: (r) => h('span', { class: 'small muted' }, r.contested
      ? 'the same outcome is paid by two overlapping plans; both amounts are held out'
      : r.stateReason || 'a verified reading meets the target') },
    { label: 'Recovery', render: (r) => {
      const rec = r.recovery;
      if (!rec.acts.length && !rec.dueCents) return h('span', { class: 'small muted' }, '—');
      return h('div', { class: 'small' },
        rec.dueCents ? h('div', null, `due ${money(r.currency, rec.dueCents)}`) : null,
        rec.outstandingCents ? h('div', { class: 'text-warn' }, `outstanding ${money(r.currency, rec.outstandingCents)}`) : null,
        rec.recordedCents ? h('div', { class: 'muted' }, `recovered ${money(r.currency, rec.recordedCents)}`) : null,
        rec.waivedCents ? h('div', { class: 'muted' }, `waived ${money(r.currency, rec.waivedCents)}`) : null);
    } },
    { label: '', render: (r) => (ctx.api.incentiveRecordRecovery
      ? button('Record a recovery', () => recoveryDialog(ctx, r, onDone), { testid: `inc-recover-${r.id}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  const notes = [];
  if (!report.scope.awardDetail && report.awards.length) {
    notes.push(banner({
      tone: 'info',
      title: `${report.awards.length} award row(s) are counted at this altitude, without individual detail`,
      body: 'Individual variable-pay awards are item detail for the line that funds them. Above the director altitude the register prints counts and money control totals, which are in the summary above.',
    }));
  }
  return h('div', { class: 'stack', 'data-testid': 'inc-awards' },
    ctx.api.incentiveRecordAward ? h('div', { class: 'row' }, button('Record an award', () => awardDialog(ctx, report, onDone), { primary: true, testid: 'inc-record-award' })) : null,
    ...notes,
    table({
      caption: 'Awards — money for a named person, the reading that stood behind it, and what the register can prove',
      columns,
      rows,
      emptyMessage: 'No award has been recorded. A plan with no awards has paid for nothing.',
    }),
  );
}

function queriesView(ctx, report, onDone) {
  const contestRows = report.contests.map((row) => ({
    ...row,
    attrs: { 'data-testid': `inc-contest-${row.key}`, 'data-plans': row.planIds.join(',') },
  }));
  const gapRows = [
    ...report.plans.filter((row) => row.verdict === 'over-ceiling').map((row) => ({
      id: `over-${row.id}`,
      kind: 'Over ceiling',
      what: row.label,
      detail: `${money(row.currency, row.overByCents)} above the declared envelope`,
      tone: 'bad',
    })),
    ...report.plans.filter((row) => row.unmeasured).map((row) => ({
      id: `unmeasured-${row.id}`,
      kind: 'Unmeasured',
      what: row.label,
      detail: 'live and opened, with no verified reading on any measure',
      tone: 'caution',
    })),
    ...report.awards.filter((row) => row.bucket === 'unverified').map((row) => ({
      id: `unverified-${row.id}`,
      kind: 'Unverified',
      what: `${row.personName || 'withheld'} · ${row.measureKey || 'no measure'}`,
      detail: row.stateReason || 'no verified reading stands behind it',
      tone: 'bad',
    })),
    ...report.awards.filter((row) => row.bucket === 'missed').map((row) => ({
      id: `missed-${row.id}`,
      kind: 'Paid on a miss',
      what: `${row.personName || 'withheld'} · ${row.measureKey || 'no measure'}`,
      detail: 'a verified reading stands, and the target was not met',
      tone: 'caution',
    })),
    ...report.awards.filter((row) => row.bucket === 'discretionary').map((row) => ({
      id: `discretion-${row.id}`,
      kind: 'Discretion',
      what: `${row.personName || 'withheld'} · ${row.planLabel}`,
      detail: 'a written human decision outside the measured link; counted apart',
      tone: 'neutral',
    })),
    ...report.measures.filter((row) => row.control === 'outside').map((row) => ({
      id: `outside-${row.id}`,
      kind: 'Line-of-sight gap',
      what: row.label,
      detail: 'the measure is declared outside the funding line’s control',
      tone: 'caution',
    })),
  ];
  return h('div', { class: 'stack', 'data-testid': 'inc-queries' },
    card({
      title: 'One outcome, two envelopes',
      subtitle: 'The matrix case: a person sits on several lines, two plans believe they are paying for the same result. The register names the pair and holds BOTH amounts out of the provable total — it does not pick a winner and does not split the money.',
      body: contestRows.length
        ? table({
          caption: 'Contested outcomes — the same measure key paid by plans whose windows overlap',
          columns: [
            { label: 'Outcome key', render: (r) => h('strong', null, r.key) },
            { label: 'Measure', key: 'label' },
            { label: 'Plans', render: (r) => h('span', { class: 'small' }, r.planIds.join(' · ')) },
            { label: 'Money held out', render: (r) => h('span', null, r.currencies.map((code) => `${code} ${centsToDisplay(r.centsByCurrency[code])}`).join(' · ') || 'withheld') },
            { label: 'Awards', render: (r) => String(r.awardIds.length) },
            { label: 'Asked of', render: (r) => {
              const e = r.escalation;
              if (e.unique) return h('span', { class: 'small' }, e.apexId);
              if (e.ambiguous) return h('span', { class: 'small' }, `joint apex tie: ${e.apexIds.length}`);
              return h('span', { class: 'small text-warn' }, 'no joint seat above both funding lines');
            } },
          ],
          rows: contestRows,
          emptyMessage: 'No outcome is paid by two overlapping plans. This is a real finding: the register checked every measure key on the record.',
        })
        : emptyState({ title: 'No contested outcome', body: 'No measure key is paid by two plans whose windows overlap.' }),
    }),
    card({
      title: 'Everything the register cannot call provable',
      subtitle: 'Each row is a named finding, not a score. None of this money is in the provable total above.',
      body: gapRows.length
        ? table({
          caption: 'Queries — over-ceiling plans, unmeasured plans, unverified and missed awards, discretion, and line-of-sight gaps',
          columns: [
            { label: 'Finding', render: (r) => badge(r.kind, r.tone) },
            { label: 'What', key: 'what' },
            { label: 'Detail', render: (r) => h('span', { class: 'small muted' }, r.detail) },
          ],
          rows: gapRows.map((row) => ({ ...row, attrs: { 'data-testid': `inc-query-${row.id}` } })),
          emptyMessage: 'No finding. Every plan is within its envelope, measured, and every award’s evidence stands.',
        })
        : emptyState({ title: 'No finding', body: 'Every plan is within its envelope, every live plan carries a verified reading, and every award’s evidence stands.' }),
    }),
    card({
      title: 'Money by currency',
      subtitle: 'Every currency gets its own total. The register never converts, never pools and never prints one number across currencies.',
      body: table({
        caption: 'Exact cents by state, per currency',
        columns: [
          { label: 'Currency', key: 'currency' },
          { label: 'Awarded', render: (r) => money(r.currency, r.awardedCents) },
          { label: 'Provable', render: (r) => money(r.currency, r.provableCents) },
          { label: 'Missed', render: (r) => money(r.currency, r.missedCents) },
          { label: 'Discretion', render: (r) => money(r.currency, r.discretionaryCents) },
          { label: 'Unverified', render: (r) => money(r.currency, r.unverifiedCents) },
          { label: 'Contested', render: (r) => money(r.currency, r.contestedCents) },
          { label: 'Recovery due', render: (r) => money(r.currency, r.recoveryDueCents) },
          { label: 'Recovered', render: (r) => money(r.currency, r.recoveryRecordedCents) },
          { label: 'Waived', render: (r) => money(r.currency, r.recoveryWaivedCents) },
        ],
        rows: report.currencies.map((row) => ({ ...row, attrs: { 'data-testid': `inc-currency-${row.currency}` } })),
        emptyMessage: 'No currency is declared on this record yet.',
      }),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'inc-method' },
    card({
      title: 'The register in one picture',
      subtitle: 'A funding line declares an envelope and the measures it pays on. A verified reading meets a target. The award is then provable, missed, discretionary or unverified — and a restatement can turn provable money into money owed back.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Variable-pay integrity: a funding line declares a plan with an exact ceiling and measures with targets and controls; a verifier above the line records a reading; awards are then graded provable, missed, discretionary, unverified or recovery-due; a contested outcome paid by two overlapping plans is held out of the total.', class: 'figure-img', 'data-testid': 'inc-diagram' }),
        h('figcaption', { class: 'small muted' }, 'The headline counts only money whose evidence stands and whose outcome is not contested. Every other state is printed beside it, with its exact cents.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...INC_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'What the page prints, and how', body: h('ul', { class: 'list' }, ...INC_METHOD.printed.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...INC_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderIncentive(ctx) {
  const report = ctx.api.incentiveReport ? ctx.api.incentiveReport() : null;
  if (!report || report.ok === false || !report.claims) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Director / VP · matrix', title: 'Variable-pay integrity', subtitle: 'What does the money pay for — and can the record prove it?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'plans';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'incentive-panel' },
    pageHeader({
      eyebrow: 'Director / VP · single-chain and matrix',
      title: 'What is this money paying for — and can the record prove it?',
      subtitle: 'Each funding line declares an envelope and the outcomes it pays on. A reading verified above the line is what makes a measured award provable. The register prints what it can prove, what it cannot, and where the same outcome is paid twice.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Funding lines cannot be proved right now', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard({ ...report, attention: ctx.api.incentiveAttentionCount ? ctx.api.incentiveAttentionCount() : 0 }),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'plans' ? report.plans.length
          : row.key === 'awards' ? report.awards.length
            : row.key === 'queries' ? report.contests.length : undefined,
      })),
      active: view,
      ariaLabel: 'Variable-pay integrity views',
      onSelect: (key) => ctx.navigate(`${INC_HREF}?view=${key}`),
    }),
    view === 'plans' ? plansView(ctx, report, onDone) : null,
    view === 'awards' ? awardsView(ctx, report, onDone) : null,
    view === 'queries' ? queriesView(ctx, report, onDone) : null,
    view === 'method' ? methodView() : null,
    view === 'plans' && !report.counts.plansTotal
      ? emptyState({ title: 'No plan has been declared', body: 'Declaring one fixes an envelope, a window and a written basis for one funding line. Nothing is inferred from a budget, a merit cycle or a scorecard model.' })
      : null,
    h('p', { class: 'small muted' }, `Engine ${report.engine} · as of ${report.asOf} · ${incUnit('money')?.key === 'money' ? 'money is exact integer cents in the plan’s own currency' : ''}.`),
  );
}

export default renderIncentive;
