import { ZodError } from "zod";
import { ApiAuthError } from "@/lib/api-auth";

export function jsonError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

/** Central error -> HTTP response mapping so every route is consistent and
 * contract-testable: auth failures are always 401, validation failures are
 * always 400 with a `details` field describing the Zod issues.
 */
export function handleRouteError(error: unknown): Response {
  if (error instanceof ApiAuthError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof ZodError) {
    return jsonError("Validation failed", 400, error.flatten());
  }
  if (error instanceof SyntaxError) {
    return jsonError("Malformed JSON body", 400);
  }
  console.error(error);
  return jsonError("Internal server error", 500);
}
