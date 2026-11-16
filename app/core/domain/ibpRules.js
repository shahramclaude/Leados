/**
 * app/core/domain/ibpRules.js — `RULE-IBP-01` on the shared post-commit spine
 * (ADR-0231, Schema v184).
 *
 * FIVE CONDITIONS, every one read from the ONE reader (`buildIbp`) and the live
 * reporting graph — never re-derived here, so the rule, the panel and the CSV
 * cannot disagree about when an ask is owed.
 *
 *  1. `supply.owed` — demand is on the record for a cycle and feasibility has
 *     never been tested. The ask goes to the SUPPLY line's own manager: testing
 *     their line's capacity is their duty, and the register must never surprise
 *     operations with a plan nobody asked them to confirm.
 *  2. `reconcile.owed` — a gap is quantified and no option has been framed
 *     against it. The ask goes to the cycle's process OWNER, whose ordinary duty
 *     step four is.
 *  3. `executive.owed` — options are framed and no executive decision exists.
 *     The ask goes to the LOWEST SEAT ABOVE BOTH LINES at VP altitude or higher.
 *     A branch whose graph holds no such seat reads `no-authority-at-rank` and
 *     the register prints the executive step as owed rather than promoting a
 *     director into it.
 *  4. `residual.unowned` — a plan is approved with a residual that does not equal
 *     the one the record computes. This is not an error the rule repairs: it is
 *     a disagreement printed and put to the approver, because only they can
 *     explain the figure they signed.
 *  5. `review.overdue` — a live cycle has passed its own review date with no
 *     approved plan. The ask goes to the process owner.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no product family, no customer, no volume and no
 * currency: a dated decision is owed on the integrated plan, and the addressee
 * opens it. The opaque signature lives only in the typed `issues-obligation`
 * link.
 *
 * WHAT IT NEVER DOES. It never declares or withdraws a cycle; never records,
 * revises or re-prices demand, capacity or an option; never approves a plan;
 * never converts a unit or a currency; never rates a planner, a manager or a
 * salesperson. Where nobody can be asked — a disconnected graph, a branch with
 * no VP seat, or an owner who has left the roster — it writes ONE identity-free
 * `ibpMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears
 * or moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank as altitudeRankOf } from './chainRegistry.js';
import { buildIbp, ibpMatrix } from './ibp.js';
import {
  IBP_EVENT_PREFIX,
  IBP_LIMITS as L,
  IBP_MARKER_KIND,
  IBP_ROUTE,
  IBP_RULE_ID,
  ibpAskSignature,
  ibpAskSummary,
  parseIbpAskSignature,
  normalizeIbpSettings,
  parseIbpAskSummary,
} from './ibpRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

/** The canonical parsed form of an ask signature, from the one shared parser. */
const parseIbpAskSignatureLocal = (signatureText) => parseIbpAskSignature(signatureText);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: IBP_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: IBP_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${IBP_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexIbpAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== IBP_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const signature = parseIbpAskSummary(link.summary);
    if (!signature) continue;
    asks.push({ signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over the report and the
 * matrix, and exported so the test suite can pin every branch without a store.
 */
export function ibpConditions(report, matrix, { today } = {}) {
  const conditions = [];
  const observations = [];

  /**
   * The seat that answers for a line. A cycle's `supplyLineId` NAMES the manager
   * whose line it is — not the person who reports to them — so the ask goes to
   * that holder directly. Looking up `linesByPerson.get(lineId)` instead would
   * return the HOLDER'S OWN manager and escalate a manager's ordinary duty to
   * their boss, which is the wrong ask and teaches the organisation that the
   * register does not know whose job the supply review is.
   *
   * A leaf with no leadership altitude is the one case that falls back: a named
   * line that resolves to somebody who holds no leadership seat cannot carry an
   * ask, so the nearest manager above them is named instead — and only then.
   */
  const lineHolder = (lineId) => {
    const node = matrix?.nodes?.get(lineId);
    if (!node) return null;
    const rank = altitudeRankOf(node.altitude);
    if (rank >= 1) return lineId;
    for (const line of matrix.linesByPerson?.get(lineId) || []) {
      if (line?.managerId && matrix.nodes.has(line.managerId)) return line.managerId;
    }
    return null;
  };

  // `signature` is the parsed form used to key the coverage set, and
  // `signatureText` is the canonical string that goes into the typed link. They
  // are derived from ONE call so the rule can never write a link it cannot read
  // back — the failure mode that would re-file the same ask on every commit.
  const ask = (kind, cycleId, seatId, dueOn, detail) => {
    const signatureText = ibpAskSignature(kind.replace('.', '-'), cycleId);
    return {
      kind,
      signatureText,
      signature: parseIbpAskSignatureLocal(signatureText),
      seatId,
      cycleId,
      dueOn,
      detail,
    };
  };

  for (const row of list(report?.rows)) {
    if (row.withdrawn) continue;

    // 0. a cycle opened and never filled → the process owner, whose step two it is
    if (row.demandOwed) {
      conditions.push(ask('demand', row.id, row.ownerId, addDays(today, 10),
        'An S&OP cycle is open with no consensus demand plan on any month of its horizon.'));
    }

    // 1. feasibility never tested → the supply line's own manager
    if (row.supplyOwed) {
      const seatId = lineHolder(row.supplyLineId);
      if (seatId) {
        conditions.push(ask('supply', row.id, seatId, addDays(today, 5),
          'A demand plan is on the record and the supply line it runs on has not been tested against demonstrated capacity.'));
      } else {
        observations.push({
          key: `ibp1|supply|no-line-manager|${row.id}`,
          detail: 'A cycle has demand on the record and its supply line resolves to no manager, so feasibility cannot be asked of anybody. The register prints the supply step as owed and substitutes nobody.',
        });
      }
    }

    // 2. a quantified gap with no option framed → the process owner
    if (row.reconcileOwed) {
      const seatId = row.ownerId;
      if (seatId && report.matrixError === null) {
        conditions.push(ask('reconcile', row.id, seatId, addDays(today, 7),
          'A gap between the unconstrained demand plan and demonstrated capacity is quantified, and no costed option has been framed against it.'));
      } else {
        observations.push({
          key: `ibp1|reconcile|no-owner|${row.id}`,
          detail: 'A quantified gap has no owner on the roster who can be asked to frame options. The register prints the reconciliation step as owed and substitutes nobody.',
        });
      }
    }

    // 3. options framed, no executive decision → the lowest seat above BOTH lines
    if (row.executiveOwed) {
      const authority = row.authority || {};
      const seatIds = authority.chiefQueue ? [LEADER_ID] : (authority.seatIds || []);
      if (seatIds.length) {
        for (const seatId of seatIds) {
          conditions.push(ask('executive', row.id, seatId, addDays(today, 10),
            authority.ambiguous
              ? 'Options are framed against the gap and the graph holds more than one joint seat above both lines; each is asked for the executive decision.'
              : 'Options are framed against the gap and no executive plan has been approved.'));
        }
      } else {
        observations.push({
          key: `ibp1|executive|no-authority|${row.id}`,
          detail: authority.state === 'no-authority-at-rank'
            ? 'A plan awaits its executive step and no seat at VP altitude sits above both of its lines. The register prints the step as owed rather than promoting a director into it.'
            : 'A plan awaits its executive step and the graph cannot resolve a seat above both of its lines. Nobody was asked and nothing was substituted.',
        });
      }
    }

    // 4. an approved residual that disagrees with the computed one → the approver
    if (row.decision && row.totals.residualUnits !== null && !row.residualMatches) {
      conditions.push(ask('executive', row.id, row.decision.actorId, addDays(today, 7),
        'The residual approved on the plan does not equal the residual the record computes from its own rows.'));
    }

    // 5. a live cycle past its review date with no approved plan → the owner
    if (row.reviewOverdue) {
      conditions.push(ask('review', row.id, row.ownerId, addDays(today, 3),
        'A live plan has passed its own review date without an approved plan on the record.'));
    }
  }
  return { conditions, observations };
}

export function ibpRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(IBP_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeIbpSettings(draft.settings || {});
  if (conv.ibpAutoPropagate === false) return [];
  if (!list(draft.ibpCycles).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildIbp(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = ibpMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!matrix || report?.matrixError) return [];

  const { conditions, observations } = ibpConditions(report, matrix, { today });
  const existing = indexIbpAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close asks whose condition cleared or whose addressee changed. */
  const openKey = (signature, seatId) => `${signature?.kind || ''}:${signature?.cycleId || ''}|${seatId}`;
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
      ? `${IBP_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${IBP_RULE_ID}: the integrated plan no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a plan ask: the addressee changed.'
      : 'Closed a plan ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.ibpMarkers = Array.isArray(draft.ibpMarkers) ? draft.ibpMarkers : [];
    if (draft.ibpMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.ibpMarkers.push({ key: observation.key, at: nowIso, ruleId: IBP_RULE_ID, kind: IBP_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.ibpMarkers.length > L.markers) {
      draft.ibpMarkers.splice(0, draft.ibpMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', IBP_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    const key = openKey(condition.signature, condition.seatId);
    if (covered.has(key)) continue;
    // A human who closed or returned the ask while the condition stands has
    // ANSWERED it. The rule does not re-ask.
    const answered = existing.some((ask) => ask.task && ask.signature?.kind === condition.signature.kind
      && ask.signature?.cycleId === condition.signature.cycleId && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(IBP_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip('A dated decision is owed on the integrated business plan', 200),
      expectedOutcome: clip('Open the integrated business plan (#/ibp) and record the decision the record is owed there — test the supply line against demonstrated capacity, frame a costed option against the gap, approve the plan at the executive step, explain a residual that does not match the record, or record in writing why the position stands. The register tells you which condition is yours; this task deliberately carries no product family, no customer, no volume and no currency, because a delegation is readable above your seat.', 2000),
      authority: 'act-inform',
      support: `Issued by ${IBP_RULE_ID} from the integrated business plan (#/ibp). It reads declared cycles, demand rows, demonstrated capacity, costed options and dated decisions only; it is not a finding about anyone and not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: IBP_RULE_ID, summary: ibpAskSummary(condition.signatureText),
    }, linkCtx);
    covered.add(key);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'demand'
        ? `Asked the process owner to record the consensus demand plan the open cycle has no months for, due ${condition.dueOn}.`
        : condition.kind === 'supply'
        ? `Asked the supply line's manager to test the plan against demonstrated capacity, due ${condition.dueOn}.`
        : condition.kind === 'reconcile'
          ? `Asked the process owner to frame costed options against the quantified gap, due ${condition.dueOn}.`
          : condition.kind === 'executive'
            ? `Asked the seat above both lines for the executive decision the plan is owed, due ${condition.dueOn}.`
            : `Asked the plan's owner to record what the cycle actually did before its review date, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', IBP_ROUTE,
      `${deferred} plan ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

ibpRule.id = 'ibpRule';

export default ibpRule;
