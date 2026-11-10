/**
 * app/views/matrixContinuityPanel.js — `#/matrix?panel=continuity`, the Matrix
 * Authority Continuity & Drift Settlement Register (ADR-0156, ADR-0159, Schema v130).
 *
 * Five sections:
 *
 *   Board      the TWO portfolio claims kept strictly apart:
 *              (1) `populationClaim`: did structure hold without human
 *                  intervention? Never overwritten by a re-affirmation.
 *              (2) `reconciledClaim`: is every comparable frozen record either
 *                  structurally attributable OR explicitly stood behind by
 *                  today's live matrix authority (with 0 unreadable, 0
 *                  unattributed, 0 unsettled, 0 stale and 0 referred)?
 *   Types      one row per frozen decision type, with covered/uncovered and
 *              drift-settlement counts.
 *   Register   one row per frozen decision record: date, named authority,
 *              verdict, live authority today, settlement state, and interactive
 *              governed settlement controls (`Stand behind` / `Refer to re-open`)
 *              when `ctx.api` is connected and the acting seat holds standing.
 *   Brief/CSV  identity-free brief and aggregate CSV export (#117).
 *   Method     what is stored, what is derived, and what this register refuses.
 */

import { h } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildAuthorityContinuity,
  authorityContinuityBriefLines,
  authorityContinuityCsvRows,
} from '../core/domain/authorityContinuity.js';
import {
  AUTHORITY_CONTINUITY_CSV_COLUMNS,
  AUTHORITY_CONTINUITY_LIMITS,
  AUTHORITY_CONTINUITY_VERDICTS,
  authoritySettlementMeta,
} from '../core/domain/authorityContinuityRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const VERDICT_BY_KEY = new Map(AUTHORITY_CONTINUITY_VERDICTS.map((v) => [v.key, v]));

function toneFor(tone) {
  if (tone === 'bad' || tone === 'danger') return 'bad';
  if (tone === 'warn' || tone === 'warning' || tone === 'info') return 'warn';
  if (tone === 'good' || tone === 'positive') return 'good';
  return 'neutral';
}

function verdictBadge(key) {
  const meta = VERDICT_BY_KEY.get(key);
  return badge(meta?.label || key, toneFor(meta?.tone));
}

function settlementBadge(key) {
  const meta = authoritySettlementMeta(key);
  return badge(meta.label, toneFor(meta.tone));
}

function notify(ctx, message, kind = 'info') {
  if (typeof ctx?.toast === 'function') ctx.toast(message, kind);
}

function refresh(ctx) {
  if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function renderLiveAuthorityCell(row) {
  const auth = row.currentAuthority;
  if (!auth?.applicable) return h('span', { class: 'muted small' }, '—');
  if (auth.state === 'unowned') {
    return h('span', { class: 'small' }, 'Unowned right in live matrix (apex only)');
  }
  const names = auth.holderNames?.length
    ? auth.holderNames.join(', ')
    : auth.withheld
      ? 'outside this seat'
      : '—';
  if (auth.apexAmbiguous) {
    return h('span', { class: 'small' }, `${names} · diamond tie (no guessed principal)`);
  }
  if (auth.holderIds.length > 1) {
    const joint = auth.targetName || (auth.withheld ? 'outside this seat' : 'joint apex');
    return h('span', { class: 'small' }, `${names} · joint principal: ${joint}`);
  }
  return h('span', { class: 'small' }, names);
}

function renderSettlementCell(row, api, ctx) {
  if (row.verdict !== 'drifted') {
    return h('span', { class: 'muted small' }, '—');
  }
  const parts = [h('div', null, settlementBadge(row.settlement))];
  if (row.reaffirmation) {
    const actor = row.reaffirmation.decidedByWithheld
      ? 'outside this seat'
      : (row.reaffirmation.decidedByName || 'operator');
    parts.push(
      h('div', { class: 'small muted' },
        `${row.reaffirmation.decidedOn} · ${actor}: “${row.reaffirmation.reason}”`),
    );
  }
  const canWrite = Boolean(
    api
    && typeof api.authorityReaffirmStandBehind === 'function'
    && typeof api.authorityReaffirmRefer === 'function',
  );
  if (!canWrite) return h('div', { class: 'stack-xs' }, ...parts);

  if (!row.canSettle) {
    parts.push(h('div', { class: 'small muted' }, row.settleRefusalReason || 'Standing required to settle.'));
    return h('div', { class: 'stack-xs' }, ...parts);
  }

  const inputEl = h('input', {
    type: 'text',
    class: 'input input-sm',
    placeholder: 'State reason (min 8 chars)…',
    'data-reaffirm-reason': `${row.type}:${row.recordId}`,
  });

  const runAction = (fn, okMsg) => {
    const res = fn({
      recordType: row.type,
      recordId: row.recordId,
      reason: inputEl.value,
    });
    if (!res?.ok) {
      notify(ctx, res?.error || 'Settlement refused.', 'error');
      return;
    }
    notify(ctx, okMsg, 'success');
    refresh(ctx);
  };

  parts.push(
    h('div', { class: 'row gap-sm wrap' },
      inputEl,
      row.settlement !== 'settled'
        ? h('button', {
          type: 'button',
          class: 'btn btn-sm',
          'data-reaffirm-stand': `${row.type}:${row.recordId}`,
          onclick: () => runAction(api.authorityReaffirmStandBehind, 'Recorded stand-behind settlement.'),
        }, 'Stand behind')
        : null,
      row.settlement !== 'referred'
        ? h('button', {
          type: 'button',
          class: 'btn btn-sm',
          'data-reaffirm-refer': `${row.type}:${row.recordId}`,
          onclick: () => runAction(api.authorityReaffirmRefer, 'Opened governed re-decision for drifted record.'),
        }, 'Refer to re-open')
        : null,
    ),
  );
  return h('div', { class: 'stack-xs' }, ...parts);
}

/**
 * The register itself.
 *
 * @param {object} ctx    the view context (api, state)
 * @param {object} opts   { now, settings }
 */
export function renderContinuityPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const api = ctx?.api || null;
  const report = buildAuthorityContinuity(state, {
    now: opts.now || new Date(),
    settings: opts.settings || state.settings || null,
  });
  if (!report) {
    return emptyState({ title: 'Continuity reading unavailable', body: 'Recompute the matrix report to view the authority continuity register.' });
  }

  const verdictCounts = AUTHORITY_CONTINUITY_VERDICTS.map((v) => ({
    ...v,
    n: report.byVerdict[v.key] || 0,
  }));

  const typeRows = [...report.byType.values()].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    detail: bucket.detail,
    totalN: bucket.totalN,
    coveredN: bucket.coveredN,
    uncoveredN: bucket.uncoveredN,
    driftedN: bucket.driftedN,
    settledN: bucket.settledN,
    referredN: bucket.referredN,
    staleN: bucket.staleN,
    unsettledDriftedN: bucket.unsettledDriftedN,
    unattributedN: bucket.unattributedN,
    attributableN: bucket.attributableN,
    unreadableN: bucket.unreadableN,
    differenceN: bucket.differenceN,
  }));

  const recordRows = report.rows.map((row) => ({
    ...row,
    key: row.recordId || `${row.type}-${row.asOf}`,
    className: row.verdict === 'attributable' ? '' : 'row-flag',
  }));

  const brief = authorityContinuityBriefLines(report);
  const csvRows = authorityContinuityCsvRows(report);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A chief does not hold one kind of frozen decision. They hold a portfolio: a finalised pay cycle, a decided decision record, a frozen board memo. Each names an authority. The board asks about the portfolio, so this register reads the portfolio — and refuses the claim when any part of it cannot be compared.'),

    report.totalN === 0
      ? banner({
        tone: 'neutral',
        title: 'No frozen decision records in scope',
        body: 'This workspace holds no finalised merit cycle, no decided decision record and no committed or frozen board memo. Counts print; there is nothing to compare and the portfolio claim is refused.',
      })
      : banner({
        tone: report.populationClaim ? 'good' : 'warn',
        title: report.populationClaim
          ? 'Every comparable frozen decision still names the authority that was in force on its own day'
          : 'The portfolio claim is REFUSED',
        body: report.populationClaimReason,
      }),

    report.driftedN > 0
      ? banner({
        tone: report.reconciledClaim ? 'good' : 'warn',
        title: report.reconciledClaim
          ? 'Reconciled continuity claim GRANTED (structural drift settled by live authority)'
          : 'Reconciled continuity claim REFUSED',
        body: report.reconciledClaimReason,
      })
      : null,

    h('div', { class: 'stat-grid' },
      stat({
        label: 'Frozen decision records in scope',
        value: num(report.totalN),
        hint: `${report.coveredN} comparable · ${report.uncoveredN} could not be read`,
      }),
      stat({
        label: 'Still attributable',
        value: num(report.attributableN),
        hint: 'reproduce the authority in force on their own day',
        tone: report.attributableN ? '' : 'warn',
      }),
      stat({
        label: 'Authority has moved',
        value: num(report.driftedN),
        hint: `${report.settledN} stood behind · ${report.referredN} referred · ${report.staleN} stale · ${report.unsettledDriftedN} unsettled`,
        tone: report.driftedN ? 'bad' : '',
      }),
      stat({
        label: 'Unsettled or stale drift',
        value: num((report.unsettledDriftedN || 0) + (report.staleN || 0)),
        hint: `${report.unsettledDriftedN} unsettled · ${report.staleN} stale after further drift`,
        tone: (report.unsettledDriftedN || 0) + (report.staleN || 0) ? 'bad' : 'good',
      }),
      stat({
        label: 'No authority named',
        value: num(report.unattributedN),
        hint: 'the record names nobody and cannot be attributed',
        tone: report.unattributedN ? 'warn' : '',
      }),
      stat({
        label: 'Could not be read',
        value: num(report.uncoveredN),
        hint: 'counted, never dropped',
        tone: report.uncoveredN ? 'bad' : '',
      }),
      stat({
        label: 'Population claim',
        value: report.populationClaim ? 'granted' : 'refused',
        hint: `floor ${report.populationFloor} comparable record(s)`,
        tone: report.populationClaim ? 'good' : 'bad',
      }),
      stat({
        label: 'Reconciled claim',
        value: report.reconciledClaim ? 'granted' : 'refused',
        hint: 'attributable or stood behind by live authority',
        tone: report.reconciledClaim ? 'good' : 'warn',
      }),
    ),

    api && typeof api.authorityContinuityScan === 'function'
      ? h('div', { class: 'row gap' },
        h('button', {
          type: 'button',
          class: 'btn',
          'data-reaffirm-scan': 'true',
          onclick: () => {
            const res = api.authorityContinuityScan();
            if (!res?.ok) {
              notify(ctx, res?.error || 'Scan refused.', 'error');
              return;
            }
            notify(ctx, 'Scanned frozen-decision portfolio for unsettled drift.', 'success');
            refresh(ctx);
          },
        }, 'Re-run drift reconciliation scan'),
      )
      : null,

    card({
      title: 'The population, by frozen decision type',
      subtitle: 'The covered and uncovered populations and the ADR-0159 drift-settlement counts are printed separately for each type. An absence is never absorbed into a continuity claim.',
      body: typeRows.length
        ? table({
          caption: 'Frozen decision records by type, with covered, uncovered and settlement counts',
          columns: [
            { label: 'Type', key: 'label' },
            { label: 'Records', key: 'totalN' },
            { label: 'Comparable', key: 'coveredN' },
            { label: 'Unreadable', key: 'unreadableN' },
            { label: 'Attributable', key: 'attributableN' },
            { label: 'Drifted', key: 'driftedN' },
            { label: 'Stood behind', key: 'settledN' },
            { label: 'Referred', key: 'referredN' },
            { label: 'Stale', key: 'staleN' },
            { label: 'Unsettled', key: 'unsettledDriftedN' },
            { label: 'No authority', key: 'unattributedN' },
            { label: 'Differences', key: 'differenceN' },
          ],
          rows: typeRows,
        })
        : emptyState({ title: 'No frozen decision types present in this workspace.' }),
    }),

    card({
      title: 'Every frozen decision record, worst first',
      subtitle: 'Each row compares the authority the RECORD names against the authority in force on the record’s own day, and resolves who holds live matrix authority TODAY so drifted records can be stood behind or referred without editing the frozen record.',
      body: recordRows.length
        ? table({
          caption: 'Frozen decision records, authority continuity verdict, and live drift settlement',
          columns: [
            { label: 'Type', key: 'type' },
            { label: 'Decided on', key: 'asOf' },
            { label: 'Record', key: 'label' },
            {
              label: 'Authority named',
              render: (row) => {
                if (row.authorityWithheld) {
                  return h('span', { class: 'muted' }, 'outside this seat');
                }
                if (row.authorityName) return row.authorityName;
                return row.frozenAuthority || '—';
              },
            },
            { label: 'Verdict', render: (row) => verdictBadge(row.verdict) },
            { label: 'Live authority today', render: (row) => renderLiveAuthorityCell(row) },
            { label: 'Settlement', render: (row) => renderSettlementCell(row, api, ctx) },
            {
              label: 'Why',
              render: (row) => h('span', { class: 'small muted' }, row.reason || '—'),
            },
          ],
          rows: recordRows,
        })
        : emptyState({ title: 'No frozen decision records to compare.' }),
    }),

    report.remainderN
      ? h('p', { class: 'muted small' }, `${report.remainderN} further record(s) are past the bounded table of ${AUTHORITY_CONTINUITY_LIMITS.records}. They are counted in every total above and merely not rendered here.`)
      : null,

    report.refusals.length
      ? card({
        title: 'What this register refused',
        subtitle: 'Every refusal is counted and explained. None is dropped.',
        body: h('ul', { class: 'stack-sm' }, ...report.refusals.map((r) => h('li', null, r.detail))),
      })
      : null,

    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph a chief reads out. It names no record, no title and no person.',
      body: h('div', { class: 'stack-sm' },
        ...brief.map((line) => h('p', null, line)),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-authority-continuity-brief.txt',
              text: `${brief.join('\n')}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-authority-continuity-${(report.today || '').slice(0, 10)}.csv`,
              text: serializeCsv(
                AUTHORITY_CONTINUITY_CSV_COLUMNS.map((key) => ({ key, header: key })),
                csvRows,
              ),
              mime: 'text/csv',
            }),
          }, 'Download aggregate CSV'),
        ),
      ),
    }),

    card({
      title: 'Method',
      subtitle: 'What is stored, what is derived, and what this register refuses.',
      body: h('div', { class: 'stack-sm' },
        h('p', null, 'Frozen decisions are never edited on read or on settlement. Only append-only dated human settlements (`stand-behind` or `refer-reopen`) are stored in `authorityReaffirmations`; every continuity verdict, every live matrix standing check, every staleness flag after a subsequent re-org, and both portfolio claims (`populationClaim` vs `reconciledClaim`) are derived on read.'),
        h('ul', { class: 'stack-sm' },
          ...verdictCounts.map((v) => h('li', null, h('strong', null, `${v.label} (${v.n})`), ' — ', v.detail)),
        ),
        h('p', { class: 'muted small' }, 'Three claims are kept strictly apart: the covered records agreeing, the structural portfolio claim (`populationClaim`), and the human-settled reconciled claim (`reconciledClaim`). Unreadable and unattributed records refuse both portfolio claims and can never be re-affirmed.'),
        ...report.methods.map((m) => h('p', { class: 'small muted' }, h('strong', null, m.name), ' — ', m.why)),
        ...report.types.map((t) => h('p', { class: 'small muted' }, h('strong', null, t.label), ' — ', t.detail)),
      ),
    }),
  );
}
