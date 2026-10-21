// Double-submit CSRF protection for every state-changing request.
//
// Mechanism: a random token is set in a *readable* (non-httpOnly) cookie
// (`leados_csrf`) when a session starts/refreshes. The client must echo the
// same value back in the `x-csrf-token` header on every mutating request
// (POST/PUT/PATCH/DELETE). A cross-site attacker can make the browser send
// the cookie automatically, but — thanks to the Same-Origin Policy — cannot
// read the cookie's value to also put it in the header, so a forged request
// is missing a valid header and is rejected. This is paired with
// `SameSite=Lax` on both cookies as defence in depth (see src/lib/session.ts).
import "server-only";
import { cookies } from "next/headers";
import { randomToken, timingSafeEqualString } from "@/lib/crypto";
import { isProduction } from "@/lib/env";

export const CSRF_COOKIE = "leados_csrf";
export const CSRF_HEADER = "x-csrf-token";

export async function issueCsrfToken(): Promise<string> {
  const token = randomToken(24);
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by client JS to echo in the header
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return token;
}

export async function verifyCsrf(request: Request): Promise<boolean> {
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  return timingSafeEqualString(cookieToken, headerToken);
}

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
