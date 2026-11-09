/**
 * app/core/domain/lineConsentRules.js — RULE-LCN-01, Matrix Line Consent's one
 * consequence (ADR-0148, Schema v123).
 *
 * THE DUTY. A register that prints "nobody answered" is a dashboard. The duty a
 * director performs is to put a dated, owned question in front of the one person
 * who can answer it — before the next capacity plan is built on a share nobody
 * agreed to.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on a DECLARATION (`matrix.line.declared`), a RETUNE
 *    (`matrix.line.retuned`) or an explicit scan. It never fires on an
 *    acceptance: answering a line is not a reason to ask about it again.
 *  - For a line nobody has answered it issues at most ONE owned, dated
 *    delegation, addressed to the manager the line was GIVEN to, asking them to
 *    accept or decline the share and its rights.
 *  - For a line whose manager accepted but whose person has not acknowledged it
 *    after the declared window, it issues at most ONE delegation addressed to the
 *    PERSON. The person, not the manager, is the only one who can close it.
 *  - It writes typed provenance only (`concerns` from the person to the manager,
 *    `issues-obligation` from the person to the task, `rolls-up-to` per
 *    leadership ancestor in the matrix DAG) — the relations every other module
 *    already uses. It adds no second graph.
 *  - It NEVER accepts, declines or acknowledges anything, never edits a share,
 *    never ends a declaration, and never invents a manager.
 *  - It is IDEMPOTENT through a per-line marker, and BOUNDED by a
 *    per-transaction cap whose remainder is counted and retried by a scan.
 *  - It is INERT on every other event and in a single-chain workspace.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildLineConsent } from './lineConsent.js';
import { normalizeLineConsentSettings } from './lineConsentSchema.js';
import {
  LINE_CONSENT_EVENTS,
  LINE_CONSENT_LIMITS,
  LINE_CONSENT_RULE_ID,
  LINE_CONSENT_STATES,
} from './lineConsentRegistry.js';

const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const LINE_CONSENT_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: LINE_CONSENT_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${LINE_CONSENT_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.lineConsentMarkers)) draft.lineConsentMarkers = [];
  if (draft.lineConsentMarkers.some((m) => m && m.key === key)) return false;
  draft.lineConsentMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  const cap = LINE_CONSENT_LIMITS.markers || 800;
  if (draft.lineConsentMarkers.length > cap) {
    draft.lineConsentMarkers.splice(0, draft.lineConsentMarkers.length - cap);
  }
  return true;
}

const TRIGGERS = Object.freeze([
  'matrix.line.declared',
  'matrix.line.retuned',
  LINE_CONSENT_EVENTS.SCAN,
]);

export function lineConsentRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.includes(event.type)) return [];

  const declaredLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declaredLines.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const conv = normalizeLineConsentSettings(draft.settings || {});

  // The read model is recomputed on the WHOLE workspace with the operator view,
  // so the work this rule issues matches what the panel shows the leader — not
  // only the slice that happens to pass the acting seat's filter.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });
  const report = buildLineConsent(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;

  for (const person of report.persons) {
    for (const line of person.lines) {
      /* ---- 1. NOBODY ANSWERED, OR THE SHARE MOVED: ask the manager the line
              was given to. A retuned share is a NEW question: consent to 40% is
              not consent to 90%, and the marker carries the share so the ask
              cannot be suppressed by the earlier declaration's marker. ---- */
      if (line.state === LINE_CONSENT_STATES.unanswered || line.state === LINE_CONSENT_STATES.changed) {
        const markerKey = `accept|${line.declarationId}|${line.sharePct === null ? 'undeclared' : line.sharePct}`;
        if (draft.lineConsentMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

        const dueOn = addDays(today, conv.lineConsentAskDueDays);
        const taskId = hookCtx.idFactory('dlg');
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift({
          id: taskId,
          personId: line.managerId,
          title: `${line.state === LINE_CONSENT_STATES.changed ? 'Re-accept or decline' : 'Accept or decline'} the ${line.kind} share of ${person.personName}${line.sharePct === null ? '' : ` (${line.sharePct}%)`}`.slice(0, 200),
          expectedOutcome: `By ${dueOn}, ${line.managerName} has either accepted this line for ${person.personName} — stating the date the acceptance runs to and, optionally, what the line is on the hook to deliver — or declined it with a stated reason. The line was declared by another manager; until it is answered, the register records a share nobody agreed to and the person has not been told. Refusing the excess is not misconduct: declining is a recorded answer.`.slice(0, 2000),
          authority: 'act-inform',
          support: `Issued by ${LINE_CONSENT_RULE_ID} in the same transaction that declared the line. A share is an ask until the manager it was given to answers it.`,
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

        // The person-to-manager relationship this line created, so the ask is
        // reachable from the person and not only from a task queue.
        const concern = ensureEntityLink(draft, {
          sourceType: 'person', sourceId: line.personId,
          targetType: 'person', targetId: line.managerId,
          relation: 'concerns', ruleId: LINE_CONSENT_RULE_ID,
          summary: `A declared ${line.kind} line makes this person accountable to this manager until it is answered.`,
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
        if (concern.created) rollupEdges += 1;

        ensureEntityLink(draft, {
          sourceType: 'person', sourceId: line.personId,
          targetType: 'delegation', targetId: taskId,
          relation: 'issues-obligation', ruleId: LINE_CONSENT_RULE_ID,
          summary: 'A declared share was issued as a dated acceptance ask.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

        const node = matrix.nodes.get(line.managerId) || null;
        for (const ancestorId of [...((node && node.ancestors) || [])]) {
          const rolled = ensureEntityLink(draft, {
            sourceType: 'delegation', sourceId: taskId,
            targetType: 'person', targetId: ancestorId,
            relation: 'rolls-up-to', ruleId: LINE_CONSENT_RULE_ID,
            summary: 'An unanswered declared share rolls up to this leadership span.',
          }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
          if (rolled.created) rollupEdges += 1;
        }

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the acceptance ask for declared line ${line.declarationId}.`);
        obligations += 1;
        continue;
      }

      /* ---- 2. ACCEPTED, PERSON NOT TOLD: ask the person, not the manager. ---- */
      if (line.state === LINE_CONSENT_STATES.awaitingPerson) {
        const since = line.acceptedOn ? daysBetween(line.acceptedOn, today) : null;
        if (since === null || since < conv.lineConsentAckDays) continue;
        const markerKey = `ack|${line.declarationId}|${line.acceptedOn}`;
        if (draft.lineConsentMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

        const dueOn = addDays(today, conv.lineConsentAckDays);
        const taskId = hookCtx.idFactory('dlg');
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift({
          id: taskId,
          personId: line.personId,
          title: `Acknowledge the ${line.kind} share your manager accepted${line.sharePct === null ? '' : ` (${line.sharePct}%)`}`.slice(0, 200),
          expectedOutcome: `By ${dueOn}, ${person.personName} has acknowledged that ${line.managerName} holds this line and that the declared share is taken from their hours — or has said, in their own words, that it is not. The acceptance is ${since} day(s) old and nobody has told them. Only the person can record this; a manager acknowledging on their behalf would be exactly the shadow accountability this register exists to name.`.slice(0, 2000),
          authority: 'act-inform',
          support: `Issued by ${LINE_CONSENT_RULE_ID} because a manager accepted a share of somebody else's hours and the person was never told.`,
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
          sourceType: 'person', sourceId: line.personId,
          targetType: 'delegation', targetId: taskId,
          relation: 'issues-obligation', ruleId: LINE_CONSENT_RULE_ID,
          summary: 'An accepted share was issued as a dated acknowledgement ask to the person.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

        const personNode = matrix.nodes.get(line.personId) || null;
        for (const ancestorId of [...((personNode && personNode.ancestors) || [])]) {
          const rolled = ensureEntityLink(draft, {
            sourceType: 'delegation', sourceId: taskId,
            targetType: 'person', targetId: ancestorId,
            relation: 'rolls-up-to', ruleId: LINE_CONSENT_RULE_ID,
            summary: 'An unacknowledged accepted share rolls up to this leadership span.',
          }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
          if (rolled.created) rollupEdges += 1;
        }

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the acknowledgement ask for declared line ${line.declarationId}.`);
        obligations += 1;
      }
    }
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'matrix',
      `Issued ${obligations} dated consent obligation(s) on declared reporting lines.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'matrix',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for matrix line consent.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'matrix',
      `${deferredByCap} consent obligation(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  return out;
}
