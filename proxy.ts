import { NextRequest, NextResponse } from "next/server";

/**
 * Global security headers + CSP nonce generation.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function
 * `proxy`); it now always runs on the Node.js runtime. See
 * https://nextjs.org/docs/app/guides/upgrading/version-16. We use the
 * current convention rather than the deprecated one.
 *
 * NOTE (threat model — see docs/THREAT-MODEL.md): proxy/middleware is a
 * network-boundary layer, not an authorization boundary (CVE-2025-29927
 * showed header-spoofing could bypass middleware entirely). Every API route
 * in this app re-verifies authentication and authorization itself via
 * `requireAuth()` in `src/lib/apiUtils.ts` — this file only adds security
 * *headers* and a CSP nonce, it never gates access to a route.
 *
 * A fresh nonce is minted per request and threaded through via the
 * `x-nonce` request header (read in `src/app/layout.tsx` with `headers()`)
 * so any future inline script/style can be allow-listed without ever
 * resorting to `'unsafe-inline'` for scripts. Combined with
 * `'strict-dynamic'`, this is the Next.js-recommended strict CSP pattern.
 *
 * All other headers are static, defense-in-depth hardening:
 *  - HSTS forces HTTPS for a year including subdomains (only meaningful
 *    behind TLS termination in production; skipped in dev over plain HTTP).
 *  - X-Content-Type-Options stops MIME sniffing of e.g. uploaded/exported files.
 *  - Referrer-Policy avoids leaking full URLs (which may contain ids/tokens
 *    in query strings) to third-party origins.
 *  - Permissions-Policy disables powerful browser features LEADOS never uses.
 *  - X-Frame-Options / frame-ancestors block clickjacking.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (!isDev) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next's static asset pipeline; apply everywhere else including API routes.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
