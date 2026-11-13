/**
 * app/core/domain/goalCommitmentRules.js — `RULE-GCC-01` on the shared
 * post-commit spine (ADR-0193 + ADR-0194, Schema v154).
 *
 * FOUR CONDITIONS, all read from the one reader (`buildGoalCommitments`) with
 * the whole-workspace view, never re-derived here. They are partitioned so that
 * one fact files exactly one ask, and so that a MULTI-principal impossibility is
 * never dumped on a single line and a SINGLE-line arithmetic error is never
 * escalated above the line that made it:
 *
 *   1. `target-conflict` — two lines committed the same person over at least the
 *      declared minimum of overlapping days and named the SAME measure in
 *      OPPOSITE directions. ONE dated ask goes to the LOWEST JOINT APEX of the
 *      two holders. Neither promise can be kept by working harder, so the
 *      decision is the apex's: withdraw or re-date one of them. It is never
 *      routed to the person being committed.
 *   2. `magnitude-conflict` — two lines committed the same person over at
 *      least the declared overlap, named the SAME measure in the SAME direction
 *      and SAME unit, but their exact target-magnitude divergence meets the
 *      declared floor. ONE dated ask goes to the LOWEST JOINT APEX; missing
 *      magnitudes and mismatched units are printed as refusals, never routed.
 *   3. `capacity-overcommit` — on the exact peak day inside the declared
 *      horizon, every live commitment this person carries adds up to more than
 *      one whole person. With named holders only, ONE dated ask goes to the
 *      lowest joint apex of EVERY holder carrying a commitment on that peak
 *      day. If any peak declaration is explicit `no-line`, its capacity still
 *      counts but the incomplete named-holder set is observed without an ask.
 *   4. `line-share-exceeded` — a named line's own commitments peak above that
 *      line's OWN declared share of the person, while the person's whole week
 *      still fits. ONE dated ask goes to THAT LINE'S HOLDER and to nobody above
 *      them: this is one principal's arithmetic, not a conflict between two.
 *      It is filed only where condition 3 did not fire, so the two never
 *      double-ask the same week.
 *
 * A BARE WINDOW COLLISION IS PRINTED, NOT ESCALATED. Two lines' commitments
 * overlapping is ordinary matrix life; the panel shows every collision with its
 * exact day count. Only a contradiction in what is being asked, or an arithmetic
 * impossibility, deserves to interrupt somebody.
 *
 * WHAT IT NEVER DOES. It never edits a commitment, never narrows a window, never
 * re-points a goal, never releases a promise, never substitutes a holder, never
 * infers a measure, target magnitude, target unit or unit conversion from a
 * goal's text and never rates anyone. Where no roster
 * seat can be asked — the joint apex is ambiguous or is the workspace leader,
 * a holder left the roster, or a peak declaration is explicit `no-line` with no
 * complete named-holder set — it records ONE identity-free `goalCommitmentMarkers`
 * observation and files nothing.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance. The rule is idempotent per condition signature,
 * closes its own asks when the condition clears or its seat moves, never re-asks
 * a condition a human closed while it stands, is bounded per commit with the
 * remainder counted, honours the automation pause on EVERY path including an
 * explicit scan, and is inert with no declared commitment.
 *
 * REACH. It reads `buildMatrix` — through the reader, exactly once — because
 * every joint apex, every line share and every roll-up below is derived from the
 * reporting graph. That is why the switch is registered on
 * PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing this rule reaches a second
 * reporting line, and the second line's manager is not told.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { matrixJointApex } from './matrix.js';
import { shareHToDisplay } from './matrixSchema.js';
import { buildGoalCommitments } from './goalCommitment.js';
import {
  GOAL_COMMITMENT_CLOSED_PREFIX,
  GOAL_COMMITMENT_EVENT_PREFIX,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_MARKER_KIND,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_PERSON_BASIS_H,
  GOAL_COMMITMENT_ROUTE,
  GOAL_COMMITMENT_RULE_ID,
} from './goalCommitmentRegistry.js';
import {
  goalCommitmentSignature,
  goalCommitmentAskSummary,
  normalizeGoalCommitmentSettings,
  parseGoalCommitmentAskSummary,
} from './goalCommitmentSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const share = (hundredths) => shareHToDisplay(hundredths) ?? '—';

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: GOAL_COMMITMENT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: GOAL_COMMITMENT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${GOAL_COMMITMENT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexGoalCommitmentAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== GOAL_COMMITMENT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseGoalCommitmentAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. `seatState` says whether a roster
 * seat can be asked: `seat` (ask `seatId`), `leader-held`, `ambiguous`,
 * `off-roster`, or `unattributed` (an explicit no-line contribution makes the
 * complete accountable holder set unknown).
 */
export function goalCommitmentConditions(report) {
  const { matrix } = report.internal;
  const owners = report.internal.allOwners || [];
  const K = report.internal.conventions;
  const seatOf = (id) => (id === LEADER_ID ? 'leader-held' : matrix.roster.has(id) ? 'seat' : 'off-roster');
  const routeTo = (holderIds) => {
    const apex = matrixJointApex(matrix, holderIds);
    return { apex, seatState: apex.unique ? seatOf(apex.apexId) : 'ambiguous', seatId: apex.unique ? apex.apexId : null };
  };
  const out = [];

  for (const row of owners) {
    /* 1. Two lines asked the same person for opposite movement on one measure. */
    for (const pair of row.pairs) {
      if (pair.verdict !== 'target-conflict') continue;
      if (pair.overlapDays < K.minOverlapDays) continue;
      const holderIds = [pair.aHolderId, pair.bHolderId].filter(Boolean).sort();
      if (!holderIds.length) continue;
      const routed = routeTo(holderIds);
      const signatureKey = [pair.aId, pair.bId].sort().join('|');
      out.push({
        kind: 'target-conflict',
        signature: goalCommitmentSignature('target-conflict', signatureKey),
        seatState: routed.seatState,
        seatId: routed.seatId,
        dueOn: addDays(report.today, K.askDueDays),
        title: `Two lines promised ${row.personName} opposite movement on “${clip(pair.measureKey, 60)}”`,
        expectedOutcome: `${row.personName} works across ${row.linesN} reporting line(s). ${pair.aHolderName} committed them to ${pair.aDirection} “${clip(pair.measureKey, 60)}” for “${clip(pair.aGoalTitle, 90)}”, and ${pair.bHolderName} committed them to ${pair.bDirection} the same measure for “${clip(pair.bGoalTitle, 90)}”. The two windows collide on ${pair.overlapDays} day(s), ${pair.overlapFrom} to ${pair.overlapTo}. Neither promise can be kept by working harder: one of them has to be withdrawn or re-dated, and that is a decision for the lines, not for ${row.personName}. Settle it, or record why both stand, on #/${GOAL_COMMITMENT_ROUTE}?panel=commitments. This ask closes itself when either commitment is released, re-baselined, or no longer declares an opposed direction.`,
        observation: `Two reporting lines declared opposite movement on one measure for the same person over ${pair.overlapDays} overlapping day(s).`,
      });
    }

    /* 2. Aligned measures that declare incompatible target magnitudes. */
    for (const pair of row.pairs) {
      if (pair.verdict !== 'magnitude-conflict') continue;
      if (pair.overlapDays < K.minOverlapDays) continue;
      const holderIds = [pair.aHolderId, pair.bHolderId].filter(Boolean).sort();
      if (!holderIds.length) continue;
      const routed = routeTo(holderIds);
      const signatureKey = [pair.aId, pair.bId].sort().join('|');
      out.push({
        kind: 'magnitude-conflict',
        signature: goalCommitmentSignature('magnitude-conflict', signatureKey),
        seatState: routed.seatState,
        seatId: routed.seatId,
        dueOn: addDays(report.today, K.askDueDays),
        title: `Two lines promised ${row.personName} incompatible targets for “${clip(pair.measureKey, 60)}”`,
        expectedOutcome: `${row.personName} works across ${row.linesN} reporting line(s). ${pair.aHolderName} and ${pair.bHolderName} each committed the same direction on “${clip(pair.measureKey, 60)}” over ${pair.overlapDays} shared day(s), ${pair.overlapFrom} to ${pair.overlapTo}, using the same declared unit. Their exact relative target-magnitude difference is ${pair.magnitudeDivergencePct}% against the declared floor of ${K.magnitudeDivergencePct}%. This is a contradiction between line promises, not a judgement about ${row.personName}: reconcile, withdraw or re-baseline one target on #/${GOAL_COMMITMENT_ROUTE}?panel=commitments. The register never converts units or invents omitted values. This ask closes itself when either commitment is released, re-baselined, no longer aligns on measure and direction, uses a different unit, or falls below the declared divergence floor.`,
        observation: `Two reporting lines declared incompatible same-unit target magnitudes for one aligned measure over ${pair.overlapDays} overlapping day(s).`,
      });
    }

    /* 3. The whole week is fuller than one person. */
    if (row.capacity.verdict === 'overcommit') {
      const peakSources = row.capacity.peakCommitments
        .map((entry) => row.commitments.find((commitment) => commitment.commitmentId === entry.id) || null);
      const hasNoLine = peakSources.some((commitment) => commitment?.lineKey === GOAL_COMMITMENT_NO_LINE);
      const holderIds = [...new Set(peakSources.map((commitment) => commitment?.holderId).filter(Boolean))].sort();
      const signature = goalCommitmentSignature('capacity-overcommit', row.personId);
      const base = {
        kind: 'capacity-overcommit',
        signature,
        dueOn: addDays(report.today, K.askDueDays),
        title: `${row.personName} is committed to ${share(row.capacity.peakSumH)} of one person on ${row.capacity.peakDay}`,
      };
      // The no-line declaration counts in the person's capacity arithmetic, but
      // it deliberately has no holder. A partial set of named holders is not a
      // joint owner of the whole condition, so observe it rather than guessing
      // an apex or assigning the owner declaration to a named line.
      if (hasNoLine || !holderIds.length) {
        out.push({
          ...base,
          seatState: 'unattributed',
          seatId: null,
          expectedOutcome: `On ${row.capacity.peakDay} the live commitments ${row.personName} carries add up to ${share(row.capacity.peakSumH)} of one person against a basis of ${share(GOAL_COMMITMENT_PERSON_BASIS_H)}. At least one declaration is explicitly owed under no reporting line, so no complete named-holder set exists for a joint-apex ask. The reading is printed and observed; nobody is substituted.`,
          observation: `Concurrent declared effort for one person peaks above one whole person, but at least one peak declaration is explicitly owed under no reporting line.`,
        });
      } else {
        const routed = routeTo(holderIds);
        out.push({
          ...base,
          seatState: routed.seatState,
          seatId: routed.seatId,
          expectedOutcome: `On ${row.capacity.peakDay} the live commitments ${row.personName} carries add up to ${share(row.capacity.peakSumH)} of one person against a basis of ${share(GOAL_COMMITMENT_PERSON_BASIS_H)} — ${share(row.capacity.overByH)} more than one person has. ${row.capacity.peakCommitments.length} commitment(s) from ${holderIds.length} line(s) cover that day, and the total is exact integer hundredths, not an estimate. No one line can fix this alone: the lines have to decide between them what comes out of the week. Re-baseline or release a commitment, or declare why the total stands, on #/${GOAL_COMMITMENT_ROUTE}?panel=commitments. This ask closes itself when the peak day no longer exceeds one person. It is not a judgement about ${row.personName}.`,
          observation: `Concurrent declared effort for one person peaks above one whole person.`,
        });
      }
    }

    /* 4. One line broke its OWN declared share while the whole week still fits. */
    if (row.capacity.verdict !== 'overcommit') {
      for (const line of row.capacity.lines) {
        if (line.verdict !== 'overcommit' || !line.holderId) continue;
        const seatState = seatOf(line.holderId);
        out.push({
          kind: 'line-share-exceeded',
          signature: goalCommitmentSignature('line-share', `${row.personId}|${line.lineKey}`),
          seatState,
          seatId: seatState === 'seat' ? line.holderId : null,
          dueOn: addDays(report.today, K.askDueDays),
          title: `Your line promised ${share(line.peakSumH)} of ${row.personName}; it was given ${share(line.declaredShareH)}`,
          expectedOutcome: `On ${line.peakDay} the commitments your line declared for ${row.personName} add up to ${share(line.peakSumH)} of one person, against the ${share(line.declaredShareH)} your line holds of them — ${share(line.overByH)} more than you were given. ${row.personName}'s week as a whole still fits inside one person, so this is your line's own arithmetic and it has not been escalated above you. Re-baseline or release one of your commitments, re-tune the declared share with the person and their other lines, or record why the promise stands, on #/${GOAL_COMMITMENT_ROUTE}?panel=commitments. This ask closes itself when your line's peak is inside its declared share.`,
          observation: `One reporting line's declared commitments peak above that line's own declared share of the person.`,
        });
      }
    }
  }
  return out;
}

export function goalCommitmentRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // move a window, a line, a share, a goal or a roster seat.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(GOAL_COMMITMENT_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  const conv = normalizeGoalCommitmentSettings(draft.settings || {});
  if (conv.goalCommitmentAutoPropagate === false) return [];
  if (!Array.isArray(draft.goalCommitments) || !draft.goalCommitments.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    // `buildMatrix` — built ONCE inside the reader — decides every joint apex,
    // every declared line share and every roll-up below. Silencing this rule
    // therefore reaches a second reporting line (see pausePermitRegistry.js).
    report = buildGoalCommitments(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  const conditions = goalCommitmentConditions(report);
  const existing = indexGoalCommitmentAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition cleared or whose accountable seat moved. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = condition
      ? `${GOAL_COMMITMENT_CLOSED_PREFIX} the seat this condition is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${GOAL_COMMITMENT_CLOSED_PREFIX} the goal-commitment register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a goal-commitment ask: the accountable seat changed.' : 'Closed a goal-commitment ask: the condition cleared.');
  }

  /* 2. File one bounded dated ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `goal-commitment|obs|${condition.signature}|${condition.seatState}`;
      draft.goalCommitmentMarkers = Array.isArray(draft.goalCommitmentMarkers) ? draft.goalCommitmentMarkers : [];
      if (!draft.goalCommitmentMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owed to the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The leader it is owed to is no longer on the active roster; nobody was substituted.'
            : condition.seatState === 'unattributed'
              ? 'At least one declaration is explicitly owed under no reporting line, so no complete named-holder set exists; nobody was substituted.'
              : 'The lines share no single joint apex, so the conflict is printed and no owner is invented.';
        const detail = `${condition.observation} ${why}`;
        draft.goalCommitmentMarkers.push({ key, at: nowIso, ruleId: GOAL_COMMITMENT_RULE_ID, kind: GOAL_COMMITMENT_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.goalCommitmentMarkers.length > MATRIX_LIMITS.markers) draft.goalCommitmentMarkers.splice(0, draft.goalCommitmentMarkers.length - MATRIX_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', GOAL_COMMITMENT_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(GOAL_COMMITMENT_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= GOAL_COMMITMENT_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${GOAL_COMMITMENT_RULE_ID} from the cross-line goal commitment register (#/${GOAL_COMMITMENT_ROUTE}?panel=commitments). It reads dated commitment declarations, live goals and the reporting graph only; it is not a rating of anyone.`,
      delegatedOn: today,
      dueOn: condition.dueOn,
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
      sourceType: 'person', sourceId: condition.seatId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: GOAL_COMMITMENT_RULE_ID, summary: goalCommitmentAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(report.internal.matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!report.internal.matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: GOAL_COMMITMENT_RULE_ID, summary: 'A goal-commitment ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'target-conflict'
        ? `Routed an opposed-target conflict to the lines’ joint apex, due ${condition.dueOn}.`
        : condition.kind === 'magnitude-conflict'
          ? `Routed an incompatible target-magnitude conflict to the lines’ joint apex, due ${condition.dueOn}.`
          : condition.kind === 'capacity-overcommit'
            ? `Routed a capacity overcommit to the joint apex of every line carrying it, due ${condition.dueOn}.`
            : `Asked one line holder about commitments above their own declared share, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', GOAL_COMMITMENT_ROUTE,
      `${deferred} goal-commitment ask(s) were deferred (cap ${GOAL_COMMITMENT_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

goalCommitmentRule.id = 'goalCommitmentRule';

export default goalCommitmentRule;
