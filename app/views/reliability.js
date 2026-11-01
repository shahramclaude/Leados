/**
 * app/views/reliability.js — the Measurement Reliability Terminal
 * (`#/reliability`, Schema v77, ADR-0069).
 *
 * Seven panels over the leader's own rating instrument — no new data entry, no
 * new form, nothing to maintain:
 *  - Signal:      the variance decomposition, the reliability coefficient with
 *                 its interval, the F test, the cycle effect and what survives.
 *  - Readings:    every person's raw and credibility-weighted reading, with the
 *                 interval, the shrinkage and the number to expect next time.
 *  - Separation:  the tiers the evidence supports, and every adjacent pair's
 *                 posterior separation probability — a partial order, not a rank.
 *  - Decision:    the D-study — what this record can detect, and how many more
 *                 observations a defensible difference needs, in months.
 *  - Convergence: do the instruments describe the same people, and why no
 *                 composite is formed when they do not.
 *  - Ledger:      frozen readings, their grades and lapses.
 *  - Method:      the equations, the floors and every explicit refusal.
 *
 * The view is a read adapter: it computes nothing and stores nothing. Every
 * figure comes from `reliabilityReport`, which derives it from the workspace on
 * each render.
 */

import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey } from '../core/time.js';
import { reliabilityReport } from '../core/domain/reliability.js';
import {
  RELIABILITY_INSTRUMENT_META,
  RELIABILITY_LIMITS,
  RELIABILITY_RULES,
  RELIABILITY_VERDICTS,
} from '../core/domain/reliabilityRegistry.js';

const PANELS = [
  { key: 'signal', label: 'Signal vs noise' },
  { key: 'readings', label: 'Credibility' },
  { key: 'separation', label: 'What is separable' },
  { key: 'decision', label: 'Decision study' },
  { key: 'convergence', label: 'Instrument agreement' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'method', label: 'Method & refusals' },
];

const num = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));
const pct = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(dp)}%`);
const pts = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(dp)} pts`);

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/reliability?${q.toString()}`);
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
 * Signal vs noise
 * ------------------------------------------------------------------ */

function decompositionBar(components) {
  const total = (components.tau2 ?? 0) + (components.occasionError ?? 0);
  const share = total > 0 ? (components.tau2 ?? 0) / total : 0;
  const width = 640;
  const height = 54;
  const personWidth = Math.max(0, Math.min(width, share * width));
  return svgEl(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, class: 'rel-bar-svg', role: 'img', 'aria-label': `Between-person variance is ${(share * 100).toFixed(1)} per cent of the total the instrument sees.` },
    svgEl('rect', { x: 0, y: 12, width, height: 30, rx: 6, class: 'rel-bar-track' }),
    svgEl('rect', { x: 0, y: 12, width: personWidth, height: 30, rx: 6, class: 'rel-bar-signal' }),
    svgEl('text', { x: 10, y: 32, class: 'rel-bar-label' }, `${(share * 100).toFixed(0)}% about the person`),
    personWidth < width - 90
      ? svgEl('text', { x: width - 10, y: 32, class: 'rel-bar-label', 'text-anchor': 'end' }, `${((1 - share) * 100).toFixed(0)}% occasion noise`)
      : null,
    svgEl('text', { x: 0, y: 8, class: 'rel-bar-caption' }, 'What the instrument sees, decomposed'),
  );
}

function refuseReasonText(report) {
  return {
    'too-few-persons': `${report.floors.minPersons} people with completed ratings`,
    'too-few-observations': `${report.floors.minObservations} completed ratings in total`,
    'too-few-occasions': `${report.floors.minOccasions} review cycles`,
    'too-few-per-person': `${report.floors.minObsPerPerson} ratings per person`,
    'too-unbalanced': `a design where no person holds more than ${report.floors.maxImbalanceRatio}× the median count`,
    'no-residual-df': 'residual degrees of freedom',
  }[report.reason] || 'a design that can support a decomposition';
}

function signalPanel(ctx, report) {
  if (!report.observable) {
    return emptyState({
      title: 'Not enough of a record to audit the instrument',
      body: `This terminal needs ${refuseReasonText(report)}. It holds ${report.counts.observations} completed rating(s) across ${report.counts.persons} people and ${report.counts.occasions} cycle(s). A reliability coefficient computed over a handful of ratings is a number with no meaning, so nothing is estimated until the floor is met — the counts above are the whole answer for now.`,
      action: h('a', { class: 'btn btn-primary', href: '#/reviews' }, 'Open performance reviews'),
    });
  }
  const c = report.components;
  const verdictTone = report.verdictMeta.tone === 'bad' ? 'bad' : report.verdictMeta.tone === 'caution' ? 'caution' : report.verdictMeta.tone === 'good' ? 'good' : 'info';

  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: verdictTone,
      title: `${report.verdictMeta.label} — ${pct(c.icc)} of what you see is about the person`,
      body: `${report.verdictMeta.summary} This is a statement about your rating instrument, not about anyone on your team.`,
    }),
    card({
      title: 'Variance decomposition (two-way additive model)',
      subtitle: 'y = person + cycle + everything else, estimated by method of moments on the unbalanced design (Cochran’s n₀). Cycle effect and residual are pooled as occasion error, because a manager cannot bank a good quarter and cash it later.',
      body: h(
        'div',
        { class: 'stack-sm' },
        decompositionBar(c),
        table({
          caption: 'Variance components',
          rows: [
            { label: 'Between-person variance (τ²)', value: num(c.tau2, 4), note: 'The signal: how much people differ from each other after the cycle is removed.' },
            { label: 'Residual variance (σ²)', value: num(c.sigma2, 4), note: 'Everything the model cannot attribute — noise, one-off events, the day of the week.' },
            { label: 'Cycle variance (ω²)', value: num(c.omega2, 4), note: `A common shift across everyone in a cycle — ${pct(c.occasionShare)} of the error term.` },
            { label: 'Occasion error (σ² + ω²)', value: num(c.occasionError, 4), note: 'What the credibility model treats as noise for the question "is this difference about the person?".' },
          ],
          columns: [
            { label: 'Component', render: (r) => h('strong', null, r.label) },
            { label: 'Estimate', render: (r) => r.value },
            { label: 'What it is', render: (r) => h('span', { class: 'muted small' }, r.note) },
          ],
        }),
      ),
    }),
    card({
      title: 'Reliability coefficient and its interval',
      subtitle: 'ICC(1) with the Shrout–Fleiss (1979) interval and the F test of τ² = 0. The interval is printed because a coefficient without one invites reading a range as a fact.',
      body: h(
        'div',
        { class: 'stat-row' },
        stat({ label: 'ICC(1)', value: pct(c.icc), hint: `your floor ${report.floors.iccFloorPct}%`, tone: c.icc >= report.floors.iccFloorPct / 100 ? 'good' : 'bad' }),
        stat({ label: '95% interval', value: c.iccCi ? `${pct(c.iccCi.low)}–${pct(c.iccCi.high)}` : '—', hint: 'Shrout–Fleiss' }),
        stat({ label: 'F test', value: c.fStat === null ? '—' : num(c.fStat, 2), hint: `F(${c.df1}, ${c.dfResid}) · p = ${c.fP === null ? '—' : num(c.fP, 4)}` }),
        stat({ label: `Mean of ${report.design.medianObsPerPerson} ratings`, value: pct(c.reliabilityAtMedian), hint: 'Spearman–Brown' }),
        stat({ label: 'Observations', value: String(report.counts.observations), hint: `${report.counts.persons} people × ${report.counts.occasions} cycles` }),
      ),
    }),
    card({
      title: 'What the number means in one paragraph',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' },
          `Of everything that separates your people on this instrument, ${pct(c.icc)} is about them and ${pct(1 - c.icc)} is about the occasion. If you made a decision today on a single rating, ${pct(1 - c.icc)} of the difference you acted on would be noise. Averaging ${report.design.medianObsPerPerson} rating(s) lifts that to ${pct(c.reliabilityAtMedian)} — which is the whole reason the decision study on the next tab exists.`),
        c.fP !== null && c.fP > 0.05
          ? h('p', { class: 'small muted' }, `The F test has not yet rejected "no between-person variance" (p = ${num(c.fP, 3)}). Treat every figure on this page as an estimate on a record that has not proven it carries signal.`)
          : h('p', { class: 'small muted' }, 'The F test rejects "no between-person variance", so the instrument does carry signal at α = 0.05. Whether that signal is enough for the decision you are facing is the next question, and it is not a statistical one.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Credibility readings
 * ------------------------------------------------------------------ */

function readingsPanel(report) {
  if (!report.observable || !report.personRows.length) {
    return emptyState({
      title: 'No readings yet',
      body: 'The credibility model needs a decomposed record. Complete reviews with manager ratings and this panel fills itself — there is nothing to enter here.',
    });
  }
  const rows = report.personRows
    .slice()
    // Ordered by evidence volume, never by standing. Sorting by the estimate
    // would be a leaderboard with extra steps.
    .sort((a, b) => a.n - b.n || String(a.name).localeCompare(String(b.name)));
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'Your reading, weighted by its own evidence — not overruled',
      body: 'Bühlmann (1967) credibility: a person’s own mean earns weight Z = n / (n + σ²/τ²), and the rest of the weight goes to the team mean. This is the same arithmetic insurers use to price a risk with a thin record. It is not a judgement about anyone; it is what three observations can support.',
    }),
    card({
      title: 'Credibility-weighted readings',
      subtitle: 'Rows are ordered by how much evidence exists, not by standing. The interval is the empirical-Bayes posterior 1/(1/τ² + n/σ²) — the range the next observation is most likely to fall inside.',
      body: table({
        caption: 'Raw and credibility-weighted readings with posterior intervals',
        rows,
        columns: [
          { label: 'Person', render: (r) => h('div', null, h('strong', null, r.name), h('div', { class: 'muted tiny' }, `${r.n} observation(s)`)) },
          { label: 'As recorded', render: (r) => pts(r.observedPoints) },
          { label: 'Credibility', render: (r) => pct(r.credibility, 0) },
          { label: 'Weighted reading', render: (r) => h('strong', null, pts(r.estimatePoints)) },
          { label: 'Interval', render: (r) => `${pts(r.interval.low * 3 + 1)}–${pts(r.interval.high * 3 + 1)}` },
          {
            label: 'Adjustment',
            render: (r) => (Math.abs(r.shrinkPoints ?? 0) < 0.01
              ? h('span', { class: 'muted tiny' }, 'none — the record carries this reading')
              : h('span', { class: r.shrinkPoints > 0 ? 'rel-shrink-down' : 'rel-shrink-up' }, `${r.shrinkPoints > 0 ? '−' : '+'}${Math.abs(r.shrinkPoints).toFixed(2)} pts`)),
          },
          {
            label: 'Expected next',
            render: (r) => h('span', null, pts(r.expectedNextPoints), h('div', { class: 'muted tiny' }, 'regression to the mean')),
          },
        ],
      }),
    }),
    report.extremes
      ? card({
        title: 'The two readings most likely to mislead you',
        subtitle: 'Galton (1886) / Kahneman (2011): a selected extreme is expected to move toward the mean next time. That movement is arithmetic, not decline or improvement.',
        body: h(
          'div',
          { class: 'stack-sm' },
          ...[['Highest raw reading', report.extremes.top], ['Lowest raw reading', report.extremes.bottom]]
            .filter(([, row]) => row)
            .map(([label, row]) => h(
              'div',
              { class: 'rel-callout' },
              h('p', { class: 'small' }, h('strong', null, `${label} — ${row.name}: `),
                `observed ${pts(row.observedPoints)}, expected next ${pts(row.expectedNextPoints)} (${row.regressionPoints >= 0 ? '+' : ''}${row.regressionPoints.toFixed(2)}). `,
                row.reason),
            )),
        ),
      })
      : null,
    card({
      title: 'Where this model would be wrong',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small muted' }, '· It assumes observations are exchangeable within a person. Real growth is not: a person who improved last quarter is being averaged with who they were a year ago.'),
        h('p', { class: 'small muted' }, '· It assumes the noise is symmetric. A rater with a systematic halo (or a grudge) contributes bias, not variance, and no amount of averaging removes bias.'),
        h('p', { class: 'small muted' }, '· It cannot see the work. Two people can be indistinguishable on this instrument and plainly different in what they delivered — which is exactly why the Convergence tab asks whether your instruments agree.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Separation
 * ------------------------------------------------------------------ */

function separationPanel(report) {
  if (!report.separation) {
    return emptyState({ title: 'No separation to report', body: 'The record is too thin to place anyone in a tier. That is the correct answer, not a missing one.' });
  }
  const s = report.separation;
  const names = new Map(report.personRows.map((r) => [r.personId, r.name]));
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: s.indistinguishablePairs > 0 ? 'caution' : 'good',
      title: s.indistinguishablePairs > 0
        ? `${s.indistinguishablePairs} adjacent pair(s) are inside the noise`
        : 'Every adjacent pair is separable at your declared bar',
      body: `At a ${report.floors.separationPct}% separation bar this record supports ${s.tierCount} tier(s). Inside a tier the order is alphabetical on purpose: the record cannot order those people, and printing them in any other order would imply it can.`,
    }),
    card({
      title: 'The tiers the evidence supports',
      subtitle: 'A partial order, not a ranking. Two people in one tier are a coin flip on this instrument; two people in different tiers are not.',
      body: h(
        'div',
        { class: 'rel-tier-stack' },
        ...s.tiers.map((tier) => h(
          'div',
          { class: 'rel-tier' },
          h('div', { class: 'rel-tier-head' }, h('strong', null, `Tier ${tier.index}`), h('span', { class: 'muted tiny' }, `${tier.size} person(s)`)),
          h('div', { class: 'rel-tier-members' }, ...tier.members.map((m) => h('span', { class: 'rel-chip' }, names.get(m.personId) || m.personId))),
        )),
      ),
    }),
    card({
      title: 'Every adjacent pair, with its separation probability',
      subtitle: 'P(person above > person below) under the posterior. Below the bar, the pair is printed as indistinguishable — the honest reading of a difference the record cannot see.',
      body: table({
        caption: 'Adjacent pair separation',
        rows: s.pairs,
        columns: [
          { label: 'Pair', render: (p) => `#${p.index} / #${p.index + 1}` },
          { label: 'Estimated gap', render: (p) => pts(p.gapPoints) },
          { label: 'P(above > below)', render: (p) => pct(p.p) },
          { label: 'Reading', render: (p) => badge(p.distinguishable ? 'Separable' : 'Indistinguishable', p.distinguishable ? 'good' : 'caution') },
        ],
      }),
    }),
    card({
      title: 'What this means for a decision',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' },
          `Differentiated pay, a promotion between two people, a formal improvement plan — each needs a rank order inside a tier that this record does not have. That is not a reason never to decide; it is a reason to write down what else you are using when you do, and to know that a later reversal is not evidence you were wrong about the person.`),
        h('p', { class: 'small muted' },
          `The decision study on the next tab prices exactly this: what record would make the call defensible, and how long collecting it would take at your cadence.`),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Decision study
 * ------------------------------------------------------------------ */

function decisionPanel(ctx, report) {
  if (!report.decision) {
    return emptyState({ title: 'No decision study', body: 'The D-study needs a decomposed record. It will fill itself once the floor is met.' });
  }
  const d = report.decision;
  const c = report.components;
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: d.additionalObservations === 0 ? 'good' : 'caution',
      title: d.additionalObservations === 0
        ? `This record already meets your ${d.targetPct}% reliability target`
        : `${d.additionalObservations} more observation(s) per person for your ${d.targetPct}% target`,
      body: 'A generalizability D-study (Cronbach, Gleser, Nanda & Rajaratnam 1972) asks how many observations a decision needs. Here the answer is dated: one rating per person per cycle, at the cadence your own record shows.',
    }),
    card({
      title: 'What this record can and cannot see',
      subtitle: 'Power and minimum detectable effect for a two-person comparison (Cohen 1988; Cascio & Aguinis 2011). A gap smaller than the MDE is unmeasured, not absent.',
      body: h(
        'div',
        { class: 'stat-row' },
        stat({ label: 'Reliability at the median record', value: pct(d.targetReliabilityAtMedian), hint: `Spearman–Brown at k = ${d.medianObsPerPerson}` }),
        stat({ label: 'Minimum detectable gap', value: d.mdePoints === null ? '—' : `${d.mdePoints.toFixed(2)} pts`, hint: '80% power, α = 0.05' }),
        stat({ label: 'Observations for one point', value: d.nForOnePoint === null ? '—' : String(d.nForOnePoint), hint: 'per person, to separate a 1-point gap' }),
        stat({ label: 'Cycles to get there', value: d.monthsForOnePoint === null ? '—' : `${d.monthsForOnePoint} mo`, hint: `cadence ${report.cadenceDays ?? '—'} days` }),
      ),
    }),
    card({
      title: 'The D-study, in full',
      body: table({
        caption: 'Decision study figures',
        rows: [
          { label: 'Reliability coefficient in force (ICC)', value: pct(c.icc), note: 'The per-observation reliability every figure below is derived from.' },
          { label: 'Target reliability', value: `${d.targetPct}%`, note: 'Your declared convention — set in Settings, not derived.' },
          { label: 'Observations per person for the target', value: d.requiredK === null ? 'not reachable on this instrument' : String(d.requiredK), note: 'Inverse Spearman–Brown. If it is not reachable, the coefficient is so low that averaging cannot rescue it — the instrument has to change, not the sample size.' },
          { label: 'Additional observations needed', value: d.additionalObservations === null ? '—' : String(d.additionalObservations), note: `Against a median record of ${d.medianObsPerPerson} observation(s) per person.` },
          { label: 'Calendar time at your cadence', value: d.monthsForTarget === null ? '—' : `${d.monthsForTarget} month(s)`, note: `One rating per person per cycle, at ${report.cadenceDays ?? '—'} days per cycle from your own record.` },
          { label: 'Minimum detectable difference now', value: d.mdePoints === null ? '—' : `${d.mdePoints.toFixed(2)} rating point(s)`, note: d.mdeNote },
        ],
        columns: [
          { label: 'Figure', render: (r) => h('strong', null, r.label) },
          { label: 'Value', render: (r) => r.value },
          { label: 'Reading', render: (r) => h('span', { class: 'muted small' }, r.note) },
        ],
      }),
    }),
    card({
      title: 'Three ways to move the coefficient, ranked by cost',
      subtitle: 'A D-study tells you what more observations buy. It does not tell you that more observations are the cheapest answer — sometimes they are not.',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' }, h('strong', null, '1. More observation points per cycle. '), `Cheapest, slowest: ${d.additionalObservations ?? '—'} more cycle(s) of the same instrument. Requires nothing but patience and a calendar.`),
        h('p', { class: 'small' }, h('strong', null, '2. A second independent observer. '), 'Faster, but this changes the design: a second rater adds a rater facet, and the reliability of their average is a different coefficient. Do not treat two raters as two cycles — they are not exchangeable.'),
        h('p', { class: 'small' }, h('strong', null, '3. Written evidence required before a rating. '), 'The instrument itself gets better. That is the only one of the three that changes τ²/σ² rather than working around it — and it is the only one this app can help you keep (feedback, 1:1s and review evidence are all dated records here).'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Convergence
 * ------------------------------------------------------------------ */

const CONVERGENCE_TONE = { converges: 'good', diverges: 'bad', independent: 'caution', insufficient: 'neutral', 'no-variation': 'neutral' };

function convergencePanel(report) {
  const conv = report.convergence;
  return h(
    'div',
    { class: 'stack-md' },
    banner({
      tone: conv.divergingPairs > 0 ? 'bad' : conv.composite.allowed ? 'good' : 'info',
      title: conv.divergingPairs > 0
        ? 'Two instruments disagree about the same people'
        : conv.composite.allowed
          ? 'The instruments agree — a composite would be defensible (and is still not formed)'
          : 'Instrument agreement is not established',
      body: conv.composite.reason,
    }),
    card({
      title: 'Do your instruments describe the same people?',
      subtitle: 'Spearman rank correlation across the people who carry both instruments, with an exact permutation test below eight people and a t approximation above it. Convergence is construct validity (Cronbach & Meehl 1955), not reliability — two instruments can each be reliable and still measure different things.',
      body: table({
        caption: 'Instrument convergence',
        rows: conv.pairs,
        columns: [
          { label: 'Instrument pair', render: (p) => `${conv.meta[p.a]} vs ${conv.meta[p.b]}` },
          { label: 'People in both', render: (p) => String(p.n) },
          { label: 'Rank correlation', render: (p) => (p.rho === null ? '—' : num(p.rho, 2)) },
          { label: 'p', render: (p) => (p.p === null ? `≥ ${RELIABILITY_LIMITS.convergenceAlpha}` : num(p.p, 3)) },
          { label: 'Method', render: (p) => (p.method === 'exact-permutation' ? 'exact permutation' : p.method === 'asymptotic-t' ? 't approximation' : '—') },
          { label: 'Verdict', render: (p) => badge(p.verdict, CONVERGENCE_TONE[p.verdict] || 'neutral') },
        ],
      }),
    }),
    card({
      title: 'Why no composite is formed',
      subtitle: 'Averaging instruments that do not converge manufactures a number that measures nothing in particular — and it would then be carried into pay, succession and reviews as if it did.',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' },
          conv.composite.allowed
            ? `Every testable pair converged (mean ρ ${conv.composite.rBar ?? '—'}; a ${conv.composite.reliability === null ? '—' : pct(conv.composite.reliability)} composite would be defensible). LeadOS still does not form, store or export the composite — that would create a second, unreviewable score of a person. If you want one, build it deliberately outside this app and say what it is for.`
            : 'At least one pair does not converge on this record, so a composite would average different constructs. Nothing is combined, and the panel reports each instrument separately.'),
        h('p', { class: 'small muted' },
          `Instruments with enough items to be compared: ${Object.entries(conv.instrumentCounts).map(([key, count]) => `${RELIABILITY_INSTRUMENT_META[key]?.label || key} (${count})`).join(' · ')}. A person needs at least ${RELIABILITY_LIMITS.minConvergencePerPerson} items in an instrument before their mean is used at all.`),
      ),
    }),
    card({
      title: 'The four instruments and what each one actually measures',
      body: table({
        caption: 'Instrument definitions',
        rows: Object.entries(RELIABILITY_INSTRUMENT_META).map(([key, meta]) => ({ key, ...meta })),
        columns: [
          { label: 'Instrument', render: (r) => h('div', null, h('strong', null, r.label), h('div', { class: 'muted tiny' }, r.scale)) },
          { label: 'Role', render: (r) => badge(r.role === 'primary' ? 'Carries the model' : 'Convergence only', r.role === 'primary' ? 'good' : 'neutral') },
          { label: 'Source', render: (r) => r.source },
          { label: 'What it can be wrong about', render: (r) => h('span', { class: 'muted small' }, r.note) },
        ],
      }),
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

function ledgerPanel(ctx, report) {
  const readings = report.frozenReadings || [];
  const focusId = ctx.query.get('reading');
  const focus = readings.find((r) => r.id === focusId) || null;

  const openFreeze = () => {
    const today = dayKey(ctx.now);
    const labelInput = h('input', { id: 'rel-label', type: 'text', maxlength: RELIABILITY_LIMITS.maxLabel, placeholder: 'Optional label' });
    const horizonInput = h('input', { id: 'rel-horizon', type: 'number', min: 14, max: 730, step: 1, value: 90 });
    const notesInput = h('textarea', { id: 'rel-notes', rows: 3, maxlength: RELIABILITY_LIMITS.maxNotes, placeholder: 'Optional note about the instrument — never about a person.' });
    const modal = openModal({
      title: 'Freeze this instrument reading',
      description: `A frozen reading stores the design counts, the coefficients, the tier and pair counts and the ${report.floors.iccFloorPct}% floor in force — never a person’s name, reading or tier membership. It is graded once against the record as it stands on ${addDays(today, 90)}, and a window that closes without at least ${RELIABILITY_LIMITS.minNewObservations} new observations lapses instead of being credited.`,
      body: h(
        'div',
        { class: 'stack-sm' },
        h('div', { class: 'field' }, h('label', { for: 'rel-label' }, 'Label'), labelInput),
        h('div', { class: 'field' }, h('label', { for: 'rel-horizon' }, 'Grading window (days)'), horizonInput),
        h('div', { class: 'field' }, h('label', { for: 'rel-notes' }, 'Note about the instrument (optional)'), notesInput),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.freezeReliabilityReading({
              label: labelInput.value,
              horizonDays: Number(horizonInput.value),
              notes: notesInput.value,
            });
            if (!res.ok) {
              toast(res.error, 'bad');
              return;
            }
            modal.close();
            toast(res.saved ? 'Instrument reading frozen for later grading.' : 'Frozen in memory only — export a backup now.', res.saved ? 'good' : 'bad');
            ctx.refresh();
          },
        }, 'Freeze reading'),
      ],
    });
  };

  return h(
    'div',
    { class: 'stack-md' },
    card({
      title: 'Frozen instrument readings',
      subtitle: 'A frozen reading is a dated claim about your instrument: this much signal, this many tiers, against this floor. It is graded once, out of sample, and a window that closes empty lapses rather than being credited.',
      actions: report.observable
        ? [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: openFreeze }, 'Freeze reading')]
        : [],
      body: readings.length
        ? table({
          caption: 'Frozen and graded instrument readings',
          rows: readings,
          columns: [
            { label: 'Reading', render: (r) => h('div', null, h('strong', null, r.label || r.id), h('div', { class: 'muted tiny' }, `${r.design?.observations ?? '—'} ratings · ${r.design?.persons ?? '—'} people`)) },
            { label: 'Frozen', render: (r) => r.frozenOn },
            { label: 'Reliability', render: (r) => pct(r.icc) },
            { label: 'Floor', render: (r) => `${r.thresholdPct}%` },
            { label: 'Tiers / pairs', render: (r) => `${r.tierCount ?? '—'} / ${r.indistinguishablePairs ?? '—'} of ${r.pairCount ?? '—'}` },
            {
              label: 'Status',
              render: (r) => (r.status === 'graded'
                ? badge(r.grade?.exceeded === null ? 'Lapsed' : r.grade?.exceeded ? 'Prediction held' : 'Did not hold',
                  r.grade?.exceeded === null ? 'neutral' : r.grade?.exceeded ? 'good' : 'caution')
                : badge(`Frozen → ${addDays(r.frozenOn, r.horizonDays)}`, 'neutral')),
            },
            { label: 'Open', render: (r) => h('a', { class: 'btn btn-small btn-ghost', href: `#/reliability?panel=ledger&reading=${encodeURIComponent(r.id)}` }, 'Open') },
          ],
        })
        : emptyState({
          title: 'No frozen readings',
          body: 'Freeze a reading when you want a dated claim you can hold this terminal to. Nothing is frozen automatically, and the ledger is safe to export: it holds counts and coefficients only.',
        }),
    }),
    focus
      ? card({
        title: `Reading detail — ${focus.label || focus.id}`,
        subtitle: focus.status === 'graded'
          ? (focus.grade?.exceeded === null
            ? `Lapsed ${String(focus.grade?.gradedAt || '').slice(0, 10)}: too few new observations arrived inside the window.`
            : `Graded ${String(focus.grade?.gradedAt || '').slice(0, 10)}: reliability ${pct(focus.grade?.icc)} against a frozen ${focus.thresholdPct}% threshold.`)
          : `Frozen ${focus.frozenOn}; grading window ${focus.horizonDays} days.`,
        body: h(
          'div',
          { class: 'stack-sm' },
          table({
            caption: 'Reading as frozen',
            rows: [
              { label: 'Between-person variance (τ²)', value: num(focus.tau, 4) },
              { label: 'Occasion error', value: num(focus.sigma, 4) },
              { label: 'Cycle share of error', value: pct(focus.occasionShare) },
              { label: 'Reliability coefficient', value: pct(focus.icc) },
              { label: 'Declared floor at freeze', value: `${focus.thresholdPct}%` },
              { label: 'P(clear the floor at grading)', value: focus.predictedExceed === null ? '—' : pct(focus.predictedExceed) },
              { label: 'Tiers', value: String(focus.tierCount ?? '—') },
              { label: 'Indistinguishable adjacent pairs', value: `${focus.indistinguishablePairs ?? '—'} of ${focus.pairCount ?? '—'}` },
              { label: 'Largest tier', value: String(focus.topTierSize ?? '—') },
              { label: 'Verdict at freeze', value: focus.verdict },
            ],
            columns: [
              { label: 'Figure', render: (r) => r.label },
              { label: 'Value', render: (r) => h('strong', null, r.value) },
            ],
          }),
          focus.grade
            ? h('p', { class: 'small' },
              focus.grade.brier === null
                ? focus.grade.note
                : `Brier score ${num(focus.grade.brier, 4)} against the frozen probability of ${pct(focus.predictedExceed)}. ${focus.grade.newObservations} new observation(s) arrived inside the window.`)
            : null,
          (focus.history || []).length
            ? h('div', { class: 'stack-sm' }, ...focus.history.map((entry) => h('p', { class: 'small muted' }, `${String(entry.at).slice(0, 10)} · ${entry.summary}`)))
            : null,
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
      title: 'The equations',
      subtitle: 'Every figure on this page is one of these. Nothing is fitted, tuned or optimised on the outcome.',
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'small' }, h('code', null, 'y_ij = μ + a_i + b_j + e_ij'), ' — person i, cycle j; a_i ~ (0, τ²), e_ij ~ (0, σ²). Estimated by alternating least squares on the additive model, with method-of-moments components on Cochran’s n₀ so an unbalanced design does not pretend to be balanced.'),
        h('p', { class: 'small' }, h('code', null, 'ICC(1) = τ² / (τ² + σ² + ω²)'), ' — the share of the instrument that is about the person. Interval by Shrout & Fleiss (1979); τ² = 0 tested by F(P−1, N−P−J+1).'),
        h('p', { class: 'small' }, h('code', null, 'ρ_k = kρ / (1 + (k−1)ρ)'), ' — Spearman–Brown (1910): the reliability of the mean of k observations, and inverted for the k a target reliability needs.'),
        h('p', { class: 'small' }, h('code', null, 'Z_i = n_i / (n_i + σ²/τ²)'), ' — Bühlmann (1967) credibility. The weighted reading is ', h('code', null, 'Z_i·ȳ_i + (1−Z_i)·μ'), ', and its posterior variance is ', h('code', null, '1/(1/τ² + n_i/σ²)'), '.'),
        h('p', { class: 'small' }, h('code', null, 'MDE = (z_{1−α/2} + z_power)·√(2σ²/n)'), ' — the smallest two-person gap this record can detect at 80% power and α = 0.05.'),
        h('p', { class: 'small' }, h('code', null, 'E[y_next | data] = μ + Z_i(ȳ_i − μ)'), ' — regression to the mean, which is the same expression as the credibility estimate and the reason the two panels agree.'),
      ),
    }),
    card({
      title: 'Every explicit refusal',
      subtitle: 'These are enforced in code and asserted in the test suite, not just described here.',
      body: h(
        'div',
        { class: 'stack-sm' },
        ...[
          `It will not estimate anything below the evidence floor: ${report.floors.minObservations} ratings, ${report.floors.minPersons} people, ${report.floors.minObsPerPerson} each, ${report.floors.minOccasions} cycles.`,
          `It will not decompose a design where one person holds more than ${report.floors.maxImbalanceRatio}× the median observation count — the coefficient would be dominated by one person and the interval would lie.`,
          'It will not rank people. It prints tiers, and inside a tier it prints names alphabetically so no order is implied.',
          'It will not form, store or export a composite score across instruments, even when they converge.',
          'It will not read prose, sentiment, demographics, leave records or protected characteristics. Instruments are declared and bounded, and nothing else enters the model.',
          'It will not change a rating, a pay figure, a role or a status. A rating far outside the evidence band gets an appended advisory note and one verification task — never a correction.',
          'It will not store a person identifier in a frozen reading. The ledger holds counts and coefficients only, which is why it is safe to export.',
          'It will not credit a grading window that closed without enough new observations. It lapses.',
          'It will not treat an interrater correlation as a reliability coefficient (Murphy & DeShon 2000). A second rater is a different design, not more of the same one.',
        ].map((line) => h('p', { class: 'small' }, `· ${line}`)),
      ),
    }),
    card({
      title: 'The scales and the verdict ladder',
      body: table({
        caption: 'Reliability verdicts',
        rows: RELIABILITY_VERDICTS.map((key) => ({ key, ...(report.verdicts.includes(key) ? {} : {}) })),
        columns: [
          { label: 'Verdict', render: (r) => h('strong', null, r.key === report.verdict ? `${r.key} (current)` : r.key) },
          { label: 'Reading', render: (r) => h('span', { class: 'muted small' }, (VERDICT_TEXT[r.key] || '')) },
        ],
      }),
    }),
    card({
      title: 'Automations on the shared spine',
      subtitle: 'RULE-REL-01..05 run on the same post-commit engine as every other module, marker-idempotent and pauseable.',
      body: table({
        caption: 'Post-commit rules',
        rows: RELIABILITY_RULES,
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

const VERDICT_TEXT = {
  insufficient: 'Counts only; nothing is estimated.',
  unbalanced: 'The design is too unbalanced to decompose honestly.',
  'noise-dominated': 'Within-person variation is as large as between-person variation.',
  'weakly-separable': 'Real signal exists, but adjacent people cannot be told apart at your bar.',
  separable: 'The instrument supports distinguishing people at your bar.',
  'strongly-separable': 'Between-person variance dominates; tiers are stable.',
};

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

export function renderReliability(ctx) {
  const panelParam = ctx.query.get('panel') || 'signal';
  const active = PANELS.some((p) => p.key === panelParam) ? panelParam : 'signal';
  const report = reliabilityReport(ctx.state, ctx.now);

  const header = pageHeader({
    eyebrow: 'LEADOS · MEASUREMENT RELIABILITY',
    title: 'How much of what you believe about your team survives its own measurement error?',
    subtitle: 'Generalizability theory (Cronbach et al. 1972) · intraclass correlation (Shrout & Fleiss 1979) · Bühlmann credibility (1967) · Spearman–Brown (1910) · empirical Bayes (Efron & Morris 1975) · regression to the mean (Galton 1886). Answered from reviews you already have — and refused when the record cannot support an answer.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.reliabilityBriefText();
          if (!downloadText({ filename: 'leados-measurement-reliability-brief.txt', text, mime: 'text/plain' })) {
            openModal({
              title: 'Copy measurement reliability brief',
              body: h('textarea', { rows: 18, readOnly: true, 'aria-label': 'Measurement reliability brief' }, text),
            });
          }
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanReliability();
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          const created = (res.propagations || []).length;
          toast(created
            ? `Scan complete — ${created} cross-module propagation(s) written.`
            : 'Scan complete — nothing new to observe, qualify or grade.', created ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Scan the instrument'),
    ],
  });

  const stats = h(
    'div',
    { class: 'stat-row' },
    stat({
      label: 'Completed ratings',
      value: String(report.counts.observations),
      hint: `floor ${report.floors.minObservations} · ${report.counts.occasions} cycle(s)`,
    }),
    stat({
      label: 'Reliability coefficient',
      value: report.observable ? pct(report.components.icc) : '—',
      hint: report.observable ? `floor ${report.floors.iccFloorPct}% · interval ${report.components.iccCi ? `${pct(report.components.iccCi.low)}–${pct(report.components.iccCi.high)}` : 'n/a'}` : 'below the floor',
      tone: report.observable ? (report.components.icc >= report.floors.iccFloorPct / 100 ? 'good' : 'bad') : '',
    }),
    stat({
      label: 'Tiers supported',
      value: report.separation ? String(report.separation.tierCount) : '—',
      hint: report.separation ? `${report.separation.indistinguishablePairs} of ${report.separation.pairCount} adjacent pairs inside the noise` : 'not decomposed',
    }),
    stat({
      label: 'More observations needed',
      value: report.decision?.additionalObservations === null || report.decision === null ? '—' : String(report.decision.additionalObservations),
      hint: report.decision ? `for ${report.decision.targetPct}% reliability · ${report.decision.monthsForTarget === null ? 'cadence unknown' : `${report.decision.monthsForTarget} mo`}` : 'no D-study',
      tone: report.decision && report.decision.additionalObservations === 0 ? 'good' : '',
    }),
    stat({
      label: 'Instruments agreeing',
      value: `${report.convergence.convergingPairs}/${report.convergence.pairs.length}`,
      hint: report.convergence.divergingPairs ? `${report.convergence.divergingPairs} diverge` : 'no divergence detected',
    }),
  );

  const panelBody = active === 'readings' ? readingsPanel(report)
    : active === 'separation' ? separationPanel(report)
      : active === 'decision' ? decisionPanel(ctx, report)
        : active === 'convergence' ? convergencePanel(report)
          : active === 'ledger' ? ledgerPanel(ctx, report)
            : active === 'method' ? methodPanel(report)
              : signalPanel(ctx, report);

  return h(
    'div',
    { class: 'view-stack rel-view' },
    header,
    stats,
    tabs({
      items: PANELS,
      active,
      ariaLabel: 'Measurement reliability sections',
      onSelect: (key) => nav(ctx, key),
    }),
    panelBody,
  );
}
