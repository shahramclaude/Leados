/**
 * app/core/domain/assuranceFindingRules.js — `RULE-AFR-01` on the shared
 * post-commit spine (ADR-0232, Schema v187).
 *
 * THREE CONDITIONS, all read from the ONE kernel (`buildAssuranceFindings`) and
 * the live reporting graph, never re-derived here:
 *
 *   1. `remediation-overdue` — a finding past its declared remediation day with
 *      lines that have not asserted. The ask goes to whoever that line's own
 *      record names: the ACCOUNTABLE HOLDER where no owner has been named yet
 *      (naming an owner is the holder's act, and it is the only thing that can
 *      unstick the line), and the NAMED OWNER where one exists. Never both, and
 *      never a manager asked to do a subordinate's act.
 *   2. `verification-overdue` — a fix that was asserted and is still untested
 *      past the finding's verification day. The ask goes to the JOINT APEX
 *      ABOVE THE OWNER'S OWN LINES — the lowest seat that sits strictly above
 *      the owner, which is exactly the seat independence requires. The owner is
 *      never asked to grade their own fix, and no unrelated seat is asked.
 *   3. `recurrence` — the same control and scope is on the record again after a
 *      predecessor that was CLOSED AS VERIFIED: a tested fix that did not hold.
 *      The ask goes to the JOINT APEX ABOVE EVERY ACCOUNTABLE LINE, because a
 *      cross-functional failure that came back is a structural question, not one
 *      line's homework. One ask per finding, ever.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no control, no scope, no criteria, no statement
 * and no person: a dated act is owed on the assurance register, and the
 * addressee opens it. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never assigns, asserts, verifies or accepts; never
 * edits a finding or an act; never closes anything by the passage of time;
 * never derives a severity; never decides that a fix failed — recurrence is
 * READ from two dated records, not inferred from wording; and never rates a
 * person from backlog or age. Asks are `act-inform` delegations with typed
 * `issues-obligation` provenance, idempotent per (signature, addressee),
 * self-closing when the condition clears or the addressee moves, bounded at 4
 * per commit with the remainder counted, and pause-governed on every path
 * including an explicit scan (`assuranceAutoPropagate`).
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { activeManagersOf } from './dutyMeans.js';
import { buildAssuranceFindings } from './assuranceFinding.js';
import {
  afrAskSummary,
  afrRecurrenceSignature,
  afrRemediationSignature,
  afrVerificationSignature,
  parseAfrAskSummary,
} from './assuranceFindingMath.js';
import {
  AFR_EVENT_PREFIX,
  AFR_FLAGS,
  AFR_LIMITS as L,
  AFR_RULE_ID,
  AFR_ROUTE,
} from './assuranceRegistry.js';
import { normalizeAssuranceSettings } from './assuranceRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: AFR_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: AFR_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${AFR_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexAssuranceAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== AFR_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseAfrAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over (state, report, matrix,
 * today); exported so the test suite can pin every branch without a store.
 */
export function assuranceConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const rows = list(report?.rows);
  if (!rows.length) return { conditions: out, observations };

  // The reporting graph is read here — and only here — to decide who can still
  // be ASKED. A person the graph cannot name is not asked and is never
  // substituted for; the observation carries the reason and no identity.
  const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID && Boolean(matrix?.nodes?.has(id));

  for (const row of rows) {
    const remediationOverdue = row.overdue.includes(AFR_FLAGS.remediationOverdue);
    const verificationOverdue = row.overdue.includes(AFR_FLAGS.verificationOverdue);

    if (remediationOverdue) {
      for (const entry of row.accountable) {
        if (entry.lineState === 'asserted' || entry.lineState === 'verified') continue;
        const target = entry.lineState === 'unassigned' ? entry.personId : entry.ownerId;
        const signature = afrRemediationSignature(`${row.id}|${entry.lineId}`);
        if (!target || !askable(target)) {
          observations.push({
            key: `afr1|no-ask|${signature}`,
            detail: entry.lineState === 'unassigned'
              ? 'A finding is past its remediation day and an accountable line has named no owner; the line’s holder does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.'
              : 'A finding is past its remediation day and a line’s named remediation owner does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
          });
          continue;
        }
        out.push({
          kind: entry.lineState === 'unassigned' ? 'assignment-owed' : 'remediation-overdue',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          findingId: row.id,
          detail: entry.lineState === 'unassigned'
            ? 'A finding is past its remediation day and an accountable line has named no remediation owner.'
            : 'A finding is past its remediation day and a line’s owner has not asserted the fix.',
        });
      }
    }

    if (verificationOverdue) {
      for (const entry of row.accountable) {
        if (entry.lineState !== 'asserted') continue;
        const signature = afrVerificationSignature(`${row.id}|${entry.lineId}`);
        const managers = activeManagersOf(matrix, entry.ownerId);
        if (!managers.length) {
          observations.push({
            key: `afr1|no-ask|${signature}`,
            detail: 'A fix was asserted and is past the finding’s verification day, and the owner’s reporting graph names no seat above them. Independence cannot be manufactured, so nobody was asked.',
          });
          continue;
        }
        const apex = matrixJointApexSafe(matrix, managers);
        const seats = apex.filter(askable);
        if (!seats.length) {
          observations.push({
            key: `afr1|no-ask|${signature}`,
            detail: 'A fix was asserted and is past the finding’s verification day, and no seat strictly above the owner resolves on the reporting graph. Nobody was asked and no substitute verifier was invented.',
          });
          continue;
        }
        out.push({
          kind: 'verification-overdue',
          signature,
          seatIds: seats,
          dueOn: addDays(today, L.askDueDays),
          findingId: row.id,
          detail: 'A fix was asserted and is past the finding’s verification day; an independent verification is owed by a seat above the owner.',
        });
      }
    }

    /**
     * Recurrence. READ from two dated records on the same control AND scope —
     * never inferred from wording — and asked once per finding, of the joint
     * apex above every accountable line, because a fix that was tested and then
     * failed is a structural question rather than one line's homework.
     */
    if (row.recurrence?.recurrent) {
      const signature = afrRecurrenceSignature(row.id);
      const holders = row.accountable.map((entry) => entry.personId).filter(Boolean);
      const apex = matrixJointApexSafe(matrix, holders);
      const seats = apex.filter(askable);
      if (seats.length) {
        out.push({
          kind: 'recurrence',
          signature,
          seatIds: seats,
          dueOn: addDays(today, L.askDueDays),
          findingId: row.id,
          detail: 'A control and scope is on the register again after a predecessor that was closed as verified: a tested fix did not hold.',
        });
      } else {
        observations.push({
          key: `afr1|no-ask|${signature}`,
          detail: 'A finding is a repeat of one already closed as verified, and no seat resolves above every accountable line. Nobody was asked and no owner was promoted into the question.',
        });
      }
    }
  }
  return { conditions: out, observations };
}

/**
 * The joint apex above every named holder (or every manager of one owner). The
 * synthetic workspace leader is filtered out here: an apex of `leader` is a
 * graph that could not name a real seat, and asking it would be asking nobody.
 */
function matrixJointApexSafe(matrix, ids) {
  const apex = matrixJointApex(matrix, ids);
  if (!apex || !Array.isArray(apex.apexIds) || !apex.apexIds.length) return [];
  return apex.apexIds.filter((id) => id !== LEADER_ID);
}

export function assuranceFindingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(AFR_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeAssuranceSettings(draft.settings || {});
  if (conv.assuranceAutoPropagate === false) return [];
  if (!list(draft.assuranceFindings).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildAssuranceFindings(draft, { now });
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = assuranceConditions(draft, report, { today, matrix });
  const existing = indexAssuranceAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close asks whose condition cleared or whose addressee changed. */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const conditionKeys = new Set(conditions.flatMap((row) => row.seatIds.map((seatId) => openKey(row.signature, seatId))));
  const covered = new Set();
  for (const ask of openAsks) {
    const key = openKey(ask.signature, ask.seatId);
    if (conditionKeys.has(key) && ask.task.personId === ask.seatId) {
      covered.add(key);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = conditionKeys.has(key)
      ? `${AFR_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${AFR_RULE_ID}: the assurance finding register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed an assurance ask: the addressee changed.'
      : 'Closed an assurance ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.assuranceFindingMarkers = Array.isArray(draft.assuranceFindingMarkers) ? draft.assuranceFindingMarkers : [];
    if (draft.assuranceFindingMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.assuranceFindingMarkers.push({ key: observation.key, at: nowIso, ruleId: AFR_RULE_ID, kind: 'assurance-finding', detail: clip(observation.detail, 300) });
    if (draft.assuranceFindingMarkers.length > L.markers) {
      draft.assuranceFindingMarkers.splice(0, draft.assuranceFindingMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', AFR_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  const TITLES = {
    'assignment-owed': 'A remediation owner is owed on the assurance finding register',
    'remediation-overdue': 'A dated fix is owed on the assurance finding register',
    'verification-overdue': 'An independent verification is owed on the assurance finding register',
    recurrence: 'A control is on the assurance register again after a fix that was verified',
  };
  const OUTCOMES = {
    'assignment-owed': 'Open the assurance finding register (#/findings) and name the remediation owner and the day for the accountable line you hold. This task deliberately carries no control, scope, statement or name, because a delegation is readable above your seat.',
    'remediation-overdue': 'Open the assurance finding register (#/findings) and record the fix you own — what changed and the evidence you would show a reviewer. This task deliberately carries no control, scope, statement or name, because a delegation is readable above your seat.',
    'verification-overdue': 'Open the assurance finding register (#/findings) and test the fix that is asserted on this line: how you tested it, over what period, and what you saw. You are asked because you sit above the owner; the owner never grades their own fix. This task deliberately carries no control, scope, statement or name, because a delegation is readable above your seat.',
    recurrence: 'Open the assurance finding register (#/findings): a control and scope is on the record again after a predecessor that was closed as verified, so a tested fix did not hold. The register prints both findings and their dates; it does not decide why. This task deliberately carries no control, scope, statement or name, because a delegation is readable above your seat.',
  };
  const EFFECTS = {
    'assignment-owed': 'Asked the holder of an accountable line to name a remediation owner on a finding past its remediation day.',
    'remediation-overdue': 'Asked a named remediation owner to assert a fix that is past its day.',
    'verification-overdue': 'Asked a seat above the owner to verify a fix that is past the finding’s verification day.',
    recurrence: 'Asked the joint apex above every accountable line about a repeat finding after a verified closure.',
  };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(AFR_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the assurance finding register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the assurance finding register (#/findings).', 2000),
        authority: 'act-inform',
        support: `Issued by ${AFR_RULE_ID} from the assurance finding register (#/findings). It reads declared findings and dated acts only; it is not a finding about anyone and not a rating of anyone.`,
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
        sourceType: 'person', sourceId: seatId, targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: AFR_RULE_ID, summary: afrAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${EFFECTS[condition.kind] || 'Filed an assurance ask.'} Due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', AFR_ROUTE,
      `${deferred} assurance ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

assuranceFindingRule.id = 'assuranceFindingRule';

export default assuranceFindingRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const ASSURANCE_FINDING_PAUSE_SWITCH = 'assuranceAutoPropagate';
