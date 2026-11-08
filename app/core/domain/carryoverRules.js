/**
 * app/core/domain/carryoverRules.js — post-commit propagation & cross-altitude
 * roll-up rules for the Hoshin Carryover Terminal (`#/carryover`,
 * Schema v94, ADR-0088).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` immediately after
 * `catchballRule` and BEFORE `decisionTempoRule`, `attentionMarketRule`,
 * `successionRule`, `seatRule`, and `sealRule`, so:
 *   1. Governance DACI decisions opened by `RULE-CO-01` are priced by
 *      `decisionTempoRule` in the SAME atomic commit;
 *   2. Resource releases written by `RULE-CO-02`/`03` are visible to the
 *      budget read models in the same transaction; and
 *   3. `sealRule` hashes and attests the entire transaction up the chain.
 *
 * RULE-CO-01 — provenance, records and settlement decisions.
 *   On a Catchball pact settled as `thesis-invalidated` (or an explicit
 *   scan), for each pact without a carryover record: create the record with
 *   the frozen resource bundle, write typed edges (carries-over, settles),
 *   fan `rolls-up-to` edges to every leadership ancestor of the receiving
 *   span, and open ONE governed settlement decision per resolved bet
 *   (retire / revise stop rule / reaffirm). Unresolved bets are carried but
 *   their decision is refused, not guessed.
 *
 * RULE-CO-02 — settlement resolution and resource release.
 *   On `decision.made`, for each resolved `[CO-SET:…]` settlement decision
 *   whose record is still pending: record the verdict. Retire releases the
 *   encumbered budget line (committed → released) and returns the person-day
 *   commitment IN THE SAME TRANSACTION — never erasing a recorded `spent`
 *   actual (that becomes `already-spent`, named, not subtracted). Revise
 *   opens an owned stop-rule revision delegation. Reaffirm queues a
 *   blameless talking point about what would falsify the new hypothesis.
 *
 * RULE-CO-03 — human verdicts settle records.
 *   On `strategy.bet.retired` or a `retire` `strategy.verdict.recorded`, the
 *   human verdict IS the settlement: pending records on that bet are settled
 *   as retire-bet and their resources released in the same transaction.
 *
 * RULE-CO-04 — once-only later grading and floor breaches.
 *   On an explicit scan (always; pausable auto-propagation never blocks it):
 *   grade settled records once, later, against the prediction frozen at
 *   decision time; open one governed review decision per altitude cell below
 *   the reliability floor per ISO week. Marker-idempotent.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import { ancestorPersonSeatIds } from './catchball.js';
import { normalizeCatchballSettings } from './catchballSchema.js';
import { normalizeCarryoverSettings } from './carryoverSchema.js';
import { buildCarryoverReport, resolvePactBet, carryoverResourceBundle, carryoverBetState } from './carryover.js';
import { CATCHBALL_EVENTS, CATCHBALL_RULE_IDS } from './catchballRegistry.js';
import {
  CARRYOVER_EVENTS,
  CARRYOVER_LIMITS,
  CARRYOVER_RULE_IDS,
  CARRYOVER_STATUSES,
} from './carryoverRegistry.js';
import { appendTalkingPoint, recordQueueRefusal } from './talkingPointPolicy.js';

const CO_TRIGGER_SET = new Set([CATCHBALL_EVENTS.GRADED, CARRYOVER_EVENTS.SCAN, 'decision.made', 'strategy.bet.retired', 'strategy.verdict.recorded']);

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
  const list = Array.isArray(draft.carryoverMarkers) ? draft.carryoverMarkers : [];
  return list.some((m) => m && m.key === key);
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.carryoverMarkers)) draft.carryoverMarkers = [];
  if (draft.carryoverMarkers.some((m) => m && m.key === key)) return false;
  draft.carryoverMarkers.push({
    id: ctx.idFactory('hkm'),
    key,
    kind,
    recordedOn: dayKey(ctx.now),
    summary: clampStr(summary, 240),
  });
  if (draft.carryoverMarkers.length > CARRYOVER_LIMITS.markers) {
    draft.carryoverMarkers.splice(0, draft.carryoverMarkers.length - CARRYOVER_LIMITS.markers);
  }
  return true;
}

function decisionHasTag(draft, tag) {
  return (draft.decisions || []).some(
    (d) => d && (String(d.question || '').includes(tag) || String(d.rationale || '').includes(tag)),
  );
}

function decisionResolvedWithTag(draft, tag) {
  return (draft.decisions || []).some(
    (d) => d && d.chosen
      && (String(d.question || '').includes(tag) || String(d.rationale || '').includes(tag)),
  );
}

function addBoundedTalkingPoint(draft, context, personId, text, tag) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const pts = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
  if (pts.some((t) => String(t).includes(tag))) return false;
  // ADR-0138: the shared writer applies the declared retention policy.
  const write = appendTalkingPoint(pts, `${clampStr(text, Math.max(40, 198 - tag.length))} ${tag}`);
  if (!write.appended) {
    if (write.refused) recordQueueRefusal(context && context.warnings, person.name);
    return false;
  }
  person.talkingPoints = write.points;
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

function verdictForChoice(choice) {
  const c = clampStr(choice, 180).toLowerCase();
  if (c.includes('retire')) return 'retire-bet';
  if (c.includes('revise')) return 'revise-stop-rule';
  if (c.includes('reaffirm')) return 'reaffirm';
  return null;
}

/**
 * Release the resource bundle of a settled retire record in the CURRENT
 * transaction. Returns the release outcome. Never erases a recorded spend.
 */
function releaseResourceBundle(draft, ctx, record) {
  const res = record.resource || {};
  if (!res.encumberedLineId) {
    record.releaseOutcome = 'unencumbered';
    return { outcome: 'unencumbered' };
  }
  const budget = (draft.budgets || []).find((b) => b && b.id === res.budgetId);
  const line = budget && Array.isArray(budget.lines)
    ? budget.lines.find((l) => l && l.id === res.encumberedLineId)
    : null;
  if (!line) {
    record.releaseOutcome = 'withheld';
    record.releaseReason = `Encumbered line ${res.encumberedLineId} no longer exists; release refused rather than guessed.`;
    return { outcome: 'withheld' };
  }
  if (line.status === 'spent') {
    record.releaseOutcome = 'already-spent';
    record.releaseReason = 'The line is already spent — the money landed; no release is possible.';
    return { outcome: 'already-spent' };
  }
  if (line.status === 'released') {
    record.releaseOutcome = 'released';
    return { outcome: 'released' };
  }
  line.status = 'released';
  line.releasedOn = dayKey(ctx.now);
  line.releasedReason = `Carryover settlement RULE-CO-02/03: thesis-invalidated pact ${record.pactId} retired its bet.`;
  if (line.actualsDueOn) line.actualsDueOn = null;
  record.releaseOutcome = 'released';
  return { outcome: 'released' };
}

function settleRecordAsRetire(draft, ctx, record, out, ruleId, summaryPrefix) {
  if (record.status !== 'pending-settlement') return;
  record.settlementVerdict = 'retire-bet';
  record.settledOn = dayKey(ctx.now);
  record.status = 'settled-pending-release';
  record.updatedAt = ctx.now.toISOString();
  const release = releaseResourceBundle(draft, ctx, record);
  if (release.outcome === 'released' || release.outcome === 'unencumbered') {
    record.status = 'settled-released';
  } else {
    record.status = 'settled-withheld';
  }
  record.releasedOn = dayKey(ctx.now);
  noteEffect(ctx, out, ruleId, 'released', 'budget', record.resource.budgetId || '—',
    `${summaryPrefix}: ${record.resource.effortDays} person-day(s), ${record.resource.currency || '—'} ${record.resource.committedAmount ?? '—'} → outcome ${record.releaseOutcome}.`);
  return record;
}

/* ------------------------------------------------------------------ */
/* The rule                                                           */
/* ------------------------------------------------------------------ */

export function carryoverRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!CO_TRIGGER_SET.has(event.type)) return [];

  const conv = normalizeCarryoverSettings(draft.settings || {});
  const isExplicitScan = event.type === CARRYOVER_EVENTS.SCAN;
  if (!conv.carryoverAutoPropagate && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const out = [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });

  const pacts = Array.isArray(draft.catchballPacts) ? draft.catchballPacts : [];
  const records = Array.isArray(draft.carryoverRecords) ? draft.carryoverRecords : [];
  const betIds = new Set((draft.strategyBets || []).map((b) => b && b.id).filter(Boolean));
  const pactIds = new Set(pacts.map((p) => p && p.id).filter(Boolean));
  const budgetIds = new Set((draft.budgets || []).map((b) => b && b.id).filter(Boolean));
  const personIds = new Set((draft.people || []).map((p) => p && p.id).filter(Boolean));
  const byPactId = new Map(records.map((r) => [r.pactId, r]));

  /* ------------------------------------------------ RULE-CO-01: records, provenance, settlement decisions */
  const invalidated = pacts.filter((p) => p && p.status === 'settled' && p.gradedOutcome === 'thesis-invalidated');
  draft.carryoverRecords = Array.isArray(draft.carryoverRecords) ? draft.carryoverRecords : [];

  for (const pact of invalidated) {
    if (!pact || !pactIds.has(pact.id)) continue;
    if (byPactId.has(pact.id)) continue;
    const recKey = `co-rec:${pact.id}`;
    if (hasMarker(draft, recKey)) continue;

    const resolved = resolvePactBet(draft, pact);
    const resource = carryoverResourceBundle(draft, pact);
    const record = {
      id: hookCtx.idFactory('co'),
      pactId: pact.id,
      betId: resolved.betId,
      betBasis: resolved.betBasis,
      status: 'pending-settlement',
      settlementDecisionId: null,
      settlementVerdict: null,
      settledOn: null,
      releasedOn: null,
      releaseOutcome: null,
      releaseReason: '',
      resource,
      graded: false,
      grade: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    draft.carryoverRecords.push(record);
    if (draft.carryoverRecords.length > CARRYOVER_LIMITS.records) {
      draft.carryoverRecords.splice(0, draft.carryoverRecords.length - CARRYOVER_LIMITS.records);
    }
    byPactId.set(pact.id, record);
    recordMarker(draft, hookCtx, recKey, 'record-created', `Carryover record ${record.id} for invalidated pact ${pact.id}.`);

    if (linkOnce(draft, hookCtx, 'catchballpact', pact.id, 'carryover', record.id, 'carries-over',
      CARRYOVER_RULE_IDS.ROLLUP, 'Invalidated pact carries over into the settlement terminal.')) {
      noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.ROLLUP, 'linked', 'carryover', record.id,
        `Linked invalidated pact ${pact.id} → carryover record.`);
    }
    if (resolved.betId && betIds.has(resolved.betId)) {
      if (linkOnce(draft, hookCtx, 'carryover', record.id, 'strategy', resolved.betId, 'settles',
        CARRYOVER_RULE_IDS.ROLLUP, `Carried-over invalidation challenges Breakthrough Bet ${resolved.betId} (basis ${resolved.betBasis}).`)) {
        noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.ROLLUP, 'linked', 'strategy', resolved.betId,
          `Linked carryover record ${record.id} → bet ${resolved.betId}.`);
      }
    }

    // Cross-altitude vertical roll-up: receiving span + every leadership ancestor.
    if (pact.toSeatId && personIds.has(pact.toSeatId)) {
      const chainSeats = [];
      if (personIds.has(pact.toSeatId) && pact.toSeatId !== LEADER_ID) {
        chainSeats.push(pact.toSeatId);
      }
      for (const ancId of ancestorPersonSeatIds(built, pact.toSeatId)) {
        if (!chainSeats.includes(ancId)) chainSeats.push(ancId);
      }
      for (const seatId of chainSeats) {
        const seatNode = built.byId.get(seatId);
        const rank = seatNode ? seatNode.rank : 2;
        const disc = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
        if (linkOnce(draft, hookCtx, 'carryover', record.id, 'person', seatId, 'rolls-up-to',
          CARRYOVER_RULE_IDS.ROLLUP, `Carryover record rolled up to ${seatNode?.shortLabel || 'leadership'} span (rank ${rank}, ${disc} disclosure).`)) {
          noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.ROLLUP, 'rolled-up', 'person', seatId,
            `Rolled carryover record ${record.id} up to leadership span ${seatId} (rank ${rank}).`);
        }
      }
    }
  }

  // ONE governed settlement decision per resolved bet (marker-per-bet), with
  // the resource bundle printed in the question.
  const settledBets = new Map();
  for (const record of draft.carryoverRecords) {
    if (!record.betId || !betIds.has(record.betId)) continue;
    if (!settledBets.has(record.betId)) settledBets.set(record.betId, []);
    settledBets.get(record.betId).push(record);
  }
  for (const [betId, recs] of settledBets) {
    const bet = (draft.strategyBets || []).find((b) => b && b.id === betId);
    if (!bet || bet.status === 'retired') continue;
    const tag = `[CO-SET:${betId}]`;
    // Attach an existing decision to any records that don't have one yet,
    // and auto-resolve pending records if the decision is already chosen.
    const existingDecision = (draft.decisions || []).find((d) => d && String(d.question || '').includes(tag));
    if (existingDecision) {
      for (const rec of recs) {
        if (!rec.settlementDecisionId) rec.settlementDecisionId = existingDecision.id;
        if (rec.status === 'pending-settlement' && existingDecision.chosen) {
          const autoVerdict = verdictForChoice(existingDecision.chosen);
          if (autoVerdict) {
            const aKey = `co-res:${rec.id}`;
            if (!hasMarker(draft, aKey)) {
              rec.settlementVerdict = autoVerdict;
              rec.settledOn = dayKey(now);
              rec.updatedAt = now.toISOString();
              if (autoVerdict === 'retire-bet') {
                settleRecordAsRetire(draft, hookCtx, rec, out, CARRYOVER_RULE_IDS.BET_RETIRED,
                  `Pre-resolved settlement: retire-bet for pact ${rec.pactId}`);
                if (rec.resource.budgetId && budgetIds.has(rec.resource.budgetId)) {
                  linkOnce(draft, hookCtx, 'carryover', rec.id, 'budget', rec.resource.budgetId, 'releases-resource',
                    CARRYOVER_RULE_IDS.BET_RETIRED, 'Pre-resolved retired bet released encumbered authority.');
                }
                if (bet) {
                  linkOnce(draft, hookCtx, 'carryover', rec.id, 'strategy', betId, 'settles',
                    CARRYOVER_RULE_IDS.BET_RETIRED, 'Record settled by pre-resolved retire verdict.');
                }
              } else if (autoVerdict === 'revise-stop-rule' && bet) {
                rec.status = 'settled-withheld';
                rec.releaseOutcome = 'withheld';
                rec.releaseReason = 'Bet kept under a revised stop rule; no resource release.';
                const revTag = `[CO-REV:${betId}]`;
                if (!decisionHasTag(draft, revTag)) {
                  const owner = (draft.people || []).find((p) => p && p.id === bet.ownerId && p.status !== 'archived');
                  const delegation = {
                    id: hookCtx.idFactory('delegation'),
                    personId: bet.ownerId || '',
                    title: `Write the revised stop rule for "${clampStr(bet.title, 80)}"`.slice(0, 160),
                    expectedOutcome: `Replace the falsified rule with one that measures the corrected mechanism, set a new check date, and record why the old rule failed — a revision without a dated rule leaves the bet unfalsifiable. ${revTag}`.slice(0, 600),
                    authority: 'recommend',
                    support: 'The settlement decision was resolved as revise-stop-rule; this delegation is the owned follow-up.',
                    delegatedOn: dayKey(now),
                    dueOn: addDays(dayKey(now), 14),
                    status: 'active',
                    checkins: [],
                    completedOn: null,
                    completionNote: '',
                    returnedOn: null,
                    returnReason: '',
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                  };
                  if (owner) {
                    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
                    draft.delegations.push(delegation);
                    if (linkOnce(draft, hookCtx, 'carryover', rec.id, 'delegation', delegation.id, 'tracks-followup',
                      CARRYOVER_RULE_IDS.BET_RETIRED, 'Revised stop rule owned follow-up.')) {
                      noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.BET_RETIRED, 'created', 'delegation', delegation.id,
                        `Opened owned stop-rule revision delegation for "${clampStr(bet.title, 70)}".`);
                    }
                  }
                }
              } else if (autoVerdict === 'reaffirm' && bet) {
                rec.status = 'settled-withheld';
                rec.releaseOutcome = 'withheld';
                rec.releaseReason = 'Bet reaffirmed with a new hypothesis; resources stay committed.';
                const reTag = `[CO-REAFF:${betId}]`;
                if (bet.ownerId && addBoundedTalkingPoint(
                  draft,
                  hookCtx,
                  bet.ownerId,
                  `Carryover reaffirmation on "${clampStr(bet.title, 70)}": name the new causal hypothesis and the observation that would falsify it next cycle.`,
                  reTag,
                )) {
                  noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.BET_RETIRED, 'updated', 'person', bet.ownerId,
                    'Queued a blameless reaffirmation talking point for the bet owner.');
                }
              }
              recordMarker(draft, hookCtx, aKey, 'settlement-resolved', `Auto-resolved settlement ${autoVerdict} for record ${rec.id}.`);
            }
          }
        }
      }
      continue;
    }

    const betState = carryoverBetState(bet, now);
    const attached = recs.map((r) => r.pactId).join(', ');
    const encumberedDays = recs.reduce((s, r) => s + (r.resource.effortDays || 0), 0);
    const encumberedMoney = recs
      .filter((r) => r.resource.committedAmount !== null)
      .reduce((s, r) => s + r.resource.committedAmount, 0);
    const cur = recs.find((r) => r.resource.currency)?.resource.currency || null;

    const dec = buildGovernedDecision(hookCtx, draft, {
      title: `Settle “${clampStr(bet.title, 90)}” against its stop rule`,
      question: [
        `A Catchball pact deployed under this bet was settled as thesis-invalidated — the executing span was exonerated (leading adherence held, lagging outcome stalled), so the falsified object is the upstream hypothesis, not the team.`,
        `Stop-rule state: ${betState.stateLabel}${betState.hasStopRule ? ` — ${betState.metric || 'metric'} ${betState.direction === 'above' ? 'above' : 'below'} ${betState.threshold ?? 'the recorded threshold'} on ${betState.checkOn}` : ' — no dated stop rule was ever written'}.`,
        `Attached invalidations: ${attached}. Encumbered: ${encumberedDays} person-day(s)${encumberedMoney ? `, ${cur || '—'} ${encumberedMoney}` : ''}.`,
        'Judge the bet: retire it and release what it encumbered, revise its stop rule, or reaffirm it with a new causal hypothesis. The app never retires a bet by itself.',
        tag,
      ].join(' '),
      rationale: `Opened by ${CARRYOVER_RULE_IDS.ROLLUP}: double-loop invalidation of a deployed Breakthrough Bet.`,
      options: [
        {
          label: 'Retire the bet',
          pros: 'Releases the encumbered person-days and budget authority into the next allocation cycle and keeps the written strategy honest.',
          cons: 'The diagnosis remains, and a successor bet will be needed to address it.',
        },
        {
          label: 'Revise the stop rule',
          pros: 'Keeps the bet falsifiable when the rule measured the wrong thing.',
          cons: 'Moving the goalposts repeatedly makes the strategy unfalsifiable in practice.',
        },
        {
          label: 'Reaffirm with a new hypothesis',
          pros: 'Replaces the falsified causal mechanism while preserving strategic intent.',
          cons: 'Requires a new Catchball round and a re-baselined horizon; the old mechanism stays falsified.',
        },
      ],
      reviewDays: conv.carryoverDecisionReviewDays,
    });
    draft.decisions.unshift(dec);
    for (const record of recs) {
      record.settlementDecisionId = dec.id;
      record.updatedAt = now.toISOString();
    }
    recordMarker(draft, hookCtx, `co-set:${betId}`, 'settlement-decision', `Settlement decision ${dec.id} opened for bet ${betId}.`);
    for (const record of recs) {
      if (linkOnce(draft, hookCtx, 'carryover', record.id, 'decision', dec.id, 'settles',
        CARRYOVER_RULE_IDS.SETTLEMENT, 'Carryover record settles via the governed decision.')) {
        noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.SETTLEMENT, 'created', 'decision', dec.id,
          `Opened stop-rule settlement decision for “${clampStr(bet.title, 70)}” (${recs.length} invalidated pact(s)).`);
      }
    }
  }

  /* ------------------------------------------------ RULE-CO-02: settlement resolution & release */
  const decisionMade = event.type === 'decision.made';
  if (decisionMade) {
    const resolvedBets = new Map();
    for (const decision of draft.decisions || []) {
      if (!decision || !decision.chosen) continue;
      const match = String(decision.question || '').match(/\[CO-SET:([^\]]+)\]/);
      if (!match) continue;
      const betId = match[1];
      if (!resolvedBets.has(betId)) resolvedBets.set(betId, []);
      resolvedBets.get(betId).push(decision);
    }
    for (const [betId, decisions] of resolvedBets) {
      const verdict = verdictForChoice(decisions[0].chosen);
      if (!verdict) continue;
      const bet = (draft.strategyBets || []).find((b) => b && b.id === betId);
      for (const record of draft.carryoverRecords) {
        if (record.betId !== betId || record.status !== 'pending-settlement') continue;
        const resKey = `co-res:${record.id}`;
        if (hasMarker(draft, resKey)) continue;
        record.settlementVerdict = verdict;
        record.settledOn = dayKey(now);
        record.updatedAt = now.toISOString();
        if (verdict === 'retire-bet') {
          settleRecordAsRetire(draft, hookCtx, record, out, CARRYOVER_RULE_IDS.SETTLEMENT,
            `Settlement decision resolved: retire-bet for pact ${record.pactId}`);
          if (record.resource.budgetId && budgetIds.has(record.resource.budgetId)) {
            if (linkOnce(draft, hookCtx, 'carryover', record.id, 'budget', record.resource.budgetId, 'releases-resource',
              CARRYOVER_RULE_IDS.SETTLEMENT, `Retired bet released ${record.resource.currency || '—'} ${record.resource.committedAmount ?? '—'} of encumbered authority.`)) {
              noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.SETTLEMENT, 'linked', 'budget', record.resource.budgetId,
                `Linked carryover record ${record.id} → released budget ${record.resource.budgetId}.`);
            }
          }
          if (bet) {
            if (linkOnce(draft, hookCtx, 'carryover', record.id, 'strategy', betId, 'settles',
              CARRYOVER_RULE_IDS.SETTLEMENT, 'Record settled by the governed retire verdict.')) {
              noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.SETTLEMENT, 'linked', 'strategy', betId,
                `Record ${record.id} settled against bet ${betId}.`);
            }
          }
        } else if (verdict === 'revise-stop-rule' && bet) {
          record.status = 'settled-withheld';
          record.releaseOutcome = 'withheld';
          record.releaseReason = 'Bet kept under a revised stop rule; no resource release.';
          const revTag = `[CO-REV:${betId}]`;
          if (!decisionHasTag(draft, revTag)) {
            const owner = (draft.people || []).find((p) => p && p.id === bet.ownerId && p.status !== 'archived');
            const delegation = {
              id: hookCtx.idFactory('delegation'),
              personId: bet.ownerId || '',
              title: `Write the revised stop rule for “${clampStr(bet.title, 80)}”`.slice(0, 160),
              expectedOutcome: `Replace the falsified rule with one that measures the corrected mechanism, set a new check date, and record why the old rule failed — a revision without a dated rule leaves the bet unfalsifiable. ${revTag}`.slice(0, 600),
              authority: 'recommend',
              support: 'The settlement decision was resolved as revise-stop-rule; this delegation is the owned follow-up.',
              delegatedOn: dayKey(now),
              dueOn: addDays(dayKey(now), 14),
              status: 'active',
              checkins: [],
              completedOn: null,
              completionNote: '',
              returnedOn: null,
              returnReason: '',
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            };
            if (owner) {
              draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
              draft.delegations.push(delegation);
              if (linkOnce(draft, hookCtx, 'carryover', record.id, 'delegation', delegation.id, 'tracks-followup',
                CARRYOVER_RULE_IDS.SETTLEMENT, 'Revised stop rule owned follow-up.')) {
                noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.SETTLEMENT, 'created', 'delegation', delegation.id,
                  `Opened owned stop-rule revision delegation for “${clampStr(bet.title, 70)}”.`);
              }
            }
          }
        } else if (verdict === 'reaffirm' && bet) {
          record.status = 'settled-withheld';
          record.releaseOutcome = 'withheld';
          record.releaseReason = 'Bet reaffirmed with a new hypothesis; resources stay committed.';
          const reTag = `[CO-REAFF:${betId}]`;
          if (bet.ownerId && addBoundedTalkingPoint(
            draft,
            hookCtx,
            bet.ownerId,
            `Carryover reaffirmation on “${clampStr(bet.title, 70)}”: name the new causal hypothesis and the observation that would falsify it next cycle.`,
            reTag,
          )) {
            noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.SETTLEMENT, 'updated', 'person', bet.ownerId,
              'Queued a blameless reaffirmation talking point for the bet owner.');
          }
        }
        recordMarker(draft, hookCtx, resKey, 'settlement-resolved', `Settlement resolved ${verdict} for record ${record.id}.`);
      }
    }
  }

  /* ------------------------------------------------ RULE-CO-03: human verdicts settle records */
  if (event.type === 'strategy.bet.retired' || event.type === 'strategy.verdict.recorded') {
    const bet = event.type === 'strategy.bet.retired'
      ? (draft.strategyBets || []).find((b) => b && b.id === event.entityId)
      : (() => {
        const b = (draft.strategyBets || []).find((x) => x && x.id === event.entityId);
        return b && b.verdict && b.verdict.verdict === 'retire' ? b : null;
      })();
    if (bet) {
      for (const record of draft.carryoverRecords) {
        if (record.betId !== bet.id || record.status !== 'pending-settlement') continue;
        const resKey = `co-retire:${record.id}`;
        if (hasMarker(draft, resKey)) continue;
        settleRecordAsRetire(draft, hookCtx, record, out, CARRYOVER_RULE_IDS.BET_RETIRED,
          `Bet retired by human verdict; carryover record settled`);
        if (record.resource.budgetId && budgetIds.has(record.resource.budgetId)) {
          if (linkOnce(draft, hookCtx, 'carryover', record.id, 'budget', record.resource.budgetId, 'releases-resource',
            CARRYOVER_RULE_IDS.BET_RETIRED, `Retired bet released encumbered authority.`)) {
            noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.BET_RETIRED, 'linked', 'budget', record.resource.budgetId,
              `Linked carryover record ${record.id} → released budget ${record.resource.budgetId}.`);
          }
        }
        recordMarker(draft, hookCtx, resKey, 'bet-retired-settlement', `Record ${record.id} settled by bet retirement.`);
      }
    }
  }

  /* ------------------------------------------------ RULE-CO-04: once-only grading + floor breaches */
  if (isExplicitScan || event.type === CARRYOVER_EVENTS.SCAN) {
    const report = buildCarryoverReport(draft, now, conv);
    const gradingDelay = conv.carryoverGradingDelayDays;
    draft.carryoverGradings = Array.isArray(draft.carryoverGradings) ? draft.carryoverGradings : [];

    for (const view of report.records) {
      const rec = view.record;
      if (rec.graded || !rec.settledOn || !rec.settlementVerdict) continue;
      const delta = daysBetween(rec.settledOn, dayKey(now));
      if (!Number.isFinite(delta) || delta < gradingDelay) continue;
      const recordId = rec.id;
      const gradeKey = `co-grade:${recordId}`;
      if (hasMarker(draft, gradeKey)) continue;
      const decision = view.decision;
      let predicted = null;
      if (decision && Number.isFinite(Number(decision.forecastProbability))
        && decision.forecastProbability !== null && decision.forecastProbability !== undefined) {
        predicted = Math.min(1, Math.max(0, Number(decision.forecastProbability)));
      }
      const settledWithinWindow = Boolean(rec.settlementVerdict);
      const grade = {
        gradedOn: dayKey(now),
        altitudeKey: view.betAltitude ? view.betAltitude.key : null,
        settlementOutcome: rec.settlementVerdict,
        releaseOutcome: rec.releaseOutcome,
        settledWithinWindow,
        predictedSettlementPct: predicted === null ? null : Math.round(predicted * 1000) / 10,
        note: '',
      };
      draft.carryoverGradings.push({
        id: hookCtx.idFactory('cog'),
        recordId,
        ...grade,
      });
      if (draft.carryoverGradings.length > CARRYOVER_LIMITS.gradings) {
        draft.carryoverGradings.splice(0, draft.carryoverGradings.length - CARRYOVER_LIMITS.gradings);
      }
      rec.graded = true;
      rec.grade = grade;
      recordMarker(draft, hookCtx, gradeKey, 'graded', `Carryover record ${recordId} graded once: settlement ${rec.settlementVerdict}, release ${rec.releaseOutcome || '—'}.`);
      noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.CALIBRATION, 'graded', 'carryover', recordId,
        `Graded settlement record ${recordId}: verdict ${rec.settlementVerdict}, release ${rec.releaseOutcome || 'unsettled'}.`);
    }

    const isoWk = weekKey(now);
    for (const cell of report.calibration.cells) {
      if (!cell.belowFloor) continue;
      const calTag = `[CO-CAL:${cell.altitudeKey}:${isoWk}]`;
      if (decisionHasTag(draft, calTag) || hasMarker(draft, calTag)) continue;
      const alt = altitudeByKey(cell.altitudeKey);
      const dec = buildGovernedDecision(hookCtx, draft, {
        title: `Repair ${alt?.label || cell.label} settlement hold rate (${cell.holdRatePct}%)`,
        question: [
          `Settled carryover records at ${alt?.label || cell.label} reached a stop-rule verdict in ${cell.settledN}/${cell.n} cases (${cell.holdRatePct}%, Wilson 95% ${cell.wilsonLo}–${cell.wilsonHi}%), below the ${conv.carryoverReliabilityFloorPct}% reliability floor.`,
          `Invalidated bets that stay unsettled keep their encumbered person-days and budget authority locked.`,
          'Tighten the settlement queue, or accept the backlog in writing.',
          calTag,
        ].join(' '),
        rationale: `Opened by ${CARRYOVER_RULE_IDS.CALIBRATION}: altitude cell settlement hold rate below the declared reliability floor.`,
        options: [
          {
            label: 'Own the settlement queue at this altitude',
            pros: 'Resolves pending decisions and releases the resources the invalidations encumbered.',
            cons: 'Some bets may legitimately be reaffirmed rather than retired.',
          },
          {
            label: 'Accept the backlog in writing',
            pros: 'An honest decision instead of an aging silent queue.',
            cons: 'Encumbered capacity stays locked for another cycle.',
          },
          {
            label: 'Lower the reliability floor',
            pros: 'Legitimate when the floor was set above what the org can hold.',
            cons: 'A lower floor weakens the calibration signal for every future cycle.',
          },
        ],
      });
      draft.decisions.unshift(dec);
      recordMarker(draft, hookCtx, calTag, 'floor-breach', `Calibration floor breach decision ${dec.id} for ${cell.altitudeKey} (week ${isoWk}).`);
      noteEffect(hookCtx, out, CARRYOVER_RULE_IDS.CALIBRATION, 'created', 'decision', dec.id,
        `Opened settlement-backlog review for ${alt?.label || cell.label} (hold ${cell.holdRatePct}%).`);
    }
  }

  return out;
}
