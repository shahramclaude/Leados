import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge-compatible: only touches headers, no Node APIs, no database access.
// Ensures every request carries a correlation id end-to-end:
//   client -> middleware -> route handler -> logger -> response header.
// Downstream services/agents should propagate the same header on any
// outbound call they make so traces stay joined across process boundaries.
const CORRELATION_ID_HEADER = "x-correlation-id";

export function middleware(request: NextRequest) {
  const incoming = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = incoming && incoming.length > 0 ? incoming : crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
