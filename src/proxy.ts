// src/proxy.ts — (Next.js 16 renamed "middleware.ts" to "proxy.ts"; same
// mechanism, different filename/export name — see
// https://nextjs.org/docs/messages/middleware-to-proxy). Route-level
// enforcement that runs before any page or API handler: locale cookie
// negotiation (i18n) and coarse-grained authentication/role gating (RBAC).
// Fine-grained permission checks still happen again server-side in every
// API route via `requirePermission` — this is defense-in-depth, not the
// only check (proxy.ts, like middleware.ts before it, is not a real auth
// boundary on its own).

import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale, normalizeLocale } from "@/lib/i18n";

const SESSION_USER_COOKIE = "leados_uid";
const SESSION_ORG_COOKIE = "leados_org";

const PUBLIC_PATHS = ["/login", "/onboarding", "/offline", "/api/health", "/api/onboarding", "/api/login", "/api/locale"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never intercept static assets, the service worker, or the manifest.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // --- i18n: negotiate + persist a locale cookie for every request. ---
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!existingLocale) {
    const negotiated = negotiateLocale(request.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, negotiated, { sameSite: "lax", path: "/" });
  } else {
    response.cookies.set(LOCALE_COOKIE, normalizeLocale(existingLocale), { sameSite: "lax", path: "/" });
  }

  if (isPublic(pathname)) return response;

  const userId = request.cookies.get(SESSION_USER_COOKIE)?.value;
  const orgId = request.cookies.get(SESSION_ORG_COOKIE)?.value;

  if (pathname.startsWith("/api/")) {
    // API routes resolve their own 401/403 via requireSession/requirePermission
    // so a non-admin never learns an admin-only route exists purely from a
    // generic redirect — the response explains *why* access was denied.
    return response;
  }

  if (!userId || !orgId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
