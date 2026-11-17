/**
 * app/core/domain/workplaceAdjustmentRules.js — `RULE-WPA-01` on the shared
 * post-commit spine (ADR-0241, Schema v195).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`buildWorkplaceAdjustment`)
 * and the live reporting graph, and never re-derived here:
 *
 *   1. `work-conflict` — a live restriction whose limit is EXACTLY broken by
 *      declared work on some line. This is the condition the register exists
 *      for: the person is rostered onto work their record forbids, and the
 *      record can prove it. The ask goes to the JOINT APEX above every line
 *      holding the person, because the line that declared the shift and the
 *      line that carries the restriction are usually different hands, and the
 *      seat answerable for both is the seat above both. It NEVER goes to the
 *      person carrying the restriction — they are the one it protects, and
 *      asking them to fix their own rota is the failure this rule forbids.
 *
 *   2. `review-overdue` — a live restriction past its own review date with no
 *      recorded review. Time never lifts a restriction, so the duty is still
 *      live and nobody has re-checked it. The ask goes to the joint apex for the
 *      same reason: a review decides what work the person may be given, and that
 *      is every line's question.
 *
 *   3. `line-unacknowledged` — a manager holds a restricted person and has never
 *      recorded that they have been shown the restriction. This is the failure
 *      the adjustment-register category says nobody tests for: the duty survives
 *      the agreement and dies in the handover. The ask goes to the LINE HOLDER
 *      by name, because acknowledging is an act only that hand can perform, and
 *      a rule that asked anybody else would be filing work nobody can do.
 *
 *   4. `agreed-not-operational` — an adjustment agreed more than the declared
 *      grace ago and still with no operational day. The ask goes to the seat that
 *      agreed it, whose own act put it on the record.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per obligation —
 * per restriction for a conflict, a review or an unfinished adjustment, and per
 * (restriction, line) for an acknowledgement, because each line owes its own. Two
 * restrictions that happen to share a manager are two separate duties and are
 * filed as two asks: collapsing them would hide one behind the other. What the
 * rule never does is re-file the same obligation, so a manager receives each ask
 * once, and at most four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no task title or outcome names a person, a restriction, a domain
 * or a minute count. The opaque signature lives only in the typed
 * `issues-obligation` link, exactly as the incident, risk-appetite and
 * distributed-work registers do.
 *
 * WHAT IT NEVER DOES. It never declares, withdraws or amends a restriction, never
 * records an adjustment, never acknowledges a line on a manager's behalf, never
 * records a review, never cancels or moves a shift, never computes a conflict of
 * its own, never converts an untested limit into a clearance, and never rates,
 * ranks or names a person as a cause. Where nobody can be asked — a disconnected
 * graph, an orphaned restriction, a person with no line — it writes ONE
 * identity-free observation and asks nobody. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at four per commit with the remainder counted, and pause-governed on
 * every path including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { matrixJointApex } from './matrix.js';
import { buildWorkplaceAdjustment } from './workplaceAdjustment.js';
import {
  WPA_EVENT_PREFIX,
  WPA_LIMITS as L,
  WPA_MARKER_KIND,
  WPA_ROUTE,
  WPA_RULE_ID,
  WPA_SETTING_KEYS,
} from './workplaceAdjustmentRegistry.js';
import { normalizeWpaSettings } from './workplaceAdjustmentSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const WPA_PAUSE_SWITCH = 'wpaAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a person id
 * appears in this rule's output, and it travels inside the typed link rather
 * than the delegation. Two operators running the same pass derive the same
 * signatures, so neither duplicates the other's asks.
 */
export function wpaAskSignature(kind, subjectId, extra = '') {
  return extra ? `wpa1:${kind}:${subjectId}:${extra}` : `wpa1:${kind}:${subjectId}`;
}

const SIGNATURE_RE = /^wpa1:(work-conflict|review-overdue|line-unacknowledged|agreed-not-operational):([^:]+)(?::([^:]+))?$/;

export function parseWpaAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2], extra: match[3] || null };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexWorkplaceAdjustmentAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== WPA_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseWpaAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'work-conflict': 'Declared work breaks a functional restriction — a rostering decision is owed',
  'review-overdue': 'A functional restriction has passed its review date — the review is owed',
  'line-unacknowledged': 'A reporting line holds a restricted person and has not acknowledged the restriction',
  'agreed-not-operational': 'An agreed adjustment has no operational day — the work is owed',
});

const OUTCOMES = Object.freeze({
  'work-conflict': `Open the workplace adjustment register (#/adjustments?view=conflicts) and decide what happens to the declared work that breaks a limit this record can prove. Answer it on the record: move or amend the work, re-declare the restriction on a recorded review, or record that the work will proceed and why. ${`This ask names nobody, because a delegation is readable above the seat it is sent to.`}`,
  'review-overdue': 'Open the workplace adjustment register (#/adjustments) and record the review that is owed: continue (with the next review day), amend (and withdraw the old row), or close. Time alone never lifts a restriction.',
  'line-unacknowledged': 'Open the workplace adjustment register (#/adjustments?view=lines) and record that your line has been shown the restriction it holds. This is a dated statement that you have read what the work must respect.',
  'agreed-not-operational': 'Open the workplace adjustment register (#/adjustments) and either record the day the adjustment actually took effect, or retire it with a reason. An adjustment agreed and never made operational is a duty nobody performed.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: WPA_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: WPA_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${WPA_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report, matrix, today);
 * exported so the suite can pin every branch without a store.
 *
 * Returns `conditions` (each with the exact seat ids to ask) and `observations`
 * (identity-free markers for the cases where nobody can be asked). A condition
 * with NO resolvable addressee becomes an observation rather than a silent drop:
 * a restriction whose conflict nobody can be asked about is a fact about the
 * reporting graph, and the register prints it.
 */
export function workplaceAdjustmentConditions(report, { today, matrix, conventions } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const apexFor = (managerIds) => {
    const apex = matrixJointApex(matrix, managerIds);
    return { apexIds: list(apex?.apexIds), apexId: apex?.apexId || null, ambiguous: Boolean(apex?.ambiguous), disconnected: Boolean(apex?.disconnected) };
  };

  for (const row of report.liveRows) {
    // A row without a derived state cannot be judged, and guessing one would file
    // an ask about a condition nobody proved. Such a row is skipped, not repaired.
    if (!row?.restriction?.id || !row?.state?.key) continue;
    const restriction = row.restriction;
    const lines = list(row.ack?.lines).map((line) => line.managerId).filter(Boolean);

    /* 1. A proven conflict with declared work. */
    if (row.test?.testable && row.test.verdict === 'breached') {
      if (!lines.length) {
        observations.push({
          signature: wpaAskSignature('work-conflict', restriction.id, 'no-line'),
          detail: 'A live restriction is in proven conflict with declared work, but the person is on no active reporting line, so no seat above the work can be asked.',
        });
      } else {
        const apex = apexFor(lines);
        if (!apex.apexIds.length) {
          observations.push({
            signature: wpaAskSignature('work-conflict', restriction.id, 'no-apex'),
            detail: 'A live restriction is in proven conflict with declared work, but the reporting graph yields no joint seat above the lines holding the person.',
          });
        } else {
          for (const seatId of apex.apexIds) {
            if (seatId === restriction.personId) {
              // The joint apex IS the person carrying the restriction. Asking
              // them to fix the rota that injures them is the exact failure this
              // rule forbids, so this is observed, never asked.
              observations.push({
                signature: wpaAskSignature('work-conflict', restriction.id, 'self-apex'),
                detail: 'A live restriction is in proven conflict with declared work and the only seat above the work is the person carrying the restriction. The register observes this and asks nobody rather than ask them.',
              });
              continue;
            }
            conditions.push({
              kind: 'work-conflict',
              signature: wpaAskSignature('work-conflict', restriction.id),
              seatIds: [seatId],
              dueOn: today,
              ambiguous: apex.ambiguous,
              urgency: 0,
            });
          }
        }
      }
    }

    /* 2. A review date that has passed with no recorded review. */
    if (restriction.reviewOn && restriction.reviewOn <= today && row.state.key === 'review-overdue') {
      if (!lines.length) {
        observations.push({
          signature: wpaAskSignature('review-overdue', restriction.id, 'no-line'),
          detail: 'A live restriction is past its review date and the person is on no active reporting line, so no seat can be asked to review it.',
        });
      } else {
        const apex = apexFor(lines);
        if (!apex.apexIds.length) {
          observations.push({
            signature: wpaAskSignature('review-overdue', restriction.id, 'no-apex'),
            detail: 'A live restriction is past its review date and the reporting graph yields no joint seat above the lines holding the person.',
          });
        } else {
          for (const seatId of apex.apexIds) {
            if (seatId === restriction.personId) {
              observations.push({
                signature: wpaAskSignature('review-overdue', restriction.id, 'self-apex'),
                detail: 'A live restriction is past its review date and the only seat above it is the person carrying it. The register observes this and asks nobody.',
              });
              continue;
            }
            conditions.push({
              kind: 'review-overdue',
              signature: wpaAskSignature('review-overdue', restriction.id),
              seatIds: [seatId],
              dueOn: today,
              ambiguous: apex.ambiguous,
              urgency: 1,
            });
          }
        }
      }
    }

    /* 3. A line holding the person that has never acknowledged it. */
    for (const missing of list(row.ack?.missing)) {
      const managerId = missing.managerId;
      if (!managerId || managerId === restriction.personId) continue;
      conditions.push({
        kind: 'line-unacknowledged',
        // The signature is per (restriction, line): each line owes its own
        // acknowledgement and clearing one must not clear another.
        signature: wpaAskSignature('line-unacknowledged', restriction.id, managerId),
        seatIds: [managerId],
        dueOn: today,
        ambiguous: false,
        urgency: 3,
      });
    }

    /* 4. An adjustment agreed past the declared grace with no operational day. */
    const grace = conventions?.[WPA_SETTING_KEYS.adjustmentGraceDays] ?? 14;
    if (row.state.key === 'agreed-not-in-place' && row.state.pastGrace) {
      const agreed = list(row.adjustments).filter((row2) => row2.status === 'active' && !row2.operationalOn);
      const agreer = agreed.find((row2) => row2.agreedById) || null;
      const seatId = agreer?.agreedById || (lines.length ? apexFor(lines).apexId : null);
      if (!seatId || seatId === restriction.personId) {
        observations.push({
          signature: wpaAskSignature('agreed-not-operational', restriction.id, 'no-seat'),
          detail: `An agreed adjustment has carried no operational day for more than the declared grace of ${grace} day(s), and no seat can be named to finish it.`,
        });
      } else {
        conditions.push({
          kind: 'agreed-not-operational',
          signature: wpaAskSignature('agreed-not-operational', restriction.id),
          seatIds: [seatId],
          dueOn: today,
          ambiguous: false,
          urgency: 2,
        });
      }
    }
  }

  // Most urgent first, then by signature so two operators derive the same order.
  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-WPA-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function workplaceAdjustmentRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(WPA_EVENT_PREFIX)) return [];

  const conv = normalizeWpaSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv.wpaAutoPropagate === false) return [];

  if (!list(draft.wpaRestrictions).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  let matrix = null;
  try {
    report = buildWorkplaceAdjustment(draft, { now, settings: draft.settings || {}, seat: null });
    // The SAME matrix the reader built, so the apex above the lines can never be
    // computed twice and disagree with itself.
    matrix = report.matrix || null;
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = workplaceAdjustmentConditions(report, { today, matrix, conventions: conv });
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexWorkplaceAdjustmentAsks(draft);
  const covered = new Set(existing.filter((ask) => ask.task && (ask.task.status === 'active')).map((ask) => `${ask.signature}::${ask.seatId}`));

  // An ask whose addressee moved is released and CARRIED, never closed-and-
  // refiled in the same pass: that churn shows a leader a phantom "done" for a
  // condition that never cleared.
  const openKey = (signature, seatId) => `${signature}::${seatId}`;

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has
      // ANSWERED it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(WPA_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the workplace adjustment register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the workplace adjustment register (#/adjustments).', 2000),
        authority: 'act-inform',
        support: `Issued by ${WPA_RULE_ID} from the workplace adjustment register (#/adjustments). It reads declared restrictions, declared work and dated acts only; it holds no diagnosis, is not a finding about anyone and is not a rating of anyone.`,
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
        sourceType: 'person',
        sourceId: seatId,
        targetType: 'delegation',
        targetId: taskId,
        relation: 'issues-obligation',
        ruleId: WPA_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a workplace adjustment ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.wpaMarkers = Array.isArray(draft.wpaMarkers) ? draft.wpaMarkers : [];
    const have = new Set(draft.wpaMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.wpaMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: WPA_RULE_ID,
        kind: WPA_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', WPA_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', WPA_ROUTE, `${deferred} workplace adjustment ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }

  // Close this rule's own asks whose condition has cleared.
  const liveBySignature = new Map();
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) liveBySignature.set(`${condition.signature}::${seatId}`, true);
  }
  for (const ask of existing) {
    if (!ask.task || ask.task.status !== 'active') continue;
    if (liveBySignature.has(`${ask.signature}::${ask.seatId}`)) continue;
    const task = list(draft.delegations).find((row) => row && row.id === ask.task.id);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = clip(`${WPA_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The workplace adjustment condition cleared; the register closed its own ask.');
  }

  return out;
}

workplaceAdjustmentRule.id = 'workplaceAdjustmentRule';

export default workplaceAdjustmentRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const WORKPLACE_ADJUSTMENT_PAUSE_SWITCH = 'wpaAutoPropagate';

export { LEADER_ID };
