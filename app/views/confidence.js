/**
 * app/views/confidence.js — the Confidence Transport terminal (`#/confidence`,
 * Schema v72, ADR-0064).
 *
 * Six panels over the leader's own probability vocabulary:
 *   Instrument    What "80%" has actually meant, by declared band, with the
 *                 reliability table, the observed rate and the certified map
 *   Race          The prequential contest between the declared numbers, the
 *                 sigmoid and the isotonic map — scored in the order reality
 *                 arrived, with the bootstrap interval that decides the verdict
 *   Readings      Every open declaration beside the certified reading of it
 *   Horizon       The same question per horizon band, because a 90% call due next
 *                 week and a 90% call due next quarter are not the same claim
 *   Certificates  Frozen instruments graded once against what followed
 *   Method        The arithmetic, the conventions and every refusal
 *
 * Nothing on this screen rewrites a declaration, and nothing on it scores a
 * person. The unit is the leader's probability words across modules.
 */

import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { confidenceSignals } from '../core/domain/confidence.js';
import {
  CONFIDENCE_BAND_LABELS,
  CONFIDENCE_MAP_LABELS,
  CONFIDENCE_MAP_SHORT,
} from '../core/domain/confidenceRegistry.js';
import { openCertificateDialog, openConfidenceConventionsDialog } from '../ui/confidence-modals.js';

const PANELS = [
  { key: 'instrument', label: 'Instrument' },
  { key: 'race', label: 'Race' },
  { key: 'readings', label: 'Readings' },
  { key: 'horizon', label: 'Horizon' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'method', label: 'Method' },
];

const VERDICT_TONE = { supported: 'good', 'no-gain': 'neutral', harmful: 'bad', insufficient: 'neutral' };
const VERDICT_SHORT = {
  supported: 'Transport supported',
  'no-gain': 'No gain',
  harmful: 'Do not transport',
  insufficient: 'Not yet identifiable',
};

const pct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}%`);
const num = (v, dp = 3) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));
const signed = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v > 0 ? '+' : ''}${v}`);

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/confidence?${q.toString()}`);
}

function verdictBadge(verdict) {
  return badge(VERDICT_SHORT[verdict] || verdict, VERDICT_TONE[verdict] || 'neutral');
}

/**
 * The reliability diagram. Every band is drawn twice: the declared mean (hollow)
 * and the observed rate (filled), joined by the gap that IS the calibration
 * error. The diagonal is the identity line — where a perfectly calibrated
 * probability would sit.
 */
export function reliabilityChart(report, { compact = false } = {}) {
  const bands = report.reliability.bands.filter((b) => b.n > 0);
  if (!bands.length) {
    return h('p', { class: 'muted small' }, 'Nothing to draw: no settled forecast yet.');
  }
  const width = 560;
  const height = compact ? 150 : 260;
  const pad = { left: 34, right: 22, top: 16, bottom: 40 };
  const x = (value) => pad.left + (Math.min(100, Math.max(0, value)) / 100) * (width - pad.left - pad.right);
  const y = (value) => height - pad.bottom - (Math.min(100, Math.max(0, value)) / 100) * (height - pad.top - pad.bottom);
  const worst = bands.slice().sort((a, b) => Math.abs(b.gapPp) - Math.abs(a.gapPp))[0];
  const aria = [
    `Reliability diagram: ${bands.length} non-empty declared band(s).`,
    `Overall observed rate ${pct(report.reliability.baseRatePct)} against Brier ${num(report.reliability.brier)}.`,
    worst ? `Largest gap: declared ${worst.loPct}-${worst.hiPct}% band, mean ${worst.meanDeclaredPct}%, observed ${worst.observedPct}% (${signed(worst.gapPp)} points, ${worst.n} forecasts).` : '',
    `Diagonal is perfect calibration.`,
  ].filter(Boolean).join(' ');
  const ticks = [0, 25, 50, 75, 100];
  const nodes = [
    h('line', { x1: x(0), y1: y(0), x2: x(100), y2: y(100), class: 'chart-axis', 'stroke-dasharray': '4 4' }),
  ];
  for (const tick of ticks) {
    nodes.push(h('line', { x1: x(tick), y1: y(0), x2: x(tick), y2: y(100), class: 'chart-grid' }));
    nodes.push(h('text', { x: x(tick), y: height - pad.bottom + 16, class: 'chart-tick', 'text-anchor': 'middle' }, `${tick}%`));
    nodes.push(h('text', { x: pad.left - 8, y: y(tick) + 4, class: 'chart-tick', 'text-anchor': 'end' }, `${tick}%`));
  }
  for (const band of bands) {
    const declared = band.meanDeclaredPct;
    const observed = band.observedPct;
    nodes.push(h('line', {
      x1: x(declared), y1: y(declared), x2: x(declared), y2: y(observed),
      class: 'chart-line', stroke: Math.abs(band.gapPp) >= 10 ? 'var(--bad)' : 'var(--accent)',
    }));
    nodes.push(h('circle', { cx: x(declared), cy: y(declared), r: 4, class: 'chart-dot-hollow', fill: 'none', stroke: 'var(--muted)' }));
    nodes.push(h('circle', { cx: x(declared), cy: y(observed), r: 3 + 4 * Math.sqrt(band.n / Math.max(...bands.map((b) => b.n))), class: 'chart-dot' }));
  }
  return h('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': aria,
    width: '100%',
  }, ...nodes);
}

/* ------------------------------------------------------------- instrument */

function instrumentPanel(ctx, report) {
  const c = report.conventions;
  const base = report.reliability.baseRatePct;
  const declaredMean = report.samples.length
    ? Math.round((report.samples.reduce((sum, s) => sum + s.declaredPct, 0) / report.samples.length) * 10) / 10
    : null;
  return h('div', { class: 'stack' },
    card({
      title: 'What your probability words have meant',
      subtitle: `Every settled forecast that carried a declared probability, from all ${report.counts.fromRegistry} registered source modules. Oriented so 1 means the declared event actually happened; ambiguous outcomes excluded and counted.`,
      actions: [badge(`${report.sampleCount} settled`, 'neutral'), verdictBadge(report.verdict)],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Mean declared', value: pct(declaredMean), hint: 'what you said would happen' }),
          stat({ label: 'Observed', value: pct(base), hint: `${report.reliability.n} settled forecasts` }),
          stat({
            label: 'Calibration gap',
            value: report.reliability.n && base !== null && declaredMean !== null ? `${signed(Math.round((base - declaredMean) * 10) / 10)} pts` : '—',
            hint: base !== null && declaredMean !== null && base < declaredMean ? 'you declare higher than reality' : 'no systematic overstatement',
            tone: base !== null && declaredMean !== null && declaredMean - base >= 10 ? 'warn' : '',
          }),
          stat({ label: 'Brier (declared)', value: num(report.reliability.brier), hint: '0 is perfect, 0.25 is a coin at 50%' }),
          stat({
            label: 'Certified reading',
            value: report.verdict === 'supported' ? CONFIDENCE_MAP_SHORT[report.chosen] : 'none',
            hint: report.verdict === 'supported' ? `Brier ${num(report.race.models.find((m) => m.key === report.chosen)?.brier)} out of sample` : 'your numbers are the reading',
          }),
        ),
        reliabilityChart(report),
        h('p', { class: 'muted small' }, `Filled dots are the observed rate in each declared band; hollow dots are the mean declaration; the line between them is the calibration error for that band. Red means at least ten points. Bands with no settled forecast are omitted, not drawn at zero.`),
      ),
    }),
    card({
      title: 'By source module',
      subtitle: 'The same question asked of each ledger separately. A module with no settled forecast is printed with its count rather than omitted, because an absence is information.',
      body: table({
        caption: 'Declared probabilities by source module',
        columns: [
          { key: 's', label: 'Source', render: (row) => h('a', { href: row.route }, row.label) },
          { key: 'q', label: 'What the number means', render: (row) => h('span', { class: 'muted small' }, row.quantity) },
          { key: 'n', label: 'Settled', render: (row) => String(row.n) },
          { key: 'd', label: 'Declared mean', render: (row) => pct(row.meanDeclaredPct) },
          { key: 'o', label: 'Observed', render: (row) => pct(row.observedPct) },
          { key: 'g', label: 'Gap', render: (row) => (row.gapPp === null ? '—' : `${signed(row.gapPp)} pts`) },
          { key: 'l', label: 'Open', render: (row) => (row.live ? String(row.live) : '—') },
        ],
        rows: report.bySource,
      }),
    }),
  );
}

/* ------------------------------------------------------------------ race */

function racePanel(ctx, report) {
  const c = report.conventions;
  const interval = report.verdicts.interval;
  const best = report.race.models.filter((m) => m.brier !== null).sort((a, b) => a.brier - b.brier)[0];
  return h('div', { class: 'stack' },
    card({
      title: 'The prequential race',
      subtitle: `Each of the ${report.race.scored} scored settlements was predicted by a map fitted only on the settlements that came before it, then scored. Nothing is scored on data its model saw — this is the honest version of "would translating my words have helped?"`,
      actions: [verdictBadge(report.verdict)],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          ...report.race.models.map((model) => stat({
            label: CONFIDENCE_MAP_LABELS[model.key],
            value: num(model.brier),
            hint: model.n
              ? `Brier over ${model.n} out-of-sample settlement(s) · skill ${model.skill === null ? '—' : model.skill} · won ${model.wins}`
              : 'not fitted on this record',
            tone: best && best.key === model.key && report.verdict === 'supported' ? 'good' : '',
          })),
        ),
        interval ? h('p', { class: 'muted' },
          h('strong', null, 'Paired interval. '),
          `The mean per-settlement Brier difference (declared minus ${CONFIDENCE_MAP_SHORT[best?.key] || 'map'}) is ${interval.mean} with a 90% bootstrap interval of ${interval.lo} to ${interval.hi} over ${interval.n} settlements, ${c.bootstrap} deterministic resamples. `,
          'The verdict needs the whole interval above zero and a gain of at least ',
          `${Math.round(c.materialBrier * 10000) / 100} Brier points: a gain that cannot be separated from nothing on this record is called no gain, not a small gain.`,
        ) : h('p', { class: 'muted' }, 'No interval yet: too few out-of-sample settlements to separate a gain from noise.'),
        h('p', { class: 'muted small' },
          'Two honest limits. The prequential score removes look-ahead but not model-selection bias — the instrument was chosen on the same record it is scored on. '
          + 'And a fitted curve is never evidence that the curve will travel; that is what the frozen certificate is for, and it is graded once, prospectively.'),
      ),
    }),
    card({
      title: 'How the winner is chosen',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, `Simplest first: if the sigmoid is within ${Math.round(c.materialBrier * 10000) / 100} Brier points of the isotonic map, the sigmoid is preferred, because two bounded parameters travel better than a step function.`),
        h('li', null, 'A map must beat the declared numbers by a material margin AND have a bootstrap interval entirely above zero to be called supported.'),
        h('li', null, 'If every map is materially worse, the verdict is "do not transport" — which is a real finding about a well-calibrated record, not a failure.'),
        h('li', null, `Below ${c.minSamples} settled forecasts or ${c.minScored} scored settlements the terminal prints counts and refuses a map entirely.`),
      ),
    }),
  );
}

/* -------------------------------------------------------------- readings */

function readingsPanel(ctx, report) {
  const c = report.conventions;
  const rows = report.live.rows;
  return h('div', { class: 'stack' },
    banner({
      tone: report.verdict === 'supported' ? 'info' : 'caution',
      title: report.verdict === 'supported'
        ? 'The certified reading is a second opinion, printed beside your number — never a replacement'
        : 'No certified reading exists yet, so these rows cannot be transported',
      body: report.verdict === 'supported'
        ? `Below, each open declaration appears exactly as you wrote it, with the ${CONFIDENCE_MAP_SHORT[report.chosen]} map's reading of it. A gap of ${c.gapPct} points or more is flagged. Nothing here changes a record.`
        : 'The terminal will not translate a declaration with a map this record has not shown to beat your numbers. The declared figures below are shown unchanged so you can see what is pending.',
    }),
    card({
      title: `Open declarations (${report.live.total}${report.live.omitted ? `, ${report.live.omitted} not shown` : ''})`,
      subtitle: `Ranked by the size of the disagreement. Up to ${c.liveCap} per module are shown; the brief reports counts only.`,
      body: table({
        caption: 'Open declared probabilities and their certified readings',
        emptyMessage: 'No open declaration carries a probability right now.',
        columns: [
          { key: 'l', label: 'Promise', render: (row) => h('span', { class: 'stack-xs' }, h('a', { href: row.route }, String(row.label).slice(0, 70)), h('span', { class: 'muted small' }, row.family)) },
          { key: 'd', label: 'Declared', render: (row) => `${row.declaredPct}%` },
          {
            key: 't',
            label: 'Certified reading',
            render: (row) => (report.verdict === 'supported'
              ? `${row.transportedPct}%`
              : h('span', { class: 'muted' }, 'withheld')),
          },
          {
            key: 'g',
            label: 'Gap',
            render: (row) => (report.verdict === 'supported'
              ? badge(`${signed(row.gapPp)} pts`, row.absGapPp >= c.gapPct ? (row.direction === 'over' ? 'warn' : 'caution') : 'neutral')
              : '—'),
          },
          { key: 'h', label: 'Open for', render: (row) => (row.horizonDays === null ? '—' : `${row.horizonDays} days`) },
          { key: 'b', label: 'Band', render: (row) => (row.band ? CONFIDENCE_BAND_LABELS[row.band].split(' — ')[0] : '—') },
          { key: 'due', label: 'Due', render: (row) => row.dueOn || '—' },
        ],
        rows,
      }),
    }),
    card({
      title: 'What a flagged reading does and does not mean',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'It does not mean the promise is wrong. It means that promises like it, written by you, have resolved at the certified rate.'),
        h('li', null, 'It does not change the record. Re-state the number yourself if you believe this promise is different — and the reason you write is what the next grade tests.'),
        h('li', null, 'It does not score a person. There is no per-person calibration in this workspace and there is no control that would produce one.'),
      ),
    }),
  );
}

/* --------------------------------------------------------------- horizon */

function horizonPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Does the bend depend on how far ahead you are looking?',
      subtitle: 'A 90% call due next week and a 90% call due next quarter are not the same claim, and over a year of record they often bend differently. Each band is fitted on its own record only when that record clears the same floors; otherwise the pooled map is shown and labelled as pooled.',
      body: table({
        caption: 'Calibration by horizon band',
        columns: [
          { key: 'b', label: 'Band', render: (row) => CONFIDENCE_BAND_LABELS[row.band] },
          { key: 'n', label: 'Settled', render: (row) => String(row.n) },
          { key: 'd', label: 'Declared mean', render: (row) => pct(row.meanDeclaredPct) },
          { key: 'o', label: 'Observed', render: (row) => pct(row.observedPct) },
          { key: 'm', label: 'Map used', render: (row) => (row.mapType === 'pooled' ? badge('Pooled', 'neutral') : badge(CONFIDENCE_MAP_LABELS[row.mapType], row.sufficient ? 'good' : 'caution')) },
          { key: 'v', label: 'Verdict', render: (row) => VERY_SHORT(row.verdict) },
          { key: 'x', label: 'Brier (declared → best)', render: (row) => `${num(row.brierDeclared)} → ${num(row.brierBest)}` },
        ],
        rows: report.bands,
      }),
    }),
    card({
      title: 'Why the bands refuse early',
      body: h('p', { class: 'muted' },
        'Splitting a record into three horizon bands divides the evidence three ways. A band that clears the floors gets its own certificate-grade map; a band that does not is reported as pooled, never fitted on a subset too small to identify one. '
        + 'This is the same refusal the Borrowed Evidence engine makes across groups, for the same reason: a map fitted to nine points is a line through noise with a legend.'),
    }),
  );
}

function VERY_SHORT(verdict) {
  return badge(VERDICT_SHORT[verdict] || verdict, VERDICT_TONE[verdict] || 'neutral');
}

/* ---------------------------------------------------------- certificates */

function certificateStatus(cert, today) {
  if (cert.graded) {
    const won = cert.graded.brierTransported < cert.graded.brierDeclared;
    return badge(won ? 'Graded · transport won' : cert.graded.brierTransported === cert.graded.brierDeclared ? 'Graded · tie' : 'Graded · declared won', won ? 'good' : 'warn');
  }
  if (cert.lapsedOn) return badge('Lapsed untested', 'neutral');
  if (cert.reviewOn <= today) return badge('Due for grading', 'caution');
  return badge(`Open until ${cert.reviewOn}`, 'neutral');
}

function certificatesPanel(ctx, report) {
  const ledger = report.certificates;
  const focus = ctx.query?.get('certificate') || '';
  return h('div', { class: 'stack' },
    card({
      title: 'Has transporting helped here?',
      subtitle: `Frozen instruments, graded once from the forecasts that resolved inside their window (Brier 1950). Skill = 1 − Σ Brier transported / Σ Brier declared; withheld below ${report.conventions.skillFloor} graded certificates.`,
      actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openCertificateDialog(ctx, report) }, 'Freeze a certificate')],
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Open', value: String(ledger.open), hint: 'a claim being tested right now' }),
        stat({ label: 'Graded', value: String(ledger.graded), hint: `${ledger.wins} won by the transported reading` }),
        stat({
          label: 'Mean skill',
          value: ledger.meanSkill === null ? (ledger.graded ? 'withheld' : 'no grades') : String(ledger.meanSkill),
          hint: ledger.needed ? `${ledger.needed} more graded certificate(s) before skill is scored` : 'scored on the graded record',
          tone: ledger.meanSkill !== null && ledger.meanSkill < 0 ? 'bad' : '',
        }),
        stat({ label: 'Lapsed', value: String(ledger.lapsed), hint: 'windows that closed empty — never credited' }),
      ),
    }),
    card({
      title: `Frozen certificates (${ledger.certificates.length})`,
      subtitle: 'A certificate records the map, its parameters and the prequential scores that justified it. It is graded once and never rewritten. The rules freeze one automatically the moment transport becomes supported.',
      body: table({
        caption: 'Frozen calibration certificates',
        emptyMessage: 'No certificate yet. Run the scan once transport is supported, or freeze one by hand.',
        columns: [
          {
            key: 'c',
            label: 'Certificate',
            render: (cert) => h('span', { class: 'stack-xs' },
              h('strong', null, cert.label),
              h('span', { class: 'muted small' }, `issued ${cert.issuedOn} · ${CONFIDENCE_MAP_LABELS[cert.mapType]} · ${cert.scoredN} out-of-sample settlements · pace ${cert.paceAtFit ?? '—'}/30d`)),
          },
          { key: 'w', label: 'Window', render: (cert) => `${cert.issuedOn} → ${cert.reviewOn}` },
          { key: 's', label: 'Status', render: (cert) => certificateStatus(cert, report.today) },
          { key: 'b', label: 'Brier (transported / declared)', render: (cert) => (cert.graded ? `${num(cert.graded.brierTransported)} / ${num(cert.graded.brierDeclared)} on ${cert.graded.successes}/${cert.graded.observed}` : `${num(cert.chosenBrier)} / ${num(cert.brierDeclared)} at issue`) },
          {
            key: 'x',
            label: 'Actions',
            render: (cert) => h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              'aria-label': `Delete certificate ${cert.label}`,
              onClick: () => confirmDialog({
                title: 'Delete this certificate?',
                message: 'The frozen map and its edges are removed. The event log keeps the deletion. A graded certificate is a record that a claim was tested — deleting one does not untest it.',
                confirmLabel: 'Delete certificate',
                danger: true,
                onConfirm: () => {
                  const result = ctx.api.deleteConfidenceCertificate(cert.id);
                  toast(result.ok ? 'Certificate deleted.' : result.error, result.ok ? 'good' : 'bad');
                },
              }),
            }, 'Delete'),
          },
        ],
        rows: ledger.certificates.map((cert) => ({ ...cert, className: cert.id === focus ? 'is-focused' : '' })),
      }),
    }),
    card({
      title: 'Graded evidence, read honestly',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'A certificate is graded on the forecasts that resolved strictly inside its window. A window that closed with nothing inside it lapses — an absence of resolutions is not a win.'),
        h('li', null, 'A graded certificate cannot be rewritten. It can be deleted, and the deletion is logged.'),
        h('li', null, `Skill waits for ${report.conventions.skillFloor} graded certificates, because two graded windows cannot separate a working map from a lucky one.`),
        h('li', null, 'One lost window is noise or it is not — the terminal opens the decision to stop transporting and leaves the ruling to the leader.'),
      ),
    }),
  );
}

/* ---------------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const c = report.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'The model, printed so it can be checked',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, h('strong', null, 'What is being measured. '), 'Every settled forecast in the workspace that carried a declared probability, oriented so 1 means the declared event happened, pooled across modules because the claim being tested is about one instrument: the leader’s probability vocabulary.'),
        h('p', { class: 'muted' }, h('strong', null, 'Proper score (Brier 1950). '), 'Brier = mean squared error between the stated probability and the outcome. It is strictly proper, so no map can be rewarded for hedging, and it is the only score the verdict uses.'),
        h('p', { class: 'muted' }, h('strong', null, 'Murphy (1973) decomposition. '), 'Brier = reliability − resolution + uncertainty, computed on the same ten-bin partition the isotonic map uses, with Wilson intervals on every observed rate.'),
        h('p', { class: 'muted' }, h('strong', null, 'Prequential evaluation (Dawid 1984). '), `Each of the last ${240} settlements is predicted by a map fitted only on the settlements before it, starting after a ${c.minTrain}-settlement warm-up. This is the walk-forward question — what would this map have said at the time — and it is why a fitted curve is never reported as a forecast.`),
        h('p', { class: 'muted' }, h('strong', null, 'Platt scaling (Platt 1999). '), 'p ↦ σ(a·logit(p) + b), two parameters, fitted by Newton’s method with the smoothed targets that keep the fit finite, bounded to a ∈ [−6, 6] and b ∈ [−4, 4].'),
        h('p', { class: 'muted' }, h('strong', null, 'Isotonic calibration (Barlow et al. 1972; Zadrozny & Elkan 2002). '), `Bin the declared percentages into ${c.bins} equal bands, then pool adjacent violators exactly: contiguous bands with a non-decreasing observed rate merge into one block. The block list is stored on every certificate so the map can be re-applied years later without re-fitting.`),
        h('p', { class: 'muted' }, h('strong', null, 'Decision rule. '), `A map must beat the declared numbers by at least ${Math.round(c.materialBrier * 10000) / 100} Brier points AND have a ${c.bootstrap}-resample paired bootstrap interval entirely above zero. On a tie the simpler map wins. Below ${c.minSamples} settled forecasts or ${c.minScored} scored settlements, no verdict is issued at all.`),
      ),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'Each is a number you can change, and every screen that uses one prints it.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConfidenceConventionsDialog(ctx, c) }, 'Change conventions')],
      body: table({
        caption: 'Confidence transport conventions',
        columns: [
          { key: 'k', label: 'Convention', render: (row) => row.label },
          { key: 'v', label: 'Value', render: (row) => row.value },
        ],
        rows: [
          { label: 'Settled forecasts before a map is fitted', value: String(c.minSamples) },
          { label: 'Prequential warm-up', value: `${c.minTrain} settlements` },
          { label: 'Out-of-sample settlements before a verdict', value: String(c.minScored) },
          { label: 'Material gain required', value: `${Math.round(c.materialBrier * 10000) / 100} Brier points` },
          { label: 'Bootstrap resamples', value: String(c.bootstrap) },
          { label: 'Gap that flags an open declaration', value: `${c.gapPct} points` },
          { label: 'Reliability bins', value: String(c.bins) },
          { label: 'Horizon bands (short / long)', value: `≤ ${c.shortDays} days / > ${c.longDays} days` },
          { label: 'Certificate window / review', value: `${c.reviewDays} days` },
          { label: 'Graded certificates before skill is scored', value: String(c.skillFloor) },
          { label: 'Automatic propagation', value: c.autoPropagate ? 'on' : 'off (explicit scans only)' },
        ],
      }),
    }),
    card({
      title: 'What this screen refuses to do',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'It never rewrites a declared probability. The declaration is the record; the transported figure is a second reading shown beside it.'),
        h('li', null, 'It never calls transport supported from a fitted curve. The verdict needs an out-of-sample margin and a bootstrap interval that excludes zero.'),
        h('li', null, 'It never treats a half-outcome as a coin: "mixed" and "partially met" are excluded and counted as ambiguous.'),
        h('li', null, 'It never pools a direction it has not printed. Every source declares what its probability means and which outcome counts as 1.'),
        h('li', null, 'It never scores a person. The unit is the leader’s own probability vocabulary across modules.'),
        h('li', null, 'It never applies a band map that has not cleared its own floors — a band that cannot be identified is reported as pooled, not fitted.'),
        h('li', null, 'A transported number is decision support from a fitted instrument, not a measurement, and not a forecast of what this particular promise will do.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderConfidence(ctx) {
  const report = ctx.api.confidenceRead();
  const signals = confidenceSignals(ctx.state, ctx.now, ctx.state.settings || {});
  const requested = ctx.query?.get('panel') || 'instrument';
  const active = PANELS.some((panel) => panel.key === requested) ? requested : 'instrument';

  const header = pageHeader({
    eyebrow: 'WHAT YOUR 80% ACTUALLY MEANS · CERTIFIED FROM YOUR OWN RECORD · NEVER REWRITTEN',
    title: 'Confidence transport',
    subtitle: 'Every probability you have written into this workspace, graded against what happened — then asked whether translating your words into your measured frequencies would have helped, out of sample, in the order reality arrived.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.confidenceBriefText();
          if (!downloadText({ filename: `leados-confidence-${report.today}.txt`, text, mime: 'text/plain' })) {
            const modal = openModal({
              title: 'Copy the confidence brief (no names)',
              body: h('textarea', { readOnly: true, rows: 20, 'aria-label': 'Confidence brief' }, text),
              footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Close')],
            });
          } else {
            toast('No-names confidence brief downloaded.', 'good');
          }
        },
      }, 'Export brief'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCertificateDialog(ctx, report) }, 'Freeze a certificate'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanConfidence();
          if (!result.ok) {
            toast(result.error || 'Scan failed.', 'bad');
            return;
          }
          toast(result.changed
            ? 'Scan graded what was due and propagated what the certified record supports.'
            : 'Scan complete — nothing new to grade or certify.', 'good');
        },
      }, 'Run scan'),
    ],
  });

  const body = active === 'race' ? racePanel(ctx, report)
    : active === 'readings' ? readingsPanel(ctx, report)
      : active === 'horizon' ? horizonPanel(ctx, report)
        : active === 'certificates' ? certificatesPanel(ctx, report)
          : active === 'method' ? methodPanel(ctx, report)
            : instrumentPanel(ctx, report);

  const empty = report.sampleCount === 0;
  return h('div', { class: 'page' },
    header,
    empty ? banner({
      tone: 'info',
      title: 'No probability in this workspace has settled yet — so nothing is certified, and nothing is invented',
      body: `This terminal reads seven ledgers you already keep: settled assumptions, reviewed decisions, scored studies, recovery plan reviews, graded timing calls, monitoring reviews and delivery readings. Write a probability, then record what happened, and the first calibration reading appears here.`,
      actions: [
        h('a', { class: 'btn btn-primary btn-small', href: '#/premises' }, 'Assumption ledger'),
        h('a', { class: 'btn btn-ghost btn-small', href: '#/decisions' }, 'Decisions'),
      ],
    }) : null,
    !empty && report.verdict === 'insufficient' ? banner({
      tone: 'caution',
      title: `Calibration is not identifiable yet: ${report.sampleCount} of ${report.conventions.minSamples} settled forecasts`,
      body: `The terminal prints counts and refuses a map until ${report.conventions.minSamples} settlements and ${report.conventions.minScored} out-of-sample points exist. Below that a calibration curve is an anecdote with axes, so nothing here is called a result.`,
    }) : null,
    tabs({ items: PANELS, active, ariaLabel: 'Confidence transport sections', onSelect: (key) => nav(ctx, key) }),
    body,
  );
}
