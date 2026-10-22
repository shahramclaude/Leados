import { randomUUID } from "crypto";

/** Every request gets a correlation id, echoed in the error envelope and the X-Correlation-Id header. */
export function getOrCreateCorrelationId(req: Request): string {
  return req.headers.get("x-correlation-id") || randomUUID();
}
