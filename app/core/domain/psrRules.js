/**
 * app/core/domain/psrRules.js — `RULE-PSR-01` on the shared post-commit spine
 * (ADR-0258, Schema v210).
 *
 * SIX CONDITIONS read from `buildPreStartupSafety` (zero second derivation):
 *   1. `energised-unsafe`       — unit physically energised with an unmet gate
 *                                 or without valid joint-apex authorisation.
 *   2. `temporary-expired`      — temporary modification still live past its
 *                                 declared revert-by day.
 *   3. `post-startup-overdue`   — live unit with Category B condition(s) past
 *                                 their declared due day.
 *   4. `gate-rejected`          — pre-startup review held by a rejected
 *                                 functional discipline sign-off.
 *   5. `ready-for-authorisation`— all Category A blockers, discipline gates and
 *                                 operator briefings independently verified;
 *                                 waiting for joint-apex Startup Authorisation.
 *   6. `temporary-expiring`     — live temporary modification inside the
 *                                 declared `psrRevertHorizonDays` window.
 *
 * MATRIX & PRIVACY DISCIPLINE:
 *   - Every ask is addressed ONLY to the computed `matrixJointApex` across all
 *     active lines holding the unit holder, proposer and governing signers —
 *     NEVER to the proposer and NEVER picking one line to speak for another.
 *   - Where no non-proposer seat can be resolved (or line coverage is
 *     incomplete on `ready-for-authorisation`), ONE identity-free `psrMarkers`
 *     observation is recorded per signature and nobody is invented.
 *   - Delegation title and body carry ZERO unit names, review references,
 *     findings, equipment identifiers or person names; the opaque signature
 *     `psr1:<kind>:<reviewId>` lives only inside the typed `issues-obligation`
 *     link.
 *   - Idempotent per `(signature, seatId)`, human-answer-aware (never re-nags a
 *     closed or returned ask), self-closing when the condition clears (including
 *     when the last review is deleted), capped at 4 new asks per commit with
 *     the remainder counted as deferred, and pause-governed on every path by
 *     `psrAutoPropagate`.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildPreStartupSafety } from './psrSafety.js';
import {
  PSR_EVENT_PREFIX,
  PSR_LIMITS,
  PSR_MARKER_KIND,
  PSR_ROUTE,
  PSR_RULE_ID,
  PSR_SETTING_KEYS,
} from './psrRegistry.js';
import { normalizePsrSettings } from './psrSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = PSR_LIMITS.asksPerCommit;

/** Named literal key so the pause-permit reach census verifies source governance. */
export const PSR_PAUSE_SWITCH = 'psrAutoPropagate';

export function psrAskSignature(kind, reviewId) {
  return `psr1:${kind}:${reviewId}`;
}

const SIGNATURE_RE = /^psr1:(energised-unsafe|temporary-expired|post-startup-overdue|gate-rejected|ready-for-authorisation|temporary-expiring):([^:]+)$/;

export function parsePsrAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], reviewId: match[2] };
}

/** Index every ask previously issued by RULE-PSR-01 via typed provenance links. */
export function indexPsrAsks(state) {
  const tasks = new Map(
    list(state?.delegations)
      .filter((task) => task && typeof task.id === 'string')
      .map((task) => [task.id, task]),
  );
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== PSR_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePsrAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({
      signature: parsed.signature,
      kind: parsed.kind,
      reviewId: parsed.reviewId,
      seatId: String(link.sourceId || ''),
      task: tasks.get(String(link.targetId || '')) || null,
    });
  }
  return asks;
}

const TITLES = Object.freeze({
  'energised-unsafe': 'A unit recorded startup energisation with an unmet pre-startup safety gate',
  'temporary-expired': 'A live temporary modification has passed its declared revert-by day',
  'post-startup-overdue': 'A live unit carries an overdue Category B post-startup condition',
  'gate-rejected': 'A pre-startup safety review is held by a rejected discipline gate',
  'ready-for-authorisation': 'A verified pre-startup safety review awaits joint-apex authorisation',
  'temporary-expiring': 'A live temporary modification is inside its declared revert horizon',
});

const OUTCOMES = Object.freeze({
  'energised-unsafe': 'Open the pre-startup safety register (#/pre-startup?view=startups) and review the energisation gate breach across all involved operating and discipline lines. Confirm safe plant state and record verified remediation acts.',
  'temporary-expired': 'Open the pre-startup safety register (#/pre-startup?view=startups) and verify physical restoration of the expired temporary modification to baseline design, recording the restoration evidence reference. Time never reverts a temporary change.',
  'post-startup-overdue': 'Open the pre-startup punch list (#/pre-startup?view=punch) and verify closure of the overdue Category B post-startup condition(s) against documentary field evidence.',
  'gate-rejected': 'Open the discipline gates (#/pre-startup?view=gates) and coordinate remediation and independent re-verification for the rejected pre-startup safety gate before any startup authorisation is sought.',
  'ready-for-authorisation': 'Open the startup authorisations (#/pre-startup?view=startups), verify permit/isolation clearance and all pre-startup evidence across lines, and decide formal Startup Authorisation as the joint apex.',
  'temporary-expiring': 'Open the startup authorisations (#/pre-startup?view=startups) and schedule physical removal and baseline restoration of the temporary modification before its declared revert-by day expires.',
});

const URGENCY = Object.freeze({
  'energised-unsafe': 0,
  'temporary-expired': 0,
  'post-startup-overdue': 1,
  'gate-rejected': 1,
  'ready-for-authorisation': 2,
  'temporary-expiring': 2,
});

const DUE_DAYS = Object.freeze({
  'energised-unsafe': 0,
  'temporary-expired': 1,
  'post-startup-overdue': 1,
  'gate-rejected': 2,
  'ready-for-authorisation': 2,
  'temporary-expiring': 3,
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PSR_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PSR_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${PSR_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

/** Pure condition extractor over a whole-workspace `buildPreStartupSafety` report. */
export function psrConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const emit = (kind, row, { requireUniqueCertifiedApex = false } = {}) => {
    const reviewId = row?.review?.id;
    if (!reviewId) return;
    const proposerId = row.review.proposerId;
    const signature = psrAskSignature(kind, reviewId);

    if (requireUniqueCertifiedApex) {
      if (!row.apexId || row.apexId === proposerId || row.apexAmbiguous || row.incompleteLineCoverage) {
        observations.push({
          signature,
          detail: `A pre-startup safety condition (${kind}) is on the record, but no unique certified joint apex above every required line could be resolved without guessing.`,
        });
        return;
      }
      conditions.push({
        kind,
        reviewId,
        signature,
        seatIds: [row.apexId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        urgency: URGENCY[kind] ?? 9,
        ambiguous: false,
      });
      return;
    }

    const validSeats = list(row.apexIds).filter((id) => id && id !== proposerId);
    if (!validSeats.length) {
      observations.push({
        signature,
        detail: `A pre-startup safety condition (${kind}) is on the record, but no non-proposer joint seat could be resolved above the reporting lines involved.`,
      });
      return;
    }
    if (row.incompleteLineCoverage) {
      observations.push({
        signature,
        detail: `A pre-startup safety condition (${kind}) involves at least one hand with no active reporting line; reachable joint seat(s) were asked and incomplete coverage was recorded.`,
      });
    }
    for (const seatId of validSeats) {
      conditions.push({
        kind,
        reviewId,
        signature,
        seatIds: [seatId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        urgency: URGENCY[kind] ?? 9,
        ambiguous: Boolean(row.apexAmbiguous),
      });
    }
  };

  for (const row of report.rows || []) {
    const sk = row.state?.key;
    if (sk === 'breach-energised-unsafe') emit('energised-unsafe', row);
    if (sk === 'temporary-expired-live') emit('temporary-expired', row);
    if (sk === 'live-post-startup-overdue') emit('post-startup-overdue', row);
    if (sk === 'gate-rejected') emit('gate-rejected', row);
    if (sk === 'ready-for-authorisation') emit('ready-for-authorisation', row, { requireUniqueCertifiedApex: true });
    if (row.temporaryExpiring && sk !== 'breach-energised-unsafe' && sk !== 'temporary-expired-live') {
      emit('temporary-expiring', row);
    }
  }

  conditions.sort((a, b) => (
    a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0]))
  ));
  return { conditions, observations };
}

/**
 * `RULE-PSR-01`. Runs on the shared post-commit spine and explicit scans (a
 * temporary change expires and a Category B condition turns overdue by the
 * calendar without any new PSSR write). Pause-governed on every path.
 */
export function psrRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PSR_EVENT_PREFIX)) return [];

  const conv = normalizePsrSettings(draft.settings || {});
  // Full literal key preserved so pause-permit source inspection matches directly.
  if (conv[PSR_SETTING_KEYS.autoPropagate] === false || conv.psrAutoPropagate === false) return [];

  const existing = indexPsrAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.psrReviews).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildPreStartupSafety(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = psrConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function'
    ? ctx.idFactory
    : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();
  const dueOn = (days) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const linkCtx = { idFactory, todayStr: today, nowIso };

  const covered = new Set(
    existing
      .filter((ask) => ask.task && ask.task.status === 'active')
      .map((ask) => `${ask.signature}::${ask.seatId}`),
  );

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = `${condition.signature}::${seatId}`;
      if (covered.has(key)) continue;
      // Never re-nag a seat whose human already closed or returned the same ask.
      const answered = existing.some((ask) => (
        ask.task
        && ask.signature === condition.signature
        && ask.seatId === seatId
        && (
          (ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PSR_RULE_ID))
          || ask.task.status === 'returned'
        )
      ));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated action is owed on the pre-startup safety register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the pre-startup safety register (#/pre-startup).', 2000),
        authority: 'act-inform',
        support: `Issued by ${PSR_RULE_ID} from the pre-startup safety review register (#/pre-startup). Reads declared reviews, punch items, discipline sign-offs, operator readiness attestations, startup authorisations and physical startup/restoration records only; not a physical interlock and never a score on any person or line.`,
        delegatedOn: today,
        dueOn: dueOn(condition.dueInDays),
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
        ruleId: PSR_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind]} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  if (observations.length) {
    draft.psrMarkers = Array.isArray(draft.psrMarkers) ? draft.psrMarkers : [];
    const have = new Set(draft.psrMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const obs of observations) {
      if (have.has(obs.signature)) continue;
      draft.psrMarkers.push({
        key: obs.signature,
        at: nowIso,
        ruleId: PSR_RULE_ID,
        kind: PSR_MARKER_KIND,
        detail: clip(obs.detail, 400),
      });
      have.add(obs.signature);
      wrote += 1;
    }
    if (wrote) {
      noteEffect(ctx, out, 'observed', 'workspace', PSR_ROUTE, `${wrote} pre-startup safety condition(s) recorded as identity-free marker(s) where joint-apex reach could not be resolved.`);
    }
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', PSR_ROUTE, `${deferred} pre-startup safety ask(s) deferred beyond the ${ASKS_PER_COMMIT}-per-commit cap; they issue on the next write or scan.`);
  }

  // Self-close asks whose condition has cleared or whose joint apex moved.
  const live = new Set();
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) live.add(`${condition.signature}::${seatId}`);
  }
  for (const ask of existing) {
    if (!ask.task || ask.task.status !== 'active') continue;
    if (live.has(`${ask.signature}::${ask.seatId}`)) continue;
    const task = list(draft.delegations).find((row) => row && row.id === ask.task.id);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = clip(`${PSR_RULE_ID}: the pre-startup safety condition this ask reported is no longer active on the record. Closed automatically by the register.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The pre-startup safety condition cleared; the register closed its own ask.');
  }

  return out;
}

psrRule.id = 'psrRule';

export default psrRule;
