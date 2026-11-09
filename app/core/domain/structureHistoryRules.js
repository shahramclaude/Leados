/**
 * app/core/domain/structureHistoryRules.js — RULE-SHR-01, Matrix Reorganisation
 * Reconciliation's one consequence (ADR-0149, Schema v124).
 *
 * THE DUTY. A register that prints "four stored acts now read against a
 * structure that was not there" is a dashboard. The duty a director performs,
 * the week after a reorganisation, is to put a DATED, OWNED question in front of
 * the manager who now holds the span — before the next review, the next budget
 * cycle or the next board pack is built by re-reading those acts against a
 * structure they never described.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on a HOME-LINE MOVE and on an explicit scan. A read never fires it.
 *  - For each person whose stored acts drift — an act that names a manager who
 *    was not part of that person's structure on the act's own day — it issues at
 *    most ONE owned, dated delegation, addressed to the manager who NOW holds
 *    that person's home line, naming how many acts are affected and which ones.
 *  - It writes typed provenance only (`issues-obligation` from the person to the
 *    task, `rolls-up-to` per leadership ancestor) — the relations every other
 *    module already uses. It adds no second graph.
 *  - It NEVER edits, re-points, migrates or withdraws a stored act. Correcting a
 *    historical record to match today's roster is the failure this module exists
 *    to catch, and an engine that did it would be committing it silently.
 *  - It writes NOTHING when nothing drifts: a reorganisation that re-pointed no
 *    act gains no task, because a task nobody needs is noise that trains people
 *    to ignore the queue.
 *  - It is IDEMPOTENT through a per-person-per-move marker, and BOUNDED by a
 *    per-transaction cap whose remainder is counted and retried by a scan.
 *  - It is INERT on every other event and in a workspace with no recorded
 *    structure history.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import { buildStructureLedger, reconcileActs } from './structureHistory.js';
import { normalizeStructureHistorySettings } from './structureHistorySchema.js';
import {
  STRUCTURE_HISTORY_EVENTS,
  STRUCTURE_HISTORY_LIMITS,
  STRUCTURE_HISTORY_RULE_ID,
} from './structureHistoryRegistry.js';

const MAX_OBLIGATIONS_PER_COMMIT = 6;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const STRUCTURE_HISTORY_RELATIONS = Object.freeze(['issues-obligation', 'rolls-up-to']);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: STRUCTURE_HISTORY_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${STRUCTURE_HISTORY_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.structureHistoryMarkers)) draft.structureHistoryMarkers = [];
  if (draft.structureHistoryMarkers.some((m) => m && m.key === key)) return false;
  draft.structureHistoryMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  const cap = STRUCTURE_HISTORY_LIMITS.markers;
  if (draft.structureHistoryMarkers.length > cap) {
    draft.structureHistoryMarkers.splice(0, draft.structureHistoryMarkers.length - cap);
  }
  return true;
}

const TRIGGERS = Object.freeze([
  STRUCTURE_HISTORY_EVENTS.HOME_LINE_MOVED,
  STRUCTURE_HISTORY_EVENTS.IMPORTED,
  STRUCTURE_HISTORY_EVENTS.STRUCTURE_ESTABLISHED,
  STRUCTURE_HISTORY_EVENTS.SCAN,
]);

export function structureHistoryRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.includes(event.type)) return [];

  const history = Array.isArray(draft.structureHistory) ? draft.structureHistory : [];
  if (!history.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const conv = normalizeStructureHistorySettings(draft.settings || {});

  // The read model is recomputed on the WHOLE workspace with the operator view,
  // so the work this rule issues matches what the panel shows the leader — not
  // only the slice that happens to pass the acting seat's filter.
  const view = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const book = buildStructureLedger(view);
  const acts = reconcileActs(view, { now, settings: view.settings, ledger: book });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;

  if (!acts.driftedN) {
    noteEffect(hookCtx, out, 'reconciled', 'workspace', 'structureHistory',
      `Reconciled ${acts.actsN} stored act(s) against the recorded structure of their own day; none drift.`);
    return out;
  }

  // Group the drifted acts by the person they are about: one ask per person, not
  // one per act. A manager facing eleven tasks about one person stops reading.
  const byPerson = new Map();
  for (const row of acts.drifted) {
    if (!byPerson.has(row.personId)) byPerson.set(row.personId, []);
    byPerson.get(row.personId).push(row);
  }
  const orderedPersons = [...byPerson.keys()].sort();

  for (const personId of orderedPersons) {
    if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

    const drifted = byPerson.get(personId);
    const person = (Array.isArray(draft.people) ? draft.people : []).find((p) => p && p.id === personId) || null;
    if (!person || person.status === 'archived') continue;

    // The manager who NOW holds the home line is the one who has to decide what
    // these acts mean now. Never a guessed predecessor, and never the person.
    const homeManagerId = person.managerId || LEADER_ID;

    // The marker names the drift set, so a NEW drift on the same person is a new
    // question and the earlier one cannot suppress it.
    const signature = drifted.map((d) => d.actId).sort().join(',');
    const markerKey = `reconcile|${personId}|${signature}`;
    if (draft.structureHistoryMarkers?.some?.((m) => m && m.key === markerKey)) continue;

    const dueOn = addDays(today, 14);
    const taskId = hookCtx.idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: homeManagerId,
      title: `Review ${drifted.length} stored record(s) that now read against a structure that was not there`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, ${homeManagerId} has reviewed ${drifted.length} record(s) about ${person.name} and decided, for each, whether it still means what it said or needs an explicit correction recorded as a NEW dated act. The affected records: ${drifted.slice(0, 6).map((d) => `${d.sourceLabel} ${d.actId} dated ${d.actDay} naming ${d.namedManagerName} (recorded structure had ${d.recordedManagerName})`).join('; ')}${drifted.length > 6 ? `; and ${drifted.length - 6} more` : ''}. Nothing has been edited automatically: rewriting a historical record to match today’s roster is precisely the drift this reconciliation exists to surface.`.slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${STRUCTURE_HISTORY_RULE_ID} in the same transaction as a home-line change. An act that names a manager who was not part of this person’s structure on the act’s own day cannot be read as evidence until a human says what it means now.`,
      delegatedOn: today,
      dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: personId,
      targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: STRUCTURE_HISTORY_RULE_ID,
      summary: 'Stored acts about this person no longer read against the structure of their own day.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

    const matrix = buildMatrix(view, { now, settings: view.settings });
    const node = matrix.nodes.get(homeManagerId) || null;
    for (const ancestorId of [...((node && node.ancestors) || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId,
        targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: STRUCTURE_HISTORY_RULE_ID,
        summary: 'Unreconciled stored acts roll up to this leadership span.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (rolled.created) rollupEdges += 1;
    }

    recordMarker(draft, hookCtx, markerKey, 'obligation',
      `Issued the reconciliation ask for ${drifted.length} drifted act(s) about ${personId}.`);
    obligations += 1;
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'structureHistory',
      `Issued ${obligations} dated reconciliation obligation(s) for stored acts that no longer read against their own day's structure.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'structureHistory',
      `Wrote ${rollupEdges} typed roll-up edge(s) for structure-history reconciliation.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'structureHistory',
      `${deferredByCap} reconciliation obligation(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  return out;
}

export { normalizeStructureHistorySettings };
