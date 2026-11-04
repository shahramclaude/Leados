/**
 * app/core/domain/envoySchema.js — fail-closed normalizers for the Federated
 * Envoy (`#/envoy`, ADR-0085).
 *
 * Two rules, applied without exception:
 *
 *  1. **A malformed packet row is dropped, with a warning** — never coerced
 *     into a half-valid record that looks like it was verified. An ingested
 *     packet is a governance claim about another installation, so a row this
 *     build cannot fully account for is not a row it keeps.
 *  2. **A payload field outside the declared whitelist is discarded**, not
 *     stored "for later". A foreign workspace cannot write an undeclared key
 *     into this one, and it cannot choose a wider disclosure class than the
 *     projection it was built through.
 *
 * Settings clamp to declared bounds; a non-numeric value is treated as "not
 * answered" and receives the default rather than silently becoming 0 (0 would
 * mean "disabled", which is a decision, not a typo).
 */

import {
  ENVOY_ARTEFACT_STATUSES,
  ENVOY_CLASSES,
  ENVOY_DEFAULTS,
  ENVOY_BOUNDS,
  ENVOY_DIRECTIONS,
  ENVOY_FIELDS,
  ENVOY_KINDS,
  ENVOY_LIMITS,
  ENVOY_STATUSES,
  classRank,
} from './envoyRegistry.js';



const HEX_RE = /^[0-9a-f]{8,64}$/i;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(v, max = 240) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function intOrNull(v, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return Math.min(max, Math.max(min, rounded));
}

function dayOrNull(v) {
  const s = str(v, 10);
  if (!ISO_DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

function clampInt(v, [lo, hi], fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function boolOr(v, fallback) {
  if (typeof v === 'boolean') return v;
  return fallback;
}

/* ------------------------------------------------------------------ settings */

export function normalizeEnvoySettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    envoyMaxItems: clampInt(s.envoyMaxItems, ENVOY_BOUNDS.envoyMaxItems, ENVOY_DEFAULTS.envoyMaxItems),
    envoyRequireKeyedSignature: boolOr(s.envoyRequireKeyedSignature, ENVOY_DEFAULTS.envoyRequireKeyedSignature),
    envoyDivergenceReviewDays: clampInt(s.envoyDivergenceReviewDays, ENVOY_BOUNDS.envoyDivergenceReviewDays, ENVOY_DEFAULTS.envoyDivergenceReviewDays),
    envoyAttestationRiskFloorPct: clampInt(s.envoyAttestationRiskFloorPct, ENVOY_BOUNDS.envoyAttestationRiskFloorPct, ENVOY_DEFAULTS.envoyAttestationRiskFloorPct),
    envoyAutoPropagate: boolOr(s.envoyAutoPropagate, ENVOY_DEFAULTS.envoyAutoPropagate),
  };
}

export function envoyConventions(rawSettings) {
  const settings = normalizeEnvoySettings(rawSettings);
  return {
    ...settings,
    engineVersion: 'federated-envoy-2026.11-v1',
    itemFloor: ENVOY_LIMITS.items,
    textChars: ENVOY_LIMITS.textChars,
  };
}

/* ------------------------------------------------------------------ payloads */

/**
 * Project one record through the whitelist at a receiving disclosure class.
 * @returns {{fields: object, cls: string|null, dropped: string[]}}
 */
export function projectFields(kind, values, maxClass) {
  const spec = ENVOY_FIELDS[kind] || null;
  const dropped = [];
  if (!spec) return { fields: {}, cls: null, dropped: ['kind'] };
  const ceiling = classRank(maxClass);
  const out = {};
  let cls = 'aggregate';
  for (const field of spec) {
    if (classRank(field.cls) > ceiling) continue; // never widened into existence
    const raw = values ? values[field.key] : undefined;
    if (raw === undefined || raw === null || raw === '') continue;
    let value = null;
    if (field.type === 'text') {
      const s = str(raw, field.max);
      if (s) value = s;
    } else if (field.type === 'int') {
      const n = intOrNull(raw, field.min, field.max);
      if (n !== null) value = n;
    } else if (field.type === 'day') {
      value = dayOrNull(raw);
    }
    if (value === null) {
      dropped.push(field.key);
      continue;
    }
    out[field.key] = value;
    if (classRank(field.cls) > classRank(cls)) cls = field.cls;
  }
  const any = Object.keys(out).length > 0;
  return { fields: out, cls: any ? cls : null, dropped };
}

/**
 * Normalize an untrusted payload already labelled with a class. The declared
 * class is re-derived from the fields that survived, so a sender cannot claim
 * `aggregate` while shipping a title.
 */
export function normalizeEnvoyPayload(kind, fields, declaredClass, warnings = [], itemId = '') {
  if (!ENVOY_KINDS.includes(kind)) {
    warnings.push(`Envoy: dropped an artefact of unknown kind “${str(kind, 40)}”${itemId ? ` (${itemId})` : ''}.`);
    return null;
  }
  if (!ENVOY_CLASSES.includes(declaredClass)) {
    warnings.push(`Envoy: dropped an artefact with an unrecognised disclosure class${itemId ? ` (${itemId})` : ''}.`);
    return null;
  }
  const projected = projectFields(kind, fields && typeof fields === 'object' ? fields : {}, declaredClass);
  if (!projected.cls) {
    warnings.push(`Envoy: dropped an artefact whose payload did not survive its own field whitelist${itemId ? ` (${itemId})` : ''}.`);
    return null;
  }
  return { fields: projected.fields, cls: projected.cls };
}

/* ------------------------------------------------------------------- packets */

function normalizeFailure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const code = str(raw.code, 40);
  if (!code) return null;
  return {
    code,
    itemId: str(raw.itemId, 80) || null,
    detail: str(raw.detail, 240),
  };
}

function normalizeAttestation(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const byKind = {};
  for (const kind of ENVOY_KINDS) {
    const n = intOrNull(a.byKind && a.byKind[kind], 0, 10_000);
    byKind[kind] = n === null ? 0 : n;
  }
  const money = Array.isArray(a.valueAtStake) ? a.valueAtStake : [];
  const valueAtStake = [];
  for (const row of money.slice(0, 8)) {
    if (!row || typeof row !== 'object') continue;
    const currency = str(row.currency, 3).toUpperCase();
    const amount = intOrNull(row.amount, 0, 1_000_000_000_000);
    if (!/^[A-Z]{3}$/.test(currency) || amount === null) continue;
    valueAtStake.push({ currency, amount });
  }
  return {
    items: intOrNull(a.items, 0, 10_000) ?? 0,
    byKind,
    openCritical: intOrNull(a.openCritical, 0, 10_000) ?? 0,
    oldestOpenDays: intOrNull(a.oldestOpenDays, 0, 3650),
    valueAtStake,
  };
}

function normalizePacketItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = str(raw.kind, 40);
  if (!ENVOY_KINDS.includes(kind)) return null;
  const originId = str(raw.originId, 120);
  const contentHash = str(raw.contentHash, 64).toLowerCase();
  const cls = str(raw.cls, 20);
  if (!originId || !HEX_RE.test(contentHash) || !ENVOY_CLASSES.includes(cls)) return null;
  const fields = raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? raw.fields : {};
  return {
    kind,
    originId,
    revision: intOrNull(raw.revision, 0, 1_000_000),
    cls,
    contentHash,
    fields,
  };
}

/** One packet ledger row. Anything unaccountable is dropped with a warning. */
export function normalizeExchangePacket(raw, warnings = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = str(raw.id, 120);
  const packetId = str(raw.packetId, 64).toLowerCase();
  const direction = str(raw.direction, 12);
  if (!id || !HEX_RE.test(packetId) || !ENVOY_DIRECTIONS.includes(direction)) return null;
  const status = ENVOY_STATUSES.includes(raw.status) ? raw.status : 'built';
  const items = [];
  for (const row of Array.isArray(raw.items) ? raw.items.slice(0, ENVOY_LIMITS.items) : []) {
    const item = normalizePacketItem(row);
    if (item) items.push(item);
    else warnings.push('Envoy: dropped a packet item that did not match the field whitelist.');
  }
  const withheld = [];
  for (const row of Array.isArray(raw.withheld) ? raw.withheld.slice(0, ENVOY_LIMITS.items) : []) {
    if (!row || typeof row !== 'object') continue;
    const kind = str(row.kind, 40);
    const originId = str(row.originId, 120);
    if (!ENVOY_KINDS.includes(kind) || !originId) continue;
    withheld.push({ kind, originId, need: str(row.need, 20) || 'names' });
  }
  const failures = [];
  const sourceFailures = raw.verification && Array.isArray(raw.verification.failures) ? raw.verification.failures : [];
  for (const row of sourceFailures.slice(0, 40)) {
    const failure = normalizeFailure(row);
    if (failure) failures.push(failure);
  }
  const verificationOk = Boolean(raw.verification && raw.verification.ok === true && failures.length === 0);
  const merkleRoot = str(raw.merkleRoot, 64).toLowerCase();
  return {
    id,
    packetId,
    direction,
    status,
    format: str(raw.format, 40) || 'leados.envoy.packet',
    version: intOrNull(raw.version, 1, 99) ?? 1,
    schemaVersion: intOrNull(raw.schemaVersion, 1, 10_000) ?? null,
    originWorkspaceId: str(raw.originWorkspaceId, 80) || 'unknown-workspace',
    originLabel: str(raw.originLabel, ENVOY_LIMITS.labelChars) || 'A LeadOS workspace',
    recipientSeatId: str(raw.recipientSeatId, 80) || null,
    recipientAltitudeKey: str(raw.recipientAltitudeKey, 40) || 'manager',
    recipientClass: ENVOY_CLASSES.includes(raw.recipientClass) ? raw.recipientClass : 'names',
    purpose: str(raw.purpose, ENVOY_LIMITS.purposeChars),
    itemCount: items.length,
    withheldCount: withheld.length,
    omittedCount: intOrNull(raw.omittedCount, 0, 10_000) ?? 0,
    merkleRoot: HEX_RE.test(merkleRoot) ? merkleRoot : null,
    items,
    withheld,
    attestation: normalizeAttestation(raw.attestation),
    signatureKeyed: raw.signatureKeyed === true,
    signatureAlg: str(raw.signatureAlg, 20) || (raw.signatureKeyed === true ? 'hmac-sha256' : 'sha256'),
    verification: { ok: verificationOk, failures },
    createdAt: str(raw.createdAt, 32) || null,
    receivedAt: str(raw.receivedAt, 32) || null,
    sealedRevision: intOrNull(raw.sealedRevision, 0, 1_000_000_000),
  };
}

export function normalizeExchangePackets(raw, warnings, { cap = ENVOY_LIMITS.packets } = {}) {
  const list = Array.isArray(raw) ? raw : [];
  if (raw !== undefined && !Array.isArray(raw)) warnings.push('Envoy: the packet ledger was not a list and has been reset to empty.');
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const packet = normalizeExchangePacket(row, warnings);
    if (!packet) {
      warnings.push('Envoy: dropped a packet ledger row that could not be accounted for.');
      continue;
    }
    if (seen.has(packet.id)) {
      warnings.push('Envoy: removed a duplicate packet ledger row; the original was kept.');
      continue;
    }
    seen.add(packet.id);
    out.push(packet);
    if (out.length >= cap) break;
  }
  return out;
}

/* ----------------------------------------------------------------- artefacts */

export function normalizeExchangeArtefact(row, warnings = []) {
  if (!row || typeof row !== 'object') {
    warnings.push('Envoy: dropped an unattested artefact row.');
    return null;
  }
  const id = str(row.id, 120);
  const packetId = str(row.packetId, 64).toLowerCase();
  const kind = str(row.kind, 40);
  const originId = str(row.originId, 120);
  const contentHash = str(row.contentHash, 64).toLowerCase();
  const status = ENVOY_ARTEFACT_STATUSES.includes(row.status) ? row.status : null;
  if (!id || !HEX_RE.test(packetId) || !ENVOY_KINDS.includes(kind) || !originId || !HEX_RE.test(contentHash) || !status) {
    warnings.push('Envoy: dropped an artefact row that could not be accounted for.');
    return null;
  }
  const cls = ENVOY_CLASSES.includes(row.cls) ? row.cls : 'aggregate';
  const payload = status === 'imported' || status === 'duplicate'
    ? normalizeEnvoyPayload(kind, row.fields, cls, warnings, `${kind}:${originId}`)
    : null;
  if ((status === 'imported' || status === 'duplicate') && !payload) return null;
  return {
    id,
    packetId,
    kind,
    originWorkspaceId: str(row.originWorkspaceId, 80) || 'unknown-workspace',
    originId,
    contentHash,
    cls: payload ? payload.cls : cls,
    status,
    fields: payload ? payload.fields : {},
    ingestedOn: dayOrNull(row.ingestedOn) || null,
    reviewedOn: dayOrNull(row.reviewedOn) || null,
  };
}

export function normalizeExchangeArtefacts(raw, warnings, { cap = ENVOY_LIMITS.artefacts } = {}) {
  const list = Array.isArray(raw) ? raw : [];
  if (raw !== undefined && !Array.isArray(raw)) warnings.push('Envoy: the artefact ledger was not a list and has been reset to empty.');
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const artefact = normalizeExchangeArtefact(row, warnings);
    if (!artefact) continue;
    const key = `${artefact.packetId}:${artefact.kind}:${artefact.originId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(artefact);
    if (out.length >= cap) break;
  }
  return out;
}

/* ------------------------------------------------------------------ markers */

export function normalizeExchangeMarkers(raw, { cap = ENVOY_LIMITS.markers } = {}) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const key = str(row.key, 160);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: str(row.id, 120) || `envoy-marker-${out.length}`,
      key,
      kind: str(row.kind, 40) || 'note',
      recordedOn: dayOrNull(row.recordedOn) || null,
      summary: str(row.summary, 240),
    });
  }
  return out.slice(Math.max(0, out.length - cap));
}
