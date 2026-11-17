/**
 * app/core/domain/voiceRules.js — `RULE-VOI-01` on the shared post-commit spine
 * (ADR-0243, Schema v197).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`buildVoice`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `advice-lapsed` — a consultation or negotiation item whose declared window
 *      closed with nothing from the body on the record. This is the condition the
 *      register exists for: a body was given a period, said nothing, and the
 *      organisation is about to treat silence as agreement. The ask goes to the
 *      JOINT APEX above the affected lines, never to the body — a body is not a
 *      person and cannot be asked to answer for itself — and never to one affected
 *      line on the other's behalf.
 *
 *   2. `reply-overdue` — the body advised and the organisation's own written reply
 *      is past its declared day. A voice channel nobody answers decays into exit
 *      (Hirschman, 1970), so the unanswered advice is a duty, not a courtesy.
 *
 *   3. `minutes-lapsed` — a sitting past the declared day for its minutes. A
 *      sitting nobody minuted cannot be shown to have advised anything, and the
 *      body's own quorum finding depends on attendance that only minutes fix.
 *
 *   4. `breach` — a decision dated before its window closed, an implementation
 *      dated before its decision, or an item put to a dissolved body. The commands
 *      cannot create these; when one arrives in the record it must be ANSWERED,
 *      and the register keeps it until somebody does.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * item or sitting), so a body with four lapsed items receives four separate asks
 * and clearing one cannot clear another. What the rule never does is re-file the
 * same obligation: a seat receives each ask once, at most four new asks arrive per
 * commit with the remainder counted, and an ask a human closed or returned is
 * treated as answered rather than re-issued.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no task title names a body, a subject, a representative or a
 * written advice. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never records advice on the body's behalf, never writes a
 * decision, never marks an advice answered, never changes a window, never closes a
 * sitting, never scores a representative or a body, and never reads a lapsed
 * window as consent. Where nobody can be asked — no affected line on the graph, no
 * joint seat, or an apex that resolves to nobody — it writes ONE identity-free
 * observation per condition and asks nobody. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at four per commit with the remainder counted, and pause-governed on
 * every path including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildVoice } from './voice.js';
import {
  VOI_EVENT_PREFIX,
  VOI_MARKER_KIND,
  VOI_ROUTE,
  VOI_RULE_ID,
  VOI_SETTING_KEYS,
} from './voiceRegistry.js';
import { normalizeVoiceSettings } from './voiceSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const VOI_PAUSE_SWITCH = 'voiceAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place an item or
 * sitting id appears in this rule's output, and it travels inside the typed link
 * rather than the delegation.
 */
export function voiceAskSignature(kind, targetId) {
  return `voi1:${kind}:${targetId}`;
}

const SIGNATURE_RE = /^voi1:(advice-lapsed|reply-overdue|minutes-lapsed|breach):([^:]+)$/;

export function parseVoiceAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], targetId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexVoiceAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== VOI_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseVoiceAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'advice-lapsed': 'A consultation window closed with no advice on the record — the body has not answered',
  'reply-overdue': 'A staff body advised and the organisation’s written reply is past its day',
  'minutes-lapsed': 'A sitting’s minutes are past their declared day',
  breach: 'A consultation decision or implementation is recorded out of order — it must be accounted for',
});

const OUTCOMES = Object.freeze({
  'advice-lapsed': `Open the employee-voice register (#/voice?panel=items) and record what actually happened: the advice if it exists, or the decision taken with no advice and its written reason. The register does not read a lapsed window as agreement, and this ask names no body, no subject and no representative, because a delegation is readable above the seat it is sent to.`,
  'reply-overdue': 'Open the employee-voice register (#/voice?panel=items) and record the organisation’s written reply to the advice on the record. A body that is consulted and never answered learns that consulting changes nothing, which is how a voice channel closes without anybody deciding to close it.',
  'minutes-lapsed': 'Open the sittings panel (#/voice?panel=sittings) and record the minutes of the sitting with the reference that holds them. A sitting nobody minuted cannot be shown to have advised anything.',
  breach: 'Open the employee-voice register (#/voice?panel=items) and record what happened. The register keeps the ordering breach and prints the exact days by which the act preceded the duty; it cannot be deleted, only accounted for. If the record was imported in error, correct the source and re-import — the register will not rewrite history on request.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: VOI_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: VOI_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${VOI_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report, matrix); exported
 * so the suite can pin every branch without a store.
 */
export function voiceConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };
  const graphIds = report.matrix?.nodes ? new Set(report.matrix.nodes.keys()) : new Set();

  const askApex = (kind, signature, ownerIds, urgency) => {
    const valid = list(ownerIds).filter((ownerId) => graphIds.has(ownerId));
    if (!valid.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but none of the affected reporting lines resolves on the active graph, so no seat can be asked to answer it.` });
      return;
    }
    const apex = matrixJointApex(report.matrix, valid);
    const apexIds = list(apex?.apexIds);
    // The enterprise root sits above everything, so a multi-line item whose only
    // common ancestor is that synthetic node has NO manager who actually holds
    // both lines. Filing the ask there would issue an obligation to nobody; the
    // register records the observation instead, identity-free.
    if (apexIds.length && valid.length > 1 && apex?.isLeaderOnly) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but the affected lines share no manager who holds both — the only common seat is the enterprise root, which holds no line here, so no joint seat can be asked.` });
      return;
    }
    if (!apexIds.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but the reporting graph yields no joint seat above the affected lines.` });
      return;
    }
    for (const seatId of apexIds) {
      conditions.push({ kind, signature, seatIds: [seatId], dueOn: report.asOf, ambiguous: Boolean(apex?.ambiguous), urgency });
    }
  };

  for (const row of report.rows) {
    if (row.state.key === 'advice-lapsed') askApex('advice-lapsed', voiceAskSignature('advice-lapsed', row.item.id), row.item.ownerIds, 0);
    if (row.state.key === 'reply-overdue') askApex('reply-overdue', voiceAskSignature('reply-overdue', row.item.id), row.item.ownerIds, 1);
    if (row.state.key.startsWith('breach')) askApex('breach', voiceAskSignature('breach', row.item.id), row.item.ownerIds, 0);
  }

  for (const row of report.sittingRows) {
    if (row.state.key !== 'minutes-lapsed') continue;
    // A sitting's duty belongs to the lines whose items were heard. A sitting that
    // heard nothing has no affected line in the record, and the rule says so
    // rather than inventing one from the body's membership.
    const heard = list(row.sitting.itemIds);
    const ownerIds = [...new Set(report.rows
      .filter((candidate) => heard.includes(candidate.item.id))
      .flatMap((candidate) => candidate.item.ownerIds))];
    askApex('minutes-lapsed', voiceAskSignature('minutes-lapsed', row.sitting.id), ownerIds, 2);
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-VOI-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function voiceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(VOI_EVENT_PREFIX)) return [];

  const conv = normalizeVoiceSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv.voiceAutoPropagate === false) return [];

  if (!list(draft.voiceItems).length && !list(draft.voiceSittings).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildVoice(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = voiceConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexVoiceAsks(draft);
  const covered = new Set(existing.filter((ask) => ask.task && ask.task.status === 'active').map((ask) => `${ask.signature}::${ask.seatId}`));

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = `${condition.signature}::${seatId}`;
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has
      // ANSWERED it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(VOI_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the employee-voice register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the employee-voice register (#/voice).', 2000),
        authority: 'act-inform',
        support: `Issued by ${VOI_RULE_ID} from the employee-voice register (#/voice). It reads declared bodies, items, sittings, advice and decisions only; it is not a finding about anyone and is not a rating of anyone.`,
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
        ruleId: VOI_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed an employee-voice ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.voiceMarkers = Array.isArray(draft.voiceMarkers) ? draft.voiceMarkers : [];
    const have = new Set(draft.voiceMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.voiceMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: VOI_RULE_ID,
        kind: VOI_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', VOI_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', VOI_ROUTE, `${deferred} employee-voice ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }

  // Close this rule's own asks whose condition has cleared.
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
    task.completionNote = clip(`${VOI_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The employee-voice condition cleared; the register closed its own ask.');
  }

  return out;
}

voiceRule.id = 'voiceRule';

export default voiceRule;
