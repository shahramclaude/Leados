// Next.js 16 "Proxy" (formerly middleware) — Part 17-C security headers + CSP.
//
// Responsibilities kept intentionally narrow, per Next's own guidance ("Always
// verify authentication and authorization inside each Server Function rather
// than relying on Proxy alone"):
//   1. Attach a strict, per-request CSP with a nonce + 'strict-dynamic' to
//      every HTML response.
//   2. Attach the standard security header set to every response (including
//      API responses).
//   3. A *fast, cookie-presence-only* redirect for unauthenticated page
//      loads of protected UI routes, purely for UX (no DB round trip here).
//      The real authorization decision for data is always made again,
//      server-side, by `getSession()` / `secureRoute()` — Proxy is not
//      trusted as the sole gate.
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { SESSION_COOKIE } from "@/lib/session";

const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/admin", "/audit", "/people", "/webhooks", "/users"];

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind ships a static stylesheet (no inline <style> injection in
    // this app), so style-src does not need 'unsafe-inline'. If a future
    // UI library requires inline styles, prefer the nonce over
    // 'unsafe-inline' and document the relaxation here instead of adding it
    // silently.
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = buildCsp(nonce, isDev);

  const { pathname } = request.nextUrl;
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtectedPage && !request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, csp);
  return response;
}

export function applySecurityHeaders(response: NextResponse, csp: string): void {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
