/**
 * app/views/matrixChargebackPostingPanel.js — `#/matrix?panel=postings`, the
 * Chargeback Period Posting & Budget-Envelope Binding ledger (ADR-0194,
 * Schema v154, `RULE-CBP-01`, CSV scope #146).
 *
 * Every figure on this panel is printed straight from
 * `chargebackPostingReport()` — the same read model the CSV, the brief and the
 * rule use — and nothing is recomputed here. A drifted posting prints the
 * exact cents then and now; a decayed envelope binding prints its reason; a
 * withheld row is counted, never silently absent.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { chargebackPostingBriefText, chargebackPostingCsvRows } from '../core/domain/chargebackPosting.js';
import {
  CHARGEBACK_POSTING_CSV_COLUMNS,
  CHARGEBACK_POSTING_LIMITS,
  CHARGEBACK_POSTING_QUESTIONS,
  CHARGEBACK_POSTING_RULE_ID,
} from '../core/domain/chargebackPostingRegistry.js';

const DIAGRAM_URL = './app/assets/chargeback-posting.jpg';

const tone = (t) => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : t === 'good' ? 'good' : 'neutral');

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The posting action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/* ------------------------------------------------------------- post dialog */

/**
 * The poster chooses only the currency and the BINDINGS. The figures are the
 * statement engine's own: nothing on this form can type an amount.
 */
function openPostDialog(ctx, report, currencyRow) {
  const state = ctx.state || {};
  const quarter = report.quarter;
  // The statement accounts carrying this currency, read fresh through the
  // report the panel already has: the dialog lists one binding row per line.
  const result = ctx.api?.transferPriceReport?.({});
  const statement = result?.ok ? result.report : null;
  const accounts = (statement?.accounts || [])
    .map((a) => ({ account: a, row: (a.currencies || []).find((c) => c.currency === currencyRow.currency) }))
    .filter((x) => x.row && ((x.row.chargedCents || 0) > 0 || (x.row.creditedCents || 0) > 0));
  const budgets = Array.isArray(state.budgets) ? state.budgets : [];

  const bindingInputs = [];
  const bindingRows = accounts.map(({ account, row }) => {
    const options = budgets
      .filter((b) => b && b.status === 'active' && b.ownerId === account.accountId && b.currency === currencyRow.currency)
      .map((b) => ({ value: b.id, label: `${b.name} (${b.currency}${b.limit ? `, ceiling ${b.limit}` : ', no ceiling'})` }));
    const select = h('select', { 'aria-label': `Envelope for ${account.name}` },
      h('option', { value: '' }, options.length ? '— no envelope (write the reason) —' : '— this line owns no active envelope in this currency —'),
      ...options.map((o) => h('option', { value: o.value }, o.label)));
    const reason = h('input', {
      type: 'text', placeholder: `No-envelope reason (min ${CHARGEBACK_POSTING_LIMITS.reasonMin} chars)`,
      'aria-label': `No-envelope reason for ${account.name}`,
    });
    bindingInputs.push({ accountId: account.accountId, select, reason });
    return h('div', { class: 'stack-xs', 'data-testid': `cbp-binding-${account.accountId}` },
      h('div', { class: 'row gap' },
        h('strong', {}, account.name),
        h('span', { class: 'muted small' },
          `charged ${row.charged} / credited ${row.credited} ${currencyRow.currency}`)),
      select,
      reason);
  });

  const note = h('input', { type: 'text', 'aria-label': 'Posting note (optional)', placeholder: 'Note (optional)' });
  openModal({
    title: `Post ${quarter.from} – ${quarter.to} in ${currencyRow.currency}`,
    description: 'This freezes the complete statement as a dated period fact: per line, the exact integer cents; in total, the zero-sum identity. The figures are the statement engine’s own — nothing here can be typed over. Bind each line to its OWN active envelope in this currency, or declare in writing that it has none.',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, `${currencyRow.charged} ${currencyRow.currency} charged across ${accounts.length} line account(s), netting to zero. No budget line is written and no envelope figure changes; the posted position is printed beside the envelope, labelled.`),
      ...bindingRows,
      note),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'cbp-post-save',
        onClick: () => {
          const res = ctx.api?.chargebackPost?.({
            currency: currencyRow.currency,
            bindings: bindingInputs.map((b) => ({
              accountId: b.accountId,
              envelopeId: b.select.value || null,
              reason: b.reason.value || '',
            })),
            note: note.value || '',
          });
          if (!notify(ctx, res, `Posted ${quarter.from}–${quarter.to} in ${currencyRow.currency}.`)) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Post this period'),
    ],
  });
}

function openReverseDialog(ctx, posting) {
  const form = buildForm([{
    name: 'reason', label: 'Why is this posting reversed?', type: 'textarea', required: true,
    help: `${CHARGEBACK_POSTING_LIMITS.reasonMin}–${CHARGEBACK_POSTING_LIMITS.reasonMax} characters. The posting stays on the ledger as dated history; reversing restores postability for its period and currency.`,
  }]);
  openModal({
    title: `Reverse the ${posting.periodFrom} – ${posting.periodTo} ${posting.currency} posting`,
    description: 'A closed period is corrected by a dated reversal, never by editing. Nothing in any envelope changes, because nothing in any envelope was written.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger', type: 'button', 'data-testid': 'cbp-reverse-save',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api?.chargebackReversePosting?.(posting.id, v.reason);
          if (!res?.ok) { form.clearErrors(); if (res?.field) form.setFieldError(res.field, res.error); }
          if (!notify(ctx, res, 'Posting reversed. It stays on the ledger as history.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Reverse posting'),
    ],
  });
}

/* ------------------------------------------------------------------- cards */

function standingCard(ctx, report) {
  const q = report.quarter;
  const claims = q.claims;
  const claimBadge = (label, value) => badge(
    `${label}: ${value === true ? 'holds' : value === null ? 'n/a' : 'FAILS'}`,
    value === true ? 'good' : value === null ? 'neutral' : 'bad',
  );
  const currencyRows = q.state === 'ready' ? q.currencies.map((c) => h('div', { class: 'row gap', 'data-testid': `cbp-standing-${c.currency}` },
    badge(c.currency, 'neutral'),
    badge(c.stateLabel, tone(c.stateTone)),
    h('span', { class: 'small' }, `${c.charged} ${c.currency} charged · ${c.entriesN} entr${c.entriesN === 1 ? 'y' : 'ies'}`),
    c.state === 'postable' && report.actor.canPost && typeof ctx.api?.chargebackPost === 'function'
      ? h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `cbp-post-btn-${c.currency}`, onClick: () => openPostDialog(ctx, report, c) }, `Post ${c.currency}…`)
      : null,
  )) : [];
  return card({
    title: 'The last completed quarter',
    subtitle: q.from ? `${q.from} to ${q.to} — ${q.days} whole day(s), inclusive at both ends.` : 'The default period could not be resolved.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' }, badge(q.stateLabel, tone(q.stateTone)), h('span', { class: 'small muted' }, q.state === 'ready' ? 'Every claim below holds; each currency is posted once or owes one posting.' : (q.reason || ''))),
      h('div', { class: 'row gap' },
        claimBadge('statement complete', claims.statementComplete),
        claimBadge('zero-sum', claims.zeroSum),
        claimBadge('share-days reconcile', claims.shareDaysReconcile),
        claimBadge('period-ledger identity', claims.periodLedgerIdentity),
        claimBadge('arithmetic safe', claims.arithmeticSafe)),
      ...(currencyRows.length ? currencyRows : [h('p', { class: 'muted small' }, q.state === 'ready' ? 'No currency carries a charged cent.' : 'Nothing is postable while the statement stands incomplete — the exact failing claim is printed above, and the missing prices are RULE-TPL-01’s asks.')])),
  });
}

function statsGrid(report) {
  const b = report.board;
  return h('div', { class: 'stats-grid' },
    stat({ label: 'Postings', value: String(b.postingsN), hint: `${b.liveN} live · ${b.reversedN} reversed${b.conflictedN ? ` · ${b.conflictedN} CONFLICTED` : ''}` }),
    stat({ label: 'Faithful today', value: String(b.audits.faithful), hint: 'posted figures the record still reproduces exactly', tone: b.audits.faithful === b.liveN && b.liveN > 0 ? 'good' : '' }),
    stat({ label: 'Drifted / regressed', value: String(b.audits.drifted + b.audits['statement-regressed']), hint: `${b.audits.drifted} drifted · ${b.audits['statement-regressed']} regressed · ${b.audits['window-unreadable']} unreadable`, tone: b.audits.drifted + b.audits['statement-regressed'] > 0 ? 'bad' : '' }),
    stat({ label: 'Posted lines', value: String(b.rowsTotalN), hint: `${b.rowsBoundN} bound · ${b.rowsNoEnvelopeN} no-envelope · ${b.rowsDecayedN} decayed` }),
    stat({ label: 'Open posting asks', value: String(b.openAsksN), hint: `${CHARGEBACK_POSTING_RULE_ID}, to the lines’ joint apex` }),
  );
}

function bindingCell(row) {
  return h('div', { class: 'stack-xs' },
    badge(row.binding.label, tone(row.binding.tone)),
    row.envelopeName ? h('span', { class: 'small' }, row.envelopeName) : null,
    row.binding.state === 'no-envelope' && row.noEnvelopeReason ? h('span', { class: 'muted small' }, `“${row.noEnvelopeReason}”`) : null,
    row.binding.state !== 'bound' && row.binding.state !== 'no-envelope' ? h('span', { class: 'muted small' }, row.binding.reason) : null);
}

function postingCard(ctx, report, p) {
  const auditBody = [];
  if (p.audit.detail) auditBody.push(h('p', { class: 'muted small' }, p.audit.detail));
  if (p.audit.drifts.length) {
    auditBody.push(table({
      caption: 'Posted versus re-derived, per account',
      columns: [
        { key: 'accountName', label: 'Line' },
        { key: 'field', label: 'Side' },
        { label: 'Posted', render: (r) => `${r.posted} ${p.currency}` },
        { label: 'Reads today', render: (r) => `${r.current} ${p.currency}` },
        { label: 'Delta (cents)', render: (r) => String(r.deltaCents) },
      ],
      rows: p.audit.drifts,
    }));
    if (p.audit.driftsOmittedN) auditBody.push(h('p', { class: 'muted small' }, `${p.audit.driftsOmittedN} further drifted figure(s) counted, not printed.`));
  }
  return card({
    title: `${p.periodFrom} – ${p.periodTo} · ${p.currency}`,
    subtitle: `Posted ${p.postedOn}${p.via === 'operator' ? ' (scribed in the operator view)' : ''} · ${p.totalCharged} ${p.currency} charged = ${p.totalCredited} credited · ${p.entriesN} entr${p.entriesN === 1 ? 'y' : 'ies'} over ${p.pricedShareDays} priced share-day(s) · statement engine ${p.engineVersion}`,
    attrs: { 'data-testid': `cbp-posting-${p.id}` },
    actions: p.state === 'posted' && report.actor.canReverse && typeof ctx.api?.chargebackReversePosting === 'function'
      ? [h('button', { class: 'btn btn-small', type: 'button', 'data-testid': `cbp-reverse-btn-${p.id}`, onClick: () => openReverseDialog(ctx, p) }, 'Reverse…')]
      : [],
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' },
        badge(p.stateLabel, tone(p.stateTone)),
        p.conflicted ? badge('CONFLICTED — another live posting covers this period and currency; neither is picked', 'bad') : null,
        badge(p.audit.label, tone(p.audit.tone)),
        p.zeroSum ? badge('nets to zero', 'good') : badge('DOES NOT NET TO ZERO', 'bad')),
      p.state === 'reversed' ? h('p', { class: 'muted small' }, `Reversed ${p.reversedOn}${p.reversedVia === 'operator' ? ' (scribed)' : ''}: “${p.reverseReason}”`) : null,
      ...auditBody,
      table({
        caption: 'Posted lines and their envelope bindings',
        columns: [
          { key: 'accountName', label: 'Line' },
          { label: 'Charged', render: (r) => `${r.charged} ${p.currency}` },
          { label: 'Credited', render: (r) => `${r.credited} ${p.currency}` },
          { label: 'Envelope binding', render: (r) => bindingCell(r) },
        ],
        rows: p.rows,
        emptyMessage: 'Every line of this posting is outside this seat; the rows are counted above.',
      }),
      p.rowsWithheldN ? h('p', { class: 'muted small' }, `${p.rowsWithheldN} line(s) outside this seat: counted, not shown.`) : null,
      p.note ? h('p', { class: 'muted small' }, `Note: ${p.note}`) : null),
  });
}

function methodCard(report) {
  return card({
    title: 'Method — what a posting is, and is not',
    body: h('div', { class: 'stack-sm' },
      h('img', {
        src: DIAGRAM_URL,
        alt: 'Conceptual method diagram, not workspace data: a completed chargeback statement sheet with a zero-sum check feeds a dated posting document; the posting binds each line’s charge and credit to that line’s own budget envelope or to an explicit written no-envelope declaration; a reversal arrow loops back as a dated act; a comparison lens re-derives the statement and prints faithful or drifted; nothing writes into the envelopes’ own arithmetic.',
        style: 'max-width:100%;height:auto;border-radius:8px;',
      }),
      h('ol', { class: 'stack-xs' }, ...report.method.map((m) => h('li', { class: 'small' }, m))),
      h('h4', {}, 'What this screen refuses to claim'),
      h('ul', { class: 'stack-xs' }, ...report.limits.map((m) => h('li', { class: 'small muted' }, m))),
      h('h4', {}, 'The questions this ledger answers'),
      h('ul', { class: 'stack-xs' }, ...CHARGEBACK_POSTING_QUESTIONS.map((m) => h('li', { class: 'small muted' }, m)))),
  });
}

/* ------------------------------------------------------------------ render */

export function renderMatrixChargebackPostingPanel(ctx) {
  const result = ctx?.api?.chargebackPostingReport?.();
  if (!result?.ok || !result.report) {
    return card({
      title: 'Chargeback postings',
      body: banner({ tone: 'bad', title: 'The posting ledger could not be read', body: result?.error || 'The reader refused this seat.' }),
    });
  }
  const report = result.report;
  const brief = chargebackPostingBriefText(report);
  const actions = [];
  if (report.actor.canScan && typeof ctx.api?.chargebackPostingScan === 'function') {
    actions.push(h('button', {
      class: 'btn btn-small', type: 'button', 'data-testid': 'cbp-scan-btn',
      onClick: () => {
        const res = ctx.api.chargebackPostingScan();
        if (!notify(ctx, res, `Scanned for complete, unposted quarters (${CHARGEBACK_POSTING_RULE_ID}).`)) return;
        refreshView(ctx);
      },
    }, 'Scan postings'));
  }
  if (report.actor.canGovern && typeof ctx.api?.chargebackPostingSetConventions === 'function') {
    const paused = report.conventions.autoPropagate === false;
    actions.push(h('button', {
      class: 'btn btn-small', type: 'button', 'data-testid': 'cbp-pause-btn',
      onClick: () => {
        const res = ctx.api.chargebackPostingSetConventions({ autoPropagate: paused });
        if (!notify(ctx, res, paused ? `${CHARGEBACK_POSTING_RULE_ID} automatic asks resumed.` : `${CHARGEBACK_POSTING_RULE_ID} automatic asks paused; an explicit scan still runs.`)) return;
        refreshView(ctx);
      },
    }, paused ? 'Resume automatic asks' : 'Pause automatic asks'));
  }
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'cbp-brief-btn',
    onClick: () => downloadText({ filename: `leados-chargeback-postings-brief-${report.generatedOn}.txt`, text: `${brief}\n`, mime: 'text/plain' }),
  }, 'Download brief'));
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'cbp-csv-btn',
    onClick: () => downloadText({
      filename: `leados-chargeback-postings-${report.generatedOn}.csv`,
      text: serializeCsv(CHARGEBACK_POSTING_CSV_COLUMNS.map((key) => ({ key, header: key })), chargebackPostingCsvRows(report)),
      mime: 'text/csv',
    }),
  }, 'Export CSV (#146)'));

  return h('div', { class: 'stack', 'data-testid': 'matrix-chargeback-posting-panel' },
    h('p', { class: 'lede' }, 'A complete chargeback statement is still only a reading until somebody turns it into a dated period fact. A posting freezes one period and one currency of the whole-workspace statement — exact integer cents, netting to zero — and binds every line’s figure to that line’s own budget envelope, or to a written declaration that it has none. Posting an incomplete statement is refused with the failing claim named; a posted period is corrected by a dated reversal, never an edit; and every read re-derives the record and prints whether it still says what was signed.'),
    report.inertNote ? banner({ tone: 'info', title: 'Nothing to post', body: report.inertNote }) : null,
    standingCard(ctx, report),
    report.board.postingsN > 0 || report.quarter.state !== 'inert' ? statsGrid(report) : null,
    card({
      title: 'Chargeback postings',
      subtitle: `${report.scopeLabel} · generated ${report.generatedOn}`,
      actions,
      body: h('div', { class: 'stack-sm' },
        h('pre', { class: 'small', 'data-testid': 'cbp-brief' }, brief),
        h('p', { class: 'muted small' },
          `Conventions: ask due in ${report.conventions.askDueDays}d · ${CHARGEBACK_POSTING_RULE_ID} auto-asks ${report.conventions.autoPropagate ? 'on' : 'paused'} · post/reverse requires VP rank or the operator view.`)),
    }),
    ...(report.postings.length
      ? report.postings.map((p) => postingCard(ctx, report, p))
      : [emptyState({ title: 'No posting has ever been made.', body: 'When the last completed quarter’s statement reads complete, each currency can be posted above — and RULE-CBP-01 puts one dated ask in front of the seat the statement’s lines roll up to.' })]),
    report.postingsOmittedN ? h('p', { class: 'muted small' }, `${report.postingsOmittedN} older posting(s) counted, not printed.`) : null,
    methodCard(report),
  );
}

export default renderMatrixChargebackPostingPanel;
