/**
 * app/core/domain/asgSchema.js — the fail-closed storage contract of the
 * Secondment / Assignment Return & Handover Register (ADR-0262, Schema v214).
 *
 * FOUR COLLECTIONS, ALL EMPTY AT UPGRADE: `asgAssignments`, `asgCovers`,
 * `asgActs` and the rule's `asgMarkers`. Nothing derived is stored — no state,
 * no return day "in force", no timeliness verdict, no coverage gap, no
 * handback completeness, no day count. Each is recomputed on read, because a
 * stored state is a verdict that can disagree with the acts beside it, and the
 * disagreement would surface as a register telling a mid-manager their
 * seconded person came back when the ledger says nobody decided anything.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents an assignment, completes a missing rationale, moves a
 * declared return day, rescues an act that names no assignment, or repairs a
 * contradictory decision chain. A row that cannot be read exactly is DROPPED
 * with a counted warning, and the screen prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. AN ASSIGNMENT carries the person, the two named sides (the home manager
 *      and the host manager), the start day, the declared return day, the
 *      written terms instrument reference and the recording hand. A window
 *      whose return day is not strictly after its start day is DROPPED — that
 *      is not a window. A record whose person is one of its own two sides, or
 *      whose two sides are the same hand, is DROPPED as a nonsense record.
 *      An assignment whose hands are off the roster is KEPT and printed as an
 *      orphan — dropping it would erase a live secondment duty from the record.
 *   2. A DUTY COVER names one duty label and one of three kinds: a named cover
 *      hand, retained-by-home, or uncovered. A named cover with no hand is
 *      DROPPED. A cover naming no live assignment is DROPPED. Coverage is
 *      never read off goals, delegations or the org chart.
 *   3. AN ACT is one of three kinds, in one ledger. A `return-decision` is
 *      `extend` (with a new declared return day strictly after the day in
 *      force), `return`, or `convert`, with a written rationale. A `home-consent`
 *      carries its written basis and is only meaningful once a `convert`
 *      decision is on the chain before it. A `handback` names its side, the
 *      receiving hand and its evidence reference, and is only meaningful once
 *      a `return` or `convert` decision is on the chain before it. The chain
 *      answers the question ONCE: a decision after a non-extend answer, or a
 *      second non-extend answer, is DROPPED. An extend with no new day, or
 *      with a new day that does not move the day in force forward, is DROPPED.
 *      Nothing is re-dated, nothing is repaired.
 *   4. A MARKER is the rule's identity-free observation. It carries the
 *      condition, the assignment reference and the instant. No person, no
 *      manager, no duty label, no day.
 *
 * A NOTE ON WHAT IS NOT DROPPED. An assignment, cover or act whose hands are
 * no longer on the roster is NOT dropped here — the reader prints it as an
 * orphan with its reason, because dropping it would silently delete a live
 * secondment duty from the record. A child row pointing at a parent that does
 * not exist IS dropped: an act cannot be attached to an assignment that was
 * never recorded.
 */

import { dayKey } from '../time.js';
import {
  ASG_ACT_KIND_BY_KEY,
  ASG_ACT_KINDS,
  ASG_BOUNDS,
  ASG_COVER_BY_KEY,
  ASG_DECISION_BY_KEY,
  ASG_DECISION_KEYS,
  ASG_DEFAULTS,
  ASG_LIMITS as L,
  ASG_SETTING_KEYS,
  ASG_SIDE_BY_KEY,
} from './asgRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

export function asgDayKey(value) {
  const candidate = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return DAY_RE.test(candidate) ? candidate : null;
}

export function asgInstant(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function asgShort(value, max = L.shortMax) {
  const candidate = text(value, max + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, max);
}

export function asgDutyLabel(value) {
  const candidate = text(value, L.dutyMax + 40);
  if (candidate.length < L.dutyMin) return null;
  return candidate.slice(0, L.dutyMax);
}

export function asgRationale(value) {
  const candidate = text(value, L.rationaleMax + 40);
  if (candidate.length < L.rationaleMin) return null;
  return candidate.slice(0, L.rationaleMax);
}

export function normalizeAsgAssignments(raw, warnings = []) {
  const out = [];
  const seen = new Set();
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('asgAssignments: dropped non-object row'); continue; }
    const assignmentId = id(row.assignmentId || row.id);
    const personId = id(row.personId);
    const homeManagerId = id(row.homeManagerId);
    const hostManagerId = id(row.hostManagerId);
    const startDay = asgDayKey(row.startDay);
    const declaredReturnDay = asgDayKey(row.declaredReturnDay);
    const termsRef = asgShort(row.termsRef, L.termsMax);
    const note = text(row.note, L.noteMax);
    const recordedById = id(row.recordedById);
    const recordedDay = asgDayKey(row.recordedDay);
    const recordedAt = asgInstant(row.recordedAt);
    if (!assignmentId || !personId || !homeManagerId || !hostManagerId || !startDay || !declaredReturnDay || !termsRef || !recordedById || !recordedDay || !recordedAt) {
      warnings.push('asgAssignments: dropped assignment with missing reference, person, sides, start day, declared return day, terms instrument or recording hand');
      continue;
    }
    if (declaredReturnDay <= startDay) {
      warnings.push(`asgAssignments: dropped assignment ${assignmentId} whose declared return day is not after its start day`);
      continue;
    }
    if (personId === homeManagerId || personId === hostManagerId || homeManagerId === hostManagerId) {
      warnings.push(`asgAssignments: dropped assignment ${assignmentId} whose person is one of its sides or whose sides are the same hand`);
      continue;
    }
    if (seen.has(assignmentId)) { warnings.push(`asgAssignments: dropped duplicate assignment ${assignmentId}`); continue; }
    seen.add(assignmentId);
    out.push({
      assignmentId,
      personId,
      homeManagerId,
      hostManagerId,
      startDay,
      declaredReturnDay,
      termsRef,
      note,
      recordedById,
      recordedDay,
      recordedAt,
    });
  }
  return out;
}

export function normalizeAsgCovers(raw, assignments, warnings = []) {
  const out = [];
  const assignmentIds = new Set(list(assignments).map((a) => a.assignmentId));
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('asgCovers: dropped non-object row'); continue; }
    const coverId = id(row.coverId || row.id);
    const assignmentId = id(row.assignmentId);
    const dutyLabel = asgDutyLabel(row.dutyLabel);
    const coverKind = text(row.coverKind);
    const coverHandId = row.coverHandId === null || row.coverHandId === undefined ? null : id(row.coverHandId);
    const declaredById = id(row.declaredById);
    const declaredDay = asgDayKey(row.declaredDay);
    const declaredAt = asgInstant(row.declaredAt);
    const note = text(row.note, L.noteMax);
    if (!coverId || !assignmentId || !dutyLabel || !ASG_COVER_BY_KEY[coverKind] || !declaredById || !declaredDay || !declaredAt) {
      warnings.push('asgCovers: dropped cover with missing reference, assignment, duty label, known kind or declaring hand');
      continue;
    }
    if (coverKind === 'named-cover' && !coverHandId) {
      warnings.push(`asgCovers: dropped named cover ${coverId} with no cover hand`);
      continue;
    }
    if (coverKind !== 'named-cover' && coverHandId) {
      warnings.push(`asgCovers: dropped cover ${coverId} whose kind does not carry a cover hand`);
      continue;
    }
    if (!assignmentIds.has(assignmentId)) {
      warnings.push(`asgCovers: dropped cover ${coverId} naming no live assignment`);
      continue;
    }
    out.push({ coverId, assignmentId, dutyLabel, coverKind, coverHandId, declaredById, declaredDay, declaredAt, note });
  }
  return out;
}

/**
 * The acts ledger. One pass to sort per assignment, one pass to validate the
 * decision chain in order, one pass to admit consents and handbacks against
 * the chain the decisions left behind. Every drop is counted; nothing is
 * repaired into a shape the record never held.
 */
export function normalizeAsgActs(raw, assignments, warnings = []) {
  const out = [];
  const assignmentIds = new Set(list(assignments).map((a) => a.assignmentId));
  const byAssignment = new Map();
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('asgActs: dropped non-object row'); continue; }
    const actId = id(row.actId || row.id);
    const assignmentId = id(row.assignmentId);
    const kind = text(row.kind);
    if (!actId || !assignmentId || !ASG_ACT_KIND_BY_KEY[kind]) {
      warnings.push('asgActs: dropped act with missing reference, assignment or known kind');
      continue;
    }
    if (!assignmentIds.has(assignmentId)) {
      warnings.push(`asgActs: dropped act ${actId} naming no live assignment`);
      continue;
    }
    if (!byAssignment.has(assignmentId)) byAssignment.set(assignmentId, []);
    byAssignment.get(assignmentId).push({ ...row, actId, assignmentId, kind });
  }
  const assignmentsById = new Map(list(assignments).map((a) => [a.assignmentId, a]));
  const seenActIds = new Set();
  for (const [assignmentId, rows] of byAssignment) {
    const assignment = assignmentsById.get(assignmentId);
    const ordered = [...rows].sort((a, b) => {
      const ka = `${a.day || ''}|${a.at || ''}|${a.actId}`;
      const kb = `${b.day || ''}|${b.at || ''}|${b.actId}`;
      return ka.localeCompare(kb);
    });
    // Chain state while walking in day order.
    let returnDayInForce = assignment.declaredReturnDay;
    let answered = false; // a non-extend decision is on the chain
    let convertOnChain = false;
    for (const row of ordered) {
      if (seenActIds.has(row.actId)) { warnings.push(`asgActs: dropped duplicate act ${row.actId}`); continue; }
      seenActIds.add(row.actId);
      const kind = row.kind;
      const byId = id(row.recordedById);
      const day = asgDayKey(row.day);
      const at = asgInstant(row.at);
      const note = text(row.note, L.noteMax);
      if (kind === 'return-decision') {
        const decisionKind = text(row.decisionKind);
        const rationale = asgRationale(row.rationale);
        const newDeclaredReturnDay = row.newDeclaredReturnDay === null || row.newDeclaredReturnDay === undefined ? null : asgDayKey(row.newDeclaredReturnDay);
        if (!ASG_DECISION_BY_KEY[decisionKind] || !rationale || !byId || !day || !at) {
          warnings.push(`asgActs: dropped return decision ${row.actId} with missing kind, rationale, deciding hand or decided day`);
          continue;
        }
        if (day < assignment.startDay) {
          warnings.push(`asgActs: dropped return decision ${row.actId} decided before the assignment began`);
          continue;
        }
        if (answered) {
          warnings.push(`asgActs: dropped return decision ${row.actId} recorded after the question was answered`);
          continue;
        }
        if (decisionKind === 'extend') {
          if (!newDeclaredReturnDay) {
            warnings.push(`asgActs: dropped extend ${row.actId} with no new declared return day`);
            continue;
          }
          if (newDeclaredReturnDay <= returnDayInForce || newDeclaredReturnDay <= day) {
            warnings.push(`asgActs: dropped extend ${row.actId} that does not move the declared return day forward`);
            continue;
          }
          returnDayInForce = newDeclaredReturnDay;
        } else if (newDeclaredReturnDay) {
          warnings.push(`asgActs: dropped ${decisionKind} decision ${row.actId} carrying a new declared return day`);
          continue;
        }
        if (decisionKind === 'convert') convertOnChain = true;
        if (decisionKind !== 'extend') answered = true;
        out.push({ actId: row.actId, assignmentId, kind, decisionKind, rationale, newDeclaredReturnDay, recordedById: byId, day, at, note });
      } else if (kind === 'home-consent') {
        const basis = asgShort(row.basis, L.rationaleMax) || asgRationale(row.basis);
        const consentById = id(row.consentById);
        if (!basis || !consentById || !byId || !day || !at) {
          warnings.push(`asgActs: dropped home consent ${row.actId} with missing basis, consenting hand or day`);
          continue;
        }
        if (!convertOnChain) {
          warnings.push(`asgActs: dropped home consent ${row.actId} with no convert decision on the chain`);
          continue;
        }
        out.push({ actId: row.actId, assignmentId, kind, basis, consentById, recordedById: byId, day, at, note });
      } else {
        const side = text(row.side);
        const receivedById = id(row.receivedById);
        const evidenceRef = asgShort(row.evidenceRef, L.termsMax);
        if (!ASG_SIDE_BY_KEY[side] || !receivedById || !evidenceRef || !byId || !day || !at) {
          warnings.push(`asgActs: dropped handback ${row.actId} with missing side, receiving hand, evidence reference or day`);
          continue;
        }
        if (!answered && !convertOnChain) {
          warnings.push(`asgActs: dropped handback ${row.actId} with no return or convert decision on the chain`);
          continue;
        }
        out.push({ actId: row.actId, assignmentId, kind, side, receivedById, evidenceRef, recordedById: byId, day, at, note });
      }
    }
  }
  return out;
}

export function normalizeAsgMarkers(raw, warnings = []) {
  const out = [];
  for (const row of list(raw)) {
    if (!isPlainObject(row)) { warnings.push('asgMarkers: dropped non-object row'); continue; }
    const markerId = id(row.markerId || row.id);
    const condition = text(row.condition);
    const assignmentId = id(row.assignmentId);
    const at = asgInstant(row.at || row.createdAt);
    if (!markerId || !condition || !assignmentId || !at) { warnings.push('asgMarkers: dropped marker with missing id, condition, assignment or instant'); continue; }
    out.push({ markerId, condition, assignmentId, at });
  }
  return out;
}

const BOUND_BY_SETTING = {
  [ASG_SETTING_KEYS.privacyFloor]: 'privacyFloor',
  [ASG_SETTING_KEYS.warnHorizonDays]: 'warnHorizonDays',
  [ASG_SETTING_KEYS.handbackHorizonDays]: 'handbackHorizonDays',
};

export function normalizeAsgSettings(raw = {}) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  const auto = source[ASG_SETTING_KEYS.autoPropagate];
  out[ASG_SETTING_KEYS.autoPropagate] = auto === undefined ? ASG_DEFAULTS.autoPropagate : Boolean(auto);
  for (const key of Object.values(ASG_SETTING_KEYS)) {
    if (key === ASG_SETTING_KEYS.autoPropagate) continue;
    // `ASG_BOUNDS` and `ASG_DEFAULTS` are keyed by the SHORT name
    // (`warnHorizonDays`), while the settings object carries the SETTING key
    // (`asgWarnHorizonDays`). The map is the one place they meet — read the
    // default through it, or every horizon silently becomes `undefined` and
    // every warn-horizon comparison falls through to `active`.
    const short = BOUND_BY_SETTING[key];
    const bounds = ASG_BOUNDS[short];
    const num = Math.round(Number(source[key]));
    out[key] = Number.isFinite(num)
      ? Math.min(bounds.max, Math.max(bounds.min, num))
      : ASG_DEFAULTS[short];
  }
  return out;
}

export function asgSettings(state) {
  return normalizeAsgSettings(state?.settings || {});
}

export function asgToday(now) {
  return dayKey(now instanceof Date ? now : new Date(now || Date.now()));
}

export { ASG_ACT_KINDS, ASG_DECISION_KEYS };
