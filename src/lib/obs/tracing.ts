// Minimal in-process tracer: spans across API -> repository/db -> external
// calls (LLM provider, webhooks), with a declared sampling policy.
//
// Sampling policy (deliberately simple, declared here so it's auditable):
//   - 100% of spans belonging to a request/job that errors are kept.
//   - 100% of spans slower than SLOW_SPAN_MS (500ms) are kept.
//   - otherwise a BASE_SAMPLE_RATE (10%) of spans are kept.
// "Kept" means: retained in the in-memory recent-traces ring buffer (used by
// the Health page / `/api/debug/traces`) AND emitted as a `trace`-level log
// line. Dropped spans still execute normally — sampling only affects
// observability overhead, never behavior.
import { getContext, newId, runWithContext } from "./context";
import { logger } from "./logger";

const SLOW_SPAN_MS = 500;
const BASE_SAMPLE_RATE = 0.1;
const RING_BUFFER_SIZE = 500;

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: "http" | "db" | "external" | "job" | "internal";
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  attributes?: Record<string, unknown>;
}

const recentSpans: SpanRecord[] = [];

function shouldKeep(durationMs: number, ok: boolean): boolean {
  if (!ok) return true;
  if (durationMs >= SLOW_SPAN_MS) return true;
  return Math.random() < BASE_SAMPLE_RATE;
}

export function recentTraces(limit = 50): SpanRecord[] {
  return recentSpans.slice(-limit).reverse();
}

export async function withSpan<T>(
  name: string,
  kind: SpanRecord["kind"],
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>,
): Promise<T> {
  const parent = getContext();
  const spanId = newId();
  const start = Date.now();
  const startedAtIso = new Date(start).toISOString();
  let ok = true;
  let error: string | undefined;
  try {
    return await runWithContext({ ...parent, spanId }, fn);
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const durationMs = Date.now() - start;
    const record: SpanRecord = {
      traceId: parent.traceId,
      spanId,
      parentSpanId: parent.spanId,
      name,
      kind,
      startedAt: startedAtIso,
      durationMs,
      ok,
      error,
      attributes,
    };
    if (shouldKeep(durationMs, ok)) {
      recentSpans.push(record);
      while (recentSpans.length > RING_BUFFER_SIZE) recentSpans.shift();
      logger.trace("span", { span: record });
    }
  }
}

/** Convenience wrapper for db calls so query time is attributed to a span
 * without every call site needing to know about tracing internals. */
export function withDbSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(`db.${name}`, "db", fn);
}

export function withExternalSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(`external.${name}`, "external", fn);
}

export function withJobSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(`job.${name}`, "job", fn);
}
