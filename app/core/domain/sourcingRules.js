/**
 * app/core/domain/sourcingRules.js — `RULE-SRC-01` on the shared post-commit
 * spine (ADR-0229, Schema v182).
 *
 * FOUR CONDITIONS, every one read from the ONE reader (`buildSourcing`) and the
 * live reporting graph — never re-derived here, so the rule, the panel and the
 * CSV cannot disagree about when an ask is owed.
 *
 *  1. `decision-owed` — both sides are priced over the same terms and no
 *     boundary decision is on the record. The ask goes to the lowest seat above
 *     EVERY line the capability sits on, filtered to the chief altitude: moving
 *     the boundary of the firm is not a director's act, and one line may not
 *     source on another's behalf. A branch with no chief seat reads
 *     `no-authority-at-rank` and the register prints the decision as owed rather
 *     than promoting somebody into it.
 *  2. `safeguard-missing` — the declared specificity is not answered by any
 *     recorded safeguard. This is the hold-up condition: the ask names the
 *     exposure and asks the same joint apex to record the safeguard, accept the
 *     exposure in writing, or change the mode.
 *  3. `review-overdue` — a live case has passed its own declared review date and
 *     has not been graded. The ask goes to the case's OWNER, whose ordinary duty
 *     it is to record what actually landed.
 *  4. `curve-unheard` — a case whose decided mode contradicts the cheapest
 *     comparable option while another priced option answered the specificity.
 *     The ask goes to the DECIDER, because only they can say whether the
 *     judgement still holds.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no capability, no currency, no amount and no
 * vendor: a dated decision is owed on the sourcing register, and the addressee
 * opens it. The opaque signature lives only in the typed `issues-obligation`
 * link.
 *
 * WHAT IT NEVER DOES. It never declares, amends or withdraws a case; never
 * records, prices or re-prices an option; never decides a mode; never converts a
 * currency; never rates a supplier or a person. Where nobody can be asked — a
 * disconnected graph, a branch with no chief seat, or an owner who has left the
 * roster — it writes ONE identity-free `sourcingMarkers` observation and asks
 * nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears
 * or moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSourcing, sourcingMatrix } from './sourcing.js';
import {
  SRC_EVENT_PREFIX,
  SRC_LIMITS as L,
  SRC_MARKER_KIND,
  SRC_ROUTE,
  SRC_RULE_ID,
  normalizeSourcingSettings,
  parseSrcAskSummary,
  srcAskSignature,
  srcAskSummary,
} from './sourcingRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: SRC_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: SRC_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${SRC_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexSourcingAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== SRC_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const signature = parseSrcAskSummary(link.summary);
    if (!signature) continue;
    asks.push({ signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over (report, today) and
 * exported so the test suite can pin every branch without a store.
 */
export function sourcingConditions(report, { today } = {}) {
  const conditions = [];
  const observations = [];
  for (const row of list(report?.rows)) {
    if (row.withdrawn) continue;

    // 1. decision owed → the joint chief apex above every line
    if (row.verdict === 'decision-owed') {
      const signature = srcAskSignature('decide', row.id);
      const seatIds = row.authority.state === 'joint-apex'
        ? row.authority.seatIds
        : (row.authority.seatIds || []);
      if (seatIds.length) {
        for (const seatId of seatIds) {
          conditions.push({
            kind: 'decision-owed',
            signature,
            seatId,
            caseId: row.id,
            dueOn: addDays(today, 5),
            detail: row.authority.ambiguous
              ? 'A capability decision is owed and the graph has more than one joint seat above the lines it sits on; each is asked.'
              : 'A capability decision is owed on the sourcing register.',
          });
        }
      } else if (row.authority.chiefQueue) {
        // The workspace apex holds it. The apex is a real seat with a real inbox,
        // so it is ASKED — an ask nobody receives is not an ask, and a register
        // that only observes quietly leaves the decision owed for ever.
        conditions.push({
          kind: 'decision-owed',
          signature,
          seatId: LEADER_ID,
          caseId: row.id,
          dueOn: addDays(today, 5),
          detail: 'A capability decision is owed and the workspace apex is the only seat above every line the capability touches.',
        });
      } else {
        observations.push({
          key: `src1|no-authority|${signature}`,
          detail: row.authority.state === 'no-authority-at-rank'
            ? 'A capability decision is owed and no seat at the chief altitude sits above every line it touches. The register prints the decision as owed rather than promoting a lower seat into it.'
            : 'A capability decision is owed and the reporting graph cannot resolve a seat above every line it touches. Nobody was asked and nothing was substituted.',
        });
      }
    }

    // 2. hold-up unaddressed → the same joint chief apex, or the decider if one exists
    if (row.verdict === 'safeguard-missing') {
      const signature = srcAskSignature('safeguard', row.id);
      const seatIds = row.authority.chiefQueue
        ? [LEADER_ID]
        : (row.authority.seatIds || []);
      const deciderIds = row.decision ? [row.decision.actorId] : [];
      const targets = [...new Set([...seatIds, ...deciderIds])].sort();
      if (targets.length) {
        for (const seatId of targets) {
          conditions.push({
            kind: 'safeguard-missing',
            signature,
            seatId,
            caseId: row.id,
            dueOn: addDays(today, 5),
            detail: 'A capability carries specificity no recorded safeguard answers.',
          });
        }
      } else {
        observations.push({
          key: `src1|no-answer|${signature}`,
          detail: 'A capability carries specificity no recorded safeguard answers, and no seat above its lines can be named to answer for it. The exposure is printed and nobody was asked.',
        });
      }
    }

    // 3. review overdue and ungraded → the case owner, whose duty it is
    if (row.gradeOwed) {
      const signature = srcAskSignature('grade', row.id);
      conditions.push({
        kind: 'grade-owed',
        signature,
        seatId: row.ownerId,
        caseId: row.id,
        dueOn: addDays(today, 5),
        detail: 'A sourcing case has passed its own review date with no recorded outcome.',
      });
    }

    // 4. a decided premium the record cannot explain → the decider
    if (row.verdict === 'mismatch' && row.decision) {
      const signature = srcAskSignature('revisit', row.id);
      conditions.push({
        kind: 'mismatch',
        signature,
        seatId: row.decision.actorId,
        caseId: row.id,
        dueOn: addDays(today, 5),
        detail: 'A recorded boundary decision does not follow the basis the record itself holds.',
      });
    }
  }
  return { conditions, observations };
}

export function sourcingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(SRC_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeSourcingSettings(draft.settings || {});
  if (conv.sourcingAutoPropagate === false) return [];
  if (!list(draft.sourcingCases).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildSourcing(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = sourcingMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!matrix || report?.matrixError) return [];

  const { conditions, observations } = sourcingConditions(report, { today });
  const existing = indexSourcingAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close asks whose condition cleared or whose addressee changed. */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const conditionKeys = new Set(conditions.map((row) => openKey(row.signature, row.seatId)));
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
      ? `${SRC_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${SRC_RULE_ID}: the sourcing register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a sourcing ask: the addressee changed.'
      : 'Closed a sourcing ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.sourcingMarkers = Array.isArray(draft.sourcingMarkers) ? draft.sourcingMarkers : [];
    if (draft.sourcingMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.sourcingMarkers.push({ key: observation.key, at: nowIso, ruleId: SRC_RULE_ID, kind: SRC_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.sourcingMarkers.length > L.markers) {
      draft.sourcingMarkers.splice(0, draft.sourcingMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', SRC_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    const key = openKey(condition.signature, condition.seatId);
    if (covered.has(key)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(SRC_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip('A dated decision is owed on the sourcing register', 200),
      expectedOutcome: clip('Open the capability sourcing register (#/sourcing) and record the decision the record is owed there — decide where this capability sits relative to the boundary of the firm, record the safeguard the exposure needs, record what actually landed against the frozen assumptions, or record in writing why the position stands. The register tells you which condition is yours; this task deliberately carries no capability, no currency and no amount, because a delegation is readable above your seat.', 2000),
      authority: 'act-inform',
      support: `Issued by ${SRC_RULE_ID} from the capability sourcing register (#/sourcing). It reads declared cases, priced options and dated decisions only; it is not a finding about anyone and not a rating of anyone.`,
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
      sourceType: 'person', sourceId: condition.seatId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: SRC_RULE_ID, summary: srcAskSummary(condition.signature),
    }, linkCtx);
    covered.add(key);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'decision-owed'
        ? `Asked the joint seat above the capability's lines for the boundary decision it is owed, due ${condition.dueOn}.`
        : condition.kind === 'safeguard-missing'
          ? `Asked for the safeguard the declared specificity needs, or a written acceptance of the exposure, due ${condition.dueOn}.`
          : condition.kind === 'grade-owed'
            ? `Asked the case owner to record what actually landed against the frozen assumptions, due ${condition.dueOn}.`
            : `Asked the decider to revisit a decision that does not follow the record's own basis, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', SRC_ROUTE,
      `${deferred} sourcing ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

sourcingRule.id = 'sourcingRule';

export default sourcingRule;
