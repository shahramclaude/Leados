/**
 * app/core/domain/assuranceSchema.js — fail-closed normalizers for ADR-0232
 * (Assurance Finding & Remediation Register, `RULE-AFR-01`).
 *
 * A malformed finding or act is DROPPED with a counted warning, and nothing is
 * repaired: no severity, owner, target day, decision, evidence reference or
 * instant is invented. An act resolves only through a finding that survived
 * normalization, so no act can outlive the record it belongs to. The synthetic
 * workspace leader is never a declarant, an accountable holder, a remediation
 * owner, a verifier or an acceptor: the kernel drops those rows by design, and
 * a write that would vanish on reload is refused now instead.
 *
 * The per-kind raw timestamp key is carried THROUGH the loader's output beside
 * the uniform `at` read timestamp (`assignedAt`/`assertedAt`/`verifiedAt`/
 * `acceptedAt`), so the loader's output is a valid stored row. A loader that
 * refused its own output would silently erase a real assignment, assertion,
 * verification or acceptance on the next reload.
 */

import { dayKey } from '../time.js';
import {
  AFR_ACT_KINDS,
  AFR_DECISIONS,
  AFR_LIMITS as L,
  AFR_MARKER_KIND,
  AFR_RULE_ID,
  AFR_SEVERITY_KEYS,
  AFR_SOURCE_KEYS,
} from './assuranceRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const afrText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

const afrId = (value) => {
  const candidate = afrText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function afrInstant(value) {
  const raw = afrText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function afrDay(value) {
  if (typeof value !== 'string') return null;
  const key = dayKey(value.trim());
  return key && key >= L.dayMin && key <= L.dayMax && key === value.trim() ? key : null;
}

/** A finding's declared reference field — a control, a scope or a criteria. */
const afrRef = (value) => {
  const text = afrText(value, L.refMax + 20);
  return text.length >= L.refMin ? text.slice(0, L.refMax) : null;
};

/**
 * The accountable lines. Each row is one line's accountability: the person who
 * holds it and the declared line they hold it on. Distinct pairs, and a line
 * appears once — the same line named twice would double its own roll-up.
 */
function normalizeAccountable(value) {
  if (!Array.isArray(value) || value.length < L.accountableMin || value.length > L.accountableMax) return null;
  const rows = [];
  const seenPairs = new Set();
  const seenLines = new Set();
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;
    const personId = afrId(raw.personId);
    const lineId = afrId(raw.lineId);
    if (!personId || !lineId) return null;
    const pair = `${personId}|${lineId}`;
    if (seenPairs.has(pair) || seenLines.has(lineId)) return null;
    seenPairs.add(pair);
    seenLines.add(lineId);
    rows.push({ personId, lineId });
  }
  return rows;
}

/** Declared findings. Malformed, duplicate or over-cap rows are dropped and counted. */
export function normalizeFindings(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.findings || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = afrId(raw.id);
    const controlRef = afrRef(raw.controlRef);
    const scopeRef = afrRef(raw.scopeRef);
    const criteriaRef = afrRef(raw.criteriaRef);
    const source = AFR_SOURCE_KEYS.includes(raw.source) ? raw.source : null;
    const severity = AFR_SEVERITY_KEYS.includes(raw.severity) ? raw.severity : null;
    const statement = afrText(raw.statement, L.textMax);
    const accountable = normalizeAccountable(raw.accountable);
    const declaredById = afrId(raw.declaredById);
    const openedOn = afrDay(raw.openedOn);
    const remediationDueOn = afrDay(raw.remediationDueOn);
    const verifyDueOn = afrDay(raw.verifyDueOn);
    const createdAt = afrInstant(raw.createdAt);
    if (!id || seenIds.has(id) || !controlRef || !scopeRef || !criteriaRef || !source || !severity
      || statement.length < L.textMin || !accountable || !declaredById
      || !openedOn || !remediationDueOn || !verifyDueOn || !createdAt) {
      dropped += 1;
      continue;
    }
    const remediationDays = (Date.parse(`${remediationDueOn}T00:00:00.000Z`) - Date.parse(`${openedOn}T00:00:00.000Z`)) / DAY_MS;
    const verifyDays = (Date.parse(`${verifyDueOn}T00:00:00.000Z`) - Date.parse(`${remediationDueOn}T00:00:00.000Z`)) / DAY_MS;
    if (!(remediationDays >= L.remediationMinDays && remediationDays <= L.remediationMaxDays)) { dropped += 1; continue; }
    if (!(verifyDays >= L.verificationMinDays && verifyDays <= L.verificationMaxDays)) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({
      id,
      controlRef,
      scopeRef,
      criteriaRef,
      source,
      severity,
      statement,
      accountable,
      declaredById,
      openedOn,
      remediationDueOn,
      verifyDueOn,
      createdAt,
    });
  }
  if (dropped) {
    warnings.push(`Assurance findings: refused ${dropped} unreadable, duplicate, or over-cap row(s); no severity, source, accountable line, owner or date was repaired.`);
  }
  return kept;
}

/**
 * One act. Each kind carries the raw timestamp key it is read by, and every
 * kind's output carries that key through beside the uniform `at`.
 */
function normalizeAct(raw) {
  const id = afrId(raw.id);
  const findingId = afrId(raw.findingId);
  const actorId = afrId(raw.actorId);
  const kind = AFR_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !findingId || !actorId || !kind) return null;

  if (kind === 'accept') {
    const reason = afrText(raw.reason, L.textMax);
    const reviewOn = afrDay(raw.reviewOn);
    const acceptedAt = afrInstant(raw.acceptedAt);
    if (reason.length < L.textMin || !reviewOn || !acceptedAt) return null;
    if (raw.lineHolderId !== undefined && raw.lineHolderId !== null) return null;
    if (raw.lineId !== undefined && raw.lineId !== null) return null;
    return { id, findingId, actorId, kind, reason, reviewOn, acceptedAt, at: acceptedAt };
  }

  // The three per-line acts all name the accountable line they were made on.
  const lineHolderId = afrId(raw.lineHolderId);
  const lineId = afrId(raw.lineId);
  if (!lineHolderId || !lineId) return null;

  if (kind === 'assign') {
    const ownerId = afrId(raw.ownerId);
    const dueOn = afrDay(raw.dueOn);
    const note = afrText(raw.note, L.textMax);
    const assignedAt = afrInstant(raw.assignedAt);
    if (!ownerId || !dueOn || note.length < L.textMin || !assignedAt) return null;
    return { id, findingId, actorId, kind, lineHolderId, lineId, ownerId, dueOn, note, assignedAt, at: assignedAt };
  }
  if (kind === 'assert') {
    const changeText = afrText(raw.changeText, L.textMax);
    const evidenceRef = afrRef(raw.evidenceRef);
    const assertedAt = afrInstant(raw.assertedAt);
    if (changeText.length < L.textMin || !evidenceRef || !assertedAt) return null;
    return { id, findingId, actorId, kind, lineHolderId, lineId, changeText, evidenceRef, assertedAt, at: assertedAt };
  }
  const decision = AFR_DECISIONS.includes(raw.decision) ? raw.decision : null;
  const methodText = afrText(raw.methodText, L.textMax);
  const verifiedAt = afrInstant(raw.verifiedAt);
  if (!decision || methodText.length < L.textMin || !verifiedAt) return null;
  return { id, findingId, actorId, kind, lineHolderId, lineId, decision, methodText, verifiedAt, at: verifiedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at a finding that did not survive normalization. Ordering, authority and
 * independence are decided later by the reader, in chronological order.
 */
export function normalizeFindingActs(value, findings, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(findings.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.findingId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) {
    warnings.push(`Assurance finding acts: refused ${dropped} unreadable, duplicate, orphaned, or over-cap row(s); no owner, assertion, verification or acceptance was repaired.`);
  }
  return kept;
}

/**
 * Rule markers — the identity-free observations `RULE-AFR-01` writes when the
 * record owes an ask and nobody on the reporting graph can be asked. Append-only
 * and keyed, so a scan never files the same observation twice. A marker carries
 * no person id by construction.
 */
export function normalizeFindingMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenKeys = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.markers || !isPlainObject(raw)) { dropped += 1; continue; }
    const key = afrText(raw.key, 200);
    const at = afrInstant(raw.at);
    const detail = afrText(raw.detail, 300);
    if (!key || seenKeys.has(key) || !at || detail.length < L.textMin) { dropped += 1; continue; }
    seenKeys.add(key);
    kept.push({ key, at, ruleId: afrText(raw.ruleId, 40) || AFR_RULE_ID, kind: afrText(raw.kind, 40) || AFR_MARKER_KIND, detail });
  }
  if (dropped) {
    warnings.push(`Assurance finding markers: refused ${dropped} unreadable, duplicate, or over-cap row(s); no observation was repaired.`);
  }
  return kept;
}
