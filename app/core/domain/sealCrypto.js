/**
 * app/core/domain/sealCrypto.js — synchronous SHA-256 / HMAC-SHA256 for the
 * Sealed Spine (ADR-0082).
 *
 * WHY PURE JS AND NOT WebCrypto: the post-commit rule spine is synchronous
 * (ADR-0008 — rules run inside the store transaction), and `crypto.subtle`
 * is asynchronous everywhere it exists. A hash chain that could only be
 * computed in a microtask could not seal a transaction before it persists.
 * So this module carries a small, self-contained, dependency-free SHA-256
 * (FIPS 180-4) that runs identically in the browser and in Node, and HMAC
 * (RFC 2104) on top of it. The only import is the base64 helper from the
 * vault crypto module, so the canonical boundary (relative-only imports
 * inside app/**) is trivially satisfied.
 *
 * Honesty contract, printed by every consumer of this module:
 *  - mode 'hash' chains are tamper-EVIDENT against accidental corruption and
 *    honest mistakes, and detectable by anyone who can recompute them — an
 *    attacker with write access to the log and no key CAN recompute a plain
 *    hash chain. It is integrity, not forgery-proofing.
 *  - mode 'hmac' seals are keyed: without the key an attacker cannot forge a
 *    valid seal even with full write access to the log. The key is derived
 *    from the vault passphrase at unlock time (PBKDF2, domain-separated) and
 *    held only in memory for the session; it is never persisted, never
 *    exported and never written into the workspace blob.
 */

import { base64ToBytes } from '../crypto.js';

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function utf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text));
  const out = [];
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      c = 0x10000 + ((c & 0x3ff) << 10) + (s.charCodeAt(i + 1) & 0x3ff);
      i += 1;
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

/** SHA-256 of a string or byte array, returned as raw bytes. */
export function sha256Bytes(input) {
  const bytes = typeof input === 'string' ? utf8Bytes(input) : (input instanceof Uint8Array ? input : utf8Bytes(String(input)));
  const bitLen = bytes.length * 8;
  const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  // JS bit lengths above 2^32 are safe here: event logs are far below 512 Mbit.
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(withPad.length - 4, bitLen >>> 0);

  const h = H0.slice();
  const w = new Array(64);
  for (let block = 0; block < withPad.length; block += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const view32 = new DataView(out.buffer);
  h.forEach((word, i) => view32.setUint32(i * 4, word));
  return out;
}

/** SHA-256 of a string or byte array, returned as a lowercase hex string. */
export function sha256Hex(input) {
  return bytesToHex(sha256Bytes(input));
}

/** HMAC-SHA256 (RFC 2104, block size 64) over a utf8 string, hex output. */
export function hmacSha256Hex(keyBytes, message) {
  let key = keyBytes instanceof Uint8Array ? keyBytes : utf8Bytes(String(keyBytes));
  if (key.length > 64) key = sha256Bytes(key);
  const padded = new Uint8Array(64);
  padded.set(key);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) { ipad[i] = padded[i] ^ 0x36; opad[i] = padded[i] ^ 0x5c; }
  const msgBytes = utf8Bytes(message);
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, 64);
  return bytesToHex(sha256Bytes(concatBytes(opad, sha256Bytes(inner))));
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

export function hexToBytes(hex) {
  const clean = String(hex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable canonical JSON: object keys sorted recursively, so the same record
 * always hashes to the same digest regardless of key insertion order. This is
 * what makes the chain recomputable on any machine, in any JS engine.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/* ------------------------------------------------------- session seal key */

let sessionSealKey = null; // Uint8Array, memory only, never persisted

/** Register the session seal key (e.g. derived at vault unlock). */
export function registerSealKey(key) {
  if (key instanceof Uint8Array) sessionSealKey = key.slice();
  else if (typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key)) sessionSealKey = hexToBytes(key);
  else if (typeof key === 'string' && key) sessionSealKey = utf8Bytes(key);
  else sessionSealKey = null;
}

/** Test/app seam: drop the session key (back to plain-hash mode). */
export function clearSealKey() { sessionSealKey = null; }

/** The session seal key, or null when sealing runs in plain-hash mode. */
export function activeSealKey() { return sessionSealKey ? sessionSealKey.slice() : null; }

export const SEAL_KEY_DOMAIN = 'leados-seal-v1';

/**
 * Derive the seal key from the vault passphrase at unlock time. Uses the same
 * PBKDF2 parameters as the vault envelope but deriveBits (not deriveKey), so
 * the AES key stays non-extractable while the seal key exists only as these
 * 32 bytes in memory, domain-separated by a fixed label so it can never
 * coincide with any AES key material. Async — called once at unlock, never in
 * the synchronous rule path.
 */
export async function deriveAndRegisterSealKey({ passphrase, salt, iterations, cryptoRef }) {
  const ref = cryptoRef || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (!ref || !ref.subtle) return false;
  const { base64ToBytes } = await import('../crypto.js');
  const material = await ref.subtle.importKey('raw', utf8Bytes(String(passphrase)), 'PBKDF2', false, ['deriveBits']);
  const bits = await ref.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  registerSealKey(utf8Bytes(`${SEAL_KEY_DOMAIN}:${bytesToHex(new Uint8Array(bits))}`));
  return true;
}
