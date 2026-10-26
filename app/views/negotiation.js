/**
 * app/views/negotiation.js — Negotiation Workbench (`#/negotiations` and
 * `#/negotiations/:id`).
 *
 * Fisher & Ury principled negotiation, Raiffa ZOPA analysis and Lax &
 * Sebenius value creation rendered from the pure engine in
 * core/domain/negotiation.js. All writes go through ctx.api; this view only
 * reads state and opens dialogs.
 */

import { h, confirmDialog, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  CALIBRATION_MIN_SAMPLES,
  NEGOTIATION_MATERIAL_SHORTFALL_PCT,
  negotiationSettlementCalibration,
} from '../core/domain/calibration.js';
import {
  ESTIMATE_CONFIDENCE_LABELS,
  NEGOTIATION_ISSUE_DIRECTION_LABELS,
  NEGOTIATION_KIND_LABELS,
  NEGOTIATION_STATUS_LABELS,
  OPEN_NEGOTIATION_STATUSES,
  negotiationDelivery,
  negotiationsRollup,
  summarizeNegotiation,
} from '../core/domain/negotiation.js';
import {
  openNegotiationDialog,
  openNegotiationAgreementDialog,
  openRecoverNegotiationTermDialog,
  openNegotiationSettlementDialog,
} from '../ui/negotiation-modals.js';

const STATUS_TONE = {
  preparing: 'neutral',
  scheduled: 'info',
  active: 'caution',
  agreed: 'good',
  impasse: 'bad',
  withdrawn: 'neutral',
};

const FILTERS = ['open', 'due', 'impasse', 'agreed', 'all'];
const FILTER_LABELS = {
  open: 'Open',
  due: 'Due / overdue',
  impasse: 'Impasse',
  agreed: 'Agreed',
  all: 'All',
};

function button(label, onClick, primary = false, disabled = false) {
  return h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick, disabled }, label);
}

function frameworkCard() {
  return card({
    title: 'How the analysis works',
    body: h(
      'div',
      { class: 'prose small' },
      h(
        'p',
        null,
        h('strong', null, 'BATNA (Fisher & Ury, 1981): '),
        'your best alternative if no deal is reached. A package that does not beat the BATNA should not be accepted; the app flags reservation prices that fail that test when units match.',
      ),
      h(
        'p',
        null,
        h('strong', null, 'ZOPA (Raiffa, 1982): '),
        'the zone where both sides’ reservation prices overlap. No zone means a gap to close with new options, objective criteria or a better BATNA — not pressure.',
      ),
      h(
        'p',
        { class: 'muted' },
        'Counterparty reservation prices are explicitly labelled estimates with a confidence level. They are never treated as facts, and negotiation prep never enters performance ratings.',
      ),
    ),
  });
}

function renderLinksStrip(summary, ctx) {
  const links = summary.links || [];
  if (!links.length) return h('p', { class: 'muted tiny' }, 'No cross-module links yet.');
  return h(
    'div',
    { class: 'case-links-strip' },
    ...links.map((item) =>
      h(
        'a',
        {
          class: 'case-link-pill',
          href: item.peer.route,
          onClick: (e) => {
            e.preventDefault();
            ctx.navigate(item.peer.route);
          },
        },
        h('span', { class: 'case-link-rel' }, item.relationLabel),
        h('strong', null, item.peer.title),
        h('span', { class: 'muted tiny' }, `(${item.peer.status})`),
      ),
    ),
  );
}

export function renderNegotiations(ctx) {
  const rollup = negotiationsRollup(ctx.state, ctx.now);
  const requested = ctx.query.get('filter');
  const filter = FILTERS.includes(requested) ? requested : 'open';

  const matches = (summary) => {
    const status = summary.record.status;
    if (filter === 'all') return true;
    if (filter === 'open') return OPEN_NEGOTIATION_STATUSES.includes(status);
    if (filter === 'due') return summary.sessionOverdue || summary.sessionDueSoon || summary.reviewOverdue;
    if (filter === 'impasse') return status === 'impasse';
    if (filter === 'agreed') return status === 'agreed';
    return true;
  };
  const rows = rollup.all.filter(matches).sort((a, b) => {
    const rank = { impasse: 4, active: 3, scheduled: 2, preparing: 1, agreed: 0, withdrawn: 0 };
    return (rank[b.record.status] || 0) - (rank[a.record.status] || 0)
      || (a.daysUntilSession ?? 999) - (b.daysUntilSession ?? 999)
      || b.record.updatedAt.localeCompare(a.record.updatedAt);
  });

  const counts = {
    open: rollup.open.length,
    due: rollup.sessionsOverdue.length + rollup.sessionsDueSoon.length + rollup.reviewsDue.length,
    impasse: rollup.impasses.length,
    agreed: rollup.byStatus.agreed.length,
    all: rollup.all.length,
  };

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Political science & deal discipline',
      title: 'Negotiation workbench',
      subtitle:
        'Prepare with BATNA, reservation prices and interests before the meeting; LeadOS computes the ZOPA and propagates mandate decisions, prep topics, impasse escalations and agreement commitments across the workspace in parallel.',
      actions: [button('Register negotiation', () => openNegotiationDialog(ctx), true)],
    }),
    ctx.persistError
      ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) })
      : null,
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Open negotiations', value: counts.open, hint: 'preparing, scheduled or active' }),
      stat({ label: 'Sessions due / overdue', value: counts.due, tone: counts.due ? 'warn' : '', hint: 'next-session or review dates' }),
      stat({ label: 'At impasse', value: counts.impasse, tone: counts.impasse ? 'bad' : '', hint: 'each raises one escalation case' }),
      stat({
        label: 'Average prep completeness',
        value: rollup.avgPrepPct === null ? '—' : `${rollup.avgPrepPct}%`,
        hint: rollup.avgZopaCoveragePct === null ? 'no reservation prices yet' : `weighted ZOPA coverage ${rollup.avgZopaCoveragePct}%`,
      }),
    ),
    h(
      'div',
      { class: 'tabs', role: 'group', 'aria-label': 'Negotiation filters' },
      ...FILTERS.map((key) =>
        h(
          'button',
          {
            type: 'button',
            class: `tab ${key === filter ? 'is-active' : ''}`,
            'aria-pressed': String(key === filter),
            onClick: () => ctx.navigate(`#/negotiations?filter=${key}`),
          },
          FILTER_LABELS[key],
          h('span', { class: 'tab-count' }, String(counts[key])),
        ),
      ),
    ),
    rows.length
      ? h(
          'div',
          { class: 'stack-md' },
          ...rows.map((summary) => {
            const record = summary.record;
            const statusBadge = badge(NEGOTIATION_STATUS_LABELS[record.status], STATUS_TONE[record.status] || 'neutral');
            const attention = summary.needsAttention;
            return card({
              title: record.title,
              subtitle: `${NEGOTIATION_KIND_LABELS[record.kind] || record.kind} · ${record.counterparty || 'counterparty unrecorded'} · opened ${formatDate(record.openedOn)}`,
              actions: [attention ? badge('Needs attention', 'bad') : statusBadge],
              body: h(
                'div',
                { class: 'stack-sm' },
                h(
                  'div',
                  { class: 'row-gap' },
                  record.strategic ? badge('Strategic', 'info') : null,
                  record.stakesValue !== null
                    ? badge(`Deal value ${record.stakesCurrency} ${record.stakesValue.toLocaleString('en-US')}`, 'neutral')
                    : null,
                  summary.highStakes ? badge('DACI mandate', 'info') : null,
                  summary.blockingGaps.length ? badge(`${summary.blockingGaps.length} no-ZOPA issue${summary.blockingGaps.length === 1 ? '' : 's'}`, 'bad') : null,
                ),
                h(
                  'p',
                  { class: 'muted small' },
                  summary.sessionOverdue
                    ? `Next session overdue (was ${formatDate(record.nextSessionOn)}).`
                    : record.nextSessionOn
                      ? `Next session ${formatDate(record.nextSessionOn)}${summary.sessionDueSoon ? ' — due soon' : ''}.`
                      : 'No session scheduled.',
                  ' ',
                  `Prep ${summary.prep.completenessPct}% · ${record.issues.length} measurable issue${record.issues.length === 1 ? '' : 's'}.`,
                ),
                h(
                  'a',
                  {
                    class: 'btn btn-ghost',
                    href: `#/negotiations/${encodeURIComponent(record.id)}`,
                    onClick: (e) => {
                      e.preventDefault();
                      ctx.navigate(`#/negotiations/${encodeURIComponent(record.id)}`);
                    },
                  },
                  'Open negotiation',
                ),
              ),
            });
          }),
        )
      : emptyState({
          title: 'No negotiations in this view',
          body: 'Register the next contract, resource ask or scope discussion. The workbench keeps the BATNA, ZOPA and commitments connected to cases, goals, decisions and delegations.',
          action: button('Register negotiation', () => openNegotiationDialog(ctx), true),
        }),
    frameworkCard(),
  );
}

function statusActions(ctx, summary) {
  const record = summary.record;
  const refresh = () => ctx.refresh();
  const setStatus = (status, label, confirmMessage) => {
    const run = () => {
      const res = ctx.api.setNegotiationStatus(record.id, status);
      if (!res.ok) {
        toast(res.error, 'bad');
        return;
      }
      if (res.escalation?.created) toast(`${label} — RULE-NEG-03 raised an operational escalation case.`, 'good');
      else toast(label, 'good');
      refresh();
    };
    if (confirmMessage) {
      confirmDialog({ title: label, message: confirmMessage, confirmLabel: label, onConfirm: run });
    } else {
      run();
    }
  };

  const actions = [button('Edit', () => openNegotiationDialog(ctx, { negotiation: record, onSaved: refresh }))];
  if (record.status === 'preparing') {
    actions.push(button('Schedule session', () => setStatus('scheduled', 'Session scheduled')));
    actions.push(button('Mark active', () => setStatus('active', 'Negotiation active'), true));
  } else if (record.status === 'scheduled') {
    actions.push(button('Back to preparing', () => setStatus('preparing', 'Moved back to preparing')));
    actions.push(button('Mark active', () => setStatus('active', 'Negotiation active'), true));
  } else if (record.status === 'active') {
    actions.push(button('Record agreement', () => openNegotiationAgreementDialog(ctx, record), true));
    actions.push(button('Mark impasse', () => setStatus('impasse', 'Marked at impasse', 'Impasse raises an operational escalation case (RULE-NEG-03) so the deadlock inherits FMEA, DACI and capacity treatment. Continue?')));
    actions.push(button('Withdraw', () => setStatus('withdrawn', 'Negotiation withdrawn', 'Withdraw this negotiation? The record and its links stay as history.')));
  } else if (record.status === 'impasse') {
    actions.push(button('Resume talks', () => setStatus('active', 'Talks resumed'), true));
    actions.push(button('Record agreement', () => openNegotiationAgreementDialog(ctx, record)));
    actions.push(button('Withdraw', () => setStatus('withdrawn', 'Negotiation withdrawn', 'Withdraw this negotiation? The record and its links stay as history.')));
  } else if (record.status === 'agreed' || record.status === 'withdrawn') {
    actions.push(button('Reopen', () => {
      const res = ctx.api.reopenNegotiation(record.id);
      if (!res.ok) toast(res.error, 'bad');
      else { toast('Negotiation reopened.', 'good'); refresh(); }
    }, true));
  }
  actions.push(button('Delete', () => {
    confirmDialog({
      title: 'Delete negotiation',
      message: `Delete “${record.title}”? Its graph links are removed; delegations and cases created from it remain as standalone records.`,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: () => {
        const res = ctx.api.deleteNegotiation(record.id);
        if (!res.ok) toast(res.error, 'bad');
        else { toast('Negotiation deleted.', 'neutral'); ctx.navigate('#/negotiations'); }
      },
    });
  }));
  return h('div', { class: 'row-gap', role: 'group', 'aria-label': 'Negotiation actions' }, ...actions);
}

function issueTable(summary) {
  const rows = summary.analyses.map((a) => ({
    name: a.name || 'Unnamed issue',
    direction: NEGOTIATION_ISSUE_DIRECTION_LABELS[a.direction].split(' ')[0],
    ours: a.ourReservation === null ? '—' : String(a.ourReservation),
    theirs: a.theirReservation === null ? '—' : `${a.theirReservation}${a.estimateConfidence ? ` (${ESTIMATE_CONFIDENCE_LABELS[a.estimateConfidence].split(' ')[0]})` : ''}`,
    zone:
      a.status === 'zopa'
        ? badge(`ZOPA ${a.zopaLow}–${a.zopaHigh} ${a.unit}`, 'good')
        : a.status === 'no-zopa'
          ? badge(`Gap ${a.gap} ${a.unit}`, 'bad')
          : badge('Incomplete', 'neutral'),
    midpoint: a.zopaMidpoint === null ? '—' : String(a.zopaMidpoint),
  }));
  return table({
    caption: 'Measurable issues, reservation prices and ZOPA analysis',
    columns: [
      { label: 'Issue', render: (r) => h('strong', null, r.name) },
      { label: 'Direction', render: (r) => r.direction },
      { label: 'Our reservation', render: (r) => r.ours },
      { label: 'Their reservation (est.)', render: (r) => r.theirs },
      { label: 'Zone', render: (r) => r.zone },
      { label: 'Raiffa midpoint', render: (r) => r.midpoint },
    ],
    rows,
    emptyMessage: 'No measurable issues yet. Add reservation prices in Edit to compute the ZOPA.',
  });
}

function prepChecklist(prep) {
  return h(
    'ul',
    { class: 'review-checklist' },
    ...prep.checks.map((check) =>
      h('li', { class: check.met ? 'is-met' : '' }, h('span', { 'aria-hidden': 'true' }, check.met ? '✓' : '○'), h('span', null, check.label)),
    ),
  );
}

function termsCard(ctx, summary) {
  const record = summary.record;
  if (record.status !== 'agreed' || !record.agreedTerms?.length) return null;
  const people = new Map((ctx.state.people || []).map((p) => [p.id, p]));
  const delivery = summary.delivery || negotiationDelivery(record, ctx.state);
  return card({
    title: 'Agreed terms & commitments',
    subtitle: 'Agreement is not delivery: tracked outcomes below come from delegations, not inferred savings.',
    body: table({
      caption: 'Agreed negotiation terms',
      columns: [
        { label: 'Term', render: (t) => t.text },
        {
          label: 'Delivery',
          render: (t) => {
            const row = delivery.rows.find((r) => r.term.id === t.id) || { status: 'untracked', delegation: null, priorOwners: [], attemptCount: 1, recovered: false };
            const labels = {
              delivered: 'Delivered',
              returned: 'Returned — needs recovery',
              'in-progress': 'In progress',
              untracked: 'Untracked — gap',
            };
            return h(
              'div',
              { class: 'stack-xs' },
              h(
                'div',
                { class: 'row-gap' },
                badge(labels[row.status], row.status === 'delivered' ? 'good' : row.status === 'returned' ? 'bad' : 'caution'),
                row.recovered ? badge(`Recovered · attempt #${row.attemptCount}`, 'neutral') : null,
                row.delegation ? h('a', { class: 'link tiny', href: `#/delegations?delegation=${encodeURIComponent(row.delegation.id)}` }, ' Open delegations') : null,
                row.status === 'returned' && row.delegation
                  ? h(
                      'button',
                      {
                        class: 'btn btn-tiny btn-primary',
                        type: 'button',
                        onClick: () => openRecoverNegotiationTermDialog(ctx, record, t, row.delegation),
                      },
                      'Recover term',
                    )
                  : null,
              ),
              row.priorOwners?.length
                ? h(
                    'span',
                    { class: 'muted tiny' },
                    `Lineage: previously held by ${row.priorOwners.map((po) => `${po.ownerName}${po.returnedOn ? ` (returned ${formatDate(po.returnedOn)}${po.returnReason ? `: ${po.returnReason}` : ''})` : ''}`).join(' → ')}`,
                  )
                : null,
            );
          },
        },
        {
          label: 'Owner',
          render: (t) => t.ownerId ? (people.get(t.ownerId)?.name || 'Unknown person') : badge('No owner — gap', 'bad'),
        },
        { label: 'Due', render: (t) => (t.dueOn ? formatDate(t.dueOn) : '—') },
        {
          label: 'Agreed / settled value',
          render: (t) => {
            if (t.agreedValue === null && (t.settledValue === null || t.settledValue === undefined)) return '—';
            const agreedText = t.agreedValue === null ? '—' : `${t.agreedValue} ${t.unit || ''}`.trim();
            if (t.settledValue === null || t.settledValue === undefined) return agreedText;
            return `${agreedText} → settled ${t.settledValue} ${t.unit || ''}`.trim();
          },
        },
      ],
      rows: record.agreedTerms,
      emptyMessage: 'No terms recorded.',
    }),
  });
}

function settlementCalibrationCard(ctx, record, summary) {
  const currency = String(record.stakesCurrency || 'USD').trim().toUpperCase();
  const hasComparableIssue = (record.issues || []).some((issue) => (
    String(issue.unit || '').trim().toUpperCase() === currency
      && ['minimize', 'maximize'].includes(issue.direction)
  ));
  if (!hasComparableIssue) return null;

  // Exclude this agreement from its own outside-view sample. Historical
  // settlements can inform preparation, but must never self-score.
  const peers = (ctx.state.negotiations || []).filter((item) => item.id !== record.id);
  const calibration = negotiationSettlementCalibration({ ...ctx.state, negotiations: peers });
  const direction = summary.settlementEvaluation?.dealDirection || 'maximize';
  const cohort = calibration.cohorts.find((item) => item.currency === currency && item.direction === direction);
  const n = cohort?.n || 0;
  const link = h('a', {
    class: 'link',
    href: '#/decisions',
    onClick: (event) => {
      event.preventDefault();
      ctx.navigate('#/decisions');
    },
  }, 'Open full calibration ledger');

  return card({
    title: 'Outside-view settlement context',
    subtitle: 'Flyvbjerg (2006) reference class · prior agreements only · no automatic change to this negotiation’s targets',
    body: h(
      'div',
      { class: 'stack-sm' },
      n < CALIBRATION_MIN_SAMPLES
        ? h('p', { class: 'small' }, `Prior ${currency} / ${direction} settlements: n=${n}. Counts only until n≥${CALIBRATION_MIN_SAMPLES}; a performance distribution is withheld for this small sample.`)
        : h(
            'p',
            { class: 'small' },
            `${currency} / ${direction} reference class (n=${cohort.n}): median direction-adjusted variance ${cohort.medianFavorableVariancePct > 0 ? '+' : ''}${cohort.medianFavorableVariancePct}%; P80 shortfall ${cohort.p80ShortfallPct}%.`,
          ),
      cohort?.materialShortfall
        ? h('p', { class: 'note note-warn small' }, `NEG-09 review guardrail met: median shortfall is at least ${NEGOTIATION_MATERIAL_SHORTFALL_PCT}%. Validate baseline, scope, usage and delivery; do not infer cause or treat this as a personal score.`)
        : n >= CALIBRATION_MIN_SAMPLES
          ? h('p', { class: 'muted small' }, 'Historical description only—not a forecast, guarantee of savings or proof that the same outcome will recur.')
          : null,
      link,
    ),
  });
}

function settlementCard(ctx, summary) {
  const record = summary.record;
  if (record.status !== 'agreed') return null;
  const se = summary.settlementEvaluation;
  const statusLabels = {
    unsettled: 'Awaiting settlement actuals',
    'on-terms': 'Settled on agreed terms',
    shortfall: 'Implementation shortfall',
    'batna-breach': 'Walk-away BATNA breached',
    'counterparty-breach': 'Counterparty delivery breach',
  };
  const statusTones = {
    unsettled: 'neutral',
    'on-terms': 'good',
    shortfall: 'caution',
    'batna-breach': 'bad',
    'counterparty-breach': 'bad',
  };
  const cpLabel = se?.counterpartyDelivered === true
    ? 'Delivered as agreed'
    : se?.counterpartyDelivered === false
      ? 'Shortfall or breach'
      : 'Not yet verified';

  return card({
    title: 'Agreement settlement & realization',
    subtitle: 'Williamson (1985) ex-post governance & Perold (1988) implementation shortfall — realised actuals are recorded separately, never inferred from the signed deal.',
    actions: [
      badge(statusLabels[se?.status || 'unsettled'], statusTones[se?.status || 'unsettled']),
      h(
        'button',
        {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => openNegotiationSettlementDialog(ctx, record),
        },
        se?.settled ? 'Update settlement' : 'Record settlement',
      ),
    ],
    body: se?.settled
      ? h(
          'div',
          { class: 'stack-sm' },
          h(
            'div',
            { class: 'stat-row' },
            stat({
              label: 'Signed deal value',
              value: se.stakesValue === null ? '—' : `${se.stakesCurrency} ${se.stakesValue.toLocaleString('en-US')}`,
            }),
            stat({
              label: 'Realised value',
              value: se.realisedValue === null ? '—' : `${se.stakesCurrency} ${se.realisedValue.toLocaleString('en-US')}`,
              tone: se.batnaBreached ? 'bad' : se.shortfallPct > 0 ? 'warn' : se.realisedValue !== null ? 'good' : '',
              hint: se.realisationRatio !== null ? `${Math.round(se.realisationRatio * 100)}% of signed value` : '',
            }),
            stat({
              label: 'Counterparty delivery',
              value: cpLabel,
              tone: se.counterpartyDelivered === false ? 'bad' : se.counterpartyDelivered === true ? 'good' : '',
            }),
            stat({
              label: 'Settled on',
              value: se.settledOn ? formatDate(se.settledOn) : '—',
            }),
          ),
          se.batnaBreached
            ? h(
                'p',
                { class: 'small text-bad' },
                `⚠ Realised outcome breached the walk-away BATNA (${se.batnaValue?.toLocaleString('en-US') ?? ''} ${se.batnaUnit || ''}). RULE-NEG-06 opened a DACI settlement review decision.`,
              )
            : null,
          se.note ? h('p', { class: 'small' }, se.note) : null,
        )
      : h(
          'p',
          { class: 'muted small' },
          'No settled actuals recorded yet. Once commitments execute, record the realised deal value, counterparty delivery outcome, and any quantitative term variances.',
        ),
  });
}

function eventTimeline(ctx, record) {
  const events = (ctx.state.events || [])
    .filter((e) => e.entityId === record.id && String(e.type || '').startsWith('negotiation.'))
    .slice(-12)
    .reverse();
  if (!events.length) return null;
  return card({
    title: 'History',
    body: h(
      'ol',
      { class: 'timeline-list' },
      ...events.map((e) =>
        h('li', null, h('span', { class: 'muted tiny' }, formatDate(e.ts.slice(0, 10))), h('span', null, e.summary)),
      ),
    ),
  });
}

export function renderNegotiationDetail(ctx, negotiationId) {
  const record = (ctx.state.negotiations || []).find((n) => n.id === negotiationId);
  if (!record) {
    return h(
      'div',
      { class: 'page' },
      emptyState({
        title: 'That negotiation no longer exists',
        body: 'It may have been deleted in another tab.',
        action: h(
          'button',
          { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/negotiations') },
          'Back to negotiations',
        ),
      }),
    );
  }

  const summary = summarizeNegotiation(record, ctx.state, ctx.now);
  const owner = record.ownerId ? (ctx.state.people || []).find((p) => p.id === record.ownerId) : null;

  return h(
    'div',
    { class: 'page stack-md' },
    pageHeader({
      eyebrow: NEGOTIATION_KIND_LABELS[record.kind] || record.kind,
      title: record.title,
      subtitle: `${record.counterparty || 'Counterparty unrecorded'}${record.counterpartyRole ? ` · ${record.counterpartyRole}` : ''} · opened ${formatDate(record.openedOn)}`,
      actions: [badge(NEGOTIATION_STATUS_LABELS[record.status], STATUS_TONE[record.status] || 'neutral')],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Prep completeness', value: `${summary.prep.completenessPct}%`, tone: summary.prep.completenessPct < 50 ? 'warn' : 'good' }),
      stat({
        label: 'Weighted ZOPA coverage',
        value: summary.zopaCoveragePct === null ? '—' : `${summary.zopaCoveragePct}%`,
        tone: summary.blockingGaps.length ? 'bad' : 'good',
      }),
      stat({ label: 'Next session', value: record.nextSessionOn ? formatDate(record.nextSessionOn) : '—', tone: summary.sessionOverdue ? 'bad' : '' }),
      stat({
        label: 'Recorded deal value',
        value: record.stakesValue === null ? '—' : `${record.stakesCurrency} ${record.stakesValue.toLocaleString('en-US')}`,
        hint: record.strategic ? 'strategic negotiation' : '',
      }),
    ),
    statusActions(ctx, summary),
    summary.escalationCase
      ? card({
          title: 'Impasse escalation',
          body: h(
            'div',
            { class: 'row-between' },
            h('p', { class: 'small' }, 'An operational case is managing this impasse with FMEA, DACI governance and capacity treatment.'),
            h(
              'a',
              { class: 'btn btn-ghost', href: summary.escalationCase.route, onClick: (e) => { e.preventDefault(); ctx.navigate(summary.escalationCase.route); } },
              'Open escalation case',
            ),
          ),
        })
      : null,
    card({ title: 'Cross-module links', body: renderLinksStrip(summary, ctx) }),
    card({
      title: 'Measurable issues & ZOPA',
      subtitle: 'Raiffa (1982) zone of possible agreement from recorded reservation prices',
      body: h('div', { class: 'stack-sm' }, issueTable(summary), ...summary.targetWarnings.map((w) => h('p', { class: 'small text-warn' }, `⚠ ${w}`)), ...summary.batnaWarnings.map((w) => h('p', { class: 'small text-warn' }, `⚠ ${w}`))),
    }),
    card({
      title: 'Fisher & Ury preparation checklist',
      subtitle: `Weighted completeness ${summary.prep.completenessPct}%`,
      body: prepChecklist(summary.prep),
    }),
    settlementCalibrationCard(ctx, record, summary),
    card({
      title: 'BATNA & interests',
      body: h(
        'div',
        { class: 'grid grid-2' },
        h('div', null, h('h3', null, 'Our BATNA'), h('p', { class: 'small' }, record.ourBatnaDescription || 'Not recorded — define the walk-away course before the next session.'),
          record.ourBatnaValue !== null ? h('p', { class: 'muted small' }, `Comparable BATNA value: ${record.ourBatnaValue} ${record.ourBatnaUnit || ''}`) : null,
          h('h3', null, 'Our interests'), h('ul', { class: 'small' }, ...record.ourInterests.map((i) => h('li', null, i)))),
        h('div', null, h('h3', null, 'Counterparty BATNA (estimate)'), h('p', { class: 'small' }, record.theirBatnaEstimate || 'Not estimated.'),
          h('h3', null, 'Counterparty interests (estimated)'), h('ul', { class: 'small' }, ...record.theirInterests.map((i) => h('li', null, i)))),
      ),
    }),
    card({
      title: 'Objective criteria & package options',
      body: h(
        'div',
        { class: 'grid grid-2' },
        h('div', null, h('h3', null, 'Objective criteria'), h('ul', { class: 'small' }, ...record.objectiveCriteria.map((i) => h('li', null, i)))),
        h('div', null, h('h3', null, 'Options for mutual gain'), h('ul', { class: 'small' }, ...record.options.map((i) => h('li', null, i)))),
      ),
    }),
    termsCard(ctx, summary),
    settlementCard(ctx, summary),
    record.notes ? card({ title: 'Prep notes', body: h('p', { class: 'small' }, record.notes) }) : null,
    record.outcomeNotes ? card({ title: 'Outcome notes', body: h('p', { class: 'small' }, record.outcomeNotes) }) : null,
    owner ? h('p', { class: 'muted tiny' }, `Internal owner: ${owner.name}`) : null,
    eventTimeline(ctx, record),
  );
}
