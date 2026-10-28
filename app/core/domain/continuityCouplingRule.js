/**
 * app/core/domain/continuityCouplingRule.js — Generalized post-commit rule
 * (`RULE-CPL-01..03`), read-side signals (`CPL-01..04`), and executive brief
 * for Continuity-Coupled Portfolio Simulation.
 *
 * Pure module: zero DOM, zero storage IO, zero network calls.
 */

import { addDays, dayKey } from '../time.js';
import { FORBIDDEN_LINK_TYPES, LINK_ENTITY_TYPES, LINK_RELATIONS } from './cases.js';
import { SUBSTITUTABILITY_LABELS } from './resilience.js';
import {
  COUPLING_ENGINE_VERSION,
  COUPLING_SLIP_WARN_DAYS,
  DEFAULT_COUPLING_MIN_FIT_PCT,
  DEFAULT_COUPLING_TAIL_DROP_PCT,
  rankHardeningInterventions,
  simulateCoupledPortfolio,
} from './continuityCoupling.js';

export const COUPLING_SCAN_EVENT = 'continuity.coupling.scan';

export const COUPLING_RULE_IDS = Object.freeze({
  MIRAGE_DECISION: 'RULE-CPL-01',
  STEWARD_RELIEF: 'RULE-CPL-02',
  SIGNALS: 'RULE-CPL-03',
});

export const COUPLING_RULES = Object.freeze([
  {
    id: COUPLING_RULE_IDS.MIRAGE_DECISION,
    name: 'Fair-weather capacity mirage → DACI continuity-delivery tradeoff decision',
    framework: 'Simchi-Levi (2015) TTS/TTR · Goldratt (1997) Critical Chain · Rockafellar & Uryasev (2000) CVaR · Intuit DACI',
    trigger: 'dependency.* / portfolio.* / person.archived / person.restored / continuity.coupling.scan',
    targetModule: 'decisions / tempoSchedules / links',
    description: 'When uncoupled Monte Carlo shows >= 50% horizon fit while continuity shocks drop coupled fit below the guardrail (or widen P80 completion by >= 7d), opens one idempotent DACI decision comparing top dependency hardening, dual-hat steward relief, scope carve-out, or explicit tail-risk acceptance — chaining into RULE-DLY-03 to attach a priced CD3 timebox in the same transaction.',
  },
  {
    id: COUPLING_RULE_IDS.STEWARD_RELIEF,
    name: 'Dual-hat steward contention → blameless relief delegation & 1:1 prompt',
    framework: 'Hopp & Spearman (2011) Preemptive Outage Queueing · Avelino (2016) Bus Factor · Edmondson (1999) Psychological Safety',
    trigger: 'dependency.* / portfolio.* / person.archived / person.restored / continuity.coupling.scan',
    targetModule: 'delegations / people (1:1 talking points) / links',
    description: 'When one teammate simultaneously owns funded portfolio work and stewards shock-exposed dependencies such that coupled overload probability jumps by >= 15pp to >= 50%, opens one idempotent, blameless relief delegation and 1:1 prompt without evicting employee-queued topics.',
  },
  {
    id: COUPLING_RULE_IDS.SIGNALS,
    name: 'Read-side coupled continuity-delivery signals & abstention disclosures',
    framework: 'Common Random Numbers (Law, 2014) · Vovk (2005) Split-Conformal Drill Uplift · Epistemic Missingness Discipline',
    trigger: 'render (write-free)',
    targetModule: 'insights / today / capacity / scenarios / resilience / prep',
    description: 'Surfaces CPL-01..04 signals including fair-weather mirages, dual-hat steward contention, dual-dividend hardening levers, and unmodeled critical dependencies missing disruption probabilities.',
  },
]);

const TRIGGER_EVENTS = new Set([
  COUPLING_SCAN_EVENT,
  'resilience.scan',
  'scenario.committed',
  'dependency.created',
  'dependency.updated',
  'dependency.drillRecorded',
  'dependency.retired',
  'portfolio.created',
  'portfolio.updated',
  'portfolio.decision',
  'portfolio.completed',
  'portfolio.released',
  'portfolio.deleted',
  'person.archived',
  'person.restored',
]);

function pct(prob) {
  return Number.isFinite(prob) ? `${Math.round(prob * 100)}%` : '—';
}

function money(currency, amount) {
  if (!Number.isFinite(amount)) return '—';
  return `${currency || 'USD'} ${Math.round(amount).toLocaleString('en-US')}`;
}

function ensureEntityLink(draft, spec, ctx) {
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
  const existing = draft.links.find(
    (l) =>
      l &&
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.targetType === targetType &&
      l.targetId === targetId &&
      l.relation === relation,
  );
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

function syncDualHatTalkingPoint(person, stewardRow, active) {
  if (!person) return false;
  const tag = `[CPL:${person.id}]`;
  const current = Array.isArray(person.talkingPoints) ? person.talkingPoints.slice() : [];
  const hasIdx = current.findIndex((line) => String(line || '').includes(tag));
  if (active) {
    if (hasIdx >= 0 || current.length >= 12) return false;
    const depNames = stewardRow.stewardedShockDeps.slice(0, 2).map((d) => d.name).join(', ');
    const line = `${tag} Protect focus vs on-call recovery (${depNames}): coupled overload risk jumps ${pct(stewardRow.fairOverloadProb)} → ${pct(stewardRow.coupledOverloadProb)}.`.slice(0, 200);
    person.talkingPoints = [...current, line];
    return true;
  }
  if (hasIdx >= 0) {
    person.talkingPoints = current.filter((_, i) => i !== hasIdx);
    return true;
  }
  return false;
}

/**
 * Generalized post-commit rule registered in `DEFAULT_POST_COMMIT_RULES`
 * after `resilienceRule` and before `decisionTempoRule`.
 */
export function continuityCouplingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || !TRIGGER_EVENTS.has(event.type)) return [];

  const force = ctx.force === true || event.force === true || event.type === COUPLING_SCAN_EVENT;
  const s = draft.settings || {};
  if (!force) {
    if (s.couplingAutoPropagate === false) return [];
    if (String(event.type).startsWith('dependency.') && s.resilienceAutoPropagate === false) return [];
  }

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const linkCtx = { idFactory, todayStr, nowIso };
  const trials = Math.min(400, Math.max(200, Number(s.simulationTrials) || 400));

  const coupled = simulateCoupledPortfolio(draft, { now, trials });
  const propagations = [];
  const push = (ruleId, action, targetType, targetId, summary) => {
    propagations.push({ ruleId, action, targetType, targetId, summary });
    ctx.logEvent?.({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  };

  // Clean up resolved dual-hat talking points even if coupling no longer triggers
  const contendedById = new Map(
    (coupled.dualHatStewards || []).filter((r) => r.contended).map((r) => [r.personId, r]),
  );
  for (const person of draft.people || []) {
    if (!person || person.status === 'archived') continue;
    if (!contendedById.has(person.id)) {
      if (syncDualHatTalkingPoint(person, null, false)) {
        push(COUPLING_RULE_IDS.STEWARD_RELIEF, 'cleaned', 'person', person.id, `Cleared resolved dual-hat contention prompt for ${person.name}`);
      }
    }
  }

  if (!coupled.available || !coupled.shocksModeled) return propagations;

  /* ---- RULE-CPL-01: Fair-weather mirage -> DACI Continuity-Delivery Decision ---- */
  if (coupled.fairWeatherMirage) {
    const marker = `[${COUPLING_RULE_IDS.MIRAGE_DECISION}]`;
    const openExisting = (draft.decisions || []).find(
      (d) => d && !d.chosen && String(d.question || '').includes(marker),
    );
    if (!openExisting) {
      const ranked = rankHardeningInterventions(draft, { now, trials });
      const topLever = ranked.interventions[0] || null;
      const topFunded = (draft.portfolio || []).find(
        (p) => p && p.status === 'open' && p.decision === 'funded' && p.kind !== 'capacity-reserve',
      ) || null;
      const curEntries = Object.entries(coupled.tailLossByCurrency || {});
      const tailLine = curEntries.length
        ? curEntries.map(([cur, t]) => `${cur}: VaR90 ${money(cur, t.var90)}, CVaR90 ${money(cur, t.cvar90)}`).join(' · ')
        : 'No priced daily shortfall exposure recorded on shock-active dependencies.';
      const calLine = coupled.calibrationMode === 'empirical-drill-bootstrap'
        ? `Empirical bootstrap & split-conformal calibration over n=${coupled.drillSampleCount} continuity drills (conformal 80% upper ×${coupled.conformalUpperMultiplier ?? '—'}).`
        : `Declared point TTRs (n=${coupled.drillSampleCount}/${coupled.drillMinSamples} drills; no synthetic spread invented).`;
      const leverText = topLever
        ? `Harden “${topLever.dependencyName}” (${SUBSTITUTABILITY_LABELS[topLever.currentMode] || topLever.currentMode} → ${SUBSTITUTABILITY_LABELS[topLever.targetMode] || topLever.targetMode})`
        : 'Harden highest-exposure continuity dependency';
      const leverPros = topLever
        ? `Paired CRN lift: +${topLever.fitGainPp}pp horizon fit, ${topLever.p80DaysSaved}d faster P80${topLever.netAnnualBenefit !== null ? `, net annual benefit ${money(topLever.currency, topLever.netAnnualBenefit)}` : ''}.`
        : 'Reduces propagated outage duration and emergency steward diversion.';

      const question = [
        `${marker} Fair-weather Monte Carlo shows ${pct(coupled.fairWeather.horizonFitProbability)} horizon fit (P80 ${coupled.fairWeather.p80Date}), but continuity shocks drop all-weather fit to ${pct(coupled.allWeather.horizonFitProbability)} (−${coupled.delta.fitDropPp}pp; coupled P80 ${coupled.allWeather.p80Date}, +${coupled.delta.p80SlipDays}d slip; P80 diverted ${coupled.delta.p80DivertedDays}d).`,
        `Horizon disruption tail loss: ${tailLine}`,
        `Calibration basis: ${calLine}${coupled.unmodeledCriticalDeps.length ? ` Omitted ${coupled.unmodeledCriticalDeps.length} critical/important dependency(ies) missing failure probability or TTR.` : ''}`,
      ].join('\n\n').slice(0, 1950);

      const decision = {
        id: idFactory('dec'),
        title: `Resolve continuity-capacity mirage (${pct(coupled.fairWeather.horizonFitProbability)} → ${pct(coupled.allWeather.horizonFitProbability)} fit)`.slice(0, 200),
        question,
        date: todayStr,
        chosen: '',
        rationale: '',
        driver: String(s.leaderName || '').slice(0, 120),
        approver: String(s.leaderName || '').slice(0, 120),
        contributors: '',
        informed: '',
        options: [
          {
            id: idFactory('dopt'),
            label: leverText.slice(0, 280),
            pros: leverPros.slice(0, 950),
            cons: topLever?.mitigationCost !== null && topLever?.mitigationCost !== undefined
              ? `Requires ${money(topLever.currency, topLever.mitigationCost)} redundancy investment${topLever.gatekeeperWarning ? ' and external vendor/gatekeeper alignment' : ''}.`
              : 'Consumes near-term engineering/vendor setup effort.',
          },
          {
            id: idFactory('dopt'),
            label: `De-scope or defer ~${Math.max(1, Math.ceil(coupled.delta.p80DivertedDays || 2))} person-days of marginal funded scope`,
            pros: 'Restores explicit all-weather slack without immediate vendor spend.',
            cons: 'Delivers less planned scope in the current planning horizon.',
          },
          {
            id: idFactory('dopt'),
            label: 'Decouple dual-hat stewards from primary incident recovery rotation',
            pros: 'Protects Critical-Chain bottleneck owners from preemptive outage starvation.',
            cons: 'Requires cross-training and verified shadow handover first.',
          },
          {
            id: idFactory('dopt'),
            label: 'Accept coupled schedule & CVaR90 tail risk for this horizon',
            pros: 'Zero immediate scope or spend change.',
            cons: `Retains ${pct(coupled.allWeather.overloadProbability)} all-weather overload probability; review at horizon close.`,
          },
        ],
        reviewOn: addDays(todayStr, s.decisionReviewDays ?? 14),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        decidedOn: null,
        reversibility: 'reversible',
        createdAt: nowIso,
      };
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.push(decision);

      if (topLever) {
        ensureEntityLink(draft, {
          sourceType: 'dependency',
          sourceId: topLever.dependencyId,
          targetType: 'decision',
          targetId: decision.id,
          relation: 'decides',
          ruleId: COUPLING_RULE_IDS.MIRAGE_DECISION,
          summary: `Top continuity shock driver (+${topLever.fitGainPp}pp fit if hardened)`,
        }, linkCtx);
      }
      if (topFunded) {
        ensureEntityLink(draft, {
          sourceType: 'portfolio',
          sourceId: topFunded.id,
          targetType: 'decision',
          targetId: decision.id,
          relation: 'decides',
          ruleId: COUPLING_RULE_IDS.MIRAGE_DECISION,
          summary: 'Operating-plan commitment exposed to continuity shock drag',
        }, linkCtx);
      }
      push(
        COUPLING_RULE_IDS.MIRAGE_DECISION,
        'created',
        'decision',
        decision.id,
        `Opened DACI continuity-delivery tradeoff decision (${pct(coupled.fairWeather.horizonFitProbability)} fair-weather vs ${pct(coupled.allWeather.horizonFitProbability)} all-weather fit)`,
      );
    }
  }

  /* ---- RULE-CPL-02: Dual-hat steward contention -> Delegation + 1:1 Prompt ---- */
  for (const row of coupled.dualHatStewards || []) {
    if (!row.contended) continue;
    const person = (draft.people || []).find((p) => p && p.id === row.personId && p.status !== 'archived');
    if (!person) continue;

    if (syncDualHatTalkingPoint(person, row, true)) {
      push(
        COUPLING_RULE_IDS.STEWARD_RELIEF,
        'coached',
        'person',
        person.id,
        `Queued blameless dual-hat contention 1:1 prompt for ${person.name}`,
      );
    }

    const marker = `[${COUPLING_RULE_IDS.STEWARD_RELIEF}:${person.id}]`;
    const existingDel = (draft.delegations || []).find(
      (d) => d && d.status === 'active' && String(d.support || '').includes(marker),
    );
    if (!existingDel) {
      const topDep = row.stewardedShockDeps[0];
      const delegation = {
        id: idFactory('delegation'),
        personId: person.id,
        title: `Separate sprint critical-path & primary recovery rotation (${person.name})`.slice(0, 180),
        expectedOutcome: `Name an on-call recovery backup or rebalance funded scope so ${person.name} is not simultaneously bottlenecking funded delivery and sole/primary recovery on ${row.stewardedShockDeps.map((d) => d.name).join(', ')}.`.slice(0, 1200),
        authority: 'recommend',
        support: `${marker} Blameless dual-hat load protection: coupled overload risk jumps ${pct(row.fairOverloadProb)} → ${pct(row.coupledOverloadProb)} under continuity shocks. Structural staffing guardrail, never a performance rating.`,
        delegatedOn: todayStr,
        dueOn: addDays(todayStr, 10),
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.push(delegation);

      ensureEntityLink(draft, {
        sourceType: 'delegation',
        targetType: 'person',
        sourceId: delegation.id,
        targetId: person.id,
        relation: 'coaches',
        ruleId: COUPLING_RULE_IDS.STEWARD_RELIEF,
        summary: 'Blameless dual-hat delivery × recovery protection',
      }, linkCtx);
      if (topDep) {
        ensureEntityLink(draft, {
          sourceType: 'dependency',
          sourceId: topDep.id,
          targetType: 'delegation',
          targetId: delegation.id,
          relation: 'mitigates',
          ruleId: COUPLING_RULE_IDS.STEWARD_RELIEF,
          summary: `Dual-hat recovery contention on “${topDep.name}”`,
        }, linkCtx);
      }
      push(
        COUPLING_RULE_IDS.STEWARD_RELIEF,
        'created',
        'delegation',
        delegation.id,
        `Opened blameless dual-hat relief delegation for ${person.name}`,
      );
    }
  }

  return propagations;
}

/**
 * Read-side explainable signals (`CPL-01..04`) for `#/insights` & `#/today`.
 */
export function continuityCouplingSignals(state = {}, now = new Date()) {
  if (!(state?.portfolio || []).length || !(state?.dependencies || []).some((d) => d && d.status !== 'retired')) {
    return [];
  }
  const trials = Math.min(400, Math.max(200, Number(state?.settings?.simulationTrials) || 400));
  const coupled = simulateCoupledPortfolio(state, { now, trials });
  if (!coupled.available) return [];

  const findings = [];
  const ranked = coupled.shocksModeled
    ? rankHardeningInterventions(state, { now, trials: Math.min(350, trials) })
    : { interventions: [] };
  const topLever = ranked.interventions[0] || null;

  if (coupled.fairWeatherMirage) {
    findings.push({
      id: 'cpl-mirage',
      ruleId: 'CPL-01',
      domain: 'Continuity coupling',
      severity: coupled.allWeather.horizonFitProbability < 0.35 || coupled.delta.p80SlipDays >= 14 ? 4 : 3,
      confidence: coupled.calibrationMode === 'empirical-drill-bootstrap' ? 'high' : 'medium',
      title: `Fair-weather mirage: continuity shocks cut plan fit from ${pct(coupled.fairWeather.horizonFitProbability)} to ${pct(coupled.allWeather.horizonFitProbability)}`,
      detail: `Uncoupled Monte Carlo assumes zero vendor/service outages. Coupling ${coupled.modeledDependencyCount} shock-active dependency(ies) shifts P80 finish by +${coupled.delta.p80SlipDays}d (${coupled.fairWeather.p80Date} → ${coupled.allWeather.p80Date}) and diverts ${coupled.delta.p80DivertedDays}d at P80.${topLever ? ` Top lever: hardening “${topLever.dependencyName}” recovers +${topLever.fitGainPp}pp fit.` : ''}`,
      evidence: [
        `Fair-weather fit ${pct(coupled.fairWeather.horizonFitProbability)} vs all-weather ${pct(coupled.allWeather.horizonFitProbability)} (−${coupled.delta.fitDropPp}pp)`,
        `Horizon shock arrival probability ${pct(coupled.shockTrialProbability)} across ${coupled.trials} CRN trials`,
        coupled.calibrationMode === 'empirical-drill-bootstrap'
          ? `Calibrated on n=${coupled.drillSampleCount} continuity drills`
          : `Declared point TTRs (n=${coupled.drillSampleCount}/${coupled.drillMinSamples} drills)`,
      ],
      action: { label: 'Inspect all-weather plan', route: '#/capacity' },
    });
  }

  for (const row of coupled.dualHatStewards || []) {
    if (!row.contended) continue;
    findings.push({
      id: `cpl-dualhat-${row.personId}`,
      ruleId: 'CPL-02',
      domain: 'Continuity coupling',
      personId: row.personId,
      personName: row.name,
      severity: row.soleStewardCount > 0 ? 3 : 2,
      confidence: 'high',
      title: `${row.name} carries dual-hat delivery & incident recovery contention (${pct(row.fairOverloadProb)} → ${pct(row.coupledOverloadProb)} overload)`,
      detail: `${row.name} owns ${row.ownedItemCount} committed plan item(s) while stewarding ${row.stewardedShockDeps.map((d) => d.name).join(', ')}. An unplanned outage starves their Critical-Chain path immediately.`,
      evidence: [
        `Fair-weather overload ${pct(row.fairOverloadProb)} vs all-weather ${pct(row.coupledOverloadProb)} (+${Math.round(row.overloadJumpProb * 100)}pp)`,
        `${row.soleStewardCount} Bus-Factor-1 node(s); mean ${row.meanDivertedDays}d diverted`,
      ],
      action: { label: 'Open 1:1 prep', route: `#/prep/${encodeURIComponent(row.personId)}` },
    });
  }

  if (coupled.unmodeledCriticalDeps.length > 0) {
    findings.push({
      id: 'cpl-unmodeled',
      ruleId: 'CPL-03',
      domain: 'Continuity coupling',
      severity: 2,
      confidence: 'high',
      title: `${coupled.unmodeledCriticalDeps.length} critical/important dependency(ies) omitted from coupled shock simulation`,
      detail: `Active nodes (${coupled.unmodeledCriticalDeps.slice(0, 3).map((d) => d.name).join(', ')}) lack an annual disruption probability or recovery duration. LeadOS excludes them rather than pretending they have 0% failure risk — all-weather tail risk is understated until recorded.`,
      evidence: coupled.unmodeledCriticalDeps.slice(0, 4).map((d) => `${d.name} (${d.criticality}: ${d.reason === 'missing-probability' ? 'no annualFailureProb' : 'no TTR'})`),
      action: { label: 'Record continuity inputs', route: '#/resilience' },
    });
  }

  const dualDividend = ranked.interventions.find((i) => i.dualDividend);
  if (dualDividend) {
    findings.push({
      id: `cpl-dividend-${dualDividend.dependencyId}`,
      ruleId: 'CPL-04',
      domain: 'Continuity coupling',
      severity: 2,
      confidence: coupled.calibrationMode === 'empirical-drill-bootstrap' ? 'high' : 'medium',
      title: `Dual-dividend hardening on “${dualDividend.dependencyName}”: +${dualDividend.fitGainPp}pp plan fit & positive ROI`,
      detail: `Upgrading “${dualDividend.dependencyName}” to ${SUBSTITUTABILITY_LABELS[dualDividend.targetMode] || dualDividend.targetMode} saves ${dualDividend.p80DaysSaved}d at P80 and yields ${money(dualDividend.currency, dualDividend.netAnnualBenefit)} expected net annual benefit.`,
      evidence: [
        `Schedule lift: +${dualDividend.fitGainPp}pp fit · −${dualDividend.p80DaysSaved}d P80`,
        dualDividend.cvar90Reduction !== null ? `Horizon CVaR90 reduction: ${money(dualDividend.currency, dualDividend.cvar90Reduction)}` : 'Unpriced daily impact',
      ],
      action: { label: 'Test in scenario lab', route: `#/scenarios?hardenDep=${encodeURIComponent(dualDividend.dependencyId)}` },
    });
  }

  return findings;
}

/**
 * Deterministic board/executive brief for Continuity-Coupled Delivery.
 */
export function buildContinuityCouplingBrief(state = {}, now = new Date()) {
  const coupled = simulateCoupledPortfolio(state, { now });
  if (!coupled.available) {
    return `# All-Weather Continuity × Capacity Brief (${dayKey(now)})\n\n${coupled.reason}\n`;
  }
  const ranked = rankHardeningInterventions(state, { now, seed: coupled.seed });
  const lines = [
    `# All-Weather Continuity × Capacity Brief (${dayKey(now)})`,
    `Engine: ${COUPLING_ENGINE_VERSION} · Seed ${coupled.seed} · ${coupled.trials} Common-Random-Number trials · Horizon ${coupled.horizonWeeks}w`,
    '',
    '## 1. Fair-Weather vs All-Weather Delivery Posture',
    `- Fair-weather horizon fit: ${pct(coupled.fairWeather.horizonFitProbability)} (P80 ${coupled.fairWeather.p80Date})`,
    `- All-weather coupled fit: ${pct(coupled.allWeather.horizonFitProbability)} (P80 ${coupled.allWeather.p80Date}, +${coupled.delta.p80SlipDays}d slip, −${coupled.delta.fitDropPp}pp fit)`,
    `- Horizon shock probability: ${pct(coupled.shockTrialProbability)} across ${coupled.modeledDependencyCount}/${coupled.activeDependencyCount} active dependencies`,
    `- Disruption diversion: mean ${coupled.delta.expectedDivertedDays}d · P80 ${coupled.delta.p80DivertedDays}d · CVaR90 ${coupled.delta.cvar90DivertedDays}d`,
    `- Drill calibration: ${coupled.calibrationMode === 'empirical-drill-bootstrap' ? `Empirical bootstrap (n=${coupled.drillSampleCount} drills)` : `Declared point TTRs (n=${coupled.drillSampleCount}/${coupled.drillMinSamples} drills — uncalibrated spread)`}`,
  ];
  if (coupled.unmodeledCriticalDeps.length) {
    lines.push(`- Honesty note: ${coupled.unmodeledCriticalDeps.length} critical/important dependency(ies) omitted due to missing probability/TTR (${coupled.unmodeledCriticalDeps.map((d) => d.name).join(', ')}).`);
  }
  const curEntries = Object.entries(coupled.tailLossByCurrency || {});
  if (curEntries.length) {
    lines.push('', '## 2. Coherent Horizon Disruption Loss (Per Currency, Unsummed)');
    for (const [cur, t] of curEntries) {
      lines.push(`- ${cur}: Mean ${money(cur, t.mean)} · VaR90 ${money(cur, t.var90)} · CVaR90 (Expected Shortfall) ${money(cur, t.cvar90)}`);
    }
  }
  if (ranked.interventions.length) {
    lines.push('', '## 3. Ranked Resilience-to-Delivery Hardening Frontier');
    for (const inv of ranked.interventions.slice(0, 5)) {
      lines.push(
        `- ${inv.dependencyName} (${inv.currentMode} → ${inv.targetMode}): +${inv.fitGainPp}pp fit, −${inv.p80DaysSaved}d P80${inv.cvar90Reduction !== null ? `, −${money(inv.currency, inv.cvar90Reduction)} CVaR90` : ''}${inv.netAnnualBenefit !== null ? `, net annual benefit ${money(inv.currency, inv.netAnnualBenefit)}` : ''}${inv.dualDividend ? ' [DUAL DIVIDEND]' : ''}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export { DEFAULT_COUPLING_MIN_FIT_PCT, DEFAULT_COUPLING_TAIL_DROP_PCT };
