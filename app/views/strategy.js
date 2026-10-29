/**
 * app/views/strategy.js — the Strategy Coherence Terminal (`#/strategy`, Schema v42).
 *
 * Four tabs in the order a leader has to argue with them:
 *
 *   Bets           → what the team said it is doing, with the declared share and
 *                    the stop rule that makes each bet falsifiable
 *   Coherence      → the say–do gap: declared share vs. the share of open work
 *                    each bet is actually funding, plus the vintage that keeps
 *                    the comparison honest
 *   Falsifiability → the six checks, per bet, with the missing ones named
 *   Verdicts       → stop rules that came due, the judgement, and the record of
 *                    what was decided
 *
 * Nothing here scores a person, and no number is inferred from a title. The
 * measured share comes from tags the leader wrote; the declared share comes from
 * the bet. The distance between them is the product.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { progressBar } from '../ui/charts.js';
import {
  BET_STATUS_LABELS,
  SCO_CHECKS,
  SCO_COMPONENT_WEIGHTS,
  STRATEGY_KINDS,
  ADVANTAGE_TYPES,
  buildStrategyReport,
  strategyBrief,
  strategySignals,
  WORK_SOURCES,
} from '../core/domain/strategy.js';
import {
  openStrategyBetDialog,
  openStrategyAdoptDialog,
  openStrategyRetireDialog,
  openStrategyTagDialog,
  openStrategyVerdictDialog,
  openStrategyConventionsDialog,
} from '../ui/strategy-modals.js';

const TABS = [
  { key: 'bets', label: 'Bets' },
  { key: 'coherence', label: 'Coherence' },
  { key: 'falsifiability', label: 'Falsifiability' },
  { key: 'verdicts', label: 'Verdicts' },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

function kindLabel(key) {
  return STRATEGY_KINDS.find((kind) => kind.key === key)?.label || 'Bet';
}

function advantageLabel(key) {
  return ADVANTAGE_TYPES.find((type) => type.key === key)?.label || 'Not yet stated';
}

function pct(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function pp(value) {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value}pp`;
}

function propagationToast(message, res) {
  const n = Array.isArray(res?.propagations) ? res.propagations.length : 0;
  toast(n ? `${message} ${n} follow-up${n === 1 ? '' : 's'} propagated automatically (see Signals).` : message, 'good');
}

function gradeBadge(grade) {
  return badge(grade.label, grade.tone, `${grade.passed} of ${grade.total} checks pass`);
}

function statusBadge(status) {
  if (status === 'active') return badge('Active', 'good');
  if (status === 'retired') return badge('Retired', 'neutral');
  return badge('Draft', 'info');
}

function ownerName(ctx, ownerId) {
  const person = (ctx.state.people || []).find((p) => p && p.id === ownerId);
  return person ? person.name : 'Unassigned';
}

/**
 * Declared vs funded, drawn as two bars on one scale so a 60/40 declaration
 * against a 40/60 funding sits visibly askew. Pure divs: no canvas, and the
 * numbers are also in the table below for screen readers.
 */
function sharePair(declaredPct, measuredPct) {
  const gap = Math.abs((declaredPct || 0) - (measuredPct || 0));
  const bar = (label, value, tone) => h('div', { class: 'view-stack', style: 'gap:2px' },
    h('div', { class: 'row-between small' },
      h('span', { class: 'muted' }, label),
      h('span', null, pct(value))),
    progressBar(value || 0, { label: `${label} share of effort`, tone, thin: true }));
  return h('div', { class: 'view-stack', style: 'gap:6px;min-width:220px' },
    bar('Declared', declaredPct, 'neutral'),
    bar('Funded', measuredPct, gap >= 10 ? 'warn' : 'good'));
}

/* ------------------------------------------------------------------ bets */

function betCard(ctx, report, bet, selected = false) {
  const actions = [];
  if (bet.status !== 'retired') {
    actions.push(h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyTagDialog(ctx, { betId: bet.id }) }, 'Link work'));
    actions.push(h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyBetDialog(ctx, { bet }) }, 'Edit'));
  }
  if (bet.status === 'draft') {
    actions.push(h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStrategyAdoptDialog(ctx, { bet }) }, 'Adopt'));
  }
  if (bet.status === 'active' && bet.verdictDue) {
    actions.push(h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStrategyVerdictDialog(ctx, { bet }) }, 'Judge the stop rule'));
  }
  if (bet.status !== 'retired') {
    actions.push(h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyRetireDialog(ctx, { bet }) }, 'Retire'));
  }

  const tags = (ctx.state.strategyTags || []).filter((tag) => tag && tag.betId === bet.id);
  const body = h('div', { class: 'view-stack' },
    h('div', { class: 'badge-row' },
      badge(kindLabel(bet.kind), 'info'),
      badge(advantageLabel(bet.advantage), bet.advantage === 'unclear' ? 'warn' : 'neutral'),
      statusBadge(bet.status),
      gradeBadge(bet.grade),
      bet.verdictDue ? badge('Verdict due', 'bad') : null,
      bet.adoptedOn ? badge(`Adopted ${bet.adoptedOn}`, 'neutral') : null),
    bet.status === 'active' ? sharePair(bet.measured.declaredSharePct, bet.measured.measuredSharePct) : null,
    h('div', { class: 'grid-2' },
      kv('Owner', ownerName(ctx, bet.ownerId)),
      kv('Declared share', `${bet.weightPct}%`),
      kv('Funded records', `${bet.measured.openRecords}${bet.measured.effortWeeks === null ? '' : ` · ${bet.measured.effortWeeks} effort-weeks`}`),
      kv('Recent flow (window)', pct(bet.measured.recentSharePct)),
      kv('Stop rule', bet.kill?.metric
        ? `${bet.kill.metric} ${bet.kill.direction === 'above' ? '↑' : '↓'} ${bet.kill.threshold ?? '—'} by ${bet.kill.checkOn || 'no date'}`
        : 'None recorded'),
      kv('Distinct records tagged', String(tags.length)),
    ),
    bet.diagnosis ? h('p', { class: 'small' }, h('strong', null, 'Diagnosis: '), bet.diagnosis) : h('p', { class: 'small text-warn' }, 'No diagnosis recorded — the bet is graded as partially falsifiable until the obstacle is written down.'),
    bet.guidingPolicy ? h('p', { class: 'small' }, h('strong', null, 'Guiding policy: '), bet.guidingPolicy) : h('p', { class: 'small text-warn' }, 'No guiding policy recorded.'),
    bet.notDoing.length
      ? h('div', { class: 'view-stack', style: 'gap:2px' },
          h('p', { class: 'small' }, h('strong', null, 'Refusals (the negative space):')),
          ...bet.notDoing.map((line) => h('p', { class: 'small muted' }, `• ${line}`)))
      : h('p', { class: 'small text-warn' }, 'No refusal declared. A strategy that rules nothing out cannot allocate anything.'),
    bet.verdict ? h('p', { class: 'small' }, h('strong', null, `Verdict ${bet.verdict.recordedOn}: `), `${bet.verdict.verdict} — ${bet.verdict.note}`) : null,
    bet.retiredReason ? h('p', { class: 'small' }, h('strong', null, `Retired ${bet.retiredOn}: `), bet.retiredReason) : null,
    h('div', { class: 'row-actions' }, ...actions));
  return h('article', {
    class: selected ? 'lineage-selected' : '',
    'data-strategy-bet-id': bet.id,
  }, card({ title: bet.title, subtitle: bet.notes || null, body }));
}

function betsTab(ctx, report, selectedBetId = null) {
  const selectedBet = (ctx.state.strategyBets || []).find((bet) => bet.id === selectedBetId) || null;
  const active = report.bets;
  const drafts = (ctx.state.strategyBets || []).filter((bet) => bet.status === 'draft');
  const retired = (ctx.state.strategyBets || []).filter((bet) => bet.status === 'retired');

  const body = [];
  if (!report.hasBets) {
    body.push(emptyState({
      icon: '⌖',
      title: 'No strategy declared yet',
      body: 'Write down what the team is actually trying to win — one obstacle, one approach, one explicit refusal and one dated stop rule. The terminal then measures whether the work you already keep in LeadOS is funding it.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStrategyBetDialog(ctx) }, 'Declare the first bet'),
    }));
  }
  if (active.length) {
    body.push(h('div', { class: 'view-stack' }, ...active.map((bet) => betCard(ctx, report, bet, bet.id === selectedBetId))));
  }
  if (drafts.length) {
    body.push(card({
      title: `Drafts (${drafts.length})`,
      subtitle: 'A draft is not measured: nothing is compared with its declared share until it is adopted.',
      body: h('div', { class: 'view-stack' }, ...drafts.map((bet) => betCard(ctx, report, { ...bet, grade: { label: 'Draft', tone: 'neutral', passed: 0, total: 6, checks: [], missing: [] }, measured: { openRecords: 0, effortWeeks: null, declaredSharePct: null, measuredSharePct: 0, recentSharePct: 0, gapPct: null, recentGapPct: null }, verdictDue: false, kill: bet.killCriterion }, bet.id === selectedBetId))),
    }));
  }
  if (retired.length) {
    body.push(card({
      title: `Retired (${retired.length})`,
      subtitle: 'Kept in the ledger with the declared share and the reason, because a strategy’s history is how the next one is judged.',
      body: table({
        caption: 'Retired strategic bets',
        columns: [
          { label: 'Bet', render: (row) => row.title },
          { label: 'Declared', render: (row) => `${row.weightPct}%` },
          { label: 'Adopted', render: (row) => row.adoptedOn || '—' },
          { label: 'Retired', render: (row) => row.retiredOn || '—' },
          { label: 'Reason', render: (row) => row.retiredReason || '—' },
        ],
        rows: retired.map((bet) => ({
          ...bet,
          className: bet.id === selectedBetId ? 'lineage-selected' : '',
          attrs: { 'data-strategy-bet-id': bet.id },
        })),
        emptyMessage: 'No bet has been retired.',
      }),
    }));
  }
  return h('div', { class: 'view-stack' },
    selectedBet ? banner({
      tone: 'info',
      title: `Opened linked strategy bet: ${selectedBet.title}`,
      body: `This ${selectedBet.status} bet is highlighted. Its declaration and stop rule are unchanged.`,
    }) : null,
    ...body);
}

/* ------------------------------------------------------------- coherence */

function coherenceTab(ctx, report) {
  const p = report.portfolio;
  const findings = strategySignals(ctx.state, ctx.now);

  const stats = h('div', { class: 'stat-row' },
    stat({
      label: 'Say–do gap',
      value: p.sayDoGapPct === null ? '—' : `${p.sayDoGapPct}pp`,
      hint: `Total variation distance · convention ${report.settings.gapThresholdPct}pp`,
      tone: p.gapBreached ? 'bad' : p.sayDoGapPct === null ? '' : 'good',
    }),
    stat({
      label: 'Work under a bet',
      value: p.blind.blindPct === null ? '—' : `${100 - p.blind.blindPct}%`,
      hint: `${p.blind.postStrategy - p.blind.blindCount} of ${p.blind.postStrategy} open post-strategy records`,
      tone: p.blind.breached ? 'warn' : 'good',
    }),
    stat({
      label: 'Measured concentration',
      value: p.hhi.measured === null ? '—' : String(p.hhi.measured),
      hint: `HHI · ${p.hhi.measuredBand.label} (convention)`,
    }),
    stat({
      label: 'Coherence',
      value: report.coherence.pct === null ? '—' : `${report.coherence.pct}%`,
      hint: `${report.coherence.band.label} · ${report.confidence.label}`,
      tone: report.coherence.band.tone,
    }));

  const rows = report.bets.map((bet) => ({
    bet: h('span', null, h('a', { href: `#/strategy` }, bet.title), ' ', gradeBadge(bet.grade)),
    declared: pct(bet.measured.declaredSharePct),
    measured: pct(bet.measured.measuredSharePct),
    gap: h('span', { class: Math.abs(bet.measured.gapPct || 0) >= 10 ? 'text-warn' : '' }, pp(bet.measured.gapPct)),
    recent: h('span', null, pct(bet.measured.recentSharePct), ' ', h('span', { class: 'muted small' }, `(${pp(bet.measured.recentGapPct)} vs declared)`)),
    effort: bet.measured.effortWeeks === null ? h('span', { class: 'muted small' }, 'not estimated') : `${bet.measured.effortWeeks} weeks`,
  }));

  const components = report.coherence.components.length
    ? h('div', { class: 'view-stack' },
        ...report.coherence.components.map((component) => h('div', { class: 'view-stack', style: 'gap:2px' },
          h('div', { class: 'row-between small' },
            h('span', null, component.label),
            h('span', null, `${component.pct}%`)),
          progressBar(component.pct, { label: component.label, thin: true }),
          h('p', { class: 'small muted' }, component.detail))))
    : h('p', { class: 'small muted' }, 'Nothing measurable yet: the composite needs at least one active bet and open work to compare.');

  const blindPanel = h('div', { class: 'view-stack' },
    h('p', { class: 'small' },
      h('strong', null, 'Vintage boundary: '),
      p.blind.vintageStart
        ? `open work created on or after ${p.blind.vintageStart} is measured.`
        : 'no bet has been adopted, so there is no strategy era yet.'),
    h('div', { class: 'grid-2' },
      kv('Open work measured', String(p.blind.postStrategy)),
      kv('Tagged to an active bet', String(p.blind.tagged)),
      kv('Strategy-blind', `${p.blind.blindCount} (${pct(p.blind.blindPct)})`),
      kv('Pre-strategy excluded', String(p.blind.preStrategy)),
      kv('Unknown vintage excluded', String(p.blind.unknownVintage)),
      kv('Closed-record tags ignored', String(p.closedTagged))),
    h('p', { class: 'small muted' },
      'Work that predates the first adopted bet is excluded rather than counted as blind: relabelling history would make the gap vanish without changing what the team does. Records the terminal itself opened are also excluded — otherwise opening a rebalancing decision would worsen the gap it exists to close.'));

  return h('div', { class: 'view-stack' },
    stats,
    findings.length
      ? h('div', { class: 'view-stack' }, ...findings.map((signal) => banner({
          tone: signal.severity >= 4 ? 'bad' : 'warn',
          title: signal.title,
          body: signal.detail,
          actions: signal.action ? [h('a', { class: 'btn btn-ghost', href: signal.action.route }, signal.action.label)] : [],
        })))
      : banner({
          tone: 'good',
          title: 'No coherence finding crosses its convention',
          body: 'That is the absence of a measured breach, not proof the strategy is right. The components below still show where the evidence is thin.',
        }),
    card({
      title: 'Declared versus funded, per bet',
      subtitle: `Measured on a ${p.basis === 'effort' ? 'effort-week' : 'record-count'} basis across ${p.fundingTags} funding tag(s)${p.effortCoveragePct === null ? '' : `; ${p.effortCoveragePct}% carry an effort estimate`}. Divergence is not automatically wrong — it is unnamed that costs money.`,
      actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyTagDialog(ctx) }, 'Link work')],
      body: rows.length
        ? table({
            caption: 'Declared share against measured share for each active bet',
            columns: [
              { label: 'Bet', render: (row) => row.bet },
              { label: 'Declared', render: (row) => row.declared },
              { label: 'Funded', render: (row) => row.measured },
              { label: 'Gap', render: (row) => row.gap },
              { label: 'Recent flow', render: (row) => row.recent },
              { label: 'Effort recorded', render: (row) => row.effort },
            ],
            rows,
            emptyMessage: 'No active bet to compare yet.',
          })
        : emptyState({ icon: '⇄', title: 'Nothing to compare yet', body: 'Adopt a bet and tag the open work it funds.' }),
    }),
    card({ title: 'Strategy-blind work', subtitle: 'Open records inside the strategy era that are not tagged to any active bet.', body: blindPanel }),
    card({
      title: `Composite (${report.coherence.pct === null ? 'not measurable' : `${report.coherence.pct}%`})`,
      subtitle: `Weights ${Object.entries(SCO_COMPONENT_WEIGHTS).map(([key, weight]) => `${key} ${Math.round(weight * 100)}%`).join(' · ')}${report.coherence.weightsRenormalised ? ' — renormalised because a component is unmeasurable' : ''}. A component that cannot be measured is excluded, never scored as zero.`,
      body: h('div', { class: 'view-stack' },
        components,
        report.coherence.missing.length ? h('div', { class: 'callout callout-subtle' },
          ...report.coherence.missing.map((line) => h('p', { class: 'small muted' }, line))) : null,
        h('div', { class: 'badge-row' },
          badge(`Confidence: ${report.confidence.label}`, report.confidence.level === 'measured' ? 'good' : report.confidence.level === 'directional' ? 'warn' : 'neutral'),
          ...report.confidence.reasons.map((reason) => badge(reason, 'neutral'))),
        h('p', { class: 'small muted' },
          'The composite exists to be argued with. It is a convention over four measured things — declared-versus-funded distance, falsifiability, work coverage and (reported separately) concentration — not a verdict on the leader.')),
    }),
  );
}

/* ---------------------------------------------------------- falsifiability */

function falsifiabilityTab(ctx, report) {
  if (!report.bets.length) {
    return emptyState({
      icon: '⌖',
      title: 'No active bet to grade',
      body: 'Falsifiability is graded per active bet against six checks: an owner, a diagnosis, a guiding policy, an explicit refusal, a dated stop rule, and at least one open record actually funded by it.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStrategyBetDialog(ctx) }, 'Declare a bet'),
    });
  }
  const rows = report.bets.map((bet) => {
    const cell = (key) => {
      const check = bet.grade.checks.find((c) => c.key === key);
      return h('span', { class: check && check.passed ? 'text-good' : 'text-warn', title: check ? check.detail : '' },
        check && check.passed ? '✓' : '✗');
    };
    return {
      bet: h('span', null, bet.title),
      grade: gradeBadge(bet.grade),
      owner: cell('owner'),
      diagnosis: cell('diagnosis'),
      policy: cell('guidingPolicy'),
      refusal: cell('refusal'),
      stop: cell('stopRule'),
      action: cell('committedAction'),
      missing: bet.grade.missing.length
        ? h('span', { class: 'small' }, bet.grade.missing.join(', '))
        : h('span', { class: 'small muted' }, 'All six checks pass'),
      fix: h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openStrategyBetDialog(ctx, { bet }),
      }, 'Fix'),
    };
  });
  return h('div', { class: 'view-stack' },
    h('div', { class: 'stat-row' },
      stat({ label: 'Falsifiable', value: String(report.falsifiability.falsifiable), hint: 'All six checks pass', tone: 'good' }),
      stat({ label: 'Partial', value: String(report.falsifiability.partial), hint: 'Four or five checks pass', tone: 'warn' }),
      stat({ label: 'Unfalsifiable', value: String(report.falsifiability.unfalsifiable), hint: 'Three or fewer checks pass', tone: 'bad' }),
      stat({ label: 'Mean grade', value: report.falsifiability.pct === null ? '—' : `${report.falsifiability.pct}%`, hint: 'Checks passed, averaged across active bets' })),
    card({
      title: 'The six checks',
      subtitle: 'Chosen because each missing check is a distinct way a bet can survive its own failure. The list is printed, not hidden behind a score.',
      body: h('div', { class: 'view-stack' },
        ...SCO_CHECKS.map((check) => h('div', { class: 'kv' },
          h('span', { class: 'kv-label' }, check.label),
          h('span', { class: 'small muted' }, check.detail)))),
    }),
    card({
      title: 'Per bet',
      body: table({
        caption: 'Falsifiability checks for each active bet',
        columns: [
          { label: 'Bet', render: (row) => row.bet },
          { label: 'Grade', render: (row) => row.grade },
          { label: 'Owner', render: (row) => row.owner },
          { label: 'Diagnosis', render: (row) => row.diagnosis },
          { label: 'Policy', render: (row) => row.policy },
          { label: 'Refusal', render: (row) => row.refusal },
          { label: 'Stop rule', render: (row) => row.stop },
          { label: 'Funded', render: (row) => row.action },
          { label: 'Missing', render: (row) => row.missing },
          { label: 'Fix', render: (row) => row.fix },
        ],
        rows,
        emptyMessage: 'No active bet.',
      }),
    }),
  );
}

/* --------------------------------------------------------------- verdicts */

function verdictsTab(ctx, report) {
  const due = report.verdictsDue;
  const all = ctx.state.strategyBets || [];
  const history = [];
  for (const bet of all) {
    for (const entry of bet.history || []) {
      if (entry.type === 'verdict' || entry.type === 'retired' || entry.type === 'adopted') {
        history.push({ at: entry.at, bet: bet.title, type: entry.type, summary: entry.summary });
      }
    }
  }
  history.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const strategyDecisions = (ctx.state.decisions || [])
    .filter((decision) => String(decision.question || '').includes('[RULE-SCO-'))
    .slice(-6)
    .reverse();

  return h('div', { class: 'view-stack' },
    due.length
      ? card({
          title: `${due.length} stop rule${due.length === 1 ? '' : 's'} came due`,
          subtitle: 'The app never retires a bet by itself. Record what the rule showed, then continue, revise the rule or retire it.',
          body: h('div', { class: 'view-stack' }, ...due.map((bet) => h('div', { class: 'view-stack', style: 'gap:4px' },
            h('div', { class: 'badge-row' },
              badge(bet.kill ? `${bet.kill.daysOverdue} day(s) overdue` : 'Due', 'bad'),
              badge(bet.grade.label, bet.grade.tone)),
            h('p', { class: 'small' },
              h('strong', null, bet.title), ' — ',
              bet.kill?.metric
                ? `${bet.kill.metric} ${bet.kill.direction === 'above' ? 'above' : 'below'} ${bet.kill.threshold ?? 'the recorded threshold'}, judged by ${bet.kill.checkOn}.`
                : 'No stop rule recorded.'),
            h('div', { class: 'row-actions' },
              h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStrategyVerdictDialog(ctx, { bet }) }, 'Record the verdict'),
              h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyBetDialog(ctx, { bet }) }, 'Revise the stop rule'))))),
        })
      : banner({
          tone: 'good',
          title: 'No stop rule is overdue',
          body: 'Every active bet is either inside its judgement window or already judged. Adopt a bet with a dated rule and this tab becomes the place the strategy is allowed to be wrong.',
        }),
    card({
      title: `Decisions the terminal opened (${strategyDecisions.length})`,
      subtitle: 'Commitment, rebalancing and retire-or-renew calls, each marked with the rule that produced it. They are ordinary DACI decisions: priced by Decision Tempo when a value at stake is recorded, reviewable, and yours to overrule.',
      body: strategyDecisions.length
        ? h('div', { class: 'view-stack' }, ...strategyDecisions.map((decision) => h('div', { class: 'view-stack', style: 'gap:2px' },
            h('div', { class: 'badge-row' },
              badge(decision.chosen ? 'Decided' : 'Open', decision.chosen ? 'good' : 'warn'),
              badge(decision.reversibility === 'irreversible' ? 'Irreversible' : 'Reversible', decision.reversibility === 'irreversible' ? 'warn' : 'neutral'),
              badge(decision.date, 'neutral')),
            h('p', { class: 'small' }, h('a', { href: '#/decisions' }, decision.title)))))
        : h('p', { class: 'small muted' }, 'No strategy decision has been opened yet. Running an audit opens one only when a measured finding crosses its convention.'),
    }),
    card({
      title: 'History',
      subtitle: 'Adoptions, judgements and retirements, newest first — the record a successor reads instead of asking what happened.',
      body: history.length
        ? table({
            caption: 'Strategy history',
            columns: [
              { label: 'When', render: (row) => String(row.at).slice(0, 10) },
              { label: 'Bet', render: (row) => row.bet },
              { label: 'What', render: (row) => row.type },
              { label: 'Recorded', render: (row) => row.summary },
            ],
            rows: history.slice(0, 30),
            emptyMessage: 'No activity yet.',
          })
        : emptyState({ icon: '⌗', title: 'Nothing recorded yet', body: 'Adopt a bet and its adoption, judgements and retirement will be kept here.' }),
    }),
  );
}

/* ------------------------------------------------------------------ view */

export function renderStrategy(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'bets';
  const selectedBetId = ctx.query.get('bet');
  const report = buildStrategyReport(ctx.state, ctx.now, ctx.state.settings);
  const signals = strategySignals(ctx.state, ctx.now);

  const totalTagged = (ctx.state.strategyTags || []).length;
  const workSourceLabel = WORK_SOURCES.map((spec) => spec.label.toLowerCase()).join(', ');

  const runAudit = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    onClick: () => {
      const result = ctx.api.runStrategyAudit();
      if (!result || !result.ok) {
        toast(result?.error || 'The audit could not run yet.', 'warn');
        return;
      }
      propagationToast('Audit complete.', result);
      ctx.refresh && ctx.refresh();
    },
  }, 'Run coherence audit');

  const header = pageHeader({
    eyebrow: 'Strategy coherence · Schema v42',
    title: report.hasBets ? 'Is the work funding the strategy you wrote?' : 'What is the team actually trying to win?',
    subtitle: 'The first LeadOS terminal that measures the thing every strategy deck avoids: the distance between the share of effort you declared and the share the records show is actually funded.',
    actions: [
      runAudit,
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyBetDialog(ctx) }, 'Declare a bet'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyTagDialog(ctx) }, 'Link work'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => downloadText('leados-strategy-coherence.txt', strategyBrief(ctx.state, ctx.now)),
      }, 'Download the brief'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openStrategyConventionsDialog(ctx) }, 'Conventions'),
    ],
    meta: h('div', { class: 'badge-row' },
      badge(`${report.bets.length} active bet${report.bets.length === 1 ? '' : 's'}`, report.bets.length ? 'good' : 'neutral'),
      badge(`${totalTagged} work link${totalTagged === 1 ? '' : 's'}`, totalTagged ? 'info' : 'neutral'),
      badge(report.confidence.label, report.confidence.level === 'measured' ? 'good' : 'warn'),
      report.portfolio.gapBreached ? badge(`Say–do gap ${report.portfolio.sayDoGapPct}pp`, 'bad') : null,
      report.verdictsDue.length ? badge(`${report.verdictsDue.length} verdict due`, 'bad') : null),
  });

  const body = tab === 'bets'
    ? betsTab(ctx, report, selectedBetId)
    : tab === 'coherence'
      ? coherenceTab(ctx, report)
      : tab === 'falsifiability'
        ? falsifiabilityTab(ctx, report)
        : verdictsTab(ctx, report);

  return h('div', { class: 'view-stack' },
    header,
    h('div', { class: 'view-stack' },
      tabs({
        items: TABS.map((entry) => ({
          ...entry,
          count: entry.key === 'coherence' && report.portfolio.gapBreached ? 1
            : entry.key === 'falsifiability' ? report.bets.filter((bet) => bet.grade.key !== 'falsifiable').length || undefined
              : entry.key === 'verdicts' ? report.verdictsDue.length || undefined
                : undefined,
        })),
        active: tab,
        onSelect: (key) => ctx.navigate(`#/strategy?tab=${key}`),
      }),
      signals.length && tab !== 'coherence'
        ? h('div', { class: 'view-stack' }, ...signals.slice(0, 3).map((signal) => banner({
            tone: signal.severity >= 4 ? 'bad' : 'warn',
            title: signal.title,
            body: signal.detail,
            actions: signal.action ? [h('a', { class: 'btn btn-ghost', href: signal.action.route }, signal.action.label)] : [],
          })))
        : null,
      h('p', { class: 'small muted' },
        `Measurement sources: ${workSourceLabel}. Percentages are shares of open records — or of effort-weeks where at least half the links carry an estimate. A missing estimate is counted as one record and reported as missing, never as zero effort.`),
      body),
  );
}
