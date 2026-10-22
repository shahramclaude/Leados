// Password hashing via Node's built-in scrypt (no native dependency,
// no supply-chain risk beyond Node itself). Format: scrypt$N$r$p$saltHex$hashHex
import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384; // CPU/memory cost
const r = 8;
const p = 1;
const KEY_LEN = 64;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Minimum password policy enforced at the zod layer (src/lib/validation.ts)
 * as well, kept here so the rule has a single source of truth. */
export const PASSWORD_MIN_LENGTH = 12;
