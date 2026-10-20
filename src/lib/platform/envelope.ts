// Consistent response envelope for API v1: every error follows the same
// { error: { code, message, details, correlationId } } shape, and every
// handler gets a per-request correlation id for tracing/support.
import { randomUUID } from "node:crypto";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "IDEMPOTENCY_MISMATCH"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  IDEMPOTENCY_MISMATCH: 409,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  details?: unknown;
  status: number;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = STATUS_BY_CODE[code];
  }
}

export function newCorrelationId(): string {
  return `req_${randomUUID()}`;
}

export function errorResponse(
  err: unknown,
  correlationId: string,
  extraHeaders?: HeadersInit,
): Response {
  const apiError =
    err instanceof ApiError
      ? err
      : new ApiError("INTERNAL_ERROR", err instanceof Error ? err.message : "Unexpected error");

  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("X-Correlation-Id", correlationId);

  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details ?? null,
        correlationId,
      },
    },
    { status: apiError.status, headers },
  );
}

export function okResponse<T>(
  data: T,
  init?: { status?: number; headers?: HeadersInit; correlationId?: string },
): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (init?.correlationId) headers.set("X-Correlation-Id", init.correlationId);
  return Response.json(data, { status: init?.status ?? 200, headers });
}
