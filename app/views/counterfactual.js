/**
 * app/views/counterfactual.js — the Counterfactual Policy Terminal
 * (`#/counterfactual`, Schema v76, ADR-0068).
 *
 * Six panels over decision points harvested from records the leader already
 * keeps — no new data entry, no new form, nothing to maintain:
 *  - Race:        five named policies priced off-policy against the record.
 *  - Bounds:      Manski partial identification — what is known with no
 *                 assumption at all, and what the family record can tighten.
 *  - Sensitivity: matched pairs, McNemar, and the Rosenbaum hidden-bias bound.
 *  - Families:    the four decision-point families, each with its own question
 *                 and the confounder the record cannot remove.
 *  - Ledger:      frozen evaluations, their grades and lapses, plus a
 *                 time-uniform confidence sequence for the recorded score.
 *  - Method:      the equations, the floors and every explicit refusal.
 */

import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey } from '../core/time.js';
import {
  counterfactualReport,
} from '../core/domain/counterfactualPolicy.js';
import {
  COUNTERFACTUAL_LIMITS,
  COUNTERFACTUAL_RULES,
  POLICY_FAMILIES,
  POLICY_FAMILY_META,
  POLICY_IDS,
  POLICY_META,
  POLICY_VERDICT_META,
} from '../core/domain/counterfactualRegistry.js';

const PANELS = [
  { key: 'race', label: 'Policy race' },
  { key: 'bounds', label: 'What is identified' },
  { key: 'sensitivity', label: 'Hidden bias' },
  { key: 'families', label: 'Decision points' },
  { key: 'ledger', label: 'Ledger & sequence' },
  { key: 'method', label: 'Method & refusals' },
];

const TONE_BY_VERDICT = {
  insufficient: 'neutral',
  'refused-unidentifiable': 'neutral',
  'bounded-better': 'good',
  'bounded-worse': 'bad',
  'supported-better': 'good',
  'supported-worse': 'bad',
  suggestive: 'caution',
  'no-difference': 'neutral',
  observed: 'neutral',
};

const uiState = { family: 'all' };

const num = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));
const pct = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(dp)}%`);
const signed = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(dp)}pp`);

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  const fam = extra.family !== undefined ? extra.family : ctx.query.get('family');
  if (fam && fam !== 'all') q.set('family', fam);
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'family') continue;
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/counterfactual?${q.toString()}`);
}

function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const ch of children) {
    if (ch == null) continue;
    el.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  }
  return el;
}

/* ------------------------------------------------------------------ *
 * Race
 * ------------------------------------------------------------------ */

function racePanel(ctx, report) {
  if (!report.observable) {
    return emptyState({
      title: 'Not enough decision points to price a counterfactual',
      body: `The floor is ${report.floors.minUnits} scored decision points with at least ${report.floors.minUnitsPerArm} in each arm; the record holds ${report.counts.units} (${report.counts.arm1} active / ${report.counts.arm0} hold). Until then this terminal prints counts and refuses to estimate — an off-policy value over a handful of points is a number with no meaning.`,
      action: h('a', { class: 'btn btn-primary', href: '#/counterfactual?panel=families' }, 'See what counts as a decision point'),
    });
  }

  const rows = report.race.slice().sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const observedRow = report.race.find((r) => r.policyId === 'observed');

  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: report.best && ['supported-better', 'bounded-better'].includes(report.best.verdict) ? 'caution' : 'info',
      title: report.best
        ? report.best.policyId === 'observed'
          ? 'The record is the best-scoring policy on the board'
          : `${report.best.policyMeta.label} — ${report.best.verdictMeta.label}`
        : 'No policy could be priced',
      body: report.best
        ? `${report.best.verdictMeta.summary} ${report.best.verdictReason}. This terminal never adopts a policy: it prices one and hands you the ruling.`
        : 'Every policy sat below the effective-sample floor.',
    }),
    card({
      title: 'Off-policy values (Dudík, Langford & Li 2011)',
      subtitle: `One reward is observed per decision point, under the arm that was taken. Every other value here is an estimate over an unobserved quantity. The headline is the self-normalised (Hájek) estimator, bounded by the reward range; DM, IPS and the doubly-robust cross-check sit beside it because they fail differently. Recorded behaviour scored ${pct(report.observedValue)}.`,
      body: table({
        caption: 'Named policies priced against the recorded behaviour policy',
        rows,
        columns: [
          {
            label: 'Policy',
            render: (r) => h(
              'div',
              null,
              h('strong', null, r.policyMeta.label),
              h('div', { class: 'muted tiny' }, r.policyId === 'observed'
                ? 'Fully observed — no counterfactual'
                : `Agreement with your record: ${r.agreementPct}%`),
            ),
          },
          { label: 'Value', render: (r) => pct(r.value) },
          { label: 'vs record', render: (r) => (r.policyId === 'observed' ? '—' : signed(r.deltaPp)) },
          {
            label: '95% interval',
            render: (r) => (r.ci ? `${signed(r.ci.lowPp)} … ${signed(r.ci.highPp)}` : '—'),
          },
          {
            label: 'Cross-checks (spread)',
            render: (r) => h(
              'div',
              { class: 'muted tiny' },
              `DM ${pct(r.dm, 0)} · IPS ${pct(r.ips, 0)} · SNIPS ${pct(r.snips, 0)} · DR ${pct(r.dr, 0)}`,
              r.crossCheckSpreadPp !== null && r.crossCheckSpreadPp > 10
                ? h('div', { class: 'tiny' }, badge(`${r.crossCheckSpreadPp}pp spread — fragile`, 'caution'))
                : null,
            ),
          },
          { label: 'Eff. n', render: (r) => num(r.effectiveSample, 1) },
          {
            label: 'Verdict',
            render: (r) => badge(r.verdictMeta.label, TONE_BY_VERDICT[r.verdict] || 'neutral', r.verdictReason),
          },
        ],
      }),
    }),
    card({
      title: 'What each policy actually is',
      subtitle: 'Every policy is a fixed rule whose action at a decision point depends only on records dated before it. None is fitted on the whole sample.',
      body: h(
        'div',
        { class: 'stack-sm' },
        ...POLICY_IDS.map((id) => h(
          'div',
          { class: 'cfp-spec-row' },
          h('strong', null, POLICY_META[id].label),
          h('p', { class: 'muted tiny' }, POLICY_META[id].spec),
          h('p', { class: 'muted tiny' }, POLICY_META[id].note),
        )),
      ),
    }),
    observedRow
      ? card({
        title: 'The one number that needs no assumption',
        subtitle: 'The value of your own behaviour policy is directly observed. It does not need a model, a weight or a bound — which is exactly why every other row is reported as a difference against it.',
        body: h(
          'div',
          { class: 'stat-row' },
          stat({ label: 'Recorded score', value: pct(observedRow.value), hint: `${report.counts.units} decision points` }),
          stat({ label: 'Confidence sequence', value: report.sequenceLast ? `±${num(report.sequenceLast.halfWidth * 100, 1)}pp` : '—', hint: 'time-uniform, valid at every look' }),
          stat({ label: 'Arm split', value: `${report.counts.arm1} / ${report.counts.arm0}`, hint: 'active arm / hold arm' }),
          stat({
            label: 'Effective sample',
            value: num(observedRow.effectiveSample, 1),
            hint: observedRow.effectiveSample < COUNTERFACTUAL_LIMITS.minEffectiveSample ? 'below the floor' : 'weights are well spread',
          }),
        ),
      })
      : null,
  );
}

/* ------------------------------------------------------------------ *
 * Bounds
 * ------------------------------------------------------------------ */

function boundsPanel(report) {
  if (!report.observable) {
    return emptyState({
      title: 'Bounds need units',
      body: 'Partial identification is computed over the same decision points as the race. Below the floor there is nothing to bound.',
    });
  }
  const rows = report.race.filter((r) => r.policyId !== 'observed');
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'Manski (1990) partial identification',
      body: 'For every decision point where a policy would have taken the arm you did not take, the reward is simply not in the record. With no assumption at all it lies anywhere in [0, 1], and the policy value is an interval. Where that interval still excludes zero, the sign is determined by the data alone — the strongest claim this terminal can make without an experiment.',
    }),
    card({
      title: 'Identified set on the difference against your record',
      subtitle: 'Two nests of assumptions. The wider one assumes nothing; the narrower one only allows rewards already observed in the same family.',
      body: table({
        caption: 'Assumption-free and family-bounded intervals on each policy delta',
        rows,
        columns: [
          { label: 'Policy', render: (r) => r.policyMeta.label },
          {
            label: 'No assumption at all',
            render: (r) => `${signed((r.manski.noAssumption.low - r.observed) * 100)} … ${signed((r.manski.noAssumption.high - r.observed) * 100)}`,
          },
          {
            label: 'Sign determined?',
            render: (r) => (r.manski.noAssumption.signDetermined ? badge('Yes', 'good') : badge('No', 'neutral')),
          },
          {
            label: 'Bounded by the family record',
            render: (r) => `${signed((r.manski.familyObserved.low - r.observed) * 100)} … ${signed((r.manski.familyObserved.high - r.observed) * 100)}`,
          },
          {
            label: 'Unobserved share',
            render: (r) => pct(r.manski.missingFraction, 0),
          },
        ],
      }),
    }),
    card({
      title: 'Why some policies can never be identified here',
      subtitle: 'Overlap is the whole game.',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'muted small' }, `A policy that agrees with your record on ${Math.round((1 - Math.min(...rows.map((r) => r.manski.missingFraction ?? 1))) * 100)}% of decision points is nearly observed, and its value is nearly a measurement. A policy you have almost never followed leaves most of its value unobserved, the assumption-free interval collapses to the full width, and the terminal refuses rather than extrapolating from a handful of points that look like you.`),
        h('p', { class: 'muted small' }, 'This is the honest shape of the problem: you can only evaluate policies that live near your own behaviour. Every other estimate would be a story about people who do not exist.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Sensitivity
 * ------------------------------------------------------------------ */

function sensitivityPanel(report) {
  const p = report.paired;
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: p.sensitivity?.significantAtOne ? 'info' : 'caution',
      title: `Design sensitivity Gamma* = ${p.sensitivity?.gamma ?? '—'}${p.sensitivity?.capped ? ' (at the search ceiling)' : ''}`,
      body: p.sensitivity?.significantAtOne
        ? `An unobserved factor would have to change the odds of taking the active arm by a factor of ${p.sensitivity.gamma} to overturn this finding at the 5% level. Below the ${report.settings.counterfactualRobustGamma} bar the difference is reported as suggestive, never recommended.`
        : 'Even with no hidden bias assumed, the paired difference is not significant at the 5% level. No claim is made.',
    }),
    card({
      title: 'Matched pairs (greedy nearest neighbour, inside a caliper)',
      subtitle: `Matched on ${report.match.covariates.join(' and ')} within ${report.match.caliperSd} pooled standard deviations. Balance is reported, not assumed.`,
      body: h(
        'div',
        { class: 'stack-sm' },
        table({
          caption: 'Matching quality per decision-point family',
          rows: POLICY_FAMILIES.map((f) => ({ family: f, ...(report.match.perFamily[f] || {}) })),
          columns: [
            { label: 'Family', render: (r) => POLICY_FAMILY_META[r.family].label },
            { label: 'Active / hold', render: (r) => `${r.treated ?? 0} / ${r.control ?? 0}` },
            { label: 'Matched', render: (r) => String(r.matched ?? 0) },
            {
              label: 'Balance after (ASMD)',
              render: (r) => (r.asmdAfter
                ? Object.entries(r.asmdAfter).map(([k, v]) => `${k} ${v === null ? '—' : num(v, 2)}`).join(' · ')
                : 'no pairs'),
            },
            {
              label: 'Balance verdict',
              render: (r) => (r.asmdAfter && Object.values(r.asmdAfter).every((v) => v === null || v <= COUNTERFACTUAL_LIMITS.asmdBalanceTarget)
                ? badge('Balanced', 'good')
                : r.matched ? badge('Imbalanced', 'caution') : badge('—', 'neutral')),
            },
          ],
        }),
        h('p', { class: 'muted tiny' }, `Target absolute standardised mean difference: ${report.match.balanceTarget} (Stuart 2010). An imbalanced family is still reported — the balance is printed so a reader can discount it, not hidden so a reader cannot.`),
      ),
    }),
    card({
      title: 'McNemar (1947) under a Rosenbaum (1987) bound',
      subtitle: `Among matched pairs with binary rewards, ${p.favouring} favoured the active arm and ${p.opposing} opposed it, out of ${p.concordant} discordant pairs.`,
      body: h(
        'div',
        { class: 'stack-sm' },
        h(
          'div',
          { class: 'stat-row' },
          stat({ label: 'Discordant pairs', value: String(p.concordant), hint: `${p.excludedPairs} excluded (0.5 reward)` }),
          stat({ label: 'Favouring the active arm', value: pct(p.discordantRate), hint: 'share of discordant pairs' }),
          stat({
            label: 'Bounded rate at Gamma*',
            value: p.discordantInterval ? `${num(p.discordantInterval.low * 100, 0)}–${num(p.discordantInterval.high * 100, 0)}%` : '—',
            hint: 'worst case under the bound',
          }),
          stat({ label: 'McNemar p (Gamma 1)', value: p.mcnemarP === null ? '—' : num(p.mcnemarP, 4), hint: 'exact, two-sided' }),
        ),
        table({
          caption: 'Worst-case p-value as hidden bias grows',
          rows: p.gammaCurve,
          columns: [
            { label: 'Gamma', render: (r) => String(r.gamma) },
            { label: 'Upper-bound p', render: (r) => (r.pUpper === null ? '—' : num(r.pUpper, 4)) },
            {
              label: 'At the 5% bar',
              render: (r) => (r.pUpper === null ? '—' : (r.pUpper <= 0.05 ? badge('Survives', 'good') : badge('Overturned', 'neutral'))),
            },
          ],
        }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Families
 * ------------------------------------------------------------------ */

function familiesPanel(report) {
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'Four kinds of decision point, harvested from records you already keep',
      body: 'Nothing here was entered for this screen. Every unit comes from a dated record the workspace already held: a registered assumption and its human-assessed outcome, a DACI decision and its outcome review, a delegation and its delivery date, a closed case and what actually happened.',
    }),
    ...report.byFamily.map((fam) => card({
      title: fam.meta.label,
      subtitle: fam.meta.question,
      actions: [badge(fam.belowFloor ? `Below the ${COUNTERFACTUAL_LIMITS.minUnitsPerFamily}-point floor` : `${fam.units} decision points`, fam.belowFloor ? 'neutral' : 'good')],
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'muted small' }, `Arm 1 — ${fam.meta.arm1Label}. Arm 0 — ${fam.meta.arm0Label}.`),
        h('p', { class: 'muted small' }, `Reward — ${fam.meta.rewardLabel}.`),
        h('p', { class: 'muted small' }, `Confounder the record cannot remove: ${fam.meta.confounder}`),
        h(
          'div',
          { class: 'stat-row' },
          stat({ label: 'Points', value: String(fam.units), hint: `${fam.arm1} active / ${fam.arm0} hold` }),
          stat({ label: 'Recorded score', value: pct(fam.observedValue), hint: 'mean reward as recorded' }),
          stat({
            label: 'Best alternative',
            value: fam.rows.length
              ? (() => {
                const b = fam.rows.filter((r) => r.policyId !== 'observed').sort((x, y) => (y.value ?? -1) - (x.value ?? -1))[0];
                return b ? POLICY_META[b.policyId].label : '—';
              })()
              : '—',
            hint: fam.rows.length ? `delta ${signed((fam.rows.filter((r) => r.policyId !== 'observed').sort((x, y) => (y.value ?? -1) - (x.value ?? -1))[0] || {}).deltaPp)}` : 'below floor',
          }),
        ),
        h('a', { class: 'btn btn-small btn-ghost', href: fam.meta.route }, `Open ${fam.meta.sourceLabel.toLowerCase()} records →`),
      ),
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Ledger & time-uniform sequence
 * ------------------------------------------------------------------ */

function sequenceSvg(sequence) {
  if (!sequence.length) return null;
  const W = 560;
  const H = 200;
  const padL = 44;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = sequence.length;
  const xOf = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v) => padT + (1 - Math.max(0, Math.min(1, v))) * plotH;

  const upper = sequence.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.high).toFixed(1)}`).join(' ');
  const lower = sequence.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.low).toFixed(1)}`).join(' ');
  const band = `${upper} ${sequence.map((s, i) => `${xOf(n - 1 - i).toFixed(1)},${yOf(sequence[n - 1 - i].low).toFixed(1)}`).join(' ')}`;
  const line = sequence.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.mean).toFixed(1)}`).join(' ');

  return svgEl(
    'svg',
    {
      viewBox: `0 0 ${W} ${H}`,
      class: 'cfp-seq-svg',
      role: 'img',
      'aria-label': `Time-uniform 95% confidence sequence over ${n} decision points, ending at ${(sequence[n - 1].mean * 100).toFixed(1)}% with a half-width of ${(sequence[n - 1].halfWidth * 100).toFixed(1)} percentage points.`,
    },
    svgEl('polygon', { points: band, fill: 'rgba(42, 157, 111, 0.18)' }),
    svgEl('polyline', { points: line, fill: 'none', stroke: '#2a9d6f', 'stroke-width': 1.8 }),
    svgEl('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'none', stroke: 'rgba(148, 163, 184, 0.35)' }),
    svgEl('text', { x: padL + plotW / 2, y: H - 8, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': '11' }, 'Decision points in the order they were taken'),
    svgEl('text', { x: 12, y: padT + plotH / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${padT + plotH / 2})`, fill: 'currentColor', 'font-size': '11' }, 'Running mean reward'),
    svgEl('text', { x: padL, y: padT - 2, fill: 'currentColor', 'font-size': '9' }, '100%'),
    svgEl('text', { x: padL, y: padT + plotH + 10, fill: 'currentColor', 'font-size': '9' }, '0%'),
  );
}

function ledgerPanel(ctx, report) {
  const evaluations = report.evaluations || [];
  const focusId = ctx.query.get('evaluation');
  const focus = evaluations.find((e) => e.id === focusId) || null;

  const openFreeze = () => {
    const today = dayKey(ctx.now);
    const labelInput = h('input', { id: 'cfp-label', type: 'text', maxlength: COUNTERFACTUAL_LIMITS.maxLabel, placeholder: 'Optional label' });
    const horizonInput = h('input', { id: 'cfp-horizon', type: 'number', min: 1, max: 730, step: 1, value: 90 });
    const familyInput = h(
      'select',
      { id: 'cfp-family' },
      h('option', { value: 'all', selected: uiState.family === 'all' }, 'All four families'),
      ...POLICY_FAMILIES.map((f) => h('option', { value: f, selected: uiState.family === f }, POLICY_FAMILY_META[f].label)),
    );
    const notesInput = h('textarea', { id: 'cfp-notes', rows: 3, maxlength: COUNTERFACTUAL_LIMITS.maxNotes, placeholder: 'Optional blameless note — the process, never a person.' });
    const modal = openModal({
      title: 'Freeze the policy race',
      description: `A frozen evaluation stores the race as it stands today and nothing else. It is graded against the workspace as it is on ${addDays(today, 90)}, and a window that closes with too few new decision points LAPSES rather than being credited.`,
      body: h(
        'div',
        { class: 'stack-sm' },
        h('div', { class: 'field' }, h('label', { for: 'cfp-label' }, 'Label'), labelInput),
        h('div', { class: 'field' }, h('label', { for: 'cfp-family' }, 'Scope'), familyInput),
        h('div', { class: 'field' }, h('label', { for: 'cfp-horizon' }, 'Grading window (days)'), horizonInput),
        h('div', { class: 'field' }, h('label', { for: 'cfp-notes' }, 'Blameless note (optional)'), notesInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.freezePolicyEvaluation({
              label: labelInput.value,
              family: familyInput.value === 'all' ? null : familyInput.value,
              horizonDays: Number(horizonInput.value),
              notes: notesInput.value,
            });
            if (!res.ok) {
              toast(res.error, 'bad');
              return;
            }
            modal.close();
            toast(res.saved ? 'Policy race frozen for later grading.' : 'Frozen in memory only — export a backup now.', res.saved ? 'good' : 'bad');
            ctx.refresh();
          },
        }, 'Freeze race'),
      ],
    });
  };

  return h(
    'div',
    { class: 'stack-md' },
    card({
      title: 'Time-uniform confidence sequence for your recorded score',
      subtitle: 'Howard, Ramdas, McAuliffe & Sekhon (2021). A Hoeffding stitched boundary valid simultaneously at every t — so you may re-read this screen every morning without quietly spending an unreported false-positive budget. A fixed-horizon interval does not survive that.',
      body: h(
        'div',
        { class: 'stack-sm' },
        sequenceSvg(report.sequence),
        report.sequenceLast
          ? h('p', { class: 'muted small' }, `At ${report.sequenceLast.t} decision points the running mean is ${pct(report.sequenceLast.mean)} and the always-valid 95% interval is ${pct(report.sequenceLast.low)} – ${pct(report.sequenceLast.high)} (half-width ${num(report.sequenceLast.halfWidth * 100, 1)}pp).`)
          : h('p', { class: 'muted small' }, 'No decision points yet.'),
      ),
    }),
    card({
      title: 'Frozen policy evaluations',
      subtitle: 'A frozen evaluation is a claim about what the race said on a date. It is graded once, from what followed, and a window that closes empty lapses instead of being credited.',
      actions: [
        h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          onClick: openFreeze,
        }, 'Freeze race'),
      ],
      body: evaluations.length
        ? table({
          caption: 'Frozen and graded policy evaluations',
          rows: evaluations,
          columns: [
            { label: 'Label', render: (e) => e.label || `Evaluation ${e.id}` },
            { label: 'Scope', render: (e) => (e.scope === 'family' ? POLICY_FAMILY_META[e.family]?.label || e.family : 'All families') },
            { label: 'Frozen', render: (e) => `${e.frozenOn} · ${e.units} pts` },
            {
              label: 'Status',
              render: (e) => (e.status === 'graded'
                ? badge(e.grade?.held === null ? 'Lapsed' : e.grade?.held ? 'Held' : 'Did not hold', e.grade?.held === null ? 'neutral' : e.grade?.held ? 'good' : 'caution')
                : badge(`Frozen → ${addDays(e.frozenOn, e.horizonDays)}`, 'neutral')),
            },
            {
              label: 'Predicted → realised',
              render: (e) => (e.status === 'graded'
                ? `${POLICY_META[e.grade?.predictedBestPolicy]?.label || '—'} → ${POLICY_META[e.grade?.realisedBestPolicy]?.label || '—'}`
                : '—'),
            },
            { label: 'Open', render: (e) => h('a', { class: 'btn btn-small btn-ghost', href: `#/counterfactual?panel=ledger&evaluation=${encodeURIComponent(e.id)}` }, 'Open') },
          ],
        })
        : emptyState({
          title: 'No frozen evaluations',
          body: 'Freeze the race when you want a dated claim you can hold the terminal to. Nothing is frozen automatically.',
        }),
    }),
    focus
      ? card({
        title: `Evaluation detail — ${focus.label || focus.id}`,
        subtitle: focus.status === 'graded'
          ? (focus.grade?.held === null ? 'Lapsed: too few new decision points arrived inside the window.' : `Graded ${String(focus.grade?.gradedAt || '').slice(0, 10)}.`)
          : `Frozen ${focus.frozenOn}, grading window ${focus.horizonDays} days.`,
        body: h(
          'div',
          { class: 'stack-sm' },
          table({
            caption: 'Race as frozen',
            rows: focus.race || [],
            columns: [
              { label: 'Policy', render: (r) => POLICY_META[r.policyId]?.label || r.policyId },
              { label: 'Value', render: (r) => pct(r.dr) },
              { label: 'Delta', render: (r) => signed(r.deltaPp) },
              { label: 'Assumption-free bounds', render: (r) => `${signed(r.manskiLowPp ?? null)} … ${signed(r.manskiHighPp ?? null)}` },
              { label: 'Verdict', render: (r) => badge(POLICY_VERDICT_META[r.verdict]?.label || r.verdict, TONE_BY_VERDICT[r.verdict] || 'neutral') },
            ],
          }),
        ),
      })
      : null,
  );
}

/* ------------------------------------------------------------------ *
 * Method
 * ------------------------------------------------------------------ */

function methodPanel(report) {
  return h(
    'div',
    { class: 'stack-md' },
    card({
      title: 'The estimators',
      subtitle: 'Four estimators are run together because they fail differently. Agreement is evidence; disagreement is a warning printed on the race panel.',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' }, h('strong', null, 'Direct method (DM): '), 'a shrunk outcome model Q̂(family, arm), pulled toward the family mean with a pseudo-count of 2. An empty cell falls back to the family mean and is flagged, because a model that invents a cell is the one failure the doubly-robust estimator cannot repair.'),
        h('p', { class: 'small' }, h('strong', null, 'IPS (Horvitz–Thompson 1952): '), '(1/n) Σ 1{a = π} · y / μ̂(a). Unbiased under a correct propensity, unbounded in variance when overlap is poor.'),
        h('p', { class: 'small' }, h('strong', null, 'SNIPS (Hájek 1971): '), 'the same weights, self-normalised. Bounded on [0, 1] for bounded rewards, biased in finite samples — the reason both are printed.'),
        h('p', { class: 'small' }, h('strong', null, 'Doubly robust (Robins, Rotnitzky & Zhao 1994): '), 'Q̂(family, π) + 1{a = π}(y − Q̂(family, a)) / μ̂(a). Consistent if EITHER the outcome model or the propensity model is right.'),
        h('p', { class: 'small' }, h('strong', null, 'Propensity: '), `per family, Laplace-smoothed, clipped to [${COUNTERFACTUAL_LIMITS.minPropensity}, ${COUNTERFACTUAL_LIMITS.maxPropensity}]. The behavioural policy is estimated, not known, and the terminal says so.`),
        h('p', { class: 'small' }, h('strong', null, 'Effective sample size (Kong 1992): '), `(Σw)² / Σw², floored at ${COUNTERFACTUAL_LIMITS.minEffectiveSample}. Below it, weights are too concentrated to estimate anything and the terminal refuses.`),
      ),
    }),
    card({
      title: 'The floors, and what each one protects',
      subtitle: 'Every figure below its floor is blank, never zero.',
      body: table({
        caption: 'Evidence floors',
        rows: [
          { label: 'Decision points', value: report.floors.minUnits, why: 'below this, a policy value is a number with no meaning' },
          { label: 'Per arm', value: report.floors.minUnitsPerArm, why: 'one arm cannot be priced from two observations of it' },
          { label: 'Per family', value: report.floors.minUnitsPerFamily, why: 'a family breakdown below this is a story about noise' },
          { label: 'Effective sample', value: report.floors.minEffectiveSample, why: 'guards against one decision point standing for twenty' },
          { label: 'Matched pairs', value: report.floors.minPairsForSensitivity, why: 'a Gamma bound from three pairs is decoration' },
          { label: 'Materiality', value: `${report.settings.counterfactualMaterialityPp}pp`, why: 'a real but trivial edge is not dressed up as a finding' },
          { label: 'Robustness bar', value: `Gamma ${report.settings.counterfactualRobustGamma}`, why: 'a finding that a modest confounder would explain is suggestive, never supported' },
        ],
        columns: [
          { label: 'Floor', render: (r) => r.label },
          { label: 'Value', render: (r) => String(r.value) },
          { label: 'Why it exists', render: (r) => r.why },
        ],
      }),
    }),
    card({
      title: 'What this terminal refuses to do',
      subtitle: 'The refusals are the product. A tool that always answers is a tool that cannot be trusted.',
      body: h(
        'div',
        { class: 'stack-sm' },
        ...[
          'It will not estimate a value below the evidence floors. Counts are printed instead.',
          'It will not claim a sign that the assumption-free bounds do not determine.',
          'It will not call a finding supported when a modest amount of hidden selection would explain it away.',
          'It will not adopt a policy. Every robust finding becomes a decision for you to make — never a rule you obey.',
          'It will not compare rewards across families, and never prints a cross-family total.',
          'It will not score a person. No unit, arm, reward or pair in this terminal is a named individual.',
          'It will not round a 0.5 reward into a success or a failure; those pairs are excluded and counted.',
          'It will not credit a grading window that closed with too few new decision points. It lapses.',
          'It will not treat a selection difference as a causal effect. Selection is the default explanation for everything on these panels.',
        ].map((line) => h('p', { class: 'small' }, `· ${line}`)),
      ),
    }),
    card({
      title: 'Automations on the shared spine',
      subtitle: 'RULE-CFP-01..04 run on the same post-commit engine as every other module, marker-idempotent and pauseable.',
      body: table({
        caption: 'Post-commit rules',
        rows: COUNTERFACTUAL_RULES,
        columns: [
          { label: 'Rule', render: (r) => h('strong', null, r.id) },
          { label: 'Trigger', render: (r) => r.trigger },
          { label: 'Effect', render: (r) => r.description },
        ],
      }),
    }),
    report.caveats.length
      ? card({
        title: 'Caveats computed for this workspace',
        subtitle: 'Regenerated on every render from the records as they stand.',
        body: h('div', { class: 'stack-sm' }, ...report.caveats.map((c) => h('p', { class: 'small muted' }, `· ${c}`))),
      })
      : null,
  );
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export function renderCounterfactual(ctx) {
  const panelParam = ctx.query.get('panel') || 'race';
  const active = PANELS.some((p) => p.key === panelParam) ? panelParam : 'race';
  const famParam = ctx.query.get('family') || 'all';
  uiState.family = famParam;
  const focusFamily = POLICY_FAMILIES.includes(famParam) ? famParam : null;

  const report = counterfactualReport(ctx.state, ctx.now, focusFamily);

  const scopeSelect = h(
    'select',
    {
      id: 'cfp-scope',
      'aria-label': 'Decision-point family',
      onChange: (e) => {
        uiState.family = e.target.value;
        nav(ctx, active, { family: e.target.value });
      },
    },
    h('option', { value: 'all', selected: !focusFamily }, 'All four families'),
    ...POLICY_FAMILIES.map((f) => h('option', { value: f, selected: focusFamily === f }, POLICY_FAMILY_META[f].label)),
  );

  const header = pageHeader({
    eyebrow: 'LEADOS · COUNTERFACTUAL POLICY',
    title: 'Would another policy have scored better than the way you decided?',
    subtitle: 'Off-policy evaluation (Dudík, Langford & Li 2011) · Manski partial identification (1990) · Rosenbaum hidden-bias bounds (2002) · time-uniform confidence sequences (Howard et al. 2021). Answered from records you already keep — and refused when the record cannot support an answer.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.counterfactualBriefText(focusFamily);
          if (!downloadText({ filename: 'leados-counterfactual-policy-brief.txt', text, mime: 'text/plain' })) {
            openModal({
              title: 'Copy counterfactual policy brief',
              body: h('textarea', { rows: 18, readOnly: true, 'aria-label': 'Counterfactual policy brief' }, text),
            });
          }
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanCounterfactual();
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          const created = (res.propagations || []).length;
          toast(created
            ? `Scan complete — ${created} cross-module propagation(s) written.`
            : 'Scan complete — nothing new to capture, resolve or escalate.', created ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Scan decision points'),
    ],
  });

  const stats = h(
    'div',
    { class: 'stat-row' },
    stat({
      label: 'Decision points',
      value: String(report.counts.units),
      hint: `floor ${report.floors.minUnits} · ${report.counts.arm1} active / ${report.counts.arm0} hold`,
    }),
    stat({
      label: 'Recorded score',
      value: pct(report.observedValue),
      hint: report.observable ? 'directly observed — no model' : 'below the floor',
    }),
    stat({
      label: 'Best alternative',
      value: report.best && report.best.policyId !== 'observed' ? pct(report.best.value) : '—',
      hint: report.best && report.best.policyId !== 'observed' ? signed(report.best.deltaPp) : 'no policy priced',
      tone: report.best && ['supported-better', 'bounded-better'].includes(report.best.verdict) ? 'good'
        : report.best && ['supported-worse', 'bounded-worse'].includes(report.best.verdict) ? 'bad' : '',
    }),
    stat({
      label: 'Hidden-bias bound',
      value: report.sensitivity?.gamma ? `Γ ${report.sensitivity.gamma}` : '—',
      hint: report.sensitivity?.significantAtOne ? `survives up to ${report.sensitivity.gamma}×` : 'not significant at Γ 1',
    }),
    stat({
      label: 'Matched pairs',
      value: String(report.match.pairs),
      hint: `${report.paired.concordant} discordant · ${report.match.balanced ? 'balanced' : 'imbalance reported'}`,
    }),
  );

  const scopeBar = card({
    className: 'cfp-scope-bar',
    body: h(
      'div',
      { class: 'card-body cfp-scope-row' },
      h('div', { class: 'field cfp-scope-field' }, h('label', { for: 'cfp-scope' }, 'Decision-point family'), scopeSelect),
      h('p', { class: 'muted tiny' }, 'Rewards are not comparable across families. Restricting the reading keeps one reward definition in play; no cross-family total is ever printed.'),
    ),
  });

  const panelBody = active === 'bounds' ? boundsPanel(report)
    : active === 'sensitivity' ? sensitivityPanel(report)
      : active === 'families' ? familiesPanel(report)
        : active === 'ledger' ? ledgerPanel(ctx, report)
          : active === 'method' ? methodPanel(report)
            : racePanel(ctx, report);

  return h(
    'div',
    { class: 'view-stack cfp-view' },
    header,
    stats,
    scopeBar,
    tabs({
      items: PANELS,
      active,
      ariaLabel: 'Counterfactual policy sections',
      onSelect: (key) => nav(ctx, key),
    }),
    panelBody,
  );
}
