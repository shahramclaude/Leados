/**
 * app/views/dealSynergyPanel.js — Deal Thesis & Synergy Realization Register
 * (ADR-0216, Session 289). Seventh panel of `#/finance`.
 *
 * ONE READER, ONE SET OF NUMBERS. Every figure on this screen comes from
 * `buildDealSynergy` through the seat-checked `synergyReport` command, and every
 * money cell carries the same whole cents in `data-cents` that the reader
 * returned — so what is displayed can be checked against what was computed cell
 * by cell, which is the only way the Bulletproof Reliability Mandate can be
 * tested rather than believed.
 *
 * NOTHING IS COMPUTED HERE. Not a total, not a capture percentage, not a
 * payback, not a state. A refused figure prints a dash with its reason, never a
 * zero; the contested money is printed beside the headline and out of it, with
 * both claimants named; and the run-rate and P&L columns are kept apart by
 * construction because they are different claims.
 *
 * DIRECTION IS ALWAYS IN WORDS. A dis-synergy is labelled as a loss rather than
 * rendered with a colour, and every state prints its own sentence.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';

/**
 * The shared table takes column descriptors; these panels speak in labels. The
 * wrapper also carries the testid, so a panel section stays addressable without
 * every caller repeating a wrapper element.
 */
const ledgerTable = (labels, rows, { testid = '' } = {}) => {
  const columns = labels.map((label, index) => ({ key: `c${index}`, label }));
  // The shared table reads row OBJECTS by column key. Handing it arrays renders
  // a full row of em dashes — the shape is silently accepted, which is exactly
  // why the panel is asserted cell by cell against the reader's integers.
  const objects = rows.map((cells) => (Array.isArray(cells)
    ? Object.fromEntries(columns.map((column, index) => [column.key, cells[index]]))
    : cells));
  const element = table({ columns, rows: objects });
  return testid ? h('div', { 'data-testid': testid }, element) : element;
};
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { formatMoney } from '../core/domain/finance.js';
import {
  SYNERGY_CSV_COLUMNS,
  SYNERGY_COST_KINDS,
  SYNERGY_EFFECTS,
  SYNERGY_FRAMEWORKS,
  SYNERGY_HREF,
  SYNERGY_LIMITS,
  SYNERGY_METHOD,
  SYNERGY_READING_KINDS,
  SYNERGY_REFUSALS,
  SYNERGY_SETTING_KEYS,
  SYNERGY_SETTING_LABELS,
  SYNERGY_STATE_BY_KEY,
  SYNERGY_VIEWS,
  SYNERGY_BOUNDS,
  SYNERGY_LEVERS,
  synergyLeverByKey,
} from '../core/domain/synergyRegistry.js';
import { monthsText } from '../core/domain/synergyMath.js';

const L = SYNERGY_LIMITS;
const BASE_HREF = SYNERGY_HREF;
const DIAGRAM_URL = './app/assets/deal-synergy-realization.jpg';

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The synergy act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/** A money cell: the printed text, and the same whole cents as data. */
function moneyCell(currency, cents, testid) {
  const claimed = Number.isSafeInteger(cents);
  return h('span', {
    class: 'num',
    'data-testid': testid,
    'data-cents': claimed ? String(cents) : '',
    ...(claimed ? {} : { title: 'Refused or not applicable — see the reason printed beside it.' }),
  }, claimed ? formatMoney(currency, cents / 100) : '—');
}

const pctFromPpm = (value) => (Number.isSafeInteger(value) ? `${(value / 100).toFixed(1)}%` : '—');

function ledgerLabel(row) {
  return synergyLeverByKey(row.leverKey)?.label || row.leverKey;
}

function stateBadge(row) {
  const state = SYNERGY_STATE_BY_KEY[row.stateKey] || { label: row.stateKey, tone: 'neutral', says: '' };
  return h('span', { title: state.says || '', 'data-testid': `syn-state-${row.id}`, 'data-state': row.stateKey }, badge(state.label, state.tone));
}

/* ------------------------------------------------------------------- dialogs */

function conventionsDialog(ctx, report, onDone) {
  const c = report.settings;
  const form = buildForm([
    {
      name: SYNERGY_SETTING_KEYS.materialityPct,
      label: SYNERGY_SETTING_LABELS.materialityPct,
      type: 'number',
      value: String(c.materialityPct),
      help: `Whole number ${SYNERGY_BOUNDS.materialityPct[0]}–${SYNERGY_BOUNDS.materialityPct[1]} percent. A shortfall inside this band is printed as an amount and still reads as met; it is never rounded away.`,
    },
    {
      name: SYNERGY_SETTING_KEYS.staleDays,
      label: SYNERGY_SETTING_LABELS.staleDays,
      type: 'number',
      value: String(c.staleDays),
      help: `Whole number ${SYNERGY_BOUNDS.staleDays[0]}–${SYNERGY_BOUNDS.staleDays[1]} days. A verification older than this is printed as stale and the owner is asked for a current one.`,
    },
  ]);
  const save = () => {
    const values = form.getValues();
    const result = ctx.api.synergySetConventions({
      [SYNERGY_SETTING_KEYS.materialityPct]: Number(values[SYNERGY_SETTING_KEYS.materialityPct]),
      [SYNERGY_SETTING_KEYS.staleDays]: Number(values[SYNERGY_SETTING_KEYS.staleDays]),
    });
    if (finish(ctx, result, 'Conventions saved.', form)) onDone?.();
  };
  openModal({
    title: 'Synergy conventions',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Two declarations, and neither is clamped',
        body: 'A value outside its bounds is refused rather than clamped, because a clamp would let a typo move the materiality line the board reads. Changing a convention re-derives every state on the next read; no stored figure moves.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Save', primary: true, onClick: save },
    ],
  });
}

function dealDialog(ctx, report, onDone) {
  const form = buildForm([
    { name: 'label', label: 'Deal name', type: 'text', required: true, help: 'A name a reader can recognise. It is never used as a key.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'DKK', help: 'Three letters. Every promise and reading on this deal is in this currency; nothing is converted.' },
    { name: 'signedOn', label: 'Signed on', type: 'date', required: true, help: `A real day, not in the future. Promises cannot fall due before it. Today is ${report.asOf}.` },
    { name: 'leadId', label: 'Integration lead', type: 'select', required: true, options: report.leadOptions || [], help: 'The person who answers for the integration itself, as distinct from each promise’s owner.' },
    { name: 'thesis', label: 'The thesis the deal was bought on', type: 'textarea', required: true, help: `At least ${L.thesisMin} characters. A promise with no thesis is a number with no reason.` },
  ]);
  openModal({
    title: 'Declare a deal',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A thesis, not a transaction',
        body: 'This register does not value the deal, compute the premium or judge whether it was worth doing. It records the thesis the promise was made inside, so a later shortfall is a fact about a plan rather than an argument about what the plan was.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Declare', primary: true, onClick: () => {
        const result = ctx.api.synergyDeclareDeal(form.getValues());
        if (finish(ctx, result, 'Deal declared.', form)) onDone?.();
      } },
    ],
  });
}

function claimDialog(ctx, report, onDone) {
  const deals = report.deals.map((deal) => ({ value: deal.id, label: `${deal.label} (${deal.currency})` }));
  if (!deals.length) { toast('Declare a deal before promising a saving on it.', 'bad'); return; }
  const owners = (report.people || []).map((person) => ({ value: person.id, label: `${person.name}${person.lines > 1 ? ` — ${person.lines} lines` : ''}` }));
  const form = buildForm([
    { name: 'dealId', label: 'Deal', type: 'select', required: true, options: deals },
    { name: 'leverKey', label: 'Lever', type: 'select', required: true, options: SYNERGY_LEVERS.map((row) => ({ value: row.key, label: row.label })), help: 'A closed list. It is never inferred from the title of the promise.' },
    { name: 'effectKey', label: 'Direction', type: 'select', required: true, options: SYNERGY_EFFECTS.map((row) => ({ value: row.key, label: row.label })), value: 'synergy', help: 'A dis-synergy is a declared loss. It is subtracted from the headline and printed on its own line — never hidden as a negative promise.' },
    { name: 'ownerId', label: 'Accountable owner', type: 'select', required: true, options: owners, help: 'One person. You may only promise for somebody you hold on the home line or a declared line.' },
    { name: 'savingRef', label: 'The saving itself', type: 'text', required: true, help: 'For example "sga-duplicated-finance". Two promises on one deal naming the same saving are printed CONTESTED and counted once — that is how a double count is caught.' },
    { name: 'promisedAnnual', label: 'Full promised annual run-rate', type: 'text', required: true, help: 'Positive amount to the cent. The direction lives in the field above, never in a minus sign.' },
    { name: 'dueOn', label: 'Day the full run-rate is due', type: 'date', required: true, help: 'The final phase of the ladder. A ladder must end at the full promise.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', help: 'Anything a reader needs to weigh the promise.' },
  ]);
  const submit = () => {
    const values = form.getValues();
    const result = ctx.api.synergyDeclareClaim(values);
    if (finish(ctx, result, 'Promise recorded. It now owes a verifier.', form)) onDone?.();
  };
  openModal({
    title: 'Promise a saving',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A promise is a dated claim by one person',
        body: 'The register stores it as a promise, never as a result. Until a seat above the owner reads named evidence, the row says nobody has verified it — which is a refusal, not a miss and not a clearance.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Promise it', primary: true, onClick: submit },
    ],
  });
}

function readingDialog(ctx, report, row, onDone) {
  const form = buildForm([
    { name: 'kindKey', label: 'What kind of reading is this?', type: 'select', required: true, options: SYNERGY_READING_KINDS.map((item) => ({ value: item.key, label: item.label })), value: 'run-rate', help: 'A run-rate is an annualised effect at a date. A P&L effect is money in one named period. They are never added to one another.' },
    { name: 'periodKey', label: 'Period (P&L only)', type: 'text', help: 'For example 2026-Q3. Required for a P&L reading and refused for a run-rate. One period cannot be recorded twice.' },
    { name: 'basisKey', label: 'Basis', type: 'select', required: true, options: [{ value: 'claimed', label: 'Claimed — the line’s own report' }, { value: 'verified', label: 'Verified — read against named evidence' }], value: 'claimed', help: 'A verified reading must come from a seat above the owner, and the owner can never verify their own saving.' },
    { name: 'asOf', label: 'Reading date', type: 'date', required: true, help: `Not in the future (today is ${report.asOf}) and not before the promise was declared.` },
    { name: 'amount', label: 'Amount', type: 'text', required: true, help: 'In the deal currency, to the cent. A negative amount records a saving that reversed.' },
    { name: 'evidenceRef', label: 'Evidence read (verification only)', type: 'textarea', help: `At least ${L.basisMin} characters. "Verified" with no evidence is a second claim wearing a better word.` },
    { name: 'note', label: 'Note', type: 'textarea', help: 'What was read, and anything a later reader needs.' },
  ]);
  openModal({
    title: `Record a reading — ${ledgerLabel(row)}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Claimed and verified are different rows',
        body: 'A claim is recorded and printed and never counted as verified value. A verification is a dated act by a seat above the owner against named evidence, and its reach is re-tested on every read — a verifier who later moves out from above the owner stops counting.',
      }),
      h('p', { class: 'muted small' }, `Promise: ${row.ownerName} · ${formatMoney(row.currency, (row.promisedFullCents || 0) / 100)} promised for ${row.dueOn}.`),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record', primary: true, onClick: () => {
        const result = ctx.api.synergyRecordReading({ claimId: row.id, ...form.getValues() });
        if (finish(ctx, result, 'Reading recorded.', form)) onDone?.();
      } },
    ],
  });
}

function costDialog(ctx, report, deal, onDone) {
  const claims = deal.liveRows.map((row) => ({ value: row.id, label: `${ledgerLabel(row)} — ${row.ownerName}` }));
  const form = buildForm([
    { name: 'amount', label: 'One-off cost', type: 'text', required: true, help: 'Positive amount in the deal currency, to the cent. This is cost-to-achieve, not a recurring cost.' },
    { name: 'spentOn', label: 'Incurred on', type: 'date', required: true, help: 'The day it was incurred. Not in the future.' },
    { name: 'kindKey', label: 'Kind', type: 'select', required: true, options: SYNERGY_COST_KINDS.map((item) => ({ value: item.key, label: item.label })), value: 'advisory' },
    { name: 'claimId', label: 'Allocated to a promise (optional)', type: 'select', options: [{ value: '', label: 'Deal level — not allocated' }, ...claims], help: 'Allocating a cost to a promise names a line’s saving; you may only allocate to a promise whose owner you hold or answer for.' },
    { name: 'note', label: 'Note', type: 'textarea' },
  ]);
  openModal({
    title: `Record one-off cost — ${deal.label}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Cost is its own ledger',
        body: 'Payback is printed only when a cost has been declared AND the verified net run-rate is positive. Without both, the cell prints the reason it is refused — an undeclared cost must never produce a payback of zero.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record', primary: true, onClick: () => {
        const values = form.getValues();
        const result = ctx.api.synergyRecordCost({ dealId: deal.id, ...values, claimId: values.claimId || null });
        if (finish(ctx, result, 'Cost recorded.', form)) onDone?.();
      } },
    ],
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why is this promise withdrawn?', type: 'textarea', required: true, help: 'At least a sentence. The promise stays on the record, leaves every total, and the exclusion is counted.' },
  ]);
  openModal({
    title: 'Withdraw a promise',
    body: h('div', { class: 'stack' },
      banner({ tone: 'warn', title: 'Nothing is deleted', body: 'A withdrawn promise is kept with its reason and excluded from every figure. The reader counts the exclusion, so a shrinking plan can never look like it was always small.' }),
      h('p', { class: 'muted small' }, `${ledgerLabel(row)} · ${row.ownerName} · saving ${row.savingRef}`),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Withdraw', primary: true, onClick: () => {
        const result = ctx.api.synergyWithdrawClaim({ claimId: row.id, reason: form.getValues().reason });
        if (finish(ctx, result, 'Promise withdrawn.', form)) onDone?.();
      } },
    ],
  });
}

/* ------------------------------------------------------------------ sections */

function summaryCard(report) {
  const rows = report.currencyTotals;
  if (!rows.length) {
    return card({
      title: 'No deal thesis has been declared',
      body: emptyState({
        title: 'Nothing is promised, so nothing is owed',
        body: 'Declare the deal, then the promise: which lever, owned by whom, how much by which date. The register will not infer either from an investment case, a budget envelope or a valuation reading.',
      }),
    });
  }
  if (report.multiCurrency) {
    return card({
      title: 'More than one currency is held',
      body: h('div', { class: 'stack' },
        banner({
          tone: 'warn',
          title: 'No single total is printed',
          body: 'Currencies are never converted and never pooled. Each is printed with its own totals below; a grand total across them would require an exchange rate nobody declared on this record.',
        }),
        ledgerTable(
          ['Currency', 'Deals', 'Promised to date', 'Verified run-rate', 'Met', 'Behind', 'Unverified'],
          rows.map((bucket) => [
            bucket.currency,
            String(bucket.deals),
            moneyCell(bucket.currency, bucket.promisedToDateCents, `syn-cur-${bucket.currency}-promised`),
            moneyCell(bucket.currency, bucket.verifiedRunRateCents, `syn-cur-${bucket.currency}-verified`),
            String(bucket.met),
            String(bucket.behind),
            String(bucket.unverified),
          ]),
          { testid: 'syn-currency-totals' },
        )),
    });
  }
  const bucket = rows[0];
  return card({
    title: `${bucket.currency} — the whole register`,
    body: h('div', { class: 'grid grid-4' },
      stat({ label: 'Promised net (headline)', value: moneyCell(bucket.currency, bucket.headlineCents, 'syn-headline'), hint: 'uncontested promises minus declared dis-synergies' }),
      stat({ label: 'Promised to date', value: moneyCell(bucket.currency, bucket.promisedToDateCents, 'syn-promised-to-date'), hint: 'the phase that has actually come due' }),
      stat({ label: 'Verified run-rate', value: moneyCell(bucket.currency, bucket.verifiedRunRateCents, 'syn-verified'), hint: 'verified only — claims are not counted here' }),
      stat({ label: 'Contested, counted nowhere', value: moneyCell(bucket.currency, bucket.contestedCents, 'syn-contested'), hint: 'two owners, one saving — printed and excluded' }),
      stat({ label: 'One-off cost', value: moneyCell(bucket.currency, bucket.costCents, 'syn-cost'), hint: 'cost to achieve, its own ledger' }),
      stat({ label: 'Verified P&L to date', value: moneyCell(bucket.currency, bucket.pnlCents, 'syn-pnl'), hint: 'money in named periods — never added to the run-rate' }),
      stat({ label: 'Due and unverified', value: String(bucket.unverified), tone: bucket.unverified ? 'bad' : '', hint: 'a refusal, not a miss' }),
      stat({ label: 'Verified short', value: String(bucket.behind), tone: bucket.behind ? 'warn' : '', hint: 'beyond the declared materiality band' }),
    ),
  });
}

function dealCard(ctx, report, deal, caps, onDone) {
  const rows = deal.liveRows.concat(deal.rows.filter((row) => row.withdrawnOn));
  return card({
    title: deal.label,
    actions: [
      caps.canDeclare ? button('Promise a saving', () => claimDialog(ctx, report, onDone), { testid: `syn-claim-open-${deal.id}` }) : null,
      caps.canRecord ? button('One-off cost', () => costDialog(ctx, report, deal, onDone), { testid: `syn-cost-open-${deal.id}` }) : null,
    ].filter(Boolean),
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, `${deal.currency} · signed ${deal.signedOn} · integration lead ${deal.leadName}${deal.leadOnRoster ? '' : ' (no longer on the roster)'}`),
      h('p', { class: 'small' }, deal.thesis),
      h('div', { class: 'grid grid-4' },
        stat({ label: 'Headline net', value: moneyCell(deal.currency, deal.totals.headlineCents, `syn-deal-${deal.id}-headline`) }),
        stat({ label: 'Contested (excluded)', value: moneyCell(deal.currency, deal.totals.contestedCents, `syn-deal-${deal.id}-contested`), hint: `${deal.counts.contestedGroups} contested group(s)` }),
        stat({ label: 'Promised to date', value: moneyCell(deal.currency, deal.totals.promisedToDateCents, `syn-deal-${deal.id}-todate`), hint: 'the phases that have arrived, not the full promise' }),
        stat({ label: 'Verified run-rate', value: moneyCell(deal.currency, deal.totals.verifiedRunRateCents, `syn-deal-${deal.id}-verified`) }),
        stat({
          label: 'Capture vs promised to date',
          value: Number.isSafeInteger(deal.capturePpm) ? pctFromPpm(deal.capturePpm) : '—',
          hint: Number.isSafeInteger(deal.capturePpm) ? 'verified ÷ promised to date' : (deal.captureReason || 'refused'),
        }),
        stat({
          label: 'Payback',
          value: Number.isSafeInteger(deal.paybackMonthsX10) ? `${monthsText(deal.paybackMonthsX10)} months` : '—',
          hint: Number.isSafeInteger(deal.paybackMonthsX10) ? 'cost ÷ verified net run-rate' : (deal.paybackReason || 'refused'),
        }),
        stat({ label: 'Verified P&L', value: moneyCell(deal.currency, deal.totals.pnlCents, `syn-deal-${deal.id}-pnl`), hint: 'named periods only' }),
        stat({ label: 'Verification share', value: Number.isSafeInteger(deal.verificationSharePpm) ? pctFromPpm(deal.verificationSharePpm) : '—', hint: 'share of promised value carrying a verified reading' }),
        stat({ label: 'Cost to achieve', value: moneyCell(deal.currency, deal.totals.costCents, `syn-deal-${deal.id}-cost`) }),
      ),
      rows.length
        ? ledgerTable(
          ['Lever', 'Direction', 'Owner', 'Saving', 'Promised (full)', 'Due', 'Promised to date', 'Verified run-rate', 'State', ''],
          rows.map((row) => [
            ledgerLabel(row),
            row.effectKey === 'dis-synergy' ? h('span', { class: 'text-warn' }, 'Dis-synergy (loss)') : 'Synergy',
            `${row.ownerName}${row.ownerLines > 1 ? ` · ${row.ownerLines} lines` : ''}`,
            h('span', { class: 'mono small' }, row.savingRef),
            moneyCell(row.currency, row.promisedFullCents, `syn-row-${row.id}-promised`),
            row.dueOn || '—',
            moneyCell(row.currency, row.promisedToDateCents, `syn-row-${row.id}-todate`),
            Number.isSafeInteger(row.verifiedRunRateCents)
              ? moneyCell(row.currency, row.verifiedRunRateCents, `syn-row-${row.id}-verified`)
              : h('span', { class: 'muted', 'data-testid': `syn-row-${row.id}-verified`, 'data-cents': '' }, '— not verified'),
            h('span', null, stateBadge(row),
              row.verifiedDrifted ? h('div', { class: 'small text-warn' }, 'verifier no longer above the owner — counted as unverified') : null,
              row.verifiedStale ? h('div', { class: 'small text-warn' }, `verified ${row.daysSinceVerified} days ago — stale`) : null,
              row.metShortfallCents ? h('div', { class: 'small muted' }, `short ${formatMoney(row.currency, row.metShortfallCents / 100)} inside the materiality band`) : null,
              row.claimedRunRateCents !== null && !row.verifiedRunRateCents ? h('div', { class: 'small muted' }, `claimed ${formatMoney(row.currency, row.claimedRunRateCents / 100)} — not verified`) : null),
            h('span', { class: 'row-actions' },
              caps.canRecord ? button('Reading', () => readingDialog(ctx, report, row, onDone), { testid: `syn-reading-open-${row.id}` }) : null,
              caps.canDeclare && !row.withdrawnOn ? button('Withdraw', () => withdrawDialog(ctx, row, onDone), { testid: `syn-withdraw-${row.id}` }) : null),
          ]),
          { testid: `syn-deal-${deal.id}-rows` },
        )
        : emptyState({ title: 'No promise on this deal yet', body: 'A deal with no promise is a thesis with no measurable claim. Declare one lever, one owner and one dated ladder.' }),
      deal.liveRows.some((row) => row.stateKey === 'behind' || row.stateKey === 'unverified')
        ? h('p', { class: 'muted small' }, `${deal.counts.unverified} promise(s) due with no verification; ${deal.counts.behind} verified short of the promise. Neither figure is a rating of anybody: one is a refusal, the other a measured gap.`)
        : null,
    ),
  });
}

function thesisView(ctx, report, caps, onDone) {
  if (!report.deals.length) return summaryCard(report);
  return h('div', { class: 'stack' }, report.deals.map((deal) => dealCard(ctx, report, deal, caps, onDone)));
}

function contestedView(ctx, report, caps, onDone) {
  const groups = report.deals.flatMap((deal) => deal.contestedGroups.map((group) => ({ ...group, dealLabel: deal.label, currency: deal.currency })));
  const unverified = report.rows.filter((row) => !row.withdrawnOn && (row.stateKey === 'unverified' || row.stateKey === 'behind' || row.verifiedStale || row.verifiedDrifted));
  return h('div', { class: 'stack' },
    card({
      title: 'Contested savings — counted once, allocated to nobody',
      body: h('div', { class: 'stack' },
        banner({
          tone: groups.length ? 'warn' : 'info',
          title: groups.length ? `${groups.length} saving(s) are claimed by more than one owner` : 'No saving is claimed twice',
          body: 'Two promises on one deal naming the same saving are contested. Counting both is double counting; splitting it invents an allocation no human agreed to. The register holds the contested money OUT of the headline, prints both owners, and leaves the settlement to them.',
        }),
        groups.length
          ? ledgerTable(
            ['Deal', 'Saving', 'Claimants', 'Promised', 'Verified run-rate', 'Held out of the headline'],
            groups.map((group) => [
              group.dealLabel,
              h('span', { class: 'mono small' }, group.savingRef),
              group.members.map((member) => `${member.ownerName} (${member.leverKey})`).join(' · '),
              group.members.map((member) => moneyCell(group.currency, member.promisedCents, `syn-contested-${member.claimId}`)),
              group.members.map((member) => (Number.isSafeInteger(member.verifiedRunRateCents)
                ? moneyCell(group.currency, member.verifiedRunRateCents, `syn-contested-verified-${member.claimId}`)
                : h('span', { class: 'muted' }, '— not verified'))),
              moneyCell(group.currency, group.promisedCents, `syn-contested-group-${group.key}`),
            ]),
            { testid: 'syn-contested-groups' },
          )
          : null,
        h('p', { class: 'muted small' }, 'The panel prints the deal’s identity — headline + contested + dis-synergy = the sum of the rows — so the exclusion is provable from the figures on this screen rather than trusted.'),
      ),
    }),
    card({
      title: 'Promises nobody has verified, and verifications that no longer hold',
      body: unverified.length
        ? ledgerTable(
          ['Deal', 'Lever', 'Owner', 'Due', 'Promised to date', 'Verified', 'Why it is on this list', ''],
          unverified.map((row) => [
            row.dealLabel,
            ledgerLabel(row),
            row.ownerName,
            row.latestDueOn || row.dueOn || '—',
            moneyCell(row.currency, row.promisedToDateCents, `syn-unv-${row.id}-todate`),
            Number.isSafeInteger(row.verifiedRunRateCents) ? moneyCell(row.currency, row.verifiedRunRateCents, `syn-unv-${row.id}-verified`) : h('span', { class: 'muted' }, '—'),
            [
              row.stateKey === 'unverified' ? 'a phase is due and no verified reading exists' : null,
              row.stateKey === 'behind' ? `verified short by ${Number.isSafeInteger(row.gapCents) ? formatMoney(row.currency, row.gapCents / 100) : '—'}` : null,
              row.verifiedStale ? `newest verification is ${row.daysSinceVerified} days old` : null,
              row.verifiedDrifted ? 'the verifier is no longer above the owner' : null,
            ].filter(Boolean).join(' · '),
            caps.canRecord ? button('Reading', () => readingDialog(ctx, report, row, onDone), { testid: `syn-unv-reading-${row.id}` }) : null,
          ]),
          { testid: 'syn-unverified-rows' },
        )
        : emptyState({ title: 'Every due promise carries a current verification', body: 'Nothing on this register is due and unchecked as of today. That is the only sentence this card ever states as a clearance, and it is re-derived on every read.' }),
    }),
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is',
      body: h('div', { class: 'stack' },
        Object.entries(SYNERGY_METHOD).map(([key, text]) => h('div', null,
          h('h4', { class: 'small' }, key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())),
          h('p', { class: 'muted small' }, text))),
      ),
    }),
    card({
      title: 'The frameworks applied, named',
      body: ledgerTable(['Framework', 'What it does here'], SYNERGY_FRAMEWORKS.map((row) => [row.label, row.says]), { testid: 'syn-frameworks' }),
    }),
    card({
      title: 'The method illustration',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Method illustration: the promise ladder, the verification gate, the contested saving held out of the headline, cost-to-achieve and payback.', class: 'diagram', loading: 'lazy' }),
        h('p', { class: 'muted small' }, 'Generated method illustration, produced for this register; the provenance is recorded in the ADR and the delivery notes. It is a diagram of the method, not a screenshot of data.')),
    }),
    card({
      title: 'What it refuses, by name',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, `${SYNERGY_REFUSALS.length} named refusals, each with its own sentence. A generic "invalid" would hide which control fired.`),
        ledgerTable(['Refusal', 'What it prevents'], SYNERGY_REFUSALS.map((row) => [h('span', { class: 'mono small' }, row.key), row.says]), { testid: 'syn-refusals' })),
    }),
    card({
      title: 'What this workspace cannot do',
      body: h('p', { class: 'muted small' },
        'It does not value a deal, compute the premium, discount a synergy to a present value, annualise a period, convert a currency, or decide whether the deal was worth doing. Seats are workflow declarations, not authentication: a right is a rendering and write contract enforced by the reader and the action, not a security boundary this browser can deliver. Where a promise has no owner on the roster, or a verifier is no longer above the owner, the register prints that and asks nobody.'),
    }),
  );
}

/* ------------------------------------------------------------------- render */

export function renderFinanceDealSynergyPanel(ctx, { tabs: sharedTabs = null } = {}) {
  const result = ctx.api.synergyReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      sharedTabs,
      pageHeader({ eyebrow: 'Finance', title: 'Deal synergy', subtitle: 'What the deal promised, by whom, and whether anybody checked.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query?.get?.('view');
  const view = SYNERGY_VIEWS.some((row) => row.key === requested) ? requested : 'thesis';
  const caps = {
    canDeclare: typeof ctx.api.synergyDeclareDeal === 'function' && typeof ctx.api.synergyDeclareClaim === 'function',
    canRecord: typeof ctx.api.synergyRecordReading === 'function',
    canGovern: typeof ctx.api.synergySetConventions === 'function',
  };
  const onDone = () => refresh(ctx);
  const leadOptions = [{ value: '', label: 'I am the integration lead' }].concat(
    (ctx.state?.people || []).filter((person) => person && person.status !== 'archived')
      .map((person) => ({ value: person.id, label: person.name || person.id })),
  );

  const downloadCsv = () => {
    const rows = ctx.api.synergyCsvRows();
    if (!rows?.ok) { toast(rows?.error || 'The export was refused.', 'bad'); return; }
    const text = serializeCsv(SYNERGY_CSV_COLUMNS.map((key) => ({ key, header: key })), rows.rows);
    downloadText(`leados-deal-synergy-${report.asOf}.csv`, text);
    toast(`Exported ${rows.rows.length} aggregate row(s).`, 'good');
  };
  const openBrief = () => openModal({
    title: 'Deal synergy brief (identity-free)',
    body: h('pre', { class: 'pre-wrap small', 'data-testid': 'syn-brief' }, ctx.api.synergyBriefText()?.text || ''),
    actions: [{ label: 'Close', onClick: () => closeAllModals() }],
  });

  const viewForDialogs = { ...report, leadOptions, people: ctx.api.synergyCandidates()?.people || [] };

  return h('div', { class: 'page', 'data-testid': 'deal-synergy-panel', 'data-as-of': report.asOf },
    sharedTabs,
    pageHeader({
      eyebrow: 'Finance',
      title: 'What the deal promised — and what has been checked',
      subtitle: 'A synergy plan is a set of dated promises made by named people. This register keeps the promise, the phase that is due, the reading that was verified and the one that was merely claimed, the saving two lines both claim, and the cost of getting there — separately, because they are different facts.',
      actions: [
        button('Brief', openBrief, { testid: 'syn-brief-open' }),
        button('Download CSV', downloadCsv, { testid: 'syn-csv' }),
        caps.canDeclare ? button('Declare a deal', () => dealDialog(ctx, viewForDialogs, onDone), { primary: true, testid: 'syn-deal-open' }) : null,
        caps.canGovern ? button('Conventions', () => conventionsDialog(ctx, report, onDone), { testid: 'syn-conventions-open' }) : null,
      ].filter(Boolean),
    }),
    report.flags.figuresComplete === false
      ? banner({ tone: 'warn', title: 'Some rows could not be read', body: 'A row that could not be read exactly was dropped and counted rather than repaired, or a period was recorded twice. Every figure below is the sum of the rows that survived; treat it as incomplete.' })
      : null,
    banner({
      tone: report.flags.countsReconcile ? 'info' : 'bad',
      title: report.flags.countsReconcile ? 'The printed figures are the computed figures' : 'The printed figures do not re-add',
      body: report.flags.countsReconcile
        ? `Headline + contested + dis-synergy = the sum of the rows, re-added from the printed integers on this screen (${report.asOf}). Where a figure is refused, the cell carries the reason instead of a zero.`
        : 'The identity headline + contested + dis-synergy = sum of rows failed for at least one deal. Every total on this page is therefore refused until the rows are corrected.',
    }),
    summaryCard(report),
    tabs({
      items: SYNERGY_VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'thesis' ? report.counts.live : row.key === 'contested' ? report.counts.contestedGroups : undefined,
      })),
      active: view,
      ariaLabel: 'Deal synergy views',
      onSelect: (key) => ctx.navigate(`${BASE_HREF}${BASE_HREF.includes('?') ? '&' : '?'}view=${key}`),
    }),
    view === 'thesis' ? thesisView(ctx, viewForDialogs, caps, onDone) : null,
    view === 'contested' ? contestedView(ctx, viewForDialogs, caps, onDone) : null,
    view === 'method' ? methodView(report) : null,
  );
}

export default renderFinanceDealSynergyPanel;
