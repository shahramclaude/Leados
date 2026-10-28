/**
 * app/core/domain/scenarios.js — Non-Persisted Counterfactual Scenario
 * Sandboxing, Brooks's Law Ramp Physics, Pareto Frontier Dominance &
 * One-at-a-Time (OAT) Tornado Sensitivity Analysis.
 *
 * Synthesizes eight cross-domain analytical frameworks around an immutable
 * in-memory projection of the workspace (`structuredClone`), guaranteeing zero
 * mutation of live storage or the append-only audit log until the leader
 * explicitly records a DACI decision or commits chosen levers:
 *
 *  1. Leadership & Management — Argyris & Schön (1978) Double-Loop Learning
 *     (testing governing parameters like operational reserve %, WIP limits, and
 *     pod boundaries), Gary Klein (2007) Pre-Mortem Counterfactuals, and Heath
 *     & Heath (2013) Multitracking (comparing multiple concrete options rather
 *     than narrow yes/no framing).
 *  2. Engineering & Systems — Donella Meadows (2008) Leverage Points and Fred
 *     Brooks (1975) Brooks's Law (*The Mythical Man-Month*): adding a hire into
 *     an active horizon contributes prorated Watkins ramp supply while
 *     consuming tenured-team onboarding/mentoring drag (`mentoringDragDays`),
 *     exposing when late hires slow near-term delivery.
 *  3. Economics — Vilfredo Pareto (1906) Multi-Objective Pareto Dominance
 *     (classifying scenarios along the reliability–speed–value frontier and
 *     flagging dominated options) and Samuelson marginal shadow pricing of
 *     scarce allocatable person-days.
 *  4. Strategy & MBA — Paul Schoemaker (1995) Strategic Scenario Planning and
 *     Donald Reinertsen (2009) Cost of Delay Divided by Duration (CD3) scope
 *     rebalancing.
 *  5. Finance & Investment — Multi-ledger Risk-Adjusted Net Value coupling
 *     funded portfolio EV, operational case residual expected loss + mitigation
 *     outlay, coupled Org-Change J-curve P50 horizon net benefit, and open
 *     requisition vacancy cost.
 *  6. Political Science — George Tsebelis (2002) Veto Players and Kurt Lewin
 *     (1951) Force-Field barrier mitigation coupled into J-curve feasibility.
 *  7. Mathematics & Statistics — Ronald Howard (1988) One-at-a-Time (OAT)
 *     Tornado Sensitivity analysis and Law & Kelton (2000) Common Random
 *     Numbers (CRN) variance reduction (driving Baseline and every scenario
 *     from the identical PRNG seed so deltas isolate causal levers).
 *  8. Production & Operations — John Kingman (1961) heavy-traffic queue-delay
 *     nonlinearity and AIAG-VDA FMEA mitigation reserve release.
 *
 * Pure module: no DOM, no storage, no network, no wall-clock globals.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import {
  PORTFOLIO_DECISIONS,
  capacitySummary,
  pertTriple,
} from './capacity.js';
import {
  casesRollup,
  isCaseOpen,
} from './cases.js';
import {
  changesRollup,
  isChangeOpen,
} from './changes.js';
import {
  hiringSummary,
} from './hiring.js';
import {
  DEFAULT_SIMULATION_SEED,
  DEFAULT_SIMULATION_TRIALS,
  hashSeed,
  simulateJointWorkspace,
} from './simulation.js';

export const DEFAULT_MENTORING_DRAG_DAYS = 3;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function primaryCurrencyOf(state) {
  const counts = new Map();
  const bump = (cur) => {
    const c = String(cur || '').trim().toUpperCase();
    if (!c) return;
    counts.set(c, (counts.get(c) || 0) + 1);
  };
  for (const item of state?.portfolio || []) bump(item?.currency);
  for (const c of state?.cases || []) bump(c?.economics?.currency);
  for (const chg of state?.changes || []) bump(chg?.economics?.currency);
  for (const req of state?.requisitions || []) bump(req?.dailyVacancyCost?.currency || req?.currency);
  let best = 'USD';
  let bestCount = 0;
  for (const [cur, cnt] of counts.entries()) {
    if (cnt > bestCount) {
      best = cur;
      bestCount = cnt;
    }
  }
  return best;
}

/**
 * Count how many active counterfactual levers are configured in a scenario spec.
 */
export function countScenarioLevers(spec = {}) {
  const levers = spec?.levers || {};
  let count = 0;
  if (Array.isArray(levers.portfolioDecisions)) count += levers.portfolioDecisions.length;
  if (Array.isArray(levers.hypotheticalItems)) count += levers.hypotheticalItems.length;
  if (levers.settingsPatch && typeof levers.settingsPatch === 'object') {
    count += Object.keys(levers.settingsPatch).filter((k) => levers.settingsPatch[k] !== undefined && levers.settingsPatch[k] !== null).length;
  }
  if (Array.isArray(levers.caseMitigations)) count += levers.caseMitigations.length;
  if (Array.isArray(levers.changeActions)) count += levers.changeActions.length;
  if (Array.isArray(levers.hiringActions)) count += levers.hiringActions.length;
  if (Number.isFinite(Number(levers.absenceCount)) && Number(levers.absenceCount) > 0) count += 1;
  return count;
}

/**
 * Project an immutable in-memory counterfactual state from `baseState` and
 * `scenarioSpec`. Never mutates `baseState` or any nested object inside it.
 *
 * Returns `{ state, appliedLevers, brooksDiagnostics }`.
 */
export function projectScenarioState(baseState, scenarioSpec = {}, { now = new Date() } = {}) {
  const draft = structuredClone(baseState || {});
  draft.settings = { ...(draft.settings || {}) };
  draft.people = Array.isArray(draft.people) ? draft.people : [];
  draft.onboarding = Array.isArray(draft.onboarding) ? draft.onboarding : [];
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  draft.cases = Array.isArray(draft.cases) ? draft.cases : [];
  draft.changes = Array.isArray(draft.changes) ? draft.changes : [];
  draft.requisitions = Array.isArray(draft.requisitions) ? draft.requisitions : [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  const today = dayKey(now);
  const levers = scenarioSpec?.levers || {};
  const appliedLevers = [];
  const brooksDiagnostics = [];

  // 1. Settings / Double-Loop Operating Physics Patch
  if (levers.settingsPatch && typeof levers.settingsPatch === 'object') {
    const sp = levers.settingsPatch;
    if (sp.operationalLoadPct !== undefined && sp.operationalLoadPct !== null) {
      const nextVal = clamp(Math.round(Number(sp.operationalLoadPct)), 0, 80, draft.settings.operationalLoadPct ?? 20);
      if (nextVal !== (draft.settings.operationalLoadPct ?? 20)) {
        appliedLevers.push({
          kind: 'settings',
          targetId: 'operationalLoadPct',
          summary: `Operational interrupt reserve ${draft.settings.operationalLoadPct ?? 20}% → ${nextVal}%`,
        });
        draft.settings.operationalLoadPct = nextVal;
      }
    }
    if (sp.planningHorizonWeeks !== undefined && sp.planningHorizonWeeks !== null) {
      const nextVal = clamp(Math.round(Number(sp.planningHorizonWeeks)), 1, 26, draft.settings.planningHorizonWeeks ?? 4);
      if (nextVal !== (draft.settings.planningHorizonWeeks ?? 4)) {
        appliedLevers.push({
          kind: 'settings',
          targetId: 'planningHorizonWeeks',
          summary: `Planning horizon ${draft.settings.planningHorizonWeeks ?? 4}w → ${nextVal}w`,
        });
        draft.settings.planningHorizonWeeks = nextVal;
      }
    }
    if (sp.capacityHoursPerWeek !== undefined && sp.capacityHoursPerWeek !== null) {
      const nextVal = clamp(Math.round(Number(sp.capacityHoursPerWeek)), 4, 60, draft.settings.capacityHoursPerWeek ?? 32);
      if (nextVal !== (draft.settings.capacityHoursPerWeek ?? 32)) {
        appliedLevers.push({
          kind: 'settings',
          targetId: 'capacityHoursPerWeek',
          summary: `Focused hours/person ${draft.settings.capacityHoursPerWeek ?? 32}h → ${nextVal}h/wk`,
        });
        draft.settings.capacityHoursPerWeek = nextVal;
      }
    }
    if (sp.wipLimitPerPerson !== undefined && sp.wipLimitPerPerson !== null) {
      const nextVal = clamp(Math.round(Number(sp.wipLimitPerPerson)), 1, 12, draft.settings.wipLimitPerPerson ?? 2);
      if (nextVal !== (draft.settings.wipLimitPerPerson ?? 2)) {
        appliedLevers.push({
          kind: 'settings',
          targetId: 'wipLimitPerPerson',
          summary: `WIP limit/person ${draft.settings.wipLimitPerPerson ?? 2} → ${nextVal}`,
        });
        draft.settings.wipLimitPerPerson = nextVal;
      }
    }
  }

  // 2. Portfolio Funding, Ownership Reassignment & Scope Scaling Levers
  if (Array.isArray(levers.portfolioDecisions)) {
    for (const pd of levers.portfolioDecisions) {
      if (!pd || !pd.itemId) continue;
      const item = draft.portfolio.find((i) => i && i.id === pd.itemId);
      if (!item) continue;
      const changes = [];
      if (pd.decision && PORTFOLIO_DECISIONS.includes(pd.decision) && pd.decision !== item.decision) {
        changes.push(`decision ${item.decision} → ${pd.decision}`);
        item.decision = pd.decision;
        item.decisionOn = today;
      }
      if (pd.ownerId !== undefined) {
        const nextOwner = pd.ownerId ? String(pd.ownerId) : null;
        if (nextOwner !== (item.ownerId || null)) {
          const nextName = nextOwner
            ? draft.people.find((p) => p.id === nextOwner)?.name || nextOwner
            : 'Shared pool';
          changes.push(`owner → ${nextName}`);
          item.ownerId = nextOwner;
        }
      }
      if (pd.effortMultiplier !== undefined && Number.isFinite(Number(pd.effortMultiplier))) {
        const mult = clamp(Number(pd.effortMultiplier), 0.1, 3, 1);
        if (Math.abs(mult - 1) > 1e-6 && item.effortDays) {
          item.effortDays = {
            optimistic: round2((Number(item.effortDays.optimistic) || 0) * mult),
            mostLikely: round2((Number(item.effortDays.mostLikely) || 0) * mult),
            pessimistic: round2((Number(item.effortDays.pessimistic) || 0) * mult),
          };
          changes.push(`effort ×${mult}`);
        }
      }
      if (pd.effortPin === 'optimistic' && item.effortDays) {
        const v = Number(item.effortDays.optimistic) || 0;
        item.effortDays = { optimistic: v, mostLikely: v, pessimistic: v };
        changes.push(`effort pinned to optimistic (${v}d)`);
      } else if (pd.effortPin === 'pessimistic' && item.effortDays) {
        const v = Number(item.effortDays.pessimistic) || 0;
        item.effortDays = { optimistic: v, mostLikely: v, pessimistic: v };
        changes.push(`effort pinned to pessimistic (${v}d)`);
      }
      if (changes.length) {
        appliedLevers.push({
          kind: 'portfolio',
          targetId: item.id,
          entityType: 'portfolio',
          summary: `“${item.title}”: ${changes.join(', ')}`,
        });
      }
    }
  }

  // 3. Hypothetical Uncommitted Demand Injection ("What if we say yes?")
  if (Array.isArray(levers.hypotheticalItems)) {
    levers.hypotheticalItems.forEach((hyp, idx) => {
      if (!hyp || !String(hyp.title || '').trim()) return;
      const opt = Math.max(0, Number(hyp.effortDays?.optimistic ?? hyp.optimistic ?? 3));
      const ml = Math.max(opt, Number(hyp.effortDays?.mostLikely ?? hyp.mostLikely ?? 5));
      const pess = Math.max(ml, Number(hyp.effortDays?.pessimistic ?? hyp.pessimistic ?? 9));
      const valExpected = Number(hyp.valueExpected ?? hyp.value?.mostLikely ?? 0);
      const hasVal = Number.isFinite(valExpected) && valExpected > 0;
      const id = hyp.id || `scn-hyp-${idx + 1}`;
      draft.portfolio.push({
        id,
        title: String(hyp.title).trim().slice(0, 140),
        kind: hyp.kind || 'project',
        status: 'open',
        decision: hyp.decision && PORTFOLIO_DECISIONS.includes(hyp.decision) ? hyp.decision : 'funded',
        decisionOn: today,
        rationale: 'Counterfactual scenario addition',
        ownerId: hyp.ownerId || null,
        sourceType: 'manual',
        sourceId: null,
        effortDays: { optimistic: round2(opt), mostLikely: round2(ml), pessimistic: round2(pess) },
        value: hasVal
          ? {
              optimistic: round2(valExpected * 0.8),
              mostLikely: round2(valExpected),
              pessimistic: round2(valExpected * 1.2),
            }
          : { optimistic: 0, mostLikely: 0, pessimistic: 0 },
        currency: hyp.currency || primaryCurrencyOf(draft),
        targetOn: hyp.targetOn || null,
        createdOn: today,
      });
      appliedLevers.push({
        kind: 'hypothetical',
        targetId: id,
        summary: `Added hypothetical work “${String(hyp.title).trim()}” (${ml}d most-likely)`,
      });
    });
  }

  // 4. Operational Case Mitigation Levers (FMEA residual + RULE-CAP-01 reserve release)
  if (Array.isArray(levers.caseMitigations)) {
    for (const rawEntry of levers.caseMitigations) {
      const caseId = typeof rawEntry === 'string' ? rawEntry : rawEntry?.caseId;
      if (!caseId) continue;
      const c = draft.cases.find((x) => x && x.id === caseId);
      if (!c || !isCaseOpen(c)) continue;
      c.status = 'resolved';
      c.resolvedOn = today;
      c.fmea = { ...(c.fmea || {}) };
      const preProb = clamp(Number(c.fmea.probability), 1, 10, 5);
      if (!c.fmea.residualProbability) {
        c.fmea.residualProbability = Math.max(1, preProb - 3);
      }
      if (!c.fmea.residualSeverity) {
        c.fmea.residualSeverity = clamp(Number(c.fmea.severity), 1, 10, 5);
      }
      if (!c.fmea.residualDetectability) {
        c.fmea.residualDetectability = Math.max(1, clamp(Number(c.fmea.detectability), 1, 10, 5) - 2);
      }
      // Release linked RULE-CAP-01 capacity reserve item in the counterfactual state
      let freedDays = 0;
      for (const item of draft.portfolio) {
        if (item && item.sourceType === 'case' && item.sourceId === c.id && item.status === 'open') {
          freedDays += pertTriple(item.effortDays).expected;
          item.status = 'released';
          item.releasedOn = today;
        }
      }
      appliedLevers.push({
        kind: 'case-mitigation',
        targetId: c.id,
        entityType: 'case',
        summary: `Mitigated case “${c.title}”${freedDays > 0 ? ` (released ${round2(freedDays)}d incident reserve)` : ''}`,
      });
    }
  }

  // 5. Organizational Change & Political Coalition Levers
  if (Array.isArray(levers.changeActions)) {
    for (const ca of levers.changeActions) {
      if (!ca || !ca.changeId) continue;
      const chg = draft.changes.find((x) => x && x.id === ca.changeId);
      if (!chg) continue;
      const action = ca.action || 'pause';

      if (action === 'pause') {
        chg.status = 'paused';
        let freed = 0;
        for (const item of draft.portfolio) {
          if (item && item.sourceType === 'change' && item.sourceId === chg.id && item.status === 'open') {
            freed += pertTriple(item.effortDays).expected;
            item.status = 'released';
            item.releasedOn = today;
          }
        }
        appliedLevers.push({
          kind: 'change',
          targetId: chg.id,
          entityType: 'change',
          changeAction: 'pause',
          summary: `Paused org change “${chg.title}”${freed > 0 ? ` (freed ${round2(freed)}d transition reserve)` : ''}`,
        });
      } else if (action === 'activate') {
        chg.status = 'active';
        const existingReserve = draft.portfolio.find(
          (i) => i && i.sourceType === 'change' && i.sourceId === chg.id,
        );
        const eff = pertTriple(chg.economics?.effortDays);
        if (existingReserve) {
          existingReserve.status = 'open';
          existingReserve.decision = 'funded';
          existingReserve.releasedOn = null;
        } else if (eff.measured && eff.expected > 0) {
          draft.portfolio.push({
            id: `scn-chg-res-${chg.id}`,
            title: `Transition reserve: ${chg.title}`.slice(0, 140),
            kind: 'capacity-reserve',
            status: 'open',
            decision: 'funded',
            decisionOn: today,
            rationale: 'Counterfactual RULE-CHG-01 transition reserve',
            ownerId: chg.ownerId || null,
            sourceType: 'change',
            sourceId: chg.id,
            effortDays: { ...chg.economics.effortDays },
            value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
            currency: chg.economics?.currency || primaryCurrencyOf(draft),
            targetOn: null,
            createdOn: today,
          });
        }
        appliedLevers.push({
          kind: 'change',
          targetId: chg.id,
          entityType: 'change',
          changeAction: 'activate',
          summary: `Activated org change “${chg.title}”${eff.measured ? ` (+${eff.expected}d transition reserve)` : ''}`,
        });
      } else if (action === 'align-coalition') {
        let aligned = 0;
        chg.coalition = (chg.coalition || []).map((m) => {
          if (m && (m.stance === 'blocker' || m.stance === 'skeptical' || (m.vetoPlayer && m.stance !== 'champion'))) {
            aligned += 1;
            return { ...m, stance: 'supportive' };
          }
          return m;
        });
        appliedLevers.push({
          kind: 'change',
          targetId: chg.id,
          entityType: 'change',
          changeAction: 'align-coalition',
          summary: `Aligned ${aligned} coalition/veto stakeholder(s) on “${chg.title}”`,
        });
      } else if (action === 'mitigate-barriers') {
        let mitigated = 0;
        chg.forces = (chg.forces || []).map((f) => {
          if (f && f.side === 'restraining' && !f.mitigated) {
            mitigated += 1;
            return { ...f, mitigated: true };
          }
          return f;
        });
        appliedLevers.push({
          kind: 'change',
          targetId: chg.id,
          entityType: 'change',
          changeAction: 'mitigate-barriers',
          summary: `Mitigated ${mitigated} Lewin restraining barrier(s) on “${chg.title}”`,
        });
      }
    }
  }

  // 6. Hiring & Brooks's Law Counterfactual Levers
  const horizonWeeks = clamp(Math.round(Number(draft.settings.planningHorizonWeeks)), 1, 26, 4);
  const horizonCalendarDays = horizonWeeks * 7;
  const horizonEnd = addDays(today, horizonCalendarDays);
  const daysPerWeek = clamp(Number(draft.settings.capacityHoursPerWeek), 4, 60, 32) / 8;
  const opLoadPct = clamp(Number(draft.settings.operationalLoadPct), 0, 80, 20);

  if (Array.isArray(levers.hiringActions)) {
    levers.hiringActions.forEach((ha, idx) => {
      if (!ha || !ha.reqId) return;
      const req = draft.requisitions.find((r) => r && r.id === ha.reqId);
      if (!req || !['open', 'offer'].includes(req.status)) return;

      const hireStartOn = ha.hireStartOn && /^\d{4}-\d{2}-\d{2}$/.test(String(ha.hireStartOn))
        ? String(ha.hireStartOn)
        : addDays(today, 7);
      const rawDrag = Number(ha.mentoringDragDays);
      const mentoringDragDays = Number.isFinite(rawDrag) && rawDrag >= 0
        ? round2(Math.min(20, rawDrag))
        : DEFAULT_MENTORING_DRAG_DAYS;

      const syntheticPersonId = `scn-hire-${req.id}-${idx + 1}`;
      draft.people.push({
        id: syntheticPersonId,
        name: `Hire (${req.title})`,
        role: req.title,
        level: req.level || 'senior',
        team: req.team || '',
        startDate: hireStartOn,
        status: 'active',
        focus: '30-60-90 onboarding ramp',
        talkingPoints: [],
      });
      draft.onboarding.push({
        id: `scn-onb-${req.id}-${idx + 1}`,
        personId: syntheticPersonId,
        kind: 'new-hire',
        label: req.title,
        startDate: hireStartOn,
        status: 'active',
        checkpoints: [],
        stakeholders: [],
        reviews: { 30: null, 60: null, 90: null },
      });

      // Mark requisition filled on hireStartOn (stopping vacancy bleed after start)
      req.status = 'filled';
      req.closedOn = hireStartOn <= today ? today : hireStartOn;

      // Release remaining open interview reserve if offer/hire closes inside horizon
      let interviewDaysFreed = 0;
      if (hireStartOn <= horizonEnd) {
        for (const item of draft.portfolio) {
          if (item && item.sourceType === 'requisition' && item.sourceId === req.id && item.status === 'open') {
            interviewDaysFreed += pertTriple(item.effortDays).expected;
            item.status = 'done';
            item.completedOn = today;
          }
        }
      }

      // Compute overlap with current planning horizon and inject Brooks's Law mentoring drag
      const offsetDays = hireStartOn > today ? daysBetween(today, hireStartOn) : 0;
      const inHorizonShare = Math.max(0, Math.min(1, (horizonCalendarDays - offsetDays) / horizonCalendarDays));
      const grossAdded = daysPerWeek * horizonWeeks * inHorizonShare * 0.45;
      const allocatableAdded = round2(grossAdded * (1 - opLoadPct / 100));
      // Mentoring drag hits tenured teammates as soon as the new joiner starts (or prep begins ~3d prior)
      const dragShare = hireStartOn <= horizonEnd
        ? Math.max(0.25, inHorizonShare)
        : 0;
      const effectiveDrag = round2(mentoringDragDays * dragShare);

      if (effectiveDrag > 0) {
        draft.portfolio.push({
          id: `scn-brooks-${req.id}-${idx + 1}`,
          title: `Onboarding & mentoring drag — ${req.title}`.slice(0, 140),
          kind: 'capacity-reserve',
          status: 'open',
          decision: 'funded',
          decisionOn: today,
          rationale: 'Brooks’s Law onboarding & coordination overhead on tenured teammates',
          ownerId: req.hiringManagerId || null,
          sourceType: 'requisition',
          sourceId: req.id,
          effortDays: {
            optimistic: round2(effectiveDrag * 0.75),
            mostLikely: effectiveDrag,
            pessimistic: round2(effectiveDrag * 1.45),
          },
          value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
          currency: primaryCurrencyOf(draft),
          targetOn: null,
          createdOn: today,
        });
      }

      const netDelta = round2(allocatableAdded + interviewDaysFreed - effectiveDrag);
      brooksDiagnostics.push({
        reqId: req.id,
        title: req.title,
        hireStartOn,
        allocatableAddedDays: allocatableAdded,
        interviewDaysFreed: round2(interviewDaysFreed),
        mentoringDragDays: effectiveDrag,
        netCapacityDeltaDays: netDelta,
        brooksLawTrap: netDelta < 0,
      });

      appliedLevers.push({
        kind: 'hiring',
        targetId: req.id,
        entityType: 'requisition',
        summary: `Filled “${req.title}” starting ${hireStartOn} (+${allocatableAdded}d ramped supply${interviewDaysFreed > 0 ? `, +${round2(interviewDaysFreed)}d interview time freed` : ''}, −${effectiveDrag}d Brooks mentoring drag ⇒ net ${netDelta >= 0 ? '+' : ''}${netDelta}d)`,
      });
    });
  }

  // 7. Temporary Capacity Shock / Unplanned Absence Lever (Stress Test)
  const absenceCount = clamp(Math.round(Number(levers.absenceCount || 0)), 0, 10, 0);
  if (absenceCount > 0) {
    const active = draft.people.filter((p) => p && p.status !== 'archived');
    const toArchive = active.slice(-absenceCount);
    for (const p of toArchive) {
      p.status = 'archived';
    }
    if (toArchive.length) {
      appliedLevers.push({
        kind: 'shock',
        targetId: 'absenceCount',
        summary: `Simulated ${toArchive.length} unplanned absence/attrition shock (${toArchive.map((p) => p.name).join(', ')})`,
      });
    }
  }

  return {
    state: draft,
    appliedLevers,
    brooksDiagnostics,
  };
}

/**
 * Compute multi-ledger risk-adjusted expected net value across Portfolio,
 * Operational Cases, Coupled Org-Change J-Curves, and Hiring Vacancy Exposure.
 */
function computeMultiLedgerEconomics(projectedState, capSummary, jointSim, { now = new Date() } = {}) {
  const currency = primaryCurrencyOf(projectedState);
  const today = dayKey(now);
  const horizonDays = (capSummary.model.horizonWeeks || 4) * 7;

  // 1. Funded portfolio expected value
  let fundedPortfolioValue = 0;
  let fundedValueCount = 0;
  for (const item of capSummary.model.demand.fundedProjects || []) {
    if (item.value.measured) {
      fundedPortfolioValue += item.value.expected;
      fundedValueCount += 1;
    }
  }

  // 2. Operational cases: open residual loss + mitigation investment
  //    Also include mitigationCost of cases resolved today (counterfactual mitigations)
  const caseRoll = casesRollup(projectedState, now);
  let openCaseResidualLoss = 0;
  let caseMitigationCost = 0;
  let measuredCaseCount = 0;
  let unratedCaseCount = 0;
  for (const s of caseRoll.all) {
    if (!s.open && s.caseRecord.resolvedOn !== today) continue;
    if (!s.pert.hasFinancialEstimate && !(s.pert.mitigationCost > 0)) continue;
    if (s.pert.hasFinancialEstimate && s.pert.preProbability === null) unratedCaseCount += 1;
    measuredCaseCount += 1;
    if (s.open) {
      openCaseResidualLoss += s.pert.expectedResidualLoss || 0;
      caseMitigationCost += s.pert.mitigationCost || 0;
    } else if (s.caseRecord.resolvedOn === today) {
      // Counterfactually mitigated in this scenario: count residual loss + mitigation outlay
      openCaseResidualLoss += s.pert.expectedResidualLoss || 0;
      caseMitigationCost += s.pert.mitigationCost || 0;
    }
  }

  // 3. Coupled Org-Change J-curve P50 horizon net benefit across open committed changes
  let changeHorizonNet = 0;
  let measuredChangeCount = 0;
  let worstPaybackP80Months = null;
  let maxChangeLossProbability = 0;
  for (const row of jointSim.openChangeSimulations || []) {
    const chg = row.change;
    const sim = row.simulation;
    if (!sim?.available) continue;
    if (!['active', 'stabilising'].includes(chg.status)) continue;
    measuredChangeCount += 1;
    changeHorizonNet += sim.horizonNet.p50 || 0;
    if (sim.horizonNet.probabilityLoss > maxChangeLossProbability) {
      maxChangeLossProbability = sim.horizonNet.probabilityLoss;
    }
    const p80 = sim.paybackMonths.p80 ?? (sim.horizonMonths + 1);
    if (worstPaybackP80Months === null || p80 > worstPaybackP80Months) {
      worstPaybackP80Months = p80;
    }
  }

  // 4. Requisition forward vacancy exposure over the planning horizon
  const hireSum = hiringSummary(projectedState, { now, settings: projectedState.settings || {} });
  let horizonVacancyCost = 0;
  let measuredVacancyCount = 0;
  for (const req of projectedState.requisitions || []) {
    const daily = Number(req?.dailyVacancyCost?.amount ?? req?.vacancyCostPerDay ?? 0);
    if (!Number.isFinite(daily) || daily <= 0) continue;
    if (req.status === 'open' || req.status === 'offer') {
      measuredVacancyCount += 1;
      horizonVacancyCost += daily * horizonDays;
    } else if (req.status === 'filled' && req.closedOn && req.closedOn > today) {
      measuredVacancyCount += 1;
      const openDaysInHorizon = Math.min(horizonDays, Math.max(0, daysBetween(today, req.closedOn)));
      horizonVacancyCost += daily * openDaysInHorizon;
    }
  }

  const measuredAny =
    fundedValueCount > 0 ||
    measuredCaseCount > 0 ||
    measuredChangeCount > 0 ||
    measuredVacancyCount > 0;

  const netRiskAdjustedValue = round(
    fundedPortfolioValue + changeHorizonNet - openCaseResidualLoss - caseMitigationCost - horizonVacancyCost,
    0,
  );

  // Marginal shadow value of 1 person-day of capacity (Samuelson shadow price)
  const marginalShadowValuePerDay =
    capSummary.ranking.nextInLine?.valueDensity ??
    capSummary.ranking.releaseCandidates[0]?.valueDensity ??
    null;

  return {
    currency,
    measured: measuredAny && unratedCaseCount === 0,
    unratedCaseCount,
    fundedPortfolioValue: round(fundedPortfolioValue, 0),
    openCaseResidualLoss: round(openCaseResidualLoss, 0),
    caseMitigationCost: round(caseMitigationCost, 0),
    changeHorizonNet: round(changeHorizonNet, 0),
    horizonVacancyCost: round(horizonVacancyCost, 0),
    totalVacancyToDate: hireSum.vacancyMeasured ? round(hireSum.vacancyExposure, 0) : 0,
    netRiskAdjustedValue: unratedCaseCount ? null : netRiskAdjustedValue,
    marginalShadowValuePerDay: marginalShadowValuePerDay !== null ? round(marginalShadowValuePerDay, 0) : null,
    worstPaybackP80Months,
    maxChangeLossProbability: round2(maxChangeLossProbability),
  };
}

/**
 * Evaluate a single scenario (or Baseline when `scenarioSpec` has no levers)
 * using Common Random Numbers (`seed`) across Capacity, Monte Carlo, Cases,
 * Changes, and Hiring.
 */
export function evaluateScenario(
  baseState,
  scenarioSpec = { id: 'baseline', name: 'Live baseline', levers: {} },
  {
    now = new Date(),
    seed,
    trials,
  } = {},
) {
  const resolvedSeed = hashSeed(seed ?? baseState?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const defaultTrials = (baseState?.portfolio || []).length > 60
    ? 300
    : clamp(baseState?.settings?.simulationTrials, 200, 5000, DEFAULT_SIMULATION_TRIALS);
  const resolvedTrials = clamp(trials ?? defaultTrials, 200, 5000, defaultTrials);

  const projected = projectScenarioState(baseState, scenarioSpec, { now });
  const cap = capacitySummary(projected.state, now);
  const joint = simulateJointWorkspace(projected.state, {
    seed: resolvedSeed,
    trials: resolvedTrials,
    now,
  });
  const pf = joint.portfolio;
  const economics = computeMultiLedgerEconomics(projected.state, cap, joint, { now });
  const chgRoll = changesRollup(projected.state, now);

  const effectiveP80Days = pf.available
    ? (pf.bottleneckCompletion.p80CalendarDays ?? pf.teamCompletion.p80CalendarDays ?? 0)
    : 0;
  const effectiveP80Date = pf.available
    ? (pf.bottleneckCompletion.p80 || pf.teamCompletion.p80 || null)
    : (cap.forecast.available ? cap.forecast.p80 : null);

  return {
    id: scenarioSpec.id || 'scenario',
    name: scenarioSpec.name || 'Scenario',
    description: scenarioSpec.description || '',
    category: scenarioSpec.category || 'custom',
    isBaseline: Boolean(scenarioSpec.isBaseline),
    leverCount: countScenarioLevers(scenarioSpec),
    appliedLevers: projected.appliedLevers,
    brooksDiagnostics: projected.brooksDiagnostics,
    brooksLawTrap: projected.brooksDiagnostics.some((b) => b.brooksLawTrap),
    seed: resolvedSeed,
    trials: resolvedTrials,
    capacity: {
      hasTeam: cap.model.hasTeam,
      horizonWeeks: cap.model.horizonWeeks,
      activeCount: cap.model.supply.activeCount,
      allocatableDays: cap.model.supply.allocatableDays,
      committedDays: cap.model.demand.committedDays,
      fundedDays: cap.model.demand.fundedDays,
      reserveDays: cap.model.demand.reserveDays,
      wantedDays: cap.model.demand.wantedDays,
      slackDays: cap.model.slackDays,
      utilisation: cap.model.utilisation,
      band: cap.model.band,
      wip: cap.flow.wip,
      wipLimit: cap.flow.wipLimit,
      wipBreach: cap.flow.wipBreach,
      kingmanDelayMultiplier: cap.flow.delayMultiplier,
      bottleneckOwner: cap.model.bottleneck
        ? {
            personId: cap.model.bottleneck.personId,
            name: cap.model.bottleneck.name,
            utilisation: cap.model.bottleneck.utilisation,
          }
        : null,
    },
    monteCarlo: {
      available: pf.available,
      overloadProbability: pf.available ? pf.overloadProbability : 0,
      horizonFitProbability: pf.available ? pf.horizonFitProbability : 1,
      ownerBottleneckBreachProbability: pf.available ? pf.ownerBottleneckBreachProbability : 0,
      flawOfAveragesTrap: pf.available ? Boolean(pf.flawOfAveragesTrap) : false,
      committedP50Days: pf.available ? pf.committedDemand.p50 : cap.model.demand.committedDays,
      committedP80Days: pf.available ? pf.committedDemand.p80 : cap.model.demand.committedDays,
      committedP90Days: pf.available ? pf.committedDemand.p90 : cap.model.demand.committedDays,
      teamP80Days: pf.available ? pf.teamCompletion.p80CalendarDays : null,
      teamP80Date: pf.available ? pf.teamCompletion.p80 : null,
      bottleneckP80Days: pf.available ? pf.bottleneckCompletion.p80CalendarDays : null,
      bottleneckP80Date: pf.available ? pf.bottleneckCompletion.p80 : null,
      effectiveP80Days,
      effectiveP80Date,
      criticalChainSlipDays: pf.available ? pf.bottleneckCompletion.slipDaysVsTeamP80 : 0,
      atRiskTargetCount: pf.available
        ? pf.targetRisks.filter((t) => (t.mcProbability ?? 1) < 0.5).length
        : cap.forecast.lateTargetCount,
    },
    orgChanges: {
      openCount: chgRoll.open.length,
      committedCount: chgRoll.committed.length,
      unmitigatedBlockerCount: chgRoll.unmitigatedBlockerCount,
      unalignedVetoCount: chgRoll.unalignedVetoCount,
    },
    economics,
    spec: scenarioSpec,
  };
}

/**
 * Multi-objective Pareto dominance classification (Vilfredo Pareto, 1906).
 *
 * Scenario A Pareto-dominates Scenario B iff:
 *  - Overload probability(A) <= Overload probability(B) + epsProb
 *  - Effective P80 completion days(A) <= Effective P80 completion days(B) + epsDays
 *  - Risk-adjusted net value(A) >= Risk-adjusted net value(B) - epsValue
 * AND at least one objective is strictly better beyond tolerance!
 */
export function computeParetoFrontier(evaluatedRows = []) {
  const epsProb = 0.005;
  const epsDays = 0.5;
  const epsVal = 50;

  return evaluatedRows.map((candidate) => {
    const dominatedBy = [];
    const comparable = !(candidate.economics.unratedCaseCount > 0);
    for (const peer of evaluatedRows) {
      if (peer.id === candidate.id || !comparable || peer.economics.unratedCaseCount > 0) continue;
      const probA = peer.monteCarlo.overloadProbability ?? 0;
      const probB = candidate.monteCarlo.overloadProbability ?? 0;
      const daysA = peer.monteCarlo.effectiveP80Days ?? 0;
      const daysB = candidate.monteCarlo.effectiveP80Days ?? 0;
      const valA = peer.economics.measured ? peer.economics.netRiskAdjustedValue : 0;
      const valB = candidate.economics.measured ? candidate.economics.netRiskAdjustedValue : 0;

      const noWorse =
        probA <= probB + epsProb &&
        daysA <= daysB + epsDays &&
        valA >= valB - epsVal;
      if (!noWorse) continue;

      const reasons = [];
      if (probA < probB - epsProb) {
        reasons.push(`${Math.round((probB - probA) * 100)}pp lower overload risk`);
      }
      if (daysA < daysB - epsDays) {
        reasons.push(`${Math.round(daysB - daysA)}d faster P80 finish`);
      }
      if (valA > valB + epsVal) {
        reasons.push(`+${candidate.economics.currency} ${(valA - valB).toLocaleString('en-US')} higher net value`);
      }
      if (reasons.length > 0) {
        dominatedBy.push({
          id: peer.id,
          name: peer.name,
          reasons,
        });
      }
    }
    return {
      ...candidate,
      paretoOptimal: comparable ? dominatedBy.length === 0 : null,
      dominatedBy,
    };
  });
}

/**
 * Generate concrete, context-aware counterfactual scenario presets directly
 * from the workspace's live bottlenecks, lowest-CD3 items, open cases, active
 * org changes, and open requisitions. Never generates empty/fake presets.
 */
export function buildSuggestedScenarios(state, { now = new Date() } = {}) {
  const presets = [];
  if (!state) return presets;
  const today = dayKey(now);
  const cap = capacitySummary(state, now);
  const activePeople = (state.people || []).filter((p) => p && p.status !== 'archived');

  // Preset 1: Scope Relief (CD3 / Marginal Value-Density Trim)
  const fundedProjects = (cap.model.demand.fundedProjects || [])
    .slice()
    .sort((a, b) => (a.valueDensity ?? Infinity) - (b.valueDensity ?? Infinity) || b.effort.expected - a.effort.expected);

  if (fundedProjects.length >= 2 || (fundedProjects.length >= 1 && (cap.model.utilisation ?? 0) > 0.85)) {
    const targetFreeDays = cap.model.slackDays < 0
      ? Math.abs(cap.model.slackDays)
      : Math.max(2, cap.model.demand.committedDays - cap.model.supply.allocatableDays * 0.8);
    let acc = 0;
    const toDefer = [];
    for (const item of fundedProjects) {
      if (toDefer.length >= 2) break;
      if (acc >= targetFreeDays && toDefer.length >= 1) break;
      toDefer.push(item);
      acc += item.effort.expected;
    }
    if (toDefer.length > 0) {
      presets.push({
        id: 'preset-cd3-trim',
        name: `Scope relief: defer ${toDefer.length === 1 ? `“${toDefer[0].title.slice(0, 32)}”` : `${toDefer.length} lowest-CD3 items`}`,
        category: 'scope',
        description: `Reinertsen CD3 marginal trim: defers ${round2(acc)}d of lowest value-density scope to collapse Kingman queue wait and protect top commitments.`,
        levers: {
          portfolioDecisions: toDefer.map((item) => ({
            itemId: item.id,
            decision: 'deferred',
          })),
        },
      });
    }
  }

  // Preset 2: Critical-Chain Owner De-Bottlenecking (Rebalance Load)
  if (activePeople.length >= 2) {
    const sortedPeople = cap.model.supply.people
      .slice()
      .sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0));
    const busiest = sortedPeople[0];
    const lightest = sortedPeople[sortedPeople.length - 1];
    if (busiest && lightest && busiest.personId !== lightest.personId && (busiest.utilisation ?? 0) > (lightest.utilisation ?? 0) + 0.2) {
      const ownedItems = (state.portfolio || [])
        .filter((i) => i && i.status === 'open' && i.decision === 'funded' && i.kind !== 'capacity-reserve' && i.ownerId === busiest.personId)
        .map((i) => ({ raw: i, effort: pertTriple(i.effortDays) }))
        .filter((x) => x.effort.measured)
        .sort((a, b) => a.effort.expected - b.effort.expected);
      if (ownedItems.length >= 1) {
        const moveItem = ownedItems[0].raw;
        presets.push({
          id: 'preset-rebalance-owner',
          name: `De-bottleneck ${busiest.name.split(' ')[0]} → ${lightest.name.split(' ')[0]}`,
          category: 'flow',
          description: `Goldratt Critical Chain: reassigns “${moveItem.title}” from ${busiest.name} (${Math.round((busiest.utilisation ?? 0) * 100)}% load) to ${lightest.name} (${Math.round((lightest.utilisation ?? 0) * 100)}% load).`,
          levers: {
            portfolioDecisions: [
              { itemId: moveItem.id, ownerId: lightest.personId },
            ],
          },
        });
      }
    }
  }

  // Preset 3: Mitigate Highest-Exposure Open Operational Case
  const caseRoll = casesRollup(state, now);
  const topCase = caseRoll.open
    .slice()
    .sort((a, b) => b.pert.capacity.expected - a.pert.capacity.expected || b.fmea.rpn - a.fmea.rpn)[0];
  if (topCase) {
    presets.push({
      id: 'preset-mitigate-case',
      name: `Mitigate case: “${topCase.caseRecord.title.slice(0, 34)}”`,
      category: 'risk',
      description: `AIAG-VDA FMEA + RULE-CAP-01: funds systemic barrier on RPN-${topCase.fmea.rpn} case to release diverted incident reserve and cut expected residual loss.`,
      levers: {
        caseMitigations: [topCase.caseRecord.id],
      },
    });
  }

  // Preset 4: Organizational Change Coalition Alignment vs Sequencing Pause
  const chgRoll = changesRollup(state, now);
  const frictionChange = chgRoll.committed.find(
    (s) => s.coalition.unalignedVetoPlayers.length > 0 || s.forceField.restraining.some((f) => !f.mitigated),
  ) || chgRoll.committed[0];
  if (frictionChange) {
    if (frictionChange.coalition.unalignedVetoPlayers.length > 0 || frictionChange.forceField.restraining.some((f) => !f.mitigated)) {
      presets.push({
        id: 'preset-align-change',
        name: `Clear barriers & veto gap on “${frictionChange.change.title.slice(0, 28)}”`,
        category: 'change',
        description: `Lewin Force-Field + Tsebelis Veto Players: aligns gatekeepers and mitigates restraining barriers to compress the Satir J-curve valley.`,
        levers: {
          changeActions: [
            { changeId: frictionChange.change.id, action: 'align-coalition' },
            { changeId: frictionChange.change.id, action: 'mitigate-barriers' },
          ],
        },
      });
    }
    presets.push({
      id: 'preset-pause-change',
      name: `Sequence split: pause “${frictionChange.change.title.slice(0, 30)}”`,
      category: 'change',
      description: `Pauses active organizational change to return its ${frictionChange.economics.effort.expected}d transition reserve to delivery commitments this horizon.`,
      levers: {
        changeActions: [
          { changeId: frictionChange.change.id, action: 'pause' },
        ],
      },
    });
  }

  // Preset 5: Open Requisition Hire Timing (Brooks's Law Adjusted)
  const openReq = (state.requisitions || []).find((r) => r && ['open', 'offer'].includes(r.status));
  if (openReq) {
    const startSoon = addDays(today, 7);
    presets.push({
      id: 'preset-hire-brooks',
      name: `Fill “${openReq.title.slice(0, 30)}” in 7d (Brooks-adjusted)`,
      category: 'hiring',
      description: `Brooks’s Law + Watkins 30-60-90: models filling the open seat on ${startSoon} with 45% month-1 ramp, freed interview reserve, and ${DEFAULT_MENTORING_DRAG_DAYS}d tenured mentoring drag.`,
      levers: {
        hiringActions: [
          {
            reqId: openReq.id,
            hireStartOn: startSoon,
            mentoringDragDays: DEFAULT_MENTORING_DRAG_DAYS,
          },
        ],
      },
    });
  }

  return presets;
}

/**
 * Evaluate Baseline alongside a list of counterfactual scenario specs using
 * Common Random Numbers (CRN), compute deltas vs. Baseline, and classify
 * multi-objective Pareto optimality.
 */
export function compareScenarios(
  baseState,
  scenarioSpecs = [],
  {
    now = new Date(),
    seed,
    trials,
  } = {},
) {
  const resolvedSeed = hashSeed(seed ?? baseState?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const baselineEval = evaluateScenario(
    baseState,
    {
      id: 'baseline',
      name: 'Live baseline',
      description: 'Current workspace records without counterfactual changes.',
      category: 'baseline',
      isBaseline: true,
      levers: {},
    },
    { now, seed: resolvedSeed, trials },
  );

  const rawRows = [
    baselineEval,
    ...scenarioSpecs.map((spec, idx) =>
      evaluateScenario(
        baseState,
        {
          ...spec,
          id: spec.id || `scenario-${idx + 1}`,
          name: spec.name || `Scenario ${idx + 1}`,
          isBaseline: false,
        },
        { now, seed: resolvedSeed, trials: baselineEval.trials },
      ),
    ),
  ];

  const withPareto = computeParetoFrontier(rawRows);
  const baseline = withPareto[0];

  const scenarios = withPareto.map((row) => {
    const deltaCommittedDays = round2(row.capacity.committedDays - baseline.capacity.committedDays);
    const deltaSlackDays = round2(row.capacity.slackDays - baseline.capacity.slackDays);
    const deltaUtilisation =
      row.capacity.utilisation !== null && baseline.capacity.utilisation !== null
        ? round2(row.capacity.utilisation - baseline.capacity.utilisation)
        : null;
    const deltaOverloadProb = round2(
      (row.monteCarlo.overloadProbability ?? 0) - (baseline.monteCarlo.overloadProbability ?? 0),
    );
    const deltaEffectiveP80Days =
      row.monteCarlo.effectiveP80Days !== null && baseline.monteCarlo.effectiveP80Days !== null
        ? Math.round(row.monteCarlo.effectiveP80Days - baseline.monteCarlo.effectiveP80Days)
        : 0;
    const deltaNetValue = row.economics.measured && baseline.economics.measured
      ? round(row.economics.netRiskAdjustedValue - baseline.economics.netRiskAdjustedValue, 0)
      : null;

    return {
      ...row,
      deltas: {
        committedDays: deltaCommittedDays,
        slackDays: deltaSlackDays,
        utilisation: deltaUtilisation,
        overloadProbability: deltaOverloadProb,
        effectiveP80Days: deltaEffectiveP80Days,
        netRiskAdjustedValue: deltaNetValue,
      },
    };
  });

  const bestRelief = scenarios
    .filter((s) => !s.isBaseline && s.paretoOptimal)
    .sort(
      (a, b) =>
        a.deltas.overloadProbability - b.deltas.overloadProbability ||
        a.deltas.effectiveP80Days - b.deltas.effectiveP80Days ||
        b.deltas.netRiskAdjustedValue - a.deltas.netRiskAdjustedValue,
    )[0] || null;

  return {
    seed: resolvedSeed,
    trials: baseline.trials,
    baseline: scenarios[0],
    scenarios,
    frontierCount: scenarios.filter((s) => s.paretoOptimal).length,
    dominatedCount: scenarios.filter((s) => s.paretoOptimal === false).length,
    bestRelief,
  };
}

/**
 * Ronald Howard (1988) One-at-a-Time (OAT) Tornado Sensitivity Analysis.
 *
 * Perturbs each real workspace factor around the live Baseline using Common
 * Random Numbers (`seed`) and ranks levers by total swing across P80 completion
 * calendar days (`p80SwingDays`) and Monte Carlo overload probability
 * (`overloadSwingPct`).
 */
export function computeSensitivityTornado(
  state,
  {
    now = new Date(),
    seed,
    trials,
    maxItems = 5,
  } = {},
) {
  const hasTeam = (state?.people || []).some((p) => p && p.status !== 'archived');
  if (!hasTeam) {
    return {
      available: false,
      reason: 'Add active team members and at least one commitment to run tornado sensitivity analysis.',
      bars: [],
    };
  }

  const resolvedSeed = hashSeed(seed ?? state?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const fastTrials = (state?.portfolio || []).length > 60
    ? 250
    : clamp(trials ?? Math.min(state?.settings?.simulationTrials ?? 600, 600), 200, 2000, 500);

  const baseline = evaluateScenario(
    state,
    { id: 'baseline', name: 'Baseline', isBaseline: true, levers: {} },
    { now, seed: resolvedSeed, trials: fastTrials },
  );

  const perturbations = [];
  const curReserve = clamp(Number(state?.settings?.operationalLoadPct), 0, 80, 20);

  // 1. Operational Interrupt Reserve (±10pp)
  perturbations.push({
    id: 'sens-op-reserve',
    label: `Operational interrupt reserve (${Math.max(5, curReserve - 10)}% ↔ ${Math.min(75, curReserve + 15)}%)`,
    category: 'Operating physics',
    favorableLabel: `${Math.max(5, curReserve - 10)}% reserve`,
    favorableLevers: { settingsPatch: { operationalLoadPct: Math.max(5, curReserve - 10) } },
    adverseLabel: `${Math.min(75, curReserve + 15)}% interrupt surge`,
    adverseLevers: { settingsPatch: { operationalLoadPct: Math.min(75, curReserve + 15) } },
  });

  // 2. Team Capacity Shock (Ramped addition vs 1 unplanned absence)
  const activeCount = (state?.people || []).filter((p) => p && p.status !== 'archived').length;
  const curHours = clamp(Number(state?.settings?.capacityHoursPerWeek), 8, 60, 32);
  if (activeCount >= 2) {
    perturbations.push({
      id: 'sens-roster-shock',
      label: 'Team availability (+4h/wk focus ↔ 1 unplanned absence)',
      category: 'Capacity supply',
      favorableLabel: `${Math.min(40, curHours + 4)}h/wk protected focus`,
      favorableLevers: { settingsPatch: { capacityHoursPerWeek: Math.min(40, curHours + 4) } },
      adverseLabel: '1 teammate out / leave shock',
      adverseLevers: { absenceCount: 1 },
    });
  }

  // 3. Top Funded Portfolio Items (Optimistic ↔ Pessimistic PERT spread)
  const fundedMeasured = (state?.portfolio || [])
    .filter((i) => i && i.status === 'open' && i.decision === 'funded' && i.kind !== 'capacity-reserve')
    .map((i) => {
      const eff = pertTriple(i.effortDays);
      return { item: i, eff, spread: round2(eff.pessimistic - eff.optimistic) };
    })
    .filter((x) => x.eff.measured && x.spread > 0)
    .sort((a, b) => b.spread - a.spread || b.eff.expected - a.eff.expected)
    .slice(0, maxItems);

  for (const row of fundedMeasured) {
    perturbations.push({
      id: `sens-pf-${row.item.id}`,
      label: `“${row.item.title.slice(0, 38)}” (${row.eff.optimistic}d ↔ ${row.eff.pessimistic}d)`,
      category: 'Portfolio uncertainty',
      favorableLabel: `Optimistic (${row.eff.optimistic}d)`,
      favorableLevers: {
        portfolioDecisions: [{ itemId: row.item.id, effortPin: 'optimistic' }],
      },
      adverseLabel: `Pessimistic (${row.eff.pessimistic}d)`,
      adverseLevers: {
        portfolioDecisions: [{ itemId: row.item.id, effortPin: 'pessimistic' }],
      },
    });
  }

  // 4. Open Capacity-Diverting Operational Cases (Mitigated ↔ P90 surge)
  const openReserveCases = (state?.cases || [])
    .filter((c) => c && isCaseOpen(c))
    .map((c) => {
      const resItem = (state?.portfolio || []).find(
        (i) => i && i.sourceType === 'case' && i.sourceId === c.id && i.status === 'open',
      );
      return { caseRecord: c, reserveItem: resItem, eff: resItem ? pertTriple(resItem.effortDays) : null };
    })
    .filter((x) => x.reserveItem && x.eff?.measured)
    .slice(0, 2);

  for (const row of openReserveCases) {
    perturbations.push({
      id: `sens-case-${row.caseRecord.id}`,
      label: `Case reserve: “${row.caseRecord.title.slice(0, 32)}” (mitigated ↔ P90 surge)`,
      category: 'Incident & risk reserve',
      favorableLabel: 'Mitigated (0d reserve)',
      favorableLevers: { caseMitigations: [row.caseRecord.id] },
      adverseLabel: `Pessimistic (${row.eff.pessimistic}d)`,
      adverseLevers: {
        portfolioDecisions: [{ itemId: row.reserveItem.id, effortPin: 'pessimistic' }],
      },
    });
  }

  // 5. Open Organizational Changes (Paused reserve ↔ Active P90 effort)
  const openChanges = (state?.changes || [])
    .filter((c) => c && isChangeOpen(c) && ['active', 'stabilising'].includes(c.status))
    .slice(0, 2);
  for (const chg of openChanges) {
    const resItem = (state?.portfolio || []).find(
      (i) => i && i.sourceType === 'change' && i.sourceId === chg.id && i.status === 'open',
    );
    const eff = resItem ? pertTriple(resItem.effortDays) : pertTriple(chg.economics?.effortDays);
    if (!eff.measured) continue;
    perturbations.push({
      id: `sens-chg-${chg.id}`,
      label: `Org change: “${chg.title.slice(0, 32)}” (paused ↔ P90 transition)`,
      category: 'Org transition load',
      favorableLabel: 'Paused (0d reserve)',
      favorableLevers: { changeActions: [{ changeId: chg.id, action: 'pause' }] },
      adverseLabel: resItem ? `Pessimistic (${eff.pessimistic}d)` : 'Active transition',
      adverseLevers: resItem
        ? { portfolioDecisions: [{ itemId: resItem.id, effortPin: 'pessimistic' }] }
        : { changeActions: [{ changeId: chg.id, action: 'activate' }] },
    });
  }

  const baseP80 = baseline.monteCarlo.effectiveP80Days ?? 0;
  const baseOverload = baseline.monteCarlo.overloadProbability ?? 0;
  const baseNet = baseline.economics.netRiskAdjustedValue;

  const bars = perturbations.map((p) => {
    const fav = evaluateScenario(
      state,
      { id: `${p.id}-fav`, name: p.favorableLabel, levers: p.favorableLevers },
      { now, seed: resolvedSeed, trials: fastTrials },
    );
    const adv = evaluateScenario(
      state,
      { id: `${p.id}-adv`, name: p.adverseLabel, levers: p.adverseLevers },
      { now, seed: resolvedSeed, trials: fastTrials },
    );

    const favP80 = fav.monteCarlo.effectiveP80Days ?? baseP80;
    const advP80 = adv.monteCarlo.effectiveP80Days ?? baseP80;
    const lowP80 = Math.min(favP80, advP80, baseP80);
    const highP80 = Math.max(favP80, advP80, baseP80);
    const p80SwingDays = round2(highP80 - lowP80);

    const favOver = fav.monteCarlo.overloadProbability ?? baseOverload;
    const advOver = adv.monteCarlo.overloadProbability ?? baseOverload;
    const lowOver = Math.min(favOver, advOver, baseOverload);
    const highOver = Math.max(favOver, advOver, baseOverload);
    const overloadSwing = round2(highOver - lowOver);

    const favVal = fav.economics.netRiskAdjustedValue;
    const advVal = adv.economics.netRiskAdjustedValue;
    const valueSwing = favVal === null || advVal === null ? null : Math.round(Math.abs(favVal - advVal));

    return {
      id: p.id,
      label: p.label,
      category: p.category,
      favorableLabel: p.favorableLabel,
      adverseLabel: p.adverseLabel,
      baselineP80Days: baseP80,
      favorableP80Days: favP80,
      adverseP80Days: advP80,
      deltaFavorableP80Days: round2(favP80 - baseP80),
      deltaAdverseP80Days: round2(advP80 - baseP80),
      p80SwingDays,
      baselineOverloadProb: baseOverload,
      favorableOverloadProb: favOver,
      adverseOverloadProb: advOver,
      deltaFavorableOverloadPct: Math.round((favOver - baseOverload) * 100),
      deltaAdverseOverloadPct: Math.round((advOver - baseOverload) * 100),
      overloadSwingPct: Math.round(overloadSwing * 100),
      valueSwing,
    };
  });

  bars.sort(
    (a, b) =>
      b.p80SwingDays - a.p80SwingDays ||
      b.overloadSwingPct - a.overloadSwingPct ||
      (b.valueSwing ?? 0) - (a.valueSwing ?? 0),
  );

  return {
    available: bars.length > 0,
    seed: resolvedSeed,
    trials: fastTrials,
    baselineP80Days: baseP80,
    baselineP80Date: baseline.monteCarlo.effectiveP80Date,
    baselineOverloadProb: baseOverload,
    baselineNetValue: baseNet,
    currency: baseline.economics.currency,
    bars,
  };
}
