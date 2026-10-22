import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge-compatible: only touches headers, no Node APIs, no database access.
//
// Responsibilities:
//  1. Correlation id end-to-end (client -> middleware -> route -> logger ->
//     response header) so every audit event and log line can be joined.
//  2. A per-request CSP nonce, threaded into the response so Server
//     Components can read it (via the `x-csp-nonce` request header, which
//     Next forwards to `headers()` in a Server Component) and apply it to
//     any inline <script>. `strict-dynamic` lets nonce'd scripts load
//     further scripts without needing every third-party script URL
//     allowlisted individually.
//  3. The full security header set: HSTS, X-Content-Type-Options,
//     Referrer-Policy, Permissions-Policy, and frame-ancestors (via CSP,
//     which also covers the legacy X-Frame-Options for older browsers).
const CORRELATION_ID_HEADER = "x-correlation-id";
const NONCE_HEADER = "x-csp-nonce";

function buildCsp(nonce: string): string {
  // Documented relaxation: `style-src` allows 'unsafe-inline' because Next's
  // generated critical CSS and Tailwind's runtime injection do not currently
  // support per-request nonces without a build-time CSP-nonce rewrite step
  // (tracked in docs/THREAT-MODEL.md as a residual risk — style-based
  // exfiltration via injected inline styles is a much narrower attack
  // surface than script injection, which is fully nonce'd + strict-dynamic).
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];
  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  const incomingCorrelation = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = incomingCorrelation && incomingCorrelation.length > 0 ? incomingCorrelation : crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
  requestHeaders.set(NONCE_HEADER, nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
