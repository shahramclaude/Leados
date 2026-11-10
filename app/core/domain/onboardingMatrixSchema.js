/**
 * app/core/domain/onboardingMatrixSchema.js — fail-closed normalizers for Matrix
 * Onboarding Completeness (ADR-0150, Schema v125).
 *
 * WHAT IS STORED, AND WHERE
 * -------------------------
 * ONE new top-level collection, `onboardingLineBriefs`, holding one row per
 * DATED HUMAN STATEMENT about one line's onboarding of one person:
 *
 *   { id, planId, personId, lineKey, lineRole, lineKind, managerId,
 *     outcome: 'brief' | 'declined', declaredOn, declaredBySeatId,
 *     scope, firstWork, stakeholders[], reason,
 *     domains[], decisionRight, criteria,
 *     acknowledgedOn, acknowledgedBySeatId, acknowledgement }
 *
 * `domains` / `decisionRight` / `criteria` are the OPTIONAL ADR-0153 role marks:
 * the closed-lexicon accountability domains the line puts on the person, the
 * closed three-step decision right the person holds on this line, and the
 * closed three-step standing of this line's success criteria. They are the only
 * fields any other line can be compared against, they are declared by the line
 * that wrote the brief or they do not exist, and every unknown value is dropped
 * (with a printed warning) rather than coerced.
 *
 * plus `onboardingLineBriefMarkers`, which is `RULE-ONB-01`'s idempotency ledger.
 *
 * WHY ON THE BRIEF AND NOT ON THE PLAN
 * ------------------------------------
 * A brief is a different human's act from the person who owns the plan, and it
 * must survive a plan edit, a plan reopen and a plan replacement. Hanging it off
 * the plan row would let the home manager's edit silently re-scope a project
 * manager's words. It is also the reason a RE-BRIEF is a NEW ROW rather than an
 * overwrite: the earlier statement is history, and the person's acknowledgement of
 * it is a fact about a text that no longer stands.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a line state, an overdue flag, a verdict or any count. Every one is DERIVED
 *    on read from the dated briefs plus the live matrix and the plan's start date,
 *    so a printed state cannot drift from the record that produced it.
 *  - the lines themselves. Which lines were in force is read from the matrix
 *    engine every time; copying it onto a brief would let a withdrawn line keep
 *    claiming an onboarding obligation.
 *  - an acknowledgement at upgrade time, or an acknowledgement of a brief nobody
 *    wrote. Both would be words nobody said.
 *
 * A malformed row is DROPPED with a printed warning, never repaired.
 */

import {
  ONBOARDING_MATRIX_BOUNDS,
  ONBOARDING_MATRIX_DEFAULTS,
  ONBOARDING_MATRIX_LIMITS,
} from './onboardingMatrixRegistry.js';
import {
  ROLE_CLARITY_DOMAIN_KEYS,
  ROLE_CLARITY_DECISION_RIGHTS,
  ROLE_CLARITY_CRITERIA,
  ROLE_CLARITY_LIMITS,
} from './roleClarityRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value) {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value.trim()) ? value.trim() : null;
}

function day(value) {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function clampInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The two declared windows. Both printed, both clamped, neither fitted. */
export function normalizeOnboardingMatrixSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    onboardingBriefDays: clampInt(
      source.onboardingBriefDays,
      ONBOARDING_MATRIX_BOUNDS.briefDays,
      ONBOARDING_MATRIX_DEFAULTS.briefDays,
    ),
    onboardingAcknowledgeDays: clampInt(
      source.onboardingAcknowledgeDays,
      ONBOARDING_MATRIX_BOUNDS.acknowledgeDays,
      ONBOARDING_MATRIX_DEFAULTS.acknowledgeDays,
    ),
  };
}

export const ONBOARDING_MATRIX_DEFAULTS_RESOLVED = Object.freeze(normalizeOnboardingMatrixSettings({}));

function normalizeStakeholders(value, warnings, rowId) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const name = text(raw && typeof raw === 'object' ? raw.name : raw, ONBOARDING_MATRIX_LIMITS.stakeholderChars);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= ONBOARDING_MATRIX_LIMITS.stakeholders) break;
  }
  if (Array.isArray(value) && value.length > out.length) {
    warnings.push(`Onboarding line briefs: ${value.length - out.length} stakeholder(s) on brief ${rowId} were blank, repeated or over the cap and were dropped.`);
  }
  return out;
}

/**
 * ADR-0153 (Schema v128): the OPTIONAL structured role marks a brief may carry.
 * These are the ONLY fields of a brief any other line can be compared against,
 * and they are declared by the line that wrote the brief or they do not exist.
 * Every one is fail-closed and independent:
 *
 *   domains      a set of closed-lexicon accountability-domain keys (deduplicated,
 *                unknown keys dropped with a printed warning, capped).
 *   decisionRight  one of `decides` / `advises` / `informed`. An unknown value is
 *                DROPPED to absent (never coerced): a decision right nobody
 *                declared is not a right the line holds.
 *   criteria     one of `written` / `verbal` / `unstated`. Same rule.
 *
 * A brief with NO marks of any kind is still a valid brief — it is simply not
 * comparable, and the Role Clarity lens reads the line as `unscoped-line` and
 * refuses the comparison. Dropping the brief would destroy a manager's words,
 * which this module never does; ignoring undeclared marks would invent them,
 * which it never does either.
 */
const DECISION_RIGHT_KEYS = new Set(ROLE_CLARITY_DECISION_RIGHTS.map((r) => r.key));
const CRITERIA_KEYS = new Set(ROLE_CLARITY_CRITERIA.map((c) => c.key));

export function normalizeRoleMarks(raw, warnings, rowId = 'brief') {
  const out = { domains: [], decisionRight: '', criteria: '' };
  if (!isPlainObject(raw)) return out;
  const seen = new Set();
  for (const value of Array.isArray(raw.domains) ? raw.domains : []) {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!key) continue;
    if (!ROLE_CLARITY_DOMAIN_KEYS.includes(key)) {
      warnings.push(`Role clarity: dropped the unknown accountability domain “${key}” on ${rowId}; the lexicon is closed and nothing is guessed into it.`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.domains.push(key);
    if (out.domains.length >= ROLE_CLARITY_LIMITS.domainsPerBrief) break;
  }
  const right = typeof raw.decisionRight === 'string' ? raw.decisionRight.trim().toLowerCase() : '';
  if (right) {
    if (DECISION_RIGHT_KEYS.has(right)) out.decisionRight = right;
    else warnings.push(`Role clarity: dropped the unknown decision right “${right}” on ${rowId}; the scale is closed (decides / advises / informed).`);
  }
  const criteria = typeof raw.criteria === 'string' ? raw.criteria.trim().toLowerCase() : '';
  if (criteria) {
    if (CRITERIA_KEYS.has(criteria)) out.criteria = criteria;
    else warnings.push(`Role clarity: dropped the unknown criteria standing “${criteria}” on ${rowId}; the standing is closed (written / verbal / unstated).`);
  }
  return out;
}

function normalizeBrief(raw, warnings) {
  if (!isPlainObject(raw)) {
    warnings.push('Onboarding line briefs: dropped a row that was not an object.');
    return null;
  }
  const rowId = id(raw.id);
  const planId = id(raw.planId);
  const personId = id(raw.personId);
  const lineKey = id(raw.lineKey);
  const managerId = id(raw.managerId);
  const declaredOn = day(raw.declaredOn);
  const outcome = raw.outcome === 'declined' ? 'declined' : raw.outcome === 'brief' || raw.outcome === undefined ? 'brief' : null;
  if (!rowId || !planId || !personId || !lineKey || !managerId || !declaredOn || !outcome) {
    warnings.push('Onboarding line briefs: dropped a row missing its plan, person, line, manager, date or outcome. No statement was inferred.');
    return null;
  }
  const scope = text(raw.scope, ONBOARDING_MATRIX_LIMITS.scopeChars);
  const reason = text(raw.reason, ONBOARDING_MATRIX_LIMITS.reasonChars);
  // A brief must SAY something. A blank brief would render as "this line said
  // nothing", which is indistinguishable from the line never speaking — the exact
  // collapse this module exists to prevent.
  if (outcome === 'brief' && scope.length < 8) {
    warnings.push('Onboarding line briefs: dropped a brief with no written scope. A line that said nothing is not a line that agreed to anything.');
    return null;
  }
  // A decline is an ANSWER and must carry a reason. An unexplained refusal is not
  // a record of judgement and would read as a silent gap with a nicer colour.
  if (outcome === 'declined' && reason.length < 8) {
    warnings.push('Onboarding line briefs: dropped a decline with no stated reason; an unexplained refusal is not a record of judgement.');
    return null;
  }
  const acknowledgedOn = day(raw.acknowledgedOn);
  // ADR-0153: the optional structured role marks. Only a brief (an outcome this
  // module reconciles) can carry them; a decline carries none, exactly as it
  // carries no acknowledgement.
  const marks = outcome === 'brief' ? normalizeRoleMarks(raw, warnings, rowId) : { domains: [], decisionRight: '', criteria: '' };
  return {
    id: rowId,
    planId,
    personId,
    lineKey,
    lineRole: raw.lineRole === 'primary' ? 'primary' : 'secondary',
    lineKind: text(raw.lineKind, 40) || '',
    managerId,
    outcome,
    declaredOn,
    declaredBySeatId: id(raw.declaredBySeatId),
    // WHO recorded it: the line's manager's own seat, or the local operator
    // capturing a statement made outside the workspace. Printed, never disguised
    // as authentication — the seat is a workflow declaration, not an identity.
    declaredSource: raw.declaredSource === 'operator' ? 'operator' : 'manager',
    scope: outcome === 'brief' ? scope : '',
    firstWork: outcome === 'brief' ? text(raw.firstWork, ONBOARDING_MATRIX_LIMITS.firstWorkChars) : '',
    stakeholders: outcome === 'brief' ? normalizeStakeholders(raw.stakeholders, warnings, rowId) : [],
    domains: marks.domains,
    decisionRight: marks.decisionRight,
    criteria: marks.criteria,
    reason: outcome === 'declined' ? reason : '',
    // An acknowledgement of a DECLINE is meaningless: there is nothing about the
    // job to acknowledge. It is cleared rather than repaired into a claim.
    acknowledgedOn: outcome === 'brief' ? acknowledgedOn : null,
    acknowledgedBySeatId: outcome === 'brief' && acknowledgedOn ? id(raw.acknowledgedBySeatId) : null,
    acknowledgementSource: outcome === 'brief' && acknowledgedOn && raw.acknowledgementSource === 'operator' ? 'operator' : 'person',
    acknowledgement: outcome === 'brief' ? text(raw.acknowledgement, ONBOARDING_MATRIX_LIMITS.acknowledgementChars) : '',
  };
}

/**
 * Bounded and deduplicated by row id. Per (plan, line) the OLDEST rows are dropped
 * past the cap — the current statement and its recent predecessors are what a
 * leader needs; the count of dropped rows is warned, never silently lost.
 */
export function normalizeOnboardingLineBriefs(value, warnings = []) {
  const rows = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const row = normalizeBrief(raw, warnings);
    if (!row) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.planId}|${row.lineKey}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const trimmed = [];
  const keptFromFront = new Map();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const key = `${row.planId}|${row.lineKey}`;
    const kept = keptFromFront.get(key) || 0;
    if (kept >= ONBOARDING_MATRIX_LIMITS.briefs) continue;
    keptFromFront.set(key, kept + 1);
    trimmed.push(row);
  }
  trimmed.reverse();
  for (const [key, n] of counts) {
    if (n > ONBOARDING_MATRIX_LIMITS.briefs) {
      warnings.push(`Onboarding line briefs: ${n - ONBOARDING_MATRIX_LIMITS.briefs} outdated brief(s) for one line were dropped past the ${ONBOARDING_MATRIX_LIMITS.briefs}-row cap.`);
    }
    void key;
  }
  return trimmed;
}

/** RULE-ONB-01's idempotency ledger. Malformed markers are dropped silently: a marker is a guard, not a record. */
export function normalizeOnboardingLineBriefMarkers(value, warnings = []) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    if (!isPlainObject(raw)) continue;
    const key = text(raw.key, 200);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: text(raw.kind, 40) || 'obligation',
      summary: text(raw.summary, 280),
      at: text(raw.at, 40) || null,
    });
    if (out.length >= ONBOARDING_MATRIX_LIMITS.markers) {
      warnings.push(`Onboarding line briefs: rule markers were truncated to the last ${ONBOARDING_MATRIX_LIMITS.markers}. Earlier guards are no longer retained.`);
      break;
    }
  }
  return out;
}
