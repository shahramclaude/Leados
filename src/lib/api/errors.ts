// Stable, machine-readable error code catalog for LEADOS API v1.
// Every error response uses the single envelope:
//   { error: { code, message, details?, correlationId } }
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "UNSUPPORTED_FILTER"
  | "UNSUPPORTED_SORT"
  | "INVALID_CURSOR"
  | "CAPABILITY_DENIED"
  | "SIGNATURE_INVALID"
  | "REPLAY_DETECTED"
  | "INTERNAL_ERROR";

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  UNSUPPORTED_FILTER: 400,
  UNSUPPORTED_SORT: 400,
  INVALID_CURSOR: 400,
  CAPABILITY_DENIED: 403,
  SIGNATURE_INVALID: 401,
  REPLAY_DETECTED: 409,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export function errorBody(code: ApiErrorCode, message: string, correlationId: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      correlationId,
    },
  };
}
