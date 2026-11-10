/**
 * app/views/matrixInterfacePanel.js — `#/matrix?panel=interfaces`, the Matrix
 * Management-Interface Operating-Agreement Register (ADR-0162, Schema v131).
 *
 * Shows deduplicated unordered manager pairs coupled across shared multi-line
 * people, bilateral sign-off state (`current`, `one-sided`, `contested-terms`,
 * `forum-unavailable`, `expired`, `unagreed`, `structurally-unresolvable`),
 * live `matrixJointApex` escalation topology, identity-free brief, aggregate CSV
 * export (#122), and named method/refusal guards.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { addDays } from '../core/time.js';
import {
  buildMatrixInterfaceReport,
  matrixInterfaceBriefText,
  matrixInterfaceCsvRows,
} from '../core/domain/matrixInterface.js';
import {
  MATRIX_INTERFACE_CONSULTATION_RULES,
  MATRIX_INTERFACE_CSV_COLUMNS,
  MATRIX_INTERFACE_METHOD,
  MATRIX_INTERFACE_STATES,
} from '../core/domain/matrixInterfaceRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');

function notify(ctx, result, message) {
  if (!result?.ok) {
    const err = result?.error || 'The interface action was refused.';
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

function openAffirmDialog(ctx, report, row, candidates) {
  const forums = candidates?.forums || [];
  const candPair = (candidates?.pairs || []).find((p) => p.pairKey === row.pairKey) || row;
  const escalationOptions = candPair.escalationOptions?.length
    ? candPair.escalationOptions
    : [{ seatId: row.apex.apexId, label: row.apex.apexLabel || row.apex.apexId }];

  const canChooseSide = report.seat.fullAccess;
  const defaultSide = row.liveA && !row.liveB ? 'b' : 'a';
  const defaultTerms = row.agreed || row.liveB || row.liveA || {};
  const defaultReviewOn = defaultTerms.reviewByOn || addDays(report.today, report.conventions.matrixInterfaceDefaultTermDays);

  const fields = [];
  if (canChooseSide) {
    fields.push({
      name: 'actingSide',
      label: 'Which counterpart manager is signing this act?',
      type: 'select',
      value: defaultSide,
      help: 'In operator view, explicitly choose Side A or Side B. Scoped managers may sign only their own side.',
      options: [
        { value: 'a', label: `Side A — ${row.managerAName}` },
        { value: 'b', label: `Side B — ${row.managerBName}` },
      ],
    });
  }
  fields.push(
    {
      name: 'consultationRule',
      label: 'Consultation rule between lines',
      type: 'select',
      value: defaultTerms.consultationRule || MATRIX_INTERFACE_CONSULTATION_RULES[0].key,
      options: MATRIX_INTERFACE_CONSULTATION_RULES.map((r) => ({ value: r.key, label: `${r.label} — ${r.hint}` })),
    },
    {
      name: 'forumId',
      label: 'Standing cadence forum for collisions (optional)',
      type: 'select',
      value: defaultTerms.forumId || '',
      options: [
        { value: '', label: 'None linked (escalate directly to joint apex)' },
        ...forums.map((f) => ({ value: f.id, label: `${f.name}${f.cadence ? ` · ${f.cadence}` : ''}` })),
      ],
    },
    {
      name: 'escalationSeatId',
      label: 'Escalation seat (live joint apex or ancestor)',
      type: 'select',
      value: defaultTerms.escalationSeatId && escalationOptions.some((o) => o.seatId === defaultTerms.escalationSeatId)
        ? defaultTerms.escalationSeatId
        : escalationOptions[0].seatId,
      options: escalationOptions.map((o) => ({ value: o.seatId, label: o.label })),
    },
    {
      name: 'effectiveFrom',
      label: 'Effective from (YYYY-MM-DD)',
      type: 'date',
      value: defaultTerms.effectiveFrom || report.today,
    },
    {
      name: 'reviewByOn',
      label: 'Review deadline (YYYY-MM-DD)',
      type: 'date',
      value: defaultReviewOn,
    },
    {
      name: 'basis',
      label: 'Operational basis (min 8 chars)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'Record what these two spans agreed about hand-offs, priorities, and escalation.',
    },
  );

  const form = buildForm(fields);
  openModal({
    title: `Sign interface agreement — ${row.managerAName} ↔ ${row.managerBName}`,
    description: `Both counterparts must sign matching terms in separate acts. Unique joint apex: ${row.apex.apexLabel}.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api.matrixInterfaceAffirm({
            pairKey: row.pairKey,
            ...(canChooseSide ? { actingSide: v.actingSide } : {}),
            consultationRule: v.consultationRule,
            forumId: v.forumId || null,
            escalationSeatId: v.escalationSeatId,
            effectiveFrom: v.effectiveFrom,
            reviewByOn: v.reviewByOn,
            basis: v.basis || '',
          });
          if (!notify(ctx, res, `Recorded interface sign-off (${res.pair?.stateLabel || 'saved'}).`)) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Sign operating terms'),
    ],
  });
}

function openRetireDialog(ctx, row) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Reason for retiring this agreement (min 8 chars)',
      type: 'textarea',
      rows: 3,
      value: '',
    },
  ]);
  openModal({
    title: `Retire interface agreement — ${row.managerAName} ↔ ${row.managerBName}`,
    description: 'Append-only retirement clears current coverage cleanly until fresh bilateral terms are signed.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api.matrixInterfaceRetire({
            pairKey: row.pairKey,
            reason: v.reason || '',
          });
          if (!notify(ctx, res, 'Retired management-interface agreement.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Retire agreement'),
    ],
  });
}

function boardSection(ctx, report) {
  const b = report.board;
  return h('div', { class: 'stack' },
    b.coverageWithheld
      ? banner({
        tone: 'warn',
        title: 'Workspace coverage rate is withheld',
        body: b.coverageWithheldReason,
      })
      : b.uncoveredN === 0
        ? banner({
          tone: 'good',
          title: `All ${b.allPairsN} active counterpart pair(s) hold a current bilateral interface agreement`,
          body: b.dueSoonN ? `${b.dueSoonN} agreement(s) sit within the ${report.conventions.matrixInterfaceDueWarnDays}-day review warning window.` : 'Every active pair has matching bilateral terms and a unique live escalation apex.',
        })
        : banner({
          tone: b.unresolvableN || b.contestedTermsN || b.forumUnavailableN ? 'bad' : 'warn',
          title: `${b.uncoveredN} of ${b.allPairsN} counterpart pair(s) lack a current bilateral interface agreement`,
          body: `${b.unresolvableN} unresolvable · ${b.contestedTermsN} diverging · ${b.forumUnavailableN} missing forum · ${b.expiredN} expired · ${b.oneSidedN} one-sided · ${b.unagreedN} unagreed.`,
        }),

    h('div', { class: 'row gap' },
      stat({
        label: 'Coverage rate',
        value: b.coverageWithheld ? 'Withheld' : `${b.coveragePct}%`,
        hint: b.coverageWithheld ? 'below floor or defect' : `${b.coveredN} of ${b.allPairsN} current`,
        tone: b.coverageWithheld ? 'warn' : b.uncoveredN === 0 ? 'good' : 'warn',
      }),
      stat({ label: 'Active pairs', value: num(b.allPairsN), hint: `across ${b.matrixPeopleN} shared people` }),
      stat({ label: 'Current', value: num(b.currentN), hint: b.dueSoonN ? `${b.dueSoonN} due soon` : 'bilateral & valid', tone: b.currentN ? 'good' : '' }),
      stat({ label: 'Uncovered', value: num(b.uncoveredN), hint: 'requires bilateral sign-off or apex repair', tone: b.uncoveredN ? 'warn' : '' }),
    ),

    h('div', { class: 'row gap' },
      stat({ label: 'Unresolvable', value: num(b.unresolvableN), hint: 'diamond tie or disconnected', tone: b.unresolvableN ? 'bad' : '' }),
      stat({ label: 'Terms diverge', value: num(b.contestedTermsN), hint: 'mismatched bilateral terms', tone: b.contestedTermsN ? 'bad' : '' }),
      stat({ label: 'One-sided', value: num(b.oneSidedN), hint: 'awaiting counterpart' }),
      stat({ label: 'Expired / unagreed', value: `${b.expiredN} / ${b.unagreedN}`, hint: 'no auto-renewal' }),
    ),

    card({
      title: 'State completeness & structural conventions',
      subtitle: 'Every active unordered pair maps to exactly one state; diamond ties never collapse into a guessed owner.',
      actions: ctx.api && typeof ctx.api.matrixInterfaceScan === 'function'
        ? [
          h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => {
              const res = ctx.api.matrixInterfaceScan();
              if (notify(ctx, res, 'Scanned matrix management interfaces (`RULE-MIA-01`).')) refreshView(ctx);
            },
          }, 'Scan interfaces'),
        ]
        : [],
      body: h('p', { class: 'muted small' },
        `State counts reconcile: ${b.statesReconcile ? 'verified' : 'NOT verified'}. `,
        `Conventions: ${report.conventions.matrixInterfaceDefaultTermDays}d default term · `,
        `${report.conventions.matrixInterfaceDueWarnDays}d due warning · `,
        `${report.conventions.matrixInterfaceReviewAskDays}d review ask · `,
        `cell floor ${report.conventions.cellFloor} pairs.`,
        b.outOfScopePairsN ? ` ${b.outOfScopePairsN} pair(s) sit outside this seat’s span.` : '',
        b.rowsOmittedN ? ` ${b.rowsOmittedN} row(s) exceed the display cap and are counted here.` : ''),
    }),
  );
}

function pairsTableSection(ctx, report, candidates) {
  if (!report.isMatrix || !report.pairs.length) {
    return emptyState({
      title: 'No active management interfaces in this seat',
      body: report.singleChainNote || 'No multi-line person currently couples two managers within this operating seat.',
    });
  }

  const canAffirmAction = Boolean(ctx.api && typeof ctx.api.matrixInterfaceAffirm === 'function');
  const canRetireAction = Boolean(ctx.api && typeof ctx.api.matrixInterfaceRetire === 'function');

  return card({
    title: 'Counterpart management-interface register',
    subtitle: 'Deduplicated unordered pairs derived from the live reporting graph and allocations.',
    body: table({
      caption: 'Active counterpart manager pairs',
      columns: [
        {
          label: 'Counterpart Pair',
          render: (row) => h('div', { class: 'stack-xs' },
            h('strong', {}, `${row.managerAName} ↔ ${row.managerBName}`),
            h('span', { class: 'muted small' }, `${row.sharedPeopleN} shared person(s)${row.hasIncompleteAllocation ? ' · incomplete allocation' : ''}`)),
        },
        {
          label: 'State',
          render: (row) => h('div', { class: 'stack-xs' },
            badge(row.stateLabel, toneFor(row.stateTone)),
            h('span', { class: 'muted small' }, row.stateDetail)),
        },
        {
          label: 'Terms & Review Window',
          render: (row) => {
            const terms = row.agreed || row.liveA || row.liveB;
            if (!terms) return h('span', { class: 'muted small' }, 'No live terms signed');
            return h('div', { class: 'stack-xs small' },
              h('span', {}, terms.consultationRuleLabel),
              h('span', { class: 'muted' }, `${terms.effectiveFrom} → ${terms.reviewByOn}${terms.forumName ? ` · Forum: ${terms.forumName}` : ''}`),
              terms.basis ? h('span', { class: 'muted' }, `“${terms.basis}”`) : null);
          },
        },
        {
          label: 'Joint Apex',
          render: (row) => h('div', { class: 'stack-xs small' },
            h('span', {}, row.apex.apexLabel),
            row.agreed?.escalationSeatName
              ? h('span', { class: 'muted' }, `Escalation: ${row.agreed.escalationSeatName}`)
              : null),
        },
        {
          label: 'Actions',
          render: (row) => {
            if (!canAffirmAction) return h('span', { class: 'muted small' }, 'Read-only');
            const buttons = [];
            if (row.canAffirm) {
              buttons.push(h('button', {
                class: 'btn btn-small',
                type: 'button',
                onClick: () => openAffirmDialog(ctx, report, row, candidates),
              }, row.state === 'one-sided' ? 'Review / Sign' : 'Sign terms'));
            }
            if (row.canRetire && canRetireAction) {
              buttons.push(h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => openRetireDialog(ctx, row),
              }, 'Retire'));
            }
            if (!buttons.length) {
              return h('span', { class: 'muted small' },
                !row.apex.unique ? 'Repair DAG tie first' : 'Counterpart sign-off required');
            }
            return h('div', { class: 'row-actions' }, ...buttons);
          },
        },
      ],
      rows: report.pairs,
    }),
  });
}

function escalationSection(report) {
  if (!report.apexRollups?.length) return null;
  return card({
    title: 'Uncovered interfaces by joint apex',
    subtitle: 'Unresolved pairs grouped by their lowest joint ancestor in the DAG; diamond ties are never collapsed.',
    body: table({
      caption: 'Joint-apex escalation roll-up',
      columns: [
        { label: 'Joint Apex / Tie Bucket', render: (b) => b.apexLabel },
        { label: 'Type', render: (b) => badge(b.apexKind, b.ambiguous || b.disconnected ? 'bad' : 'warn') },
        { label: 'Unresolved Pairs', key: 'unresolvedPairsN' },
        { label: 'Distinct Shared People', key: 'sharedPeopleN' },
      ],
      rows: report.apexRollups,
    }),
  });
}

function briefAndExportSection(ctx, report) {
  const brief = matrixInterfaceBriefText(report);
  return card({
    title: 'Identity-free brief & aggregate CSV (#122)',
    subtitle: 'Exports pair counts and joint-apex buckets only — never a person name, manager name, forum name, or basis text.',
    actions: [
      h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => {
          const rows = ctx.api?.matrixInterfaceCsvRows?.()?.rows || matrixInterfaceCsvRows(report);
          downloadText({
            filename: `leados-matrix-interfaces-${report.today}.csv`,
            text: serializeCsv(MATRIX_INTERFACE_CSV_COLUMNS.map((key) => ({ key, header: key })), rows),
          });
        },
      }, 'Download aggregate CSV'),
    ],
    body: h('pre', { class: 'small muted', style: 'white-space:pre-wrap;margin:0' }, brief),
  });
}

function methodSection() {
  return card({
    title: 'Method & closed state vocabulary',
    subtitle: 'What is stored, what is derived, and what this register refuses.',
    body: h('div', { class: 'stack' },
      h('ul', { class: 'muted small' },
        ...MATRIX_INTERFACE_STATES.map((s) => h('li', {}, h('strong', {}, `${s.label} (${s.key}): `), s.hint))),
      ...MATRIX_INTERFACE_METHOD.map((m) => h('div', { class: 'stack-tight' },
        h('strong', {}, m.name),
        h('p', { class: 'muted small' }, m.why))),
    ),
  });
}

export function renderMatrixInterfacePanel(ctx, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const apiRes = ctx.api?.matrixInterfaceReport?.({ now });
  const report = apiRes?.ok ? apiRes.report : buildMatrixInterfaceReport(ctx.state || {}, { now });
  const candRes = ctx.api?.matrixInterfaceCandidates?.({ now });
  const candidates = candRes?.ok ? candRes : null;

  return h('div', { class: 'stack' },
    boardSection(ctx, report),
    pairsTableSection(ctx, report, candidates),
    escalationSection(report),
    briefAndExportSection(ctx, report),
    methodSection(),
  );
}

export default renderMatrixInterfacePanel;
