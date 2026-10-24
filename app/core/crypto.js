/**
 * app/core/crypto.js — passphrase-derived authenticated encryption for the
 * local workspace blob.
 *
 * What this module is, precisely:
 *  - A key-derivation function (PBKDF2-HMAC-SHA-256, per-envelope random salt)
 *    and an authenticated cipher (AES-256-GCM, per-envelope random 96-bit IV).
 *  - A small, versioned, self-describing envelope so a later version can open
 *    an older file without guessing parameters.
 *
 * What it is NOT:
 *  - It cannot recover a lost passphrase. There is no escrow, no recovery key
 *    and no server: the derived key never leaves this tab.
 *  - It does not defend against someone who already controls this browser (an
 *    extension, a compromised profile or a keylogger sees the plaintext while
 *    the workspace is unlocked).
 *  - It does not authenticate the *user*. A short passphrase remains guessable
 *    offline by anyone who copies the ciphertext; only length and entropy help.
 *
 * Design rules:
 *  - No I/O and no clock here. The caller injects a WebCrypto implementation so
 *    the same code runs in a browser, in Node, and in jsdom (which has no
 *    `crypto.subtle`).
 *  - Header parameters (KDF name, iterations, salt, purpose) are bound into the
 *    AES-GCM additional-authenticated-data, so downgrading the iteration count
 *    or swapping the salt makes decryption fail rather than silently weaken it.
 *  - Reading a foreign envelope enforces an iteration floor, so a tampered file
 *    cannot ask this app to spend hours deriving a key (a cheap denial of
 *    service against the person trying to open their own backup).
 */

export const VAULT_FORMAT = 'leados.vault';
export const VAULT_VERSION = 1;

/**
 * PBKDF2 work factor. OWASP's Password Storage Cheat Sheet recommends 600,000
 * iterations for PBKDF2-HMAC-SHA256 (guidance current in 2026). Measured here at
 * ~130 ms per derivation, so unlocking stays well under a second even with
 * mobile-class hardware, and it happens once per session rather than per write.
 * The exact count is recorded in every envelope, so raising this default later
 * does not orphan files written by an older version.
 */
export const KDF_ITERATIONS = 600000;
/** Refuse to import an envelope that asks for fewer iterations than this. */
export const MIN_KDF_ITERATIONS = 10000;
/** Refuse an envelope that would burn unbounded CPU on unlock. */
export const MAX_KDF_ITERATIONS = 2000000;

export const PASSPHRASE_MIN = 12;
export const PASSPHRASE_MAX = 1024;
/** Distinct characters required — a floor against "aaaaaaaaaaaa", not a meter. */
export const PASSPHRASE_MIN_DISTINCT = 4;

export const PURPOSE_WORKSPACE = 'workspace';
export const PURPOSE_EXPORT = 'export';
const PURPOSES = new Set([PURPOSE_WORKSPACE, PURPOSE_EXPORT]);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const map = new Map();
  for (let i = 0; i < B64.length; i += 1) map.set(B64[i], i);
  return map;
})();

/* ------------------------------------------------------------------ base64 */
/* Hand-rolled so the module never depends on `atob`/`Buffer` being present. */

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 3) {
    const b0 = view[i];
    const b1 = i + 1 < view.length ? view[i + 1] : 0;
    const b2 = i + 2 < view.length ? view[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < view.length ? B64[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < view.length ? B64[b2 & 0x3f] : '=';
  }
  return out;
}

/** Strict decoder: rejects invalid characters, bad padding and impossible lengths. */
export function base64ToBytes(text) {
  if (typeof text !== 'string') throw new Error('base64 value must be a string');
  if (text.length % 4 !== 0) throw new Error('base64 value has an invalid length');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('base64 value has invalid characters');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const body = padding ? text.slice(0, -padding) : text;
  const out = new Uint8Array((body.length * 3) >> 2);
  let byteIndex = 0;
  for (let i = 0; i < body.length; i += 4) {
    const c0 = B64_LOOKUP.get(body[i]);
    const c1 = B64_LOOKUP.get(body[i + 1]);
    const c2 = B64_LOOKUP.get(body[i + 2]);
    const c3 = B64_LOOKUP.get(body[i + 3]);
    if (c0 === undefined || c1 === undefined) throw new Error('base64 value has invalid characters');
    out[byteIndex] = (c0 << 2) | (c1 >> 4);
    byteIndex += 1;
    if (c2 !== undefined) {
      out[byteIndex] = ((c1 & 0x0f) << 4) | (c2 >> 2);
      byteIndex += 1;
    }
    if (c3 !== undefined) {
      out[byteIndex] = ((c2 & 0x03) << 6) | c3;
      byteIndex += 1;
    }
  }
  return out.slice(0, byteIndex);
}

/* ------------------------------------------------------------------- utils */

/**
 * Resolve the WebCrypto implementation.
 * `undefined` means "use the platform one"; an explicit `null` means "there is
 * none", which is how a browser without Web Crypto is modelled and tested.
 */
function resolveCrypto(cryptoRef) {
  if (cryptoRef === null) return null;
  if (cryptoRef !== undefined) return cryptoRef;
  const candidate = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  return candidate && candidate.subtle ? candidate : null;
}

/** True when this runtime can derive keys and encrypt at all. */
export function cryptoAvailable(cryptoRef) {
  const ref = resolveCrypto(cryptoRef);
  return Boolean(ref && ref.subtle && typeof ref.getRandomValues === 'function');
}

export function randomBytes(length, cryptoRef) {
  const ref = resolveCrypto(cryptoRef);
  if (!ref || typeof ref.getRandomValues !== 'function') {
    throw new Error('This browser cannot generate secure random values.');
  }
  const bytes = new Uint8Array(length);
  ref.getRandomValues(bytes);
  return bytes;
}

export function newSalt(cryptoRef) {
  return bytesToBase64(randomBytes(16, cryptoRef));
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

function fromUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * Passphrase policy. Deliberately a floor plus footgun prevention, not a
 * strength meter: a meter would promise a security property this app cannot
 * measure, while leading/trailing whitespace is a real, common lockout cause.
 */
export function validatePassphrase(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, error: 'Enter a passphrase.' };
  }
  if (value !== value.trim()) {
    return {
      ok: false,
      error: 'Remove the leading or trailing space. Spaces at the ends are invisible and are the most common reason a passphrase later fails.',
    };
  }
  if (value.length < PASSPHRASE_MIN) {
    return { ok: false, error: `Use at least ${PASSPHRASE_MIN} characters. Length is the only protection against someone guessing offline.` };
  }
  if (value.length > PASSPHRASE_MAX) {
    return { ok: false, error: `Use at most ${PASSPHRASE_MAX} characters.` };
  }
  if (new Set(value).size < PASSPHRASE_MIN_DISTINCT) {
    return { ok: false, error: `Use at least ${PASSPHRASE_MIN_DISTINCT} different characters — a repeated character is not a passphrase.` };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- envelope */

/**
 * The authenticated header. Any change to these fields makes GCM verification
 * fail, so an attacker cannot quietly trade a 600k-iteration derivation for a
 * 1-iteration one.
 */
function additionalData({ iterations, salt, purpose, version }) {
  return utf8(`${VAULT_FORMAT}|v${version}|PBKDF2-SHA256|${iterations}|${salt}|${purpose}`);
}

export function isVaultEnvelope(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value.format === VAULT_FORMAT,
  );
}

/** Human-readable facts about an envelope, with no secrets in them. */
export function describeEnvelope(envelope) {
  if (!isVaultEnvelope(envelope)) return null;
  return {
    version: Number(envelope.v) || null,
    purpose: typeof envelope.purpose === 'string' ? envelope.purpose : null,
    iterations: envelope.kdf && Number.isInteger(envelope.kdf.iterations) ? envelope.kdf.iterations : null,
    createdAt: typeof envelope.createdAt === 'string' ? envelope.createdAt : null,
    bytes: typeof envelope.ct === 'string' ? envelope.ct.length : 0,
  };
}

/** Structural validation before any expensive work happens. */
export function checkEnvelope(envelope, { minIterations = MIN_KDF_ITERATIONS } = {}) {
  if (!isVaultEnvelope(envelope)) {
    return { ok: false, reason: 'not-a-vault', error: 'This file is not a LeadOS encrypted backup.' };
  }
  const version = Number(envelope.v);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'bad-version', error: 'This encrypted backup declares an invalid format version.' };
  }
  if (version > VAULT_VERSION) {
    return {
      ok: false,
      reason: 'future-version',
      error: `This encrypted backup uses format v${version}, newer than this app supports (v${VAULT_VERSION}). Update LeadOS rather than retrying — the file has not been changed.`,
    };
  }
  const kdf = envelope.kdf;
  if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || typeof kdf.salt !== 'string' || !kdf.salt) {
    return { ok: false, reason: 'bad-kdf', error: 'This encrypted backup declares key-derivation settings this version does not support.' };
  }
  const iterations = Number(kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < minIterations || iterations > MAX_KDF_ITERATIONS) {
    return {
      ok: false,
      reason: 'bad-kdf',
      error: `This encrypted backup asks for ${Number.isFinite(iterations) ? iterations : 'an invalid number of'} key-derivation rounds, outside the ${minIterations}–${MAX_KDF_ITERATIONS} range this app accepts.`,
    };
  }
  if (typeof envelope.iv !== 'string' || !envelope.iv || typeof envelope.ct !== 'string' || !envelope.ct) {
    return { ok: false, reason: 'bad-cipher', error: 'This encrypted backup is incomplete: its IV or ciphertext is missing.' };
  }
  if (!PURPOSES.has(envelope.purpose)) {
    return { ok: false, reason: 'bad-purpose', error: 'This encrypted backup declares an unknown purpose.' };
  }
  return { ok: true };
}

/** Derive an AES-GCM key from a passphrase. Never exported or persisted. */
export async function deriveKey({ passphrase, salt, iterations, cryptoRef }) {
  const ref = resolveCrypto(cryptoRef);
  if (!ref || !ref.subtle) throw new Error('This browser does not support Web Crypto, so the workspace cannot be encrypted here.');
  const material = await ref.subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return ref.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt `text` into a self-describing envelope.
 * The caller supplies salt/key so that changing a passphrase can reuse one
 * derivation instead of two.
 */
export async function sealText({ text, key, cryptoRef, salt, iterations, purpose = PURPOSE_WORKSPACE, createdAt = null }) {
  const ref = resolveCrypto(cryptoRef);
  if (!ref || !ref.subtle) throw new Error('This browser does not support Web Crypto, so the workspace cannot be encrypted here.');
  if (typeof text !== 'string') throw new Error('sealText requires a string');
  if (!key) throw new Error('sealText requires a derived key');
  const iv = bytesToBase64(randomBytes(12, ref));
  const aad = additionalData({ iterations, salt, purpose, version: VAULT_VERSION });
  const cipher = await ref.subtle.encrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: aad, tagLength: 128 },
    key,
    utf8(text),
  );
  return {
    format: VAULT_FORMAT,
    v: VAULT_VERSION,
    purpose,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    iv,
    ct: bytesToBase64(new Uint8Array(cipher)),
    createdAt,
  };
}

/**
 * Derive a key from `passphrase` and decrypt an envelope.
 * Returns a discriminated result: callers must never guess why it failed.
 */
export async function openEnvelope({ envelope, passphrase, cryptoRef, minIterations = MIN_KDF_ITERATIONS }) {
  const structural = checkEnvelope(envelope, { minIterations });
  if (!structural.ok) return structural;
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    return { ok: false, reason: 'passphrase-required', error: 'Enter the passphrase for this encrypted backup.' };
  }
  if (!cryptoAvailable(cryptoRef)) {
    return {
      ok: false,
      reason: 'no-crypto',
      error: 'This browser does not support Web Crypto, so encrypted workspaces cannot be opened here.',
    };
  }
  const iterations = Number(envelope.kdf.iterations);
  const { salt } = envelope.kdf;
  let key;
  try {
    key = await deriveKey({ passphrase, salt, iterations, cryptoRef });
  } catch (err) {
    return { ok: false, reason: 'derive-failed', error: `Could not derive a key: ${err && err.message ? err.message : err}` };
  }
  const decrypted = await decryptWithKey({ envelope, key, cryptoRef });
  if (!decrypted.ok) return decrypted;
  return {
    ok: true,
    text: decrypted.text,
    key,
    kdf: { salt, iterations },
    purpose: envelope.purpose,
    createdAt: typeof envelope.createdAt === 'string' ? envelope.createdAt : null,
  };
}

/** Decrypt with an already-derived key (no second 310k-round derivation). */
export async function decryptWithKey({ envelope, key, cryptoRef }) {
  const structural = checkEnvelope(envelope, { minIterations: 1 });
  if (!structural.ok) return structural;
  if (!key) return { ok: false, reason: 'no-key', error: 'No key is available to decrypt this data.' };
  let plain;
  try {
    plain = await resolveCrypto(cryptoRef).subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(envelope.iv),
        additionalData: additionalData({
          iterations: Number(envelope.kdf.iterations),
          salt: envelope.kdf.salt,
          purpose: envelope.purpose,
          version: Number(envelope.v),
        }),
        tagLength: 128,
      },
      key,
      base64ToBytes(envelope.ct),
    );
  } catch {
    // GCM cannot distinguish a wrong key from a tampered ciphertext, and saying
    // otherwise would be a guess. The message says both possibilities.
    return {
      ok: false,
      reason: 'auth-failed',
      error: 'That passphrase did not unlock this data. Either it is different from the one used, or the file has been altered.',
    };
  }
  try {
    return { ok: true, text: fromUtf8(new Uint8Array(plain)) };
  } catch {
    return { ok: false, reason: 'decode-failed', error: 'The decrypted data could not be read as text.' };
  }
}

/**
 * Round-trip check used before overwriting the only copy of a workspace.
 * A write that cannot be read back is worse than no write at all.
 */
export async function verifyEnvelope({ envelope, key, cryptoRef, expectedText }) {
  const decrypted = await decryptWithKey({ envelope, key, cryptoRef });
  if (!decrypted.ok) return { ok: false, error: decrypted.error };
  if (typeof expectedText === 'string' && decrypted.text !== expectedText) {
    return { ok: false, error: 'The encrypted copy did not decrypt to the same workspace, so nothing was changed.' };
  }
  return { ok: true };
}
