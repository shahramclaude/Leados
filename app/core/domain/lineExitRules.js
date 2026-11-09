/**
 * app/core/domain/lineExitRules.js — RULE-LEX-01, the Line-Exit Obligation
 * Register's one consequence (ADR-0152, Schema v127).
 *
 * THE DUTY. A register that only PRINTS "this ended line left two asks open" puts
 * the finding in front of whoever happened to open the panel. The leadership act
 * is the boring one: put a dated, owned obligation in front of the one person who
 * can settle it, and keep asking until they do.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on a line being DATED OUT (`matrix.line.ended`), on a review being
 *    COMPLETED (a completed review can itself leave an input ask open on a line
 *    that already ended), and on an explicit scan. It never fires on a read.
 *  - For every ENDED line that still carries open obligations, it issues ONE
 *    owned, dated DELEGATION to the manager who held that line: settle each
 *    obligation — retire it with a reason, or carry it to a named manager.
 *  - It writes typed provenance only (`concerns` from the person to the manager,
 *    `issues-obligation` from the person to the task, `rolls-up-to` per
 *    leadership ancestor in the matrix DAG).
 *  - It issues NOTHING when the manager who held the line is no longer on the
 *    roster: a task addressed to nobody could never close, and inventing an heir
 *    would be the reassignment this module refuses.
 *  - It issues NOTHING for a `vanished` line key (no declaration, no manager) and
 *    NOTHING for a home-keyed obligation (ADR-0149 owns that history).
 *  - It never retires anything, never carries anything, never edits an ask,
 *    never ends a line and never rates a person.
 *  - It is IDEMPOTENT through a marker keyed on the LINE plus the exact set of
 *    open obligations, so a settled obligation is not re-chased and a NEWLY
 *    opened one on the same line is.
 *  - It is bounded by a per-transaction cap whose remainder is counted and
 *    retried by an explicit scan, and it is inert in a single-chain workspace.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildLineExitReport } from './lineExit.js';
import { normalizeLineExitSettings } from './lineExitSchema.js';
import {
  LINE_EXIT_EVENTS,
  LINE_EXIT_LIMITS,
  LINE_EXIT_RULE_ID,
} from './lineExitRegistry.js';

/** A per-transaction cap, exactly as every other work-producing rule keeps. */
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const LINE_EXIT_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

const TRIGGERS = new Set([
  'matrix.line.ended',
  'review.completed',
  LINE_EXIT_EVENTS.SCAN,
]);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** A short, deterministic signature of the open obligation set for one line. */
function obligationSignature(keys) {
  const sorted = [...keys].sort();
  let hash = 0x811c9dc5;
  const joined = sorted.join(',');
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${sorted.length}:${hash.toString(16)}`;
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: LINE_EXIT_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${LINE_EXIT_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.lineExitMarkers)) draft.lineExitMarkers = [];
  if (draft.lineExitMarkers.some((m) => m && m.key === key)) return false;
  draft.lineExitMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  if (draft.lineExitMarkers.length > LINE_EXIT_LIMITS.markers) {
    draft.lineExitMarkers.splice(0, draft.lineExitMarkers.length - LINE_EXIT_LIMITS.markers);
  }
  return true;
}

/** One dated delegation, addressed to exactly one person, pointing at the record. */
function pushDelegation(draft, ctx, { personId, title, expectedOutcome, support, dueOn }) {
  const taskId = ctx.idFactory('dlg');
  const nowIso = ctx.now.toISOString();
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId,
    title: clampStr(title, 200),
    expectedOutcome: clampStr(expectedOutcome, 2000),
    authority: 'act-inform',
    support: clampStr(support, 2000),
    delegatedOn: dayKey(ctx.now),
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
  return taskId;
}

export function lineExitRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.has(event.type)) return [];

  const declaredLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declaredLines.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const conv = normalizeLineExitSettings(draft.settings || {});

  // Computed on the WHOLE workspace with the operator view, so the work this rule
  // issues matches what the panel showed the leader, whatever seat triggered the
  // commit.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const report = buildLineExitReport(fullStateView, {
    now,
    settings: fullStateView.settings,
    limit: Number.MAX_SAFE_INTEGER,
  });
  if (!report.lines.length) return [];

  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });
  const rosterIds = new Set(matrix.nodes.keys());

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let refusedUnattributable = 0;
  let refusedVanished = 0;
  let rollupEdges = 0;

  for (const line of report.lines) {
    const open = (line.obligations || []).filter((ob) => ob.state === 'open');
    if (!open.length) continue;

    /* A line key that resolves to no declaration has no manager to address, so no
       work is issued. The register prints it as unverifiable; inventing an heir
       would be the reassignment this module refuses. */
    if (line.verdict === 'vanished' || !line.managerId) { refusedVanished += 1; continue; }
    if (!rosterIds.has(line.managerId)) { refusedUnattributable += 1; continue; }

    const markerKey = `lex|${line.lineKey}|${obligationSignature(open.map((ob) => ob.key))}`;
    if (Array.isArray(draft.lineExitMarkers) && draft.lineExitMarkers.some((m) => m && m.key === markerKey)) continue;
    if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

    const dueOn = addDays(today, conv.lineExitDueDays);
    const afterWindow = open.filter((ob) => ob.windowVerdict === 'after').length;
    const title = `Settle ${open.length} open obligation(s) your ${line.kind} line left for ${line.personName}`;
    const expectedOutcome = `By ${dueOn}, ${line.managerName} has settled each open obligation listed against the ${line.kind} line that ended on ${line.endedOn || 'an unrecorded day'} for ${line.personName}: either retiring it with a stated reason (nothing was owed) or carrying it to a manager who holds a live line for the person today. ${afterWindow ? `${afterWindow} of them are about a work window that falls entirely outside the line's life and are FLAGGED for retirement, never retired automatically. ` : ''}The register will not decide either way: an obligation quietly dropped is a promise the record still shows as open.`;
    const support = `Issued by ${LINE_EXIT_RULE_ID} in the same transaction that ended the line or completed the review. This is not a rating of the manager: it is the closure step every ended piece of work in a matrix needs.`;
    const taskId = pushDelegation(draft, hookCtx, {
      personId: line.managerId,
      title,
      expectedOutcome,
      support,
      dueOn,
    });

    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: line.personId,
      targetType: 'person', targetId: line.managerId,
      relation: 'concerns', ruleId: LINE_EXIT_RULE_ID,
      summary: `This ended line left ${open.length} open obligation(s) addressed to this manager.`,
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: line.personId,
      targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: LINE_EXIT_RULE_ID,
      summary: 'An ended reporting line left open obligations; a dated settlement ask was issued.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

    const node = matrix.nodes.get(line.managerId) || null;
    let ancestors = 0;
    for (const ancestorId of [...((node && node.ancestors) || [])]) {
      if (ancestors >= LINE_EXIT_LIMITS.ancestors) break;
      ancestors += 1;
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId,
        targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: LINE_EXIT_RULE_ID,
        summary: 'An unsettled obligation from an ended line rolls up to this leadership span.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (rolled.created) rollupEdges += 1;
    }

    recordMarker(draft, hookCtx, markerKey, 'obligation',
      `Issued the line-exit settlement ask for ${open.length} obligation(s) on ended line ${line.lineKey}.`);
    obligations += 1;
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'matrix',
      `Issued ${obligations} dated settlement ask(s) to the managers of ended lines that still carry open obligations.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'matrix',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for line-exit obligations.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'matrix',
      `${deferredByCap} ended line(s) remain unsettled after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  if (refusedVanished) {
    noteEffect(hookCtx, out, 'refused-unattributable', 'workspace', 'matrix',
      `${refusedVanished} ended reference(s) carry open obligations but no declaration to address them to. No ask was issued: a task addressed to nobody could never close.`);
  }
  if (refusedUnattributable) {
    noteEffect(hookCtx, out, 'refused-off-roster', 'workspace', 'matrix',
      `${refusedUnattributable} ended line(s) are held by a manager no longer on the roster. No ask was issued, and no heir was invented.`);
  }
  return out;
}
