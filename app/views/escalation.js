/**
 * app/views/escalation.js — the Escalation Economy Terminal
 * (`#/escalation`, Session 125, Schema v91, ADR-0085).
 *
 * Five role-tiered panels across all five organizational altitudes:
 *   1. Ledger (`ledger`): log one decision moment as absorbed or escalated,
 *      with the reason vocabulary that makes the incentive visible, plus the
 *      Oncken & Wass monkey ledger of what is sitting above where it arose.
 *   2. Queue (`queue`): each receiving span as an M/M/1 service station —
 *      arrivals, utilisation, Kingman-bounded waiting time, absorption
 *      headroom, and a refusal instead of a large number when ρ ≥ 1.
 *   3. Yield (`yield`): escalation rate and escalation yield with Wilson
 *      intervals, the pure-overhead verdict, the declared tax, and Shannon's
 *      surviving mutual information per rung crossed.
 *   4. Authority (`authority`): Aghion–Tirole de facto centralisation against
 *      a declared intervention-rate commitment, the subsidiarity index per
 *      decision class, and freeze-then-grade-once commitment calibration.
 *   5. Brief (`brief`): identity-free Markdown brief and aggregate CSV.
 *
 * Accessibility: every control is a real button or labelled field, panels are
 * a tablist, figures carry their interval and their floor, and a refused
 * figure reads "withheld" rather than 0.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
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
import { dayKey, formatDate } from '../core/time.js';
import {
  ESCALATION_PANELS,
  ESCALATION_REASON_LABELS,
  ESCALATION_REASONS,
  RESOLUTION_LABELS,
  RESOLUTIONS,
  VERDICT_LABELS,
} from '../core/domain/escalationRegistry.js';

const panelFor = (query) => {
  const p = query?.get?.('panel');
  return ESCALATION_PANELS.includes(p) ? p : 'ledger';
};

const go = (ctx, panel, extra = '') => ctx.navigate(`#/escalation?panel=${panel}${extra}`);

const fmtPct = (v) => (v === null || v === undefined ? 'withheld' : `${v}%`);
const fmtNum = (v) => (v === null || v === undefined ? 'withheld' : String(v));
const fmtInterval = (w) => (w?.pct === null || w?.pct === undefined
  ? 'withheld'
  : `${w.pct}% (95% CI ${w.lo}–${w.hi}%, n=${w.n})`);

const toneFor = (verdict) => ({
  insufficient: 'neutral',
  'escalation-market-healthy': 'good',
  'decided-where-it-arose': 'good',
  'within-commitment': 'good',
  'over-escalating': 'caution',
  'below-commitment': 'caution',
  'queue-saturated': 'caution',
  'under-escalating': 'caution',
  'pure-overhead': 'bad',
  'de-facto-centralised': 'bad',
  'de-facto-decentralised': 'bad',
  'above-commitment': 'bad',
  'queue-unstable': 'bad',
  unmeasured: 'neutral',
}[verdict] || 'neutral');

const altShort = (key) => ({
  frontline: 'Frontline (7d)',
  manager: 'Manager (30d)',
  director: 'Director (90d)',
  exec: 'Executive (180d)',
  chief: 'Chief / CEO (365d)',
}[key] || key || '—');

function field(label, control, hint = '') {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

export function renderEscalation(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const focusRecordId = ctx.query?.get?.('record') || null;
  const focusCommitmentId = ctx.query?.get?.('commitment') || null;

  const report = ctx.api.escalationRead();
  if (!report || report.error) {
    return h('div', { class: 'page' },
      pageHeader({ title: 'Escalation Economy' }),
      banner({ tone: 'bad', title: 'This surface is unavailable', body: report?.error || 'The escalation read was refused.' }),
    );
  }
  const conv = report.conventions;
  const totals = report.totals;
  const cal = report.calibration;

  const activePeople = (ctx.state.people || []).filter((p) => p && p.status !== 'archived');
  const records = Array.isArray(ctx.state.escalationRecords) ? ctx.state.escalationRecords : [];
  const commitments = Array.isArray(ctx.state.escalationCommitments) ? ctx.state.escalationCommitments : [];

  /* ------------------------------------------------------------------ actions */
  const runScan = () => {
    const res = ctx.api.escalationScan();
    toast(
      res.ok
        ? `Escalation spine reconciled (${res.propagations?.length || 0} propagation(s)).`
        : (res.error || 'Escalation scan failed.'),
      res.ok ? 'good' : 'bad',
    );
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const text = ctx.api.escalationBriefText();
    const ok = downloadText({ filename: `leados-escalation-brief-${dayKey(now)}.md`, text, mime: 'text/markdown;charset=utf-8' });
    toast(ok ? 'Identity-free escalation brief downloaded.' : 'Download unavailable — read the brief text below.', ok ? 'good' : 'warn');
  };

  const downloadCsv = () => {
    const rows = ctx.api.escalationCsvRows();
    if (!Array.isArray(rows)) {
      toast(rows?.error || 'CSV export refused under the current seat.', 'bad');
      return;
    }
    const csv = serializeCsv(rows);
    const ok = downloadText({ filename: `leados-escalation-economy-${dayKey(now)}.csv`, text: csv, mime: 'text/csv;charset=utf-8' });
    toast(ok ? 'Aggregate-only CSV (#80) downloaded.' : 'Download unavailable.', ok ? 'good' : 'bad');
  };

  const openLogModal = () => {
    const form = {
      title: '',
      disposition: 'escalated',
      toSeatId: '',
      reasonKey: 'authority',
      decisionClass: '',
      proposedAction: '',
      effortHours: '',
    };
    const body = h(
      'div',
      { class: 'form-grid' },
      field('What arose?', h('input', {
        class: 'input', type: 'text', value: form.title, maxlength: '180',
        'data-testid': 'escalation-title',
        onInput: (e) => { form.title = e.target.value; },
      }), 'The decision moment, in your own words. Not a verdict on anyone.'),
      field('Absorbed or escalated?', h('select', {
        class: 'input', 'data-testid': 'escalation-disposition',
        onChange: (e) => {
          form.disposition = e.target.value;
          rerender();
        },
      }, h('option', { value: 'escalated' }, 'Escalated upward'),
        h('option', { value: 'absorbed' }, 'Absorbed and decided here')),
      'Every decision moment is one of these two. The ledger has no third state.'),
      form.disposition === 'escalated'
        ? field('Escalated to', h('select', {
          class: 'input', 'data-testid': 'escalation-to-seat',
          onChange: (e) => { form.toSeatId = e.target.value; },
        }, h('option', { value: '' }, 'Choose a receiving span…'),
          ...activePeople.map((p) => h('option', { value: p.id }, p.name))),
        'The span that can actually decide it.')
        : null,
      field('Why?', h('select', {
        class: 'input', 'data-testid': 'escalation-reason',
        onChange: (e) => { form.reasonKey = e.target.value; },
      }, ...ESCALATION_REASONS.map((k) => h('option', { value: k }, ESCALATION_REASON_LABELS[k]))),
      '“I want cover” and “I lack the bandwidth” are counted as defensive — Holmström & Milgrom (1991): an unmeasured task starves.'),
      field('Decision class', h('input', {
        class: 'input', type: 'text', value: form.decisionClass, maxlength: '60', placeholder: 'general',
        onInput: (e) => { form.decisionClass = e.target.value; },
      }), 'Group related decisions so subsidiarity can be measured per class.'),
      form.disposition === 'escalated'
        ? field('What did you propose?', h('input', {
          class: 'input', type: 'text', value: form.proposedAction, maxlength: '240',
          onInput: (e) => { form.proposedAction = e.target.value; },
        }), 'Recorded now so the escalation yield later compares the answer against it.')
        : null,
      form.disposition === 'escalated'
        ? field('Hours it cost the receiving span (optional)', h('input', {
          class: 'input', type: 'number', min: '0', step: '0.25', value: form.effortHours,
          onInput: (e) => { form.effortHours = e.target.value; },
        }), `Blank uses the declared ${conv.escalationHoursPerEscalation} h default.`)
        : null,
    );
    const rerender = () => {
      const mount = document.getElementById('escalation-log-body');
      if (mount) { mount.innerHTML = ''; mount.appendChild(body); }
    };
    openModal({
      title: 'Log a decision moment',
      description: 'One row per decision: absorbed where it arose, or escalated upward. Nothing is inferred, and no one is rated.',
      body: h('div', { id: 'escalation-log-body' }, body),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary', type: 'button', 'data-testid': 'escalation-log-submit',
          onClick: () => {
            const res = ctx.api.escalationLog({
              title: form.title,
              disposition: form.disposition,
              toSeatId: form.disposition === 'escalated' ? form.toSeatId : null,
              reasonKey: form.reasonKey,
              decisionClass: form.decisionClass,
              proposedAction: form.proposedAction,
              effortHours: form.effortHours === '' ? null : Number(form.effortHours),
            });
            if (!res.ok) { toast(res.error, 'bad'); return; }
            closeAllModals();
            toast('Decision moment recorded on the escalation ledger.', 'good');
            ctx.refresh();
          },
        }, 'Record it'),
      ],
    });
  };

  const openSettleModal = (rec) => {
    const form = { resolution: 'endorsed', outcomeDiffers: null, effortHours: rec.effortHours ?? '' };
    const body = h(
      'div',
      { class: 'form-grid' },
      h('p', { class: 'muted' }, `“${rec.title}” — settled by the span that received it.`),
      field('How did the receiving span resolve it?', h('select', {
        class: 'input', 'data-testid': 'escalation-resolution',
        onChange: (e) => { form.resolution = e.target.value; rerender(); },
      }, ...RESOLUTIONS.map((k) => h('option', { value: k }, RESOLUTION_LABELS[k])))),
      form.resolution !== 'returned'
        ? field('Did the decision differ from what was proposed?', h('select', {
          class: 'input', 'data-testid': 'escalation-outcome-differs',
          onChange: (e) => { form.outcomeDiffers = e.target.value === 'true'; },
        }, h('option', { value: '' }, 'Choose…'),
          h('option', { value: 'true' }, 'Yes — the answer changed'),
          h('option', { value: 'false' }, 'No — the proposal was endorsed')),
        'This is the one input the escalation yield rests on. It is a human judgement and is never inferred from text.')
        : null,
      field('Hours it cost (optional)', h('input', {
        class: 'input', type: 'number', min: '0', step: '0.25', value: form.effortHours,
        onInput: (e) => { form.effortHours = e.target.value; },
      })),
    );
    const rerender = () => {
      const mount = document.getElementById('escalation-settle-body');
      if (mount) { mount.innerHTML = ''; mount.appendChild(body); }
    };
    openModal({
      title: 'Settle this escalation',
      description: 'Only the span that received the item can settle it. An ancestor settling on a receiver’s behalf would make the yield self-reported.',
      body: h('div', { id: 'escalation-settle-body' }, body),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const res = ctx.api.escalationSettle(rec.id, {
              resolution: form.resolution,
              outcomeDiffers: form.outcomeDiffers,
              effortHours: form.effortHours === '' ? null : Number(form.effortHours),
            });
            if (!res.ok) { toast(res.error, 'bad'); return; }
            closeAllModals();
            toast('Escalation settled.', 'good');
            ctx.refresh();
          },
        }, 'Settle it'),
      ],
    });
  };

  const openCommitmentModal = () => {
    const form = { spanId: '', decisionClass: '', rate: '', budget: '', forecast: '' };
    const body = h(
      'div',
      { class: 'form-grid' },
      h('p', { class: 'muted' },
        'Aghion & Tirole (1997): delegation is only credible when the principal commits to a bounded intervention rate. Declare the ceiling, then let it be graded.'),
      field('Which span is committing?', h('select', {
        class: 'input', 'data-testid': 'escalation-commit-span',
        onChange: (e) => { form.spanId = e.target.value; },
      }, h('option', { value: '' }, 'Choose a span…'),
        ...activePeople.map((p) => h('option', { value: p.id }, p.name)))),
      field('Decision class', h('input', {
        class: 'input', type: 'text', value: form.decisionClass, maxlength: '60', placeholder: '* (all classes)',
        onInput: (e) => { form.decisionClass = e.target.value; },
      })),
      field('Intervention-rate ceiling (%)', h('input', {
        class: 'input', type: 'number', min: '0', max: '100', step: '1', value: form.rate,
        onInput: (e) => { form.rate = e.target.value; },
      }), 'The most this span will intervene, in writing.'),
      field('Escalation budget (items)', h('input', {
        class: 'input', type: 'number', min: '0', step: '1', value: form.budget,
        onInput: (e) => { form.budget = e.target.value; },
      })),
      field('Your probability it holds (0–100)', h('input', {
        class: 'input', type: 'number', min: '0', max: '100', step: '1', value: form.forecast,
        onInput: (e) => { form.forecast = e.target.value; },
      }), 'Frozen now and graded once, out of sample, with a Brier score.'),
    );
    openModal({
      title: 'Declare an intervention-rate commitment',
      description: 'A bounded promise to intervene less, so the levels below have a reason to gather information and decide.',
      body,
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const res = ctx.api.escalationDeclareCommitment({
              spanId: form.spanId,
              decisionClass: form.decisionClass || '*',
              committedInterventionRatePct: Number(form.rate),
              committedEscalationBudget: Number(form.budget),
              forecastPct: Number(form.forecast),
            });
            if (!res.ok) { toast(res.error, 'bad'); return; }
            closeAllModals();
            toast('Commitment declared and frozen.', 'good');
            ctx.refresh();
          },
        }, 'Declare it'),
      ],
    });
  };

  /* ------------------------------------------------------------- panel: ledger */
  const ledgerPanel = () => {
    const open = records.filter((r) => r.disposition === 'escalated' && (r.status === 'open' || r.status === 'received'));
    return h(
      'div',
      { class: 'stack' },
      card({
        title: 'Log a decision moment',
        subtitle: 'One row per decision: absorbed where it arose, or escalated upward. The reason vocabulary is what makes the incentive visible.',
        actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: openLogModal, 'data-testid': 'escalation-log' }, 'Log it')],
        body: h(
          'div',
          { class: 'stat-grid' },
          stat({ label: 'Recorded this window', value: String(totals.records), hint: `${conv.escalationWindowDays} days from ${report.windowStart}` }),
          stat({ label: 'Absorbed where they arose', value: String(totals.absorbed), tone: totals.absorbed >= totals.escalated ? 'good' : '' }),
          stat({ label: 'Escalated upward', value: String(totals.escalated) }),
          stat({ label: 'Defensive (cover / capacity)', value: String(totals.defensiveN), hint: totals.defensivePct === null ? 'withheld' : `${totals.defensivePct}% of escalations`, tone: totals.defensiveN ? 'caution' : '' }),
        ),
      }),
      report.monkeys.total
        ? card({
          title: 'The monkey ledger',
          subtitle: 'Oncken & Wass (1974): a problem that migrates onto the manager’s back is then fed by the manager. Return it with the authority to decide, not with an answer.',
          body: h(
            'div',
            { class: 'stack' },
            h('div', { class: 'stat-grid' },
              stat({ label: 'Open escalations', value: String(report.monkeys.total) }),
              stat({
                label: `Past the ${report.monkeys.returnWindowDays}-day return window`,
                value: String(report.monkeys.overReturnWindow.length),
                tone: report.monkeys.overReturnWindow.length ? 'bad' : 'good',
              }),
              stat({ label: 'Distinct senders', value: String(report.monkeys.bySender.length) }),
            ),
            table({
              caption: 'Open escalations grouped by the span they came from',
              columns: [
                { key: 'from', label: 'Came from', render: (row) => row.label },
                { key: 'count', label: 'Open items', render: (row) => String(row.count) },
                { key: 'oldest', label: 'Oldest (days)', render: (row) => String(row.oldestDays) },
              ],
              rows: report.monkeys.bySender.map((m) => ({
                ...m,
                className: m.oldestDays > report.monkeys.returnWindowDays ? 'is-focused' : '',
              })),
            }),
          ),
        })
        : null,
      card({
        title: 'Escalation ledger',
        subtitle: 'Every decision moment recorded in this workspace. A settled escalation records whether the answer actually changed.',
        body: records.length
          ? table({
            caption: 'Escalation ledger',
            columns: [
              { key: 'title', label: 'Decision moment', render: (row) => row.title },
              { key: 'disposition', label: 'Disposition', render: (row) => badge(row.disposition, row.disposition === 'absorbed' ? 'good' : 'neutral') },
              { key: 'reason', label: 'Reason', render: (row) => ESCALATION_REASON_LABELS[row.reasonKey] || row.reasonKey },
              { key: 'class', label: 'Class', render: (row) => row.decisionClass },
              { key: 'status', label: 'Status', render: (row) => badge(row.status, row.status === 'settled' ? 'good' : row.status === 'returned' ? 'caution' : 'neutral') },
              { key: 'logged', label: 'Logged', render: (row) => formatDate(row.loggedOn) },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => (row.disposition === 'escalated' && ['open', 'received'].includes(row.status)
                  ? h('span', { class: 'row-actions' },
                    h('button', {
                      class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': `escalation-settle-${row.id}`,
                      onClick: () => openSettleModal(row),
                    }, 'Settle'),
                    h('button', {
                      class: 'btn btn-ghost btn-sm', type: 'button',
                      onClick: () => {
                        const res = ctx.api.escalationReturnDown(row.id, {});
                        if (!res.ok) { toast(res.error, 'bad'); return; }
                        toast('Returned downward with authority to decide.', 'good');
                        ctx.refresh();
                      },
                    }, 'Return downward'))
                  : h('span', { class: 'muted' }, row.resolution ? (RESOLUTION_LABELS[row.resolution] || row.resolution) : '—')),
              },
            ],
            rows: records.map((r) => ({ ...r, className: r.id === focusRecordId ? 'is-focused' : '' })),
          })
          : emptyState({
            title: 'No decision moments recorded yet',
            body: 'Nothing is inferred here. Log the first one — absorbed or escalated — and the queue, the yield, the subsidiarity index and the roll-up all begin from it.',
            action: h('button', { class: 'btn btn-primary', type: 'button', onClick: openLogModal }, 'Log the first one'),
          }),
      }),
    );
  };

  /* -------------------------------------------------------------- panel: queue */
  const queuePanel = () => h(
    'div',
    { class: 'stack' },
    banner({
      tone: 'info',
      title: 'A leadership seat is a service station',
      body: `Exact M/M/1 (Erlang) waiting time with Kingman's (1961) G/G/1 variability bound at the declared coefficient of variation (${conv.escalationServiceScv}). When arrivals meet or exceed the declared service rate (${conv.escalationServiceRatePerWeek}/week), ρ ≥ 1 and no finite waiting time exists — the panel refuses the number rather than printing a large one.`,
    }),
    card({
      title: 'Queue integrity by receiving span',
      subtitle: `Arrivals over the last ${conv.escalationWindowDays} days against the declared decision rate. Red floor ${conv.escalationUtilisationRedPct}%.`,
      body: report.seatRows.length
        ? table({
          caption: 'Queue integrity by receiving span',
          columns: [
            { key: 'label', label: 'Receiving span', render: (row) => row.label },
            { key: 'alt', label: 'Altitude', render: (row) => altShort(row.altitudeKey) },
            { key: 'received', label: 'Received', render: (row) => String(row.receivedN) },
            { key: 'arr', label: 'λ / week', render: (row) => fmtNum(row.queue?.arrivalsPerWeek) },
            { key: 'rho', label: 'Utilisation ρ', render: (row) => (row.queue?.utilisationPct === null ? 'withheld' : `${row.queue.utilisationPct}%`) },
            {
              key: 'wait',
              label: 'Expected wait (days)',
              render: (row) => (row.queue?.waitDaysLo === null
                ? h('span', { class: 'muted', title: row.queue?.reason || '' }, 'refused — queue unstable')
                : `${row.queue.waitDaysLo}–${row.queue.waitDaysHi}`),
            },
            { key: 'headroom', label: 'Headroom / week', render: (row) => fmtNum(row.queue?.headroomPerWeek) },
            {
              key: 'state',
              label: 'State',
              render: (row) => badge(row.queue?.state || '—', row.queue?.state === 'stable' ? 'good' : row.queue?.state === 'saturated' ? 'caution' : 'bad'),
            },
          ],
          rows: report.seatRows,
        })
        : emptyState({ title: 'No receiving span has recorded arrivals yet' }),
    }),
    card({
      title: 'What the declared conventions are',
      body: h('div', { class: 'kv-grid' },
        kv('Service rate (decisions/week)', String(conv.escalationServiceRatePerWeek)),
        kv('Variability (cᵥ)', String(conv.escalationServiceScv)),
        kv('Utilisation red floor', `${conv.escalationUtilisationRedPct}%`),
        kv('Window', `${conv.escalationWindowDays} days`),
        kv('Evidence floor', String(conv.escalationFloorN)),
        kv('Small-cell floor', String(conv.escalationCellFloor)),
      ),
    }),
  );

  /* -------------------------------------------------------------- panel: yield */
  const yieldPanel = () => h(
    'div',
    { class: 'stack' },
    totals.verdict === 'pure-overhead'
      ? banner({
        tone: 'bad',
        title: 'Escalation is pure overhead here',
        body: `Yield is ${fmtPct(totals.yield?.pct)} against a declared floor of ${conv.escalationYieldFloorPct}%. Aghion & Tirole (1997): a principal who intervenes without changing the outcome removes the agent's reason to gather information, at no benefit to anyone.`,
        actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(ctx, 'authority') }, 'Declare an intervention-rate commitment')],
      })
      : null,
    card({
      title: 'What escalation bought',
      subtitle: 'A rate says how often you escalate. The yield says whether it was worth it.',
      body: h(
        'div',
        { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Escalation rate', value: fmtPct(totals.escalationRate?.pct), hint: `95% CI ${fmtNum(totals.escalationRate?.lo)}–${fmtNum(totals.escalationRate?.hi)}%, n=${totals.records}` }),
          stat({ label: 'Escalation yield', value: fmtPct(totals.yield?.pct), hint: `95% CI ${fmtNum(totals.yield?.lo)}–${fmtNum(totals.yield?.hi)}%, n=${totals.settledN}`, tone: totals.verdict === 'pure-overhead' ? 'bad' : '' }),
          stat({ label: 'Settled escalations', value: String(totals.settledN), hint: `${totals.changedN} changed the answer` }),
          stat({ label: 'Verdict', value: badge(VERDICT_LABELS[totals.verdict] || totals.verdict, toneFor(totals.verdict)) }),
        ),
        h('p', { class: 'muted' },
          'Yield is measured only on settled escalations where a human recorded whether the outsome differed from what the escalating level proposed. It is a human judgement, never inferred from a title or a note.'),
      ),
    }),
    card({
      title: 'What escalation cost',
      subtitle: `Priced at the DECLARED hourly rate of the receiving altitude, in ${totals.tax?.currency}. These are costing conventions, not audited payroll facts.`,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Declared cost', value: `${fmtNum(totals.tax?.units)} ${totals.tax?.currency || ''}` }),
        stat({ label: 'Leader-hours', value: fmtNum(totals.tax?.hours) }),
        stat({ label: 'Person-days', value: fmtNum(totals.tax?.personDays) }),
        stat({ label: 'Mean rungs crossed', value: fmtNum(totals.tax?.meanRungs) }),
      ),
    }),
    card({
      title: 'Context surviving the climb (Shannon 1948)',
      subtitle: `Each rung is a binary symmetric channel losing ${conv.escalationContextLossPerRungPct}% of the signal. The further up an item travels, the more it costs and the less the decider knows — quantified.`,
      body: table({
        caption: 'Context surviving each rung',
        columns: [
          { key: 'r', label: 'Rungs crossed', render: (row) => String(row.rungs) },
          { key: 'ret', label: 'Naive retention', render: (row) => `${row.retentionPct}%` },
          { key: 'err', label: 'Cascade error', render: (row) => `${row.cascadeErrorPct}%` },
          { key: 'bits', label: 'Mutual information (bits of 1)', render: (row) => String(row.mutualInformationBits) },
        ],
        rows: report.context,
      }),
    }),
    card({
      title: 'Escalation rate and yield by altitude',
      body: table({
        caption: 'Escalation rate and yield by altitude',
        columns: [
          { key: 'alt', label: 'Altitude', render: (row) => altShort(row.altitudeKey) },
          { key: 'seats', label: 'Spans', render: (row) => String(row.seats) },
          { key: 'n', label: 'Recorded', render: (row) => String(row.records) },
          { key: 'rate', label: 'Escalation rate', render: (row) => fmtInterval(row.escalationRate) },
          { key: 'yield', label: 'Yield', render: (row) => fmtInterval(row.yield) },
          { key: 'tax', label: 'Tax (hours)', render: (row) => fmtNum(row.taxHours) },
          { key: 'sat', label: 'Saturated / unstable', render: (row) => `${row.saturatedSeats} / ${row.unstableSeats}` },
        ],
        rows: report.byAltitude,
      }),
    }),
  );

  /* ---------------------------------------------------------- panel: authority */
  const authorityPanel = () => h(
    'div',
    { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Formal authority vs. real authority',
      body: 'Aghion & Tirole (1997): formal authority can be delegated on paper while real authority is still taken above — and that is exactly what destroys the incentive to gather information below. A declared intervention-rate commitment is the instrument that makes delegation credible, so it is frozen and then graded.',
    }),
    card({
      title: 'De facto centralisation',
      subtitle: 'Observed intervention rate against the declared commitment, per receiving span.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: openCommitmentModal, 'data-testid': 'escalation-commit' }, 'Declare a commitment'),
      ],
      body: report.authority.length
        ? table({
          caption: 'De facto centralisation by receiving span',
          columns: [
            { key: 'label', label: 'Receiving span', render: (row) => row.label },
            { key: 'alt', label: 'Altitude', render: (row) => altShort(row.altitudeKey) },
            { key: 'n', label: 'Decision moments below', render: (row) => String(row.n) },
            { key: 'lifted', label: 'Taken upward', render: (row) => String(row.liftedN) },
            { key: 'obs', label: 'Observed', render: (row) => fmtInterval(row.observed) },
            { key: 'com', label: 'Committed', render: (row) => (row.committedInterventionRatePct === null ? 'no commitment' : `${row.committedInterventionRatePct}%`) },
            { key: 'delta', label: 'Gap', render: (row) => (row.deltaPp === null ? 'withheld' : `${row.deltaPp > 0 ? '+' : ''}${row.deltaPp} pp`) },
            { key: 'verdict', label: 'Verdict', render: (row) => badge(VERDICT_LABELS[row.verdict] || row.verdict, toneFor(row.verdict)) },
          ],
          rows: report.authority,
        })
        : emptyState({ title: 'No span has both a subtree and a recorded decision moment yet' }),
    }),
    card({
      title: 'Subsidiarity by decision class',
      subtitle: 'Jensen & Meckling (1995) and the principle of subsidiarity: authority belongs where the specific knowledge is. Measured as the share of a class resolved at the rung where it arose.',
      body: report.classes.length
        ? table({
          caption: 'Subsidiarity by decision class',
          columns: [
            { key: 'cls', label: 'Decision class', render: (row) => row.decisionClass },
            { key: 'n', label: 'Moments', render: (row) => String(row.n) },
            { key: 'esc', label: 'Escalated', render: (row) => String(row.escalatedN) },
            { key: 'rungs', label: 'Mean rungs', render: (row) => fmtNum(row.meanRungs) },
            { key: 'sub', label: 'Decided where it arose', render: (row) => fmtInterval(row.subsidiarity) },
            { key: 'verdict', label: 'Verdict', render: (row) => badge(VERDICT_LABELS[row.verdict] || row.verdict, toneFor(row.verdict)) },
          ],
          rows: report.classes,
        })
        : emptyState({ title: 'No decision class recorded yet' }),
    }),
    card({
      title: 'Commitments — frozen, then graded once',
      subtitle: 'A commitment is a bounded promise to intervene less. Grading is one-shot: a re-run cannot move the number until it looks better.',
      body: commitments.length
        ? table({
          caption: 'Intervention-rate commitments',
          columns: [
            { key: 'cls', label: 'Class', render: (row) => row.decisionClass },
            { key: 'period', label: 'Period', render: (row) => row.periodKey },
            { key: 'com', label: 'Ceiling', render: (row) => `${row.committedInterventionRatePct}%` },
            { key: 'budget', label: 'Budget', render: (row) => String(row.committedEscalationBudget) },
            { key: 'forecast', label: 'Forecast', render: (row) => `${row.forecastPct}%` },
            { key: 'obs', label: 'Observed', render: (row) => (row.observedInterventionRatePct === null ? 'not graded' : `${row.observedInterventionRatePct}% (n=${row.observedN})`) },
            { key: 'brier', label: 'Brier', render: (row) => (row.brier === null ? '—' : String(row.brier)) },
            {
              key: 'action',
              label: 'Action',
              render: (row) => (row.status === 'graded'
                ? badge(row.keptWithinBudget === 1 ? 'held' : 'breached', row.keptWithinBudget === 1 ? 'good' : 'bad')
                : h('button', {
                  class: 'btn btn-ghost btn-sm', type: 'button',
                  onClick: () => {
                    const res = ctx.api.escalationGradeCommitment(row.id);
                    if (!res.ok) { toast(res.error, 'bad'); return; }
                    toast(`Graded: observed ${res.commitment.observedInterventionRatePct}% against a ${res.commitment.committedInterventionRatePct}% ceiling.`, 'good');
                    ctx.refresh();
                  },
                }, 'Grade it')),
            },
          ],
          rows: commitments.map((c) => ({ ...c, className: c.id === focusCommitmentId ? 'is-focused' : '' })),
        })
        : emptyState({
          title: 'No intervention-rate commitment declared',
          body: 'Without one, delegation is a sentence in a document rather than a measurable promise.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: openCommitmentModal }, 'Declare one'),
        }),
    }),
    card({
      title: 'Commitment calibration (out of sample)',
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Declared', value: String(cal.declaredN) }),
        stat({ label: 'Graded', value: String(cal.gradedN) }),
        stat({ label: 'Mean Brier', value: cal.brier === null ? 'withheld' : String(cal.brier) }),
        stat({ label: 'Brier skill vs base rate', value: cal.skill === null ? 'withheld' : String(cal.skill) }),
      ),
    }),
  );

  /* ------------------------------------------------------------- panel: brief */
  const briefPanel = () => h(
    'div',
    { class: 'stack' },
    card({
      title: 'Executive brief',
      subtitle: 'Identity-free: no person id, no seat name, no escalation title, no proposed action and no note survives the boundary.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief, 'data-testid': 'escalation-download-brief' }, 'Download brief'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: downloadCsv, 'data-testid': 'escalation-download-csv' }, 'Download CSV (#80)'),
      ],
      body: h('pre', { class: 'brief-pre', 'data-testid': 'escalation-brief' }, ctx.api.escalationBriefText()),
    }),
    card({
      title: 'Roll-up by altitude',
      subtitle: `Disclosure at this seat: ${report.disclosure}. A record counts once at the span where it arose and is inherited by every ancestor by addition, so zooming out cannot inflate the figure.`,
      body: table({
        caption: 'Escalation roll-up by altitude',
        columns: [
          { key: 'alt', label: 'Altitude', render: (row) => altShort(row.altitudeKey) },
          { key: 'seats', label: 'Spans', render: (row) => String(row.seats) },
          { key: 'n', label: 'Recorded', render: (row) => String(row.records) },
          { key: 'esc', label: 'Escalated', render: (row) => String(row.escalated) },
          { key: 'rate', label: 'Rate', render: (row) => fmtInterval(row.escalationRate) },
          { key: 'yield', label: 'Yield', render: (row) => fmtInterval(row.yield) },
          { key: 'pd', label: 'Person-days', render: (row) => fmtNum(row.taxPersonDays) },
        ],
        rows: report.byAltitude,
      }),
    }),
    card({
      title: 'Method and limits',
      body: h('ul', { class: 'plain-list' }, ...report.limits.map((l) => h('li', null, l)),
        h('li', null, 'Rates below the small-cell floor are BLANK, never zero. Suppression is small-cell withholding, not differential privacy.'),
        h('li', null, 'Sources: Aghion & Tirole (1997); Holmström & Milgrom (1991); Jensen & Meckling (1995) and the principle of subsidiarity; Erlang M/M/1 and Kingman (1961); Shannon (1948); Oncken & Wass (1974); Wilson (1927); Brier (1950).')),
    }),
  );

  /* ------------------------------------------------------------------- render */
  const header = pageHeader({
    eyebrow: `Schema v91 · ADR-0085 · RULE-ESC-01..05 · ${report.disclosure} disclosure`,
    title: 'The Escalation Economy',
    subtitle: 'Every problem in an organisation is either absorbed where it arose or passed upward. This is the ledger, the queue, the yield and the price of that market — and the instrument that makes delegation credible.',
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan, 'data-testid': 'escalation-scan' }, 'Run scan'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: openLogModal }, 'Log a decision moment'),
    ],
  });

  const body = panel === 'ledger'
    ? ledgerPanel()
    : panel === 'queue'
      ? queuePanel()
      : panel === 'yield'
        ? yieldPanel()
        : panel === 'authority'
          ? authorityPanel()
          : briefPanel();

  return h(
    'div',
    { class: 'page', 'data-testid': 'escalation-view' },
    header,
    tabs({
      items: [
        { key: 'ledger', label: 'Ledger & monkey ledger', count: report.monkeys.overReturnWindow.length || undefined },
        { key: 'queue', label: 'Queue integrity', count: report.saturatedQueues.length || undefined },
        { key: 'yield', label: 'Yield & cost' },
        { key: 'authority', label: 'Authority & subsidiarity', count: report.authority.filter((a) => a.verdict === 'above-commitment').length || undefined },
        { key: 'brief', label: 'Executive brief' },
      ],
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Escalation Economy sections',
    }),
    h('div', { class: 'stack' }, body),
  );
}
