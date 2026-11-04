/**
 * app/core/domain/catchballRules.js — post-commit propagation & cross-altitude
 * roll-up rules for the Hoshin Kanri & Catchball Cascade (`#/catchball`,
 * Schema v90, ADR-0084).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` immediately after
 * `altitudeRouterRule` and BEFORE `decisionTempoRule`, `attentionMarketRule`,
 * `successionRule`, `seatRule`, and `sealRule`, so:
 *   1. Governance DACI decisions opened by `RULE-HK-02`/`03` are priced by
 *      `decisionTempoRule` in the SAME atomic commit;
 *   2. Typed `rolls-up-to` edges written by `RULE-HK-01` reach every
 *      leadership ancestor in the SAME transaction; and
 *   3. `sealRule` hashes and attests the entire transaction up the chain.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  ancestorPersonSeatIds,
  buildCatchballReport,
} from './catchball.js';
import { normalizeCatchballSettings } from './catchballSchema.js';
import {
  ACTIVE_PACT_STATUSES,
  CATCHBALL_EVENTS,
  CATCHBALL_LIMITS,
  CATCHBALL_RULE_IDS,
} from './catchballRegistry.js';

const CATCHBALL_TRIGGER_SET = new Set(Object.values(CATCHBALL_EVENTS));

function clampStr(v, max = 280) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, ruleId, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clean}`.slice(0, 300),
    });
  }
}

function linkOnce(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(
    draft,
    {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId,
      summary: clampStr(summary, 280),
    },
    {
      idFactory: ctx.idFactory,
      todayStr: dayKey(ctx.now),
      nowIso: ctx.now.toISOString(),
    },
  ).created;
}

function hasMarker(draft, key) {
  const list = Array.isArray(draft.catchballMarkers) ? draft.catchballMarkers : [];
  return list.some((m) => m && m.key === key);
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.catchballMarkers)) draft.catchballMarkers = [];
  if (draft.catchballMarkers.some((m) => m && m.key === key)) return false;
  draft.catchballMarkers.push({
    id: ctx.idFactory('hkm'),
    key,
    kind,
    recordedOn: dayKey(ctx.now),
    summary: clampStr(summary, 240),
  });
  if (draft.catchballMarkers.length > CATCHBALL_LIMITS.markers) {
    draft.catchballMarkers.splice(0, draft.catchballMarkers.length - CATCHBALL_LIMITS.markers);
  }
  return true;
}

function decisionHasTag(draft, tag) {
  return (draft.decisions || []).some(
    (d) => d && (String(d.question || '').includes(tag) || String(d.rationale || '').includes(tag)),
  );
}

function addBoundedTalkingPoint(draft, personId, text, tag) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const pts = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (pts.some((t) => String(t).includes(tag))) return false;
  // `normalizeTalkingPoints` slices at 200 chars; bound text so `tag` survives reload.
  const maxBody = Math.max(40, 198 - tag.length);
  person.talkingPoints = [...pts, `${clampStr(text, maxBody)} ${tag}`].slice(-30);
  return true;
}

function workspaceLeaderName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const root = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (root && root.name) || draft?.settings?.leaderName || 'Workspace leader';
}

function buildGovernedDecision(ctx, draft, { title, question, rationale, options, reviewDays = 14 }) {
  const leader = workspaceLeaderName(draft);
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: clampStr(title, 180),
    question: clampStr(question, 900),
    date: today,
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: '',
    informed: '',
    options: options.map((opt) => ({
      id: ctx.idFactory('opt'),
      label: clampStr(opt.label, 180),
      pros: clampStr(opt.pros, 240),
      cons: clampStr(opt.cons, 240),
    })),
    chosen: '',
    rationale: clampStr(rationale, 500),
    reviewOn: addDays(today, reviewDays),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/**
 * Post-commit hook (`RULE-HK-01..03`).
 */
export function catchballRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!CATCHBALL_TRIGGER_SET.has(event.type)) return [];

  const conv = normalizeCatchballSettings(draft.settings || {});
  const isExplicitScan = event.type === CATCHBALL_EVENTS.SCAN;
  if (!conv.catchballAutoPropagate && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const out = [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });

  const pacts = Array.isArray(draft.catchballPacts) ? draft.catchballPacts : [];
  const rounds = Array.isArray(draft.catchballRounds) ? draft.catchballRounds : [];
  const betIds = new Set((draft.strategyBets || []).map((b) => b && b.id).filter(Boolean));
  const pactIds = new Set(pacts.map((p) => p && p.id).filter(Boolean));
  const goalIds = new Set((draft.goals || []).map((g) => g && g.id).filter(Boolean));
  const budgetIds = new Set((draft.budgets || []).map((b) => b && b.id).filter(Boolean));
  const personIds = new Set((draft.people || []).map((p) => p && p.id).filter(Boolean));
  const premiseIds = new Set((draft.premises || []).map((p) => p && p.id).filter(Boolean));
  const tradeTargetSets = {
    portfolio: new Set((draft.portfolio || []).map((r) => r && r.id).filter(Boolean)),
    goal: goalIds,
    case: new Set((draft.cases || []).map((r) => r && r.id).filter(Boolean)),
  };

  /* ------------------------------------------------ RULE-HK-01: provenance & vertical roll-up */
  for (const pact of pacts) {
    if (!pact || pact.status === 'withdrawn') continue;

    if (pact.strategyBetId && betIds.has(pact.strategyBetId)) {
      if (linkOnce(
        draft, hookCtx,
        'catchballpact', pact.id,
        'strategy', pact.strategyBetId,
        'deploys-strategy',
        CATCHBALL_RULE_IDS.ROLLUP,
        `Deploys Breakthrough Bet via ${pact.altitudeKey} Catchball pact (${pact.horizonDays}d, ${pact.correlation} correlation).`,
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', 'strategy', pact.strategyBetId,
          `Linked Catchball pact "${pact.title}" to Breakthrough Bet.`);
      }
    }

    if (pact.parentPactId && pactIds.has(pact.parentPactId)) {
      if (linkOnce(
        draft, hookCtx,
        'catchballpact', pact.parentPactId,
        'catchballpact', pact.id,
        'cascades-to',
        CATCHBALL_RULE_IDS.ROLLUP,
        `Vertical Hoshin cascade into ${pact.altitudeKey} span (${pact.horizonDays}d).`,
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', 'catchballpact', pact.id,
          `Linked parent pact ${pact.parentPactId} → child pact ${pact.id}.`);
      }
    }

    if (pact.tradeOffSourceType && pact.tradeOffSourceId && tradeTargetSets[pact.tradeOffSourceType]?.has(pact.tradeOffSourceId)) {
      if (linkOnce(
        draft, hookCtx,
        'catchballpact', pact.id,
        pact.tradeOffSourceType, pact.tradeOffSourceId,
        'trades-off',
        CATCHBALL_RULE_IDS.ROLLUP,
        `Priced Catchball trade-off: de-scoped/deferred ${pact.tradeOffSourceType} to free capacity.`,
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', pact.tradeOffSourceType, pact.tradeOffSourceId,
          `Recorded Catchball trade-off edge against ${pact.tradeOffSourceType} ${pact.tradeOffSourceId}.`);
      }
    }

    if (pact.linkedGoalId && goalIds.has(pact.linkedGoalId)) {
      if (linkOnce(
        draft, hookCtx,
        'catchballpact', pact.id,
        'goal', pact.linkedGoalId,
        'cascades-to',
        CATCHBALL_RULE_IDS.ROLLUP,
        'Execution goal materialized/bound to agreed Catchball pact.',
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', 'goal', pact.linkedGoalId,
          `Bound goal ${pact.linkedGoalId} to Catchball pact ${pact.id}.`);
      }
    }

    if (pact.budgetId && budgetIds.has(pact.budgetId) && pact.encumberedLineId) {
      if (linkOnce(
        draft, hookCtx,
        'catchballpact', pact.id,
        'budget', pact.budgetId,
        'funds',
        CATCHBALL_RULE_IDS.ROLLUP,
        `Catchball resource-ask encumbered on budget (${pact.currency || 'USD'} ${pact.resourceAskAmount ?? 0}).`,
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', 'budget', pact.budgetId,
          `Linked Catchball pact ${pact.id} to encumbered budget ${pact.budgetId}.`);
      }
    }

    // Cross-altitude vertical roll-up: receiving span + every leadership ancestor
    if (ACTIVE_PACT_STATUSES.includes(pact.status) && pact.toSeatId && personIds.has(pact.toSeatId)) {
      const chainSeats = [];
      if (built.byId.has(pact.toSeatId) && pact.toSeatId !== LEADER_ID) {
        chainSeats.push(pact.toSeatId);
      }
      for (const ancId of ancestorPersonSeatIds(built, pact.toSeatId)) {
        if (!chainSeats.includes(ancId)) chainSeats.push(ancId);
      }
      for (const seatId of chainSeats) {
        const seatNode = built.byId.get(seatId);
        const rank = seatNode ? seatNode.rank : 2;
        const disc = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
        if (linkOnce(
          draft, hookCtx,
          'catchballpact', pact.id,
          'person', seatId,
          'rolls-up-to',
          CATCHBALL_RULE_IDS.ROLLUP,
          `Hoshin pact rolled up to ${seatNode?.shortLabel || 'leadership'} span (rank ${rank}, ${disc} disclosure).`,
        )) {
          noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'rolled-up', 'person', seatId,
            `Rolled Catchball pact ${pact.id} up to leadership span ${seatId} (rank ${rank}).`);
        }
      }
    }
  }

  for (const roundRow of rounds) {
    if (!roundRow || roundRow.kind !== 'counter' || !pactIds.has(roundRow.pactId)) continue;
    if (linkOnce(
      draft, hookCtx,
      'catchballround', roundRow.id,
      'catchballpact', roundRow.pactId,
      'counters-upward',
      CATCHBALL_RULE_IDS.ROLLUP,
      `Round #${roundRow.roundNumber} upward counter-proposal (${roundRow.mechanism}).`,
    )) {
      noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.ROLLUP, 'linked', 'catchballround', roundRow.id,
        `Linked counter-offer round ${roundRow.id} to pact ${roundRow.pactId}.`);
    }
  }

  /* ------------------------------------------------ RULE-HK-02: Watermelon & Double-Loop Thesis Escalation */
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const report = buildCatchballReport(fullStateView, { now, settings: conv });
  const isoWk = weekKey(now);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];

  for (const wm of report.watermelons) {
    const tag = `[HK-WML:${wm.id}:${isoWk}]`;
    if (!decisionHasTag(draft, tag) && !hasMarker(draft, tag)) {
      const dec = buildGovernedDecision(hookCtx, draft, {
        title: `Resolve ${wm.watermelonGapPp} pp Watermelon gap on "${wm.title}"`,
        question: `Headline/mean progress (${wm.headlinePct}%) exceeds the Goldratt weakest-link child floor (${wm.weakestLinkPct ?? wm.laggingPct}%) by ${wm.watermelonGapPp} pp (threshold ${conv.catchballWatermelonGapPct} pp). Which bottleneck trade-off or scope adjustment restores honest alignment? ${tag}`,
        rationale: `Opened by ${CATCHBALL_RULE_IDS.WATERMELON_THESIS}: green average masks a red bottleneck child span.`,
        options: [
          {
            label: 'Reallocate capacity or encumber budget to unblock the weakest-link child pact',
            pros: 'Directly lifts the binding constraint that governs end-to-end delivery.',
            cons: 'Requires explicit de-scoping elsewhere to avoid secondary overload.',
          },
          {
            label: 'Re-negotiate parent target downward to match the realistic weakest-link ceiling',
            pros: 'Eliminates Watermelon reporting distortion before period-end.',
            cons: 'Reduces near-term contribution to the upstream Breakthrough Bet.',
          },
          {
            label: 'Decouple the lagging child dependency from the critical path',
            pros: 'Protects core milestone delivery if dependency is non-essential.',
            cons: 'Leaves deferred capability debt for next cycle.',
          },
        ],
      });
      draft.decisions.unshift(dec);
      recordMarker(draft, hookCtx, tag, 'watermelon-decision', `Watermelon governance decision ${dec.id} opened for ${wm.id}.`);
      linkOnce(draft, hookCtx, 'catchballpact', wm.id, 'decision', dec.id, 'escalates-to',
        CATCHBALL_RULE_IDS.WATERMELON_THESIS, `Watermelon gap (${wm.watermelonGapPp} pp) escalated to DACI decision.`);
      noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'created', 'decision', dec.id,
        `Opened DACI decision for ${wm.watermelonGapPp} pp Watermelon gap on "${wm.title}".`);
    }

    const tpTag = `[HK-TP:${wm.id}]`;
    if (wm.toSeatId && addBoundedTalkingPoint(
      draft,
      wm.toSeatId,
      `Catchball Watermelon check on "${wm.title}": headline ${wm.headlinePct}% vs bottleneck ${wm.weakestLinkPct ?? wm.laggingPct}% — surface what needs de-scoping.`,
      tpTag,
    )) {
      noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'updated', 'person', wm.toSeatId,
        `Added 1:1 Catchball alignment prompt on span ${wm.toSeatId}.`);
    }
  }

  for (const ts of report.thesisSuspects) {
    const tag = `[HK-DBL:${ts.id}:${isoWk}]`;
    if (!decisionHasTag(draft, tag) && !hasMarker(draft, tag)) {
      const dec = buildGovernedDecision(hookCtx, draft, {
        title: `Double-loop strategy review: "${ts.title}" (execution exonerated)`,
        question: `The executing span delivered ${ts.leadingPct}% of agreed leading process inputs (>= ${conv.catchballLeadingFloorPct}% floor), yet lagging realization sits at ${ts.laggingPct}% (<= ${conv.catchballThesisRedPct}% red floor) past midpoint. Execution is exonerated — should the upstream strategic hypothesis be pivoted or retired? ${tag}`,
        rationale: `Opened by ${CATCHBALL_RULE_IDS.WATERMELON_THESIS} (Argyris & Schön double-loop learning): faithful leading execution failed to move the lagging metric, prompting review of the assumed causal mechanism.`,
        options: [
          {
            label: 'Pivot the causal lever: keep the Breakthrough Bet but replace the leading mechanism',
            pros: 'Preserves strategic intent while retiring an ineffective play without blaming the team.',
            cons: 'Requires a new Catchball round and re-baselined horizon.',
          },
          {
            label: 'Trigger the Breakthrough Bet stop rule and redeploy span capacity',
            pros: 'Frees scarce person-days and encumbered budget from a falsified bet.',
            cons: 'Requires executive/board acknowledgement of retired bet.',
          },
          {
            label: 'Extend observation window with an explicit lag hypothesis',
            pros: 'Appropriate if causal lag exceeds half-horizon.',
            cons: 'Risks sunk-cost continuation if not timeboxed.',
          },
        ],
      });
      draft.decisions.unshift(dec);
      recordMarker(draft, hookCtx, tag, 'double-loop-decision', `Double-loop thesis review ${dec.id} opened for ${ts.id}.`);
      linkOnce(draft, hookCtx, 'catchballpact', ts.id, 'decision', dec.id, 'escalates-to',
        CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'Double-loop thesis concern escalated upward (execution exonerated).');
      if (ts.strategyBetId && betIds.has(ts.strategyBetId)) {
        linkOnce(draft, hookCtx, 'decision', dec.id, 'strategy', ts.strategyBetId, 'informs',
          CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'Double-loop review challenges causal mechanism of Breakthrough Bet.');
      }
      if (ts.premiseId && premiseIds.has(ts.premiseId)) {
        linkOnce(draft, hookCtx, 'decision', dec.id, 'premise', ts.premiseId, 'informs',
          CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'Double-loop review flags linked assumption for signpost inspection.');
      }
      noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.WATERMELON_THESIS, 'created', 'decision', dec.id,
        `Opened Double-Loop Strategy Review for "${ts.title}" (execution exonerated).`);
    }
  }

  /* ------------------------------------------------ RULE-HK-03: Calibration Maturity & Floor Breach */
  for (const cell of report.calibration.cells) {
    if (!cell.refused) {
      const matKey = `HK-MAT:${cell.altitudeKey}:floor-${cell.floorN}`;
      if (recordMarker(
        draft,
        hookCtx,
        matKey,
        'calibration-maturity',
        `${cell.label} Catchball ledger reached calibration floor (n=${cell.n}).`,
      )) {
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.CALIBRATION_FANOUT, 'recorded', 'catchballpact', cell.altitudeKey,
          `${cell.label} Catchball calibration reached evidence floor (n=${cell.n}).`);
      }
    }

    if (cell.belowFloor) {
      const calTag = `[HK-CAL:${cell.altitudeKey}:${isoWk}]`;
      if (!decisionHasTag(draft, calTag) && !hasMarker(draft, calTag)) {
        const alt = altitudeByKey(cell.altitudeKey);
        const dec = buildGovernedDecision(hookCtx, draft, {
          title: `Repair ${alt?.label || cell.label} Catchball delivery hold rate (${cell.holdRatePct}%)`,
          question: `Settled Catchball pacts at ${alt?.label || cell.label} delivered ${cell.deliveredN}/${cell.n} (${cell.holdRatePct}%, Wilson 95% ${cell.wilsonLo}–${cell.wilsonHi}%), below the ${cell.reliabilityFloorPct}% floor. How should cascade scoping or capacity gating be tightened? ${calTag}`,
          rationale: `Opened by ${CATCHBALL_RULE_IDS.CALIBRATION_FANOUT}: altitude cell hold rate fell below declared reliability floor.`,
          options: [
            {
              label: 'Require bilateral counter/trade-off review before locking pacts at this altitude',
              pros: 'Surfaces hidden WIP and dependency constraints prior to commitment.',
              cons: 'Adds one negotiation turn before execution start.',
            },
            {
              label: 'Lower max concurrent active pacts per span (cascade fan-out cap)',
              pros: 'Reduces execution-budget interference across shared owners.',
              cons: 'Forces stricter sequencing of Breakthrough Bets.',
            },
            {
              label: 'Accept current stretch rate in writing for exploratory bets',
              pros: 'Preserves ambitious targets where partial payoff still clears cost.',
              cons: 'Hold rate remains below floor until scoping changes.',
            },
          ],
        });
        draft.decisions.unshift(dec);
        recordMarker(draft, hookCtx, calTag, 'calibration-breach', `Calibration floor decision ${dec.id} opened for ${cell.altitudeKey}.`);
        noteEffect(hookCtx, out, CATCHBALL_RULE_IDS.CALIBRATION_FANOUT, 'created', 'decision', dec.id,
          `Opened calibration governance decision for ${cell.label} (${cell.holdRatePct}% < ${cell.reliabilityFloorPct}%).`);
      }
    }
  }

  return out;
}
