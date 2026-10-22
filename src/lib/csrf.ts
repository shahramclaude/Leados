// Double-submit CSRF protection for every state-changing request.
//
// Mechanism: a random token is set in a *readable* (non-httpOnly) cookie
// (`leados_csrf`). The client must echo the same value back in the
// `x-csrf-token` header on every mutating request (POST/PUT/PATCH/DELETE). A
// cross-site attacker can make the browser send the cookie automatically but
// — thanks to the Same-Origin Policy — cannot read the cookie's value to
// also put it in the header, so a forged request is missing a valid header
// and is rejected. Paired with `SameSite=Lax` on both cookies (defense in
// depth) and an Origin-header check (secondary defense; see verifyCsrf).
//
// Login is deliberately included in CSRF enforcement (not just "already
// authenticated" mutations) to defend against login CSRF (an attacker
// forcing a victim's browser to log into the *attacker's* account, so the
// victim's later actions are attributed to the attacker — OWASP-documented).
import "server-only";
import { cookies, headers } from "next/headers";
import { randomToken, timingSafeEqualString } from "@/lib/crypto";
import { isProduction } from "@/lib/env";

export const CSRF_COOKIE = "leados_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function generateCsrfToken(): string {
  return randomToken(24);
}

export async function issueCsrfToken(): Promise<string> {
  const token = generateCsrfToken();
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
  if (!timingSafeEqualString(cookieToken, headerToken)) return false;

  // Secondary defense: if the browser sent an Origin header, it must match
  // our own host. Deliberately NOT required (documented relaxation) because
  // some legitimate same-origin requests (older browsers, certain proxies)
  // omit Origin on same-site requests; the double-submit token above is the
  // primary control and is sufficient on its own.
  const origin = request.headers.get("origin");
  if (origin) {
    const hdrs = await headers();
    const host = hdrs.get("host");
    try {
      const originHost = new URL(origin).host;
      if (host && originHost !== host) return false;
    } catch {
      return false;
    }
  }

  return true;
}
