import { authenticate, rateLimitKeyFor, requireScope, type AuthedKey, type Scope } from "./auth";
import { getOrCreateCorrelationId } from "./correlation";
import { ApiError } from "./errors";
import { takeToken, type RateLimitResult } from "./rateLimit";
import { jsonError, jsonFromCaught } from "./respond";

export type ApiContext = {
  correlationId: string;
  key: AuthedKey;
  rl: RateLimitResult;
  params: Record<string, string>;
};

export type ApiHandler = (req: Request, ctx: ApiContext) => Promise<Response>;

/**
 * Wraps a /api/v1 route function with the shared platform concerns: correlation id,
 * API-key auth + scope check, token-bucket rate limiting, and the single error envelope.
 */
export function withApi(scope: Scope, fn: ApiHandler) {
  return async (req: Request, routeCtx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const correlationId = getOrCreateCorrelationId(req);
    let rl: RateLimitResult | undefined;
    try {
      const key = await authenticate(req);
      rl = takeToken(rateLimitKeyFor(key));
      if (!rl.allowed) {
        return jsonError(
          "RATE_LIMITED",
          correlationId,
          { headers: { "Retry-After": String(rl.resetSeconds) } },
          rl,
        );
      }
      requireScope(key, scope);
      const params = routeCtx ? await routeCtx.params : {};
      return await fn(req, { correlationId, key, rl, params });
    } catch (err) {
      if (err instanceof ApiError) {
        return jsonFromCaught(err, correlationId, rl);
      }
      return jsonFromCaught(err, correlationId, rl);
    }
  };
}
