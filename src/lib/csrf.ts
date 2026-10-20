import { randomBytes, timingSafeEqual } from "node:crypto";
import { isProduction } from "@/lib/env";

/**
 * Double-submit-cookie CSRF protection.
 *
 * - `CSRF_COOKIE` is set non-httpOnly so client JS can read it and echo it
 *   back in the `x-csrf-token` header on every mutating request.
 * - The session cookie is httpOnly + SameSite=Lax, which already blocks
 *   cross-site form submissions from sending it in most cases, but Lax still
 *   allows top-level GET navigations to carry cookies, and we defense-in-depth
 *   against SameSite misconfig / browser quirks by requiring the header to
 *   match the cookie for every state-changing request.
 */
export const CSRF_COOKIE = "leados_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export function verifyCsrf(cookieValue: string | undefined, headerValue: string | null): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
