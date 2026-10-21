import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth";
import { NotFoundInOrgError } from "@/db/repositories/orgScope";

/**
 * Central translator from thrown domain errors to HTTP responses. This is
 * what guarantees the isolation-test contract: a cross-org id always comes
 * back as 404 (via NotFoundInOrgError), a missing permission as 403, and an
 * absent session as 401 — never a 500, and never a body that leaks whether
 * the row exists in a different org.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "unauthenticated", messageKey: "errors.unauthenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "forbidden", messageKey: "errors.forbidden", permission: err.permission },
      { status: 403 },
    );
  }
  if (err instanceof NotFoundInOrgError) {
    return NextResponse.json({ error: "not_found", messageKey: "errors.notFound" }, { status: 404 });
  }
  console.error(err);
  return NextResponse.json({ error: "server_error", messageKey: "errors.server" }, { status: 500 });
}
