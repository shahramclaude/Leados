/**
 * app/core/domain/domainSenseSchema.js — fail-closed normalizers for ADR-0228.
 *
 * A malformed decision or act is dropped with a counted warning; nothing is
 * repaired. No panel, owner, deadline, basis or mode is invented. The synthetic
 * `leader` seat is never a panel member, owner or actor.
 */

import { DSN_ACT_KINDS, DSN_BASIS_KINDS, DSN_DOMAIN_KEYS, DSN_LIMITS as L, DSN_MODE_KEYS } from './domainSenseRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const RESERVED_ID = 'leader';
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const dsnText = (value, max = L.textMax) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
};

export const dsnId = (value) => {
  const candidate = dsnText(value, 120);
  return ID_RE.test(candidate) && candidate !== RESERVED_ID ? candidate : null;
};

export function dsnInstant(value) {
  const raw = dsnText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const dsnNumber = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : null);

function normalizePanel(value) {
  if (!Array.isArray(value) || value.length < L.panelMin || value.length > L.panelMax) return null;
  const seen = new Set();
  const rows = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;
    const memberId = dsnId(raw.memberId);
    const lineId = dsnId(raw.lineId);
    if (!memberId || !lineId || seen.has(memberId)) return null;
    seen.add(memberId);
    rows.push({ memberId, lineId });
  }
  return rows.sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
}

/** Declared decisions. Malformed or duplicate rows are dropped and counted. */
export function normalizeDecisions(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.decisions || !isPlainObject(raw)) { dropped += 1; continue; }
    const id = dsnId(raw.id);
    const title = dsnText(raw.title, L.titleMax);
    const ownerId = dsnId(raw.ownerId);
    const panel = normalizePanel(raw.panel);
    const openedAt = dsnInstant(raw.openedAt);
    const senseByAt = dsnInstant(raw.senseByAt);
    if (!id || seenIds.has(id) || title.length < L.titleMin || !ownerId || !panel || !openedAt || !senseByAt) {
      dropped += 1;
      continue;
    }
    const windowDays = (Date.parse(senseByAt) - Date.parse(openedAt)) / DAY_MS;
    if (!(windowDays >= L.senseMinDays && windowDays <= L.senseMaxDays)) { dropped += 1; continue; }
    seenIds.add(id);
    kept.push({ id, title, ownerId, panel, openedAt, senseByAt });
  }
  if (dropped) warnings.push(`Decision-domain sensing: refused ${dropped} unreadable, duplicate, or over-cap decision row(s); no panel, owner, deadline or wording was repaired.`);
  return kept;
}

/**
 * Basis normalizer. Each basis kind carries exactly the fields its evidence
 * needs. A basis that is malformed is an unreadable act (dropped). A basis that
 * is well-formed but does not support the stated domain is a REFUSAL, decided
 * later by the reader, and is printed.
 */
function normalizeBasis(raw, assessedAt) {
  if (!isPlainObject(raw) || !DSN_BASIS_KINDS.includes(raw.kind)) return null;
  if (raw.kind === 'precedent') {
    const cases = dsnNumber(raw.cases, L.precedentMin, L.precedentMax);
    const note = dsnText(raw.note, L.textMax);
    return cases === null || note.length < L.textMin ? null : { kind: 'precedent', cases, note };
  }
  if (raw.kind === 'analysis') {
    const analysisRef = dsnText(raw.analysisRef, L.refMax);
    return analysisRef.length < L.refMin ? null : { kind: 'analysis', analysisRef };
  }
  if (raw.kind === 'probe') {
    const probes = dsnNumber(raw.probes, L.probeMin, L.probeMax);
    const observed = dsnText(raw.observed, L.textMax);
    return probes === null || observed.length < L.textMin ? null : { kind: 'probe', probes, observed };
  }
  if (raw.kind === 'onset') {
    const onsetAt = dsnInstant(raw.onsetAt);
    if (!onsetAt || Date.parse(onsetAt) > Date.parse(assessedAt)) return null;
    const note = dsnText(raw.note, L.textMax);
    return note.length < L.textMin ? null : { kind: 'onset', onsetAt, note };
  }
  const note = dsnText(raw.note, L.textMax);
  return note.length < L.textMin ? null : { kind: 'unsorted', note };
}

function normalizeAct(raw) {
  const id = dsnId(raw.id);
  const decisionId = dsnId(raw.decisionId);
  const actorId = dsnId(raw.actorId);
  const kind = DSN_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!id || !decisionId || !actorId || !kind) return null;
  if (kind === 'assess') {
    const lineId = dsnId(raw.lineId);
    const domain = DSN_DOMAIN_KEYS.includes(raw.domain) ? raw.domain : null;
    // The actions store the timestamp under `at`; stored fixtures and the
    // kernel tests use `assessedAt`. Accept either, never invent one.
    const assessedAt = dsnInstant(raw.at ?? raw.assessedAt);
    if (!lineId || !domain || !assessedAt) return null;
    const basis = normalizeBasis(raw.basis, assessedAt);
    if (!basis) return null;
    return { id, decisionId, actorId, kind, lineId, domain, basis, at: assessedAt };
  }
  const mode = DSN_MODE_KEYS.includes(raw.mode) ? raw.mode : null;
  const rationale = dsnText(raw.rationale, L.textMax);
  const committedAt = dsnInstant(raw.at ?? raw.committedAt);
  if (!mode || rationale.length < L.textMin || !committedAt) return null;
  return { id, decisionId, actorId, kind, mode, rationale, at: committedAt };
}

/**
 * Acts. An act is dropped (counted) when it is malformed, duplicated, or points
 * at a decision that did not survive normalization. Authority and the basis
 * check are decided later by the reader, in chronological order.
 */
export function normalizeDecisionActs(value, decisions, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const knownIds = new Set(decisions.map((row) => row.id));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const raw of list) {
    if (kept.length >= L.acts || !isPlainObject(raw)) { dropped += 1; continue; }
    const act = normalizeAct(raw);
    if (!act || seenIds.has(act.id) || !knownIds.has(act.decisionId)) { dropped += 1; continue; }
    seenIds.add(act.id);
    kept.push(act);
  }
  if (dropped) warnings.push(`Decision-domain sensing acts: refused ${dropped} unreadable, duplicate, orphaned, or over-cap row(s); no reading or commitment was repaired.`);
  return kept;
}
