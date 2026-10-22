import { AuthError, ForbiddenError } from "./auth";
import { ValidationError } from "./pagination";
import { ZodError } from "zod";

/** Normalizes thrown errors from route handlers into consistent HTTP responses. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Validation failed", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled API error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
