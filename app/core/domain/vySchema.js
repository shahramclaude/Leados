/**
 * app/core/domain/vySchema.js — fail-closed normalizers for the
 * Vroom–Yetton–Jago Decision-Participation Selector (ADR-0230, Schema v183).
 *
 * NOTHING IS REPAIRED. A decision, an answer set or a style record that cannot
 * be read exactly is DROPPED with a counted warning. No diagnostic answer is
 * inferred, defaulted or coerced from structure, title or role. The synthetic
 * `leader` seat is never a decision owner, an answerer or a selector.
 *
 * Leaf module: imports only `vyRegistry.js`.
 */

import {
  VY_LIMITS as L,
  VY_QUESTION_KEYS,
  VY_PER_LINE_KEYS,
  VY_SOLO_DIAGNOSTICS,
  VY_OR_DIAGNOSTICS,
  VY_STYLE_KEYS,
  VY_STYLES,
  VY_TREE_KEYS,
  VY_TREE_VARIANTS,
  VY_QUESTIONS,
  vyQuestion,
  vyStyle,
} from './vyRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_ID = 'leader';
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/* ---------------------------------------------------------------- text/id */

export function vyText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function vyId(value) {
  const candidate = vyText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
}

/**
 * An ACTOR id — a seat reference. May name the reserved workspace apex
 * (`leader`) — the only seat at rank 5 — so it is read with the same bounded
 * text rule but the reserved name is accepted.
 */
export function vyActorId(value) {
  const candidate = vyText(value, L.idMax);
  return ID_RE.test(candidate) ? candidate : null;
}

/** A real calendar day. */
export function vyDay(value) {
  if (typeof value !== 'string') return null;
  const day = value.trim();
  if (!DAY_RE.test(day) || day < L.dayMin || day > L.dayMax) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === day ? day : null;
}

/** A boolean answer: strictly `true` or `false`, never coerced. */
export function vyBool(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/** A closed-vocabulary member, or null. */
export const vyOneOf = (list, value) => (list.includes(value) ? value : null);

/* ------------------------------------------------------------- normalizers */

/**
 * A decision-participation question: one decision context with its tree
 * variant and declared lines. Immutable once declared.
 */
export function normalizeVyDecisions(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.decisions || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = vyId(raw.id);
    const title = vyText(raw.title, L.titleMax);
    const question = vyText(raw.question, L.textMax);
    const declaredById = vyId(raw.declaredById);
    const declaredOn = vyDay(raw.declaredOn);
    const treeVariant = vyOneOf(VY_TREE_KEYS, raw.treeVariant);
    const lineIds = Array.isArray(raw.lineIds)
      ? [...new Set(raw.lineIds.map(vyId).filter(Boolean))].sort()
      : [];
    const withdrawnOn = raw.withdrawnOn ? vyDay(raw.withdrawnOn) : null;
    const reason = vyText(raw.reason, L.reasonMax);
    if (!id || seen.has(id) || title.length < L.titleMin || !question
      || !declaredById || !declaredOn || !treeVariant || !reason
      || reason.length < L.reasonMin) { dropped += 1; continue; }
    if (withdrawnOn && withdrawnOn < declaredOn) { dropped += 1; continue; }
    seen.add(id);
    kept.push({ id, title, question, declaredById, declaredOn, treeVariant, lineIds, withdrawnOn, reason });
  }
  if (dropped) {
    warnings.push(`Vroom–Yetton: refused ${dropped} unreadable, duplicate, or over-cap decision row(s); no tree variant, line or reason was repaired.`);
  }
  return kept;
}

/**
 * Diagnostic answers: one answer set per (decision, line, seat). A per-line
 * diagnostic (q2, q5, q6, q7) is answered under a line; solo diagnostics
 * (q1, q3, q4) are answered once per decision. An answer pointing at a
 * decision that did not survive is an orphan and is dropped.
 */
export function normalizeVyAnswers(value, decisions, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownDecisions = new Set((Array.isArray(decisions) ? decisions : []).map((row) => row.id));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.answers || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = vyId(raw.id);
    const decisionId = vyId(raw.decisionId);
    const answeredById = vyId(raw.answeredById);
    const answeredOn = vyDay(raw.answeredOn);
    const lineId = raw.lineId ? vyId(raw.lineId) : null;
    if (!id || seen.has(id) || !decisionId || !knownDecisions.has(decisionId)
      || !answeredById || !answeredOn) { dropped += 1; continue; }

    const answers = {};
    let answersPresent = false;
    for (const key of VY_QUESTION_KEYS) {
      const rawValue = raw[key];
      if (rawValue === undefined || rawValue === null) continue;
      const bool = vyBool(rawValue);
      if (bool === null) { dropped += 1; continue; }
      answers[key] = bool;
      answersPresent = true;
    }
    if (!answersPresent) { dropped += 1; continue; }

    // Per-line diagnostics must be answered under a line; solo diagnostics
    // must not carry a line (they belong to the decision, not a line).
    for (const key of VY_PER_LINE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(answers, key) && !lineId) { dropped += 1; continue; }
    }
    for (const key of VY_SOLO_DIAGNOSTICS) {
      if (Object.prototype.hasOwnProperty.call(answers, key) && lineId) { dropped += 1; continue; }
    }

    // One answer per (decision, line, seat) — a second answer for the same
    // combination is a duplicate, not an amendment.
    const signature = `${decisionId}|${lineId || ''}|${answeredById}`;
    if (seen.has(signature)) { dropped += 1; continue; }
    seen.add(signature);

    kept.push({ id, decisionId, answeredById, answeredOn, lineId, answers });
  }
  if (dropped) {
    warnings.push(`Vroom–Yetton: refused ${dropped} unreadable, duplicate, orphaned, or over-cap answer row(s); no diagnostic was coerced or inferred.`);
  }
  return kept;
}

/**
 * Style records: the chosen participation style, whether it overrode the
 * recommendation, and the written reason. A grade can later record whether
 * the predicted commitment materialised.
 */
export function normalizeVyStyleRecords(value, decisions, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownDecisions = new Set((Array.isArray(decisions) ? decisions : []).map((row) => row.id));
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.styleRecords || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = vyId(raw.id);
    const decisionId = vyId(raw.decisionId);
    const actorId = vyActorId(raw.actorId);
    const at = vyDay(raw.at);
    const chosenStyle = vyOneOf(VY_STYLE_KEYS, raw.chosenStyle);
    const recommendedStyle = raw.recommendedStyle === null || raw.recommendedStyle === undefined
      ? null : vyOneOf(VY_STYLE_KEYS, raw.recommendedStyle);
    const overrideReason = vyText(raw.overrideReason, L.reasonMax);
    const followUpOn = raw.followUpOn ? vyDay(raw.followUpOn) : null;
    const commitmentMaterialised = raw.commitmentMaterialised === null || raw.commitmentMaterialised === undefined
      ? null : vyBool(raw.commitmentMaterialised);
    if (!id || seen.has(id) || !decisionId || !knownDecisions.has(decisionId)
      || !actorId || !at || !chosenStyle) { dropped += 1; continue; }
    // An override requires a written reason; a non-override must not carry one.
    const isOverride = recommendedStyle !== null && chosenStyle !== recommendedStyle;
    if (isOverride && overrideReason.length < L.reasonMin) { dropped += 1; continue; }
    if (!isOverride && overrideReason.length > 0) { dropped += 1; continue; }
    if (commitmentMaterialised !== null && !followUpOn) { dropped += 1; continue; }
    seen.add(id);
    kept.push({ id, decisionId, actorId, at, chosenStyle, recommendedStyle, overrideReason, followUpOn, commitmentMaterialised });
  }
  if (dropped) {
    warnings.push(`Vroom–Yetton: refused ${dropped} unreadable, duplicate, orphaned, or over-cap style record(s); no override reason or commitment outcome was repaired.`);
  }
  return kept;
}

/**
 * Identity-free markers: one observation per rule run. A marker that cannot be
 * read exactly is dropped.
 */
export function normalizeVyMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = vyText(raw.key, 200);
    const at = vyText(raw.at, 40);
    if (!key || !at || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: vyText(raw.ruleId, 40), kind: vyText(raw.kind, 40), detail: vyText(raw.detail, 300) });
  }
  if (dropped) warnings.push(`Vroom–Yetton markers: dropped ${dropped} unreadable or duplicate observation(s).`);
  return kept;
}

/** Exported label maps for the reader and the panel. */
export const VY_STYLE_LABELS = Object.freeze(Object.fromEntries(VY_STYLES.map((row) => [row.key, row.label])));
export const VY_TREE_LABELS = Object.freeze(Object.fromEntries(VY_TREE_VARIANTS.map((row) => [row.key, row.label])));
export const VY_QUESTION_LABELS = Object.freeze(Object.fromEntries(VY_QUESTIONS.map((row) => [row.key, row.label])));
