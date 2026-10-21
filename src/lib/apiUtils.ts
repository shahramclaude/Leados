// Central API route wrapper. Every route in src/app/api/** is built with
// `secureRoute()` so that authentication, CSRF, and authorization are never
// opt-in per-route decisions — they are the default, and `permission:
// "public"` is the only (explicit, registry-visible) way out.
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getSession, type SessionUser } from "@/lib/session";
import { verifyCsrf, SAFE_METHODS } from "@/lib/csrf";
import { findRouteRule, type RouteRule } from "@/lib/authz/registry";
import { roleHasPermission } from "@/lib/authz/permissions";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Request body must be valid JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, "Validation failed", parsed.error.flatten()) };
  }
  return { ok: true, data: parsed.data };
}

export function parseQuery<T>(
  url: URL,
  schema: ZodType<T>,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const obj = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, "Validation failed", parsed.error.flatten()) };
  }
  return { ok: true, data: parsed.data };
}

type HandlerArgs<TParams> = {
  request: NextRequest;
  session: SessionUser | null;
  params: TParams;
  rule: RouteRule;
};

type NextRouteContext<TParams> = { params: Promise<TParams> };

/**
 * Wrap an App Router handler with: registry lookup (fail closed if the
 * route is not registered), session enforcement, CSRF validation on
 * mutating verbs, and permission enforcement. `path` must be the Next.js
 * path template (e.g. "/api/people/:id") and must match an entry in
 * `ROUTE_REGISTRY` — see src/lib/authz/registry.ts.
 */
export function secureRoute<TParams = Record<string, never>>(config: {
  method: RouteRule["method"];
  path: string;
  handler: (args: HandlerArgs<TParams>) => Promise<NextResponse>;
}) {
  return async (request: NextRequest, context: NextRouteContext<TParams>): Promise<NextResponse> => {
    const rule = findRouteRule(config.method, config.path);
    if (!rule) {
      // Fail closed: an unregistered route refuses to serve traffic instead
      // of defaulting to "open". scripts/check-route-registry.mjs catches
      // this at CI time before it ever reaches runtime.
      return jsonError(500, "Route is not present in the authorization registry");
    }

    const params = context?.params ? await context.params : ({} as TParams);

    let session: SessionUser | null = null;
    if (rule.permission !== "public") {
      session = await getSession();
      if (!session) return jsonError(401, "Authentication required");
    }

    if (!SAFE_METHODS.has(config.method) && rule.permission !== "public") {
      const csrfOk = await verifyCsrf(request);
      if (!csrfOk) return jsonError(403, "CSRF validation failed");
    }

    if (rule.permission !== "public" && rule.permission !== "authenticated") {
      if (!session || !roleHasPermission(session.role, rule.permission)) {
        return jsonError(403, "Forbidden: missing required permission");
      }
    }

    return config.handler({ request, session, params, rule });
  };
}
