import { ApiError, errorBody, ErrorCodes, type ErrorCode } from "./errors";
import type { RateLimitResult } from "./rateLimit";

export type JsonInit = {
  status?: number;
  headers?: Record<string, string>;
};

/** Standard headers applied to every /api/v1 response. */
export function baseHeaders(correlationId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "X-Correlation-Id": correlationId,
    "X-API-Version": "v1",
    ...extra,
  };
}

export function rateLimitHeaders(rl?: RateLimitResult): Record<string, string> {
  if (!rl) return {};
  return {
    "RateLimit-Limit": String(rl.limit),
    "RateLimit-Remaining": String(rl.remaining),
    "RateLimit-Reset": String(rl.resetSeconds),
    "RateLimit-Policy": `${rl.limit};w=60`,
  };
}

export function jsonOk(data: unknown, correlationId: string, init: JsonInit = {}, rl?: RateLimitResult) {
  return Response.json(data, {
    status: init.status ?? 200,
    headers: { ...baseHeaders(correlationId), ...rateLimitHeaders(rl), ...(init.headers ?? {}) },
  });
}

export function jsonError(
  code: ErrorCode,
  correlationId: string,
  opts: { message?: string; details?: unknown; headers?: Record<string, string> } = {},
  rl?: RateLimitResult,
) {
  const def = ErrorCodes[code];
  return Response.json(errorBody(code, correlationId, opts.message, opts.details), {
    status: def.status,
    headers: { ...baseHeaders(correlationId), ...rateLimitHeaders(rl), ...(opts.headers ?? {}) },
  });
}

/** Converts a thrown error into a consistent JSON error response. */
export function jsonFromCaught(err: unknown, correlationId: string, rl?: RateLimitResult) {
  if (err instanceof ApiError) {
    return jsonError(err.code, correlationId, { message: err.message, details: err.details }, rl);
  }
  console.error(`[api] unhandled error (correlationId=${correlationId})`, err);
  return jsonError("INTERNAL_ERROR", correlationId, undefined, rl);
}
