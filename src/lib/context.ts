// Correlation / trace context propagation.
//
// Convention (the "Part 01" correlation id contract this part wires telemetry
// through): every inbound HTTP request gets a correlationId — either taken
// from the `x-correlation-id` request header (so callers / upstream gateways
// can supply one) or minted fresh. That id is threaded explicitly through the
// call chain API -> orchestrator -> agent run -> repo/query layer, AND bound
// into an AsyncLocalStorage context so logger/tracer calls that forget to
// pass it explicitly still pick it up.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface CorrelationContext {
  correlationId: string;
  traceId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function newCorrelationId(): string {
  return `cor_${randomUUID()}`;
}

export function newTraceId(): string {
  return randomUUID().replace(/-/g, "");
}

export function newSpanId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Run `fn` with a bound correlation/trace context. */
export function runWithCorrelation<T>(ctx: CorrelationContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Get the currently bound context, if any. */
export function getCorrelationContext(): CorrelationContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string {
  return storage.getStore()?.correlationId ?? "cor_unbound";
}

/**
 * Extract (or mint) a correlation id from an inbound request header, and
 * derive/propagate a traceId. If the caller passed `x-trace-id` we reuse it
 * (cross-service trace continuity); otherwise we start a new trace rooted at
 * this request.
 */
export function correlationFromHeaders(headers: Headers): CorrelationContext {
  const correlationId = headers.get("x-correlation-id")?.trim() || newCorrelationId();
  const traceId = headers.get("x-trace-id")?.trim() || newTraceId();
  return { correlationId, traceId };
}
