// Consistent result/error-handling pattern for every route handler.
//
// Coherence rule (docs/GLOSSARY.md + part C of the Part 20 capstone): every
// API route returns either `{ data }` or `{ error: { code, message } }` —
// never a bare array, never a thrown stack trace. Route handlers wrap their
// body in `withApiResult` so one place decides how unknown errors surface.

import { NextResponse } from "next/server";
import { BudgetExceededError } from "@/lib/budget";
import { UnauthorizedError, ForbiddenError } from "@/lib/tenancy";
import {
  ValidationError,
  ForbiddenServiceError,
  NotFoundServiceError,
  ConflictServiceError,
} from "@/lib/errors";

export { ValidationError } from "@/lib/errors";

export type ApiError = { code: string; message: string };

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ data }, { status: init ?? 200 });
}

export function fail(code: string, message: string, status: number) {
  const body: { error: ApiError } = { error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function withApiResult(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("UNAUTHORIZED", error.message, 401);
    }
    if (error instanceof ForbiddenError || error instanceof ForbiddenServiceError) {
      return fail("FORBIDDEN", error.message, 403);
    }
    if (error instanceof BudgetExceededError) {
      return fail("BUDGET_EXCEEDED", error.message, 402);
    }
    if (error instanceof ValidationError) {
      return fail("VALIDATION_ERROR", error.message, 400);
    }
    if (error instanceof NotFoundServiceError) {
      return fail("NOT_FOUND", error.message, 404);
    }
    if (error instanceof ConflictServiceError) {
      return fail("CONFLICT", error.message, 409);
    }
    console.error(error);
    return fail("INTERNAL_ERROR", "Unexpected server error", 500);
  }
}
