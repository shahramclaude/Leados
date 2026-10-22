/**
 * Stable error code catalog for the LEADOS /api/v1 surface.
 * Every error response uses the single envelope:
 *   { error: { code, message, details?, correlationId } }
 */
export const ErrorCodes = {
  VALIDATION_ERROR: { status: 400, message: "The request failed validation." },
  UNSUPPORTED_FILTER: { status: 400, message: "One or more filters are not supported on this route." },
  UNSUPPORTED_SORT: { status: 400, message: "The requested sort field is not supported on this route." },
  INVALID_CURSOR: { status: 400, message: "The pagination cursor is malformed or expired." },
  UNAUTHORIZED: { status: 401, message: "A valid API key is required." },
  FORBIDDEN: { status: 403, message: "The API key does not have the required scope." },
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  METHOD_NOT_ALLOWED: { status: 405, message: "This HTTP method is not supported on this route." },
  CONFLICT: { status: 409, message: "The request conflicts with the current state of the resource." },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: "An Idempotency-Key header is required for this write." },
  IDEMPOTENCY_CONFLICT: {
    status: 422,
    message: "The Idempotency-Key was already used with a different request body.",
  },
  PRECONDITION_FAILED: { status: 412, message: "The If-Match precondition failed." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Slow down and retry later." },
  INTERNAL_ERROR: { status: 500, message: "An unexpected error occurred." },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    const def = ErrorCodes[code];
    super(message ?? def.message);
    this.code = code;
    this.status = def.status;
    this.details = details;
  }
}

export function errorBody(code: ErrorCode, correlationId: string, message?: string, details?: unknown) {
  const def = ErrorCodes[code];
  return {
    error: {
      code,
      message: message ?? def.message,
      ...(details !== undefined ? { details } : {}),
      correlationId,
    },
  };
}
