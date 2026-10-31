/**
 * app/core/domain/interfaceRules.js — Generalized post-commit automation rules
 * (`RULE-INT-01..06`) for the Cross-Boundary Interface, Queue-Network &
 * Operating Pact Terminal (`#/interfaces`, Schema v68).
 *
 * Rules:
 *   RULE-INT-01  Queue Instability / Rework Circuit-Breaker — opens at most one
 *                4-option DACI boundary-mechanism decision per pact per ISO week
 *                when ρ ≥ 1 or bounce rate ≥ threshold, and enqueues
 *                `decision.created` so `decisionTempoRule` timeboxes it in the
 *                same transaction.
 *   RULE-INT-02  Congestion Externality Pacing — opens one owned intake-pacing
 *                delegation when a stable boundary operates above `highUtilPct`
 *                (marginal social-to-private delay ≥ 5× at ρ = 0.80) or exceeds
 *                the per-currency weekly externality threshold.
 *   RULE-INT-03  Clean-Hands Self-Repair Guardrail — when our own intake
 *                compliance is below `cleanHandsFloorPct`, blocks one-sided
 *                escalation and opens one owned intake-hygiene repair delegation
 *                plus one length-safe (≤200 char) blameless 1:1 talking point.
 *   RULE-INT-04  Credible Bilateral SLA Renegotiation — when counterparty SLA
 *                breaches WITH verified clean hands on our side, opens one
 *                Harvard-principled negotiation workstream (`kind: 'scope-deadline'`)
 *                in `#/negotiations` pre-filled with objective queue/Wilson
 *                criteria and reset script, plus one DACI governance decision.
 *   RULE-INT-05  Cross-Module Contagion Sensing — when an open operational case
 *                or active dependency touches a registered boundary's target
 *                unit, stakeholder or dependency, links it (`strains-interface`)
 *                automatically without duplicate data entry.
 *   RULE-INT-06  Audit Lifecycle, Stale-Edge Reconciliation & Brier Surprise —
 *                links frozen Pact Audits (`audits-interface`), reconciles dead
 *                edges on scan, opens one grading delegation per overdue audit,
 *                and opens one blameless boundary-learning delegation on a
 *                scored Brier miss (> 0.25).
 *
 * Pure module: zero DOM, zero storage, zero ambient clock.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  buildBoundaryResetScript,
  interfaceConventions,
  interfaceReport,
} from './interfaces.js';

export const INTERFACE_RULE_IDS = Object.freeze({
  CIRCUIT_BREAKER: 'RULE-INT-01',
  EXTERNALITY_PACING: 'RULE-INT-02',
  CLEAN_HANDS_REPAIR: 'RULE-INT-03',
  CREDIBLE_RENEGOTIATION: 'RULE-INT-04',
  CONTAGION_LINK: 'RULE-INT-05',
  AUDIT_LIFECYCLE: 'RULE-INT-06',
});

export const INTERFACE_EVENTS = Object.freeze({
  PACT_CREATED: 'interface.pact.created',
  PACT_UPDATED: 'interface.pact.updated',
  EXCHANGE_RECORDED: 'interface.exchange.recorded',
  AUDIT_FROZEN: 'interface.audit.frozen',
  AUDIT_GRADED: 'interface.audit.graded',
  SCANNED: 'interface.scanned',
});

const SENSING_TRIGGERS = new Set([
  ...Object.values(INTERFACE_EVENTS),
  'case.created',
  'case.updated',
  'dependency.created',
  'dependency.updated',
]);

const MAX_MARKERS = 400;
const MAX_TOPICS = 12;

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function defaultIdFactory(prefix = 'int') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasMarker(draft, tag) {
  return Array.isArray(draft.interfaceMarkers) && draft.interfaceMarkers.includes(tag);
}

function addMarker(draft, tag) {
  draft.interfaceMarkers = Array.isArray(draft.interfaceMarkers) ? draft.interfaceMarkers : [];
  if (draft.interfaceMarkers.includes(tag)) return false;
  draft.interfaceMarkers.push(tag);
  if (draft.interfaceMarkers.length > MAX_MARKERS) {
    draft.interfaceMarkers.splice(0, draft.interfaceMarkers.length - MAX_MARKERS);
  }
  return true;
}

function resolveLeaderOrOwner(draft, preferredOwnerId = null) {
  const active = (draft.people || []).filter((p) => p && p.status !== 'archived');
  if (preferredOwnerId) {
    const found = active.find((p) => p.id === preferredOwnerId);
    if (found) return found;
  }
  const ids = new Set(active.map((p) => p.id));
  return active.find((p) => !p.managerId || !ids.has(p.managerId)) || active[0] || null;
}

function addSafeTalkingPoint(person, text, tag) {
  if (!person) return false;
  const token = `[${tag}]`;
  person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (person.talkingPoints.some((row) => String(row).includes(token))) return false;
  const budget = Math.max(24, 200 - token.length - 1);
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const trimmed = clean.length > budget ? `${clean.slice(0, budget - 1).trimEnd()}…` : clean;
  person.talkingPoints = [...person.talkingPoints, `${trimmed} ${token}`].slice(-MAX_TOPICS);
  return true;
}

function makeDelegation(ctx, { personId, title, expectedOutcome, support, dueDays = 7, tag }) {
  const today = dayKey(ctx.now);
  const nowIso = ctx.now.toISOString();
  return {
    id: ctx.idFactory('del'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `${String(support).slice(0, 1800)} [${tag}]`,
    delegatedOn: today,
    dueOn: dayKey(addDays(ctx.now, dueDays)),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function eff(ruleId, action, targetType, targetId, summary) {
  return {
    ruleId,
    action,
    targetType,
    targetId,
    summary,
    event: {
      type: 'automation.propagated',
      entity: targetType || 'interface',
      entityId: targetId || '',
      summary,
    },
  };
}

function linkEntities(draft, ctx, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }) {
  return ensureEntityLink(
    draft,
    { sourceType, sourceId, targetType, targetId, relation, ruleId, summary },
    { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() },
  ).created;
}

export function interfaceRule(draft, rawCtx = {}) {
  const event = rawCtx.event;
  if (!draft || !event?.type || !SENSING_TRIGGERS.has(event.type)) return [];

  const now = rawCtx.now instanceof Date ? rawCtx.now : new Date(rawCtx.now || Date.now());
  const idFactory = typeof rawCtx.idFactory === 'function' ? rawCtx.idFactory : defaultIdFactory;
  const ctx = { ...rawCtx, now, idFactory };
  const conventions = interfaceConventions(draft.settings || {});

  // Explicit scan always executes; automatic background triggers honour pause switch.
  if (!conventions.autoPropagate && event.type !== INTERFACE_EVENTS.SCANNED) {
    return [];
  }

  const effects = [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const isoWk = weekKey(now);

  // ---- RULE-INT-06a: Reconcile stale boundary edges on scan ----
  if (event.type === INTERFACE_EVENTS.SCANNED) {
    const pactIds = new Set((draft.interfacePacts || []).map((p) => p?.id).filter(Boolean));
    const auditIds = new Set((draft.interfaceAudits || []).map((a) => a?.id).filter(Boolean));
    const ruleSet = new Set(Object.values(INTERFACE_RULE_IDS));
    const before = (draft.links || []).length;
    draft.links = (draft.links || []).filter((l) => {
      if (!l || !ruleSet.has(l.ruleId)) return true;
      if (l.sourceType === 'interface' && !pactIds.has(l.sourceId)) return false;
      if (l.targetType === 'interface' && !pactIds.has(l.targetId)) return false;
      if (l.sourceType === 'interfaceAudit' && !auditIds.has(l.sourceId)) return false;
      if (l.targetType === 'interfaceAudit' && !auditIds.has(l.targetId)) return false;
      return true;
    });
    if (draft.links.length < before) {
      effects.push(
        eff(
          INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
          'reconciled',
          'links',
          '',
          `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}: Removed ${before - draft.links.length} stale boundary link(s).`,
        ),
      );
    }
  }

  // ---- RULE-INT-05: Cross-module case & dependency contagion sensing ----
  if (
    ['case.created', 'case.updated', 'dependency.created', 'dependency.updated', INTERFACE_EVENTS.PACT_CREATED, INTERFACE_EVENTS.SCANNED].includes(
      event.type,
    )
  ) {
    const activePacts = (draft.interfacePacts || []).filter((p) => p && p.status !== 'retired');
    const openCases = (draft.cases || []).filter((c) => c && !['resolved', 'closed'].includes(c.status));
    const activeDeps = (draft.dependencies || []).filter((d) => d && d.status !== 'retired');

    for (const pact of activePacts) {
      const targetKey = norm(pact.targetUnit);
      for (const c of openCases) {
        const matchesStakeholder = Array.isArray(c.stakeholders) && c.stakeholders.some(
          (sh) => norm(sh?.org) === targetKey || norm(sh?.name) === targetKey || norm(sh?.role) === targetKey,
        );
        const matchesBarrier = norm(c.systemicBarrier).includes(targetKey) && targetKey.length >= 4;
        const matchesEscalation = c.type === 'escalation' && norm(c.title).includes(targetKey) && targetKey.length >= 4;
        if (!matchesStakeholder && !matchesBarrier && !matchesEscalation) continue;

        const tag = `${INTERFACE_RULE_IDS.CONTAGION_LINK}:case:${pact.id}:${c.id}`;
        if (hasMarker(draft, tag)) continue;
        addMarker(draft, tag);
        if (
          linkEntities(draft, ctx, {
            sourceType: 'case',
            sourceId: c.id,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'strains-interface',
            ruleId: INTERFACE_RULE_IDS.CONTAGION_LINK,
            summary: `Operational case touches boundary ${pact.sourceUnit} → ${pact.targetUnit}.`,
          })
        ) {
          effects.push(
            eff(
              INTERFACE_RULE_IDS.CONTAGION_LINK,
              'linked',
              'interface',
              pact.id,
              `${INTERFACE_RULE_IDS.CONTAGION_LINK}: Linked operational case “${c.title}” to Operating Pact “${pact.title}”.`,
            ),
          );
        }
      }

      for (const dep of activeDeps) {
        const depMatches =
          (pact.dependencyId && pact.dependencyId === dep.id) ||
          (targetKey.length >= 4 && (norm(dep.vendor) === targetKey || norm(dep.name) === targetKey));
        if (!depMatches) continue;
        const tag = `${INTERFACE_RULE_IDS.CONTAGION_LINK}:dep:${pact.id}:${dep.id}`;
        if (hasMarker(draft, tag)) continue;
        addMarker(draft, tag);
        if (
          linkEntities(draft, ctx, {
            sourceType: 'dependency',
            sourceId: dep.id,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'strains-interface',
            ruleId: INTERFACE_RULE_IDS.CONTAGION_LINK,
            summary: `Operational dependency underpins boundary ${pact.sourceUnit} → ${pact.targetUnit}.`,
          })
        ) {
          effects.push(
            eff(
              INTERFACE_RULE_IDS.CONTAGION_LINK,
              'linked',
              'interface',
              pact.id,
              `${INTERFACE_RULE_IDS.CONTAGION_LINK}: Linked dependency “${dep.name}” to Operating Pact “${pact.title}”.`,
            ),
          );
        }
      }
    }
  }

  // ---- Evaluate queue network & relational pacts for RULE-INT-01..04 ----
  if (
    [
      INTERFACE_EVENTS.PACT_CREATED,
      INTERFACE_EVENTS.PACT_UPDATED,
      INTERFACE_EVENTS.EXCHANGE_RECORDED,
      INTERFACE_EVENTS.SCANNED,
    ].includes(event.type)
  ) {
    const report = interfaceReport(draft, now);
    const targetPactId =
      event.type === INTERFACE_EVENTS.SCANNED ? null : event.entityId || null;
    const candidateRows = targetPactId
      ? report.rows.filter((r) => r.pact.id === targetPactId)
      : report.rows;

    for (const row of candidateRows) {
      const { pact, queue, compliance } = row;
      const owner = resolveLeaderOrOwner(draft, pact.ownerId);
      const leaderName = String(owner?.name || draft.settings?.leaderName || 'Workspace leader').slice(0, 120);

      // RULE-INT-01: Queue instability (ρ ≥ 1) or rework bounce ≥ threshold
      const bounceBreached =
        (compliance.bounce && compliance.bounce.rate >= conventions.bounceWarn) ||
        (!compliance.bounce && row.effectiveReworkRate >= conventions.bounceWarn && (row.baseArrival ?? 0) > 0);
      if (queue.unstable || bounceBreached) {
        const tag = `${INTERFACE_RULE_IDS.CIRCUIT_BREAKER}:${pact.id}:${isoWk}`;
        if (!hasMarker(draft, tag)) {
          addMarker(draft, tag);
          const decId = idFactory('dec');
          const rhoLabel = queue.rho !== null ? `ρ = ${Math.round(queue.rho * 100)}%` : 'unparameterized capacity';
          const dec = {
            id: decId,
            title: `Boundary circuit-breaker: ${pact.sourceUnit} → ${pact.targetUnit} (${rhoLabel})`,
            question: `Operating Pact “${pact.title}” has effective arrival ${row.effectiveArrival ?? '—'}/wk (${Math.round(row.effectiveReworkRate * 100)}% rework bounce, ${row.reworkMultiplier}× load multiplier) against capacity ${pact.serviceCapacityPerWeek ?? '—'}/wk. Which structural lever stabilizes flow?`,
            date: todayStr,
            reversibility: 'reversible',
            driver: leaderName,
            approver: leaderName,
            contributors: pact.targetUnit,
            informed: pact.sourceUnit,
            options: [
              { id: idFactory('opt'), label: 'Enforce Intake Definition-of-Ready checklist', pros: 'Halves rework bounce without headcount cost.', cons: 'Requires rejecting incomplete asks at intake.' },
              { id: idFactory('opt'), label: 'Convert routine asks to self-service X-as-a-Service', pros: 'Diverts routine volume off the synchronous gate.', cons: 'Upfront guardrail investment.' },
              { id: idFactory('opt'), label: 'Batch & cap concurrent WIP across the boundary', pros: 'Cuts arrival burstiness C_a² and protects throughput.', cons: 'Explicitly queues low-priority requests.' },
              { id: idFactory('opt'), label: 'Embed temporary Facilitating capacity', pros: 'Raises gate μ directly.', cons: 'Increases coordination overhead.' },
            ],
            chosen: '',
            rationale: `Opened by [${tag}]. Queue physics (Jackson/Whitt QNA) shows ${queue.unstable ? 'structural saturation (ρ ≥ 100%)' : `${Math.round(row.effectiveReworkRate * 100)}% bounce amplification`}. The leader chooses the lever, never the rule.`,
            reviewOn: dayKey(addDays(now, 14)),
            reviewedOn: null,
            outcome: 'pending',
            outcomeNotes: '',
            forecastProbability: null,
            decidedOn: null,
            createdAt: nowIso,
          };
          draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
          draft.decisions.unshift(dec);
          linkEntities(draft, ctx, {
            sourceType: 'decision',
            sourceId: decId,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'governs-interface',
            ruleId: INTERFACE_RULE_IDS.CIRCUIT_BREAKER,
            summary: `Boundary circuit-breaker decision for ${pact.sourceUnit} → ${pact.targetUnit}.`,
          });
          const summary = `${INTERFACE_RULE_IDS.CIRCUIT_BREAKER}: Opened DACI circuit-breaker decision for boundary “${pact.title}” (${rhoLabel}).`;
          if (typeof ctx.enqueue === 'function') {
            ctx.enqueue({ type: 'decision.created', entity: 'decision', entityId: decId, summary });
          }
          effects.push(eff(INTERFACE_RULE_IDS.CIRCUIT_BREAKER, 'created', 'decision', decId, summary));
        }
      }

      // RULE-INT-02: High congestion externality pacing delegation
      const highExt =
        !queue.unstable &&
        queue.rho !== null &&
        (queue.rho >= conventions.highUtil ||
          (queue.weeklyExternalityCost !== null && queue.weeklyExternalityCost >= conventions.externalityThreshold));
      if (highExt && owner) {
        const tag = `${INTERFACE_RULE_IDS.EXTERNALITY_PACING}:${pact.id}:${isoWk}`;
        if (!hasMarker(draft, tag)) {
          addMarker(draft, tag);
          const pricePhrase =
            queue.weeklyExternalityCost !== null
              ? ` (${queue.currency} ${queue.weeklyExternalityCost.toLocaleString('en-US')}/wk congestion externality)`
              : '';
          const del = makeDelegation(ctx, {
            personId: owner.id,
            title: `Pace & batch outbound intake into ${pact.targetUnit} (${queue.socialToPrivateRatio}× externality)`,
            expectedOutcome: `At ρ = ${Math.round(queue.rho * 100)}%, each unbatched request waits ${queue.privateWaitDays}d privately while imposing ${queue.marginalExternalityDaysPerItem}d of extra delay on other queued work${pricePhrase}. Establish a weekly batching cadence and WIP cap before accelerating upstream throughput.`,
            support: `${INTERFACE_RULE_IDS.EXTERNALITY_PACING} (Naor 1969 queue-externality guardrail) on pact “${pact.title}”.`,
            dueDays: 7,
            tag,
          });
          draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
          draft.delegations.unshift(del);
          linkEntities(draft, ctx, {
            sourceType: 'delegation',
            sourceId: del.id,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'congests',
            ruleId: INTERFACE_RULE_IDS.EXTERNALITY_PACING,
            summary: `Pacing action to curb ${queue.socialToPrivateRatio}× congestion externality on ${pact.targetUnit}.`,
          });
          effects.push(
            eff(
              INTERFACE_RULE_IDS.EXTERNALITY_PACING,
              'created',
              'delegation',
              del.id,
              `${INTERFACE_RULE_IDS.EXTERNALITY_PACING}: Opened intake-pacing delegation on ${owner.name} for ${pact.targetUnit}${pricePhrase}.`,
            ),
          );
        }
      }

      // RULE-INT-03: Clean-Hands Self-Repair Guardrail (anti-blame-shifting!)
      if (
        (compliance.verdict === 'dirty-hands-asymmetry' || compliance.verdict === 'our-intake-breach') &&
        owner
      ) {
        const tag = `${INTERFACE_RULE_IDS.CLEAN_HANDS_REPAIR}:${pact.id}:${isoWk}`;
        if (!hasMarker(draft, tag)) {
          addMarker(draft, tag);
          const ourPct = Math.round((compliance.ourIntake?.rate || 0) * 100);
          const del = makeDelegation(ctx, {
            personId: owner.id,
            title: `Repair our intake Definition-of-Ready for ${pact.targetUnit} (${ourPct}% clean)`,
            expectedOutcome: `Our team met agreed intake commitment (“${pact.ourGive || 'complete spec'}”) on ${compliance.cleanCount}/${compliance.totalExchanges} exchanges (${ourPct}%, below ${conventions.cleanHandsFloorPct}% Clean-Hands floor). Audit the ${compliance.dirtyCount} incomplete submission(s) and enforce pre-flight checks before escalating counterparty turnaround.`,
            support: `${INTERFACE_RULE_IDS.CLEAN_HANDS_REPAIR} blocked one-sided blame escalation on “${pact.title}”.`,
            dueDays: 5,
            tag,
          });
          draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
          draft.delegations.unshift(del);
          linkEntities(draft, ctx, {
            sourceType: 'delegation',
            sourceId: del.id,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'repairs-intake',
            ruleId: INTERFACE_RULE_IDS.CLEAN_HANDS_REPAIR,
            summary: `Clean-Hands intake repair (${ourPct}% clean vs ${conventions.cleanHandsFloorPct}% floor).`,
          });
          addSafeTalkingPoint(
            owner,
            `Boundary hygiene (${pact.sourceUnit}→${pact.targetUnit}): ${compliance.cleanCount}/${compliance.totalExchanges} asks met intake spec; what pre-flight check removes rework?`,
            tag,
          );
          effects.push(
            eff(
              INTERFACE_RULE_IDS.CLEAN_HANDS_REPAIR,
              'created',
              'delegation',
              del.id,
              `${INTERFACE_RULE_IDS.CLEAN_HANDS_REPAIR}: Clean-Hands Gate blocked counterparty escalation and opened intake self-repair (${ourPct}% clean).`,
            ),
          );
        }
      }

      // RULE-INT-04: Credible Bilateral SLA Renegotiation (clean hands verified!)
      if (compliance.verdict === 'clean-hands-counterparty-breach') {
        const tag = `${INTERFACE_RULE_IDS.CREDIBLE_RENEGOTIATION}:${pact.id}:${isoWk}`;
        if (!hasMarker(draft, tag)) {
          addMarker(draft, tag);
          const ourPct = Math.round(compliance.ourIntake.rate * 100);
          const theirPct = Math.round(compliance.theirSla.rate * 100);
          const resetScript = buildBoundaryResetScript(row);

          // 1) Open Harvard-principled bilateral negotiation workstream in `#/negotiations`
          const negId = idFactory('neg');
          const neg = {
            id: negId,
            title: `Reset Operating Pact: ${pact.sourceUnit} ↔ ${pact.targetUnit} (${theirPct}% SLA)`,
            kind: 'scope-deadline',
            status: 'preparing',
            counterparty: pact.targetUnit,
            counterpartyRole: 'Boundary partner unit',
            ownerId: owner?.id || null,
            linkedGoalId: null,
            sourceType: 'interface',
            sourceId: pact.id,
            openedOn: todayStr,
            nextSessionOn: dayKey(addDays(now, 5)),
            reviewOn: dayKey(addDays(now, 21)),
            closedOn: null,
            strategic: true,
            stakesValue: queue.weeklyExternalityCost ?? null,
            stakesCurrency: queue.currency || pact.currency || 'USD',
            ourBatnaDescription: `Decouple routine requests into self-service guardrails or escalate explicit WIP trade-off with ${ourPct}% clean-intake evidence.`,
            ourBatnaValue: null,
            ourBatnaUnit: '',
            theirBatnaEstimate: `${pact.targetUnit} continues absorbing ad-hoc escalations without a bounded WIP cap.`,
            ourInterests: [
              pact.theirGive || `Predictable ≤${pact.turnaroundDays}d turnaround`,
              'Eliminate unpriced downstream queue delay',
            ],
            theirInterests: [
              pact.ourGive || 'Clean, complete intake specs',
              'Protected concurrent WIP ceiling',
            ],
            objectiveCriteria: [
              `Our intake hygiene: ${compliance.cleanCount}/${compliance.totalExchanges} (${ourPct}%, 95% Wilson [${Math.round(compliance.ourIntake.lo * 100)}%, ${Math.round(compliance.ourIntake.hi * 100)}%])`,
              `Counterparty ${pact.turnaroundDays}d SLA: ${compliance.slaMetCount}/${compliance.settledExchanges} (${theirPct}%, 95% Wilson [${Math.round(compliance.theirSla.lo * 100)}%, ${Math.round(compliance.theirSla.hi * 100)}%])`,
            ],
            options: [
              'Establish explicit weekly WIP cap + dedicated review slot',
              'Carve out pre-approved fast-lane for low-risk standard asks',
              'Adjust SLA window to match real service capacity μ',
            ],
            issues: [
              {
                id: idFactory('iss'),
                name: 'Turnaround SLA (days)',
                unit: 'days',
                direction: 'lower-better',
                weight: 60,
                ourTarget: pact.turnaroundDays,
                ourReservation: Math.min(90, pact.turnaroundDays * 2),
                theirTargetEstimate: Math.max(pact.turnaroundDays + 2, Math.round(compliance.medianTurnaroundDays || pact.turnaroundDays + 3)),
                theirReservationEstimate: pact.turnaroundDays,
                estimateConfidence: 'medium',
              },
            ],
            agreedTerms: [],
            settlement: null,
            outcomeNotes: '',
            notes: resetScript.slice(0, 3900),
            escalationCaseId: null,
            autoPropagate: true,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          draft.negotiations = Array.isArray(draft.negotiations) ? draft.negotiations : [];
          draft.negotiations.unshift(neg);

          linkEntities(draft, ctx, {
            sourceType: 'negotiation',
            sourceId: negId,
            targetType: 'interface',
            targetId: pact.id,
            relation: 'renegotiates-pact',
            ruleId: INTERFACE_RULE_IDS.CREDIBLE_RENEGOTIATION,
            summary: `Principled SLA reset backed by ${ourPct}% clean intake vs ${theirPct}% SLA compliance.`,
          });
          if (pact.stakeholderId) {
            linkEntities(draft, ctx, {
              sourceType: 'negotiation',
              sourceId: negId,
              targetType: 'stakeholder',
              targetId: pact.stakeholderId,
              relation: 'involves',
              ruleId: INTERFACE_RULE_IDS.CREDIBLE_RENEGOTIATION,
              summary: `Counterparty stakeholder on Operating Pact “${pact.title}”.`,
            });
          }

          effects.push(
            eff(
              INTERFACE_RULE_IDS.CREDIBLE_RENEGOTIATION,
              'created',
              'negotiation',
              negId,
              `${INTERFACE_RULE_IDS.CREDIBLE_RENEGOTIATION}: Opened principled SLA negotiation workstream (${ourPct}% clean intake vs ${theirPct}% counterparty SLA).`,
            ),
          );
        }
      }
    }
  }

  // ---- RULE-INT-06b/c/d: Audit freeze link, overdue grading task & Brier surprise ----
  if (event.type === INTERFACE_EVENTS.AUDIT_FROZEN && event.entityId) {
    const audit = (draft.interfaceAudits || []).find((a) => a && a.id === event.entityId);
    if (audit) {
      const tag = `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}:freeze:${audit.id}`;
      if (!hasMarker(draft, tag)) {
        addMarker(draft, tag);
        if (
          linkEntities(draft, ctx, {
            sourceType: 'interfaceAudit',
            sourceId: audit.id,
            targetType: 'interface',
            targetId: audit.pactId,
            relation: 'audits-interface',
            ruleId: INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
            summary: `Prospective ${audit.horizonDays}d compliance forecast (${Math.round(audit.predictedComplianceProb * 100)}%) for review ${audit.reviewOn}.`,
          })
        ) {
          effects.push(
            eff(
              INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
              'linked',
              'interface',
              audit.pactId,
              `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}: Linked frozen Pact Audit to Operating Pact.`,
            ),
          );
        }
      }
    }
  }

  if (event.type === INTERFACE_EVENTS.SCANNED) {
    const owner = resolveLeaderOrOwner(draft);
    if (owner) {
      const pactIds = new Set((draft.interfacePacts || []).map((p) => p?.id));
      for (const audit of draft.interfaceAudits || []) {
        if (!audit || audit.status === 'graded' || audit.grade || audit.reviewOn > todayStr || !pactIds.has(audit.pactId)) {
          continue;
        }
        const tag = `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}:due:${audit.id}`;
        if (hasMarker(draft, tag)) continue;
        addMarker(draft, tag);
        const del = makeDelegation(ctx, {
          personId: owner.id,
          title: `Grade overdue Operating Pact forecast (review due ${audit.reviewOn})`,
          expectedOutcome: `Score frozen ${Math.round(audit.predictedComplianceProb * 100)}% joint-compliance prediction once against settled exchanges recorded inside (${audit.frozenOn}, ${audit.reviewOn}].`,
          support: `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE} overdue forecast check.`,
          dueDays: 3,
          tag,
        });
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(del);
        linkEntities(draft, ctx, {
          sourceType: 'interfaceAudit',
          sourceId: audit.id,
          targetType: 'delegation',
          targetId: del.id,
          relation: 'tracks-followup',
          ruleId: INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
          summary: 'Due Brier grading task for frozen Operating Pact audit.',
        });
        effects.push(
          eff(
            INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
            'created',
            'delegation',
            del.id,
            `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}: Opened grading delegation for overdue Pact Audit ${audit.id}.`,
          ),
        );
      }
    }
  }

  if (event.type === INTERFACE_EVENTS.AUDIT_GRADED && event.entityId) {
    const audit = (draft.interfaceAudits || []).find((a) => a && a.id === event.entityId);
    const pact = audit ? (draft.interfacePacts || []).find((p) => p && p.id === audit.pactId) : null;
    const owner = resolveLeaderOrOwner(draft, pact?.ownerId || null);
    if (audit?.grade && audit.grade.brier > 0.25 && owner) {
      const tag = `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}:learn:${audit.id}`;
      if (!hasMarker(draft, tag)) {
        addMarker(draft, tag);
        const del = makeDelegation(ctx, {
          personId: owner.id,
          title: `Boundary forecast post-mortem (Brier ${audit.grade.brier})`,
          expectedOutcome: `Frozen compliance forecast (${Math.round(audit.predictedComplianceProb * 100)}%) missed realized joint-clean rate (${Math.round(audit.grade.realizedRate * 100)}% over ${audit.grade.windowExchanges} exchanges; Brier ${audit.grade.brier}). Inspect whether intake burstiness, rework or capacity shifted, and update the Operating Pact clauses. Blameless system check — never a rating of a person.`,
          support: `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE} Brier surprise learning loop.`,
          dueDays: 7,
          tag,
        });
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(del);
        linkEntities(draft, ctx, {
          sourceType: 'interfaceAudit',
          sourceId: audit.id,
          targetType: 'delegation',
          targetId: del.id,
          relation: 'tracks-followup',
          ruleId: INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
          summary: `Blameless boundary learning task after Brier ${audit.grade.brier}.`,
        });
        effects.push(
          eff(
            INTERFACE_RULE_IDS.AUDIT_LIFECYCLE,
            'created',
            'delegation',
            del.id,
            `${INTERFACE_RULE_IDS.AUDIT_LIFECYCLE}: Opened blameless boundary-learning delegation after Brier ${audit.grade.brier}.`,
          ),
        );
      }
    }
  }

  return effects;
}

Object.defineProperty(interfaceRule, 'name', { value: 'boundary-interfaces' });
interfaceRule.id = 'boundary-interfaces';
