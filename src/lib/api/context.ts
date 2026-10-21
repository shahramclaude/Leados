import { randomUUID } from "crypto";

// Correlation id: honors an inbound `X-Correlation-Id` so callers can trace a
// request across the gateway, otherwise LEADOS mints one. Always echoed back
// on every response (success or error) and stamped onto audit log rows.
export function getCorrelationId(req: Request): string {
  const incoming = req.headers.get("x-correlation-id");
  if (incoming && incoming.length <= 128) return incoming;
  return randomUUID();
}
