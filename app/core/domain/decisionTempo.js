/**
 * app/core/domain/decisionTempo.js — Decision Tempo & Timing Terminal.
 *
 * Why this module exists
 * ----------------------
 * LeadOS could already record what was decided, who approved it and whether the
 * outcome was reviewed. It could not answer the question a leader about to make
 * a call actually asks: *should I decide this now, or is it worth waiting for
 * more evidence — and what does waiting cost per week while I do?* Every other
 * leadership tool treats a decision as a form to be filled in. This module
 * treats a decision as a **timed economic position** with an option value, a
 * carrying cost and a measurable clock.
 *
 * It is a pure domain module: no DOM, no storage, no network, no wall clock.
 * Four named bodies of theory are implemented explicitly rather than gestured
 * at:
 *
 *  1. Cost of Delay and CD3 (Reinertsen, *The Principles of Product Development
 *     Flow*, 2009; Arnold / Black Swan Farming). Delay is priced per unit time
 *     under one of Reinertsen's four profiles (linear, fixed-date, expedite,
 *     standard/intangible), and CD3 = cost of delay ÷ duration ranks decisions
 *     by value-velocity rather than by raw size. A high-CoD decision that
 *     occupies the leader's attention for six weeks is a worse queue item than
 *     a moderate one that can be closed in two days.
 *
 *  2. Expected Value of Sample Information via preposterior analysis (Raiffa &
 *     Schlaifer, *Applied Statistical Decision Theory*, 1961; Howard, 1966;
 *     ISPOR VOI Good Practices Task Force, 2020). The leader records the
 *     *edge* they believe their leading option has over the runner-up, and how
 *     unsure that edge is. Ambiguity resolves with evidence collection at a
 *     stated half-life. With a normal prior on the edge, the expected gain from
 *     gathering information for t days has a closed form — the preposterior
 *     expectation of the positive part of a normal — so EVSI is exact, not a
 *     simulation, and EVSI ≤ EVPI by construction.
 *
 *  3. Optimal stopping under a carrying cost (Dixit & Pindyck, *Investment Under
 *     Uncertainty*, 1994; McDonald & Siegel, 1986). Waiting is a real option:
 *     it buys information and pays delay cost. The optimal decision date is the
 *     argmax of net value, not "as fast as possible" and not "as much data as
 *     possible". The module also reports the probability that the call would
 *     flip if the evidence were in — the switch probability from probabilistic
 *     sensitivity analysis.
 *
 *  4. Decision-type taxonomy and latency measurement (McKinsey, *Decision making
 *     in the age of urgency*, 2019; *What is decision making?*, 2023). Decisions
 *     are classified as delegated, cross-cutting or big-bet from recorded
 *     evidence, and realised latency is measured from the leader's own settled
 *     records. The workspace's own 80% latency band is reported with a
 *     finite-sample coverage bound, and stays counts-only below n=5.
 *
 * Everything here is derived from records the leader actually entered. Missing
 * money stays missing (an unpriced decision is labelled unpriced, never zero),
 * currencies are never summed together, and no schedule silently invents an
 * advantage, an uncertainty or a value at stake. The engine proposes; the human
 * arms, edits and owns the call.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  FORBIDDEN_LINK_TYPES,
  computePertImpact,
  linksForEntity,
} from './cases.js';

/* ------------------------------------------------------------------ */
/* Constants and vocabulary                                             */
/* ------------------------------------------------------------------ */

export const TEMPO_ENGINE_VERSION = 'tempo-2026.10-v1';

/** Below this many settled latencies a class is counts-only. */
export const TEMPO_MIN_SAMPLES = 5;

/** Coverage target for the empirical latency band (distribution-free). */
export const TEMPO_COVERAGE = 0.8;

/** Modelling horizon for the timing curve, in days. */
export const TEMPO_HORIZON_DAYS = 84;

/** Reinertsen's fixed-date profile multiplies the linear rate after the date. */
export const FIXED_DATE_MULTIPLIER = 2.5;

/** Standard (intangible) work still has *some* carrying cost, but a small one. */
export const STANDARD_PROFILE_SHARE = 0.15;

/** A material value-at-stake change is one that moves the derived total >20%. */
export const VALUE_DRIFT_THRESHOLD = 0.2;

export const TEMPO_SCHEDULE_STATUSES = ['proposed', 'armed', 'settled', 'abandoned'];

export const TEMPO_SCHEDULE_STATUS_LABELS = {
  proposed: 'Proposed (not armed)',
  armed: 'Armed',
  settled: 'Settled',
  abandoned: 'Abandoned',
};

export const DECISION_TYPES = ['delegated', 'cross-cutting', 'big-bet'];

export const DECISION_TYPE_LABELS = {
  delegated: 'Delegated decision',
  'cross-cutting': 'Cross-cutting decision',
  'big-bet': 'Big-bet decision',
};

export const DECISION_TYPE_HELP = {
  delegated: 'Low risk, reversible, one owner. McKinsey finds these are the slowest relative to their stakes — decide at the lowest level that has the information.',
  'cross-cutting': 'Spans several teams or functions. Quality and speed both matter; the failure mode is decision debt, not insufficient analysis.',
  'big-bet': 'Irreversible or expensive to undo. Worth an explicit information plan — but the carrying cost is also the highest.',
};

export const DELAY_PROFILES = ['linear', 'fixed-date', 'expedite', 'standard'];

export const DELAY_PROFILE_LABELS = {
  linear: 'Linear — value drains steadily',
  'fixed-date': 'Fixed date — cheap until the date, then expensive',
  expedite: 'Expedite — a window closes the moment you wait',
  standard: 'Standard / intangible — little visible carrying cost',
};

export const DELAY_PROFILE_HELP = {
  linear: 'Reinertsen’s default: every week of delay costs the same share of the value at stake.',
  'fixed-date': 'Nothing is lost until the date; after it, cost accrues at 2.5× the linear rate (contract dates, launches, compliance gates).',
  expedite: 'A one-off step is paid as soon as the window is missed, plus a small ongoing tail (a competitor’s slot, a customer commitment).',
  standard: 'Deliberately low carrying cost. Waiting is cheap — which is exactly why this work is never prioritised.',
};

export const TEMPO_RULES = Object.freeze([
  {
    id: 'RULE-DLY-01',
    name: 'Settled decision → measured latency and closed timebox',
    framework: 'Decision-latency measurement (McKinsey 2019/2023) & append-only settlement',
    trigger: 'decision.made / any decision event',
    targetModule: 'tempoSchedules / decisions',
    description: 'When a decision is actually made, the armed timebox settles itself, the realised latency is measured from the recorded decision date, and the frozen plan is kept beside the outcome. No historical week is rewritten.',
  },
  {
    id: 'RULE-DLY-02',
    name: 'Decision debt → one owned timeboxed delegation',
    framework: 'Cost of Delay (Reinertsen, 2009) & owned follow-through',
    trigger: 'an armed timebox passes its decide-by date with the decision still open',
    targetModule: 'delegations / links',
    description: 'Creates exactly one blameless, idempotent delegation to the recorded approver (or driver) to bring one option to the table, because an unmade decision with a carrying cost is a commitment already being broken.',
  },
  {
    id: 'RULE-DLY-03',
    name: 'High-CD3 open decision → one proposed timebox',
    framework: 'CD3 = cost of delay ÷ duration (Reinertsen; Black Swan Farming)',
    trigger: 'a priced open decision has no timebox',
    targetModule: 'tempoSchedules / links',
    description: 'Proposes (never silently arms) one timebox with the derived value at stake, the guardrail decide-by date and the default half-life, so the leader only has to add the edge and the uncertainty they actually believe.',
  },
  {
    id: 'RULE-DLY-04',
    name: 'Value-at-stake drift → refreshed economics',
    framework: 'Rolling re-estimation & materiality thresholds',
    trigger: 'linked case exposure, budget commitment or negotiation stakes change by more than 20%',
    targetModule: 'tempoSchedules',
    description: 'Refreshes the derived value at stake on an armed timebox, records the change in the schedule history, and leaves the recorded human inputs (edge, uncertainty, profile) untouched.',
  },
  {
    id: 'RULE-DLY-05',
    name: 'Class-level tempo breach → one DACI tempo-policy decision',
    framework: 'Decision taxonomy benchmark (McKinsey, 2019) & statistical process control',
    trigger: 'a decision type’s own measured p80 latency exceeds its guardrail with n ≥ 5',
    targetModule: 'decisions / links',
    description: 'Opens exactly one open DACI decision per decision type with explicit options (timebox at the measured p80, delegate the class, add an evidence plan, or accept the tempo). It never re-times an individual record.',
  },
  {
    id: 'RULE-DLY-06',
    name: 'Read-side tempo signals and board brief',
    framework: 'Cost of delay, EVSI and empirical latency bands',
    trigger: 'render (write-free)',
    targetModule: 'insights / today / board pack',
    description: 'Surfaces decision debt, unpriced calls, decisions where waiting pays and decisions where waiting is already losing, plus a deterministic board-ready brief.',
  },
]);

const DEFAULT_GUARDRAILS = { delegated: 7, 'cross-cutting': 21, 'big-bet': 45 };

/* ------------------------------------------------------------------ */
/* Numeric helpers — missing stays missing, never zero                  */
/* ------------------------------------------------------------------ */

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value, fallback = null) {
  const n = finite(value, null);
  return n !== null && n > 0 ? n : fallback;
}

/** Standard normal probability density. */
export function normalPdf(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF via the Abramowitz & Stegun (1964) 7.1.26 erf
 * approximation — max absolute error ~1.5e-7, deterministic and dependency-free.
 */
export function normalCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/**
 * E[max(0, X)] for X ~ N(mu, sigma²) — the exact preposterior payoff of a
 * two-option decision under a normal prior on the edge. With sigma → 0 this
 * collapses to max(0, mu), which is the value of perfect information case.
 */
export function expectedPositivePart(mu, sigma) {
  const m = finite(mu, 0);
  const s = Math.max(0, finite(sigma, 0));
  if (s === 0) return Math.max(0, m);
  const z = m / s;
  return m * normalCdf(z) + s * normalPdf(z);
}

/**
 * Ambiguity (standard deviation of the believed edge) after `days` of evidence
 * gathering, when precision accumulates linearly in time and reaches twice the
 * prior precision at `halfLifeDays`. t=0 → sigma; t→∞ → 0.
 */
export function ambiguityAt({ uncertainty, halfLifeDays, days }) {
  const s0 = Math.max(0, finite(uncertainty, 0));
  if (s0 === 0) return 0;
  const halfLife = positive(halfLifeDays, 14);
  const t = Math.max(0, finite(days, 0));
  return s0 / Math.sqrt(1 + t / halfLife);
}

/**
 * Spread of the *posterior mean* of the edge after `days` of evidence.
 *
 * Preposterior analysis (Raiffa & Schlaifer, 1961) works on the mean the leader
 * would hold after seeing the evidence, not on the evidence itself. With a
 * normal prior and normal sampling the posterior mean is itself normal, with
 * variance `s0² − s_t²`; its spread is what makes information valuable. t=0
 * gives 0 (no information); t→∞ gives the prior spread (perfect information).
 */
export function posteriorMeanSpread({ uncertainty, halfLifeDays, days }) {
  const s0 = Math.max(0, finite(uncertainty, 0));
  if (s0 === 0) return 0;
  const after = ambiguityAt({ uncertainty: s0, halfLifeDays, days });
  return Math.sqrt(Math.max(0, s0 * s0 - after * after));
}

/**
 * Expected Value of Sample Information for waiting `days` on a two-option call.
 *
 * Two options, the leading one believed better by `advantage` with prior
 * standard deviation `uncertainty`; choosing the runner-up is the zero point.
 * EVSI = E[ max(0, posterior mean) ] − max(0, prior mean). By construction
 * EVSI(0) = 0, EVSI is non-decreasing in t, and EVSI ≤ EVPI because the
 * posterior-mean spread can never exceed the prior spread. This is the exact
 * closed form for the normal/normal case — no simulation, no model call, and
 * auditable line by line.
 */
export function expectedValueOfInformation({ advantage, uncertainty, halfLifeDays, days }) {
  const mu = finite(advantage, 0);
  if (Math.max(0, finite(uncertainty, 0)) === 0) return 0;
  const spread = posteriorMeanSpread({ uncertainty, halfLifeDays, days });
  if (spread <= 0) return 0;
  return Math.max(0, expectedPositivePart(mu, spread) - Math.max(0, mu));
}

/**
 * Probability the call flips if the evidence resolves at `days`: the chance the
 * *posterior mean* of the edge lands on the other side of zero. This is a
 * probabilistic-sensitivity statement about the option, never a confidence
 * statement about the leader.
 */
export function switchProbability({ advantage, uncertainty, halfLifeDays, days }) {
  const mu = finite(advantage, 0);
  const spread = posteriorMeanSpread({ uncertainty, halfLifeDays, days });
  if (!(spread > 0)) return mu >= 0 ? 0 : 1;
  return normalCdf(-mu / spread);
}

/* ------------------------------------------------------------------ */
/* Reinertsen delay profiles (Principles of Product Development Flow)   */
/* ------------------------------------------------------------------ */

/**
 * Cumulative carrying cost of delaying `days`, by delay profile.
 *
 * Cost is a *rate* (money per week) integrated over the waiting time, and it is
 * capped at the value at stake: delay can destroy the value of a decision but it
 * cannot destroy more than that. The cap is a modelling convention, stated here
 * so nobody reads an uncapped number as a forecast.
 */
export function delayCostAt({
  profile = 'linear',
  ratePerWeek,
  valueAtStake = null,
  deadlineDays = null,
  days = 0,
}) {
  const rate = Math.max(0, finite(ratePerWeek, 0));
  const t = Math.max(0, finite(days, 0));
  const weeks = t / 7;
  let cost = 0;
  switch (profile) {
    case 'fixed-date': {
      const gate = Math.max(0, finite(deadlineDays, 14));
      cost = t <= gate ? 0 : rate * (weeks - gate / 7) * FIXED_DATE_MULTIPLIER;
      break;
    }
    case 'expedite': {
      // A one-off step is paid as soon as the window is missed, plus a tail.
      cost = t > 0 ? rate * 2 + rate * 0.5 * weeks : 0;
      break;
    }
    case 'standard': {
      cost = rate * STANDARD_PROFILE_SHARE * weeks;
      break;
    }
    case 'linear':
    default: {
      cost = rate * weeks;
      break;
    }
  }
  const cap = positive(valueAtStake, null);
  const capped = cap !== null ? Math.min(cost, cap) : cost;
  return { cost: round(capped, 2), uncappedCost: round(cost, 2), capped: cap !== null && cost > cap };
}

/** Default carrying cost per week: the value at stake spread over its erosion window. */
export function derivedRatePerWeek(valueAtStake, windowWeeks) {
  const value = Math.max(0, finite(valueAtStake, 0));
  const window = Math.max(1, Math.ceil(finite(windowWeeks, 12)));
  return round(value / window, 2);
}

/* ------------------------------------------------------------------ */
/* Decision classification                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_BIG_BET_VALUE = 50000;

export function guardrailDaysFor(type, settings = {}) {
  const map = {
    delegated: settings?.tempoDelegatedMaxDays ?? DEFAULT_GUARDRAILS.delegated,
    'cross-cutting': settings?.tempoCrossCuttingMaxDays ?? DEFAULT_GUARDRAILS['cross-cutting'],
    'big-bet': settings?.tempoBigBetMaxDays ?? DEFAULT_GUARDRAILS['big-bet'],
  };
  const n = Math.round(Number(map[type]));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GUARDRAILS['cross-cutting'];
}

function participantNames(decision) {
  const raw = [decision?.driver, decision?.approver, decision?.contributors, decision?.informed];
  const names = new Set();
  for (const value of raw) {
    for (const part of String(value || '').split(/[,;&]|\band\b/i)) {
      const name = part.trim().toLowerCase();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Classify a decision into McKinsey's delegated / cross-cutting / big-bet
 * taxonomy from recorded evidence only. Every branch records its reason, so the
 * classification is auditable rather than a vibe.
 */
export function classifyDecisionType(decision, valuation = null, settings = {}) {
  const reasons = [];
  const amount = positive(valuation?.dominant?.amount, null);
  const currency = valuation?.dominant?.currency || null;
  const threshold = positive(settings?.tempoBigBetValue, DEFAULT_BIG_BET_VALUE);
  const participants = participantNames(decision);
  const linkedRecords = Math.max(0, finite(valuation?.linkedRecords, 0) || 0);
  const vetoes = Math.max(0, finite(valuation?.vetoPlayers, 0) || 0);

  if (decision?.reversibility === 'irreversible') reasons.push('Recorded as irreversible — expensive to undo');
  if (amount !== null && amount >= threshold) {
    reasons.push(`${currency} ${Math.round(amount).toLocaleString('en-US')} at stake, at or above the ${threshold.toLocaleString('en-US')} big-bet convention`);
  }
  if (linkedRecords >= 3) reasons.push(`${linkedRecords} linked operational records across modules`);
  if (vetoes > 0) reasons.push(`${vetoes} recorded veto player(s) can block it`);
  if (reasons.length) return { type: 'big-bet', reasons };

  const approver = String(decision?.approver || '').trim().toLowerCase();
  const driver = String(decision?.driver || '').trim().toLowerCase();
  const separated = Boolean(approver) && Boolean(driver) && approver !== driver;
  if (
    decision?.reversibility !== 'irreversible' &&
    participants.size <= 2 &&
    linkedRecords <= 1 &&
    vetoes === 0 &&
    (amount === null || amount < threshold / 4)
  ) {
    reasons.push('Reversible, at most two people involved, no veto gate and little money at stake');
    if (separated) reasons.push('Driver and approver are different people — the call can be made below the leader');
    return { type: 'delegated', reasons };
  }

  reasons.push(
    decision?.reversibility === 'irreversible'
      ? 'Irreversible but contained'
      : 'Reversible, but spans several people or records'
  );
  if (participants.size > 2) reasons.push(`${participants.size} named participants`);
  return { type: 'cross-cutting', reasons };
}

/* ------------------------------------------------------------------ */
/* Value at stake — derived from the typed cross-module graph           */
/* ------------------------------------------------------------------ */

function term({ kind, label, amount = null, currency = null, days = null, sourceType, sourceId, route, basis, ruleId = 'DERIVED' }) {
  return { kind, label, amount, currency, days, sourceType, sourceId, route, basis, ruleId };
}

/**
 * Derive the economic size of a decision from what it is actually linked to.
 * Reads only non-confidential operational records (the link graph already
 * excludes conflicts and anonymous pulses). Currencies are never summed.
 */
export function decisionValueTerms(state = {}, decision = {}) {
  const terms = [];
  if (!decision?.id) return summarizeTerms(terms);
  const peers = linksForEntity(state, 'decision', decision.id);
  const seen = new Set();
  const push = (t) => {
    const key = `${t.sourceType}:${t.sourceId}:${t.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(t);
  };

  for (const entry of peers) {
    const peer = entry.peer;
    const raw = peer.raw || {};
    if (peer.type === 'case') {
      const pert = computePertImpact(raw.financial, raw.fmea);
      if (pert.hasFinancialEstimate && positive(pert.cost?.expected, null)) {
        push(term({
          kind: 'case-exposure',
          label: `Open case exposure — ${peer.title}`,
          amount: round(pert.cost.expected, 2),
          currency: (pert.currency || 'USD').toUpperCase(),
          sourceType: 'case',
          sourceId: peer.id,
          route: peer.route,
          basis: 'PERT expected financial exposure on a linked open case',
        }));
      }
      if (pert.hasCapacityEstimate && positive(pert.capacity?.expected, null)) {
        push(term({
          kind: 'capacity-days',
          label: `Capacity tied up — ${peer.title}`,
          days: round(pert.capacity.expected, 1),
          sourceType: 'case',
          sourceId: peer.id,
          route: peer.route,
          basis: 'PERT expected diverted person-days on a linked case',
        }));
      }
    } else if (peer.type === 'budget') {
      const currency = String(raw.currency || 'USD').toUpperCase();
      for (const line of raw.lines || []) {
        if (!['planned', 'committed'].includes(line.status)) continue;
        const amount = positive(line.committedAmount, positive(line.actualAmount, null));
        if (!amount) continue;
        push(term({
          kind: 'budget-commitment',
          label: `Committed money — ${line.title || peer.title}`,
          amount: round(amount, 2),
          currency,
          sourceType: 'budget',
          sourceId: peer.id,
          route: peer.route,
          basis: `${line.status === 'committed' ? 'Encumbered' : 'Planned'} budget line in ${currency}`,
        }));
      }
    } else if (peer.type === 'portfolio') {
      const value = raw.value || {};
      const expectedValue =
        positive(value.mostLikely, null) !== null
          ? round((Number(value.optimistic || 0) + 4 * Number(value.mostLikely || 0) + Number(value.pessimistic || 0)) / 6, 2)
          : null;
      if (positive(expectedValue, null)) {
        push(term({
          kind: 'portfolio-value',
          label: `Planned work value — ${peer.title}`,
          amount: expectedValue,
          currency: String(raw.currency || 'USD').toUpperCase(),
          sourceType: 'portfolio',
          sourceId: peer.id,
          route: peer.route,
          basis: 'PERT expected value of a linked portfolio item',
        }));
      }
      const effort = raw.effortDays || {};
      const expectedDays =
        positive(effort.mostLikely, null) !== null
          ? round((Number(effort.optimistic || 0) + 4 * Number(effort.mostLikely || 0) + Number(effort.pessimistic || 0)) / 6, 1)
          : null;
      if (positive(expectedDays, null)) {
        push(term({
          kind: 'capacity-days',
          label: `Work queued behind the call — ${peer.title}`,
          days: expectedDays,
          sourceType: 'portfolio',
          sourceId: peer.id,
          route: peer.route,
          basis: 'PERT expected effort of a linked portfolio item',
        }));
      }
    } else if (peer.type === 'negotiation') {
      const stakes = positive(raw.stakesValue, null);
      if (stakes) {
        push(term({
          kind: 'negotiation-stakes',
          label: `Negotiation stakes — ${peer.title}`,
          amount: round(stakes, 2),
          currency: String(raw.stakesCurrency || 'USD').toUpperCase(),
          sourceType: 'negotiation',
          sourceId: peer.id,
          route: peer.route,
          basis: 'Recorded stakes value on a linked negotiation (not a settlement forecast)',
        }));
      }
    } else if (peer.type === 'dependency') {
      const daily = positive(raw.dailyImpactOverride, positive(raw.derivedDailyImpact, null));
      const ttr = finite(raw.ttrDays, null);
      const tts = finite(raw.ttsDays, null);
      const shortfallDays = ttr !== null && tts !== null ? Math.max(0, ttr - tts) : 0;
      const depAmount = daily !== null && shortfallDays > 0 ? round(daily * shortfallDays, 2) : null;
      if (positive(depAmount, null)) {
        push(term({
          kind: 'dependency-shortfall',
          label: `Continuity shortfall exposure — ${peer.title}`,
          amount: depAmount,
          currency: String(raw.dailyImpactOverride ? raw.currency : raw.derivedCurrency || raw.currency || 'USD').toUpperCase(),
          sourceType: 'dependency',
          sourceId: peer.id,
          route: peer.route,
          basis: `Simchi-Levi survival shortfall (${shortfallDays}d × daily exposure) on a linked operational dependency`,
        }));
      }
    }
  }

  // Budget lines can point at a decision as their source without a graph edge.
  for (const budget of state.budgets || []) {
    const currency = String(budget.currency || 'USD').toUpperCase();
    for (const line of budget.lines || []) {
      if (line.sourceType !== 'decision' || line.sourceId !== decision.id) continue;
      if (!['planned', 'committed'].includes(line.status)) continue;
      const amount = positive(line.committedAmount, positive(line.actualAmount, null));
      if (!amount) continue;
      push(term({
        kind: 'budget-commitment',
        label: `Committed money — ${line.title || budget.title}`,
        amount: round(amount, 2),
        currency,
        sourceType: 'budget',
        sourceId: budget.id,
        route: `#/finance/${budget.id}`,
        basis: `Source-linked ${line.status} budget line`,
      }));
    }
  }

  // Veto players linked to the decision carry no money but do carry tempo.
  const vetoes = peers.filter((p) => p.peer.type === 'stakeholder' && p.peer.raw?.vetoPlayer === true);
  return summarizeTerms(terms, { vetoPlayers: vetoes.length, linkedRecords: peers.length });
}

function summarizeTerms(terms, extra = {}) {
  const totals = new Map();
  let capacityDays = 0;
  for (const t of terms) {
    if (positive(t.amount, null) !== null && t.currency) {
      totals.set(t.currency, round((totals.get(t.currency) || 0) + t.amount, 2));
    }
    if (positive(t.days, null) !== null) capacityDays = round(capacityDays + t.days, 1);
  }
  const byCurrency = [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
  const dominant = byCurrency[0] || null;
  return {
    terms,
    byCurrency,
    dominant,
    otherCurrencies: byCurrency.slice(1),
    capacityDays,
    linkedRecords: extra.linkedRecords ?? 0,
    vetoPlayers: extra.vetoPlayers ?? 0,
    priced: Boolean(dominant && dominant.amount > 0),
    termCount: terms.length,
  };
}

/* ------------------------------------------------------------------ */
/* Latency measurement                                                  */
/* ------------------------------------------------------------------ */

/**
 * Realised decision latency for settled records: from the day the decision was
 * logged to the day it was actually made. `decidedOn` is only ever stamped by
 * the app at the moment of the call; a legacy record without it is counted as
 * *unmeasured* rather than inferred from a later review date.
 */
export function decisionLatencySamples(state = {}) {
  const samples = [];
  let unmeasured = 0;
  for (const decision of state.decisions || []) {
    if (!decision?.chosen) continue;
    const decidedOn = decision.decidedOn || null;
    if (!decidedOn) {
      unmeasured += 1;
      continue;
    }
    const latency = daysBetween(decision.date, decidedOn);
    if (latency === null || latency < 0) {
      unmeasured += 1;
      continue;
    }
    samples.push({
      decisionId: decision.id,
      decidedOn,
      loggedOn: decision.date,
      latencyDays: latency,
      reversibility: decision.reversibility || 'reversible',
    });
  }
  return { samples, unmeasured };
}

function quantile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] === undefined ? sorted[base] : sorted[base + 1];
  return sorted[base] + (next - sorted[base]) * rest;
}

/**
 * Distribution-free empirical band for future latency. With n exchangeable
 * samples, the ceil((n+1)(1-α))-th order statistic gives marginal coverage of at
 * least k/(n+1) for the next latency, without assuming a distribution.
 */
export function latencyBand(samples = [], { coverage = TEMPO_COVERAGE, minSamples = TEMPO_MIN_SAMPLES } = {}) {
  const values = (samples || []).map((s) => (typeof s === 'number' ? s : s?.latencyDays)).filter((v) => Number.isFinite(v));
  const n = values.length;
  const target = Math.min(0.99, Math.max(0.5, coverage));
  if (n < minSamples) {
    return {
      sufficient: false,
      n,
      coverageTarget: target,
      coverageBound: null,
      medianDays: n ? round(quantile(values, 0.5), 1) : null,
      p80Days: null,
      maxDays: n ? Math.max(...values) : null,
      note: `Counts only: ${n} of ${minSamples} settled latencies measured. No band is shown below n=${minSamples}.`,
    };
  }
  const k = Math.min(n, Math.ceil((n + 1) * target));
  const sorted = values.slice().sort((a, b) => a - b);
  const bound = round(k / (n + 1), 3);
  return {
    sufficient: true,
    n,
    coverageTarget: target,
    coverageBound: bound,
    medianDays: round(quantile(values, 0.5), 1),
    p80Days: round(sorted[k - 1], 1),
    maxDays: sorted.at(-1),
    note: `Distribution-free ${Math.round(target * 100)}% band over ${n} settled latencies; finite-sample coverage ≥ ${bound} under exchangeability.`,
  };
}

/** Latency statistics per decision type, computed from the leader's own records. */
export function latencyByDecisionType(state = {}, settings = {}) {
  const { samples, unmeasured } = decisionLatencySamples(state);
  // Classify each decision once. Doing this inside a per-type filter would make
  // the post-commit rule quadratic in the size of the decision log.
  const typeById = new Map();
  for (const decision of state.decisions || []) {
    if (!decision?.id) continue;
    typeById.set(decision.id, classifyDecisionType(decision, decisionValueTerms(state, decision), settings).type);
  }
  const rows = DECISION_TYPES.map((type) => {
    const typeSamples = samples.filter((s) => (typeById.get(s.decisionId) || 'cross-cutting') === type);
    const band = latencyBand(typeSamples, { coverage: (settings?.tempoCoveragePct ?? 80) / 100 });
    const guardrail = guardrailDaysFor(type, settings);
    return {
      type,
      label: DECISION_TYPE_LABELS[type],
      guardrailDays: guardrail,
      band,
      samples: typeSamples,
      breach: band.sufficient && band.p80Days > guardrail,
    };
  });
  return {
    rows,
    all: latencyBand(samples, { coverage: (settings?.tempoCoveragePct ?? 80) / 100 }),
    unmeasured,
    totalMeasured: samples.length,
  };
}

/* ------------------------------------------------------------------ */
/* Timing evaluation — the decision option                               */
/* ------------------------------------------------------------------ */

function scheduleForDecision(state, decisionId) {
  const schedules = (state.tempoSchedules || []).filter((s) => s.decisionId === decisionId);
  if (!schedules.length) return null;
  const rank = { armed: 0, proposed: 1, settled: 2, abandoned: 3 };
  return schedules
    .slice()
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || String(b.createdOn).localeCompare(String(a.createdOn)))[0];
}

/**
 * Evaluate one decision's timing position.
 *
 * Returns the delay curve, the optimal wait in days, the net value of the best
 * plan versus deciding now, the switch probability and an explicit verdict.
 * When the leader has not recorded an edge and an uncertainty, the module
 * refuses to invent them and returns verdict `needs-economics`.
 */
export function evaluateDecisionTiming({ decision, valuation, schedule = null, now = new Date(), settings = {} } = {}) {
  const today = dayKey(now);
  const classified = classifyDecisionType(decision, valuation, settings);
  const guardrailDays = guardrailDaysFor(classified.type, settings);
  const valueAtStakeOverride = positive(schedule?.valueAtStakeOverride, null);
  const derivedAmount = positive(valuation?.dominant?.amount, null);
  const amount = valueAtStakeOverride ?? derivedAmount;
  const currency = schedule?.currency || valuation?.dominant?.currency || null;

  const windowWeeks = Math.max(1, Math.round(finite(schedule?.windowWeeks, Math.max(4, Math.round(guardrailDays / 7)))) || 12);
  const profile = DELAY_PROFILES.includes(schedule?.profile) ? schedule.profile : 'linear';
  const ratePerWeek = positive(schedule?.delayCostPerWeek, null) ?? derivedRatePerWeek(amount || 0, windowWeeks);
  const deadlineDays = Math.max(0, Math.round(finite(schedule?.deadlineDays, Math.max(7, guardrailDays)) ?? guardrailDays));
  const halfLifeDays = positive(schedule?.halfLifeDays, positive(settings?.tempoInfoHalfLifeDays, 14));
  const infoPlanDays = Math.max(0, Math.round((positive(schedule?.infoWeeks, 0) || 0) * 7));
  const infoCostAmount = Math.max(0, finite(schedule?.infoCostAmount, 0) || 0);

  // Decision debt is a property of the decision, not of the timebox: an open
  // call older than its own class guardrail is late whether or not the leader
  // ever armed a timebox. An armed timebox replaces the class default with the
  // date the leader actually committed to.
  const decideBy = schedule?.decideBy || addDays(decision?.date, guardrailDays) || addDays(today, guardrailDays);
  const debtDays = Math.max(0, daysBetween(decideBy, today) ?? 0);
  const ageDays = Math.max(0, daysBetween(decision?.date, today) ?? 0);
  const dueInDays = daysBetween(today, decideBy);

  const advantage = finite(schedule?.advantageAmount, null);
  const uncertaintyPct = finite(schedule?.uncertaintyPct, null);
  const uncertainty =
    uncertaintyPct === null ? null : (Math.max(0, Math.min(100, uncertaintyPct)) / 100) * Math.max(1, amount || 1);
  const canPriceInformation =
    amount !== null && amount > 0 && advantage !== null && advantage > 0 && uncertainty !== null && uncertainty > 0;

  const horizon = Math.max(TEMPO_HORIZON_DAYS, infoPlanDays + 14);
  const stride = Math.max(1, Math.round(horizon / 48));
  const curve = [];
  let best = null;
  let netNow = null;
  let lastPayingDay = 0;

  for (let day = 0; day <= horizon; day += 1) {
    const delay = delayCostAt({ profile, ratePerWeek, valueAtStake: amount, deadlineDays, days: day });
    const infoCost = infoPlanDays > 0 && infoCostAmount > 0
      ? round(infoCostAmount * Math.min(1, day / infoPlanDays), 2)
      : 0;
    const evsi = canPriceInformation
      ? round(expectedValueOfInformation({ advantage, uncertainty, halfLifeDays, days: day }), 2)
      : 0;
    const net = round(evsi - delay.cost - infoCost, 2);
    const point = {
      day,
      evsi,
      delayCost: delay.cost,
      capped: delay.capped,
      infoCost,
      net,
      switchProbability: canPriceInformation ? round(switchProbability({ advantage, uncertainty, halfLifeDays, days: day }), 3) : null,
    };
    if (day === 0) netNow = net;
    if (best === null || net > best.net) best = { ...point };
    if (canPriceInformation && evsi > delay.cost + infoCost) lastPayingDay = day;
    if (day % stride === 0 || day === horizon) curve.push(point);
  }

  const infoValueAtPlan = canPriceInformation
    ? round(expectedValueOfInformation({ advantage, uncertainty, halfLifeDays, days: infoPlanDays }), 2)
    : null;
  const gainFromBestPlan = best !== null && netNow !== null ? round(best.net - netNow, 2) : null;
  const materiality = Math.max(1, (amount || 0) * 0.01);
  let verdict = 'needs-economics';
  let verdictReason = 'Record the edge you believe the leading option has, and how unsure you are, to price the option to wait.';
  if (!amount || amount <= 0) {
    verdict = 'unpriced';
    verdictReason = 'No money is linked to this decision, so delay can only be described in days. Link a case, budget line, portfolio item or negotiation to price it — or set a value override.';
  } else if (canPriceInformation) {
    if (best.day === 0 || (gainFromBestPlan !== null && gainFromBestPlan <= materiality)) {
      verdict = 'decide-now';
      verdictReason = `Waiting is already the expensive option: the best information plan is worth ${currency || ''} ${Math.max(0, gainFromBestPlan || 0).toLocaleString('en-US')} over deciding now, which is inside the 1% materiality band. Decide.`;
    } else {
      verdict = 'gather-first';
      verdictReason = `Waiting ${best.day} days to resolve the ambiguity is worth about ${currency || ''} ${gainFromBestPlan.toLocaleString('en-US')} more than deciding now. Gather that evidence, then decide.`;
    }
  }

  const scenarios = [0, 3, 7, 14, 30, 60]
    .filter((d) => d <= horizon)
    .map((day) => {
      const delay = delayCostAt({ profile, ratePerWeek, valueAtStake: amount, deadlineDays, days: day });
      const infoCost = infoPlanDays > 0 && infoCostAmount > 0 ? round(infoCostAmount * Math.min(1, day / infoPlanDays), 2) : 0;
      const evsi = canPriceInformation ? round(expectedValueOfInformation({ advantage, uncertainty, halfLifeDays, days: day }), 2) : 0;
      return {
        day,
        date: addDays(today, day),
        evsi,
        delayCost: delay.cost,
        infoCost,
        net: round(evsi - delay.cost - infoCost, 2),
        switchProbability: canPriceInformation ? round(switchProbability({ advantage, uncertainty, halfLifeDays, days: day }), 3) : null,
      };
    });

  return {
    engineVersion: TEMPO_ENGINE_VERSION,
    decisionId: decision?.id || null,
    title: decision?.title || '',
    today,
    type: classified.type,
    typeLabel: DECISION_TYPE_LABELS[classified.type],
    typeReasons: classified.reasons,
    guardrailDays,
    currency,
    amount: amount === null ? null : round(amount, 2),
    amountSource: valueAtStakeOverride !== null ? 'override' : derivedAmount !== null ? 'derived' : 'none',
    ratePerWeek,
    rateSource: positive(schedule?.delayCostPerWeek, null) === null ? 'derived' : 'recorded',
    profile,
    profileLabel: DELAY_PROFILE_LABELS[profile],
    windowWeeks,
    deadlineDays,
    halfLifeDays,
    infoPlanDays,
    infoCostAmount,
    infoValueAtPlan,
    advantage,
    uncertainty,
    canPriceInformation,
    decideBy,
    dueInDays,
    debtDays,
    ageDays,
    netNow,
    bestPlan: best,
    gainFromBestPlan,
    informationHorizonDays: canPriceInformation ? lastPayingDay : null,
    verdict,
    verdictReason,
    scenarios,
    curve,
    scheduleId: schedule?.id || null,
    scheduleStatus: schedule?.status || null,
    priced: Boolean(amount && amount > 0),
    decisionDebt: debtDays > 0,
  };
}

/**
 * CD3 = cost of delay ÷ duration. Duration is the time the decision occupies
 * the leader's scarce attention before it can be closed: the planned evidence
 * window, or one week when nothing is planned. Purely a ranking number — never
 * money.
 */
export function decisionCd3({ ratePerWeek, infoPlanDays, amount }) {
  const rate = Math.max(0, finite(ratePerWeek, 0));
  const durationWeeks = Math.max(0.5, (Math.max(0, finite(infoPlanDays, 0)) || 5) / 7);
  return { cd3: round(rate / durationWeeks, 2), durationWeeks: round(durationWeeks, 2), rate: round(rate, 2), amount: amount ?? null };
}

/* ------------------------------------------------------------------ */
/* Workspace report                                                     */
/* ------------------------------------------------------------------ */

/**
 * Report cache. The engine is pure, but the nav badge, Today card and the
 * terminal all ask for the same report inside one render. The cache is keyed on
 * the state object identity (the store replaces it on every write) and the UTC
 * day, so it can never serve a stale workspace.
 */
const REPORT_CACHE = new WeakMap();

/**
 * The report is a deterministic function of (state, day, settings). A WeakMap
 * keyed on the state object can never serve a stale answer, because the store
 * replaces `state` on every write; a settings override bypasses the memo.
 */
export function buildTempoReport(state = {}, { now = new Date(), settings = null } = {}) {
  const override = settings && settings !== state.settings;
  if (override) return buildTempoReportUncached(state, now, settings);
  const day = dayKey(now);
  const bucket = REPORT_CACHE.get(state);
  if (bucket && bucket.day === day) return bucket.report;
  const report = buildTempoReportUncached(state, now, settings);
  REPORT_CACHE.set(state, { day, report });
  return report;
}

function buildTempoReportUncached(state = {}, now = new Date(), settings = null) {
  const today = dayKey(now);
  const s = settings || state.settings || {};
  const rows = [];
  for (const decision of state.decisions || []) {
    if (!decision || decision.chosen) continue;
    const valuation = decisionValueTerms(state, decision);
    const schedule = scheduleForDecision(state, decision.id);
    const timing = evaluateDecisionTiming({ decision, valuation, schedule, now, settings: s });
    const cd3 = decisionCd3({ ratePerWeek: timing.ratePerWeek, infoPlanDays: timing.infoPlanDays, amount: timing.amount });
    const overGuardrailDays = Math.max(0, timing.ageDays - timing.guardrailDays);
    rows.push({
      decision,
      valuation,
      schedule,
      timing,
      cd3: cd3.cd3,
      durationWeeks: cd3.durationWeeks,
      debtDays: Math.max(timing.debtDays, overGuardrailDays),
      overdueByDate: timing.debtDays > 0,
      overGuardrail: overGuardrailDays > 0,
      flags: [
        timing.debtDays > 0 ? 'past decide-by' : null,
        overGuardrailDays > 0 ? 'past type guardrail' : null,
        !timing.priced ? 'unpriced' : null,
        timing.verdict === 'needs-economics' ? 'no edge recorded' : null,
        timing.verdict === 'gather-first' ? 'waiting pays' : null,
        timing.verdict === 'decide-now' ? 'waiting loses' : null,
        schedule?.status === 'proposed' ? 'proposal to arm' : null,
      ].filter(Boolean),
    });
  }
  rows.sort((a, b) => b.cd3 - a.cd3 || b.debtDays - a.debtDays || b.timing.ageDays - a.timing.ageDays);

  const totals = new Map();
  for (const row of rows) {
    if (!row.timing.priced || !row.timing.currency) continue;
    totals.set(row.timing.currency, round((totals.get(row.timing.currency) || 0) + row.timing.amount, 2));
  }
  const latency = latencyByDecisionType(state, s);
  const schedules = state.tempoSchedules || [];
  const report = {
    engineVersion: TEMPO_ENGINE_VERSION,
    generatedOn: today,
    rows,
    latency,
    totals: {
      openDecisions: rows.length,
      pricedDecisions: rows.filter((r) => r.timing.priced).length,
      unpricedDecisions: rows.filter((r) => !r.timing.priced).length,
      decisionDebt: rows.filter((r) => r.debtDays > 0).length,
      armed: schedules.filter((x) => x.status === 'armed').length,
      proposed: schedules.filter((x) => x.status === 'proposed').length,
      settled: schedules.filter((x) => x.status === 'settled').length,
      byCurrency: [...totals.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
      capacityDays: round(rows.reduce((sum, r) => sum + (r.valuation.capacityDays || 0), 0), 1),
      atStakeNow: rows.filter((r) => r.debtDays > 0 && r.timing.priced).length,
    },
    breaches: latency.rows.filter((r) => r.breach),
    waitingPays: rows.filter((r) => r.timing.verdict === 'gather-first'),
    waitingLoses: rows.filter((r) => r.timing.verdict === 'decide-now'),
    needsEconomics: rows.filter((r) => r.timing.verdict === 'needs-economics'),
  };
  report.board = tempoBrief(report);
  return report;
}

/* ------------------------------------------------------------------ */
/* Board-ready brief                                                    */
/* ------------------------------------------------------------------ */

function fmtMoney(currency, amount) {
  if (amount === null || amount === undefined) return '—';
  return `${currency || ''} ${Math.round(amount).toLocaleString('en-US')}`.trim();
}

/**
 * Deterministic board pack. No model call, no invented figures: every line is a
 * sentence about a number this report computed from recorded records.
 */
export function tempoBrief(report) {
  const totals = report?.totals || {};
  const lines = [];
  const sections = [];

  sections.push({
    heading: 'Position',
    lines: [
      `${totals.openDecisions ?? 0} open decision(s); ${totals.pricedDecisions ?? 0} priced from linked records, ${totals.unpricedDecisions ?? 0} unpriced.`,
      totals.byCurrency?.length
        ? `Value at stake: ${totals.byCurrency.map((c) => fmtMoney(c.currency, c.amount)).join(' · ')}. Currencies are never summed together.`
        : 'No decision currently has money linked to it, so delay can only be described in days.',
      `${totals.decisionDebt ?? 0} decision(s) sit past their own decide-by date or type guardrail.`,
      `${totals.armed ?? 0} armed timebox(es), ${totals.proposed ?? 0} proposal(s) awaiting a human arm, ${totals.settled ?? 0} settled.`,
    ],
  });

  const top = (report?.rows || []).slice(0, 5);
  if (top.length) {
    sections.push({
      heading: 'Highest cost of delay',
      lines: top.map((row) =>
        `${row.decision.title} — CD3 ${row.cd3}${row.timing.priced ? `, ${fmtMoney(row.timing.currency, row.timing.amount)} at stake` : ' (unpriced)'}; ${row.decisionDebt ? `${row.debtDays} day(s) of decision debt` : `decide by ${row.timing.decideBy}`}; verdict: ${row.timing.verdict}.`),
    });
  }

  if (report?.waitingPays?.length) {
    sections.push({
      heading: 'Where waiting is worth paying for',
      lines: report.waitingPays.slice(0, 3).map((row) =>
        `${row.decision.title} — the best evidence plan waits ${row.timing.bestPlan.day} days and is worth ${fmtMoney(row.timing.currency, row.timing.gainFromBestPlan)} more than deciding now (switch probability ${Math.round((row.timing.bestPlan.switchProbability ?? 0) * 100)}%).`),
    });
  }
  if (report?.waitingLoses?.length) {
    sections.push({
      heading: 'Where waiting is already losing',
      lines: report.waitingLoses.slice(0, 3).map((row) =>
        `${row.decision.title} — no remaining information is worth the carrying cost; delay is burning ${fmtMoney(row.timing.currency, row.timing.ratePerWeek)} per week.`),
    });
  }
  if (report?.latency) {
    const rows = report.latency.rows.filter((r) => r.band.sufficient);
    sections.push({
      heading: 'Measured tempo (own records)',
      lines: rows.length
        ? rows.map((r) => `${r.label}: ${r.band.n} settled call(s), median ${r.band.medianDays} days, p80 ${r.band.p80Days} days against a ${r.guardrailDays}-day guardrail${r.breach ? ' — BREACH' : ''}.`)
        : [`No decision type has ${TEMPO_MIN_SAMPLES} measured latencies yet, so no latency band is reported. ${report.latency.unmeasured} settled decision(s) are unmeasured.`],
    });
  }
  sections.push({
    heading: 'Asks of the room',
    lines: [
      ...(totals.decisionDebt ? [`Name the decision date for ${totals.decisionDebt} overdue call(s) — an unmade decision is a commitment already slipping.`] : []),
      ...(totals.proposed ? [`Arm or discard ${totals.proposed} proposed timebox(es) so the economics stop being a suggestion.`] : []),
      ...(report?.needsEconomics?.length ? [`Record the believed edge and uncertainty for ${report.needsEconomics.length} decision(s) so the option to wait can be priced instead of argued about.`] : []),
      ...(!totals.decisionDebt && !totals.proposed && !report?.needsEconomics?.length
        ? ['No tempo exceptions this period: keep the decide-by discipline and re-run after the next round of calls.']
        : []),
    ],
  });

  for (const section of sections) lines.push(`${section.heading.toUpperCase()}`, ...section.lines.map((l) => `- ${l}`), '');
  return {
    title: 'Decision tempo brief',
    generatedOn: report?.generatedOn || null,
    sections,
    text: [`# Decision tempo brief — ${report?.generatedOn || ''}`, '', ...lines].join('\n').trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Read-side signals                                                    */
/* ------------------------------------------------------------------ */

export function decisionTempoSignals(state = {}, now = new Date(), settings = null) {
  const report = buildTempoReport(state, { now, settings });
  const findings = [];
  const fmt = (row) => (row.timing.priced ? fmtMoney(row.timing.currency, row.timing.amount) : 'unpriced');

  const debt = report.rows.filter((r) => r.debtDays > 0);
  if (debt.length) {
    const worst = debt[0];
    const pricedDebt = debt.filter((r) => r.timing.priced);
    findings.push({
      ruleId: 'DLY-01',
      domain: 'Decision tempo',
      severity: pricedDebt.length ? 4 : 3,
      confidence: 'high',
      title: debt.length === 1
        ? `“${worst.decision.title}” is ${worst.debtDays} day(s) of decision debt`
        : `${debt.length} decisions are past their decide-by date`,
      detail: `Each of these has a measured carrying cost: ${debt.slice(0, 3).map((r) => `${r.decision.title} (${r.debtDays}d${r.timing.priced ? `, ${fmt(r)}` : ''})`).join('; ')}. RULE-DLY-02 opens one owned timeboxed delegation per overdue call to the recorded approver — the app does not make the call for you.`,
      evidence: [
        `Value at stake in debt: ${pricedDebt.length ? [...new Set(pricedDebt.map((r) => r.timing.currency))].map((cur) => fmtMoney(cur, pricedDebt.filter((r) => r.timing.currency === cur).reduce((s, r) => s + r.timing.amount, 0))).join(' · ') : 'no priced decision in debt'}`,
        `Carrying cost across the queue: ${report.rows.filter((r) => r.timing.priced).slice(0, 3).map((r) => `${fmtMoney(r.timing.currency, r.timing.ratePerWeek)}/wk`).join(', ') || 'not priced'}`,
      ],
      action: { label: 'Open decision tempo', route: '#/tempo' },
    });
  }

  const unarmed = report.rows.filter((r) => r.timing.priced && !r.schedule && r.cd3 > 0);
  if (unarmed.length) {
    findings.push({
      ruleId: 'DLY-02',
      domain: 'Decision tempo',
      severity: 3,
      confidence: 'medium',
      title: `${unarmed.length} priced decision(s) have no timebox`,
      detail: 'A decision with money at stake and no decide-by date cannot be late — which is exactly how it drifts. RULE-DLY-03 proposes a timebox with the derived value and the type guardrail; arming it is your call.',
      evidence: unarmed.slice(0, 3).map((r) => `${r.decision.title} — CD3 ${r.cd3}, ${fmt(r)}, age ${r.timing.ageDays}d`),
      action: { label: 'Review proposals', route: '#/tempo?tab=ledger' },
    });
  }

  const gather = report.waitingPays;
  if (gather.length) {
    const top = gather[0];
    findings.push({
      ruleId: 'DLY-03',
      domain: 'Decision tempo',
      severity: 3,
      confidence: 'medium',
      title: `Waiting is worth more than deciding now on “${top.decision.title}”`,
      detail: `Preposterior analysis puts the best evidence plan ${top.timing.bestPlan.day} days out, worth ${fmtMoney(top.timing.currency, top.timing.gainFromBestPlan)} more than deciding today after the carrying cost. EVSI is capped by EVPI, so this is an upper bound on what evidence can buy — not a reason to wait indefinitely.`,
      evidence: [
        `Switch probability at the plan: ${Math.round((top.timing.bestPlan.switchProbability ?? 0) * 100)}%`,
        `Information is worth paying for until day ${top.timing.informationHorizonDays} at the recorded ${top.timing.halfLifeDays}-day half-life`,
      ],
      action: { label: 'Open timing lab', route: '#/tempo?tab=timing' },
    });
  }

  if (report.waitingLoses.length) {
    const top = report.waitingLoses[0];
    findings.push({
      ruleId: 'DLY-04',
      domain: 'Decision tempo',
      severity: 4,
      confidence: 'high',
      title: `Delay is already the more expensive option on “${top.decision.title}”`,
      detail: `No remaining information is worth the carrying cost, so more analysis is a cost with no expected return. The model prices delay at ${fmtMoney(top.timing.currency, top.timing.ratePerWeek)} per week under the ${top.timing.profile} profile.`,
      evidence: [
        `Carrying cost to the decide-by date: ${fmtMoney(top.timing.currency, Math.max(0, (top.timing.bestPlan?.delayCost ?? 0)))}`,
        `Recorded edge ${fmtMoney(top.timing.currency, top.timing.advantage ?? 0)} against ${Math.round((top.timing.bestPlan?.switchProbability ?? 0) * 100)}% switch probability`,
      ],
      action: { label: 'Open decision tempo', route: '#/tempo?tab=timing' },
    });
  }

  for (const breach of report.breaches) {
    findings.push({
      ruleId: 'DLY-05',
      domain: 'Decision tempo',
      severity: 3,
      confidence: 'high',
      title: `${breach.label}s take longer than the ${breach.guardrailDays}-day guardrail`,
      detail: `Across ${breach.band.n} measured calls this workspace's own p80 latency is ${breach.band.p80Days} days (finite-sample coverage ≥ ${breach.band.coverageBound}). RULE-DLY-05 opens one DACI tempo-policy decision for the class; individual records are never re-timed.`,
      evidence: [`Median ${breach.band.medianDays} days`, `Coverage target ${Math.round(breach.band.coverageTarget * 100)}%`, `Guardrail ${breach.guardrailDays} days`],
      action: { label: 'Open calibration', route: '#/tempo?tab=calibration' },
    });
  }

  if (report.latency.unmeasured > 0) {
    findings.push({
      ruleId: 'DLY-06',
      domain: 'Decision tempo',
      severity: 2,
      confidence: 'high',
      title: `${report.latency.unmeasured} settled decision(s) have no measured latency`,
      detail: 'A decided record without the day the call was actually made cannot enter the latency band. LeadOS does not infer it from a later review date — that would manufacture a favourable number.',
      evidence: ['Measured latencies are stamped at the moment of the call, never reconstructed', `${report.latency.totalMeasured} measured so far`],
      action: { label: 'Open calibration', route: '#/tempo?tab=calibration' },
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Post-commit rules                                                    */
/* ------------------------------------------------------------------ */

function liteLink(draft, spec, ctx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId ||
    !targetId
  ) {
    return null;
  }
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.links.find((l) =>
    l && l.sourceType === sourceType && l.sourceId === sourceId && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (existing) return existing;
  const link = {
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  };
  draft.links.push(link);
  return link;
}

function personIdForName(draft, name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  const match = (draft.people || []).find((p) => p.status !== 'archived' && String(p.name || '').trim().toLowerCase() === target);
  return match ? match.id : null;
}

function shouldRunTempoRule(event, draft) {
  if (!event) return false;
  const declared = Array.isArray(event.rules) && event.rules.includes('decisionTempo');
  if (declared) return true;
  const type = String(event.type || '');
  return (
    type.startsWith('decision.') ||
    type.startsWith('tempo.') ||
    type.startsWith('case.') ||
    type.startsWith('budget.') ||
    type.startsWith('negotiation.') ||
    type.startsWith('dependency.') ||
    // Schema v30: a war-room event can open a DACI coalition decision; let the
    // tempo engine price/time it in the same atomic transaction.
    type.startsWith('power.') ||
    // A link is the graph edge that makes a decision priced: when one appears or
    // disappears the value at stake has changed even though no record did.
    type.startsWith('link.')
  );
}

/**
 * The post-commit rule. Registered with the store's generalized hook
 * (ADR-0008): it runs inside the same atomic transaction as the source
 * mutation, is idempotent, and never rewrites a recorded human input.
 */
export function decisionTempoRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event) return [];
  if (!shouldRunTempoRule(event, draft)) return [];
  const declared = Array.isArray(event.rules) && event.rules.includes('decisionTempo');
  if (draft.settings?.tempoAutoPropagate === false && event.force !== true && !declared) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const context = {
    ...ctx,
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const settings = draft.settings || {};
  draft.tempoSchedules = Array.isArray(draft.tempoSchedules) ? draft.tempoSchedules : [];
  const propagations = [];
  const push = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    if (context.logEvent) {
      context.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${ruleId}] ${summary}` });
    }
  };
  const decisions = draft.decisions || [];

  /* RULE-DLY-01 — settle a timebox when its decision is actually made. */
  for (const schedule of draft.tempoSchedules) {
    if (schedule.status !== 'armed' && schedule.status !== 'proposed') continue;
    const decision = decisions.find((d) => d.id === schedule.decisionId);
    if (!decision || !decision.chosen) continue;
    const decidedOn = decision.decidedOn || context.todayStr;
    const realised = daysBetween(decision.date, decidedOn);
    schedule.status = 'settled';
    schedule.settledOn = decidedOn;
    schedule.realizedLatencyDays = realised !== null && realised >= 0 ? realised : null;
    schedule.resolvedChoice = String(decision.chosen).slice(0, 200);
    schedule.updatedAt = context.nowIso;
    schedule.history = [
      ...(Array.isArray(schedule.history) ? schedule.history : []),
      {
        on: context.todayStr,
        action: 'settled',
        note: `Decision made${schedule.realizedLatencyDays !== null ? ` ${schedule.realizedLatencyDays} days after it was logged` : ''}`,
        plannedWaitDays: schedule.plannedTempoDays ?? null,
        realizedLatencyDays: schedule.realizedLatencyDays,
      },
    ].slice(-30);
    ensureTempoLinks(draft, schedule, decision, context);
    push('RULE-DLY-01', 'settled', 'tempo', schedule.id, `Settled timebox for “${decision.title}” — realised latency ${schedule.realizedLatencyDays ?? 'unmeasured'} day(s)`);
  }

  /* RULE-DLY-02 — decision debt becomes one owned, timeboxed delegation. */
  for (const schedule of draft.tempoSchedules) {
    if (schedule.status !== 'armed') continue;
    const decision = decisions.find((d) => d.id === schedule.decisionId);
    if (!decision || decision.chosen) continue;
    const decideBy = schedule.decideBy;
    if (!decideBy) continue;
    const overdue = (daysBetween(decideBy, context.todayStr) ?? 0) > 0;
    if (!overdue) continue;
    const marker = `[RULE-DLY-02:${schedule.id}]`;
    const existing = (draft.delegations || []).find((d) => String(d.support || '').includes(marker) && d.status === 'active');
    if (existing) continue;
    const ownerId = personIdForName(draft, decision.approver) || personIdForName(draft, decision.driver);
    if (!ownerId) continue; // Never invent an owner: the read-side signal still fires.
    const delegation = {
      id: context.idFactory('delegation'),
      personId: ownerId,
      title: `Bring one option to the table: ${String(decision.title).slice(0, 90)}`,
      expectedOutcome: `A recorded decision (or an explicit decision to keep waiting, with the date) by ${addDays(context.todayStr, 3)}. The timebox expired on ${decideBy}.`,
      authority: 'act-inform',
      support: `${marker} Blameless tempo recovery: the delay is a system symptom, not a personal failing. Bring the options and the trade-off, not a defence. Carrying cost at the recorded profile is ${schedule.currency || ''} ${Math.round(schedule.derivedAmount || 0).toLocaleString('en-US')} at stake.`,
      delegatedOn: context.todayStr,
      dueOn: addDays(context.todayStr, 3),
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
    };
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(delegation);
    liteLink(draft, {
      sourceType: 'decision', sourceId: decision.id,
      targetType: 'delegation', targetId: delegation.id,
      relation: 'tracks-followup', ruleId: 'RULE-DLY-02',
      summary: 'Owned tempo recovery for an overdue decision timebox',
    }, context);
    schedule.history = [
      ...(Array.isArray(schedule.history) ? schedule.history : []),
      { on: context.todayStr, action: 'debt-escalated', note: `Owned timeboxed delegation opened for ${decision.approver || decision.driver || 'the owner'}` },
    ].slice(-30);
    push('RULE-DLY-02', 'created', 'delegation', delegation.id, `Opened one tempo-recovery delegation for overdue “${decision.title}”`);
  }

  /* RULE-DLY-03 — propose (never arm) a timebox for a priced open decision. */
  for (const decision of decisions) {
    if (!decision || decision.chosen) continue;
    const existing = draft.tempoSchedules.filter((s) => s.decisionId === decision.id);
    if (existing.length) continue;
    const valuation = decisionValueTerms(draft, decision);
    if (!valuation.priced) continue;
    const classified = classifyDecisionType(decision, valuation, settings);
    const guardrail = guardrailDaysFor(classified.type, settings);
    const windowWeeks = Math.max(4, Math.round(guardrail / 7));
    const schedule = {
      id: context.idFactory('tempo'),
      decisionId: decision.id,
      status: 'proposed',
      profile: 'linear',
      currency: valuation.dominant?.currency || null,
      valueAtStakeOverride: null,
      derivedAmount: valuation.dominant?.amount ?? null,
      derivedAt: context.todayStr,
      derivedTermCount: valuation.termCount,
      delayCostPerWeek: null,
      windowWeeks,
      deadlineDays: guardrail,
      advantageAmount: null,
      uncertaintyPct: null,
      halfLifeDays: positive(settings.tempoInfoHalfLifeDays, 14),
      infoWeeks: null,
      infoCostAmount: 0,
      infoCostNote: '',
      decideBy: addDays(decision.date, guardrail) || addDays(context.todayStr, guardrail),
      plannedTempoDays: guardrail,
      decisionType: classified.type,
      notes: '',
      createdOn: context.todayStr,
      createdAt: context.nowIso,
      updatedAt: context.nowIso,
      armedOn: null,
      settledOn: null,
      abandonedOn: null,
      abandonReason: '',
      realizedLatencyDays: null,
      history: [{ on: context.todayStr, action: 'proposed', note: `Auto-proposed from ${valuation.termCount} linked record(s); ${valuation.dominant.currency} ${Math.round(valuation.dominant.amount).toLocaleString('en-US')} at stake` }],
    };
    draft.tempoSchedules.push(schedule);
    ensureTempoLinks(draft, schedule, decision, context);
    push('RULE-DLY-03', 'created', 'tempo', schedule.id, `Proposed a timebox for “${decision.title}” (${schedule.currency} ${Math.round(schedule.derivedAmount).toLocaleString('en-US')} at stake, decide by ${schedule.decideBy})`);
  }

  /* RULE-DLY-04 — refresh derived economics when linked value drifts materially. */
  for (const schedule of draft.tempoSchedules) {
    if (!['armed', 'proposed'].includes(schedule.status)) continue;
    const decision = decisions.find((d) => d.id === schedule.decisionId);
    if (!decision) continue;
    const valuation = decisionValueTerms(draft, decision);
    const next = valuation.dominant?.amount ?? null;
    const previous = positive(schedule.derivedAmount, null);
    const changedCurrency = (valuation.dominant?.currency || null) !== (schedule.currency || null);
    if (next === null && previous === null) continue;
    const drift = previous !== null && next !== null ? Math.abs(next - previous) / Math.max(previous, 1) : 1;
    if (!changedCurrency && drift <= VALUE_DRIFT_THRESHOLD) continue;
    schedule.derivedAmount = next;
    schedule.currency = changedCurrency ? valuation.dominant?.currency || null : schedule.currency;
    schedule.derivedAt = context.todayStr;
    schedule.derivedTermCount = valuation.termCount;
    schedule.updatedAt = context.nowIso;
    schedule.history = [
      ...(Array.isArray(schedule.history) ? schedule.history : []),
      {
        on: context.todayStr,
        action: 'value-refreshed',
        note: `Derived value at stake moved from ${previous === null ? 'unpriced' : Math.round(previous).toLocaleString('en-US')} to ${next === null ? 'unpriced' : Math.round(next).toLocaleString('en-US')} (${valuation.dominant?.currency || schedule.currency || 'no currency'})`,
      },
    ].slice(-30);
    push('RULE-DLY-04', 'refreshed', 'tempo', schedule.id, `Refreshed value at stake for “${decision.title}” after a material linked-record change`);
  }

  /* RULE-DLY-05 — a class-level tempo breach becomes one DACI decision.
     Class-level statistics only change when a decision record changes, so this
     scan runs on decision/tempo events and explicit scans, not on every linked
     case or budget edit. */
  const eventType = String(event.type || '');
  const classScanDue =
    declared || event.force === true || eventType.startsWith('decision.') || eventType.startsWith('tempo.');
  const latency = classScanDue ? latencyByDecisionType(draft, settings) : null;
  for (const row of latency?.rows || []) {
    if (!row.breach) continue;
    const marker = `[RULE-DLY-05:${row.type}]`;
    const open = decisions.find((d) => !d.chosen && String(d.question || '').includes(marker));
    if (open) continue;
    const decision = {
      id: context.idFactory('dec'),
      title: `Tempo policy: ${row.label.toLowerCase()}s take ${row.band.p80Days} days (guardrail ${row.guardrailDays})`.slice(0, 180),
      question: [
        `Across ${row.band.n} measured calls, this workspace's own ${row.label.toLowerCase()} latency has a median of ${row.band.medianDays} days and a distribution-free p80 of ${row.band.p80Days} days (coverage ≥ ${row.band.coverageBound}), against a ${row.guardrailDays}-day management guardrail.`,
        `RULE-DLY-05 opens this ONE class-level decision rather than re-timing individual records; every individual decide-by date stays exactly as recorded.`,
        `Triggered by ${event.type || 'a decision event'}. ${marker}`,
      ].join(' ').slice(0, 2000),
      date: context.todayStr,
      reversibility: 'reversible',
      driver: (settings.leaderName || '').slice(0, 120),
      approver: (settings.leaderName || '').slice(0, 120),
      contributors: '',
      informed: '',
      options: [
        {
          id: context.idFactory('dopt'),
          label: `Timebox this decision class at the measured p80 (${row.band.p80Days} days)`,
          pros: 'The guardrail matches observed reality, so a breach becomes informative instead of normal',
          cons: 'A p80 target accepts that one call in five will still exceed it',
        },
        {
          id: context.idFactory('dopt'),
          label: 'Delegate this decision class one level down',
          pros: 'McKinsey finds the biggest velocity gain in decisions made at the level that has the information',
          cons: 'Moves risk: the leader must define the guardrails and the escalation trigger first',
        },
        {
          id: context.idFactory('dopt'),
          label: 'Add a standing evidence plan so the wait is productive',
          pros: 'Converts drift into scheduled information; EVSI answers whether the evidence is worth its carrying cost',
          cons: 'Costs capacity and can become a reason to wait past the point where waiting pays',
        },
        {
          id: context.idFactory('dopt'),
          label: 'Accept the measured tempo and stop calling it a breach',
          pros: 'Removes a false alert and keeps the signal honest',
          cons: 'Any carrying cost keeps accruing at the recorded rate',
        },
      ],
      chosen: '',
      rationale: '',
      reviewOn: addDays(context.todayStr, settings.decisionReviewDays ?? 14),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      forecastProbability: null,
      decidedOn: null,
      createdAt: context.nowIso,
    };
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.push(decision);
    push('RULE-DLY-05', 'created', 'decision', decision.id, `Opened one DACI tempo-policy decision for ${row.label.toLowerCase()}s`);
  }

  return propagations;
}

function ensureTempoLinks(draft, schedule, decision, ctx) {
  liteLink(draft, {
    sourceType: 'decision', sourceId: decision.id,
    targetType: 'tempo', targetId: schedule.id,
    relation: 'timeboxes', ruleId: schedule.status === 'proposed' ? 'RULE-DLY-03' : 'RULE-DLY-01',
    summary: `Decision timebox (${schedule.profile}, decide by ${schedule.decideBy})`,
  }, ctx);
}

/* ------------------------------------------------------------------ */
/* Dialog defaults and routes                                           */
/* ------------------------------------------------------------------ */

/** Prefill for the arm/edit dialog — every value traceable to a record. */
export function scheduleDefaults({ decision, valuation, settings = {}, now = new Date() } = {}) {
  const classified = classifyDecisionType(decision, valuation, settings);
  const guardrail = guardrailDaysFor(classified.type, settings);
  const windowWeeks = Math.max(4, Math.round(guardrail / 7));
  const amount = positive(valuation?.dominant?.amount, null);
  return {
    decisionType: classified.type,
    typeReasons: classified.reasons,
    guardrailDays: guardrail,
    decideBy: addDays(dayKey(now), guardrail),
    profile: 'linear',
    windowWeeks,
    deadlineDays: guardrail,
    halfLifeDays: positive(settings.tempoInfoHalfLifeDays, 14),
    currency: valuation?.dominant?.currency || null,
    derivedAmount: amount,
    derivedTermCount: valuation?.termCount ?? 0,
    valueAtStakeOverride: null,
    delayCostPerWeek: null,
    advantageAmount: null,
    uncertaintyPct: null,
    infoWeeks: null,
    infoCostAmount: 0,
    infoCostNote: '',
    notes: '',
  };
}

export function tempoRoutes() {
  return {
    overview: '#/tempo',
    timing: '#/tempo?tab=timing',
    ledger: '#/tempo?tab=ledger',
    calibration: '#/tempo?tab=calibration',
    board: '#/tempo?tab=board',
  };
}
