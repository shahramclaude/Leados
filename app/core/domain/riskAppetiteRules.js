/**
 * app/core/domain/riskAppetiteRules.js — `RULE-RAP-01` on the shared post-commit
 * spine (ADR-0219, Schema v173).
 *
 * THREE CONDITIONS, all read from the ONE reader (`buildRiskAppetite`) and the
 * live reporting graph, never re-derived here:
 *
 *   1. `tolerance-breached` — a live appetite statement whose DECLARED
 *      population is over its exact ceiling. The ask goes to the lowest seat
 *      above EVERY line that carries the risk (`matrixJointApex` over the
 *      owners of the domain's live declarations) — never to one line's manager
 *      on another line's behalf, and never to the risk owner, who cannot clear
 *      the ceiling they are carrying. A genuine diamond tie files one ask per
 *      joint apex and says so; a disconnected graph files none.
 *   2. `appetite-missing` — declared risk is being carried in a domain with no
 *      live appetite at all. The absence of a ceiling is not an unlimited
 *      ceiling, so the condition is escalated exactly like a breach.
 *   3. `review-overdue` — a live statement whose declared review date has
 *      passed. The ask goes to the person who declared it: a ceiling nobody
 *      revisits is a declaration outliving its own reasoning.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no domain, no amount and no date: a dated
 * decision is owed on the risk-appetite register, and the addressee opens it.
 * The opaque signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares, amends or retires a statement; never
 * records or withdraws a retention; never converts a currency; never decides
 * that a risk is acceptable; never substitutes a seat for one the matrix cannot
 * name; and never rates a person. Where nobody can be asked — a disconnected
 * graph, or a declarer who has left the roster — it writes ONE identity-free
 * `riskAppetiteMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears
 * or moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import {
  buildRiskAppetite,
  liveDeclarations,
  riskAppetiteMatrix,
} from './riskAppetite.js';
import {
  RA_EVENT_PREFIX,
  RA_LIMITS as L,
  RA_MARKER_KIND,
  RA_ROUTE,
  RA_RULE_ID,
  RA_SETTING_KEYS,
} from './riskAppetiteRegistry.js';
import {
  normalizeRiskAppetiteSettings,
  normalizeRiskDeclarations,
  parseRaAskSummary,
  raAskSummary,
} from './riskAppetiteSchema.js';
import { raBreachSignature, raMissingSignature, raReviewSignature } from './riskAppetiteMath.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: RA_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: RA_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${RA_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexRiskAppetiteAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== RA_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseRaAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The MANAGERS of the owners of the live declarations in one domain, as nodes
 * the graph knows. Read from the raw record, not from the seat-scoped rows the
 * screen receives. Deliberately the manager ids and not the owner ids: the
 * joint apex of this set is the lowest seat above every line carrying the risk,
 * and the owner can never be asked to clear the ceiling they are carrying.
 */
function domainCarrierLineIds(state, matrix, domain, asOf) {
  const cases = new Map(list(state?.cases).filter((row) => row && typeof row.id === 'string').map((row) => [row.id, row]));
  const { live } = liveDeclarations(normalizeRiskDeclarations(state?.riskDeclarations, []), asOf);
  const managers = new Set();
  for (const declaration of live.values()) {
    if (declaration.domain !== domain) continue;
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
 * The conditions the current record creates. Pure over (state, report, matrix,
 * today); exported so the test suite can pin every branch without a store.
 *
 * `conditions` carry a `seatIds` ARRAY: one condition can be owed to more than
 * one joint apex, and each apex gets its own ask rather than one being chosen.
 */
export function riskAppetiteConditions(state, report, { today, matrix } = {}) {
  const out = [];
  if (!report?.statements) return out;
  const observations = [];

  for (const row of report.statements) {
    if (row.verdict === 'breached') {
      const signature = raBreachSignature(row.id, row.measurement);
      const seatIds = row.escalation.unique && row.escalation.apexId
        ? [row.escalation.apexId]
        : (row.escalation.ambiguous ? row.escalation.apexIds : []);
      if (seatIds.length) {
        out.push({
          kind: 'tolerance-breached',
          signature,
          seatIds,
          dueOn: addDays(today, 3),
          statementId: row.id,
          detail: row.escalation.ambiguous
            ? 'A declared tolerance is breached and the graph has more than one joint seat above the lines carrying it; each is asked.'
            : 'A declared tolerance is breached.',
        });
      } else {
        observations.push({
          key: `rap1|no-apex|${signature}`,
          detail: row.escalation.disconnected
            ? 'A declared tolerance is breached across lines with no joint seat above them. Nobody was asked, because there is no single accountability to ask; the breach is printed on the register.'
            : 'A declared tolerance is breached and no line carrying it resolves to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      }
    }
    if (row.reviewOverdue) {
      const signature = raReviewSignature(row.id);
      if (row.declarerOnRoster && row.declaredById && matrix?.nodes?.has?.(row.declaredById)) {
        out.push({
          kind: 'review-overdue',
          signature,
          seatIds: [row.declaredById],
          dueOn: addDays(today, 3),
          statementId: row.id,
          detail: 'A declared appetite has passed its own review date.',
        });
      } else {
        observations.push({
          key: `rap1|declarer-departed|${signature}`,
          detail: 'A declared appetite has passed its review date and the person who declared it is no longer on the active roster or the reporting graph. Nobody was asked, and the declaration is not re-owned by anyone in their place.',
        });
      }
    }
  }

  for (const domain of report.domainsWithoutAppetite) {
    const signature = raMissingSignature(domain);
    const carrierIds = matrix ? domainCarrierLineIds(state, matrix, domain, report.asOf) : [];
    const apex = matrix ? matrixJointApex(matrix, carrierIds) : null;
    const seatIds = apex?.unique && apex.apexId
      ? [apex.apexId]
      : (apex?.ambiguous ? apex.apexIds : []);
    if (seatIds.length) {
      for (const seatId of seatIds) {
        out.push({
          kind: 'appetite-missing',
          signature,
          seatIds: [seatId],
          dueOn: addDays(today, 3),
          statementId: null,
          detail: 'Risk is being carried in a domain with no live appetite. The absence of a ceiling is printed, never treated as an unlimited one.',
        });
      }
    } else {
      observations.push({
        key: `rap1|no-apex|${signature}`,
        detail: 'Risk is carried in a domain with no appetite and no joint seat above the lines carrying it. Nobody was asked; the uncovered domain is printed on the register.',
      });
    }
  }
  return { conditions: out, observations };
}

export function riskAppetiteRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(RA_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeRiskAppetiteSettings(draft.settings || {});
  if (conv.riskAppetiteAutoPropagate === false) return [];
  if (!list(draft.riskAppetiteStatements).length && !list(draft.riskDeclarations).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildRiskAppetite(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = riskAppetiteMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = riskAppetiteConditions(draft, report, { today, matrix });
  const existing = indexRiskAppetiteAsks(draft);
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
      ? `${RA_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${RA_RULE_ID}: the risk-appetite register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a risk-appetite ask: the addressee changed.'
      : 'Closed a risk-appetite ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.riskAppetiteMarkers = Array.isArray(draft.riskAppetiteMarkers) ? draft.riskAppetiteMarkers : [];
    if (draft.riskAppetiteMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.riskAppetiteMarkers.push({ key: observation.key, at: nowIso, ruleId: RA_RULE_ID, kind: RA_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.riskAppetiteMarkers.length > L.markers) {
      draft.riskAppetiteMarkers.splice(0, draft.riskAppetiteMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', RA_ROUTE, observation.detail);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(RA_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated decision is owed on the risk-appetite register', 200),
        expectedOutcome: clip('Open the enterprise risk-appetite register (#/risk-appetite) and record the decision the record is owed there — raise, amend or retire the declared tolerance, declare the exposure that is missing, or record in writing why the position stands. The register tells you which condition is yours; this task deliberately carries no domain, no amount and no date, because a delegation is readable above your seat.', 2000),
        authority: 'act-inform',
        support: `Issued by ${RA_RULE_ID} from the risk-appetite register (#/risk-appetite). It reads declared statements and dated declarations only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: RA_RULE_ID, summary: raAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        condition.kind === 'tolerance-breached'
          ? `Asked the joint seat above the carrying lines for the decision a breached tolerance is owed, due ${condition.dueOn}.`
          : condition.kind === 'appetite-missing'
            ? `Asked for the appetite the carried risk is missing, due ${condition.dueOn}.`
            : `Asked the declarer to revisit a passed review date, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', RA_ROUTE,
      `${deferred} risk-appetite ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

riskAppetiteRule.id = 'riskAppetiteRule';

export default riskAppetiteRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const RISK_APPETITE_PAUSE_SWITCH = RA_SETTING_KEYS.autoPropagate;
