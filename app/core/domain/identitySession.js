/**
 * app/core/domain/identitySession.js — the seat-credential session registry
 * (Schema v91, ADR-0085).
 *
 * A leaf module on purpose: `store.js` clears sessions at its lock sites and
 * must not import the identity engine (or any domain module that reads the
 * workspace). Exactly like `sealCrypto.js`, the derived key is:
 *
 *   - memory-only (a module-level Uint8Array, never persisted, never logged),
 *   - domain-separated ("leados-seat-v1:" + PBKDF2 bits) so it can never
 *     coincide with the vault AES key or the seal key,
 *   - derived with PBKDF2-HMAC-SHA-256 through the same injected WebCrypto
 *     seam the vault uses, so the same code runs in a browser, Node and jsdom.
 *
 * The session also carries an IDLE EXPIRY: after `identityIdleMins` without a
 * read, `activeIdentitySession()` returns null and clears the key. An expired
 * session silently stops attesting — the honest failure mode is "no longer
 * attested", never "attested by a stale key".
 */

import { sha256Hex, hmacSha256Hex } from './sealCrypto.js';
import {
  IDENTITY_KEY_DOMAIN, IDENTITY_KEYID_DOMAIN, IDENTITY_VERIFY_DOMAIN,
} from './identityRegistry.js';

/* ------------------------------------------------------------- utf8/bytes */

function utf8Bytes(text) {
  const out = [];
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7f) out.push(cp);
    else if (cp <= 0x7ff) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp <= 0xffff) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(out);
}

const HEX = '0123456789abcdef';
function bytesToHex(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 1) out += HEX[view[i] >> 4] + HEX[view[i] & 0x0f];
  return out;
}

/* ------------------------------------------------------ key-id + verifier */

/**
 * Public fingerprint of a seat key: safe to store, print and export. It names
 * a credential without revealing it — 16 hex chars of SHA-256 over a labelled
 * domain separator and the key bytes.
 */
export function seatKeyId(keyBytes) {
  return sha256Hex(`${IDENTITY_KEYID_DOMAIN}|${bytesToHex(keyBytes)}`).slice(0, 16);
}

/**
 * Stored verifier for a seat credential. HMAC(key, "leados-seat-verify-v1|seat")
 * — a PRF output: knowing it does not let a workspace editor compute an
 * attestation MAC for a different message, so it is safe at rest beside the
 * salt, and it binds the enrollment to the seat id.
 */
export function seatKeyVerifier(keyBytes, seatId) {
  return hmacSha256Hex(keyBytes, `${IDENTITY_VERIFY_DOMAIN}|${seatId}`);
}

/** Constant-time string compare (equal length assumed; length leak is fine). */
export function timingSafeEqual(a, b) {
  const x = String(a); const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------- session registry */

let session = null; // { seatId, keyId, key: Uint8Array, expiresAt: ms }, memory only

/**
 * Register an unlocked seat session. `keyBytes` is copied; the caller's buffer
 * is not retained. `expiresAt` is epoch ms; pass Infinity for tests.
 */
export function registerIdentitySession({ seatId, keyBytes, keyId, expiresAt = Infinity }) {
  if (!seatId || !(keyBytes instanceof Uint8Array) || !keyId) { session = null; return false; }
  session = {
    seatId: String(seatId),
    keyId: String(keyId),
    key: keyBytes.slice(),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Infinity,
  };
  return true;
}

/** Test/app seam: drop the session key (writes become unattested again). */
export function clearIdentitySession() { session = null; }

/**
 * The active seat session, or null. An expired session is cleared on read, so
 * an idle workspace stops attesting at the boundary rather than lying.
 * `nowMs` is injectable for tests (defaults to Date.now()).
 */
export function activeIdentitySession(nowMs = Date.now()) {
  if (!session) return null;
  if (session.expiresAt !== Infinity && nowMs >= session.expiresAt) {
    session = null;
    return null;
  }
  return { seatId: session.seatId, keyId: session.keyId, key: session.key.slice(), expiresAt: session.expiresAt };
}

/** Extend the idle window (called whenever the session is read or used). */
export function touchIdentitySession(nowMs = Date.now(), idleMins = 30) {
  if (!session) return false;
  const mins = Math.min(480, Math.max(1, Math.round(Number(idleMins) || 30)));
  session.expiresAt = nowMs + mins * 60 * 1000;
  return true;
}

/* --------------------------------------------------------------- derivation */

/**
 * Derive a seat key from a passphrase. Same PBKDF2 seam as the vault
 * (`crypto.js` deriveBits path), 256 bits, then domain-separated into the
 * HMAC key bytes. Async — called at enroll/unlock only, never in the
 * synchronous rule path. Returns null when WebCrypto is unavailable; the
 * caller must then print that attestation is unavailable rather than
 * downgrading silently.
 */
export async function deriveSeatKeyBytes({ passphrase, salt, iterations, cryptoRef }) {
  const ref = cryptoRef || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (!ref || !ref.subtle) return null;
  const { base64ToBytes } = await import('../crypto.js');
  const material = await ref.subtle.importKey('raw', utf8Bytes(String(passphrase)), 'PBKDF2', false, ['deriveBits']);
  const bits = await ref.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations: Math.round(Number(iterations)), hash: 'SHA-256' },
    material,
    256,
  );
  return utf8Bytes(`${IDENTITY_KEY_DOMAIN}:${bytesToHex(new Uint8Array(bits))}`);
}
