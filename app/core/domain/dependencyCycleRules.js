/**
 * app/core/domain/dependencyCycleRules.js — post-commit propagation (`RULE-CYC-01`)
 * for the Cross-Boundary & Single-Line Dependency Feedback-Cycle Register
 * (ADR-0183 / ADR-0187, Schema v148 unchanged).
 *
 * THE DUTY IT PERFORMS
 * --------------------
 * When declared precedence links close a directed feedback loop across work
 * records, no linear schedule can execute them in sequence. Session 251
 * (ADR-0183) built the exact strongly-connected-component reader; this rule
 * connects that reader to the shared post-commit automation spine:
 *
 *  1. Single-line feedback blocks (`single-line-holder` on the active roster)
 *     place ONE dated sequencing ask in front of that sole accountable manager,
 *     serving both single-chain and matrix workspaces.
 *  2. Cross-line feedback blocks with a unique `matrixJointApex` on the active
 *     roster place ONE dated sequencing ask in front of that joint apex — never
 *     one of the competing peer lines.
 *  3. Blocks whose authority sits at the workspace leader (`leader-held`), splits
 *     across incomparable minimal ancestors (`ambiguous`), names an off-roster
 *     holder (`off-roster`) or lacks complete line reach (`unattributed`) write
 *     ONE identity-free `matrixMarkers` observation (`kind: 'dependency-cycle'`)
 *     and substitute nobody.
 *  4. Every issued ask summarizes the exact counterfactual single-arc tear
 *     census without ever tearing an edge or choosing which commitment gives way,
 *     fans up the matrix DAG via `rolls-up-to`, and closes itself (`status = 'done'`)
 *     when the cycle clears or its owning seat changes. A cycle whose ask a
 *     human already closed is treated as answered and never re-asked while the
 *     same cycle signature stands.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { DERIVED_EVENT_PREFIXES, MATRIX_SCAN_EVENT } from './matrixRules.js';
import { buildDependencyCycles, indexDependencyCycleAsks } from './dependencyCycle.js';
import {
  DEPENDENCY_CYCLE_EVENTS,
  DEPENDENCY_CYCLE_LIMITS,
  DEPENDENCY_CYCLE_RELATION_KEYS,
  DEPENDENCY_CYCLE_RULE_ID,
} from './dependencyCycleRegistry.js';
import {
  DEPENDENCY_CYCLE_CLOSED_PREFIX,
  dependencyCycleAskSummary,
  normalizeDependencyCycleSettings,
} from './dependencyCycleSchema.js';

const PRECEDENCE_RELATIONS = new Set(DEPENDENCY_CYCLE_RELATION_KEYS);
const SCANS = new Set([DEPENDENCY_CYCLE_EVENTS.SCAN, MATRIX_SCAN_EVENT]);
const STRUCTURAL = new Set([
  DEPENDENCY_CYCLE_EVENTS.CONVENTIONS,
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'matrix.conventions.set',
]);

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: DEPENDENCY_CYCLE_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: DEPENDENCY_CYCLE_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${DEPENDENCY_CYCLE_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function hasPrecedenceOrObligationLink(links) {
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    if (PRECEDENCE_RELATIONS.has(link.relation)) return true;
    if (link.ruleId === DEPENDENCY_CYCLE_RULE_ID && link.relation === 'issues-obligation') return true;
  }
  return false;
}

function describeTearSensitivity(tearing, blockSize) {
  if (!tearing || !tearing.evaluated) {
    return `The block holds ${tearing?.internalPairsN ?? 0} distinct internal precedence pair(s), above the counterfactual tear bound; no partial tear sample was taken.`;
  }
  if (tearing.tearState === 'single-arc-tearable') {
    return `Counterfactual tear census: ${tearing.singleArcBreakN} of ${tearing.internalPairsN} distinct internal precedence pair(s) would uncouple all ${blockSize} record(s) into a sequential order if re-sequenced or split into an explicit premise.`;
  }
  if (tearing.tearState === 'partial-single-tear') {
    return `Counterfactual tear census: 0 single-pair removals uncouple the entire block, while ${tearing.partialTearN} of ${tearing.internalPairsN} pair(s) shrink the coupled core.`;
  }
  return `Counterfactual tear census: alternate directed paths keep all ${blockSize} record(s) coupled after any single-pair removal (${tearing.internalPairsN} internal pair(s)); settling the loop requires re-sequencing at least two pairs together.`;
}

function buildAskCopy(block, dueOn) {
  const scopePhrase = block.lineState === 'cross-line'
    ? `across ${block.lineIds.length} active reporting line(s) (escalated to joint apex)`
    : 'inside one reporting line';
  const memberList = block.members
    .slice(0, 6)
    .map((m) => `${m.type} “${m.title}”`)
    .join(', ');
  const extra = block.members.length > 6 ? ` (+${block.members.length - 6} more)` : '';
  const tearLine = describeTearSensitivity(block.tearing, block.size);
  return {
    title: `Unblock ${block.size}-record dependency cycle (${block.lineState === 'cross-line' ? 'cross-line' : 'single-line'})`,
    expectedOutcome: `${block.size} work record(s) form a closed precedence loop ${scopePhrase}: ${memberList}${extra}. ${tearLine} By ${dueOn}, review #/matrix?panel=cycles and either re-sequence/remove the declared precedence link(s) that should yield, or split an upstream assumption into a separate premise so one record can settle first. No edge was torn and no commitment was deprioritised automatically.`,
  };
}

export function dependencyCycleRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  const type = event.type;
  const isScan = SCANS.has(type);
  const isStructural = STRUCTURAL.has(type) || type.startsWith('person.') || type.startsWith('link.');
  const isOperational = !isScan && !isStructural && !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
  if (!isScan && !isStructural && !isOperational) return [];
  if (isOperational && ctx.derived) return [];

  const conv = normalizeDependencyCycleSettings(draft.settings || {});
  if (!isScan && conv.dependencyCycleAutoPropagate === false) return [];

  const people = Array.isArray(draft.people) ? draft.people : [];
  if (!people.length) return [];

  const links = Array.isArray(draft.links) ? draft.links : [];
  if (!hasPrecedenceOrObligationLink(links)) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  // Whole-workspace view so the accountable seat receives its ask regardless of
  // which seat triggered the commit.
  const wholeSettings = { ...(draft.settings || {}), activeSeatId: null };
  let matrix;
  try {
    matrix = buildMatrix(
      { people, reportingLines: Array.isArray(draft.reportingLines) ? draft.reportingLines : [], settings: wholeSettings },
      { now, settings: wholeSettings },
    );
  } catch {
    return [];
  }

  const report = buildDependencyCycles(draft, { now, settings: wholeSettings, visiblePersonIds: null });
  const feedback = report.blocks.filter((b) => b.state === 'feedback-cycle');
  const existingAsks = indexDependencyCycleAsks(draft);
  const openAsks = existingAsks.filter((a) => a.task && a.task.status === 'active');

  if (!feedback.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const out = [];
  const feedbackBySig = new Map(feedback.map((b) => [b.signature, b]));

  /* 1. Close asks whose coupled cycle cleared or whose owning seat moved. */
  const coveredSignatures = new Set();
  for (const ask of openAsks) {
    const liveBlock = feedbackBySig.get(ask.signature) || null;
    const stillStands = Boolean(liveBlock);
    const sameSeat = Boolean(
      liveBlock
      && liveBlock.escalation?.state === 'unique'
      && liveBlock.escalation.seatId === ask.seatId
      && ask.task.personId === ask.seatId,
    );
    if (stillStands && sameSeat) {
      coveredSignatures.add(`${ask.signature}|${ask.seatId}`);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = stillStands
      ? `${DEPENDENCY_CYCLE_CLOSED_PREFIX} the accountable seat for this coupled block changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${DEPENDENCY_CYCLE_CLOSED_PREFIX} the declared dependency graph no longer contains this coupled feedback cycle.`;
    ask.task.updatedAt = nowIso;
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      ask.task.id,
      stillStands
        ? 'Closed a dependency-cycle sequencing ask: the accountable seat changed.'
        : 'Closed a dependency-cycle sequencing ask: the coupled loop cleared.',
    );
  }

  /* 2. Issue bounded dated asks to unique active roster seats; observe the rest. */
  const dueOn = addDays(today, conv.dependencyCycleAskDueDays) || today;
  const linkCtx = { idFactory, todayStr: today, nowIso };
  let issued = 0;
  let deferred = 0;

  for (const block of feedback) {
    const esc = block.escalation;
    if (!esc) continue;
    if (esc.state !== 'unique' || !esc.seatId) {
      const markerKey = `dependency-cycle|obs|${today}|${block.signature}|${esc.state}`;
      draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
      if (!draft.matrixMarkers.some((m) => m && m.key === markerKey)) {
        const detail = `Coupled dependency block (${block.size} record(s), ${block.internalArcsN} internal arc(s), ${block.lineState}, tear state ${block.tearing?.tearState || 'unknown'}) has escalation state ${esc.state}; no roster seat was substituted.`;
        draft.matrixMarkers.push({
          key: markerKey,
          at: nowIso,
          ruleId: DEPENDENCY_CYCLE_RULE_ID,
          kind: 'dependency-cycle',
          detail: clip(detail, 300),
        });
        if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) {
          draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
        }
        noteEffect(ctx, out, 'observed', 'workspace', 'matrix-cycles', detail);
      }
      continue;
    }

    const seatId = esc.seatId;
    const coverKey = `${block.signature}|${seatId}`;
    if (coveredSignatures.has(coverKey)) continue;

    // Respect human closure: if a person closed an ask for this exact cycle & seat
    // while the cycle still stands, do not re-ask.
    const answeredByHuman = existingAsks.some((ask) => (
      ask.task
      && ask.signature === block.signature
      && ask.seatId === seatId
      && ask.task.personId === seatId
      && (
        (ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(DEPENDENCY_CYCLE_CLOSED_PREFIX))
        || ask.task.status === 'returned'
      )
    ));
    if (answeredByHuman) continue;

    if (issued >= DEPENDENCY_CYCLE_LIMITS.asksPerCommit) {
      deferred += 1;
      continue;
    }

    const copy = buildAskCopy(block, dueOn);
    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: seatId,
      title: clip(copy.title, 200),
      expectedOutcome: clip(copy.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${DEPENDENCY_CYCLE_RULE_ID} from the dependency feedback-cycle register (#/matrix?panel=cycles). This is a structural reading of declared precedence links and reporting lines, never a rating of anyone’s work.`,
      delegatedOn: today,
      dueOn,
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
      sourceType: 'person',
      sourceId: seatId,
      targetType: 'delegation',
      targetId: taskId,
      relation: 'issues-obligation',
      ruleId: DEPENDENCY_CYCLE_RULE_ID,
      summary: dependencyCycleAskSummary(block.signature),
    }, linkCtx);

    const ancestors = [...(matrix.nodes.get(seatId)?.ancestors || [])].sort();
    for (const ancestorId of ancestors) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: taskId,
        targetType: 'person',
        targetId: ancestorId,
        relation: 'rolls-up-to',
        ruleId: DEPENDENCY_CYCLE_RULE_ID,
        summary: 'A dependency-cycle sequencing ask rolls up to this span.',
      }, linkCtx);
    }

    coveredSignatures.add(coverKey);
    issued += 1;
    noteEffect(
      ctx,
      out,
      'delegated',
      'delegation',
      taskId,
      `Issued a dependency-cycle sequencing ask due ${dueOn} (${block.size} record(s), ${block.lineState}).`,
    );
  }

  if (deferred) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      'matrix-cycles',
      `${deferred} dependency-cycle ask(s) were deferred (cap ${DEPENDENCY_CYCLE_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`,
    );
  }

  return out;
}

dependencyCycleRule.id = 'dependencyCycleRule';

export default dependencyCycleRule;
