/**
 * app/views/capitalRationingPanel.js — `#/finance?panel=rationing`, the Capital
 * Rationing & Funded-Set Register (Weingartner 1963; Dantzig 1957; Lorie &
 * Savage 1955; Kellerer, Pferschy & Pisinger 2004) (ADR-0211, Schema v165,
 * CSV scope #153, `RULE-CRS-01`).
 *
 * One reader (`buildCapitalRationing`) is behind every figure here. Nothing is
 * recomputed in this file: it formats whole cents and whole basis points that the
 * reader already computed, so what the screen prints is what was computed, and a
 * figure that cannot be claimed prints a dash with its sentence — never a zero.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART, because merging them is how a
 * rationing screen lies:
 *   1. what the CEILING is      — declared by a human, or named as absent;
 *   2. what the SEARCH proved   — a set, or a refusal with its reason;
 *   3. what the SHORTCUT cost   — the exact gap to the profitability-index order.
 * A proven set and a refused search never share a word, and a currency with no
 * ceiling never reads as "everything fits".
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  capitalPercentBp,
  capitalRationingBriefText,
} from '../core/domain/capitalRationing.js';
import { investmentMoney, investmentRatio } from '../core/domain/investmentCase.js';
import {
  CAPITAL_RATIONING_BOUNDS,
  CAPITAL_RATIONING_CSV_COLUMNS,
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RATIONING_METHOD,
  CAPITAL_RATIONING_REFUSALS,
  CAPITAL_RATIONING_RULE_ID,
  CAPITAL_RATIONING_SETTING_KEYS,
  CAPITAL_RELATION_KINDS,
  capitalRelationKindByKey,
} from '../core/domain/capitalRationingRegistry.js';

const DIAGRAM_URL = './app/assets/capital-rationing-funded-set.jpg';
const L = CAPITAL_RATIONING_LIMITS;

const VIEWS = Object.freeze([
  Object.freeze({ key: 'funded', label: 'Funded sets' }),
  Object.freeze({ key: 'constraint', label: 'Ceilings & relations' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The capital-rationing act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/* ----------------------------------------------------------------- dialogs */

function declareCeiling(ctx, candidates) {
  const today = candidates.today;
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const form = buildForm([
    { name: 'currency', label: 'Currency', type: 'select', required: true, options: candidates.currencies.length ? candidates.currencies.map((code) => ({ value: code, label: code })) : [{ value: '', label: '— no currency on the record yet —' }], value: candidates.currencies[0] || '', help: 'One ceiling, one currency. Nothing is converted and no ceiling is pooled with another.' },
    { name: 'amountText', label: 'How much may be committed', type: 'text', required: true, placeholder: '40000000', help: 'A whole amount with at most two decimals. No thousands separator, no exponent. An amount the register cannot read exactly is refused, not rounded.' },
    { name: 'periodFrom', label: 'Period starts', type: 'date', required: true, value: `${today.slice(0, 4)}-01-01`, help: 'A ceiling covers a stated period, not an open commitment.' },
    { name: 'periodTo', label: 'Period ends', type: 'date', required: true, value: yearEnd, help: `At most ${L.periodMaxDays} days (two years). A longer one is not a decision, it is a decade.` },
    { name: 'basis', label: 'The basis of this ceiling', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters — the board approval, the treasury limit, the covenant it comes from. A ceiling with no basis is a number somebody typed.` },
  ]);
  openModal({
    title: 'Declare a capital ceiling',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A constraint, not a promise', body: 'A ceiling says how much money may be committed in this currency over this period. It does not fund any case, and it is deliberately never inferred from the sum of the budget envelopes: an envelope is an authority to spend on operations and a capital ceiling is a claim on the balance sheet.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-ceiling-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.capitalRationingDeclareCeiling({ currency: v.currency, amountText: v.amountText, periodFrom: v.periodFrom, periodTo: v.periodTo, basis: v.basis }), 'Capital ceiling declared. Every funded set in that currency is now computed against it.', form);
        },
      }, 'Declare the ceiling'),
    ],
  });
}

function declareRelation(ctx, candidates) {
  if (!candidates.pairs.length) {
    toast('At least two ratified cases must be in the same currency before a relation between them can be declared.', 'bad');
    return;
  }
  const pairOptions = candidates.pairs.map((pair, index) => ({
    value: String(index),
    label: `${pair.currency} · ${pair.aTitle} ↔ ${pair.bTitle}`,
  }));
  const form = buildForm([
    { name: 'pair', label: 'The two cases', type: 'select', required: true, options: pairOptions, value: '0', help: 'Both must already be ratified and undecided. A relation between a ratified and an unratified case is refused.' },
    { name: 'kind', label: 'What is the relation between them?', type: 'select', required: true, options: CAPITAL_RELATION_KINDS.map((row) => ({ value: row.key, label: `${row.label} — ${row.says}` })), value: 'exclusive' },
    { name: 'overlapPct', label: 'Shared share, % (only for “shared benefit”)', type: 'text', placeholder: '25', help: 'A percentage with at most two decimals, strictly between 0 and 100. A share of 100% is not a shared benefit — the two cases are alternatives, and the register refuses it here by name.' },
    { name: 'reason', label: 'Why do these two cases stand in this relation?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters. This register cannot read a relation from the flows, so it is not read at all unless a person says it.` },
  ]);
  openModal({
    title: 'Declare a relation between two cases',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The constraint only a human can state', body: 'Exclusivity, dependency and shared benefit are facts about intent, not about arithmetic. Declaring one changes what the funded set may contain; it never changes a case or its appraisal. You must hold BOTH cases’ benefit owners — through your tree or a declared reporting line — because a line that holds one side only would be ruling on its own alternative.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-relation-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          const pair = candidates.pairs[Number(v.pair)] || candidates.pairs[0];
          const payload = { aCaseId: pair.aCaseId, bCaseId: pair.bCaseId, kind: v.kind, reason: v.reason };
          if (v.kind === 'overlap') {
            const pct = Number(String(v.overlapPct || '').replace('%', '').trim());
            if (Number.isFinite(pct)) payload.overlapBp = Math.round(pct * 100);
          }
          finish(ctx, ctx.api.capitalRationingDeclareRelation(payload), 'Relation declared. Every funded set in that currency is now solved under it.', form);
        },
      }, 'Declare the relation'),
    ],
  });
}

function retireCeiling(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this ceiling retired?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters. A retirement without a reason is a deletion wearing a date.` }]);
  openModal({
    title: 'Retire this capital ceiling',
    body: h('div', { class: 'stack' },
      h('p', null, `${row.currency} ${investmentMoney(row.currency, row.cents)} over ${row.period}. Retiring keeps the declaration on the record with your reason; every funded set in that currency stops being cut off against it.`),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-ceiling-retire-save', onClick: () => { form.clearErrors(); finish(ctx, ctx.api.capitalRationingRetireCeiling({ ceilingId: row.id, reason: form.getValues().reason }), 'Ceiling retired, with its reason.', form); } }, 'Retire'),
    ],
  });
}

function retireRelation(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this relation retired?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters. A retirement without a reason is a deletion wearing a date.` }]);
  openModal({
    title: 'Retire this relation',
    body: h('div', { class: 'stack' },
      h('p', null, `${row.kindMeta?.label || row.kind}, declared ${row.declaredOn} by ${row.declaredByName}. Retiring keeps the declaration on the record with your reason; the funded set stops being solved under it.`),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-relation-retire-save', onClick: () => { form.clearErrors(); finish(ctx, ctx.api.capitalRationingRetireRelation({ relationId: row.id, reason: form.getValues().reason }), 'Relation retired, with its reason.', form); } }, 'Retire'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const K = CAPITAL_RATIONING_SETTING_KEYS;
  const [min, max] = CAPITAL_RATIONING_BOUNDS.askDueDays;
  const form = buildForm([
    { name: 'askDueDays', label: 'Days a ceiling ask is due within', type: 'number', min, max, step: 1, value: report.conventions[K.askDueDays], help: `A whole number from ${min} to ${max}. A value outside it is refused, never clamped.` },
    { name: 'autoPropagate', label: `Rationing automation (${CAPITAL_RATIONING_RULE_ID})`, type: 'select', options: [{ value: 'on', label: 'On — a currency with no ceiling becomes one dated ask' }, { value: 'off', label: 'Paused — the gap is printed here only' }], value: report.conventions[K.autoPropagate] ? 'on' : 'off', help: 'A pause governs every path, including the explicit scan. This rule reads the reporting graph, so pausing it reaches every reporting line under the seat that may declare a ceiling.' },
  ]);
  openModal({
    title: 'Capital-rationing conventions',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-conventions-save',
        onClick: () => {
          const v = form.getValues();
          const days = /^\d+$/.test(String(v.askDueDays).trim()) ? Number(v.askDueDays) : NaN;
          finish(ctx, ctx.api.capitalRationingSetConventions({ [K.askDueDays]: days, [K.autoPropagate]: v.autoPropagate === 'on' }), 'Conventions saved.');
        },
      }, 'Save'),
    ],
  });
}

function downloadCsv(ctx, today) {
  const result = ctx.api.capitalRationingCsvRows();
  if (!result?.ok) { toast(result?.error || 'The capital-rationing export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-capital-rationing-funded-sets-${today}.csv`,
    text: serializeCsv(CAPITAL_RATIONING_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Identity-free CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.capitalRationingBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Capital rationing — brief',
    body: h('pre', { class: 'brief-text', tabindex: '0', 'data-testid': 'rationing-brief' }, capitalRationingBriefText(result.report) || result.text),
    footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close')],
  });
}

/* ------------------------------------------------------------------- cards */

function planTable(row) {
  const proven = row.plan && !row.plan.refused;
  if (!proven) return null;
  const p = row.plan;
  return table({
    caption: `The proven funded set for ${row.currency}`,
    columns: [
      { label: 'Case', render: (c) => `${c.code} · ${c.title}` },
      { label: 'Owner', render: (c) => `${c.ownerName}${c.multiLineOwner ? ' (multi-line)' : ''}` },
      { label: 'Status', render: (c) => badge(c.statusMeta?.label || c.status, c.statusMeta?.tone || 'neutral') },
      { label: 'Money committed', className: 'num', render: (c) => investmentMoney(row.currency, c.outlayCents) },
      { label: 'Present value', className: 'num', render: (c) => investmentMoney(row.currency, c.npvCents) },
      { label: 'Value per unit in', className: 'num', render: (c) => investmentRatio(c.piPermille) },
      { label: 'In the set', render: (c) => (c.selected ? badge('funded', 'good') : c.tooHeavy ? badge('over the whole ceiling', 'bad', 'This case commits more than the entire declared ceiling, so it cannot be in any feasible set.') : badge('not funded', 'neutral')) },
    ],
    rows: [...p.selected, ...p.notSelected].map((c) => ({ ...c, attrs: { 'data-testid': `rationing-case-${c.code}` } })),
    emptyMessage: 'No candidate.',
  });
}

function currencyCard(ctx, row, report) {
  const proven = row.plan && !row.plan.refused;
  const actions = [badge(row.stateMeta.label, row.stateMeta.tone)];
  if (row.ceiling?.ambiguous) actions.push(badge(`${row.ceiling.othersN + 1} live ceilings`, 'warn', 'More than one declared ceiling covers today. The register prints both and refuses to pick one.'));
  const stats = [
    stat({ label: 'Declared ceiling', value: row.ceiling ? investmentMoney(row.currency, row.ceiling.cents) : '—', tone: row.ceiling ? '' : 'warn', hint: row.ceiling ? `${row.ceiling.periodFrom} → ${row.ceiling.periodTo}` : 'nobody has declared one' }),
    stat({ label: 'Asked by candidates', value: investmentMoney(row.currency, row.askCents), hint: `${row.candidatesN} ratified case(s)` }),
    stat({ label: proven ? 'In the proven set' : 'Selected', value: proven ? investmentMoney(row.currency, row.plan.weightCents) : '—', hint: proven ? `${row.plan.selected.length} of ${row.candidatesN}` : row.stateMeta.label }),
    stat({ label: 'Present value of the set', value: proven ? investmentMoney(row.currency, row.plan.valueCents) : '—', tone: proven && row.plan.valueCents < 0 ? 'bad' : '', hint: 'proven maximum' }),
    stat({ label: 'Headroom left', value: proven ? investmentMoney(row.currency, row.plan.headroomCents) : '—', hint: proven ? 'unspent, not saved' : '—' }),
    stat({ label: 'One more unit of ceiling is worth', value: row.shadow ? investmentMoney(row.currency, row.shadow.deltaCents) : '—', hint: row.shadow ? (row.shadow.deltaCents === 0 ? 'the ceiling is not binding here' : `an exact finite difference, ${capitalPercentBp(row.shadow.shadowBp)} per unit`) : (row.shadowRefusal || '—') }),
  ];
  return card({
    title: `${row.currency} — ${proven ? 'a proven funded set' : row.stateMeta.label}`,
    subtitle: row.ceiling
      ? `Ceiling ${investmentMoney(row.currency, row.ceiling.cents)} over ${row.ceiling.period} · declared ${row.ceiling.declaredOn} by ${row.ceiling.declaredByName} · ${row.ceiling.basis}`
      : row.stateMeta.says,
    actions,
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-row' }, ...stats),
      !proven && row.stateKey !== 'no-candidates'
        ? banner({ tone: row.stateKey === 'no-ceiling' ? 'warn' : 'bad', title: row.stateMeta.label, body: `${row.stateMeta.says}${row.plan?.refused && row.plan.reason ? ` ${row.plan.reason}` : ''}` })
        : null,
      proven
        ? h('div', { class: 'stack-sm' },
          h('p', { class: 'small' }, h('strong', null, 'Two claims, kept apart: '),
            `the search ${row.plan.reconciles ? 'closed its own gap, so the printed value is the maximum achievable' : 'did NOT reconcile the printed value against the set it printed — read this as a defect'} and ${row.figuresComplete ? 'every printed figure was computed from this currency’s own candidates and its own declared ceiling' : 'at least one figure on this card is not provable (a live ceiling is ambiguous)'}. Nodes explored ${row.plan.nodesExplored}, pruned ${row.plan.nodesPruned} on a valid bound.`),
          row.plan.deductionsCents > 0
            ? h('p', { class: 'small' }, h('strong', null, 'Shared benefit deducted: '), `${investmentMoney(row.currency, row.plan.deductionsCents)} of promised present value is deducted because the set funds cases whose benefits are declared to overlap. Without it the set would claim the same benefit twice.`)
            : null,
          h('p', { class: 'small' }, h('strong', null, 'What the shortcut would have cost: '),
            row.plan.rank.gapCents > 0
              ? `taking cases in profitability-index order — the order this workspace already printed — returns ${investmentMoney(row.currency, row.plan.rank.valueCents)}, which is ${investmentMoney(row.currency, row.plan.rank.gapCents)} LESS than the proven set. That gap is the measured cost of ranking instead of rationing.`
              : `the profitability-index order happens to reach the same ${investmentMoney(row.currency, row.plan.rank.valueCents)} on today’s candidates. That is a property of this problem, not a general guarantee.`),
          planTable(row))
        : null,
      row.relations.length
        ? h('details', { class: 'chart-table-details' },
          h('summary', null, `Relations declared in ${row.currency}: ${row.relations.length} (${row.appliedRelationsN} applied)`),
          table({
            caption: `Declared relations in ${row.currency}`,
            columns: [
              { label: 'Kind', render: (r) => r.kindMeta?.label || r.kind },
              { label: 'Shared share', className: 'num', render: (r) => (r.overlapBp === null || r.overlapBp === undefined ? '—' : capitalPercentBp(r.overlapBp)) },
              { label: 'Why', render: (r) => h('span', { class: 'muted small' }, r.reason) },
              { label: 'Applied', render: (r) => (r.state === 'applied' ? badge('applied', 'good') : badge(r.state, 'neutral', 'Both ends must be ratified candidates in this currency before a relation is applied. It is counted, never assumed.') ) },
            ],
            rows: row.relations,
            emptyMessage: 'No relation is declared in this currency.',
          }))
        : null,
    ),
  });
}

/* ------------------------------------------------------------------- render */

export function renderFinanceCapitalRationingPanel(ctx, { tabs: panelTabs = null } = {}) {
  const result = ctx.api.capitalRationingReport();
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'funded';

  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Finance & budgetary control', title: 'Capital rationing', subtitle: 'Which combination of investment cases to fund under a declared capital ceiling.' }),
      panelTabs,
      card({ body: banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The read was refused.' }) }));
  }
  const report = result.report;

  const head = pageHeader({
    eyebrow: 'Finance & budgetary control',
    title: 'Capital rationing & funded sets',
    subtitle: 'Eleven ratified cases each worth more than zero, one ceiling, and a sum of asks that exceeds it. This is not a ranking problem: alternatives, dependencies and shared benefits decide which COMBINATION returns the most, and the exact search here proves which one does.',
    actions: [
      report.seat.canDeclareCeiling
        ? h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'rationing-ceiling-open', onClick: () => {
          const candidates = ctx.api.capitalRationingCandidates();
          if (!candidates?.ok) { toast(candidates?.error || 'Declaring a ceiling was refused.', 'bad'); return; }
          declareCeiling(ctx, candidates);
        } }, 'Declare a ceiling')
        : null,
      report.seat.canDeclareRelation
        ? h('button', { type: 'button', class: 'btn', 'data-testid': 'rationing-relation-open', onClick: () => {
          const candidates = ctx.api.capitalRationingCandidates();
          if (!candidates?.ok) { toast(candidates?.error || 'Declaring a relation was refused.', 'bad'); return; }
          declareRelation(ctx, candidates);
        } }, 'Declare a relation')
        : null,
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'rationing-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'rationing-csv', onClick: () => downloadCsv(ctx, report.today) }, 'CSV'),
    ].filter(Boolean),
  });

  const viewTabs = tabs({
    ariaLabel: 'Capital rationing views',
    active: view,
    items: VIEWS.map((row) => ({ key: row.key, label: row.label })),
    onSelect: (key) => ctx.navigate(`#/finance?panel=rationing${key === 'funded' ? '' : `&view=${key}`}`),
  });

  if (view === 'method') return h('div', { class: 'page' }, head, panelTabs, viewTabs, methodCards(report));
  if (view === 'constraint') return h('div', { class: 'page' }, head, panelTabs, viewTabs, constraintSection(ctx, report));

  /* --- funded sets --- */
  return h('div', { class: 'page' },
    head,
    panelTabs,
    viewTabs,
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    h('div', { class: 'stat-row' },
      stat({ label: 'Ratified candidates', value: report.totals.candidatesN, hint: `in ${report.totals.currenciesN} currency(ies)` }),
      stat({ label: 'Currencies with a ceiling', value: report.totals.ceilingsLiveN, tone: report.totals.currenciesN > report.totals.ceilingsLiveN ? 'warn' : '', hint: 'the rest cannot be rationed' }),
      stat({ label: 'Selected, all proven sets', value: report.totals.selectedN, tone: '', hint: 'never summed across currencies' }),
      stat({ label: 'Sets refused', value: report.totals.currenciesRefusedN, tone: report.totals.currenciesRefusedN ? 'warn' : '', hint: 'no approximate plan offered' }),
      stat({ label: 'Relations declared', value: report.totals.relationsN, hint: `${report.totals.exclusiveN} alternatives · ${report.totals.requiresN} dependencies · ${report.totals.overlapN} shared` }),
      stat({ label: 'Sets the shortcut would have missed', value: report.totals.rankOrderGapN, tone: report.totals.rankOrderGapN ? 'good' : '', hint: 'where ranking beat itself' }),
    ),
    report.ceilings.length || report.relations.length ? null : card({
      body: emptyState({
        title: 'Nothing to ration yet',
        body: 'A funded set needs two things: ratified investment cases awaiting a decision, and a declared capital ceiling to ration them against. Declare a ceiling first — the register will not infer one from the budget envelopes, because an envelope is an authority to spend and a ceiling is a claim on the balance sheet.',
        action: report.seat.canDeclareCeiling
          ? h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { const c = ctx.api.capitalRationingCandidates(); if (c?.ok) declareCeiling(ctx, c); } }, 'Declare a ceiling')
          : null,
      }),
    }),
    report.allCurrencies.length
      ? h('div', { class: 'stack' }, ...report.currencies.map((row) => currencyCard(ctx, row, report)))
      : null,
    report.currenciesNotSolved.length
      ? card({ body: h('p', { class: 'small text-warn' }, `${report.currenciesNotSolved.length} further currency(ies) (${report.currenciesNotSolved.join(', ')}) are beyond the ${L.maxCurrencies} this read solves and are counted only.`) })
      : null,
    card({
      title: 'What this register refuses to print, and why',
      subtitle: 'Every row below is a figure that is a dash somewhere on this page.',
      body: report.refusals.length
        ? h('div', { class: 'stack-sm' }, ...report.refusals.map((refusal) => h('p', { class: 'small' }, h('strong', null, `${refusal.key}: `), refusal.says)))
        : h('p', { class: 'small muted' }, 'Nothing on this page is refused: every figure printed is computed from a declared ceiling and a proven search.'),
    }),
  );
}

function constraintSection(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Declared capital ceilings',
      subtitle: `${report.ceilings.length} live · ${report.totals.ambiguousCeilingsN} currency(ies) with more than one live ceiling over the same day`,
      body: report.ceilings.length
        ? table({
          caption: 'Capital ceilings on the record',
          columns: [
            { label: 'Currency', render: (row) => row.currency },
            { label: 'Ceiling', className: 'num', render: (row) => investmentMoney(row.currency, row.cents) },
            { label: 'Period', render: (row) => row.period },
            { label: 'Covers today', render: (row) => (row.liveToday ? badge('live', 'good') : badge('outside its period', 'neutral')) },
            { label: 'Candidates', className: 'num', render: (row) => row.candidatesN },
            { label: 'Basis', render: (row) => h('span', { class: 'muted small' }, row.basis) },
            { label: 'Declared', render: (row) => `${row.declaredOn} · ${row.declaredByName}` },
            { label: '', render: (row) => (report.seat.canDeclareCeiling ? h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-testid': `rationing-ceiling-retire-${row.currency}`, onClick: () => retireCeiling(ctx, row) }, 'Retire') : null) },
          ],
          rows: report.ceilings,
          emptyMessage: 'No ceiling is declared. Every funded set on this screen reads “no ceiling declared”.',
        })
        : emptyState({ title: 'No capital ceiling is declared', body: 'Without one the register can price every candidate and cannot ration any of them. Nothing is inferred from the budget envelopes.' }),
    }),
    card({
      title: 'Declared relations between cases',
      subtitle: `${report.relations.length} live · ${report.totals.relationsAppliedN} applied inside a currency · ${report.totals.relationsExcludedN} counted and not applied`,
      body: report.relations.length
        ? table({
          caption: 'Relations on the record',
          columns: [
            { label: 'Kind', render: (row) => row.kindMeta?.label || row.kind },
            { label: 'Shared share', className: 'num', render: (row) => (row.overlapBp === null || row.overlapBp === undefined ? '—' : capitalPercentBp(row.overlapBp)) },
            { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.reason) },
            { label: 'Declared', render: (row) => `${row.declaredOn} · ${row.declaredByName}` },
            { label: '', render: (row) => (report.seat.canDeclareRelation ? h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: () => retireRelation(ctx, row) }, 'Retire') : null) },
          ],
          rows: report.relations,
          emptyMessage: 'No relation is declared. Every case is treated as independent, which is what an undeclared relation means.',
        })
        : emptyState({ title: 'No relation is declared', body: 'Every case is treated as independent. When two cases are alternatives, when one depends on another, or when a share of benefit is booked twice, a relation is the only way to say so — the register cannot read it from the flows.' }),
    }),
    report.orphanCeilings.length
      ? card({ title: 'Ceilings that govern no candidate', body: h('div', { class: 'stack-sm' }, ...report.orphanCeilings.map((row) => h('p', { class: 'small' }, `${row.currency} ${investmentMoney(row.currency, row.cents)} over ${row.period}, declared by ${row.declaredByName} — no ratified candidate sits in this currency in your span. It is printed rather than hidden.`))) })
      : null,
    card({
      body: h('div', { class: 'stack-sm' },
        report.seat.canGovern
          ? h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'rationing-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Conventions'),
            h('button', { type: 'button', class: 'btn btn-small', onClick: () => finish(ctx, ctx.api.capitalRationingScan(), 'Scan run on the shared spine.') }, 'Run the missing-ceiling scan'))
          : null,
        h('p', { class: 'muted small' }, `${CAPITAL_RATIONING_RULE_ID} · ask window ${report.conventions[CAPITAL_RATIONING_SETTING_KEYS.askDueDays]} day(s) · automation ${report.conventions[CAPITAL_RATIONING_SETTING_KEYS.autoPropagate] ? 'on' : 'paused'}. The rule asks the lowest seat above every reporting line to DECLARE a missing ceiling. It never asks anybody to fund a case, to approve a set, or to pick between two live ceilings.`)),
    }),
  );
}

function methodCards(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The method, illustrated',
      subtitle: 'A dated promise, weighed at a declared rate, ratified by someone else, and checked against what moved — generated asset, never workspace data.',
      body: h('figure', {},
        h('img', {
          src: DIAGRAM_URL,
          loading: 'lazy',
          alt: 'Conceptual method illustration: a tall narrow slate column marks a fixed ceiling above a horizontal baseline. To its right, eight vertical bars of varying heights rise toward that ceiling line — four teal, four pale grey — and none reaches it; each bar has a thin dashed outline continuing up to the ceiling line to show the height it aspires to. In the middle, three small groupings show relations between bars: two bars joined by a thin arc with a small cross at each end (alternatives); a short bar resting on a slender bracket that leans against a taller bar (dependency); and two overlapping bars with a translucent shared band (a benefit counted once). At the right, a stepped platform of three shallow stairs holds a tight cluster of four teal bars fitted neatly inside a thin bracket marking the ceiling, while on the lowest stair a looser group of five bars spills past the bracket; a dashed arrow points from the messy group up to the tidy one, and beside the tidy group a small plus sign with a single tiny square marks the price of one more unit of ceiling. Below everything, a thin ruler line with fine ticks and one short vertical marker shows a finite step rather than a smooth curve.',
        }),
        h('figcaption', { class: 'muted small' }, 'Conceptual method illustration (generated asset) — not workspace data, and no figure in it is a figure from this workspace.')),
    }),
    card({
      title: 'How a ceiling is declared and a set is proven',
      subtitle: `${CAPITAL_RATIONING_RULE_ID} · ask window ${report.conventions[CAPITAL_RATIONING_SETTING_KEYS.askDueDays]} day(s) · automation ${report.conventions[CAPITAL_RATIONING_SETTING_KEYS.autoPropagate] ? 'on' : 'paused'}`,
      body: h('div', { class: 'stack' },
        ...[['candidate', 'Candidate'], ['ceiling', 'Ceiling'], ['exclusive', 'Alternatives'], ['requires', 'Depends on'], ['overlap', 'Shared benefit'], ['search', 'The search'], ['refusal', 'Refusals'], ['shadow', 'Shadow price'], ['rankOrder', 'The shortcut, measured'], ['matrix', 'Matrix'], ['notSaid', 'Not said']]
          .map(([key, label]) => h('p', null, h('strong', null, `${label}: `), CAPITAL_RATIONING_METHOD[key])),
        h('p', { class: 'muted small' }, `Arithmetic: ${report.math.objective}. Bound: ${report.math.bound}. Pruning: ${report.math.pruning}. Shadow step: ${report.math.shadowStep}. ${report.math.optimality}.`),
        h('p', { class: 'muted small' }, `Three limits, printed rather than hidden: a candidate contributes its own appraised net present value and its own promised outlay and nothing else — no risk adjustment, no strategic option value and no synergy beyond a declared shared benefit; the ceiling is a single hard number per currency and period, so a soft or multi-period limit is not expressible; and a case already ratified is never re-opened, so the funded set is a recommendation over what nobody has decided.`)),
    }),
    card({
      title: 'Frameworks this register applies',
      body: h('div', { class: 'stack' }, ...(report.frameworks || []).map((framework) => h('p', null,
        h('strong', null, `${framework.label}. `), framework.says))),
    }),
    card({
      title: 'Refusals this register can print',
      body: h('div', { class: 'stack' }, ...CAPITAL_RATIONING_REFUSALS.map((refusal) => h('p', { class: 'small' }, h('strong', null, `${refusal.key}: `), refusal.says))),
    }),
    card({
      title: 'What is never done here',
      body: h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, 'It never funds anything. A funded set is a recommendation computed from ratified cases and declared ceilings; ratification remains the human act it already was, and no act of this register moves money, edits an envelope, posts a commitment or changes an appraisal.'),
        h('p', { class: 'small' }, 'It never pools currencies, never converts one, and never sums net present values valued on different days at different rates. Each currency is its own problem with its own set and its own shadow price.'),
        h('p', { class: 'small' }, 'It never calls a set optimal without a closed search, never offers an approximate plan when the node budget runs out, never treats an unpriced case as free, and never rates a person.')),
    }),
  );
}

export default renderFinanceCapitalRationingPanel;
