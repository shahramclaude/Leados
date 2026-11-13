/**
 * app/core/domain/changeSaturationRules.js — RULE-CSA-01, the Cross-Line Change
 * Saturation register's rule on the shared post-commit spine (ADR-0186).
 *
 * THE DUTY IT PERFORMS. A change is approved by the line that wants it, and the
 * load it puts on a person is only ever visible in the sum. Absorptive capacity is
 * a declaration, so a workspace where nobody has declared one cannot know it is
 * saturated — and the register's most important output is that fact, said out loud
 * to the one seat that can act on it. This rule is the thing that says it.
 *
 * It raises at most ONE open dated ask per finding, bounded per commit:
 *
 *   (a) `saturation-over`     — people are carrying more declared change weight on
 *       at least one day than their own declared ceiling allows. The ask names the
 *       COUNT and the window, never a person, and asks for the sequencing decision
 *       or a re-declared ceiling. It does not defer a change and does not tell
 *       anybody their approval was wrong.
 *
 *   (b) `ceilings-missing`    — demands are recorded and no ceiling in force covers
 *       the people carrying them. This is the loudest finding the register can
 *       make: the workspace is approving change onto people whose capacity bound
 *       nobody has written down, so every row prints `no capacity declared` and no
 *       saturation claim is possible in principle.
 *
 *   (c) `demand-unattributable` — a stored demand's declaring line is no longer an
 *       active line of that person, or the change it was declared against has
 *       disappeared from the workspace. The burden is in the ledger and no pool
 *       owns it. The ask goes to the seat that declared it, and nobody is
 *       substituted as its owner.
 *
 *   (d) `ceilings-expired`    — a ceiling's window has passed while demands are
 *       still being charged. An expired limit is not a limit that was met; the ask
 *       is to re-affirm it or accept that the register prints no verdict.
 *
 * It closes its own asks when the finding clears, never writes a demand or a
 * ceiling on a human's behalf, never infers a capacity to fill a hole, and asks
 * about the RECORD rather than about any person's stamina. It is bounded
 * (4 asks per commit, the rest counted), idempotent per finding signature, pausable
 * through `changeSaturationAutoPropagate`, and reads the WHOLE workspace on every
 * trigger because a person's cross-line total is not visible from one span: routing
 * it to a single manager would show each line its own contribution and hide the sum.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildChangeSaturation } from './changeSaturation.js';
import { normalizeChangeSaturationSettings } from './changeSaturationSchema.js';
import {
  CHANGE_SATURATION_EVENTS,
  CHANGE_SATURATION_LIMITS,
  CHANGE_SATURATION_RULE_ID,
  CHANGE_SATURATION_SETTING_KEYS,
} from './changeSaturationRegistry.js';

/**
 * Events that can change the answer: the register's own six acts, plus anything
 * that moves the change records the demands are anchored to, the people they are
 * charged against, or the reporting lines that own them.
 */
export const CHANGE_SATURATION_TRIGGER_EVENTS = new Set([
  CHANGE_SATURATION_EVENTS.DEMAND_DECLARED,
  CHANGE_SATURATION_EVENTS.DEMAND_WITHDRAWN,
  CHANGE_SATURATION_EVENTS.CEILING_DECLARED,
  CHANGE_SATURATION_EVENTS.CEILING_RETIRED,
  CHANGE_SATURATION_EVENTS.CONVENTIONS,
  CHANGE_SATURATION_EVENTS.SCAN,
  'change.created',
  'change.updated',
  'change.statusChanged',
  'change.deleted',
  'person.added',
  'person.updated',
  'person.archived',
  'person.restored',
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
]);

export const CHANGE_SATURATION_CLOSED_PREFIX = `Closed by ${CHANGE_SATURATION_RULE_ID}:`;

const clip = (value, n = 280) => String(value || '').trim().slice(0, n);

function effect(ctx, out, action, summary) {
  const entry = { ruleId: CHANGE_SATURATION_RULE_ID, action, targetType: 'workspace', targetId: 'change-saturation', summary: clip(summary) };
  ctx.recordEffect?.({ ...entry, rule: CHANGE_SATURATION_RULE_ID, entity: entry.targetType, entityId: entry.targetId });
  out.push(entry);
}

export function changeSaturationRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!CHANGE_SATURATION_TRIGGER_EVENTS.has(eventType)) return [];
  const K = CHANGE_SATURATION_SETTING_KEYS;
  const conv = normalizeChangeSaturationSettings(draft.settings || {});
  if (eventType !== CHANGE_SATURATION_EVENTS.SCAN && !conv[K.autoPropagate]) return [];

  // Inert in a workspace with nobody on the roster: there is no capacity to bound.
  const people = (Array.isArray(draft.people) ? draft.people : []).filter((p) => p && p.status !== 'archived');
  if (!people.length) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  // The rule reads the WHOLE workspace with the operator view on settings: a
  // cross-line sum is exactly the figure one span cannot see, and a finding
  // delivered only to the seat that happened to trigger it is the failure mode
  // this ledger exists to correct.
  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const board = buildChangeSaturation(view, { now: at, settings: operator, detailLevel: 'full' });

  const saturatedSubjectIds = [...new Set(board.people
    .filter((row) => row.state === 'saturated' || row.state === 'contested')
    .map((row) => row.personId))];

  /* ---------------------------------------------------------- owning seats */
  // A workspace-wide saturation finding belongs to the single seat above every
  // reporting line of the affected people. It is routed to the joint apex of the
  // line HOLDERS, never to the affected person: the person carrying two lines'
  // changes cannot sequence the two changes, cannot declare a capacity, and being
  // asked "are you too busy?" is precisely the person-rating this register exists
  // to refuse. Where the holders do not share one apex the finding is OBSERVED and
  // printed as nobody's to settle, because naming one of several counterpart
  // managers as the owner of a cross-line sum is the invention this doctrine forbids.
  function holdersOf(personIds) {
    const holders = new Set();
    for (const personId of personIds) {
      for (const line of matrix.linesByPerson.get(personId) || []) {
        if (!line?.managerId || line.managerId === personId) continue;
        holders.add(line.managerId);
      }
    }
    return [...holders];
  }
  function seatOfJoint(ids) {
    if (!ids.length) return { id: null, name: null, state: 'no-active-line' };
    const joint = matrixJointApex(matrix, ids);
    if (joint.isLeaderOnly) return { id: LEADER_ID, name: matrix.nodes.get(LEADER_ID)?.name || 'the workspace leader', state: 'leader-held' };
    if (joint.unique && matrix.roster.has(joint.apexId)) return { id: joint.apexId, name: matrix.nodes.get(joint.apexId)?.name || joint.apexId, state: 'unique' };
    return { id: null, name: null, state: joint.unique ? 'off-roster' : 'ambiguous' };
  }
  function ownerFor(personIds) {
    return seatOfJoint(holdersOf(personIds));
  }

  /* ------------------------------------------------------------- findings */
  const findings = [];
  const counts = board.totals.stateCounts || {};
  if ((counts.saturated || 0) > 0 || (counts.contested || 0) > 0) {
    const ids = saturatedSubjectIds;
    const owner = ownerFor(ids);
    findings.push({
      key: 'saturation-over',
      signature: `${today}|${counts.saturated || 0}|${counts.contested || 0}|${board.totals.overDaysTotal}`,
      owner,
      summary: `${counts.saturated || 0} person(s) carry a day over their declared change ceiling${counts.contested ? `; ${counts.contested} more have lines that disagree about the weight` : ''}.`,
      title: 'Sequence the changes or re-declare the ceiling — nothing was blocked',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, either move one demand's window, or re-declare the capacity ceiling, in Matrix → Change saturation. In the window ${board.window.fromISO} → ${board.window.toISO} the register read ${board.totals.actsReadN} declared change demand(s) across ${board.totals.peopleN} person(s); ${counts.saturated || 0} carried more concurrent weight than their declared ceiling allows and ${board.totals.overDaysTotal} person-day(s) sat over a ceiling (longest run ${board.totals.longestRunDays} day(s)). This ask is about the RECORD and the declared limit — it does not defer a change, reassign a person or judge anybody's capacity to cope, and no approval here was withdrawn.`,
    });
  }
  if (board.totals.actsReadN > 0 && !board.claims.ceilingsDeclared) {
    findings.push({
      key: 'ceilings-missing',
      signature: `${today}|${board.totals.actsReadN}`,
      owner: ownerFor(board.people.map((row) => row.personId)),
      summary: `${board.totals.actsReadN} change demand(s) are charged against people and no capacity ceiling is in force for anybody, so no saturation claim can be made at all.`,
      title: 'Declare the change capacity you intend to hold, or state that none is bounded',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, declare a per-person or per-pool ceiling in Matrix → Change saturation, or record in the change itself that this workspace bounds no absorptive capacity. Until a ceiling exists the register prints “no capacity declared” for every person and cannot say whether three lines' changes on one of them is too much: a limit nobody wrote down is not a limit nobody exceeded. Nothing was inferred from headcount, level, pay or meeting load, because an inferred ceiling would be a capacity its author never agreed to.`,
    });
  }
  if (board.totals.actsUnattributedN > 0) {
    const declaredById = new Set((Array.isArray(draft.changeSaturationActs) ? draft.changeSaturationActs : [])
      .filter((a) => a && !a.withdrawn && a.declaredById)
      .map((a) => a.declaredById));
    // The seat that can fix an orphaned demand is the one that declared it, when
    // exactly one declarer is recorded across the whole set. Where the acts name no
    // declarer at all the finding goes to the apex of the people carrying demands;
    // an unattributed burden is never quietly handed to whoever is reachable.
    const owner = declaredById.size === 1
      ? { id: [...declaredById][0], name: matrix.nodes.get([...declaredById][0])?.name || [...declaredById][0], state: 'declarer' }
      : ownerFor(board.people.map((row) => row.personId));
    findings.push({
      key: 'demand-unattributable',
      signature: `${today}|${board.totals.actsUnattributedN}`,
      owner,
      summary: `${board.totals.actsUnattributedN} recorded change demand(s) cannot be attributed to an active line, so the burden is in the ledger and no pool owns it.`,
      title: 'Re-attribute or withdraw the change demands whose line no longer holds',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, either re-declare each demand down the line that now carries it, or withdraw it with a reason. A demand whose declaring line has ended is kept as history and charges no day — it is not silently reassigned to the person's home line, because a line that never approved the work would be made accountable for it. ${board.totals.actsUnattributedN} such demand(s) are currently counted apart from every total.`,
    });
  }
  if (board.totals.ceilingsExpiredN > 0 && board.totals.actsReadN > 0) {
    findings.push({
      key: 'ceilings-expired',
      signature: `${today}|${board.totals.ceilingsExpiredN}`,
      owner: ownerFor(board.people.map((row) => row.personId)),
      summary: `${board.totals.ceilingsExpiredN} declared capacity ceiling(s) have a window that has passed while demands are still being charged.`,
      title: 'Re-affirm the change ceilings whose window passed, or accept that no verdict prints',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, re-affirm each ceiling with a new dated window or retire it deliberately. An expired ceiling is history, not compliance: the register does not read “nothing exceeded it” from a limit that stopped applying, and it prints ${counts['no-ceiling'] || 0} person(s) as having no capacity declared today.`,
    });
  }

  draft.changeSaturationMarkers = Array.isArray(draft.changeSaturationMarkers) ? draft.changeSaturationMarkers : [];
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const out = [];
  let closed = 0;
  let issued = 0;
  let deferred = 0;
  let observed = 0;

  /* ------------------------------------------- 1. close asks that have cleared */
  const liveKeys = new Set(findings.map((f) => `ask|${f.key}|${f.signature}`));
  const activeIds = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
  for (const marker of draft.changeSaturationMarkers) {
    if (marker?.kind !== 'ask' || !marker.taskId) continue;
    if (!activeIds.has(marker.taskId)) continue;
    // `ask|<key>|` prefix match: the finding is the same obligation even when the
    // day or the count in its signature moved. Re-issuing an ask every time a
    // number ticked would be noise that buries the one open question.
    const stillLive = [...liveKeys].some((key) => key.startsWith(`ask|${marker.key.split('|')[1]}|`));
    if (stillLive) continue;
    const task = draft.delegations.find((d) => d && d.id === marker.taskId);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `${CHANGE_SATURATION_CLOSED_PREFIX} the change-saturation finding this ask named has cleared.`;
    task.updatedAt = nowIso;
    closed += 1;
  }

  /* -------------------------------------------------- 2. issue owed findings */
  // One open ask per FINDING, not per signature. The signature carries the day and
  // the counts so the ask's text stays provable, but re-issuing an ask every time a
  // number inside it moved would bury the one open question under a week of noise —
  // so the ledger tracks the finding and the ask carries the day it was raised.
  const openMarkers = draft.changeSaturationMarkers
    .filter((m) => m?.kind === 'ask' && m.taskId && activeIds.has(m.taskId));
  const openFindings = new Set(openMarkers.map((m) => String(m.key).split('|')[1]));
  const observedFindings = new Set(draft.changeSaturationMarkers
    .filter((m) => m?.kind === 'observation')
    .map((m) => String(m.key).split('|')[1]));
  for (const finding of findings) {
    const key = clip(`ask|${finding.key}|${finding.signature}`, 320);
    if (openFindings.has(finding.key)) continue;
    if (draft.changeSaturationMarkers.some((m) => m?.key === key)) continue;
    const ownerId = finding.owner?.id || null;
    if (!ownerId) {
      // No single seat can own a cross-line sum. Observed once, never routed to an
      // arbitrary manager who happens to be reachable.
      const obsKey = clip(`obs|${finding.key}|${finding.owner?.state}`, 320);
      if (!observedFindings.has(finding.key) && !draft.changeSaturationMarkers.some((m) => m?.key === obsKey)) {
        draft.changeSaturationMarkers.push({
          key: obsKey, kind: 'observation', subject: finding.key, taskId: null, state: finding.owner?.state || 'nobody',
          summary: `No ask issued: the owning seat is ${finding.owner?.state || 'unresolved'}. Nobody was substituted.`, at: nowIso,
        });
        observed += 1;
      }
      continue;
    }
    if (issued >= CHANGE_SATURATION_LIMITS.asksPerCommit) { deferred += 1; continue; }
    const taskId = idFactory('dlg');
    draft.delegations.unshift({
      id: taskId,
      personId: ownerId,
      title: clip(finding.title, 200),
      expectedOutcome: clip(finding.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${CHANGE_SATURATION_RULE_ID}; it asks about the RECORD and the declared ceiling, never about a person’s capacity to cope.`,
      delegatedOn: today,
      dueOn: addDays(today, conv[K.askDueDays]),
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const linkCtx = { idFactory, todayStr: today, nowIso };
    ensureEntityLink(draft, {
      sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ownerId,
      relation: 'issues-obligation', ruleId: CHANGE_SATURATION_RULE_ID, summary: finding.summary,
    }, linkCtx);
    for (const ancestorId of [...(matrix.nodes.get(ownerId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: CHANGE_SATURATION_RULE_ID,
        summary: 'A cross-line change-saturation ask rolls up to this span.',
      }, linkCtx);
    }
    draft.changeSaturationMarkers.push({
      key, kind: 'ask', subject: finding.key, taskId, state: 'open',
      summary: `Issued change-saturation ask ${taskId} to ${finding.owner.name || ownerId}.`, at: nowIso,
    });
    issued += 1;
  }

  /* ------------------------- 3. bound the marker ledger, keeping open asks */
  const cap = CHANGE_SATURATION_LIMITS.markers;
  if (draft.changeSaturationMarkers.length > cap) {
    const stillActive = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
    let excess = draft.changeSaturationMarkers.length - cap;
    draft.changeSaturationMarkers = draft.changeSaturationMarkers.filter((marker) => {
      if (excess > 0 && !(marker?.kind === 'ask' && stillActive.has(marker.taskId))) { excess -= 1; return false; }
      return true;
    });
  }

  if (closed) effect(ctx, out, 'completed', `Closed ${closed} change-saturation ask(s) whose finding cleared.`);
  if (issued) effect(ctx, out, 'delegated', `Issued ${issued} cross-line change-saturation ask(s).`);
  if (observed) effect(ctx, out, 'observed', `Recorded ${observed} change-saturation finding(s) with no single owning seat; nobody was substituted.`);
  if (deferred) effect(ctx, out, 'deferred', `${deferred} change-saturation ask(s) were not issued in this commit (cap ${CHANGE_SATURATION_LIMITS.asksPerCommit}); they follow on the next write.`);
  return out;
}
changeSaturationRule.id = 'changeSaturationRule';
changeSaturationRule.triggers = CHANGE_SATURATION_TRIGGER_EVENTS;

export default changeSaturationRule;
