// Minimal shared-secret admin auth for operator-only endpoints (maintenance
// toggle, manual scheduler trigger, dead-letter requeue). This deployment
// has no user/session system (see ADR-0003) — ADMIN_TOKEN is deliberately
// simple and is the credential rotated by the credential-rotation runbook.
import { AppError } from "@/lib/obs/errors";

export function requireAdmin(req: Request): void {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    // Fail closed: an unconfigured token must never mean "open to everyone".
    throw new AppError("admin_not_configured", "ADMIN_TOKEN is not configured on this deployment.", 503);
  }
  const provided = req.headers.get("x-admin-token");
  if (provided !== configured) {
    throw new AppError("unauthorized", "Missing or invalid x-admin-token header.", 401);
  }
}
