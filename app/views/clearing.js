/**
 * app/views/clearing.js — `#/clearing`, the Internal Clearinghouse (ADR-0098).
 *
 * The view is deliberately a thin adapter over the pure clearing report and
 * guarded action mixin. It never reads raw rounds for a declared seat: the
 * action/report boundary has already applied the horizontal seal, hierarchy,
 * small-cell floor and aggregate disclosure rules.
 */
import { h, toast, openModal } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey } from '../core/time.js';
import { CLEARING_LIMITS } from '../core/domain/clearingRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'rollup', label: 'Roll-up' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'conventions', label: 'Conventions' },
];

const CSV_COLUMNS = [
  'row_kind', 'altitude', 'rank', 'rounds_n', 'cleared_n', 'settled_n', 'funded_spans_n',
  'committed_capacity_days', 'overdue_n', 'mix_imbalanced_n', 'pivotal_n', 'pivotal_cleared_n',
  'hurdle_hold_pct', 'interval_low_pct', 'interval_high_pct', 'mean_brier', 'brier_skill_pct',
  'refused', 'reason',
];

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((panel) => panel.key === key) ? key : 'desk';
};
const go = (ctx, panel, roundId = '') => ctx.navigate(`#/clearing?panel=${panel}${roundId ? `&round=${encodeURIComponent(roundId)}` : ''}`);
const blank = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const pct = (value) => (value === null || value === undefined ? 'withheld' : `${value}%`);
const toneForStatus = (status) => ({ open: 'warn', cleared: 'good', settled: 'good', withdrawn: 'neutral' }[status] || 'neutral');

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The Clearinghouse action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function fallback(title, text, label) {
  openModal({
    title,
    body: h('textarea', { rows: 16, readonly: true, value: text, class: 'input', 'aria-label': label }),
  });
}

function exportCsv(ctx) {
  const result = ctx.api.clearingCsvRows();
  if (!result?.ok) return toast(result?.error || 'The aggregate CSV was refused.', 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-internal-clearinghouse-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) fallback('Copy Clearinghouse CSV', text, 'Clearinghouse aggregate CSV');
}

function exportBrief(ctx) {
  const result = ctx.api.clearingBriefText();
  if (!result?.ok) return toast(result?.error || 'The upward brief was refused.', 'bad');
  const filename = `leados-internal-clearinghouse-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) fallback('Copy Clearinghouse brief', result.text, 'Clearinghouse upward brief');
}

function labelled(label, control, hint = '') {
  return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('span', { class: 'muted small' }, hint) : null);
}

function tierRow(initial = {}) {
  const key = h('input', { class: 'input', type: 'text', maxLength: '40', value: initial.key || '', placeholder: 'tier key', 'aria-label': 'Tier key' });
  const label = h('input', { class: 'input', type: 'text', maxLength: String(CLEARING_LIMITS.labelMax), value: initial.label || '', placeholder: 'package label', 'aria-label': 'Tier label' });
  const cost = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(initial.cost ?? ''), placeholder: 'cost', 'aria-label': 'Tier cost' });
  const capacityDays = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(initial.capacityDays ?? ''), placeholder: 'shared days', 'aria-label': 'Tier shared capacity days' });
  const valueLo = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(initial.valueLo ?? ''), placeholder: 'value lo', 'aria-label': 'Tier lower outcome value' });
  const valueHi = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: String(initial.valueHi ?? ''), placeholder: 'value hi', 'aria-label': 'Tier upper outcome value' });
  const floor = h('input', { type: 'checkbox', checked: initial.isMinimumViable === true, 'aria-label': 'Minimum viable tier' });
  const row = h('div', { class: 'stack clearing-tier-row' },
    h('div', { class: 'grid grid-3' }, key, label, h('label', { class: 'field checkbox-field' }, floor, 'Minimum viable floor')),
    h('div', { class: 'grid grid-4' }, cost, capacityDays, valueLo, valueHi),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => row.remove() }, 'Remove tier'));
  row._read = () => ({ key: key.value, label: label.value, cost: Number(cost.value), capacityDays: Number(capacityDays.value), valueLo: Number(valueLo.value), valueHi: Number(valueHi.value), isMinimumViable: floor.checked });
  return row;
}

function openRoundDialog(ctx, report) {
  const title = h('input', { class: 'input', type: 'text', maxLength: String(CLEARING_LIMITS.titleMax), placeholder: 'One line naming the shared envelope', 'aria-label': 'Clearing round title' });
  const outcomeLabel = h('input', { class: 'input', type: 'text', maxLength: String(CLEARING_LIMITS.labelMax), placeholder: 'e.g. customer blockers closed', 'aria-label': 'Common outcome unit' });
  const currency = h('input', { class: 'input', type: 'text', maxLength: '3', value: 'EUR', 'aria-label': 'ISO currency code' });
  const budgetCap = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '1000', 'aria-label': 'Budget cap' });
  const capacityCap = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '20', 'aria-label': 'Shared capacity cap' });
  const reserveBudget = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '0', 'aria-label': 'Budget reserve' });
  const reserveCapacity = h('input', { class: 'input', type: 'number', min: '0', step: '1', value: '0', 'aria-label': 'Capacity reserve' });
  const horizonDays = h('input', { class: 'input', type: 'number', min: '1', max: String(CLEARING_LIMITS.horizonDaysMax), step: '1', value: String(report.playbook?.horizonDays || 30), 'aria-label': 'Horizon in days' });
  const gamma = h('input', { class: 'input', type: 'number', min: '0', max: String(CLEARING_LIMITS.bidsPerRoundMax), step: '1', value: '1', 'aria-label': 'Uncertainty budget Gamma' });
  const expected = h('input', { class: 'input', type: 'number', min: String(CLEARING_LIMITS.expectedHoldPctMin), max: String(CLEARING_LIMITS.expectedHoldPctMax), step: '1', placeholder: 'optional percent', 'aria-label': 'Expected hurdle hold percentage' });
  const note = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Open sealed round');
  let dialog;
  const form = h('form', {
    class: 'stack',
    onSubmit: (event) => {
      event.preventDefault();
      submit.disabled = true;
      const result = ctx.api.clearingOpenRound({
        title: title.value, outcomeLabel: outcomeLabel.value, currency: currency.value,
        budgetCap: Number(budgetCap.value), capacityCap: Number(capacityCap.value),
        reserveBudget: Number(reserveBudget.value), reserveCapacity: Number(reserveCapacity.value),
        horizonDays: Number(horizonDays.value), gamma: Number(gamma.value),
        expectedHurdleHoldPct: expected.value === '' ? null : Number(expected.value),
      });
      if (!result.ok) {
        note.textContent = result.error;
        submit.disabled = false;
        return;
      }
      dialog.close();
      notify(result, 'Sealed round opened. Subordinate spans can now submit their own packages.');
      go(ctx, 'rounds', result.id);
      ctx.refresh();
    },
  },
    banner({ tone: 'info', title: 'Open an envelope, not a political contest', body: 'Bids are sealed horizontally. State one currency, one scarce budget/capacity envelope, a Gamma uncertainty budget and a dated horizon before any sibling package is visible to the chair.' }),
    labelled('Round title', title),
    h('div', { class: 'grid grid-2' }, labelled('Common outcome unit', outcomeLabel), labelled('Currency', currency, 'One ISO-4217 code; currencies never pool.')),
    h('div', { class: 'grid grid-4' }, labelled('Budget cap', budgetCap), labelled('Capacity cap (shared days)', capacityCap), labelled('Reserve budget', reserveBudget), labelled('Reserve capacity', reserveCapacity)),
    h('div', { class: 'grid grid-3' }, labelled('Horizon (days)', horizonDays), labelled('Gamma uncertainty budget', gamma), labelled('Expected hurdle hold %', expected, 'Optional pre-registration for Brier scoring.')),
    note,
    h('div', { class: 'form-actions' }, submit),
  );
  dialog = openModal({ title: 'Open a sealed clearing round', description: 'The chair declares the envelope. The solver only runs after subordinate spans submit discrete package tiers.', body: form, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel')], size: 'lg' });
}

function openBidDialog(ctx, report, round) {
  const own = report.rounds.find((row) => row.id === round.id)?.ownBid || null;
  const bidder = own?.bidderSeatId || report.seat.id;
  const bidderInput = h('input', { class: 'input', type: 'text', value: bidder, readonly: !report.seat.fullAccess, 'aria-label': 'Bidding span id' });
  const note = h('textarea', { class: 'input', rows: '3', maxLength: String(CLEARING_LIMITS.noteMax), value: own?.note || '', placeholder: 'Optional evidence or delivery note', 'aria-label': 'Bid note' });
  const tiers = h('div', { class: 'stack' });
  const addTier = (initial = {}) => tiers.append(tierRow(initial));
  if (own?.tiers?.length) own.tiers.forEach(addTier); else addTier({});
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Seal bid');
  let dialog;
  const form = h('form', {
    class: 'stack',
    onSubmit: (event) => {
      event.preventDefault();
      submit.disabled = true;
      const result = ctx.api.clearingSubmitBid(round.id, {
        bidderSeatId: bidderInput.value, note: note.value,
        tiers: [...tiers.children].map((row) => row._read()),
      });
      if (!result.ok) {
        status.textContent = result.error;
        submit.disabled = false;
        return;
      }
      dialog.close();
      notify(result, 'Sealed package recorded. Sibling bids remain withheld.');
      go(ctx, 'rounds', round.id);
      ctx.refresh();
    },
  },
    banner({ tone: 'info', title: 'Your span’s package is sealed from siblings', body: 'Submit honest lower and upper outcome bounds. A minimum-viable tier is a hard floor when the chair has enabled floor protection.' }),
    labelled('Bidding span', bidderInput, report.seat.fullAccess ? 'Operator may repair/import a span id; a declared seat may submit only its own.' : ''),
    labelled('Delivery/evidence note', note),
    h('fieldset', { class: 'field' },
      h('legend', null, 'Discrete package tiers'),
      h('p', { class: 'muted small' }, 'Each tier has cost, shared person-days, [value lo, value hi], and an optional minimum-viable floor.'),
      tiers,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => addTier({}) }, '+ Add tier'),
    ),
    status,
    h('div', { class: 'form-actions' }, submit),
  );
  dialog = openModal({ title: own ? 'Revise your sealed bid' : 'Submit a sealed bid', description: `Round ${round.openedOn} → ${round.horizonOn}. Sibling schedules cannot be read from this form.`, body: form, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel')], size: 'lg' });
}

function openConventionsDialog(ctx, report) {
  const fields = [
    ['clearingCellFloor', 'Cell floor', report.conventions.clearingCellFloor, 2, 12],
    ['clearingReviewDays', 'Review window (days)', report.conventions.clearingReviewDays, 3, 180],
    ['clearingMaxCombinations', 'Enumeration combinations', report.conventions.clearingMaxCombinations, 1000, CLEARING_LIMITS.combinationsMax],
    ['clearingNodeBudget', 'Branch-and-bound node budget', report.conventions.clearingNodeBudget, CLEARING_LIMITS.nodeBudgetMin, CLEARING_LIMITS.nodeBudgetMax],
    ['clearingMixImbalanceHighPct', 'Mix high threshold %', report.conventions.clearingMixImbalanceHighPct, 70, 100],
    ['clearingMixImbalanceLowPct', 'Mix low threshold %', report.conventions.clearingMixImbalanceLowPct, 10, 65],
  ];
  const controls = new Map(fields.map(([key, label, value, min, max]) => [key, h('input', { class: 'input', type: 'number', min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': label })]));
  const dialog = openModal({
    title: 'Govern Clearinghouse conventions',
    description: 'Director rank and above sets the shared solver and disclosure bounds. The action never changes a frozen round.',
    body: h('div', { class: 'stack' }, ...fields.map(([key, label]) => labelled(label, controls.get(key))), h('p', { class: 'muted small' }, 'Automatic propagation may be paused only through the regular settings boundary; an explicit scan remains traceable.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const patch = Object.fromEntries(fields.map(([key]) => [key, Number(controls.get(key).value)]));
        const result = ctx.api.clearingSetConventions(patch);
        if (notify(result, 'Clearinghouse conventions updated.')) { dialog.close(); ctx.refresh(); }
      } }, 'Save conventions'),
    ],
    size: 'lg',
  });
}

function roundSummary(round) {
  return `${round.status} · ${round.bidsCount} bid(s) · ${round.currency} · ${round.budgetCap} budget / ${round.capacityCap} shared days`;
}

function roundTable(ctx, report) {
  return table({
    caption: 'Clearing rounds visible at this operating seat',
    columns: [
      { label: 'Round', render: (row) => h('a', { href: `#/clearing?panel=rounds&round=${encodeURIComponent(row.id)}` }, row.title) },
      { label: 'Status', render: (row) => badge(row.status, toneForStatus(row.status)) },
      { label: 'Horizon', render: (row) => row.horizonOn },
      { label: 'Envelope', render: (row) => `${row.currency} · ${row.budgetCap} / ${row.capacityCap}d` },
      { label: 'Bids', render: (row) => row.bidsSealed ? badge(`${row.bidsCount} sealed`, 'neutral') : String(row.bidsCount) },
      { label: 'Access', render: (row) => badge(row.accessRole, row.accessRole === 'invited-bidder' ? 'warn' : 'good') },
    ],
    rows: report.rounds,
    emptyMessage: 'No clearing round is visible in this span yet.',
  });
}

function deskPanel(ctx, report) {
  const s = report.summary;
  const hc = report.hurdleCoverage;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: report.premise, body: report.disclosure.seal }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Visible rounds', value: s.visibleRoundsN, hint: `${s.subtreeRoundsN} in your subtree` }),
      stat({ label: 'Open', value: s.openN + s.invitedOpenN, hint: `${s.openN} chaired · ${s.invitedOpenN} inviting your bid` }),
      stat({ label: 'Settled', value: s.settledN }),
      stat({ label: 'Attention', value: s.overdueSettlementN + s.hurdleDeficitsN + s.mixBottlenecksN, tone: (s.overdueSettlementN + s.hurdleDeficitsN + s.mixBottlenecksN) ? 'bad' : 'good', hint: 'overdue, hurdle or mix findings' }),
    ),
    card({
      title: report.playbook.title,
      subtitle: `${report.playbook.horizonDays || report.playbook.horizon || '—'} · the decision this altitude is competent to close`,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'Question. '), report.playbook.question),
        h('p', null, h('strong', null, 'See. '), report.playbook.see),
        h('p', null, h('strong', null, 'Act. '), report.playbook.act),
        h('p', { class: 'muted' }, h('strong', null, 'Hand upward. '), report.playbook.hand),
        h('div', { class: 'form-actions' },
          report.seat.canChair ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openRoundDialog(ctx, report) }, 'Open sealed round') : null,
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.clearingScan(); if (notify(result, 'Clearinghouse governance scan complete.')) ctx.refresh(); } }, 'Scan governance'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportBrief(ctx) }, 'Copy upward brief'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportCsv(ctx) }, 'Download CSV'),
        ),
      ),
    }),
    hc.refused
      ? banner({ tone: 'warn', title: 'Pivotal hurdle coverage withheld', body: hc.reason })
      : banner({ tone: 'good', title: `${hc.k} of ${hc.n} pivotal tranches cleared their Clarke hurdle`, body: `${hc.pct}% · Wilson 95% ${hc.lowPct}–${hc.highPct}%` }),
    report.rounds.length ? card({ title: 'Current rounds', subtitle: 'Open rounds seal sibling schedules. Frozen rounds retain the exact solver certificate.', body: roundTable(ctx, report) }) : emptyState({ title: 'The market is empty', body: report.seat.canChair ? 'Open a bounded envelope and invite subordinate spans to submit discrete package tiers.' : 'Ask the chairing altitude for a sealed round or submit into the parent round.' }),
  );
}

function roundsPanel(ctx, report) {
  const selected = report.selected;
  return h('div', { class: 'stack' },
    card({ title: 'Rounds in scope', subtitle: 'A chair sees its own round and the exact frozen solution. An invited bidder sees only its own sealed package; an ancestor sees structure and aggregate economics.', body: roundTable(ctx, report) }),
    selected ? roundDetail(ctx, report, selected) : emptyState({ title: 'Select a round', body: 'Open a round from the table to inspect the action boundary.' }),
  );
}

function roundDetail(ctx, report, round) {
  const isChair = round.accessRole === 'chair' || report.seat.fullAccess;
  const invited = round.accessRole === 'invited-bidder';
  const own = round.ownBid;
  const frozen = round.frozen;
  const solved = round.livePreview;
  const rows = (frozen?.allocations || solved?.allocations || []).map((item) => ({
    label: item.bidderLabel || (item.bidderSeatId === report.seat.id ? 'Your span' : 'Sub-span'),
    tier: item.tierLabel || (item.tierKey ? `Tier ${item.tierKey}` : 'Unfunded'),
    cost: item.allocatedCost,
    days: item.allocatedCapacityDays,
    hurdle: item.clarkeExternality,
    pivotal: item.pivotal ? 'pivotal' : 'non-pivotal',
  }));
  return card({
    title: round.title,
    subtitle: roundSummary(round),
    actions: [badge(round.accessRole, invited ? 'warn' : 'good'), round.status === 'open' ? badge('sibling bids sealed', 'neutral') : badge('solution frozen', 'good')],
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Net budget', value: `${round.netBudgetCap} ${round.currency}` }),
        stat({ label: 'Net shared days', value: round.netCapacityCap }),
        stat({ label: 'Gamma', value: round.gamma }),
        stat({ label: 'Horizon', value: round.horizonOn }),
      ),
      invited ? banner({ tone: 'info', title: 'Horizontal seal active', body: round.sealReason }) : null,
      isChair && round.status === 'open' ? h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openBidDialog(ctx, report, round) }, invited ? 'Submit your sealed bid' : 'Add or revise a bid'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.clearingCommit(round.id, {}); if (notify(result, 'Exact clearing committed; delivery propagation is now auditable.')) ctx.refresh(); } }, 'Commit exact clearing'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { const result = ctx.api.clearingWithdrawRound(round.id); if (notify(result, 'Open round withdrawn without encumbrance.')) ctx.refresh(); } }, 'Withdraw'),
      ) : null,
      !isChair && invited && round.status === 'open' ? h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openBidDialog(ctx, report, round) }, own ? 'Revise your sealed bid' : 'Submit your sealed bid')) : null,
      round.status === 'cleared' && isChair ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'settlement', round.id) }, 'Settle at horizon') : null,
      own ? card({ title: 'Your sealed package', body: h('div', { class: 'stack' }, h('p', null, `${own.tiers.length} tier(s) submitted on ${own.submittedOn}.`), h('p', { class: 'muted' }, own.note || 'No note attached.')) }) : null,
      round.bids?.length && isChair ? card({ title: 'Bid schedules', subtitle: invited ? 'Only your own schedule is shown.' : 'Labels and notes are disclosed only to the chairing altitude.', body: table({ caption: 'Sealed schedules at this boundary', columns: [{ label: 'Span', render: (row) => row.bidderLabel }, { label: 'Submitted', render: (row) => row.submittedOn }, { label: 'Tiers', render: (row) => String(row.tiers.length) }, { label: 'Linked record', render: (row) => row.linkedEntityType || '—' }], rows: round.bids, emptyMessage: 'No bid schedule is visible.' }) }) : null,
      solved?.ok ? card({ title: frozen ? 'Frozen allocation and Clarke hurdles' : 'Live solver preview', subtitle: 'The table is a mechanism output, not a person rating.', body: table({ caption: 'Clearing allocation', columns: [{ label: 'Span', render: (row) => row.label }, { label: 'Tier', render: (row) => row.tier }, { label: 'Cost', render: (row) => String(row.cost) }, { label: 'Shared days', render: (row) => String(row.days) }, { label: 'Clarke hurdle τ_i', render: (row) => String(row.hurdle) }, { label: 'Role', render: (row) => badge(row.pivotal, row.pivotal === 'pivotal' ? 'warn' : 'neutral') }], rows, emptyMessage: 'No funded tranche.' }) }) : (solved && !solved.ok ? banner({ tone: 'warn', title: 'No live solution yet', body: solved.reason }) : null),
      frozen ? card({
        title: 'Frozen solver certificate',
        body: h('div', { class: 'stack' },
          h('p', null, `Regime ${frozen.regime}; welfare ${frozen.activeObjective}; Reallocation Alpha ${frozen.reallocationAlpha >= 0 ? '+' : ''}${frozen.reallocationAlpha}; shadow prices λB ${frozen.dualBudgetPrice}, λC ${frozen.dualCapacityPrice}.`),
          h('p', { class: 'muted' }, `Certificate: ${frozen.certificate?.engine || 'exact'}, ${blank(frozen.certificate?.nodes)} node(s), certified ${frozen.certificate?.certified !== false ? 'yes' : 'no'}.`),
        ),
      }) : null,
    ),
  });
}

function settlementPanel(ctx, report) {
  const settled = report.rounds.filter((round) => round.status === 'settled' && round.settlement);
  const cleared = report.rounds.filter((round) => round.status === 'cleared' && round.accessRole === 'chair');
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Settlement is once-only and out of sample', body: 'A funded span is judged against the exact sibling opportunity-cost hurdle it displaced. A miss opens blameless mechanism work; it never becomes an individual performance rating.' }),
    cleared.length ? card({ title: 'Cleared rounds awaiting settlement', body: table({ caption: 'Rounds awaiting one-time hurdle settlement', columns: [{ label: 'Round', render: (row) => row.title }, { label: 'Horizon', render: (row) => row.horizonOn }, { label: 'Funded', render: (row) => String(row.frozen?.allocations?.filter((a) => a.chosenTierIndex > 0).length || 0) }, { label: 'Action', render: (row) => h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openSettlementDialog(ctx, report, row) }, 'Settle once') }], rows: cleared, emptyMessage: 'No cleared round awaits settlement.' }) }) : null,
    settled.length ? card({ title: 'Settled rounds', body: table({ caption: 'Immutable hurdle outcomes', columns: [{ label: 'Round', render: (row) => row.title }, { label: 'Settled', render: (row) => row.settlement.settledOn }, { label: 'Pivotal hold', render: (row) => `${row.settlement.pivotalClearedCount}/${row.settlement.pivotalCount}` }, { label: 'Realization', render: (row) => blank(row.settlement.realizationPct) }, { label: 'Brier', render: (row) => blank(row.settlement.brier) }], rows: settled, emptyMessage: 'No once-only settlement exists in this scope.' }) }) : emptyState({ title: 'No settlement record yet', body: 'Commit a clearing round, deliver the funded work, then record realized outcomes once at the horizon.' }),
  );
}

function openSettlementDialog(ctx, report, round) {
  const funded = (round.frozen?.allocations || []).filter((allocation) => allocation.chosenTierIndex > 0);
  const fields = funded.map((allocation) => [allocation.bidderSeatId, allocation, h('input', { class: 'input', type: 'number', min: '0', max: String(CLEARING_LIMITS.valueMax), step: '1', value: '', placeholder: 'realized value', 'aria-label': `Realized value for ${allocation.bidderSeatId}` })]);
  const note = h('textarea', { class: 'input', rows: '3', maxLength: String(CLEARING_LIMITS.noteMax), placeholder: 'Optional settlement note', 'aria-label': 'Settlement note' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const dialog = openModal({
    title: 'Settle one cleared round',
    description: 'Enter the realized common outcome for every funded span. The engine recomputes hurdle status from the frozen allocation; submitted hurdle flags are never trusted.',
    body: h('div', { class: 'stack' },
      banner({ tone: 'warn', title: 'Do not grade a person', body: 'This is an out-of-sample mechanism settlement. A shortfall is a package, evidence or envelope question, never a performance score.' }),
      ...fields.map(([id, allocation, input]) => labelled(`${allocation.tierLabel || allocation.tierKey || 'Funded tier'} · Clarke hurdle τ_i=${allocation.clarkeExternality}`, input, `span ${id}`)),
      labelled('Settlement note', note),
      status),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const result = ctx.api.clearingSettle(round.id, { outcomes: fields.map(([id, , input]) => ({ bidderSeatId: id, realizedValue: Number(input.value) })), note: note.value });
        if (!result.ok) { status.textContent = result.error; return; }
        dialog.close();
        if (notify(result, 'Round settled once; hurdle calibration is now out of sample.')) { go(ctx, 'settlement', round.id); ctx.refresh(); }
      } }, 'Settle once'),
    ],
    size: 'lg',
  });
}

function rollupPanel(report) {
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Identity-free upward roll-up', body: 'The altitude roll-up never prints a title, span name, person name, sealed bid or currency amount. Small cells and pooled rates remain withheld rather than reconstructed.' }),
    card({ title: 'Clearing posture by altitude', body: table({ caption: 'Suppressed-safe Clearinghouse altitude roll-up', columns: [{ label: 'Altitude', render: (row) => row.label }, { label: 'Rank', render: (row) => String(row.rank) }, { label: 'Rounds', render: (row) => row.suppressed ? badge('withheld', 'warn', row.reason) : String(row.roundsN) }, { label: 'Cleared', render: (row) => row.suppressed ? '—' : String(row.clearedN) }, { label: 'Settled', render: (row) => row.suppressed ? '—' : String(row.settledN) }, { label: 'Funded spans', render: (row) => row.suppressed ? '—' : String(row.fundedSpansN) }, { label: 'Hurdle hold', render: (row) => row.refused ? badge('withheld', 'warn', row.reason) : `${row.hurdleHoldPct}% (${row.intervalLowPct}–${row.intervalHighPct}%)` }], rows: report.byAltitude, emptyMessage: 'No altitude cells are in scope.' }) }),
    card({ title: 'Workspace hurdle coverage', body: report.hurdleCoverage.refused ? banner({ tone: 'warn', title: 'WITHHELD', body: report.hurdleCoverage.reason }) : h('p', null, `${report.hurdleCoverage.k}/${report.hurdleCoverage.n} pivotal tranches · ${report.hurdleCoverage.pct}% (Wilson 95% ${report.hurdleCoverage.lowPct}–${report.hurdleCoverage.highPct}%).`) }),
    card({ title: 'Brier calibration', body: report.brierCalibration.refused ? banner({ tone: 'warn', title: 'WITHHELD', body: report.brierCalibration.reason }) : h('p', null, `n=${report.brierCalibration.n}; mean Brier ${report.brierCalibration.meanBrier}; prior reference ${report.brierCalibration.meanReferenceBrier}; skill ${report.brierCalibration.skillPct}%.`) }),
  );
}

function certificatePanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({ title: 'Internal Clearinghouse certificate', subtitle: 'The upward artifact is aggregate-only and refusal-honest.', body: h('div', { class: 'stack' },
      h('p', null, report.premise),
      h('p', null, `Measured ${report.today} at ${report.seat.label}. Subtree rounds: ${report.summary.subtreeRoundsN}; funded span tranches: ${report.summary.fundedSpansN}; shared days: ${report.summary.committedCapacityDays}.`),
      h('p', null, report.hurdleCoverage.refused ? `Clarke hurdle coverage WITHHELD: ${report.hurdleCoverage.reason}` : `Clarke hurdle coverage ${report.hurdleCoverage.pct}% (Wilson 95% ${report.hurdleCoverage.lowPct}–${report.hurdleCoverage.highPct}%).`),
      h('p', { class: 'muted' }, 'Disclosure: no person name, span name, round title, raw note, sibling bid or individual amount appears in the exported certificate.'),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => exportBrief(ctx) }, 'Download brief (Markdown)'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportCsv(ctx) }, 'Download aggregate CSV')),
    ) }),
    card({ title: 'Boundary statements', body: h('ul', { class: 'list' }, h('li', null, report.disclosure.truthfulness), h('li', null, report.disclosure.personNeutral), h('li', null, report.disclosure.currency), h('li', null, report.disclosure.determinacy)) }),
  );
}

function conventionsPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({ title: 'Shared conventions', subtitle: 'These are management bounds, not hidden solver defaults.', body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' }, stat({ label: 'Cell floor', value: report.conventions.clearingCellFloor }), stat({ label: 'Review days', value: report.conventions.clearingReviewDays }), stat({ label: 'Combinations', value: report.conventions.clearingMaxCombinations }), stat({ label: 'Node budget', value: report.conventions.clearingNodeBudget })),
      h('p', null, `Mix imbalance: ${report.conventions.clearingMixImbalanceHighPct}% high / ${report.conventions.clearingMixImbalanceLowPct}% low. Automatic propagation: ${report.conventions.clearingAutoPropagate ? 'on' : 'off'}.`),
      report.seat.canGovernConventions ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openConventionsDialog(ctx, report) }, 'Edit conventions') : h('p', { class: 'muted' }, 'Director rank and above governs these conventions.'),
    ) }),
    card({ title: 'Mechanism frameworks', body: h('div', { class: 'stack' }, ...report.frameworks.map((framework) => h('div', { class: 'stack' }, h('p', null, h('strong', null, framework.label), ' — ', framework.citation), h('p', { class: 'muted' }, framework.summary)))) }),
  );
}

export function renderClearing(ctx) {
  const panel = panelFor(ctx.query);
  const roundId = ctx.query?.get?.('round') || null;
  const report = ctx.api.clearingRead(roundId);
  if (!report?.ok) return h('div', { class: 'stack' }, emptyState({ title: 'The Clearinghouse reading could not be built', body: report?.error || 'No report is available.' }));
  const body = panel === 'desk' ? deskPanel(ctx, report)
    : panel === 'rounds' ? roundsPanel(ctx, report)
      : panel === 'settlement' ? settlementPanel(ctx, report)
        : panel === 'rollup' ? rollupPanel(report)
          : panel === 'conventions' ? conventionsPanel(ctx, report)
            : certificatePanel(ctx, report);
  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Internal resource market',
      title: 'Internal Clearinghouse',
      subtitle: 'Sealed span bids, exact combinatorial clearing across budget and shared capacity, Clarke pivot hurdles, out-of-sample settlement and an identity-free upward certificate.',
      actions: [badge(`${report.summary.visibleRoundsN} visible round(s)`, 'neutral'), report.summary.hurdleDeficitsN ? badge(`${report.summary.hurdleDeficitsN} hurdle deficit(s)`, 'bad') : badge('no hurdle deficit', 'good')],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS, active: panel, onSelect: (key) => go(ctx, key, roundId || '') , ariaLabel: 'Clearinghouse panels' }),
    body,
  );
}
