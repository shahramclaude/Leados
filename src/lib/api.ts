// Shared API hardening helpers: consistent error envelopes, request
// IDs, timing logs, and lightweight body validation.

export type ApiErrorBody = { error: string; code: string; requestId: string };

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "BAD_REQUEST", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function jsonError(
  message: string,
  code: string,
  status: number,
  requestId: string,
): Response {
  const body: ApiErrorBody = { error: message, code, requestId };
  return Response.json(body, { status, headers: { "X-Request-Id": requestId } });
}

export function jsonOk<T>(data: T, requestId: string, status = 200): Response {
  return Response.json(data, { status, headers: { "X-Request-Id": requestId } });
}

/**
 * Wraps a route handler with: request-id generation, timing logs,
 * and a catch-all that converts any thrown error into a consistent
 * { error, code, requestId } JSON 500 response (or the thrown
 * ApiError's own status/code if present).
 */
export function withErrorHandling(
  routeName: string,
  handler: (req: Request, requestId: string) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async function wrapped(req: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const method = req.method;
    try {
      const res = await handler(req, requestId);
      const ms = Date.now() - startedAt;
      console.log(`[${routeName}] ${method} ${res.status} ${ms}ms req=${requestId}`);
      if (!res.headers.has("X-Request-Id")) {
        res.headers.set("X-Request-Id", requestId);
      }
      return res;
    } catch (err) {
      const ms = Date.now() - startedAt;
      const status = err instanceof ApiError ? err.status : 500;
      const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[${routeName}] ${method} ${status} ${ms}ms req=${requestId} ERROR: ${message}`);
      return jsonError(message, code, status, requestId);
    }
  };
}

export type ValidationFailure = { valid: false; missing: string[] };
export type ValidationSuccess<T> = T & { valid?: undefined };

/**
 * Validates that `body` is a non-null object containing all
 * `required` keys with non-undefined/non-null values. Returns the
 * body cast to T on success, or { valid: false, missing } on
 * failure. Callers should check `"missing" in result` or
 * `result.valid === false` before using the body.
 */
export function validateBody<T extends Record<string, unknown>>(
  body: unknown,
  required: (keyof T)[],
): T | ValidationFailure {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { valid: false, missing: required.map((k) => String(k)) };
  }
  const record = body as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of required) {
    const k = String(key);
    if (record[k] === undefined || record[k] === null) missing.push(k);
  }
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  return body as T;
}

export function isValidationFailure(value: unknown): value is ValidationFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "valid" in value &&
    (value as { valid: unknown }).valid === false
  );
}

export function requireInternalAuth(req: Request): void {
  const headerToken = req.headers.get("x-internal-token");
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const bearerMatches = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const internalMatches = cronSecret && headerToken === cronSecret;

  if (!cronSecret) {
    // No secret configured in this environment — allow, since there is
    // nothing to compare against (local/dev sandboxes). In production
    // CRON_SECRET must always be set.
    return;
  }

  if (!bearerMatches && !internalMatches) {
    throw new ApiError("Unauthorized", "UNAUTHORIZED", 401);
  }
}
