/**
 * app/core/domain/warGameRules.js — Synchronous post-commit rules for the
 * Strategic War-Game Terminal (Schema v60).
 *
 * Rules:
 *   RULE-WG-01: When a war game is committed and any scenario worsens a
 *               strategy bet's say-do gap by >10pp, attach a typed `stresses`
 *               link from the war game to each affected strategy bet.
 *
 *   RULE-WG-02: When a war game is committed and any scenario breaks coalition
 *               stability (winning coalition count changes), open one schema-valid
 *               DACI decision about coalition repair and link it to the war game.
 *
 *   RULE-WG-03: When a war game is committed and attention reallocation exceeds
 *               50% under any scenario, open one owned re-planning delegation
 *               when a recorded leader/owner exists on the active roster (or a
 *               re-planning decision if no roster owner resolves) and link it.
 *
 *   RULE-WG-04: When a war game is committed and any scenario increases case
 *               severity by ≥1.0, attach a typed `prefigures` link from the
 *               war game to each affected case.
 *
 * All rules are marker-idempotent on `draft.warGameMarkers`, return standard
 * `{ ruleId, action, targetType, targetId, summary }` effects for lineage, and
 * write only schema-valid records.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildWarGameReport } from './warGame.js';
import { strategyTotals } from './strategy.js';

const WARGAME_TRIGGER_EVENTS = new Set([
  'wargame.committed',
  'wargame.updated',
]);

function makeIdFactory(ctx) {
  if (typeof ctx.idFactory === 'function') return ctx.idFactory;
  let seq = 0;
  return (prefix) => `${prefix}-wg-${(seq += 1)}`;
}

function hasMarker(markers, tag) {
  return markers.some((m) => typeof m === 'string' && m === tag);
}

function addMarker(markers, tag) {
  if (!markers.includes(tag)) markers.push(tag);
  if (markers.length > 200) markers.splice(0, markers.length - 200);
}

function resolveLeaderPersonId(draft) {
  const active = (draft.people || []).filter((p) => p && p.status !== 'archived');
  if (!active.length) return null;
  const leaderName = String(draft.settings?.leaderName || '').trim().toLowerCase();
  if (leaderName) {
    const match = active.find((p) => String(p.name || '').trim().toLowerCase() === leaderName);
    if (match) return match.id;
  }
  return null;
}

/**
 * Main post-commit rule function. Registered in postCommit.js before
 * decisionTempoRule so any decision it opens receives timing metadata in the
 * same transaction.
 */
export function warGameRule(draft, ctx = {}) {
  const { event, now = new Date() } = ctx;
  if (!event || !WARGAME_TRIGGER_EVENTS.has(event.type)) return [];

  const warGameId = event.entityId;
  if (!warGameId) return [];

  const wg = (draft.warGames || []).find((g) => g && g.id === warGameId);
  if (!wg || wg.status !== 'committed') return [];

  const report = buildWarGameReport(draft, wg, now);
  if (!report) return [];

  draft.warGameMarkers = Array.isArray(draft.warGameMarkers) ? draft.warGameMarkers : [];
  const markers = draft.warGameMarkers;
  if (Array.isArray(ctx.markers)) {
    for (const m of ctx.markers) {
      if (typeof m === 'string' && !markers.includes(m)) markers.push(m);
    }
  }

  const nextId = makeIdFactory(ctx);
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const today = dayKey(now);
  const linkOpts = { idFactory: nextId, todayStr: today, nowIso };
  const effects = [];

  // ---- RULE-WG-01: Strategy stress links ----
  const baseStrategy = strategyTotals(draft, now);
  const activeBets = (draft.strategyBets || []).filter((b) => b && b.status === 'active');

  for (const reading of report.scenarioReadings) {
    if (reading.gapDivergence == null || reading.gapDivergence <= 10) continue;

    for (const bet of activeBets) {
      const markerKey = `RULE-WG-01:${wg.id}:${reading.scenarioId}:${bet.id}`;
      if (hasMarker(markers, markerKey)) continue;

      const betReading = (baseStrategy.bets || []).find((br) => br.bet?.id === bet.id);
      if (!betReading) continue;

      addMarker(markers, markerKey);
      const { created } = ensureEntityLink(draft, {
        sourceType: 'wargame',
        sourceId: wg.id,
        targetType: 'strategy',
        targetId: bet.id,
        relation: 'stresses',
        ruleId: 'RULE-WG-01',
        summary: `Stressed under scenario "${reading.scenarioLabel}" (+${reading.gapDivergence}pp gap)`,
      }, linkOpts);
      if (created) {
        effects.push({
          ruleId: 'RULE-WG-01',
          action: 'linked',
          targetType: 'strategy',
          targetId: bet.id,
          summary: `War game “${wg.label}” stresses bet “${bet.title || bet.label || bet.id}” under scenario “${reading.scenarioLabel}” (+${reading.gapDivergence}pp gap)`,
        });
      }
    }
  }

  // ---- RULE-WG-02: Coalition instability decision ----
  const coalitionBroken = report.scenarioReadings.filter((r) => r.coalitionShifts.length > 0);
  if (coalitionBroken.length > 0) {
    const markerKey = `RULE-WG-02:${wg.id}`;
    if (!hasMarker(markers, markerKey)) {
      addMarker(markers, markerKey);
      const affectedScenarios = coalitionBroken.map((r) => r.scenarioLabel).join(', ');
      const totalShifts = coalitionBroken.reduce((s, r) => s + r.coalitionShifts.length, 0);
      const leader = String(draft.settings?.leaderName || '').slice(0, 120);
      const decisionId = nextId('dec');
      const decision = {
        id: decisionId,
        title: `Coalition posture under war game “${wg.label}”`.slice(0, 200),
        question: `Which coalition commitments or side-agreements should be reinforced before ${affectedScenarios} shifts ${totalShifts} power game(s)?`.slice(0, 2000),
        date: today,
        reversibility: 'reversible',
        driver: leader,
        approver: leader,
        contributors: '',
        informed: '',
        options: [
          { id: nextId('opt'), label: 'Pre-commit backup coalition allies now', pros: 'Protects winning margin under shock', cons: 'Spends stakeholder capital ahead of need' },
          { id: nextId('opt'), label: 'Hold current coalition and set signpost triggers', pros: 'No immediate negotiation cost', cons: 'Slower response if scenario materialises' },
        ],
        chosen: '',
        rationale: `${totalShifts} coalition shift(s) detected across scenario(s): ${affectedScenarios}. [${markerKey}]`.slice(0, 4000),
        reviewOn: addDays(today, 14),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        decidedOn: null,
        createdAt: nowIso,
      };
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.unshift(decision);
      ensureEntityLink(draft, {
        sourceType: 'wargame',
        sourceId: wg.id,
        targetType: 'decision',
        targetId: decisionId,
        relation: 'informs',
        ruleId: 'RULE-WG-02',
        summary: 'Coalition repair decision opened by committed war game',
      }, linkOpts);
      effects.push({
        ruleId: 'RULE-WG-02',
        action: 'created-decision',
        targetType: 'decision',
        targetId: decisionId,
        summary: `Opened coalition repair decision for war game “${wg.label}” (${totalShifts} shift(s))`,
      });
    }
  }

  // ---- RULE-WG-03: Attention reallocation re-planning work ----
  const highRealloc = report.scenarioReadings.filter((r) => r.reallocationPct != null && r.reallocationPct > 50);
  if (highRealloc.length > 0) {
    const markerKey = `RULE-WG-03:${wg.id}`;
    if (!hasMarker(markers, markerKey)) {
      addMarker(markers, markerKey);
      const maxRealloc = Math.max(...highRealloc.map((r) => r.reallocationPct));
      const worstScenario = highRealloc.find((r) => r.reallocationPct === maxRealloc);
      const ownerId = resolveLeaderPersonId(draft);
      if (ownerId) {
        const taskId = nextId('del');
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift({
          id: taskId,
          personId: ownerId,
          title: `Re-plan attention contingencies for “${wg.label}” (${maxRealloc}% shift)`.slice(0, 200),
          expectedOutcome: `Document which weekly obligations pause first if “${worstScenario?.scenarioLabel || 'adverse shock'}” hits (${maxRealloc}% reallocation).`,
          authority: 'act-inform',
          support: `Triggered by committed war game “${wg.label}”. [${markerKey}]`,
          delegatedOn: today,
          dueOn: addDays(today, 7),
          status: 'active',
          checkins: [],
          completedOn: null,
          completionNote: '',
          returnedOn: null,
          returnReason: '',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        ensureEntityLink(draft, {
          sourceType: 'wargame',
          sourceId: wg.id,
          targetType: 'delegation',
          targetId: taskId,
          relation: 'informs',
          ruleId: 'RULE-WG-03',
          summary: `Attention contingency task (${maxRealloc}% shift)`,
        }, linkOpts);
        effects.push({
          ruleId: 'RULE-WG-03',
          action: 'created-delegation',
          targetType: 'delegation',
          targetId: taskId,
          summary: `Opened contingency re-planning task (${maxRealloc}% attention shift)`,
        });
      } else {
        const leader = String(draft.settings?.leaderName || '').slice(0, 120);
        const decisionId = nextId('dec');
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift({
          id: decisionId,
          title: `Attention contingency plan for “${wg.label}” (${maxRealloc}% shift)`.slice(0, 200),
          question: `Which current obligations pause first if scenario “${worstScenario?.scenarioLabel || 'shock'}” forces ${maxRealloc}% attention reallocation?`,
          date: today,
          reversibility: 'reversible',
          driver: leader,
          approver: leader,
          contributors: '',
          informed: '',
          options: [
            { id: nextId('opt'), label: 'Pre-designate pauseable obligations', pros: 'Immediate triage under shock', cons: 'Requires explicit stakeholder notice' },
            { id: nextId('opt'), label: 'Re-solve weekly knapsack if shock arrives', pros: 'Uses fresh prices', cons: 'Consumes scarce decision bandwidth during crisis' },
          ],
          chosen: '',
          rationale: `Attention reallocation reached ${maxRealloc}% under “${worstScenario?.scenarioLabel || 'scenario'}”; no roster owner matched leaderName for a delegation. [${markerKey}]`,
          reviewOn: addDays(today, 7),
          reviewedOn: null,
          outcome: 'pending',
          outcomeNotes: '',
          forecastProbability: null,
          decidedOn: null,
          createdAt: nowIso,
        });
        ensureEntityLink(draft, {
          sourceType: 'wargame',
          sourceId: wg.id,
          targetType: 'decision',
          targetId: decisionId,
          relation: 'informs',
          ruleId: 'RULE-WG-03',
          summary: `Attention contingency decision (${maxRealloc}% shift)`,
        }, linkOpts);
        effects.push({
          ruleId: 'RULE-WG-03',
          action: 'created-decision',
          targetType: 'decision',
          targetId: decisionId,
          summary: `Opened attention contingency decision (${maxRealloc}% shift)`,
        });
      }
    }
  }

  // ---- RULE-WG-04: Case severity prefigure links ----
  for (const reading of report.scenarioReadings) {
    const severeShifts = reading.caseSeverityShifts.filter((cs) => Math.abs(Number(cs.shift ?? cs.delta ?? 0)) >= 1.0);
    for (const shift of severeShifts) {
      const deltaVal = Number(shift.shift ?? shift.delta ?? 0);
      const markerKey = `RULE-WG-04:${wg.id}:${reading.scenarioId}:${shift.caseId}`;
      if (hasMarker(markers, markerKey)) continue;
      addMarker(markers, markerKey);

      const { created } = ensureEntityLink(draft, {
        sourceType: 'wargame',
        sourceId: wg.id,
        targetType: 'case',
        targetId: shift.caseId,
        relation: 'prefigures',
        ruleId: 'RULE-WG-04',
        summary: `Prefigures ${deltaVal >= 0 ? '+' : ''}${deltaVal} severity shift`,
      }, linkOpts);
      if (created) {
        effects.push({
          ruleId: 'RULE-WG-04',
          action: 'linked',
          targetType: 'case',
          targetId: shift.caseId,
          summary: `War game “${wg.label}” prefigures ${deltaVal >= 0 ? '+' : ''}${deltaVal} severity shift on case ${shift.caseId}`,
        });
      }
    }
  }

  if (Array.isArray(ctx.markers)) {
    ctx.markers.length = 0;
    ctx.markers.push(...markers);
  }
  if (Array.isArray(ctx.out)) {
    ctx.out.push(...effects);
  }

  return effects;
}
