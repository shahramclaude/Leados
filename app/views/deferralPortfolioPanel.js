/**
 * app/views/deferralPortfolioPanel.js — the Portfolio panel of the Deferral
 * Option Terminal (`#/deferral?panel=portfolio`, Schema v69, ADR-0060).
 *
 * The per-call panels price one option at a time. This panel reads the whole
 * book: which calls share a premise, what the leader declared about how their
 * values move together, how much of the book's flexibility fails at once, and
 * which single call carries the tail. The additivity statement is printed on
 * the page itself — the expected total is the sum of the per-call premiums
 * under ANY correlation, so nothing here claims more expected value; what
 * changes with correlation is the risk that everything lapses together.
 *
 * The panel refuses rather than guesses: an undeclared premise-sharing pair
 * refuses the joint tail (the per-call premiums still print), a
 * non-positive-semi-definite declaration set refuses the whole simulation,
 * and a workspace with fewer than two priced open calls in a currency has no
 * book to read at all.
 */

import { h, toast, openModal } from '../ui/dom.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  DEFERRAL_PORTFOLIO_ENGINE_VERSION,
  portfolioDeferralBrief,
  portfolioDeferralReport,
  sharedPremisePairs,
} from '../core/domain/deferralPortfolio.js';
import {
  openDeclareCorrelationDialog,
  openFreezePortfolioDialog,
} from '../ui/deferral-portfolio-modals.js';

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function num(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: dp });
}

function titleOf(ctx, id) {
  const decision = (ctx.state.decisions || []).find((d) => d && d.id === id);
  return decision ? (decision.title || decision.question || 'Untitled decision') : 'a removed call';
}

/* --------------------------------------------------------------- the book */

function portfolioCard(ctx, report, portfolio) {
  const conventions = report.conventions;
  const sim = portfolio.simulation;
  const declarations = ctx.state.correlationDeclarations || [];
  const pairs = sharedPremisePairs(ctx.state)
    .filter((pair) => portfolio.members.some((m) => m.decisionId === pair.aId)
      && portfolio.members.some((m) => m.decisionId === pair.bId));

  const declaredRows = pairs.map((pair) => {
    const declared = declarations.find((row) => row
      && ((row.aId === pair.aId && row.bId === pair.bId) || (row.aId === pair.bId && row.bId === pair.aId)));
    return { pair, declared };
  });

  const correlationCard = card({
    title: `Declared correlations · ${portfolio.currency}`,
    subtitle: portfolio.correlation.conventions,
    body: declaredRows.length
      ? h('div', { class: 'stack-sm' },
        ...declaredRows.map(({ pair, declared }) => h('div', { class: 'dpo-pair' },
          h('div', { class: 'stack-xs' },
            h('span', { class: 'small' },
              h('strong', null, titleOf(ctx, pair.aId)), ' ↔ ', h('strong', null, titleOf(ctx, pair.bId))),
            h('span', { class: 'muted small' }, `shares ${pair.premiseIds.length} recorded premise(s)`)),
          declared
            ? h('div', { class: 'stack-xs' },
              badge(`ρ ${declared.rho}`, 'good'),
              h('button', {
                class: 'btn btn-tiny btn-quiet', type: 'button',
                onClick: () => openDeclareCorrelationDialog(ctx, pair, () => ctx.navigate(`#/deferral?panel=portfolio`)),
              }, 'Re-declare'))
            : h('div', { class: 'stack-xs' },
              badge('undeclared', 'warn'),
              h('button', {
                class: 'btn btn-tiny', type: 'button',
                onClick: () => openDeclareCorrelationDialog(ctx, pair, () => ctx.navigate(`#/deferral?panel=portfolio`)),
              }, 'Declare ρ')))))
      : h('p', { class: 'muted small' },
        'The graph records no shared premise between any two members of this book, so every pair is ρ = 0 by convention. Nothing needs declaring; the tail below is a diversification statement, not a coupling one.'),
  });

  if (portfolio.refusal || !sim) {
    return h('div', { class: 'stack' },
      card({
        title: `The ${portfolio.currency} book · ${portfolio.memberCount} call(s)`,
        subtitle: `Σ stake ${money(portfolio.sumStake, portfolio.currency)} · Σ premium ${money(portfolio.sumPremium, portfolio.currency)} (exact, per-call lattices) · window closes ${portfolio.windowClose}`,
        body: h('div', { class: 'stack-sm' },
          banner({
            tone: 'warn',
            title: 'The joint tail is refused, not estimated',
            body: portfolio.refusal,
          }),
          h('p', { class: 'muted small' },
            'Correlation does not change the expected total — each call follows its own boundary, so the sum of the premiums stands under any ρ. What waits for the declarations is the joint distribution: the tail, the concentration and the shared-premise stress.')),
      }),
      correlationCard,
      card({
        title: 'The members, one by one',
        subtitle: 'Per-call premiums need no correlation and are exact.',
        body: table({
          caption: `Member calls of the ${portfolio.currency} book`,
          columns: [
            { label: 'Decision', render: (row) => h('a', { href: `#/deferral?panel=overview&decision=${encodeURIComponent(row.decisionId)}` }, row.title) },
            { label: 'Stake', render: (row) => money(row.valueNow, portfolio.currency) },
            { label: 'Premium', render: (row) => money(row.option.premium, portfolio.currency) },
            { label: 'Verdict', render: (row) => badge(row.verdict.label.replace('-', ' '), row.verdict.id === 'wait' ? 'good' : 'neutral') },
          ],
          rows: portfolio.members,
        }),
      }));
  }

  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Σ premium (exact)', value: money(portfolio.sumPremium, portfolio.currency), hint: 'the sum of the per-call lattices; this is the expected total under ANY correlation' }),
    stat({ label: `${(sim.tailLevel * 100).toFixed(0)}% CVaR of the total`, value: money(sim.cvar, portfolio.currency), hint: `VaR ${money(sim.var, portfolio.currency)} · the mean of the worst ${(100 - sim.tailLevel * 100).toFixed(0)}% of worlds` }),
    stat({ label: 'Diversification credit', value: money(sim.diversificationCredit, portfolio.currency), hint: `Book CVaR ${money(sim.cvar, portfolio.currency)} minus Σ standalone CVaR ${money(sim.standaloneCvarSum, portfolio.currency)} — subadditivity: pooling softens the tail; exact CVaR credit is ≥ 0, a small negative measured credit is simulation noise` }),
    stat({ label: 'P(all lapse together)', value: `${sim.pAllLapsePct}%`, hint: `P(at least one commit) ${sim.pAnyCommitPct}% · ${sim.paths} seeded paths, ${sim.stepDays < 1.05 ? 'daily grid' : `${sim.stepDays.toFixed(1)}-day grid`}` }),
    stat({ label: 'Top tail share', value: sim.topContributionShare === null ? '—' : `${(sim.topContributionShare * 100).toFixed(0)}%`, hint: `the call carrying most of the tail · convention ${(conventions.concentration * 100).toFixed(0)}%` }),
    stat({ label: 'HHI', value: `premium ${num(sim.hhiPremium, 3)} · tail ${num(sim.hhiContribution, 3)}`, hint: 'Herfindahl–Hirschman on premium shares and on tail-contribution shares' }));

  const membersCard = card({
    title: 'Where the tail lives — premium share vs tail share',
    subtitle: 'Contribution_i is the member’s mean payoff inside the book’s own worst tail (Tasche 1999); the contributions partition the tail mean exactly. A call that is a small share of the premium but a large share of the tail is the concentration finding.',
    body: table({
      caption: `Concentration table for the ${portfolio.currency} book`,
      columns: [
        { label: 'Decision', render: (row) => h('a', { href: `#/deferral?panel=overview&decision=${encodeURIComponent(row.decisionId)}` }, row.title) },
        { label: 'Premium', render: (row) => money(row.premium, portfolio.currency) },
        { label: 'Premium share', render: (row) => `${(row.premiumShare * 100).toFixed(0)}%` },
        { label: 'Tail contribution', render: (row) => money(row.contribution, portfolio.currency) },
        { label: 'Tail share', render: (row) => (row.contributionShare === null ? '—' : `${(row.contributionShare * 100).toFixed(0)}%${row.contributionShare >= conventions.concentration ? ' ←' : ''}`) },
        { label: 'Standalone CVaR', render: (row) => money(row.standaloneCvar, portfolio.currency) },
        { label: 'Book CVaR if committed now', render: (row) => money(row.cvarIfCommittedNow, portfolio.currency) },
        { label: 'MC commit vs lattice', render: (row) => `${row.mcCommitPct}% vs ${row.latticeCommitPct}%` },
      ],
      rows: sim.members,
    }),
  });

  const premiseCard = sim.premises.length
    ? card({
      title: 'Shared-premise stress — what fails together',
      subtitle: 'From the same paths: how often every call coupled by one premise lapses together, against the independence benchmark (the product of the same marginal lapse rates). No shock size is invented.',
      body: table({
        caption: 'Joint lapse by shared premise',
        columns: [
          { label: 'Premise', render: (row) => h('a', { href: `#/premises?tab=ledger&premise=${encodeURIComponent(row.premiseId)}` }, titleOf(ctx, row.premiseId) === 'a removed call' ? 'Open the premise' : `Premise ${row.premiseId.slice(0, 12)}`) },
          { label: 'Coupled calls', render: (row) => String(row.memberCount) },
          { label: 'P(all lapse)', render: (row) => `${row.jointLapsePct}%` },
          { label: 'Under independence', render: (row) => `${row.independenceLapsePct}%` },
          { label: 'Excess', render: (row) => `+${row.excessPp}pp${row.excessPp >= conventions.jointLapsePp ? ' ← past the convention' : ''}` },
          { label: 'Premium carried', render: (row) => (row.premiumSharePct === null ? '—' : `${row.premiumSharePct}%`) },
        ],
        rows: sim.premises,
      }),
    })
    : null;

  return h('div', { class: 'stack' },
    card({
      title: `The ${portfolio.currency} book · ${portfolio.memberCount} call(s)`,
      subtitle: `Σ stake ${money(portfolio.sumStake, portfolio.currency)} · window closes ${portfolio.windowClose} · ${sim.paths} seeded paths on a ${sim.stepDays < 1.05 ? 'daily' : `${sim.stepDays.toFixed(1)}-day`} grid · seed ${sim.seed}`,
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => openFreezePortfolioDialog(ctx, portfolio, () => ctx.navigate('#/deferral?panel=portfolio')),
        }, 'Freeze this book'),
      ],
      body: h('div', { class: 'stack-sm' },
        banner({
          tone: 'neutral',
          title: 'Correlation does not change what this book is worth in expectation',
          body: `Each call follows its own exercise boundary, so the expected total is the sum of the per-call premiums under ANY correlation — ${money(portfolio.sumPremium, portfolio.currency)}, from the lattices, not from the simulation. What the declared ρ changes is the distribution: the tail below, the concentration, and how often coupled calls fail together. The MC mean (${money(sim.meanTotal, portfolio.currency)} ± ${money(sim.seTotal, portfolio.currency)}) is printed only to show the grid error against the exact sum — checkpoint overshoot under high volatility inflates it above the lattice value while the commit RATE still matches — and it is never the quoted total.`,
        })),
    }),
    stats,
    correlationCard,
    membersCard,
    premiseCard,
    portfolio.excludedPricedCalls
      ? h('p', { class: 'muted small' }, portfolio.excludedPricedCalls + ' — raise the member cap in Settings if the book should be wider.')
      : null);
}

/* -------------------------------------------------------------- readings */

function readingsPanel(ctx, report) {
  const records = report.records || [];
  const calibration = report.calibration || {};
  // A typed link to one reading (#/deferral?panel=portfolio&reading=<id>)
  // focuses that record's card so navigation lands on the fact, not the top
  // of a list.
  const focusId = ctx?.query?.get ? ctx.query.get('reading') : null;
  const focused = focusId ? records.find((r) => r.id === focusId) : null;
  return h('div', { class: 'stack' },
    card({
      title: 'Frozen book readings',
      subtitle: 'A reading freezes one probability — that at least one member call commits before the window closes — and is scored once against the recorded decision dates.',
      actions: [h('button', {
        class: 'btn', type: 'button',
        onClick: () => {
          const result = ctx.api.scanDeferralPortfolio();
          toast(result?.warning ? `Scan ran in memory but was NOT SAVED: ${result.warning}`
            : result?.changed ? 'Scan opened grading work or reconciled edges.' : 'Scan complete: nothing new.',
          result?.warning ? 'bad' : result?.changed ? 'good' : 'neutral');
          ctx.navigate('#/deferral?panel=portfolio');
        },
      }, 'Scan due work')],
      body: records.length
        ? h('div', { class: 'stack' }, ...records.map((record) => card({
          id: record.id === focusId ? 'focused-portfolio-reading' : undefined,
          title: `${record.currency} book · ${record.memberIds.length} call(s) · frozen ${record.frozenAt.slice(0, 10)}${record.id === focusId ? ' · focused' : ''}`,
          subtitle: `window ${record.windowDays}d to ${record.reviewOn} · Σ premium ${money(record.sumPremium, record.currency)} · CVaR ${money(record.cvar, record.currency)} · diversification credit ${money(record.diversificationCredit, record.currency)}`,
          actions: [
            badge(record.graded ? 'graded once' : record.reviewOn <= report.today ? 'due now' : 'frozen',
              record.graded ? 'good' : record.reviewOn <= report.today ? 'warn' : 'neutral'),
            !record.graded ? h('button', {
              class: 'btn btn-small', type: 'button',
              onClick: () => {
                const result = ctx.api.gradeDeferralPortfolioReading(record.id);
                if (!result?.ok) {
                  toast(result?.error || 'Could not grade this reading.', 'bad');
                  return;
                }
                toast(result.warning ? `Graded in memory but NOT SAVED: ${result.warning}`
                  : `Graded once: ${result.grade.anyCommitted ? 'a member committed by' : 'no member committed by'} ${record.reviewOn}; Brier ${result.grade.brier}.`,
                result.warning ? 'bad' : 'good');
                ctx.navigate('#/deferral?panel=portfolio');
              },
            }, 'Grade') : null,
            !record.graded ? h('button', {
              class: 'btn btn-small btn-quiet', type: 'button',
              onClick: () => {
                const result = ctx.api.deleteDeferralPortfolioReading(record.id);
                toast(result?.warning ? `Removed in memory but NOT SAVED: ${result.warning}`
                  : result?.ok ? 'Ungraded reading removed; audit event retained.' : result?.error || 'Delete refused.',
                result?.warning || !result?.ok ? 'bad' : 'neutral');
                if (result?.ok) ctx.navigate('#/deferral?panel=portfolio');
              },
            }, 'Delete') : null,
          ].filter(Boolean),
          body: h('div', { class: 'stack-sm' },
            h('div', { class: 'stat-row' },
              stat({ label: 'Frozen P(any commit by window)', value: `${record.predictedAnyCommitPct}%`, hint: `Window closed ${record.reviewOn}` }),
              stat({ label: 'Top tail share at freeze', value: record.topContributionShare === null ? '—' : `${(record.topContributionShare * 100).toFixed(0)}%`, hint: 'the call carrying most of the tail' }),
              stat({ label: 'P(all lapse)', value: record.pAllLapsePct === null ? '—' : `${record.pAllLapsePct}%`, hint: 'the whole book expiring unused' }),
              stat({ label: 'Stressed premises', value: String(record.stressedPremiseCount), hint: 'premises coupling ≥2 members' }),
              stat({ label: 'Brier', value: record.graded ? String(record.graded.brier) : 'not yet', hint: record.graded ? (record.graded.anyCommitted ? 'A member committed by the deadline' : 'No member committed by the deadline') : 'A later date must settle it' })),
            (record.challengeNotes || []).length
              ? h('div', { class: 'stack-xs' },
                h('span', { class: 'small' }, h('strong', null, 'Challenged:')),
                ...record.challengeNotes.slice(-3).map((note) => h('p', { class: 'muted small' }, note)))
              : null),
        }))) : emptyState({
          title: 'No book reading has been frozen',
          body: 'Freeze one from the book above. A reading written after the window closes is not a prediction.',
        }),
    }),
    card({
      title: 'Calibration',
      subtitle: 'Scored against the workspace’s own observed any-commit rate, below five graded readings withheld.',
      body: h('div', { class: 'stack-sm' },
        h('p', { class: 'muted' }, calibration.verdict),
        calibration.graded > 0
          ? h('div', { class: 'stat-row' },
            stat({ label: 'Graded readings', value: `${calibration.graded}/${calibration.required}` }),
            stat({ label: 'Brier', value: calibration.brier === null ? '—' : String(calibration.brier) }),
            stat({ label: 'Base-rate Brier', value: calibration.baselineBrier === null ? '—' : String(calibration.baselineBrier) }),
            stat({ label: 'Observed any-commit rate', value: calibration.baseRate === null ? '—' : `${(calibration.baseRate * 100).toFixed(1)}%` }),
            stat({ label: 'Skill', value: calibration.skill === null ? 'withheld' : String(calibration.skill), hint: 'Positive beats the base rate' }))
          : null),
    }));
}

/* ---------------------------------------------------------------- method */

function methodCard(report) {
  const conventions = report.conventions;
  const rows = [
    ['Additivity of the expected total (linearity of expectation)', 'Each call is exercised by its own boundary policy, a functional of its own value path alone. For any joint law with those marginals, E[Σ Payoff_i] = Σ E[Payoff_i]. The quoted expected total is therefore the sum of the per-call CRR premiums — exact — and no "portfolio premium uplift" number exists anywhere in this module, because under independent exercise there is none.'],
    ['Declared correlation, graph-identified pairs (Cholesky 1910)', 'The typed graph names the decision pairs that share a premise (the premise ledger and rests-on/tests edges). The leader declares ρ for each such pair; pairs sharing no premise are ρ = 0 by printed convention. A declaration set that is not positive semi-definite is refused outright — no joint distribution has those pairwise correlations, and projecting onto the PSD cone would silently change declared numbers.'],
    ['Common-random-numbers Monte Carlo (mulberry32; Box–Muller 1958)', 'Seeded, deterministic, daily grid (convention deferralPortfolioGridDays, 1–7). Each member follows its own frozen lattice boundary (tabulated once per member onto the grid — printed), pays its own carry while open and lapses at its own earlier deadline. The same draws serve the tail, the leave-one-out CVaRs and the premise stress, so every comparison reads one world.'],
    ['Coherent tail risk (Artzner et al. 1999; Rockafellar & Uryasev 2000)', 'VaR and CVaR (expected shortfall) of the total net wait value at the declared tail level. CVaR is subadditive, so the diversification credit Σ_i CVaR_i − CVaR_total is ≥ 0 by construction and shrinks to 0 as the declared ρ → 1: perfect correlation buys no diversification.'],
    ['Component contributions (Tasche 1999)', 'Contribution_i = E[Payoff_i | total in its worst tail]. The contributions are conditional means over the same tail set, so they partition CVaR exactly — no allocation heuristic, no Euler approximation.'],
    ['Shared-premise joint-lapse stress', 'For each premise coupling ≥ 2 members: P(all coupled calls lapse together) from the correlated paths, against the product of the same marginal lapse rates (what independence would give). The excess in percentage points is what the declared correlation buys in "everything fails at once". No shock size is invented.'],
    ['Proper scoring (Brier 1950)', 'One probability is frozen before the window — P(at least one member commits by the close) — and scored once afterwards against the recorded decidedOn dates. Skill waits for five graded readings, as everywhere else in this workspace.'],
  ];
  return card({
    title: 'The portfolio maths, in the open',
    body: table({
      caption: 'Deferral Portfolio methods and what each one actually computes',
      columns: [
        { label: 'Method', render: (row) => h('strong', null, row[0]) },
        { label: 'Operational definition', render: (row) => row[1] },
      ],
      rows,
    }),
    meta: h('p', { class: 'muted small' },
      `Conventions: ${conventions.maxMembers} member cap · ${conventions.paths} paths (500–20,000) · tail ${conventions.concentration * 100 > 0 ? `${(conventions.tailLevel * 100).toFixed(0)}%` : ''} · concentration ${(conventions.concentration * 100).toFixed(0)}% · joint-lapse alert +${conventions.jointLapsePp}pp · ${DEFERRAL_PORTFOLIO_ENGINE_VERSION} · schema v69 · deterministic, local, no network.`),
  });
}

/* ------------------------------------------------------------------ page */

export function renderPortfolioPanel(ctx) {
  const state = ctx.state || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const report = portfolioDeferralReport(state, now, state.settings || {});
  return h('div', { class: 'stack' },
    // The outer view already owns the page h1; a panel header is a toolbar,
    // never a second page title.
    h('div', { class: 'page-head' },
      h('div', { class: 'page-head-text' },
        h('p', { class: 'page-eyebrow' }, 'Schema v69 · ADR-0060'),
        h('h2', { class: 'page-title' }, 'The book of open calls'),
        h('p', { class: 'page-sub' }, 'The per-call panels price one option at a time. This one reads the whole book: what fails together, where the tail concentrates, and which shared premise carries it.'),
        h('p', { class: 'muted small' },
          `${report.counts.currencies} currency book(s) · ${report.counts.members} member call(s) · ${report.counts.readings} frozen reading(s) · ${report.counts.due} due · local only · decision analysis, not a market price`)),
      h('div', { class: 'page-head-actions' },
        h('button', {
          class: 'btn', type: 'button',
          onClick: () => {
            const text = portfolioDeferralBrief(report, now);
            const saved = downloadText({
              filename: `deferral-portfolio-${report.today}.txt`,
              text,
              mime: 'text/plain',
            });
            if (!saved) {
              openModal({
                title: 'Copy the portfolio brief',
                description: 'This browser blocked the download. Select and copy the text below instead.',
                body: h('textarea', { rows: '18', readOnly: true, value: text, 'aria-label': 'Portfolio brief text' }),
              });
            }
          },
        }, 'Save book brief'))),
    report.portfolios.length
      ? h('div', { class: 'stack' }, ...report.portfolios.map((p) => portfolioCard(ctx, report, p)))
      : emptyState({
        title: 'No currency holds two or more priced open calls',
        body: 'A book needs at least two calls the per-call terminal can price, in one currency. Link value to open decisions first — an option premium without a stake would be an invented number, and a one-call book has no joint distribution to read.',
        action: h('a', { class: 'btn btn-primary', href: '#/deferral?panel=overview' }, 'Open the per-call terminal'),
      }),
    readingsPanel(ctx, report),
    methodCard(report));
}
