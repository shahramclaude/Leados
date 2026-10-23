// Maps domain errors thrown by the governance library to HTTP responses so
// API routes stay thin.

import { AccessDeniedError } from "./access";
import { UndeclaredConflictError } from "./resolutions";
import { FinalizationNotAllowedError } from "./minutes";
import { IndividualScoringNotAuthorizedError } from "./metrics";

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AccessDeniedError) {
    return Response.json({ ok: false, error: err.message }, { status: 403 });
  }
  if (err instanceof UndeclaredConflictError) {
    return Response.json({ ok: false, error: err.message, code: "UNDECLARED_CONFLICT" }, { status: 409 });
  }
  if (err instanceof FinalizationNotAllowedError) {
    return Response.json({ ok: false, error: err.message, code: "FINALIZATION_NOT_ALLOWED" }, { status: 403 });
  }
  if (err instanceof IndividualScoringNotAuthorizedError) {
    return Response.json({ ok: false, error: err.message, code: "INDIVIDUAL_SCORING_DISABLED" }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return Response.json({ ok: false, error: message }, { status: 400 });
}
