/**
 * app/core/domain/identitySchema.js — fail-closed normalizers for the
 * Attested Commit (Schema v91, ADR-0085).
 *
 * What lives in the workspace, and what must never:
 *   - `seatIdentities` rows carry the PUBLIC half of a credential: seat id,
 *     key fingerprint (keyId), PBKDF2 salt + iteration count, and an HMAC
 *     verifier. None of these computes an attestation MAC without the
 *     passphrase — that exists only in memory while a session is unlocked.
 *   - `identityMarkers` are rule idempotency tags (system-generated), capped
 *     like every other module's markers.
 *
 * A malformed row is dropped with a warning, never repaired: a hostile or
 * corrupted enrollment must not be "fixed" into something that looks valid.
 * Iteration counts are clamped to the same floor/ceiling as the vault envelope
 * so a tampered file cannot burn CPU on unlock (crypto.js MIN/MAX).
 */

import {
  IDENTITY_DEFAULTS, IDENTITY_LIMITS,
} from './identityRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isoOrNull(value) {
  const s = str(value, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return value === true || value === 'true';
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Settings semantics: an out-of-range value means "as far as it goes" — clamp
 *  to the boundary; only a value that is not a number falls back to default. */
function clampTo(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const KEY_ID_RE = /^[0-9a-f]{16}$/;
const VERIFIER_RE = /^[0-9a-f]{64}$/;
const SALT_RE = /^[A-Za-z0-9+/=]{8,128}$/;

/**
 * Seat credential enrollments. Unique per seat (first row wins; a duplicate
 * is corruption, not a rotation — rotation replaces the row through the
 * action's write path). Iterations clamped to the vault's KDF bounds.
 */
export function normalizeSeatIdentities(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) { warnings.push('Dropped a malformed seat credential enrollment (not an object).'); continue; }
    const seatId = str(raw.seatId, 64);
    const keyId = str(raw.keyId, 16).toLowerCase();
    const salt = str(raw.salt, 128);
    const verifier = str(raw.verifier, 64).toLowerCase();
    const iterations = clampInt(raw.iterations, 10000, 2000000, 0);
    if (!seatId || !KEY_ID_RE.test(keyId) || !SALT_RE.test(salt) || !VERIFIER_RE.test(verifier) || !iterations) {
      warnings.push('Dropped a malformed seat credential enrollment (missing or invalid credential fields).');
      continue;
    }
    if (seen.has(seatId)) { warnings.push(`Dropped a duplicate credential enrollment for seat “${seatId}”.`); continue; }
    if (out.length >= IDENTITY_LIMITS.enrollmentCap) { warnings.push('Credential enrollment cap reached; extra rows were dropped.'); break; }
    seen.add(seatId);
    out.push({
      seatId,
      keyId,
      salt,
      iterations,
      verifier,
      createdAt: isoOrNull(raw.createdAt) || new Date(0).toISOString(),
      rotatedAt: isoOrNull(raw.rotatedAt),
      revokedAt: isoOrNull(raw.revokedAt),
    });
  }
  return out;
}

/** Rule idempotency markers: opaque system tags, trimmed and capped. */
export function normalizeIdentityMarkers(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().slice(0, 160);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= IDENTITY_LIMITS.markerCap) break;
  }
  return out;
}

/**
 * Conventions. Fail-closed: a malformed value falls back to the default,
 * never to "the most permissive reading".
 */
export function normalizeIdentitySettings(settings = {}) {
  const d = IDENTITY_DEFAULTS;
  const s = isPlainObject(settings) ? settings : {};
  return {
    identityEnabled: bool(s.identityEnabled, d.identityEnabled),
    identityAutoPropagate: bool(s.identityAutoPropagate, d.identityAutoPropagate),
    identityEnforced: bool(s.identityEnforced, d.identityEnforced),
    identityIdleMins: clampTo(s.identityIdleMins, 1, 480, d.identityIdleMins),
  };
}
