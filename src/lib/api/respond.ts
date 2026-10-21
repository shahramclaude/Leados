import { ApiError, errorBody } from "./errors";

export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export function withCommonHeaders(
  headers: Headers,
  correlationId: string,
  rateLimit?: RateLimitHeaders,
) {
  headers.set("X-Correlation-Id", correlationId);
  if (rateLimit) {
    headers.set("RateLimit-Limit", String(rateLimit.limit));
    headers.set("RateLimit-Remaining", String(Math.max(0, rateLimit.remaining)));
    headers.set("RateLimit-Reset", String(rateLimit.resetSeconds));
  }
  return headers;
}

export function jsonOk(
  body: unknown,
  correlationId: string,
  init?: { status?: number; headers?: HeadersInit; rateLimit?: RateLimitHeaders },
) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  withCommonHeaders(headers, correlationId, init?.rateLimit);
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

export function jsonError(
  error: ApiError,
  correlationId: string,
  rateLimit?: RateLimitHeaders,
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  withCommonHeaders(headers, correlationId, rateLimit);
  return new Response(JSON.stringify(errorBody(error.code, error.message, correlationId, error.details)), {
    status: error.status,
    headers,
  });
}

export function toErrorResponse(err: unknown, correlationId: string, rateLimit?: RateLimitHeaders) {
  if (err instanceof ApiError) {
    return jsonError(err, correlationId, rateLimit);
  }
  // eslint-disable-next-line no-console
  console.error(`[${correlationId}] unhandled error`, err);
  return jsonError(
    new ApiError("INTERNAL_ERROR", "An unexpected error occurred."),
    correlationId,
    rateLimit,
  );
}
