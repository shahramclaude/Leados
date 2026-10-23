// Confidentiality-by-construction primitive for the safe channel.
// AES-256-GCM: authenticated encryption, random IV per field, auth tag
// stored alongside ciphertext so tampering is detectable. The key is read
// from SAFE_CHANNEL_KEY (32-byte hex). In production this MUST come from a
// managed secret store / KMS with access scoped independently of the
// application's own database credentials — the whole point of a safe
// channel is that a database compromise alone must not unmask reporters.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function loadKey(): Buffer {
  const hex = process.env.SAFE_CHANNEL_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  // Dev-only fallback so the sandbox still boots without the secret
  // configured. Loudly warn — this key is NOT persisted across restarts,
  // which also means previously-encrypted data becomes unreadable, by
  // design (fail closed, never fail open).
  // eslint-disable-next-line no-console
  console.warn(
    "[safe-channel] SAFE_CHANNEL_KEY missing or malformed — using an ephemeral " +
      "in-memory key for this process only. Configure SAFE_CHANNEL_KEY in production.",
  );
  return randomBytes(32);
}

const KEY = loadKey();

export interface EncryptedField {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encryptField(plaintext: string): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptField(field: EncryptedField): string {
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(field.iv, "base64"));
  decipher.setAuthTag(Buffer.from(field.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** One-way hash for lookup secrets / claim tokens / anti-retaliation person refs. */
export function hashSecret(value: string, salt = "leados-part46"): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function randomCaseRef(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `SC-${year}-${suffix}`;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
