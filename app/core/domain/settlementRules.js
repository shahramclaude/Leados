/**
 * app/core/domain/settlementRules.js — Generalized Post-Commit Automation Spine
 * for Outcome Attribution & Loop Settlement (RULE-STL-01..05, Schema v75, ADR-0067).
 *
 * Trigger discipline:
 *  - Full pass runs on `settlement.*` events (`settlement.frozen`,
 *    `settlement.recorded`, `settlement.archived`, `settlement.scan`).
 *  - Cheap O(1)-guarded pass runs on `case.resolved` and `premise.outcome`
 *    ONLY when at least one `frozen` settlement exists in `draft.settlements`,
 *    automatically grading frozen forecasts whose loop just resolved.
 *
 * Marker-idempotent: every generated decision, delegation, 1:1 prompt, premise
 * advisory and retro draft carries a deterministic `[STL-0X:...]` token so
 * repeated scans or replays are strict no-ops.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { isCaseOpen, resolveLinkedEntity } from './cases.js';
import { buildSettlementVerdict, extractControlLoops } from './settlement.js';
import {
  SETTLEMENT_EVENTS,
  SETTLEMENT_LIMITS,
  SETTLEMENT_RULE_IDS,
} from './settlementRegistry.js';

const DIRECT_EVENTS = new Set([
  SETTLEMENT_EVENTS.FROZEN,
  SETTLEMENT_EVENTS.RECORDED,
  SETTLEMENT_EVENTS.ARCHIVED,
  SETTLEMENT_EVENTS.SCAN,
]);

const OUTCOME_TRIGGER_EVENTS = new Set([
  'case.resolved',
  'premise.outcome',
]);

function sourceNodeType(loopKind) {
  if (loopKind === 'bundle') return 'bundle';
  if (loopKind === 'response') return 'response';
  return 'case';
}

function activePerson(draft, id) {
  if (!id) return null;
  return (draft.people || []).find((p) => p && p.id === id && p.status !== 'archived') || null;
}

export function settlementRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!draft || !event || typeof event.type !== 'string') return [];

  const isDirect = DIRECT_EVENTS.has(event.type);
  const isOutcomeTrigger = OUTCOME_TRIGGER_EVENTS.has(event.type);
  if (!isDirect && !isOutcomeTrigger) return [];

  draft.settlements = Array.isArray(draft.settlements) ? draft.settlements : [];
  // Fast exit on unrelated case/premise closures when no frozen forecast awaits grading.
  if (isOutcomeTrigger && !draft.settlements.some((s) => s && s.status === 'frozen')) {
    return [];
  }

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const linkOpts = { idFactory, todayStr, nowIso };
  const autoEnabled = draft.settings?.settlementAutoPropagate !== false;
  const effects = [];

  const addEffect = (ruleId, action, targetType, targetId, summary) => {
    effects.push({ ruleId, action, targetType, targetId, summary });
    if (typeof ctx.log === 'function') {
      ctx.log({ ruleId, action, targetType, targetId, summary });
    }
  };

  const link = (sourceType, sourceId, targetType, targetId, relation, ruleId, summary) => {
    if (!resolveLinkedEntity(draft, sourceType, sourceId) || !resolveLinkedEntity(draft, targetType, targetId)) {
      return false;
    }
    const res = ensureEntityLink(draft, {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId,
      summary,
    }, linkOpts);
    if (res.created) addEffect(ruleId, 'linked', targetType, targetId, summary);
    return res.created;
  };

  let loops = extractControlLoops(draft, now, draft.settings);
  const loopByKey = new Map(loops.map((l) => [l.loopKey, l]));

  // RULE-STL-05 (part A): Grade due or newly resolved `frozen` settlements once out of sample.
  if (event.type === SETTLEMENT_EVENTS.SCAN || isOutcomeTrigger) {
    const outcomePremiseId = event.type === 'premise.outcome'
      ? ((draft.premiseOutcomes || []).find((o) => o && o.id === event.entityId)?.premiseId || event.entityId)
      : null;
    for (const s of draft.settlements) {
      if (!s || s.status !== 'frozen') continue;
      const loop = loopByKey.get(s.loopKey);
      if (!loop) continue;
      const windowClosed = Boolean(s.reviewOn && s.reviewOn <= todayStr);
      const outcomeTriggered = isOutcomeTrigger && (
        (event.type === 'case.resolved' && loop.caseId === event.entityId)
        || (event.type === 'premise.outcome' && loop.items.some((i) => i.kind === 'premise' && i.id === outcomePremiseId))
      );
      if (!windowClosed && !outcomeTriggered) continue;

      const verdict = buildSettlementVerdict(loop, {
        predictedCleanClosurePct: s.predictedCleanClosurePct,
        frozenAt: s.frozenAt,
        settledAt: nowIso,
      });
      s.status = 'settled';
      s.settledAt = nowIso;
      s.settledOn = todayStr;
      s.verdict = verdict;
      s.updatedAt = nowIso;
      s.history = [
        ...(Array.isArray(s.history) ? s.history : []),
        {
          at: nowIso,
          type: 'graded',
          summary: `Graded out-of-sample on ${todayStr}: ${verdict.regime} (Brier ${verdict.brier ?? 'n/a'}).`,
        },
      ].slice(-SETTLEMENT_LIMITS.maxHistory);
      addEffect(
        SETTLEMENT_RULE_IDS.GRADE_RECONCILE,
        'graded',
        'settlement',
        s.id,
        `Graded frozen loop forecast "${s.label}" (${verdict.regime}, Brier ${verdict.brier ?? 'n/a'})`,
      );

      // Open one calibration review delegation if Brier >= 0.25 and automation is on.
      if (autoEnabled && verdict.brier !== null && verdict.brier >= SETTLEMENT_LIMITS.poorBrierThreshold) {
        const calToken = `[STL-05-CAL:${s.id}]`;
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        const existingCal = draft.delegations.find((d) => (d?.support || '').includes(calToken));
        const owner = activePerson(draft, loop.delegateIds[0] || (loop.caseId && (draft.cases || []).find((c) => c.id === loop.caseId)?.ownerId));
        if (!existingCal && owner) {
          const task = {
            id: idFactory('del'),
            personId: owner.id,
            title: `Review loop closure forecast miss: ${loop.title}`.slice(0, 200),
            expectedOutcome: `Compare the frozen ${s.predictedCleanClosurePct}% closure forecast against the realized clearance (${verdict.clearancePct}%) and thesis state (${verdict.thesisState}).`,
            authority: 'recommend',
            support: `Blameless calibration review (Brier ${verdict.brier}). Inspect which clearance gates or signposts diverged. ${calToken}`,
            delegatedOn: todayStr,
            dueOn: addDays(todayStr, 7),
            status: 'active',
            checkins: [],
            completedOn: null,
            completionNote: '',
            returnedOn: null,
            returnReason: '',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          draft.delegations.push(task);
          link('settlement', s.id, 'delegation', task.id, 'tracks-followup', SETTLEMENT_RULE_IDS.GRADE_RECONCILE, 'Out-of-sample closure forecast calibration check');
          addEffect(SETTLEMENT_RULE_IDS.GRADE_RECONCILE, 'created', 'delegation', task.id, 'Opened loop forecast calibration check');
        }
      }
    }
    // Refresh loop map if any settlement just moved from frozen to settled.
    loops = extractControlLoops(draft, now, draft.settings);
  }

  // Process active settlement records for RULE-STL-01..04.
  for (const s of draft.settlements) {
    if (!s || s.status === 'archived') continue;
    const isTargetEvent = event.type === SETTLEMENT_EVENTS.SCAN
      || isOutcomeTrigger
      || event.entityId === s.id;
    if (!isTargetEvent) continue;

    const loop = loops.find((l) => l.loopKey === s.loopKey);
    const srcType = sourceNodeType(s.loopKind);

    // RULE-STL-01: Typed provenance edges (`settles-loop`, `exonerates-delivery`, `flags-bottleneck`).
    link('settlement', s.id, srcType, s.sourceId, 'settles-loop', SETTLEMENT_RULE_IDS.LINK, 'Loop settlement & attribution receipt');
    if (s.caseId && srcType !== 'case') {
      link('settlement', s.id, 'case', s.caseId, 'settles-loop', SETTLEMENT_RULE_IDS.LINK, 'Case covered by loop settlement receipt');
    }

    const effectiveRegime = s.status === 'settled' && s.verdict ? s.verdict.regime : loop?.attribution.regime;
    const effectiveZone = s.status === 'settled' && s.verdict ? s.verdict.feverZone : loop?.fever.zone;

    if (effectiveRegime === 'thesis-falsified-clean-execution' && loop) {
      for (const personId of loop.delegateIds) {
        link('settlement', s.id, 'person', personId, 'exonerates-delivery', SETTLEMENT_RULE_IDS.LINK, 'Clean execution verified despite falsified thesis');
      }
    }
    if (effectiveRegime === 'execution-stalled-leader-gated' && loop) {
      for (const decId of loop.blockingDecisionIds) {
        link('settlement', s.id, 'decision', decId, 'flags-bottleneck', SETTLEMENT_RULE_IDS.LINK, 'Unchosen leader-gated decision blocking loop');
      }
    }

    if (!autoEnabled || !loop) continue;

    // RULE-STL-02: Double-loop thesis pivot + blameless team exoneration on settled `thesis-falsified-clean-execution`.
    if (s.status === 'settled' && effectiveRegime === 'thesis-falsified-clean-execution') {
      // 1. Queue blameless delivery recognition prompt on each active delegate's 1:1 list.
      for (const personId of loop.delegateIds) {
        const person = activePerson(draft, personId);
        if (!person) continue;
        const token = `[STL-02:${s.id}]`;
        const already = (person.talkingPoints || []).some((tp) => tp.includes(token));
        if (!already && (person.talkingPoints || []).length < 12) {
          const head = `Credit clean delivery on "${loop.title.slice(0, 44)}" separately from the falsified premise — good execution is never penalised for a false bet.`.slice(0, 150);
          const prompt = `${head} ${token}`;
          person.talkingPoints = [...(person.talkingPoints || []), prompt];
          person.updatedAt = nowIso;
          addEffect(SETTLEMENT_RULE_IDS.THESIS_PIVOT, 'updated', 'person', person.id, 'Queued blameless clean-execution credit prompt');
        }
      }

      // 2. Open ONE governed DACI double-loop thesis-pivot decision (priced downstream by decisionTempoRule).
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      const decToken = `[STL-02-DEC:${s.id}]`;
      let pivotDec = draft.decisions.find((d) => (d?.context || d?.rationale || d?.question || '').includes(decToken));
      if (!pivotDec) {
        pivotDec = {
          id: idFactory('dec'),
          title: `Pivot falsified thesis: ${loop.title}`.slice(0, 180),
          question: `Execution cleared at ${loop.delegateClearancePct ?? loop.executionClearancePct}%, yet the governing thesis failed. Which revised intervention or scope replaces it? ${decToken}`,
          context: `Double-loop pivot opened from Outcome Attribution (${s.id}). Delegated execution met the ${draft.settings?.settlementFidelityFloorPct ?? 75}% fidelity floor and is exonerated. ${decToken}`,
          date: todayStr,
          reviewOn: addDays(todayStr, 14),
          reversibility: 'two-way',
          driver: draft.settings?.leaderName || 'Workspace leader',
          approver: '',
          contributors: [],
          informed: [],
          options: [
            { id: idFactory('opt'), label: 'Adopt a revised causal intervention', pros: 'Addresses the falsified assumption directly', cons: 'Requires fresh scope' },
            { id: idFactory('opt'), label: 'Contain & close exposure with explicit stop rule', pros: 'Bounds further spend', cons: 'Forgoes upside' },
          ],
          chosen: '',
          rationale: '',
          outcome: 'pending',
          outcomeNotes: '',
          reviewedOn: null,
          status: 'open',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draft.decisions.push(pivotDec);
        addEffect(SETTLEMENT_RULE_IDS.THESIS_PIVOT, 'created', 'decision', pivotDec.id, 'Opened double-loop thesis-pivot DACI decision');
      }
      link('settlement', s.id, 'decision', pivotDec.id, 'decides', SETTLEMENT_RULE_IDS.THESIS_PIVOT, 'Double-loop pivot decision for falsified thesis');

      // 3. Seed or enrich an After-Action Review draft if the source case is closed with a dated resolution.
      if (s.caseId) {
        const closedCase = (draft.cases || []).find((c) => c && c.id === s.caseId && !isCaseOpen(c) && c.resolvedOn);
        if (closedCase) {
          draft.retros = Array.isArray(draft.retros) ? draft.retros : [];
          let retro = draft.retros.find((r) => r && r.subjectType === 'case' && r.subjectId === closedCase.id);
          if (!retro) {
            retro = {
              id: idFactory('retro'),
              subjectType: 'case',
              subjectId: closedCase.id,
              subjectLabel: closedCase.title || 'Settled case',
              outcomeOn: closedCase.resolvedOn,
              status: 'draft',
              autoDrafted: true,
              intended: `Loop "${loop.title}" expected recovery to hold with ${draft.settings?.settlementFidelityFloorPct ?? 75}%+ execution clearance.`,
              actual: `Execution cleared cleanly (${loop.delegateClearancePct ?? loop.executionClearancePct}%), while the governing thesis was falsified.`,
              cause: '',
              sustain: 'Delegated execution met the fidelity bar; preserve delivery cadence without blame.',
              improve: '',
              skipReason: '',
              heldOn: null,
              participants: [...loop.delegateIds],
              lessons: [],
              createdAt: nowIso,
              updatedAt: nowIso,
              history: [{ at: nowIso, type: 'created', summary: `Seeded by RULE-STL-02 from settlement ${s.id}` }],
            };
            draft.retros.push(retro);
            addEffect(SETTLEMENT_RULE_IDS.THESIS_PIVOT, 'created', 'retro', retro.id, 'Drafted AAR separating clean delivery from falsified thesis');
          }
          link('settlement', s.id, 'retro', retro.id, 'informs', SETTLEMENT_RULE_IDS.THESIS_PIVOT, 'Attribution evidence informing After-Action Review');
        }
      }
    }

    // RULE-STL-03: Leader-bottleneck self-escalation when Red zone & `execution-stalled-leader-gated`.
    if (effectiveRegime === 'execution-stalled-leader-gated' && effectiveZone === 'red') {
      for (const decId of loop.blockingDecisionIds) {
        const dec = (draft.decisions || []).find((d) => d && d.id === decId);
        if (!dec) continue;
        const token = `[STL-03:${s.id}]`;
        const currentCtx = String(dec.context || '');
        if (!currentCtx.includes(token)) {
          dec.context = `${currentCtx ? `${currentCtx} ` : ''}Leader-gated bottleneck flagged on ${todayStr}: loop "${loop.title}" is in the Red fever zone while delegated execution outpaces leader clearance. Choose an option before delegating more follow-up. ${token}`.slice(0, 1200);
          dec.updatedAt = nowIso;
          addEffect(SETTLEMENT_RULE_IDS.LEADER_BOTTLENECK, 'updated', 'decision', dec.id, 'Flagged unchosen leader-gated decision in Red fever zone');
        }
      }
    }

    // RULE-STL-04: Type-III error guard & single-loop unblocking on `execution-drift-untested-thesis`.
    if ((s.status === 'settled' || event.type === SETTLEMENT_EVENTS.SCAN) && effectiveRegime === 'execution-drift-untested-thesis') {
      const unblockToken = `[STL-04:${s.id}]`;
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      const existingUnblock = draft.delegations.find((d) => (d?.support || '').includes(unblockToken));
      const owner = activePerson(draft, loop.delegateIds[0] || (s.caseId && (draft.cases || []).find((c) => c.id === s.caseId)?.ownerId));
      if (!existingUnblock && owner) {
        const unblockTask = {
          id: idFactory('del'),
          personId: owner.id,
          title: `Unblock single-loop delivery: ${loop.title}`.slice(0, 200),
          expectedOutcome: 'Surface system/resource blockers preventing clearance before judging whether the underlying hypothesis works.',
          authority: 'recommend',
          support: `Type-III error guard: execution clearance is ${loop.executionClearancePct}% while the thesis remains untested. Repair delivery rather than abandoning the strategy untested. ${unblockToken}`,
          delegatedOn: todayStr,
          dueOn: addDays(todayStr, 5),
          status: 'active',
          checkins: [],
          completedOn: null,
          completionNote: '',
          returnedOn: null,
          returnReason: '',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draft.delegations.push(unblockTask);
        link('settlement', s.id, 'delegation', unblockTask.id, 'remediates', SETTLEMENT_RULE_IDS.DELIVERY_REPAIR, 'Single-loop delivery repair before judging untested thesis');
        addEffect(SETTLEMENT_RULE_IDS.DELIVERY_REPAIR, 'created', 'delegation', unblockTask.id, 'Opened Type-III error guard unblocking task');
      }

      // Append one advisory history note on any open linked premise so it isn't misread as falsified.
      for (const item of loop.items) {
        if (item.kind !== 'premise' || item.cleared) continue;
        const pr = (draft.premises || []).find((p) => p && p.id === item.id);
        if (!pr) continue;
        pr.history = Array.isArray(pr.history) ? pr.history : [];
        if (!pr.history.some((h) => (h?.summary || '').includes(unblockToken))) {
          pr.history.push({
            at: nowIso,
            type: 'type-iii-guard',
            summary: `Type-III guard (${todayStr}): execution clearance sits at ${loop.executionClearancePct}%; this assumption has not yet been tested in practice. ${unblockToken}`,
          });
          pr.updatedAt = nowIso;
          link('settlement', s.id, 'premise', pr.id, 'informs', SETTLEMENT_RULE_IDS.DELIVERY_REPAIR, 'Type-III guard preserving untested premise');
          addEffect(SETTLEMENT_RULE_IDS.DELIVERY_REPAIR, 'updated', 'premise', pr.id, 'Recorded untested-thesis Type-III guard note on premise');
        }
      }
    }
  }

  // RULE-STL-05 (part B): Reconcile dangling `settlement` graph edges on scan or archive.
  if (event.type === SETTLEMENT_EVENTS.SCAN || event.type === SETTLEMENT_EVENTS.ARCHIVED) {
    const validIds = new Set(
      (draft.settlements || [])
        .filter((s) => s && s.status !== 'archived')
        .map((s) => s.id),
    );
    const beforeLen = (draft.links || []).length;
    draft.links = (draft.links || []).filter((lnk) => {
      if (lnk.sourceType === 'settlement') {
        return validIds.has(lnk.sourceId) && Boolean(resolveLinkedEntity(draft, lnk.targetType, lnk.targetId));
      }
      if (lnk.targetType === 'settlement') {
        return validIds.has(lnk.targetId) && Boolean(resolveLinkedEntity(draft, lnk.sourceType, lnk.sourceId));
      }
      return true;
    });
    if (draft.links.length !== beforeLen) {
      addEffect(SETTLEMENT_RULE_IDS.GRADE_RECONCILE, 'reconciled', 'link', '', 'Removed stale settlement edges');
    }
  }

  return effects;
}
