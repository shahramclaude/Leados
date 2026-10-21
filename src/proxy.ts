import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, decodeSession } from "@/lib/session";

/**
 * Next.js 16 request interceptor (formerly `middleware.ts`). Runs on the
 * Node.js runtime by default, so it can use the same signed-cookie decoder
 * as route handlers.
 *
 * Responsibility split (documented for the adversarial self-review):
 *  - `proxy.ts` enforces *authentication* centrally for every `/api/*` route
 *    except the public allow-list below, and attaches the resolved identity
 *    as request headers so handlers don't need to re-parse cookies.
 *  - Fine-grained *permission* (RBAC) and *org scoping* (tenancy) checks are
 *    enforced inside each route handler via `requirePermission()` and the
 *    org-scoped repository functions, because those checks need a live DB
 *    read of the user's current role/overrides — doing that per-request in
 *    the request interceptor for every route would duplicate the exact
 *    query each handler already performs. The route→permission registry in
 *    `src/lib/routePermissions.ts` is the single source of truth consulted
 *    by both the admin permission matrix UI and the consistency test, so
 *    the two layers cannot silently drift apart.
 */
const PUBLIC_API_PREFIXES = ["/api/health", "/api/auth/", "/api/settings/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = decodeSession(token);
  if (!session) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in required." },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-leados-user-id", session.userId);
  headers.set("x-leados-org-id", session.orgId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
