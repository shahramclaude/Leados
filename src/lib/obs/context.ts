// Request-scoped context propagated via AsyncLocalStorage so correlationId
// and the active trace/span flow from API handler -> job/orchestrator ->
// "agent run" -> db query without threading parameters through every call.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  route?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function newId(prefix = ""): string {
  return `${prefix}${randomUUID()}`;
}

/** Read the active context, or a synthetic "background" one if nothing is
 * running inside `runWithContext` (e.g. the scheduler tick itself). */
export function getContext(): RequestContext {
  return (
    als.getStore() ?? {
      correlationId: newId("bg-"),
      traceId: newId(),
      spanId: newId(),
      route: "background",
    }
  );
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Build a child context that keeps the same correlationId + traceId
 * (so a job fired from a request is still attributable to it) but gets a
 * fresh spanId, with the parent recorded by the tracer. */
export function childContext(parentRoute: string): RequestContext {
  const parent = getContext();
  return {
    correlationId: parent.correlationId,
    traceId: parent.traceId,
    spanId: newId(),
    route: parentRoute,
  };
}

export function extractCorrelationId(req: Request): string {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || newId("corr-");
}
