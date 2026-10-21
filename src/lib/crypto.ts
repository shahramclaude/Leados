// Password hashing + generic constant-time helpers.
//
// Standard: scrypt (Node's built-in, audited implementation) with an
// N=2^15 CPU/memory cost parameter, a random 16-byte salt per password, and
// a PHC-like serialisation so parameters can change without breaking old
// hashes (`scrypt$N$r$p$salt$hash`, all base64url). This avoids adding a
// native bcrypt/argon2 dependency while meeting the same bar (OWASP ASVS
// 2.4.x: salted, slow, memory-hard KDF; no fast general-purpose hash).
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });
}

function toB64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toB64Url(salt)}$${toB64Url(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password, salt, n, r, p);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Constant-time string compare for tokens (CSRF, webhook secrets, etc). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a comparison of equal-length buffers to avoid a trivial
    // length-based timing oracle on the common case.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
