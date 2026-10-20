import bcrypt from "bcryptjs";

/**
 * Password hashing boundary. Centralized so the work factor can be tuned in
 * one place and so nothing in the codebase stores or compares plaintext
 * passwords directly.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

const PASSWORD_MIN_LENGTH = 12;

/** Minimum viable password policy — length + character class diversity. */
export function assessPasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password));
  if (classes.length < 3) {
    return {
      ok: false,
      reason: "Password must include at least 3 of: lowercase, uppercase, digit, symbol.",
    };
  }
  return { ok: true };
}
