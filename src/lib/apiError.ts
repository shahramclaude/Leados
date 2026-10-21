import { AccessDeniedError } from "./accessControl";
import { UnauthenticatedError } from "./requestActor";

export function toErrorResponse(err: unknown): Response {
  if (err instanceof UnauthenticatedError) {
    return Response.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof AccessDeniedError) {
    return Response.json({ error: err.message }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  const status = /not found/i.test(message) ? 404 : 400;
  return Response.json({ error: message }, { status });
}
