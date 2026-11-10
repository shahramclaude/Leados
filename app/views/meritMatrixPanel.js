/**
 * app/views/meritMatrixPanel.js — `#/merit?panel=matrix`, the Matrix Merit Pool
 * Stewardship & Cohort Parity Reading (ADR‑0154, Schema v128 unchanged).
 *
 * ONE SCREEN, TWO SEPARATE CLAIMS, PRINTED SEPARATELY:
 *
 *   1. **Authority** — on the day this money takes effect, did exactly one
 *      declared line hold the `pay` right for each person being paid, did two or
 *      more, or did none? A contested or unowned right is NAMED here and never
 *      settled here; the screen has no button that chooses an owner.
 *   2. **Parity** — did the cohort of people on a second line receive a
 *      different median increase than the cohort on a home line only? Printed
 *      only when both cohorts clear the declared cell floor and every pay
 *      decision is priced; otherwise the gap is BLANK with the reason printed.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A comparison over a partial table. `incomplete` outranks every substantive
 *    reading.
 *  - A withheld figure as a zero. Every blank carries its reason.
 *  - A cause. The gap is descriptive and unadjusted; there is no "because" on
 *    this page, and the frameworks card says why.
 *  - A person's score or rank. Findings are on PAY DECISIONS, COHORTS and
 *    LEVELS. The export carries no identity at all.
 */
import { h, toast } from '../ui/dom.js';
import { card, stat, badge, banner, table, kv, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  MERIT_PARITY_AUTHORITY_STATES,
  MERIT_PARITY_CONVENTIONS,
  MERIT_PARITY_COHORTS,
  MERIT_PARITY_FLOOR,
  MERIT_PARITY_FRAMEWORKS,
  MERIT_PARITY_REFUSALS,
  MERIT_PARITY_TOLERANCE_BPS,
  MERIT_PARITY_VERDICTS,
  meritParityLevelLabel,
} from '../core/domain/meritParityRegistry.js';
import { MERIT_PARITY_CSV_COLUMNS, buildMeritParity } from '../core/domain/meritParity.js';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const bp = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const pct = (Math.abs(n) / 100).toFixed(2);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${n === 0 ? '0' : pct}% (${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} bp)`;
};
const toneFor = (key) => (key === 'bad' ? 'bad' : key === 'warn' ? 'warn' : key === 'good' ? 'good' : 'neutral');

function withheld(reason, label = 'Withheld') {
  return h('div', { class: 'stack-sm' },
    badge(label, 'warn'),
    reason ? h('span', { class: 'muted tiny' }, reason) : null);
}

/* ------------------------------------------------------------------ header */

function verdictSection(report) {
  const parityTone = report.verdictOpen ? 'warn' : (report.verdict === 'single-line' || report.verdict === 'parity') ? 'info' : 'warn';
  return h('div', { class: 'stack' },
    banner({
      tone: parityTone,
      title: `Cohort parity: ${report.verdictLabel}`,
      body: h('div', { class: 'stack-sm' },
        h('p', null, report.verdictDetail),
        report.gapWithheld
          ? h('p', { class: 'small' }, `The cohort gap is withheld: ${report.gapReason}`)
          : h('p', { class: 'small' }, `${report.gapDirectionLabel}: the second-line median is ${bp(report.gapBps)} against the home-line median. This is an UNADJUSTED median difference inside a declared ±${MERIT_PARITY_TOLERANCE_BPS} bp band — descriptive, not causal, and not a finding of unfairness.`)),
    }),
    banner({
      tone: report.authorityVerdict === 'contested' || report.authorityVerdict === 'unowned' ? 'warn' : 'info',
      title: `Pay authority: ${report.authorityLabel}`,
      body: h('div', { class: 'stack-sm' },
        h('p', null, report.authorityDetail),
        h('p', { class: 'small muted' },
          `${report.totals.contestedN} contested · ${report.totals.unownedN} unowned · ${report.totals.clearN} held by exactly one line, across ${report.totals.rowsN} pay decision(s). This is a SEPARATE claim from the parity reading: the figures above can add up while the authority that set them cannot be attributed.`)),
    }),
  );
}

/* ------------------------------------------------------------------- stats */

function statsSection(report) {
  const m = report.cohorts.matrix;
  const s = report.cohorts['single-line'];
  return card({
    title: 'The pool, split by structure on the effective date',
    subtitle: `Cohorts are read from the dated reporting lines on ${dash(report.effectiveOn)} — not from today's org chart. A median is printed only from ${MERIT_PARITY_FLOOR} priced people upward.`,
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Pay decisions', value: report.totals.rowsN, hint: `${report.totals.includedN} priced · ${report.totals.excludedN} excluded` }),
      stat({ label: 'On a second line', value: m.rowsN, hint: `${m.includedN} priced`, tone: m.rowsN ? 'warn' : 'good' }),
      stat({ label: 'Home line only', value: s.rowsN, hint: `${s.includedN} priced` }),
      stat({
        label: 'Second-line median',
        value: m.medianPrinted ? bp(m.medianBps) : 'withheld',
        hint: m.medianPrinted ? `${m.zeroIncreaseN} zero increase(s)` : `fewer than ${MERIT_PARITY_FLOOR} priced people`,
        tone: m.medianPrinted ? '' : 'warn',
      }),
      stat({
        label: 'Home-line median',
        value: s.medianPrinted ? bp(s.medianBps) : 'withheld',
        hint: s.medianPrinted ? `${s.zeroIncreaseN} zero increase(s)` : `fewer than ${MERIT_PARITY_FLOOR} priced people`,
        tone: s.medianPrinted ? '' : 'warn',
      }),
      stat({
        label: 'Gap (unadjusted)',
        value: report.gapBps === null ? 'withheld' : bp(report.gapBps),
        hint: report.gapBps === null ? 'a figure the record cannot support is not printed' : report.gapDirectionLabel,
        tone: report.verdict === 'divergent' ? 'warn' : report.gapBps === null ? 'warn' : 'good',
      }),
      stat({
        label: 'Second-line share of the pool',
        value: report.totals.matrixPoolShareBps === null ? 'withheld' : `${(report.totals.matrixPoolShareBps / 100).toFixed(2)}%`,
        hint: report.totals.matrixPoolShareBps === null ? 'the pool moved no money' : 'of every cent this cycle spends',
        tone: report.totals.matrixPoolShareBps === null ? 'warn' : '',
      }),
    ),
  });
}

/* ----------------------------------------------------------------- cohorts */

function cohortSection(report) {
  const rows = MERIT_PARITY_COHORTS.map((spec) => {
    const c = report.cohorts[spec.key] || null;
    return {
      key: spec.key,
      label: h('div', { class: 'stack-sm' }, h('strong', null, spec.label), h('span', { class: 'muted tiny' }, spec.hint)),
      priced: h('div', { class: 'stack-sm' }, h('strong', null, String(c.includedN)), h('span', { class: 'muted tiny' }, `${c.rowsN} row(s) · ${c.excludedN} excluded`)),
      median: c.medianPrinted ? bp(c.medianBps) : withheld(`Fewer than ${MERIT_PARITY_FLOOR} priced people in this cohort.`),
      zero: String(c.zeroIncreaseN),
      levels: c.levelMix.length
        ? h('div', { class: 'row-gap' }, ...c.levelMix.map((l) => badge(`${l.label} ${l.n}`, 'neutral')))
        : h('span', { class: 'muted tiny' }, '—'),
      ratings: c.ratingMix.length
        ? h('div', { class: 'muted tiny' }, c.ratingMix.map((r) => `${r.key} ${r.n}`).join(' · '))
        : h('span', { class: 'muted tiny' }, '—'),
    };
  });
  return card({
    title: 'The two cohorts',
    subtitle: 'The composition columns are printed, not adjusted for. A difference in level or rating mix is a caveat on the reading, never a correction applied silently.',
    body: table({
      caption: 'Merit cohorts by structure on the effective date',
      columns: [
        { label: 'Cohort', render: (r) => r.label },
        { label: 'Priced people', render: (r) => r.priced },
        { label: 'Median increase', render: (r) => r.median },
        { label: 'Zero increases', render: (r) => r.zero },
        { label: 'Levels (priced)', render: (r) => r.levels },
        { label: 'Ratings (priced)', render: (r) => r.ratings },
      ],
      rows,
    }),
  });
}

/* --------------------------------------------------------------- decisions */

function decisionsSection(report) {
  const columns = [
    {
      label: 'Person',
      render: (r) => h('div', { class: 'stack-sm' },
        h('strong', null, r.personName || 'Removed person'),
        h('span', { class: 'muted tiny' }, meritParityLevelLabel(r.level))),
    },
    {
      label: 'Lines on the effective date',
      render: (r) => (r.missingPerson
        ? h('span', { class: 'muted tiny' }, 'Person not on the roster')
        : h('div', { class: 'stack-sm' },
          h('strong', null, r.lineN === 1 ? '1 line' : `${r.lineN} lines`),
          h('span', { class: 'muted tiny' }, r.lineRoles.join(' · ')))),
    },
    {
      label: 'Pay authority',
      render: (r) => h('div', { class: 'row-gap' },
        badge(r.authorityLabel, toneFor(r.authorityState === 'clear' ? 'good' : 'warn')),
        r.holderN ? h('span', { class: 'muted tiny' }, r.holderNames.join(' · ')) : h('span', { class: 'muted tiny' }, 'no declared holder')),
    },
    { label: 'Cohort', render: (r) => (r.cohort === 'matrix' ? badge('Second line', 'warn') : badge('Home line only', 'neutral')) },
    {
      label: 'Increase',
      render: (r) => (r.included
        ? h('div', { class: 'stack-sm' },
          h('strong', null, bp(r.bps)),
          r.truncated ? h('span', { class: 'muted tiny' }, 'truncated to whole basis points') : null)
        : withheld(refusalLabel(r.excludeReason), 'Excluded')),
    },
  ];
  return card({
    title: 'Every pay decision',
    subtitle: 'A row whose price is missing is EXCLUDED and counted — never read as a zero increase. A row with two declared pay holders is named here; this screen does not choose one.',
    body: table({
      caption: 'Pay decisions with their lines, pay authority and increase',
      columns,
      rows: report.rows,
      emptyMessage: 'This cycle holds no pay decisions.',
    }),
  });
}

function refusalLabel(key) {
  return MERIT_PARITY_REFUSALS.find((r) => r.key === key)?.label || String(key || 'Excluded');
}

/* ---------------------------------------------------------- level-matched */

function levelSection(report) {
  return card({
    title: 'Level-matched reading',
    subtitle: `Only cells where BOTH cohorts hold ${MERIT_PARITY_FLOOR}+ priced people are printed. This narrows the composition caveat; it does not adjust for it, and it is still descriptive.`,
    body: report.byLevel.length
      ? table({
        caption: 'Level-matched cohort medians',
        columns: [
          { label: 'Level', render: (r) => r.label },
          { label: 'Second line', render: (r) => `${r.matrixN} priced` },
          { label: 'Home line only', render: (r) => `${r.singleN} priced` },
          { label: 'Second-line median', render: (r) => (r.printed ? bp(r.matrixMedianBps) : h('span', { class: 'muted tiny' }, 'withheld')) },
          { label: 'Home-line median', render: (r) => (r.printed ? bp(r.singleMedianBps) : h('span', { class: 'muted tiny' }, 'withheld')) },
          { label: 'Level gap', render: (r) => (r.printed ? bp(r.gapBps) : withheld(r.withheldReason, 'Withheld')) },
        ],
        rows: report.byLevel,
      })
      : emptyState({ title: 'No priced person to compare', body: 'Neither cohort holds a priced pay decision, so no level cell exists.' }),
    actions: [h('span', { class: 'muted tiny' }, `${report.matchedLevelN} level comparison(s) printed`)],
  });
}

/* ---------------------------------------------------------------- findings */

function findingsSection(report) {
  const columns = [
    { label: 'Finding', render: (f) => badge(refusalLabel(f.kind) === f.kind ? f.kind : f.kind.replace(/-/g, ' '), 'warn') },
    {
      label: 'Where',
      render: (f) => (f.kind === 'cohort-divergence'
        ? 'The two cohorts'
        : h('div', { class: 'stack-sm' }, h('strong', null, f.personName || 'Pay decision'), h('span', { class: 'muted tiny' }, f.cohort === 'matrix' ? 'second line' : 'home line only'))),
    },
    {
      label: 'What is named',
      render: (f) => h('div', { class: 'stack-sm' },
        h('span', { class: 'small' }, f.detail),
        f.holderNames?.length ? h('span', { class: 'muted tiny' }, `holders: ${f.holderNames.join(' · ')}`) : null),
    },
  ];
  return card({
    title: 'Structural findings',
    subtitle: 'Findings are on pay decisions, cohorts and levels — never a score on a person. A contested authority is named; choosing its owner is a human act this screen cannot perform.',
    body: report.findings.length
      ? h('div', { class: 'stack' },
        table({ caption: 'Structural findings for this cycle', columns, rows: report.findings }),
        report.cappedFindingsN ? h('p', { class: 'muted small' }, `${report.cappedFindingsN} further finding(s) are past the bounded list and counted, not dropped.`) : null)
      : emptyState({ title: 'No contradictory structure and no divergence past the band', body: 'Every priced decision had exactly one declared pay holder, and the two cohort medians sat inside the declared band. That is the absence of a printed finding — not proof of fairness.' }),
  });
}

/* ------------------------------------------------------------- reconciliation */

function reconciliationSection(report) {
  return card({
    title: 'Does this reading add up?',
    subtitle: 'Two different claims, printed separately: the counts reconcile, and every printed figure is the computed figure.',
    body: h('div', { class: 'stack-sm' },
      kv('Counts reconcile', report.reconciles ? 'Yes' : 'NO — do not trust this reading', report.reconciles ? 'good' : 'bad'),
      h('p', { class: 'muted small' }, report.reconcilesDetail),
      kv('Figures complete', report.figuresComplete ? 'Yes' : 'No — a needed figure is missing or withheld', report.figuresComplete ? 'good' : 'warn'),
      h('p', { class: 'muted small' }, report.figuresCompleteDetail),
      report.refusals.length
        ? h('ul', { class: 'list-plain stack-xs' },
          ...report.refusals.map((r) => h('li', { class: 'small' }, h('strong', null, refusalLabel(r.kind)), ' ', r.detail)))
        : h('p', { class: 'muted small' }, 'No refusal was raised by this reading.')),
  });
}

/* ------------------------------------------------------------------ method */

function methodSection(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Declared conventions',
      subtitle: 'Printed so a reader can disagree with them explicitly. There are no settings for any of these: a floor that can be lowered until the reading agrees with the reader is not a check.',
      body: h('div', { class: 'stack-sm' },
        kv('Cell floor', `${MERIT_PARITY_CONVENTIONS.cellFloor} priced people per cohort`),
        kv('Practical-significance band', `±${MERIT_PARITY_CONVENTIONS.toleranceBps} basis points`),
        kv('Median convention', 'Lower median of whole basis points'),
        kv('Increase arithmetic', 'Basis points from integer cents; truncated division with any remainder FLAGGED'),
        kv('Unit', '1 bp = 0.01 percentage point of the person’s own pay'),
        kv('Cohort date', `The cycle’s effective date (${dash(report.effectiveOn)}), never today’s org chart`),
        kv('Ratings read as of', dash(report.ratingAsOf)),
        kv('Identity in export', 'None')),
    }),
    card({
      title: 'Verdict precedence',
      subtitle: 'Declared top to bottom, so the panel, the brief and the CSV cannot disagree about a word.',
      body: table({
        caption: 'Parity verdict precedence',
        columns: [
          { label: 'Verdict', render: (v) => badge(v.label, toneFor(v.tone)) },
          { label: 'Opens work', render: (v) => (v.open ? 'Yes — it is a question for a human' : 'No') },
          { label: 'Means', render: (v) => h('span', { class: 'small' }, v.detail) },
        ],
        rows: MERIT_PARITY_VERDICTS,
      }),
    }),
    card({
      title: 'Pay-authority states',
      subtitle: 'Worst first. A contested right is named and counted; the reading never picks one of several managers as the owner of a pay decision.',
      body: table({
        caption: 'Pay authority states',
        columns: [
          { label: 'State', render: (s) => badge(s.label, toneFor(s.tone)) },
          { label: 'Means', render: (s) => h('span', { class: 'small' }, s.detail) },
        ],
        rows: MERIT_PARITY_AUTHORITY_STATES,
      }),
    }),
    card({
      title: 'What is refused, and why',
      body: h('ul', { class: 'list-plain stack-xs' },
        ...MERIT_PARITY_REFUSALS.map((r) => h('li', { class: 'small' }, h('strong', null, r.label), ' ', r.detail))),
    }),
    card({
      title: 'Frameworks applied',
      body: h('ul', { class: 'list-plain stack-xs' },
        ...MERIT_PARITY_FRAMEWORKS.map((f) => h('li', { class: 'small' }, h('strong', null, f.name), ' ', f.applied))),
    }),
    card({
      title: 'Export',
      subtitle: 'Aggregate only: no person, no name, no manager identifier, no salary and no individual increase.',
      body: h('div', { class: 'stack-sm' },
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => {
            const csv = ctx.api?.meritParityCsv?.({ cycleId: report.cycleId });
            if (!csv?.ok) {
              toast(csv?.error || 'The export declined to be built at this seat.', 'bad');
              return;
            }
            downloadText(
              serializeCsv(MERIT_PARITY_CSV_COLUMNS.map((key) => ({ key, header: key })), csv.rows),
              'leados-merit-matrix-parity.csv',
            );
          },
        }, 'Download CSV #116'),
        h('p', { class: 'muted small' }, 'Every figure in CSV #116 equals the figure on this screen: both are recomputed from the same stored cycle, roster and dated lines on every read, and nothing derived is stored.')),
    }),
  );
}

/* -------------------------------------------------------------------- page */

export function renderMeritMatrixTab(ctx, cycle, now = new Date()) {
  const state = ctx.state;
  const report = buildMeritParity(state, { cycleId: cycle?.id || null, now, settings: state.settings || null });
  if (!report.hasCycle) {
    return card({
      body: emptyState({
        title: 'No merit cycle to read',
        body: 'Declare a cycle with a budget first. The cohort split and the pay authority are read on the cycle’s effective date, so there is no reading to make before a date exists.',
      }),
    });
  }
  return h('div', { class: 'view-stack', 'data-testid': 'merit-matrix-panel' },
    verdictSection(report),
    statsSection(report),
    cohortSection(report),
    decisionsSection(report),
    levelSection(report),
    findingsSection(report),
    reconciliationSection(report),
    methodSection(ctx, report));
}
