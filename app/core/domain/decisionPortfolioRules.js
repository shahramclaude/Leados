/**
 * app/core/domain/decisionPortfolioRules.js — Post-commit automation rules
 * for the Decision Portfolio & Sequencing Engine (Schema v55; wired as a
 * live callable spine rule with RULE-DPF-04 in Schema v68).
 *
 * Rules:
 *   RULE-DPF-01  Coupling Discovery — creates `couples` typed links between
 *                newly added/modified decisions that share premises, resources,
 *                or DACI approvers with existing open decisions.
 *   RULE-DPF-02  Cascade Alert — when a decision is resolved (`chosen` set),
 *                logs a note on coupled open decisions whose sequencing rank
 *                just changed, and emits a follow-through event.
 *   RULE-DPF-03  Premise Breach Fan-Out — when a premise enters `breach` or
 *                `watch`, checks if 2+ open decisions rest on it and adds a
 *                portfolio note on each affected decision.
 *   RULE-DPF-04  Portfolio Triage — when open decisions' single-currency
 *                weekly carrying cost clears `portfolioTriageWeeklyThreshold`
 *                (default 25,000), opens at most one DACI portfolio-triage
 *                decision per currency per ISO week.
 *
 * Every rule respects `settings.portfolioAutoPropagate !== false` and uses
 * `state.portfolioMarkers` for idempotency. Pure: no DOM, no storage, no clock.
 */

import { ensureEntityLink } from './automation.js';
import { addDays, dayKey, weekKey } from '../time.js';
import {
  decisionCoupling,
  buildDecisionPortfolioReport,
  PORTFOLIO_MIN_DECISIONS,
} from './decisionPortfolio.js';

export const DPF_RULES = Object.freeze({
  COUPLING: 'RULE-DPF-01',
  CASCADE: 'RULE-DPF-02',
  PREMISE_FANOUT: 'RULE-DPF-03',
  TRIAGE: 'RULE-DPF-04',
});

export const DPF_TRIGGERS = Object.freeze([
  'decision.created',
  'decision.updated',
  'decision.decided',
  'premise.updated',
  'premise.observation.added',
  'tempo.schedule.created',
  'tempo.schedule.updated',
  'portfolio.scanned',
]);

const MAX_MARKERS = 400;
const DEFAULT_TRIAGE_WEEKLY = 25000;

function hasMarker(draft, key) {
  return Array.isArray(draft.portfolioMarkers) && draft.portfolioMarkers.includes(key);
}

function addMarker(draft, key) {
  if (!Array.isArray(draft.portfolioMarkers)) draft.portfolioMarkers = [];
  if (!draft.portfolioMarkers.includes(key)) {
    draft.portfolioMarkers.push(key);
    if (draft.portfolioMarkers.length > MAX_MARKERS) {
      draft.portfolioMarkers = draft.portfolioMarkers.slice(-MAX_MARKERS);
    }
  }
}

function defaultIdFactory(prefix = 'dpf') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function runDecisionPortfolioEffect(draft, context = {}) {
  const { event, now } = context;
  if (!draft || !event?.type) return [];
  if (!DPF_TRIGGERS.includes(event.type)) return [];
  // Explicit scans always execute; background triggers honour pause switch.
  if (draft.settings?.portfolioAutoPropagate === false && event.type !== 'portfolio.scanned') {
    return [];
  }

  const at = now instanceof Date ? now : new Date(now || Date.now());
  const todayStr = dayKey(at);
  const nowIso = at.toISOString();
  const idFactory = typeof context.idFactory === 'function' ? context.idFactory : defaultIdFactory;
  const logEvent = typeof context.logEvent === 'function' ? context.logEvent : null;
  const effects = [];

  const openDecisions = (draft.decisions || []).filter((d) => d && !d.chosen);

  // ---- RULE-DPF-01: Coupling Discovery ----
  if (
    openDecisions.length >= PORTFOLIO_MIN_DECISIONS &&
    ['decision.created', 'decision.updated', 'tempo.schedule.created', 'tempo.schedule.updated', 'portfolio.scanned'].includes(event.type)
  ) {
    const { coupling } = decisionCoupling(draft, openDecisions);
    for (const [idA, peers] of coupling) {
      for (const [idB, pair] of peers) {
        if (idA >= idB) continue; // process each pair once
        const markerKey = `dpf01:${idA}:${idB}`;
        if (hasMarker(draft, markerKey)) continue;

        const reasons = [];
        if (pair.sharedPremises.length > 0) reasons.push(`${pair.sharedPremises.length} shared premise(s)`);
        if (pair.sharedApprover) reasons.push('same approver');
        const nonPremise = pair.sharedResources.filter((r) => r.type !== 'premise');
        if (nonPremise.length > 0) reasons.push(`${nonPremise.length} shared resource(s)`);

        const linkRes = ensureEntityLink(
          draft,
          {
            sourceType: 'decision',
            sourceId: idA,
            targetType: 'decision',
            targetId: idB,
            relation: 'couples',
            ruleId: DPF_RULES.COUPLING,
            summary: `Coupled via ${reasons.join(', ')}.`,
          },
          { idFactory, todayStr, nowIso },
        );
        addMarker(draft, markerKey);
        const summary = `${DPF_RULES.COUPLING}: Linked coupled decisions "${idA}" ↔ "${idB}" (${reasons.join(', ')}).`;
        if (logEvent) {
          logEvent({ type: 'portfolio.coupled', entity: 'decision', entityId: idA, summary });
        }
        if (linkRes?.created) {
          effects.push({
            ruleId: DPF_RULES.COUPLING,
            action: 'linked',
            targetType: 'decision',
            targetId: idB,
            summary,
          });
        }
      }
    }
  }

  // ---- RULE-DPF-02: Cascade Alert on Decision Resolution ----
  if (event.type === 'decision.decided' || (event.type === 'decision.updated' && event.entityId)) {
    const resolved = (draft.decisions || []).find((d) => d.id === event.entityId && d.chosen);
    if (resolved) {
      const markerKey = `dpf02:${resolved.id}`;
      if (!hasMarker(draft, markerKey)) {
        const coupledLinks = (draft.links || []).filter(
          (l) =>
            l.relation === 'couples' &&
            ((l.sourceType === 'decision' && l.sourceId === resolved.id) ||
              (l.targetType === 'decision' && l.targetId === resolved.id)),
        );
        const affectedIds = new Set();
        for (const l of coupledLinks) {
          const peerId = l.sourceId === resolved.id ? l.targetId : l.sourceId;
          const peer = (draft.decisions || []).find((d) => d.id === peerId && !d.chosen);
          if (peer) affectedIds.add(peerId);
        }
        if (affectedIds.size > 0) {
          for (const peerId of affectedIds) {
            const peer = draft.decisions.find((d) => d.id === peerId);
            if (peer) {
              if (!Array.isArray(peer.portfolioNotes)) peer.portfolioNotes = [];
              peer.portfolioNotes.push({
                at: nowIso,
                rule: DPF_RULES.CASCADE,
                note: `Coupled decision "${resolved.title}" was resolved ("${resolved.chosen}"). Re-evaluate sequencing and shared assumptions.`,
              });
            }
          }
          addMarker(draft, markerKey);
          const summary = `${DPF_RULES.CASCADE}: "${resolved.title}" resolved — ${affectedIds.size} coupled open decision(s) notified.`;
          if (logEvent) {
            logEvent({ type: 'portfolio.cascade', entity: 'decision', entityId: resolved.id, summary });
          }
          effects.push({
            ruleId: DPF_RULES.CASCADE,
            action: 'updated',
            targetType: 'decision',
            targetId: resolved.id,
            summary,
          });
        }
      }
    }
  }

  // ---- RULE-DPF-03: Premise Breach Fan-Out ----
  if (['premise.updated', 'premise.observation.added'].includes(event.type) && event.entityId) {
    const premise = (draft.premises || []).find((p) => p.id === event.entityId);
    if (premise && (premise.status === 'breach' || premise.status === 'watch')) {
      const markerKey = `dpf03:${premise.id}:${premise.status}:${todayStr}`;
      if (!hasMarker(draft, markerKey)) {
        const restingLinks = (draft.links || []).filter(
          (l) =>
            l.relation === 'rests-on' &&
            ((l.sourceType === 'decision' && l.targetType === 'premise' && l.targetId === premise.id) ||
              (l.sourceType === 'premise' && l.sourceId === premise.id && l.targetType === 'decision')),
        );
        const restingOpenIds = [];
        for (const l of restingLinks) {
          const decId = l.sourceType === 'decision' ? l.sourceId : l.targetId;
          const dec = openDecisions.find((d) => d.id === decId);
          if (dec) restingOpenIds.push(decId);
        }
        if (restingOpenIds.length >= 2) {
          for (const decId of restingOpenIds) {
            const dec = draft.decisions.find((d) => d.id === decId);
            if (dec) {
              if (!Array.isArray(dec.portfolioNotes)) dec.portfolioNotes = [];
              dec.portfolioNotes.push({
                at: nowIso,
                rule: DPF_RULES.PREMISE_FANOUT,
                note: `Shared premise "${premise.title || premise.id}" entered ${premise.status} — ${restingOpenIds.length} open decisions rest on it.`,
              });
            }
          }
          addMarker(draft, markerKey);
          const summary = `${DPF_RULES.PREMISE_FANOUT}: Premise "${premise.title || premise.id}" (${premise.status}) affects ${restingOpenIds.length} open decisions simultaneously.`;
          if (logEvent) {
            logEvent({ type: 'portfolio.premise-fanout', entity: 'premise', entityId: premise.id, summary });
          }
          effects.push({
            ruleId: DPF_RULES.PREMISE_FANOUT,
            action: 'updated',
            targetType: 'premise',
            targetId: premise.id,
            summary,
          });
        }
      }
    }
  }

  // ---- RULE-DPF-04: Portfolio Triage Decision (per currency / ISO week) ----
  const nonTriageOpen = openDecisions.filter(
    (d) => !String(d.rationale || '').includes(`[${DPF_RULES.TRIAGE}:`),
  );
  if (
    nonTriageOpen.length >= 3 &&
    ['decision.created', 'tempo.schedule.created', 'tempo.schedule.updated', 'portfolio.scanned'].includes(event.type)
  ) {
    const threshold = Number.isFinite(Number(draft.settings?.portfolioTriageWeeklyThreshold))
      ? Math.max(1000, Number(draft.settings.portfolioTriageWeeklyThreshold))
      : DEFAULT_TRIAGE_WEEKLY;
    const report = buildDecisionPortfolioReport({ ...draft, decisions: nonTriageOpen }, at);
    const currencyRows = report.totals.currencyBreakdown?.length
      ? report.totals.currencyBreakdown
      : (report.totals.currency && report.totals.totalWeeklyDelayCost !== null
          ? [{ currency: report.totals.currency, totalWeeklyDelayCost: report.totals.totalWeeklyDelayCost }]
          : []);
    const isoWk = weekKey(at);
    const leaderName = String(draft.settings?.leaderName || 'Workspace leader').slice(0, 120);

    for (const row of currencyRows) {
      if (!row.currency || row.totalWeeklyDelayCost < threshold) continue;
      const markerKey = `${DPF_RULES.TRIAGE}:${row.currency}:${isoWk}`;
      if (hasMarker(draft, markerKey)) continue;
      addMarker(draft, markerKey);

      const topIds = report.sequencing.optimal
        .filter((e) => e.currency === row.currency)
        .slice(0, 3)
        .map((e) => e.decision.id);
      const triageId = idFactory('dec');
      const triageDecision = {
        id: triageId,
        title: `Portfolio triage: sequence ${nonTriageOpen.length} open decisions (${row.currency} ${row.totalWeeklyDelayCost.toLocaleString('en-US')}/wk)`,
        question: `Open decisions in ${row.currency} carry ${row.currency} ${row.totalWeeklyDelayCost.toLocaleString('en-US')}/week in additive delay exposure across ${report.coupling.clusters.length} coupling cluster(s). Which top CD3 calls settle this week and which unblocks wait?`,
        date: todayStr,
        reversibility: 'reversible',
        driver: leaderName,
        approver: leaderName,
        contributors: '',
        informed: '',
        options: [
          { id: idFactory('opt'), label: 'Adopt CD3 optimal sequence this week', pros: 'Minimises weighted completion delay without mixing currencies.', cons: 'Defers older low-CD3 calls explicitly.' },
          { id: idFactory('opt'), label: 'Delegate single-approver bottleneck', pros: 'Reduces approver HHI and unblocks parallel resolution.', cons: 'Requires explicit authority transfer.' },
          { id: idFactory('opt'), label: 'Hold current date-order queue', pros: 'Zero calendar disruption.', cons: 'Continues carrying sequencing regret.' },
        ],
        chosen: '',
        rationale: `Opened by [${markerKey}] because single-currency weekly carrying cost reached ${row.currency} ${row.totalWeeklyDelayCost.toLocaleString('en-US')}/week (threshold ${row.currency} ${threshold.toLocaleString('en-US')}/week). The leader chooses, never the rule.`,
        reviewOn: dayKey(addDays(at, 14)),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        decidedOn: null,
        createdAt: nowIso,
      };
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.unshift(triageDecision);

      for (const targetDecId of topIds) {
        ensureEntityLink(
          draft,
          {
            sourceType: 'decision',
            sourceId: triageId,
            targetType: 'decision',
            targetId: targetDecId,
            relation: 'couples',
            ruleId: DPF_RULES.TRIAGE,
            summary: `Included in ${row.currency} weekly portfolio triage.`,
          },
          { idFactory, todayStr, nowIso },
        );
      }

      const summary = `${DPF_RULES.TRIAGE}: Opened portfolio-triage DACI decision for ${row.currency} ${row.totalWeeklyDelayCost.toLocaleString('en-US')}/week across ${nonTriageOpen.length} open calls.`;
      if (logEvent) {
        logEvent({ type: 'portfolio.triage-opened', entity: 'decision', entityId: triageId, summary });
      }
      if (typeof context.enqueue === 'function') {
        context.enqueue({
          type: 'decision.created',
          entity: 'decision',
          entityId: triageId,
          summary,
        });
      }
      effects.push({
        ruleId: DPF_RULES.TRIAGE,
        action: 'created',
        targetType: 'decision',
        targetId: triageId,
        summary,
      });
    }
  }

  return effects;
}

/**
 * Callable post-commit rule for `postCommit.js`, with `.id`, `.triggers` and
 * `.effect` retained as properties for direct contract inspection.
 */
export function decisionPortfolioRule(draft, context = {}) {
  const effects = runDecisionPortfolioEffect(draft, context);
  return effects.map((entry) => ({
    ...entry,
    event: {
      type: 'automation.propagated',
      entity: entry.targetType || 'decision',
      entityId: entry.targetId || '',
      summary: entry.summary,
    },
  }));
}

Object.defineProperty(decisionPortfolioRule, 'name', { value: 'decision-portfolio' });
decisionPortfolioRule.id = 'decision-portfolio';
decisionPortfolioRule.triggers = DPF_TRIGGERS;
decisionPortfolioRule.effect = runDecisionPortfolioEffect;
