// Central API route wrapper. Every route in src/app/api/** is built with
// `secureRoute()` so authentication, CSRF, authorization, and body-size
// limits are never opt-in per-route decisions — they are the default, and
// `permission: "public"` is the only (explicit, registry-visible) way out.
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getSession, refreshSessionCookie, type SessionUser } from "@/lib/session";
import { verifyCsrf, SAFE_METHODS } from "@/lib/csrf";
import { findRouteRule, type HttpMethod, type RouteRule } from "@/lib/authz/registry";
import { roleHasPermission } from "@/lib/authz/permissions";
import { recordAuditEvent } from "@/lib/audit";

export const MAX_BODY_BYTES = 256 * 1024; // 256KB — generous for this app's forms, bounds abuse

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } };
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(errorBody(code, message, details), { status });
}

/** Reads and size-limits the raw body before JSON parsing — Next.js route
 * handlers do not enforce a body size limit by default, so a route that
 * calls `request.json()` directly is an unbounded-memory DoS surface. */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the size limit") };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Could not read request body") };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the size limit") };
  }

  let body: unknown;
  try {
    body = text.length ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: jsonError(400, "BAD_REQUEST", "Request body must be valid JSON") };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, "VALIDATION_FAILED", "Validation failed", parsed.error.flatten()) };
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
    return { ok: false, response: jsonError(400, "VALIDATION_FAILED", "Validation failed", parsed.error.flatten()) };
  }
  return { ok: true, data: parsed.data };
}

export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return null;
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
  method: HttpMethod;
  path: string;
  handler: (args: HandlerArgs<TParams>) => Promise<Response>;
}) {
  return async (request: NextRequest, context?: NextRouteContext<TParams>): Promise<Response> => {
    const rule = findRouteRule(config.method, config.path);
    if (!rule) {
      // Fail closed: an unregistered route refuses to serve traffic instead
      // of defaulting to "open". scripts/check-route-registry.mjs catches
      // this at CI/build time before it ever reaches runtime.
      return jsonError(500, "ROUTE_NOT_REGISTERED", "Route is not present in the authorization registry");
    }

    const params = context?.params ? await context.params : ({} as TParams);

    let session: SessionUser | null = null;
    if (rule.permission !== "public") {
      session = await getSession();
      if (!session) return jsonError(401, "UNAUTHENTICATED", "Authentication required");
    }

    if (!SAFE_METHODS.has(config.method) && rule.permission !== "public") {
      const csrfOk = await verifyCsrf(request);
      if (!csrfOk) return jsonError(403, "CSRF_REJECTED", "CSRF validation failed");
    } else if (!SAFE_METHODS.has(config.method) && rule.permission === "public") {
      // Public mutating routes (register/login) still require the
      // double-submit token to defend against login/registration CSRF.
      const csrfOk = await verifyCsrf(request);
      if (!csrfOk) return jsonError(403, "CSRF_REJECTED", "CSRF validation failed");
    }

    if (rule.permission !== "public" && rule.permission !== "authenticated") {
      if (!session || !roleHasPermission(session.role, rule.permission)) {
        await recordAuditEvent({
          orgId: session?.orgId ?? null,
          actorUserId: session?.userId ?? null,
          actorEmail: session?.email ?? null,
          actorRole: session?.role ?? null,
          action: "security.forbidden",
          resourceType: "route",
          resourceId: `${config.method} ${config.path}`,
          correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
          reason: "forbidden: missing required permission",
        }).catch(() => {});
        return jsonError(403, "FORBIDDEN", "Forbidden: missing required permission");
      }
    }

    const response = await config.handler({ request, session, params, rule });

    if (session) {
      await refreshSessionCookie(session).catch(() => {});
    }

    return response;
  };
}
