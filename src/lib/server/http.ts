// Single error-envelope + response-shape helper for every `/api/**` route.
// Mirrors the shape already used in the upstream repo's apiUtils.ts
// (`{ error: { code, message }, correlationId }`), extended with an optional
// `details` field per the Part 03 brief's error envelope contract:
//   { code, message, details?, correlationId }
//
// This is the ONLY place routes should construct success/error JSON bodies.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  correlationId: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getCorrelationId(req: NextRequest): string {
  return req.headers.get("x-correlation-id") ?? randomUUID();
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(
  status: number,
  code: string,
  message: string,
  correlationId: string,
  details?: unknown,
): NextResponse {
  const body: ApiErrorBody = { error: { code, message, details }, correlationId };
  return NextResponse.json(body, { status, headers: { "x-correlation-id": correlationId } });
}

/**
 * Wraps a route handler so thrown `ApiError`s (and zod validation errors)
 * become the standard envelope instead of an unhandled 500 with no shape,
 * and so every response — success or failure — carries the correlation id.
 */
export function withRouteErrors(
  handler: (req: NextRequest, correlationId: string) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const correlationId = getCorrelationId(req);
    try {
      const res = await handler(req, correlationId);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, err.code, err.message, correlationId, err.details);
      }
      // eslint-disable-next-line no-console
      console.error(`[${correlationId}] unhandled route error`, err);
      return fail(500, "INTERNAL", "Something went wrong. Please try again.", correlationId);
    }
  };
}

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
