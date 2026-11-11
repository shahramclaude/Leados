/**
 * app/views/matrixChargebackPanel.js — `#/matrix?panel=chargeback`, the
 * Cross-Line Labour Chargeback & Internal Transfer-Price Ledger (ADR-0177,
 * Schema v142, `RULE-TPL-01`, CSV scope #132).
 *
 * Every figure on this panel is printed straight from `transferPriceReport()`
 * — the same read model the CSV and the rule use — and nothing is recomputed
 * here. A withheld net prints the word "withheld" and its reason; it is never
 * rendered as a zero.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { startOfDay } from '../core/time.js';
import { LEADER_ID } from '../core/domain/chain.js';
import { defaultAllocationPeriod } from '../core/domain/linePeriodAllocation.js';
import { transferPriceBriefText, transferPriceCsvRows } from '../core/domain/transferPrice.js';
import {
  TRANSFER_PRICE_BASES,
  TRANSFER_PRICE_BOUNDS,
  TRANSFER_PRICE_CSV_COLUMNS,
  TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_PIECE_LABELS,
  TRANSFER_PRICE_QUESTIONS,
  TRANSFER_PRICE_REFUSAL_STATES,
  TRANSFER_PRICE_RULE_ID,
  TRANSFER_PRICE_VERDICTS,
} from '../core/domain/transferPriceRegistry.js';

const tone = (t) => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : t === 'good' ? 'good' : 'neutral');
const money = (display, currency) => (display === null || display === undefined ? 'withheld' : `${display} ${currency}`);

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The transfer-price action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/* ------------------------------------------------------------- period picker */

function periodPresets(now) {
  const d = startOfDay(now) || new Date();
  const today = d.toISOString().slice(0, 10);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const lastQ = defaultAllocationPeriod(d);
  return [
    { label: 'Last completed quarter', from: lastQ.from, to: lastQ.to },
    { label: 'Quarter to date (open)', from: `${year}-${starts[q]}`, to: today },
    { label: 'Year to date (open)', from: `${year}-01-01`, to: today },
    { label: 'Last completed year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  ];
}

function periodPicker(ctx, report, now) {
  const w = report.window;
  const nav = (from, to) => ctx.navigate?.(`#/matrix?panel=chargeback&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const fromInput = h('input', { type: 'date', value: w.from || '', 'aria-label': 'Period start day' });
  const toInput = h('input', { type: 'date', value: w.to || '', 'aria-label': 'Period end day' });
  return card({
    title: 'The period being charged',
    subtitle: w.valid
      ? `${w.from} to ${w.to} — ${w.days} whole day(s), inclusive at both ends. ${w.source === 'default' ? 'No period was named, so the last completed calendar quarter is read.' : 'Named on this screen.'}`
      : 'The named period is REFUSED. Nothing was clamped and nothing was priced.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' },
        ...periodPresets(now).map((p) => h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => nav(p.from, p.to) }, p.label))),
      h('div', { class: 'row gap' },
        fromInput,
        toInput,
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const from = String(fromInput.value || '').trim();
            const to = String(toInput.value || '').trim();
            if (from && to) nav(from, to);
          },
        }, 'Read this period'),
        h('span', { class: 'muted small' }, 'An open period charges days that have not happened at today’s declared shares; the statement is only as closed as the period you name.'))),
  });
}

/* ------------------------------------------------------------------ dialogs */

function basisOptions() {
  return TRANSFER_PRICE_BASES.map((b) => ({ value: b.key, label: `${b.label} — ${b.detail}` }));
}

function openProposeDialog(ctx, report, pair = null) {
  const operator = report.actor.fullAccess;
  const people = (ctx.state?.people || [])
    .filter((p) => p && p.status !== 'archived')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const managerOptions = [{ value: '', label: '— choose a manager —' }, { value: LEADER_ID, label: 'The workspace leader' },
    ...people.map((p) => ({ value: p.id, label: p.name }))];
  const w = report.window;
  const fields = [];
  if (pair) {
    fields.push({ type: 'static', label: 'Lending line (the home manager)', value: h('strong', {}, pair.lenderName) });
    fields.push({ type: 'static', label: 'Borrowing line (holds the declared line)', value: h('strong', {}, pair.borrowerName) });
  } else {
    fields.push({ name: 'lenderId', label: 'Lending line — the HOME manager of the people being lent', type: 'select', options: managerOptions, required: true });
    fields.push({ name: 'borrowerId', label: 'Borrowing line — the manager who holds the declared additional line', type: 'select', options: managerOptions, required: true });
  }
  if (operator) {
    fields.push({
      name: 'actingSide', label: 'Whose key are you scribing?', type: 'select', required: true,
      options: [{ value: '', label: '— choose —' }, { value: 'lender', label: 'The lending manager’s key' }, { value: 'borrower', label: 'The borrowing manager’s key' }],
      help: 'The operator view records a scribed statement, not that manager’s own act. It is stored and printed as scribed.',
    });
  }
  fields.push({ name: 'currency', label: 'Currency (3-letter code)', type: 'text', required: true, placeholder: 'EUR' });
  fields.push({
    name: 'ratePerPersonDay', label: 'Rate per full person-day (whole currency units)', type: 'number', min: 0, max: TRANSFER_PRICE_LIMITS.maxRateCents, step: 1, required: true,
    help: 'A whole number, so one hundredth of a person-day is a whole cent and no charge is ever rounded. 0 records an explicitly agreed zero.',
  });
  fields.push({ name: 'basis', label: 'How was the number reached?', type: 'select', required: true, options: [{ value: '', label: '— choose —' }, ...basisOptions()] });
  fields.push({ name: 'effectiveFrom', label: 'First day the price applies', type: 'date', required: true, value: w.valid ? w.from : '' });
  fields.push({
    name: 'effectiveTo', label: 'Last day the price applies', type: 'date', required: true, value: w.valid ? w.to : '',
    help: `A price runs for ${TRANSFER_PRICE_BOUNDS.termDays[0]}–${TRANSFER_PRICE_BOUNDS.termDays[1]} days. Open-ended prices are refused.`,
  });
  fields.push({ name: 'note', label: 'Note (optional)', type: 'text' });
  const form = buildForm(fields);
  openModal({
    title: pair ? `Propose a transfer price — ${pair.lenderName} → ${pair.borrowerName}` : 'Propose a transfer price',
    description: 'This turns ONE key. The price exists only when the other line’s manager confirms the same terms.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'tpl-propose-save',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api?.transferPricePropose?.({
            lenderId: pair ? pair.lenderId : v.lenderId,
            borrowerId: pair ? pair.borrowerId : v.borrowerId,
            ...(operator ? { actingSide: v.actingSide } : {}),
            currency: v.currency,
            ratePerPersonDay: v.ratePerPersonDay === '' ? '' : Number(v.ratePerPersonDay),
            basis: v.basis,
            effectiveFrom: v.effectiveFrom,
            effectiveTo: v.effectiveTo,
            note: v.note,
          });
          if (!res?.ok) { form.clearErrors(); if (res?.field) form.setFieldError(res.field, res.error); }
          if (!notify(ctx, res, 'Price proposed. It carries one key until the other line confirms it.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Propose price'),
    ],
  });
}

function openConfirmDialog(ctx, report, a) {
  openModal({
    title: `Confirm the transfer price — ${a.lenderName} → ${a.borrowerName}`,
    description: report.actor.fullAccess
      ? `You are scribing the ${a.missingSide} key in the operator view. It is stored and printed as scribed, not as that manager’s own act.`
      : `You hold the ${a.missingSide} key. Confirming turns it; the terms cannot be changed here.`,
    body: h('div', { class: 'stack' },
      h('p', {}, h('strong', {}, a.rateDisplay), ` (${a.rateCents} cents per share-day) · ${a.basisLabel}`),
      h('p', {}, `From ${a.effectiveFrom} to ${a.effectiveTo} (${a.termDays} days).`),
      h('p', { class: 'muted small' }, `Proposed on ${a.proposedOn} by the ${a.proposedBySide} line${a.proposedVia === 'operator' ? ' (scribed in the operator view)' : ''}.${a.note ? ` Note: ${a.note}` : ''}`),
      h('p', { class: 'muted small' }, 'If these are not the terms you agreed, decline and propose your own. A confirmation is stored with the exact terms it confirmed.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'tpl-confirm-save',
        onClick: () => {
          const res = ctx.api?.transferPriceConfirm?.(a.id, {});
          if (!notify(ctx, res, 'Price confirmed. It now carries two keys.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Confirm these terms'),
    ],
  });
}

function openRetireDialog(ctx, report, a) {
  const agreed = a.state === 'agreed';
  const fields = [];
  if (report.actor.fullAccess) {
    fields.push({
      name: 'actingSide', label: 'Whose act are you scribing?', type: 'select', required: true,
      options: [{ value: '', label: '— choose —' }, { value: 'lender', label: 'The lending manager' }, { value: 'borrower', label: 'The borrowing manager' }],
    });
  }
  if (agreed) {
    fields.push({
      name: 'voidFrom', label: 'First day the price no longer applies', type: 'date',
      help: `Leave blank to void from today. A day in the past restates every period the price covered from that day; the share-days it uncovers are refused until a new price is agreed. Term: ${a.effectiveFrom} to ${a.effectiveTo}.`,
    });
  }
  fields.push({
    name: 'reason', label: agreed ? 'Why is this price voided?' : 'Why is this proposal retired?', type: 'textarea', required: true,
    help: `${TRANSFER_PRICE_LIMITS.reasonMin}–${TRANSFER_PRICE_LIMITS.reasonMax} characters. The price stays in the ledger; the reason is what a later reader has.`,
  });
  const form = buildForm(fields);
  openModal({
    title: agreed ? `Void the agreed price — ${a.lenderName} → ${a.borrowerName}` : `Decline or withdraw the proposal — ${a.lenderName} → ${a.borrowerName}`,
    description: agreed
      ? 'An appended act: nothing is edited. Days before the void stay priced at the agreed rate.'
      : 'The proposing line withdraws; the other line declines. Either way the proposal prices nothing and its ask closes.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'tpl-retire-save',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api?.transferPriceRetire?.(a.id, {
            reason: v.reason,
            ...(report.actor.fullAccess ? { actingSide: v.actingSide } : {}),
            ...(agreed && v.voidFrom ? { voidFrom: v.voidFrom } : {}),
          });
          if (!res?.ok) { form.clearErrors(); if (res?.field) form.setFieldError(res.field, res.error); }
          if (!notify(ctx, res, agreed ? 'Price voided.' : 'Proposal retired.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, agreed ? 'Void price' : 'Retire proposal'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function verdictBanners(report) {
  const w = report.window;
  const b = report.board;
  if (!w.valid) return [banner({ tone: 'bad', title: 'The period itself is refused', body: w.refuseReason })];
  if (report.verdict === 'inert') return [banner({ tone: 'neutral', title: 'Nothing to charge in this period', body: report.inertNote })];
  const out = [];
  out.push(b.zeroSum.holds
    ? banner({ tone: b.zeroSum.currenciesN ? 'good' : 'neutral', title: b.zeroSum.currenciesN ? 'Every charge has its credit: the workspace nets to zero' : 'No charge is posted', body: b.zeroSum.detail })
    : banner({ tone: 'bad', title: 'THE WORKSPACE DOES NOT NET TO ZERO', body: b.zeroSum.detail }));
  out.push(b.statementComplete
    ? banner({ tone: 'good', title: 'The statement is complete', body: 'Every chargeable share-day in scope carries exactly one two-key price.' })
    : banner({ tone: report.verdictTone === 'bad' ? 'bad' : 'warn', title: `${report.verdictLabel} — the statement is NOT complete`, body: b.incompleteReason }));
  if (!b.shareDaysReconcile || b.periodLedgerIdentity === false || !b.rowsReconcile || !b.pairsReconcile || !b.agreementsReconcile) {
    out.push(banner({
      tone: 'bad',
      title: 'Reconciliation warning — the counts below do not add up',
      body: `Share-day partition ${b.shareDaysReconcile ? 'reconciles' : 'DOES NOT reconcile'}; period-ledger identity ${b.periodLedgerIdentity === false ? 'DOES NOT hold' : 'holds'}; row states ${b.rowsReconcile ? 'reconcile' : 'DO NOT reconcile'}; pair states ${b.pairsReconcile ? 'reconcile' : 'DO NOT reconcile'}; agreement states ${b.agreementsReconcile ? 'reconcile' : 'DO NOT reconcile'}. Treat every figure as unverified and report it.`,
    }));
  }
  return out;
}

function statsGrid(report) {
  const b = report.board;
  return h('div', { class: 'stat-grid', 'data-testid': 'tpl-stats' },
    stat({
      label: 'Consumed share-days in scope',
      value: h('span', { 'data-testid': 'tpl-consumed' }, String(b.consumedShareDays)),
      hint: `${b.rowsN} line row(s) · ${b.personsN} person(s) · from the period ledger (identity: ${b.periodLedgerIdentity === null ? 'nothing measured' : b.periodLedgerIdentity ? 'verified' : 'FAILED'})`,
    }),
    stat({
      label: 'Priced under two keys',
      value: h('span', { 'data-testid': 'tpl-priced' }, String(b.pricedShareDays)),
      hint: `${b.zeroPricedShareDays} at an agreed zero · ${b.presumedLenderShareDays} on a presumed lender · ${b.retroactiveShareDays} priced after the fact`,
      tone: b.pricedShareDays && !b.unpricedShareDays ? 'good' : '',
    }),
    stat({
      label: 'Refused — no price',
      value: h('span', { 'data-testid': 'tpl-unpriced' }, String(b.unpricedShareDays)),
      hint: `${b.unmeasuredRowsN} row(s) unmeasured · ${b.sameLineShareDays} share-day(s) not chargeable (same line) · partition ${b.shareDaysReconcile ? 'reconciles' : 'DOES NOT RECONCILE'}`,
      tone: b.unpricedShareDays || b.unmeasuredRowsN ? 'bad' : 'good',
    }),
    stat({
      label: 'Pairs of lines',
      value: String(b.pairsN),
      hint: `${b.pairs.priced} priced in full · ${b.pairs['partly-priced']} partly · ${b.pairs.unpriced} unpriced · ${b.pairs.unmeasured} unmeasured`,
    }),
    stat({
      label: 'Agreements',
      value: `${b.agreements.agreed} / ${b.agreementsN}`,
      hint: `${b.agreements.proposed} awaiting a second key · ${b.agreements.voided} voided · ${b.bothKeysScribedN} with both keys scribed`,
      tone: b.agreements.proposed ? 'warn' : '',
    }),
    stat({
      label: 'Line nets withheld',
      value: h('span', { 'data-testid': 'tpl-nets-withheld' }, `${b.accountsNetWithheldN} / ${b.accountsN}`),
      hint: `${b.accountsWithheldN} account(s), ${b.rowsWithheldN} row(s) and ${b.agreementsWithheldN} agreement(s) outside this seat, counted`,
      tone: b.accountsNetWithheldN ? 'warn' : '',
    }),
    stat({ label: 'Open asks', value: String(b.openAsksN), hint: TRANSFER_PRICE_RULE_ID }),
  );
}

function refusalCard(report) {
  const b = report.board;
  if (!report.window.valid || report.verdict === 'inert') return null;
  return card({
    title: 'Why share-days are refused',
    subtitle: `Five closed reasons; the counts sum to ${b.unpricedShareDays} refused share-day(s). None is charged at zero or at an average.`,
    body: table({
      caption: 'Refused share-days by reason',
      columns: [
        { label: 'Reason', render: (key) => TRANSFER_PRICE_PIECE_LABELS[key] },
        { label: 'Share-days', render: (key) => h('span', { 'data-testid': `tpl-refused-${key}` }, String(b.refused[key])) },
      ],
      rows: [...TRANSFER_PRICE_REFUSAL_STATES],
    }),
  });
}

function currencyCard(report) {
  const b = report.board;
  if (!b.currencies.length) return null;
  const full = report.seat.fullAccess;
  return card({
    title: full ? 'The statement, per currency' : 'This seat’s lines, per currency',
    subtitle: full
      ? 'Exact integer cents. Currencies are never pooled and no exchange rate is applied. In the workspace view the net is zero by identity and is printed as the check it is.'
      : 'Exact integer cents charged to and credited to the lines this seat reads. One side of two-sided entries is not expected to net to zero.',
    body: table({
      caption: 'Charged and credited per currency',
      columns: [
        { label: 'Currency', render: (c) => c.currency },
        { label: 'Entries', render: (c) => String(c.entriesN) },
        { label: 'Charged', render: (c) => h('span', { 'data-testid': `tpl-cur-${c.currency}-charged` }, c.charged) },
        { label: 'Credited', render: (c) => h('span', { 'data-testid': `tpl-cur-${c.currency}-credited` }, c.credited) },
        { label: 'Net', render: (c) => h('span', { 'data-testid': `tpl-cur-${c.currency}-net` }, c.net === null ? 'withheld' : c.net) },
        { label: 'Nets to zero', render: (c) => (c.zeroSum === null ? '—' : badge(c.zeroSum ? 'yes' : 'NO', c.zeroSum ? 'good' : 'bad')) },
      ],
      rows: b.currencies,
    }),
  });
}

function pairsCard(ctx, report) {
  if (!report.pairs.length) return null;
  return card({
    title: 'Pairs of lines that traded labour in this period',
    subtitle: 'Lender → borrower. A pair with no two-key price is refused and listed here as work, not hidden.',
    body: table({
      caption: 'Directed pairs of lines with consumed share-days',
      columns: [
        { label: 'Lending line', render: (p) => h('span', {}, p.lenderName, p.lenderKnown && !p.lenderOnRoster ? ' (off the roster)' : '') },
        { label: 'Borrowing line', render: (p) => p.borrowerName },
        { label: 'State', render: (p) => badge(p.stateLabel, tone(p.stateTone)) },
        { label: 'Share-days', render: (p) => h('div', { class: 'stack-tight' },
          h('span', {}, `${p.pricedShareDays} priced of ${p.shareDays}`),
          p.unpricedShareDays ? h('span', { class: 'muted small' }, TRANSFER_PRICE_REFUSAL_STATES.filter((k) => p.refused[k]).map((k) => `${p.refused[k]} ${TRANSFER_PRICE_PIECE_LABELS[k].toLowerCase()}`).join(' · ')) : null,
          p.unmeasuredRowsN ? h('span', { class: 'muted small' }, `${p.unmeasuredRowsN} row(s) refused by the period ledger`) : null,
          h('span', { class: 'muted small' }, `${p.peopleN} person(s) on ${p.linesN} declared line(s)`)) },
        { label: 'Charged', render: (p) => (p.cents.length ? p.cents.map((c) => `${c.display} ${c.currency}`).join(' · ') : '—') },
        { label: 'Price', render: (p) => (p.canPropose && p.lenderId && p.borrowerId
          ? h('button', { type: 'button', class: 'btn btn-tiny btn-primary', 'data-testid': `tpl-propose-${p.lenderId}-${p.borrowerId}`, onClick: () => openProposeDialog(ctx, report, p) }, p.state === 'priced' ? 'Propose another term' : 'Propose a price')
          : h('span', { class: 'muted small' }, p.lenderKnown ? 'A party to the pair proposes' : 'Record the home line first')) },
      ],
      rows: report.pairs,
    }),
  });
}

function agreementsCard(ctx, report) {
  if (!report.agreements.length) {
    return card({
      title: 'Transfer-price agreements',
      body: emptyState({ title: 'No price has been proposed', body: 'A price is proposed by one of the two line managers and exists only when the other confirms the same terms.' }),
    });
  }
  return card({
    title: 'Transfer-price agreements',
    subtitle: 'Dated two-key acts. A proposal carries one key and prices nothing. Nothing here is edited; a change is a new act.',
    body: table({
      caption: 'Transfer-price agreements and their keys',
      columns: [
        { label: 'Lender → borrower', render: (a) => `${a.lenderName} → ${a.borrowerName}` },
        { label: 'Rate', render: (a) => h('div', { class: 'stack-tight' }, h('span', {}, a.rateDisplay), h('span', { class: 'muted small' }, a.basisLabel)) },
        { label: 'Term', render: (a) => h('div', { class: 'stack-tight' },
          h('span', {}, `${a.effectiveFrom} → ${a.effectiveTo}`),
          a.state === 'voided' ? h('span', { class: 'muted small' }, a.coverTo ? `prices through ${a.coverTo}; voided from ${a.voidFrom}` : `voided in full from ${a.voidFrom}`) : null,
          a.phase ? h('span', { class: 'muted small' }, a.phase === 'in-force' ? 'in force today' : a.phase) : null) },
        { label: 'State', render: (a) => h('div', { class: 'stack-tight' },
          badge(a.stateLabel, tone(a.stateTone)),
          a.state === 'proposed' ? h('span', { class: 'muted small' }, `missing: ${a.missingKeyName}’s ${a.missingSide} key`) : null,
          a.bothKeysScribed ? h('span', { class: 'muted small' }, 'both keys scribed in the operator view') : null,
          a.retireReason ? h('span', { class: 'muted small' }, a.retireReason) : null) },
        { label: 'Keys', render: (a) => h('span', { class: 'muted small' },
          `${a.proposedBySide} ${a.proposedOn}${a.proposedVia === 'operator' ? ' (scribed)' : ''}`,
          a.confirmedOn ? ` · ${a.proposedBySide === 'lender' ? 'borrower' : 'lender'} ${a.confirmedOn}${a.confirmedVia === 'operator' ? ' (scribed)' : ''}` : '') },
        { label: 'Act', render: (a) => h('span', { class: 'row gap' },
          a.canConfirm ? h('button', { type: 'button', class: 'btn btn-tiny btn-primary', 'data-testid': `tpl-confirm-${a.id}`, onClick: () => openConfirmDialog(ctx, report, a) }, 'Confirm') : null,
          a.canRetire ? h('button', { type: 'button', class: 'btn btn-tiny', 'data-testid': `tpl-retire-${a.id}`, onClick: () => openRetireDialog(ctx, report, a) }, a.state === 'agreed' ? 'Void' : 'Decline / withdraw') : null,
          !a.canConfirm && !a.canRetire ? h('span', { class: 'muted small' }, '—') : null) },
      ],
      rows: report.agreements,
    }),
  });
}

function accountsCard(report) {
  const rows = report.accounts.flatMap((a) => (a.currencies.length
    ? a.currencies.map((c, i) => ({ a, c, first: i === 0 }))
    : [{ a, c: null, first: true }]));
  if (!rows.length) return null;
  return card({
    title: 'Line accounts',
    subtitle: 'One account per line manager. Charged and credited are what the agreed prices state; the NET is printed only when nothing that names the line is refused.',
    body: table({
      caption: 'Charged, credited and net per line account and currency',
      columns: [
        { label: 'Line', render: (x) => (x.first ? h('span', {}, x.a.name, x.a.onRoster ? '' : ' (off the roster)') : '') },
        { label: 'Currency', render: (x) => (x.c ? x.c.currency : '—') },
        { label: 'Charged (borrowed)', render: (x) => (x.c ? x.c.charged : '—') },
        { label: 'Credited (lent)', render: (x) => (x.c ? x.c.credited : '—') },
        { label: 'Net', render: (x) => (x.c
          ? h('span', { 'data-testid': `tpl-acct-${x.a.accountId}-${x.c.currency}-net`, title: x.a.netWithheldReason || '' }, x.c.net === null ? 'withheld' : x.c.net)
          : h('span', { class: 'muted small' }, 'no priced entry')) },
        { label: 'Why withheld', render: (x) => (x.first && x.a.netWithheldReason ? h('span', { class: 'muted small' }, x.a.netWithheldReason) : '') },
      ],
      rows,
    }),
  });
}

function spansCard(report) {
  const rows = report.spans.flatMap((s) => (s.currencies.length
    ? s.currencies.map((c, i) => ({ s, c, first: i === 0 }))
    : [{ s, c: null, first: true }]));
  if (!rows.length) return null;
  return card({
    title: 'Spans, consolidated along the home-line tree',
    subtitle: 'Charges between two lines INSIDE a span are eliminated; only what crosses its boundary remains. At the workspace root everything eliminates.',
    body: table({
      caption: 'Eliminated, inflow, outflow and net per span and currency',
      columns: [
        { label: 'Span', render: (x) => (x.first ? h('div', { class: 'stack-tight' },
          h('span', {}, x.s.name),
          h('span', { class: 'muted small' }, `${x.s.accountsN} line account(s)${x.s.matrixSharedAccountsN ? ` · ${x.s.matrixSharedAccountsN} also answer to a manager outside this span on a declared line (consolidated here by the home-line convention)` : ''}`)) : '') },
        { label: 'Currency', render: (x) => (x.c ? x.c.currency : '—') },
        { label: 'Eliminated inside', render: (x) => (x.c ? h('span', { 'data-testid': `tpl-span-${x.s.nodeId}-${x.c.currency}-eliminated` }, x.c.eliminated) : '—') },
        { label: 'Credited from outside', render: (x) => (x.c ? x.c.inflow : '—') },
        { label: 'Charged to outside', render: (x) => (x.c ? x.c.outflow : '—') },
        { label: 'Net', render: (x) => (x.c
          ? h('span', { 'data-testid': `tpl-span-${x.s.nodeId}-${x.c.currency}-net`, title: x.s.netWithheldReason || '' }, x.c.net === null ? 'withheld' : x.c.net)
          : h('span', { class: 'muted small' }, 'no priced entry')) },
      ],
      rows,
    }),
  });
}

function ledgerCard(report) {
  if (!report.rows.length) return null;
  const rows = report.rows.flatMap((r) => (r.pieces.length
    ? r.pieces.map((p, i) => ({ r, p, first: i === 0 }))
    : [{ r, p: null, first: true }]));
  return card({
    title: 'The ledger: every borrowed line, piece by piece',
    subtitle: `${report.rows.length} line row(s)${report.rowsOmittedN ? `; ${report.rowsOmittedN} more counted in every total and not printed` : ''}. Nothing on this table is stored: every piece is recomputed from the declared lines, the recorded home lines and the price acts on every render.`,
    body: table({
      caption: 'Chargeback ledger pieces per person and declared line',
      columns: [
        { label: 'Person · borrowing line', render: (x) => (x.first ? h('div', { class: 'stack-tight' },
          h('strong', {}, x.r.personName),
          h('span', { class: 'muted small' }, `${x.r.kind} line to ${x.r.borrowerName}`),
          badge(x.r.stateLabel, tone(x.r.stateTone)),
          !x.r.measured ? h('span', { class: 'muted small' }, x.r.periodReason) : null,
          x.r.piecesOmittedN ? h('span', { class: 'muted small' }, `${x.r.piecesOmittedN} more piece(s) counted, not printed`) : null,
          x.r.piecesWithheldN ? h('span', { class: 'muted small' }, `${x.r.piecesWithheldN} piece(s) credit a line outside this seat and are counted, not shown`) : null) : '') },
        { label: 'Days', render: (x) => (x.p ? `${x.p.fromDay} → ${x.p.toDay}` : '—') },
        { label: 'Lending line', render: (x) => (x.p ? h('div', { class: 'stack-tight' },
          h('span', {}, x.p.lenderName),
          x.p.lenderBasisLabel ? h('span', { class: 'muted small' }, x.p.lenderBasisLabel) : null) : '—') },
        { label: 'State', render: (x) => (x.p ? h('span', { title: x.p.reason }, badge(x.p.stateLabel, tone(x.p.stateTone)), x.p.retroactive ? badge('priced after the fact', 'neutral') : null) : '—') },
        { label: 'Arithmetic', render: (x) => (x.p
          ? h('span', { class: 'muted small' }, x.p.arithmetic || `${x.p.shareH}% × ${x.p.days} day(s) = ${x.p.shareDays} share-days — refused`)
          : '—') },
        { label: 'Charge', render: (x) => (x.p ? (x.p.display === null ? 'refused' : money(x.p.display, x.p.currency)) : '—') },
      ],
      rows,
    }),
  });
}

function methodCard(report) {
  return card({
    title: 'Method & honest limits',
    subtitle: 'Transfer pricing under decentralisation (Hirshleifer, 1956) · the transfer-pricing problem (Eccles, 1985) · responsibility accounting and consolidation eliminations · the commons (Hardin, 1968) · internal contracting (Coase, 1937)',
    body: h('div', { class: 'stack' },
      h('ul', { class: 'muted small' }, ...TRANSFER_PRICE_QUESTIONS.map((q) => h('li', {}, q))),
      h('ul', { class: 'muted small' }, ...report.method.map((line) => h('li', {}, line))),
      table({
        caption: 'Statement verdict ladder',
        columns: [
          { label: 'Verdict', render: (v) => badge(v.label, tone(v.tone)) },
          { label: 'What it means', render: (v) => h('span', { class: 'muted small' }, v.detail) },
        ],
        rows: [...TRANSFER_PRICE_VERDICTS],
      }),
      h('ul', { class: 'muted small' }, ...report.limits.map((line) => h('li', {}, `Limit: ${line}`)))),
  });
}

/* -------------------------------------------------------------------- route */

/**
 * @param {object} ctx   the view context (state, api, query, navigate, refresh)
 * @param {object} opts  { now }
 */
export function renderMatrixChargebackPanel(ctx, { now = new Date() } = {}) {
  const q = ctx?.query;
  const result = ctx?.api?.transferPriceReport?.({ from: q?.get?.('from') || null, to: q?.get?.('to') || null });
  if (!result?.ok || !result.report) {
    return card({
      title: 'Cross-line chargeback',
      body: banner({ tone: 'bad', title: 'The chargeback statement could not be read', body: result?.error || 'The reader refused this seat.' }),
    });
  }
  const report = result.report;
  const brief = transferPriceBriefText(report);
  const actions = [];
  if (report.actor.fullAccess && report.actor.canAgree && typeof ctx.api?.transferPricePropose === 'function') {
    actions.push(h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': 'tpl-propose-btn', onClick: () => openProposeDialog(ctx, report, null) }, 'Propose a price'));
  }
  if (report.actor.canScan && typeof ctx.api?.transferPriceScan === 'function') {
    actions.push(h('button', {
      class: 'btn btn-small', type: 'button', 'data-testid': 'tpl-scan-btn',
      onClick: () => {
        const res = ctx.api.transferPriceScan();
        if (!notify(ctx, res, `Scanned transfer prices (${TRANSFER_PRICE_RULE_ID}).`)) return;
        refreshView(ctx);
      },
    }, 'Scan prices'));
  }
  if (report.actor.canGovern && typeof ctx.api?.transferPriceSetConventions === 'function') {
    const paused = report.conventions.autoPropagate === false;
    actions.push(h('button', {
      class: 'btn btn-small', type: 'button', 'data-testid': 'tpl-pause-btn',
      onClick: () => {
        const res = ctx.api.transferPriceSetConventions({ autoPropagate: paused });
        if (!notify(ctx, res, paused ? `${TRANSFER_PRICE_RULE_ID} automatic asks resumed.` : `${TRANSFER_PRICE_RULE_ID} automatic asks paused; an explicit scan still runs.`)) return;
        refreshView(ctx);
      },
    }, paused ? 'Resume automatic asks' : 'Pause automatic asks'));
  }
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'tpl-brief-btn',
    onClick: () => downloadText({ filename: `leados-chargeback-brief-${report.generatedOn}.txt`, text: `${brief}\n`, mime: 'text/plain' }),
  }, 'Download brief'));
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'tpl-csv-btn',
    onClick: () => downloadText({
      filename: `leados-line-chargeback-${report.generatedOn}.csv`,
      text: serializeCsv(TRANSFER_PRICE_CSV_COLUMNS.map((key) => ({ key, header: key })), transferPriceCsvRows(report)),
      mime: 'text/csv',
    }),
  }, 'Export CSV (#132)'));

  return h('div', { class: 'stack', 'data-testid': 'matrix-chargeback-panel' },
    h('p', { class: 'lede' }, 'A line that borrows part of a person pays nothing for it unless two managers agree a price. This ledger multiplies the share-days a period actually consumed by the price both lines signed, in exact integer cents, posts every charge with its identical credit, and refuses every share-day that has no agreed price — never zero, never an average.'),
    periodPicker(ctx, report, now),
    ...verdictBanners(report),
    report.window.valid && report.verdict !== 'inert' ? statsGrid(report) : null,
    card({
      title: 'Cross-line chargeback',
      subtitle: `${report.scopeLabel} · generated ${report.generatedOn}`,
      actions,
      body: h('div', { class: 'stack-sm' },
        h('pre', { class: 'small', 'data-testid': 'tpl-brief' }, brief),
        h('p', { class: 'muted small' },
          `Conventions: rate in ${report.conventions.rateUnit} · ask due in ${report.conventions.askDueDays}d · ${TRANSFER_PRICE_RULE_ID} auto-asks ${report.conventions.autoPropagate ? 'on' : 'paused'}.`)),
    }),
    currencyCard(report),
    refusalCard(report),
    pairsCard(ctx, report),
    agreementsCard(ctx, report),
    accountsCard(report),
    spansCard(report),
    ledgerCard(report),
    methodCard(report),
  );
}

export default renderMatrixChargebackPanel;
