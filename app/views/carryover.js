/**
 * app/views/carryover.js — Hoshin Carryover Terminal
 * (`#/carryover`, Session 128, Schema v94, ADR-0088).
 * (`#/carryover`, Session 125, Schema v91, ADR-0089).
 *
 * Five role-tiered panels across all five organizational altitudes:
 *   1. Settlement queue (`queue`): every pact settled as thesis-invalidated
 *      without a settlement verdict — the invalidated pact, the bet it
 *      challenges, the resource bundle it encumbered, and the governed
 *      settle/retire/revise/reaffirm decision. Frontline and manager altitude.
 *   2. Bets & stop rules (`bets`): the bet-level view — kill criterion, date,
 *      overdue state, verdict, and attached invalidations. Director altitude.
 *   3. Resources & next cycle (`resources`): the encumbered bundles, what a
 *      release does, and the released person-days and budget authority printed
 *      as supply for the NEXT allocation cycle. VP altitude.
 *   4. Calibration (`calibration`): once-only later grades — Wilson 95%
 *      intervals, strictly-prior Brier skill, pooled base rate, floor breaches.
 *   5. Executive brief (`brief`): identity-free Markdown brief and the
 *      aggregate-only CSV export. CEO altitude.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import {
  pageHeader,
  card,
  stat,
  badge,
  banner,
  tabs,
  emptyState,
  kv,
  table,
} from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  CARRYOVER_STATUS_LABELS,
  CARRYOVER_VERDICT_KEYS,
  CARRYOVER_SETTLEMENT_VERDICTS,
  CARRYOVER_RELEASE_LABELS,
} from '../core/domain/carryoverRegistry.js';

const PANELS = ['queue', 'bets', 'resources', 'calibration', 'brief'];
const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.includes(p) ? p : 'queue';
};
const go = (ctx, panel) => ctx.navigate(`#/carryover?panel=${panel}`);
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const fmtMoney = (cur, amt) => (amt === null || amt === undefined ? '—' : `${cur || '—'} ${amt}`);

const verdictLabel = (key) => CARRYOVER_SETTLEMENT_VERDICTS.find((v) => v.key === key)?.label || key || '—';
const statusBadge = (status) => badge(
  CARRYOVER_STATUS_LABELS[status] || status,
  status === 'settled-released' ? 'good' : status === 'pending-settlement' ? 'warn' : 'neutral',
);

function seatContext(ctx) {
  const seat = ctx?.seatContext?.seat;
  if (!seat) return { rank: 5, disclosure: 'aggregate', fullAccess: true };
  const rank = seat.rank ?? 2;
  return { rank, disclosure: rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate', fullAccess: Boolean(seat.fullAccess), seat };
}

function resolveDialog(ctx, view, row) {
  const decision = view.decision;
  const note = h('textarea', { id: 'co-note', class: 'input', rows: 3, maxlength: 500 }, '');
  const forecast = h('input', { id: 'co-forecast', class: 'input', type: 'number', min: '0', max: '100', step: '1', placeholder: 'optional: settlement forecast %' });
  const body = h('div', { class: 'stack' },
    kv('Invalidated pact', row.title),
    kv('Bet', view.bet ? view.bet.title : 'Unresolved — settlement refused, not guessed'),
    kv('Stop-rule state', view.betState.stateLabel),
    kv('Resources', `${view.resource.effortDays} person-day(s)${view.resource.committedAmount !== null ? `, ${fmtMoney(view.resource.currency, view.resource.committedAmount)}` : ''}`),
    decision ? h('details', null,
      h('summary', null, 'The governed question'),
      h('p', { class: 'muted' }, decision.question),
    ) : null,
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Your rationale'), note),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Settlement forecast (optional)'), forecast),
    ),
    h('p', { class: 'muted' }, 'A retire verdict releases the encumbered budget line and returns the person-day commitment in the same transaction. The app never retires a bet by itself.'),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      ...CARRYOVER_SETTLEMENT_VERDICTS.map((v) => h('button', {
        class: `btn ${v.key === 'retire-bet' ? 'btn-danger' : 'btn-primary'}`,
        type: 'button',
        onClick: () => {
          const forecastValue = forecast.value === '' ? undefined : Number(forecast.value);
          const result = ctx.api.carryoverResolveSettlement(row.id, {
            chosen: v.label,
            rationale: note.value,
            ...(forecastValue !== undefined && Number.isFinite(forecastValue) ? { forecastProbability: forecastValue } : {}),
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          closeAllModals();
          toast(`Settlement recorded: ${v.label}. Resources released in the same transaction.`, 'good');
          ctx.refresh();
        },
      }, v.label)),
    ),
  );
  openModal({ title: `Settle “${row.title.slice(0, 60)}”`, body, size: 'lg' });
}

function queuePanel(ctx, r) {
  const c = r.counts;
  const sctx = seatContext(ctx);
  const pendingViews = [...r.pending, ...r.uncovered];
  const rows = pendingViews.map((v) => {
    const isUncovered = Boolean(v.pact);
    return {
      id: isUncovered ? `unc-${v.pact.id}` : v.record.id,
      title: v.title,
      bet: v.bet ? v.bet.title : 'Unresolved',
      betState: v.betState.stateLabel,
      effortDays: isUncovered ? v.resource.effortDays : v.resource.effortDays,
      money: isUncovered ? v.resource : v.resource,
      decisionOpen: isUncovered ? false : v.decisionOpen,
      record: isUncovered ? null : v.record,
    };
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Invalidated pacts', value: c.invalidated, hint: 'settled thesis-invalidated' }),
      stat({ label: 'Awaiting settlement', value: c.decisionDue + c.uncovered, hint: 'no stop-rule verdict yet' }),
      stat({ label: 'Releases due', value: c.releaseDue, hint: 'encumbered, settled as retire' }),
      stat({ label: 'Released to next cycle', value: `${c.released} · ${r.nextCycle.totals.effortDays}d`, hint: 'person-days returned' }),
    ),
    c.uncovered ? banner({
      tone: 'warn',
      title: `${c.uncovered} invalidated pact(s) are not carried over yet`,
      body: 'The settlement spine creates one record and one governed decision per invalidated pact automatically — run a scan to catch anything that landed outside a live session.',
      actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
        const result = ctx.api.carryoverScan();
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast('Carryover scan complete — records and decisions written in one transaction.', 'good');
        ctx.refresh();
      } }, 'Run settlement scan')],
    }) : null,
    rows.length ? table({
      columns: [
        { label: 'Settlement queue', render: (row) => h('div', { class: 'stack-tight' },
          h('strong', null, row.title),
          row.record ? statusBadge(row.record.status) : badge('not carried over', 'warn')) },
        { label: 'Bet', render: (row) => row.bet },
        { label: 'Stop-rule state', render: (row) => row.betState },
        { label: 'Encumbered', render: (row) => `${row.effortDays}d${row.money.committedAmount !== null ? ` · ${fmtMoney(row.money.currency, row.money.committedAmount)}` : ''}` },
        { label: 'Action', render: (row) => (row.decisionOpen || row.record)
          ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
            const view = isUncovered(row) ? r.uncovered.find((v) => v.pact && v.pact.id === row.id.replace('unc-', '')) : r.pending.find((v) => v.record.id === row.id);
            resolveDialog(ctx, view || {}, { id: row.record ? row.record.id : row.id, title: row.title });
          } }, 'Resolve settlement')
          : h('span', { class: 'muted' }, 'auto-carried on next scan') },
      ],
      rows,
    }) : emptyState({ title: 'No settlements are waiting.', body: 'When a Catchball pact settles as thesis-invalidated, its bet appears here with the resources it encumbered and one governed decision.' }),
    h('p', { class: 'muted' }, `Disclosure at this altitude: ${sctx.disclosure}. Settlements at higher altitudes are rolled up to your span automatically.`),
  );
}

function isUncovered(row) {
  return String(row.id).startsWith('unc-');
}

function betsPanel(ctx, r) {
  const sctx = seatContext(ctx);
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Bets under invalidation pressure',
      body: 'Each row is a Breakthrough Bet with at least one thesis-invalidated pact attached. The stop-rule state is printed as recorded — a bet without a dated kill criterion says so instead of looking fine.',
    }),
    r.bets.length ? table({
      columns: [
        { label: 'Bet', render: (b) => h('div', { class: 'stack-tight' },
          h('strong', null, b.bet.title),
          b.betState.hasStopRule
            ? `${b.betState.metric || 'metric'} ${b.betState.direction === 'above' ? 'above' : 'below'} ${b.betState.threshold ?? 'threshold'} · due ${formatDate(b.betState.checkOn)}`
            : badge('no dated stop rule', 'warn')) },
        { label: 'Owner', render: (b) => (sctx.disclosure === 'names' ? (b.betOwner ? b.betOwner.name : '—') : (b.betAltitude ? b.betAltitude.label : '—')) },
        { label: 'Stop rule', render: (b) => b.betState.stateLabel },
        { label: 'Verdict / state', render: (b) => b.betState.verdictRecorded
          ? badge(`${b.betState.verdict} · ${formatDate(b.betState.verdictRecordedOn)}`, 'good')
          : b.betState.retired
            ? badge('retired', 'neutral')
            : b.betState.stopRulePassed
              ? badge('due — no verdict', 'bad')
              : badge('pending', 'neutral') },
        { label: 'Invalidated pacts', render: (b) => `${b.invalidatedPacts}` },
        { label: 'Encumbered', render: (b) => `${b.encumberedDays} person-day(s)` },
      ],
      rows: r.bets,
    }) : emptyState({ title: 'No bet carries an invalidation.', body: 'Thesis-invalidated pacts attach to the bet they deployed — via the pact’s bet link, its goal tag, its trade-off tag or its premise chain.' }),
  );
}

function resourcesPanel(ctx, r) {
  const sctx = seatContext(ctx);
  return h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Next-cycle person-days', value: r.nextCycle.totals.effortDays, hint: 'released, available again' }),
      stat({ label: 'Next-cycle records', value: r.nextCycle.totals.records, hint: 'settlements released' }),
      stat({ label: 'Still encumbered', value: r.releaseDue, hint: 'settled retire, awaiting release' }),
      stat({ label: 'Withheld', value: r.withheld, hint: 'release refused in writing' }),
    ),
    banner({ tone: 'info', title: 'What the next allocation cycle sees', body: r.nextCycle.note }),
    r.nextCycle.byBudget.length ? table({
      columns: [
        { label: 'Funding envelope', render: (v) => v.budgetName || v.budgetId || '—' },
        { label: 'Currency', render: (v) => v.currency || '—' },
        { label: 'Released person-days', render: (v) => v.effortDays },
        { label: 'Released amount', render: (v) => fmtMoney(v.currency, v.amount) },
        { label: 'Records', render: (v) => v.records },
      ],
      rows: r.nextCycle.byBudget,
    }) : emptyState({ title: 'Nothing released yet.', body: 'A retire settlement releases the encumbered budget line (committed → released) and returns the person-day commitment in the same transaction.' }),
    r.released.length ? h('div', { class: 'stack' },
      h('h3', null, 'Released settlements'),
      ...r.released.map((v) => card({
        title: v.title,
        subtitle: `settled ${formatDate(v.record.settledOn)} · released ${formatDate(v.record.releasedOn)}`,
        actions: [badge(CARRYOVER_RELEASE_LABELS[v.record.releaseOutcome] || v.record.releaseOutcome, 'good')],
        body: h('div', { class: 'stack-tight' },
          kv('Resources', `${v.resource.effortDays} person-day(s)${v.resource.committedAmount !== null ? ` · ${fmtMoney(v.resource.currency, v.resource.committedAmount)}` : ''}`),
          kv('Funding envelope', v.resource.budgetName || v.resource.budgetId || '—'),
        ),
      })),
    ) : null,
  );
}

function calibrationPanel(ctx, r) {
  const cal = r.calibration;
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Settlement calibration — graded once, later',
      body: `Each settled record is graded once against the prediction frozen when its decision was opened (${cal.conventions.gradingDelayDays}-day delay). Wilson 95% intervals; rates refused below n=${cal.conventions.cellFloor}. Brier skill is strictly-prior and read against the pooled base rate.`,
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Pooled hold rate', value: cal.workspace.refused ? 'refused' : fmtPct(cal.workspace.baseRatePct), hint: `${cal.workspace.settledN}/${cal.workspace.n} settled in window` }),
      stat({ label: 'Graded records', value: cal.workspace.graded, hint: 'once-only, immutable' }),
      stat({ label: 'Floor breaches', value: cal.cells.filter((c) => c.belowFloor).length, hint: 'cells below reliability floor' }),
    ),
    cal.cells.length ? table({
      columns: [
        { label: 'Altitude', render: (c) => c.label },
        { label: 'Trials', render: (c) => c.n },
        { label: 'Settled', render: (c) => c.settledN },
        { label: 'Hold rate', render: (c) => (c.refused ? badge('refused', 'neutral') : fmtPct(c.holdRatePct)) },
        { label: 'Wilson 95%', render: (c) => (c.wilsonLo !== null ? `${c.wilsonLo}–${c.wilsonHi}%` : '—') },
        { label: 'Brier', render: (c) => (c.brier === null ? '—' : c.brier.toFixed(3)) },
        { label: 'Skill', render: (c) => (c.skill === null ? '—' : (c.skill >= 0 ? `+${c.skill}` : c.skill).toFixed(3)) },
      ],
      rows: cal.cells,
    }) : emptyState({ title: 'No cell has reached the grading floor yet.', body: `Settled records become gradable after ${cal.conventions.gradingDelayDays} days; cells print counts only below n=${cal.conventions.cellFloor}.` }),
    h('p', { class: 'muted' }, 'A cell below the reliability floor opens ONE governed review decision per ISO week — never an automatic correction.'),
  );
}

function briefPanel(ctx, r) {
  const text = ctx.api.carryoverBriefText();
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Executive brief — identity-free',
      body: 'No bet titles, pact titles, names, budget names or record ids. Counts, intervals and released-capacity totals only. Safe to attach to a board pack.',
    }),
    card({
      title: 'Markdown brief',
      body: h('pre', { class: 'pre' }, text),
      actions: [
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
          downloadText({ filename: `leados-carryover-brief-${r.today}.md`, text, mime: 'text/markdown' });
          toast('Brief downloaded.', 'good');
        } }, 'Download brief'),
      ],
    }),
    card({
      title: 'Aggregate CSV (scope #80)',
      body: h('p', { class: 'muted' }, 'Counts, next-cycle released capacity and altitude calibration cells. Refused rates are blank, never zero.'),
      actions: [
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
          const result = ctx.api.exportWorkspaceCsv('carryover-settlement');
          if (!result.ok) { toast(result.error, 'bad'); return; }
          downloadText({ filename: result.filename, text: result.csv, mime: 'text/csv' });
          toast(`CSV exported: ${result.label} (${result.rowCount} rows).`, 'good');
        } }, 'Download CSV'),
      ],
    }),
  );
}

export function renderCarryover(ctx) {
  const panel = panelFor(ctx.query);
  const r = ctx.api.carryoverReport();
  // ADR-0089: a typed `carries-over` / `settles` edge lands on THIS record, not
  // just on the terminal. The query carries a record id and nothing else — no
  // free text travels in the URL — so a focused card is rendered only when the
  // id resolves to a record this seat can already see.
  const focusId = typeof ctx.query?.record === 'string' ? ctx.query.record : '';
  const focusView = focusId
    ? (r.records || []).find((v) => v.record && v.record.id === focusId)
    : null;
  const header = pageHeader({
    title: 'Hoshin Carryover',
    subtitle: 'A thesis-invalidated pact settles the bet it deployed: stop rule judged, encumbered person-days and budget released into the next allocation cycle.',
    actions: [
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => {
        const result = ctx.api.carryoverScan();
        if (!result.ok) { toast(result.error, 'bad'); return; }
        toast('Carryover scan complete.', 'good');
        ctx.refresh();
      } }, 'Scan'),
    ],
  });
  const body = panel === 'queue' ? queuePanel(ctx, r)
    : panel === 'bets' ? betsPanel(ctx, r)
      : panel === 'resources' ? resourcesPanel(ctx, r)
        : panel === 'calibration' ? calibrationPanel(ctx, r)
          : briefPanel(ctx, r);
  return h('div', { class: 'view' },
    header,
    focusView ? card({ title: 'Focused carryover record', subtitle: focusView.title || focusView.record.id },
      h('p', null, `${focusView.record.status.replace(/-/g, ' ')} · bet ${focusView.bet ? focusView.bet.title : 'unresolved'} · ${focusView.resource.effortDays}d encumbered.`),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => { ctx.go('#/carryover?panel=queue'); } }, 'Clear focus'))
      : null,
    tabs({
      items: [
        { key: 'queue', label: 'Settlement queue', count: r.counts.decisionDue || undefined },
        { key: 'bets', label: 'Bets & stop rules' },
        { key: 'resources', label: 'Resources & next cycle' },
        { key: 'calibration', label: 'Calibration' },
        { key: 'brief', label: 'Executive brief' },
      ],
      active: panel,
      onSelect: (key) => go(ctx, key),
    }),
    body,
  );
}
