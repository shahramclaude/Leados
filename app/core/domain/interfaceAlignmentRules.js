/**
 * app/core/domain/interfaceAlignmentRules.js — post-commit propagation
 * (`RULE-OIA-01`) for the Product–Organisation Interface Alignment Matrix
 * (ADR-0189, Schema v149 unchanged).
 *
 * THE DUTY IT PERFORMS
 * --------------------
 * When declared work depends across two spans whose holders share no live
 * coordination channel — or an active agreement sits between two spans with
 * nothing behind it — no routine surfaces the misalignment. This rule connects
 * the alignment reader to the shared post-commit automation spine:
 *
 *  1. A finding whose pair resolves to ONE active roster seat (the unique
 *     `matrixJointApex` of the two holders) keeps at most ONE open dated ask:
 *     “open or renew a coordination channel — or record why the dependency
 *     stands without one”, or, for an idle agreement, “retire it or record
 *     what it stands ready for”.
 *  2. A finding whose apex is leader-held, splits across incomparable minimal
 *     ancestors (`ambiguous`), names an off-roster holder or lacks complete
 *     pair reach records ONE identity-free `matrixMarkers` observation
 *     (`kind: 'interface-alignment'`) and substitutes nobody.
 *  3. Every ask carries typed `issues-obligation` and matrix-DAG `rolls-up-to`
 *     provenance, closes itself (`Closed by RULE-OIA-01:`) when the finding
 *     clears or its owning seat moves, and never re-asks a finding a human
 *     answered while it stands.
 *
 * The rule never opens a channel, never signs an agreement, never edits a
 * dependency, never rates a manager, and is silent on EVERY path — including
 * explicit scans — while `interfaceAlignmentAutoPropagate` is off: a pause is a
 * pause (ADR-0188's own defect fix, Session 256).
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { DERIVED_EVENT_PREFIXES, MATRIX_SCAN_EVENT } from './matrixRules.js';
import { buildInterfaceAlignment, indexInterfaceAlignmentAsks } from './interfaceAlignment.js';
import {
  INTERFACE_ALIGNMENT_EVENTS,
  INTERFACE_ALIGNMENT_LIMITS,
  INTERFACE_ALIGNMENT_RELATION_KEYS,
  INTERFACE_ALIGNMENT_RULE_ID,
} from './interfaceAlignmentRegistry.js';
import {
  INTERFACE_ALIGNMENT_CLOSED_PREFIX,
  interfaceAlignmentAskSummary,
  normalizeInterfaceAlignmentSettings,
} from './interfaceAlignmentSchema.js';

const PRECEDENCE_RELATIONS = new Set(INTERFACE_ALIGNMENT_RELATION_KEYS);
const SCANS = new Set([INTERFACE_ALIGNMENT_EVENTS.SCAN, MATRIX_SCAN_EVENT]);
const STRUCTURAL = new Set([
  INTERFACE_ALIGNMENT_EVENTS.CONVENTIONS,
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'matrix.conventions.set',
]);

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: INTERFACE_ALIGNMENT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: INTERFACE_ALIGNMENT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${INTERFACE_ALIGNMENT_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function hasPrecedenceOrObligationLink(links) {
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    if (PRECEDENCE_RELATIONS.has(link.relation)) return true;
    if (link.ruleId === INTERFACE_ALIGNMENT_RULE_ID && link.relation === 'issues-obligation') return true;
  }
  return false;
}

function buildAskCopy(pair, matrix, dueOn) {
  const nameOf = (id) => matrix?.nodes?.get(id)?.name || id;
  const holders = `between “${nameOf(pair.managerAId)}” and “${nameOf(pair.managerBId)}”`;
  if (pair.verdict === 'idle-channel') {
    return {
      title: `Settle an idle interface agreement ${holders}`.slice(0, 200),
      expectedOutcome: `An ACTIVE operating agreement ${holders} carries zero live shared people and zero cross-span work dependency inside the declared window (${pair.depsOutOfWindowN} declared dependenc(ies) older than the window are printed beside the finding, never counted in-window). By ${dueOn}, review #/matrix?panel=alignment and either retire the agreement through the interface register or record what it stands ready for. Nothing was retired automatically and nobody was rated.`,
    };
  }
  const channelWord = pair.verdict === 'channel-not-live'
    ? `a DECLARED-but-dark channel (${pair.channelStateLabel})`
    : 'no coordination channel at all';
  return {
    title: `Open or renew a coordination channel ${holders}`.slice(0, 200),
    expectedOutcome: `${pair.depsN} declared work dependenc(ies) run ${holders} while the pair holds ${channelWord}. By ${dueOn}, review #/matrix?panel=alignment and either open or renew an interface agreement or shared cadence forum between the two holders, or record why the dependency stands without one. No channel was opened automatically and nobody was rated.`,
  };
}

export function interfaceAlignmentRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  const type = event.type;
  const isScan = SCANS.has(type);
  const isStructural = STRUCTURAL.has(type) || type.startsWith('person.') || type.startsWith('link.');
  const isOperational = !isScan && !isStructural && !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
  if (!isScan && !isStructural && !isOperational) return [];
  if (isOperational && ctx.derived) return [];

  const conv = normalizeInterfaceAlignmentSettings(draft.settings || {});
  // A pause is a pause: it governs every path, including explicit scans.
  if (conv.interfaceAlignmentAutoPropagate === false) return [];

  const people = Array.isArray(draft.people) ? draft.people : [];
  if (!people.length) return [];

  const links = Array.isArray(draft.links) ? draft.links : [];
  if (!hasPrecedenceOrObligationLink(links)) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

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

  const report = buildInterfaceAlignment(draft, { now, settings: wholeSettings, visiblePersonIds: null });
  const findings = report.pairs.filter((p) => p && p.isFinding && p.signature);
  const existingAsks = indexInterfaceAlignmentAsks(draft);
  const openAsks = existingAsks.filter((a) => a.task && a.task.status === 'active');

  if (!findings.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const out = [];
  const findingsBySig = new Map(findings.map((f) => [f.signature, f]));

  /* 1. Close asks whose finding cleared or whose owning seat moved. */
  const coveredSignatures = new Set();
  for (const ask of openAsks) {
    const liveFinding = findingsBySig.get(ask.signature) || null;
    const stillStands = Boolean(liveFinding);
    const sameSeat = Boolean(
      liveFinding
      && liveFinding.escalationState === 'unique'
      && liveFinding.escalationSeatId === ask.seatId
      && ask.task.personId === ask.seatId,
    );
    if (stillStands && sameSeat) {
      coveredSignatures.add(`${ask.signature}|${ask.seatId}`);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = stillStands
      ? `${INTERFACE_ALIGNMENT_CLOSED_PREFIX} the accountable seat for this interface finding changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${INTERFACE_ALIGNMENT_CLOSED_PREFIX} the alignment register no longer reports this finding.`;
    ask.task.updatedAt = nowIso;
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      ask.task.id,
      stillStands
        ? 'Closed an interface-alignment ask: the accountable seat changed.'
        : 'Closed an interface-alignment ask: the finding cleared.',
    );
  }

  /* 2. Issue bounded dated asks to unique active roster seats; observe the rest. */
  const dueOn = addDays(today, conv.interfaceAlignmentAskDueDays) || today;
  const linkCtx = { idFactory, todayStr: today, nowIso };
  let issued = 0;
  let deferred = 0;

  for (const finding of findings) {
    if (finding.escalationState !== 'unique' || !finding.escalationSeatId) {
      const markerKey = `interface-alignment|obs|${today}|${finding.signature}|${finding.escalationState}`;
      draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
      if (!draft.matrixMarkers.some((m) => m && m.key === markerKey)) {
        const detail = `Interface finding ${finding.verdict} (${finding.depsN} cross-span dependenc(ies), channel ${finding.channelState}, ${finding.sharedPeopleN} shared live contributor(s)) has escalation state ${finding.escalationState}; no roster seat was substituted.`;
        draft.matrixMarkers.push({
          key: markerKey,
          at: nowIso,
          ruleId: INTERFACE_ALIGNMENT_RULE_ID,
          kind: 'interface-alignment',
          detail: clip(detail, 300),
        });
        if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) {
          draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
        }
        noteEffect(ctx, out, 'observed', 'workspace', 'matrix-alignment', detail);
      }
      continue;
    }

    const seatId = finding.escalationSeatId;
    const coverKey = `${finding.signature}|${seatId}`;
    if (coveredSignatures.has(coverKey)) continue;

    // Respect human closure: a person who closed an ask for this exact finding
    // and seat while the finding stands is an ANSWER, not a reason to re-ask.
    const answeredByHuman = existingAsks.some((ask) => (
      ask.task
      && ask.signature === finding.signature
      && ask.seatId === seatId
      && ask.task.personId === seatId
      && (
        (ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(INTERFACE_ALIGNMENT_CLOSED_PREFIX))
        || ask.task.status === 'returned'
      )
    ));
    if (answeredByHuman) continue;

    if (issued >= INTERFACE_ALIGNMENT_LIMITS.asksPerCommit) {
      deferred += 1;
      continue;
    }

    const copy = buildAskCopy(finding, matrix, dueOn);
    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: seatId,
      title: clip(copy.title, 200),
      expectedOutcome: clip(copy.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${INTERFACE_ALIGNMENT_RULE_ID} from the product–organisation interface alignment matrix (#/matrix?panel=alignment). This is a structural reading of declared work dependencies and recorded coordination channels, never a rating of anyone’s work.`,
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
      ruleId: INTERFACE_ALIGNMENT_RULE_ID,
      summary: interfaceAlignmentAskSummary(finding.signature),
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
        ruleId: INTERFACE_ALIGNMENT_RULE_ID,
        summary: 'An interface-alignment ask rolls up to this span.',
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
      `Issued an interface-alignment ask due ${dueOn} (${finding.verdict}, ${finding.depsN} dependenc(ies)).`,
    );
  }

  if (deferred) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      'matrix-alignment',
      `${deferred} interface-alignment ask(s) were deferred (cap ${INTERFACE_ALIGNMENT_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`,
    );
  }

  return out;
}

interfaceAlignmentRule.id = 'interfaceAlignmentRule';

export default interfaceAlignmentRule;
