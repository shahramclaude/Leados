/**
 * app/core/domain/probationGateRules.js — `RULE-PBG-01` on the shared
 * post-commit spine (ADR-0233, Schema v188).
 *
 * FOUR CONDITIONS, all read from the ONE kernel (`buildProbationGates`) and
 * the live reporting graph, never re-derived here:
 *
 *   1. `evidence-overdue` — a declared matrix line was ASKED for evidence, the
 *      ask's day has passed, and the line has submitted nothing. The ask goes
 *      to the holder the ask itself names (the line's own manager). The
 *      confirming manager is never asked to chase themselves in place of the
 *      line's answer: the duty is the line holder's own evidence.
 *   2. `decision-closing` — no final decision and the effective window day is
 *      within the closing window (`decisionWindowDays`). The ask goes to the
 *      CONFIRMING MANAGER: the decision is theirs, and it is dated inside the
 *      window or it is gone.
 *   3. `gate-lapsed` — no final decision and the effective window day has
 *      PASSED. The ask goes to the confirming manager: the register never
 *      substitutes the instrument's default outcome for the decision nobody
 *      made, so the only thing that can still happen is a human recording what
 *      actually happened. One ask per gate, ever.
 *   4. `decision-unnotified` — a final decision is on the record with no
 *      recorded written notification, past the notification chase window. The
 *      ask goes to the confirming manager: decided is not told, and the gap
 *      between "we decided" and "we told them" is exactly where this duty
 *      fails.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no joiner, no line, no instrument, no evidence
 * and no date: a dated act is owed on the probation register, and the
 * addressee opens it. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never asks, submits, extends, decides or notifies;
 * never edits a gate or an act; never substitutes the instrument's default
 * outcome for a lapsed window; never derives a window, a cap or a statutory
 * limit; and never rates a joiner or a manager from backlog or age. Asks are
 * `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition
 * clears or the addressee moves, bounded at 4 per commit with the remainder
 * counted, and pause-governed on every path including an explicit scan
 * (`probationAutoPropagate`).
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildProbationGates } from './probationGate.js';
import {
  pbgAskSummary,
  pbgDecisionSignature,
  pbgEvidenceSignature,
  pbgLapseSignature,
  pbgNotifySignature,
  parsePbgAskSummary,
} from './probationGateMath.js';
import {
  PBG_EVENT_PREFIX,
  PBG_FLAGS,
  PBG_LIMITS as L,
  PBG_RULE_ID,
  PBG_ROUTE,
  normalizeProbationSettings,
} from './probationRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PBG_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PBG_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${PBG_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexProbationAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== PBG_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePbgAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over (state, report, today);
 * exported so the test suite can pin every branch without a store. The
 * reporting graph is NOT read here: every addressee is an identity the gate's
 * own record already names (the confirming manager, the asked line's holder),
 * and the askable filter decides whether that identity still resolves to a
 * seat the graph can carry a delegation for.
 */
export function probationConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const rows = list(report?.rows);
  if (!rows.length) return { conditions: out, observations };

  const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID && Boolean(matrix?.nodes?.has(id));

  for (const row of rows) {
    // 1. Evidence owed on an asked line whose day has passed.
    for (const line of row.lines) {
      if (line.lineKind !== 'matrix' || !line.overdueAsk) continue;
      const signature = pbgEvidenceSignature(row.id, line.lineId);
      const target = line.askCount ? line.lineHolderId : null;
      if (!target || !askable(target)) {
        observations.push({
          key: `pbg1|no-ask|${signature}`,
          detail: 'A probation evidence ask is past its day with no answer, and the line holder it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
        continue;
      }
      out.push({
        kind: 'evidence-overdue',
        signature,
        seatIds: [target],
        dueOn: addDays(today, L.askDueDays),
        gateId: row.id,
        detail: 'A probation evidence ask is past its day and the line has submitted nothing.',
      });
    }

    // 2. The decision window is closing and no final decision is on the record.
    if (!row.closed && row.closing) {
      const signature = pbgDecisionSignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `pbg1|no-ask|${signature}`,
          detail: 'A probation window is within its closing days with no decision, and the confirming manager it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: 'decision-closing',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          gateId: row.id,
          detail: 'A probation window closes within days and no final decision is on the record.',
        });
      }
    }

    // 3. The window has lapsed: one ask, ever, to the confirming manager.
    if (row.lapsed) {
      const signature = pbgLapseSignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `pbg1|no-ask|${signature}`,
          detail: 'A probation window has passed its day with no decision on the record, and the confirming manager it names does not resolve to a seat on the reporting graph. Nobody was asked, nothing was substituted, and the register has not invented the outcome the instrument would default to.',
        });
      } else {
        out.push({
          kind: 'gate-lapsed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          gateId: row.id,
          detail: 'A probation window has passed its day with no decision on the record; the instrument’s default outcome does not count as one.',
        });
      }
    }

    // 4. A decision exists and the joiner has no recorded written notification.
    if (row.unnotified) {
      const signature = pbgNotifySignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `pbg1|no-ask|${signature}`,
          detail: 'A probation decision is on the record with no recorded written notification to the joiner, and the confirming manager it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: 'decision-unnotified',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          gateId: row.id,
          detail: 'A probation decision carries no recorded written notification to the joiner; decided is not told.',
        });
      }
    }
  }
  return { conditions: out, observations };
}

export function probationGateRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PBG_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeProbationSettings(draft.settings || {});
  if (conv.probationAutoPropagate === false) return [];
  if (!list(draft.probationGates).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildProbationGates(draft, { now });
    // The rule never asks an identity the reporting graph cannot carry a
    // delegation for; the whole-workspace graph is read here, without a seat.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = probationConditions(draft, report, { today, matrix });
  const existing = indexProbationAsks(draft);
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
      ? `${PBG_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${PBG_RULE_ID}: the probation gate register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a probation ask: the addressee changed.'
      : 'Closed a probation ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.probationMarkers = Array.isArray(draft.probationMarkers) ? draft.probationMarkers : [];
    if (draft.probationMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.probationMarkers.push({ key: observation.key, at: nowIso, ruleId: PBG_RULE_ID, kind: 'probation-gate', detail: clip(observation.detail, 300) });
    if (draft.probationMarkers.length > L.markers) {
      draft.probationMarkers.splice(0, draft.probationMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', PBG_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  const TITLES = {
    'evidence-overdue': 'Dated evidence is owed on the probation gate register',
    'decision-closing': 'A probation decision is owed before the window closes',
    'gate-lapsed': 'A probation window has passed its day with no decision on the record',
    'decision-unnotified': 'A probation decision has not been recorded as communicated to the joiner',
  };
  const OUTCOMES = {
    'evidence-overdue': 'Open the probation gate register (#/probation) and record the dated evidence the ask on your line called for — what you observed, and one of the three words: support, concern, or cannot say. This task deliberately carries no joiner, line, instrument or date, because a delegation is readable above your seat.',
    'decision-closing': 'Open the probation gate register (#/probation) and record the decision before the window closes: confirm on evidence from every declared line, end within the window’s short notice, or extend where the declared instrument allows it. This task deliberately carries no joiner, line, instrument or date, because a delegation is readable above your seat.',
    'gate-lapsed': 'Open the probation gate register (#/probation): the window’s day has passed with no decision on the record. The register has not invented the outcome the instrument would default to; record what actually happened. This task deliberately carries no joiner, line, instrument or date, because a delegation is readable above your seat.',
    'decision-unnotified': 'Open the probation gate register (#/probation) and record the written notification the joiner was given — decided is not told until it is on the record. This task deliberately carries no joiner, line, instrument or date, because a delegation is readable above your seat.',
  };
  const EFFECTS = {
    'evidence-overdue': 'Asked the holder of a declared line to record the evidence their ask called for, past its day.',
    'decision-closing': 'Asked the confirming manager to record a decision before the window closes.',
    'gate-lapsed': 'Asked the confirming manager to record what happened on a window that lapsed undecided.',
    'decision-unnotified': 'Asked the confirming manager to record the written notification of a decided gate.',
  };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PBG_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the probation gate register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the probation gate register (#/probation).', 2000),
        authority: 'act-inform',
        support: `Issued by ${PBG_RULE_ID} from the probation gate register (#/probation). It reads declared gates and dated acts only; it is not a judgement about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: PBG_RULE_ID, summary: pbgAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${EFFECTS[condition.kind] || 'Filed a probation ask.'} Due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', PBG_ROUTE,
      `${deferred} probation ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

probationGateRule.id = 'probationGateRule';

export default probationGateRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const PROBATION_GATE_PAUSE_SWITCH = 'probationAutoPropagate';
