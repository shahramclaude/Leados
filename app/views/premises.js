/**
 * app/views/premises.js — the Assumption Ledger / Premise Sentinel (`#/premises`).
 *
 * Four tabs in the order a leader acts:
 *   Ledger   → what we assumed, how belief moved, and what needs a human
 *   Evidence → every dated observation with its exact log-odds contribution
 *   Exposure → the economic size of the decision whose premise is decaying
 *   Policy   → thresholds, half-life, the sensor registry and the four rules
 *
 * Rendering and explaining only. Every mutation goes through `ctx.api`; the
 * post-commit spine owns cross-module propagation.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv,
} from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import {
  PREMISE_CRITICALITY_LABELS,
  PREMISE_EVIDENCE_STRENGTHS,
  PREMISE_RULES,
  PREMISE_SPRT_BETA,
  PREMISE_SPRT_ALPHA,
  PREMISE_SPRT_CHALLENGE,
  PREMISE_SPRT_SUPPORT,
  PREMISE_STATUS_LABELS,
  PREMISE_DISCOUNT_FLOOR,
  buildPremiseReport,
  premiseBrief,
  premiseSignals,
} from '../core/domain/premises.js';
import { buildPremiseCalibrationReport } from '../core/domain/premiseCalibration.js';
import { simulatePremiseTails, premiseTailBrief } from '../core/domain/premiseTails.js';
import {
  openPremiseDialog,
  openPremiseEvidenceDialog,
  openPremiseReviewDialog,
  openPremiseOutcomeDialog,
} from '../ui/premise-modals.js';

const TABS = [
  { key: 'ledger', label: 'Ledger' },
  { key: 'evidence', label: 'Evidence lab' },
  { key: 'calibration', label: 'Sensor calibration' },
  { key: 'tails', label: 'Scenario tails' },
  { key: 'exposure', label: 'Decision exposure' },
  { key: 'policy', label: 'Policy & sensors' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

function statusTone(status) {
  if (status === 'breached') return 'bad';
  if (status === 'watch') return 'warn';
  if (status === 'unobserved') return 'caution';
  if (status === 'supported' || status === 'reaffirmed') return 'good';
  return 'info';
}

function propagationToast(prefix, res) {
  const n = Array.isArray(res?.propagations) ? res.propagations.length : 0;
  toast(n ? `${prefix} ${n} cross-module effect(s) propagated automatically (see Signals).` : prefix, 'good');
}

function pct(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : `${Number(value).toFixed(1)}%`;
}

function money(value, currency) {
  if (value === null || value === undefined) return '—';
  return `${currency} ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function beliefBar(row) {
  return h('div', { class: 'view-stack', style: 'gap:3px;min-width:150px' },
    h('span', { class: 'small' }, `${row.evaluation.priorPct}% → `, h('strong', null, pct(row.evaluation.posteriorPct))),
    progressBar(row.evaluation.posteriorPct, {
      label: `Posterior belief for ${row.title}`,
      tone: row.evaluation.status === 'breached' ? 'bad' : row.evaluation.status === 'watch' ? 'warn' : 'neutral',
    }),
    h('span', { class: 'muted tiny' }, `watch ${row.evaluation.watchPct}% · breach ${row.evaluation.breachPct}%`));
}

/* ------------------------------------------------------------------ ledger */

function ledgerTab(ctx, report) {
  const outcomes = ctx.state.premiseOutcomes || [];
  const rows = report.premises.map((p) => {
    const conclusiveOutcome = outcomes.find((outcome) => outcome.premiseId === p.id && ['held', 'failed'].includes(outcome.verdict));
    return ({
    premise: h('div', { class: 'view-stack', style: 'gap:3px' },
      h('a', {
        class: 'link',
        href: `#/premises?tab=evidence&premise=${encodeURIComponent(p.id)}`,
        onClick: (e) => { e.preventDefault(); ctx.navigate(`#/premises?tab=evidence&premise=${encodeURIComponent(p.id)}`); },
      }, p.title),
      h('span', { class: 'muted tiny' }, `${PREMISE_CRITICALITY_LABELS[p.criticality] || p.criticality} · ${p.decisionTitle || 'unanchored'}`)),
    status: badge(PREMISE_STATUS_LABELS[p.evaluation.status] || p.evaluation.status, statusTone(p.evaluation.status)),
    belief: beliefBar(p),
    evidence: h('div', { class: 'view-stack', style: 'gap:2px' },
      h('span', { class: 'small' }, `${p.evaluation.evidenceCount} obs · BF ${p.evaluation.bayesFactor}`),
      h('span', { class: 'muted tiny' }, `${p.evaluation.confidence} · ${p.evaluation.sprtVerdict}`),
      p.pendingCount ? badge(`${p.pendingCount} pending sensor obs`, 'caution') : null),
    review: h('div', { class: 'view-stack', style: 'gap:2px' },
      h('span', { class: 'small' }, p.ownerName || 'Unassigned'),
      h('span', { class: p.reviewOverdue ? 'text-bad small' : 'muted tiny' }, p.reviewOverdue ? `overdue ${p.reviewDaysOverdue}d` : p.reviewBy || 'no date')),
    actions: h('div', { class: 'row-gap wrap' },
      h('button', {
        class: 'btn btn-tiny btn-ghost', type: 'button',
        onClick: () => openPremiseEvidenceDialog(ctx, { premise: p }),
      }, 'Evidence'),
      h('button', {
        class: 'btn btn-tiny btn-ghost', type: 'button',
        onClick: () => openPremiseReviewDialog(ctx, { premise: p }),
      }, 'Review'),
      h('button', {
        class: 'btn btn-tiny btn-ghost', type: 'button', disabled: Boolean(conclusiveOutcome),
        onClick: () => openPremiseOutcomeDialog(ctx, { premise: p }),
      }, conclusiveOutcome ? `Outcome: ${conclusiveOutcome.verdict}` : 'Assess outcome'),
      h('button', {
        class: 'btn btn-tiny btn-ghost', type: 'button',
        onClick: () => openPremiseDialog(ctx, { premise: p }),
      }, 'Edit')),
  });
  });
  return h('div', { class: 'view-stack' },
    card({
      title: 'Pre-registered assumptions',
      subtitle: 'Dewar’s Assumption-Based Planning: a load-bearing premise has a named owner, a falsification signpost and a review date. Belief is recomputed from dated evidence, not from sentiment.',
      actions: [h('button', {
        class: 'btn btn-small btn-primary', type: 'button', onClick: () => openPremiseDialog(ctx),
      }, 'Register assumption')],
      body: rows.length ? table({
        caption: 'Assumption ledger with posterior belief and signpost review status',
        columns: [
          { label: 'Premise', render: (r) => r.premise },
          { label: 'Status', render: (r) => r.status },
          { label: 'Belief', render: (r) => r.belief },
          { label: 'Evidence', render: (r) => r.evidence },
          { label: 'Owner / review', render: (r) => r.review },
          { label: 'Actions', render: (r) => r.actions },
        ],
        rows,
      }) : emptyState({
        icon: '⟡',
        title: 'No assumptions have been pre-registered',
        body: 'Decisions age. Register the premise behind the next irreversible call, name the signpost that would invalidate it, and attach the records that can prove or disprove it.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPremiseDialog(ctx) }, 'Register the first assumption'),
      }),
    }),
    card({
      title: 'What a breach actually does',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'A fresh signpost breach opens exactly one four-option DACI re-decision (hedge, pause, reverse, buy information), one signpost-verification delegation to the owner, one blameless 1:1 prompt, and typed links back to the original decision. Decision Tempo prices the cost of delay in the same atomic transaction. No plan is reversed automatically.'),
        h('p', { class: 'muted small' }, 'A dated human reaffirmation suppresses duplicate re-decisions until genuinely new evidence is created after the acknowledgement; retirement is permanent and is recorded, never silently deleted.')),
    }));
}

/* ---------------------------------------------------------------- evidence */

function evidenceTab(ctx, report, selected) {
  if (!selected) {
    return card({
      title: 'Evidence lab',
      body: emptyState({ icon: '⌁', title: 'Choose a premise', body: 'Register a premise, then inspect every dated observation and the exact log-odds contribution it made.' }),
    });
  }
  const e = selected.evaluation;
  const selector = h('select', { 'aria-label': 'Choose a premise to inspect' },
    ...report.premises.map((p) => h('option', { value: p.id }, p.title)));
  selector.value = selected.id;
  selector.addEventListener('change', () => ctx.navigate(`#/premises?tab=evidence&premise=${encodeURIComponent(selector.value)}`));
  const rows = [...selected.observations].reverse().map((o) => ({
    date: o.observedOn,
    sensor: h('div', { class: 'view-stack', style: 'gap:2px' },
      o.sourceRoute ? h('a', { class: 'link', href: o.sourceRoute }, o.title) : h('span', null, o.title),
      h('span', { class: 'muted tiny' }, o.sensorLabel || o.sensorId)),
    direction: badge(o.direction === 'for' ? 'For' : 'Against', o.direction === 'for' ? 'good' : 'bad'),
    lr: `×${o.likelihoodRatio}`,
    age: `${o.ageDays}d · ${(o.discount * 100).toFixed(0)}%`,
    bits: h('strong', { class: o.bits >= 0 ? 'text-good' : 'text-bad' }, `${o.bits >= 0 ? '+' : ''}${o.bits}`),
    detail: h('span', { class: 'muted small' }, o.summary || ''),
  }));
  const pendingRows = selected.pendingObservations.slice(0, 20).map((o) => ({
    date: o.observedOn,
    sensor: o.sensorLabel || o.sensorId,
    title: o.title,
    direction: badge(o.direction === 'for' ? 'For' : 'Against', o.direction === 'for' ? 'good' : 'bad'),
    lr: `×${o.likelihoodRatio}`,
  }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'Evidence lab',
      subtitle: 'Good’s weight of evidence in log-odds form. Every observation is dated, directional, strength-graded and discounted by the half-life; history is append-only.',
      actions: [selector],
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Prior → posterior', value: `${e.priorPct}% → ${pct(e.posteriorPct)}`, hint: `Bayes factor ${e.bayesFactor}` }),
          stat({ label: 'Evidence count', value: e.evidenceCount, hint: `${e.supportCount} for · ${e.againstCount} against` }),
          stat({ label: 'Discounted weight', value: `${e.discountedWeightBits} bits`, hint: `floor ${PREMISE_DISCOUNT_FLOOR}` }),
          stat({ label: 'Information gain', value: `${e.informationGainBits} bits`, hint: `KL from prior to posterior` }),
          stat({ label: 'Wald-style boundary', value: e.sprtVerdict.replace('-', ' '), hint: `α ${PREMISE_SPRT_ALPHA} · β ${PREMISE_SPRT_BETA}` })),
        h('div', { class: 'view-stack', style: 'gap:4px' },
          kv('Log prior odds', String(e.logPriorOdds)),
          kv('Cumulative log Bayes factor', `${e.logBayesFactor} (support ${PREMISE_SPRT_SUPPORT.toFixed(3)}, challenge ${PREMISE_SPRT_CHALLENGE.toFixed(3)})`),
          kv('Bits for / against', `${e.supportBits} / ${e.againstBits} · confidence ${e.confidence}`),
          kv('Entropy prior → posterior (bits)', `${e.entropyPriorBits} → ${e.entropyPosteriorBits}`),
          kv('Half-life', `${e.halfLifeDays} days · watch ${e.watchPct}% · breach ${e.breachPct}%`),
          kv('Typed evidence scope', `${selected.scopeCount} record(s); ${selected.pendingCount} sensor observation(s) pending`)),
        h('p', { class: 'muted small' }, 'Wald boundaries are a sequential-evidence discipline, not a formal p-value: leadership observations are heterogeneous and not independent draws. Likelihood ratios are transparent conventions chosen by the leader, not calibrated statistical models.'),
      ),
    }),
    card({
      title: 'Append-only observation ledger',
      subtitle: `Showing ${rows.length} committed observation(s) for “${selected.title}”.`,
      body: rows.length ? table({
        caption: `Dated observations for ${selected.title}`,
        columns: [
          { label: 'Observed', render: (r) => r.date },
          { label: 'Source', render: (r) => r.sensor },
          { label: 'Direction', render: (r) => r.direction },
          { label: 'LR', render: (r) => r.lr },
          { label: 'Age / weight', render: (r) => r.age },
          { label: 'Bits', render: (r) => r.bits },
          { label: 'Recorded fact', render: (r) => r.detail },
        ],
        rows,
      }) : emptyState({ icon: '◇', title: 'No evidence yet', body: 'A premise with no evidence is unmeasured, not true. Attach a source, run a signpost scan, or record a dated observation explicitly.' }),
    }),
    pendingRows.length ? card({
      title: 'Sensor observations visible but not yet committed',
      subtitle: 'Run an explicit signpost scan to append these idempotently; the rule never rewrites existing history.',
      body: table({
        caption: 'Pending premise sensor observations',
        columns: [
          { label: 'Observed', render: (r) => r.date },
          { label: 'Sensor', render: (r) => r.sensor },
          { label: 'Source', render: (r) => r.title },
          { label: 'Direction', render: (r) => r.direction },
          { label: 'LR', render: (r) => r.lr },
        ],
        rows: pendingRows,
      }),
    }) : null,
  );
}

/* ----------------------------------------------------------- calibration */

function calibrationTab(state) {
  const report = buildPremiseCalibrationReport(state);
  const sensorRows = report.sensors.map((sensor) => ({
    sensor: h('div', { class: 'view-stack', style: 'gap:2px' },
      h('strong', { class: 'small' }, sensor.label),
      h('span', { class: 'muted tiny' }, sensor.sensorId)),
    sample: h('div', { class: 'view-stack', style: 'gap:2px' },
      badge(sensor.status === 'scored' ? 'Scored' : 'Counts only', sensor.status === 'scored' ? 'good' : 'caution'),
      h('span', { class: 'muted tiny' }, `${sensor.count} settled premise(s)`)),
    brier: sensor.brier === null ? 'Withheld (<5)' : sensor.brier.toFixed(4),
    forecast: sensor.meanForecast === null ? '—' : `${(sensor.meanForecast * 100).toFixed(1)}%`,
    realized: sensor.observedRate === null ? '—' : `${(sensor.observedRate * 100).toFixed(1)}%`,
    gap: sensor.calibrationGap === null ? '—' : `${sensor.calibrationGap >= 0 ? '+' : ''}${(sensor.calibrationGap * 100).toFixed(1)} pp`,
    accuracy: sensor.accuracy === null ? '—' : `${(sensor.accuracy * 100).toFixed(1)}%`,
    drift: sensor.drift ? `PSI ${sensor.drift.psi.toFixed(4)} · n ${sensor.drift.earlierN}/${sensor.drift.recentN}` : 'Not enough cohorts',
  }));
  const outcomeRows = [...(state.premiseOutcomes || [])]
    .sort((a, b) => String(b.settledOn).localeCompare(String(a.settledOn)))
    .map((outcome) => ({
      premise: state.premises?.find((p) => p.id === outcome.premiseId)?.title || 'Missing premise',
      verdict: badge(outcome.verdict, outcome.verdict === 'held' ? 'good' : outcome.verdict === 'failed' ? 'bad' : 'caution'),
      settled: outcome.settledOn,
      note: outcome.note || '—',
      lineage: h('a', { class: 'link', href: `#/premises?tab=ledger` }, 'Open ledger'),
    }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'Outcome-scored sensor reliability',
      subtitle: 'Brier scoring (0 is perfect; lower is better) and calibration gap compare what each sensor implied with what the leader later assessed. Each premise counts once per sensor.',
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Conclusive outcomes', value: report.outcomeCount, hint: 'one held/failed assessment per premise' }),
          stat({ label: 'Sensors scored', value: report.scoredSensorCount, hint: `minimum ${report.minimumSamples} settled premises each` }),
          stat({ label: 'Forecast-mix drift floor', value: `${report.driftMinPerCohort} + ${report.driftMinPerCohort}`, hint: 'earlier + recent samples for PSI' })),
        sensorRows.length ? table({
          caption: 'Sensor calibration metrics by sensor, with sample-size floor',
          columns: [
            { label: 'Sensor', render: (r) => r.sensor },
            { label: 'Sample', render: (r) => r.sample },
            { label: 'Brier ↓', render: (r) => r.brier },
            { label: 'Mean forecast', render: (r) => r.forecast },
            { label: 'Held rate', render: (r) => r.realized },
            { label: 'Calibration gap', render: (r) => r.gap },
            { label: 'Directional accuracy', render: (r) => r.accuracy },
            { label: 'Mix drift', render: (r) => r.drift },
          ],
          rows: sensorRows,
        }) : emptyState({
          icon: '⌁', title: 'No sensor outcomes to score',
          body: 'Use “Assess outcome” on a premise after reality is observable. Inconclusive checkpoints are kept for history but do not enter calibration.',
        }),
        h('p', { class: 'muted small' }, report.caveats.join(' ')),
        h('p', { class: 'muted tiny' }, `Engine ${report.engineVersion}. PSI compares the distribution of sensor-implied forecast probabilities between earlier and recent cohorts; it is not a quality verdict. No likelihood ratio is changed automatically.`),
      ),
    }),
    card({
      title: 'Append-only outcome ledger',
      subtitle: 'Truth labels are human assessments, never generated by a sensor. Notes stay in the local workspace and are excluded from the opaque calibration export.',
      body: outcomeRows.length ? table({
        caption: 'Human-assessed premise outcomes',
        columns: [
          { label: 'Premise', render: (r) => r.premise },
          { label: 'Assessment', render: (r) => r.verdict },
          { label: 'Knowable on', render: (r) => r.settled },
          { label: 'Context', render: (r) => r.note },
          { label: 'Lineage', render: (r) => r.lineage },
        ],
        rows: outcomeRows,
      }) : emptyState({ icon: '◇', title: 'No outcomes recorded', body: 'A scored sensor needs an outcome measured after the evidence, not a confidence story written after the fact.' }),
    }),
  );
}

/* -------------------------------------------------------------------- tails */

function tailsTab(ctx) {
  const sim = simulatePremiseTails(ctx.state, { now: ctx.now });
  if (!sim.available) {
    return h('div', { class: 'view-stack' },
      card({ title: 'Assumption-aware scenario tails', subtitle: sim.basis,
        body: emptyState({ icon: '◧', title: 'Tails not computable yet', body: sim.reason }) }),
      (sim.unmeasured || []).length ? card({ title: 'Excluded premises', subtitle: 'Unmeasured premises are never coupled — a prior is not a frequency.',
        body: table({ caption: 'Premises excluded from tail coupling', columns: [
          { label: 'Premise', render: (r) => r.title },
          { label: 'Belief', render: (r) => `${r.posteriorPct}%` },
          { label: 'Why excluded', render: (r) => r.reason },
        ], rows: sim.unmeasured }) }) : null);
  }
  const rows = sim.contributions.map((c) => ({
    premise: h('div', { class: 'view-stack', style: 'gap:2px' },
      h('span', { class: 'small' }, c.title),
      h('span', { class: 'muted tiny' }, `${c.status} · ${c.itemCount} coupled item(s)`)),
    belief: `${c.posteriorPct}% (failure stress ${(c.failureProbability * 100).toFixed(0)}%)`,
    shock: `+${Math.round(c.shock * 100)}% effort if it fails`,
    contribution: h('strong', {}, `+${c.tailContributionDays} P90 days`),
    evidence: c.pseudoReplicated
      ? badge(`Pseudo-replicated · top source ${Math.round(c.largestSourceShare * 100)}%`, 'bad')
      : badge('Independent sources', 'good'),
  }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'How much wider is the tail because your assumptions may be wrong?',
      subtitle: `${sim.basis}. Paired seeded simulation (${sim.trials} trials, seed ${sim.seed}) — identical effort draws with and without premise failure (Common Random Numbers), so the delta isolates fragility, not noise. Shock convention: +60% load-bearing / +40% major / +25% monitor effort on failure, capped ×3 per item.`,
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Baseline P90', value: `${sim.baseline.p90}d`, hint: `P50 ${sim.baseline.p50}d · P80 ${sim.baseline.p80}d` }),
          stat({ label: 'Premise-coupled P90', value: `${sim.coupled.p90}d`, hint: `P50 ${sim.coupled.p50}d · P80 ${sim.coupled.p80}d`, tone: sim.delta.p90Days > 0 ? 'warn' : '' }),
          stat({ label: 'Tail widening', value: `+${sim.delta.p90Days}d`, hint: `${sim.delta.wideningPct}% wider at P90`, tone: sim.delta.wideningPct >= 15 ? 'bad' : '' }),
          stat({ label: 'Overload risk', value: `${(sim.baseline.overloadProbability * 100).toFixed(0)}% → ${(sim.coupled.overloadProbability * 100).toFixed(0)}%`, hint: `vs ${sim.allocatableDays} allocatable days` })),
        rows.length ? table({ caption: 'Leave-one-out premise tail attribution — days recovered at P90 if that premise is held true',
          columns: [
            { label: 'Premise', render: (r) => r.premise },
            { label: 'Belief', render: (r) => r.belief },
            { label: 'Failure shock', render: (r) => r.shock },
            { label: 'Tail contribution', render: (r) => r.contribution },
            { label: 'Evidence independence', render: (r) => r.evidence },
          ], rows }) : emptyState({ icon: '◧', title: 'No coupled premises', body: 'Link a premise (via its decision) to measured committed portfolio work and record at least one dated observation.' }),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
          const ok = downloadText({ filename: `leados-assumption-tails-${dayKey(ctx.now)}.txt`, text: premiseTailBrief(ctx.state, ctx.now), mime: 'text/plain;charset=utf-8' });
          toast(ok ? 'Tail brief downloaded' : 'Download unavailable', ok ? 'good' : 'bad');
        } }, 'Download tail brief'),
        h('p', { class: 'muted small' }, 'Read this as: “if the assumption fails, this is the work that gets slower” — not as a probability that the date will slip. Hedge the dominant premise, buy information, or de-scope its coupled work before adding capacity.'),
      ),
    }),
    sim.unmeasured.length ? card({ title: 'Excluded — honestly unmeasured', subtitle: 'These premises cannot widen a tail until they have committed evidence and a typed link to measured work.',
      body: table({ caption: 'Premises excluded from tail coupling', columns: [
        { label: 'Premise', render: (r) => r.title },
        { label: 'Belief', render: (r) => `${r.posteriorPct}%` },
        { label: 'Why excluded', render: (r) => r.reason },
      ], rows: sim.unmeasured }) }) : null,
  );
}

/* ---------------------------------------------------------------- exposure */

function exposureTab(report) {
  const rows = report.premises.map((p) => ({
    premise: h('div', { class: 'view-stack', style: 'gap:2px' },
      h('span', { class: 'small' }, p.title),
      h('span', { class: 'muted tiny' }, p.decisionTitle ? `${p.decisionTitle} · ${p.decisionReversibility || 'unclassified'}` : 'No decision anchor')),
    value: p.exposure.priced
      ? h('div', { class: 'view-stack', style: 'gap:2px' }, ...p.exposure.byCurrency.map((c) =>
        h('span', { class: 'small' }, money(c.amount, c.currency))))
      : h('span', { class: 'muted small' }, 'Unpriced — no typed money link'),
    indicative: p.exposure.priced
      ? h('div', { class: 'view-stack', style: 'gap:2px' }, ...p.exposure.byCurrency.map((c) =>
        h('strong', { class: 'text-bad' }, money(c.indicativeExposure, c.currency))))
      : '—',
    capacity: p.exposure.capacityDays === null ? '—' : `${p.exposure.capacityDays} person-days`,
    belief: `${p.evaluation.priorPct}% → ${pct(p.evaluation.posteriorPct)}`,
    scope: `${p.scopeCount} typed record(s)`,
    action: h('a', { class: 'btn btn-tiny btn-ghost', href: '#/decisions' }, 'Open decisions'),
  }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'Decision exposure from the typed graph',
      subtitle: 'Value at stake is derived by Decision Tempo from linked cases, budgets and portfolio items. Currencies are never converted or summed. Indicative exposure is the proportional belief loss × linked value — a prioritisation signal, NOT a cash forecast.',
      body: rows.length ? table({
        caption: 'Linked decision value and indicative premise exposure',
        columns: [
          { label: 'Premise / decision', render: (r) => r.premise },
          { label: 'Linked value', render: (r) => r.value },
          { label: 'Indicative exposure', render: (r) => r.indicative },
          { label: 'Capacity signal', render: (r) => r.capacity },
          { label: 'Belief move', render: (r) => r.belief },
          { label: 'Scope', render: (r) => r.scope },
          { label: 'Action', render: (r) => r.action },
        ],
        rows,
      }) : emptyState({ icon: '⌛', title: 'No premises to price', body: 'Register an assumption anchored to a decision with typed links to see what is economically exposed.' }),
    }),
    card({
      title: 'Why exposure is only indicative',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'A broken premise does not mean the whole linked value is lost. The number answers a narrower question: if belief fell by X percentage points, what share of the recorded value at stake deserves a fresh look? It is a ranking device for attention, not an accounting provision.'),
        h('p', { class: 'muted small' }, 'Decision Tempo’s EVSI calculation prices whether buying more information is worth waiting for; the Premise Sentinel supplies the new evidence and its confidence grade. A leader still makes the call.')),
    }),
  );
}

/* ------------------------------------------------------------------ policy */

function policyTab(ctx, report) {
  const watchInput = h('input', {
    type: 'number', min: 10, max: 90, step: 1, value: report.policy.watchPct,
    'aria-label': 'Premise watch threshold percent', style: 'max-width:130px',
  });
  const breachInput = h('input', {
    type: 'number', min: 5, max: 85, step: 1, value: report.policy.breachPct,
    'aria-label': 'Premise breach threshold percent', style: 'max-width:130px',
  });
  const halfInput = h('input', {
    type: 'number', min: 7, max: 365, step: 1, value: report.policy.halfLifeDays,
    'aria-label': 'Evidence half-life in days', style: 'max-width:130px',
  });
  const reviewInput = h('input', {
    type: 'number', min: 7, max: 180, step: 1, value: report.policy.reviewDays,
    'aria-label': 'Signpost review cadence in days', style: 'max-width:130px',
  });
  const autoInput = h('input', { type: 'checkbox', 'aria-label': 'Automatic premise governance propagation' });
  autoInput.checked = report.policy.autoPropagate;
  const sensorRows = report.sensors.map((s) => ({
    label: s.label,
    framework: s.framework,
    source: s.sourceType,
    triggers: s.eventPrefixes.join(', '),
  }));
  const ruleRows = PREMISE_RULES.map((r) => ({
    id: r.id,
    name: r.name,
    target: r.targetModule,
    trigger: r.trigger,
  }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'Premise policy',
      subtitle: 'Conventions you own, applied consistently. Changing policy re-evaluates the ledger through the same post-commit rule.',
      body: h('div', { class: 'view-stack' },
        h('label', { class: 'small' }, 'Watch threshold (posterior below this enters watch): ', watchInput),
        h('label', { class: 'small' }, 'Breach threshold (posterior at or below this opens one re-decision): ', breachInput),
        h('p', { class: 'muted small' }, `Defaults 55 / 30. Wald-style log-BF boundaries are fixed and visible: support ${PREMISE_SPRT_SUPPORT.toFixed(3)}, challenge ${PREMISE_SPRT_CHALLENGE.toFixed(3)} (α ${PREMISE_SPRT_ALPHA}, β ${PREMISE_SPRT_BETA}).`),
        h('label', { class: 'small' }, 'Evidence half-life (days): ', halfInput),
        h('p', { class: 'muted small' }, `Each observation’s weight is multiplied by 2^(-age/half-life), floored at ${PREMISE_DISCOUNT_FLOOR}. History weakens; it never silently vanishes.`),
        h('label', { class: 'small' }, 'Signpost review cadence (days): ', reviewInput),
        h('label', { class: 'small' }, autoInput, ' Automatic governance propagation (RULE-PREM-03..04). Pausing suppresses new re-decisions, delegations and prompts; sensing, typed links and belief updates stay live, and an explicit scan always runs.'),
        h('div', null, h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const res = ctx.api.setPremisePolicy({
              watchPct: Number(watchInput.value),
              breachPct: Number(breachInput.value),
              halfLifeDays: Number(halfInput.value),
              reviewDays: Number(reviewInput.value),
              autoPropagate: autoInput.checked,
            });
            if (res.ok) { toast('Premise policy saved', 'good'); ctx.refresh(); } else toast(res.error, 'bad');
          },
        }, 'Save policy')),
      ),
    }),
    card({
      title: 'Manual evidence strengths',
      body: h('div', { class: 'view-stack' },
        ...Object.entries(PREMISE_EVIDENCE_STRENGTHS).map(([key, lr]) =>
          kv(key.charAt(0).toUpperCase() + key.slice(1), `likelihood ratio ×${lr} (${(Math.log2(lr)).toFixed(2)} bits before decay)`)),
        h('p', { class: 'muted small' }, 'These are leadership conventions, not calibrated likelihoods. Sensor ratios are declared in `PREMISE_SENSORS` and are visible in code; the UI never hides a weight.'),
      ),
    }),
    card({
      title: 'Declarative sensor registry — how new modules plug in',
      subtitle: 'One sensor object declares a source type, event prefixes and a pure extraction function. No hardcoded per-module glue.',
      body: table({
        caption: 'Premise Sentinel sensors',
        columns: [
          { label: 'Sensor', render: (r) => r.label },
          { label: 'Framework', render: (r) => r.framework },
          { label: 'Source type', render: (r) => r.source },
          { label: 'Event prefixes', render: (r) => r.triggers },
        ],
        rows: sensorRows,
      }),
    }),
    card({
      title: 'Automation rules on the shared event spine',
      body: table({
        caption: 'Premise Sentinel post-commit rules',
        columns: [
          { label: 'Rule', render: (r) => r.id },
          { label: 'Name', render: (r) => r.name },
          { label: 'Targets', render: (r) => r.target },
          { label: 'Trigger', render: (r) => r.trigger },
        ],
        rows: ruleRows,
      }),
    }),
    card({
      title: 'Fixed guardrails (not settings)',
      body: h('p', { class: 'small' }, 'Priors are clamped to 5–95% (Cromwell’s rule). Conflicts and anonymous pulses are never read. Unrated FMEA cases, unpriced budgets and settled work without recorded actuals produce no fabricated evidence. A breach opens a proposal, never an automatic reversal. A human reaffirmation is dated and can only be reopened by genuinely newer evidence. CSV scope #35 exports belief telemetry under opaque codes only.'),
    }),
  );
}

/* -------------------------------------------------------------------- view */

export function renderPremises(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'ledger';
  const report = buildPremiseReport(ctx.state, ctx.now);
  const signals = premiseSignals(ctx.state, ctx.now);
  const selectedId = ctx.query.get('premise');
  const selected = report.premises.find((p) => p.id === selectedId) || report.premises[0] || null;
  const body = tab === 'ledger'
    ? ledgerTab(ctx, report)
    : tab === 'evidence'
      ? evidenceTab(ctx, report, selected)
      : tab === 'calibration'
        ? calibrationTab(ctx.state)
        : tab === 'tails'
          ? tailsTab(ctx)
          : tab === 'exposure'
          ? exposureTab(report)
          : policyTab(ctx, report);
  const signalCards = signals.map((s) => banner({
    tone: s.severity >= 4 ? 'bad' : s.severity >= 3 ? 'warn' : 'info',
    title: s.title,
    body: s.detail,
    actions: s.action ? [h('a', { class: 'btn btn-ghost', href: s.action.route }, s.action.label)] : [],
  }));
  const pricedCount = report.premises.filter((p) => p.exposure.priced).length;
  const loadBearingCount = report.premises.filter((p) => p.criticality === 'load-bearing').length;
  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: 'Premise Sentinel · Schema v36',
      title: 'Is the reason you decided still true?',
      subtitle: 'Pre-register load-bearing assumptions, sense dated evidence from every module, update belief in transparent log-odds, and turn a pre-declared signpost into a governed re-decision — locally, deterministically, with no surveillance.',
      actions: [
        h('button', {
          class: 'btn btn-primary', type: 'button', onClick: () => openPremiseDialog(ctx),
        }, 'Register assumption'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const res = ctx.api.scanPremises();
            if (res.ok) { propagationToast('Signpost scan complete.', res); ctx.refresh(); } else toast(res.error || 'Scan failed', 'bad');
          },
        }, 'Run signpost scan'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const ok = downloadText({
              filename: `leados-assumption-ledger-${dayKey(ctx.now)}.txt`,
              text: premiseBrief(ctx.state, ctx.now),
              mime: 'text/plain;charset=utf-8',
            });
            toast(ok ? 'Board brief downloaded' : 'Download was not available in this browser', ok ? 'good' : 'bad');
          },
        }, 'Download board brief'),
      ],
    }),
    report.policy.autoPropagate ? null : banner({
      tone: 'warn',
      title: 'Premise governance propagation is paused',
      body: 'Evidence sensing, typed links and belief updates remain live. New re-decisions, verification delegations and 1:1 prompts are suppressed until you resume here or run an explicit scan.',
      actions: [h('a', { class: 'btn btn-ghost', href: '#/premises?tab=policy' }, 'Open policy')],
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Premises', value: report.totals.count, hint: `${loadBearingCount} load-bearing` }),
      stat({ label: 'Breached signposts', value: report.totals.breached, hint: 'one governed re-decision each', tone: report.totals.breached ? 'bad' : '' }),
      stat({ label: 'Watch band', value: report.totals.watch, hint: `below ${report.policy.watchPct}% belief`, tone: report.totals.watch ? 'warn' : '' }),
      stat({ label: 'Overdue reviews', value: report.totals.stale, hint: `${report.policy.reviewDays}-day cadence`, tone: report.totals.stale ? 'warn' : '' }),
      stat({ label: 'Pending observations', value: report.totals.pending, hint: 'visible in workspace, not yet in ledger' }),
      stat({ label: 'Priced decisions', value: pricedCount, hint: 'typed value links; currencies not summed' })),
    signalCards.length ? h('div', { class: 'view-stack' }, ...signalCards) : null,
    tabs({
      items: TABS.map((t) => ({
        ...t,
        count: t.key === 'ledger' ? report.totals.count : t.key === 'evidence' ? report.totals.pending : t.key === 'calibration' ? (ctx.state.premiseOutcomes || []).length || undefined : undefined,
      })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/premises?tab=${key}`),
      ariaLabel: 'Assumption Ledger sections',
    }),
    body);
}
