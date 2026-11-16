/**
 * app/core/domain/riskConcentrationRules.js — `RULE-RCC-01` on the shared
 * post-commit spine (ADR-0226, Schema v181 unchanged).
 *
 * ONE CONDITION, read from the ONE reader (`buildRiskConcentration`) and the
 * live reporting graph (`matrixJointApex`), never invented:
 *
 *   `concentration-would-exceed` — a shared dependency row whose exact
 *      combined retention would exceed the ceiling declared for that domain
 *      and currency (`sum > ceiling`, the register's own breach rule). The ask
 *      goes to the LOWEST JOINT APEX above EVERY line that carries the risks
 *      in that shared row (`matrixJointApex` over the managers of every active
 *      line of every risk owner in the row) — never to one line's manager on
 *      another line's behalf, never to a risk owner, and never to the
 *      workspace leader as a person. A genuine diamond tie files one ask per
 *      joint apex; a graph that cannot name such a seat writes ONE
 *      identity-free `riskConcentrationMarkers` observation and asks nobody.
 *
 * OPAQUE ASKS. Delegations roll up above the addressee, so the task title and
 * body name no dependency, no domain, no amount, no verdict and no person;
 * the signature lives only in the typed `issues-obligation` link. Asks are
 * `act-inform` delegations, idempotent per (signature, addressee), self-closing
 * when the condition clears or the addressee moves, bounded at 4 per commit
 * with the remainder counted, and pause-governed on every path including an
 * explicit scan, through `riskConcentrationAutoPropagate`.
 *
 * WHAT IT NEVER DOES. It never declares, amends or retires a statement, never
 * records or withdraws a declaration, never converts or pools a currency,
 * never estimates a correlation, never applies a probability, never decides
 * which dependency to drop or which risk to move, never invents an allocation
 * no human agreed to, and never rates a person.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildRiskConcentration } from './riskConcentration.js';
import {
  RC_ADR,
  RCC_CONDITION_KINDS,
  RC_EVENT_PREFIX,
  RC_LIMITS as L,
  RC_MARKER_KIND,
  RC_RULE_ID,
  RC_ROUTE,
  RC_SETTING_KEYS,
  rcAskSummary,
  parseRcAskSummary,
} from './riskConcentrationRegistry.js';
import { normalizeRiskConcentrationSettings } from './riskConcentrationSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: RC_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: RC_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${RC_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The managers of the owners of the risks in one shared row, as nodes the
 * graph knows. Read from the raw record: one manager id per active line of
 * every owner, duplicates collapsed. The joint apex of this set is the lowest
 * seat above every line carrying the concentrated exposure.
 */
function carryingLineManagerIds(state, matrix, riskIds) {
  const declarationsById = new Map(
    list(state?.riskDeclarations).filter((row) => row && typeof row.id === 'string').map((row) => [row.id, row]),
  );
  const cases = new Map(list(state?.cases).filter((row) => row && typeof row.id === 'string').map((row) => [row.id, row]));
  const managers = new Set();
  for (const riskId of riskIds) {
    const declaration = declarationsById.get(riskId);
    if (!declaration) continue;
    const operationalCase = cases.get(declaration.caseId);
    if (!operationalCase) continue;
    const lines = matrix?.linesByPerson?.get?.(operationalCase.ownerId) || [];
    for (const line of lines) {
      if (line?.active === false) continue;
      const managerId = line?.managerId;
      if (managerId && matrix?.nodes?.has?.(managerId)) managers.add(managerId);
    }
  }
  return [...managers].sort();
}

/**
 * Pure derivation of rule conditions and identity-free observations from the
 * single reader and the live matrix. Exported so the suite can pin every
 * branch without a store.
 *
 * `conditions` carry a `seatIds` ARRAY: one condition can be owed to more than
 * one joint apex, and each apex gets its own ask rather than one being chosen.
 */
export function riskConcentrationConditions(state, report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.sharedRows || !today) return { conditions, observations };

  for (const row of report.sharedRows) {
    if (row.verdict !== 'would-exceed') continue;
    const signature = `rcc1:${row.rowId}`;
    const managerIds = carryingLineManagerIds(state, matrix, row.riskIds);
    let seatIds = [];
    let reason = null;
    if (!managerIds.length) {
      reason = 'no-carrying-line';
    } else {
      const apex = matrixJointApex(matrix, managerIds);
      const candidates = (apex.apexIds || []).filter((id) => id && id !== LEADER_ID && matrix.nodes.has(id));
      if (apex.disconnected || !candidates.length) {
        reason = apex.disconnected ? 'no-joint-apex' : 'no-addressable-apex';
      } else {
        seatIds = candidates;
      }
    }
    if (seatIds.length) {
      conditions.push({
        kind: RCC_CONDITION_KINDS.WOULD_EXCEED,
        signature,
        seatIds,
        dueOn: addDays(today, 3),
        rowId: row.rowId,
        dependencyId: row.dependencyId,
        domain: row.domain,
        currency: row.currency,
        detail: seatIds.length > 1
          ? 'A shared dependency would exceed its declared domain ceiling and the graph names more than one joint seat above the carrying lines; each is asked.'
          : 'A shared dependency would exceed its declared domain ceiling. The seat above every line carrying the exposed risks owes the decision: raise the declared tolerance, reduce what relies on the dependency, or record in writing why the position stands.',
      });
    } else {
      observations.push({
        signature,
        reason: reason || 'no-joint-apex',
        detail: reason === 'no-carrying-line'
          ? 'A shared dependency would exceed its declared ceiling, but none of its risks resolves to an active reporting line on the roster. Nobody was asked, and nothing was substituted.'
          : 'A shared dependency would exceed its declared ceiling and no joint seat above the carrying lines can be named. Nobody was asked, and the over-ceiling row stays printed on the reading.',
      });
    }
  }
  return { conditions, observations };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexRiskConcentrationAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== RC_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseRcAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

export function riskConcentrationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(RC_EVENT_PREFIX)) return [];

  // Full literal switch read required by the pause-permit reach census.
  const conv = normalizeRiskConcentrationSettings(draft.settings || {});
  if (conv[RC_SETTING_KEYS.autoPropagate] === false) return [];
  if (!list(draft.riskDeclarations).length && !list(draft.links).length && !list(draft.riskConcentrationMarkers).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    const cleanSettings = { ...(draft.settings || {}), activeSeatId: null };
    report = buildRiskConcentration(draft, { now, settings: cleanSettings, seat: null });
    matrix = buildMatrix(draft, { now, settings: cleanSettings });
    if (!matrix || !matrix.nodes) return [];
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = riskConcentrationConditions(draft, report, { today, matrix });
  const existing = indexRiskConcentrationAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  const openMarkers = list(draft.riskConcentrationMarkers).filter((m) => m && !m.resolvedOn);
  if (!conditions.length && !openAsks.length && !observations.length && !openMarkers.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close rule-authored asks whose condition cleared or whose addressee changed. */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const activeConditionKeys = new Set(conditions.flatMap((row) => row.seatIds.map((seatId) => openKey(row.signature, seatId))));
  const covered = new Set();
  for (const ask of openAsks) {
    const key = openKey(ask.signature, ask.seatId);
    if (activeConditionKeys.has(key) && ask.task.personId === ask.seatId) {
      covered.add(key);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = activeConditionKeys.has(key)
      ? `${RC_RULE_ID}: the addressee this condition belongs to changed on the live graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${RC_RULE_ID}: the shared-dependency concentration register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, activeConditionKeys.has(key)
      ? 'Closed a concentration ask after a reporting-line change.'
      : 'Closed a concentration ask after the condition cleared.');
  }

  /* 2. Maintain identity-free markers for conditions nobody can be asked about. */
  const liveObservationSigs = new Set(observations.map((o) => o.signature));
  if (Array.isArray(draft.riskConcentrationMarkers)) {
    for (const marker of draft.riskConcentrationMarkers) {
      if (marker && !marker.resolvedOn && !liveObservationSigs.has(marker.signature)) {
        marker.resolvedOn = today;
      }
    }
  }
  for (const obs of observations) {
    if (!Array.isArray(draft.riskConcentrationMarkers)) draft.riskConcentrationMarkers = [];
    const alreadyOpen = draft.riskConcentrationMarkers.some((m) => m && !m.resolvedOn && m.signature === obs.signature);
    if (alreadyOpen) continue;
    const markerId = idFactory('rccm');
    draft.riskConcentrationMarkers.push({
      id: markerId,
      ruleId: RC_RULE_ID,
      signature: obs.signature,
      reason: obs.reason,
      observedOn: today,
      resolvedOn: null,
    });
    if (draft.riskConcentrationMarkers.length > L.markersMax) {
      draft.riskConcentrationMarkers.splice(0, draft.riskConcentrationMarkers.length - L.markersMax);
    }
    noteEffect(ctx, out, 'observed', 'workspace', RC_ROUTE, `Recorded identity-free concentration marker (${obs.reason}).`);
  }

  /* 3. File one bounded, opaque ask per (signature, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const humanAnswered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(RC_RULE_ID)) || ask.task.status === 'returned'));
      if (humanAnswered) continue;
      if (issued >= L.asksPerCommit) { deferred += 1; continue; }

      const taskId = idFactory('rccd');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated decision is owed on the shared-dependency concentration reading', 200),
        expectedOutcome: clip(
          'Open the enterprise risk-appetite register, Shared dependencies view (#/risk-appetite?view=shared), and record the dated decision owed by your seat — raise the declared tolerance for that domain and currency, declare a different reliance for the exposed risks, or record in writing why the position stands. This task deliberately carries no dependency, no domain, no amount and no verdict, because a delegation is readable above your seat.',
          2000,
        ),
        authority: 'act-inform',
        support: `Issued by ${RC_RULE_ID} from the shared-dependency concentration reading (ADR-0226). It reads declared retentions, recorded depends-on links and the live reporting graph only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: RC_RULE_ID, summary: rcAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        `Asked the seat above the carrying lines for the decision an over-ceiling shared dependency is owed, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', RC_ROUTE,
      `${deferred} concentration ask(s) were deferred (cap ${L.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

riskConcentrationRule.id = 'riskConcentrationRule';

export default riskConcentrationRule;

/** Exported for the pause-permit reach census: the switch this rule reads, by its literal key. */
export const RISK_CONCENTRATION_PAUSE_SWITCH = RC_SETTING_KEYS.autoPropagate;
