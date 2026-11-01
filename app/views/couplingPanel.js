/**
 * app/views/couplingPanel.js — the Coupling Ledger panel of the Deferral
 * Option Terminal (`#/deferral?panel=coupling`, Schema v78, ADR-0070).
 *
 * The Portfolio panel makes the leader declare a ρ for every pair of calls the
 * graph shows sharing a premise, and then prices a joint tail on it. This panel
 * is the only place in the workspace where that declaration is read back
 * against what actually happened: two coupled calls either resolved inside the
 * same calendar block or they did not, and the coincidence rate across a band
 * of declarations is a fact the leader's own record already contains.
 *
 * Nothing here writes a declaration. The page exists so a leader can see, in
 * one screen, which of their structural assumptions their own record supports —
 * and it refuses to print a verdict on a band that is too thin to carry one.
 */

import { h, toast, openModal } from '../ui/dom.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { couplingCurveChart } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import {
  COUPLING_BANDS,
  COUPLING_LEDGER_ENGINE_VERSION,
  contradictionOf,
  couplingLedgerBrief,
  couplingLedgerReport,
} from '../core/domain/couplingLedger.js';
import { sharedPremisePairs } from '../core/domain/deferralPortfolio.js';
import { openDeclareCorrelationDialog } from '../ui/deferral-portfolio-modals.js';

const ASSESSMENT_LABEL = {
  confirmed: 'Confirmed by the record',
  'over-declared': 'Contradicted — declared coupled, resolved independently',
  'under-declared': 'Contradicted — declared independent, resolved together',
  overstated: 'Direction right, strength overstated',
  understated: 'Direction right, declaration was conservative',
  unresolved: 'No verdict on this record',
};

const VERDICT_LABEL = {
  coupled: 'co-moving',
  hedged: 'anti-moving',
  independent: 'consistent with independence',
  inconclusive: 'inconclusive',
  insufficient: 'too few pairs',
  unidentifiable: 'unidentifiable',
};

const VERDICT_TONE = {
  coupled: 'bad',
  hedged: 'warn',
  independent: 'good',
  inconclusive: 'neutral',
  insufficient: 'neutral',
  unidentifiable: 'neutral',
};

function num(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: dp });
}

function titleOf(ctx, id) {
  const decision = (ctx.state.decisions || []).find((d) => d && d.id === id);
  return decision ? (decision.title || decision.question || 'Untitled decision') : 'a removed call';
}

/* ------------------------------------------------------------- one band */

function bandCard(ctx, band) {
  const tone = band.contradiction ? 'bad' : band.assessment === 'confirmed' ? 'good' : 'neutral';
  const rows = band.rows.slice(0, 12).map((pair) => ({
    pair,
    a: titleOf(ctx, pair.aId),
    b: titleOf(ctx, pair.bId),
  }));
  return card({
    id: `coupling-band-${band.key}`,
    title: band.label,
    subtitle: `${band.pairs} declared pair(s) · ${band.testablePairs} testable · ρ ${band.declaredMinRho}…${band.declaredMaxRho}`,
    actions: [
      badge(`${VERDICT_LABEL[band.verdict] || band.verdict}`, VERDICT_TONE[band.verdict] || 'neutral'),
      badge(band.contradiction ? 'contradicted' : band.assessment, band.contradiction ? 'bad' : 'neutral'),
    ],
    body: h('div', { class: 'stack' },
      h('p', { class: 'small' }, band.hint),
      h('div', { class: 'stat-row' },
        stat({ label: 'Coincidences', value: `${band.collisions}`, hint: `of ${band.testablePairs} testable pair(s)` }),
        stat({ label: 'Expected if independent', value: num(band.expectedCollisions, 2), hint: 'sum of |A∩B| / (|A|·|B|)' }),
        stat({ label: 'Lift', value: band.lift === null ? '—' : `${num(band.lift, 2)}×`, hint: 'observed ÷ expected' }),
        stat({ label: 'p-value', value: band.pValue === null ? '—' : String(band.pValue), hint: `${band.rotations} rotations · floor ${band.floorP}` }),
        stat({ label: 'Declared ρ implies', value: `${band.modelCollisionPct}%`, hint: 'coincidence under τ = ρ' })),
      h('p', { class: 'muted small' },
        `The record observed ${band.observedCollisionPct}% coincidence across these pairs; independence on their own common windows implies ${band.modelIndependentPct}%. `
        + `At the declared ρ ${band.declaredMidRho} the copula predicts ${band.modelCollisionPct}% under τ = ρ and ${band.modelByMapping[1] ? band.modelByMapping[1].collisionAllTestablePct : '—'}% under τ = 2·sin(πρ/6) — the second mapping exists because ρ is a correlation of value innovations and a coincidence is a correlation of times.`),
      band.mappingDisagreement
        ? banner({
          tone: 'warn',
          title: 'This magnitude finding depends on which rank mapping you accept',
          body: 'The observed rate sits inside the materiality band of one mapping and outside the other. That is not evidence that the declaration was wrong, and this module will not open work on it. The direction may be confirmed independently, but the strength cannot be.',
        })
        : null,
      band.implied
        ? h('p', { class: 'muted small' },
          band.implied.identified
            ? `Advisory only, never applied: the observed rate would imply ρ ≈ ${band.implied.rho} on this band’s median window (${band.medianBlocks} blocks). A coincidence rate is one moment and the inversion is one-dimensional — treat it as a direction and a rough size, not a measurement.`
            : `No implied ρ is printed: ${band.implied.reason}`)
        : null,
      couplingCurveChart(band),
      rows.length
        ? table({
          caption: `Declared pairs audited in the ${band.label} band`,
          columns: [
            { label: 'Call A', render: (row) => h('a', { href: `#/decisions?decision=${encodeURIComponent(row.pair.aId)}` }, row.a) },
            { label: 'Call B', render: (row) => h('a', { href: `#/decisions?decision=${encodeURIComponent(row.pair.bId)}` }, row.b) },
            { label: 'ρ', render: (row) => String(row.pair.rho) },
            { label: 'Shared window', render: (row) => `${row.pair.commonBlocks} block(s)` },
            { label: 'Resolved together?', render: (row) => (row.pair.collided ? 'yes' : 'no') },
            {
              label: 'One-pair floor',
              render: (row) => `${num(1 / row.pair.commonBlocks, 2)}`,
            },
          ],
          rows,
        })
        : h('p', { class: 'muted small' }, 'No pair in this band is testable yet.'),
      band.testablePairs < band.pairs
        ? h('p', { class: 'muted tiny' },
          `${band.pairs - band.testablePairs} declared pair(s) in this band are refused for testing — see the refusals card for the reason attached to each one.`)
        : null,
    ),
    meta: h('p', { class: 'muted tiny' },
      `Materiality band ±${band.materiality}pp (20% of the model figure or five points, whichever is larger) · alpha ${(band.alpha * 100).toFixed(0)}% · smallest attainable p for a single pair here ${band.minAttainableP}`),
  });
}

/* ------------------------------------------------------------ refusals */

function refusalsCard(report) {
  const refusals = report.observations.refusals || [];
  if (!refusals.length) return null;
  return card({
    title: 'Pairs the ledger refuses to test, and why',
    subtitle: 'A refusal is a printed reason, never a quiet zero.',
    body: table({
      caption: 'Declared pairs excluded from the coincidence counts',
      columns: [
        { label: 'Call A', render: (row) => h('span', null, row.aId.slice(0, 14)) },
        { label: 'Call B', render: (row) => h('span', null, row.bId.slice(0, 14)) },
        { label: 'ρ', render: (row) => String(row.rho) },
        { label: 'Reason', render: (row) => row.reason },
      ],
      rows: refusals.slice(0, 20),
    }),
  });
}

/* --------------------------------------------------------------- frozen */

function frozenCard(ctx, report, now) {
  const records = report.records;
  const grade = (record) => {
    const result = ctx.api.gradeCouplingReview(record.id);
    if (result && result.ok) {
      toast(`Graded once: outcome ${result.result?.anyCommitted ? 'a commit inside the window' : 'no commit inside the window'}, Brier ${result.result?.brier}.`, 'good');
      ctx.refresh ? ctx.refresh() : ctx.navigate('#/deferral?panel=coupling');
    } else {
      toast((result && result.error) || 'The grade was refused.', 'bad');
    }
  };
  const rows = records.map((record) => ({
    record,
    key: record.id,
  }));
  return card({
    title: 'Frozen reviews',
    subtitle: 'Bounded, aggregate-only records plus exactly one prospective probability, graded once.',
    actions: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeCouplingReview();
          if (result && result.ok) {
            toast(`Frozen one coupling review for ${result.reviewOn}.`, 'good');
            ctx.refresh ? ctx.refresh() : ctx.navigate('#/deferral?panel=coupling');
          } else {
            toast((result && result.error) || 'The freeze was refused.', 'bad');
          }
        },
      }, 'Freeze a review'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanCouplingLedger();
          toast(result && result.changed
            ? 'The scan opened work — see the decisions and tasks it wrote.'
            : 'The scan found nothing to open.', 'good');
          ctx.refresh ? ctx.refresh() : ctx.navigate('#/deferral?panel=coupling');
        },
      }, 'Scan now'),
    ],
    body: rows.length
      ? table({
        caption: 'Frozen coupling reviews, newest first',
        columns: [
          { label: 'Frozen', render: (row) => row.record.frozenAt.slice(0, 10) },
          { label: 'Window closes', render: (row) => row.record.reviewOn },
          { label: 'Bands', render: (row) => String(row.record.bands.length) },
          { label: 'Testable pairs', render: (row) => String(row.record.testablePairs) },
          { label: 'Frozen P(any commit)', render: (row) => `${row.record.predictedAnyCommitPct}%` },
          {
            label: 'Outcome',
            render: (row) => (row.record.graded
              ? `${row.record.graded.anyCommitted ? 'committed' : 'no commit'} · Brier ${row.record.graded.brier}`
              : h('button', {
                class: 'btn btn-quiet',
                type: 'button',
                disabled: row.record.reviewOn > report.today,
                onClick: () => grade(row.record),
              }, row.record.reviewOn > report.today ? 'window open' : 'Grade')),
          },
        ],
        rows,
      })
      : emptyState({
        title: 'No coupling review has been frozen',
        body: 'A frozen review is a dated, aggregate-only snapshot of every band verdict plus one prospective probability. Freezing it is what makes the ledger’s own claims gradable — a ledger whose forecasts are never scored cannot tell you anything about your judgement.',
      }),
    meta: report.calibration
      ? h('p', { class: 'muted small' }, `Calibration across graded reviews: ${report.calibration.verdict}`)
      : null,
  });
}

/* ----------------------------------------------------------- undeclared */

function undeclaredCard(ctx, report) {
  const pairs = report.undeclared;
  if (!pairs.length) return null;
  // The advisory suggestion comes only from a band whose inversion the record
  // actually identified. A band that cannot separate one ρ from another
  // suggests nothing, and the dialog opens at its own default.
  const advisory = report.bands.find((band) => band.implied && band.implied.identified
    && typeof band.implied.rho === 'number');
  return card({
    title: 'Premise-sharing pairs with no declared ρ',
    subtitle: 'The graph names the pair; only the leader can name the number.',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'muted small' },
        'Until each of these carries a declared ρ, the Portfolio tab refuses the joint tail for its book — the per-call premiums still print. These pairs are also invisible to every figure on this page, because the ledger can only audit a number that exists.'),
      table({
        caption: 'Premise-sharing pairs still undeclared',
        columns: [
          { label: 'Call A', render: (row) => titleOf(ctx, row.aId) },
          { label: 'Call B', render: (row) => titleOf(ctx, row.bId) },
          { label: 'Shared premises', render: (row) => String(row.premiseIds.length) },
          {
            label: 'Declare',
            render: (row) => h('button', {
              class: 'btn btn-quiet',
              type: 'button',
              onClick: () => openDeclareCorrelationDialog(ctx, row, () => {
                ctx.refresh ? ctx.refresh() : ctx.navigate('#/deferral?panel=coupling');
              }, advisory ? { rho: advisory.implied.rho, note: `Your own "${advisory.label}" band resolves at about ρ ${advisory.implied.rho}. This is a starting point you must confirm, not a recommendation.` } : null),
            }, 'Declare ρ'),
          },
        ],
        rows: pairs.slice(0, 12),
      })),
  });
}

/* --------------------------------------------------------------- method */

function methodCard(report) {
  const conventions = report.conventions;
  const rows = [
    ['The estimand (conditional co-resolution)', 'Among declared pairs where BOTH calls carry a decision date, how often did the two resolutions land in the same calendar block? That is co-resolution given that both resolved — not co-movement of value, and not a probability that either resolves at all. The conditioning is printed because it is a real restriction on what the number means.'],
    ['The coincidence block (a declared convention)', `A fixed ${conventions.blockDays}-day calendar block, not a rolling window and not a per-pair quantile. Blocks are anchored to the epoch, so two calls resolving on the same day always fall in the same block regardless of when they started. A different block length changes which pairs are testable at all; a pair whose whole common window fits in one block is refused rather than counted as a guaranteed coincidence.`],
    ['The null (a structure-preserving rotation)', 'Each call’s resolution block is cyclically rotated inside its OWN at-risk window — start date to resolution date. Rotating rather than resampling keeps every call’s marginal exposure, keeps pairs that share a decision linked (one call generates all of its pairs from one placement), and keeps the test deterministic: there is no seed, so the p-value is the same on every machine. Because the rotation window is at least as wide as the pair’s common window, the null makes coincidence no MORE likely than a uniform-over-overlap null would — the reported p-value overstates, never understates, the evidence for coupling.'],
    ['The analytic expectation `|A ∩ B| / (|A|·|B|)`', 'Under independent uniform placement of each resolution inside its own window, two resolutions coincide with exactly this probability. It is printed as the expected count so the lift has a denominator that does not depend on the rotation family at all.'],
    ['The declared-ρ reference (Gaussian copula)', 'A declared ρ is a Pearson correlation of value innovations; a coincidence is a rank correlation of TIMES. The module maps one onto the other through a bivariate-normal copula on the block index and prints both defensible mappings — τ = ρ and the exact normal-theory Spearman transform τ = 2·sin(πρ/6) (Kruskal 1958). At ρ = 0 the curve reproduces the printed independence rate 1/k exactly; at ρ → 1 it reaches 1. Where the two mappings disagree about a magnitude finding, the finding is marked mapping-dependent and no work is opened.'],
    ['Numerics (A&S 26.2.17; Wichura AS241; one-factor Simpson)', 'Φ from the Abramowitz–Stegun 26.2.17 rational approximation (|error| < 7.5e-8) and Φ⁻¹ from Wichura’s AS241 (|error| < 1e-16 on the central range). Φ₂ uses the one-factor representation X = √ρ·T + √(1−ρ)·U and conditions on T — NOT the tempting Φ((h − ρt)/√(1−ρ²)) shortcut, which is the CDF for a correlation of ρ² and was wrong by 13 points at ρ = 0.5 before this module caught it. The integrand’s feature width is √(1−ρ), so the panel count scales with 1/√(1−ρ); the result is pinned in the test suite against the closed form Φ₂(0,0;ρ) = ¼ + arcsin(ρ)/2π to six decimals across ρ ∈ [−0.5, 0.99]. Fixed rules, no random draws: the same input yields the same figure everywhere.'],
    ['Proper scoring (Brier 1950)', 'A frozen review carries exactly one probability — that at least one member call commits before the window closes, computed from the workspace’s own Laplace-smoothed resolution hazard — and is scored once afterwards against the recorded decision dates. Skill waits for five graded reviews, as everywhere else in this workspace.'],
    ['What is never written', 'This module never writes a ρ. It never clamps, defaults or derives a declaration. It never rewrites a frozen figure: a new declaration landing in a contradicted band appends a challenge note and opens one advisory task, and that is all.'],
  ];
  return card({
    title: 'The ledger maths, in the open',
    body: table({
      caption: 'Coupling Ledger methods and what each one actually computes',
      columns: [
        { label: 'Method', render: (row) => h('strong', null, row[0]) },
        { label: 'Operational definition', render: (row) => row[1] },
      ],
      rows,
    }),
    meta: h('p', { class: 'muted small' },
      `Conventions: ${conventions.blockDays}-day blocks · ${conventions.rotations} rotations · ${conventions.minPairs} testable pairs and ${conventions.minExpectedCollisions.toFixed(1)} expected coincidences before a verdict · alpha ${(conventions.alpha * 100).toFixed(0)}% · lift tolerance ±${(conventions.liftTolerance * 100).toFixed(0)}% · ${COUPLING_LEDGER_ENGINE_VERSION} · schema v78 · deterministic, local, no network.`),
  });
}

/* ----------------------------------------------------------------- page */

export function renderCouplingPanel(ctx) {
  const state = ctx.state || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const report = couplingLedgerReport(state, now, state.settings || {});
  const declared = report.counts.declarations;
  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head-text' },
        h('p', { class: 'page-eyebrow' }, 'Schema v78 · ADR-0070'),
        h('h2', { class: 'page-title' }, 'The Coupling Ledger'),
        h('p', { class: 'page-sub' }, 'Every ρ in the Portfolio tab is a judgement the record cannot supply. This screen is where the record answers back: two coupled calls either resolved inside the same calendar block or they did not, and the rate of that is a fact your workspace already contains.'),
        h('p', { class: 'muted small' },
          `${declared} declaration(s) · ${report.counts.testable} testable pair(s) · ${report.counts.refused} refused · ${report.counts.bands} band(s) · ${report.counts.reviews} frozen review(s) · ${report.counts.undeclared} undeclared premise pair(s) · local only`)),
      h('div', { class: 'page-head-actions' },
        h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            const text = couplingLedgerBrief(report, now);
            const saved = downloadText({
              filename: `coupling-ledger-${report.today}.txt`,
              text,
              mime: 'text/plain',
            });
            if (!saved) {
              openModal({
                title: 'Copy the coupling brief',
                description: 'This browser blocked the download. Select and copy the text below instead.',
                body: h('textarea', { rows: '18', readOnly: true, value: text, 'aria-label': 'Coupling ledger brief text' }),
              });
            }
          },
        }, 'Save ledger brief'))),
    report.bands.length
      ? null
      : emptyState({
        title: declared
          ? 'No declared pair has resolved in both call'
          : 'No correlation has been declared yet',
        body: declared
          ? `You have ${declared} declaration(s), but a coincidence needs two resolution dates: at least one of the two calls in a pair is still open, or was closed without a decision date. The refusals below carry the reason attached to each pair.`
          : 'The ledger audits declarations — it cannot invent one. Open the Portfolio tab, declare a ρ for each premise-sharing pair, and this screen starts reading your own record back to you.',
        action: h('a', { class: 'btn btn-primary', href: '#/deferral?panel=portfolio' }, 'Open the portfolio tab'),
      }),
    report.counts.failures
      ? banner({
        tone: 'bad',
        title: `${report.counts.failures} band(s) carry a declaration this record contradicts`,
        body: 'A contradicted band means the joint tail priced in the Portfolio tab is describing a world your own resolution dates do not show. The ledger opens one reconciliation task and, on a scan, one governed decision — it never re-declares for you. Where the two rank mappings disagree the finding is not counted here at all.',
      })
      : null,
    report.bands.length
      ? h('div', { class: 'stack' }, ...report.bands.map((band) => bandCard(ctx, band)))
      : null,
    refusalsCard(report),
    frozenCard(ctx, report, now),
    undeclaredCard(ctx, report),
    methodCard(report));
}

export { ASSESSMENT_LABEL, VERDICT_LABEL, COUPLING_BANDS, contradictionOf };
