/**
 * app/ui/deferral-portfolio-modals.js — the dialogs for the Deferral
 * Portfolio panel (Schema v69).
 *
 * Two dialogs, both of which exist because the underlying record cannot
 * supply their inputs on its own:
 *
 *  - the correlation declaration: the graph identifies WHICH two calls share
 *    a premise; only the leader can say how strongly their values move
 *    together. A declaration is stored verbatim, labelled as declared, and
 *    never clamped;
 *  - the portfolio freeze: one currency's book, one window, one probability
 *    (that at least one member call commits before the window closes), with
 *    the full tail preview from the same engine before anything is written.
 */

import { h, toast, openModal } from './dom.js';
import { dayKey } from '../core/time.js';

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function decisionTitle(ctx, id) {
  const decision = (ctx.state.decisions || []).find((d) => d && d.id === id);
  return decision ? (decision.title || decision.question || 'Untitled decision') : id;
}

/**
 * Declare the ρ for one premise-sharing pair. The dialog names the premises
 * the pair shares — the reason the graph proposed the pair at all — and a ρ
 * outside [−0.99, 0.99] is refused by the action layer, never clamped.
 */
export function openDeclareCorrelationDialog(ctx, pair, onSaved) {
  if (!pair || !pair.aId || !pair.bId) {
    toast('Choose a premise-sharing pair first.', 'bad');
    return null;
  }
  const existing = (ctx.state.correlationDeclarations || []).find((row) => row
    && ((row.aId === pair.aId && row.bId === pair.bId) || (row.aId === pair.bId && row.bId === pair.aId)));
  const input = h('input', {
    type: 'number',
    min: '-0.99',
    max: '0.99',
    step: '0.05',
    value: existing ? String(existing.rho) : '0.5',
    id: 'dpo-modal-rho',
  });
  const dialog = openModal({
    title: existing ? 'Re-declare a correlation' : 'Declare a correlation',
    description: 'The graph can see that these two calls are coupled; only you can say how strongly their values move together.',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'small' },
        h('strong', null, `${decisionTitle(ctx, pair.aId)} ↔ ${decisionTitle(ctx, pair.bId)}`),
        ` — sharing ${pair.premiseIds.length} recorded premise(s).`),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'dpo-modal-rho' }, 'Correlation ρ (−0.99 … 0.99)'),
        input,
        h('span', { class: 'muted small' }, '−1 means the calls always move opposite; +1 means they always move together; 0 means no linear co-movement. Mutually inconsistent sets (e.g. 0.9, 0.9, −0.9) are refused at pricing, not silently projected onto a valid matrix.')),
      h('p', { class: 'muted small' }, 'Why this is manual: co-movement in a leadership record cannot identify correlation. A default would be an invented fact, so the joint tail waits for this number.')),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const rho = Number(input.value);
          const result = ctx.api.declareCorrelation(pair.aId, pair.bId, rho);
          if (result && result.ok) {
            dialog.close();
            toast(result.warning ? `Declared in memory but NOT SAVED: ${result.warning}`
              : `Declared ρ ${result.rho} for the pair.`, result.warning ? 'bad' : 'good');
            if (typeof onSaved === 'function') onSaved();
          } else {
            toast((result && result.error) || 'The declaration was refused.', 'bad');
          }
        },
      }, existing ? 'Re-declare' : 'Declare'),
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        onClick: () => dialog.close(),
      }, 'Cancel'),
    ],
  });
  return dialog;
}

/**
 * Freeze one currency's book reading. The preview is the same engine the
 * panel renders, so a leader never freezes a book whose tail they have not
 * seen. One probability is frozen — that at least one member commits before
 * the window closes — and it is graded once, later, against the recorded
 * decision dates.
 */
export function openFreezePortfolioDialog(ctx, portfolio, onSaved) {
  if (!portfolio || !portfolio.simulation) {
    toast((portfolio && portfolio.refusal) || 'This book has no priced joint tail to freeze.', 'bad');
    return null;
  }
  const sim = portfolio.simulation;
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const dialog = openModal({
    title: `Freeze the ${portfolio.currency} book reading`,
    description: `${portfolio.memberCount} member call(s) · window closes ${portfolio.windowClose}. Freezing writes one bounded, identity-free snapshot (no titles, no notes) plus exactly one probability, graded once after the window closes. Nothing is chosen for you.`,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-row' },
        h('div', { class: 'stack-xs' },
          h('span', { class: 'muted small' }, 'Σ premium (exact, per-call lattices)'),
          h('strong', null, money(portfolio.sumPremium, portfolio.currency))),
        h('div', { class: 'stack-xs' },
          h('span', { class: 'muted small' }, `${(sim.tailLevel * 100).toFixed(0)}% CVaR of the total`),
          h('strong', null, money(sim.cvar, portfolio.currency))),
        h('div', { class: 'stack-xs' },
          h('span', { class: 'muted small' }, 'Diversification credit'),
          h('strong', null, money(sim.diversificationCredit, portfolio.currency))),
        h('div', { class: 'stack-xs' },
          h('span', { class: 'muted small' }, 'P(all lapse together)'),
          h('strong', null, `${sim.pAllLapsePct}%`))),
      h('p', { class: 'muted small' },
        `Frozen probability: P(at least one member commits by ${portfolio.windowClose}) = ${sim.pAnyCommitPct}%, from ${sim.paths} seeded paths on the ${sim.stepDays < 1.05 ? 'daily' : `${sim.stepDays.toFixed(1)}-day`} grid (seed ${sim.seed}). The expected total stays the lattice sum — correlation changes how the book fails together, not what it is worth in expectation.`),
      h('p', { class: 'muted small' }, `Today is ${dayKey(now)}; a reading frozen after the window closes would not be a prediction, and the freeze is refused then.`)),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeDeferralPortfolio(portfolio.currency);
          if (result && result.ok) {
            dialog.close();
            toast(result.warning ? `Frozen in memory but NOT SAVED: ${result.warning}`
              : `Frozen one ${portfolio.currency} book reading for review ${portfolio.windowClose}.`,
            result.warning ? 'bad' : 'good');
            if (typeof onSaved === 'function') onSaved();
          } else {
            toast((result && result.error) || 'The freeze was refused.', 'bad');
          }
        },
      }, 'Freeze the reading'),
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        onClick: () => dialog.close(),
      }, 'Cancel'),
    ],
  });
  return dialog;
}
