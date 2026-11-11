/**
 * app/core/domain/lineHorizonRules.js — post-commit propagation for the Matrix
 * Forward Allocation Horizon (ADR-0179, Schema v143 unchanged).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` BEFORE `seatRule`, so an ask issued
 * here is already in the record when the Operating Seat fans the same
 * transaction's open work up every leadership span, and `sealRule` attests all
 * of it in one seal.
 *
 * RULE-LHZ-01  FORWARD ALLOCATION ASKS.
 *
 *   A double-booking, an unallocated remainder or an undeclared split that the
 *   declared lines will create on a day that has not arrived is put in front of
 *   the ONE seat that owns the fix, once, while there is still time to change
 *   the declaration — and the ask closes itself when the declared lines no
 *   longer create it.
 *
 *   Who owns it is decided from the graph on the first exposed day, never by
 *   choosing among managers (`resolveOwner`, lineHorizon.js):
 *     over-committed   the lowest roster seat above EVERY line in force that day;
 *     split unknown    the lowest roster seat above the lines with no declared
 *                      share (one such line: that line's own manager);
 *     under-allocated  the home-line manager.
 *   An owner that is the workspace leader, off the roster or not unique is an
 *   OBSERVATION — counted on the panel and in one identity-free marker — and
 *   nobody is substituted.
 *
 * WHEN IT RUNS
 * ------------
 *  - on every reporting-line act, convention change and roster change;
 *  - on an explicit scan (`matrix.horizon.scan`, or the ledger's `matrix.scan`);
 *  - on any other operational write (the same predicate RULE-MTX-01 uses), but
 *    only while a declared line boundary sits inside the lead window or one of
 *    this rule's own asks is open. Time passing is the one thing an unrelated
 *    write can change here: it is how an exposure declared months ago walks
 *    into the window, and how an exposure that was asked about runs out.
 *    The record holds no clock, so a workspace nobody writes to issues nothing.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never edits a reporting line, a share, a date or a roster record. The
 *    split is an agreement between managers and the person; the rule asks for
 *    that agreement and does not write it.
 *  - It never asks twice for one exposure of one seat. The typed edge from the
 *    person to the ask carries the exposure (`lineHorizonExposureSummary`), and
 *    an ask a human closed while the exposure stands is not re-issued.
 *  - It never closes an ask because the day arrived. An unfixed double-booking
 *    that has started is still unfixed; the ask stays open and overdue.
 *  - It is INERT in a single-chain workspace: with no declared line it returns
 *    at the first guard and writes nothing.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { formatShareH } from './matrix.js';
import { normalizeMatrixSettings } from './matrixSchema.js';
import { MATRIX_SHARE_STATES, matrixLineKind } from './matrixRegistry.js';
import { DERIVED_EVENT_PREFIXES, MATRIX_SCAN_EVENT } from './matrixRules.js';
import {
  lineHorizonExposureSummary,
  lineHorizonExposures,
  lineHorizonStateLabel,
  parseLineHorizonExposureSummary,
} from './lineHorizon.js';
import {
  LINE_HORIZON_FULL_H,
  LINE_HORIZON_LIMITS,
  LINE_HORIZON_OWNER_STATE_KEYS,
  LINE_HORIZON_RULE_ID,
  LINE_HORIZON_SCAN_EVENT,
} from './lineHorizonRegistry.js';

const S = MATRIX_SHARE_STATES;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const LINE_HORIZON_STRUCTURAL_EVENTS = Object.freeze([
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'matrix.conventions.set',
]);
const STRUCTURAL = new Set(LINE_HORIZON_STRUCTURAL_EVENTS);
const SCANS = new Set([LINE_HORIZON_SCAN_EVENT, MATRIX_SCAN_EVENT]);

/**
 * Events written BY the spine, never by a person acting on the record. This is
 * RULE-MTX-01's list verbatim, imported from `matrixRules.js`
 * (`DERIVED_EVENT_PREFIXES`) — the shared predicate, not a private copy.
 */

/** The first words of a completion note this rule wrote, so it can tell its own closes from a human's. */
export const LINE_HORIZON_CLOSED_PREFIX = `Closed by ${LINE_HORIZON_RULE_ID}:`;

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function note(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  out.push({ ruleId: LINE_HORIZON_RULE_ID, action, targetType, targetId, summary: clean });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${LINE_HORIZON_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

/** True when a declared line starts, or has its first day off, inside (today, end]. */
function boundaryInside(rows, today, end) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.fromISO === 'string' && ISO_DAY.test(row.fromISO) && row.fromISO > today && row.fromISO <= end) return true;
    if (typeof row.toISO === 'string' && ISO_DAY.test(row.toISO)) {
      const after = addDays(row.toISO, 1);
      if (after && after > today && after <= end) return true;
    }
  }
  return false;
}

/** The wording of one ask. It names only what the addressed seat already sits above. */
function askText(exposure, names, dueOn) {
  const who = exposure.personName;
  const total = formatShareH(exposure.totalH);
  if (exposure.state === S.over) {
    const lines = exposure.lines.map((line) => `${names.get(line.managerId) || line.managerId} (${line.role === 'primary' ? 'home' : (matrixLineKind(line.kind)?.label || line.kind).toLowerCase()}, ${formatShareH(line.shareH)})`).join('; ');
    return {
      title: `Settle ${who}’s double-booking before ${exposure.from}`,
      expectedOutcome: `From ${exposure.from} the declared shares on ${who}’s reporting lines total ${total} of a person across ${exposure.lines.length} lines: ${lines}. By ${dueOn}, agree with the managers holding those lines which share moves, which line starts later or which one ends, and record it on the matrix ledger. Nothing was changed automatically.`,
    };
  }
  if (exposure.state === S.under) {
    return {
      title: `Place or re-declare ${who}’s unallocated share before ${exposure.from}`,
      expectedOutcome: `From ${exposure.from} the declared shares on ${who}’s reporting lines total ${total} of a person, which leaves ${formatShareH(LINE_HORIZON_FULL_H - exposure.totalH)} held by nobody. By ${dueOn}, retune the home-line share, declare the line that takes the remainder, or record that the gap is intended. Nothing was changed automatically.`,
    };
  }
  const missing = exposure.lines.filter((line) => line.declaredShareH === null).length;
  return {
    title: `Declare the missing share on ${who}’s reporting lines before ${exposure.from}`,
    expectedOutcome: `From ${exposure.from} ${who} holds ${exposure.lines.length} reporting lines and ${missing} of them carr${missing === 1 ? 'ies' : 'y'} no declared share, so from that day nothing can be attributed to any manager. By ${dueOn}, declare the missing share on the matrix ledger. No share was filled in automatically.`,
  };
}

export function lineHorizonRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  const type = event.type;
  const isScan = SCANS.has(type);
  const isStructural = STRUCTURAL.has(type) || type.startsWith('person.');
  const isOperational = !isScan && !isStructural && !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
  if (!isScan && !isStructural && !isOperational) return [];
  // A record another rule created inside this transaction cannot have moved a
  // line or the clock, so it is not a reason to read the horizon again.
  if (isOperational && ctx.derived) return [];

  const declared = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declared.length) return [];

  const settings = draft.settings || {};
  const conv = normalizeMatrixSettings(settings);
  if (!conv.matrixAutoPropagate && !isScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();
  const leadDays = conv.matrixExpiringDays;
  const leadEnd = addDays(today, leadDays);

  /* The asks this rule has issued, read back from the typed graph. */
  const links = Array.isArray(draft.links) ? draft.links : [];
  const delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const taskById = new Map(delegations.map((task) => [task.id, task]));
  const mine = [];
  for (const link of links) {
    if (!link || link.ruleId !== LINE_HORIZON_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseLineHorizonExposureSummary(link.summary);
    if (!parsed) continue;
    mine.push({ personId: link.sourceId, task: taskById.get(link.targetId) || null, state: parsed.state, fromISO: parsed.fromISO });
  }
  const open = mine.filter((ask) => ask.task && ask.task.status === 'active');
  // An unrelated write can only matter through the calendar: an exposure that
  // is about to begin, or an ask whose exposure may have run out.
  if (isOperational && !open.length && !boundaryInside(declared, today, leadEnd)) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const out = [];

  /* Sweep the lead window — stretched to the first day of any open ask that
     lies beyond it (a lead window shortened after the ask was issued). Only
     the three collections the ledger itself reads are handed over, and always
     the whole-workspace view: an owner is entitled to the ask whether or not
     they are the seat holding the keyboard. */
  let end = leadEnd;
  for (const ask of open) if (ask.fromISO > end) end = ask.fromISO;
  const view = { people: draft.people, reportingLines: declared, settings: { ...settings, activeSeatId: null } };
  const horizon = lineHorizonExposures(view, { now, settings: view.settings, endISO: end });
  if (!horizon.ok) {
    if (Array.isArray(ctx.warnings)) ctx.warnings.push(`[${LINE_HORIZON_RULE_ID}] ${horizon.refuseReason}`);
    return out;
  }
  const names = new Map();
  for (const [id, node] of horizon.matrix.nodes) names.set(id, node.name || id);
  const owed = horizon.exposures.filter((exposure) => exposure.from <= leadEnd);
  const exposureByKey = new Map(horizon.exposures.map((exposure) => [exposure.key, exposure]));

  /* 1. Reconcile the open asks against what the ledger reads NOW. */
  const covered = new Set();
  for (const ask of open) {
    const day = ask.fromISO > today ? ask.fromISO : today;
    const stands = horizon.stateOn(ask.personId, day) === ask.state;
    const exposure = exposureByKey.get(`${ask.personId}|${ask.state}|${ask.fromISO}`) || null;
    const sameSeat = !exposure || (exposure.owner.state === 'unique' && exposure.owner.id === ask.task.personId);
    if (stands && sameSeat) {
      covered.add(`${ask.personId}|${ask.state}`);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = stands
      ? `${LINE_HORIZON_CLOSED_PREFIX} the seat that owns this exposure changed; the ask was re-addressed rather than left with a seat that no longer holds it.`
      : `${LINE_HORIZON_CLOSED_PREFIX} the matrix ledger no longer reads this person as ${lineHorizonStateLabel(ask.state).toLowerCase()} from ${ask.fromISO}.`;
    ask.task.updatedAt = nowIso;
    note(ctx, out, 'completed', 'delegation', ask.task.id,
      stands ? 'Closed a forward allocation ask: the owning seat changed.' : `Closed a forward allocation ask: the ${lineHorizonStateLabel(ask.state).toLowerCase()} exposure from ${ask.fromISO} no longer stands.`);
  }

  /* 2. Issue what is owed and not yet asked of the owning seat. */
  const owners = Object.fromEntries(LINE_HORIZON_OWNER_STATE_KEYS.map((key) => [key, 0]));
  const states = { [S.over]: 0, [S.undeclared]: 0, [S.under]: 0 };
  let issued = 0;
  let deferred = 0;
  const linkCtx = { idFactory, todayStr: today, nowIso };
  for (const exposure of owed) {
    owners[exposure.owner.state] += 1;
    states[exposure.state] += 1;
    if (exposure.owner.state !== 'unique' || !exposure.owner.id) continue;
    if (covered.has(`${exposure.personId}|${exposure.state}`)) continue;
    // Asked once of this seat and closed by a person while the exposure stands:
    // that is an answer. Only an ask this rule closed itself may be re-issued.
    const answered = mine.some((ask) => ask.task
      && ask.personId === exposure.personId && ask.state === exposure.state && ask.fromISO === exposure.from
      && ask.task.personId === exposure.owner.id
      && !(ask.task.status === 'done' && String(ask.task.completionNote || '').startsWith(LINE_HORIZON_CLOSED_PREFIX)));
    if (answered) continue;
    if (issued >= LINE_HORIZON_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const dayBefore = addDays(exposure.from, -1);
    const dueOn = dayBefore > today ? dayBefore : today;
    const text = askText(exposure, names, dueOn);
    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: exposure.owner.id,
      title: clip(text.title, 200),
      expectedOutcome: clip(text.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${LINE_HORIZON_RULE_ID} from the forward allocation horizon (#/matrix?panel=horizon). This is a structural reading of declared reporting lines, not a judgement of anyone’s work.`,
      delegatedOn: today,
      dueOn,
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
      sourceType: 'person', sourceId: exposure.personId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: LINE_HORIZON_RULE_ID,
      summary: lineHorizonExposureSummary(exposure.state, exposure.from),
    }, linkCtx);
    // Hierarchy AND matrix roll-up: every roster seat above the owner on ANY
    // line — the closure the matrix graph carries, not the home tree alone.
    const ancestors = [...(horizon.matrix.nodes.get(exposure.owner.id)?.ancestors || [])].sort();
    for (const ancestorId of ancestors) {
      if (!horizon.matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: LINE_HORIZON_RULE_ID,
        summary: 'A forward allocation ask rolls up to this span.',
      }, linkCtx);
    }
    issued += 1;
    note(ctx, out, 'delegated', 'delegation', taskId,
      `Issued a forward allocation ask due ${dueOn}: ${lineHorizonStateLabel(exposure.state).toLowerCase()} from ${exposure.from}.`);
  }
  if (deferred) {
    note(ctx, out, 'deferred', 'workspace', 'matrix-horizon',
      `${deferred} forward allocation ask(s) were not issued in this commit: at most ${LINE_HORIZON_LIMITS.asksPerCommit} are issued at once, and the rest follow on the next write.`);
  }

  /* 3. One identity-free trace per day and reading, so an exposure nobody can
        be asked about (leader-held, no single seat, off the roster) is still
        on the shared ledger and not only on a panel somebody has to open. */
  if (owed.length) {
    const signature = [owed.length, states[S.over], states[S.undeclared], states[S.under], ...LINE_HORIZON_OWNER_STATE_KEYS.map((key) => owners[key])].join('.');
    const key = `horizon|${today}|${leadDays}|${signature}`;
    draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
    if (!draft.matrixMarkers.some((marker) => marker && marker.key === key)) {
      const detail = `${owed.length} forward allocation exposure(s) begin inside the ${leadDays}-day lead window: ${states[S.over]} over-committed, ${states[S.undeclared]} with an undeclared split, ${states[S.under]} under-allocated; ${owners.unique} with one accountable seat, ${owners['leader-held']} held by the workspace leader, ${owners.ambiguous} with no single seat, ${owners['off-roster']} whose owner is off the roster.`;
      draft.matrixMarkers.push({ key, at: nowIso, ruleId: LINE_HORIZON_RULE_ID, kind: 'horizon', detail: clip(detail, 300) });
      if (draft.matrixMarkers.length > LINE_HORIZON_LIMITS.markers) {
        draft.matrixMarkers.splice(0, draft.matrixMarkers.length - LINE_HORIZON_LIMITS.markers);
      }
      note(ctx, out, 'observed', 'workspace', 'matrix-horizon', detail);
    }
  }
  return out;
}

export default lineHorizonRule;
