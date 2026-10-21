import { authenticate, requireScope, type AuthContext, type Scope } from "./auth";
import { getCorrelationId } from "./context";
import { ApiError } from "./errors";
import { consumeRateLimit } from "./rateLimit";
import { toErrorResponse, type RateLimitHeaders } from "./respond";

export interface RouteCtx {
  auth: AuthContext;
  correlationId: string;
  rateLimit: RateLimitHeaders;
}

type Handler = (req: Request, ctx: RouteCtx, params: Record<string, string>) => Promise<Response>;

/**
 * Standard composition for every /api/v1 route: auth -> scope check ->
 * per-token rate limit -> handler -> uniform error envelope on throw.
 * Public (unauthenticated) routes pass `scope: null`.
 */
export function withApiRoute(scope: Scope | null, handler: Handler) {
  return async (req: Request, routeParams?: { params: Promise<Record<string, string>> }) => {
    const correlationId = getCorrelationId(req);
    try {
      const params = routeParams ? await routeParams.params : {};
      let auth: AuthContext;
      let rateLimit: RateLimitHeaders = { limit: 0, remaining: 0, resetSeconds: 0 };

      if (scope === null) {
        auth = { tokenId: "anonymous", orgId: "anonymous", scopes: [], isAdmin: false, rateLimitPerMinute: 0 };
      } else {
        auth = await authenticate(req);
        requireScope(auth, scope);
        const rl = consumeRateLimit(auth.tokenId, auth.rateLimitPerMinute);
        rateLimit = { limit: rl.limit, remaining: rl.remaining, resetSeconds: rl.resetSeconds };
        if (!rl.allowed) {
          throw new ApiError("RATE_LIMITED", "Rate limit exceeded for this token. Retry after the reset window.");
        }
      }

      return await handler(req, { auth, correlationId, rateLimit }, params);
    } catch (err) {
      return toErrorResponse(err, correlationId);
    }
  };
}
