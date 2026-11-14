/**
 * app/views/checkup.js — the Workspace checkup (`#/checkup`).
 *
 * This screen is deliberately quiet. It prints eleven readings, each with the
 * evidence behind it and the screen that owns the decision. There is no "fix
 * all" button: repair is a write, and a write belongs to the module that owns
 * the record.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { perfRead } from '../core/perf.js';
import { buildWorkspaceCheckup, checkupBrief, CHECKUP_CAVEATS } from '../core/domain/workspaceCheckup.js';

const STATUS_TONE = Object.freeze({ pass: 'good', warn: 'warn', fail: 'bad', unknown: 'neutral' });
const STATUS_LABEL = Object.freeze({ pass: 'Pass', warn: 'Attention', fail: 'Fail', unknown: 'Not measured' });

function bytesLabel(bytes) {
  if (!Number.isFinite(bytes)) return 'not measured';
  return `${Math.round(bytes / 1024)} KB`;
}

export function renderCheckup(ctx) {
  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const storageBytes = typeof ctx.storageSize === 'function' ? ctx.storageSize() : null;
  const report = buildWorkspaceCheckup(ctx.state, {
    now: at,
    storageBytes,
    persistError: ctx.persistError || null,
    propagationMetrics: ctx.propagationMetrics || null,
    perfSamples: perfRead(),
    isEncrypted: ctx.isEncrypted === true,
    isLocked: ctx.isLocked === true,
    warnings: Array.isArray(ctx.warnings) ? ctx.warnings : [],
  });

  const download = () => {
    const text = checkupBrief(report);
    if (!downloadText({ filename: `leados-checkup-${report.at.slice(0, 10)}.txt`, text, mime: 'text/plain' })) {
      toast('This browser refused the download. Open Settings to export the workspace instead.', 'bad');
    }
  };

  const overallTone = report.status === 'fail' ? 'bad' : report.status === 'warn' ? 'warn' : 'good';
  const rows = report.checks.map((row) => ({ ...row }));

  return h('div', { class: 'page view-checkup', 'data-view': 'checkup' },
    pageHeader({
      eyebrow: 'OBSERVE · VERIFY · THEN ACT',
      title: 'Workspace checkup',
      subtitle: 'One read of the workspace’s own health: what is saved, what is ambiguous, what automation lost and what could not be measured. It reports; it never repairs.',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: download }, 'Download report'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.refresh() }, 'Run again'),
      ],
    }),

    h('div', { class: 'stat-grid' },
      stat({ label: 'Overall', value: STATUS_LABEL[report.status], hint: `${report.total} checks`, tone: overallTone === 'bad' ? 'bad' : overallTone === 'warn' ? 'warn' : 'good' }),
      stat({ label: 'Needs attention', value: report.attention, hint: `${report.counts.fail} fail · ${report.counts.warn} warning`, tone: report.attention ? 'warn' : 'good' }),
      stat({ label: 'Saved payload', value: bytesLabel(report.measured.storageBytes), hint: 'Exact length of the last stored payload' }),
      stat({ label: 'Records', value: report.measured.records, hint: `${report.measured.events} audit events · ${report.measured.links == null ? 'links not measured' : `${report.measured.links} links`}` })),

    report.status === 'fail'
      ? banner({
        tone: 'bad',
        title: 'At least one reading needs a person before this workspace is relied on.',
        body: 'A failure here is data you could lose or a link that no longer resolves. Export first; then open the module named beside the finding.',
      })
      : report.status === 'warn'
        ? banner({
          tone: 'warn',
          title: 'The workspace is readable, with attention points.',
          body: 'Warnings are honest limits or consequences of recorded writes — a budget gap, a rule failure, plain-text storage. None of them is silently repaired.',
        })
        : banner({
          tone: 'info',
          title: 'Every reading that could be measured passed.',
          body: 'This is not a security audit, and it is not a backup. Export separately and test a restore.',
        }),

    card({
      title: 'The eleven readings',
      subtitle: 'Each row names its evidence and the screen that owns the decision. “Not measured” is a result, not a zero.',
      body: table({
        caption: 'Workspace checkup readings',
        rows,
        emptyMessage: 'No readings were produced.',
        columns: [
          { label: 'Status', render: (row) => badge(STATUS_LABEL[row.status] || row.status, STATUS_TONE[row.status] || 'neutral') },
          { label: 'Check', render: (row) => h('strong', null, row.label) },
          {
            label: 'Finding',
            render: (row) => h('div', { class: 'view-stack', style: 'gap:2px' },
              h('span', null, row.detail),
              row.evidence ? h('span', { class: 'muted tiny' }, row.evidence) : null),
          },
          {
            label: 'Where',
            render: (row) => row.action
              ? h('a', { class: 'btn btn-tiny btn-ghost', href: row.action.href }, `${row.action.label} →`)
              : h('span', { class: 'muted' }, '—'),
          },
        ],
      }),
    }),

    h('div', { class: 'grid-2' },
      card({
        title: 'What was measured',
        subtitle: 'Counts and exact byte measurements only. No names, notes or record titles appear in this report.',
        body: h('table', { class: 'kv-table' },
          h('tbody', null,
            ...[
              ['Checked at', report.at],
              ['Stored payload', report.measured.storageBytes == null ? 'not measured' : `${report.measured.storageBytes} characters`],
              ['Assumed quota', `${Math.round(report.measured.quotaBytes / 1024)} KB`],
              ['Records scanned', report.measured.records],
              ['Audit events', report.measured.events],
              ['Valid links', report.measured.links == null ? 'not measured' : report.measured.links],
              ['Open automation receipts', report.measured.receipts],
              ['Durable budget gaps', report.measured.gaps],
              ['Retained rule errors', report.measured.ruleErrors],
              ['Performance samples', report.measured.perfSamples],
            ].map(([key, value]) => h('tr', null, h('th', null, key), h('td', null, String(value)))))),
      }),
      card({
        title: 'What this checkup refuses to claim',
        subtitle: 'The limits are part of the result.',
        body: h('ul', { class: 'next-list' }, ...CHECKUP_CAVEATS.map((line) => h('li', null, line))),
      }),
    ),

    card({
      title: 'If something is yellow or red',
      subtitle: 'The order matters: protect the record before repairing it.',
      body: h('ol', { class: 'next-list' },
        h('li', null, h('strong', null, 'Export a backup first. '), 'Settings → Export. A repair that goes wrong should never be the only copy.'),
        h('li', null, h('strong', null, 'Dangling or duplicate links: '), 'open the automation control room. It reports the same graph without inventing a fix.'),
        h('li', null, h('strong', null, 'Automation gaps or receipts: '), 'open the propagation ledger. A failed rule can be retried on current facts; a budget gap is reviewed, not replayed blindly.'),
        h('li', null, h('strong', null, 'Storage pressure: '), 'archive closed records or move the workspace to another browser profile. Encryption is not a size reduction.'),
        h('li', null, h('strong', null, 'Schema mismatch: '), 'reload once with the build that wrote it. Never hand-edit the JSON to silence this reading.')),
    }),
  );
}
