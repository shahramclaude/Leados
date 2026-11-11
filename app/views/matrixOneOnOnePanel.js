/**
 * app/views/matrixOneOnOnePanel.js — `#/matrix?panel=one-on-ones`, Matrix 1:1
 * Line Coverage governance panel (ADR-0164, Schema v140, `RULE-OOL-01`,
 * CSV scope #130).
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { oneOnOneLineBriefText } from '../core/domain/oneOnOneLines.js';
import {
  ONE_ON_ONE_LINE_BOUNDS,
  ONE_ON_ONE_LINE_LIMITS_TEXT,
  ONE_ON_ONE_LINE_METHOD,
  ONE_ON_ONE_LINE_RULE_ID,
} from '../core/domain/oneOnOneLineRegistry.js';
import { publicationPanel } from './publicationPanel.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

function notify(ctx, result, message) {
  if (!result?.ok) {
    const err = result?.error || 'The matrix 1:1 coverage action was refused.';
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

function openConventionsDialog(ctx, report) {
  const conv = report.conventions || {};
  const form = buildForm([
    {
      name: 'oneOnOneLineCadenceDays',
      label: 'Additional-line 1:1 cadence (days)',
      type: 'number',
      value: String(conv.lineCadenceDays ?? 30),
      required: true,
      help: `Whole days (${ONE_ON_ONE_LINE_BOUNDS.lineCadenceDays[0]}–${ONE_ON_ONE_LINE_BOUNDS.lineCadenceDays[1]}).`,
    },
    {
      name: 'oneOnOneLineMinSharePct',
      label: 'Minimum share floor for owing a standing 1:1 (%)',
      type: 'number',
      value: String(conv.minSharePct ?? 20),
      required: true,
      help: `Whole percent (${ONE_ON_ONE_LINE_BOUNDS.minSharePct[0]}–${ONE_ON_ONE_LINE_BOUNDS.minSharePct[1]}). Undeclared shares never exempt.`,
    },
    {
      name: 'oneOnOneLineAskDueDays',
      label: 'Answer window for silent-line asks (days)',
      type: 'number',
      value: String(conv.askDueDays ?? 7),
      required: true,
      help: `Whole days (${ONE_ON_ONE_LINE_BOUNDS.askDueDays[0]}–${ONE_ON_ONE_LINE_BOUNDS.askDueDays[1]}).`,
    },
    {
      name: 'oneOnOneLineAutoPropagate',
      label: 'Automatic RULE-OOL-01 silent-line asks on commits',
      type: 'select',
      value: conv.autoPropagate === false ? 'false' : 'true',
      options: [
        { value: 'true', label: 'On — issue bounded dated asks on trigger events' },
        { value: 'false', label: 'Paused — explicit Scan still reconciles RULE-OOL-01' },
      ],
    },
  ]);

  openModal({
    title: 'Matrix 1:1 line coverage conventions',
    description: 'Workspace-wide intervals and RULE-OOL-01 propagation controls; operator-only.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const res = ctx.api?.oneOnOneLineSetConventions?.({
            oneOnOneLineCadenceDays: Number(values.oneOnOneLineCadenceDays),
            oneOnOneLineMinSharePct: Number(values.oneOnOneLineMinSharePct),
            oneOnOneLineAskDueDays: Number(values.oneOnOneLineAskDueDays),
            oneOnOneLineAutoPropagate: values.oneOnOneLineAutoPropagate === 'true',
          });
          if (!notify(ctx, res, 'Saved matrix 1:1 coverage conventions.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Save conventions'),
    ],
  });
}

function openReleaseDialog(ctx, meetingId) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Why is this holder attribution being released?',
      type: 'textarea',
      rows: 3,
      value: '',
      required: true,
    },
  ]);

  openModal({
    title: 'Release 1:1 holder attribution',
    description: 'Clears the recorded holder back to unattributed without altering the held meeting itself.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const res = ctx.api?.oneOnOneLineRelease?.(meetingId, { reason: values.reason });
          if (!notify(ctx, res, 'Released 1:1 holder attribution.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Release attribution'),
    ],
  });
}

function openClaimDialog(ctx, claimRow) {
  const holders = (claimRow.holders || []).map((holder) => ({
    value: holder.managerId,
    label: `${holder.managerName} (${holder.role === 'home' ? 'home' : holder.kind || 'additional'})`,
  }));
  if (!holders.length) {
    notify(ctx, { ok: false, error: 'No active manager on this person’s lines is selectable.' }, '');
    return;
  }
  const form = buildForm([
    {
      name: 'heldById',
      label: 'Line holder who held this 1:1',
      type: 'select',
      value: holders[0].value,
      options: holders,
    },
  ]);
  openModal({
    title: `Attribute held 1:1 for ${claimRow.personName}`,
    description: `Recorded on ${claimRow.date}. Attributing a holder never fabricates meetings on another line.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const res = ctx.api?.oneOnOneLineClaim?.(claimRow.meetingId, { heldById: values.heldById });
          if (!notify(ctx, res, 'Attributed held 1:1 holder.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record holder'),
    ],
  });
}

export function renderMatrixOneOnOnePanel(ctx, { now = new Date() } = {}) {
  const result = ctx?.api?.oneOnOneLineReport?.();
  if (!result?.ok || !result.report) {
    return card({
      title: 'Matrix 1:1 line coverage',
      body: banner({
        tone: 'bad',
        title: '1:1 line coverage could not be read',
        body: result?.error || 'The matrix 1:1 line coverage reader refused this seat.',
      }),
    });
  }

  const report = result.report;
  const board = report.board;
  const headerActions = [];

  if (report.actor?.canScan && typeof ctx.api?.oneOnOneLineScan === 'function') {
    headerActions.push(h('button', {
      class: 'btn btn-small btn-primary',
      type: 'button',
      'data-testid': 'ool-scan-btn',
      onClick: () => {
        const res = ctx.api.oneOnOneLineScan();
        if (!notify(ctx, res, `Scanned matrix 1:1 line coverage (${ONE_ON_ONE_LINE_RULE_ID}).`)) return;
        refreshView(ctx);
      },
    }, 'Scan silent lines'));
  }

  if (report.actor?.canGovern && typeof ctx.api?.oneOnOneLineSetConventions === 'function') {
    headerActions.push(h('button', {
      class: 'btn btn-small',
      type: 'button',
      'data-testid': 'ool-conventions-btn',
      onClick: () => openConventionsDialog(ctx, report),
    }, 'Conventions'));
  }

  headerActions.push(h('button', {
    class: 'btn btn-small',
    type: 'button',
    'data-testid': 'ool-brief-btn',
    onClick: () => {
      const brief = oneOnOneLineBriefText(report);
      downloadText({ filename: `leados-one-on-one-lines-brief-${report.generatedOn}.txt`, text: brief });
    },
  }, 'Download brief'));

  headerActions.push(h('button', {
    class: 'btn btn-small',
    type: 'button',
    'data-testid': 'ool-csv-btn',
    onClick: () => {
      const res = exportWorkspaceCsv(ctx.state || {}, 'one-on-one-lines', { now });
      if (!res?.ok) {
        notify(ctx, res, '');
        return;
      }
      downloadText({ filename: res.filename, text: res.csv });
    },
  }, 'Export CSV (#130)'));

  const statusBanner = report.aggregateWithheld
    ? banner({
      tone: 'warn',
      title: 'Aggregate totals withheld under disclosure policy',
      body: report.aggregateWithheldReason || 'Aggregate coverage is withheld to protect small cells or prevent differencing leaks.',
    })
    : !report.isMatrix
      ? banner({
        tone: 'neutral',
        title: 'No multi-line structure in this scope',
        body: report.singleChainNote,
      })
      : (!board?.statesReconcile || !board?.meetingsReconcile)
        ? banner({
          tone: 'bad',
          title: 'Reconciliation warning — aggregate totals do not reconcile',
          body: 'Pair states or held-meeting attribution classes do not reconcile to the total. Treat figures below as unverified.',
        })
        : banner({
          tone: (board.overdueN + board.neverN + board.maskedN) > 0 ? 'warn' : 'good',
          title: `Pair states reconcile (${board.pairsN}) · Held meetings reconcile (${board.heldN})`,
          body: oneOnOneLineBriefText(report),
        });

  const statGrid = board && !report.aggregateWithheld && report.isMatrix
    ? h('div', { class: 'row gap', 'data-testid': 'ool-stats' },
      stat({ label: 'Multi-line people', value: num(board.peopleN), hint: board.withheldN ? `${board.withheldN} withheld` : 'in scope' }),
      stat({ label: '(Person, line) pairs', value: num(board.pairsN), hint: `${board.owingN} owe a 1:1` }),
      stat({ label: 'On cadence / due', value: `${board.okN} / ${board.dueN}`, tone: board.dueN ? 'warn' : 'good' }),
      stat({ label: 'Silent (overdue / never)', value: `${board.overdueN} / ${board.neverN}`, tone: (board.overdueN + board.neverN) ? 'bad' : 'good' }),
      stat({ label: 'Masked people', value: num(board.maskedN), hint: 'on track overall while a line is silent', tone: board.maskedN ? 'bad' : '' }),
      stat({ label: 'Cannot be read', value: num(board.unprovenN), hint: `${board.unattributedN} unattributed held`, tone: board.unprovenN ? 'warn' : '' }),
    )
    : null;

  const kindsCard = report.isMatrix
    ? card({
      title: 'Line-kind coverage breakdown',
      subtitle: report.kindsWithheld
        ? 'Withheld under small-cell / complementary suppression'
        : `${report.kinds.length} declared line role/kind group(s)`,
      body: report.kindsWithheld
        ? h('p', { class: 'muted' }, report.kindsWithheldReason || 'Line-kind breakdown is withheld.')
        : report.kinds.length === 0
          ? emptyState({ title: 'No line kinds in scope', body: 'No readable matrix reporting lines exist in this scope.' })
          : table({
            caption: 'Matrix 1:1 coverage by line kind',
            columns: [
              { label: 'Role', render: (k) => k.role === 'home' ? 'Home' : 'Additional' },
              { label: 'Kind', render: (k) => k.kind },
              { label: 'Pairs', render: (k) => k.suppressed ? badge('Suppressed', 'warn') : String(k.pairsN) },
              { label: 'Owing', render: (k) => k.suppressed ? '—' : String(k.owingN) },
              { label: 'On cadence', render: (k) => k.suppressed ? '—' : String(k.states.ok) },
              { label: 'Due', render: (k) => k.suppressed ? '—' : String(k.states.due) },
              { label: 'Silent (overdue + never)', render: (k) => k.suppressed ? '—' : String(k.states.overdue + k.states.never) },
              { label: 'Unreadable / exempt', render: (k) => k.suppressed ? '—' : `${k.states.unproven} / ${k.states.exempt}` },
              { label: 'Disclosure note', render: (k) => k.suppressed ? (k.suppressedReason || 'Withheld below cell floor.') : 'Complete' },
            ],
            rows: report.kinds,
          }),
    })
    : null;

  const lineRows = report.persons.flatMap((person) => person.lines.map((line) => ({ person, line })));
  const personCard = report.persons.length > 0
    ? card({
      title: 'Per-line coverage detail (in-scope detail)',
      subtitle: `${report.persons.length} multi-line person(s) in direct scope`,
      body: table({
        caption: 'Per-person, per-line 1:1 cadence state',
        columns: [
          { label: 'Person', render: (r) => h('a', { class: 'link', href: `#/people/${encodeURIComponent(r.person.personId)}` }, r.person.personName) },
          { label: 'Line holder', render: (r) => `${r.line.managerName} · ${r.line.role === 'home' ? 'home' : r.line.kind || 'additional'}` },
          { label: 'Share', render: (r) => r.line.role === 'home' ? 'Home line' : r.line.shareDeclared ? `${r.line.sharePct}%` : 'Undeclared' },
          { label: 'State', render: (r) => badge(r.line.stateLabel, r.line.tone) },
          { label: 'Last attributed 1:1', render: (r) => r.line.lastHeldOn || 'No attributed held 1:1' },
          { label: 'Basis / reason', render: (r) => h('span', { class: 'muted small' }, r.line.reason) },
        ],
        rows: lineRows,
      }),
    })
    : null;

  const claimRows = Array.isArray(report.claimable) ? report.claimable : [];
  const claimCard = claimRows.length > 0 && (report.actor?.canClaim || report.actor?.canAttribute)
    ? card({
      title: 'Unattributed held 1:1s awaiting holder claim',
      subtitle: `${claimRows.length} recent unattributed held meeting(s) in direct scope`,
      body: table({
        caption: 'Unattributed held 1:1 records',
        columns: [
          { label: 'Person', render: (r) => r.personName },
          { label: 'Held on', render: (r) => r.date },
          { label: 'Action', render: (r) => h('button', {
            type: 'button',
            class: 'btn btn-tiny btn-primary',
            onClick: () => {
              if (report.actor?.canAttribute) {
                openClaimDialog(ctx, r);
              } else {
                const res = ctx.api?.oneOnOneLineClaim?.(r.meetingId);
                if (!notify(ctx, res, `Claimed 1:1 with ${r.personName} on ${r.date}.`)) return;
                refreshView(ctx);
              }
            },
          }, report.actor?.canAttribute ? 'Attribute holder' : 'Claim as mine') },
        ],
        rows: claimRows,
      }),
    })
    : null;

  const attributedMeetings = (ctx.state?.oneOnOnes || [])
    .filter((m) => m && m.status === 'held' && m.heldById && (report.actor?.canAttribute || m.heldById === report.seat?.id))
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 8);
  const nameOfPerson = (id) => (ctx.state?.people || []).find((p) => p.id === id)?.name || id;
  const releaseCard = attributedMeetings.length > 0 && report.persons.length > 0
    ? card({
      title: 'Attributed 1:1 holders (release if recorded in error)',
      subtitle: 'Only the named holder or full-access operator may release a holder claim with a written reason.',
      body: table({
        caption: 'Attributed held 1:1 records',
        columns: [
          { label: 'Person', render: (r) => nameOfPerson(r.personId) },
          { label: 'Date', render: (r) => r.date || '—' },
          { label: 'Recorded holder', render: (r) => nameOfPerson(r.heldById) },
          { label: 'Basis', render: (r) => r.heldByBasis || 'declared' },
          { label: 'Action', render: (r) => h('button', {
            type: 'button',
            class: 'btn btn-tiny btn-ghost',
            onClick: () => openReleaseDialog(ctx, r.id),
          }, 'Release holder') },
        ],
        rows: attributedMeetings,
      }),
    })
    : null;

  const refusedCard = Array.isArray(report.refusedPersons) && report.refusedPersons.length > 0
    ? card({
      title: 'Structural graph refusals',
      subtitle: `${report.refusedPersons.length} person(s) refused rather than guessed`,
      body: banner({
        tone: 'warn',
        title: `${report.refusedPersons.length} reporting-graph issue(s) refused`,
        body: report.refusedPersons.map((r) => `${r.personName}: ${r.reason}`).join(' · '),
      }),
    })
    : null;

  return h('div', { class: 'stack', 'data-testid': 'matrix-one-on-ones-panel' },
    statusBanner,
    statGrid,
    card({
      title: 'Matrix 1:1 Line Coverage',
      subtitle: `${report.scopeLabel} · generated ${report.generatedOn} · engine ${report.engineVersion}`,
      actions: headerActions,
      body: h('p', { class: 'muted small' },
        `Conventions: home cadence ${report.conventions.homeCadenceDays}d · `,
        `additional-line cadence ${report.conventions.lineCadenceDays}d · `,
        `exempt below ${report.conventions.minSharePct}% declared share · `,
        `ask due in ${report.conventions.askDueDays}d · `,
        `RULE-OOL-01 auto-asks ${report.conventions.autoPropagate ? 'on' : 'paused'}.`),
    }),
    kindsCard,
    personCard,
    claimCard,
    releaseCard,
    refusedCard,
    publicationPanel(ctx, 'oneonones', {
      blurb: 'Repeated-release differencing guard over published 1:1 coverage aggregates (#/differencing).',
    }),
    card({
      title: 'Method & honest limits',
      subtitle: 'Per-line cadence is derived on read; unattributed meetings never credit a line automatically.',
      body: h('div', { class: 'stack' },
        h('ul', { class: 'muted small' },
          ...ONE_ON_ONE_LINE_METHOD.map((m) => h('li', {}, h('strong', {}, `${m.name}: `), m.why))),
        h('ul', { class: 'muted small' },
          ...ONE_ON_ONE_LINE_LIMITS_TEXT.map((line) => h('li', {}, line))),
      ),
    }),
  );
}

export default renderMatrixOneOnOnePanel;
