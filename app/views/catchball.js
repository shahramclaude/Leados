/**
 * app/views/catchball.js — Hoshin Kanri & Catchball Cascade Terminal
 * (`#/catchball`, Session 124, Schema v90, ADR-0084).
 *
 * Five role-tiered panels across all five organizational altitudes:
 *   1. X-Matrix (`matrix`): South Breakthrough Bets × West Cascaded Span Pacts
 *      × North Leading/Lagging Metrics × East Span Capacity & Budget Authority,
 *      plus primary + complementary small-cell suppressed span roll-up.
 *   2. Catchball Workbench (`workbench`): Propose downward pacts with live
 *      queueing/budget feasibility preview, bilateral counter-proposals
 *      (`scope-trim`, `trade-off`, `resource-ask`), Silent-Overload-guarded
 *      acceptance, Bowler check-ins, settlement grading, and round timeline.
 *   3. Bowler & Watermelon (`watermelon`): Effort-weighted mean vs. Goldratt
 *      weakest-link floor, Prendergast Watermelon detector, Argyris & Schön
 *      double-loop thesis-vs-execution 2x2, and Fréchet joint delivery bounds.
 *   4. Calibration & Fan-Out (`calibration`): Combinatorial cascade fan-out
 *      (b^d), Span HHI concentration, Wilson 95% intervals, strictly-prior
 *      Brier skill, bilateral negotiation lift, round ledger, and conventions.
 *   5. Executive Brief (`brief`): Identity-free Markdown brief & aggregate CSV.
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
  BOWLER_STATE_LABELS,
  CATCHBALL_LIMITS,
  CATCHBALL_PANELS,
  CORRELATION_STRENGTHS,
  CORRELATION_SYMBOLS,
  COUNTER_MECHANISM_LABELS,
  GRADED_OUTCOMES,
  GRADED_OUTCOME_LABELS,
  TRADEOFF_SOURCE_TYPES,
} from '../core/domain/catchballRegistry.js';

const panelFor = (query) => {
  const p = query?.get?.('panel');
  return CATCHBALL_PANELS.includes(p) ? p : 'matrix';
};

const go = (ctx, panel, extra = '') => ctx.navigate(`#/catchball?panel=${panel}${extra}`);
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const altShort = (key) => ({
  frontline: 'Frontline (7d)',
  manager: 'Manager (30d)',
  director: 'Director (90d)',
  exec: 'Executive (180d)',
  chief: 'Chief / CEO (365d)',
}[key] || key || '—');

const statusTone = (status) => ({
  agreed: 'good',
  settled: 'good',
  countered: 'caution',
  proposed: 'neutral',
  withdrawn: 'neutral',
}[status] || 'neutral');

const bowlerTone = (state) => ({
  aligned: 'good',
  'thesis-suspect': 'bad',
  'execution-drift': 'caution',
  'outcome-lag': 'caution',
  'lucky-variance': 'caution',
  unmeasured: 'neutral',
}[state] || 'neutral');

export function renderCatchball(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const focusPactId = ctx.query?.get?.('pact') || null;
  const focusRoundId = ctx.query?.get?.('round') || null;

  const report = ctx.api.catchballRead();
  const conv = report.conventions;
  const cal = report.calibration;
  const detailWithheld = report.detailWithheld;
  const showTotal = (key, list) => detailWithheld ? (report.totals?.[key] == null ? 'withheld' : String(report.totals[key])) : String(list.length);

  const activePeople = (ctx.state.people || []).filter((p) => p && p.status !== 'archived');
  const openBets = (ctx.state.strategyBets || []).filter((b) => b && b.status !== 'retired');
  const openBudgets = (ctx.state.budgets || []).filter((b) => b && b.status === 'active');
  const openPremises = (ctx.state.premises || []).filter((p) => p && p.status !== 'retired');

  /* -------------------------------------------------------------- actions & modals */
  const runScan = () => {
    const res = ctx.api.catchballScan();
    toast(
      res.ok
        ? `Catchball spine reconciled (${res.propagations?.length || 0} propagation(s)).`
        : (res.error || 'Catchball scan failed.'),
      res.ok ? 'good' : 'bad',
    );
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const text = ctx.api.catchballBriefText();
    const ok = downloadText({
      filename: `leados-catchball-brief-${dayKey(now)}.md`,
      text,
      mime: 'text/markdown;charset=utf-8',
    });
    toast(ok ? 'Identity-free Hoshin brief downloaded.' : 'Download unavailable — copy the brief text below.', ok ? 'good' : 'warn');
  };

  const exportCsv = () => {
    const rows = ctx.api.catchballCsvRows();
    if (!Array.isArray(rows) || !rows.length) {
      toast(rows?.error || 'CSV export refused under current seat.', 'bad');
      return;
    }
    const csv = serializeCsv(Object.keys(rows[0]), rows);
    const ok = downloadText({ filename: `leados-catchball-cascade-${dayKey(now)}.csv`, text: csv, mime: 'text/csv;charset=utf-8' });
    toast(ok ? 'Aggregate-only CSV (#78) downloaded.' : 'Download unavailable.', ok ? 'good' : 'bad');
  };

  const openCounterModal = (pact) => {
    const mechSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Counter-proposal mechanism' },
      ...['scope-trim', 'trade-off', 'resource-ask'].map((m) =>
        h('option', { value: m }, COUNTER_MECHANISM_LABELS[m]),
      ),
    );
    const effortInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: '0.5',
      value: String(pact.effortDays ?? 0),
      'aria-label': 'Proposed effort days',
    });
    const targetInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: '1',
      value: String(pact.laggingTarget ?? 100),
      'aria-label': 'Proposed lagging target',
    });
    const dueInput = h('input', {
      class: 'input',
      type: 'date',
      value: pact.dueOn || '',
      'aria-label': 'Proposed due date',
    });
    const tradeTypeSelect = h(
      'select',
      { class: 'input', 'aria-label': 'De-scoped commitment type' },
      h('option', { value: '' }, 'None'),
      ...TRADEOFF_SOURCE_TYPES.map((t) => h('option', { value: t }, t)),
    );
    const tradeCandidates = [
      ...(ctx.state.portfolio || []).map((r) => ({ type: 'portfolio', id: r.id, label: `[portfolio] ${r.title}` })),
      ...(ctx.state.goals || []).map((r) => ({ type: 'goal', id: r.id, label: `[goal] ${r.title}` })),
      ...(ctx.state.cases || []).map((r) => ({ type: 'case', id: r.id, label: `[case] ${r.title}` })),
    ];
    const tradeIdSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Commitment to de-scope or defer' },
      h('option', { value: '' }, 'Select an active commitment (for trade-off)'),
      ...tradeCandidates.map((c) => h('option', { value: `${c.type}::${c.id}` }, c.label)),
    );
    const budgetSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Budget envelope for resource ask' },
      h('option', { value: '' }, 'No budget envelope'),
      ...openBudgets.map((b) =>
        h('option', { value: b.id, ...(b.id === pact.budgetId ? { selected: true } : {}) }, `${b.name} (${b.currency})`),
      ),
    );
    const askInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: '100',
      value: pact.resourceAskAmount !== null ? String(pact.resourceAskAmount) : '',
      placeholder: 'e.g. 15000',
      'aria-label': 'Resource ask amount',
    });
    const noteInput = h('textarea', {
      class: 'input',
      rows: '3',
      maxlength: '280',
      placeholder: 'Explain the local capacity constraint, dependency, or trade-off...',
      'aria-label': 'Counter-proposal rationale',
    });

    const submit = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          let tradeOffSourceType = tradeTypeSelect.value || null;
          let tradeOffSourceId = null;
          if (tradeIdSelect.value.includes('::')) {
            const [tType, tId] = tradeIdSelect.value.split('::');
            tradeOffSourceType = tType;
            tradeOffSourceId = tId;
          }
          const res = ctx.api.catchballCounter(pact.id, {
            mechanism: mechSelect.value,
            proposedEffortDays: Number(effortInput.value) || 0,
            proposedLaggingTarget: Number(targetInput.value) || 0,
            proposedDueOn: dueInput.value || pact.dueOn,
            tradeOffSourceType,
            tradeOffSourceId,
            budgetId: budgetSelect.value || null,
            resourceAskAmount: askInput.value ? Number(askInput.value) : null,
            note: noteInput.value,
          });
          toast(res.ok ? 'Counter-offer recorded on append-only Catchball ledger.' : (res.error || 'Counter refused.'), res.ok ? 'good' : 'bad');
          if (res.ok) {
            closeAllModals();
            ctx.refresh();
          }
        },
      },
      'Throw Catchball upward',
    );

    openModal({
      title: `Counter Catchball pact: ${pact.displayTitle}`,
      description: 'Dantzig–Wolfe / Kornai–Lipták priced counter-offer: surface real capacity constraints before locking.',
      body: h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, `Current span load band: ${pact.feasibility.band} · headroom: ${pact.feasibility.headroomDays ?? '—'} person-day(s).`),
        h('label', { class: 'field' }, h('span', null, 'Counter mechanism'), mechSelect),
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, 'Revised effort (days)'), effortInput),
          h('label', { class: 'field' }, h('span', null, 'Revised lagging target'), targetInput),
          h('label', { class: 'field' }, h('span', null, 'Revised due date'), dueInput),
        ),
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, 'Trade-off type'), tradeTypeSelect),
          h('label', { class: 'field' }, h('span', null, 'Commitment to de-scope'), tradeIdSelect),
        ),
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, 'Budget envelope (resource-ask)'), budgetSelect),
          h('label', { class: 'field' }, h('span', null, 'Resource ask amount'), askInput),
        ),
        h('label', { class: 'field' }, h('span', null, 'Rationale'), noteInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        submit,
      ],
    });
  };

  const openAcceptModal = (pact) => {
    const confInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '100',
      value: pact.frozenConfidencePct == null ? '' : String(pact.frozenConfidencePct),
      placeholder: 'Optional — do not invent a forecast',
      'aria-label': 'Frozen delivery confidence (%)',
    });
    const createGoalToggle = h('input', {
      type: 'checkbox',
      checked: !pact.linkedGoalId,
      'aria-label': 'Materialize linked execution goal on acceptance',
    });
    const justInput = h('textarea', {
      class: 'input',
      rows: '3',
      maxlength: '280',
      placeholder: pact.feasibility.silentOverloadBlocked
        ? 'Required (>=12 chars) if accepting into a saturated queue without a prior counter or trade-off...'
        : 'Optional commitment note...',
      'aria-label': 'Acceptance or overload justification',
    });

    const submit = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.catchballAccept(pact.id, {
            confidencePct: confInput.value === '' ? null : Number(confInput.value),
            createGoal: createGoalToggle.checked,
            overloadJustification: justInput.value,
          });
          toast(
            res.ok
              ? 'Catchball pact agreed, rolled up the hierarchy, and sealed.'
              : (res.error || 'Acceptance refused.'),
            res.ok ? 'good' : 'bad',
          );
          if (res.ok) {
            closeAllModals();
            ctx.refresh();
          }
        },
      },
      'Lock bilateral agreement',
    );

    openModal({
      title: `Accept Catchball pact: ${pact.displayTitle}`,
      description: 'Locks prospective confidence for out-of-sample Brier grading and encumbers agreed budget lines.',
      body: h(
        'div',
        { class: 'stack' },
        pact.feasibility.silentOverloadBlocked
          ? banner({
            tone: 'warn',
            title: 'Silent-Overload Guard active',
            body: `Span sits in "${pact.feasibility.band}" (${pact.feasibility.postPactDays}d vs ${pact.feasibility.allocatableDays ?? '—'}d allocatable). Counter with a trade-off/scope-trim first, or record an explicit >=12-character overload justification.`,
          })
          : null,
        h('label', { class: 'field' }, h('span', null, 'Prospective delivery confidence (%)'), confInput),
        h('label', { class: 'field field-check' }, createGoalToggle, h('span', null, 'Materialize linked execution goal in Goals (#/goals)')),
        h('label', { class: 'field' }, h('span', null, 'Commitment / overload justification'), justInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        submit,
      ],
    });
  };

  const openCheckinModal = (pact) => {
    const leadInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '100',
      value: String(pact.leadingPct ?? 85),
      'aria-label': 'Leading process adherence (%)',
    });
    const lagInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '100',
      value: String(pact.laggingPct ?? 75),
      'aria-label': 'Lagging outcome realization (%)',
    });
    const repInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '100',
      value: pact.reportedPct !== null ? String(pact.reportedPct) : '',
      placeholder: 'Optional headline %',
      'aria-label': 'Optional self-reported headline (%)',
    });
    const noteInput = h('textarea', {
      class: 'input',
      rows: '2',
      maxlength: '240',
      placeholder: 'Bowler cadence note...',
      'aria-label': 'Bowler check-in note',
    });

    const submit = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.catchballCheckin(pact.id, {
            leadingPct: Number(leadInput.value),
            laggingPct: Number(lagInput.value),
            reportedPct: repInput.value === '' ? null : Number(repInput.value),
            note: noteInput.value,
          });
          toast(res.ok ? 'Bowler check-in recorded; Watermelon & Double-Loop checks updated.' : (res.error || 'Check-in failed.'), res.ok ? 'good' : 'bad');
          if (res.ok) {
            closeAllModals();
            ctx.refresh();
          }
        },
      },
      'Record Bowler check-in',
    );

    openModal({
      title: `Bowler check-in: ${pact.displayTitle}`,
      description: 'Separates leading process compliance from lagging outcome realization (Argyris & Schön double-loop check).',
      body: h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, `Leading (${pact.leadingMetric || 'process'}) %`), leadInput),
          h('label', { class: 'field' }, h('span', null, `Lagging (${pact.laggingMetric || 'outcome'}) %`), lagInput),
          h('label', { class: 'field' }, h('span', null, 'Headline status % (optional)'), repInput),
        ),
        h('label', { class: 'field' }, h('span', null, 'Cadence note'), noteInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        submit,
      ],
    });
  };

  const openSettleModal = (pact) => {
    const outSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Settlement outcome' },
      ...GRADED_OUTCOMES.map((o) => h('option', { value: o }, GRADED_OUTCOME_LABELS[o])),
    );
    const noteInput = h('textarea', {
      class: 'input',
      rows: '3',
      maxlength: '280',
      placeholder: 'Evidence for settlement verdict...',
      'aria-label': 'Settlement evidence note',
    });
    const submit = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.catchballSettle(pact.id, {
            gradedOutcome: outSelect.value,
            gradeNote: noteInput.value,
          });
          toast(res.ok ? 'Pact settled once for out-of-sample Brier calibration.' : (res.error || 'Settlement refused.'), res.ok ? 'good' : 'bad');
          if (res.ok) {
            closeAllModals();
            ctx.refresh();
          }
        },
      },
      'Freeze settlement grade',
    );

    openModal({
      title: `Settle & grade pact: ${pact.displayTitle}`,
      description: 'Written once; grades the span-altitude delivery model, never an individual person.',
      body: h(
        'div',
        { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Outcome verdict'), outSelect),
        h('label', { class: 'field' }, h('span', null, 'Settlement note'), noteInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        submit,
      ],
    });
  };

  /* -------------------------------------------------------------- Panel 1: X-Matrix */
  function matrixPanel() {
    const activePlay = report.playbook.find((p) => p.key === report.seat.altitudeKey) || report.playbook[4];
    return h(
      'div',
      { class: 'stack' },
      banner({
        tone: 'info',
        title: `Operating lens: ${report.seat.label} · Disclosure: ${report.disclosureMode}`,
        body: `${activePlay.quadrantRole}. Question at this altitude: "${activePlay.catchballQuestion}"`,
      }),
      h(
        'div',
        { class: 'stat-grid' },
        stat({ label: 'Active pacts', value: showTotal('active', report.activePacts), hint: `${showTotal('open', report.openNegotiations)} in Catchball negotiation` }),
        stat({ label: 'Watermelon gaps', value: showTotal('watermelons', report.watermelons), tone: report.watermelons.length ? 'caution' : 'good', hint: `>= ${conv.catchballWatermelonGapPct} pp mean vs weakest-link` }),
        stat({ label: 'Thesis-suspect (exonerated)', value: showTotal('thesisSuspects', report.thesisSuspects), tone: report.thesisSuspects.length ? 'bad' : 'good', hint: 'Double-loop bet review' }),
        stat({ label: 'Span effort HHI', value: report.fanout.spanHhi !== null ? String(report.fanout.spanHhi) : '—', hint: report.fanout.effectiveSpanCount ? `${report.fanout.effectiveSpanCount} effective spans` : 'unmeasured' }),
      ),
      card({
        title: 'Four-Quadrant Hoshin X-Matrix (South Bets × West Span Pacts × North Metrics × East Capacity)',
        subtitle: 'Akao (1991) & Jackson (2006): connects annual Breakthrough Bets to capacity-priced span commitments without averaging away bottlenecks.',
        body: report.xMatrixBets.length
          ? table({
            columns: [
              { label: 'South: Breakthrough Bet', render: (b) => b.title },
              { label: 'Target share', render: (b) => `${b.targetSharePct}%` },
              { label: 'West: Deployed pacts', render: (b) => b.undeployed ? badge('0 · undeployed', 'bad') : `${b.deployedCount} (${b.agreedCount} agreed)` },
              { label: 'East: Committed effort', render: (b) => `${b.effortDays} d` },
              { label: 'North: Mean lagging', render: (b) => fmtPct(b.meanPct) },
              { label: 'Goldratt weakest-link', render: (b) => fmtPct(b.weakestPct) },
              {
                label: 'Coherence state',
                render: (b) => b.thesisSuspectCount > 0
                  ? badge(`${b.thesisSuspectCount} thesis-suspect`, 'bad')
                  : b.watermelonCount > 0
                    ? badge(`${b.watermelonCount} watermelon`, 'caution')
                    : b.undeployed
                      ? badge('no cascade', 'caution')
                      : badge('deployed', 'good'),
              },
            ],
            rows: report.xMatrixBets,
            caption: 'Hoshin Kanri X-Matrix summary by Breakthrough Bet',
          })
          : emptyState({
            title: detailWithheld ? 'Bet-level detail withheld' : 'No Breakthrough Bets visible',
            body: detailWithheld ? 'Use the span roll-up; item-level detail is withheld at this altitude.' : 'Declare Breakthrough Bets in Strategy Coherence (#/strategy) or propose span pacts on the Catchball Workbench.',
          }),
      }),
      card({
        title: 'Cross-Altitude Span Roll-Up (Primary + Complementary Small-Cell Guard)',
        subtitle: `At Executive/Chief ranks, spans with 0 < n < ${conv.catchballCellFloor} and one sibling complement report intervals so parent-minus-sibling subtraction cannot isolate a small span.`,
        body: report.spanRollup.length
          ? table({
            columns: [
              { label: 'Span', render: (r) => r.spanLabel },
              { label: 'Altitude', render: (r) => altShort(r.altitudeKey) },
              { label: 'Pact count', render: (r) => r.withheld ? badge(r.countDisplay, 'neutral', r.suppressionReason) : r.countDisplay },
              { label: 'Active effort', render: (r) => r.withheld ? 'withheld' : `${r.totalEffortDays} d` },
              { label: 'Mean lagging', render: (r) => r.withheld ? 'withheld' : fmtPct(r.meanLaggingPct) },
              { label: 'Weakest-link floor', render: (r) => r.withheld ? 'withheld' : fmtPct(r.weakestLaggingPct) },
            ],
            rows: report.spanRollup,
            caption: 'Vertical span roll-up with small-cell disclosure protection',
          })
          : emptyState({ title: 'No subordinate leadership spans in scope', body: 'Add reporting lines (`managerId`) in People to populate multi-span roll-ups.' }),
      }),
      card({
        title: 'Five-Altitude Hoshin Operating Playbook',
        subtitle: 'One data model, five genuinely different altitude responsibilities (Jaques 7 / 30 / 90 / 180 / 365d).',
        body: table({
          columns: [
            { label: 'Rank', render: (p) => `${p.rank} · ${p.shortLabel}` },
            { label: 'Horizon', render: (p) => `${p.horizonDays}d` },
            { label: 'Disclosure', render: (p) => p.disclosure },
            { label: 'Hoshin role', render: (p) => p.quadrantRole },
            { label: 'Catchball authority', render: (p) => p.negotiationRight },
          ],
          rows: report.playbook,
          caption: 'Five-altitude Hoshin Kanri & Catchball contract',
        }),
      }),
    );
  }

  /* -------------------------------------------------------------- Panel 2: Workbench */
  function workbenchPanel() {
    const titleInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '180',
      placeholder: 'e.g. Cut enterprise onboarding cycle time to <=10 business days',
      'aria-label': 'Pact title',
    });
    const receiverSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Receiving span owner' },
      h('option', { value: '' }, 'Select receiving span owner'),
      ...activePeople.map((p) => h('option', { value: p.id }, `${p.name}${p.role ? ` (${p.role})` : ''}`)),
    );
    const betSelect = h(
      'select',
      { class: 'input', 'aria-label': 'South quadrant Breakthrough Bet' },
      h('option', { value: '' }, 'Unlinked / local pact'),
      ...openBets.map((b) => h('option', { value: b.id }, `${b.title} (${b.weightPct ?? 0}%)`)),
    );
    const parentSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Upstream parent pact' },
      h('option', { value: '' }, 'Top-level bet deployment (no parent pact)'),
      ...report.activePacts.map((p) => h('option', { value: p.id }, `${p.displayTitle} (${altShort(p.altitudeKey)})`)),
    );
    const premiseSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Linked causal assumption' },
      h('option', { value: '' }, 'No linked assumption'),
      ...openPremises.map((p) => h('option', { value: p.id }, p.title || p.statement || p.id)),
    );
    const corrSelect = h(
      'select',
      { class: 'input', 'aria-label': 'X-Matrix causal correlation' },
      ...CORRELATION_STRENGTHS.map((c) => h('option', { value: c }, CORRELATION_SYMBOLS[c])),
    );
    const effortInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: '0.5',
      value: '5',
      'aria-label': 'Estimated effort (person-days)',
    });
    const leadMetricInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '120',
      value: 'Weekly playbook execution adherence',
      'aria-label': 'Leading process metric',
    });
    const lagMetricInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '120',
      value: 'Target outcome milestone completion',
      'aria-label': 'Lagging outcome metric',
    });
    const budgetSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Optional budget envelope' },
      h('option', { value: '' }, 'No budget ask'),
      ...openBudgets.map((b) => h('option', { value: b.id }, `${b.name} (${b.currency})`)),
    );
    const askInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: '100',
      placeholder: 'Optional amount',
      'aria-label': 'Optional budget encumbrance amount',
    });

    const liveFeasibility = h('div', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'Select a receiving span to price person-day headroom and budget authority.');
    const refreshFeasibility = () => {
      if (!receiverSelect.value) {
        liveFeasibility.textContent = 'Select a receiving span to price person-day headroom and budget authority.';
        return;
      }
      const res = ctx.api.catchballPreviewFeasibility(receiverSelect.value, {
        effortDays: Number(effortInput.value) || 0,
        budgetId: budgetSelect.value || null,
        resourceAskAmount: askInput.value ? Number(askInput.value) : null,
      });
      if (!res.ok) {
        liveFeasibility.textContent = res.error || 'Could not price span feasibility.';
        return;
      }
      const f = res.feasibility;
      const bTxt = f.budget ? ` · Budget: ${f.budget.reason}` : '';
      liveFeasibility.textContent = `Span load band: ${f.band} · Allocatable: ${f.allocatableDays ?? '—'}d · Post-pact committed: ${f.postPactDays}d${f.silentOverloadBlocked ? ' [SILENT-OVERLOAD GUARD WILL REQUIRE TRADE-OFF]' : ''}${bTxt}`;
    };
    receiverSelect.addEventListener('change', refreshFeasibility);
    effortInput.addEventListener('input', refreshFeasibility);
    budgetSelect.addEventListener('change', refreshFeasibility);
    askInput.addEventListener('input', refreshFeasibility);

    const submitProposal = () => {
      const res = ctx.api.catchballPropose({
        title: titleInput.value,
        toSeatId: receiverSelect.value,
        strategyBetId: betSelect.value || null,
        parentPactId: parentSelect.value || null,
        premiseId: premiseSelect.value || null,
        correlation: corrSelect.value,
        effortDays: Number(effortInput.value) || 0,
        leadingMetric: leadMetricInput.value,
        laggingMetric: lagMetricInput.value,
        budgetId: budgetSelect.value || null,
        resourceAskAmount: askInput.value ? Number(askInput.value) : null,
      });
      toast(res.ok ? 'Catchball proposal thrown; Round #1 logged and rolled up.' : (res.error || 'Proposal refused.'), res.ok ? 'good' : 'bad');
      if (res.ok) ctx.refresh();
    };

    const focusedPact = focusPactId
      ? report.pacts.find((p) => p.id === focusPactId) || null
      : report.pacts[0] || null;

    return h(
      'div',
      { class: 'stack' },
      detailWithheld
        ? banner({
          tone: 'info',
          title: 'Executive aggregate lens active',
          body: 'Individual pact titles and free-text negotiation notes are withheld at rank >= 4; switch to an owning manager/director seat (or operator view) for line-item Catchball text.',
        })
        : card({
          title: 'Propose Hoshin Catchball Pact (Round #1)',
          subtitle: 'Throws the ball to a subordinate or owned span with explicit leading/lagging metrics and live capacity pricing.',
          body: h(
            'div',
            { class: 'stack' },
            h(
              'div',
              { class: 'form-grid' },
              h('label', { class: 'field' }, h('span', null, 'Pact title'), titleInput),
              h('label', { class: 'field' }, h('span', null, 'Receiving span owner'), receiverSelect),
              h('label', { class: 'field' }, h('span', null, 'Breakthrough Bet (South)'), betSelect),
              h('label', { class: 'field' }, h('span', null, 'Parent pact (optional cascade)'), parentSelect),
              h('label', { class: 'field' }, h('span', null, 'Causal assumption (optional)'), premiseSelect),
              h('label', { class: 'field' }, h('span', null, 'X-Matrix correlation'), corrSelect),
              h('label', { class: 'field' }, h('span', null, 'Effort (person-days)'), effortInput),
              h('label', { class: 'field' }, h('span', null, 'Leading process metric'), leadMetricInput),
              h('label', { class: 'field' }, h('span', null, 'Lagging outcome metric'), lagMetricInput),
              h('label', { class: 'field' }, h('span', null, 'Budget envelope'), budgetSelect),
              h('label', { class: 'field' }, h('span', null, 'Budget ask amount'), askInput),
            ),
            liveFeasibility,
            h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: submitProposal }, 'Propose Catchball pact')),
          ),
        }),
      card({
        title: `Bilateral Catchball Ledger (${report.pacts.length} of ${CATCHBALL_LIMITS.pacts} cap)`,
        subtitle: 'Silence is never consent: a proposed pact stays open until the receiving span counters or locks agreement.',
        body: report.pacts.length
          ? table({
            columns: [
              { label: 'Pact', render: (p) => p.displayTitle },
              { label: 'Owning span', render: (p) => p.ownerLabel },
              { label: 'Altitude', render: (p) => altShort(p.altitudeKey) },
              { label: 'Rounds', render: (p) => String(p.roundCount) },
              { label: 'Effort & Load', render: (p) => `${p.effortDays}d · ${p.feasibility.band}` },
              { label: 'Lead / Lag', render: (p) => `${fmtPct(p.leadingPct)} / ${fmtPct(p.laggingPct)}` },
              { label: 'Status', render: (p) => badge(p.gradedOutcome ? `${p.status}:${p.gradedOutcome}` : p.status, statusTone(p.status)) },
              {
                label: 'Actions',
                render: (p) => detailWithheld
                  ? badge('aggregate', 'neutral')
                  : h(
                    'div',
                    { class: 'row' },
                    ['proposed', 'countered'].includes(p.status)
                      ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openCounterModal(p) }, 'Counter')
                      : null,
                    ['proposed', 'countered'].includes(p.status)
                      ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openAcceptModal(p) }, 'Accept')
                      : null,
                    p.status === 'agreed'
                      ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openCheckinModal(p) }, 'Check-in')
                      : null,
                    p.status === 'agreed'
                      ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSettleModal(p) }, 'Settle')
                      : null,
                    ['proposed', 'countered', 'agreed'].includes(p.status)
                      ? h(
                        'button',
                        {
                          class: 'btn btn-small btn-ghost',
                          type: 'button',
                          onClick: () => {
                            const res = ctx.api.catchballWithdraw(p.id, {});
                            toast(res.ok ? 'Pact withdrawn and unspent encumbrance released.' : (res.error || 'Withdraw failed.'), res.ok ? 'good' : 'bad');
                            if (res.ok) ctx.refresh();
                          },
                        },
                        'Withdraw',
                      )
                      : null,
                  ),
              },
            ],
            rows: report.pacts,
            caption: 'Hoshin Catchball pacts and bilateral negotiation controls',
          })
          : emptyState({ title: 'No Catchball pacts in scope', body: 'Propose your first Hoshin pact above to initiate bilateral Catchball.' }),
      }),
      !detailWithheld && focusedPact
        ? card({
          title: `Append-Only Catchball Round History: ${focusedPact.displayTitle}`,
          subtitle: `${focusedPact.rounds.length} immutable turn(s) recorded.`,
          body: focusedPact.rounds.length
            ? table({
              columns: [
                { label: 'Round', render: (r) => `#${r.roundNumber}` },
                { label: 'Turn', render: (r) => badge(r.kind, r.kind === 'counter' ? 'caution' : r.kind === 'accept' ? 'good' : 'neutral') },
                { label: 'Mechanism', render: (r) => r.mechanism },
                { label: 'Date', render: (r) => formatDate(r.recordedOn) },
                { label: 'Terms / Check-in', render: (r) => r.kind === 'checkin' ? `Lead ${fmtPct(r.leadingPct)} · Lag ${fmtPct(r.laggingPct)}` : `${r.proposedEffortDays ?? '—'}d · ask ${r.resourceAskAmount ?? '—'}` },
                { label: 'Note', render: (r) => r.note || '—' },
              ],
              rows: focusedPact.rounds,
              caption: 'Append-only negotiation and check-in rounds for selected pact',
            })
            : emptyState({ title: 'No rounds recorded', body: 'Negotiation rounds appear here automatically.' }),
        })
        : null,
    );
  }

  /* -------------------------------------------------------------- Panel 3: Watermelon & Double-Loop */
  function watermelonPanel() {
    const parentRows = report.activePacts.filter((p) => p.childCount > 0 || p.isWatermelon);
    return h(
      'div',
      { class: 'stack' },
      banner({
        tone: report.watermelons.length || report.thesisSuspects.length ? 'warn' : 'info',
        title: 'Why OKR % averages lie — and why red outcomes are not always execution failures',
        body: 'Left lens: Goldratt/Leontief weakest-link floor vs. effort-weighted mean exposes Prendergast Watermelon masking. Right lens: Argyris & Schön double-loop separation exonerates teams that executed >=80% of leading plays when the upstream bet stalled <=35%.',
      }),
      card({
        title: 'Effort-Weighted Mean vs. Weakest-Link Bottleneck & Fréchet Joint Bounds',
        subtitle: `Watermelon threshold: headline minus weakest-link >= ${conv.catchballWatermelonGapPct} pp. Fréchet bounds [L, U] bracket joint child delivery without assuming independence.`,
        body: parentRows.length
          ? table({
            columns: [
              { label: 'Parent pact', render: (p) => p.displayTitle },
              { label: 'Children', render: (p) => `${p.childCount}${p.unmeasuredChildCount ? ` (${p.unmeasuredChildCount} unmeasured)` : ''}` },
              { label: 'Headline / Mean', render: (p) => fmtPct(p.headlinePct) },
              { label: 'Weakest-link floor', render: (p) => fmtPct(p.weakestLinkPct ?? p.laggingPct) },
              { label: 'Watermelon gap', render: (p) => p.watermelonGapPp === null ? '—' : badge(`${p.watermelonGapPp} pp`, p.isWatermelon ? 'bad' : 'good') },
              {
                label: 'Fréchet [L .. U] (indep.)',
                render: (p) => p.frechet
                  ? `[${p.frechet.lowerPct}% .. ${p.frechet.upperPct}%] (${p.frechet.independencePct}%)`
                  : '—',
              },
            ],
            rows: parentRows,
            caption: 'Parent cascade pacts comparing weighted mean against weakest-link bottleneck and Fréchet joint bounds',
          })
          : emptyState({
            title: 'No multi-child parent pacts or Watermelon gaps yet',
            body: 'Cascade a parent pact into child span pacts on the Workbench to compare mean progress against the weakest-link bottleneck.',
          }),
      }),
      card({
        title: 'Bowler Leading vs. Lagging Matrix & Double-Loop Thesis Exoneration',
        subtitle: `Leading floor ${conv.catchballLeadingFloorPct}% · Lagging floor ${conv.catchballLaggingFloorPct}% · Double-loop red floor <= ${conv.catchballThesisRedPct}% past midpoint.`,
        body: report.activePacts.length
          ? table({
            columns: [
              { label: 'Pact', render: (p) => p.displayTitle },
              { label: 'Span', render: (p) => p.ownerLabel },
              { label: 'Leading process', render: (p) => `${fmtPct(p.leadingPct)}${!detailWithheld && p.leadingMetric ? ` · ${p.leadingMetric}` : ''}` },
              { label: 'Lagging outcome', render: (p) => `${fmtPct(p.laggingPct)}${!detailWithheld && p.laggingMetric ? ` · ${p.laggingMetric}` : ''}` },
              { label: 'Bowler diagnosis', render: (p) => badge(BOWLER_STATE_LABELS[p.bowler.state] || p.bowler.state, bowlerTone(p.bowler.state)) },
              { label: 'Accountability routing', render: (p) => p.bowler.executionExonerated ? 'Exonerated → Escalate bet review upward' : p.bowler.state === 'execution-drift' ? 'Coach / unblock span capacity' : 'Maintain cadence' },
            ],
            rows: report.activePacts,
            caption: 'Bowler leading vs lagging diagnostic across active Catchball pacts',
          })
          : emptyState({ title: 'No active pacts to diagnose', body: 'Agree and check in on Catchball pacts to populate the Bowler matrix.' }),
      }),
    );
  }

  /* -------------------------------------------------------------- Panel 4: Calibration & Fan-Out */
  function calibrationPanel() {
    const gapInput = h('input', {
      class: 'input',
      type: 'number',
      min: '10',
      max: '60',
      value: String(conv.catchballWatermelonGapPct),
      'aria-label': 'Watermelon gap threshold (pp)',
    });
    const floorNInput = h('input', {
      class: 'input',
      type: 'number',
      min: '3',
      max: '20',
      value: String(conv.catchballFloorN),
      'aria-label': 'Calibration sample floor n',
    });
    const relInput = h('input', {
      class: 'input',
      type: 'number',
      min: '40',
      max: '95',
      value: String(conv.catchballReliabilityFloorPct),
      'aria-label': 'Reliability hold floor (%)',
    });
    const fanInput = h('input', {
      class: 'input',
      type: 'number',
      min: '2',
      max: '10',
      value: String(conv.catchballMaxFanout),
      'aria-label': 'Max active pacts per span',
    });
    const autoCheck = h('input', {
      type: 'checkbox',
      checked: conv.catchballAutoPropagate,
      'aria-label': 'Automatic Catchball post-commit propagation',
    });

    const saveConventions = () => {
      const res = ctx.api.catchballUpdateSettings({
        catchballWatermelonGapPct: Number(gapInput.value),
        catchballFloorN: Number(floorNInput.value),
        catchballReliabilityFloorPct: Number(relInput.value),
        catchballMaxFanout: Number(fanInput.value),
        catchballAutoPropagate: autoCheck.checked,
      });
      toast(res.ok ? 'Catchball conventions updated.' : (res.error || 'Could not update conventions.'), res.ok ? 'good' : 'bad');
      if (res.ok) ctx.refresh();
    };

    const allVisibleRounds = report.pacts.flatMap((p) => p.rounds || []);
    const roundRows = focusRoundId
      ? allVisibleRounds.filter((r) => r.id === focusRoundId)
      : allVisibleRounds.slice(-12).reverse();

    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'stat-grid' },
        stat({ label: 'Max cascade depth', value: String(report.fanout.maxCascadeDepth), hint: `mean branching ${report.fanout.meanBranching}` }),
        stat({ label: 'Combinatoric b^d', value: String(report.fanout.combinatoricProjection), tone: report.fanout.fanoutBreachSpans.length ? 'caution' : '' }),
        stat({ label: 'Settled trials', value: cal.totalN == null ? 'withheld' : String(cal.totalN), hint: `floor n=${conv.catchballFloorN}` }),
        stat({
          label: 'Negotiation lift',
          value: cal.negotiationLiftPp === null ? 'counts-only' : `${cal.negotiationLiftPp >= 0 ? '+' : ''}${cal.negotiationLiftPp} pp`,
          hint: `countered (${cal.negotiatedDeliveredN ?? '—'}/${cal.negotiatedN ?? '—'}) vs no counter (${cal.singlePassDeliveredN ?? '—'}/${cal.singlePassN ?? '—'})`,
        }),
      ),
      card({
        title: 'Out-of-Sample Delivery Calibration by Organizational Altitude',
        subtitle: 'Wilson 95% intervals and strictly-prior Brier skill withheld below the declared sample floor. Rates span reliability, never individuals.',
        body: table({
          columns: [
            { label: 'Altitude', render: (c) => `${c.rank} · ${c.label}` },
            { label: 'Horizon', render: (c) => `${c.horizonDays}d` },
            { label: 'Settled', render: (c) => c.n == null ? 'withheld' : String(c.n) },
            { label: 'Delivered', render: (c) => c.deliveredN == null ? 'withheld' : String(c.deliveredN) },
            { label: 'Thesis invalidated', render: (c) => c.thesisInvalidatedN == null ? 'withheld' : String(c.thesisInvalidatedN) },
            {
              label: 'Hold rate',
              render: (c) => c.refused
                ? badge(c.withheld ? 'withheld' : 'refused', 'neutral', c.withheld ? 'Aggregate disclosure guard' : `n=${c.n} < ${c.floorN}`)
                : badge(`${c.holdRatePct}%`, c.belowFloor ? 'bad' : 'good'),
            },
            { label: 'Wilson 95%', render: (c) => c.refused ? '—' : `${c.wilsonLo}–${c.wilsonHi}%` },
            { label: 'Brier skill', render: (c) => c.brierSkill === null ? '—' : String(c.brierSkill) },
          ],
          rows: cal.cells,
          caption: 'Catchball settlement calibration by organizational altitude',
        }),
      }),
      !detailWithheld && roundRows.length
        ? card({
          title: focusRoundId ? `Focused Catchball Round (${focusRoundId})` : 'Recent Bilateral Catchball Rounds',
          subtitle: 'Append-only negotiation and check-in events across visible spans.',
          body: table({
            columns: [
              { label: 'Round ID', render: (r) => r.id },
              { label: 'Pact ID', render: (r) => r.pactId },
              { label: 'Turn', render: (r) => `#${r.roundNumber} · ${r.kind}` },
              { label: 'Mechanism', render: (r) => r.mechanism },
              { label: 'Recorded', render: (r) => formatDate(r.recordedOn) },
            ],
            rows: roundRows,
            caption: 'Recent append-only Catchball rounds',
          }),
        })
        : null,
      card({
        title: 'Declared Hoshin & Catchball Conventions',
        subtitle: 'All thresholds are transparent, clamped workspace conventions — never black-box weights.',
        body: h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'form-grid' },
            h('label', { class: 'field' }, h('span', null, 'Watermelon gap threshold (pp)'), gapInput),
            h('label', { class: 'field' }, h('span', null, 'Calibration evidence floor (n)'), floorNInput),
            h('label', { class: 'field' }, h('span', null, 'Reliability hold floor (%)'), relInput),
            h('label', { class: 'field' }, h('span', null, 'Max concurrent pacts / span'), fanInput),
            h('label', { class: 'field field-check' }, autoCheck, h('span', null, 'Automatic post-commit propagation')),
          ),
          kv('Double-loop rule', `Exonerates execution when leading >= ${conv.catchballLeadingFloorPct}% and lagging <= ${conv.catchballThesisRedPct}% past midpoint.`),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: saveConventions }, 'Save conventions'),
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Run Catchball scan'),
          ),
        ),
      }),
    );
  }

  /* -------------------------------------------------------------- Panel 5: Brief */
  function briefPanel() {
    const brief = ctx.api.catchballBriefText();
    return h(
      'div',
      { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Identity-free executive brief & aggregate CSV (#78)',
        body: 'Contains counts, intervals, HHI concentration, and out-of-sample calibration only — zero person names, zero person ids, and zero free-text negotiation notes.',
      }),
      card({
        title: 'Board-Ready Hoshin Kanri & Catchball Brief',
        subtitle: `Snapshot for ${dayKey(now)}`,
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief }, 'Download Markdown brief'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportCsv }, 'Download CSV #79'),
        ],
        body: h('pre', { class: 'brief-text', tabindex: '0' }, brief),
      }),
      card({
        title: 'Honest Boundaries',
        body: h(
          'ul',
          { class: 'stack-tight' },
          h('li', null, 'Local Operating Seats are auditable workflow declarations inside one browser store, not authenticated multi-user security.'),
          h('li', null, 'Primary + complementary small-cell suppression blocks direct parent-minus-sibling differencing on executive views; it is not differential privacy.'),
          h('li', null, 'Double-loop thesis exoneration flags causal bet mismatches for human review; no rule auto-cancels a Breakthrough Bet or alters a budget without human action.'),
        ),
      }),
    );
  }

  const header = pageHeader({
    eyebrow: 'Schema v90 · ADR-0084 · RULE-HK-01..03',
    title: 'Hoshin Kanri & Catchball Cascade',
    subtitle: 'Deploy Breakthrough Bets down the command chain through capacity-priced bilateral Catchball, separate execution drift from flawed strategic theses, and expose Watermelon roll-ups before period-end.',
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Run scan'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'workbench') }, 'Open Catchball workbench'),
    ],
  });

  const body = panel === 'matrix'
    ? matrixPanel()
    : panel === 'workbench'
      ? workbenchPanel()
      : panel === 'watermelon'
        ? watermelonPanel()
        : panel === 'calibration'
          ? calibrationPanel()
          : briefPanel();

  return h(
    'div',
    { class: 'page' },
    header,
    tabs({
      items: [
        { key: 'matrix', label: 'X-Matrix & spans' },
        { key: 'workbench', label: 'Catchball workbench', count: report.openNegotiations.length || undefined },
        { key: 'watermelon', label: 'Bowler & Watermelon', count: (report.watermelons.length + report.thesisSuspects.length) || undefined },
        { key: 'calibration', label: 'Calibration & fan-out' },
        { key: 'brief', label: 'Executive brief' },
      ],
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Hoshin Kanri and Catchball Cascade sections',
    }),
    h('div', { class: 'stack' }, body),
  );
}
