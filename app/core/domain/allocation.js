/**
 * app/core/domain/allocation.js — the Allocation Governor (RULE-ALLOC-01..04).
 *
 * Session 51, Schema v33. LeadOS already prices decisions, delays, forecasts
 * and coalitions. It never answered the most consequential recurring question
 * a leader faces: *where should the next person-day go?* This module turns
 * the operating-plan portfolio (`state.portfolio`) into a learning allocation
 * system instead of a static ranked list.
 *
 * Named techniques (Section 0.2 of the product doctrine):
 *  - March (1991), "Exploration and Exploitation in Organizational Learning":
 *    exploitation of what already works reliably drives out exploration until
 *    the environment moves — the "success trap". The Governor measures the
 *    trap directly, as the exploratory share of *recently funded* effort.
 *  - Nagji & Tuff (2012) Ambition Matrix / McKinsey Three Horizons: every
 *    funded item is Core, Adjacent or Exploratory (`item.horizon`), and the
 *    leader sets an exploration floor (default ~10%) the way an investment
 *    policy statement sets an allocation band. Breach opens a rebalancing
 *    decision; it never silently rebalances for them.
 *  - Auer, Cesa-Bianchi & Fischer (2002) UCB1: each (horizon × currency)
 *    "arm" earns an upper-confidence index = mean settled value per
 *    person-day + scale·√(2·ln T / n), where the scale is the pooled robust
 *    dispersion (1.4826·MAD) of that currency's settled rewards. The bonus is
 *    the explicit price of ignorance: an arm nobody has tried keeps a wide
 *    bonus until evidence replaces it. This is why the terminal can say "the
 *    next day belongs to an exploratory bet" without pretending to know the
 *    bet will pay.
 *
 * Honesty boundaries, enforced in code rather than prose:
 *  - Rewards come only from *recorded delivery actuals* (`actualValue` /
 *    `actualEffortDays`, Schema v21). A settled item without actuals is an
 *    open evidence debt (RULE-ALLOC-03), never a zero reward.
 *  - Currencies are never mixed: arms, means, bonuses and regret are computed
 *    per currency; there is no FX assumption anywhere in this file.
 *  - Below n=5 settled observations an arm is counts-only — no mean is dressed
 *    up as knowledge, matching the conformal/forecast guardrail convention.
 *  - A horizon is never inferred from an item's kind or title. Unclassified
 *    funded work is shown as unmeasured allocation, and RULE-ALLOC-04 asks
 *    the owner to classify it.
 *  - Gittins indices (1979) are the theoretically optimal policy for this
 *    problem class and are deliberately NOT used: they require known reward
 *    families and a discount rate the workspace cannot supply. UCB1 is the
 *    explainable approximation a first-time leader can audit by hand.
 *
 * Pure module: no DOM, storage, network or global clock. Rules receive the
 * same context shape as every other post-commit rule (ADR-0008) and plug into
 * the shared spine; RULE-ALLOC-01's DACI decision is created upstream of the
 * decision-tempo rule so it receives a timing position in the same
 * transaction.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { PORTFOLIO_HORIZONS, PORTFOLIO_HORIZON_LABELS, pertTriple } from './capacity.js';

export const ALLOC_ENGINE_VERSION = 'allocation-2026.10-v1';

/** Settled observations an arm needs before its mean/UCB is shown as learned. */
export const ALLOC_MIN_ARM_N = 5;
/** Funding decisions inside the window before a "pattern" can starve. */
export const ALLOC_MIN_FUNDING_DECISIONS = 3;
/** Days an open rebalancing decision may wait before it escalates in Signals. */
export const ALLOC_REBALANCE_STALE_DAYS = 14;
/** Unclassified share of the funded mix that counts as "unmeasurable". */
export const ALLOC_UNCLASSIFIED_WARN_PCT = 30;

export const ALLOC_RULE_IDS = Object.freeze({
  FLOOR: 'RULE-ALLOC-01',
  BET: 'RULE-ALLOC-02',
  EVIDENCE: 'RULE-ALLOC-03',
  CLASSIFY: 'RULE-ALLOC-04',
});

export const ALLOC_RULES = Object.freeze([
  {
    id: ALLOC_RULE_IDS.FLOOR,
    name: 'Exploration-floor breach → one DACI rebalancing decision',
    framework: 'March (1991) exploration/exploitation & Nagji & Tuff (2012) ambition matrix; investment-policy rebalancing bands',
    trigger: 'portfolio.created / portfolio.updated / portfolio.decision / portfolio.completed / portfolio.actuals / allocation.scan',
    targetModule: 'decisions',
    description: 'When the exploratory share of classified effort funded inside the policy window falls below the leader\'s floor (and at least three funding decisions make it a pattern, not an accident), opens exactly one idempotent DACI decision: fund the best queued exploratory bet, fund a smaller probe with a stop rule, defer exploration deliberately and on the record, or lower the floor as an explicit policy change. The decision flows into Decision Tempo in the same transaction. Nothing is ever auto-funded.',
  },
  {
    id: ALLOC_RULE_IDS.BET,
    name: 'Funded exploratory bet → one learning-checkpoint talking point',
    framework: 'March (1991) exploration as disciplined experimentation; pre-declared stop rules (real-options abandonment)',
    trigger: 'portfolio.decision / portfolio.created / portfolio.updated when an exploratory item is funded',
    targetModule: 'oneonones',
    description: 'Queues one blameless 1:1 talking point for the bet\'s owner asking what would need to be true by the target date to keep funding it, and what result would stop it. A bet without a stop rule is not exploration; it is a slow leak. Idempotent per item.',
  },
  {
    id: ALLOC_RULE_IDS.EVIDENCE,
    name: 'Settled without actuals → one evidence-closure delegation',
    framework: 'Bandit learning requires observed rewards (Auer et al. 2002); unobserved ≠ zero',
    trigger: 'portfolio.completed / portfolio.updated when an item is delivered without recorded actuals',
    targetModule: 'delegations',
    description: 'Opens exactly one owned delegation asking the item\'s owner to record delivered value and actual effort, so the portfolio learns what this kind of work returns. Until then the settled bet is excluded from every arm statistic and counted as an evidence debt — it is never scored as a zero.',
  },
  {
    id: ALLOC_RULE_IDS.CLASSIFY,
    name: 'Funded but unclassified → one classification talking point',
    framework: 'Nagji & Tuff (2012) ambition horizons; measurement precedes management',
    trigger: 'portfolio.decision / portfolio.created / portfolio.updated when funded work has no horizon',
    targetModule: 'oneonones',
    description: 'Queues one 1:1 talking point asking the owner to classify funded work as Core, Adjacent or Exploratory. The Governor never guesses a horizon from the item kind: unclassified funded effort is reported as unmeasured allocation until a human classifies it. Idempotent per item.',
  },
]);

const HORIZON_ORDER = Object.freeze([...PORTFOLIO_HORIZONS]);

/* ------------------------------------------------------------ helpers */

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clampText(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Robust dispersion: 1.4826·MAD, falling back to mean absolute deviation. */
function robustScale(values) {
  if (values.length < 2) return 0;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const scaled = 1.4826 * (mad || 0);
  if (scaled > 0) return scaled;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + Math.abs(v - mean), 0) / values.length;
}

function expectedEffortDays(item) {
  const triple = pertTriple(item?.effortDays || {});
  return triple.measured ? triple.expected : 0;
}

function valueDensity(item) {
  const effort = pertTriple(item?.effortDays || {});
  const value = pertTriple(item?.value || {});
  if (!effort.measured || effort.expected <= 0 || !value.measured) return null;
  return round2(value.expected / effort.expected);
}

function isValidHorizon(value) {
  return HORIZON_ORDER.includes(value);
}

/** A settled observation: delivered work whose reward was actually recorded. */
function settledReward(item) {
  if (!item || item.status !== 'done' || !isValidHorizon(item.horizon)) return null;
  const days = Number(item.actualEffortDays);
  const value = Number(item.actualValue);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(value)) return null;
  return { reward: value / days, days, value };
}

/* ------------------------------------------------------------ report */

/**
 * The full allocation picture, derived live from records. Nothing here is
 * persisted: settled evidence, funding behaviour and the current mix are
 * recomputed from the portfolio every time, so the terminal can never drift
 * from the underlying facts.
 */
export function buildAllocationReport(state = {}, now = new Date()) {
  const today = dayKey(now);
  const settings = state.settings || {};
  const floorPct = Number.isFinite(Number(settings.allocationExplorationFloorPct))
    ? Math.min(50, Math.max(0, Number(settings.allocationExplorationFloorPct)))
    : 10;
  const windowDays = Number.isFinite(Number(settings.allocationWindowDays))
    ? Math.min(730, Math.max(30, Number(settings.allocationWindowDays)))
    : 180;
  const windowStart = addDays(today, -windowDays);
  const items = (Array.isArray(state.portfolio) ? state.portfolio : []).filter(Boolean);

  /* ----- settled evidence → arms, per currency ----- */
  const observationsByCurrency = new Map(); // currency -> [{item, reward, days}]
  const missingEvidence = [];
  let settledUnclassified = 0;
  for (const item of items) {
    if (item.status !== 'done') continue;
    if (!isValidHorizon(item.horizon)) { settledUnclassified += 1; continue; }
    const settled = settledReward(item);
    if (!settled) { missingEvidence.push(item); continue; }
    const currency = item.currency || 'USD';
    if (!observationsByCurrency.has(currency)) observationsByCurrency.set(currency, []);
    observationsByCurrency.get(currency).push({ item, ...settled });
  }

  /* ----- current funded mix (expected days; days are currency-free) ----- */
  const mixDays = { core: 0, adjacent: 0, exploratory: 0, unclassified: 0 };
  const mixItems = { core: 0, adjacent: 0, exploratory: 0, unclassified: 0 };
  const currenciesWithOpenFunding = new Set();
  for (const item of items) {
    const committed = item.status === 'open' && (item.decision === 'funded' || item.kind === 'capacity-reserve');
    if (!committed) continue;
    const days = expectedEffortDays(item);
    const bucket = isValidHorizon(item.horizon) ? item.horizon : 'unclassified';
    mixDays[bucket] += days;
    mixItems[bucket] += 1;
    currenciesWithOpenFunding.add(item.currency || 'USD');
  }
  const mixTotalDays = round2(Object.values(mixDays).reduce((s, v) => s + v, 0));
  const currentMix = [...HORIZON_ORDER, 'unclassified'].map((horizon) => ({
    horizon,
    label: horizon === 'unclassified' ? 'Unclassified — not measured' : PORTFOLIO_HORIZON_LABELS[horizon],
    expectedDays: round2(mixDays[horizon]),
    items: mixItems[horizon],
    sharePct: mixTotalDays > 0 ? round2((mixDays[horizon] / mixTotalDays) * 100) : null,
  }));

  /* ----- arms ----- */
  const currencies = [...new Set([...observationsByCurrency.keys(), ...currenciesWithOpenFunding])].sort();
  const armsByCurrency = currencies.map((currency) => {
    const observations = observationsByCurrency.get(currency) || [];
    const total = observations.length;
    const scale = robustScale(observations.map((o) => o.reward));
    const arms = HORIZON_ORDER.map((horizon) => {
      const mine = observations.filter((o) => o.item.horizon === horizon);
      const rewards = mine.map((o) => o.reward);
      const n = rewards.length;
      const mean = n ? rewards.reduce((s, v) => s + v, 0) / n : null;
      const learned = n >= ALLOC_MIN_ARM_N;
      const bonus = learned && total > 1 ? scale * Math.sqrt((2 * Math.log(total)) / n) : 0;
      return {
        horizon,
        label: PORTFOLIO_HORIZON_LABELS[horizon],
        n,
        settledEffortDays: round2(mine.reduce((s, o) => s + o.days, 0)),
        meanReward: learned ? round2(mean) : null,
        medianReward: learned ? round2(median(rewards)) : null,
        explorationBonus: learned ? round2(bonus) : null,
        ucb: learned ? round2(mean + bonus) : null,
        verdict: n === 0 ? 'empty' : learned ? 'learned' : 'counts-only',
      };
    });
    const learnedArms = arms.filter((a) => a.verdict === 'learned');
    const leader = learnedArms.length
      ? [...learnedArms].sort((a, b) => b.ucb - a.ucb)[0]
      : null;
    let hindsightRegret = null;
    if (learnedArms.length >= 2) {
      const bestMean = Math.max(...learnedArms.map((a) => a.meanReward));
      hindsightRegret = round2(
        learnedArms.reduce((s, a) => s + a.settledEffortDays * (bestMean - a.meanReward), 0),
      );
    }
    return {
      currency,
      totalObservations: total,
      robustScale: round2(scale),
      arms,
      leader: leader ? { horizon: leader.horizon, ucb: leader.ucb, meanReward: leader.meanReward, singleArm: learnedArms.length === 1 } : null,
      hindsightRegret,
    };
  });

  /* ----- funded flow inside the policy window (chosen funding only) ----- */
  const flowDays = { core: 0, adjacent: 0, exploratory: 0 };
  let flowDecisions = 0;
  let flowUnclassifiedDays = 0;
  let flowReserveDaysExcluded = 0;
  let flowUndated = 0;
  for (const item of items) {
    if (item.decision !== 'funded') continue;
    if (!item.decisionOn) { flowUndated += 1; continue; }
    if (item.decisionOn < windowStart || item.decisionOn > today) continue;
    const days = expectedEffortDays(item);
    if (item.kind === 'capacity-reserve') { flowReserveDaysExcluded += days; continue; }
    flowDecisions += 1;
    if (isValidHorizon(item.horizon)) flowDays[item.horizon] += days;
    else flowUnclassifiedDays += days;
  }
  const classifiedFlowDays = round2(flowDays.core + flowDays.adjacent + flowDays.exploratory);
  const explorationSharePct = classifiedFlowDays > 0
    ? round2((flowDays.exploratory / classifiedFlowDays) * 100)
    : null;
  const starvation = floorPct > 0
    && flowDecisions >= ALLOC_MIN_FUNDING_DECISIONS
    && classifiedFlowDays > 0
    && explorationSharePct !== null
    && explorationSharePct < floorPct;
  const starvationDebtDays = classifiedFlowDays > 0
    ? round2(Math.max(0, (floorPct / 100) * classifiedFlowDays - flowDays.exploratory))
    : 0;
  const fundedFlow = {
    windowDays,
    windowStart,
    decisions: flowDecisions,
    undatedFunding: flowUndated,
    daysByHorizon: {
      core: round2(flowDays.core),
      adjacent: round2(flowDays.adjacent),
      exploratory: round2(flowDays.exploratory),
    },
    classifiedDays: classifiedFlowDays,
    unclassifiedDays: round2(flowUnclassifiedDays),
    reserveDaysExcluded: round2(flowReserveDaysExcluded),
    explorationSharePct,
    floorPct,
    starvation,
    starvationDebtDays,
  };

  /* ----- exploratory candidates & unclassified work ----- */
  const candidates = items
    .filter((i) => i.status === 'open' && i.horizon === 'exploratory' && (i.decision === 'undecided' || i.decision === 'deferred'))
    .map((i) => ({
      id: i.id,
      title: i.title,
      currency: i.currency || 'USD',
      decision: i.decision,
      ownerId: i.ownerId || null,
      targetOn: i.targetOn || null,
      expectedEffortDays: round2(expectedEffortDays(i)),
      valueDensity: valueDensity(i),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || (b.valueDensity ?? -1) - (a.valueDensity ?? -1));
  const topCandidates = [];
  for (const c of candidates) {
    if (!topCandidates.some((t) => t.currency === c.currency)) topCandidates.push(c);
    if (topCandidates.length >= 3) break;
  }
  const unclassifiedOpen = items
    .filter((i) => i.status === 'open' && !isValidHorizon(i.horizon))
    .map((i) => ({
      id: i.id, title: i.title, decision: i.decision, kind: i.kind,
      ownerId: i.ownerId || null, expectedEffortDays: round2(expectedEffortDays(i)),
    }))
    .sort((a, b) => b.expectedEffortDays - a.expectedEffortDays);

  /* ----- the open rebalancing decision, if one is waiting ----- */
  const marker = `[${ALLOC_RULE_IDS.FLOOR}]`;
  const openRebalance = (Array.isArray(state.decisions) ? state.decisions : [])
    .find((d) => d && !d.chosen && String(d.question || '').includes(marker)) || null;
  const openRebalanceDecision = openRebalance
    ? { id: openRebalance.id, title: openRebalance.title, date: openRebalance.date || null, ageDays: openRebalance.date ? daysBetween(openRebalance.date, today) : null }
    : null;

  const majorityMixHorizon = (() => {
    const classified = currentMix.filter((m) => m.horizon !== 'unclassified' && m.expectedDays > 0);
    if (!classified.length) return null;
    return [...classified].sort((a, b) => b.expectedDays - a.expectedDays)[0].horizon;
  })();

  return {
    engineVersion: ALLOC_ENGINE_VERSION,
    today,
    policy: { floorPct, windowDays, autoPropagate: settings.allocationAutoPropagate !== false, minArmN: ALLOC_MIN_ARM_N },
    armsByCurrency,
    currentMix,
    majorityMixHorizon,
    fundedFlow,
    candidates,
    topCandidates,
    unclassifiedOpen,
    openRebalanceDecision,
    totals: {
      settledObserved: [...observationsByCurrency.values()].reduce((s, v) => s + v.length, 0),
      settledMissingEvidence: missingEvidence.length,
      settledUnclassified,
      unclassifiedOpen: unclassifiedOpen.length,
      attention: (starvation ? 1 : 0) + (openRebalanceDecision ? 1 : 0) + missingEvidence.length,
    },
    missingEvidence: missingEvidence.map((i) => ({
      id: i.id, title: i.title, horizon: i.horizon, completedOn: i.completedOn || null, ownerId: i.ownerId || null,
    })),
    empty: items.length === 0,
  };
}

export function allocationAttentionCount(state = {}, now = new Date()) {
  return buildAllocationReport(state, now).totals.attention;
}

/* ------------------------------------------------------------ brief */

/** Deterministic, board-ready summary. Every number traces to a record. */
export function allocationBrief(state = {}, now = new Date()) {
  const r = buildAllocationReport(state, now);
  const lines = [];
  lines.push(`# Allocation Governor brief — ${r.today}`);
  lines.push('');
  lines.push(`Policy: exploration floor ${r.policy.floorPct}% of classified funded effort over ${r.policy.windowDays} days; auto-propagation ${r.policy.autoPropagate ? 'on' : 'PAUSED'}; an arm needs ${ALLOC_MIN_ARM_N} settled bets before its returns are shown.`);
  lines.push('');
  lines.push('## Current funded mix (expected person-days)');
  for (const m of r.currentMix) {
    lines.push(`- ${m.label}: ${m.expectedDays}d across ${m.items} item(s)${m.sharePct === null ? '' : ` (${m.sharePct}%)`}`);
  }
  lines.push('');
  lines.push(`## Recent funding behaviour (last ${r.fundedFlow.windowDays} days)`);
  const f = r.fundedFlow;
  if (f.explorationSharePct === null) {
    lines.push(`- ${f.decisions} classified funding decision(s) in window — not enough classified funded effort to measure the exploratory share.`);
  } else {
    lines.push(`- ${f.decisions} funding decision(s); exploratory share ${f.explorationSharePct}% vs floor ${f.floorPct}% → ${f.starvation ? `BELOW FLOOR (short by ~${f.starvationDebtDays} exploratory person-days)` : 'at or above floor'}.`);
  }
  if (f.unclassifiedDays > 0) lines.push(`- ${f.unclassifiedDays}d of funded effort in window is unclassified and excluded from the share.`);
  if (f.reserveDaysExcluded > 0) lines.push(`- ${f.reserveDaysExcluded}d of incident-reserve effort excluded: reserves are obligations, not allocation choices.`);
  lines.push('');
  lines.push('## What each horizon has returned (settled evidence only)');
  if (!r.armsByCurrency.length) lines.push('- No portfolio records yet.');
  for (const block of r.armsByCurrency) {
    lines.push(`### ${block.currency} — ${block.totalObservations} settled observation(s)`);
    for (const arm of block.arms) {
      if (arm.verdict === 'empty') lines.push(`- ${arm.label}: no settled bets yet.`);
      else if (arm.verdict === 'counts-only') lines.push(`- ${arm.label}: ${arm.n} settled bet(s) — counts only until n=${ALLOC_MIN_ARM_N}; no return claimed.`);
      else lines.push(`- ${arm.label}: n=${arm.n}, mean ${arm.meanReward}/day, median ${arm.medianReward}/day, exploration bonus ${arm.explorationBonus}/day, UCB index ${arm.ucb}/day.`);
    }
    if (block.leader) lines.push(`- Next marginal day (highest UCB): ${PORTFOLIO_HORIZON_LABELS[block.leader.horizon]}${block.leader.singleArm ? ' — the only learned arm, so this is not yet a comparison' : ''}.`);
    if (block.hindsightRegret !== null) lines.push(`- Hindsight regret vs the best learned arm: ${block.currency} ${block.hindsightRegret.toLocaleString('en-US')} (a learning diagnostic, not a loss figure).`);
  }
  lines.push('');
  lines.push('## Exploratory candidates waiting for a funding call');
  if (!r.candidates.length) lines.push('- None queued. Exploration cannot be funded from an empty queue.');
  for (const c of r.candidates.slice(0, 8)) {
    lines.push(`- “${c.title}” — ~${c.expectedEffortDays}d, ${c.currency}${c.valueDensity === null ? ', value not estimated' : `, value density ${c.valueDensity}/day`}.`);
  }
  if (r.openRebalanceDecision) {
    lines.push('');
    lines.push(`Open decision: “${r.openRebalanceDecision.title}” opened ${r.openRebalanceDecision.date || '—'}${r.openRebalanceDecision.ageDays !== null ? ` (${r.openRebalanceDecision.ageDays} day(s) waiting)` : ''}.`);
  }
  lines.push('');
  lines.push('Caveats: rewards are recorded delivery actuals divided by recorded effort; settled work without actuals is excluded, never scored as zero. Currencies are never converted or summed. UCB1 bonuses price ignorance — a high index on a rarely-tried horizon is an argument to run a small bet, not a promise of return.');
  return lines.join('\n');
}

/* ------------------------------------------------------------ propagation helpers */

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some(
    (d) => d && `${d.title || ''} ${d.expectedOutcome || ''} ${d.support || ''}`.includes(marker),
  );
}

function talkingPointExists(draft, personId, marker) {
  const p = (draft.people || []).find((x) => x && x.id === personId);
  return Boolean(p && (p.talkingPoints || []).some((t) => String(t).includes(marker)));
}

function addTalkingPoint(draft, personId, text, marker) {
  const p = (draft.people || []).find((x) => x && x.id === personId && x.status !== 'archived');
  if (!p) return false;
  p.talkingPoints = [...(Array.isArray(p.talkingPoints) ? p.talkingPoints : []), `${text} ${marker}`].slice(-30);
  return true;
}

function ownerValid(draft, ownerId) {
  return Boolean(ownerId && (draft.people || []).some((p) => p && p.id === ownerId && p.status !== 'archived'));
}

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some(
    (l) => l && l.sourceType === sourceType && l.sourceId === sourceId
      && l.targetType === targetType && l.targetId === targetId && l.relation === relation,
  );
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: clampText(summary, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  out.push({ ruleId, action, targetType, targetId, summary: clampText(summary, 300) });
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

/* ------------------------------------------------------------ the rule */

/**
 * Post-commit rule (ADR-0008). Dispatches on portfolio events and on an
 * explicit `allocation.scan`. All four sub-rules are idempotent via markers,
 * so re-running a scan converges instead of duplicating work.
 */
export function allocationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const isPortfolioEvent = event.type.startsWith('portfolio.');
  if (!isPortfolioEvent && event.type !== 'allocation.scan') return [];
  if (draft.settings?.allocationAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];
  const report = buildAllocationReport(draft, now);
  const eventItem = event.entityId
    ? (draft.portfolio || []).find((i) => i && i.id === event.entityId) || null
    : null;

  /* ----- RULE-ALLOC-01 — exploration-floor breach → one DACI decision ----- */
  const marker = `[${ALLOC_RULE_IDS.FLOOR}]`;
  if (report.fundedFlow.starvation && report.topCandidates.length && !decisionExists(draft, marker)) {
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    const top = report.topCandidates[0];
    const candidateList = report.topCandidates
      .map((c) => `“${c.title}” (~${c.expectedEffortDays}d, ${c.currency})`)
      .join('; ');
    const question = [
      `Exploration is being starved: ${report.fundedFlow.explorationSharePct}% of classified effort funded in the last ${report.fundedFlow.windowDays} days was exploratory, against your ${report.fundedFlow.floorPct}% floor — a shortfall of about ${report.fundedFlow.starvationDebtDays} person-days across ${report.fundedFlow.decisions} funding decisions.`,
      `Queued exploratory candidates: ${candidateList}.`,
      `Choose how to rebalance ${marker}`,
    ].join(' ');
    const decision = {
      id: runCtx.idFactory('dec'),
      title: 'Rebalance exploration: fund one exploratory bet'.slice(0, 180),
      question: question.slice(0, 2000),
      date: runCtx.todayStr,
      reversibility: 'reversible',
      driver: (draft.settings?.leaderName || '').slice(0, 120),
      approver: '',
      contributors: '',
      informed: '',
      options: [
        {
          id: runCtx.idFactory('dopt'),
          label: `Fund “${clampText(top.title, 80)}” in full (~${top.expectedEffortDays}d)`,
          pros: 'Restores the exploration floor with the strongest queued bet',
          cons: 'Commits the full estimate before any learning checkpoint',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: `Fund a smaller probe of “${clampText(top.title, 80)}” with a pre-declared stop rule`,
          pros: 'Buys the learning (and the option to scale) for a fraction of the full bet',
          cons: 'A probe too small to show signal teaches nothing',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: 'Defer exploration deliberately — record why and set a review date',
          pros: 'An explicit, dated choice beats silent drift into the success trap',
          cons: 'The capability gap compounds while core work absorbs every day',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: `Lower the exploration floor below ${report.fundedFlow.floorPct}% in Allocation policy`,
          pros: 'Honest if the floor no longer matches the strategy',
          cons: 'Moves the goalposts instead of funding the learning',
        },
      ],
      chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
      outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
    };
    draft.decisions.push(decision);
    const trigger = eventItem || (draft.portfolio || []).find((i) => i && i.id === top.id) || null;
    if (trigger) {
      pushLink(draft, {
        sourceType: 'portfolio', sourceId: trigger.id, targetType: 'decision', targetId: decision.id,
        relation: 'decides', ruleId: ALLOC_RULE_IDS.FLOOR,
        summary: `DACI exploration-rebalancing decision ${marker}`,
      }, runCtx);
    }
    for (const c of report.topCandidates) {
      pushLink(draft, {
        sourceType: 'decision', sourceId: decision.id, targetType: 'portfolio', targetId: c.id,
        relation: 'funds', ruleId: ALLOC_RULE_IDS.FLOOR,
        summary: `Candidate exploratory bet for rebalancing ${marker}`,
      }, runCtx);
    }
    note(ctx, ALLOC_RULE_IDS.FLOOR, 'created', 'decision', decision.id,
      `Opened DACI rebalancing decision: exploratory share ${report.fundedFlow.explorationSharePct}% is below the ${report.fundedFlow.floorPct}% floor (feeds Decision Tempo)`, out);
  }

  /* ----- event-item-scoped sub-rules ----- */
  if (eventItem) {
    // RULE-ALLOC-02 — funded exploratory bet → learning checkpoint.
    const betMarker = `[${ALLOC_RULE_IDS.BET}:${eventItem.id}]`;
    if (eventItem.horizon === 'exploratory' && eventItem.decision === 'funded' && eventItem.status === 'open'
      && ownerValid(draft, eventItem.ownerId) && !talkingPointExists(draft, eventItem.ownerId, betMarker)) {
      const when = eventItem.targetOn ? `by ${eventItem.targetOn}` : 'at the first checkpoint';
      const added = addTalkingPoint(draft, eventItem.ownerId,
        `Bet check for “${clampText(eventItem.title, 120)}”: this is exploratory, so agree the learning checkpoint now — what would we need to see ${when} to keep funding it, and what result would make us stop?`,
        betMarker);
      if (added) {
        note(ctx, ALLOC_RULE_IDS.BET, 'updated', 'person', eventItem.ownerId,
          `Queued an exploratory-bet learning-checkpoint talking point for “${clampText(eventItem.title, 80)}”`, out);
      }
    }

    // RULE-ALLOC-03 — delivered without actuals → evidence-closure delegation.
    const evidenceMarker = `[${ALLOC_RULE_IDS.EVIDENCE}:${eventItem.id}]`;
    const unsettled = eventItem.actualEffortDays === null || eventItem.actualEffortDays === undefined
      || eventItem.actualValue === null || eventItem.actualValue === undefined;
    if (eventItem.status === 'done' && unsettled && isValidHorizon(eventItem.horizon)
      && ownerValid(draft, eventItem.ownerId) && !delegationExists(draft, evidenceMarker)) {
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      const due = new Date(now);
      due.setDate(due.getDate() + 7);
      const delegation = {
        id: runCtx.idFactory('delegation'),
        personId: eventItem.ownerId,
        title: `Record delivered value & effort for “${clampText(eventItem.title, 110)}”`.slice(0, 160),
        expectedOutcome: 'Actual person-days and delivered value recorded on the portfolio item, so the Allocation Governor can learn what this kind of work returns.'.slice(0, 600),
        authority: 'own',
        support: `This is evidence closure, not a delivery judgement: until actuals are recorded, this settled ${eventItem.horizon} bet is excluded from every return statistic rather than scored as zero. ${evidenceMarker}`.slice(0, 1200),
        delegatedOn: runCtx.todayStr,
        dueOn: dayKey(due),
        status: 'active',
        checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
        createdAt: runCtx.nowIso, updatedAt: runCtx.nowIso,
      };
      draft.delegations.push(delegation);
      pushLink(draft, {
        sourceType: 'portfolio', sourceId: eventItem.id, targetType: 'delegation', targetId: delegation.id,
        relation: 'tracks-followup', ruleId: ALLOC_RULE_IDS.EVIDENCE,
        summary: `Evidence-closure follow-up ${evidenceMarker}`,
      }, runCtx);
      note(ctx, ALLOC_RULE_IDS.EVIDENCE, 'created', 'delegation', delegation.id,
        `Opened evidence-closure delegation: “${clampText(eventItem.title, 80)}” settled without recorded actuals`, out);
    }

    // RULE-ALLOC-04 — funded but unclassified → classification prompt; once
    // classified, the prompt clears itself (RULE-PWR-04 precedent).
    const classifyMarker = `[${ALLOC_RULE_IDS.CLASSIFY}:${eventItem.id}]`;
    if (eventItem.decision === 'funded' && eventItem.status === 'open' && !isValidHorizon(eventItem.horizon)
      && eventItem.kind !== 'capacity-reserve'
      && ownerValid(draft, eventItem.ownerId) && !talkingPointExists(draft, eventItem.ownerId, classifyMarker)) {
      const added = addTalkingPoint(draft, eventItem.ownerId,
        `Classify “${clampText(eventItem.title, 120)}”: is this Core (optimise what exists), Adjacent (nearby ground) or Exploratory (a new bet)? Until funded work is classified, the allocation mix cannot be measured.`,
        classifyMarker);
      if (added) {
        note(ctx, ALLOC_RULE_IDS.CLASSIFY, 'updated', 'person', eventItem.ownerId,
          `Queued a horizon-classification talking point for “${clampText(eventItem.title, 80)}”`, out);
      }
    } else if (isValidHorizon(eventItem.horizon) && ownerValid(draft, eventItem.ownerId)
      && talkingPointExists(draft, eventItem.ownerId, classifyMarker)) {
      const owner = (draft.people || []).find((p) => p && p.id === eventItem.ownerId);
      if (owner) {
        owner.talkingPoints = (owner.talkingPoints || []).filter((t) => !String(t).includes(classifyMarker));
        note(ctx, ALLOC_RULE_IDS.CLASSIFY, 'updated', 'person', eventItem.ownerId,
          `Cleared the resolved classification prompt for “${clampText(eventItem.title, 80)}”`, out);
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------ signals */

/**
 * Human-facing signals for the Allocation Governor. Mirrors the shape of the
 * other domain signal functions so the insights feed can merge them unchanged.
 */
export function allocationSignals(state = {}, now = new Date()) {
  if (!Array.isArray(state.portfolio) || !state.portfolio.length) return [];
  const r = buildAllocationReport(state, now);
  const signals = [];

  if (r.fundedFlow.starvation) {
    signals.push({
      ruleId: 'ALLOC-01',
      domain: 'Allocation',
      title: `Exploration is starved: ${r.fundedFlow.explorationSharePct}% of recently funded effort is exploratory (floor ${r.fundedFlow.floorPct}%)`,
      detail: `Across ${r.fundedFlow.decisions} funding decisions in ${r.fundedFlow.windowDays} days, roughly ${r.fundedFlow.starvationDebtDays} exploratory person-days are owed to the floor. This is March's success trap measured on your own funding behaviour: core work feels safer every cycle precisely because it is the only work being funded.`,
      severity: 3,
      confidence: 'high',
      evidence: r.topCandidates.slice(0, 3).map((c) => `Queued bet: “${c.title}” (~${c.expectedEffortDays}d)`),
      action: { label: 'Open the Allocation Governor', route: '#/allocation?tab=mix' },
    });
  }

  if (r.openRebalanceDecision) {
    const stale = r.openRebalanceDecision.ageDays !== null && r.openRebalanceDecision.ageDays >= ALLOC_REBALANCE_STALE_DAYS;
    signals.push({
      ruleId: 'ALLOC-02',
      domain: 'Allocation',
      title: stale
        ? `The exploration-rebalancing decision has waited ${r.openRebalanceDecision.ageDays} days`
        : 'An exploration-rebalancing decision is waiting for your call',
      detail: stale
        ? 'An undecided rebalancing decision is itself an allocation decision — in favour of the status quo. Fund a bet, fund a probe, or record a deliberate deferral with a review date.'
        : 'The Governor opened a DACI decision with the queued exploratory candidates attached. Deciding it restores the floor; leaving it open keeps exploration at its current share.',
      severity: stale ? 3 : 2,
      confidence: 'high',
      evidence: [`“${r.openRebalanceDecision.title}” opened ${r.openRebalanceDecision.date || '—'}`],
      action: { label: 'Review the decision', route: '#/decisions' },
    });
  }

  if (r.totals.settledMissingEvidence > 0) {
    signals.push({
      ruleId: 'ALLOC-03',
      domain: 'Allocation',
      title: `${r.totals.settledMissingEvidence} settled bet${r.totals.settledMissingEvidence === 1 ? ' has' : 's have'} no recorded outcome`,
      detail: 'Delivered work without actual effort/value cannot teach the portfolio anything, so it is excluded from every return statistic rather than scored as zero. Recording two numbers per settled item is what turns opinion about "what works" into evidence.',
      severity: 2,
      confidence: 'high',
      evidence: r.missingEvidence.slice(0, 3).map((m) => `“${m.title}” (${m.horizon}, completed ${m.completedOn || 'date not recorded'})`),
      action: { label: 'Close the evidence loop', route: '#/allocation?tab=arms' },
    });
  }

  const unclassifiedMix = r.currentMix.find((m) => m.horizon === 'unclassified');
  if (unclassifiedMix && unclassifiedMix.sharePct !== null && unclassifiedMix.sharePct >= ALLOC_UNCLASSIFIED_WARN_PCT) {
    signals.push({
      ruleId: 'ALLOC-04',
      domain: 'Allocation',
      title: `${unclassifiedMix.sharePct}% of funded work is unclassified — the allocation mix cannot be measured`,
      detail: 'Funded items without a Core/Adjacent/Exploratory horizon are invisible to the exploration floor. Classifying takes seconds per item; until then every share the Governor reports carries an asterisk.',
      severity: 2,
      confidence: 'high',
      evidence: r.unclassifiedOpen.filter((u) => u.decision === 'funded').slice(0, 3).map((u) => `“${u.title}” (~${u.expectedEffortDays}d funded)`),
      action: { label: 'Classify funded work', route: '#/allocation?tab=candidates' },
    });
  }

  const richest = [...r.armsByCurrency]
    .filter((b) => b.leader && !b.leader.singleArm)
    .sort((a, b) => b.totalObservations - a.totalObservations)[0];
  if (richest && r.majorityMixHorizon && richest.leader.horizon !== r.majorityMixHorizon) {
    signals.push({
      ruleId: 'ALLOC-05',
      domain: 'Allocation',
      title: `Settled evidence favours ${PORTFOLIO_HORIZON_LABELS[richest.leader.horizon].split(' — ')[0].toLowerCase()} work, but most funded effort sits in ${r.majorityMixHorizon}`,
      detail: `In ${richest.currency}, the ${richest.leader.horizon} horizon holds the highest UCB index (${richest.leader.ucb}/day, mean ${richest.leader.meanReward}/day over settled bets). That is a reason to test a shift with the next marginal day — not proof that past funding was wrong.`,
      severity: 1,
      confidence: 'medium',
      evidence: [`${richest.currency}: ${richest.totalObservations} settled observations across horizons`],
      action: { label: 'Inspect the learned arms', route: '#/allocation?tab=arms' },
    });
  }

  return signals;
}
