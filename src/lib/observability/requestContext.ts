import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  correlationId: string;
  route: string;
  startedAt: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Generate a new correlation id (used when a client doesn't supply one). */
export function newCorrelationId(): string {
  return randomUUID();
}

/** Run `fn` with a request context bound for the lifetime of the call. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** Read the current request context, if any (e.g. from inside a repository call). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Convenience accessor used by the logger; falls back to "unknown" outside a request. */
export function getCorrelationId(): string {
  return storage.getStore()?.correlationId ?? "unbound";
}

export const CORRELATION_ID_HEADER = "x-correlation-id";
