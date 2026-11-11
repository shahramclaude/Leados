/**
 * app/views/matrixDoaPanel.js — `#/matrix?panel=authority`, the Standing
 * Delegation-of-Authority (DoA) Schedule & Cross-Line Limit Conformance panel
 * (ADR-0174, Schema v138, `RULE-DOA-01`, CSV scope #128).
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildDoaReport,
  doaBriefText,
  doaCandidates,
  doaCsvRows,
} from '../core/domain/doaSchedule.js';
import {
  DOA_CSV_COLUMNS,
  DOA_LINE_SCOPES,
  DOA_METHOD,
  DOA_SCOPE_CLASSES,
} from '../core/domain/doaScheduleRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');

function notify(ctx, result, message) {
  if (!result?.ok) {
    const err = result?.error || 'The authority-schedule action was refused.';
    if (typeof ctx?.toast === 'function') ctx.toast(err, 'bad');
    else toast(err, 'bad');
    return false;
  }
  if (typeof ctx?.toast === 'function') ctx.toast(message, 'good');
  else toast(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function openDeclareDialog(ctx, report, candidates) {
  const seats = candidates?.seats || [];
  if (!seats.length) {
    notify(ctx, { ok: false, error: 'No subordinate seats lie inside your span to grant standing authority.' }, '');
    return;
  }

  const form = buildForm([
    {
      name: 'seatId',
      label: 'Target seat',
      type: 'select',
      value: seats[0].seatId,
      options: seats.map((s) => ({ value: s.seatId, label: s.label })),
      help: 'Anti-self-grant and nemo-dat apply: non-operator principals may grant only to downward seats within their own active ceiling.',
    },
    {
      name: 'lineKind',
      label: 'Reporting-line scope',
      type: 'select',
      value: 'any-line',
      options: DOA_LINE_SCOPES.map((l) => ({ value: l.key, label: l.label })),
    },
    {
      name: 'scopeClass',
      label: 'Expenditure scope class',
      type: 'select',
      value: 'general',
      options: DOA_SCOPE_CLASSES.map((c) => ({ value: c.key, label: c.label })),
    },
    {
      name: 'currency',
      label: 'ISO Currency (3 letters)',
      type: 'text',
      value: 'USD',
      required: true,
    },
    {
      name: 'limit',
      label: 'Standing limit amount (major currency units)',
      type: 'number',
      value: '50000',
      required: true,
    },
    {
      name: 'effectiveFrom',
      label: 'Effective from (YYYY-MM-DD)',
      type: 'date',
      value: report.today,
      required: true,
    },
    {
      name: 'effectiveTo',
      label: 'Effective until (optional YYYY-MM-DD)',
      type: 'date',
      value: '',
    },
    {
      name: 'reason',
      label: 'Charter / authorization basis (min 8 chars)',
      type: 'textarea',
      rows: 3,
      value: '',
      required: true,
    },
  ]);

  openModal({
    title: 'Declare standing Delegation-of-Authority limit',
    description: 'Stored as exact integer cents; no implicit currency conversion or rank inference.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const res = ctx.api.doaDeclareLimit({
            seatId: values.seatId,
            lineKind: values.lineKind,
            scopeClass: values.scopeClass,
            currency: values.currency,
            limit: values.limit,
            effectiveFrom: values.effectiveFrom,
            effectiveTo: values.effectiveTo || null,
            reason: values.reason || '',
          });
          if (notify(ctx, res, 'Standing authority limit declared.')) {
            closeAllModals();
            refreshView(ctx);
          }
        },
      }, 'Declare limit'),
    ],
  });
}

function openRetireDialog(ctx, report, row) {
  const form = buildForm([
    {
      name: 'retiredOn',
      label: 'Effective retirement date (YYYY-MM-DD)',
      type: 'date',
      value: report.today,
      required: true,
    },
    {
      name: 'reason',
      label: 'Retirement reason (preserved append-only, min 8 chars)',
      type: 'textarea',
      rows: 3,
      value: '',
      required: true,
    },
  ]);

  openModal({
    title: `Retire standing limit — ${row.seatName}`,
    description: 'Prior commitments dated before the retirement date retain their as-of validity.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const res = ctx.api.doaRetireLimit({
            targetLimitId: row.id,
            retiredOn: values.retiredOn,
            reason: values.reason || '',
          });
          if (notify(ctx, res, 'Standing authority limit retired.')) {
            closeAllModals();
            refreshView(ctx);
          }
        },
      }, 'Retire limit'),
    ],
  });
}

export function renderMatrixDoaPanel(ctx, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const apiRes = ctx?.api?.doaReport?.({ now });
  const report = apiRes?.ok ? apiRes.report : buildDoaReport(ctx?.state || {}, { now });
  const candRes = ctx?.api?.doaCandidates?.({ now });
  const candidates = candRes?.ok ? candRes.candidates : doaCandidates(ctx?.state || {}, { now });

  const b = report.board;
  const canDeclare = Boolean(ctx?.api && typeof ctx.api.doaDeclareLimit === 'function' && (candidates.seats || []).length > 0);
  const canRetire = Boolean(ctx?.api && typeof ctx.api.doaRetireLimit === 'function');
  const canScan = Boolean(ctx?.api && typeof ctx.api.doaScan === 'function');

  const rateText = b.conformancePermille !== null
    ? `${b.conformancePermille}‰`
    : 'Withheld';

  const coverLabelForRow = (row) => {
    if (!row.cover) return '—';
    if (row.cover.state === 'unique') {
      return `${row.cover.seatNames[0] || 'Covered'} (unique)`;
    }
    if (row.cover.state === 'matrix-tie') {
      const names = row.cover.seatNames.join(' & ');
      const apex = row.cover.jointApexName ? ` → apex ${row.cover.jointApexName}` : ' → diamond tie';
      return `Tie: ${names}${apex}`;
    }
    return row.cover.label;
  };

  const headerActions = [];
  if (canDeclare) {
    headerActions.push(h('button', {
      type: 'button',
      class: 'btn btn-primary btn-small',
      'data-testid': 'doa-declare-btn',
      onClick: () => openDeclareDialog(ctx, report, candidates),
    }, 'Declare standing limit'));
  }
  if (canScan) {
    headerActions.push(h('button', {
      type: 'button',
      class: 'btn btn-small',
      'data-testid': 'doa-scan-btn',
      onClick: () => {
        const res = ctx.api.doaScan();
        if (notify(ctx, res, 'Delegation-of-authority conformance scan completed.')) {
          refreshView(ctx);
        }
      },
    }, 'Run conformance scan'));
  }
  headerActions.push(h('button', {
    type: 'button',
    class: 'btn btn-small',
    'data-testid': 'doa-brief-btn',
    onClick: () => {
      const text = ctx?.api?.doaBriefText?.({ now })?.text || doaBriefText(report);
      downloadText({ filename: `leados-matrix-doa-${report.today}.txt`, text });
    },
  }, 'Download brief'));
  headerActions.push(h('button', {
    type: 'button',
    class: 'btn btn-small',
    'data-testid': 'doa-csv-btn',
    onClick: () => {
      const rows = ctx?.api?.doaCsvRows?.({ now })?.rows || doaCsvRows(report);
      const csv = serializeCsv(DOA_CSV_COLUMNS, rows);
      downloadText({ filename: `leados-matrix-doa-${report.today}.csv`, text: csv });
    },
  }, 'Export CSV (#128)'));

  return h('div', { class: 'stack', 'data-testid': 'matrix-doa-panel' },
    banner({
      tone: b.breachN > 0 ? 'bad' : (!b.figuresComplete ? 'warn' : 'good'),
      title: b.countsReconcile
        ? `Partition reconciled (countsReconcile: true) · Completeness: ${b.figuresComplete ? 'complete (figuresComplete: true)' : 'incomplete / refused (figuresComplete: false)'}`
        : 'Partition reconciliation warning (countsReconcile: false)',
      body: b.conformancePermille !== null
        ? `All ${b.testedN} in-span commitments carry comparable standing schedules on their commitment dates (${b.conformantN} conformant, ${b.breachN} exceeding limit; conformance ${b.conformancePermille}‰).`
        : b.conformanceRefusedReason || 'Conformance rate withheld.',
    }),

    h('div', { class: 'row gap', 'data-testid': 'doa-stats' },
      stat({ label: 'Active limits', value: String(b.activeLimitsN), hint: `${b.retiredLimitsN} retired/ended` }),
      stat({ label: 'Tested commitments', value: String(b.testedN), hint: `${b.recordRefusedN} refused at record level` }),
      stat({ label: 'Within limit', value: String(b.conformantN), hint: `Conformance: ${rateText}`, tone: b.conformantN ? 'good' : '' }),
      stat({ label: 'Exceeding limit', value: String(b.breachN), hint: `${b.nemoDatN} nemo-dat · ${b.secondLineLimitN} 2nd-line · ${b.overLimitN} seat`, tone: b.breachN ? 'bad' : '' }),
      stat({ label: 'Schedule / FX gaps', value: String(b.unscheduledN + b.currencyMismatchN + b.structureUnreadableN), hint: `${b.unscheduledN} unscheduled · ${b.currencyMismatchN} FX · ${b.structureUnreadableN} unreadable`, tone: (b.unscheduledN + b.currencyMismatchN + b.structureUnreadableN) ? 'warn' : '' }),
      stat({ label: 'Cross-line asymmetry', value: String(b.asymmetricCrossLineN + b.neitherLineCoversN), hint: `${b.asymmetricCrossLineN} asymmetric · ${b.neitherLineCoversN} neither covers` }),
    ),

    card({
      title: 'Standing Delegation-of-Authority & Limit Conformance',
      subtitle: `As-of ${report.today} · ${report.isMatrix ? 'Matrix reporting DAG' : 'Single-chain hierarchy'} · ${b.untypedDecisionsN} non-monetary decided call(s) skipped without prose parsing`,
      actions: headerActions,
      body: h('p', { class: 'muted small' },
        `Conventions: ratification ask due in ${report.conventions.doaAskDueDays}d · `,
        `auto-propagate ${report.conventions.doaAutoPropagate ? 'on' : 'paused'} · `,
        `rate floor ${b.rateFloor} tested items`,
        b.outsideSeatN ? ` · ${b.outsideSeatN} commitment(s) sit outside this seat’s span.` : '.'),
    }),

    card({
      title: 'Standing authority schedule',
      subtitle: `${report.scheduleRows.length} shown${b.scheduleOmittedN ? ` (${b.scheduleOmittedN} omitted past cap)` : ''} · exact integer-cent storage`,
      body: report.scheduleRows.length === 0
        ? emptyState({
          title: 'No standing authority limits declared yet',
          body: 'Until standing limits are declared per seat, currency, scope class and line kind, every priced commitment reads "No standing limit recorded (refused)" — never assumed unlimited and never assumed zero.',
        })
        : table({
          caption: 'Standing Delegation-of-Authority limits',
          columns: [
            { label: 'Seat', render: (r) => r.seatName },
            { label: 'Line scope', render: (r) => r.lineKindLabel },
            { label: 'Scope class', render: (r) => r.scopeClassLabel },
            { label: 'Standing ceiling', render: (r) => `${r.currency} ${r.limitFixed}` },
            {
              label: 'Effective window',
              render: (r) => r.retiredOn
                ? `${r.effectiveFrom} → retired ${r.retiredOn}`
                : `${r.effectiveFrom} → ${r.effectiveTo || 'open'}`,
            },
            {
              label: 'Status',
              render: (r) => badge(
                r.activeToday ? 'Active' : (r.retiredOn ? 'Retired' : 'Out of window'),
                r.activeToday ? 'good' : 'neutral',
              ),
            },
            {
              label: 'Govern',
              render: (r) => (canRetire && r.canRetire)
                ? h('button', {
                  type: 'button',
                  class: 'btn btn-small btn-ghost',
                  onClick: () => openRetireDialog(ctx, report, r),
                }, 'Retire')
                : '—',
            },
          ],
          rows: report.scheduleRows,
        }),
    }),

    card({
      title: 'Commitment conformance & one-over-one covering resolution',
      subtitle: `${report.rows.length} tested commitment(s) shown${b.rowsOmittedN ? ` (${b.rowsOmittedN} omitted past cap)` : ''} · evaluated as of each commitment’s own date`,
      body: report.rows.length === 0
        ? emptyState({
          title: 'No testable monetary commitments in scope',
          body: 'Spending mandates, committed/spent budget lines, and priced decided decisions appear here automatically.',
        })
        : table({
          caption: 'Evaluated monetary commitments against standing authority limits',
          columns: [
            { label: 'Kind', render: (r) => r.kindLabel },
            { label: 'Commitment', render: (r) => r.title },
            { label: 'Commitment day', render: (r) => num(r.asOf) },
            { label: 'Authorizer & route', render: (r) => `${r.authorizerName} (${r.lineKindLabel})` },
            { label: 'Amount', render: (r) => `${r.currency} ${r.amountFixed}` },
            { label: 'Standing limit', render: (r) => r.limitFixed !== null ? `${r.currency} ${r.limitFixed}` : 'Refused / none' },
            {
              label: 'Verdict',
              render: (r) => badge(
                r.breachClassShort ? `${r.verdictLabel} · ${r.breachClassShort}` : r.verdictLabel,
                toneFor(r.verdictTone),
              ),
            },
            {
              label: 'Cross-line state',
              render: (r) => badge(r.crossLine.label, toneFor(r.crossLine.tone)),
            },
            { label: 'Covering authority', render: (r) => coverLabelForRow(r) },
          ],
          rows: report.rows,
        }),
    }),

    report.refusedRows.length > 0
      ? card({
        title: 'Record-level refusals (never defaulted to zero)',
        subtitle: `${b.recordRefusedN} commitment(s) refused before schedule comparison`,
        body: table({
          caption: 'Refused commitments lacking typed amount, date or authorizer',
          columns: [
            { label: 'Kind', render: (r) => r.kindLabel },
            { label: 'Commitment', render: (r) => r.title },
            { label: 'Date', render: (r) => num(r.asOf) },
            { label: 'Refusal', render: (r) => badge(r.refusalLabel, 'warn') },
            { label: 'Reason', render: (r) => r.refusalDetail },
          ],
          rows: report.refusedRows,
        }),
      })
      : null,

    report.spans.length > 0
      ? card({
        title: 'Span roll-up across the matrix DAG (non-additive across lines)',
        subtitle: 'A shared authorizer’s commitment rolls up every reporting line above them; span rows are non-additive.',
        body: table({
          caption: 'Non-additive leadership span roll-up of DoA verdicts',
          columns: [
            { label: 'Leadership span', render: (r) => r.spanName },
            { label: 'Own breaches', render: (r) => String(r.ownBreachN) },
            { label: 'Downward span breaches', render: (r) => String(r.belowBreachN) },
            { label: 'Unscheduled / gaps', render: (r) => String(r.unscheduledN) },
            { label: 'Conformant', render: (r) => String(r.conformantN) },
          ],
          rows: report.spans,
        }),
      })
      : null,

    card({
      title: 'Method & cross-domain governance frameworks',
      subtitle: `Engine ${report.engineVersion} · no implicit FX · no limit inferred from title or rank`,
      body: h('ul', { class: 'muted small' },
        ...DOA_METHOD.map((m) => h('li', {}, h('strong', {}, `${m.name}: `), m.application)),
      ),
    }),
  );
}

export default renderMatrixDoaPanel;
