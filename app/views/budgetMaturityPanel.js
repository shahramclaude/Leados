/** ADR-0239 — aggregate, privacy-protected commitment maturity view. */
import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { buildBudgetMaturity, BUDGET_MATURITY_METHOD } from '../core/domain/budgetMaturity.js';

const DIAGRAM_URL = './app/assets/budget-commitment-maturity-method.jpg';

function money(currency, cents) {
  if (cents === null || cents === undefined) return 'Withheld';
  const value = BigInt(cents);
  return `${currency} ${(value / 100n).toLocaleString('en-US')}.${String(value % 100n).padStart(2, '0')}`;
}

export function renderBudgetMaturityPanel(ctx, { tabs = null } = {}) {
  const report = buildBudgetMaturity(ctx.state, { now: ctx.now });
  const renderedRows = report.rows.map((row) => ({
    ...row,
    kindLabel: row.recordType === 'committed' ? 'Committed encumbrances' : 'Planned pipeline',
    expected: row.startsOn ? `${formatDate(row.startsOn)} – ${formatDate(row.endsOn)}` : 'Expected date passed',
    amountLabel: money(row.currency, row.amountCents),
    linesLabel: row.lineN === null ? 'Withheld' : String(row.lineN),
    reasonLabel: row.rowReason || (row.withheld ? 'Figure withheld' : ''),
    attrs: {
      'data-kind': row.recordType,
      'data-currency': row.currency,
      'data-week': String(row.week),
      'data-amount-cents': row.amountCents ?? '',
      'data-line-count': row.lineN === null ? '' : String(row.lineN),
    },
  }));
  const hasRows = report.rows.length > 0;
  const hasOpenLines = report.sourceLineN > 0;
  const smallCellN = report.rows.filter((row) => row.withheld).length;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Finance · commitment maturity',
      title: 'When recorded commitments fall due',
      subtitle: `As of ${formatDate(report.asOf)} · thirteen consecutive seven-day buckets, plus overdue · aggregate by currency · no budget or line identities shown.`,
    }),
    tabs,
    h('div', { class: 'stat-row' },
      stat({ label: 'Active budget envelopes', value: report.activeEnvelopeN, hint: 'source envelopes, not a liquidity total' }),
      stat({ label: 'Open-line placement', value: `${report.placedLineN} / ${report.sourceLineN}`, hint: `${report.unplacedLineN} unplaced · ${report.beyondHorizonN} beyond 13 weeks` }),
      stat({ label: 'Source partition', value: report.partitionReconciles ? 'Reconciles' : 'Refused', tone: report.partitionReconciles ? 'good' : 'bad', hint: 'each open line placed once or counted as unplaced' }),
      stat({ label: 'Complete reading', value: report.figuresComplete ? 'Yes' : 'No', tone: report.figuresComplete ? 'good' : 'warn', hint: 'privacy floors and source completeness both apply' })), 
    h('div', { class: 'stack-md' },
      banner({ tone: 'info', title: 'Expected date is not a cash date', body: 'Committed amounts use the budget line’s recorded expectedOn date. Planned lines remain a separate pipeline. Spent and released lines are excluded. This is not cash flow, liquidity, solvency, bank balance, payment-term or treasury advice. Amounts are gross declared encumbrances; repeated underlying commitments across different envelopes cannot be identified or eliminated from this record.' }),
      report.reason ? banner({ tone: 'caution', title: 'Some parts are incomplete or withheld', body: `${report.reason}${smallCellN ? ` ${smallCellN} cell(s) are withheld.` : ''} Unplaced and unpriced lines are counted in the report but their identities are not exposed.` }) : null,
      hasRows
        ? table({
          caption: 'Aggregate commitment maturity by currency and week',
          columns: [
            { key: 'recordType', label: 'Category', render: (row) => badge(row.kindLabel, row.recordType === 'committed' ? 'info' : 'neutral') },
            { key: 'currency', label: 'Currency' },
            { key: 'week', label: 'Bucket', render: (row) => row.week === 'overdue' ? 'Overdue' : `Week ${row.week}` },
            { key: 'expected', label: 'Declared expected date(s)' },
            { key: 'amountLabel', label: 'Amount' },
            { key: 'linesLabel', label: 'Open lines' },
            { key: 'reasonLabel', label: 'Withholding reason' },
          ],
          rows: renderedRows,
        })
        : card({
          title: hasOpenLines ? 'No safe currency row to display' : 'No active commitments in scope',
          body: hasOpenLines ? 'Open lines exist, but their currency or row identity could not be certified. The reader withholds a maturity figure.' : 'There are no active budget envelopes with open committed or planned lines. No maturity figure is inferred.',
        }),
      card({ title: 'Method & limits', body: h('div', { class: 'stack-sm' },
        h('p', null, BUDGET_MATURITY_METHOD.framework),
        h('p', { class: 'small' }, `Each cell requires at least ${report.privacyFloor} lines before its amount and count are released. Exact cents are summed with BigInt. Missing dates, unsupported amounts, duplicate source references and dates beyond the ${report.horizonWeeks}-week window never get assigned to a guessed bucket.`),
        h('img', { src: DIAGRAM_URL, alt: 'Method diagram: each currency has a separate overdue bucket and thirteen seven-day buckets. Committed and planned amounts use separate lanes. Expected date is not cash date; no foreign exchange or cross-envelope total is used; missing information is withheld, not guessed.', class: 'method-figure' }),
        h('p', { class: 'muted small' }, 'The diagram explains the method; it is not evidence about a budget or payment. The bucket amounts come only from stored budget lines.')) }),
    ),
  );
}
