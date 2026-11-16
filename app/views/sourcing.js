/**
 * app/views/sourcing.js — `#/sourcing`, the Capability Sourcing & Firm-Boundary
 * Register (ADR-0229, Schema v182, CSV #170).
 *
 * ONE reader (`buildSourcing`) stands behind every total, verdict, premium,
 * hold-up exposure and coverage claim this page prints. The page formats what
 * the reader returned; it computes no sum, no discount, no verdict and no
 * addressee of its own. Where a figure is withheld the page prints the reason
 * the reader gave, never a zero.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  SRC_COST_LINES,
  SRC_METHOD,
  SRC_MODES,
  SRC_ROUTE,
  SRC_SAFEGUARDS,
  SRC_SPECIFICITY,
  SRC_STRATEGIC_WEIGHTS,
  srcCostLinesForMode,
} from '../core/domain/sourcingRegistry.js';
import { centsToDisplay, readStoredCents } from '../core/domain/sourcingSchema.js';

const DIAGRAM_URL = './app/assets/capability-sourcing-boundary.jpg';

const VIEWS = [
  { key: 'cases', label: 'Capability cases' },
  { key: 'compare', label: 'Compare' },
  { key: 'learning', label: 'What we learned' },
  { key: 'method', label: 'Method' },
];

const VERDICT_TONE = Object.fromEntries([
  ['unreadable', 'bad'],
  ['not-comparable', 'bad'],
  ['safeguard-missing', 'bad'],
  ['decision-owed', 'caution'],
  ['mismatch', 'caution'],
  ['decided', 'good'],
  ['decided-premium', 'good'],
]);

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const money = (currency, cents) => {
  const exact = readStoredCents(cents);
  if (exact === null) return 'withheld';
  return `${currency} ${centsToDisplay(exact)}`;
};
const pctBp = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);
const shortMode = (key) => (SRC_MODES.find((row) => row.key === key)?.label || key).split(' — ')[0];

function optionsFrom(rows, blank = null) {
  return [
    ...(blank ? [{ value: '', label: blank }] : []),
    ...rows.map((row) => ({ value: row.key || row.value, label: row.label })),
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
  const submitBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'src-modal-submit', onClick: submit }, submitLabel);
  openModal({ title, description, body: h('div', { class: 'stack' }, intro, form.node), footer: [cancelBtn, submitBtn] });
}

/* -------------------------------------------------------------- the dialogs */

function declareCaseDialog(ctx, onDone) {
  const report = ctx.api.sourcingReport();
  const form = buildForm([
    { name: 'title', label: 'Capability', type: 'text', required: true, help: '12–160 chars. Name the capability the firm would own or buy — not the project, not the vendor.' },
    { name: 'currency', label: 'Currency (3-letter ISO)', type: 'text', required: true, help: 'DKK, EUR, USD. Every option on this case is priced in this currency; nothing is converted.' },
    { name: 'horizonDays', label: 'Horizon (days)', type: 'number', required: true, help: '30–3650. Both sides are capitalised over this one horizon. A 5-year build is never compared with a 1-year licence.' },
    { name: 'discountBp', label: 'Declared discount rate (basis points)', type: 'number', help: 'Whole basis points, 0–10000. 800 = 8%. A rate the record does not state cannot be assumed.' },
    { name: 'specificity', label: 'Asset specificity', type: 'select', required: true, options: optionsFrom(SRC_SPECIFICITY, 'Choose the specificity…'), help: 'The variable the whole boundary decision turns on. Specificity is a property of the asset, never of the team.' },
    { name: 'weight', label: 'Strategic weight', type: 'select', required: true, options: optionsFrom(SRC_STRATEGIC_WEIGHTS, 'Choose the weight…'), help: 'Differentiating, supporting or context — the core/context test, applied to the work.' },
    { name: 'ownerId', label: 'Capability owner', type: 'select', options: optionsFrom(((ctx.api.peopleList ? ctx.api.peopleList() : []) || []).map((p) => ({ key: p.id, label: `${p.name} (${p.id})` })), 'This seat') },
    { name: 'reviewOn', label: 'Review date (YYYY-MM-DD)', type: 'date', help: 'When these assumptions will be graded against what actually landed. Defaults to one year out.' },
    { name: 'reason', label: 'Why this boundary question is open (≥ 24 chars)', type: 'textarea', required: true, help: 'The written basis. A boundary question with no basis is a preference.' },
  ]);
  openFormModal({
    title: 'Declare a capability case',
    submitLabel: 'Declare case',
    form,
    onSubmit(values) {
      const res = ctx.api.sourcingDeclareCase({
        title: values.title,
        currency: values.currency,
        horizonDays: Number(values.horizonDays),
        discountBp: values.discountBp === '' || values.discountBp === undefined ? 0 : Number(values.discountBp),
        specificity: values.specificity,
        weight: values.weight,
        ownerId: values.ownerId || undefined,
        reviewOn: values.reviewOn || undefined,
        reason: values.reason,
      });
      if (res?.ok) {
        toast('Capability case declared. Record at least one option on each side you intend to compare.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function recordOptionDialog(ctx, caseRow, onDone) {
  const mode = 'make';
  const form = buildForm([
    { name: 'mode', label: 'Sourcing mode', type: 'select', required: true, options: optionsFrom(SRC_MODES, 'Choose the mode…'), help: 'Make, buy, partner or hybrid. A cost line that does not belong to the chosen mode is refused.' },
    { name: 'note', label: 'What this option actually is (≥ 24 chars)', type: 'textarea', required: true, help: 'A total with no description cannot be compared with anything.' },
    { name: 'build-effort', label: 'Incremental build effort — one-time', type: 'text', help: 'Major units, e.g. 486000 or 486000.25. Leave blank to omit the line.' },
    { name: 'build-tooling', label: 'Build tooling & licences — one-time', type: 'text' },
    { name: 'run-team', label: 'Run & maintain, per year', type: 'text' },
    { name: 'run-infrastructure', label: 'Running infrastructure, per year', type: 'text' },
    { name: 'reinvest', label: 'Reinvestment to stay current, per year', type: 'text' },
    { name: 'licence', label: 'Licence / subscription, per year', type: 'text' },
    { name: 'implementation', label: 'Implementation & configuration — one-time', type: 'text' },
    { name: 'integration', label: 'Integration with our systems — one-time', type: 'text' },
    { name: 'migration', label: 'Migration off the incumbent — one-time', type: 'text' },
    { name: 'onboarding', label: 'Training & onboarding — one-time', type: 'text' },
    { name: 'support', label: 'Support tier & professional services, per year', type: 'text' },
    { name: 'exit-reserve', label: 'Exit / lock-in reserve, per year', type: 'text' },
    { name: 'transition', label: 'Transition & dual-running — one-time', type: 'text' },
    { name: 'safeguards', label: 'Contract safeguards', type: 'multiselect', options: SRC_SAFEGUARDS.map((row) => ({ value: row.key, label: row.label })), help: 'A safeguard that cannot answer this case’s declared specificity is printed as not answering it — it is never counted as reassurance.' },
  ]);
  openFormModal({
    title: `Record an option — ${caseRow.title}`,
    description: `Priced in ${caseRow.currency} over ${caseRow.horizonDays} days. Lines that belong to another mode are refused, and a third decimal place is refused rather than rounded.`,
    submitLabel: 'Record option',
    form,
    onSubmit(values) {
      const lines = [];
      for (const row of SRC_COST_LINES) {
        const raw = values[row.key];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        lines.push({ key: row.key, amount: String(raw).trim() });
      }
      const res = ctx.api.sourcingRecordOption({
        caseId: caseRow.id,
        mode: values.mode || mode,
        note: values.note,
        lines,
        safeguards: Array.isArray(values.safeguards) ? values.safeguards : (values.safeguards ? [values.safeguards] : []),
      });
      if (res?.ok) {
        toast('Option priced against the case’s own terms.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function decideDialog(ctx, caseRow, onDone) {
  const priced = caseRow.options.filter((option) => option.comparable);
  if (!priced.length) {
    toast('No option on this case is priced on the case’s own terms, so there is nothing to decide between.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'optionId',
      label: 'Adopt which option',
      type: 'select',
      required: true,
      options: priced.map((option) => ({
        value: option.id,
        label: `${shortMode(option.mode)} — ${money(caseRow.currency, option.totalCents)}${option.answered ? ' · specificity answered' : ' · specificity NOT answered'}`,
      })),
      help: 'Only options priced on this case’s own currency, horizon and discount rate can be decided.',
    },
    { name: 'rationale', label: 'Written basis for the boundary decision (≥ 24 chars)', type: 'textarea', required: true, help: 'Three years from now this sentence is the only record of why the firm owns — or does not own — this capability.' },
    { name: 'safeguards', label: 'Contract safeguards recorded with the decision', type: 'multiselect', options: SRC_SAFEGUARDS.map((row) => ({ value: row.key, label: row.label })) },
  ]);
  openFormModal({
    title: `Decide the boundary question — ${caseRow.title}`,
    description: 'Only the chief altitude moves the boundary of the firm, and the decision is filed against the joint seat above every line the capability touches.',
    submitLabel: 'Record decision',
    form,
    onSubmit(values) {
      const res = ctx.api.sourcingDecide(caseRow.id, values.optionId, {
        rationale: values.rationale,
        safeguards: Array.isArray(values.safeguards) ? values.safeguards : (values.safeguards ? [values.safeguards] : []),
      });
      if (res?.ok) {
        toast('Boundary decision recorded.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function gradeDialog(ctx, caseRow, onDone) {
  const form = buildForm([
    { name: 'actualMake', label: 'What make actually cost — total, major units', type: 'text', help: 'The realised present-value-equivalent total over the declared horizon. Leave blank if make was never run.' },
    { name: 'actualBuy', label: 'What buy actually cost — total, major units', type: 'text', help: 'The realised total over the same horizon. Leave blank if buy was never run.' },
    { name: 'lesson', label: 'What this case taught (≥ 24 chars)', type: 'textarea', required: true, help: 'A delta with no lesson is a number the next decision cannot use.' },
  ]);
  openFormModal({
    title: `Grade the frozen assumptions — ${caseRow.title}`,
    description: 'A grade is recorded once, after the review date, so it cannot be revised after the result is known.',
    submitLabel: 'Record grade',
    form,
    onSubmit(values) {
      const res = ctx.api.sourcingGrade(caseRow.id, { actualMake: values.actualMake, actualBuy: values.actualBuy, lesson: values.lesson });
      if (res?.ok) {
        toast('Grade recorded against the frozen assumptions.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* ---------------------------------------------------------------- the views */

function summaryStrip(report, attention) {
  return h('div', { class: 'stat-grid', 'data-testid': 'src-summary' },
    stat({ label: 'Capability cases', value: report.coverage.liveN, hint: `${report.coverage.withdrawnN} withdrawn` }),
    stat({ label: 'Decision owed', value: report.coverage.decisionOwedN, tone: report.coverage.decisionOwedN ? 'warn' : '', hint: 'Both sides priced, no boundary decision on the record' }),
    stat({ label: 'Hold-up unaddressed', value: report.coverage.holdUpUnaddressedN, tone: report.coverage.holdUpUnaddressedN ? 'bad' : '', hint: 'Specificity no recorded safeguard answers' }),
    stat({ label: 'Targets open', value: attention, hint: 'Conditions that owe a human something' }),
    stat({
      label: 'Figures complete',
      value: report.figuresComplete ? 'yes' : 'no',
      tone: report.figuresComplete ? 'good' : 'warn',
      hint: report.figuresComplete
        ? 'No row dropped and no option excluded'
        : `${report.coverage.excludedOptionN} option(s) priced a different question; ${report.coverage.refusedLineN} cost line(s) refused`,
    }),
  );
}

function casesView(ctx, report, onDone) {
  const columns = [
    { key: 'capability', label: 'Capability' },
    { key: 'specificity', label: 'Specificity' },
    { key: 'verdict', label: 'Verdict' },
    { key: 'cheapest', label: 'Cheapest comparable' },
    { key: 'chosen', label: 'Chosen' },
    { key: 'premium', label: 'Premium' },
    { key: 'actions', label: 'Actions' },
  ];
  const rows = report.visibleRows.map((row) => ({
    capability: h('div', { class: 'stack-xs' },
      h('strong', null, row.title),
      h('span', { class: 'small muted' }, `${row.currency} · ${row.horizonDays} days · ${row.options.length} option(s)`),
      h('span', { class: 'small muted' }, row.weightLabel)),
    specificity: h('div', { class: 'stack-xs' },
      badge(SRC_SPECIFICITY.find((s) => s.key === row.specificity)?.label?.split(' — ')[0] || row.specificity, row.holdUp.unaddressed ? 'bad' : 'neutral'),
      h('span', { class: 'small muted' }, row.holdUp.unaddressed ? 'no safeguard answers it' : 'answered')),
    verdict: h('div', { class: 'stack-xs' },
      badge(row.verdictLabel.split(' — ')[0], VERDICT_TONE[row.verdict] || 'neutral'),
      h('span', { class: 'small muted' }, row.verdictReason)),
    cheapest: row.cheapest.cents !== null
      ? h('div', { class: 'stack-xs' },
        h('span', null, money(row.currency, row.cheapest.cents)),
        h('span', { class: 'small muted' }, row.cheapest.tied ? `tie: ${row.cheapest.modes.map(shortMode).join(' / ')}` : shortMode(row.cheapest.modes[0])))
      : h('span', { class: 'small muted' }, 'no comparable option'),
    chosen: row.decision
      ? h('div', { class: 'stack-xs' },
        h('span', null, shortMode(row.decision.mode)),
        h('span', { class: 'small muted' }, row.decidedOption?.totalCents !== null && row.decidedOption ? money(row.currency, row.decidedOption.totalCents) : 'withheld'))
      : h('span', { class: 'small muted' }, 'owed'),
    premium: row.premiumCents === null
      ? h('span', { class: 'small muted' }, '—')
      : h('div', { class: 'stack-xs' },
        h('span', null, money(row.currency, row.premiumCents)),
        h('span', { class: 'small muted' }, pctBp(row.premiumBp))),
    actions: h('div', { class: 'row gap-s wrap' },
      !row.decision && !row.withdrawn ? button('Record option', () => recordOptionDialog(ctx, row, onDone)) : null,
      !row.decision && !row.withdrawn && row.options.length ? button('Decide', () => decideDialog(ctx, row, onDone), { primary: true }) : null,
      row.gradeOwed ? button('Grade', () => gradeDialog(ctx, row, onDone)) : null),
  }));

  return card({
    title: 'Every declared capability, and where it sits relative to the firm',
    subtitle: 'The register computes the comparison the leader declared. It never recommends a mode and never blocks a decision.',
    actions: [button('Declare a capability case', () => declareCaseDialog(ctx, onDone), { primary: true, testid: 'src-declare' })],
    body: report.visibleRows.length
      ? table({ columns, rows, caption: 'Capability cases' })
      : emptyState({
        title: 'No capability case is declared',
        body: 'A boundary decision starts by naming a capability, its currency, its horizon and its asset specificity. Nothing is inferred from a budget, a vendor or an existing contract.',
        action: button('Declare a capability case', () => declareCaseDialog(ctx, onDone), { primary: true }),
      }),
  });
}

function compareView(report) {
  const live = report.visibleRows.filter((row) => !row.withdrawn && row.options.length);
  if (!live.length) {
    return card({ title: 'Side-by-side', body: emptyState({ title: 'Nothing to compare yet', body: 'Record at least one option on a case to see it priced.' }) });
  }
  return h('div', { class: 'stack' }, ...live.map((row) => {
    const columns = [
      { key: 'mode', label: 'Mode' },
      { key: 'oneTime', label: 'One-time' },
      { key: 'recurring', label: 'Per year' },
      { key: 'total', label: `Total over ${row.horizonDays} days` },
      { key: 'safeguards', label: 'Safeguards answering' },
    ];
    const rows = row.options.map((option) => ({
      mode: h('div', { class: 'stack-xs' },
        h('span', null, shortMode(option.mode)),
        h('span', { class: 'small muted' }, option.note)),
      oneTime: money(option.currency, option.oneTimeCents),
      recurring: money(option.currency, option.recurringCents),
      total: option.comparable
        ? h('strong', null, money(option.currency, option.totalCents))
        : h('div', { class: 'stack-xs' },
          h('span', { class: 'small muted' }, 'not comparable'),
          h('span', { class: 'small muted' }, option.mismatches.join(', '))),
      safeguards: option.answeringBp
        ? h('div', { class: 'stack-xs' },
          h('span', null, option.safeguards.map((key) => SRC_SAFEGUARDS.find((s) => s.key === key)?.label?.split(' — ')[0] || key).join(' · ')),
          h('span', { class: 'small muted' }, `${option.answeringSafeguards.length} answer(s) ${row.specificity} specificity`))
        : h('div', { class: 'stack-xs' },
          h('span', { class: 'small muted' }, option.safeguards.length ? 'safeguards recorded, none answers this specificity' : 'no safeguard recorded'),
          row.holdUp.needsSafeguard ? badge('hold-up exposure', 'bad') : null),
    }));
    return card({
      title: row.title,
      subtitle: `${row.currency} · ${row.horizonDays} days at ${pctBp(row.discountBp)} · ${row.specificityLabel}`,
      body: h('div', { class: 'stack' },
        table({ columns, rows, caption: `Options for ${row.title}` }),
        h('p', { class: 'small muted' }, row.holdUp.basis)),
    });
  }));
}

function learningView(report) {
  const cal = report.calibration;
  const graded = report.visibleRows.filter((row) => row.grading);
  return h('div', { class: 'stack' },
    card({
      title: 'What our own assumptions have been worth',
      subtitle: 'Each case is graded once, after its review date, against the cost that actually landed.',
      body: cal.readable
        ? h('div', { class: 'stat-grid' },
          stat({ label: 'Graded cases', value: cal.gradedN }),
          stat({ label: 'Mean bias vs. frozen', value: `${(cal.meanBiasBp / 100).toFixed(2)}%`, tone: cal.meanBiasBp > 0 ? 'warn' : 'good', hint: cal.meanBiasBp > 0 ? 'Costs came in above the frozen assumption on average' : 'Costs came in at or below the frozen assumption on average' }),
          stat({ label: 'Median bias', value: `${(cal.medianBiasBp / 100).toFixed(2)}%` }),
          stat({ label: `Within ±${cal.bandBp / 100}%`, value: `${cal.withinBandPct}%`, hint: `${cal.withinBandN} of ${cal.samplesN} side(s)` }))
        : banner({ tone: 'info', title: 'No calibration figure is printed', body: cal.reason }),
    }),
    graded.length
      ? card({
        title: 'Graded cases',
        body: table({
          columns: [
            { key: 'capability', label: 'Capability' },
            { key: 'gradedOn', label: 'Graded' },
            { key: 'bias', label: 'Assumption vs. actual' },
            { key: 'lesson', label: 'What it taught' },
          ],
          rows: graded.map((row) => ({
            capability: row.title,
            gradedOn: row.grading.at,
            bias: h('div', { class: 'stack-xs' }, ...row.grading.sides.map((side) => h('span', null,
              `${shortMode(side)}: frozen ${money(row.currency, row.grading.perSide[side].frozenCents)} → actual ${money(row.currency, row.grading.perSide[side].actualCents)} (${pctBp(row.grading.perSide[side].biasBp)})`))),
            lesson: row.grading.lesson,
          })),
          caption: 'Graded sourcing cases',
        }),
      })
      : card({ title: 'Graded cases', body: emptyState({ title: 'Nothing graded yet', body: 'A case becomes gradeable on its declared review date. Until then its assumptions are frozen, not scored.' }) }),
  );
}

function methodView() {
  const weave = SRC_METHOD.frameworks.map((line, i) => h('li', null, line));
  return h('div', { class: 'stack' },
    h('img', { src: DIAGRAM_URL, alt: 'The boundary of the firm: asset specificity (none, low, mixed, high, site) on the horizontal axis against safeguard strength on the vertical, with the four sourcing modes marked as bands and six safeguards drawn as spans over the specificity steps they can actually answer — exit plan over low and mixed, escrow over mixed and high, second source and fixed price over low to high, joint ownership over mixed to site, co-located handover over site only. No safeguard answers “none”, and an escrow cannot move a plant.', class: 'method-figure' }),
    card({
      title: 'Frameworks applied — named, not paraphrased',
      body: h('ul', { class: 'list' }, ...weave),
    }),
    card({
      title: 'What this page prints, and how',
      body: h('ul', { class: 'list' }, ...SRC_METHOD.printed.map((line) => h('li', null, line))),
    }),
    card({
      title: 'What it deliberately does not do',
      body: h('ul', { class: 'list' }, ...SRC_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
    }));
}

export function renderSourcing(ctx) {
  const res = ctx.api.sourcingReport ? ctx.api.sourcingReport() : null;
  if (!res || res.ok === false || !res.report) {
    return h('div', { class: 'page' },
      pageHeader({
        eyebrow: 'CEO / C-suite · single-chain and matrix',
        title: 'Capability sourcing register',
        subtitle: 'What does this company do itself, and what does it buy?',
      }),
      banner({ tone: 'bad', title: 'The register could not be read', body: res?.error || 'Resolve a valid operating seat to read this register.' }));
  }
  const report = res.report;
  const requested = ctx.query?.get?.('view');
  const activeTab = VIEWS.some((v) => v.key === requested) ? requested : 'cases';
  const attentionRes = ctx.api.sourcingAttentionCount ? ctx.api.sourcingAttentionCount() : { count: 0 };
  const attention = typeof attentionRes === 'number' ? attentionRes : (attentionRes?.count || 0);
  const onDone = () => ctx.refresh?.();

  return h('div', { class: 'page', 'data-testid': 'sourcing-panel' },
    pageHeader({
      eyebrow: 'CEO / C-suite · single-chain and matrix',
      title: 'What does this company do itself, and what does it buy?',
      subtitle: 'The boundary of the firm is decided on asset specificity and the safeguards a contract can carry — not on which column is cheaper. Every total is total cost of ownership on both sides, over one declared horizon, in one currency, at one declared discount rate.',
    }),
    ctx.persistError ? banner({ tone: 'caution', title: 'Persistence warning', body: `Changes are not being persisted: ${ctx.persistError}` }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Reporting graph unreadable', body: report.matrixError }) : null,
    ...(report.warnings || []).map((w) => banner({ tone: 'caution', title: 'Malformed stored row refused', body: w })),
    report.withheldN
      ? banner({ tone: 'info', title: `${report.withheldN} case(s) withheld from this seat`, body: 'A sourcing case reaches a seat only through a line it holds, or a line above it in the reporting tree. Nothing sideways is disclosed.' })
      : null,
    summaryStrip(report, attention),
    h('div', { class: 'stat-grid' },
      ...report.byCurrency.map((row) => stat({
        label: `${row.currency} chosen vs. cheapest`,
        value: row.chosenTotalCents === null ? 'withheld' : money(row.currency, row.chosenTotalCents),
        hint: row.premiumTotalCents === null
          ? `${row.decided} decided case(s)`
          : `cheapest ${money(row.currency, row.cheapestTotalCents)} · premium ${money(row.currency, row.premiumTotalCents)} (${pctBp(row.premiumBp)})`,
      }))),
    tabs({
      items: VIEWS.map((v) => ({
        key: v.key,
        label: v.label,
        count: v.key === 'cases' ? report.coverage.liveN
          : v.key === 'compare' ? report.counts.options
            : v.key === 'learning' ? report.coverage.gradedN
              : undefined,
      })),
      active: activeTab,
      ariaLabel: 'Capability sourcing register views',
      onSelect: (key) => ctx.navigate(`${SRC_ROUTE}?view=${key}`),
    }),
    activeTab === 'cases' ? casesView(ctx, report, onDone) : null,
    activeTab === 'compare' ? compareView(report) : null,
    activeTab === 'learning' ? learningView(report) : null,
    activeTab === 'method' ? methodView() : null,
    h('p', { class: 'small muted' }, `Engine ${report.engine} · ${report.rule} · as of ${report.asOf} · “the figures add up” is ${report.totalsReconcile ? 'true' : 'FALSE'} and “every row was printed” is ${report.figuresComplete ? 'true' : 'false'} — two different claims, reported apart.`),
  );
}

export default renderSourcing;
