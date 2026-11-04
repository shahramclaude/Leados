/**
 * app/core/domain/escalationRules.js — post-commit propagation & cross-altitude
 * roll-up rules for the Escalation Economy (`#/escalation`, Schema v94,
 * ADR-0088).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` immediately after `catchballRule`
 * and BEFORE `decisionTempoRule`, `attentionMarketRule`, `successionRule`,
 * `seatRule` and `sealRule`, so:
 *   1. Governance DACI decisions opened by RULE-ESC-02/03/04 are priced by
 *      `decisionTempoRule` in the SAME atomic commit;
 *   2. Typed `rolls-up-to` edges written by RULE-ESC-01 reach every leadership
 *      ancestor in the SAME transaction; and
 *   3. `sealRule` hashes and attests the entire transaction up the chain.
 *
 * Every write is marker-idempotent and pausable by `escalationAutoPropagate`;
 * an explicit `escalation.scan` always runs. No rule rates, ranks or scores a
 * person: the subject of every decision opened here is a DECISION CLASS and a
 * SPAN, and every talking point is about the process, never the individual.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import {
  ancestorSeatIds,
  buildEscalationReport,
  escalationConventions,
  owningSeatId,
} from './escalation.js';
import { normalizeEscalationSettings } from './escalationSchema.js';
import {
  ESCALATION_EVENTS,
  ESCALATION_LIMITS,
  ESCALATION_RULE_IDS,
} from './escalationRegistry.js';

const ESCALATION_TRIGGER_SET = new Set(Object.values(ESCALATION_EVENTS));

const clampStr = (v, max = 280) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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
  const list = Array.isArray(draft.escalationMarkers) ? draft.escalationMarkers : [];
  return list.some((m) => m && m.key === key);
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.escalationMarkers)) draft.escalationMarkers = [];
  if (hasMarker(draft, key)) return false;
  draft.escalationMarkers.push({
    id: ctx.idFactory('escm'),
    key,
    kind,
    recordedOn: dayKey(ctx.now),
    summary: clampStr(summary, 240),
  });
  if (draft.escalationMarkers.length > ESCALATION_LIMITS.markers) {
    draft.escalationMarkers.splice(0, draft.escalationMarkers.length - ESCALATION_LIMITS.markers);
  }
  return true;
}

function decisionExists(draft, tag) {
  return (draft.decisions || []).some(
    (d) => d && (String(d.question || '').includes(tag) || String(d.title || '').includes(tag)),
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

function buildDelegation(ctx, draft, { personId, title, expectedOutcome, authority = 'own', dueOn, support = '' }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('del'),
    personId,
    title: clampStr(title, 200),
    expectedOutcome: clampStr(expectedOutcome, 4000),
    authority,
    support: clampStr(support, 4000),
    delegatedOn: today,
    dueOn: dueOn || addDays(today, 14),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    sourceNegotiationId: null,
    sourceTermId: null,
    priorDelegationId: null,
    supersededByDelegationId: null,
    recoveredOn: null,
    recoveryNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function ensureDelegation(draft, ctx, out, ruleId, delegation, tag, summary) {
  if ((draft.delegations || []).some((d) => d && String(d.title || '').includes(tag))) return false;
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  draft.delegations.push(delegation);
  noteEffect(ctx, out, ruleId, 'delegated', 'delegation', delegation.id, summary);
  return true;
}

/** Post-commit hook (RULE-ESC-01..05). */
export function escalationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!ESCALATION_TRIGGER_SET.has(event.type)) return [];

  const conv = normalizeEscalationSettings(draft.settings || {});
  const isExplicitScan = event.type === ESCALATION_EVENTS.SCAN;
  if (!conv.escalationAutoPropagate && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const out = [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const today = dayKey(now);
  const week = weekKey(now);

  const records = Array.isArray(draft.escalationRecords) ? draft.escalationRecords : [];
  const commitments = Array.isArray(draft.escalationCommitments) ? draft.escalationCommitments : [];
  const personIds = new Set((draft.people || []).map((p) => p && p.id).filter(Boolean));
  const sourceSets = {
    case: new Set((draft.cases || []).map((r) => r && r.id).filter(Boolean)),
    decision: new Set((draft.decisions || []).map((r) => r && r.id).filter(Boolean)),
    delegation: new Set((draft.delegations || []).map((r) => r && r.id).filter(Boolean)),
    goal: new Set((draft.goals || []).map((r) => r && r.id).filter(Boolean)),
    dependency: new Set((draft.dependencies || []).map((r) => r && r.id).filter(Boolean)),
  };

  const windowStart = addDays(today, -(conv.escalationWindowDays - 1));
  const inWindow = (r) => typeof r?.loggedOn === 'string' && r.loggedOn >= windowStart && r.loggedOn <= today;
  const windowed = records.filter(inWindow);

  /* -------------------------------- RULE-ESC-01: provenance, source links and vertical roll-up */
  for (const rec of records) {
    if (!rec || rec.disposition !== 'escalated' || !rec.toSeatId) continue;

    if (personIds.has(rec.toSeatId) && linkOnce(
      draft, hookCtx,
      'escalationrecord', rec.id,
      'person', rec.toSeatId,
      'escalates-to',
      ESCALATION_RULE_IDS.ROLLUP,
      `Escalated to the seat whose span can decide it (${rec.reasonKey}, class "${rec.decisionClass}").`,
    )) {
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.ROLLUP, 'linked', 'person', rec.toSeatId,
        `Linked escalation "${rec.title}" to receiving seat ${rec.toSeatId}.`);
    }

    if (rec.sourceType && rec.sourceId && sourceSets[rec.sourceType]?.has(rec.sourceId) && linkOnce(
      draft, hookCtx,
      'escalationrecord', rec.id,
      rec.sourceType, rec.sourceId,
      'originates-from',
      ESCALATION_RULE_IDS.ROLLUP,
      `This escalation originated from a recorded ${rec.sourceType}.`,
    )) {
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.ROLLUP, 'linked', rec.sourceType, rec.sourceId,
        `Linked escalation ${rec.id} to its source ${rec.sourceType}.`);
    }

    // Cross-altitude vertical roll-up: the receiving seat plus every leadership
    // ancestor, so one frontline hand-off reaches manager → director → VP →
    // chief in ONE atomic transaction.
    const chainSeats = [];
    if (built.byId.has(rec.toSeatId) && rec.toSeatId !== LEADER_ID) chainSeats.push(rec.toSeatId);
    for (const ancId of ancestorSeatIds(built, rec.toSeatId)) {
      if (!chainSeats.includes(ancId)) chainSeats.push(ancId);
    }
    // The originating span's ancestors too: a decision moment logged by a
    // childless specialist still belongs to the span that carries them, and
    // must reach every rung above it in the same transaction.
    for (const ancId of ancestorSeatIds(built, owningSeatId(built, rec.fromSeatId))) {
      if (!chainSeats.includes(ancId)) chainSeats.push(ancId);
    }
    for (const seatId of chainSeats) {
      const seatNode = built.byId.get(seatId);
      const rank = seatNode ? seatNode.rank : 2;
      const disc = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
      if (linkOnce(
        draft, hookCtx,
        'escalationrecord', rec.id,
        'person', seatId,
        'rolls-up-to',
        ESCALATION_RULE_IDS.ROLLUP,
        `Escalation rolled up to ${seatNode?.shortLabel || 'leadership'} span (rank ${rank}, ${disc} disclosure).`,
      )) {
        noteEffect(hookCtx, out, ESCALATION_RULE_IDS.ROLLUP, 'rolled-up', 'person', seatId,
          `Rolled escalation ${rec.id} up to leadership span ${seatId} (rank ${rank}).`);
      }
    }
  }

  /* ----------------------- RULE-ESC-02: queue saturation / instability at the receiving span */
  const report = buildEscalationReport(draft, { now, settings: draft.settings || {} });
  for (const row of report.seatRows) {
    const q = row.queue;
    if (!q || (q.state !== 'saturated' && q.state !== 'unstable')) continue;
    if (row.receivedN < conv.escalationFloorN) continue;
    if (!personIds.has(row.seatId)) continue;

    const markerKey = `queue:${row.seatId}:${week}`;
    if (!recordMarker(draft, hookCtx, markerKey, 'queue-overload',
      `Receiving span saturated: ${q.arrivalsPerWeek}/wk arrivals against a ${q.serviceRatePerWeek}/wk service rate.`)) continue;

    const tag = `[ESC-QUEUE-${row.seatId}-${week}]`;
    if (!decisionExists(draft, tag)) {
      const unstable = q.state === 'unstable';
      const decision = buildGovernedDecision(hookCtx, draft, {
        title: `${unstable ? 'Queue unstable' : 'Queue saturated'}: ${row.label} cannot absorb what is arriving`,
        question: `${unstable
          ? `Arrivals at this span (${q.arrivalsPerWeek}/week) meet or exceed its declared decision rate (${q.serviceRatePerWeek}/week), so the queue has no finite waiting time.`
          : `This span is running at ${q.utilisationPct}% of its declared decision rate, past the ${conv.escalationUtilisationRedPct}% floor. Expected wait is ${q.waitDaysLo}–${q.waitDaysHi} days.`} Which of these do we choose: raise the span's decision bandwidth, move authority downward so fewer items arrive, or explicitly accept the delay? The subject is the SPAN's authority and capacity — never a person's effort or competence.`,
        rationale: `M/M/1 (Erlang) utilisation with Kingman's G/G/1 variability bound, over the last ${conv.escalationWindowDays} days. ${q.reason || ''}`.trim(),
        options: [
          {
            label: 'Raise the decision bandwidth of this span',
            pros: 'Removes the constraint where it sits; measurable within one cycle.',
            cons: `Costs attention at this altitude (${conv.escalationCurrency} ${(conv[`escalationRate${row.altitudeKey === 'frontline' ? 'Frontline' : row.altitudeKey === 'manager' ? 'Manager' : row.altitudeKey === 'director' ? 'Director' : row.altitudeKey === 'exec' ? 'Exec' : 'Chief'}`] || 0)}/hour declared) and may attract more escalation.`,
          },
          {
            label: 'Move authority downward so fewer items arrive here',
            pros: 'Aghion & Tirole (1997): a credible commitment to intervene less gives the levels below a reason to gather information and decide.',
            cons: 'Requires an explicit intervention-rate commitment and a period of observed misses.',
          },
          {
            label: 'Accept the delay in writing',
            pros: 'Honest, and free today.',
            cons: `The waiting cost compounds; at ρ = ${q.utilisationPct}% it is not linear.`,
          },
        ],
        reviewDays: conv.escalationReviewDays,
      });
      decision.title = clampStr(`${decision.title} ${tag}`, 180);
      if (!Array.isArray(draft.decisions)) draft.decisions = [];
      draft.decisions.push(decision);
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.QUEUE_OVERLOAD, 'decision-opened', 'decision', decision.id,
        `Opened an absorption-capacity decision for ${row.label} (ρ ${q.utilisationPct}%).`);
    }

    ensureDelegation(draft, hookCtx, out, ESCALATION_RULE_IDS.QUEUE_OVERLOAD,
      buildDelegation(hookCtx, draft, {
        personId: row.seatId,
        title: `Absorption capacity plan for this span ${tag}`,
        expectedOutcome: `Name the concrete change: a raised decision rate, a written intervention-rate commitment, or an explicit acceptance of the delay. Received ${row.receivedN} escalations in ${conv.escalationWindowDays} days against a declared ${conv.escalationServiceRatePerWeek}/week service rate.`,
        dueOn: addDays(today, conv.escalationReviewDays),
      }),
      tag,
      `Opened an owned absorption-capacity task for ${row.label}.`);
  }

  /* ----------------------- RULE-ESC-03: pure overhead — escalation is not changing the answer */
  for (const row of report.seatRows) {
    // Only the span that RECEIVED the escalations can change how often it
    // intervenes. Every ancestor already sees the same finding through the
    // roll-up edges written by RULE-ESC-01; opening four decisions for one
    // underlying finding would be noise, not governance.
    if (!row.receivedN) continue;
    const settled = row.settledN;
    if (settled < conv.escalationCellFloor) continue;
    if (row.yield?.pct === null || row.yield?.pct === undefined) continue;
    if (row.yield.pct >= conv.escalationYieldFloorPct) continue;
    if (!personIds.has(row.seatId)) continue;

    const markerKey = `yield:${row.seatId}:${week}`;
    if (!recordMarker(draft, hookCtx, markerKey, 'pure-overhead',
      `Escalation yield ${row.yield.pct}% is below the ${conv.escalationYieldFloorPct}% floor over ${settled} settled escalations.`)) continue;

    const tag = `[ESC-YIELD-${row.seatId}-${week}]`;
    if (!decisionExists(draft, tag)) {
      const decision = buildGovernedDecision(hookCtx, draft, {
        title: `Escalation is not changing the answer at ${row.label}`,
        question: `Over the last ${conv.escalationWindowDays} days, ${settled} escalations reached this span and were settled; ${row.changedN} of them ended with a decision that differed from what the level below proposed — a yield of ${row.yield.pct}% (Wilson 95% ${row.yield.lo}–${row.yield.hi}%), below the declared floor of ${conv.escalationYieldFloorPct}%. Aghion & Tirole (1997): a principal who intervenes without changing the outcome removes the agent's reason to gather information at no benefit. Do we commit to a bounded intervention rate, or accept this as the price of cover?`,
        rationale: `Escalation yield measured only on settled escalations where a human recorded whether the outcome differed from the proposal. Small-cell figures are withheld, not zeroed.`,
        options: [
          {
            label: 'Declare a bounded intervention-rate commitment for this span',
            pros: 'Makes delegation credible and gives the levels below a reason to decide locally.',
            cons: 'Binding for the period; a breach is recorded.',
          },
          {
            label: 'Return this decision class downward with written authority',
            pros: 'Removes the trip entirely; the fastest possible latency.',
            cons: 'Needs the class to be genuinely decidable at the lower rung.',
          },
          {
            label: 'Accept the overhead in writing',
            pros: 'It may be the real price of accountability for a material class.',
            cons: `Declared cost so far: ${row.tax?.units ?? 0} ${conv.escalationCurrency} across ${row.tax?.escalationCount ?? 0} escalations.`,
          },
        ],
        reviewDays: conv.escalationReviewDays,
      });
      decision.title = clampStr(`${decision.title} ${tag}`, 180);
      if (!Array.isArray(draft.decisions)) draft.decisions = [];
      draft.decisions.push(decision);
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.PURE_OVERHEAD, 'decision-opened', 'decision', decision.id,
        `Opened an intervention-rate commitment decision for ${row.label} (yield ${row.yield.pct}%).`);
    }

    if (addBoundedTalkingPoint(draft, row.seatId,
      `A question about how we work, not about anyone's judgement: ${settled} escalations came to this span and only ${row.changedN} ended differently from the proposal. Which of these could you decide outright if you knew I would back you?`,
      tag)) {
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.PURE_OVERHEAD, 'talking-point', 'person', row.seatId,
        `Added a blameless escalation-yield talking point for ${row.label}.`);
    }
  }

  /* ----------------------- RULE-ESC-04: a graded commitment was breached */
  for (const commitment of commitments) {
    if (commitment?.status !== 'graded') continue;
    const committed = Number(commitment.committedInterventionRatePct);
    const observed = Number(commitment.observedInterventionRatePct);
    if (!Number.isFinite(committed) || !Number.isFinite(observed)) continue;
    const materiality = Math.max(5, committed * 0.2);
    if (observed <= committed + materiality) continue;
    if ((commitment.observedN || 0) < conv.escalationCellFloor) continue;
    if (!personIds.has(commitment.spanId)) continue;

    const markerKey = `commit:${commitment.id}`;
    if (!recordMarker(draft, hookCtx, markerKey, 'commitment-breach',
      `Observed intervention ${observed}% exceeded the declared commitment of ${committed}% (n=${commitment.observedN}).`)) continue;

    const tag = `[ESC-COMMIT-${commitment.id}]`;
    if (linkOnce(
      draft, hookCtx,
      'escalationcommitment', commitment.id,
      'person', commitment.spanId,
      'reconciles-authority',
      ESCALATION_RULE_IDS.COMMITMENT_BREACH,
      `Breached intervention-rate commitment (${observed}% vs ${committed}% committed) opens a reconciliation of where this authority should live.`,
    )) {
      noteEffect(hookCtx, out, ESCALATION_RULE_IDS.COMMITMENT_BREACH, 'linked', 'person', commitment.spanId,
        `Recorded a de facto centralisation finding against ${commitment.spanId}.`);
    }

    ensureDelegation(draft, hookCtx, out, ESCALATION_RULE_IDS.COMMITMENT_BREACH,
      buildDelegation(hookCtx, draft, {
        personId: commitment.spanId,
        title: `Reconcile where this authority should live ${tag}`,
        expectedOutcome: `This span committed to intervening on at most ${committed}% of decision moments in class "${commitment.decisionClass}" and was observed at ${observed}% over ${commitment.observedN} moments. Either the commitment was wrong (raise it deliberately), or the delegation was not real (write the authority down). The subject is the AUTHORITY and the CLASS — no individual's conduct is in question.`,
        dueOn: addDays(today, conv.escalationReviewDays),
      }),
      tag,
      `Opened an authority reconciliation task for ${commitment.spanId}.`);
  }

  /* ----------------------- RULE-ESC-05: return the monkey (Oncken & Wass 1974) */
  for (const rec of records) {
    if (rec?.disposition !== 'escalated') continue;
    if (rec.status !== 'open' && rec.status !== 'received') continue;
    if (!personIds.has(rec.toSeatId)) continue;
    const days = daysBetween(rec.loggedOn, today);
    if (!Number.isFinite(days) || days <= conv.escalationReturnDays) continue;

    const markerKey = `monkey:${rec.id}`;
    if (!recordMarker(draft, hookCtx, markerKey, 'monkey-return',
      `Escalation open ${days} days, past the ${conv.escalationReturnDays}-day return window.`)) continue;

    const tag = `[ESC-MONKEY-${rec.id}]`;
    ensureDelegation(draft, hookCtx, out, ESCALATION_RULE_IDS.MONKEY_RETURN,
      buildDelegation(hookCtx, draft, {
        personId: rec.toSeatId,
        title: `Return the monkey with authority, not with an answer ${tag}`,
        expectedOutcome: clampStr(
          `This item has been on this desk for ${days} days, past the ${conv.escalationReturnDays}-day return window. Oncken & Wass (1974): a problem that migrates onto the manager's back is then fed by the manager. Decide it and hand the decision back with the authority that made the decision possible — or record, in writing, why this class genuinely belongs here. Proposed action recorded by the escalating level: "${rec.proposedAction || 'none recorded'}".`,
          4000,
        ),
        dueOn: addDays(today, Math.max(3, Math.round(conv.escalationReturnDays / 2))),
      }),
      tag,
      `Opened a return-the-monkey task for escalation ${rec.id} (${days} days open).`);
  }

  return out;
}
