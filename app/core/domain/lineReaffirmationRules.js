/**
 * app/core/domain/lineReaffirmationRules.js — RULE-LRF-01, the Matrix Line
 * Re-Affirmation Register's one consequence (ADR-0157, Schema v129).
 *
 * THE DUTY. A register that prints "term lapsed" is a dashboard. The duty a
 * leader performs is to put a dated, owned question in front of the one person
 * who can answer it — BEFORE the next capacity plan, the next pay cycle or the
 * next review is built on a share nobody has agreed to.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * ------------------------------------
 *  - It fires on a DECLARATION (`matrix.line.declared`), a RETUNE
 *    (`matrix.line.retuned`), a RE-AFFIRMATION ANSWER, a RELEASE, and an explicit
 *    scan. It never fires on a read.
 *  - For a `no-term` or a `term-lapsed` line it issues at most ONE owned, dated
 *    delegation addressed to the manager who HOLDS the line, asking them to
 *    re-affirm it for a stated term or release it with a reason.
 *  - For a `reaffirmation-due` line it issues the same ask, keyed to the term that
 *    is coming to an end, so next year's window is a new question rather than a
 *    suppressed one.
 *  - For a line the manager re-affirmed whose person has not answered, and the
 *    ask window has passed, it issues ONE delegation addressed to the PERSON.
 *  - For a person who OBJECTED it issues ONE delegation addressed to the HOME
 *    line of that person — the disagreement has to reach somebody with the
 *    standing to end or change the line. It does not end the line itself and it
 *    never addresses the objecting person's own ask back at them.
 *  - It writes typed provenance only (`concerns` from the person to the manager,
 *    `issues-obligation` from the person to the task, `rolls-up-to` per leadership
 *    ancestor in the matrix DAG) — the relations every other module already uses.
 *    It adds no second graph.
 *  - It NEVER re-affirms, releases, accepts or objects on anybody's behalf, never
 *    edits a share, never ends a declaration, and never invents a manager.
 *  - It is IDEMPOTENT through a per-line marker, and BOUNDED by a
 *    per-transaction cap whose remainder is counted and retried by a scan.
 *  - It is INERT on every other event and in a single-chain workspace.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildLineReaffirmation } from './lineReaffirmation.js';
import { normalizeLineReaffirmationSettings } from './lineReaffirmationSchema.js';
import {
  LINE_REAFFIRMATION_EVENTS,
  LINE_REAFFIRMATION_LIMITS,
  LINE_REAFFIRMATION_RULE_ID,
  LINE_REAFFIRMATION_STATES,
} from './lineReaffirmationRegistry.js';

const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const LINE_REAFFIRMATION_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: LINE_REAFFIRMATION_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${LINE_REAFFIRMATION_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.lineReaffirmationMarkers)) draft.lineReaffirmationMarkers = [];
  if (draft.lineReaffirmationMarkers.some((m) => m && m.key === key)) return false;
  draft.lineReaffirmationMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  const cap = LINE_REAFFIRMATION_LIMITS.markers || 900;
  if (draft.lineReaffirmationMarkers.length > cap) {
    draft.lineReaffirmationMarkers.splice(0, draft.lineReaffirmationMarkers.length - cap);
  }
  return true;
}

const TRIGGERS = Object.freeze([
  'matrix.line.declared',
  'matrix.line.retuned',
  LINE_REAFFIRMATION_EVENTS.REAFFIRM,
  LINE_REAFFIRMATION_EVENTS.RELEASE,
  LINE_REAFFIRMATION_EVENTS.ACCEPT,
  LINE_REAFFIRMATION_EVENTS.OBJECT,
  LINE_REAFFIRMATION_EVENTS.SCAN,
]);

/** Push one issue-obligation edge from the person to the task and roll it up. */
function wireTask(draft, ctx, { taskId, personId, matrix, summary, rollupSummary }) {
  let edges = 0;
  ensureEntityLink(draft, {
    sourceType: 'person', sourceId: personId,
    targetType: 'delegation', targetId: taskId,
    relation: 'issues-obligation', ruleId: LINE_REAFFIRMATION_RULE_ID,
    summary,
  }, { idFactory: ctx.idFactory, todayStr: ctx.todayStr, nowIso: ctx.nowIso });
  const node = matrix.nodes.get(personId) || null;
  for (const ancestorId of [...((node && node.ancestors) || [])]) {
    const rolled = ensureEntityLink(draft, {
      sourceType: 'delegation', sourceId: taskId,
      targetType: 'person', targetId: ancestorId,
      relation: 'rolls-up-to', ruleId: LINE_REAFFIRMATION_RULE_ID,
      summary: rollupSummary,
    }, { idFactory: ctx.idFactory, todayStr: ctx.todayStr, nowIso: ctx.nowIso });
    if (rolled.created) edges += 1;
  }
  return edges;
}

function pushTask(draft, ctx, { personId, title, expectedOutcome, support, dueOn }) {
  const taskId = ctx.idFactory('dlg');
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: ctx.today,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  });
  return taskId;
}

export function lineReaffirmationRule(draft, ctx = {}) {
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
    today,
    todayStr: today,
    nowIso: now.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const conv = normalizeLineReaffirmationSettings(draft.settings || {});

  // The read model is recomputed on the WHOLE workspace with the operator view,
  // so the work this rule issues matches what the panel shows the leader — not
  // only the slice that happens to pass the acting seat's filter.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });
  const report = buildLineReaffirmation(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;

  for (const person of report.persons) {
    for (const line of person.lines) {
      /* ---- 1. NOBODY HAS EVER GIVEN THIS LINE A TERM, OR ITS TERM HAS RUN
              OUT, OR IT IS INSIDE ITS WARNING WINDOW: ask the manager who HOLDS
              the line. The key carries the state and the term end, because a
              lapsed term and the re-affirmation that followed it are different
              questions and the second must be asked. ---- */
      const askManager =
        line.state === LINE_REAFFIRMATION_STATES.noTerm
        || line.state === LINE_REAFFIRMATION_STATES.lapsed
        || line.state === LINE_REAFFIRMATION_STATES.due
        || line.state === LINE_REAFFIRMATION_STATES.changed;
      if (askManager) {
        const markerKey = `reaffirm|${line.declarationId}|${line.state}|${line.termEndsOn || 'none'}|${line.sharePct === null ? 'undeclared' : line.sharePct}`;
        if (draft.lineReaffirmationMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

        const dueOn = addDays(today, conv.lineReaffirmAskDueDays);
        const shareText = line.sharePct === null ? 'an undeclared share' : `${line.sharePct}%`;
        const why = line.state === LINE_REAFFIRMATION_STATES.noTerm
          ? `This ${line.kind} line has never been given a term, so the share is inherited every day nobody asks.`
          : line.state === LINE_REAFFIRMATION_STATES.lapsed
            ? `The term on this ${line.kind} line ended ${line.termEndsOn}, and the share is still charged.`
            : line.state === LINE_REAFFIRMATION_STATES.due
              ? `The term on this ${line.kind} line ends ${line.termEndsOn}.`
              : `The share was re-affirmed at a different number and the line now declares ${shareText}.`;

        const taskId = pushTask(draft, hookCtx, {
          personId: line.managerId,
          title: `${line.state === LINE_REAFFIRMATION_STATES.changed ? 'Re-affirm at the current share' : 'Re-affirm or release'} the ${line.kind} share of ${person.personName}${line.sharePct === null ? '' : ` (${line.sharePct}%)`}`,
          expectedOutcome: `By ${dueOn}, ${line.managerName} has either re-affirmed this line for ${person.personName} — stating the date the new term runs to and, optionally, what the line is on the hook to deliver — or released it with a stated reason. ${why} Re-affirming records that the commitment still holds; releasing records that it does not, and the declaration itself is then dated out with the governed End action.`,
          support: `Issued by ${LINE_REAFFIRMATION_RULE_ID}. A line is an agreement for a period, not a standing grant; nobody renews it by continuing to work under it.`,
          dueOn,
        });

        // The person-to-manager relationship this line created, so the ask is
        // reachable from the person and not only from a task queue.
        const concern = ensureEntityLink(draft, {
          sourceType: 'person', sourceId: line.personId,
          targetType: 'person', targetId: line.managerId,
          relation: 'concerns', ruleId: LINE_REAFFIRMATION_RULE_ID,
          summary: `A declared ${line.kind} line makes this person accountable to this manager for a term nobody has re-affirmed.`,
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
        if (concern.created) rollupEdges += 1;

        rollupEdges += wireTask(draft, hookCtx, {
          taskId, personId: line.personId, matrix,
          summary: 'A line whose term is open, lapsed or due was issued as a dated re-affirmation ask.',
          rollupSummary: 'An unrenewed declared line rolls up to this leadership span.',
        });

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the re-affirmation ask for declared line ${line.declarationId}.`);
        obligations += 1;
        continue;
      }

      /* ---- 2. RE-AFFIRMED, PERSON NOT ANSWERED: ask the PERSON, not the
              manager. A manager renewing a share of somebody else's hours is not
              the person being told. ---- */
      if (line.state === LINE_REAFFIRMATION_STATES.awaitingPerson) {
        const since = line.lastAnsweredOn ? daysBetween(line.lastAnsweredOn, today) : null;
        if (since === null || since < conv.lineReaffirmAskDueDays) continue;
        const markerKey = `answer|${line.declarationId}|${line.lastAnsweredOn}`;
        if (draft.lineReaffirmationMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

        const dueOn = addDays(today, conv.lineReaffirmAskDueDays);
        const taskId = pushTask(draft, hookCtx, {
          personId: line.personId,
          title: `Answer the re-affirmed ${line.kind} share your manager renewed${line.sharePct === null ? '' : ` (${line.sharePct}%)`}`,
          expectedOutcome: `By ${dueOn}, ${person.personName} has either accepted that ${line.managerName} still holds this line and that the declared share is still taken from their hours, or objected in their own words. The re-affirmation is ${since} day(s) old and nobody has told them. Only the person can record this; a manager answering on their behalf would be exactly the inherited accountability this register exists to name.`,
          support: `Issued by ${LINE_REAFFIRMATION_RULE_ID} because a manager renewed a share of somebody else's hours and the person was never asked.`,
          dueOn,
        });

        rollupEdges += wireTask(draft, hookCtx, {
          taskId, personId: line.personId, matrix,
          summary: 'A re-affirmed share the person has not answered was issued as a dated ask to the person.',
          rollupSummary: 'An unacknowledged renewal rolls up to this leadership span.',
        });

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the person's answer ask for re-affirmed line ${line.declarationId}.`);
        obligations += 1;
        continue;
      }

      /* ---- 3. THE PERSON OBJECTED: the disagreement has to reach somebody with
              the standing to end or change the line. It goes to the HOME line
              manager — the one seat every matrix workspace has — and NEVER back
              to the objecting person. ---- */
      if (line.state === LINE_REAFFIRMATION_STATES.objected) {
        const markerKey = `objection|${line.declarationId}|${line.personAnsweredOn || 'undated'}`;
        if (draft.lineReaffirmationMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }
        const homeManagerId = person.homeManagerId || null;
        if (!homeManagerId || homeManagerId === line.managerId) {
          // The seat that would settle it is the line itself, which has already
          // answered. Nothing is invented and nothing is issued; the finding is
          // printed on the panel instead.
          recordMarker(draft, hookCtx, markerKey, 'noted',
            `Objection on line ${line.declarationId} has no separate home line to escalate to; reported on the register only.`);
          continue;
        }

        const dueOn = addDays(today, conv.lineReaffirmAskDueDays);
        const taskId = pushTask(draft, hookCtx, {
          personId: homeManagerId,
          title: `${person.personName} objected to the ${line.kind} share held by ${line.managerName}`,
          expectedOutcome: `By ${dueOn}, the span that holds ${person.personName}’s home line has read the objection and either had the line changed or dated out, or recorded why the share still holds. The person’s words are on the register; this ask does not repeat them onto a task. The share is still charged in the meantime, and nobody has ended anybody else’s accountability by objecting.`,
          support: `Issued by ${LINE_REAFFIRMATION_RULE_ID} because the person whose hours a re-affirmed line takes said, in their own words, that it no longer holds.`,
          dueOn,
        });

        const homeNode = matrix.nodes.get(homeManagerId) || null;
        for (const ancestorId of [...((homeNode && homeNode.ancestors) || [])]) {
          const rolled = ensureEntityLink(draft, {
            sourceType: 'delegation', sourceId: taskId,
            targetType: 'person', targetId: ancestorId,
            relation: 'rolls-up-to', ruleId: LINE_REAFFIRMATION_RULE_ID,
            summary: 'An unanswered objection to a charged share rolls up to this leadership span.',
          }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
          if (rolled.created) rollupEdges += 1;
        }

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the objection escalation for line ${line.declarationId}.`);
        obligations += 1;
      }

      /* ---- 4. THE LINE RELEASED AND THE DECLARATION STILL CHARGES THE SHARE:
              ask the line's own manager to date it out. The register will not end
              it for them, so somebody has to be told. ---- */
      if (line.state === LINE_REAFFIRMATION_STATES.released && line.chargedDespiteRelease) {
        const markerKey = `endline|${line.declarationId}|${line.releasedOn || 'undated'}`;
        if (draft.lineReaffirmationMarkers?.some?.((m) => m && m.key === markerKey)) continue;
        if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

        const dueOn = addDays(today, conv.lineReaffirmAskDueDays);
        const taskId = pushTask(draft, hookCtx, {
          personId: line.managerId,
          title: `End the ${line.kind} line for ${person.personName} — it was released and is still charged`,
          expectedOutcome: `By ${dueOn}, the released line has been dated out with the governed End action, or the release has been reconsidered and the line re-affirmed. Releasing a commitment does not remove the charge: the declaration still holds ${line.sharePct === null ? 'an undeclared share' : `${line.sharePct}%`} of ${person.personName}, and every roll-up inherits it until a human ends the line.`,
          support: `Issued by ${LINE_REAFFIRMATION_RULE_ID} because a released commitment is still counted in the ledger's arithmetic.`,
          dueOn,
        });

        rollupEdges += wireTask(draft, hookCtx, {
          taskId, personId: line.personId, matrix,
          summary: 'A released but still-declared line was issued as a dated ask to end it.',
          rollupSummary: 'A released line still charging a share rolls up to this leadership span.',
        });

        recordMarker(draft, hookCtx, markerKey, 'obligation',
          `Issued the end-line ask for released declaration ${line.declarationId}.`);
        obligations += 1;
      }
    }
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'matrix',
      `Issued ${obligations} dated re-affirmation obligation(s) across ${report.persons.length} multi-line person(s); ${rollupEdges} roll-up edge(s).`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'matrix',
      `${deferredByCap} re-affirmation obligation(s) deferred by the per-transaction cap and left for the scan.`);
  }
  return out;
}
