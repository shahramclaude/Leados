/**
 * app/core/domain/incentiveRules.js — `RULE-INC-01` on the shared post-commit
 * spine (ADR-0220, Schema v174).
 *
 * FOUR CONDITIONS, all read from the ONE reader (`buildIncentiveIntegrity`) and
 * the live reporting graph, never re-derived here:
 *
 *   1. `plan-over-ceiling` — a plan whose awarded money is above its declared
 *      envelope. The ask goes to the lowest seat above EVERY line that funds it
 *      (`matrixJointApex` over the plan owners' managers) — never to the
 *      funding line itself, which cannot clear its own overrun, and never to an
 *      awardee, who was paid the money.
 *   2. `contested-outcome` — the same measure key paid by two plans whose
 *      windows overlap. This is the matrix case: two lines can legitimately
 *      believe they are paying for one result. The register refuses to pick a
 *      winner, so the ask goes to the seat above BOTH funding lines; a genuine
 *      diamond tie files one ask per joint apex.
 *   3. `recovery-outstanding` — an award on which money is owed back and no
 *      recorded recovery or waiver covers it. Same addressee as the ceiling
 *      breach: recovery is an executive decision, not the funding line's own.
 *   4. `plan-unmeasured` — a live plan whose window has opened and whose
 *      measures carry no verified reading at all. This one goes to the PLAN'S
 *      OWNER: recording the reading is their ordinary duty, and asking their
 *      manager for it would route a daily act through the line above.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no plan, no measure, no person and no amount: a
 * dated decision is owed on the incentive-integrity register, and the addressee
 * opens it. The opaque signature lives only in the typed `issues-obligation`
 * link.
 *
 * WHAT IT NEVER DOES. It never declares, amends or retires a plan; never adds a
 * measure; never records a reading, an award or a recovery; never converts or
 * pools a currency; never decides which scheme owns a contested result; never
 * reverses a payment; never substitutes a seat for one the matrix cannot name;
 * and never rates a person. Where nobody can be asked — a disconnected graph, a
 * funding line off the roster, a plan owner who has left — it writes ONE
 * identity-free `incentiveMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears
 * or moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildIncentiveIntegrity, incentiveMatrix } from './incentiveIntegrity.js';
import {
  INC_EVENT_PREFIX,
  INC_LIMITS as L,
  INC_MARKER_KIND,
  INC_ROUTE,
  INC_RULE_ID,
  INC_SETTING_KEYS,
} from './incentiveRegistry.js';
import {
  incAskSummary,
  normalizeIncentiveSettings,
  parseIncAskSummary,
} from './incentiveSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: INC_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: INC_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${INC_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexIncentiveAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== INC_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseIncAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The money a plan owes back, per currency, as an exact figure or null. */
/**
 * The rule never trusts a cached escalation: it re-derives the joint apex from
 * the manager ids the reader found, on the live graph. If the two ever disagreed
 * the rule would ask the seat the graph names now, not the one a previous read
 * remembered.
 */
function reDeriveApex(matrix, escalation) {
  if (!matrix) return { apexIds: [], apexId: null, unique: false, ambiguous: false, disconnected: false };
  return matrixJointApex(matrix, escalation?.managerIds || []);
}

function outstandingLabel(plan) {
  const cents = plan.recoveryOutstandingCents;
  if (!Number.isSafeInteger(cents)) return `${plan.currency}:unreadable`;
  return `${plan.currency}:${cents}`;
}

/**
 * The conditions the current record creates. Pure over (state, report, matrix,
 * today); exported so the test suite can pin every branch without a store.
 *
 * `seatIds` is an ARRAY: one condition can be owed to more than one joint apex,
 * and each apex gets its own ask rather than one being chosen.
 */
export function incentiveConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  if (!report?.plans) return { conditions: out, observations };

  const seatSet = (id) => (matrix?.nodes?.has?.(id) ? id : null);

  for (const plan of report.plans) {
    /* 1. The envelope is breached. */
    if (plan.verdict === 'over-ceiling') {
      const apex = reDeriveApex(matrix, plan.escalation);
      const seatIds = apex.unique && seatSet(apex.apexId)
        ? [apex.apexId]
        : (apex.ambiguous ? (apex.apexIds || []).filter(seatSet) : []);
      const signature = `inc1:ceiling:${plan.id}:${plan.currency}:${plan.overByCents}`;
      if (seatIds.length) {
        out.push({ kind: 'plan-over-ceiling', signature, seatIds, dueOn: addDays(today, 3), planId: plan.id });
      } else {
        observations.push({
          key: `${signature}:noaddressee`,
          detail: 'A variable-pay plan is over its declared envelope and the reporting graph names no seat above every funding line, so no decision could be asked of anyone. The register does not substitute a plausible seat.',
        });
      }
    }

    /* 3. Money is owed back and nothing covers it. */
    if ((plan.recoveryOutstandingN || 0) > 0) {
      const apex = reDeriveApex(matrix, plan.escalation);
      const seatIds = apex.unique && seatSet(apex.apexId)
        ? [apex.apexId]
        : (apex.ambiguous ? (apex.apexIds || []).filter(seatSet) : []);
      const signature = `inc1:recovery:${plan.id}:${outstandingLabel(plan)}`;
      if (seatIds.length) {
        out.push({ kind: 'recovery-outstanding', signature, seatIds, dueOn: addDays(today, 7), planId: plan.id });
      } else {
        observations.push({
          key: `${signature}:noaddressee`,
          detail: 'Money is owed back on a variable-pay award and the reporting graph names no seat above the funding line to decide it, so no decision could be asked of anyone.',
        });
      }
    }

    /* 4. A live plan nobody is measuring — asked of the plan’s own owner. */
    if (plan.unmeasured) {
      const signature = `inc1:unmeasured:${plan.id}`;
      if (seatSet(plan.ownerId)) {
        out.push({ kind: 'plan-unmeasured', signature, seatIds: [plan.ownerId], dueOn: addDays(today, 5), planId: plan.id });
      } else {
        observations.push({
          key: `${signature}:noaddressee`,
          detail: 'A live variable-pay plan has no verified reading and its funding line is no longer on the roster, so no owner could be asked to record one.',
        });
      }
    }
  }

  /* 2. One outcome, two envelopes. */
  for (const contest of report.contests) {
    const apex = reDeriveApex(matrix, contest.escalation);
    const seatIds = apex.unique && seatSet(apex.apexId)
      ? [apex.apexId]
      : (apex.ambiguous ? (apex.apexIds || []).filter(seatSet) : []);
    const money = contest.currencies.map((code) => `${code}:${contest.centsByCurrency[code] ?? 'unreadable'}`).join(',');
    const signature = `inc1:contest:${contest.key}:${contest.planIds.join('.')}:${money}`;
    if (seatIds.length) {
      out.push({ kind: 'contested-outcome', signature, seatIds, dueOn: addDays(today, 5), planIds: contest.planIds });
    } else {
      observations.push({
        key: `${signature}:noaddressee`,
        detail: 'The same outcome is paid by two variable-pay plans on different lines and the reporting graph names no seat above both funding lines, so no decision could be asked of anyone. The money stays out of the provable total.',
      });
    }
  }

  return { conditions: out, observations };
}

export function incentiveRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(INC_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeIncentiveSettings(draft.settings || {});
  if (conv.incentiveAutoPropagate === false) return [];
  if (!list(draft.incentivePlans).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildIncentiveIntegrity(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = incentiveMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = incentiveConditions(draft, report, { today, matrix });
  const existing = indexIncentiveAsks(draft);
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
      ? `${INC_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${INC_RULE_ID}: the incentive-integrity register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed an incentive-integrity ask: the addressee changed.'
      : 'Closed an incentive-integrity ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.incentiveMarkers = Array.isArray(draft.incentiveMarkers) ? draft.incentiveMarkers : [];
    if (draft.incentiveMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.incentiveMarkers.push({ key: observation.key, at: nowIso, ruleId: INC_RULE_ID, kind: INC_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.incentiveMarkers.length > L.markers) {
      draft.incentiveMarkers.splice(0, draft.incentiveMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', INC_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(INC_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated decision is owed on the incentive-integrity register', 200),
        expectedOutcome: clip('Open the variable-pay design & incentive integrity register (#/incentive) and record the decision the record is owed there — raise or close the envelope that is over its ceiling, settle which funding line owns a contested outcome, decide the recovery that is outstanding, or record the verified reading a live plan is missing. The register tells you which condition is yours; this task deliberately carries no plan, no measure, no person and no amount, because a delegation is readable above your seat.', 2000),
        authority: 'act-inform',
        support: `Issued by ${INC_RULE_ID} from the incentive-integrity register (#/incentive). It reads declared plans, measures, verified readings, awards and recovery acts only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: INC_RULE_ID, summary: incAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        condition.kind === 'plan-over-ceiling'
          ? `Asked the joint seat above the funding line for the decision an over-ceiling envelope is owed, due ${condition.dueOn}.`
          : condition.kind === 'contested-outcome'
            ? `Asked the joint seat above both funding lines to settle which scheme owns a contested outcome, due ${condition.dueOn}.`
            : condition.kind === 'recovery-outstanding'
              ? `Asked the joint seat above the funding line to decide the recovery that is owed, due ${condition.dueOn}.`
              : `Asked the plan’s own owner for the verified reading a live plan is missing, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', INC_ROUTE,
      `${deferred} incentive-integrity ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

incentiveRule.id = 'incentiveRule';

export default incentiveRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const INCENTIVE_PAUSE_SWITCH = INC_SETTING_KEYS.autoPropagate;
