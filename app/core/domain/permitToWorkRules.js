/**
 * app/core/domain/permitToWorkRules.js — `RULE-PTW-01` on the shared post-commit
 * spine (ADR-0246, Schema v200).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildPermitToWork`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `live-unverified` — a permit inside its validity with at least one isolation
 *      that has no proof of zero energy inside the permit's own window. This is the
 *      condition the register exists for: people are working on plant the record
 *      cannot show is dead. The ask goes to the JOINT APEX above every line holding
 *      the permit HOLDER, because the line that authorised the work is routinely not
 *      the line the holder sits on, and the seat answerable for both is the seat
 *      above both. It NEVER goes to the holder: they are standing next to the plant,
 *      and asking somebody to chase their own isolation is the exact failure this
 *      rule forbids.
 *
 *   2. `live-atmosphere` — a permit inside its validity whose latest reading fails
 *      the limit its own issuer declared, or which declares a test nobody recorded.
 *      A person may be inside the space right now. Same joint apex.
 *
 *   3. `expired-open` — a permit past its declared validity with no closure. The
 *      paperwork and the plant have stopped agreeing. Same joint apex.
 *
 *   4. `simultaneous-operations` — a conflict between two open permits. Filed ONCE
 *      per (kind, the sorted pair of permit ids), so the two crews' managers are
 *      told once rather than twice, and the ask goes to the joint apex above every
 *      line involved on BOTH permits — there is no single line that can resolve a
 *      conflict between two lines.
 *
 *   5. `isolation-outstanding` — a permit CLOSED while an isolation it applied was
 *      never removed and confirmed. The plant may be isolated with nobody aware of
 *      it, and the closure is on the record, so the duty is dated and owed.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * permit) — or per (condition, the two permits) — so a manager holding four permits
 * receives four separate asks and clearing one cannot clear another, and two
 * simultaneous-operations conflicts in one area are two asks rather than one
 * reassuring summary. What the rule never does is re-file the same obligation: a
 * manager receives each ask once, and at most four new asks arrive per commit with
 * the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no ask text names a person, an area, a work reference, an isolation
 * point, a lock, an instrument or a reading. The opaque signature lives only in the
 * typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never issues, applies, verifies, removes, tests, hands
 * over, suspends, resumes or closes anything; never records a proof of zero energy
 * on anybody's behalf; never extends a validity; never asserts that a plant is safe
 * or unsafe as a matter of fact; never clears a conflict by editing a status; and
 * never rates, ranks or names a person as a cause. Where nobody can be asked — a
 * disconnected graph, a holder with no active line, an apex that resolves to the
 * holder — it writes ONE identity-free observation per condition and asks nobody.
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears or
 * the addressee moves, bounded at four per commit, and pause-governed on every path
 * including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildPermitToWork } from './permitToWork.js';
import {
  PTW_EVENT_PREFIX,
  PTW_MARKER_KIND,
  PTW_ROUTE,
  PTW_RULE_ID,
  PTW_SETTING_KEYS,
} from './permitToWorkRegistry.js';
import { normalizePtwSettings } from './permitToWorkSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const PTW_PAUSE_SWITCH = 'ptwAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a permit id
 * appears in this rule's output, and it travels inside the typed link rather than
 * the delegation. Two operators running the same pass derive the same signatures,
 * so neither duplicates the other's asks.
 */
export function ptwAskSignature(kind, ref) {
  return `ptw1:${kind}:${ref}`;
}

const SINGLE_RE = /^ptw1:(live-unverified|live-atmosphere|expired-open|isolation-outstanding):([^:]+)$/;
const PAIR_RE = /^ptw1:(simultaneous-operations):([A-Za-z0-9:_-]+)\+([A-Za-z0-9:_-]+)$/;

export function parsePtwAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const single = SINGLE_RE.exec(summary.trim());
  if (single) return { signature: single[0], kind: single[1], permitIds: [single[2]] };
  const pair = PAIR_RE.exec(summary.trim());
  if (pair) return { signature: pair[0], kind: pair[1], permitIds: [pair[2], pair[3]] };
  return null;
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexPermitToWorkAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== PTW_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePtwAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, permitIds: parsed.permitIds, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'live-unverified': 'A live permit has no proof of zero energy — work may be under way on plant the record cannot show is dead',
  'live-atmosphere': 'A live permit’s atmosphere is outside the limits its own issuer declared',
  'expired-open': 'A permit lapsed and nobody closed it — nobody has declared what state the plant is in',
  'simultaneous-operations': 'Two permitted activities contradict each other on the same plant',
  'isolation-outstanding': 'A permit was closed with an isolation never restored — the plant may be isolated with nobody aware',
});

const OUTCOMES = Object.freeze({
  'live-unverified': `Open the permit register (#/permit-to-work) and take one of the recorded acts: apply the missing isolation, record the proof of zero energy inside the permit's own declared window, suspend the permit, or close it out. The register reports what the record holds and says plainly when it holds no proof; it cannot inspect a plant. This ask names nobody and no area, because a delegation is readable above the seat it is sent to.`,
  'live-atmosphere': 'Open the permit register (#/permit-to-work) and either record a fresh reading from a referenced instrument against the limit the permit declares, or suspend the permit until the atmosphere is proved. A test that has never been recorded is not a passing test.',
  'expired-open': 'Open the permit register (#/permit-to-work) and record the closure with what actually happened, or suspend and re-issue a permit with a validity somebody chose. Time cannot close a permit a human did not close.',
  'simultaneous-operations': 'Open the simultaneous-operations view (#/permit-to-work?view=conflicts). Two permitted activities are unsafe together: suspend one of them, or record what changed so that both are safe. The register derives the conflict on every read and never clears it by editing a status.',
  'isolation-outstanding': 'Open the permit register (#/permit-to-work) and record the removal of the isolation and a named hand’s confirmation. The closure stands on the record either way; this ask is for the plant state nobody has declared.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PTW_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PTW_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${PTW_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report, matrix); exported
 * so the suite can pin every branch without a store, and so the screen's attention
 * count and the rule cannot disagree about what is owed.
 */
export function permitToWorkConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const KIND_URGENCY = {
    'live-atmosphere': 0,
    'live-unverified': 0,
    'simultaneous-operations': 1,
    'expired-open': 1,
    'isolation-outstanding': 2,
  };

  /** Ask every joint apex over the lines holding a set of people, or observe why not. */
  const askOthers = ({ kind, signature, personIds, observationDetail }) => {
    const holderIds = [...new Set(personIds.filter(Boolean))];
    if (!holderIds.length) {
      observations.push({ signature, detail: observationDetail });
      return;
    }
    const lines = [];
    for (const personId of holderIds) {
      const row = (report.allRows || []).find((candidate) => candidate.permit.holderId === personId);
      for (const line of list(row?.lines)) if (line.managerId) lines.push(line.managerId);
    }
    const unique = [...new Set(lines)];
    if (!unique.length) {
      observations.push({ signature, detail: observationDetail });
      return;
    }
    const apex = matrixJointApex(report.matrix, unique);
    const apexIds = list(apex?.apexIds);
    if (!apexIds.length) {
      observations.push({ signature, detail: `${observationDetail} The reporting graph yields no joint seat above the lines holding them.` });
      return;
    }
    for (const seatId of apexIds) {
      if (holderIds.includes(seatId)) {
        // The only seat above the holder is the holder. Asking somebody to chase
        // their own isolation is the failure this rule exists to forbid.
        observations.push({ signature, detail: `${observationDetail} The only seat above it is one of the people it protects, so the rule observes this and asks nobody rather than ask them.` });
        continue;
      }
      conditions.push({ kind, signature, seatIds: [seatId], dueOn: report.asOf, ambiguous: Boolean(apex?.ambiguous), urgency: KIND_URGENCY[kind] ?? 3 });
    }
  };

  for (const row of report.allRows || []) {
    const stateKey = row?.state?.key;
    if (!row?.permit?.id) continue;

    if (stateKey === 'live-unverified') {
      askOthers({
        kind: 'live-unverified',
        signature: ptwAskSignature('live-unverified', row.permit.id),
        personIds: [row.permit.holderId],
        observationDetail: 'A live permit has at least one isolation with no proof of zero energy, but the holder is on no active reporting line, so no seat can be asked to respond.',
      });
    }
    if (stateKey === 'live-atmosphere') {
      askOthers({
        kind: 'live-atmosphere',
        signature: ptwAskSignature('live-atmosphere', row.permit.id),
        personIds: [row.permit.holderId],
        observationDetail: 'A live permit’s atmosphere is outside its own declared limits, but the holder is on no active reporting line, so no seat can be asked to respond.',
      });
    }
    if (stateKey === 'expired-open') {
      askOthers({
        kind: 'expired-open',
        signature: ptwAskSignature('expired-open', row.permit.id),
        personIds: [row.permit.holderId],
        observationDetail: 'A permit lapsed with no closure, but its holder is on no active reporting line, so no seat can be asked to respond.',
      });
    }
    if (stateKey === 'closed-isolation-owed') {
      askOthers({
        kind: 'isolation-outstanding',
        signature: ptwAskSignature('isolation-outstanding', row.permit.id),
        personIds: [row.permit.holderId],
        observationDetail: 'A permit was closed with an isolation never restored, but its holder is on no active reporting line, so no seat can be asked to respond.',
      });
    }
  }

  /** Simultaneous-operations conflicts: one ask per (kind, sorted permit pair). */
  const perPermitKinds = new Set([
    'permit-lapsed-open',
    'isolation-verification-overdue',
    'atmosphere-out-of-limit',
    'atmosphere-stale',
    'closure-isolation-owed',
    'hot-work-without-fire-watch',
    'orphan-holder',
  ]);
  const seenPairs = new Set();
  for (const conflict of report.conflicts || []) {
    if (perPermitKinds.has(conflict.kind)) continue;
    const pair = [...new Set(list(conflict.permitIds))].sort();
    if (pair.length < 2) continue;
    const signature = ptwAskSignature('simultaneous-operations', `${pair[0]}+${pair[1]}`);
    if (seenPairs.has(signature)) continue;
    seenPairs.add(signature);
    const holders = pair
      .map((permitId) => (report.allRows || []).find((row) => row.permit.id === permitId)?.permit.holderId)
      .filter(Boolean);
    askOthers({
      kind: 'simultaneous-operations',
      signature,
      personIds: holders,
      observationDetail: 'Two permitted activities contradict each other, but no active line holds either holder, so no seat can be asked to resolve it.',
    });
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-PTW-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function permitToWorkRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PTW_EVENT_PREFIX)) return [];

  const conv = normalizePtwSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because the
  // pause-permit census greps the source that reads it.
  if (conv.ptwAutoPropagate === false) return [];

  if (!list(draft.ptwPermits).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildPermitToWork(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = permitToWorkConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexPermitToWorkAsks(draft);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PTW_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the permit-to-work register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || `Open the permit register (${PTW_ROUTE}).`, 2000),
        authority: 'act-inform',
        support: `Issued by ${PTW_RULE_ID} from the permit-to-work register (${PTW_ROUTE}). It reads declared permits, applied isolations, recorded proofs and gas readings only; it cannot inspect a plant, it is not a finding about anyone and it is not a rating of anyone.`,
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
        ruleId: PTW_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a permit-to-work ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.ptwMarkers = Array.isArray(draft.ptwMarkers) ? draft.ptwMarkers : [];
    const have = new Set(draft.ptwMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.ptwMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: PTW_RULE_ID,
        kind: PTW_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', PTW_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', PTW_ROUTE, `${deferred} permit-to-work ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${PTW_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The permit-to-work condition cleared; the register closed its own ask.');
  }

  return out;
}

permitToWorkRule.id = 'permitToWorkRule';

export default permitToWorkRule;
