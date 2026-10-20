// Shared route wrapper: authenticates, enforces scope + rate limit, assigns
// a correlation id, and normalizes error handling so every v1 route behaves
// identically on the edges (the part that grew inconsistent organically).
import { ApiScope, AuthContext, authenticateAndAuthorize, rateLimitHeaders } from "./auth";
import { ApiError, errorResponse, newCorrelationId } from "./envelope";

export function withApiV1<RouteCtx = { params: Promise<Record<string, never>> }>(
  scope: ApiScope,
  handler: (req: Request, ctx: AuthContext, correlationId: string, routeCtx: RouteCtx) => Promise<Response>,
) {
  return async (req: Request, routeCtx: RouteCtx): Promise<Response> => {
    const correlationId = newCorrelationId();
    try {
      const { ctx, rate } = await authenticateAndAuthorize(req, scope);
      const res = await handler(req, ctx, correlationId, routeCtx);
      const headers = new Headers(res.headers);
      headers.set("X-Correlation-Id", correlationId);
      for (const [key, value] of Object.entries(rateLimitHeaders(rate))) {
        headers.set(key, value as string);
      }
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err, correlationId);
      console.error(`[${correlationId}] unhandled error`, err);
      return errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected server error"), correlationId);
    }
  };
}

/** For routes that don't require auth (health, stats, webhook sandbox, token bootstrap). */
export function withApiPublic(handler: (req: Request, correlationId: string) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const correlationId = newCorrelationId();
    try {
      const res = await handler(req, correlationId);
      const headers = new Headers(res.headers);
      headers.set("X-Correlation-Id", correlationId);
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err, correlationId);
      console.error(`[${correlationId}] unhandled error`, err);
      return errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected server error"), correlationId);
    }
  };
}
