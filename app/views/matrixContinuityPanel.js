/**
 * app/views/matrixContinuityPanel.js — `#/matrix?panel=continuity`, the Matrix
 * Authority Continuity Register (ADR-0156, Schema v128 unchanged).
 *
 * Four sections, four questions a per-module authority view cannot answer:
 *
 *   Board      the PORTFOLIO claim: are our frozen decisions still attributable
 *              to the authority that made them? The claim and the counts that
 *              support it are printed as SEPARATE claims, and the claim is
 *              refused whenever any part of the population cannot be compared.
 *   Types      one row per frozen decision type, with its covered and uncovered
 *              populations and its verdict counts.
 *   Register   one row per frozen decision record: the date it was made, the
 *              authority it names, the verdict, and why.
 *   Method     what is stored, what is derived, and what this register refuses.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A "all attributable" claim over an incomplete population. The absence is
 *    printed beside the claim and the claim is REFUSED.
 *  - A drifted record as a wrong decision. It is a STRUCTURE MOVED UNDER A
 *    DECISION, and the screen says that.
 *  - A manager for a record that names none. It reads `unattributed`.
 *  - A record it could not read, dropped. It is counted and printed with its
 *    reason.
 *  - A total that is not the sum of the printed rows. Under a state mismatch the
 *    panel says so in words instead of printing a reassuring number.
 */

import { h } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { buildAuthorityContinuity, authorityContinuityBriefLines, authorityContinuityCsvRows } from '../core/domain/authorityContinuity.js';
import {
  AUTHORITY_CONTINUITY_CSV_COLUMNS,
  AUTHORITY_CONTINUITY_LIMITS,
  AUTHORITY_CONTINUITY_VERDICTS,
  authorityContinuityVerdict,
} from '../core/domain/authorityContinuityRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const VERDICT_BY_KEY = new Map(AUTHORITY_CONTINUITY_VERDICTS.map((v) => [v.key, v]));

function toneFor(tone) {
  return tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral';
}

function verdictBadge(key) {
  const meta = VERDICT_BY_KEY.get(key);
  return badge(meta?.label || key, toneFor(meta?.tone));
}

/**
 * The register itself.
 *
 * @param {object} ctx    the view context (api, state)
 * @param {object} opts   { now, settings }
 */
export function renderContinuityPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
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
    unattributedN: bucket.unattributedN,
    attributableN: bucket.attributableN,
    unreadableN: bucket.unreadableN,
    differenceN: bucket.differenceN,
  }));

  const recordRows = report.rows.map((row) => ({
    key: row.recordId || `${row.type}-${row.asOf}`,
    type: row.type,
    asOf: row.asOf,
    label: row.label,
    frozenAuthority: row.frozenAuthority,
    authorityName: row.authorityName,
    authorityWithheld: row.authorityWithheld,
    authorityWithheldReason: row.authorityWithheldReason,
    verdict: row.verdict,
    reason: row.reason,
    route: row.route,
    differenceN: row.differenceN,
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
        hint: 'the structure moved under the decision',
        tone: report.driftedN ? 'bad' : '',
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
    ),

    card({
      title: 'The population, by frozen decision type',
      subtitle: 'The covered and uncovered populations are printed separately for each type. An absence is never absorbed into a continuity claim.',
      body: typeRows.length
        ? table({
          caption: 'Frozen decision records by type, with covered and uncovered populations',
          columns: [
            { label: 'Type', key: 'label' },
            { label: 'Records', key: 'totalN' },
            { label: 'Comparable', key: 'coveredN' },
            { label: 'Unreadable', key: 'unreadableN' },
            { label: 'Attributable', key: 'attributableN' },
            { label: 'Drifted', key: 'driftedN' },
            { label: 'No authority', key: 'unattributedN' },
            { label: 'Differences', key: 'differenceN' },
          ],
          rows: typeRows,
        })
        : emptyState({ title: 'No frozen decision types present in this workspace.' }),
    }),

    card({
      title: 'Every frozen decision record, worst first',
      subtitle: 'Each row compares the authority the RECORD names against the authority that was in force on the record’s own day. A drifted row is a structure that moved under a decision — never a claim that the decision was wrong.',
      body: recordRows.length
        ? table({
          caption: 'Frozen decision records and their authority continuity verdict',
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
        h('p', null, 'Nothing is stored by this register. Every figure is derived on read from records the workspace already holds — a finalised merit cycle’s frozen structure block, a decision record’s DACI approver, a board memo’s owner — and from the SAME as-of structure engine (ADR-0155) and the SAME matrix engine (ADR-0140) the rest of the workspace uses. A read writes nothing, so a printed finding cannot drift from the rows it describes.'),
        h('ul', { class: 'stack-sm' },
          ...verdictCounts.map((v) => h('li', null, h('strong', null, `${v.label} (${v.n})`), ' — ', v.detail)),
        ),
        h('p', { class: 'muted small' }, 'Two claims are kept apart and reported separately: the covered records agreeing is one fact; the whole portfolio agreeing is another. The second is refused whenever the covered population is below the declared floor, whenever any covered record did not agree, or whenever any record could not be read.'),
        ...report.methods.map((m) => h('p', { class: 'small muted' }, h('strong', null, m.name), ' — ', m.why)),
        ...report.types.map((t) => h('p', { class: 'small muted' }, h('strong', null, t.label), ' — ', t.detail)),
      ),
    }),
  );
}
